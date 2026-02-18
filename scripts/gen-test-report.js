/**
 * gen-test-report.js
 * Runs all handler.test.js and skillmd.test.js files, aggregates results,
 * and outputs a per-plugin summary to reports/private/<plugin-id>/test-summary.json
 * and a human-readable reports/private/test-report.md.
 *
 * Usage: node --input-type=module < scripts/gen-test-report.js
 */

import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';

const NODE_BIN = process.execPath; // use the same node binary that's running this script
const CWD = process.cwd();

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

function runTest(testPath) {
  const absPath = resolve(CWD, testPath);
  try {
    // node --test may exit non-zero even when all tests pass (e.g. timeout enforcement tests);
    // always parse TAP output rather than relying on exit code.
    const out = execSync(`${NODE_BIN} --test ${absPath} 2>&1`, {
      encoding: 'utf8',
      timeout: 120000,  // 120s: accommodates skills with real 60s timeout tests
      shell: true,
    });
    const passMatch = out.match(/# pass (\d+)/);
    const failMatch = out.match(/# fail (\d+)/);
    return {
      pass: passMatch ? parseInt(passMatch[1]) : 0,
      fail: failMatch ? parseInt(failMatch[1]) : 0,
      timedOut: false,
      error: null,
    };
  } catch (e) {
    // Distinguish subprocess timeout from actual test failures
    if (e.signal === 'SIGTERM' || e.code === 'ETIMEDOUT' || (e.message || '').includes('timed out')) {
      return { pass: 0, fail: 0, timedOut: true, error: 'TIMEOUT: subprocess exceeded 120s' };
    }
    // execSync throws on non-zero exit; stdout still has the TAP output
    const out = (e.stdout || '') + (e.stderr || '') + (e.message || '');
    const passMatch = out.match(/# pass (\d+)/);
    const failMatch = out.match(/# fail (\d+)/);
    const pass = passMatch ? parseInt(passMatch[1]) : 0;
    const fail = failMatch ? parseInt(failMatch[1]) : 1;
    return { pass, fail, timedOut: false, error: fail > 0 ? e.message?.slice(0, 200) : null };
  }
}


const skillsDir = 'skills';
const slugs = readdirSync(skillsDir).filter(s => {
  if (s.startsWith('.') || s.endsWith('.json') || s.endsWith('.js')) return false;
  return existsSync(`${skillsDir}/${s}/skill.json`);
});

// Collect results per plugin category
const byPlugin = {};
let grandTotalPass = 0, grandTotalFail = 0, grandTotalTimeout = 0;

for (const slug of slugs) {
  let cat = 'utilities-knowledge';
  try {
    const sj = JSON.parse(readFileSync(`${skillsDir}/${slug}/skill.json`, 'utf8'));
    cat = canonCat(sj.category);
  } catch {}

  if (!byPlugin[cat]) byPlugin[cat] = { skills: [], totalPass: 0, totalFail: 0, totalTimeout: 0 };

  const handlerTest = `${skillsDir}/${slug}/__tests__/handler.test.js`;
  const skillmdTest = `${skillsDir}/${slug}/__tests__/skillmd.test.js`;

  const handlerResult = existsSync(handlerTest) ? runTest(handlerTest) : { pass: 0, fail: 0, timedOut: false, error: 'missing' };
  const skillmdResult = existsSync(skillmdTest) ? runTest(skillmdTest) : { pass: 0, fail: 0, timedOut: false, error: 'missing' };

  const skillPass = handlerResult.pass + skillmdResult.pass;
  const skillFail = handlerResult.fail + skillmdResult.fail;
  const skillTimeout = (handlerResult.timedOut ? 1 : 0) + (skillmdResult.timedOut ? 1 : 0);

  byPlugin[cat].skills.push({
    slug,
    handler: handlerResult,
    skillmd: skillmdResult,
    totalPass: skillPass,
    totalFail: skillFail,
    totalTimeout: skillTimeout,
  });
  byPlugin[cat].totalPass += skillPass;
  byPlugin[cat].totalFail += skillFail;
  byPlugin[cat].totalTimeout += skillTimeout;
  grandTotalPass += skillPass;
  grandTotalFail += skillFail;
  grandTotalTimeout += skillTimeout;

  const status = skillTimeout > 0 ? 'TIMEOUT' : skillFail === 0 ? 'PASS' : 'FAIL';
  console.log(`${status} ${slug}: ${skillPass} pass, ${skillFail} fail${skillTimeout > 0 ? ` (${skillTimeout} timed out)` : ''}`);
}

// Write per-plugin JSON summaries
mkdirSync('reports/private', { recursive: true });

for (const [pluginId, data] of Object.entries(byPlugin)) {
  const dir = `reports/private/plugin-${pluginId}`;
  mkdirSync(dir, { recursive: true });
  const total = data.totalPass + data.totalFail;
  writeFileSync(`${dir}/test-summary.json`, JSON.stringify({
    pluginId,
    generatedAt: new Date().toISOString(),
    totalPass: data.totalPass,
    totalFail: data.totalFail,
    totalTimeout: data.totalTimeout,
    passRate: total > 0 ? ((data.totalPass / total) * 100).toFixed(1) + '%' : 'N/A',
    skills: data.skills,
  }, null, 2));
}

// Write aggregate markdown report
const pluginRows = Object.entries(byPlugin).map(([id, d]) => {
  const total = d.totalPass + d.totalFail;
  const rate = total > 0 ? ((d.totalPass / total) * 100).toFixed(1) + '%' : 'N/A';
  const status = d.totalTimeout > 0 ? 'TIMEOUT' : d.totalFail === 0 ? 'PASS' : 'FAIL';
  return `| \`${id}\` | ${d.skills.length} | ${d.totalPass} | ${d.totalFail} | ${d.totalTimeout} | ${rate} | ${status} |`;
}).join('\n');

const grandTotal = grandTotalPass + grandTotalFail;
const report = `# Test Report

**Generated:** ${new Date().toISOString()}
**Total skills:** ${slugs.length}
**Grand total pass:** ${grandTotalPass}
**Grand total fail:** ${grandTotalFail}
**Grand total timeout:** ${grandTotalTimeout}
**Overall pass rate:** ${grandTotal > 0 ? ((grandTotalPass / grandTotal) * 100).toFixed(1) : 0}%

## Results by Plugin

| Plugin | Skills | Pass | Fail | Timeout | Rate | Status |
|--------|--------|------|------|---------|------|--------|
${pluginRows}

## Conclusion

${grandTotalFail === 0 ? 'All tests pass. Ready for ClawHub publication.' : `${grandTotalFail} test(s) failing. Fix before publishing.`}
`;

writeFileSync('reports/private/test-report.md', report);
console.log(`\nReport written to reports/private/test-report.md`);
console.log(`Grand total: ${grandTotalPass} pass, ${grandTotalFail} fail`);
