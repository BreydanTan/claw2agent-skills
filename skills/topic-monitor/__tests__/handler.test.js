import assert from 'node:assert/strict';
import { execute, _resetForTesting } from '../handler.js';

/**
 * Topic Monitor Skill - Handler Tests
 *
 * Uses Node.js built-in assert module.
 * Run with: node --test __tests__/handler.test.js
 */

// Reset state before each test group
function reset() {
  _resetForTesting();
}

// ─── watch action ────────────────────────────────────────────────────────────

async function testWatchValid() {
  reset();
  const result = await execute({
    action: 'watch',
    topic: 'AI news',
    keywords: ['artificial intelligence', 'machine learning']
  }, {});

  assert.equal(result.metadata.success, true);
  assert.equal(result.metadata.topic, 'AI news');
  assert.deepEqual(result.metadata.keywords, ['artificial intelligence', 'machine learning']);
  assert.equal(result.metadata.totalTopics, 1);
  assert.ok(result.result.includes('Now watching'));
  console.log('PASS: testWatchValid');
}

async function testWatchMissingTopic() {
  reset();
  const result = await execute({ action: 'watch', keywords: ['test'] }, {});

  assert.equal(result.metadata.success, false);
  assert.equal(result.metadata.error, 'MISSING_TOPIC');
  console.log('PASS: testWatchMissingTopic');
}

async function testWatchEmptyTopic() {
  reset();
  const result = await execute({ action: 'watch', topic: '  ', keywords: ['test'] }, {});

  assert.equal(result.metadata.success, false);
  assert.equal(result.metadata.error, 'MISSING_TOPIC');
  console.log('PASS: testWatchEmptyTopic');
}

async function testWatchMissingKeywords() {
  reset();
  const result = await execute({ action: 'watch', topic: 'test topic' }, {});

  assert.equal(result.metadata.success, false);
  assert.equal(result.metadata.error, 'MISSING_KEYWORDS');
  console.log('PASS: testWatchMissingKeywords');
}

async function testWatchEmptyKeywords() {
  reset();
  const result = await execute({ action: 'watch', topic: 'test topic', keywords: [] }, {});

  assert.equal(result.metadata.success, false);
  assert.equal(result.metadata.error, 'MISSING_KEYWORDS');
  console.log('PASS: testWatchEmptyKeywords');
}

async function testWatchDuplicate() {
  reset();
  await execute({ action: 'watch', topic: 'dup', keywords: ['word'] }, {});
  const result = await execute({ action: 'watch', topic: 'dup', keywords: ['other'] }, {});

  assert.equal(result.metadata.success, false);
  assert.equal(result.metadata.error, 'DUPLICATE_TOPIC');
  console.log('PASS: testWatchDuplicate');
}

async function testWatchTooManyKeywords() {
  reset();
  const keywords = Array.from({ length: 25 }, (_, i) => `keyword${i}`);
  const result = await execute({ action: 'watch', topic: 'big', keywords }, {});

  assert.equal(result.metadata.success, false);
  assert.equal(result.metadata.error, 'TOO_MANY_KEYWORDS');
  console.log('PASS: testWatchTooManyKeywords');
}

async function testWatchCaseSensitive() {
  reset();
  const result = await execute({
    action: 'watch',
    topic: 'case-test',
    keywords: ['Test'],
    caseSensitive: true
  }, {});

  assert.equal(result.metadata.success, true);
  assert.equal(result.metadata.caseSensitive, true);
  console.log('PASS: testWatchCaseSensitive');
}

async function testWatchTooManyTopics() {
  reset();
  // Create 50 topics
  for (let i = 0; i < 50; i++) {
    await execute({ action: 'watch', topic: `topic-${i}`, keywords: ['kw'] }, {});
  }
  const result = await execute({ action: 'watch', topic: 'one-too-many', keywords: ['kw'] }, {});

  assert.equal(result.metadata.success, false);
  assert.equal(result.metadata.error, 'TOO_MANY_TOPICS');
  console.log('PASS: testWatchTooManyTopics');
}

// ─── unwatch action ──────────────────────────────────────────────────────────

