/**
 * Multi-Agent Orchestration Skill Handler
 *
 * Manages workflows where multiple agents collaborate on tasks.
 * Pure local orchestration logic -- no external API calls required.
 * Supports sequential, parallel, and conditional workflow modes with
 * dependency tracking and simulated execution.
 */

// ---------------------------------------------------------------------------
// In-memory stores (module-level so they persist across calls)
// ---------------------------------------------------------------------------

const workflowStore = new Map();
const executionHistory = new Map();

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_MODES = ["sequential", "parallel", "conditional"];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Generate a UUID v4 string using only built-in Math.random.
 * Not cryptographically secure, but sufficient for in-memory IDs.
 *
 * @returns {string}
 */
function generateId() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Get current ISO timestamp.
 *
 * @returns {string}
 */
function now() {
  return new Date().toISOString();
}

/**
 * Topological sort of steps based on dependsOn edges.
 * Returns ordered step names or null if a cycle is detected.
 *
 * @param {Map<string, object>} stepMap - Map of stepName -> step object
 * @returns {string[] | null}
 */
function topologicalSort(stepMap) {
  const visited = new Set();
  const visiting = new Set();
  const order = [];

  function visit(name) {
    if (visiting.has(name)) return false; // cycle
    if (visited.has(name)) return true;

    visiting.add(name);
    const step = stepMap.get(name);
    if (step && step.dependsOn) {
      for (const dep of step.dependsOn) {
        if (!visit(dep)) return false;
      }
    }
    visiting.delete(name);
    visited.add(name);
    order.push(name);
    return true;
  }

  for (const name of stepMap.keys()) {
    if (!visit(name)) return null;
  }

  return order;
}

// ---------------------------------------------------------------------------
// Test helpers (exported for test isolation)
// ---------------------------------------------------------------------------

/**
 * Clear all workflows and execution history. Exposed for test isolation.
 */
export function _clearStore() {
  workflowStore.clear();
  executionHistory.clear();
}

/**
 * Get the current number of workflows. Exposed for test assertions.
 *
 * @returns {number}
 */
export function _storeSize() {
  return workflowStore.size;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/**
 * Create a new workflow definition.
 */
function actionCreateWorkflow({ name, description, mode }) {
  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return {
      result: "Error: A non-empty 'name' parameter is required to create a workflow.",
      metadata: { success: false, error: "MISSING_NAME" },
    };
  }

  const trimmedMode = (mode || "sequential").trim().toLowerCase();
  if (!VALID_MODES.includes(trimmedMode)) {
    return {
      result: `Error: Invalid mode '${mode}'. Supported modes: ${VALID_MODES.join(", ")}.`,
      metadata: { success: false, error: "INVALID_MODE" },
    };
  }

  const id = generateId();
  const workflow = {
    id,
    name: name.trim(),
    description: (description || "").trim(),
    mode: trimmedMode,
    steps: new Map(),
    createdAt: now(),
    updatedAt: now(),
  };

  workflowStore.set(id, workflow);
  executionHistory.set(id, []);

  return {
    result: `Workflow "${workflow.name}" created successfully with ID: ${id} (mode: ${trimmedMode}).`,
    metadata: {
      success: true,
      action: "create_workflow",
      workflowId: id,
      name: workflow.name,
      mode: trimmedMode,
    },
  };
}

/**
 * Add a step to an existing workflow.
 */
