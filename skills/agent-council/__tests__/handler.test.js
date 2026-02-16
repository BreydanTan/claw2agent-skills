import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import { execute, _clearStore, _storeSize } from "../handler.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a council and return its metadata (including councilId).
 */
async function createCouncil(overrides = {}) {
  const params = {
    action: "create_council",
    name: "Test Council",
    topic: "Test decisions",
    votingMethod: "majority",
    ...overrides,
  };
  return execute(params, {});
}

/**
 * Add a member to a council and return the result.
 */
async function addMember(councilId, memberOverrides = {}) {
  const member = {
    name: "Agent Alpha",
    role: "analyst",
    perspective: "data analysis",
    ...memberOverrides,
  };
  return execute({ action: "add_member", councilId, member }, {});
}

/**
 * Create a council pre-populated with a standard set of diverse members.
 * Returns { councilId, createResult }.
 */
async function createPopulatedCouncil(votingMethod = "majority") {
  const createResult = await createCouncil({ votingMethod });
  const councilId = createResult.metadata.councilId;

  await addMember(councilId, { name: "Analyst Ann", role: "analyst", perspective: "metrics" });
  await addMember(councilId, { name: "Critic Carl", role: "critic", perspective: "risk assessment" });
  await addMember(councilId, { name: "Optimist Olive", role: "optimist", perspective: "growth" });
  await addMember(councilId, { name: "Pessimist Pete", role: "pessimist", perspective: "failure modes" });
  await addMember(councilId, { name: "Expert Eve", role: "domain_expert", perspective: "engineering" });
  await addMember(councilId, { name: "Devil Dave", role: "devil_advocate", perspective: "contrarian view" });

  return { councilId, createResult };
}

// ---------------------------------------------------------------------------
// create_council
// ---------------------------------------------------------------------------

describe("agent-council: create_council", () => {
  beforeEach(() => _clearStore());

  it("should create a council with required fields and default voting method", async () => {
    const result = await createCouncil({ votingMethod: undefined });
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, "create_council");
    assert.ok(result.metadata.councilId);
    assert.equal(result.metadata.council.name, "Test Council");
    assert.equal(result.metadata.council.topic, "Test decisions");
    assert.equal(result.metadata.council.votingMethod, "majority");
    assert.deepEqual(result.metadata.council.members, []);
    assert.equal(_storeSize(), 1);
  });

  it("should create a council with explicit voting method", async () => {
    const result = await createCouncil({ votingMethod: "unanimous" });
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.council.votingMethod, "unanimous");
  });

  it("should create a council with weighted voting method", async () => {
    const result = await createCouncil({ votingMethod: "weighted" });
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.council.votingMethod, "weighted");
  });

  it("should auto-generate unique ids for each council", async () => {
    const r1 = await createCouncil({ name: "Council A" });
    const r2 = await createCouncil({ name: "Council B" });
    assert.notEqual(r1.metadata.councilId, r2.metadata.councilId);
    assert.equal(_storeSize(), 2);
  });

  it("should return error when name is missing", async () => {
    const result = await execute({ action: "create_council", topic: "Test" }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, "MISSING_NAME");
  });

  it("should return error when topic is missing", async () => {
    const result = await execute({ action: "create_council", name: "Test" }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, "MISSING_TOPIC");
  });

  it("should return error for invalid voting method", async () => {
    const result = await execute(
      { action: "create_council", name: "Test", topic: "Test", votingMethod: "ranked_choice" },
      {}
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, "INVALID_VOTING_METHOD");
  });

  it("should sanitize name and topic to prevent XSS", async () => {
    const result = await createCouncil({
      name: '<script>alert("xss")</script>Council',
      topic: 'Topic <img onerror="hack">',
    });
    assert.equal(result.metadata.success, true);
    assert.ok(!result.metadata.council.name.includes("<script>"));
    assert.ok(!result.metadata.council.topic.includes("<img"));
  });
});

// ---------------------------------------------------------------------------
// add_member
// ---------------------------------------------------------------------------

