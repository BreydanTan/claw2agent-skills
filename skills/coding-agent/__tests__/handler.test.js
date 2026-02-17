import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import { execute } from '../handler.js';

const context = {};

// ===========================================================================
// Parameter validation
// ===========================================================================

describe('coding-agent: parameter validation', () => {
  beforeEach(() => {});

  it('should throw when both task and language are missing', async () => {
    await assert.rejects(() => execute({}, context), {
      message: "Parameters 'task' and 'language' are required",
    });
  });

  it('should throw when task is missing', async () => {
    await assert.rejects(() => execute({ language: 'javascript' }, context), {
      message: "Parameters 'task' and 'language' are required",
    });
  });

  it('should throw when language is missing', async () => {
    await assert.rejects(() => execute({ task: 'write a function' }, context), {
      message: "Parameters 'task' and 'language' are required",
    });
  });

  it('should throw when task is empty string', async () => {
    await assert.rejects(() => execute({ task: '', language: 'python' }, context), {
      message: "Parameters 'task' and 'language' are required",
    });
  });

  it('should throw when language is empty string', async () => {
    await assert.rejects(() => execute({ task: 'do stuff', language: '' }, context), {
      message: "Parameters 'task' and 'language' are required",
    });
  });

  it('should throw when task is null', async () => {
    await assert.rejects(() => execute({ task: null, language: 'python' }, context), {
      message: "Parameters 'task' and 'language' are required",
    });
  });

  it('should throw when language is null', async () => {
    await assert.rejects(() => execute({ task: 'do stuff', language: null }, context), {
      message: "Parameters 'task' and 'language' are required",
    });
  });

  it('should throw when task is undefined', async () => {
    await assert.rejects(
      () => execute({ task: undefined, language: 'python' }, context),
      { message: "Parameters 'task' and 'language' are required" }
    );
  });

  it('should throw when language is undefined', async () => {
    await assert.rejects(
      () => execute({ task: 'do stuff', language: undefined }, context),
      { message: "Parameters 'task' and 'language' are required" }
    );
  });
});

// ===========================================================================
// Result message format
// ===========================================================================

describe('coding-agent: result message format', () => {
  beforeEach(() => {});

  it('should include the task in the result string', async () => {
    const res = await execute({ task: 'build a REST API', language: 'python' }, context);
    assert.ok(res.result.includes('build a REST API'));
  });

  it('should include the language in the result string', async () => {
    const res = await execute({ task: 'build something', language: 'typescript' }, context);
    assert.ok(res.result.includes('typescript'));
  });

  it('should mention "Generated code task"', async () => {
    const res = await execute({ task: 'sort an array', language: 'javascript' }, context);
    assert.ok(res.result.includes('Generated code task'));
  });

  it('should mention that the LLM should generate the code', async () => {
    const res = await execute({ task: 'sort an array', language: 'javascript' }, context);
    assert.ok(res.result.includes('LLM should generate the code'));
  });

  it('should format result as "Generated code task: {task} in {language}..."', async () => {
    const res = await execute({ task: 'parse CSV', language: 'ruby' }, context);
    assert.equal(
      res.result,
      'Generated code task: parse CSV in ruby. The LLM should generate the code.'
    );
  });
});

// ===========================================================================
// Metadata: task and language
// ===========================================================================

describe('coding-agent: metadata task and language', () => {
  beforeEach(() => {});

  it('should include task in metadata', async () => {
    const res = await execute({ task: 'build a CLI', language: 'go' }, context);
    assert.equal(res.metadata.task, 'build a CLI');
  });

  it('should include language in metadata', async () => {
    const res = await execute({ task: 'build a CLI', language: 'go' }, context);
    assert.equal(res.metadata.language, 'go');
  });

  it('should have result and metadata keys', async () => {
    const res = await execute({ task: 'hello', language: 'python' }, context);
    assert.ok('result' in res);
    assert.ok('metadata' in res);
  });

  it('should preserve task text exactly', async () => {
    const task = 'Write a function that computes Fibonacci numbers recursively';
    const res = await execute({ task, language: 'python' }, context);
    assert.equal(res.metadata.task, task);
  });

  it('should preserve language text exactly', async () => {
    const res = await execute({ task: 'write code', language: 'C++' }, context);
    assert.equal(res.metadata.language, 'C++');
  });
});