function actionAddStep({ workflowId, step }) {
  if (!workflowId || typeof workflowId !== "string") {
    return {
      result: "Error: A 'workflowId' parameter is required.",
      metadata: { success: false, error: "MISSING_WORKFLOW_ID" },
    };
  }

  const workflow = workflowStore.get(workflowId);
  if (!workflow) {
    return {
      result: `Error: Workflow '${workflowId}' not found.`,
      metadata: { success: false, error: "WORKFLOW_NOT_FOUND" },
    };
  }

  if (!step || typeof step !== "object") {
    return {
      result: "Error: A 'step' object parameter is required.",
      metadata: { success: false, error: "MISSING_STEP" },
    };
  }

  if (!step.name || typeof step.name !== "string" || step.name.trim().length === 0) {
    return {
      result: "Error: Step must have a non-empty 'name' property.",
      metadata: { success: false, error: "MISSING_STEP_NAME" },
    };
  }

  const stepName = step.name.trim();

  if (workflow.steps.has(stepName)) {
    return {
      result: `Error: A step named '${stepName}' already exists in this workflow.`,
      metadata: { success: false, error: "DUPLICATE_STEP" },
    };
  }

  // Validate dependsOn references
  if (step.dependsOn && Array.isArray(step.dependsOn)) {
    for (const dep of step.dependsOn) {
      if (!workflow.steps.has(dep)) {
        return {
          result: `Error: Dependency '${dep}' does not exist in this workflow. Add it first.`,
          metadata: { success: false, error: "INVALID_DEPENDENCY" },
        };
      }
    }
  }

  const newStep = {
    name: stepName,
    agentType: (step.agentType || "default").trim(),
    task: (step.task || "").trim(),
    dependsOn: step.dependsOn ? [...step.dependsOn] : [],
    condition: step.condition || null,
    addedAt: now(),
  };

  workflow.steps.set(stepName, newStep);
  workflow.updatedAt = now();

  const stepList = Array.from(workflow.steps.keys());

  return {
    result: `Step "${stepName}" added to workflow "${workflow.name}". Total steps: ${workflow.steps.size}.`,
    metadata: {
      success: true,
      action: "add_step",
      workflowId,
      stepName,
      totalSteps: workflow.steps.size,
      steps: stepList,
    },
  };
}

/**
 * Remove a step from a workflow.
 * Also cleans up any dependsOn references to the removed step.
 */
function actionRemoveStep({ workflowId, stepName }) {
  if (!workflowId || typeof workflowId !== "string") {
    return {
      result: "Error: A 'workflowId' parameter is required.",
      metadata: { success: false, error: "MISSING_WORKFLOW_ID" },
    };
  }

  const workflow = workflowStore.get(workflowId);
  if (!workflow) {
    return {
      result: `Error: Workflow '${workflowId}' not found.`,
      metadata: { success: false, error: "WORKFLOW_NOT_FOUND" },
    };
  }

  if (!stepName || typeof stepName !== "string" || stepName.trim().length === 0) {
    return {
      result: "Error: A non-empty 'stepName' parameter is required.",
      metadata: { success: false, error: "MISSING_STEP_NAME" },
    };
  }

  const trimmedName = stepName.trim();

  if (!workflow.steps.has(trimmedName)) {
    return {
      result: `Error: Step '${trimmedName}' not found in workflow '${workflow.name}'.`,
      metadata: { success: false, error: "STEP_NOT_FOUND" },
    };
  }

  workflow.steps.delete(trimmedName);

  // Remove any dependsOn references to the deleted step
  for (const [, s] of workflow.steps) {
    if (s.dependsOn && s.dependsOn.length > 0) {
      s.dependsOn = s.dependsOn.filter((dep) => dep !== trimmedName);
    }
  }

  workflow.updatedAt = now();

  const stepList = Array.from(workflow.steps.keys());

  return {
    result: `Step "${trimmedName}" removed from workflow "${workflow.name}". Remaining steps: ${workflow.steps.size}.`,
    metadata: {
      success: true,
      action: "remove_step",
      workflowId,
      removedStep: trimmedName,
      remainingSteps: workflow.steps.size,
      steps: stepList,
    },
  };
}

/**
 * Simulate execution of a workflow.
 * Since this is L0, no real agent execution occurs. Instead we produce
 * a structured trace showing what WOULD happen.
 */
