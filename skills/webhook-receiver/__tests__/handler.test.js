/**
 * Tests for the Webhook Receiver skill handler.
 *
 * Uses Node.js built-in assert module (no external test framework required).
 * Run with: node --experimental-vm-modules skills/webhook-receiver/__tests__/handler.test.js
 */

import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { execute, endpoints, payloads, computeSignature } from "../handler.js";

/** Helper: reset in-memory store between tests. */
function resetStore() {
  endpoints.clear();
  payloads.clear();
}

/** Helper: compute a valid HMAC-SHA256 signature. */
function sign(secret, body) {
  const hmac = createHmac("sha256", secret);
  hmac.update(typeof body === "string" ? body : JSON.stringify(body));
  return "sha256=" + hmac.digest("hex");
}

let passed = 0;
let failed = 0;

async function test(name, fn) {
  resetStore();
  try {
    await fn();
    passed++;
    console.log(`  PASS: ${name}`);
  } catch (err) {
    failed++;
    console.error(`  FAIL: ${name}`);
    console.error(`        ${err.message}`);
  }
}

console.log("Webhook Receiver Handler Tests\n");

// ---------------------------------------------------------------------------
// register
// ---------------------------------------------------------------------------
console.log("register:");

await test("register a valid endpoint with explicit ID", async () => {
  const result = await execute({ action: "register", endpointId: "my-hook", name: "My Hook" }, {});
  assert.equal(result.metadata.success, true);
  assert.equal(result.metadata.endpointId, "my-hook");
  assert.equal(result.metadata.name, "My Hook");
  assert.equal(result.metadata.hasSecret, false);
  assert.ok(result.result.includes("my-hook"));
});

await test("register an endpoint with auto-generated ID", async () => {
  const result = await execute({ action: "register", name: "Auto Hook" }, {});
  assert.equal(result.metadata.success, true);
  assert.ok(result.metadata.endpointId.length > 0);
  assert.equal(result.metadata.name, "Auto Hook");
});

await test("register with a secret enables HMAC validation", async () => {
  const result = await execute(
    { action: "register", endpointId: "secure-ep", secret: "s3cret" },
    {}
  );
  assert.equal(result.metadata.success, true);
  assert.equal(result.metadata.hasSecret, true);
  assert.ok(result.result.includes("HMAC-SHA256"));
  // Ensure secret is NOT in the result text or metadata values
  assert.ok(!result.result.includes("s3cret"));
  assert.equal(result.metadata.secret, undefined);
});

await test("register duplicate endpoint returns error", async () => {
  await execute({ action: "register", endpointId: "dup-ep" }, {});
  const result = await execute({ action: "register", endpointId: "dup-ep" }, {});
  assert.equal(result.metadata.success, false);
  assert.equal(result.metadata.errorCode, "DUPLICATE_ENDPOINT");
});

await test("register with invalid endpoint ID returns error", async () => {
  const result = await execute({ action: "register", endpointId: "bad id!" }, {});
  assert.equal(result.metadata.success, false);
  assert.equal(result.metadata.errorCode, "INVALID_ENDPOINT_ID");
});

// ---------------------------------------------------------------------------
// unregister
// ---------------------------------------------------------------------------
console.log("\nunregister:");

await test("unregister an existing endpoint", async () => {
  await execute({ action: "register", endpointId: "to-remove" }, {});
  const result = await execute({ action: "unregister", endpointId: "to-remove" }, {});
  assert.equal(result.metadata.success, true);
  assert.equal(result.metadata.endpointId, "to-remove");
  // Confirm it's actually gone
  const list = await execute({ action: "list" }, {});
  assert.equal(list.metadata.totalEndpoints, 0);
});

await test("unregister a non-existing endpoint returns error", async () => {
  const result = await execute({ action: "unregister", endpointId: "nope" }, {});
  assert.equal(result.metadata.success, false);
  assert.equal(result.metadata.errorCode, "ENDPOINT_NOT_FOUND");
});

await test("unregister without endpointId returns error", async () => {
  const result = await execute({ action: "unregister" }, {});
  assert.equal(result.metadata.success, false);
  assert.equal(result.metadata.errorCode, "MISSING_ENDPOINT_ID");
});

// ---------------------------------------------------------------------------
// list
// ---------------------------------------------------------------------------
console.log("\nlist:");