// ===========================================================================
// Metadata: hasExistingCode
// ===========================================================================

describe('coding-agent: hasExistingCode', () => {
  beforeEach(() => {});

  it('should be false when no existingCode is provided', async () => {
    const res = await execute({ task: 'build X', language: 'python' }, context);
    assert.equal(res.metadata.hasExistingCode, false);
  });

  it('should be true when existingCode is provided', async () => {
    const res = await execute(
      { task: 'refactor', language: 'javascript', existingCode: 'const x = 1;' },
      context
    );
    assert.equal(res.metadata.hasExistingCode, true);
  });

  it('should be false when existingCode is empty string', async () => {
    const res = await execute(
      { task: 'build X', language: 'python', existingCode: '' },
      context
    );
    assert.equal(res.metadata.hasExistingCode, false);
  });

  it('should be false when existingCode is null', async () => {
    const res = await execute(
      { task: 'build X', language: 'python', existingCode: null },
      context
    );
    assert.equal(res.metadata.hasExistingCode, false);
  });

  it('should be false when existingCode is undefined', async () => {
    const res = await execute(
      { task: 'build X', language: 'python', existingCode: undefined },
      context
    );
    assert.equal(res.metadata.hasExistingCode, false);
  });

  it('should be a boolean type', async () => {
    const res1 = await execute({ task: 'x', language: 'py' }, context);
    assert.equal(typeof res1.metadata.hasExistingCode, 'boolean');

    const res2 = await execute(
      { task: 'x', language: 'py', existingCode: 'code' },
      context
    );
    assert.equal(typeof res2.metadata.hasExistingCode, 'boolean');
  });
});

// ===========================================================================
// Structured prompt: basic structure
// ===========================================================================

describe('coding-agent: structuredPrompt basic structure', () => {
  beforeEach(() => {});

  it('should include structuredPrompt in metadata', async () => {
    const res = await execute({ task: 'build API', language: 'python' }, context);
    assert.ok('structuredPrompt' in res.metadata);
    assert.equal(typeof res.metadata.structuredPrompt, 'string');
  });

  it('should include "Code Generation Task" header', async () => {
    const res = await execute({ task: 'build API', language: 'python' }, context);
    assert.ok(res.metadata.structuredPrompt.includes('## Code Generation Task'));
  });

  it('should include language in structured prompt', async () => {
    const res = await execute({ task: 'build API', language: 'rust' }, context);
    assert.ok(res.metadata.structuredPrompt.includes('**Language:** rust'));
  });

  it('should include task in structured prompt', async () => {
    const res = await execute({ task: 'implement sorting', language: 'java' }, context);
    assert.ok(res.metadata.structuredPrompt.includes('**Task:** implement sorting'));
  });

  it('should include Requirements section', async () => {
    const res = await execute({ task: 'x', language: 'py' }, context);
    assert.ok(res.metadata.structuredPrompt.includes('## Requirements'));
  });

  it('should include Output Format section', async () => {
    const res = await execute({ task: 'x', language: 'py' }, context);
    assert.ok(res.metadata.structuredPrompt.includes('## Output Format'));
  });

  it('should mention clean, well-structured code requirement', async () => {
    const res = await execute({ task: 'x', language: 'python' }, context);
    assert.ok(res.metadata.structuredPrompt.includes('clean, well-structured python code'));
  });

  it('should mention error handling requirement', async () => {
    const res = await execute({ task: 'x', language: 'python' }, context);
    assert.ok(res.metadata.structuredPrompt.includes('appropriate error handling'));
  });

  it('should mention best practices requirement', async () => {
    const res = await execute({ task: 'x', language: 'go' }, context);
    assert.ok(res.metadata.structuredPrompt.includes('go best practices'));
  });

  it('should mention production-ready requirement', async () => {
    const res = await execute({ task: 'x', language: 'go' }, context);
    assert.ok(res.metadata.structuredPrompt.includes('production-ready'));
  });

  it('should mention edge cases', async () => {
    const res = await execute({ task: 'x', language: 'go' }, context);
    assert.ok(res.metadata.structuredPrompt.includes('edge cases'));
  });

  it('should mention concise comments', async () => {
    const res = await execute({ task: 'x', language: 'go' }, context);
    assert.ok(res.metadata.structuredPrompt.includes('concise comments'));
  });
});

