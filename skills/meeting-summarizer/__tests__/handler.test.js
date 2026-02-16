import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { execute } from "../handler.js";

// ---------------------------------------------------------------------------
// Sample Transcripts
// ---------------------------------------------------------------------------

const LABELED_TRANSCRIPT = `[10:00] Alice: Welcome everyone. Let's get started with the weekly standup.
[10:02] Bob: I completed the API integration yesterday and started on unit tests.
[10:04] Carol: I'm still working on the frontend redesign. Should be done by Wednesday.
[10:06] Alice: Great progress. Any blockers?
[10:07] Bob: I need access to the staging database. Can someone help with that?
[10:08] Carol: I'll take care of the staging database access for Bob.
[10:09] Alice: Thanks Carol. Let's also discuss the Q3 roadmap.
[10:11] Bob: I think we should focus on the mobile app first.
[10:12] Carol: Agreed, the mobile app is the top priority.
[10:13] Alice: Okay, we decided to prioritize the mobile app for Q3.
[10:14] Alice: Bob, will you prepare the technical design document by Friday?
[10:15] Bob: Yes, I will prepare the technical design document by Friday.
[10:16] Alice: Carol, please follow up with the design team about the new mockups.
[10:17] Carol: Sure, I'll follow up with them today.
[10:18] Alice: Great meeting everyone. Let's reconvene next Monday.`;

const UNLABELED_TRANSCRIPT = `Welcome everyone to the project kickoff meeting.
Today we will discuss the timeline and deliverables.
The first milestone is set for March 15th.
We need to finalize the requirements by next week.
The budget has been approved for the initial phase.
Let's make sure everyone has access to the shared documents.
Any questions about the project scope?
No? Great, let's move forward with the plan.`;

const ACTION_HEAVY_TRANSCRIPT = `Alice: Let's review the action items from today.
Alice: Action item: Bob needs to update the documentation by Monday.
Bob: I will send the updated API specs to the team.
Carol: I'll take care of the deployment scripts. It's urgent, needs to be done ASAP.
Alice: Bob, please follow up on the client feedback.
Dave: I should review the security audit report this week.
Alice: Dave is responsible for the compliance check. Due by next Friday.
Bob: TODO: fix the broken CI pipeline.
Carol: I will create the test plan by Wednesday.
Alice: Assigned to Dave: review the vendor proposals.`;

const DECISION_TRANSCRIPT = `Alice: We need to choose a framework for the new project.
Bob: I suggest we use React. It has better community support.
Carol: I agree, but what about Vue?
Alice: After discussion, we decided to go with React for the frontend.
Bob: What about the backend?
Carol: I think Node.js is the way to go.
Alice: Agreed, we'll go with Node.js for the backend services.
Bob: Should we use PostgreSQL or MongoDB?
Carol: PostgreSQL seems more reliable for our use case.
Alice: Final decision: we will use PostgreSQL as our primary database.
Bob: What about the deployment platform?
Alice: Let's go with AWS. The team has the most experience there.
Carol: Approved. AWS it is.
Alice: The consensus is that we launch in Q2 rather than Q1.`;

const IMBALANCED_TRANSCRIPT = `Alice: I have a lot to cover today so let me walk through everything.
Alice: First, the quarterly results are in and they look promising overall.
Alice: Revenue is up fifteen percent compared to last quarter which is great news.
Alice: The customer satisfaction scores have also improved significantly.
Alice: We launched three new features last month and adoption rates are good.
Alice: The engineering team has been doing excellent work on performance.
Alice: I also want to discuss the upcoming product roadmap changes.
Alice: We are planning to deprecate the legacy API by end of year.
Alice: The new mobile app release is scheduled for next month.
Alice: Marketing has started the campaign for the product launch.
Bob: Sounds good.
Carol: Agreed.`;

const EMPTY_TRANSCRIPT = "";
const WHITESPACE_TRANSCRIPT = "   \n  \n   ";

const NO_ACTIONS_TRANSCRIPT = `Alice: The weather is nice today.
Bob: Yes, it's a beautiful day.
Carol: I had a good lunch.
Alice: Same here. How's everyone doing?
Bob: Good, thanks for asking.`;

const SINGLE_SPEAKER_TRANSCRIPT = `Alice: Welcome to my presentation.
Alice: Today I will cover three main topics.
Alice: First, let's talk about our growth metrics.
Alice: Second, we'll review the product roadmap.
Alice: Third, we'll discuss team expansion plans.`;

