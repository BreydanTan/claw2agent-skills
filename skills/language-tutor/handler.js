/**
 * Language Tutor Skill Handler
 *
 * In-memory vocabulary-based language tutor with spaced repetition.
 * Supports adding vocabulary, generating quizzes, reviewing with
 * spaced repetition, tracking progress, and providing hints.
 */

/**
 * In-memory vocabulary store.
 * Key: word (lowercase, trimmed)
 * Value: { word, translation, language, example, tags[], addedAt,
 *          level (0-5), nextReview (Date), correctCount, incorrectCount, lastReviewed }
 */
const vocabStore = new Map();

/**
 * Pending quiz state. Stores the current quiz questions and expected answers
 * so that the review action can validate responses.
 */
let pendingQuiz = null;

/**
 * Spaced repetition intervals in milliseconds, indexed by level (0-5).
 * Level 0: 1 minute
 * Level 1: 10 minutes
 * Level 2: 1 day
 * Level 3: 3 days
 * Level 4: 7 days
 * Level 5: 30 days
 */
const REVIEW_INTERVALS = [
  1 * 60 * 1000,            // Level 0: 1 minute
  10 * 60 * 1000,           // Level 1: 10 minutes
  24 * 60 * 60 * 1000,      // Level 2: 1 day
  3 * 24 * 60 * 60 * 1000,  // Level 3: 3 days
  7 * 24 * 60 * 60 * 1000,  // Level 4: 7 days
  30 * 24 * 60 * 60 * 1000  // Level 5: 30 days
];

/**
 * Level labels for display.
 */
const LEVEL_LABELS = [
  'New',
  'Learning',
  'Familiar',
  'Comfortable',
  'Confident',
  'Mastered'
];

/**
 * Compute the next review date based on the current level.
 * @param {number} level - Current level (0-5)
 * @returns {Date}
 */
function computeNextReview(level) {
  const clampedLevel = Math.max(0, Math.min(5, level));
  return new Date(Date.now() + REVIEW_INTERVALS[clampedLevel]);
}

/**
 * Normalize a word key: lowercase and trimmed.
 * @param {string} word
 * @returns {string}
 */
function normalizeWord(word) {
  return word.trim().toLowerCase();
}

/**
 * Shuffle an array in place (Fisher-Yates).
 * @param {any[]} arr
 * @returns {any[]}
 */