// ===========================================================================
// Structured prompt: without existingCode
// ===========================================================================

describe('coding-agent: structuredPrompt without existingCode', () => {
  beforeEach(() => {});

  it('should NOT include "Existing Code Context" section', async () => {
    const res = await execute({ task: 'build API', language: 'python' }, context);
    assert.ok(!res.metadata.structuredPrompt.includes('## Existing Code Context'));
  });

  it('should NOT include code block markers without existing code', async () => {
    const res = await execute({ task: 'build API', language: 'python' }, context);
    assert.ok(!res.metadata.structuredPrompt.includes('```python'));
  });

  it('should NOT include "starting point" instruction', async () => {
    const res = await execute({ task: 'build API', language: 'python' }, context);
    assert.ok(!res.metadata.structuredPrompt.includes('starting point'));
  });
});

// ===========================================================================
// Structured prompt: with existingCode
// ===========================================================================

describe('coding-agent: structuredPrompt with existingCode', () => {
  beforeEach(() => {});

  it('should include "Existing Code Context" section', async () => {
    const res = await execute(
      { task: 'refactor', language: 'javascript', existingCode: 'const x = 1;' },
      context
    );
    assert.ok(res.metadata.structuredPrompt.includes('## Existing Code Context'));
  });

  it('should include the existing code in a code block', async () => {
    const res = await execute(
      { task: 'refactor', language: 'javascript', existingCode: 'function hello() {}' },
      context
    );
    assert.ok(res.metadata.structuredPrompt.includes('```javascript'));
    assert.ok(res.metadata.structuredPrompt.includes('function hello() {}'));
    assert.ok(res.metadata.structuredPrompt.includes('```'));
  });

  it('should include "starting point" instruction', async () => {
    const res = await execute(
      { task: 'refactor', language: 'python', existingCode: 'def foo(): pass' },
      context
    );
    assert.ok(res.metadata.structuredPrompt.includes('starting point'));
  });

  it('should include "Modify or extend" instruction', async () => {
    const res = await execute(
      { task: 'add feature', language: 'python', existingCode: 'class Foo: pass' },
      context
    );
    assert.ok(res.metadata.structuredPrompt.includes('Modify or extend'));
  });

  it('should use the correct language in code block', async () => {
    const res = await execute(
      { task: 'refactor', language: 'typescript', existingCode: 'const x: number = 1;' },
      context
    );
    assert.ok(res.metadata.structuredPrompt.includes('```typescript'));
  });

  it('should preserve multiline existing code', async () => {
    const existing = 'line1\nline2\nline3';
    const res = await execute(
      { task: 'refactor', language: 'python', existingCode: existing },
      context
    );
    assert.ok(res.metadata.structuredPrompt.includes('line1\nline2\nline3'));
  });
});

// ===========================================================================
// Various languages
// ===========================================================================

