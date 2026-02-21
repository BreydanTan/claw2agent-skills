/**
 * gen-skill-md.js
 * Generates SKILL.md for every skill from skill.json + handler.js exports.
 * Idempotent: overwrites existing SKILL.md with regenerated content.
 *
 * Action extraction strategy (in priority order):
 *   1. VALID_ACTIONS array in handler.js  (new-style L1 skills)
 *   2. toolDefinition.parameters.properties.action.enum in skill.json  (older skills)
 *   3. switch/case 'action_name' pattern in handler.js  (fallback)
 *
 * Usage: node --input-type=module < scripts/gen-skill-md.js
 *    or: node scripts/gen-skill-md.mjs
 */

import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';

// Canonical category mapping (master plan §5.1)
const CATEGORY_MAP = {
  'Utility': 'utilities-knowledge', 'Utilities': 'utilities-knowledge', 'Knowledge': 'utilities-knowledge',
  'Document': 'content', 'Documents': 'content', 'Content': 'content', 'Content & Media': 'content',
  'Development': 'development-devops', 'DevOps': 'development-devops', 'Developer Tools': 'development-devops',
  'Data': 'data-research', 'Research': 'data-research', 'Database': 'data-research',
  'IoT': 'iot-media', 'IoT/Data': 'iot-media', 'Media': 'iot-media', 'Gaming': 'iot-media',
  'Social': 'social', 'Social Media': 'social', 'Marketing': 'social',
  'Integration': 'automation-integration', 'Automation': 'automation-integration',
  'AI': 'ai-ml', 'AI & Agents': 'ai-ml',
  'Communication': 'communication', 'Finance': 'finance', 'Security': 'security',
  'Productivity': 'productivity', 'Project Management': 'productivity', 'Education': 'productivity',
};

function canonicalCategory(raw) {
  return CATEGORY_MAP[raw] || raw?.toLowerCase().replace(/\s+/g, '-') || 'utilities-knowledge';
}

const RISK_LEVEL = {
  'security': 'L2', 'development-devops': 'L2',
  'automation-integration': 'L1', 'finance': 'L1', 'iot-media': 'L1',
  'social': 'L1', 'communication': 'L1', 'ai-ml': 'L1',
  'data-research': 'L0', 'content': 'L0', 'productivity': 'L0', 'utilities-knowledge': 'L0',
};

function riskLevel(cat) { return RISK_LEVEL[canonicalCategory(cat)] || 'L1'; }

/**
 * Extract action names from handler.js using multiple strategies.
 * Returns [] if none found (never returns placeholder strings).
 */