const TIMESTAMP_AMPM_TRANSCRIPT = `[9:00 AM] Alice: Good morning everyone.
[9:15 AM] Bob: Let's get started.
[10:30 AM] Alice: That wraps up our discussion.`;

// ---------------------------------------------------------------------------
// summarize action
// ---------------------------------------------------------------------------

describe("meeting-summarizer: summarize", () => {
  it("should summarize a labeled transcript with participants and topics", async () => {
    const result = await execute(
      { action: "summarize", transcript: LABELED_TRANSCRIPT },
      {}
    );

    assert.ok(result.metadata.success);
    assert.equal(result.metadata.action, "summarize");
    assert.ok(result.metadata.participantCount >= 3, "Should find at least 3 participants");
    assert.ok(result.result.includes("Meeting Summary"));
    assert.ok(result.result.includes("Alice"));
    assert.ok(result.result.includes("Bob"));
    assert.ok(result.result.includes("Carol"));
  });

  it("should estimate duration from timestamps", async () => {
    const result = await execute(
      { action: "summarize", transcript: LABELED_TRANSCRIPT },
      {}
    );

    assert.ok(result.metadata.success);
    assert.ok(result.metadata.duration !== null, "Duration should be estimated");
    assert.ok(result.metadata.duration > 0, "Duration should be positive");
  });

  it("should handle AM/PM timestamps", async () => {
    const result = await execute(
      { action: "summarize", transcript: TIMESTAMP_AMPM_TRANSCRIPT },
      {}
    );

    assert.ok(result.metadata.success);
    assert.ok(result.metadata.duration !== null, "Duration should be estimated from AM/PM timestamps");
    assert.ok(result.metadata.duration > 0, "Duration should be positive");
  });

  it("should handle transcript without speaker labels", async () => {
    const result = await execute(
      { action: "summarize", transcript: UNLABELED_TRANSCRIPT },
      {}
    );

    assert.ok(result.metadata.success);
    assert.equal(result.metadata.participantCount, 0);
    assert.ok(result.result.includes("Unable to identify"));
  });

  it("should detect overall tone", async () => {
    const result = await execute(
      { action: "summarize", transcript: LABELED_TRANSCRIPT },
      {}
    );

    assert.ok(result.metadata.success);
    assert.ok(typeof result.metadata.tone === "string");
    assert.ok(result.metadata.tone.length > 0);
  });

  it("should report word count and line count", async () => {
    const result = await execute(
      { action: "summarize", transcript: LABELED_TRANSCRIPT },
      {}
    );

    assert.ok(result.metadata.wordCount > 0, "Word count should be positive");
    assert.ok(result.metadata.lineCount > 0, "Line count should be positive");
  });
});

// ---------------------------------------------------------------------------
// extract_actions action
// ---------------------------------------------------------------------------

describe("meeting-summarizer: extract_actions", () => {
  it("should extract multiple action items from action-heavy transcript", async () => {
    const result = await execute(
      { action: "extract_actions", transcript: ACTION_HEAVY_TRANSCRIPT },
      {}
    );

    assert.ok(result.metadata.success);
    assert.equal(result.metadata.action, "extract_actions");
    assert.ok(result.metadata.actionCount >= 5, `Expected >= 5 actions but got ${result.metadata.actionCount}`);
    assert.ok(result.result.includes("Action Items"));
  });

  it("should include assignee for each action item", async () => {
    const result = await execute(
      { action: "extract_actions", transcript: ACTION_HEAVY_TRANSCRIPT },
      {}
    );

    for (const action of result.metadata.actions) {
      assert.ok(typeof action.assignee === "string", "Each action should have an assignee");
      assert.ok(action.assignee.length > 0, "Assignee should not be empty");
    }
  });

  it("should detect deadlines when present", async () => {
    const result = await execute(
      { action: "extract_actions", transcript: ACTION_HEAVY_TRANSCRIPT },
      {}
    );

    const withDeadlines = result.metadata.actions.filter((a) => a.deadline);
    assert.ok(withDeadlines.length > 0, "Should find at least one action with a deadline");
  });

  it("should detect priority when present", async () => {
    const result = await execute(
      { action: "extract_actions", transcript: ACTION_HEAVY_TRANSCRIPT },
      {}
    );

    const withPriority = result.metadata.actions.filter((a) => a.priority);
    assert.ok(withPriority.length > 0, "Should find at least one action with priority");
    // Carol's task is marked urgent/ASAP
    const highPriority = result.metadata.actions.filter((a) => a.priority === "high");
    assert.ok(highPriority.length > 0, "Should find at least one high-priority action");
  });

  it("should return empty array when no actions found", async () => {
    const result = await execute(
      { action: "extract_actions", transcript: NO_ACTIONS_TRANSCRIPT },
      {}
    );

    assert.ok(result.metadata.success);
    assert.equal(result.metadata.actionCount, 0);
    assert.deepEqual(result.metadata.actions, []);
    assert.ok(result.result.includes("No action items found"));
  });

  it("should extract actions from labeled transcript", async () => {
    const result = await execute(
      { action: "extract_actions", transcript: LABELED_TRANSCRIPT },
      {}
    );

    assert.ok(result.metadata.success);
    assert.ok(result.metadata.actionCount > 0, "Should find action items in the labeled transcript");
  });
});

