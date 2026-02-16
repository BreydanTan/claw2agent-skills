import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import { execute, _clearStore, _storeSize } from "../handler.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a workflow and return the metadata (including workflowId).
 */
async function createWorkflow(overrides = {}) {
  const params = {
    action: "create_workflow",
    name: "Test Workflow",
    description: "A test workflow",
    mode: "sequential",
    ...overrides,
  };
  return execute(params, {});
}

/**
 * Create a workflow and add a set of steps to it. Returns the workflowId.
 */
async function createWorkflowWithSteps(steps, workflowOverrides = {}) {
  const wf = await createWorkflow(workflowOverrides);
  const workflowId = wf.metadata.workflowId;
  for (const step of steps) {
    await execute({ action: "add_step", workflowId, step }, {});
  }
  return workflowId;
}

// ---------------------------------------------------------------------------
// create_workflow
// ---------------------------------------------------------------------------

describe("multi-agent-orchestration: create_workflow", () => {
  beforeEach(() => _clearStore());

  it("should create a workflow with default sequential mode", async () => {
    const res = await createWorkflow();
    assert.equal(res.metadata.success, true);
    assert.equal(res.metadata.action, "create_workflow");
    assert.equal(res.metadata.mode, "sequential");
    assert.ok(res.metadata.workflowId);
    assert.ok(res.result.includes("created successfully"));
    assert.equal(_storeSize(), 1);
  });

  it("should create a parallel workflow", async () => {
    const res = await createWorkflow({ mode: "parallel" });
    assert.equal(res.metadata.success, true);
    assert.equal(res.metadata.mode, "parallel");
  });

  it("should create a conditional workflow", async () => {
    const res = await createWorkflow({ mode: "conditional" });
    assert.equal(res.metadata.success, true);
    assert.equal(res.metadata.mode, "conditional");
  });

  it("should reject invalid mode", async () => {
    const res = await createWorkflow({ mode: "invalid" });
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_MODE");
    assert.ok(res.result.includes("Invalid mode"));
  });

  it("should reject missing name", async () => {
    const res = await execute({ action: "create_workflow" }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "MISSING_NAME");
  });

  it("should reject empty string name", async () => {
    const res = await execute({ action: "create_workflow", name: "  " }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "MISSING_NAME");
  });

  it("should create multiple workflows independently", async () => {
    const a = await createWorkflow({ name: "Workflow A" });
    const b = await createWorkflow({ name: "Workflow B" });
    assert.notEqual(a.metadata.workflowId, b.metadata.workflowId);
    assert.equal(_storeSize(), 2);
  });
});

// ---------------------------------------------------------------------------
// add_step
// ---------------------------------------------------------------------------

