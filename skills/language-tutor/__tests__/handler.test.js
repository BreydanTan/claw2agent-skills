/**
 * Language Tutor Skill -- Handler Tests
 *
 * Uses Node.js built-in assert module. No external dependencies required.
 * Run with: node skills/language-tutor/__tests__/handler.test.js
 */

import assert from 'node:assert';
import { execute, _resetStore, _getStore, _getPendingQuiz } from '../handler.js';

let passed = 0;
let failed = 0;
const failures = [];

async function test(name, fn) {
  _resetStore();
  try {
    await fn();
    passed++;
    console.log(`  PASS: ${name}`);
  } catch (err) {
    failed++;
    failures.push({ name, error: err });
    console.log(`  FAIL: ${name}`);
    console.log(`        ${err.message}`);
  }
}

/**
 * Helper: add a set of vocabulary words for tests that need pre-populated data.
 */
async function addSampleVocab() {
  await execute({ action: 'add_vocab', word: 'hola', translation: 'hello', language: 'spanish', example: 'Hola, como estas?', tags: ['greetings'] }, {});
  await execute({ action: 'add_vocab', word: 'gato', translation: 'cat', language: 'spanish', example: 'El gato es negro.', tags: ['animals'] }, {});
  await execute({ action: 'add_vocab', word: 'perro', translation: 'dog', language: 'spanish', tags: ['animals'] }, {});
  await execute({ action: 'add_vocab', word: 'casa', translation: 'house', language: 'spanish', example: 'La casa es grande.', tags: ['places'] }, {});
  await execute({ action: 'add_vocab', word: 'bonjour', translation: 'hello', language: 'french', tags: ['greetings'] }, {});
}

// ---------------------------------------------------------------------------
// add_vocab tests
// ---------------------------------------------------------------------------
console.log('\n--- add_vocab ---');

await test('add_vocab: valid word', async () => {
  const res = await execute({
    action: 'add_vocab',
    word: 'hola',
    translation: 'hello',
    language: 'spanish',
    example: 'Hola, como estas?',
    tags: ['greetings']
  }, {});

  assert.strictEqual(res.metadata.success, true);
  assert.strictEqual(res.metadata.action, 'add_vocab');
  assert.strictEqual(res.metadata.word, 'hola');
  assert.strictEqual(res.metadata.language, 'spanish');
  assert.strictEqual(res.metadata.totalVocab, 1);
  assert.ok(res.result.includes('hola'));

  // Verify the entry in the store
  const store = _getStore();
  assert.strictEqual(store.size, 1);
  const entry = store.get('hola');
  assert.strictEqual(entry.translation, 'hello');
  assert.strictEqual(entry.level, 0);
  assert.strictEqual(entry.correctCount, 0);
  assert.strictEqual(entry.incorrectCount, 0);
  assert.ok(entry.example === 'Hola, como estas?');
  assert.deepStrictEqual(entry.tags, ['greetings']);
});

await test('add_vocab: missing word', async () => {
  const res = await execute({
    action: 'add_vocab',
    translation: 'hello'
  }, {});

  assert.strictEqual(res.metadata.success, false);
  assert.strictEqual(res.metadata.error, 'MISSING_WORD');
});

await test('add_vocab: missing translation', async () => {
  const res = await execute({
    action: 'add_vocab',
    word: 'hola'
  }, {});

  assert.strictEqual(res.metadata.success, false);
  assert.strictEqual(res.metadata.error, 'MISSING_TRANSLATION');
});

await test('add_vocab: duplicate word', async () => {
  await execute({ action: 'add_vocab', word: 'hola', translation: 'hello', language: 'spanish' }, {});
  const res = await execute({ action: 'add_vocab', word: 'hola', translation: 'hi', language: 'spanish' }, {});

  assert.strictEqual(res.metadata.success, false);
  assert.strictEqual(res.metadata.error, 'DUPLICATE_WORD');
});

await test('add_vocab: default language is "unknown"', async () => {
  const res = await execute({ action: 'add_vocab', word: 'test', translation: 'test' }, {});
  assert.strictEqual(res.metadata.success, true);
  const store = _getStore();
  assert.strictEqual(store.get('test').language, 'unknown');
});

// ---------------------------------------------------------------------------
// quiz tests
// ---------------------------------------------------------------------------
console.log('\n--- quiz ---');

await test('quiz: with enough vocab (translate)', async () => {
  await addSampleVocab();
  const res = await execute({ action: 'quiz', quizType: 'translate', count: 3 }, {});

  assert.strictEqual(res.metadata.success, true);
  assert.strictEqual(res.metadata.action, 'quiz');
  assert.strictEqual(res.metadata.quizType, 'translate');
  assert.strictEqual(res.metadata.questionCount, 3);
  assert.ok(res.result.includes('Q1.'));
  assert.ok(_getPendingQuiz() !== null);
});