describe("agent-council: add_member", () => {
  beforeEach(() => _clearStore());

  it("should add a member with default weight", async () => {
    const { metadata } = await createCouncil();
    const councilId = metadata.councilId;

    const result = await addMember(councilId);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, "add_member");
    assert.equal(result.metadata.member.name, "Agent Alpha");
    assert.equal(result.metadata.member.role, "analyst");
    assert.equal(result.metadata.member.weight, 1.0);
    assert.equal(result.metadata.memberCount, 1);
  });

  it("should add a member with custom weight", async () => {
    const { metadata } = await createCouncil();
    const result = await addMember(metadata.councilId, {
      name: "Heavy Hitter",
      role: "domain_expert",
      perspective: "architecture",
      weight: 3.0,
    });
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.member.weight, 3.0);
  });

  it("should accept all valid roles", async () => {
    const { metadata } = await createCouncil();
    const id = metadata.councilId;
    const roles = ["analyst", "critic", "optimist", "pessimist", "domain_expert", "devil_advocate"];

    for (let i = 0; i < roles.length; i++) {
      const result = await addMember(id, {
        name: `Agent ${i}`,
        role: roles[i],
        perspective: `perspective ${i}`,
      });
      assert.equal(result.metadata.success, true, `Role ${roles[i]} should be accepted`);
    }
    // Verify via get_council
    const council = await execute({ action: "get_council", councilId: id }, {});
    assert.equal(council.metadata.council.members.length, 6);
  });

  it("should return error for missing councilId", async () => {
    const result = await execute(
      { action: "add_member", member: { name: "A", role: "analyst", perspective: "p" } },
      {}
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, "MISSING_COUNCIL_ID");
  });

  it("should return error for non-existent council", async () => {
    const result = await addMember("non-existent-id");
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, "COUNCIL_NOT_FOUND");
  });

  it("should return error for missing member object", async () => {
    const { metadata } = await createCouncil();
    const result = await execute(
      { action: "add_member", councilId: metadata.councilId },
      {}
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, "MISSING_MEMBER");
  });

  it("should return error for missing member name", async () => {
    const { metadata } = await createCouncil();
    const result = await execute(
      { action: "add_member", councilId: metadata.councilId, member: { role: "analyst", perspective: "p" } },
      {}
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, "MISSING_MEMBER_NAME");
  });

  it("should return error for missing member role", async () => {
    const { metadata } = await createCouncil();
    const result = await execute(
      { action: "add_member", councilId: metadata.councilId, member: { name: "A", perspective: "p" } },
      {}
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, "MISSING_MEMBER_ROLE");
  });

  it("should return error for invalid role", async () => {
    const { metadata } = await createCouncil();
    const result = await addMember(metadata.councilId, {
      name: "Bad Role",
      role: "magician",
      perspective: "tricks",
    });
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, "INVALID_ROLE");
  });

  it("should return error for missing perspective", async () => {
    const { metadata } = await createCouncil();
    const result = await execute(
      { action: "add_member", councilId: metadata.councilId, member: { name: "A", role: "analyst" } },
      {}
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, "MISSING_MEMBER_PERSPECTIVE");
  });

  it("should reject duplicate member names (case-insensitive)", async () => {
    const { metadata } = await createCouncil();
    const id = metadata.councilId;
    await addMember(id, { name: "Alice", role: "analyst", perspective: "data" });
    const result = await addMember(id, { name: "alice", role: "critic", perspective: "risk" });
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, "DUPLICATE_MEMBER");
  });
});

// ---------------------------------------------------------------------------
// remove_member
// ---------------------------------------------------------------------------

describe("agent-council: remove_member", () => {
  beforeEach(() => _clearStore());

  it("should remove an existing member", async () => {
    const { metadata } = await createCouncil();
    const id = metadata.councilId;
    await addMember(id, { name: "Alice", role: "analyst", perspective: "data" });
    await addMember(id, { name: "Bob", role: "critic", perspective: "risk" });

    const result = await execute(
      { action: "remove_member", councilId: id, memberName: "Alice" },
      {}
    );
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, "remove_member");
    assert.equal(result.metadata.removedMember.name, "Alice");
    assert.equal(result.metadata.memberCount, 1);
  });

  it("should handle case-insensitive member name lookup", async () => {
    const { metadata } = await createCouncil();
    const id = metadata.councilId;
    await addMember(id, { name: "Alice", role: "analyst", perspective: "data" });

    const result = await execute(
      { action: "remove_member", councilId: id, memberName: "alice" },
      {}
    );
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.removedMember.name, "Alice");
  });

  it("should return error for missing councilId", async () => {
    const result = await execute(
      { action: "remove_member", memberName: "Alice" },
      {}
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, "MISSING_COUNCIL_ID");
  });

  it("should return error for non-existent council", async () => {
    const result = await execute(
      { action: "remove_member", councilId: "fake-id", memberName: "Alice" },
      {}
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, "COUNCIL_NOT_FOUND");
  });

  it("should return error for missing memberName", async () => {
    const { metadata } = await createCouncil();
    const result = await execute(
      { action: "remove_member", councilId: metadata.councilId },
      {}
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, "MISSING_MEMBER_NAME");
  });

  it("should return error for non-existent member", async () => {
    const { metadata } = await createCouncil();
    const result = await execute(
      { action: "remove_member", councilId: metadata.councilId, memberName: "Ghost" },
      {}
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, "MEMBER_NOT_FOUND");
  });
});

