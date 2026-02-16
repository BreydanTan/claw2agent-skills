# Language Tutor Skill

## What this skill does

The Language Tutor skill is an interactive vocabulary-based language learning assistant with spaced repetition. You can add vocabulary words with translations and example sentences, generate quizzes in multiple formats, review answers and track your learning progress over time.

**Important:** All vocabulary data is stored in memory. Vocabulary resets when the process restarts. There is no persistent storage.

## Supported commands / input shape

All requests require an `action` parameter. Additional parameters depend on the action.

### `add_vocab` -- Add a vocabulary word

| Parameter   | Type     | Required | Description                                  |
| ----------- | -------- | -------- | -------------------------------------------- |
| action      | string   | yes      | `"add_vocab"`                                |
| word        | string   | yes      | The word or phrase to learn                  |
| translation | string   | yes      | Translation or meaning of the word           |
| language    | string   | no       | Target language (e.g. "spanish", "french")   |
| example     | string   | no       | Example sentence using the word              |
| tags        | string[] | no       | Tags for categorizing (e.g. "food", "verbs") |

### `quiz` -- Generate quiz questions

| Parameter | Type   | Required | Description                                                        |
| --------- | ------ | -------- | ------------------------------------------------------------------ |
| action    | string | yes      | `"quiz"`                                                           |
| quizType  | string | no       | `"translate"`, `"fill_blank"`, or `"multiple_choice"` (default: translate) |
| count     | number | no       | Number of questions to generate (default: 5)                       |

### `review` -- Submit an answer

| Parameter | Type   | Required | Description                                    |
| --------- | ------ | -------- | ---------------------------------------------- |
| action    | string | yes      | `"review"`                                     |
| answer    | string | yes      | Your answer to the current quiz question       |
| word      | string | no       | Word to review directly (when no active quiz)  |

### `progress` -- View learning statistics

| Parameter | Type   | Required | Description    |
| --------- | ------ | -------- | -------------- |
| action    | string | yes      | `"progress"`   |

### `list_vocab` -- List all vocabulary

| Parameter | Type     | Required | Description                             |
| --------- | -------- | -------- | --------------------------------------- |
| action    | string   | yes      | `"list_vocab"`                          |
| language  | string   | no       | Filter by language                      |
| tags      | string[] | no       | Filter by tags (matches any)            |

### `delete_vocab` -- Remove a word

| Parameter | Type   | Required | Description        |
| --------- | ------ | -------- | ------------------ |
| action    | string | yes      | `"delete_vocab"`   |
| word      | string | yes      | Word to remove     |

### `hint` -- Get a hint for a word

| Parameter | Type   | Required | Description            |
| --------- | ------ | -------- | ---------------------- |
| action    | string | yes      | `"hint"`               |
| word      | string | yes      | Word to get hints for  |

## Spaced repetition system

Words progress through 6 levels (0-5) based on correct and incorrect answers:

| Level | Label       | Review interval |
| ----- | ----------- | --------------- |
| 0     | New         | 1 minute        |
| 1     | Learning    | 10 minutes      |
| 2     | Familiar    | 1 day           |
| 3     | Comfortable | 3 days          |
| 4     | Confident   | 7 days          |
| 5     | Mastered    | 30 days         |

- Correct answer: level increases by 1 (max 5)
- Incorrect answer: level decreases by 1 (min 0)

## Required config and secrets

This skill does not require any API keys, secrets, or external configuration. It runs entirely in memory with no network calls.

## Usage examples

### Add a vocabulary word

```json
{
  "action": "add_vocab",
  "word": "hola",
  "translation": "hello",
  "language": "spanish",
  "example": "Hola, como estas?",
  "tags": ["greetings", "basic"]
}
```

### Generate a translate quiz

```json
{
  "action": "quiz",
  "quizType": "translate",
  "count": 3
}
```

### Generate a multiple choice quiz

```json
{
  "action": "quiz",
  "quizType": "multiple_choice",
  "count": 5
}
```

### Submit a review answer

```json
{
  "action": "review",
  "answer": "hello"
}
```

### View progress

```json
{
  "action": "progress"
}
```

### List all Spanish vocabulary

```json
{
  "action": "list_vocab",
  "language": "spanish"
}
```

### Delete a word

```json
{
  "action": "delete_vocab",
  "word": "hola"
}
```

### Get a hint

```json
{
  "action": "hint",
  "word": "hola"
}
```

## Error codes

| Code              | Description                                                        |
| ----------------- | ------------------------------------------------------------------ |
| INVALID_ACTION    | The `action` parameter is missing or unrecognized                  |
| MISSING_WORD      | A required `word` parameter was not provided                       |
| MISSING_TRANSLATION | A required `translation` parameter was not provided              |
| WORD_NOT_FOUND    | The specified word does not exist in the vocabulary                 |
| DUPLICATE_WORD    | The word already exists in the vocabulary                          |
| NO_VOCAB          | No vocabulary words available (vocabulary is empty)                |
| INSUFFICIENT_VOCAB | Not enough vocabulary for the requested quiz type (need >= 4 for multiple choice) |

## Security notes

- This skill performs no file system access. All data is stored in memory.
- No network requests are made.
- No user data is persisted or logged beyond the current session.
- No API keys or credentials are required or handled.

## Limitations

- All vocabulary data is stored in memory and resets when the process restarts. There is no persistent storage.
- Quiz randomization means quiz questions may vary each time, which can affect reproducibility.
- The fill-in-the-blank quiz type requires an example sentence on the vocabulary entry. If no example exists, it falls back to a translate question.
- Answer matching is case-insensitive and trimmed, but does not account for typos, accent marks, or alternative translations.
- Multiple choice quizzes require at least 4 words in the vocabulary.
- The spaced repetition timing is based on the system clock at the time of review.

## Test instructions

Run the test suite using Node.js (no external dependencies required):

```bash
node skills/language-tutor/__tests__/handler.test.js
```

All tests use the built-in `assert` module. The test runner prints a summary at the end. A non-zero exit code indicates failures.