await test('quiz: with no vocab', async () => {
  const res = await execute({ action: 'quiz' }, {});

  assert.strictEqual(res.metadata.success, false);
  assert.strictEqual(res.metadata.error, 'NO_VOCAB');
});

await test('quiz: insufficient vocab for multiple_choice', async () => {
  await execute({ action: 'add_vocab', word: 'hola', translation: 'hello', language: 'spanish' }, {});
  await execute({ action: 'add_vocab', word: 'gato', translation: 'cat', language: 'spanish' }, {});

  const res = await execute({ action: 'quiz', quizType: 'multiple_choice' }, {});

  assert.strictEqual(res.metadata.success, false);
  assert.strictEqual(res.metadata.error, 'INSUFFICIENT_VOCAB');
  assert.strictEqual(res.metadata.currentCount, 2);
  assert.strictEqual(res.metadata.required, 4);
});

await test('quiz: multiple_choice with enough vocab', async () => {
  await addSampleVocab();
  const res = await execute({ action: 'quiz', quizType: 'multiple_choice', count: 2 }, {});

  assert.strictEqual(res.metadata.success, true);
  assert.strictEqual(res.metadata.quizType, 'multiple_choice');
  // Each question should have options
  for (const q of res.metadata.questions) {
    assert.ok(Array.isArray(q.options));
    assert.strictEqual(q.options.length, 4);
  }
});

await test('quiz: fill_blank type', async () => {
  await addSampleVocab();
  const res = await execute({ action: 'quiz', quizType: 'fill_blank', count: 2 }, {});

  assert.strictEqual(res.metadata.success, true);
  assert.strictEqual(res.metadata.quizType, 'fill_blank');
  assert.strictEqual(res.metadata.questionCount, 2);
});

await test('quiz: default count caps at vocab size', async () => {
  await execute({ action: 'add_vocab', word: 'uno', translation: 'one', language: 'spanish' }, {});
  await execute({ action: 'add_vocab', word: 'dos', translation: 'two', language: 'spanish' }, {});
  const res = await execute({ action: 'quiz', quizType: 'translate' }, {});

  assert.strictEqual(res.metadata.success, true);
  assert.strictEqual(res.metadata.questionCount, 2); // only 2 words available
});

// ---------------------------------------------------------------------------
// review tests
// ---------------------------------------------------------------------------
console.log('\n--- review ---');

await test('review: correct answer in quiz', async () => {
  await addSampleVocab();

  // Generate a quiz with 1 question
  const quizRes = await execute({ action: 'quiz', quizType: 'translate', count: 1 }, {});
  assert.strictEqual(quizRes.metadata.success, true);

  const quiz = _getPendingQuiz();
  const expectedAnswer = quiz.questions[0].expectedAnswer;
  const wordKey = quiz.questions[0].word.toLowerCase();

  const storeBefore = _getStore();
  const levelBefore = storeBefore.get(wordKey).level;

  const reviewRes = await execute({ action: 'review', answer: expectedAnswer }, {});

  assert.strictEqual(reviewRes.metadata.success, true);
  assert.strictEqual(reviewRes.metadata.correct, true);
  assert.strictEqual(reviewRes.metadata.newLevel, levelBefore + 1);
  assert.ok(reviewRes.result.includes('Correct'));
});

await test('review: incorrect answer in quiz', async () => {
  await addSampleVocab();

  const quizRes = await execute({ action: 'quiz', quizType: 'translate', count: 1 }, {});
  assert.strictEqual(quizRes.metadata.success, true);

  const reviewRes = await execute({ action: 'review', answer: 'definitely_wrong_answer' }, {});

  assert.strictEqual(reviewRes.metadata.success, true);
  assert.strictEqual(reviewRes.metadata.correct, false);
  assert.strictEqual(reviewRes.metadata.newLevel, 0); // was 0, incorrect -> max(0, 0-1) = 0
  assert.ok(reviewRes.result.includes('Incorrect'));
});

await test('review: level increases on correct', async () => {
  await execute({ action: 'add_vocab', word: 'hola', translation: 'hello', language: 'spanish' }, {});
  const store = _getStore();
  // Manually set level to 2
  store.get('hola').level = 2;

  // Direct review (no quiz)
  const res = await execute({ action: 'review', word: 'hola', answer: 'hello' }, {});

  assert.strictEqual(res.metadata.success, true);
  assert.strictEqual(res.metadata.correct, true);
  assert.strictEqual(res.metadata.newLevel, 3);
});