function shuffle(arr) {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Add a vocabulary word.
 */
function handleAddVocab(params) {
  const { word, translation, language, example, tags } = params;

  if (!word || typeof word !== 'string' || word.trim().length === 0) {
    return {
      result: 'Error: "word" is required and must be a non-empty string.',
      metadata: { success: false, error: 'MISSING_WORD' }
    };
  }

  if (!translation || typeof translation !== 'string' || translation.trim().length === 0) {
    return {
      result: 'Error: "translation" is required and must be a non-empty string.',
      metadata: { success: false, error: 'MISSING_TRANSLATION' }
    };
  }

  const key = normalizeWord(word);

  if (vocabStore.has(key)) {
    return {
      result: `Error: The word "${word.trim()}" already exists in your vocabulary. Delete it first if you want to re-add it.`,
      metadata: { success: false, error: 'DUPLICATE_WORD', word: word.trim() }
    };
  }

  const entry = {
    word: word.trim(),
    translation: translation.trim(),
    language: language ? language.trim().toLowerCase() : 'unknown',
    example: example ? example.trim() : null,
    tags: Array.isArray(tags) ? tags.map(t => t.trim().toLowerCase()) : [],
    addedAt: new Date().toISOString(),
    level: 0,
    nextReview: computeNextReview(0),
    correctCount: 0,
    incorrectCount: 0,
    lastReviewed: null
  };

  vocabStore.set(key, entry);

  return {
    result: `Added "${entry.word}" (${entry.language}) to your vocabulary.\nTranslation: ${entry.translation}${entry.example ? '\nExample: ' + entry.example : ''}\nLevel: ${LEVEL_LABELS[0]} (0/5)\nTotal vocabulary: ${vocabStore.size} word(s).`,
    metadata: {
      success: true,
      action: 'add_vocab',
      word: entry.word,
      language: entry.language,
      totalVocab: vocabStore.size
    }
  };
}

/**
 * Generate quiz questions from vocabulary.
 */
function handleQuiz(params) {
  const { quizType, count } = params;
  const numQuestions = count && count > 0 ? Math.min(count, vocabStore.size) : Math.min(5, vocabStore.size);

  if (vocabStore.size === 0) {
    return {
      result: 'Error: No vocabulary words available. Add some words first using the "add_vocab" action.',
      metadata: { success: false, error: 'NO_VOCAB' }
    };
  }

  const type = quizType || 'translate';

  if (type === 'multiple_choice' && vocabStore.size < 4) {
    return {
      result: `Error: Multiple choice quizzes require at least 4 vocabulary words. You currently have ${vocabStore.size}. Add more words first.`,
      metadata: { success: false, error: 'INSUFFICIENT_VOCAB', currentCount: vocabStore.size, required: 4 }
    };
  }

  const allEntries = [...vocabStore.values()];
  const selected = shuffle(allEntries).slice(0, numQuestions);
  const questions = [];

  for (let i = 0; i < selected.length; i++) {
    const entry = selected[i];
    const question = generateQuestion(entry, type, allEntries, i + 1);
    questions.push(question);
  }

  pendingQuiz = {
    questions,
    createdAt: new Date().toISOString(),
    currentIndex: 0
  };

  const formatted = questions.map((q, i) => {
    let line = `Q${i + 1}. ${q.prompt}`;
    if (q.options) {
      line += '\n' + q.options.map((opt, j) => `   ${String.fromCharCode(65 + j)}) ${opt}`).join('\n');
    }
    return line;
  }).join('\n\n');

  return {
    result: `Quiz generated (${questions.length} question(s), type: ${type}):\n\n${formatted}\n\nUse the "review" action with your "answer" to submit responses. Answer the current question (Q1) first.`,
    metadata: {
      success: true,
      action: 'quiz',
      quizType: type,
      questionCount: questions.length,
      questions: questions.map(q => ({
        number: q.number,
        prompt: q.prompt,
        options: q.options || null,
        word: q.word
      }))
    }
  };
}

/**
 * Generate a single quiz question.
 */
function generateQuestion(entry, type, allEntries, number) {
  switch (type) {
    case 'fill_blank': {
      if (entry.example) {
        const blanked = entry.example.replace(
          new RegExp(escapeRegex(entry.word), 'gi'),
          '______'
        );
        return {
          number,
          type: 'fill_blank',
          prompt: `Fill in the blank: "${blanked}"`,
          expectedAnswer: entry.word,
          word: entry.word
        };
      }
      // Fall back to translate if no example sentence
      return {
        number,
        type: 'translate',
        prompt: `What is the translation of "${entry.word}"?`,
        expectedAnswer: entry.translation,
        word: entry.word
      };
    }

    case 'multiple_choice': {
      // Decide direction randomly: word->translation or translation->word
      const showWord = Math.random() < 0.5;
      const correctAnswer = showWord ? entry.translation : entry.word;
      const prompt = showWord
        ? `What is the translation of "${entry.word}"?`
        : `Which word means "${entry.translation}"?`;

      // Get 3 random wrong answers
      const distractors = allEntries
        .filter(e => normalizeWord(e.word) !== normalizeWord(entry.word))
        .map(e => showWord ? e.translation : e.word);

      const wrongAnswers = shuffle(distractors).slice(0, 3);
      const options = shuffle([correctAnswer, ...wrongAnswers]);

      return {
        number,
        type: 'multiple_choice',
        prompt,
        options,
        expectedAnswer: correctAnswer,
        word: entry.word
      };
    }

    case 'translate':
    default: {
      // Randomly choose direction
      const showWord = Math.random() < 0.5;
      if (showWord) {
        return {
          number,
          type: 'translate',
          prompt: `What is the translation of "${entry.word}"?`,
          expectedAnswer: entry.translation,
          word: entry.word
        };
      } else {
        return {
          number,
          type: 'translate',
          prompt: `What word means "${entry.translation}" (${entry.language})?`,
          expectedAnswer: entry.word,
          word: entry.word
        };
      }
    }
  }
}

/**
 * Escape special regex characters.
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Handle a review (answer submission).
 */
function handleReview(params) {
  const { answer, word } = params;

  if (!answer || typeof answer !== 'string' || answer.trim().length === 0) {
    return {
      result: 'Error: "answer" is required to submit a review.',
      metadata: { success: false, error: 'MISSING_WORD' }
    };
  }

  // If there is a pending quiz, answer the current question
  if (pendingQuiz && pendingQuiz.currentIndex < pendingQuiz.questions.length) {
    const question = pendingQuiz.questions[pendingQuiz.currentIndex];
    const isCorrect = answer.trim().toLowerCase() === question.expectedAnswer.trim().toLowerCase();

    // Update the vocab entry
    const vocabKey = normalizeWord(question.word);
    const entry = vocabStore.get(vocabKey);

    if (entry) {
      if (isCorrect) {
        entry.correctCount++;
        entry.level = Math.min(5, entry.level + 1);
      } else {
        entry.incorrectCount++;
        entry.level = Math.max(0, entry.level - 1);
      }
      entry.nextReview = computeNextReview(entry.level);
      entry.lastReviewed = new Date().toISOString();
    }

    pendingQuiz.currentIndex++;
    const hasMore = pendingQuiz.currentIndex < pendingQuiz.questions.length;

    let feedback = isCorrect
      ? `Correct! "${answer.trim()}" is right.`
      : `Incorrect. The correct answer was "${question.expectedAnswer}". You answered "${answer.trim()}".`;

    if (entry) {
      feedback += `\nWord "${question.word}" is now at level ${entry.level} (${LEVEL_LABELS[entry.level]}).`;
    }

    if (hasMore) {
      const nextQ = pendingQuiz.questions[pendingQuiz.currentIndex];
      feedback += `\n\nNext question (Q${nextQ.number}): ${nextQ.prompt}`;
      if (nextQ.options) {
        feedback += '\n' + nextQ.options.map((opt, j) => `   ${String.fromCharCode(65 + j)}) ${opt}`).join('\n');
      }
    } else {
      // Quiz complete
      const total = pendingQuiz.questions.length;
      feedback += `\n\nQuiz complete! You answered all ${total} question(s).`;
      pendingQuiz = null;
    }

    return {
      result: feedback,
      metadata: {
        success: true,
        action: 'review',
        correct: isCorrect,
        word: question.word,
        expectedAnswer: question.expectedAnswer,
        userAnswer: answer.trim(),
        newLevel: entry ? entry.level : null,
        quizComplete: !hasMore
      }
    };
  }

  // Direct review (no pending quiz): review a specific word
  if (!word || typeof word !== 'string' || word.trim().length === 0) {
    return {
      result: 'Error: No active quiz and no "word" specified. Start a quiz with the "quiz" action, or provide a "word" to review directly.',
      metadata: { success: false, error: 'MISSING_WORD' }
    };
  }

  const vocabKey = normalizeWord(word);
  const entry = vocabStore.get(vocabKey);

  if (!entry) {
    return {
      result: `Error: Word "${word.trim()}" not found in your vocabulary.`,
      metadata: { success: false, error: 'WORD_NOT_FOUND', word: word.trim() }
    };
  }

  const isCorrect = answer.trim().toLowerCase() === entry.translation.trim().toLowerCase();

  if (isCorrect) {
    entry.correctCount++;
    entry.level = Math.min(5, entry.level + 1);
  } else {
    entry.incorrectCount++;
    entry.level = Math.max(0, entry.level - 1);
  }
  entry.nextReview = computeNextReview(entry.level);
  entry.lastReviewed = new Date().toISOString();

  const feedback = isCorrect
    ? `Correct! "${answer.trim()}" is the right translation for "${entry.word}".\nLevel: ${entry.level} (${LEVEL_LABELS[entry.level]})`
    : `Incorrect. The correct translation for "${entry.word}" is "${entry.translation}". You answered "${answer.trim()}".\nLevel: ${entry.level} (${LEVEL_LABELS[entry.level]})`;

  return {
    result: feedback,
    metadata: {
      success: true,
      action: 'review',
      correct: isCorrect,
      word: entry.word,
      expectedAnswer: entry.translation,
      userAnswer: answer.trim(),
      newLevel: entry.level
    }
  };
}

/**
 * Show learning progress statistics.
 */
function handleProgress() {
  if (vocabStore.size === 0) {
    return {
      result: 'No vocabulary words yet. Add some words to start tracking your progress.',
      metadata: {
        success: true,
        action: 'progress',
        totalWords: 0,
        levelCounts: {},
        masteredCount: 0,
        accuracyRate: 0,
        dueForReview: 0
      }
    };
  }

  const levelCounts = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let totalCorrect = 0;
  let totalIncorrect = 0;
  let dueForReview = 0;
  const now = new Date();
  const languages = new Set();

  for (const entry of vocabStore.values()) {
    levelCounts[entry.level]++;
    totalCorrect += entry.correctCount;
    totalIncorrect += entry.incorrectCount;
    languages.add(entry.language);

    if (entry.nextReview <= now) {
      dueForReview++;
    }
  }

  const totalAttempts = totalCorrect + totalIncorrect;
  const accuracyRate = totalAttempts > 0 ? Math.round((totalCorrect / totalAttempts) * 100) : 0;

  const levelBreakdown = Object.entries(levelCounts)
    .map(([level, count]) => `  Level ${level} (${LEVEL_LABELS[level]}): ${count} word(s)`)
    .join('\n');

  const result = [
    `Learning Progress:`,
    `  Total words: ${vocabStore.size}`,
    `  Languages: ${[...languages].join(', ')}`,
    ``,
    `Level breakdown:`,
    levelBreakdown,
    ``,
    `  Mastered (level 5): ${levelCounts[5]} word(s)`,
    `  Due for review: ${dueForReview} word(s)`,
    `  Accuracy rate: ${accuracyRate}% (${totalCorrect}/${totalAttempts} correct)`
  ].join('\n');

  return {
    result,
    metadata: {
      success: true,
      action: 'progress',
      totalWords: vocabStore.size,
      languages: [...languages],
      levelCounts,
      masteredCount: levelCounts[5],
      dueForReview,
      accuracyRate,
      totalCorrect,
      totalIncorrect,
      totalAttempts
    }
  };
}

/**
 * List all vocabulary entries, optionally filtered by language or tags.
 */
function handleListVocab(params) {
  const { language, tags } = params;

  if (vocabStore.size === 0) {
    return {
      result: 'Your vocabulary is empty. Use "add_vocab" to add words.',
      metadata: { success: true, action: 'list_vocab', totalWords: 0, entries: [] }
    };
  }

  let entries = [...vocabStore.values()];

  // Filter by language if specified
  if (language && typeof language === 'string' && language.trim().length > 0) {
    const lang = language.trim().toLowerCase();
    entries = entries.filter(e => e.language === lang);
  }

  // Filter by tags if specified
  if (Array.isArray(tags) && tags.length > 0) {
    const filterTags = tags.map(t => t.trim().toLowerCase());
    entries = entries.filter(e =>
      filterTags.some(ft => e.tags.includes(ft))
    );
  }

  if (entries.length === 0) {
    return {
      result: 'No vocabulary entries match the specified filters.',
      metadata: { success: true, action: 'list_vocab', totalWords: 0, entries: [] }
    };
  }

  const formatted = entries.map((e, i) => {
    const nextReviewStr = e.nextReview instanceof Date
      ? e.nextReview.toISOString()
      : new Date(e.nextReview).toISOString();
    return [
      `${i + 1}. ${e.word} -> ${e.translation} (${e.language})`,
      `   Level: ${e.level} (${LEVEL_LABELS[e.level]}) | Next review: ${nextReviewStr}`,
      e.example ? `   Example: ${e.example}` : null,
      e.tags.length > 0 ? `   Tags: ${e.tags.join(', ')}` : null
    ].filter(Boolean).join('\n');
  }).join('\n\n');

  return {
    result: `Vocabulary (${entries.length} word(s)):\n\n${formatted}`,
    metadata: {
      success: true,
      action: 'list_vocab',
      totalWords: entries.length,
      entries: entries.map(e => ({
        word: e.word,
        translation: e.translation,
        language: e.language,
        level: e.level,
        tags: e.tags
      }))
    }
  };
}

/**
 * Delete a vocabulary word.
 */
function handleDeleteVocab(params) {
  const { word } = params;

  if (!word || typeof word !== 'string' || word.trim().length === 0) {
    return {
      result: 'Error: "word" is required for the delete_vocab action.',
      metadata: { success: false, error: 'MISSING_WORD' }
    };
  }

  const key = normalizeWord(word);

  if (!vocabStore.has(key)) {
    return {
      result: `Error: Word "${word.trim()}" not found in your vocabulary.`,
      metadata: { success: false, error: 'WORD_NOT_FOUND', word: word.trim() }
    };
  }

  const entry = vocabStore.get(key);
  vocabStore.delete(key);

  return {
    result: `Deleted "${entry.word}" from your vocabulary.\nRemaining words: ${vocabStore.size}`,
    metadata: {
      success: true,
      action: 'delete_vocab',
      deletedWord: entry.word,
      remainingWords: vocabStore.size
    }
  };
}

/**
 * Get a hint for a vocabulary word.
 */
function handleHint(params) {
  const { word } = params;

  if (!word || typeof word !== 'string' || word.trim().length === 0) {
    return {
      result: 'Error: "word" is required for the hint action.',
      metadata: { success: false, error: 'MISSING_WORD' }
    };
  }

  const key = normalizeWord(word);
  const entry = vocabStore.get(key);

  if (!entry) {
    return {
      result: `Error: Word "${word.trim()}" not found in your vocabulary.`,
      metadata: { success: false, error: 'WORD_NOT_FOUND', word: word.trim() }
    };
  }

  const hints = [];
  const translation = entry.translation;

  hints.push(`First letter: "${translation.charAt(0)}"`);
  hints.push(`Word length: ${translation.length} character(s)`);

  if (entry.example) {
    hints.push(`Example sentence: ${entry.example}`);
  }

  hints.push(`Language: ${entry.language}`);

  return {
    result: `Hints for "${entry.word}":\n${hints.map(h => `  - ${h}`).join('\n')}`,
    metadata: {
      success: true,
      action: 'hint',
      word: entry.word,
      hints: {
        firstLetter: translation.charAt(0),
        length: translation.length,
        example: entry.example,
        language: entry.language
      }
    }
  };
}

/**
 * Execute a language tutor operation.
 *
 * @param {Object} params
 * @param {string} params.action - One of: add_vocab, quiz, review, progress, list_vocab, delete_vocab, hint
 * @param {string} [params.word] - The word or phrase to learn
 * @param {string} [params.translation] - Translation/meaning of the word
 * @param {string} [params.language] - Target language being learned
 * @param {string} [params.example] - Example sentence using the word
 * @param {string[]} [params.tags] - Tags for categorizing vocabulary
 * @param {string} [params.answer] - User's answer for quiz/review
 * @param {string} [params.quizType] - Type of quiz question
 * @param {number} [params.count] - Number of quiz questions
 * @param {Object} context - Execution context from the runtime
 * @returns {Promise<{result: string, metadata: Object}>}
 */
export async function execute(params, context) {
  const { action } = params;

  const validActions = ['add_vocab', 'quiz', 'review', 'progress', 'list_vocab', 'delete_vocab', 'hint'];
  if (!action || !validActions.includes(action)) {
    return {
      result: `Error: Invalid action "${action}". Must be one of: ${validActions.join(', ')}`,
      metadata: { success: false, error: 'INVALID_ACTION' }
    };
  }

  switch (action) {
    case 'add_vocab':
      return handleAddVocab(params);
    case 'quiz':
      return handleQuiz(params);
    case 'review':
      return handleReview(params);
    case 'progress':
      return handleProgress();
    case 'list_vocab':
      return handleListVocab(params);
    case 'delete_vocab':
      return handleDeleteVocab(params);
    case 'hint':
      return handleHint(params);
    default:
      return {
        result: `Error: Unknown action "${action}".`,
        metadata: { success: false, error: 'INVALID_ACTION' }
      };
  }
}

/**
 * Reset the vocabulary store (used for testing).
 */
export function _resetStore() {
  vocabStore.clear();
  pendingQuiz = null;
}

/**
 * Get a reference to the vocab store (used for testing).
 */
export function _getStore() {
  return vocabStore;
}

/**
 * Get a reference to the pending quiz (used for testing).
 */
export function _getPendingQuiz() {
  return pendingQuiz;
}
