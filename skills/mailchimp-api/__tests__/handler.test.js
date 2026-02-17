import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import {
  execute,
  getClient,
  providerNotConfiguredError,
  resolveTimeout,
  requestWithTimeout,
  redactSensitive,
  isValidEmail,
  clampLimit,
  validate,
  meta,
  VALID_ACTIONS,
  VALID_CAMPAIGN_STATUSES,
  VALID_CAMPAIGN_TYPES,
  VALID_SUBSCRIBER_STATUSES,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  MAX_QUERY_LENGTH,
  DEFAULT_TIMEOUT_MS,
  MAX_TIMEOUT_MS,
} from '../handler.js';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

/**
 * Build a mock context with a providerClient that returns the given data
 * from its .request() method.
 */
function mockContext(requestResponse, config) {
  return {
    providerClient: {
      request: async (_method, _path, _body, _opts) => requestResponse,
    },
    config: config || { timeoutMs: 5000 },
  };
}

/**
 * Build a mock context where .request() rejects with the given error.
 */
function mockContextError(error) {
  return {
    providerClient: {
      request: async () => { throw error; },
    },
    config: { timeoutMs: 1000 },
  };
}

/**
 * Build a mock context where .request() triggers an AbortError (timeout).
 */
function mockContextTimeout() {
  return {
    providerClient: {
      request: async (_method, _path, _body, opts) => {
        const err = new Error('The operation was aborted');
        err.name = 'AbortError';
        throw err;
      },
    },
    config: { timeoutMs: 100 },
  };
}

/** Sample campaigns list response. */
const sampleCampaignsResponse = {
  campaigns: [
    { id: 'camp_1', status: 'sent', settings: { subject_line: 'Welcome Email' } },
    { id: 'camp_2', status: 'draft', settings: { subject_line: 'Newsletter #5' } },
  ],
  total_items: 2,
};

/** Sample single campaign response. */
const sampleCampaignResponse = {
  id: 'camp_1',
  status: 'sent',
  type: 'regular',
  settings: { subject_line: 'Welcome Email', from_name: 'Acme', reply_to: 'info@acme.com' },
  recipients: { list_id: 'list_abc' },
};

/** Sample audiences response. */
const sampleAudiencesResponse = {
  lists: [
    { id: 'list_1', name: 'Main List', stats: { member_count: 1500 } },
    { id: 'list_2', name: 'VIP List', stats: { member_count: 250 } },
  ],
  total_items: 2,
};

/** Sample subscriber response. */
const sampleSubscriberResponse = {
  id: 'sub_abc123',
  email_address: 'user@example.com',
  status: 'pending',
};

/** Sample campaign report response. */
const sampleReportResponse = {
  id: 'camp_1',
  campaign_title: 'Welcome Email',
  emails_sent: 1000,
  opens: { unique_opens: 450, opens_total: 600 },
  clicks: { unique_clicks: 120, clicks_total: 180 },
  unsubscribed: 5,
  bounces: { hard_bounces: 3, soft_bounces: 12 },
};

/** Sample search members response. */
const sampleSearchResponse = {
  exact_matches: {
    members: [
      { id: 'mem_1', email_address: 'john@example.com', status: 'subscribed' },
    ],
    total_items: 1,
  },
  full_search: {
    members: [],
    total_items: 0,
  },
};

/** Sample create campaign response. */
const sampleCreateCampaignResponse = {
  id: 'camp_new',
  type: 'regular',
  status: 'save',
  settings: { subject_line: 'Test Subject', from_name: 'Tester', reply_to: 'test@example.com' },
  recipients: { list_id: 'list_abc' },
};