await test('review: level decreases on incorrect', async () => {
  await execute({ action: 'add_vocab', word: 'hola', translation: 'hello', language: 'spanish' }, {});
  const store = _getStore();
  store.get('hola').level = 3;

  const res = await execute({ action: 'review', word: 'hola', answer: 'wrong' }, {});

  assert.strictEqual(res.metadata.success, true);
  assert.strictEqual(res.metadata.correct, false);
  assert.strictEqual(res.metadata.newLevel, 2);
});

await test('review: level does not go below 0', async () => {
  await execute({ action: 'add_vocab', word: 'hola', translation: 'hello', language: 'spanish' }, {});
  const store = _getStore();
  assert.strictEqual(store.get('hola').level, 0);

  const res = await execute({ action: 'review', word: 'hola', answer: 'wrong' }, {});

  assert.strictEqual(res.metadata.newLevel, 0);
});

await test('review: level does not exceed 5', async () => {
  await execute({ action: 'add_vocab', word: 'hola', translation: 'hello', language: 'spanish' }, {});
  const store = _getStore();
  store.get('hola').level = 5;

  const res = await execute({ action: 'review', word: 'hola', answer: 'hello' }, {});

  assert.strictEqual(res.metadata.newLevel, 5);
});

await test('review: case-insensitive matching', async () => {
  await execute({ action: 'add_vocab', word: 'hola', translation: 'Hello', language: 'spanish' }, {});

  const res = await execute({ action: 'review', word: 'hola', answer: 'hello' }, {});

  assert.strictEqual(res.metadata.correct, true);
});

await test('review: word not found for direct review', async () => {
  await execute({ action: 'add_vocab', word: 'hola', translation: 'hello', language: 'spanish' }, {});

  const res = await execute({ action: 'review', word: 'nonexistent', answer: 'test' }, {});

  assert.strictEqual(res.metadata.success, false);
  assert.strictEqual(res.metadata.error, 'WORD_NOT_FOUND');
});

// ---------------------------------------------------------------------------
// progress tests
// ---------------------------------------------------------------------------
console.log('\n--- progress ---');

await test('progress: empty vocabulary', async () => {
  const res = await execute({ action: 'progress' }, {});

  assert.strictEqual(res.metadata.success, true);
  assert.strictEqual(res.metadata.action, 'progress');
  assert.strictEqual(res.metadata.totalWords, 0);
  assert.strictEqual(res.metadata.masteredCount, 0);
  assert.strictEqual(res.metadata.accuracyRate, 0);
  assert.strictEqual(res.metadata.dueForReview, 0);
});

await test('progress: with data', async () => {
  await addSampleVocab();

  // Simulate some reviews
  const store = _getStore();
  const hola = store.get('hola');
  hola.level = 3;
  hola.correctCount = 5;
  hola.incorrectCount = 1;

  const gato = store.get('gato');
  gato.level = 5;
  gato.correctCount = 10;
  gato.incorrectCount = 0;

  const res = await execute({ action: 'progress' }, {});

  assert.strictEqual(res.metadata.success, true);
  assert.strictEqual(res.metadata.totalWords, 5);
  assert.strictEqual(res.metadata.masteredCount, 1); // gato at level 5
  assert.ok(res.metadata.totalCorrect >= 15);
  assert.ok(res.metadata.totalIncorrect >= 1);
  assert.ok(res.metadata.accuracyRate > 0);
  assert.ok(res.result.includes('Learning Progress'));
});

await test('progress: due for review count', async () => {
  await execute({ action: 'add_vocab', word: 'hola', translation: 'hello', language: 'spanish' }, {});

  // Set nextReview to the past so it's due
  const store = _getStore();
  store.get('hola').nextReview = new Date(Date.now() - 1000);

  const res = await execute({ action: 'progress' }, {});

  assert.strictEqual(res.metadata.dueForReview, 1);
});

// ---------------------------------------------------------------------------
// list_vocab tests
// ---------------------------------------------------------------------------
console.log('\n--- list_vocab ---');

await test('list_vocab: empty', async () => {
  const res = await execute({ action: 'list_vocab' }, {});

  assert.strictEqual(res.metadata.success, true);
  assert.strictEqual(res.metadata.totalWords, 0);
  assert.deepStrictEqual(res.metadata.entries, []);
});

await test('list_vocab: with entries', async () => {
  await addSampleVocab();
  const res = await execute({ action: 'list_vocab' }, {});

  assert.strictEqual(res.metadata.success, true);
  assert.strictEqual(res.metadata.totalWords, 5);
  assert.strictEqual(res.metadata.entries.length, 5);
  assert.ok(res.result.includes('hola'));
  assert.ok(res.result.includes('gato'));
});