describe('coding-agent: various languages', () => {
  beforeEach(() => {});

  it('should work with python', async () => {
    const res = await execute({ task: 'sort list', language: 'python' }, context);
    assert.equal(res.metadata.language, 'python');
    assert.ok(res.metadata.structuredPrompt.includes('**Language:** python'));
  });

  it('should work with javascript', async () => {
    const res = await execute({ task: 'sort array', language: 'javascript' }, context);
    assert.equal(res.metadata.language, 'javascript');
  });

  it('should work with typescript', async () => {
    const res = await execute({ task: 'sort array', language: 'typescript' }, context);
    assert.equal(res.metadata.language, 'typescript');
  });

  it('should work with go', async () => {
    const res = await execute({ task: 'sort slice', language: 'go' }, context);
    assert.equal(res.metadata.language, 'go');
  });

  it('should work with rust', async () => {
    const res = await execute({ task: 'sort vec', language: 'rust' }, context);
    assert.equal(res.metadata.language, 'rust');
  });

  it('should work with java', async () => {
    const res = await execute({ task: 'sort list', language: 'java' }, context);
    assert.equal(res.metadata.language, 'java');
  });

  it('should work with c#', async () => {
    const res = await execute({ task: 'sort list', language: 'c#' }, context);
    assert.equal(res.metadata.language, 'c#');
  });

  it('should work with swift', async () => {
    const res = await execute({ task: 'sort array', language: 'swift' }, context);
    assert.equal(res.metadata.language, 'swift');
  });

  it('should work with ruby', async () => {
    const res = await execute({ task: 'sort array', language: 'ruby' }, context);
    assert.equal(res.metadata.language, 'ruby');
  });

  it('should work with kotlin', async () => {
    const res = await execute({ task: 'sort list', language: 'kotlin' }, context);
    assert.equal(res.metadata.language, 'kotlin');
  });
});

// ===========================================================================
// Output format includes language in prompt
// ===========================================================================

describe('coding-agent: output format section', () => {
  beforeEach(() => {});

  it('should mention language in output format section', async () => {
    const res = await execute({ task: 'x', language: 'scala' }, context);
    assert.ok(res.metadata.structuredPrompt.includes('complete scala code'));
  });

  it('should mention code block in output format section', async () => {
    const res = await execute({ task: 'x', language: 'python' }, context);
    assert.ok(res.metadata.structuredPrompt.includes('single code block'));
  });

  it('should mention imports in output format section', async () => {
    const res = await execute({ task: 'x', language: 'python' }, context);
    assert.ok(res.metadata.structuredPrompt.includes('imports'));
  });
});

// ===========================================================================
// Async behavior
// ===========================================================================

describe('coding-agent: async behavior', () => {
  beforeEach(() => {});

  it('should return a promise', () => {
    const result = execute({ task: 'x', language: 'py' }, context);
    assert.ok(result instanceof Promise);
  });

  it('should resolve to an object with result and metadata', async () => {
    const res = await execute({ task: 'hello', language: 'python' }, context);
    assert.equal(typeof res, 'object');
    assert.ok(res.result !== undefined);
    assert.ok(res.metadata !== undefined);
  });
});

// ===========================================================================
// Edge cases
// ===========================================================================

describe('coding-agent: edge cases', () => {
  beforeEach(() => {});

  it('should handle very long task descriptions', async () => {
    const longTask = 'a'.repeat(1000);
    const res = await execute({ task: longTask, language: 'python' }, context);
    assert.equal(res.metadata.task, longTask);
    assert.ok(res.result.includes(longTask));
  });

  it('should handle special characters in task', async () => {
    const task = 'implement <html> & "quotes" \'single\' `backtick`';
    const res = await execute({ task, language: 'python' }, context);
    assert.equal(res.metadata.task, task);
  });

  it('should handle special characters in language', async () => {
    const res = await execute({ task: 'code', language: 'c++' }, context);
    assert.equal(res.metadata.language, 'c++');
  });

  it('should handle existingCode with special characters', async () => {
    const code = 'const x = "<div class=\\"foo\\">bar</div>";';
    const res = await execute(
      { task: 'refactor', language: 'javascript', existingCode: code },
      context
    );
    assert.ok(res.metadata.structuredPrompt.includes(code));
  });

  it('should handle multiline existingCode', async () => {
    const code = 'def foo():\n  x = 1\n  y = 2\n  return x + y';
    const res = await execute(
      { task: 'optimize', language: 'python', existingCode: code },
      context
    );
    assert.ok(res.metadata.structuredPrompt.includes(code));
    assert.equal(res.metadata.hasExistingCode, true);
  });

  it('should handle whitespace-only task by NOT throwing (whitespace is truthy)', async () => {
    const res = await execute({ task: '   ', language: 'python' }, context);
    assert.equal(res.metadata.task, '   ');
  });

  it('should handle numeric-like language string', async () => {
    const res = await execute({ task: 'code', language: '123' }, context);
    assert.equal(res.metadata.language, '123');
  });

  it('should include all four metadata fields', async () => {
    const res = await execute(
      { task: 'code', language: 'python', existingCode: 'x = 1' },
      context
    );
    assert.ok('task' in res.metadata);
    assert.ok('language' in res.metadata);
    assert.ok('hasExistingCode' in res.metadata);
    assert.ok('structuredPrompt' in res.metadata);
  });

  it('should include all four metadata fields when no existingCode', async () => {
    const res = await execute({ task: 'code', language: 'python' }, context);
    assert.ok('task' in res.metadata);
    assert.ok('language' in res.metadata);
    assert.ok('hasExistingCode' in res.metadata);
    assert.ok('structuredPrompt' in res.metadata);
  });
});