async function testUnwatchExisting() {
  reset();
  await execute({ action: 'watch', topic: 'removeme', keywords: ['kw'] }, {});
  const result = await execute({ action: 'unwatch', topic: 'removeme' }, {});

  assert.equal(result.metadata.success, true);
  assert.equal(result.metadata.topic, 'removeme');
  assert.ok(result.result.includes('Stopped watching'));
  console.log('PASS: testUnwatchExisting');
}

async function testUnwatchNonExisting() {
  reset();
  const result = await execute({ action: 'unwatch', topic: 'ghost' }, {});

  assert.equal(result.metadata.success, false);
  assert.equal(result.metadata.error, 'TOPIC_NOT_FOUND');
  console.log('PASS: testUnwatchNonExisting');
}

async function testUnwatchMissingTopic() {
  reset();
  const result = await execute({ action: 'unwatch' }, {});

  assert.equal(result.metadata.success, false);
  assert.equal(result.metadata.error, 'MISSING_TOPIC');
  console.log('PASS: testUnwatchMissingTopic');
}

// ─── list action ─────────────────────────────────────────────────────────────

async function testListEmpty() {
  reset();
  const result = await execute({ action: 'list' }, {});

  assert.equal(result.metadata.success, true);
  assert.equal(result.metadata.topicCount, 0);
  assert.ok(result.result.includes('No topics'));
  console.log('PASS: testListEmpty');
}

async function testListWithTopics() {
  reset();
  await execute({ action: 'watch', topic: 'alpha', keywords: ['a1', 'a2'] }, {});
  await execute({ action: 'watch', topic: 'beta', keywords: ['b1'] }, {});
  const result = await execute({ action: 'list' }, {});

  assert.equal(result.metadata.success, true);
  assert.equal(result.metadata.topicCount, 2);
  assert.ok(result.result.includes('alpha'));
  assert.ok(result.result.includes('beta'));
  console.log('PASS: testListWithTopics');
}

// ─── check action ────────────────────────────────────────────────────────────

async function testCheckMatchingContent() {
  reset();
  await execute({ action: 'watch', topic: 'weather', keywords: ['rain', 'storm'] }, {});
  const result = await execute({
    action: 'check',
    content: 'Today there is heavy rain in the forecast with a storm approaching from the west.',
    source: 'weather-api'
  }, {});

  assert.equal(result.metadata.success, true);
  assert.equal(result.metadata.matchedTopics, 1);
  assert.equal(result.metadata.results[0].topic, 'weather');
  assert.ok(result.metadata.results[0].matchedKeywords.includes('rain'));
  assert.ok(result.metadata.results[0].matchedKeywords.includes('storm'));
  console.log('PASS: testCheckMatchingContent');
}

async function testCheckNoMatch() {
  reset();
  await execute({ action: 'watch', topic: 'weather', keywords: ['rain', 'storm'] }, {});
  const result = await execute({
    action: 'check',
    content: 'The sun is shining brightly today with clear skies.',
    source: 'weather-api'
  }, {});

  assert.equal(result.metadata.success, true);
  assert.equal(result.metadata.matchedTopics, 0);
  console.log('PASS: testCheckNoMatch');
}

async function testCheckMultipleTopics() {
  reset();
  await execute({ action: 'watch', topic: 'tech', keywords: ['javascript', 'python'] }, {});
  await execute({ action: 'watch', topic: 'science', keywords: ['physics', 'quantum'] }, {});

  const result = await execute({
    action: 'check',
    content: 'A new javascript framework was released while quantum computing advances continue.',
    source: 'news-feed'
  }, {});

  assert.equal(result.metadata.success, true);
  assert.equal(result.metadata.matchedTopics, 2);

  const topicNames = result.metadata.results.map(r => r.topic);
  assert.ok(topicNames.includes('tech'));
  assert.ok(topicNames.includes('science'));
  console.log('PASS: testCheckMultipleTopics');
}

async function testCheckCaseSensitivity() {
  reset();
  // Case-sensitive topic: "JavaScript" should NOT match "javascript"
  await execute({
    action: 'watch',
    topic: 'case-strict',
    keywords: ['JavaScript'],
    caseSensitive: true
  }, {});

  const noMatch = await execute({
    action: 'check',
    content: 'We love javascript and its ecosystem.',
    source: 'test'
  }, {});
  assert.equal(noMatch.metadata.matchedTopics, 0);

  const hasMatch = await execute({
    action: 'check',
    content: 'We love JavaScript and its ecosystem.',
    source: 'test'
  }, {});
  assert.equal(hasMatch.metadata.matchedTopics, 1);
  console.log('PASS: testCheckCaseSensitivity');
}