await test('list_vocab: filter by language', async () => {
  await addSampleVocab();
  const res = await execute({ action: 'list_vocab', language: 'french' }, {});

  assert.strictEqual(res.metadata.success, true);
  assert.strictEqual(res.metadata.totalWords, 1);
  assert.strictEqual(res.metadata.entries[0].word, 'bonjour');
});

await test('list_vocab: filter by language with no matches', async () => {
  await addSampleVocab();
  const res = await execute({ action: 'list_vocab', language: 'german' }, {});

  assert.strictEqual(res.metadata.success, true);
  assert.strictEqual(res.metadata.totalWords, 0);
});

await test('list_vocab: filter by tags', async () => {
  await addSampleVocab();
  const res = await execute({ action: 'list_vocab', tags: ['animals'] }, {});

  assert.strictEqual(res.metadata.success, true);
  assert.strictEqual(res.metadata.totalWords, 2); // gato + perro
});

// ---------------------------------------------------------------------------
// delete_vocab tests
// ---------------------------------------------------------------------------
console.log('\n--- delete_vocab ---');

await test('delete_vocab: existing word', async () => {
  await addSampleVocab();
  const res = await execute({ action: 'delete_vocab', word: 'hola' }, {});

  assert.strictEqual(res.metadata.success, true);
  assert.strictEqual(res.metadata.action, 'delete_vocab');
  assert.strictEqual(res.metadata.deletedWord, 'hola');
  assert.strictEqual(res.metadata.remainingWords, 4);
  assert.strictEqual(_getStore().has('hola'), false);
});

await test('delete_vocab: non-existing word', async () => {
  await addSampleVocab();
  const res = await execute({ action: 'delete_vocab', word: 'nonexistent' }, {});

  assert.strictEqual(res.metadata.success, false);
  assert.strictEqual(res.metadata.error, 'WORD_NOT_FOUND');
});

await test('delete_vocab: missing word parameter', async () => {
  const res = await execute({ action: 'delete_vocab' }, {});

  assert.strictEqual(res.metadata.success, false);
  assert.strictEqual(res.metadata.error, 'MISSING_WORD');
});

// ---------------------------------------------------------------------------
// hint tests
// ---------------------------------------------------------------------------
console.log('\n--- hint ---');

await test('hint: existing word', async () => {
  await execute({
    action: 'add_vocab',
    word: 'hola',
    translation: 'hello',
    language: 'spanish',
    example: 'Hola, como estas?'
  }, {});

  const res = await execute({ action: 'hint', word: 'hola' }, {});

  assert.strictEqual(res.metadata.success, true);
  assert.strictEqual(res.metadata.action, 'hint');
  assert.strictEqual(res.metadata.word, 'hola');
  assert.strictEqual(res.metadata.hints.firstLetter, 'h');
  assert.strictEqual(res.metadata.hints.length, 5); // "hello" has 5 chars
  assert.strictEqual(res.metadata.hints.example, 'Hola, como estas?');
  assert.strictEqual(res.metadata.hints.language, 'spanish');
  assert.ok(res.result.includes('First letter'));
  assert.ok(res.result.includes('Word length'));
  assert.ok(res.result.includes('Example sentence'));
});

await test('hint: non-existing word', async () => {
  const res = await execute({ action: 'hint', word: 'nonexistent' }, {});

  assert.strictEqual(res.metadata.success, false);
  assert.strictEqual(res.metadata.error, 'WORD_NOT_FOUND');
});

await test('hint: missing word parameter', async () => {
  const res = await execute({ action: 'hint' }, {});

  assert.strictEqual(res.metadata.success, false);
  assert.strictEqual(res.metadata.error, 'MISSING_WORD');
});

// ---------------------------------------------------------------------------
// Invalid action test
// ---------------------------------------------------------------------------
console.log('\n--- invalid action ---');

await test('invalid action returns INVALID_ACTION', async () => {
  const res = await execute({ action: 'bogus_action' }, {});

  assert.strictEqual(res.metadata.success, false);
  assert.strictEqual(res.metadata.error, 'INVALID_ACTION');
  assert.ok(res.result.includes('Invalid action'));
});

await test('missing action returns INVALID_ACTION', async () => {
  const res = await execute({}, {});

  assert.strictEqual(res.metadata.success, false);
  assert.strictEqual(res.metadata.error, 'INVALID_ACTION');
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log('\n========================================');
console.log(`  Results: ${passed} passed, ${failed} failed (${passed + failed} total)`);
console.log('========================================');

if (failures.length > 0) {
  console.log('\nFailed tests:');
  for (const f of failures) {
    console.log(`  - ${f.name}: ${f.error.message}`);
  }
}

process.exit(failed > 0 ? 1 : 0);