function actionExecuteWorkflow({ workflowId, input }) {
  if (!workflowId || typeof workflowId !== "string") {
    return {
      result: "Error: A 'workflowId' parameter is required.",
      metadata: { success: false, error: "MISSING_WORKFLOW_ID" },
    };
  }

  const workflow = workflowStore.get(workflowId);
  if (!workflow) {
    return {
      result: `Error: Workflow '${workflowId}' not found.`,
      metadata: { success: false, error: "WORKFLOW_NOT_FOUND" },
    };
  }

  if (workflow.steps.size === 0) {
    return {
      result: `Error: Workflow "${workflow.name}" has no steps to execute.`,
      metadata: { success: false, error: "NO_STEPS" },
    };
  }

  const executionId = generateId();
  const startedAt = now();
  const inputData = input || {};
  const trace = [];

  if (workflow.mode === "sequential") {
    // Topological sort to respect dependencies
    const sorted = topologicalSort(workflow.steps);
    if (!sorted) {
      return {
        result: `Error: Workflow "${workflow.name}" has circular dependencies.`,
        metadata: { success: false, error: "CIRCULAR_DEPENDENCY" },
      };
    }

    let previousOutput = inputData;
    for (let i = 0; i < sorted.length; i++) {
      const step = workflow.steps.get(sorted[i]);
      const stepResult = {
        stepName: step.name,
        agentType: step.agentType,
        task: step.task,
        order: i + 1,
        status: "completed",
        input: previousOutput,
        output: {
          simulatedResult: `[Simulated] ${step.agentType} agent completed: ${step.task}`,
          agentType: step.agentType,
          stepName: step.name,
        },
      };
      trace.push(stepResult);
      previousOutput = stepResult.output;
    }
  } else if (workflow.mode === "parallel") {
    // Group steps by dependency level
    const levels = computeParallelLevels(workflow.steps);
    if (!levels) {
      return {
        result: `Error: Workflow "${workflow.name}" has circular dependencies.`,
        metadata: { success: false, error: "CIRCULAR_DEPENDENCY" },
      };
    }

    let order = 0;
    for (let levelIdx = 0; levelIdx < levels.length; levelIdx++) {
      const level = levels[levelIdx];
      const parallelGroup = [];
      for (const stepName of level) {
        order++;
        const step = workflow.steps.get(stepName);
        parallelGroup.push({
          stepName: step.name,
          agentType: step.agentType,
          task: step.task,
          order,
          parallelGroup: levelIdx + 1,
          status: "completed",
          input: inputData,
          output: {
            simulatedResult: `[Simulated] ${step.agentType} agent completed: ${step.task}`,
            agentType: step.agentType,
            stepName: step.name,
          },
        });
      }
      trace.push(...parallelGroup);
    }
  } else if (workflow.mode === "conditional") {
    // Evaluate conditions; steps with truthy conditions are executed, others skipped
    let order = 0;
    for (const [, step] of workflow.steps) {
      order++;
      const conditionMet = evaluateCondition(step.condition, inputData);
      trace.push({
        stepName: step.name,
        agentType: step.agentType,
        task: step.task,
        order,
        condition: step.condition,
        conditionMet,
        status: conditionMet ? "completed" : "skipped",
        input: inputData,
        output: conditionMet
          ? {
              simulatedResult: `[Simulated] ${step.agentType} agent completed: ${step.task}`,
              agentType: step.agentType,
              stepName: step.name,
            }
          : null,
      });
    }
  }

  const completedAt = now();
  const executedCount = trace.filter((t) => t.status === "completed").length;
  const skippedCount = trace.filter((t) => t.status === "skipped").length;

  const executionRecord = {
    executionId,
    workflowId,
    workflowName: workflow.name,
    mode: workflow.mode,
    startedAt,
    completedAt,
    totalSteps: trace.length,
    executedSteps: executedCount,
    skippedSteps: skippedCount,
    input: inputData,
    trace,
  };

  // Store in history
  const history = executionHistory.get(workflowId) || [];
  history.push(executionRecord);
  executionHistory.set(workflowId, history);

  // Build result text
  const lines = [
    `Workflow Execution: "${workflow.name}"`,
    "=".repeat(40),
    "",
    `Execution ID: ${executionId}`,
    `Mode: ${workflow.mode}`,
    `Total Steps: ${trace.length}`,
    `Executed: ${executedCount}`,
    `Skipped: ${skippedCount}`,
    "",
    "Execution Trace",
    "-".repeat(30),
  ];

  for (const entry of trace) {
    const statusTag = entry.status === "completed" ? "[OK]" : "[SKIP]";
    lines.push(`  ${entry.order}. ${statusTag} ${entry.stepName} (${entry.agentType}): ${entry.task}`);
    if (entry.parallelGroup) {
      lines.push(`     Parallel Group: ${entry.parallelGroup}`);
    }
    if (entry.condition) {
      lines.push(`     Condition: ${entry.condition} -> ${entry.conditionMet}`);
    }
  }

  return {
    result: lines.join("\n"),
    metadata: {
      success: true,
      action: "execute_workflow",
      executionId,
      workflowId,
      mode: workflow.mode,
      totalSteps: trace.length,
      executedSteps: executedCount,
      skippedSteps: skippedCount,
      trace,
    },
  };
}