describe("multi-agent-orchestration: add_step", () => {
  beforeEach(() => _clearStore());

  it("should add a step to a workflow", async () => {
    const wf = await createWorkflow();
    const wfId = wf.metadata.workflowId;

    const res = await execute({
      action: "add_step",
      workflowId: wfId,
      step: { name: "step1", agentType: "researcher", task: "Research topic" },
    }, {});

    assert.equal(res.metadata.success, true);
    assert.equal(res.metadata.action, "add_step");
    assert.equal(res.metadata.totalSteps, 1);
    assert.ok(res.metadata.steps.includes("step1"));
  });

  it("should add multiple steps", async () => {
    const wf = await createWorkflow();
    const wfId = wf.metadata.workflowId;

    await execute({ action: "add_step", workflowId: wfId, step: { name: "s1", agentType: "a", task: "t1" } }, {});
    const res = await execute({ action: "add_step", workflowId: wfId, step: { name: "s2", agentType: "b", task: "t2" } }, {});

    assert.equal(res.metadata.totalSteps, 2);
    assert.deepEqual(res.metadata.steps, ["s1", "s2"]);
  });

  it("should add a step with valid dependencies", async () => {
    const wf = await createWorkflow();
    const wfId = wf.metadata.workflowId;

    await execute({ action: "add_step", workflowId: wfId, step: { name: "s1", agentType: "a", task: "t1" } }, {});
    const res = await execute({
      action: "add_step",
      workflowId: wfId,
      step: { name: "s2", agentType: "b", task: "t2", dependsOn: ["s1"] },
    }, {});

    assert.equal(res.metadata.success, true);
    assert.equal(res.metadata.totalSteps, 2);
  });

  it("should reject step with invalid dependency", async () => {
    const wf = await createWorkflow();
    const wfId = wf.metadata.workflowId;

    const res = await execute({
      action: "add_step",
      workflowId: wfId,
      step: { name: "s1", agentType: "a", task: "t1", dependsOn: ["nonexistent"] },
    }, {});

    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_DEPENDENCY");
  });

  it("should reject duplicate step name", async () => {
    const wf = await createWorkflow();
    const wfId = wf.metadata.workflowId;

    await execute({ action: "add_step", workflowId: wfId, step: { name: "s1", agentType: "a", task: "t" } }, {});
    const res = await execute({ action: "add_step", workflowId: wfId, step: { name: "s1", agentType: "b", task: "t2" } }, {});

    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "DUPLICATE_STEP");
  });

  it("should reject missing workflowId", async () => {
    const res = await execute({ action: "add_step", step: { name: "s1" } }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "MISSING_WORKFLOW_ID");
  });

  it("should reject non-existent workflowId", async () => {
    const res = await execute({ action: "add_step", workflowId: "fake-id", step: { name: "s1" } }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "WORKFLOW_NOT_FOUND");
  });

  it("should reject missing step object", async () => {
    const wf = await createWorkflow();
    const res = await execute({ action: "add_step", workflowId: wf.metadata.workflowId }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "MISSING_STEP");
  });

  it("should reject step with missing name", async () => {
    const wf = await createWorkflow();
    const res = await execute({
      action: "add_step",
      workflowId: wf.metadata.workflowId,
      step: { agentType: "a", task: "t" },
    }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "MISSING_STEP_NAME");
  });
});

// ---------------------------------------------------------------------------
// remove_step
// ---------------------------------------------------------------------------

describe("multi-agent-orchestration: remove_step", () => {
  beforeEach(() => _clearStore());

  it("should remove an existing step", async () => {
    const wfId = await createWorkflowWithSteps([
      { name: "s1", agentType: "a", task: "t1" },
      { name: "s2", agentType: "b", task: "t2" },
    ]);

    const res = await execute({ action: "remove_step", workflowId: wfId, stepName: "s1" }, {});
    assert.equal(res.metadata.success, true);
    assert.equal(res.metadata.action, "remove_step");
    assert.equal(res.metadata.remainingSteps, 1);
    assert.deepEqual(res.metadata.steps, ["s2"]);
  });

  it("should clean up dependsOn references when step is removed", async () => {
    const wf = await createWorkflow();
    const wfId = wf.metadata.workflowId;

    await execute({ action: "add_step", workflowId: wfId, step: { name: "s1", agentType: "a", task: "t1" } }, {});
    await execute({
      action: "add_step",
      workflowId: wfId,
      step: { name: "s2", agentType: "b", task: "t2", dependsOn: ["s1"] },
    }, {});

    // Remove s1 -- s2's dependsOn should be cleaned up
    await execute({ action: "remove_step", workflowId: wfId, stepName: "s1" }, {});

    // Get status to check s2's dependencies
    const status = await execute({ action: "get_status", workflowId: wfId }, {});
    const s2 = status.metadata.steps.find((s) => s.name === "s2");
    assert.deepEqual(s2.dependsOn, []);
  });

  it("should reject removal of non-existent step", async () => {
    const wf = await createWorkflow();
    const res = await execute({ action: "remove_step", workflowId: wf.metadata.workflowId, stepName: "ghost" }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "STEP_NOT_FOUND");
  });

  it("should reject missing workflowId", async () => {
    const res = await execute({ action: "remove_step", stepName: "s1" }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "MISSING_WORKFLOW_ID");
  });

  it("should reject missing stepName", async () => {
    const wf = await createWorkflow();
    const res = await execute({ action: "remove_step", workflowId: wf.metadata.workflowId }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "MISSING_STEP_NAME");
  });
});

