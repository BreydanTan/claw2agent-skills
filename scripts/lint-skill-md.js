/**
 * lint-skill-md.js
 * Validates SKILL.md files for required fields, frontmatter structure,
 * metadata JSON validity, and minimum quality standards.
 *
 * Usage: node --input-type=module < scripts/lint-skill-md.js
 * Exit code: 0 = all pass, 1 = failures found
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs';

const REQUIRED_FRONTMATTER = ['name', 'description', 'user-invocable', 'metadata'];
const REQUIRED_METADATA_KEYS = ['openclaw.category', 'openclaw.risk', 'openclaw.layer'];
const REQUIRED_BODY_SECTIONS = [
  'Capabilities', 'Trigger Semantics', 'Parameter Mapping',
  'Invocation Convention', 'Error Handling', 'Security Boundary',
];
const MIN_DESCRIPTION_LENGTH = 20;
const MIN_BODY_LENGTH = 200;

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

function lintSkillMd(slug, content) {
  const errors = [];
  const warnings = [];

  const fm = parseFrontmatter(content);
  if (!fm) {
    errors.push('Missing or malformed frontmatter (--- block)');
    return { errors, warnings };
  }

  // Required frontmatter fields
  for (const field of REQUIRED_FRONTMATTER) {
    if (!fm[field]) errors.push(`Missing frontmatter field: "${field}"`);
  }

  // name must match slug
  if (fm.name && fm.name !== slug) {
    errors.push(`frontmatter.name "${fm.name}" does not match slug "${slug}"`);
  }

  // description quality
  if (fm.description && fm.description.length < MIN_DESCRIPTION_LENGTH) {
    errors.push(`description too short (${fm.description.length} chars, min ${MIN_DESCRIPTION_LENGTH})`);
  }

  // user-invocable must be boolean string
  if (fm['user-invocable'] && !['true', 'false'].includes(fm['user-invocable'])) {
    errors.push(`user-invocable must be "true" or "false", got "${fm['user-invocable']}"`);
  }

  // metadata must be valid single-line JSON with required keys
  if (fm.metadata) {
    try {
      const meta = JSON.parse(fm.metadata);
      for (const key of REQUIRED_METADATA_KEYS) {
        if (!meta[key]) errors.push(`metadata missing key: "${key}"`);
      }
      if (meta['openclaw.risk'] && !['L0', 'L1', 'L2'].includes(meta['openclaw.risk'])) {
        errors.push(`openclaw.risk must be L0/L1/L2, got "${meta['openclaw.risk']}"`);
      }
    } catch (e) {
      errors.push(`metadata is not valid JSON: ${e.message}`);
    }
  }

  // Body sections
  const body = content.replace(/^---[\s\S]*?---\n/, '');
  if (body.length < MIN_BODY_LENGTH) {
    warnings.push(`Body is very short (${body.length} chars, expected >${MIN_BODY_LENGTH})`);
  }
  for (const section of REQUIRED_BODY_SECTIONS) {
    if (!body.includes(section)) {
      errors.push(`Missing required body section: "${section}"`);
    }
  }

  // At least one code block
  const codeBlocks = (body.match(/```/g) || []).length / 2;
  if (codeBlocks < 1) {
    warnings.push(`No code examples found (expected at least 1)`);
  }

  return { errors, warnings };
}

const skillsDir = 'skills';
const slugs = readdirSync(skillsDir).filter(s => {
  if (s.startsWith('.') || s.endsWith('.json') || s.endsWith('.js')) return false;
  return existsSync(`${skillsDir}/${s}/skill.json`);
});

let totalErrors = 0, totalWarnings = 0, missing = 0, passed = 0;
const failedSkills = [];

for (const slug of slugs) {
  const skillMdPath = `${skillsDir}/${slug}/SKILL.md`;
  if (!existsSync(skillMdPath)) {
    console.error(`FAIL ${slug}: SKILL.md missing`);
    missing++;
    totalErrors++;
    failedSkills.push(slug);
    continue;
  }
  const content = readFileSync(skillMdPath, 'utf8');
  const { errors, warnings } = lintSkillMd(slug, content);
  if (errors.length > 0) {
    console.error(`FAIL ${slug}:`);
    for (const e of errors) console.error(`  ERROR: ${e}`);
    for (const w of warnings) console.warn(`  WARN:  ${w}`);
    totalErrors += errors.length;
    totalWarnings += warnings.length;
    failedSkills.push(slug);
  } else {
    if (warnings.length > 0) {
      console.warn(`WARN ${slug}: ${warnings.join('; ')}`);
      totalWarnings += warnings.length;
    }
    passed++;
  }
}

console.log(`\n=== SKILL.md Lint Results ===`);
console.log(`Total:    ${slugs.length}`);
console.log(`Passed:   ${passed}`);
console.log(`Failed:   ${failedSkills.length} (${missing} missing)`);
console.log(`Warnings: ${totalWarnings}`);

if (failedSkills.length > 0) {
  console.log(`\nFailed: ${failedSkills.join(', ')}`);
  process.exit(1);
} else {
  console.log(`\nAll SKILL.md files pass lint.`);
}