/**
 * Compute parallel execution levels based on dependencies.
 * Level 0 = no dependencies, Level 1 = depends on level 0, etc.
 * Returns null if a cycle is detected.
 *
 * @param {Map<string, object>} stepMap
 * @returns {string[][] | null}
 */
function computeParallelLevels(stepMap) {
  const sorted = topologicalSort(stepMap);
  if (!sorted) return null;

  const levelMap = new Map();

  for (const name of sorted) {
    const step = stepMap.get(name);
    let level = 0;
    if (step.dependsOn && step.dependsOn.length > 0) {
      for (const dep of step.dependsOn) {
        const depLevel = levelMap.get(dep) || 0;
        level = Math.max(level, depLevel + 1);
      }
    }
    levelMap.set(name, level);
  }

  const maxLevel = Math.max(...levelMap.values(), 0);
  const levels = [];
  for (let i = 0; i <= maxLevel; i++) {
    levels.push([]);
  }
  for (const [name, level] of levelMap) {
    levels[level].push(name);
  }

  return levels;
}

/**
 * Evaluate a simple condition string against input data.
 * Supports basic patterns like "input.field === value".
 * For L0, we do a simplified evaluation.
 *
 * @param {string | null} condition
 * @param {object} inputData
 * @returns {boolean}
 */
function evaluateCondition(condition, inputData) {
  if (!condition || condition.trim().length === 0) {
    return true; // no condition means always execute
  }

  const trimmed = condition.trim();

  // Handle "always" and "never" keywords
  if (trimmed.toLowerCase() === "always") return true;
  if (trimmed.toLowerCase() === "never") return false;

  // Handle basic input.key === "value" patterns
  const eqMatch = trimmed.match(/^input\.(\w+)\s*===?\s*"?([^"]*)"?$/);
  if (eqMatch) {
    const [, key, value] = eqMatch;
    return String(inputData[key]) === value;
  }

  // Handle basic input.key !== "value" patterns
  const neqMatch = trimmed.match(/^input\.(\w+)\s*!==?\s*"?([^"]*)"?$/);
  if (neqMatch) {
    const [, key, value] = neqMatch;
    return String(inputData[key]) !== value;
  }

  // Handle "input.key" (truthy check)
  const truthyMatch = trimmed.match(/^input\.(\w+)$/);
  if (truthyMatch) {
    const [, key] = truthyMatch;
    return Boolean(inputData[key]);
  }

  // If we can't parse the condition, default to true (execute the step)
  return true;
}

/**
 * Get status and information about a workflow.
 */
function actionGetStatus({ workflowId }) {
  if (!workflowId || typeof workflowId !== "string") {
    return {
      result: "Error: A 'workflowId' parameter is required.",
      metadata: { success: false, error: "MISSING_WORKFLOW_ID" },
    };
  }

  const workflow = workflowStore.get(workflowId);
  if (!workflow) {
    return {
      result: `Error: Workflow '${workflowId}' not found.`,
      metadata: { success: false, error: "WORKFLOW_NOT_FOUND" },
    };
  }

  const history = executionHistory.get(workflowId) || [];
  const stepList = Array.from(workflow.steps.values()).map((s) => ({
    name: s.name,
    agentType: s.agentType,
    task: s.task,
    dependsOn: s.dependsOn,
    condition: s.condition,
  }));

  const lines = [
    `Workflow Status: "${workflow.name}"`,
    "=".repeat(40),
    "",
    `ID: ${workflow.id}`,
    `Mode: ${workflow.mode}`,
    `Description: ${workflow.description || "(none)"}`,
    `Steps: ${workflow.steps.size}`,
    `Executions: ${history.length}`,
    `Created: ${workflow.createdAt}`,
    `Updated: ${workflow.updatedAt}`,
  ];

  if (stepList.length > 0) {
    lines.push("", "Steps:", "-".repeat(20));
    for (const step of stepList) {
      lines.push(`  - ${step.name} [${step.agentType}]: ${step.task}`);
      if (step.dependsOn && step.dependsOn.length > 0) {
        lines.push(`    Depends on: ${step.dependsOn.join(", ")}`);
      }
      if (step.condition) {
        lines.push(`    Condition: ${step.condition}`);
      }
    }
  }

  if (history.length > 0) {
    const last = history[history.length - 1];
    lines.push("", "Last Execution:", "-".repeat(20));
    lines.push(`  ID: ${last.executionId}`);
    lines.push(`  Started: ${last.startedAt}`);
    lines.push(`  Completed: ${last.completedAt}`);
    lines.push(`  Steps Executed: ${last.executedSteps}/${last.totalSteps}`);
  }

  return {
    result: lines.join("\n"),
    metadata: {
      success: true,
      action: "get_status",
      workflowId,
      name: workflow.name,
      mode: workflow.mode,
      stepCount: workflow.steps.size,
      executionCount: history.length,
      steps: stepList,
    },
  };
}

