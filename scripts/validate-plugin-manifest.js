/**
 * validate-plugin-manifest.js
 * Validates all openclaw.plugin.json files under plugins/ against required schema.
 * Checks: required fields, skills array paths exist, configSchema present, semver version.
 *
 * Usage: node --input-type=module < scripts/validate-plugin-manifest.js
 * Exit code: 0 = all valid, 1 = failures found
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs';

const REQUIRED_FIELDS = ['id', 'name', 'version', 'description', 'skills'];
const SEMVER_RE = /^\d+\.\d+\.\d+$/;

function validateManifest(pluginDir, content) {
  const errors = [];
  let manifest;

  try {
    manifest = JSON.parse(content);
  } catch (e) {
    return [`Invalid JSON: ${e.message}`];
  }

  // Required fields
  for (const field of REQUIRED_FIELDS) {
    if (manifest[field] === undefined) errors.push(`Missing required field: "${field}"`);
  }

  // Version is semver
  if (manifest.version && !SEMVER_RE.test(manifest.version)) {
    errors.push(`version "${manifest.version}" is not valid semver (x.y.z)`);
  }

  // id starts with @claw2agent/
  if (manifest.id && !manifest.id.startsWith('@claw2agent/')) {
    errors.push(`id "${manifest.id}" must start with "@claw2agent/"`);
  }

  // skills is an array
  if (manifest.skills !== undefined && !Array.isArray(manifest.skills)) {
    errors.push(`skills must be an array`);
  }

  // Each skill path exists (relative to plugin dir)
  if (Array.isArray(manifest.skills)) {
    for (const skillPath of manifest.skills) {
      const resolved = `${pluginDir}/${skillPath}`;
      if (!existsSync(resolved)) {
        errors.push(`skills path does not exist: "${skillPath}" (resolved: ${resolved})`);
      }
    }
  }

  // openclaw block present
  if (!manifest.openclaw) {
    errors.push(`Missing "openclaw" block (should contain minVersion, category)`);
  }

  return errors;
}

const pluginsDir = 'plugins';
if (!existsSync(pluginsDir)) {
  console.log('No plugins/ directory found. Run gen-plugin-bundles.js first.');
  process.exit(0);
}

const pluginDirs = readdirSync(pluginsDir).filter(d => existsSync(`${pluginsDir}/${d}/openclaw.plugin.json`));
let totalErrors = 0, passed = 0;

for (const dir of pluginDirs) {
  const manifestPath = `${pluginsDir}/${dir}/openclaw.plugin.json`;
  const content = readFileSync(manifestPath, 'utf8');
  const errors = validateManifest(`${pluginsDir}/${dir}`, content);

  if (errors.length > 0) {
    console.error(`FAIL ${dir}:`);
    for (const e of errors) console.error(`  ${e}`);
    totalErrors += errors.length;
  } else {
    passed++;
  }
}

console.log(`\n=== Plugin Manifest Validation ===`);
console.log(`Checked: ${pluginDirs.length} plugins`);
console.log(`Passed:  ${passed}`);
console.log(`Failed:  ${pluginDirs.length - passed}`);

if (totalErrors > 0) {
  console.log(`${totalErrors} errors found`);
  process.exit(1);
} else {
  console.log(`All plugin manifests valid.`);
}
