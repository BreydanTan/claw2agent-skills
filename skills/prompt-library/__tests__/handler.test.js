/**
 * Tests for the Prompt Library skill handler.
 *
 * Uses Node.js built-in assert module.
 * Run with: node skills/prompt-library/__tests__/handler.test.js
 */

import assert from 'node:assert/strict';
import { execute } from '../handler.js';

const context = {};

/**
 * Simple test runner helper.
 */
let passed = 0;
let failed = 0;
const failures = [];

async function test(description, fn) {
  try {
    await fn();
    passed++;
    console.log(`  PASS: ${description}`);
  } catch (err) {
    failed++;
    failures.push({ description, error: err });
    console.error(`  FAIL: ${description}`);
    console.error(`        ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// add action
// ---------------------------------------------------------------------------
console.log('\n--- add action ---');

await test('add: valid prompt is added successfully', async () => {
  const result = await execute({
    action: 'add',
    name: 'greeting',
    template: 'Hello, {{name}}! Welcome to {{place}}.',
    category: 'general',
    description: 'A friendly greeting',
    tags: ['greeting', 'welcome']
  }, context);

  assert.equal(result.metadata.success, true);
  assert.equal(result.metadata.action, 'add');
  assert.equal(result.metadata.name, 'greeting');
  assert.equal(result.metadata.isUpdate, false);
  assert.equal(result.metadata.version, 1);
  assert.deepEqual(result.metadata.variables, ['name', 'place']);
  assert.ok(result.result.includes('added'));
});

await test('add: updating an existing prompt increments version', async () => {
  const result = await execute({
    action: 'add',
    name: 'greeting',
    template: 'Hi {{name}}, welcome to {{place}} on {{day}}!',
    category: 'general',
    description: 'Updated greeting'
  }, context);

  assert.equal(result.metadata.success, true);
  assert.equal(result.metadata.isUpdate, true);
  assert.equal(result.metadata.version, 2);
  assert.deepEqual(result.metadata.variables, ['day', 'name', 'place']);
});

await test('add: missing name returns error', async () => {
  const result = await execute({
    action: 'add',
    template: 'Some template'
  }, context);

  assert.equal(result.metadata.success, false);
  assert.equal(result.metadata.error, 'MISSING_NAME');
  assert.ok(result.result.includes('Error'));
});

await test('add: empty name returns error', async () => {
  const result = await execute({
    action: 'add',
    name: '   ',
    template: 'Some template'
  }, context);

  assert.equal(result.metadata.success, false);
  assert.equal(result.metadata.error, 'MISSING_NAME');
});

await test('add: missing template returns error', async () => {
  const result = await execute({
    action: 'add',
    name: 'no-template'
  }, context);

  assert.equal(result.metadata.success, false);
  assert.equal(result.metadata.error, 'MISSING_TEMPLATE');
  assert.ok(result.result.includes('Error'));
});

await test('add: empty template returns error', async () => {
  const result = await execute({
    action: 'add',
    name: 'empty-template',
    template: ''
  }, context);

  assert.equal(result.metadata.success, false);
  assert.equal(result.metadata.error, 'MISSING_TEMPLATE');
});

await test('add: template without variables is handled correctly', async () => {
  const result = await execute({
    action: 'add',
    name: 'static-prompt',
    template: 'This is a static prompt with no variables.',
    category: 'static'
  }, context);

  assert.equal(result.metadata.success, true);
  assert.deepEqual(result.metadata.variables, []);
  assert.ok(result.result.includes('No template variables detected'));
});

// ---------------------------------------------------------------------------
// get action
// ---------------------------------------------------------------------------
console.log('\n--- get action ---');

await test('get: retrieves an existing prompt', async () => {
  const result = await execute({
    action: 'get',
    name: 'greeting'
  }, context);

  assert.equal(result.metadata.success, true);
  assert.equal(result.metadata.action, 'get');
  assert.equal(result.metadata.prompt.name, 'greeting');
  assert.equal(result.metadata.prompt.version, 2);
  assert.ok(result.result.includes('greeting'));
});

await test('get: non-existing prompt returns not found', async () => {
  const result = await execute({
    action: 'get',
    name: 'non-existent'
  }, context);

  assert.equal(result.metadata.success, false);
  assert.equal(result.metadata.error, 'NOT_FOUND');
  assert.ok(result.result.includes('No prompt found'));
});

await test('get: missing name returns error', async () => {
  const result = await execute({
    action: 'get'
  }, context);

  assert.equal(result.metadata.success, false);
  assert.equal(result.metadata.error, 'MISSING_NAME');
});

// ---------------------------------------------------------------------------
// search action
// ---------------------------------------------------------------------------
console.log('\n--- search action ---');

await test('search: finds matching prompts', async () => {
  const result = await execute({
    action: 'search',
    query: 'greeting'
  }, context);

  assert.equal(result.metadata.success, true);
  assert.equal(result.metadata.action, 'search');
  assert.ok(result.metadata.matchCount > 0);
  assert.ok(result.result.includes('greeting'));
});

await test('search: finds prompts by tag content', async () => {
  const result = await execute({
    action: 'search',
    query: 'welcome'
  }, context);

  assert.equal(result.metadata.success, true);
  assert.ok(result.metadata.matchCount > 0);
});

await test('search: no match returns empty results', async () => {
  const result = await execute({
    action: 'search',
    query: 'xyznonexistent123'
  }, context);

  assert.equal(result.metadata.success, true);
  assert.equal(result.metadata.matchCount, 0);
  assert.ok(result.result.includes('No prompts match'));
});

await test('search: missing query returns error', async () => {
  const result = await execute({
    action: 'search'
  }, context);

  assert.equal(result.metadata.success, false);
  assert.equal(result.metadata.error, 'MISSING_QUERY');
});

// ---------------------------------------------------------------------------
// list action
// ---------------------------------------------------------------------------
console.log('\n--- list action ---');

await test('list: returns all prompts', async () => {
  const result = await execute({
    action: 'list'
  }, context);

  assert.equal(result.metadata.success, true);
  assert.equal(result.metadata.action, 'list');
  assert.ok(result.metadata.count >= 2); // greeting + static-prompt at minimum
  assert.ok(result.result.includes('All prompts'));
});

await test('list: filter by category returns matching prompts', async () => {
  const result = await execute({
    action: 'list',
    category: 'general'
  }, context);

  assert.equal(result.metadata.success, true);
  assert.ok(result.metadata.count >= 1);
  assert.equal(result.metadata.category, 'general');
  // Verify all returned prompts are in the correct category
  for (const prompt of result.metadata.prompts) {
    assert.equal(prompt.category, 'general');
  }
});

await test('list: filter by non-existing category returns empty', async () => {
  const result = await execute({
    action: 'list',
    category: 'nonexistent-category'
  }, context);

  assert.equal(result.metadata.success, true);
  assert.equal(result.metadata.count, 0);
  assert.ok(result.result.includes('No prompts found'));
});

// ---------------------------------------------------------------------------
// delete action
// ---------------------------------------------------------------------------
console.log('\n--- delete action ---');

await test('delete: removes an existing prompt', async () => {
  // First add a prompt to delete
  await execute({
    action: 'add',
    name: 'to-delete',
    template: 'This will be deleted.',
    category: 'temp'
  }, context);

  const result = await execute({
    action: 'delete',
    name: 'to-delete'
  }, context);

  assert.equal(result.metadata.success, true);
  assert.equal(result.metadata.action, 'delete');
  assert.equal(result.metadata.name, 'to-delete');
  assert.ok(result.result.includes('deleted'));

  // Verify it is gone
  const getResult = await execute({ action: 'get', name: 'to-delete' }, context);
  assert.equal(getResult.metadata.success, false);
  assert.equal(getResult.metadata.error, 'NOT_FOUND');
});

await test('delete: non-existing prompt returns not found', async () => {
  const result = await execute({
    action: 'delete',
    name: 'does-not-exist'
  }, context);

  assert.equal(result.metadata.success, false);
  assert.equal(result.metadata.error, 'NOT_FOUND');
  assert.ok(result.result.includes('Nothing to delete'));
});

await test('delete: missing name returns error', async () => {
  const result = await execute({
    action: 'delete'
  }, context);

  assert.equal(result.metadata.success, false);
  assert.equal(result.metadata.error, 'MISSING_NAME');
});

// ---------------------------------------------------------------------------
// render action
// ---------------------------------------------------------------------------
console.log('\n--- render action ---');

await test('render: renders template with all variables provided', async () => {
  const result = await execute({
    action: 'render',
    name: 'greeting',
    variables: {
      name: 'Alice',
      place: 'Wonderland',
      day: 'Monday'
    }
  }, context);

  assert.equal(result.metadata.success, true);
  assert.equal(result.metadata.action, 'render');
  assert.ok(result.result.includes('Alice'));
  assert.ok(result.result.includes('Wonderland'));
  assert.ok(result.result.includes('Monday'));
  assert.ok(!result.result.includes('{{'));
});

await test('render: missing variables returns error with details', async () => {
  const result = await execute({
    action: 'render',
    name: 'greeting',
    variables: {
      name: 'Alice'
    }
  }, context);

  assert.equal(result.metadata.success, false);
  assert.equal(result.metadata.error, 'MISSING_VARIABLES');
  assert.ok(result.metadata.missingVariables.includes('day'));
  assert.ok(result.metadata.missingVariables.includes('place'));
  assert.ok(result.result.includes('Missing required variables'));
});

await test('render: non-existing prompt returns not found', async () => {
  const result = await execute({
    action: 'render',
    name: 'nonexistent',
    variables: {}
  }, context);

  assert.equal(result.metadata.success, false);
  assert.equal(result.metadata.error, 'NOT_FOUND');
});

await test('render: prompt with no variables renders without variables object', async () => {
  const result = await execute({
    action: 'render',
    name: 'static-prompt'
  }, context);

  assert.equal(result.metadata.success, true);
  assert.equal(result.result, 'This is a static prompt with no variables.');
});

await test('render: missing name returns error', async () => {
  const result = await execute({
    action: 'render'
  }, context);

  assert.equal(result.metadata.success, false);
  assert.equal(result.metadata.error, 'MISSING_NAME');
});

// ---------------------------------------------------------------------------
// categories action
// ---------------------------------------------------------------------------
console.log('\n--- categories action ---');

await test('categories: lists all unique categories', async () => {
  const result = await execute({
    action: 'categories'
  }, context);

  assert.equal(result.metadata.success, true);
  assert.equal(result.metadata.action, 'categories');
  assert.ok(result.metadata.count >= 2); // general, static at minimum
  assert.ok(result.metadata.categories.includes('general'));
  assert.ok(result.metadata.categories.includes('static'));
  assert.ok(result.result.includes('Categories'));
});

await test('categories: returns counts per category', async () => {
  const result = await execute({
    action: 'categories'
  }, context);

  assert.equal(result.metadata.success, true);
  assert.ok(typeof result.metadata.categoryCounts === 'object');
  assert.ok(result.metadata.categoryCounts['general'] >= 1);
});

// Test empty categories after clearing the store
await test('categories: empty store returns no categories', async () => {
  // Delete all prompts to test empty state
  const listResult = await execute({ action: 'list' }, context);
  for (const prompt of listResult.metadata.prompts) {
    await execute({ action: 'delete', name: prompt.name }, context);
  }

  const result = await execute({
    action: 'categories'
  }, context);

  assert.equal(result.metadata.success, true);
  assert.equal(result.metadata.count, 0);
  assert.deepEqual(result.metadata.categories, []);
  assert.ok(result.result.includes('empty'));
});

// ---------------------------------------------------------------------------
// list: empty state
// ---------------------------------------------------------------------------
console.log('\n--- list: empty state ---');

await test('list: empty store returns empty result', async () => {
  const result = await execute({
    action: 'list'
  }, context);

  assert.equal(result.metadata.success, true);
  assert.equal(result.metadata.count, 0);
  assert.ok(result.result.includes('empty'));
});

// ---------------------------------------------------------------------------
// invalid action
// ---------------------------------------------------------------------------
console.log('\n--- invalid action ---');

await test('invalid action returns error', async () => {
  const result = await execute({
    action: 'unknown'
  }, context);

  assert.equal(result.metadata.success, false);
  assert.equal(result.metadata.error, 'INVALID_ACTION');
  assert.ok(result.result.includes('Invalid action'));
});

await test('missing action returns error', async () => {
  const result = await execute({}, context);

  assert.equal(result.metadata.success, false);
  assert.equal(result.metadata.error, 'INVALID_ACTION');
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n--- Results: ${passed} passed, ${failed} failed ---`);

if (failures.length > 0) {
  console.error('\nFailed tests:');
  for (const f of failures) {
    console.error(`  - ${f.description}: ${f.error.message}`);
  }
  process.exit(1);
} else {
  console.log('\nAll tests passed.');
  process.exit(0);
}
