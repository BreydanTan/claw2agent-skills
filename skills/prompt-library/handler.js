/**
 * Prompt Library Skill Handler
 *
 * In-memory prompt template store with categorization, variable
 * interpolation, search, and version tracking.
 */

/**
 * In-memory store for prompt templates.
 * Key: prompt name (string)
 * Value: { name, template, category, description, tags, variables, createdAt, updatedAt, version }
 */
const promptStore = new Map();

/**
 * Extract {{variable}} placeholder names from a template string.
 *
 * @param {string} template - Template text containing {{variable}} placeholders.
 * @returns {string[]} Sorted, unique variable names found in the template.
 */
function extractVariables(template) {
  if (!template || typeof template !== 'string') return [];

  const regex = /\{\{(\w+)\}\}/g;
  const variables = new Set();
  let match;

  while ((match = regex.exec(template)) !== null) {
    variables.add(match[1]);
  }

  return [...variables].sort();
}

/**
 * Add or update a prompt template in the store.
 */
function handleAdd(params) {
  const { name, template, category, description, tags } = params;

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return {
      result: 'Error: name is required and must be a non-empty string.',
      metadata: { success: false, error: 'MISSING_NAME' }
    };
  }

  if (!template || typeof template !== 'string' || template.trim().length === 0) {
    return {
      result: 'Error: template is required and must be a non-empty string.',
      metadata: { success: false, error: 'MISSING_TEMPLATE' }
    };
  }

  const trimmedName = name.trim();
  const isUpdate = promptStore.has(trimmedName);
  const now = new Date().toISOString();
  const extractedVariables = extractVariables(template);

  const existing = promptStore.get(trimmedName);
  const version = isUpdate ? (existing.version + 1) : 1;

  const entry = {
    name: trimmedName,
    template,
    category: category || 'general',
    description: description || '',
    tags: Array.isArray(tags) ? tags : [],
    variables: extractedVariables,
    createdAt: isUpdate ? existing.createdAt : now,
    updatedAt: now,
    version
  };

  promptStore.set(trimmedName, entry);

  return {
    result: `Prompt "${trimmedName}" ${isUpdate ? 'updated' : 'added'} successfully (v${version}).` +
      (extractedVariables.length > 0 ? `\nDetected variables: ${extractedVariables.join(', ')}` : '\nNo template variables detected.'),
    metadata: {
      success: true,
      action: 'add',
      name: trimmedName,
      isUpdate,
      version,
      variables: extractedVariables,
      totalPrompts: promptStore.size
    }
  };
}

/**
 * Retrieve a prompt by its exact name.
 */
function handleGet(params) {
  const { name } = params;

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return {
      result: 'Error: name is required for the get action.',
      metadata: { success: false, error: 'MISSING_NAME' }
    };
  }

  const trimmedName = name.trim();

  if (!promptStore.has(trimmedName)) {
    return {
      result: `No prompt found with name "${trimmedName}".`,
      metadata: { success: false, error: 'NOT_FOUND', name: trimmedName }
    };
  }

  const entry = promptStore.get(trimmedName);

  return {
    result: [
      `Prompt: ${entry.name} (v${entry.version})`,
      `Category: ${entry.category}`,
      `Description: ${entry.description || '(none)'}`,
      `Tags: ${entry.tags.length > 0 ? entry.tags.join(', ') : '(none)'}`,
      `Variables: ${entry.variables.length > 0 ? entry.variables.join(', ') : '(none)'}`,
      `Created: ${entry.createdAt}`,
      `Updated: ${entry.updatedAt}`,
      ``,
      `Template:`,
      entry.template
    ].join('\n'),
    metadata: {
      success: true,
      action: 'get',
      prompt: { ...entry }
    }
  };
}

/**
 * Search prompts by query string. Matches against name, description, tags, and template content.
 */