// ---------------------------------------------------------------------------
// deliberate
// ---------------------------------------------------------------------------

describe("agent-council: deliberate", () => {
  beforeEach(() => _clearStore());

  it("should generate positions for all members", async () => {
    const { councilId } = await createPopulatedCouncil();

    const result = await execute(
      { action: "deliberate", councilId, question: "Should we adopt microservices?" },
      {}
    );

    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, "deliberate");
    assert.equal(result.metadata.positions.length, 6);
    assert.equal(result.metadata.memberCount, 6);
  });

  it("should generate role-specific positions for analyst", async () => {
    const { metadata } = await createCouncil();
    const id = metadata.councilId;
    await addMember(id, { name: "Ann", role: "analyst", perspective: "metrics" });

    const result = await execute(
      { action: "deliberate", councilId: id, question: "Should we scale?" },
      {}
    );

    const pos = result.metadata.positions[0];
    assert.equal(pos.role, "analyst");
    assert.ok(pos.rationale.includes("data-driven"));
    assert.ok(pos.rationale.includes("Pros:"));
    assert.ok(pos.rationale.includes("Cons:"));
  });

  it("should generate role-specific positions for critic", async () => {
    const { metadata } = await createCouncil();
    const id = metadata.councilId;
    await addMember(id, { name: "Carl", role: "critic", perspective: "risk" });

    const result = await execute(
      { action: "deliberate", councilId: id, question: "Should we scale?" },
      {}
    );

    const pos = result.metadata.positions[0];
    assert.equal(pos.role, "critic");
    assert.ok(pos.rationale.includes("risks") || pos.rationale.includes("weaknesses"));
  });

  it("should generate role-specific positions for optimist", async () => {
    const { metadata } = await createCouncil();
    const id = metadata.councilId;
    await addMember(id, { name: "Olive", role: "optimist", perspective: "growth" });

    const result = await execute(
      { action: "deliberate", councilId: id, question: "Should we scale?" },
      {}
    );

    const pos = result.metadata.positions[0];
    assert.equal(pos.role, "optimist");
    assert.ok(pos.rationale.includes("opportunity"));
  });

  it("should generate role-specific positions for pessimist", async () => {
    const { metadata } = await createCouncil();
    const id = metadata.councilId;
    await addMember(id, { name: "Pete", role: "pessimist", perspective: "failure" });

    const result = await execute(
      { action: "deliberate", councilId: id, question: "Should we scale?" },
      {}
    );

    const pos = result.metadata.positions[0];
    assert.equal(pos.role, "pessimist");
    assert.ok(pos.rationale.includes("pitfalls") || pos.rationale.includes("worst-case"));
  });

  it("should generate role-specific positions for domain_expert", async () => {
    const { metadata } = await createCouncil();
    const id = metadata.councilId;
    await addMember(id, { name: "Eve", role: "domain_expert", perspective: "engineering" });

    const result = await execute(
      { action: "deliberate", councilId: id, question: "Should we scale?" },
      {}
    );

    const pos = result.metadata.positions[0];
    assert.equal(pos.role, "domain_expert");
    assert.ok(pos.rationale.includes("technical"));
  });

  it("should generate role-specific positions for devil_advocate", async () => {
    const { metadata } = await createCouncil();
    const id = metadata.councilId;
    await addMember(id, { name: "Dave", role: "devil_advocate", perspective: "contrarian" });

    const result = await execute(
      { action: "deliberate", councilId: id, question: "Should we scale?" },
      {}
    );

    const pos = result.metadata.positions[0];
    assert.equal(pos.role, "devil_advocate");
    assert.ok(pos.rationale.includes("challenges") || pos.rationale.includes("contrarian") || pos.rationale.includes("opposite"));
  });

  it("should include the member perspective in rationale", async () => {
    const { metadata } = await createCouncil();
    const id = metadata.councilId;
    await addMember(id, { name: "Ann", role: "analyst", perspective: "quarterly revenue data" });

    const result = await execute(
      { action: "deliberate", councilId: id, question: "Should we expand?" },
      {}
    );

    const pos = result.metadata.positions[0];
    assert.ok(pos.rationale.includes("quarterly revenue data"));
  });

  it("should include question in output text", async () => {
    const { councilId } = await createPopulatedCouncil();

    const result = await execute(
      { action: "deliberate", councilId, question: "Is Rust better than Go?" },
      {}
    );

    assert.ok(result.result.includes("Is Rust better than Go?"));
  });

  it("should return error for council with no members", async () => {
    const { metadata } = await createCouncil();

    const result = await execute(
      { action: "deliberate", councilId: metadata.councilId, question: "Test?" },
      {}
    );

    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, "NO_MEMBERS");
  });

  it("should return error for missing question", async () => {
    const { councilId } = await createPopulatedCouncil();

    const result = await execute(
      { action: "deliberate", councilId },
      {}
    );

    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, "MISSING_QUESTION");
  });

  it("should return error for missing councilId", async () => {
    const result = await execute(
      { action: "deliberate", question: "Test?" },
      {}
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, "MISSING_COUNCIL_ID");
  });
});