// ---------------------------------------------------------------------------
// execute_workflow: sequential mode
// ---------------------------------------------------------------------------

describe("multi-agent-orchestration: execute_workflow (sequential)", () => {
  beforeEach(() => _clearStore());

  it("should execute a sequential workflow in order", async () => {
    const wfId = await createWorkflowWithSteps([
      { name: "research", agentType: "researcher", task: "Research topic" },
      { name: "write", agentType: "writer", task: "Write article", dependsOn: ["research"] },
      { name: "review", agentType: "reviewer", task: "Review article", dependsOn: ["write"] },
    ]);

    const res = await execute({ action: "execute_workflow", workflowId: wfId }, {});
    assert.equal(res.metadata.success, true);
    assert.equal(res.metadata.action, "execute_workflow");
    assert.equal(res.metadata.totalSteps, 3);
    assert.equal(res.metadata.executedSteps, 3);
    assert.equal(res.metadata.skippedSteps, 0);

    // Verify order
    const trace = res.metadata.trace;
    assert.equal(trace[0].stepName, "research");
    assert.equal(trace[1].stepName, "write");
    assert.equal(trace[2].stepName, "review");
    assert.equal(trace[0].order, 1);
    assert.equal(trace[2].order, 3);
  });

  it("should pass output from previous step as input to next", async () => {
    const wfId = await createWorkflowWithSteps([
      { name: "s1", agentType: "a", task: "t1" },
      { name: "s2", agentType: "b", task: "t2", dependsOn: ["s1"] },
    ]);

    const res = await execute({
      action: "execute_workflow",
      workflowId: wfId,
      input: { initial: true },
    }, {});

    const trace = res.metadata.trace;
    // First step gets the workflow input
    assert.deepEqual(trace[0].input, { initial: true });
    // Second step gets the output of the first step
    assert.ok(trace[1].input.simulatedResult);
  });

  it("should return simulated output per step", async () => {
    const wfId = await createWorkflowWithSteps([
      { name: "s1", agentType: "coder", task: "Write code" },
    ]);

    const res = await execute({ action: "execute_workflow", workflowId: wfId }, {});
    const step = res.metadata.trace[0];
    assert.ok(step.output.simulatedResult.includes("[Simulated]"));
    assert.ok(step.output.simulatedResult.includes("coder"));
    assert.equal(step.status, "completed");
  });

  it("should reject execution of workflow with no steps", async () => {
    const wf = await createWorkflow();
    const res = await execute({ action: "execute_workflow", workflowId: wf.metadata.workflowId }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "NO_STEPS");
  });

  it("should reject missing workflowId", async () => {
    const res = await execute({ action: "execute_workflow" }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "MISSING_WORKFLOW_ID");
  });

  it("should reject non-existent workflowId", async () => {
    const res = await execute({ action: "execute_workflow", workflowId: "nope" }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "WORKFLOW_NOT_FOUND");
  });
});

// ---------------------------------------------------------------------------
// execute_workflow: parallel mode
// ---------------------------------------------------------------------------

