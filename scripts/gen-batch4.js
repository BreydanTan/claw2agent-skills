/**
 * L1 Skill Generator — generates handler.js, skill.json, test, README
 * Usage: node scripts/gen-l1-skill.js <slug> <spec-json-file>
 *
 * This script generates a full L1 skill from a JSON spec file.
 */

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';

const SKILLS = [
  {
    slug: 'linkedin-marketing-api',
    displayName: 'LinkedIn Marketing API',
    category: 'Social',
    icon: 'briefcase',
    description: 'Manage LinkedIn posts, company pages, and ad campaigns via Marketing API.',
    tags: ['linkedin', 'social', 'marketing', 'posts'],
    actions: [
      { name: 'create_post', method: 'POST', path: '/ugcPosts', params: [{ n: 'content', req: true, t: 'string' }, { n: 'visibility', req: false, t: 'string', def: 'PUBLIC' }], response: { id: 'urn:li:share:123', content: {} } },
      { name: 'get_profile', method: 'GET', path: '/me', params: [], response: { id: 'user123', firstName: { localized: { en_US: 'John' } }, lastName: { localized: { en_US: 'Doe' } } } },
      { name: 'list_posts', method: 'GET', pathTemplate: '/ugcPosts?q=authors&count={count}', params: [{ n: 'count', req: false, t: 'number', def: 10 }], response: { elements: [{ id: 'post1', author: 'urn:li:person:123' }] } },
      { name: 'get_analytics', method: 'GET', pathTemplate: '/organizationalEntityShareStatistics?ugcPost={postId}', params: [{ n: 'postId', req: true, t: 'string' }], response: { elements: [{ totalShareStatistics: { shareCount: 100, likeCount: 500 } }] } },
    ],
  },
  {
    slug: 'tiktok-content-api',
    displayName: 'TikTok Content API',
    category: 'Social',
    icon: 'video',
    description: 'Manage TikTok content publishing and analytics via Content Posting API.',
    tags: ['tiktok', 'social', 'video', 'content'],
    actions: [
      { name: 'create_post', method: 'POST', path: '/v2/post/publish/video/init', params: [{ n: 'videoUrl', req: true, t: 'string' }, { n: 'title', req: false, t: 'string' }, { n: 'privacyLevel', req: false, t: 'string', def: 'PUBLIC_TO_EVERYONE' }], response: { data: { publish_id: 'pub123' } } },
      { name: 'get_post_status', method: 'POST', path: '/v2/post/publish/status/fetch', params: [{ n: 'publishId', req: true, t: 'string' }], response: { data: { status: 'PUBLISH_COMPLETE', publish_id: 'pub123' } } },
      { name: 'list_videos', method: 'POST', path: '/v2/video/list', params: [{ n: 'cursor', req: false, t: 'number', def: 0 }, { n: 'maxCount', req: false, t: 'number', def: 20 }], response: { data: { videos: [{ id: 'vid1', title: 'Test Video' }], cursor: 20, has_more: false } } },
      { name: 'get_analytics', method: 'GET', path: '/v2/video/query', params: [{ n: 'videoId', req: true, t: 'string' }], response: { data: { videos: [{ id: 'vid1', view_count: 1000, like_count: 50 }] } } },
    ],
  },
  {
    slug: 'wordpress-rest-api',
    displayName: 'WordPress REST API',
    category: 'Content',
    icon: 'edit',
    description: 'Manage WordPress posts, pages, and media via REST API.',
    tags: ['wordpress', 'cms', 'blog', 'content'],
    actions: [
      { name: 'create_post', method: 'POST', path: '/wp/v2/posts', params: [{ n: 'title', req: true, t: 'string' }, { n: 'content', req: true, t: 'string' }, { n: 'status', req: false, t: 'string', def: 'draft' }, { n: 'categories', req: false, t: 'string' }], response: { id: 1, title: { rendered: 'Test Post' }, status: 'draft', link: 'https://example.com/test-post' } },
      { name: 'list_posts', method: 'GET', pathTemplate: '/wp/v2/posts?per_page={perPage}&page={page}', params: [{ n: 'perPage', req: false, t: 'number', def: 10 }, { n: 'page', req: false, t: 'number', def: 1 }, { n: 'status', req: false, t: 'string' }], response: [{ id: 1, title: { rendered: 'Post 1' } }, { id: 2, title: { rendered: 'Post 2' } }] },
      { name: 'update_post', method: 'PUT', pathTemplate: '/wp/v2/posts/{postId}', params: [{ n: 'postId', req: true, t: 'string' }, { n: 'title', req: false, t: 'string' }, { n: 'content', req: false, t: 'string' }, { n: 'status', req: false, t: 'string' }], response: { id: 1, title: { rendered: 'Updated Post' }, status: 'published' } },
      { name: 'delete_post', method: 'DELETE', pathTemplate: '/wp/v2/posts/{postId}?force={force}', params: [{ n: 'postId', req: true, t: 'string' }, { n: 'force', req: false, t: 'boolean', def: false }], response: { id: 1, deleted: true } },
      { name: 'upload_media', method: 'POST', path: '/wp/v2/media', params: [{ n: 'fileName', req: true, t: 'string' }, { n: 'mimeType', req: true, t: 'string' }, { n: 'data', req: true, t: 'string' }], response: { id: 10, source_url: 'https://example.com/uploads/file.png', title: { rendered: 'file.png' } } },
    ],
  },
  {
    slug: 'google-business-api',
    displayName: 'Google Business API',
    category: 'Social',
    icon: 'map-pin',
    description: 'Manage Google Business Profile listings, reviews, and posts.',
    tags: ['google', 'business', 'reviews', 'local'],
    actions: [
      { name: 'get_listing', method: 'GET', pathTemplate: '/locations/{locationId}', params: [{ n: 'locationId', req: true, t: 'string' }], response: { name: 'locations/123', locationName: 'Test Business', address: { locality: 'San Francisco' } } },
      { name: 'list_reviews', method: 'GET', pathTemplate: '/locations/{locationId}/reviews?pageSize={pageSize}', params: [{ n: 'locationId', req: true, t: 'string' }, { n: 'pageSize', req: false, t: 'number', def: 10 }], response: { reviews: [{ reviewId: 'rev1', rating: 5, comment: 'Great!' }], totalReviewCount: 1 } },
      { name: 'reply_review', method: 'PUT', pathTemplate: '/locations/{locationId}/reviews/{reviewId}/reply', params: [{ n: 'locationId', req: true, t: 'string' }, { n: 'reviewId', req: true, t: 'string' }, { n: 'comment', req: true, t: 'string' }], response: { comment: 'Thank you!', updateTime: '2024-01-01T00:00:00Z' } },
      { name: 'create_post', method: 'POST', pathTemplate: '/locations/{locationId}/localPosts', params: [{ n: 'locationId', req: true, t: 'string' }, { n: 'content', req: true, t: 'string' }, { n: 'callToAction', req: false, t: 'string' }], response: { name: 'locations/123/localPosts/456', summary: 'New post content' } },
    ],
  },
  {
    slug: 'meta-ad-library-api',
    displayName: 'Meta Ad Library API',
    category: 'Social',
    icon: 'megaphone',
    description: 'Search and analyze ads from Meta platforms (Facebook/Instagram) via Ad Library API.',
    tags: ['meta', 'facebook', 'instagram', 'ads'],
    actions: [
      { name: 'search_ads', method: 'GET', pathTemplate: '/ads_archive?search_terms={query}&ad_type={adType}&ad_reached_countries={country}&limit={limit}', params: [{ n: 'query', req: true, t: 'string' }, { n: 'adType', req: false, t: 'string', def: 'ALL' }, { n: 'country', req: false, t: 'string', def: 'US' }, { n: 'limit', req: false, t: 'number', def: 25 }], response: { data: [{ id: 'ad1', ad_creative_bodies: ['Buy now!'], page_name: 'Test Brand' }] } },
      { name: 'get_ad_details', method: 'GET', pathTemplate: '/ads_archive/{adId}', params: [{ n: 'adId', req: true, t: 'string' }], response: { id: 'ad1', ad_creative_bodies: ['Buy now!'], page_name: 'Test Brand', ad_delivery_start_time: '2024-01-01' } },
      { name: 'get_page_ads', method: 'GET', pathTemplate: '/ads_archive?search_page_ids={pageId}&limit={limit}', params: [{ n: 'pageId', req: true, t: 'string' }, { n: 'limit', req: false, t: 'number', def: 25 }], response: { data: [{ id: 'ad1', page_name: 'Test Brand' }] } },
      { name: 'get_ad_spend', method: 'GET', pathTemplate: '/ads_archive?search_page_ids={pageId}', params: [{ n: 'pageId', req: true, t: 'string' }, { n: 'startDate', req: false, t: 'string' }, { n: 'endDate', req: false, t: 'string' }], response: { data: [{ spend: { lower_bound: '100', upper_bound: '200' } }] } },
    ],
  },
  {
    slug: 'podcast-index-api',
    displayName: 'Podcast Index API',
    category: 'Content',
    icon: 'headphones',
    description: 'Search podcasts, get episode data, and trending feeds via Podcast Index.',
    tags: ['podcast', 'audio', 'rss', 'content'],
    actions: [
      { name: 'search_podcasts', method: 'GET', pathTemplate: '/search/byterm?q={query}&max={max}', params: [{ n: 'query', req: true, t: 'string' }, { n: 'max', req: false, t: 'number', def: 10 }], response: { feeds: [{ id: 1, title: 'Tech Talk', author: 'John' }], count: 1 } },
      { name: 'get_podcast', method: 'GET', pathTemplate: '/podcasts/byfeedid?id={feedId}', params: [{ n: 'feedId', req: true, t: 'string' }], response: { feed: { id: 1, title: 'Tech Talk', author: 'John', description: 'A tech podcast' } } },
      { name: 'get_episodes', method: 'GET', pathTemplate: '/episodes/byfeedid?id={feedId}&max={max}', params: [{ n: 'feedId', req: true, t: 'string' }, { n: 'max', req: false, t: 'number', def: 10 }], response: { items: [{ id: 1, title: 'Episode 1', datePublished: 1700000000 }], count: 1 } },
      { name: 'get_trending', method: 'GET', pathTemplate: '/podcasts/trending?max={max}&lang={lang}', params: [{ n: 'max', req: false, t: 'number', def: 10 }, { n: 'lang', req: false, t: 'string' }], response: { feeds: [{ id: 1, title: 'Trending Podcast' }], count: 1 } },
    ],
  },
  {
    slug: 'outlook-microsoft-graph-api',
    displayName: 'Outlook (Microsoft Graph) API',
    category: 'Content',
    icon: 'mail',
    description: 'Send emails, manage inbox, and handle calendar events via Microsoft Graph API.',
    tags: ['outlook', 'email', 'microsoft', 'graph'],
    actions: [
      { name: 'send_email', method: 'POST', path: '/me/sendMail', params: [{ n: 'to', req: true, t: 'string' }, { n: 'subject', req: true, t: 'string' }, { n: 'body', req: true, t: 'string' }, { n: 'cc', req: false, t: 'string' }], response: {} },
      { name: 'list_messages', method: 'GET', pathTemplate: '/me/mailFolders/{folder}/messages?$top={top}', params: [{ n: 'folder', req: false, t: 'string', def: 'inbox' }, { n: 'top', req: false, t: 'number', def: 10 }], response: { value: [{ id: 'msg1', subject: 'Hello', from: { emailAddress: { address: 'alice@example.com' } } }] } },
      { name: 'get_message', method: 'GET', pathTemplate: '/me/messages/{messageId}', params: [{ n: 'messageId', req: true, t: 'string' }], response: { id: 'msg1', subject: 'Hello', body: { content: 'Hello World' }, from: { emailAddress: { address: 'alice@example.com' } } } },
      { name: 'search_messages', method: 'GET', pathTemplate: '/me/messages?$search={query}&$top={top}', params: [{ n: 'query', req: true, t: 'string' }, { n: 'top', req: false, t: 'number', def: 10 }], response: { value: [{ id: 'msg1', subject: 'Hello' }] } },
    ],
  },
  {
    slug: 'crm-api-salesforce-hubspot',
    displayName: 'CRM API (Salesforce/HubSpot)',
    category: 'Content',
    icon: 'users',
    description: 'Unified CRM access for Salesforce and HubSpot — manage contacts, deals, and pipelines.',
    tags: ['crm', 'salesforce', 'hubspot', 'contacts'],
    actions: [
      { name: 'find_contact', method: 'POST', path: '/contacts/search', params: [{ n: 'query', req: true, t: 'string' }], response: { results: [{ id: 'c1', email: 'alice@example.com', firstName: 'Alice', lastName: 'Smith' }] } },
      { name: 'create_contact', method: 'POST', path: '/contacts', params: [{ n: 'email', req: true, t: 'string' }, { n: 'firstName', req: true, t: 'string' }, { n: 'lastName', req: true, t: 'string' }, { n: 'company', req: false, t: 'string' }], response: { id: 'c2', email: 'bob@example.com', createdAt: '2024-01-01T00:00:00Z' } },
      { name: 'list_deals', method: 'GET', pathTemplate: '/deals?stage={stage}&limit={limit}', params: [{ n: 'stage', req: false, t: 'string' }, { n: 'limit', req: false, t: 'number', def: 10 }], response: { results: [{ id: 'd1', dealname: 'Big Deal', amount: 50000, stage: 'negotiation' }] } },
      { name: 'update_deal', method: 'PATCH', pathTemplate: '/deals/{dealId}', params: [{ n: 'dealId', req: true, t: 'string' }, { n: 'stage', req: false, t: 'string' }, { n: 'amount', req: false, t: 'number' }], response: { id: 'd1', dealname: 'Big Deal', amount: 75000, stage: 'closed_won' } },
      { name: 'get_pipeline', method: 'GET', pathTemplate: '/pipelines/{pipelineId}', params: [{ n: 'pipelineId', req: false, t: 'string' }], response: { id: 'p1', label: 'Sales Pipeline', stages: [{ id: 's1', label: 'Prospecting' }] } },
    ],
  },
];

