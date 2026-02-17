import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import { execute } from '../handler.js';

const context = {};

// ===========================================================================
// Parameter validation
// ===========================================================================

describe('code-interpreter: parameter validation', () => {
  beforeEach(() => {});

  it('should throw when both language and code are missing', async () => {
    await assert.rejects(() => execute({}, context), {
      message: "Both 'language' and 'code' parameters are required",
    });
  });

  it('should throw when language is missing', async () => {
    await assert.rejects(() => execute({ code: '1+1' }, context), {
      message: "Both 'language' and 'code' parameters are required",
    });
  });

  it('should throw when code is missing', async () => {
    await assert.rejects(() => execute({ language: 'javascript' }, context), {
      message: "Both 'language' and 'code' parameters are required",
    });
  });

  it('should throw when language is empty string', async () => {
    await assert.rejects(() => execute({ language: '', code: '1+1' }, context), {
      message: "Both 'language' and 'code' parameters are required",
    });
  });

  it('should throw when code is empty string', async () => {
    await assert.rejects(() => execute({ language: 'javascript', code: '' }, context), {
      message: "Both 'language' and 'code' parameters are required",
    });
  });

  it('should throw when language is null', async () => {
    await assert.rejects(() => execute({ language: null, code: '1+1' }, context), {
      message: "Both 'language' and 'code' parameters are required",
    });
  });

  it('should throw when code is null', async () => {
    await assert.rejects(() => execute({ language: 'javascript', code: null }, context), {
      message: "Both 'language' and 'code' parameters are required",
    });
  });

  it('should throw when language is undefined', async () => {
    await assert.rejects(
      () => execute({ language: undefined, code: '1+1' }, context),
      { message: "Both 'language' and 'code' parameters are required" }
    );
  });

  it('should throw when code is undefined', async () => {
    await assert.rejects(
      () => execute({ language: 'javascript', code: undefined }, context),
      { message: "Both 'language' and 'code' parameters are required" }
    );
  });
});

// ===========================================================================
// Unsupported language
// ===========================================================================

describe('code-interpreter: unsupported language', () => {
  beforeEach(() => {});

  it('should throw for ruby', async () => {
    await assert.rejects(() => execute({ language: 'ruby', code: 'puts 1' }, context), {
      message: "Unsupported language: ruby. Supported languages are 'javascript' and 'python'.",
    });
  });

  it('should throw for go', async () => {
    await assert.rejects(() => execute({ language: 'go', code: 'fmt.Println(1)' }, context), {
      message: "Unsupported language: go. Supported languages are 'javascript' and 'python'.",
    });
  });

  it('should throw for java', async () => {
    await assert.rejects(
      () => execute({ language: 'java', code: 'System.out.println(1);' }, context),
      /Unsupported language: java/
    );
  });

  it('should throw for rust', async () => {
    await assert.rejects(
      () => execute({ language: 'rust', code: 'fn main() {}' }, context),
      /Unsupported language: rust/
    );
  });

  it('should throw for c++', async () => {
    await assert.rejects(
      () => execute({ language: 'c++', code: 'int main(){}' }, context),
      /Unsupported language: c\+\+/
    );
  });
});

// ===========================================================================
// Python language
// ===========================================================================

describe('code-interpreter: python language', () => {
  beforeEach(() => {});

  it('should return python3 binary message', async () => {
    const result = await execute({ language: 'python', code: 'print(1)' }, context);
    assert.equal(result.result, 'Python execution requires python3 binary');
  });

  it('should set language metadata to python', async () => {
    const result = await execute({ language: 'python', code: 'x = 1' }, context);
    assert.equal(result.metadata.language, 'python');
  });

  it('should set executionTimeMs to 0 for python', async () => {
    const result = await execute({ language: 'python', code: 'pass' }, context);
    assert.equal(result.metadata.executionTimeMs, 0);
  });

  it('should work regardless of the python code content', async () => {
    const result = await execute(
      { language: 'python', code: 'import os; os.system("rm -rf /")' },
      context
    );
    assert.equal(result.result, 'Python execution requires python3 binary');
  });

  it('should return consistent structure for python', async () => {
    const result = await execute({ language: 'python', code: 'x = 42' }, context);
    assert.ok('result' in result);
    assert.ok('metadata' in result);
    assert.ok('language' in result.metadata);
    assert.ok('executionTimeMs' in result.metadata);
  });
});

// ===========================================================================
// JavaScript: basic math and return values
// ===========================================================================