// ---------------------------------------------------------------------------
// vote - majority
// ---------------------------------------------------------------------------

describe("agent-council: vote (majority)", () => {
  beforeEach(() => _clearStore());

  it("should tally votes using majority method", async () => {
    const { councilId } = await createPopulatedCouncil("majority");

    const result = await execute(
      { action: "vote", councilId, proposal: "Adopt microservices" },
      {}
    );

    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, "vote");
    assert.equal(result.metadata.votingMethod, "majority");
    assert.equal(result.metadata.votes.length, 6);
    assert.ok(["approved", "rejected", "tied"].includes(result.metadata.outcome));
    assert.ok(typeof result.metadata.margin === "number");
  });

  it("should produce correct vote breakdown by role", async () => {
    const { councilId } = await createPopulatedCouncil("majority");

    const result = await execute(
      { action: "vote", councilId, proposal: "Launch new product" },
      {}
    );

    // Expected: analyst=abstain, critic=reject, optimist=approve, pessimist=reject, expert=approve, devil=reject
    const votes = result.metadata.votes;
    const analystVote = votes.find((v) => v.role === "analyst");
    const criticVote = votes.find((v) => v.role === "critic");
    const optimistVote = votes.find((v) => v.role === "optimist");
    const pessimistVote = votes.find((v) => v.role === "pessimist");
    const expertVote = votes.find((v) => v.role === "domain_expert");
    const devilVote = votes.find((v) => v.role === "devil_advocate");

    assert.equal(analystVote.vote, "abstain");
    assert.equal(criticVote.vote, "reject");
    assert.equal(optimistVote.vote, "approve");
    assert.equal(pessimistVote.vote, "reject");
    assert.equal(expertVote.vote, "approve");
    assert.equal(devilVote.vote, "reject");

    // 2 approve, 3 reject, 1 abstain -> rejected
    assert.equal(result.metadata.outcome, "rejected");
  });

  it("should return error for council with no members", async () => {
    const { metadata } = await createCouncil();

    const result = await execute(
      { action: "vote", councilId: metadata.councilId, proposal: "Test proposal" },
      {}
    );

    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, "NO_MEMBERS");
  });

  it("should return error for missing proposal", async () => {
    const { councilId } = await createPopulatedCouncil();

    const result = await execute(
      { action: "vote", councilId },
      {}
    );

    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, "MISSING_PROPOSAL");
  });

  it("should handle majority tie scenario", async () => {
    const { metadata } = await createCouncil({ votingMethod: "majority" });
    const id = metadata.councilId;

    // 1 approve, 1 reject -> tied
    await addMember(id, { name: "Opt", role: "optimist", perspective: "growth" });
    await addMember(id, { name: "Crit", role: "critic", perspective: "risk" });

    const result = await execute(
      { action: "vote", councilId: id, proposal: "Tied vote test" },
      {}
    );

    assert.equal(result.metadata.outcome, "tied");
    assert.equal(result.metadata.margin, 0);
  });

  it("should handle all-abstain scenario in majority", async () => {
    const { metadata } = await createCouncil({ votingMethod: "majority" });
    const id = metadata.councilId;

    // All analysts -> all abstain
    await addMember(id, { name: "A1", role: "analyst", perspective: "data" });
    await addMember(id, { name: "A2", role: "analyst", perspective: "metrics" });

    const result = await execute(
      { action: "vote", councilId: id, proposal: "All abstain test" },
      {}
    );

    assert.equal(result.metadata.outcome, "no_decision");
  });
});