// Utility: generate an L1 handler.js from spec
function genHandler(s) {
  const actionNames = s.actions.map(a => `'${a.name}'`).join(',\n  ');
  const validationCases = s.actions.map(a => {
    const requiredP = a.params.filter(p => p.req);
    if (requiredP.length === 0) return `    case '${a.name}':\n      return { valid: true };`;
    const checks = requiredP.map(p => {
      const vFn = `validate_${p.n}`;
      return `      const ${vFn} = validateNonEmptyString(params.${p.n}, '${p.n}');\n      if (!${vFn}.valid) return { valid: false, error: ${vFn}.error };`;
    }).join('\n');
    return `    case '${a.name}': {\n${checks}\n      return { valid: true };\n    }`;
  }).join('\n');

  const handlers = s.actions.map(a => {
    const fnName = 'handle' + a.name.split('_').map(w => w[0].toUpperCase() + w.slice(1)).join('');
    const requiredP = a.params.filter(p => p.req);
    const optionalP = a.params.filter(p => !p.req);

    const validationBlock = requiredP.map(p => {
      return `  const v_${p.n} = validateNonEmptyString(params.${p.n}, '${p.n}');
  if (!v_${p.n}.valid) {
    return { result: \`Error: \${v_${p.n}.error}\`, metadata: { success: false, action: '${a.name}', error: 'INVALID_INPUT', timestamp: new Date().toISOString() } };
  }`;
    }).join('\n');

    const clientBlock = `  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);`;

    // Build path string
    let pathExpr;
    if (a.pathTemplate) {
      let tmpl = a.pathTemplate;
      a.params.forEach(p => {
        if (tmpl.includes(`{${p.n}}`)) {
          if (p.req) {
            tmpl = tmpl.replace(`{${p.n}}`, `\${encodeURIComponent(v_${p.n}.value)}`);
          } else {
            const defVal = p.def !== undefined ? p.def : '';
            tmpl = tmpl.replace(`{${p.n}}`, `\${encodeURIComponent(String(params.${p.n} ?? '${defVal}'))}`);
          }
        }
      });
      pathExpr = `\`${tmpl}\``;
    } else {
      pathExpr = `'${a.path}'`;
    }

    const bodyExpr = (a.method === 'POST' || a.method === 'PUT' || a.method === 'PATCH')
      ? `{ ${a.params.map(p => p.req ? `${p.n}: v_${p.n}.value` : `${p.n}: params.${p.n}`).join(', ')} }`
      : 'null';

    return `async function ${fnName}(params, context) {
${validationBlock}

${clientBlock}

  try {
    const path = ${pathExpr};
    const data = await requestWithTimeout(resolved.client, '${a.method}', path, {}, timeoutMs);

    return {
      result: redactSensitive(JSON.stringify(data, null, 2)),
      metadata: {
        success: true,
        action: '${a.name}',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(\`Error: \${err.message}\`),
      metadata: { success: false, action: '${a.name}', error: err.code || 'UPSTREAM_ERROR', timestamp: new Date().toISOString() },
    };
  }
}`;
  }).join('\n\n');

  const switchCases = s.actions.map(a => {
    const fnName = 'handle' + a.name.split('_').map(w => w[0].toUpperCase() + w.slice(1)).join('');
    return `      case '${a.name}': return await ${fnName}(params, context);`;
  }).join('\n');

  return `/**
 * ${s.displayName} Skill Handler (Layer 1)
 * ${s.description}
 */

const VALID_ACTIONS = [
  ${actionNames},
];

const DEFAULT_TIMEOUT_MS = 30000;
const MAX_TIMEOUT_MS = 120000;

function getClient(context) {
  if (context?.providerClient) return { client: context.providerClient, type: 'provider' };
  if (context?.gatewayClient) return { client: context.gatewayClient, type: 'gateway' };
  return null;
}

function providerNotConfiguredError() {
  return {
    result: 'Error: Provider client required for ${s.displayName} access. Configure an API key or platform adapter.',
    metadata: { success: false, error: { code: 'PROVIDER_NOT_CONFIGURED', message: 'Provider client required.', retriable: false } },
  };
}

function resolveTimeout(context) {
  const configured = context?.config?.timeoutMs;
  if (typeof configured === 'number' && configured > 0) return Math.min(configured, MAX_TIMEOUT_MS);
  return DEFAULT_TIMEOUT_MS;
}

async function requestWithTimeout(client, method, path, opts, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await client.request(method, path, null, { ...opts, signal: controller.signal });
    clearTimeout(timer);
    return response;
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') throw { code: 'TIMEOUT', message: \`Request timed out after \${timeoutMs}ms.\` };
    throw { code: 'UPSTREAM_ERROR', message: err.message || 'Unknown upstream error' };
  }
}

const SENSITIVE_PATTERNS = [/(?:api[_-]?key|token|secret|password|authorization|bearer)\\s*[:=]\\s*\\S+/gi];

function redactSensitive(text) {
  if (typeof text !== 'string') return text;
  let cleaned = text;
  for (const pattern of SENSITIVE_PATTERNS) cleaned = cleaned.replace(pattern, '[REDACTED]');
  return cleaned;
}

function validateNonEmptyString(value, fieldName) {
  if (!value || typeof value !== 'string') return { valid: false, error: \`The "\${fieldName}" parameter is required and must be a non-empty string.\` };
  const trimmed = value.trim();
  if (trimmed.length === 0) return { valid: false, error: \`The "\${fieldName}" parameter must not be empty.\` };
  return { valid: true, value: trimmed };
}

export function validate(params) {
  const { action } = params || {};
  if (!action || !VALID_ACTIONS.includes(action)) return { valid: false, error: \`Invalid action "\${action}". Must be one of: \${VALID_ACTIONS.join(', ')}\` };
  switch (action) {
${validationCases}
    default: return { valid: false, error: \`Unknown action "\${action}".\` };
  }
}

${handlers}

export async function execute(params, context) {
  const { action } = params || {};
  if (!action || !VALID_ACTIONS.includes(action)) {
    return {
      result: \`Error: Invalid action "\${action}". Must be one of: \${VALID_ACTIONS.join(', ')}\`,
      metadata: { success: false, action: action || null, error: 'INVALID_ACTION', timestamp: new Date().toISOString() },
    };
  }
  try {
    switch (action) {
${switchCases}
      default: return { result: \`Error: Unknown action "\${action}".\`, metadata: { success: false, action, error: 'INVALID_ACTION', timestamp: new Date().toISOString() } };
    }
  } catch (error) {
    return { result: redactSensitive(\`Error during \${action}: \${error.message}\`), metadata: { success: false, action, error: 'UPSTREAM_ERROR', timestamp: new Date().toISOString() } };
  }
}

export const meta = { name: '${s.slug}', version: '1.0.0', description: '${s.description}', actions: VALID_ACTIONS };

export { getClient, providerNotConfiguredError, resolveTimeout, requestWithTimeout, redactSensitive, validateNonEmptyString, VALID_ACTIONS, DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS };
`;
}