// ---------------------------------------------------------------------------
// extract_decisions action
// ---------------------------------------------------------------------------

describe("meeting-summarizer: extract_decisions", () => {
  it("should extract multiple decisions from decision-heavy transcript", async () => {
    const result = await execute(
      { action: "extract_decisions", transcript: DECISION_TRANSCRIPT },
      {}
    );

    assert.ok(result.metadata.success);
    assert.equal(result.metadata.action, "extract_decisions");
    assert.ok(result.metadata.decisionCount >= 3, `Expected >= 3 decisions but got ${result.metadata.decisionCount}`);
    assert.ok(result.result.includes("Decisions Made"));
  });

  it("should include context for decisions when available", async () => {
    const result = await execute(
      { action: "extract_decisions", transcript: DECISION_TRANSCRIPT },
      {}
    );

    const withContext = result.metadata.decisions.filter((d) => d.context);
    assert.ok(withContext.length > 0, "Should find at least one decision with context");
  });

  it("should include participants for decisions", async () => {
    const result = await execute(
      { action: "extract_decisions", transcript: DECISION_TRANSCRIPT },
      {}
    );

    const withParticipants = result.metadata.decisions.filter(
      (d) => d.participants && d.participants.length > 0
    );
    assert.ok(withParticipants.length > 0, "Should find at least one decision with participants");
  });

  it("should return empty array when no decisions found", async () => {
    const result = await execute(
      { action: "extract_decisions", transcript: NO_ACTIONS_TRANSCRIPT },
      {}
    );

    assert.ok(result.metadata.success);
    assert.equal(result.metadata.decisionCount, 0);
    assert.ok(result.result.includes("No decisions found"));
  });
});

// ---------------------------------------------------------------------------
// generate_minutes action
// ---------------------------------------------------------------------------

describe("meeting-summarizer: generate_minutes", () => {
  it("should generate full meeting minutes with all sections", async () => {
    const result = await execute(
      { action: "generate_minutes", transcript: LABELED_TRANSCRIPT },
      {}
    );

    assert.ok(result.metadata.success);
    assert.equal(result.metadata.action, "generate_minutes");
    assert.ok(result.result.includes("# Meeting Minutes"), "Should have title");
    assert.ok(result.result.includes("## Attendees"), "Should have Attendees section");
    assert.ok(result.result.includes("## Agenda"), "Should have Agenda section");
    assert.ok(result.result.includes("## Discussion"), "Should have Discussion section");
    assert.ok(result.result.includes("## Decisions"), "Should have Decisions section");
    assert.ok(result.result.includes("## Action Items"), "Should have Action Items section");
    assert.ok(result.result.includes("## Next Steps"), "Should have Next Steps section");
  });

  it("should include participant count in metadata", async () => {
    const result = await execute(
      { action: "generate_minutes", transcript: LABELED_TRANSCRIPT },
      {}
    );

    assert.ok(result.metadata.participantCount >= 3);
    assert.ok(typeof result.metadata.decisionCount === "number");
    assert.ok(typeof result.metadata.actionCount === "number");
  });

  it("should handle unlabeled transcript gracefully", async () => {
    const result = await execute(
      { action: "generate_minutes", transcript: UNLABELED_TRANSCRIPT },
      {}
    );

    assert.ok(result.metadata.success);
    assert.ok(result.result.includes("# Meeting Minutes"));
    assert.equal(result.metadata.participantCount, 0);
  });

  it("should produce markdown formatted output", async () => {
    const result = await execute(
      { action: "generate_minutes", transcript: LABELED_TRANSCRIPT },
      {}
    );

    // Check for markdown formatting
    assert.ok(result.result.includes("**"), "Should contain bold markdown");
    assert.ok(result.result.includes("##"), "Should contain markdown headings");
  });
});

