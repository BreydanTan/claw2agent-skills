/**
 * Agent Council Skill Handler
 *
 * Manages a "council" of virtual agents that deliberate on decisions using
 * structured debate patterns. Pure local logic -- simulates multi-perspective
 * analysis without any external API calls.
 *
 * SECURITY NOTES:
 * - All string inputs are sanitized to prevent XSS.
 * - No arbitrary code execution paths exist.
 * - All processing happens locally -- no data is sent to external services.
 */

// ---------------------------------------------------------------------------
// In-memory council store (module-level so it persists across calls)
// ---------------------------------------------------------------------------

const councilStore = new Map();

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
 * Sanitize a string to prevent XSS / injection.
 * Strips HTML-significant characters.
 *
 * @param {string} str
 * @returns {string}
 */
function sanitize(str) {
  if (typeof str !== "string") return str;
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

// ---------------------------------------------------------------------------
// Valid roles and voting methods
// ---------------------------------------------------------------------------

const VALID_ROLES = new Set([
  "analyst",
  "critic",
  "optimist",
  "pessimist",
  "domain_expert",
  "devil_advocate",
]);

const VALID_VOTING_METHODS = new Set(["majority", "unanimous", "weighted"]);

// ---------------------------------------------------------------------------
// Role-Based Perspective Templates
// ---------------------------------------------------------------------------

/**
 * Generate a position statement for a member based on their role and perspective.
 *
 * @param {Object} member - The council member
 * @param {string} question - The question under deliberation
 * @returns {Object} - { position, rationale }
 */
function generatePosition(member, question) {
  const { name, role, perspective } = member;
  const ctx = perspective ? ` Given their focus on ${perspective},` : "";

  switch (role) {
    case "analyst":
      return {
        memberName: name,
        role,
        position: "Requires further data analysis",
        rationale:
          `As an analyst,${ctx} ${name} evaluates "${question}" through a data-driven lens. ` +
          `Pros: Structured approaches tend to yield measurable outcomes and clear benchmarks. ` +
          `Cons: Insufficient data may lead to premature conclusions. ` +
          `Recommendation: Gather quantitative evidence before committing to a direction.`,
      };

    case "critic":
      return {
        memberName: name,
        role,
        position: "Identifies significant risks",
        rationale:
          `As a critic,${ctx} ${name} scrutinizes "${question}" for weaknesses. ` +
          `Key risks: Hidden complexity, resource underestimation, and unforeseen dependencies. ` +
          `Potential failure modes should be mapped before proceeding. ` +
          `Stress-testing assumptions is essential to avoid costly mistakes.`,
      };

    case "optimist":
      return {
        memberName: name,
        role,
        position: "Sees strong opportunity",
        rationale:
          `As an optimist,${ctx} ${name} views "${question}" as an opportunity. ` +
          `This direction could unlock significant value and open new possibilities. ` +
          `The potential upside outweighs the risks when managed properly. ` +
          `Early action gives a competitive advantage and builds momentum.`,
      };

    case "pessimist":
      return {
        memberName: name,
        role,
        position: "Warns of potential pitfalls",
        rationale:
          `As a pessimist,${ctx} ${name} warns about pitfalls in "${question}". ` +
          `Worst-case scenarios include resource waste, missed deadlines, and scope creep. ` +
          `Historical precedent suggests similar initiatives often underperform expectations. ` +
          `A cautious, phased approach with clear exit criteria is advised.`,
      };

    case "domain_expert":
      return {
        memberName: name,
        role,
        position: "Provides technical assessment",
        rationale:
          `As a domain expert,${ctx} ${name} assesses "${question}" from a technical standpoint. ` +
          `Technical feasibility depends on current capabilities and infrastructure readiness. ` +
          `Industry best practices suggest a modular approach with clear integration points. ` +
          `Key technical considerations must be addressed in the design phase.`,
      };

    case "devil_advocate":
      return {
        memberName: name,
        role,
        position: "Challenges the prevailing view",
        rationale:
          `As devil's advocate,${ctx} ${name} deliberately challenges the consensus on "${question}". ` +
          `What if the opposite approach is actually correct? ` +
          `The group may be suffering from confirmation bias or groupthink. ` +
          `Consider the contrarian position: doing nothing may be the optimal strategy.`,
      };

    default:
      return {
        memberName: name,
        role,
        position: "General perspective",
        rationale:
          `${name} considers "${question}" from a general perspective.${ctx} ` +
          `Multiple factors should be weighed before reaching a conclusion.`,
      };
  }
}

// ---------------------------------------------------------------------------
// Role-Based Voting Logic
// ---------------------------------------------------------------------------

/**
 * Determine a member's vote based on their role and perspective.
 * Returns "approve", "reject", or "abstain".
 *
 * @param {Object} member - The council member
 * @param {string} proposal - The proposal being voted on
 * @returns {string} - "approve" | "reject" | "abstain"
 */
function generateVote(member, proposal) {
  const { role } = member;

  switch (role) {
    case "analyst":
      // Analysts tend to abstain -- they want more data
      return "abstain";

    case "critic":
      // Critics tend to reject -- they see risks
      return "reject";

    case "optimist":
      // Optimists tend to approve -- they see opportunity
      return "approve";

    case "pessimist":
      // Pessimists tend to reject -- they see pitfalls
      return "reject";

    case "domain_expert":
      // Domain experts approve if it's technically sound
      return "approve";

    case "devil_advocate":
      // Devil's advocates reject to challenge consensus
      return "reject";

    default:
      return "abstain";
  }
}

/**
 * Apply the voting method to determine outcome.
 *
 * @param {Array} votes - Array of { memberName, role, vote, weight }
 * @param {string} method - "majority" | "unanimous" | "weighted"
 * @returns {Object} - { outcome, margin, details }
 */
function tallyVotes(votes, method) {
  const approveVotes = votes.filter((v) => v.vote === "approve");
  const rejectVotes = votes.filter((v) => v.vote === "reject");
  const abstainVotes = votes.filter((v) => v.vote === "abstain");

  switch (method) {
    case "unanimous": {
      // All non-abstaining votes must be approve
      const nonAbstain = votes.filter((v) => v.vote !== "abstain");
      if (nonAbstain.length === 0) {
        return {
          outcome: "no_decision",
          margin: 0,
          details: "All members abstained. No decision reached.",
        };
      }
      const allApprove = nonAbstain.every((v) => v.vote === "approve");
      return {
        outcome: allApprove ? "approved" : "rejected",
        margin: allApprove ? nonAbstain.length : rejectVotes.length,
        details: allApprove
          ? `Unanimously approved (${approveVotes.length} approve, ${abstainVotes.length} abstain).`
          : `Not unanimous: ${approveVotes.length} approve, ${rejectVotes.length} reject, ${abstainVotes.length} abstain.`,
      };
    }

    case "weighted": {
      const approveWeight = approveVotes.reduce((s, v) => s + v.weight, 0);
      const rejectWeight = rejectVotes.reduce((s, v) => s + v.weight, 0);
      const totalWeight = votes.reduce((s, v) => s + v.weight, 0);

      if (totalWeight === 0) {
        return {
          outcome: "no_decision",
          margin: 0,
          details: "Total weight is zero. No decision reached.",
        };
      }

      const margin = Math.round((approveWeight - rejectWeight) * 100) / 100;
      return {
        outcome: approveWeight > rejectWeight ? "approved" : approveWeight < rejectWeight ? "rejected" : "tied",
        margin,
        details: `Weighted tally: approve=${approveWeight}, reject=${rejectWeight}, total=${totalWeight}. Margin: ${margin}.`,
      };
    }

    case "majority":
    default: {
      // Simple majority of non-abstaining votes
      const nonAbstain = votes.filter((v) => v.vote !== "abstain");
      if (nonAbstain.length === 0) {
        return {
          outcome: "no_decision",
          margin: 0,
          details: "All members abstained. No decision reached.",
        };
      }

      const margin = approveVotes.length - rejectVotes.length;
      let outcome;
      if (approveVotes.length > rejectVotes.length) {
        outcome = "approved";
      } else if (rejectVotes.length > approveVotes.length) {
        outcome = "rejected";
      } else {
        outcome = "tied";
      }

      return {
        outcome,
        margin,
        details: `Majority vote: ${approveVotes.length} approve, ${rejectVotes.length} reject, ${abstainVotes.length} abstain. Margin: ${margin}.`,
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

function actionCreateCouncil(params) {
  const { name, topic, votingMethod } = params;

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return {
      result: "Error: The 'name' parameter is required for create_council.",
      metadata: { success: false, error: "MISSING_NAME" },
    };
  }

  if (!topic || typeof topic !== "string" || topic.trim().length === 0) {
    return {
      result: "Error: The 'topic' parameter is required for create_council.",
      metadata: { success: false, error: "MISSING_TOPIC" },
    };
  }

  const method = votingMethod || "majority";
  if (!VALID_VOTING_METHODS.has(method)) {
    return {
      result: `Error: Invalid voting method '${sanitize(String(votingMethod))}'. Must be one of: majority, unanimous, weighted.`,
      metadata: { success: false, error: "INVALID_VOTING_METHOD" },
    };
  }

  const id = generateId();
  const council = {
    id,
    name: sanitize(name.trim()),
    topic: sanitize(topic.trim()),
    votingMethod: method,
    members: [],
    createdAt: new Date().toISOString(),
  };

  councilStore.set(id, council);

  return {
    result: `Council "${council.name}" created successfully with ID ${id}. Topic: "${council.topic}". Voting method: ${method}.`,
    metadata: {
      success: true,
      action: "create_council",
      councilId: id,
      council,
    },
  };
}

function actionAddMember(params) {
  const { councilId, member } = params;

  if (!councilId || typeof councilId !== "string") {
    return {
      result: "Error: The 'councilId' parameter is required for add_member.",
      metadata: { success: false, error: "MISSING_COUNCIL_ID" },
    };
  }

  const council = councilStore.get(councilId);
  if (!council) {
    return {
      result: `Error: Council with ID '${sanitize(councilId)}' not found.`,
      metadata: { success: false, error: "COUNCIL_NOT_FOUND" },
    };
  }

  if (!member || typeof member !== "object") {
    return {
      result: "Error: The 'member' parameter is required and must be an object with name, role, and perspective.",
      metadata: { success: false, error: "MISSING_MEMBER" },
    };
  }

  const { name, role, perspective, weight } = member;

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return {
      result: "Error: Member 'name' is required.",
      metadata: { success: false, error: "MISSING_MEMBER_NAME" },
    };
  }

  if (!role || typeof role !== "string") {
    return {
      result: "Error: Member 'role' is required.",
      metadata: { success: false, error: "MISSING_MEMBER_ROLE" },
    };
  }

  if (!VALID_ROLES.has(role)) {
    return {
      result: `Error: Invalid role '${sanitize(role)}'. Must be one of: ${[...VALID_ROLES].join(", ")}.`,
      metadata: { success: false, error: "INVALID_ROLE" },
    };
  }

  if (!perspective || typeof perspective !== "string" || perspective.trim().length === 0) {
    return {
      result: "Error: Member 'perspective' is required.",
      metadata: { success: false, error: "MISSING_MEMBER_PERSPECTIVE" },
    };
  }

  // Check for duplicate name
  const existing = council.members.find(
    (m) => m.name.toLowerCase() === name.trim().toLowerCase()
  );
  if (existing) {
    return {
      result: `Error: A member named '${sanitize(name.trim())}' already exists in this council.`,
      metadata: { success: false, error: "DUPLICATE_MEMBER" },
    };
  }

  const memberWeight =
    weight !== undefined && typeof weight === "number" && weight >= 0
      ? weight
      : 1.0;

  const newMember = {
    name: sanitize(name.trim()),
    role,
    perspective: sanitize(perspective.trim()),
    weight: memberWeight,
  };

  council.members.push(newMember);

  return {
    result: `Member "${newMember.name}" (${role}) added to council "${council.name}". Council now has ${council.members.length} member(s).`,
    metadata: {
      success: true,
      action: "add_member",
      councilId,
      member: newMember,
      memberCount: council.members.length,
    },
  };
}

function actionRemoveMember(params) {
  const { councilId, memberName } = params;

  if (!councilId || typeof councilId !== "string") {
    return {
      result: "Error: The 'councilId' parameter is required for remove_member.",
      metadata: { success: false, error: "MISSING_COUNCIL_ID" },
    };
  }

  const council = councilStore.get(councilId);
  if (!council) {
    return {
      result: `Error: Council with ID '${sanitize(councilId)}' not found.`,
      metadata: { success: false, error: "COUNCIL_NOT_FOUND" },
    };
  }

  if (!memberName || typeof memberName !== "string" || memberName.trim().length === 0) {
    return {
      result: "Error: The 'memberName' parameter is required for remove_member.",
      metadata: { success: false, error: "MISSING_MEMBER_NAME" },
    };
  }

  const idx = council.members.findIndex(
    (m) => m.name.toLowerCase() === memberName.trim().toLowerCase()
  );
  if (idx === -1) {
    return {
      result: `Error: Member '${sanitize(memberName.trim())}' not found in council "${council.name}".`,
      metadata: { success: false, error: "MEMBER_NOT_FOUND" },
    };
  }

  const removed = council.members.splice(idx, 1)[0];

  return {
    result: `Member "${removed.name}" removed from council "${council.name}". Council now has ${council.members.length} member(s).`,
    metadata: {
      success: true,
      action: "remove_member",
      councilId,
      removedMember: removed,
      memberCount: council.members.length,
    },
  };
}

function actionDeliberate(params) {
  const { councilId, question } = params;

  if (!councilId || typeof councilId !== "string") {
    return {
      result: "Error: The 'councilId' parameter is required for deliberate.",
      metadata: { success: false, error: "MISSING_COUNCIL_ID" },
    };
  }

  const council = councilStore.get(councilId);
  if (!council) {
    return {
      result: `Error: Council with ID '${sanitize(councilId)}' not found.`,
      metadata: { success: false, error: "COUNCIL_NOT_FOUND" },
    };
  }

  if (!question || typeof question !== "string" || question.trim().length === 0) {
    return {
      result: "Error: The 'question' parameter is required for deliberate.",
      metadata: { success: false, error: "MISSING_QUESTION" },
    };
  }

  if (council.members.length === 0) {
    return {
      result: `Error: Council "${council.name}" has no members. Add members before deliberating.`,
      metadata: { success: false, error: "NO_MEMBERS" },
    };
  }

  const sanitizedQuestion = sanitize(question.trim());
  const positions = council.members.map((member) =>
    generatePosition(member, sanitizedQuestion)
  );

  const lines = [
    `Council Deliberation: "${council.name}"`,
    `${"=".repeat(40)}`,
    `Topic: ${council.topic}`,
    `Question: ${sanitizedQuestion}`,
    `Members: ${council.members.length}`,
    "",
  ];

  for (const pos of positions) {
    lines.push(`--- ${pos.memberName} (${pos.role}) ---`);
    lines.push(`Position: ${pos.position}`);
    lines.push(`Rationale: ${pos.rationale}`);
    lines.push("");
  }

  return {
    result: lines.join("\n"),
    metadata: {
      success: true,
      action: "deliberate",
      councilId,
      question: sanitizedQuestion,
      positions,
      memberCount: council.members.length,
    },
  };
}

function actionVote(params) {
  const { councilId, proposal } = params;

  if (!councilId || typeof councilId !== "string") {
    return {
      result: "Error: The 'councilId' parameter is required for vote.",
      metadata: { success: false, error: "MISSING_COUNCIL_ID" },
    };
  }

  const council = councilStore.get(councilId);
  if (!council) {
    return {
      result: `Error: Council with ID '${sanitize(councilId)}' not found.`,
      metadata: { success: false, error: "COUNCIL_NOT_FOUND" },
    };
  }

  if (!proposal || typeof proposal !== "string" || proposal.trim().length === 0) {
    return {
      result: "Error: The 'proposal' parameter is required for vote.",
      metadata: { success: false, error: "MISSING_PROPOSAL" },
    };
  }

  if (council.members.length === 0) {
    return {
      result: `Error: Council "${council.name}" has no members. Add members before voting.`,
      metadata: { success: false, error: "NO_MEMBERS" },
    };
  }

  const sanitizedProposal = sanitize(proposal.trim());

  const votes = council.members.map((member) => ({
    memberName: member.name,
    role: member.role,
    vote: generateVote(member, sanitizedProposal),
    weight: member.weight,
  }));

  const { outcome, margin, details } = tallyVotes(votes, council.votingMethod);

  const lines = [
    `Council Vote: "${council.name}"`,
    `${"=".repeat(40)}`,
    `Proposal: ${sanitizedProposal}`,
    `Voting Method: ${council.votingMethod}`,
    "",
    "Votes:",
  ];

  for (const v of votes) {
    const weightStr = council.votingMethod === "weighted" ? ` (weight: ${v.weight})` : "";
    lines.push(`  ${v.memberName} (${v.role}): ${v.vote.toUpperCase()}${weightStr}`);
  }

  lines.push("");
  lines.push(`Outcome: ${outcome.toUpperCase()}`);
  lines.push(`Details: ${details}`);

  return {
    result: lines.join("\n"),
    metadata: {
      success: true,
      action: "vote",
      councilId,
      proposal: sanitizedProposal,
      votes,
      outcome,
      margin,
      votingMethod: council.votingMethod,
    },
  };
}

function actionGetCouncil(params) {
  const { councilId } = params;

  if (!councilId || typeof councilId !== "string") {
    return {
      result: "Error: The 'councilId' parameter is required for get_council.",
      metadata: { success: false, error: "MISSING_COUNCIL_ID" },
    };
  }

  const council = councilStore.get(councilId);
  if (!council) {
    return {
      result: `Error: Council with ID '${sanitize(councilId)}' not found.`,
      metadata: { success: false, error: "COUNCIL_NOT_FOUND" },
    };
  }

  const lines = [
    `Council: "${council.name}"`,
    `${"=".repeat(40)}`,
    `ID: ${council.id}`,
    `Topic: ${council.topic}`,
    `Voting Method: ${council.votingMethod}`,
    `Created: ${council.createdAt}`,
    `Members: ${council.members.length}`,
  ];

  if (council.members.length > 0) {
    lines.push("", "Member Roster:", "--------------");
    for (const m of council.members) {
      lines.push(`  ${m.name} (${m.role}, weight: ${m.weight}) - ${m.perspective}`);
    }
  }

  return {
    result: lines.join("\n"),
    metadata: {
      success: true,
      action: "get_council",
      council,
    },
  };
}

function actionListCouncils() {
  const councils = [...councilStore.values()];

  if (councils.length === 0) {
    return {
      result: "No councils found. Create one with the create_council action.",
      metadata: {
        success: true,
        action: "list_councils",
        count: 0,
        councils: [],
      },
    };
  }

  const lines = [
    `Councils (${councils.length})`,
    `${"=".repeat(40)}`,
    "",
  ];

  for (const c of councils) {
    lines.push(`- ${c.name} (ID: ${c.id})`);
    lines.push(`  Topic: ${c.topic} | Method: ${c.votingMethod} | Members: ${c.members.length}`);
    lines.push("");
  }

  const summaries = councils.map((c) => ({
    id: c.id,
    name: c.name,
    topic: c.topic,
    votingMethod: c.votingMethod,
    memberCount: c.members.length,
  }));

  return {
    result: lines.join("\n"),
    metadata: {
      success: true,
      action: "list_councils",
      count: councils.length,
      councils: summaries,
    },
  };
}

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

/**
 * Clear all councils from the store. Exposed for test isolation.
 */
export function _clearStore() {
  councilStore.clear();
}

/**
 * Get the current size of the council store. Exposed for test assertions.
 *
 * @returns {number}
 */
export function _storeSize() {
  return councilStore.size;
}

// ---------------------------------------------------------------------------
// Main Entry Point
// ---------------------------------------------------------------------------

/**
 * Execute the agent council skill.
 *
 * @param {Object} params
 * @param {string} params.action - create_council, add_member, remove_member, deliberate, vote, get_council, list_councils
 * @param {Object} context - Execution context provided by the runtime
 * @returns {Promise<{result: string, metadata: Object}>}
 */
export async function execute(params, context) {
  const { action } = params;

  if (!action) {
    return {
      result:
        "Error: The 'action' parameter is required. Supported actions: create_council, add_member, remove_member, deliberate, vote, get_council, list_councils.",
      metadata: { success: false, error: "MISSING_ACTION" },
    };
  }

  switch (action) {
    case "create_council":
      return actionCreateCouncil(params);

    case "add_member":
      return actionAddMember(params);

    case "remove_member":
      return actionRemoveMember(params);

    case "deliberate":
      return actionDeliberate(params);

    case "vote":
      return actionVote(params);

    case "get_council":
      return actionGetCouncil(params);

    case "list_councils":
      return actionListCouncils();

    default:
      return {
        result: `Error: Unknown action '${sanitize(String(action))}'. Supported actions: create_council, add_member, remove_member, deliberate, vote, get_council, list_councils.`,
        metadata: { success: false, error: "UNKNOWN_ACTION" },
      };
  }
}