async function testCheckWordBoundary() {
  reset();
  // "cat" should NOT match inside "category"
  await execute({ action: 'watch', topic: 'animals', keywords: ['cat'] }, {});

  const noPartial = await execute({
    action: 'check',
    content: 'The category of items has been updated.',
    source: 'test'
  }, {});
  assert.equal(noPartial.metadata.matchedTopics, 0);

  const wholeWord = await execute({
    action: 'check',
    content: 'The cat sat on the mat.',
    source: 'test'
  }, {});
  assert.equal(wholeWord.metadata.matchedTopics, 1);
  console.log('PASS: testCheckWordBoundary');
}

async function testCheckMissingContent() {
  reset();
  const result = await execute({ action: 'check' }, {});

  assert.equal(result.metadata.success, false);
  assert.equal(result.metadata.error, 'MISSING_CONTENT');
  console.log('PASS: testCheckMissingContent');
}

async function testCheckSnippetExtraction() {
  reset();
  await execute({ action: 'watch', topic: 'snippet-test', keywords: ['target'] }, {});

  // Create content with the keyword surrounded by known context (spaces for word boundaries)
  const before = 'word '.repeat(15); // 75 chars
  const after = ' word'.repeat(15);  // 75 chars
  const content = `${before}target${after}`;
  const result = await execute({
    action: 'check',
    content,
    source: 'test'
  }, {});

  assert.equal(result.metadata.matchedTopics, 1);
  // Snippet should contain the keyword
  assert.ok(result.metadata.results[0].snippets[0].includes('target'));
  // Snippet should be shorter than the full content (50 chars context on each side)
  assert.ok(result.metadata.results[0].snippets[0].length < content.length);
  console.log('PASS: testCheckSnippetExtraction');
}

// ─── matches action ──────────────────────────────────────────────────────────

async function testMatchesExistingTopic() {
  reset();
  await execute({ action: 'watch', topic: 'tech', keywords: ['code'] }, {});
  await execute({ action: 'check', content: 'Write some code today.', source: 's1' }, {});
  await execute({ action: 'check', content: 'More code to review.', source: 's2' }, {});

  const result = await execute({ action: 'matches', topic: 'tech' }, {});

  assert.equal(result.metadata.success, true);
  assert.equal(result.metadata.totalMatches, 2);
  assert.equal(result.metadata.returnedCount, 2);
  console.log('PASS: testMatchesExistingTopic');
}

async function testMatchesWithLimit() {
  reset();
  await execute({ action: 'watch', topic: 'tech', keywords: ['code'] }, {});
  await execute({ action: 'check', content: 'Write some code today.', source: 's1' }, {});
  await execute({ action: 'check', content: 'More code to review.', source: 's2' }, {});
  await execute({ action: 'check', content: 'Even more code examples.', source: 's3' }, {});

  const result = await execute({ action: 'matches', topic: 'tech', limit: 2 }, {});

  assert.equal(result.metadata.success, true);
  assert.equal(result.metadata.totalMatches, 3);
  assert.equal(result.metadata.returnedCount, 2);
  console.log('PASS: testMatchesWithLimit');
}

async function testMatchesNonExistingTopic() {
  reset();
  const result = await execute({ action: 'matches', topic: 'nope' }, {});

  assert.equal(result.metadata.success, false);
  assert.equal(result.metadata.error, 'TOPIC_NOT_FOUND');
  console.log('PASS: testMatchesNonExistingTopic');
}

async function testMatchesNoMatchesYet() {
  reset();
  await execute({ action: 'watch', topic: 'empty', keywords: ['word'] }, {});
  const result = await execute({ action: 'matches', topic: 'empty' }, {});

  assert.equal(result.metadata.success, true);
  assert.equal(result.metadata.matchCount, 0);
  console.log('PASS: testMatchesNoMatchesYet');
}

// ─── stats action ────────────────────────────────────────────────────────────