describe("multi-agent-orchestration: execute_workflow (parallel)", () => {
  beforeEach(() => _clearStore());

  it("should execute independent steps in parallel (same group)", async () => {
    const wfId = await createWorkflowWithSteps(
      [
        { name: "a", agentType: "agent1", task: "task A" },
        { name: "b", agentType: "agent2", task: "task B" },
        { name: "c", agentType: "agent3", task: "task C" },
      ],
      { mode: "parallel" },
    );

    const res = await execute({ action: "execute_workflow", workflowId: wfId }, {});
    assert.equal(res.metadata.success, true);
    assert.equal(res.metadata.totalSteps, 3);
    assert.equal(res.metadata.executedSteps, 3);

    // All should be in parallel group 1 since no dependencies
    const trace = res.metadata.trace;
    assert.equal(trace[0].parallelGroup, 1);
    assert.equal(trace[1].parallelGroup, 1);
    assert.equal(trace[2].parallelGroup, 1);
  });

  it("should group steps into levels based on dependencies", async () => {
    const wf = await createWorkflow({ mode: "parallel" });
    const wfId = wf.metadata.workflowId;

    await execute({ action: "add_step", workflowId: wfId, step: { name: "fetch", agentType: "fetcher", task: "Fetch data" } }, {});
    await execute({ action: "add_step", workflowId: wfId, step: { name: "parse", agentType: "parser", task: "Parse data", dependsOn: ["fetch"] } }, {});
    await execute({ action: "add_step", workflowId: wfId, step: { name: "validate", agentType: "validator", task: "Validate data", dependsOn: ["fetch"] } }, {});
    await execute({ action: "add_step", workflowId: wfId, step: { name: "store", agentType: "storer", task: "Store data", dependsOn: ["parse", "validate"] } }, {});

    const res = await execute({ action: "execute_workflow", workflowId: wfId }, {});
    assert.equal(res.metadata.success, true);

    const trace = res.metadata.trace;
    const fetchStep = trace.find((t) => t.stepName === "fetch");
    const parseStep = trace.find((t) => t.stepName === "parse");
    const validateStep = trace.find((t) => t.stepName === "validate");
    const storeStep = trace.find((t) => t.stepName === "store");

    assert.equal(fetchStep.parallelGroup, 1);
    assert.equal(parseStep.parallelGroup, 2);
    assert.equal(validateStep.parallelGroup, 2);
    assert.equal(storeStep.parallelGroup, 3);
  });
});

// ---------------------------------------------------------------------------
// execute_workflow: conditional mode
// ---------------------------------------------------------------------------

