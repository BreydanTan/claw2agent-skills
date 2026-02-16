import vm from "node:vm";

export async function execute(params, context) {
  const { language, code } = params;

  if (!language || !code) {
    throw new Error("Both 'language' and 'code' parameters are required");
  }

  if (language === "python") {
    return {
      result: "Python execution requires python3 binary",
      metadata: {
        language: "python",
        executionTimeMs: 0,
      },
    };
  }

  if (language !== "javascript") {
    throw new Error(
      `Unsupported language: ${language}. Supported languages are 'javascript' and 'python'.`
    );
  }

  // Capture console.log output
  const outputLines = [];
  const mockConsole = {
    log: (...args) => {
      outputLines.push(
        args
          .map((a) => (typeof a === "object" ? JSON.stringify(a, null, 2) : String(a)))
          .join(" ")
      );
    },
    error: (...args) => {
      outputLines.push(
        "[error] " +
          args
            .map((a) => (typeof a === "object" ? JSON.stringify(a, null, 2) : String(a)))
            .join(" ")
      );
    },
    warn: (...args) => {
      outputLines.push(
        "[warn] " +
          args
            .map((a) => (typeof a === "object" ? JSON.stringify(a, null, 2) : String(a)))
            .join(" ")
      );
    },
    info: (...args) => {
      outputLines.push(
        args
          .map((a) => (typeof a === "object" ? JSON.stringify(a, null, 2) : String(a)))
          .join(" ")
      );
    },
  };

  // Create a sandbox with limited globals
  const sandbox = {
    console: mockConsole,
    Math,
    Date,
    JSON,
    Array,
    Object,
    String,
    Number,
    parseInt,
    parseFloat,
  };

  const startTime = Date.now();

  try {
    const contextifiedSandbox = vm.createContext(sandbox);
    const script = new vm.Script(code, { filename: "user-code.js" });

    const returnValue = script.runInContext(contextifiedSandbox, {
      timeout: 10000, // 10 second timeout
    });

    const executionTimeMs = Date.now() - startTime;

    // If code produced no console output but returned a value, include it
    let output = outputLines.join("\n");
    if (outputLines.length === 0 && returnValue !== undefined) {
      output =
        typeof returnValue === "object"
          ? JSON.stringify(returnValue, null, 2)
          : String(returnValue);
    }

    return {
      result: output || "(no output)",
      metadata: {
        language: "javascript",
        executionTimeMs,
      },
    };
  } catch (error) {
    const executionTimeMs = Date.now() - startTime;

    if (error.code === "ERR_SCRIPT_EXECUTION_TIMEOUT") {
      throw new Error(
        `Code execution timed out after 10 seconds. Execution time: ${executionTimeMs}ms`
      );
    }

    throw new Error(`Code execution error: ${error.message}`);
  }
}