/**
 * List all defined workflows.
 */
function actionListWorkflows() {
  if (workflowStore.size === 0) {
    return {
      result: "No workflows defined yet.",
      metadata: {
        success: true,
        action: "list_workflows",
        count: 0,
        workflows: [],
      },
    };
  }

  const workflows = [];
  const lines = [
    "Defined Workflows",
    "=".repeat(40),
    "",
  ];

  for (const [id, wf] of workflowStore) {
    const history = executionHistory.get(id) || [];
    const entry = {
      id,
      name: wf.name,
      mode: wf.mode,
      stepCount: wf.steps.size,
      executionCount: history.length,
      createdAt: wf.createdAt,
    };
    workflows.push(entry);
    lines.push(`  ${wf.name} (${id})`);
    lines.push(`    Mode: ${wf.mode} | Steps: ${wf.steps.size} | Executions: ${history.length}`);
    lines.push("");
  }

  return {
    result: lines.join("\n"),
    metadata: {
      success: true,
      action: "list_workflows",
      count: workflows.length,
      workflows,
    },
  };
}

/**
 * Cancel (delete) a workflow.
 */
function actionCancelWorkflow({ workflowId }) {
  if (!workflowId || typeof workflowId !== "string") {
    return {
      result: "Error: A 'workflowId' parameter is required.",
      metadata: { success: false, error: "MISSING_WORKFLOW_ID" },
    };
  }

  const workflow = workflowStore.get(workflowId);
  if (!workflow) {
    return {
      result: `Error: Workflow '${workflowId}' not found.`,
      metadata: { success: false, error: "WORKFLOW_NOT_FOUND" },
    };
  }

  const name = workflow.name;
  workflowStore.delete(workflowId);
  executionHistory.delete(workflowId);

  return {
    result: `Workflow "${name}" (${workflowId}) has been cancelled and deleted.`,
    metadata: {
      success: true,
      action: "cancel_workflow",
      workflowId,
      name,
    },
  };
}

// ---------------------------------------------------------------------------
// Main Entry Point
// ---------------------------------------------------------------------------

/**
 * Execute the multi-agent orchestration skill.
 *
 * @param {Object} params
 * @param {string} params.action - The action to perform
 * @param {string} [params.name] - Workflow name (create_workflow)
 * @param {string} [params.description] - Workflow description (create_workflow)
 * @param {string} [params.mode] - Workflow mode (create_workflow)
 * @param {string} [params.workflowId] - Target workflow ID
 * @param {Object} [params.step] - Step definition (add_step)
 * @param {string} [params.stepName] - Step name (remove_step)
 * @param {Object} [params.input] - Execution input (execute_workflow)
 * @param {Object} context - Execution context provided by the runtime
 * @returns {Promise<{result: string, metadata: Object}>}
 */
export async function execute(params, context) {
  const { action } = params;

  if (!action) {
    return {
      result: "Error: The 'action' parameter is required. Supported actions: create_workflow, add_step, remove_step, execute_workflow, get_status, list_workflows, cancel_workflow.",
      metadata: { success: false, error: "MISSING_ACTION" },
    };
  }

  switch (action) {
    case "create_workflow":
      return actionCreateWorkflow(params);

    case "add_step":
      return actionAddStep(params);

    case "remove_step":
      return actionRemoveStep(params);

    case "execute_workflow":
      return actionExecuteWorkflow(params);

    case "get_status":
      return actionGetStatus(params);

    case "list_workflows":
      return actionListWorkflows();

    case "cancel_workflow":
      return actionCancelWorkflow(params);

    default:
      return {
        result: `Error: Unknown action '${action}'. Supported actions: create_workflow, add_step, remove_step, execute_workflow, get_status, list_workflows, cancel_workflow.`,
        metadata: { success: false, error: "UNKNOWN_ACTION" },
      };
  }
}
