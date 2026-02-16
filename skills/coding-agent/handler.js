export async function execute(params, context) {
  const { task, language, existingCode } = params;

  if (!task || !language) {
    throw new Error("Parameters 'task' and 'language' are required");
  }

  // Build a structured prompt for the LLM
  const promptSections = [];

  promptSections.push(`## Code Generation Task`);
  promptSections.push(``);
  promptSections.push(`**Language:** ${language}`);
  promptSections.push(`**Task:** ${task}`);
  promptSections.push(``);

  if (existingCode) {
    promptSections.push(`## Existing Code Context`);
    promptSections.push(``);
    promptSections.push("```" + language);
    promptSections.push(existingCode);
    promptSections.push("```");
    promptSections.push(``);
    promptSections.push(
      `The above code should be used as the starting point. Modify or extend it to accomplish the task.`
    );
    promptSections.push(``);
  }

  promptSections.push(`## Requirements`);
  promptSections.push(``);
  promptSections.push(`- Write clean, well-structured ${language} code`);
  promptSections.push(`- Include appropriate error handling`);
  promptSections.push(`- Add concise comments for complex logic`);
  promptSections.push(`- Follow ${language} best practices and conventions`);
  promptSections.push(
    `- Ensure the code is production-ready and handles edge cases`
  );
  promptSections.push(``);

  promptSections.push(`## Output Format`);
  promptSections.push(``);
  promptSections.push(
    `Provide the complete ${language} code in a single code block. Include any necessary imports or dependencies at the top.`
  );

  const structuredPrompt = promptSections.join("\n");

  return {
    result: `Generated code task: ${task} in ${language}. The LLM should generate the code.`,
    metadata: {
      task,
      language,
      hasExistingCode: !!existingCode,
      structuredPrompt,
    },
  };
}
