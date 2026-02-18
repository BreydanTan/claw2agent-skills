import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILL_MD_PATH = join(__dirname, '..', 'SKILL.md');
const HANDLER_ACTIONS = ["quote","analyze","compare","watchlist_add","watchlist_remove","watchlist_list","alert"];

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;
  const fm = {};
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    fm[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return fm;
}

describe('stock-crypto-analyzer: SKILL.md exists', () => {
  beforeEach(() => {});
  it('SKILL.md file exists', () => {
    assert.ok(existsSync(SKILL_MD_PATH), 'SKILL.md must exist');
  });
  it('SKILL.md is non-empty', () => {
    const content = readFileSync(SKILL_MD_PATH, 'utf8');
    assert.ok(content.length > 100, 'SKILL.md must have meaningful content');
  });
});

describe('stock-crypto-analyzer: SKILL.md frontmatter', () => {
  beforeEach(() => {});
  let content, fm;
  try { content = readFileSync(SKILL_MD_PATH, 'utf8'); fm = parseFrontmatter(content); } catch { content = ''; fm = null; }

  it('has valid frontmatter block', () => {
    assert.ok(fm !== null, 'SKILL.md must have --- frontmatter block');
  });
  it('frontmatter.name is present', () => {
    assert.ok(fm?.name, 'frontmatter must have name field');
  });
  it('frontmatter.name matches slug', () => {
    assert.equal(fm?.name, 'stock-crypto-analyzer');
  });
  it('frontmatter.description is present', () => {
    assert.ok(fm?.description, 'frontmatter must have description field');
  });
  it('frontmatter.description is meaningful', () => {
    assert.ok((fm?.description?.length ?? 0) >= 20, 'description must be at least 20 chars');
  });
  it('frontmatter.user-invocable is present', () => {
    assert.ok(fm?.['user-invocable'] !== undefined, 'frontmatter must have user-invocable field');
  });
  it('frontmatter.user-invocable is boolean string', () => {
    assert.ok(['true', 'false'].includes(fm?.['user-invocable']), 'user-invocable must be "true" or "false"');
  });
  it('frontmatter.metadata is present', () => {
    assert.ok(fm?.metadata, 'frontmatter must have metadata field');
  });
});

describe('stock-crypto-analyzer: SKILL.md metadata JSON', () => {
  beforeEach(() => {});
  let meta = null;
  try {
    const content = readFileSync(SKILL_MD_PATH, 'utf8');
    const fm = parseFrontmatter(content);
    meta = fm?.metadata ? JSON.parse(fm.metadata) : null;
  } catch {}

  it('metadata is valid JSON', () => {
    assert.ok(meta !== null, 'metadata must be valid JSON');
  });
  it('metadata has openclaw.category', () => {
    assert.ok(meta?.['openclaw.category'], 'metadata must have openclaw.category');
  });
  it('metadata has openclaw.risk', () => {
    assert.ok(meta?.['openclaw.risk'], 'metadata must have openclaw.risk');
  });
  it('metadata has openclaw.layer', () => {
    assert.ok(meta?.['openclaw.layer'], 'metadata must have openclaw.layer');
  });
  it('openclaw.risk is valid level', () => {
    assert.ok(['L0', 'L1', 'L2'].includes(meta?.['openclaw.risk']), 'risk must be L0, L1, or L2');
  });
  it('openclaw.layer is valid level', () => {
    assert.ok(['L0', 'L1', 'L2'].includes(meta?.['openclaw.layer']), 'layer must be L0, L1, or L2');
  });
});

describe('stock-crypto-analyzer: SKILL.md body sections', () => {
  beforeEach(() => {});
  let body = '';
  try {
    const content = readFileSync(SKILL_MD_PATH, 'utf8');
    body = content.replace(/^---[\s\S]*?---\n/, '');
  } catch {}

  it('has Capabilities section', () => { assert.ok(body.includes('Capabilities'), 'must have Capabilities section'); });
  it('has Trigger Semantics section', () => { assert.ok(body.includes('Trigger Semantics'), 'must have Trigger Semantics section'); });
  it('has Parameter Mapping section', () => { assert.ok(body.includes('Parameter Mapping'), 'must have Parameter Mapping section'); });
  it('has Invocation Convention section', () => { assert.ok(body.includes('Invocation Convention'), 'must have Invocation Convention section'); });
  it('has Error Handling section', () => { assert.ok(body.includes('Error Handling'), 'must have Error Handling section'); });
  it('has Security Boundary section', () => { assert.ok(body.includes('Security Boundary'), 'must have Security Boundary section'); });
  it('has at least one code block', () => {
    const blocks = (body.match(/```/g) || []).length;
    assert.ok(blocks >= 2, 'must have at least one code block (opening + closing backticks)');
  });
  it('body is sufficiently detailed', () => {
    assert.ok(body.length >= 200, 'body must be at least 200 chars');
  });
});

describe('stock-crypto-analyzer: SKILL.md action coverage', () => {
  beforeEach(() => {});
  let body = '';
  try {
    const content = readFileSync(SKILL_MD_PATH, 'utf8');
    body = content.replace(/^---[\s\S]*?---\n/, '');
  } catch {}

  it('lists all handler actions', () => {
    for (const action of HANDLER_ACTIONS) {
      assert.ok(body.includes(action), `SKILL.md must mention action: ${action}`);
    }
  });
  it('action count matches handler', () => {
    const mentioned = HANDLER_ACTIONS.filter(a => body.includes(a));
    assert.equal(mentioned.length, HANDLER_ACTIONS.length);
  });
});