// ---------------------------------------------------------------------------
// analyze_participation action
// ---------------------------------------------------------------------------

describe("meeting-summarizer: analyze_participation", () => {
  it("should analyze participation with percentages", async () => {
    const result = await execute(
      { action: "analyze_participation", transcript: LABELED_TRANSCRIPT },
      {}
    );

    assert.ok(result.metadata.success);
    assert.equal(result.metadata.action, "analyze_participation");
    assert.ok(result.metadata.speakerCount >= 3);
    assert.ok(result.metadata.totalWords > 0);
    assert.ok(result.result.includes("Participation Analysis"));
    assert.ok(result.result.includes("Speaker Breakdown"));
  });

  it("should identify dominant and quiet speakers", async () => {
    const result = await execute(
      { action: "analyze_participation", transcript: IMBALANCED_TRANSCRIPT },
      {}
    );

    assert.ok(result.metadata.success);
    assert.equal(result.metadata.dominant, "Alice");
    assert.ok(result.metadata.speakers["Alice"].wordPercent > 80, "Alice should have >80% of words");
    assert.ok(result.result.includes("Most active"));
    assert.ok(result.result.includes("dominated"));
  });

  it("should handle transcript without speaker labels", async () => {
    const result = await execute(
      { action: "analyze_participation", transcript: UNLABELED_TRANSCRIPT },
      {}
    );

    assert.ok(result.metadata.success);
    assert.equal(result.metadata.speakerCount, 0);
    assert.ok(result.result.includes("No speaker labels found"));
  });

  it("should handle single speaker transcript", async () => {
    const result = await execute(
      { action: "analyze_participation", transcript: SINGLE_SPEAKER_TRANSCRIPT },
      {}
    );

    assert.ok(result.metadata.success);
    assert.equal(result.metadata.speakerCount, 1);
    assert.ok(result.result.includes("Only one speaker identified"));
  });

  it("should include word count per speaker in metadata", async () => {
    const result = await execute(
      { action: "analyze_participation", transcript: LABELED_TRANSCRIPT },
      {}
    );

    assert.ok(result.metadata.speakers);
    for (const [speaker, data] of Object.entries(result.metadata.speakers)) {
      assert.ok(typeof data.words === "number", `${speaker} should have word count`);
      assert.ok(typeof data.lines === "number", `${speaker} should have line count`);
      assert.ok(typeof data.wordPercent === "number", `${speaker} should have word percent`);
    }
  });
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

describe("meeting-summarizer: error handling", () => {
  it("should return error for missing action", async () => {
    const result = await execute({ transcript: "test" }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, "MISSING_ACTION");
  });

  it("should return error for unknown action", async () => {
    const result = await execute(
      { action: "invalid_action", transcript: "test" },
      {}
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, "UNKNOWN_ACTION");
    assert.ok(result.result.includes("Unknown action"));
  });

  it("should return error for missing transcript", async () => {
    const result = await execute({ action: "summarize" }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, "MISSING_TRANSCRIPT");
  });

  it("should return error for empty transcript", async () => {
    const result = await execute(
      { action: "summarize", transcript: EMPTY_TRANSCRIPT },
      {}
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, "MISSING_TRANSCRIPT");
  });

  it("should return error for whitespace-only transcript", async () => {
    const result = await execute(
      { action: "summarize", transcript: WHITESPACE_TRANSCRIPT },
      {}
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, "MISSING_TRANSCRIPT");
  });

  it("should return error for non-string transcript", async () => {
    const result = await execute(
      { action: "summarize", transcript: 12345 },
      {}
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, "MISSING_TRANSCRIPT");
  });

  it("should sanitize HTML/script tags from input", async () => {
    const malicious = `Alice: Hello <script>alert('xss')</script> everyone.
Bob: We decided to proceed with the plan.`;
    const result = await execute(
      { action: "summarize", transcript: malicious },
      {}
    );

    assert.ok(result.metadata.success);
    assert.ok(!result.result.includes("<script>"), "Should strip script tags");
    assert.ok(!result.result.includes("alert("), "Should strip script content");
  });
});