describe('code-interpreter: javascript basic math', () => {
  beforeEach(() => {});

  it('should return result of simple addition', async () => {
    const result = await execute({ language: 'javascript', code: '1 + 1' }, context);
    assert.equal(result.result, '2');
  });

  it('should return result of multiplication', async () => {
    const result = await execute({ language: 'javascript', code: '6 * 7' }, context);
    assert.equal(result.result, '42');
  });

  it('should return result of division', async () => {
    const result = await execute({ language: 'javascript', code: '10 / 3' }, context);
    assert.ok(result.result.startsWith('3.333'));
  });

  it('should return result of modulo', async () => {
    const result = await execute({ language: 'javascript', code: '17 % 5' }, context);
    assert.equal(result.result, '2');
  });

  it('should return result of exponentiation', async () => {
    const result = await execute({ language: 'javascript', code: '2 ** 10' }, context);
    assert.equal(result.result, '1024');
  });

  it('should return boolean true as string', async () => {
    const result = await execute({ language: 'javascript', code: '5 > 3' }, context);
    assert.equal(result.result, 'true');
  });

  it('should return boolean false as string', async () => {
    const result = await execute({ language: 'javascript', code: '5 < 3' }, context);
    assert.equal(result.result, 'false');
  });

  it('should return string value', async () => {
    const result = await execute({ language: 'javascript', code: '"hello"' }, context);
    assert.equal(result.result, 'hello');
  });

  it('should return number 0 as string', async () => {
    const result = await execute({ language: 'javascript', code: '0' }, context);
    assert.equal(result.result, '0');
  });

  it('should return negative number as string', async () => {
    const result = await execute({ language: 'javascript', code: '-42' }, context);
    assert.equal(result.result, '-42');
  });
});

// ===========================================================================
// JavaScript: return value as JSON
// ===========================================================================

describe('code-interpreter: javascript object return values', () => {
  beforeEach(() => {});

  it('should return object as formatted JSON', async () => {
    const result = await execute(
      { language: 'javascript', code: '({a: 1, b: 2})' },
      context
    );
    const parsed = JSON.parse(result.result);
    assert.deepEqual(parsed, { a: 1, b: 2 });
  });

  it('should return array as formatted JSON', async () => {
    const result = await execute(
      { language: 'javascript', code: '[1, 2, 3]' },
      context
    );
    const parsed = JSON.parse(result.result);
    assert.deepEqual(parsed, [1, 2, 3]);
  });

  it('should return nested object as JSON', async () => {
    const result = await execute(
      { language: 'javascript', code: '({x: {y: {z: 1}}})' },
      context
    );
    const parsed = JSON.parse(result.result);
    assert.deepEqual(parsed, { x: { y: { z: 1 } } });
  });

  it('should return null as string', async () => {
    const result = await execute({ language: 'javascript', code: 'null' }, context);
    assert.equal(result.result, 'null');
  });
});

// ===========================================================================
// JavaScript: console.log
// ===========================================================================

describe('code-interpreter: console.log output', () => {
  beforeEach(() => {});

  it('should capture console.log string output', async () => {
    const result = await execute(
      { language: 'javascript', code: 'console.log("hello world")' },
      context
    );
    assert.equal(result.result, 'hello world');
  });

  it('should capture console.log number output', async () => {
    const result = await execute(
      { language: 'javascript', code: 'console.log(42)' },
      context
    );
    assert.equal(result.result, '42');
  });

  it('should capture multiple console.log calls', async () => {
    const result = await execute(
      { language: 'javascript', code: 'console.log("a"); console.log("b"); console.log("c")' },
      context
    );
    assert.equal(result.result, 'a\nb\nc');
  });

  it('should join multiple arguments with space', async () => {
    const result = await execute(
      { language: 'javascript', code: 'console.log("hello", "world")' },
      context
    );
    assert.equal(result.result, 'hello world');
  });

  it('should log objects as JSON', async () => {
    const result = await execute(
      { language: 'javascript', code: 'console.log({a: 1})' },
      context
    );
    const parsed = JSON.parse(result.result);
    assert.deepEqual(parsed, { a: 1 });
  });

  it('should join string and object args with space', async () => {
    const result = await execute(
      { language: 'javascript', code: 'console.log("result:", {x: 5})' },
      context
    );
    assert.ok(result.result.startsWith('result:'));
    assert.ok(result.result.includes('"x": 5'));
  });

  it('should prefer console output over return value', async () => {
    const result = await execute(
      { language: 'javascript', code: 'console.log("printed"); 42' },
      context
    );
    assert.equal(result.result, 'printed');
  });

  it('should handle console.log with boolean', async () => {
    const result = await execute(
      { language: 'javascript', code: 'console.log(true)' },
      context
    );
    assert.equal(result.result, 'true');
  });

  it('should handle console.log with null', async () => {
    const result = await execute(
      { language: 'javascript', code: 'console.log(null)' },
      context
    );
    assert.equal(result.result, 'null');
  });

  it('should handle console.log with undefined', async () => {
    const result = await execute(
      { language: 'javascript', code: 'console.log(undefined)' },
      context
    );
    assert.equal(result.result, 'undefined');
  });
});