function handleSearch(params) {
  const { query } = params;

  if (!query || typeof query !== 'string' || query.trim().length === 0) {
    return {
      result: 'Error: query is required for the search action.',
      metadata: { success: false, error: 'MISSING_QUERY' }
    };
  }

  const queryLower = query.trim().toLowerCase();
  const matches = [];

  for (const entry of promptStore.values()) {
    let score = 0;

    // Name matching
    const nameLower = entry.name.toLowerCase();
    if (nameLower === queryLower) {
      score += 100;
    } else if (nameLower.includes(queryLower)) {
      score += 60;
    }

    // Description matching
    const descLower = (entry.description || '').toLowerCase();
    if (descLower.includes(queryLower)) {
      score += 40;
    }

    // Tag matching
    for (const tag of entry.tags) {
      if (tag.toLowerCase().includes(queryLower)) {
        score += 30;
      }
    }

    // Template content matching
    const templateLower = entry.template.toLowerCase();
    if (templateLower.includes(queryLower)) {
      score += 20;
    }

    // Category matching
    const categoryLower = entry.category.toLowerCase();
    if (categoryLower.includes(queryLower)) {
      score += 25;
    }

    if (score > 0) {
      matches.push({ entry, score });
    }
  }

  // Sort by relevance score descending
  matches.sort((a, b) => b.score - a.score);

  if (matches.length === 0) {
    return {
      result: `No prompts match the query "${query}".`,
      metadata: { success: true, action: 'search', query, matchCount: 0, results: [] }
    };
  }

  const topResults = matches.slice(0, 10);

  const formatted = topResults
    .map((m, i) => {
      const preview = m.entry.template.length > 100
        ? m.entry.template.substring(0, 100) + '...'
        : m.entry.template;
      return `${i + 1}. [${m.entry.name}] (score: ${m.score}, category: ${m.entry.category})\n   ${m.entry.description || '(no description)'}\n   Template: ${preview}`;
    })
    .join('\n\n');

  return {
    result: `Found ${matches.length} prompt(s) matching "${query}":\n\n${formatted}`,
    metadata: {
      success: true,
      action: 'search',
      query,
      matchCount: matches.length,
      results: topResults.map(m => ({
        name: m.entry.name,
        score: m.score,
        category: m.entry.category,
        description: m.entry.description
      }))
    }
  };
}

/**
 * List all prompts, optionally filtered by category.
 */
function handleList(params) {
  const { category } = params;

  let entries = [...promptStore.values()];

  if (category && typeof category === 'string' && category.trim().length > 0) {
    const filterCategory = category.trim().toLowerCase();
    entries = entries.filter(e => e.category.toLowerCase() === filterCategory);
  }

  if (entries.length === 0) {
    const message = category
      ? `No prompts found in category "${category}".`
      : 'The prompt library is empty.';
    return {
      result: message,
      metadata: { success: true, action: 'list', count: 0, prompts: [] }
    };
  }

  const formatted = entries
    .map((e, i) => {
      const preview = e.template.length > 80
        ? e.template.substring(0, 80) + '...'
        : e.template;
      return `${i + 1}. [${e.name}] (v${e.version}, category: ${e.category})\n   ${e.description || '(no description)'}\n   Template: ${preview}`;
    })
    .join('\n\n');

  const label = category ? `Prompts in category "${category}"` : 'All prompts';

  return {
    result: `${label} (${entries.length}):\n\n${formatted}`,
    metadata: {
      success: true,
      action: 'list',
      count: entries.length,
      category: category || null,
      prompts: entries.map(e => ({
        name: e.name,
        category: e.category,
        version: e.version,
        description: e.description
      }))
    }
  };
}

/**
 * Delete a prompt by name.
 */
function handleDelete(params) {
  const { name } = params;

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return {
      result: 'Error: name is required for the delete action.',
      metadata: { success: false, error: 'MISSING_NAME' }
    };
  }

  const trimmedName = name.trim();

  if (!promptStore.has(trimmedName)) {
    return {
      result: `No prompt found with name "${trimmedName}". Nothing to delete.`,
      metadata: { success: false, error: 'NOT_FOUND', name: trimmedName }
    };
  }

  promptStore.delete(trimmedName);

  return {
    result: `Prompt "${trimmedName}" deleted successfully.`,
    metadata: {
      success: true,
      action: 'delete',
      name: trimmedName,
      remainingPrompts: promptStore.size
    }
  };
}

/**
 * Render a prompt template by name with provided variable substitutions.
 */