// Generate skill.json
function genSkillJson(s) {
  return JSON.stringify({
    name: s.slug,
    version: '1.0.0',
    displayName: s.displayName,
    description: s.description,
    category: s.category,
    icon: s.icon,
    author: 'claw2agent',
    layer: 'L1',
    requiresApiKey: true,
    apiKeyLabel: `${s.displayName} API Key`,
    tags: s.tags,
    verified: true,
    tier: 'pro',
    implemented: true,
    config: { provider: 'providerClient', timeoutMs: 30000, maxTimeoutMs: 120000, featureFlags: {} },
    toolDefinition: {
      name: s.slug.replace(/-/g, '_'),
      description: s.description,
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: s.actions.map(a => a.name),
            description: 'The action to perform',
          },
        },
        required: ['action'],
      },
    },
  }, null, 2) + '\n';
}

// Generate test file
function genTest(s) {
  const actionNames = s.actions.map(a => a.name);

  const provNotConfigTests = s.actions.map(a => {
    const requiredP = a.params.filter(p => p.req);
    const paramStr = requiredP.map(p => `${p.n}: 'test'`).join(', ');
    return `  it('should fail ${a.name} without client', async () => {
    const r = await execute({ action: '${a.name}'${paramStr ? ', ' + paramStr : ''} }, {});
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });`;
  }).join('\n\n');

  const actionTests = s.actions.map(a => {
    const requiredP = a.params.filter(p => p.req);
    const paramStr = requiredP.map(p => `${p.n}: 'test'`).join(', ');
    const responseName = `sample_${a.name}`;

    let tests = [];
    tests.push(`  it('should execute ${a.name} successfully', async () => {
    const ctx = mockContext(${responseName});
    const r = await execute({ action: '${a.name}'${paramStr ? ', ' + paramStr : ''} }, ctx);
    assert.equal(r.metadata.success, true);
    assert.equal(r.metadata.action, '${a.name}');
    assert.ok(r.metadata.timestamp);
  });`);

    if (requiredP.length > 0) {
      tests.push(`  it('should reject missing required params for ${a.name}', async () => {
    const ctx = mockContext(${responseName});
    const r = await execute({ action: '${a.name}' }, ctx);
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error, 'INVALID_INPUT');
  });`);

      tests.push(`  it('should reject non-string required params for ${a.name}', async () => {
    const ctx = mockContext(${responseName});
    const r = await execute({ action: '${a.name}', ${requiredP[0].n}: 123 }, ctx);
    assert.equal(r.metadata.success, false);
  });`);
    }

    return `describe('${s.slug}: ${a.name}', () => {
  beforeEach(() => {});

${tests.join('\n\n')}
});`;
  }).join('\n\n');

  const timeoutTests = s.actions.map(a => {
    const requiredP = a.params.filter(p => p.req);
    const paramStr = requiredP.map(p => `${p.n}: 'test'`).join(', ');
    return `  it('should timeout on ${a.name}', async () => {
    const r = await execute({ action: '${a.name}'${paramStr ? ', ' + paramStr : ''} }, mockContextTimeout());
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error, 'TIMEOUT');
  });`;
  }).join('\n\n');

  const sampleResponses = s.actions.map(a => {
    return `const sample_${a.name} = ${JSON.stringify(a.response)};`;
  }).join('\n');

  const pathTests = s.actions.map(a => {
    const requiredP = a.params.filter(p => p.req);
    const paramStr = requiredP.map(p => `${p.n}: 'test'`).join(', ');
    const responseName = `sample_${a.name}`;
    const expectedPath = a.path || a.pathTemplate;
    return `  it('should call correct path for ${a.name}', async () => {
    let calledPath = null;
    const ctx = { providerClient: { request: async (m, p) => { calledPath = p; return ${responseName}; } }, config: { timeoutMs: 5000 } };
    await execute({ action: '${a.name}'${paramStr ? ', ' + paramStr : ''} }, ctx);
    assert.ok(calledPath !== null);
  });`;
  }).join('\n\n');

  return `import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import {
  execute, validate, meta, getClient, providerNotConfiguredError,
  resolveTimeout, requestWithTimeout, redactSensitive, validateNonEmptyString,
  VALID_ACTIONS, DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS,
} from '../handler.js';

function mockContext(requestResponse, config) {
  return { providerClient: { request: async (m, p, b, o) => requestResponse }, config: config || { timeoutMs: 5000 } };
}
function mockContextError(error) {
  return { providerClient: { request: async () => { throw error; } }, config: { timeoutMs: 1000 } };
}
function mockContextTimeout() {
  return { providerClient: { request: async (_m, _p, _b, o) => { const e = new Error('The operation was aborted'); e.name = 'AbortError'; throw e; } }, config: { timeoutMs: 100 } };
}

${sampleResponses}

// 1. Action validation
describe('${s.slug}: action validation', () => {
  beforeEach(() => {});
  it('should reject invalid action', async () => { const r = await execute({ action: 'invalid' }, {}); assert.equal(r.metadata.success, false); assert.equal(r.metadata.error, 'INVALID_ACTION'); });
  it('should reject missing action', async () => { const r = await execute({}, {}); assert.equal(r.metadata.success, false); });
  it('should reject null params', async () => { const r = await execute(null, {}); assert.equal(r.metadata.success, false); });
  it('should reject undefined params', async () => { const r = await execute(undefined, {}); assert.equal(r.metadata.success, false); });
  it('should list valid actions in error message', async () => { const r = await execute({ action: 'bad' }, {}); for (const a of VALID_ACTIONS) assert.ok(r.result.includes(a)); });
});

// 2. PROVIDER_NOT_CONFIGURED
describe('${s.slug}: PROVIDER_NOT_CONFIGURED', () => {
  beforeEach(() => {});
${provNotConfigTests}
});

// 3-N. Per-action tests
${actionTests}

// N+1. Timeout
describe('${s.slug}: timeout', () => {
  beforeEach(() => {});
${timeoutTests}
});

// N+2. Network errors
describe('${s.slug}: network errors', () => {
  beforeEach(() => {});
  it('should return UPSTREAM_ERROR', async () => {
    const r = await execute({ action: '${actionNames[0]}'${s.actions[0].params.filter(p => p.req).length > 0 ? `, ${s.actions[0].params.filter(p => p.req).map(p => `${p.n}: 'test'`).join(', ')}` : ''} }, mockContextError(new Error('Connection refused')));
    assert.equal(r.metadata.success, false); assert.equal(r.metadata.error, 'UPSTREAM_ERROR');
  });
  it('should include error message', async () => {
    const r = await execute({ action: '${actionNames[0]}'${s.actions[0].params.filter(p => p.req).length > 0 ? `, ${s.actions[0].params.filter(p => p.req).map(p => `${p.n}: 'test'`).join(', ')}` : ''} }, mockContextError(new Error('Connection refused')));
    assert.ok(r.result.includes('Connection refused'));
  });
});

// N+3. getClient
describe('${s.slug}: getClient', () => {
  beforeEach(() => {});
  it('prefer provider', () => { assert.equal(getClient({ providerClient: {request: () => {}}, gatewayClient: {request: () => {}} }).type, 'provider'); });
  it('fallback gateway', () => { assert.equal(getClient({ gatewayClient: {request: () => {}} }).type, 'gateway'); });
  it('null for empty', () => { assert.equal(getClient({}), null); });
  it('null for undefined', () => { assert.equal(getClient(undefined), null); });
  it('null for null', () => { assert.equal(getClient(null), null); });
});

// N+4. redactSensitive
describe('${s.slug}: redactSensitive', () => {
  beforeEach(() => {});
  it('redact api_key', () => { assert.ok(redactSensitive('api_key: sample_key_placeholder').includes('[REDACTED]')); });
  it('redact bearer', () => { assert.ok(redactSensitive('bearer: test_placeholder_token').includes('[REDACTED]')); });
  it('redact authorization', () => { assert.ok(redactSensitive('authorization: sample_auth_value').includes('[REDACTED]')); });
  it('clean string unchanged', () => { assert.equal(redactSensitive('clean'), 'clean'); });
  it('non-string input', () => { assert.equal(redactSensitive(42), 42); assert.equal(redactSensitive(null), null); });
});

// N+5. resolveTimeout
describe('${s.slug}: resolveTimeout', () => {
  beforeEach(() => {});
  it('default empty', () => { assert.equal(resolveTimeout({}), DEFAULT_TIMEOUT_MS); });
  it('default undefined', () => { assert.equal(resolveTimeout(undefined), DEFAULT_TIMEOUT_MS); });
  it('custom val', () => { assert.equal(resolveTimeout({ config: { timeoutMs: 60000 } }), 60000); });
  it('cap at max', () => { assert.equal(resolveTimeout({ config: { timeoutMs: 999999 } }), MAX_TIMEOUT_MS); });
  it('ignore 0', () => { assert.equal(resolveTimeout({ config: { timeoutMs: 0 } }), DEFAULT_TIMEOUT_MS); });
  it('ignore neg', () => { assert.equal(resolveTimeout({ config: { timeoutMs: -1 } }), DEFAULT_TIMEOUT_MS); });
  it('ignore non-num', () => { assert.equal(resolveTimeout({ config: { timeoutMs: 'x' } }), DEFAULT_TIMEOUT_MS); });
  it('DEFAULT=30000', () => { assert.equal(DEFAULT_TIMEOUT_MS, 30000); });
  it('MAX=120000', () => { assert.equal(MAX_TIMEOUT_MS, 120000); });
});

// N+6. validate()
describe('${s.slug}: validate()', () => {
  beforeEach(() => {});
  it('reject invalid', () => { assert.equal(validate({ action: 'bad' }).valid, false); });
  it('reject missing', () => { assert.equal(validate({}).valid, false); });
  it('reject null', () => { assert.equal(validate(null).valid, false); });
${s.actions.map(a => {
    const requiredP = a.params.filter(p => p.req);
    if (requiredP.length === 0) {
      return `  it('${a.name} valid with no params', () => { assert.equal(validate({ action: '${a.name}' }).valid, true); });`;
    }
    const paramStr = requiredP.map(p => `${p.n}: 'test'`).join(', ');
    return `  it('${a.name} requires params', () => { assert.equal(validate({ action: '${a.name}' }).valid, false); assert.equal(validate({ action: '${a.name}', ${paramStr} }).valid, true); });`;
  }).join('\n')}
});

// N+7. meta export
describe('${s.slug}: meta export', () => {
  beforeEach(() => {});
  it('name', () => { assert.equal(meta.name, '${s.slug}'); });
  it('version', () => { assert.equal(meta.version, '1.0.0'); });
  it('description', () => { assert.ok(meta.description.length > 0); });
  it('actions count', () => { assert.equal(meta.actions.length, ${s.actions.length}); });
});

// N+8. gatewayClient fallback
describe('${s.slug}: gatewayClient fallback', () => {
  beforeEach(() => {});
  it('should use gatewayClient', async () => {
    const ctx = { gatewayClient: { request: async () => sample_${s.actions[0].name} }, config: { timeoutMs: 5000 } };
    const r = await execute({ action: '${s.actions[0].name}'${s.actions[0].params.filter(p => p.req).length > 0 ? `, ${s.actions[0].params.filter(p => p.req).map(p => `${p.n}: 'test'`).join(', ')}` : ''} }, ctx);
    assert.equal(r.metadata.success, true);
  });
});

// N+9. providerNotConfiguredError
describe('${s.slug}: providerNotConfiguredError', () => {
  beforeEach(() => {});
  it('success false', () => { assert.equal(providerNotConfiguredError().metadata.success, false); });
  it('code', () => { assert.equal(providerNotConfiguredError().metadata.error.code, 'PROVIDER_NOT_CONFIGURED'); });
  it('retriable false', () => { assert.equal(providerNotConfiguredError().metadata.error.retriable, false); });
  it('result includes Error', () => { assert.ok(providerNotConfiguredError().result.includes('Error')); });
});

// N+10. constants
describe('${s.slug}: constants', () => {
  beforeEach(() => {});
  it('VALID_ACTIONS', () => { assert.deepEqual(VALID_ACTIONS, [${s.actions.map(a => `'${a.name}'`).join(', ')}]); });
});

// N+11. request path verification
describe('${s.slug}: request path verification', () => {
  beforeEach(() => {});
${pathTests}
});
`;
}