// ===========================================================================
// JavaScript: console.error
// ===========================================================================

describe('code-interpreter: console.error output', () => {
  beforeEach(() => {});

  it('should prefix console.error with [error]', async () => {
    const result = await execute(
      { language: 'javascript', code: 'console.error("something went wrong")' },
      context
    );
    assert.equal(result.result, '[error] something went wrong');
  });

  it('should prefix console.error object with [error]', async () => {
    const result = await execute(
      { language: 'javascript', code: 'console.error({err: "fail"})' },
      context
    );
    assert.ok(result.result.startsWith('[error]'));
    assert.ok(result.result.includes('"err": "fail"'));
  });

  it('should join multiple error args with space', async () => {
    const result = await execute(
      { language: 'javascript', code: 'console.error("code", 404)' },
      context
    );
    assert.equal(result.result, '[error] code 404');
  });
});

// ===========================================================================
// JavaScript: console.warn
// ===========================================================================

describe('code-interpreter: console.warn output', () => {
  beforeEach(() => {});

  it('should prefix console.warn with [warn]', async () => {
    const result = await execute(
      { language: 'javascript', code: 'console.warn("be careful")' },
      context
    );
    assert.equal(result.result, '[warn] be careful');
  });

  it('should prefix console.warn object with [warn]', async () => {
    const result = await execute(
      { language: 'javascript', code: 'console.warn({level: "high"})' },
      context
    );
    assert.ok(result.result.startsWith('[warn]'));
    assert.ok(result.result.includes('"level": "high"'));
  });

  it('should join multiple warn args with space', async () => {
    const result = await execute(
      { language: 'javascript', code: 'console.warn("temp", 100, "degrees")' },
      context
    );
    assert.equal(result.result, '[warn] temp 100 degrees');
  });
});

// ===========================================================================
// JavaScript: console.info
// ===========================================================================

describe('code-interpreter: console.info output', () => {
  beforeEach(() => {});

  it('should capture console.info without prefix', async () => {
    const result = await execute(
      { language: 'javascript', code: 'console.info("just info")' },
      context
    );
    assert.equal(result.result, 'just info');
  });

  it('should capture console.info with multiple args', async () => {
    const result = await execute(
      { language: 'javascript', code: 'console.info("count:", 5)' },
      context
    );
    assert.equal(result.result, 'count: 5');
  });

  it('should capture console.info object as JSON', async () => {
    const result = await execute(
      { language: 'javascript', code: 'console.info({status: "ok"})' },
      context
    );
    const parsed = JSON.parse(result.result);
    assert.deepEqual(parsed, { status: 'ok' });
  });
});

// ===========================================================================
// JavaScript: mixed console methods
// ===========================================================================

describe('code-interpreter: mixed console methods', () => {
  beforeEach(() => {});

  it('should capture log and error together', async () => {
    const result = await execute(
      { language: 'javascript', code: 'console.log("ok"); console.error("fail")' },
      context
    );
    assert.equal(result.result, 'ok\n[error] fail');
  });

  it('should capture log, warn, error, info in order', async () => {
    const code = `
      console.log("step1");
      console.warn("step2");
      console.error("step3");
      console.info("step4");
    `;
    const result = await execute({ language: 'javascript', code }, context);
    const lines = result.result.split('\n');
    assert.equal(lines[0], 'step1');
    assert.equal(lines[1], '[warn] step2');
    assert.equal(lines[2], '[error] step3');
    assert.equal(lines[3], 'step4');
  });
});

// ===========================================================================
// JavaScript: no output
// ===========================================================================

describe('code-interpreter: no output', () => {
  beforeEach(() => {});

  it('should return "(no output)" when code produces nothing', async () => {
    const result = await execute(
      { language: 'javascript', code: 'var x = 5;' },
      context
    );
    assert.equal(result.result, '(no output)');
  });

  it('should return "(no output)" for function declaration', async () => {
    const result = await execute(
      { language: 'javascript', code: 'function foo() { return 1; }' },
      context
    );
    assert.equal(result.result, '(no output)');
  });

  it('should return "(no output)" when return is undefined explicitly', async () => {
    const result = await execute(
      { language: 'javascript', code: 'undefined' },
      context
    );
    assert.equal(result.result, '(no output)');
  });
});