function handleRender(params) {
  const { name, variables } = params;

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return {
      result: 'Error: name is required for the render action.',
      metadata: { success: false, error: 'MISSING_NAME' }
    };
  }

  const trimmedName = name.trim();

  if (!promptStore.has(trimmedName)) {
    return {
      result: `No prompt found with name "${trimmedName}". Cannot render.`,
      metadata: { success: false, error: 'NOT_FOUND', name: trimmedName }
    };
  }

  const entry = promptStore.get(trimmedName);
  const providedVars = variables && typeof variables === 'object' ? variables : {};

  // Check for missing variables
  const missingVars = entry.variables.filter(v => !(v in providedVars));

  if (missingVars.length > 0) {
    return {
      result: `Error: Missing required variables for prompt "${trimmedName}": ${missingVars.join(', ')}`,
      metadata: {
        success: false,
        error: 'MISSING_VARIABLES',
        name: trimmedName,
        missingVariables: missingVars,
        requiredVariables: entry.variables,
        providedVariables: Object.keys(providedVars)
      }
    };
  }

  // Perform variable substitution
  let rendered = entry.template;
  for (const [key, value] of Object.entries(providedVars)) {
    const placeholder = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    rendered = rendered.replace(placeholder, String(value));
  }

  return {
    result: rendered,
    metadata: {
      success: true,
      action: 'render',
      name: trimmedName,
      version: entry.version,
      variablesUsed: Object.keys(providedVars)
    }
  };
}

/**
 * List all unique categories in the prompt library.
 */
function handleCategories() {
  const categories = new Set();

  for (const entry of promptStore.values()) {
    categories.add(entry.category);
  }

  const sortedCategories = [...categories].sort();

  if (sortedCategories.length === 0) {
    return {
      result: 'No categories found. The prompt library is empty.',
      metadata: { success: true, action: 'categories', count: 0, categories: [] }
    };
  }

  // Count prompts per category
  const categoryCounts = {};
  for (const cat of sortedCategories) {
    categoryCounts[cat] = 0;
  }
  for (const entry of promptStore.values()) {
    categoryCounts[entry.category]++;
  }

  const formatted = sortedCategories
    .map(c => `  - ${c} (${categoryCounts[c]} prompt${categoryCounts[c] !== 1 ? 's' : ''})`)
    .join('\n');

  return {
    result: `Categories (${sortedCategories.length}):\n\n${formatted}`,
    metadata: {
      success: true,
      action: 'categories',
      count: sortedCategories.length,
      categories: sortedCategories,
      categoryCounts
    }
  };
}

/**
 * Execute a prompt library operation.
 *
 * @param {Object} params - The tool parameters.
 * @param {string} params.action - One of: add, get, search, list, delete, render, categories
 * @param {string} [params.name] - Prompt name/identifier.
 * @param {string} [params.template] - Template text with {{variable}} placeholders.
 * @param {string} [params.category] - Category for organization.
 * @param {string} [params.description] - Brief description of the prompt.
 * @param {string[]} [params.tags] - Tags for search/filtering.
 * @param {Object} [params.variables] - Key-value pairs for template rendering.
 * @param {string} [params.query] - Search query string.
 * @param {Object} context - Execution context provided by the runtime.
 * @returns {Promise<{result: string, metadata: Object}>}
 */
export async function execute(params, context) {
  const { action } = params;

  const validActions = ['add', 'get', 'search', 'list', 'delete', 'render', 'categories'];
  if (!action || !validActions.includes(action)) {
    return {
      result: `Error: Invalid action "${action}". Must be one of: ${validActions.join(', ')}`,
      metadata: { success: false, error: 'INVALID_ACTION' }
    };
  }

  switch (action) {
    case 'add':
      return handleAdd(params);
    case 'get':
      return handleGet(params);
    case 'search':
      return handleSearch(params);
    case 'list':
      return handleList(params);
    case 'delete':
      return handleDelete(params);
    case 'render':
      return handleRender(params);
    case 'categories':
      return handleCategories();
    default:
      return {
        result: `Error: Unknown action "${action}".`,
        metadata: { success: false, error: 'UNKNOWN_ACTION' }
      };
  }
}