// ---------------------------------------------------------------------------
// vote - unanimous
// ---------------------------------------------------------------------------

describe("agent-council: vote (unanimous)", () => {
  beforeEach(() => _clearStore());

  it("should approve when all non-abstaining votes are approve", async () => {
    const { metadata } = await createCouncil({ votingMethod: "unanimous" });
    const id = metadata.councilId;

    // optimist=approve, domain_expert=approve, analyst=abstain
    await addMember(id, { name: "Opt", role: "optimist", perspective: "growth" });
    await addMember(id, { name: "Expert", role: "domain_expert", perspective: "tech" });
    await addMember(id, { name: "Ann", role: "analyst", perspective: "data" });

    const result = await execute(
      { action: "vote", councilId: id, proposal: "Unanimous approve test" },
      {}
    );

    assert.equal(result.metadata.outcome, "approved");
    assert.equal(result.metadata.votingMethod, "unanimous");
  });

  it("should reject when any non-abstaining vote is reject", async () => {
    const { metadata } = await createCouncil({ votingMethod: "unanimous" });
    const id = metadata.councilId;

    // optimist=approve, critic=reject
    await addMember(id, { name: "Opt", role: "optimist", perspective: "growth" });
    await addMember(id, { name: "Crit", role: "critic", perspective: "risk" });

    const result = await execute(
      { action: "vote", councilId: id, proposal: "Unanimous reject test" },
      {}
    );

    assert.equal(result.metadata.outcome, "rejected");
  });

  it("should return no_decision when all abstain in unanimous", async () => {
    const { metadata } = await createCouncil({ votingMethod: "unanimous" });
    const id = metadata.councilId;

    await addMember(id, { name: "A1", role: "analyst", perspective: "data" });

    const result = await execute(
      { action: "vote", councilId: id, proposal: "All abstain unanimous" },
      {}
    );

    assert.equal(result.metadata.outcome, "no_decision");
  });
});

// ---------------------------------------------------------------------------
// vote - weighted
// ---------------------------------------------------------------------------

describe("agent-council: vote (weighted)", () => {
  beforeEach(() => _clearStore());

  it("should use weight values to determine outcome", async () => {
    const { metadata } = await createCouncil({ votingMethod: "weighted" });
    const id = metadata.councilId;

    // Heavy optimist (weight 5) vs light critic (weight 1)
    await addMember(id, { name: "Heavy Opt", role: "optimist", perspective: "growth", weight: 5.0 });
    await addMember(id, { name: "Light Crit", role: "critic", perspective: "risk", weight: 1.0 });

    const result = await execute(
      { action: "vote", councilId: id, proposal: "Weighted test" },
      {}
    );

    assert.equal(result.metadata.votingMethod, "weighted");
    assert.equal(result.metadata.outcome, "approved");
    assert.equal(result.metadata.margin, 4); // 5 - 1 = 4
  });

  it("should handle weighted tie", async () => {
    const { metadata } = await createCouncil({ votingMethod: "weighted" });
    const id = metadata.councilId;

    // Equal weights: optimist 2.0 approve vs critic 2.0 reject
    await addMember(id, { name: "Opt", role: "optimist", perspective: "growth", weight: 2.0 });
    await addMember(id, { name: "Crit", role: "critic", perspective: "risk", weight: 2.0 });

    const result = await execute(
      { action: "vote", councilId: id, proposal: "Weighted tie test" },
      {}
    );

    assert.equal(result.metadata.outcome, "tied");
    assert.equal(result.metadata.margin, 0);
  });

  it("should include weight in vote display for weighted method", async () => {
    const { metadata } = await createCouncil({ votingMethod: "weighted" });
    const id = metadata.councilId;
    await addMember(id, { name: "Opt", role: "optimist", perspective: "growth", weight: 2.5 });

    const result = await execute(
      { action: "vote", councilId: id, proposal: "Display test" },
      {}
    );

    assert.ok(result.result.includes("weight:"));
    assert.equal(result.metadata.votes[0].weight, 2.5);
  });

  it("should reject when weighted reject total exceeds approve", async () => {
    const { metadata } = await createCouncil({ votingMethod: "weighted" });
    const id = metadata.councilId;

    await addMember(id, { name: "Opt", role: "optimist", perspective: "growth", weight: 1.0 });
    await addMember(id, { name: "Crit", role: "critic", perspective: "risk", weight: 3.0 });
    await addMember(id, { name: "Pess", role: "pessimist", perspective: "failure", weight: 2.0 });

    const result = await execute(
      { action: "vote", councilId: id, proposal: "Heavy reject test" },
      {}
    );

    // approve=1.0, reject=3.0+2.0=5.0
    assert.equal(result.metadata.outcome, "rejected");
    assert.equal(result.metadata.margin, -4); // 1 - 5 = -4
  });
});