// ===========================================================================
// JavaScript: sandbox globals
// ===========================================================================

describe('code-interpreter: sandbox globals', () => {
  beforeEach(() => {});

  it('should have Math available', async () => {
    const result = await execute(
      { language: 'javascript', code: 'Math.PI' },
      context
    );
    assert.ok(result.result.startsWith('3.14159'));
  });

  it('should have Math.max available', async () => {
    const result = await execute(
      { language: 'javascript', code: 'Math.max(1, 5, 3)' },
      context
    );
    assert.equal(result.result, '5');
  });

  it('should have Math.floor available', async () => {
    const result = await execute(
      { language: 'javascript', code: 'Math.floor(3.7)' },
      context
    );
    assert.equal(result.result, '3');
  });

  it('should have Date available', async () => {
    const result = await execute(
      { language: 'javascript', code: 'typeof Date' },
      context
    );
    assert.equal(result.result, 'function');
  });

  it('should have JSON available', async () => {
    const result = await execute(
      { language: 'javascript', code: 'JSON.stringify({a:1})' },
      context
    );
    assert.equal(result.result, '{"a":1}');
  });

  it('should have Array available', async () => {
    const result = await execute(
      { language: 'javascript', code: 'Array.isArray([1,2])' },
      context
    );
    assert.equal(result.result, 'true');
  });

  it('should have Object.keys available', async () => {
    const result = await execute(
      { language: 'javascript', code: 'console.log(Object.keys({a:1,b:2}).length)' },
      context
    );
    assert.equal(result.result, '2');
  });

  it('should have String available', async () => {
    const result = await execute(
      { language: 'javascript', code: 'typeof String' },
      context
    );
    assert.equal(result.result, 'function');
  });

  it('should have Number available', async () => {
    const result = await execute(
      { language: 'javascript', code: 'Number.isInteger(5)' },
      context
    );
    assert.equal(result.result, 'true');
  });

  it('should have parseInt available', async () => {
    const result = await execute(
      { language: 'javascript', code: 'parseInt("42")' },
      context
    );
    assert.equal(result.result, '42');
  });

  it('should have parseFloat available', async () => {
    const result = await execute(
      { language: 'javascript', code: 'parseFloat("3.14")' },
      context
    );
    assert.equal(result.result, '3.14');
  });

  it('should parse hex with parseInt', async () => {
    const result = await execute(
      { language: 'javascript', code: 'parseInt("ff", 16)' },
      context
    );
    assert.equal(result.result, '255');
  });
});

// ===========================================================================
// JavaScript: metadata
// ===========================================================================

describe('code-interpreter: metadata', () => {
  beforeEach(() => {});

  it('should include language in metadata', async () => {
    const result = await execute({ language: 'javascript', code: '1' }, context);
    assert.equal(result.metadata.language, 'javascript');
  });

  it('should include executionTimeMs in metadata', async () => {
    const result = await execute({ language: 'javascript', code: '1+1' }, context);
    assert.equal(typeof result.metadata.executionTimeMs, 'number');
    assert.ok(result.metadata.executionTimeMs >= 0);
  });

  it('should have executionTimeMs for console output code', async () => {
    const result = await execute(
      { language: 'javascript', code: 'console.log("hi")' },
      context
    );
    assert.equal(typeof result.metadata.executionTimeMs, 'number');
  });

  it('should have both result and metadata keys', async () => {
    const result = await execute({ language: 'javascript', code: '1' }, context);
    assert.ok('result' in result);
    assert.ok('metadata' in result);
  });
});

// ===========================================================================
// JavaScript: execution errors
// ===========================================================================

describe('code-interpreter: execution errors', () => {
  beforeEach(() => {});

  it('should throw on ReferenceError', async () => {
    await assert.rejects(
      () => execute({ language: 'javascript', code: 'undefinedVar.toString()' }, context),
      /Code execution error/
    );
  });

  it('should throw on SyntaxError', async () => {
    await assert.rejects(
      () => execute({ language: 'javascript', code: 'function {' }, context),
      /Code execution error/
    );
  });

  it('should throw on TypeError', async () => {
    await assert.rejects(
      () => execute({ language: 'javascript', code: 'null.toString()' }, context),
      /Code execution error/
    );
  });

  it('should include original error message', async () => {
    await assert.rejects(
      () => execute({ language: 'javascript', code: 'throw new Error("custom fail")' }, context),
      /Code execution error: custom fail/
    );
  });

  it('should throw on accessing unavailable globals like process', async () => {
    await assert.rejects(
      () => execute({ language: 'javascript', code: 'process.exit(1)' }, context),
      /Code execution error/
    );
  });

  it('should throw on accessing require', async () => {
    await assert.rejects(
      () => execute({ language: 'javascript', code: 'require("fs")' }, context),
      /Code execution error/
    );
  });
});