await test("list with no endpoints", async () => {
  const result = await execute({ action: "list" }, {});
  assert.equal(result.metadata.success, true);
  assert.equal(result.metadata.totalEndpoints, 0);
  assert.deepEqual(result.metadata.endpoints, []);
});

await test("list with registered endpoints, secrets not exposed", async () => {
  await execute({ action: "register", endpointId: "ep-1", name: "Endpoint 1" }, {});
  await execute(
    { action: "register", endpointId: "ep-2", name: "Endpoint 2", secret: "top-secret" },
    {}
  );

  const result = await execute({ action: "list" }, {});
  assert.equal(result.metadata.success, true);
  assert.equal(result.metadata.totalEndpoints, 2);

  // Verify secrets are never in the response
  const resultStr = JSON.stringify(result);
  assert.ok(!resultStr.includes("top-secret"), "Secret must not appear in list output");

  // Verify hasSecret flag is correct
  const ep2 = result.metadata.endpoints.find((e) => e.id === "ep-2");
  assert.equal(ep2.hasSecret, true);

  const ep1 = result.metadata.endpoints.find((e) => e.id === "ep-1");
  assert.equal(ep1.hasSecret, false);
});

// ---------------------------------------------------------------------------
// receive
// ---------------------------------------------------------------------------
console.log("\nreceive:");

await test("receive a valid payload without signature", async () => {
  await execute({ action: "register", endpointId: "hook-1" }, {});
  const result = await execute(
    {
      action: "receive",
      endpointId: "hook-1",
      payload: { event: "push", data: "abc" },
      headers: { "content-type": "application/json" },
    },
    {}
  );
  assert.equal(result.metadata.success, true);
  assert.equal(result.metadata.totalStored, 1);
  assert.ok(result.metadata.payloadId);
});

await test("receive with valid HMAC signature succeeds", async () => {
  const secret = "webhook-secret-key";
  const body = { action: "created", id: 42 };

  await execute({ action: "register", endpointId: "secure-hook", secret }, {});

  const signature = sign(secret, body);
  const result = await execute(
    {
      action: "receive",
      endpointId: "secure-hook",
      payload: body,
      headers: { "x-signature-256": signature },
    },
    {}
  );
  assert.equal(result.metadata.success, true);
  assert.equal(result.metadata.totalStored, 1);
});

await test("receive with invalid HMAC signature fails", async () => {
  const secret = "correct-secret";
  const body = { event: "test" };

  await execute({ action: "register", endpointId: "sig-check", secret }, {});

  const result = await execute(
    {
      action: "receive",
      endpointId: "sig-check",
      payload: body,
      headers: { "x-signature-256": "sha256=badbadbadbad" },
    },
    {}
  );
  assert.equal(result.metadata.success, false);
  assert.equal(result.metadata.errorCode, "INVALID_SIGNATURE");
});

await test("receive with missing signature on secured endpoint fails", async () => {
  await execute({ action: "register", endpointId: "sig-ep", secret: "key123" }, {});
  const result = await execute(
    {
      action: "receive",
      endpointId: "sig-ep",
      payload: { data: 1 },
      headers: {},
    },
    {}
  );
  assert.equal(result.metadata.success, false);
  assert.equal(result.metadata.errorCode, "INVALID_SIGNATURE");
});

await test("receive without payload returns error", async () => {
  await execute({ action: "register", endpointId: "no-payload" }, {});
  const result = await execute({ action: "receive", endpointId: "no-payload" }, {});
  assert.equal(result.metadata.success, false);
  assert.equal(result.metadata.errorCode, "MISSING_PAYLOAD");
});

await test("receive on non-existing endpoint returns error", async () => {
  const result = await execute(
    { action: "receive", endpointId: "ghost", payload: { x: 1 } },
    {}
  );
  assert.equal(result.metadata.success, false);
  assert.equal(result.metadata.errorCode, "ENDPOINT_NOT_FOUND");
});

await test("receive enforces maxPayloads limit", async () => {
  await execute({ action: "register", endpointId: "limited", maxPayloads: 3 }, {});

  for (let i = 0; i < 5; i++) {
    await execute(
      { action: "receive", endpointId: "limited", payload: { seq: i } },
      {}
    );
  }

  const inspectResult = await execute({ action: "inspect", endpointId: "limited" }, {});
  assert.equal(inspectResult.metadata.totalPayloads, 3);
  // The oldest two (seq 0, 1) should have been evicted; first remaining is seq 2
  assert.equal(inspectResult.metadata.payloads[0].body.seq, 2);
});