// ---------------------------------------------------------------------------
// get_council
// ---------------------------------------------------------------------------

describe("agent-council: get_council", () => {
  beforeEach(() => _clearStore());

  it("should return full council details", async () => {
    const { metadata } = await createCouncil();
    const id = metadata.councilId;
    await addMember(id, { name: "Alice", role: "analyst", perspective: "data" });

    const result = await execute({ action: "get_council", councilId: id }, {});

    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, "get_council");
    assert.equal(result.metadata.council.id, id);
    assert.equal(result.metadata.council.name, "Test Council");
    assert.equal(result.metadata.council.members.length, 1);
    assert.ok(result.result.includes("Test Council"));
    assert.ok(result.result.includes("Alice"));
  });

  it("should return error for missing councilId", async () => {
    const result = await execute({ action: "get_council" }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, "MISSING_COUNCIL_ID");
  });

  it("should return error for non-existent council", async () => {
    const result = await execute({ action: "get_council", councilId: "fake" }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, "COUNCIL_NOT_FOUND");
  });
});

// ---------------------------------------------------------------------------
// list_councils
// ---------------------------------------------------------------------------

describe("agent-council: list_councils", () => {
  beforeEach(() => _clearStore());

  it("should return empty list when no councils exist", async () => {
    const result = await execute({ action: "list_councils" }, {});

    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, "list_councils");
    assert.equal(result.metadata.count, 0);
    assert.deepEqual(result.metadata.councils, []);
    assert.ok(result.result.includes("No councils found"));
  });

  it("should list multiple councils with summaries", async () => {
    await createCouncil({ name: "Council A", topic: "Topic A" });
    await createCouncil({ name: "Council B", topic: "Topic B", votingMethod: "weighted" });

    const result = await execute({ action: "list_councils" }, {});

    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.count, 2);
    assert.equal(result.metadata.councils.length, 2);
    assert.ok(result.result.includes("Council A"));
    assert.ok(result.result.includes("Council B"));

    // Check summary shape
    for (const summary of result.metadata.councils) {
      assert.ok(summary.id);
      assert.ok(summary.name);
      assert.ok(summary.topic);
      assert.ok(summary.votingMethod);
      assert.ok(typeof summary.memberCount === "number");
    }
  });
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

describe("agent-council: error handling", () => {
  beforeEach(() => _clearStore());

  it("should return error for missing action", async () => {
    const result = await execute({}, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, "MISSING_ACTION");
  });

  it("should return error for unknown action", async () => {
    const result = await execute({ action: "explode" }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, "UNKNOWN_ACTION");
    assert.ok(result.result.includes("Unknown action"));
  });

  it("should sanitize unknown action in error message", async () => {
    const result = await execute({ action: '<script>alert("xss")</script>' }, {});
    assert.equal(result.metadata.success, false);
    assert.ok(!result.result.includes("<script>"));
  });
});

// ---------------------------------------------------------------------------
// _clearStore / _storeSize helpers
// ---------------------------------------------------------------------------

describe("agent-council: test helpers", () => {
  beforeEach(() => _clearStore());

  it("_clearStore should empty the store", async () => {
    await createCouncil({ name: "A" });
    await createCouncil({ name: "B" });
    assert.equal(_storeSize(), 2);

    _clearStore();
    assert.equal(_storeSize(), 0);
  });

  it("_storeSize should reflect current count", async () => {
    assert.equal(_storeSize(), 0);
    await createCouncil({ name: "One" });
    assert.equal(_storeSize(), 1);
    await createCouncil({ name: "Two" });
    assert.equal(_storeSize(), 2);
  });
});