function extractActions(handlerPath, skillJsonPath) {
  // Strategy 1: VALID_ACTIONS = ['a', 'b', ...] in handler.js
  try {
    const src = readFileSync(handlerPath, 'utf8');
    const m = src.match(/VALID_ACTIONS\s*=\s*\[([^\]]+)\]/);
    if (m) {
      const actions = m[1].match(/'([^']+)'/g)?.map(s => s.replace(/'/g, '')) || [];
      if (actions.length > 0) return actions;
    }
  } catch {}

  // Strategy 2: skill.json toolDefinition.parameters.properties.action.enum
  try {
    const sj = JSON.parse(readFileSync(skillJsonPath, 'utf8'));
    const actions = sj?.toolDefinition?.parameters?.properties?.action?.enum;
    if (Array.isArray(actions) && actions.length > 0) return actions;
  } catch {}

  // Strategy 3: case 'action_name': pattern in handler.js (switch-based handlers)
  try {
    const src = readFileSync(handlerPath, 'utf8');
    const matches = [...src.matchAll(/case\s+['"]([a-z][a-z0-9_]+)['"]\s*:/g)];
    const actions = [...new Set(matches.map(m => m[1]))].filter(a => a.length > 1);
    if (actions.length > 0) return actions;
  } catch {}

  return [];
}

function genSkillMd(slug, sj, actions) {
  const dn = sj.displayName || slug;
  const desc = sj.description || '';
  const layer = sj.layer || 'L0';
  const cat = sj.category || '';
  const canonCat = canonicalCategory(cat);
  const risk = riskLevel(cat);
  const requiresApiKey = sj.requiresApiKey || false;
  const tags = (sj.tags || []).join(', ');

  const requiresObj = requiresApiKey
    ? { env: [`${slug.toUpperCase().replace(/-/g, '_')}_API_KEY`] }
    : layer === 'L1' ? { config: ['providerClient'] } : {};

  const metadataJson = JSON.stringify({
    'openclaw.category': canonCat,
    'openclaw.risk': risk,
    'openclaw.layer': layer,
    'openclaw.tags': tags,
    'openclaw.requires': requiresObj,
  });

  // Action list — never empty placeholder
  const hasActions = actions.length > 0;
  const actionEnum = hasActions ? actions.join(' | ') : 'see handler.js';
  const actionDocs = hasActions
    ? actions.map(a => `- **\`${a}\`**`).join('\n')
    : '- _(see handler.js for available operations)_';

  const firstAction = actions[0] || 'execute';
  const exampleParam = firstAction.includes('search') || firstAction.includes('query')
    ? `{ "action": "${firstAction}", "query": "example" }`
    : `{ "action": "${firstAction}" }`;

  // Build a realistic action enum line (no angle-bracket placeholders)
  const actionEnumLine = hasActions
    ? `"action": "<one of: ${actionEnum}>",`
    : `// no fixed action enum — see handler.js`;

  const errorRows = layer === 'L1'
    ? `| \`PROVIDER_NOT_CONFIGURED\` | API client not configured | Guide user to configure API key |
| \`TIMEOUT\` | Request timed out (default 30s) | Suggest retry or reduce data |
| \`UPSTREAM_ERROR\` | Upstream API error | Show error details, suggest retry |`
    : `| \`NOT_FOUND\` | Resource not found | Ask user to verify ID or criteria |`;

  const securityNote = requiresApiKey
    ? `Requires API key (injected via providerClient, never hardcoded)`
    : `No external API key required (${layer} local execution)`;

  const networkNote = layer === 'L1'
    ? `- Request timeout enforced: default 30s, max 120s\n- Raw API error stacks are never exposed to the user`
    : `- Does not access the network or write to persistent storage (unless by design)`;

  // Quote description to keep YAML frontmatter valid even when it contains ":".
  const quotedDesc = JSON.stringify(desc);

return `---
name: ${slug}
description: ${quotedDesc}
user-invocable: true
metadata: ${metadataJson}
---

# ${dn}

## Capabilities

**What it does:**
${desc}

Supported actions:
${actionDocs}

**What it does NOT do:**
- Does not store or cache user data to disk (no side effects beyond the API call)
- Does not bypass API rate limits or authentication mechanisms
- Does not perform operations outside the listed actions

## Execution Model

- This \`SKILL.md\` is the invocation contract and usage guide.
- Real execution is implemented in \`handler.js\` via \`execute(params, context)\`.
- Integrations (including OpenClaw wrappers) should route calls to the handler, not re-implement business logic in markdown.

## Trigger Semantics

**Trigger keywords (invoke this skill when the user says):**
${actions.slice(0, 3).map(a => `- "${a.replace(/_/g, ' ')}" related requests`).join('\n') || `- "${dn.split(' ')[0].toLowerCase()}" related requests`}
- User explicitly mentions "${dn.split(' ')[0]}" or the related platform/service

**Anti-triggers (do NOT invoke this skill when):**
- User is only asking about concepts, no actual operation needed
- Requested operation is not in the supported actions list
- Required authentication is missing (${requiresApiKey ? 'API key not configured' : layer === 'L1' ? 'providerClient not injected' : 'context not available'})

## Parameter Mapping

Map user natural language requests to the following structure:

\`\`\`json
{
  ${actionEnumLine}
  // action-specific parameters (see handler.js for full schema)
}
\`\`\`

## Invocation Convention

Trigger \`handler.js\` \`execute(params, context)\` via tool call:

\`\`\`js
// Success example
const result = await execute(
  ${exampleParam},
  context  // contains ${layer === 'L1' ? 'providerClient / gatewayClient' : 'L0 context (store, etc.)'}
);
// result.metadata.success === true  (or result.result for older handlers)

// Failure example (missing required param)
const result = await execute(
  { action: "${firstAction}" },  // missing required params
  context
);
// result.metadata.success === false  (or error thrown for older handlers)
\`\`\`

## Error Handling & Fallback

| Error Code | Meaning | Fallback Strategy |
|------------|---------|-------------------|
| \`INVALID_ACTION\` | Action not in supported list | Inform user of available actions |
| \`INVALID_INPUT\` | Missing or wrong-type parameter | Ask user for the missing parameter |
${errorRows}

## Security Boundary

- **Risk level: ${risk}**
- ${securityNote}
- All output is sanitized via SENSITIVE_PATTERNS regex (redacts keys/tokens)
- Input parameters are type- and length-validated; malicious payloads are rejected
${networkNote}

## Version Info

- Handler version: 1.0.0
- Category: ${canonCat}
- Layer: ${layer}
`;
}

const skillsDir = 'skills';
const slugs = readdirSync(skillsDir).filter(s => {
  if (s.startsWith('.') || s.endsWith('.json') || s.endsWith('.js')) return false;
  return existsSync(`${skillsDir}/${s}/skill.json`);
});

let generated = 0, errors = 0, noActions = 0;
for (const slug of slugs) {
  try {
    const sj = JSON.parse(readFileSync(`${skillsDir}/${slug}/skill.json`, 'utf8'));
    const actions = extractActions(`${skillsDir}/${slug}/handler.js`, `${skillsDir}/${slug}/skill.json`);
    if (actions.length === 0) noActions++;
    writeFileSync(`${skillsDir}/${slug}/SKILL.md`, genSkillMd(slug, sj, actions));
    generated++;
  } catch (e) {
    console.error(`ERROR ${slug}: ${e.message}`);
    errors++;
  }
}

console.log(`Generated ${generated} SKILL.md files (${errors} errors, ${noActions} with no actions found)`);