// ---------------------------------------------------------------------------
// inspect
// ---------------------------------------------------------------------------
console.log("\ninspect:");

await test("inspect with stored payloads", async () => {
  await execute({ action: "register", endpointId: "insp-ep" }, {});
  await execute({ action: "receive", endpointId: "insp-ep", payload: { a: 1 } }, {});
  await execute({ action: "receive", endpointId: "insp-ep", payload: { b: 2 } }, {});

  const result = await execute({ action: "inspect", endpointId: "insp-ep" }, {});
  assert.equal(result.metadata.success, true);
  assert.equal(result.metadata.totalPayloads, 2);
  assert.equal(result.metadata.payloads.length, 2);
});

await test("inspect with pagination (limit and offset)", async () => {
  await execute({ action: "register", endpointId: "page-ep" }, {});
  for (let i = 0; i < 5; i++) {
    await execute({ action: "receive", endpointId: "page-ep", payload: { i } }, {});
  }

  const result = await execute(
    { action: "inspect", endpointId: "page-ep", limit: 2, offset: 1 },
    {}
  );
  assert.equal(result.metadata.success, true);
  assert.equal(result.metadata.totalPayloads, 5);
  assert.equal(result.metadata.returned, 2);
  assert.equal(result.metadata.offset, 1);
  assert.equal(result.metadata.payloads[0].body.i, 1);
  assert.equal(result.metadata.payloads[1].body.i, 2);
});

await test("inspect empty endpoint", async () => {
  await execute({ action: "register", endpointId: "empty-ep" }, {});
  const result = await execute({ action: "inspect", endpointId: "empty-ep" }, {});
  assert.equal(result.metadata.success, true);
  assert.equal(result.metadata.totalPayloads, 0);
  assert.deepEqual(result.metadata.payloads, []);
});

await test("inspect non-existing endpoint returns error", async () => {
  const result = await execute({ action: "inspect", endpointId: "nonexistent" }, {});
  assert.equal(result.metadata.success, false);
  assert.equal(result.metadata.errorCode, "ENDPOINT_NOT_FOUND");
});

// ---------------------------------------------------------------------------
// clear
// ---------------------------------------------------------------------------
console.log("\nclear:");

await test("clear payloads from an endpoint", async () => {
  await execute({ action: "register", endpointId: "clr-ep" }, {});
  await execute({ action: "receive", endpointId: "clr-ep", payload: { x: 1 } }, {});
  await execute({ action: "receive", endpointId: "clr-ep", payload: { x: 2 } }, {});

  const result = await execute({ action: "clear", endpointId: "clr-ep" }, {});
  assert.equal(result.metadata.success, true);
  assert.equal(result.metadata.payloadsCleared, 2);

  // Verify payloads are actually cleared
  const inspect = await execute({ action: "inspect", endpointId: "clr-ep" }, {});
  assert.equal(inspect.metadata.totalPayloads, 0);
});

await test("clear on non-existing endpoint returns error", async () => {
  const result = await execute({ action: "clear", endpointId: "nope" }, {});
  assert.equal(result.metadata.success, false);
  assert.equal(result.metadata.errorCode, "ENDPOINT_NOT_FOUND");
});

// ---------------------------------------------------------------------------
// invalid action
// ---------------------------------------------------------------------------
console.log("\ninvalid action:");

await test("invalid action returns error", async () => {
  const result = await execute({ action: "explode" }, {});
  assert.equal(result.metadata.success, false);
  assert.equal(result.metadata.errorCode, "INVALID_ACTION");
  assert.ok(result.result.includes("explode"));
});

// ---------------------------------------------------------------------------
// computeSignature utility
// ---------------------------------------------------------------------------
console.log("\ncomputeSignature:");

await test("computeSignature produces correct HMAC-SHA256", async () => {
  const secret = "test-secret";
  const body = { hello: "world" };
  const sig = computeSignature(secret, body);
  assert.ok(sig.startsWith("sha256="));

  // Verify with independent computation
  const hmac = createHmac("sha256", secret);
  hmac.update(JSON.stringify(body));
  const expected = "sha256=" + hmac.digest("hex");
  assert.equal(sig, expected);
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\nResults: ${passed} passed, ${failed} failed, ${passed + failed} total\n`);

if (failed > 0) {
  process.exit(1);
}