describe("multi-agent-orchestration: execute_workflow (conditional)", () => {
  beforeEach(() => _clearStore());

  it("should execute steps with matching conditions", async () => {
    const wfId = await createWorkflowWithSteps(
      [
        { name: "s1", agentType: "a", task: "Always run", condition: "always" },
        { name: "s2", agentType: "b", task: "Never run", condition: "never" },
      ],
      { mode: "conditional" },
    );

    const res = await execute({
      action: "execute_workflow",
      workflowId: wfId,
      input: {},
    }, {});

    assert.equal(res.metadata.success, true);
    assert.equal(res.metadata.executedSteps, 1);
    assert.equal(res.metadata.skippedSteps, 1);

    const trace = res.metadata.trace;
    assert.equal(trace[0].status, "completed");
    assert.equal(trace[1].status, "skipped");
  });

  it("should evaluate input-based equality conditions", async () => {
    const wfId = await createWorkflowWithSteps(
      [
        { name: "premium", agentType: "a", task: "Premium flow", condition: 'input.tier === "premium"' },
        { name: "basic", agentType: "b", task: "Basic flow", condition: 'input.tier === "basic"' },
      ],
      { mode: "conditional" },
    );

    const res = await execute({
      action: "execute_workflow",
      workflowId: wfId,
      input: { tier: "premium" },
    }, {});

    const trace = res.metadata.trace;
    assert.equal(trace[0].status, "completed");
    assert.equal(trace[0].conditionMet, true);
    assert.equal(trace[1].status, "skipped");
    assert.equal(trace[1].conditionMet, false);
  });

  it("should evaluate truthy conditions", async () => {
    const wfId = await createWorkflowWithSteps(
      [
        { name: "withFlag", agentType: "a", task: "Has flag", condition: "input.enabled" },
      ],
      { mode: "conditional" },
    );

    const res = await execute({
      action: "execute_workflow",
      workflowId: wfId,
      input: { enabled: true },
    }, {});

    assert.equal(res.metadata.trace[0].status, "completed");
    assert.equal(res.metadata.trace[0].conditionMet, true);
  });

  it("should skip steps with falsy input conditions", async () => {
    const wfId = await createWorkflowWithSteps(
      [
        { name: "withFlag", agentType: "a", task: "Has flag", condition: "input.enabled" },
      ],
      { mode: "conditional" },
    );

    const res = await execute({
      action: "execute_workflow",
      workflowId: wfId,
      input: { enabled: false },
    }, {});

    assert.equal(res.metadata.trace[0].status, "skipped");
  });

  it("should evaluate inequality conditions", async () => {
    const wfId = await createWorkflowWithSteps(
      [
        { name: "notAdmin", agentType: "a", task: "Non-admin flow", condition: 'input.role !== "admin"' },
      ],
      { mode: "conditional" },
    );

    const res = await execute({
      action: "execute_workflow",
      workflowId: wfId,
      input: { role: "user" },
    }, {});

    assert.equal(res.metadata.trace[0].status, "completed");
    assert.equal(res.metadata.trace[0].conditionMet, true);
  });

  it("should execute steps with no condition by default", async () => {
    const wfId = await createWorkflowWithSteps(
      [
        { name: "noCondition", agentType: "a", task: "No condition step" },
      ],
      { mode: "conditional" },
    );

    const res = await execute({ action: "execute_workflow", workflowId: wfId, input: {} }, {});
    assert.equal(res.metadata.trace[0].status, "completed");
  });
});

// ---------------------------------------------------------------------------
// get_status
// ---------------------------------------------------------------------------

describe("multi-agent-orchestration: get_status", () => {
  beforeEach(() => _clearStore());

  it("should return workflow details", async () => {
    const wf = await createWorkflow({ name: "My WF", description: "Test desc", mode: "parallel" });
    const wfId = wf.metadata.workflowId;

    const res = await execute({ action: "get_status", workflowId: wfId }, {});
    assert.equal(res.metadata.success, true);
    assert.equal(res.metadata.action, "get_status");
    assert.equal(res.metadata.name, "My WF");
    assert.equal(res.metadata.mode, "parallel");
    assert.equal(res.metadata.stepCount, 0);
    assert.equal(res.metadata.executionCount, 0);
    assert.ok(res.result.includes("My WF"));
    assert.ok(res.result.includes("parallel"));
  });

  it("should include step information", async () => {
    const wfId = await createWorkflowWithSteps([
      { name: "s1", agentType: "researcher", task: "Research" },
      { name: "s2", agentType: "writer", task: "Write", dependsOn: ["s1"] },
    ]);

    const res = await execute({ action: "get_status", workflowId: wfId }, {});
    assert.equal(res.metadata.stepCount, 2);
    assert.equal(res.metadata.steps.length, 2);
    assert.equal(res.metadata.steps[0].name, "s1");
    assert.deepEqual(res.metadata.steps[1].dependsOn, ["s1"]);
  });

  it("should include execution history after running", async () => {
    const wfId = await createWorkflowWithSteps([
      { name: "s1", agentType: "a", task: "t" },
    ]);

    await execute({ action: "execute_workflow", workflowId: wfId }, {});
    const res = await execute({ action: "get_status", workflowId: wfId }, {});

    assert.equal(res.metadata.executionCount, 1);
    assert.ok(res.result.includes("Last Execution"));
  });

  it("should reject missing workflowId", async () => {
    const res = await execute({ action: "get_status" }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "MISSING_WORKFLOW_ID");
  });

  it("should reject non-existent workflowId", async () => {
    const res = await execute({ action: "get_status", workflowId: "nope" }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "WORKFLOW_NOT_FOUND");
  });
});