// ===========================================================================
// JavaScript: complex code patterns
// ===========================================================================

describe('code-interpreter: complex code patterns', () => {
  beforeEach(() => {});

  it('should handle a for loop with console.log', async () => {
    const code = 'for (let i = 0; i < 3; i++) { console.log(i); }';
    const result = await execute({ language: 'javascript', code }, context);
    assert.equal(result.result, '0\n1\n2');
  });

  it('should handle array methods', async () => {
    const code = 'console.log([1,2,3].map(x => x * 2))';
    const result = await execute({ language: 'javascript', code }, context);
    const parsed = JSON.parse(result.result);
    assert.deepEqual(parsed, [2, 4, 6]);
  });

  it('should handle array reduce', async () => {
    const code = '[1,2,3,4,5].reduce((a,b) => a + b, 0)';
    const result = await execute({ language: 'javascript', code }, context);
    assert.equal(result.result, '15');
  });

  it('should handle IIFE', async () => {
    const code = '(function() { return 42; })()';
    const result = await execute({ language: 'javascript', code }, context);
    assert.equal(result.result, '42');
  });

  it('should handle arrow function expression', async () => {
    const code = '(() => 99)()';
    const result = await execute({ language: 'javascript', code }, context);
    assert.equal(result.result, '99');
  });

  it('should handle template literals', async () => {
    const code = 'const x = 5; console.log(`value is ${x}`)';
    const result = await execute({ language: 'javascript', code }, context);
    assert.equal(result.result, 'value is 5');
  });

  it('should handle destructuring', async () => {
    const code = 'const {a, b} = {a: 10, b: 20}; a + b';
    const result = await execute({ language: 'javascript', code }, context);
    assert.equal(result.result, '30');
  });

  it('should handle spread operator', async () => {
    const code = 'console.log([...[1,2], ...[3,4]])';
    const result = await execute({ language: 'javascript', code }, context);
    const parsed = JSON.parse(result.result);
    assert.deepEqual(parsed, [1, 2, 3, 4]);
  });

  it('should handle ternary operator', async () => {
    const code = 'true ? "yes" : "no"';
    const result = await execute({ language: 'javascript', code }, context);
    assert.equal(result.result, 'yes');
  });

  it('should handle JSON.parse within sandbox', async () => {
    const code = 'JSON.parse(\'{"key":"val"}\')';
    const result = await execute({ language: 'javascript', code }, context);
    const parsed = JSON.parse(result.result);
    assert.deepEqual(parsed, { key: 'val' });
  });

  it('should handle while loop', async () => {
    const code = 'let c = 0; while(c < 3) { console.log(c); c++; }';
    const result = await execute({ language: 'javascript', code }, context);
    assert.equal(result.result, '0\n1\n2');
  });

  it('should handle try-catch within code', async () => {
    const code = 'try { throw new Error("oops"); } catch(e) { console.log("caught: " + e.message); }';
    const result = await execute({ language: 'javascript', code }, context);
    assert.equal(result.result, 'caught: oops');
  });

  it('should handle Math.sqrt in computation', async () => {
    const code = 'Math.sqrt(144)';
    const result = await execute({ language: 'javascript', code }, context);
    assert.equal(result.result, '12');
  });

  it('should handle Date creation', async () => {
    const code = 'typeof new Date()';
    const result = await execute({ language: 'javascript', code }, context);
    assert.equal(result.result, 'object');
  });

  it('should handle string methods', async () => {
    const code = '"hello world".toUpperCase()';
    const result = await execute({ language: 'javascript', code }, context);
    assert.equal(result.result, 'HELLO WORLD');
  });

  it('should handle Object.entries', async () => {
    const code = 'console.log(Object.entries({a:1,b:2}).length)';
    const result = await execute({ language: 'javascript', code }, context);
    assert.equal(result.result, '2');
  });
});

// ===========================================================================
// Async behavior
// ===========================================================================

describe('code-interpreter: async behavior', () => {
  beforeEach(() => {});

  it('should return a promise from execute', () => {
    const result = execute({ language: 'javascript', code: '1' }, context);
    assert.ok(result instanceof Promise);
  });

  it('should resolve with result and metadata', async () => {
    const result = await execute({ language: 'javascript', code: '"hi"' }, context);
    assert.equal(typeof result, 'object');
    assert.ok(result.result !== undefined);
    assert.ok(result.metadata !== undefined);
  });
});