// ===========================================================================
// Prompt section ordering
// ===========================================================================

describe('coding-agent: prompt section ordering', () => {
  beforeEach(() => {});

  it('should have Code Generation Task before Requirements', async () => {
    const res = await execute({ task: 'x', language: 'python' }, context);
    const prompt = res.metadata.structuredPrompt;
    const taskIdx = prompt.indexOf('## Code Generation Task');
    const reqIdx = prompt.indexOf('## Requirements');
    assert.ok(taskIdx < reqIdx);
  });

  it('should have Requirements before Output Format', async () => {
    const res = await execute({ task: 'x', language: 'python' }, context);
    const prompt = res.metadata.structuredPrompt;
    const reqIdx = prompt.indexOf('## Requirements');
    const outIdx = prompt.indexOf('## Output Format');
    assert.ok(reqIdx < outIdx);
  });

  it('should have Existing Code Context between Task and Requirements when existingCode', async () => {
    const res = await execute(
      { task: 'x', language: 'python', existingCode: 'pass' },
      context
    );
    const prompt = res.metadata.structuredPrompt;
    const taskIdx = prompt.indexOf('## Code Generation Task');
    const existIdx = prompt.indexOf('## Existing Code Context');
    const reqIdx = prompt.indexOf('## Requirements');
    assert.ok(taskIdx < existIdx);
    assert.ok(existIdx < reqIdx);
  });
});

// ===========================================================================
// Structured prompt: requirements details
// ===========================================================================

describe('coding-agent: requirements details per language', () => {
  beforeEach(() => {});

  it('should tailor clean code requirement to javascript', async () => {
    const res = await execute({ task: 'x', language: 'javascript' }, context);
    assert.ok(res.metadata.structuredPrompt.includes('clean, well-structured javascript code'));
  });

  it('should tailor clean code requirement to rust', async () => {
    const res = await execute({ task: 'x', language: 'rust' }, context);
    assert.ok(res.metadata.structuredPrompt.includes('clean, well-structured rust code'));
  });

  it('should tailor best practices to python', async () => {
    const res = await execute({ task: 'x', language: 'python' }, context);
    assert.ok(res.metadata.structuredPrompt.includes('python best practices'));
  });

  it('should tailor best practices to java', async () => {
    const res = await execute({ task: 'x', language: 'java' }, context);
    assert.ok(res.metadata.structuredPrompt.includes('java best practices'));
  });

  it('should tailor output format to typescript', async () => {
    const res = await execute({ task: 'x', language: 'typescript' }, context);
    assert.ok(res.metadata.structuredPrompt.includes('complete typescript code'));
  });
});

// ===========================================================================
// Context parameter
// ===========================================================================

describe('coding-agent: context parameter', () => {
  beforeEach(() => {});

  it('should work with empty context object', async () => {
    const res = await execute({ task: 'x', language: 'python' }, {});
    assert.ok(res.result);
  });

  it('should work with context containing extra data', async () => {
    const res = await execute({ task: 'x', language: 'python' }, { userId: '123', env: 'test' });
    assert.ok(res.result);
  });

  it('should work with null context', async () => {
    const res = await execute({ task: 'x', language: 'python' }, null);
    assert.ok(res.result);
  });

  it('should work with undefined context', async () => {
    const res = await execute({ task: 'x', language: 'python' }, undefined);
    assert.ok(res.result);
  });
});