// ---------------------------------------------------------------------------
// 1. Action validation
// ---------------------------------------------------------------------------
describe('mailchimp-api: action validation', () => {
  beforeEach(() => {});

  it('should reject invalid action', async () => {
    const result = await execute({ action: 'invalid' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_ACTION');
    assert.ok(result.result.includes('invalid'));
  });

  it('should reject missing action', async () => {
    const result = await execute({}, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_ACTION');
  });

  it('should reject null params', async () => {
    const result = await execute(null, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_ACTION');
  });

  it('should reject undefined params', async () => {
    const result = await execute(undefined, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_ACTION');
  });

  it('should list valid actions in error message', async () => {
    const result = await execute({ action: 'nope' }, {});
    for (const a of VALID_ACTIONS) {
      assert.ok(result.result.includes(a), `Error should mention "${a}"`);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. PROVIDER_NOT_CONFIGURED
// ---------------------------------------------------------------------------
describe('mailchimp-api: PROVIDER_NOT_CONFIGURED', () => {
  beforeEach(() => {});

  it('should fail list_campaigns without client', async () => {
    const result = await execute({ action: 'list_campaigns' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
    assert.equal(result.metadata.error.retriable, false);
  });

  it('should fail get_campaign without client', async () => {
    const result = await execute({ action: 'get_campaign', campaignId: 'abc' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail create_campaign without client', async () => {
    const result = await execute({
      action: 'create_campaign',
      subjectLine: 'Test',
      fromName: 'Me',
      replyTo: 'me@example.com',
      listId: 'list_1',
    }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail list_audiences without client', async () => {
    const result = await execute({ action: 'list_audiences' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail add_subscriber without client', async () => {
    const result = await execute({
      action: 'add_subscriber',
      listId: 'list_1',
      email: 'user@example.com',
    }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail get_campaign_report without client', async () => {
    const result = await execute({ action: 'get_campaign_report', campaignId: 'abc' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail search_members without client', async () => {
    const result = await execute({ action: 'search_members', query: 'john' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });
});

// ---------------------------------------------------------------------------
// 3. list_campaigns action
// ---------------------------------------------------------------------------
describe('mailchimp-api: list_campaigns', () => {
  beforeEach(() => {});

  it('should list campaigns successfully', async () => {
    const ctx = mockContext(sampleCampaignsResponse);
    const result = await execute({ action: 'list_campaigns' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'list_campaigns');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.totalItems, 2);
    assert.equal(result.metadata.count, 2);
    assert.equal(result.metadata.limit, DEFAULT_LIMIT);
    assert.ok(result.result.includes('2 campaign(s)'));
  });

  it('should filter by status', async () => {
    const ctx = mockContext(sampleCampaignsResponse);
    const result = await execute({ action: 'list_campaigns', status: 'sent' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.status, 'sent');
  });

  it('should reject invalid status', async () => {
    const ctx = mockContext(sampleCampaignsResponse);
    const result = await execute({ action: 'list_campaigns', status: 'invalid' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should clamp limit to range', async () => {
    const ctx = mockContext(sampleCampaignsResponse);
    const result = await execute({ action: 'list_campaigns', limit: 200 }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.limit, MAX_LIMIT);
  });

  it('should set null status when not provided', async () => {
    const ctx = mockContext(sampleCampaignsResponse);
    const result = await execute({ action: 'list_campaigns' }, ctx);
    assert.equal(result.metadata.status, null);
  });

  it('should include timestamp', async () => {
    const ctx = mockContext(sampleCampaignsResponse);
    const result = await execute({ action: 'list_campaigns' }, ctx);
    assert.ok(result.metadata.timestamp);
  });

  it('should handle empty campaigns array', async () => {
    const ctx = mockContext({ campaigns: [], total_items: 0 });
    const result = await execute({ action: 'list_campaigns' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.count, 0);
  });
});

// ---------------------------------------------------------------------------
// 4. get_campaign action
// ---------------------------------------------------------------------------
describe('mailchimp-api: get_campaign', () => {
  beforeEach(() => {});

  it('should get campaign details', async () => {
    const ctx = mockContext(sampleCampaignResponse);
    const result = await execute({ action: 'get_campaign', campaignId: 'camp_1' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'get_campaign');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.campaignId, 'camp_1');
    assert.equal(result.metadata.status, 'sent');
    assert.ok(result.result.includes('Welcome Email'));
  });

  it('should reject missing campaignId', async () => {
    const ctx = mockContext(sampleCampaignResponse);
    const result = await execute({ action: 'get_campaign' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject empty campaignId', async () => {
    const ctx = mockContext(sampleCampaignResponse);
    const result = await execute({ action: 'get_campaign', campaignId: '' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject whitespace-only campaignId', async () => {
    const ctx = mockContext(sampleCampaignResponse);
    const result = await execute({ action: 'get_campaign', campaignId: '   ' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should include timestamp', async () => {
    const ctx = mockContext(sampleCampaignResponse);
    const result = await execute({ action: 'get_campaign', campaignId: 'camp_1' }, ctx);
    assert.ok(result.metadata.timestamp);
  });
});

// ---------------------------------------------------------------------------
// 5. create_campaign action
// ---------------------------------------------------------------------------
describe('mailchimp-api: create_campaign', () => {
  beforeEach(() => {});

  it('should create campaign with valid params', async () => {
    const ctx = mockContext(sampleCreateCampaignResponse);
    const result = await execute({
      action: 'create_campaign',
      subjectLine: 'Test Subject',
      fromName: 'Tester',
      replyTo: 'test@example.com',
      listId: 'list_abc',
    }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'create_campaign');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.campaignId, 'camp_new');
    assert.equal(result.metadata.type, 'regular');
    assert.ok(result.result.includes('Campaign created'));
  });

  it('should accept plaintext type', async () => {
    const ctx = mockContext(sampleCreateCampaignResponse);
    const result = await execute({
      action: 'create_campaign',
      type: 'plaintext',
      subjectLine: 'Plain',
      fromName: 'Tester',
      replyTo: 'test@example.com',
      listId: 'list_abc',
    }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.type, 'plaintext');
  });

  it('should reject invalid type', async () => {
    const ctx = mockContext(sampleCreateCampaignResponse);
    const result = await execute({
      action: 'create_campaign',
      type: 'html',
      subjectLine: 'Test',
      fromName: 'Tester',
      replyTo: 'test@example.com',
      listId: 'list_abc',
    }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject missing subjectLine', async () => {
    const ctx = mockContext(sampleCreateCampaignResponse);
    const result = await execute({
      action: 'create_campaign',
      fromName: 'Tester',
      replyTo: 'test@example.com',
      listId: 'list_abc',
    }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject missing fromName', async () => {
    const ctx = mockContext(sampleCreateCampaignResponse);
    const result = await execute({
      action: 'create_campaign',
      subjectLine: 'Test',
      replyTo: 'test@example.com',
      listId: 'list_abc',
    }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject missing replyTo', async () => {
    const ctx = mockContext(sampleCreateCampaignResponse);
    const result = await execute({
      action: 'create_campaign',
      subjectLine: 'Test',
      fromName: 'Tester',
      listId: 'list_abc',
    }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject invalid replyTo email', async () => {
    const ctx = mockContext(sampleCreateCampaignResponse);
    const result = await execute({
      action: 'create_campaign',
      subjectLine: 'Test',
      fromName: 'Tester',
      replyTo: 'not-an-email',
      listId: 'list_abc',
    }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
    assert.ok(result.result.includes('valid email'));
  });

  it('should reject missing listId', async () => {
    const ctx = mockContext(sampleCreateCampaignResponse);
    const result = await execute({
      action: 'create_campaign',
      subjectLine: 'Test',
      fromName: 'Tester',
      replyTo: 'test@example.com',
    }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should include timestamp', async () => {
    const ctx = mockContext(sampleCreateCampaignResponse);
    const result = await execute({
      action: 'create_campaign',
      subjectLine: 'Test',
      fromName: 'Tester',
      replyTo: 'test@example.com',
      listId: 'list_abc',
    }, ctx);
    assert.ok(result.metadata.timestamp);
  });
});

// ---------------------------------------------------------------------------
// 6. list_audiences action
// ---------------------------------------------------------------------------
describe('mailchimp-api: list_audiences', () => {
  beforeEach(() => {});

  it('should list audiences successfully', async () => {
    const ctx = mockContext(sampleAudiencesResponse);
    const result = await execute({ action: 'list_audiences' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'list_audiences');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.totalItems, 2);
    assert.equal(result.metadata.count, 2);
    assert.ok(result.result.includes('2 audience(s)'));
  });

  it('should use custom limit', async () => {
    const ctx = mockContext(sampleAudiencesResponse);
    const result = await execute({ action: 'list_audiences', limit: 10 }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.limit, 10);
  });

  it('should clamp limit above max', async () => {
    const ctx = mockContext(sampleAudiencesResponse);
    const result = await execute({ action: 'list_audiences', limit: 500 }, ctx);
    assert.equal(result.metadata.limit, MAX_LIMIT);
  });

  it('should handle empty lists array', async () => {
    const ctx = mockContext({ lists: [], total_items: 0 });
    const result = await execute({ action: 'list_audiences' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.count, 0);
  });

  it('should include timestamp', async () => {
    const ctx = mockContext(sampleAudiencesResponse);
    const result = await execute({ action: 'list_audiences' }, ctx);
    assert.ok(result.metadata.timestamp);
  });
});

// ---------------------------------------------------------------------------
// 7. add_subscriber action
// ---------------------------------------------------------------------------
describe('mailchimp-api: add_subscriber', () => {
  beforeEach(() => {});

  it('should add subscriber with valid params', async () => {
    const ctx = mockContext(sampleSubscriberResponse);
    const result = await execute({
      action: 'add_subscriber',
      listId: 'list_1',
      email: 'user@example.com',
    }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'add_subscriber');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.subscriberId, 'sub_abc123');
    assert.equal(result.metadata.email, 'user@example.com');
    assert.equal(result.metadata.status, 'pending');
    assert.ok(result.result.includes('Subscriber added'));
  });

  it('should accept subscribed status', async () => {
    const ctx = mockContext(sampleSubscriberResponse);
    const result = await execute({
      action: 'add_subscriber',
      listId: 'list_1',
      email: 'user@example.com',
      status: 'subscribed',
    }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.status, 'subscribed');
  });

  it('should accept unsubscribed status', async () => {
    const ctx = mockContext(sampleSubscriberResponse);
    const result = await execute({
      action: 'add_subscriber',
      listId: 'list_1',
      email: 'user@example.com',
      status: 'unsubscribed',
    }, ctx);
    assert.equal(result.metadata.success, true);
  });

  it('should reject invalid status', async () => {
    const ctx = mockContext(sampleSubscriberResponse);
    const result = await execute({
      action: 'add_subscriber',
      listId: 'list_1',
      email: 'user@example.com',
      status: 'active',
    }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject missing listId', async () => {
    const ctx = mockContext(sampleSubscriberResponse);
    const result = await execute({
      action: 'add_subscriber',
      email: 'user@example.com',
    }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject missing email', async () => {
    const ctx = mockContext(sampleSubscriberResponse);
    const result = await execute({
      action: 'add_subscriber',
      listId: 'list_1',
    }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject invalid email format', async () => {
    const ctx = mockContext(sampleSubscriberResponse);
    const result = await execute({
      action: 'add_subscriber',
      listId: 'list_1',
      email: 'not-an-email',
    }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should accept optional firstName and lastName', async () => {
    let capturedBody = null;
    const ctx = {
      providerClient: {
        request: async (_method, _path, body, _opts) => {
          capturedBody = body;
          return sampleSubscriberResponse;
        },
      },
      config: { timeoutMs: 5000 },
    };
    const result = await execute({
      action: 'add_subscriber',
      listId: 'list_1',
      email: 'user@example.com',
      firstName: 'John',
      lastName: 'Doe',
    }, ctx);
    assert.equal(result.metadata.success, true);
  });

  it('should include timestamp', async () => {
    const ctx = mockContext(sampleSubscriberResponse);
    const result = await execute({
      action: 'add_subscriber',
      listId: 'list_1',
      email: 'user@example.com',
    }, ctx);
    assert.ok(result.metadata.timestamp);
  });
});

// ---------------------------------------------------------------------------
// 8. get_campaign_report action
// ---------------------------------------------------------------------------
describe('mailchimp-api: get_campaign_report', () => {
  beforeEach(() => {});

  it('should get campaign report', async () => {
    const ctx = mockContext(sampleReportResponse);
    const result = await execute({ action: 'get_campaign_report', campaignId: 'camp_1' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'get_campaign_report');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.emailsSent, 1000);
    assert.ok(result.result.includes('Welcome Email'));
    assert.ok(result.result.includes('1000'));
  });

  it('should reject missing campaignId', async () => {
    const ctx = mockContext(sampleReportResponse);
    const result = await execute({ action: 'get_campaign_report' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject empty campaignId', async () => {
    const ctx = mockContext(sampleReportResponse);
    const result = await execute({ action: 'get_campaign_report', campaignId: '' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should include opens and clicks data', async () => {
    const ctx = mockContext(sampleReportResponse);
    const result = await execute({ action: 'get_campaign_report', campaignId: 'camp_1' }, ctx);
    assert.equal(result.metadata.opens.unique_opens, 450);
    assert.equal(result.metadata.clicks.unique_clicks, 120);
    assert.equal(result.metadata.unsubscribed, 5);
  });

  it('should include timestamp', async () => {
    const ctx = mockContext(sampleReportResponse);
    const result = await execute({ action: 'get_campaign_report', campaignId: 'camp_1' }, ctx);
    assert.ok(result.metadata.timestamp);
  });
});

// ---------------------------------------------------------------------------
// 9. search_members action
// ---------------------------------------------------------------------------
describe('mailchimp-api: search_members', () => {
  beforeEach(() => {});

  it('should search members successfully', async () => {
    const ctx = mockContext(sampleSearchResponse);
    const result = await execute({ action: 'search_members', query: 'john' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'search_members');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.query, 'john');
    assert.equal(result.metadata.totalItems, 1);
    assert.ok(result.result.includes('john'));
  });

  it('should accept optional listId', async () => {
    const ctx = mockContext(sampleSearchResponse);
    const result = await execute({ action: 'search_members', query: 'john', listId: 'list_1' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.listId, 'list_1');
  });

  it('should set listId to null when not provided', async () => {
    const ctx = mockContext(sampleSearchResponse);
    const result = await execute({ action: 'search_members', query: 'john' }, ctx);
    assert.equal(result.metadata.listId, null);
  });

  it('should reject missing query', async () => {
    const ctx = mockContext(sampleSearchResponse);
    const result = await execute({ action: 'search_members' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject empty query', async () => {
    const ctx = mockContext(sampleSearchResponse);
    const result = await execute({ action: 'search_members', query: '' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject query exceeding max length', async () => {
    const ctx = mockContext(sampleSearchResponse);
    const longQuery = 'x'.repeat(MAX_QUERY_LENGTH + 1);
    const result = await execute({ action: 'search_members', query: longQuery }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
    assert.ok(result.result.includes(`${MAX_QUERY_LENGTH}`));
  });

  it('should trim query whitespace', async () => {
    const ctx = mockContext(sampleSearchResponse);
    const result = await execute({ action: 'search_members', query: '  john  ' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.query, 'john');
  });

  it('should include timestamp', async () => {
    const ctx = mockContext(sampleSearchResponse);
    const result = await execute({ action: 'search_members', query: 'john' }, ctx);
    assert.ok(result.metadata.timestamp);
  });
});

// ---------------------------------------------------------------------------
// 10. Timeout handling
// ---------------------------------------------------------------------------
describe('mailchimp-api: timeout', () => {
  beforeEach(() => {});

  it('should return TIMEOUT error on list_campaigns abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'list_campaigns' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on get_campaign abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'get_campaign', campaignId: 'abc' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on create_campaign abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({
      action: 'create_campaign',
      subjectLine: 'Test',
      fromName: 'Me',
      replyTo: 'me@example.com',
      listId: 'list_1',
    }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on list_audiences abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'list_audiences' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on add_subscriber abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({
      action: 'add_subscriber',
      listId: 'list_1',
      email: 'user@example.com',
    }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on get_campaign_report abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'get_campaign_report', campaignId: 'abc' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on search_members abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'search_members', query: 'john' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });
});

// ---------------------------------------------------------------------------
// 11. Network error handling
// ---------------------------------------------------------------------------
describe('mailchimp-api: network errors', () => {
  beforeEach(() => {});

  it('should return UPSTREAM_ERROR on list_campaigns failure', async () => {
    const ctx = mockContextError(new Error('Connection refused'));
    const result = await execute({ action: 'list_campaigns' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'UPSTREAM_ERROR');
  });

  it('should return UPSTREAM_ERROR on get_campaign failure', async () => {
    const ctx = mockContextError(new Error('Network down'));
    const result = await execute({ action: 'get_campaign', campaignId: 'abc' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'UPSTREAM_ERROR');
  });

  it('should return UPSTREAM_ERROR on create_campaign failure', async () => {
    const ctx = mockContextError(new Error('Server error'));
    const result = await execute({
      action: 'create_campaign',
      subjectLine: 'Test',
      fromName: 'Me',
      replyTo: 'me@example.com',
      listId: 'list_1',
    }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'UPSTREAM_ERROR');
  });

  it('should return UPSTREAM_ERROR on add_subscriber failure', async () => {
    const ctx = mockContextError(new Error('Bad gateway'));
    const result = await execute({
      action: 'add_subscriber',
      listId: 'list_1',
      email: 'user@example.com',
    }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'UPSTREAM_ERROR');
  });

  it('should return UPSTREAM_ERROR on search_members failure', async () => {
    const ctx = mockContextError(new Error('DNS resolution failed'));
    const result = await execute({ action: 'search_members', query: 'john' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'UPSTREAM_ERROR');
  });

  it('should redact sensitive info in error messages', async () => {
    const ctx = mockContextError(new Error('api_key: sk_live_secret123 failed'));
    const result = await execute({ action: 'list_campaigns' }, ctx);
    assert.ok(!result.result.includes('sk_live_secret123'));
  });
});

// ---------------------------------------------------------------------------
// 12. getClient helper
// ---------------------------------------------------------------------------
describe('mailchimp-api: getClient', () => {
  beforeEach(() => {});

  it('should prefer providerClient over gatewayClient', () => {
    const result = getClient({
      providerClient: { request: () => {} },
      gatewayClient: { request: () => {} },
    });
    assert.equal(result.type, 'provider');
  });

  it('should fall back to gatewayClient', () => {
    const result = getClient({ gatewayClient: { request: () => {} } });
    assert.equal(result.type, 'gateway');
  });

  it('should return null when no client', () => {
    assert.equal(getClient({}), null);
  });

  it('should return null for undefined context', () => {
    assert.equal(getClient(undefined), null);
  });

  it('should return null for null context', () => {
    assert.equal(getClient(null), null);
  });
});

// ---------------------------------------------------------------------------
// 13. redactSensitive
// ---------------------------------------------------------------------------
describe('mailchimp-api: redactSensitive', () => {
  beforeEach(() => {});

  it('should redact api_key patterns', () => {
    const input = 'api_key: sk_live_abc123 data';
    const output = redactSensitive(input);
    assert.ok(!output.includes('sk_live_abc123'));
    assert.ok(output.includes('[REDACTED]'));
  });

  it('should redact bearer token patterns', () => {
    const input = 'bearer: eyJhbGciOiJIUzI1NiJ9.payload';
    const output = redactSensitive(input);
    assert.ok(!output.includes('eyJhbGciOiJIUzI1NiJ9'));
  });

  it('should redact authorization patterns', () => {
    const input = 'authorization=Bearer_dXNlcjpwYXNz';
    const output = redactSensitive(input);
    assert.ok(!output.includes('Bearer_dXNlcjpwYXNz'));
    assert.ok(output.includes('[REDACTED]'));
  });

  it('should redact password patterns', () => {
    const input = 'password=mysecretpass123';
    const output = redactSensitive(input);
    assert.ok(!output.includes('mysecretpass123'));
  });

  it('should not alter clean strings', () => {
    const input = 'Found 5 campaigns with 1000 subscribers';
    assert.equal(redactSensitive(input), input);
  });

  it('should handle non-string input', () => {
    assert.equal(redactSensitive(42), 42);
    assert.equal(redactSensitive(null), null);
    assert.equal(redactSensitive(undefined), undefined);
  });
});

// ---------------------------------------------------------------------------
// 14. isValidEmail helper
// ---------------------------------------------------------------------------
describe('mailchimp-api: isValidEmail', () => {
  beforeEach(() => {});

  it('should accept valid email', () => {
    assert.equal(isValidEmail('user@example.com'), true);
  });

  it('should accept email with subdomain', () => {
    assert.equal(isValidEmail('user@mail.example.com'), true);
  });

  it('should accept email with plus sign', () => {
    assert.equal(isValidEmail('user+tag@example.com'), true);
  });

  it('should accept email with dots in local part', () => {
    assert.equal(isValidEmail('first.last@example.com'), true);
  });

  it('should reject missing @ sign', () => {
    assert.equal(isValidEmail('userexample.com'), false);
  });

  it('should reject missing domain', () => {
    assert.equal(isValidEmail('user@'), false);
  });

  it('should reject missing local part', () => {
    assert.equal(isValidEmail('@example.com'), false);
  });

  it('should reject empty string', () => {
    assert.equal(isValidEmail(''), false);
  });

  it('should reject null', () => {
    assert.equal(isValidEmail(null), false);
  });

  it('should reject undefined', () => {
    assert.equal(isValidEmail(undefined), false);
  });

  it('should reject number', () => {
    assert.equal(isValidEmail(42), false);
  });

  it('should reject string with spaces', () => {
    assert.equal(isValidEmail('user @example.com'), false);
  });

  it('should reject missing TLD', () => {
    assert.equal(isValidEmail('user@example'), false);
  });
});

// ---------------------------------------------------------------------------
// 15. clampLimit helper
// ---------------------------------------------------------------------------
describe('mailchimp-api: clampLimit', () => {
  beforeEach(() => {});

  it('should default to DEFAULT_LIMIT for undefined', () => {
    assert.equal(clampLimit(undefined), DEFAULT_LIMIT);
  });

  it('should default to DEFAULT_LIMIT for null', () => {
    assert.equal(clampLimit(null), DEFAULT_LIMIT);
  });

  it('should accept valid limit', () => {
    assert.equal(clampLimit(50), 50);
  });

  it('should clamp to MAX_LIMIT when above', () => {
    assert.equal(clampLimit(200), MAX_LIMIT);
  });

  it('should clamp to MIN_LIMIT when below', () => {
    assert.equal(clampLimit(0), 1);
  });

  it('should clamp negative to MIN_LIMIT', () => {
    assert.equal(clampLimit(-5), 1);
  });

  it('should floor decimal values', () => {
    assert.equal(clampLimit(25.9), 25);
  });

  it('should handle string numbers', () => {
    assert.equal(clampLimit('50'), 50);
  });
});

// ---------------------------------------------------------------------------
// 16. resolveTimeout helper
// ---------------------------------------------------------------------------
describe('mailchimp-api: resolveTimeout', () => {
  beforeEach(() => {});

  it('should return default timeout when not configured', () => {
    assert.equal(resolveTimeout({}), DEFAULT_TIMEOUT_MS);
  });

  it('should return default for undefined context', () => {
    assert.equal(resolveTimeout(undefined), DEFAULT_TIMEOUT_MS);
  });

  it('should respect configured timeout', () => {
    assert.equal(resolveTimeout({ config: { timeoutMs: 10000 } }), 10000);
  });

  it('should cap at MAX_TIMEOUT_MS', () => {
    assert.equal(resolveTimeout({ config: { timeoutMs: 999999 } }), MAX_TIMEOUT_MS);
  });

  it('should use default for zero timeout', () => {
    assert.equal(resolveTimeout({ config: { timeoutMs: 0 } }), DEFAULT_TIMEOUT_MS);
  });

  it('should use default for negative timeout', () => {
    assert.equal(resolveTimeout({ config: { timeoutMs: -100 } }), DEFAULT_TIMEOUT_MS);
  });
});

// ---------------------------------------------------------------------------
// 17. validate function
// ---------------------------------------------------------------------------
describe('mailchimp-api: validate', () => {
  beforeEach(() => {});

  it('should reject invalid action', () => {
    const result = validate({ action: 'nope' });
    assert.equal(result.valid, false);
    assert.ok(result.error);
  });

  it('should reject null params', () => {
    const result = validate(null);
    assert.equal(result.valid, false);
  });

  it('should accept valid list_campaigns', () => {
    assert.equal(validate({ action: 'list_campaigns' }).valid, true);
  });

  it('should reject invalid status for list_campaigns', () => {
    const result = validate({ action: 'list_campaigns', status: 'bad' });
    assert.equal(result.valid, false);
  });

  it('should accept valid get_campaign', () => {
    assert.equal(validate({ action: 'get_campaign', campaignId: 'abc' }).valid, true);
  });

  it('should reject get_campaign without campaignId', () => {
    const result = validate({ action: 'get_campaign' });
    assert.equal(result.valid, false);
  });

  it('should accept valid create_campaign', () => {
    const result = validate({
      action: 'create_campaign',
      subjectLine: 'Test',
      fromName: 'Me',
      replyTo: 'me@example.com',
      listId: 'list_1',
    });
    assert.equal(result.valid, true);
  });

  it('should reject create_campaign without subjectLine', () => {
    const result = validate({
      action: 'create_campaign',
      fromName: 'Me',
      replyTo: 'me@example.com',
      listId: 'list_1',
    });
    assert.equal(result.valid, false);
  });

  it('should reject create_campaign with invalid replyTo', () => {
    const result = validate({
      action: 'create_campaign',
      subjectLine: 'Test',
      fromName: 'Me',
      replyTo: 'not-email',
      listId: 'list_1',
    });
    assert.equal(result.valid, false);
  });

  it('should reject create_campaign with invalid type', () => {
    const result = validate({
      action: 'create_campaign',
      type: 'html',
      subjectLine: 'Test',
      fromName: 'Me',
      replyTo: 'me@example.com',
      listId: 'list_1',
    });
    assert.equal(result.valid, false);
  });

  it('should accept valid add_subscriber', () => {
    const result = validate({
      action: 'add_subscriber',
      listId: 'list_1',
      email: 'user@example.com',
    });
    assert.equal(result.valid, true);
  });

  it('should reject add_subscriber with invalid email', () => {
    const result = validate({
      action: 'add_subscriber',
      listId: 'list_1',
      email: 'bad',
    });
    assert.equal(result.valid, false);
  });

  it('should reject add_subscriber with invalid status', () => {
    const result = validate({
      action: 'add_subscriber',
      listId: 'list_1',
      email: 'user@example.com',
      status: 'active',
    });
    assert.equal(result.valid, false);
  });

  it('should accept valid get_campaign_report', () => {
    assert.equal(validate({ action: 'get_campaign_report', campaignId: 'abc' }).valid, true);
  });

  it('should reject get_campaign_report without campaignId', () => {
    assert.equal(validate({ action: 'get_campaign_report' }).valid, false);
  });

  it('should accept valid search_members', () => {
    assert.equal(validate({ action: 'search_members', query: 'john' }).valid, true);
  });

  it('should reject search_members without query', () => {
    assert.equal(validate({ action: 'search_members' }).valid, false);
  });

  it('should reject search_members with too long query', () => {
    const result = validate({ action: 'search_members', query: 'x'.repeat(MAX_QUERY_LENGTH + 1) });
    assert.equal(result.valid, false);
  });

  it('should accept valid list_audiences', () => {
    assert.equal(validate({ action: 'list_audiences' }).valid, true);
  });
});

// ---------------------------------------------------------------------------
// 18. meta export
// ---------------------------------------------------------------------------
describe('mailchimp-api: meta', () => {
  beforeEach(() => {});

  it('should export meta object', () => {
    assert.ok(meta);
    assert.equal(typeof meta, 'object');
  });

  it('should have correct name', () => {
    assert.equal(meta.name, 'mailchimp-api');
  });

  it('should have version', () => {
    assert.equal(meta.version, '1.0.0');
  });

  it('should have description', () => {
    assert.ok(meta.description);
    assert.ok(meta.description.length > 0);
  });

  it('should list all 7 actions', () => {
    assert.equal(meta.actions.length, 7);
    assert.ok(meta.actions.includes('list_campaigns'));
    assert.ok(meta.actions.includes('get_campaign'));
    assert.ok(meta.actions.includes('create_campaign'));
    assert.ok(meta.actions.includes('list_audiences'));
    assert.ok(meta.actions.includes('add_subscriber'));
    assert.ok(meta.actions.includes('get_campaign_report'));
    assert.ok(meta.actions.includes('search_members'));
  });
});

// ---------------------------------------------------------------------------
// 19. requestWithTimeout direct tests
// ---------------------------------------------------------------------------
describe('mailchimp-api: requestWithTimeout', () => {
  beforeEach(() => {});

  it('should return response on success', async () => {
    const client = { request: async () => ({ ok: true }) };
    const result = await requestWithTimeout(client, 'GET', '/test', {}, 5000);
    assert.deepEqual(result, { ok: true });
  });

  it('should throw TIMEOUT on abort', async () => {
    const client = {
      request: async () => {
        const err = new Error('aborted');
        err.name = 'AbortError';
        throw err;
      },
    };
    try {
      await requestWithTimeout(client, 'GET', '/test', {}, 5000);
      assert.fail('Should have thrown');
    } catch (err) {
      assert.equal(err.code, 'TIMEOUT');
    }
  });

  it('should throw UPSTREAM_ERROR on other errors', async () => {
    const client = {
      request: async () => { throw new Error('Connection failed'); },
    };
    try {
      await requestWithTimeout(client, 'GET', '/test', {}, 5000);
      assert.fail('Should have thrown');
    } catch (err) {
      assert.equal(err.code, 'UPSTREAM_ERROR');
      assert.ok(err.message.includes('Connection failed'));
    }
  });
});

// ---------------------------------------------------------------------------
// 20. providerNotConfiguredError direct test
// ---------------------------------------------------------------------------
describe('mailchimp-api: providerNotConfiguredError', () => {
  beforeEach(() => {});

  it('should return correct structure', () => {
    const result = providerNotConfiguredError();
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
    assert.equal(result.metadata.error.retriable, false);
    assert.ok(result.result.includes('Provider client required'));
  });
});

// ---------------------------------------------------------------------------
// 21. gatewayClient fallback
// ---------------------------------------------------------------------------
describe('mailchimp-api: gatewayClient fallback', () => {
  beforeEach(() => {});

  it('should use gatewayClient when providerClient is absent', async () => {
    let calledMethod = null;
    let calledPath = null;
    const ctx = {
      gatewayClient: {
        request: async (method, path, _body, _opts) => {
          calledMethod = method;
          calledPath = path;
          return sampleCampaignsResponse;
        },
      },
      config: { timeoutMs: 5000 },
    };
    const result = await execute({ action: 'list_campaigns' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(calledMethod, 'GET');
    assert.ok(calledPath.includes('/campaigns'));
  });
});

// ---------------------------------------------------------------------------
// 22. Path verification
// ---------------------------------------------------------------------------
describe('mailchimp-api: path routing', () => {
  beforeEach(() => {});

  it('should call /campaigns for list_campaigns', async () => {
    let calledPath = null;
    const ctx = {
      providerClient: {
        request: async (_m, path) => { calledPath = path; return sampleCampaignsResponse; },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'list_campaigns' }, ctx);
    assert.ok(calledPath.startsWith('/campaigns'));
  });

  it('should call /campaigns/{id} for get_campaign', async () => {
    let calledPath = null;
    const ctx = {
      providerClient: {
        request: async (_m, path) => { calledPath = path; return sampleCampaignResponse; },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'get_campaign', campaignId: 'camp_1' }, ctx);
    assert.equal(calledPath, '/campaigns/camp_1');
  });

  it('should call /campaigns for create_campaign with POST', async () => {
    let calledMethod = null;
    let calledPath = null;
    const ctx = {
      providerClient: {
        request: async (m, path) => { calledMethod = m; calledPath = path; return sampleCreateCampaignResponse; },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({
      action: 'create_campaign',
      subjectLine: 'Test',
      fromName: 'Me',
      replyTo: 'me@example.com',
      listId: 'list_1',
    }, ctx);
    assert.equal(calledMethod, 'POST');
    assert.equal(calledPath, '/campaigns');
  });

  it('should call /lists for list_audiences', async () => {
    let calledPath = null;
    const ctx = {
      providerClient: {
        request: async (_m, path) => { calledPath = path; return sampleAudiencesResponse; },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'list_audiences' }, ctx);
    assert.ok(calledPath.startsWith('/lists'));
  });

  it('should call /lists/{id}/members for add_subscriber with POST', async () => {
    let calledMethod = null;
    let calledPath = null;
    const ctx = {
      providerClient: {
        request: async (m, path) => { calledMethod = m; calledPath = path; return sampleSubscriberResponse; },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({
      action: 'add_subscriber',
      listId: 'list_1',
      email: 'user@example.com',
    }, ctx);
    assert.equal(calledMethod, 'POST');
    assert.equal(calledPath, '/lists/list_1/members');
  });

  it('should call /reports/{id} for get_campaign_report', async () => {
    let calledPath = null;
    const ctx = {
      providerClient: {
        request: async (_m, path) => { calledPath = path; return sampleReportResponse; },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'get_campaign_report', campaignId: 'camp_1' }, ctx);
    assert.equal(calledPath, '/reports/camp_1');
  });

  it('should call /search-members for search_members', async () => {
    let calledPath = null;
    const ctx = {
      providerClient: {
        request: async (_m, path) => { calledPath = path; return sampleSearchResponse; },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'search_members', query: 'john' }, ctx);
    assert.ok(calledPath.startsWith('/search-members'));
    assert.ok(calledPath.includes('query=john'));
  });
});
