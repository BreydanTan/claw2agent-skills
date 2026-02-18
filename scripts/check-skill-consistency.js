/**
 * check-skill-consistency.js
 * Verifies that SKILL.md is consistent with skill.json and handler.js:
 * - SKILL.md name matches slug
 * - SKILL.md openclaw.category matches normalized skill.json category
 * - SKILL.md openclaw.layer matches skill.json layer
 *
 * Usage: node --input-type=module < scripts/check-skill-consistency.js
 * Exit code: 0 = all consistent, 1 = inconsistencies found
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs';

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
function canonCat(raw) {
  return CATEGORY_MAP[raw] || raw?.toLowerCase().replace(/\s+/g, '-') || 'utilities-knowledge';
}

function parseFrontmatterMeta(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;
  const fm = {};
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    fm[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  try { fm._meta = JSON.parse(fm.metadata || '{}'); } catch { fm._meta = {}; }
  return fm;
}

const skillsDir = 'skills';
const slugs = readdirSync(skillsDir).filter(s => {
  if (s.startsWith('.') || s.endsWith('.json') || s.endsWith('.js')) return false;
  return existsSync(`${skillsDir}/${s}/skill.json`);
});

let totalIssues = 0, checked = 0;

for (const slug of slugs) {
  const skillMdPath = `${skillsDir}/${slug}/SKILL.md`;
  if (!existsSync(skillMdPath)) continue; // handled by lint-skill-md

  const fm = parseFrontmatterMeta(readFileSync(skillMdPath, 'utf8'));
  if (!fm) { console.error(`FAIL ${slug}: Cannot parse SKILL.md frontmatter`); totalIssues++; continue; }

  const skillIssues = [];

  // name vs slug
  if (fm.name && fm.name !== slug) {
    skillIssues.push(`name mismatch: SKILL.md="${fm.name}" vs slug="${slug}"`);
  }

  if (existsSync(`${skillsDir}/${slug}/skill.json`)) {
    const sj = JSON.parse(readFileSync(`${skillsDir}/${slug}/skill.json`, 'utf8'));

    // category consistency
    const expectedCat = canonCat(sj.category);
    const actualCat = fm._meta['openclaw.category'];
    if (actualCat && actualCat !== expectedCat) {
      skillIssues.push(`category mismatch: SKILL.md="${actualCat}" vs skill.json="${expectedCat}" (raw: "${sj.category}")`);
    }

    // layer consistency
    const expectedLayer = sj.layer || 'L0';
    const actualLayer = fm._meta['openclaw.layer'];
    if (actualLayer && actualLayer !== expectedLayer) {
      skillIssues.push(`layer mismatch: SKILL.md="${actualLayer}" vs skill.json="${expectedLayer}"`);
    }
  }

  if (skillIssues.length > 0) {
    console.error(`FAIL ${slug}:`);
    for (const i of skillIssues) console.error(`  ${i}`);
    totalIssues += skillIssues.length;
  }
  checked++;
}

console.log(`\n=== Consistency Check Results ===`);
console.log(`Checked: ${checked} skills`);
if (totalIssues === 0) {
  console.log(`All consistent.`);
} else {
  console.log(`${totalIssues} inconsistencies found`);
  process.exit(1);
}