// ---------------------------------------------------------------------------
// list_workflows
// ---------------------------------------------------------------------------

describe("multi-agent-orchestration: list_workflows", () => {
  beforeEach(() => _clearStore());

  it("should return empty list when no workflows exist", async () => {
    const res = await execute({ action: "list_workflows" }, {});
    assert.equal(res.metadata.success, true);
    assert.equal(res.metadata.action, "list_workflows");
    assert.equal(res.metadata.count, 0);
    assert.deepEqual(res.metadata.workflows, []);
    assert.ok(res.result.includes("No workflows"));
  });

  it("should list all created workflows", async () => {
    await createWorkflow({ name: "WF-A" });
    await createWorkflow({ name: "WF-B", mode: "parallel" });

    const res = await execute({ action: "list_workflows" }, {});
    assert.equal(res.metadata.success, true);
    assert.equal(res.metadata.count, 2);
    assert.ok(res.result.includes("WF-A"));
    assert.ok(res.result.includes("WF-B"));

    const names = res.metadata.workflows.map((w) => w.name);
    assert.ok(names.includes("WF-A"));
    assert.ok(names.includes("WF-B"));
  });

  it("should include step counts and execution counts", async () => {
    const wf = await createWorkflow({ name: "WF-C" });
    const wfId = wf.metadata.workflowId;
    await execute({ action: "add_step", workflowId: wfId, step: { name: "s1", agentType: "a", task: "t" } }, {});
    await execute({ action: "execute_workflow", workflowId: wfId }, {});

    const res = await execute({ action: "list_workflows" }, {});
    const entry = res.metadata.workflows.find((w) => w.name === "WF-C");
    assert.equal(entry.stepCount, 1);
    assert.equal(entry.executionCount, 1);
  });
});

// ---------------------------------------------------------------------------
// cancel_workflow
// ---------------------------------------------------------------------------

describe("multi-agent-orchestration: cancel_workflow", () => {
  beforeEach(() => _clearStore());

  it("should cancel and delete a workflow", async () => {
    const wf = await createWorkflow({ name: "Doomed" });
    const wfId = wf.metadata.workflowId;
    assert.equal(_storeSize(), 1);

    const res = await execute({ action: "cancel_workflow", workflowId: wfId }, {});
    assert.equal(res.metadata.success, true);
    assert.equal(res.metadata.action, "cancel_workflow");
    assert.equal(res.metadata.name, "Doomed");
    assert.ok(res.result.includes("cancelled and deleted"));
    assert.equal(_storeSize(), 0);
  });

  it("should not affect other workflows", async () => {
    const a = await createWorkflow({ name: "Keep" });
    const b = await createWorkflow({ name: "Delete" });

    await execute({ action: "cancel_workflow", workflowId: b.metadata.workflowId }, {});

    assert.equal(_storeSize(), 1);
    const list = await execute({ action: "list_workflows" }, {});
    assert.equal(list.metadata.count, 1);
    assert.equal(list.metadata.workflows[0].name, "Keep");
  });

  it("should reject missing workflowId", async () => {
    const res = await execute({ action: "cancel_workflow" }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "MISSING_WORKFLOW_ID");
  });

  it("should reject non-existent workflowId", async () => {
    const res = await execute({ action: "cancel_workflow", workflowId: "ghost" }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "WORKFLOW_NOT_FOUND");
  });
});

// ---------------------------------------------------------------------------
// Error handling (general)
// ---------------------------------------------------------------------------

describe("multi-agent-orchestration: error handling", () => {
  beforeEach(() => _clearStore());

  it("should return error for missing action", async () => {
    const res = await execute({}, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "MISSING_ACTION");
    assert.ok(res.result.includes("action"));
  });

  it("should return error for unknown action", async () => {
    const res = await execute({ action: "fly_to_moon" }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "UNKNOWN_ACTION");
    assert.ok(res.result.includes("Unknown action"));
    assert.ok(res.result.includes("fly_to_moon"));
  });
});