async function testStatsEmpty() {
  reset();
  const result = await execute({ action: 'stats' }, {});

  assert.equal(result.metadata.success, true);
  assert.equal(result.metadata.totalTopics, 0);
  assert.equal(result.metadata.totalMatches, 0);
  console.log('PASS: testStatsEmpty');
}

async function testStatsWithData() {
  reset();
  await execute({ action: 'watch', topic: 'tech', keywords: ['code', 'software'] }, {});
  await execute({ action: 'watch', topic: 'science', keywords: ['physics', 'code'] }, {});
  await execute({ action: 'check', content: 'Writing code for the software project.', source: 'dev' }, {});
  await execute({ action: 'check', content: 'The physics of code compilation.', source: 'paper' }, {});

  const result = await execute({ action: 'stats' }, {});

  assert.equal(result.metadata.success, true);
  assert.equal(result.metadata.totalTopics, 2);
  assert.ok(result.metadata.totalMatches > 0);
  assert.ok(result.metadata.totalKeywords > 0);
  assert.ok(result.metadata.uniqueKeywords > 0);
  assert.ok(result.metadata.mostActiveTopics.length > 0);
  assert.ok(result.metadata.keywordCoverage.length > 0);

  // "code" keyword should appear in both topics
  const codeEntry = result.metadata.keywordCoverage.find(k => k.keyword === 'code');
  assert.ok(codeEntry);
  assert.equal(codeEntry.topicCount, 2);
  console.log('PASS: testStatsWithData');
}

// ─── invalid action ──────────────────────────────────────────────────────────

async function testInvalidAction() {
  reset();
  const result = await execute({ action: 'explode' }, {});

  assert.equal(result.metadata.success, false);
  assert.equal(result.metadata.error, 'INVALID_ACTION');
  console.log('PASS: testInvalidAction');
}

async function testMissingAction() {
  reset();
  const result = await execute({}, {});

  assert.equal(result.metadata.success, false);
  assert.equal(result.metadata.error, 'INVALID_ACTION');
  console.log('PASS: testMissingAction');
}

// ─── ring buffer test ────────────────────────────────────────────────────────

async function testMatchesRingBuffer() {
  reset();
  await execute({ action: 'watch', topic: 'ring', keywords: ['hit'] }, {});

  // Add 502 matches to verify ring buffer caps at 500
  for (let i = 0; i < 502; i++) {
    await execute({ action: 'check', content: `hit number ${i}`, source: `s${i}` }, {});
  }

  const result = await execute({ action: 'matches', topic: 'ring' }, {});
  assert.equal(result.metadata.totalMatches, 500);
  // Oldest two should have been evicted; the first remaining should be from s2
  assert.equal(result.metadata.matches[0].source, 's2');
  console.log('PASS: testMatchesRingBuffer');
}

// ─── Run all tests ───────────────────────────────────────────────────────────

async function runAllTests() {
  console.log('Running Topic Monitor handler tests...\n');

  // watch tests
  await testWatchValid();
  await testWatchMissingTopic();
  await testWatchEmptyTopic();
  await testWatchMissingKeywords();
  await testWatchEmptyKeywords();
  await testWatchDuplicate();
  await testWatchTooManyKeywords();
  await testWatchCaseSensitive();
  await testWatchTooManyTopics();

  // unwatch tests
  await testUnwatchExisting();
  await testUnwatchNonExisting();
  await testUnwatchMissingTopic();

  // list tests
  await testListEmpty();
  await testListWithTopics();

  // check tests
  await testCheckMatchingContent();
  await testCheckNoMatch();
  await testCheckMultipleTopics();
  await testCheckCaseSensitivity();
  await testCheckWordBoundary();
  await testCheckMissingContent();
  await testCheckSnippetExtraction();

  // matches tests
  await testMatchesExistingTopic();
  await testMatchesWithLimit();
  await testMatchesNonExistingTopic();
  await testMatchesNoMatchesYet();

  // stats tests
  await testStatsEmpty();
  await testStatsWithData();

  // invalid action tests
  await testInvalidAction();
  await testMissingAction();

  // ring buffer test
  await testMatchesRingBuffer();

  console.log('\nAll tests passed!');
}

runAllTests().catch(err => {
  console.error('TEST FAILURE:', err);
  process.exit(1);
});