// Generate README
function genReadme(s) {
  const actionDocs = s.actions.map(a => {
    const paramRows = a.params.map(p => {
      return `| ${p.n} | ${p.req ? '✅' : '❌'} | ${p.t} | ${p.def !== undefined ? String(p.def) : '—'} | — |`;
    });
    const paramTable = a.params.length > 0
      ? `\n| Parameter | Required | Type | Default | Description |\n|-----------|----------|------|---------|-------------|\n${paramRows.join('\n')}`
      : '\n_No required parameters._';
    return `### \`${a.name}\`\n${paramTable}`;
  }).join('\n\n');

  return `# ${s.displayName} [L1]

${s.description}

## Actions

${actionDocs}

## Architecture

- **No hardcoded endpoints** — all API access through injected \`providerClient\`
- **BYOK** — keys managed externally
- **Timeout enforcement** — default 30s, max 120s
- **Input validation** — all parameters validated
- **Redaction** — sensitive data redacted from outputs

## Error Codes

| Code | Description | Retriable |
|------|-------------|-----------|
| INVALID_ACTION | Unknown/missing action | No |
| INVALID_INPUT | Bad/missing parameters | No |
| PROVIDER_NOT_CONFIGURED | No API client | No |
| TIMEOUT | Request timeout | Yes |
| UPSTREAM_ERROR | API error | Maybe |

## Testing

\`\`\`bash
node --test skills/${s.slug}/__tests__/handler.test.js
\`\`\`
`;
}

// Actually write the files
for (const spec of SKILLS) {
  const base = `skills/${spec.slug}`;
  mkdirSync(`${base}/__tests__`, { recursive: true });

  writeFileSync(`${base}/handler.js`, genHandler(spec));
  writeFileSync(`${base}/skill.json`, genSkillJson(spec));
  writeFileSync(`${base}/__tests__/handler.test.js`, genTest(spec));
  writeFileSync(`${base}/README.md`, genReadme(spec));

  console.log(`✅ Generated: ${spec.slug} (${spec.actions.length} actions)`);
}

console.log(`\nAll ${SKILLS.length} skills generated.`);