// ---------------------------------------------------------------------------
// Edge cases and integration scenarios
// ---------------------------------------------------------------------------

describe("multi-agent-orchestration: edge cases", () => {
  beforeEach(() => _clearStore());

  it("should handle workflow with single step", async () => {
    const wfId = await createWorkflowWithSteps([
      { name: "only", agentType: "solo", task: "Do everything" },
    ]);

    const res = await execute({ action: "execute_workflow", workflowId: wfId }, {});
    assert.equal(res.metadata.success, true);
    assert.equal(res.metadata.totalSteps, 1);
    assert.equal(res.metadata.executedSteps, 1);
  });

  it("should track multiple executions of the same workflow", async () => {
    const wfId = await createWorkflowWithSteps([
      { name: "s1", agentType: "a", task: "t" },
    ]);

    await execute({ action: "execute_workflow", workflowId: wfId }, {});
    await execute({ action: "execute_workflow", workflowId: wfId }, {});
    await execute({ action: "execute_workflow", workflowId: wfId }, {});

    const status = await execute({ action: "get_status", workflowId: wfId }, {});
    assert.equal(status.metadata.executionCount, 3);
  });

  it("should generate unique execution IDs", async () => {
    const wfId = await createWorkflowWithSteps([
      { name: "s1", agentType: "a", task: "t" },
    ]);

    const r1 = await execute({ action: "execute_workflow", workflowId: wfId }, {});
    const r2 = await execute({ action: "execute_workflow", workflowId: wfId }, {});

    assert.notEqual(r1.metadata.executionId, r2.metadata.executionId);
  });

  it("should accept input data in execution", async () => {
    const wfId = await createWorkflowWithSteps([
      { name: "s1", agentType: "a", task: "t" },
    ]);

    const res = await execute({
      action: "execute_workflow",
      workflowId: wfId,
      input: { key: "value", count: 42 },
    }, {});

    assert.equal(res.metadata.success, true);
    assert.deepEqual(res.metadata.trace[0].input, { key: "value", count: 42 });
  });

  it("should handle _clearStore correctly", async () => {
    await createWorkflow({ name: "A" });
    await createWorkflow({ name: "B" });
    assert.equal(_storeSize(), 2);

    _clearStore();
    assert.equal(_storeSize(), 0);

    const list = await execute({ action: "list_workflows" }, {});
    assert.equal(list.metadata.count, 0);
  });

  it("should handle step with default agentType", async () => {
    const wf = await createWorkflow();
    const wfId = wf.metadata.workflowId;

    await execute({
      action: "add_step",
      workflowId: wfId,
      step: { name: "s1", task: "task without agentType" },
    }, {});

    const status = await execute({ action: "get_status", workflowId: wfId }, {});
    assert.equal(status.metadata.steps[0].agentType, "default");
  });

  it("should correctly order steps without explicit dependencies in sequential mode", async () => {
    const wfId = await createWorkflowWithSteps([
      { name: "alpha", agentType: "a", task: "first" },
      { name: "beta", agentType: "b", task: "second" },
      { name: "gamma", agentType: "c", task: "third" },
    ]);

    const res = await execute({ action: "execute_workflow", workflowId: wfId }, {});
    assert.equal(res.metadata.success, true);
    assert.equal(res.metadata.totalSteps, 3);
    // All should complete since there are no circular deps
    assert.equal(res.metadata.executedSteps, 3);
  });

  it("should include workflow mode in execution result text", async () => {
    const wfId = await createWorkflowWithSteps(
      [{ name: "s1", agentType: "a", task: "t" }],
      { mode: "parallel" },
    );

    const res = await execute({ action: "execute_workflow", workflowId: wfId }, {});
    assert.ok(res.result.includes("parallel"));
  });
});
