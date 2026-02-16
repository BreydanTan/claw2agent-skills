/**
 * Markdown Writer Skill Handler
 *
 * Creates, formats, and converts Markdown documents.
 * Supports generating structured documents, tables, lists,
 * code blocks, tables of contents, and prettifying markdown.
 */

/**
 * Build a structured error response.
 *
 * @param {string} message - Human-readable error description
 * @param {string} code - Machine-readable error code
 * @param {boolean} [retriable=false] - Whether the caller should retry
 * @returns {{ result: string, metadata: Object }}
 */
function errorResponse(message, code, retriable = false) {
  return {
    result: `Error: ${message}`,
    metadata: {
      success: false,
      error: { code, message, retriable }
    }
  };
}

/**
 * Build a structured success response.
 *
 * @param {string} result - The generated markdown content
 * @param {Object} data - Action-specific metadata
 * @param {number} startTime - Performance.now() or Date.now() start timestamp
 * @returns {{ result: string, metadata: Object }}
 */
function successResponse(result, data, startTime) {
  return {
    result,
    metadata: {
      success: true,
      data,
      meta: { durationMs: Date.now() - startTime }
    }
  };
}

// ---------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------

/**
 * Generate a full markdown document from a title and sections array.
 *
 * @param {Object} params
 * @param {string} params.title - Document title
 * @param {Array<{heading: string, content: string}>} params.sections
 * @param {number} startTime
 * @returns {{ result: string, metadata: Object }}
 */
function handleCreate(params, startTime) {
  const { title, sections } = params;

  if (!title || typeof title !== 'string') {
    return errorResponse(
      'The "title" parameter is required for the create action.',
      'MISSING_TITLE'
    );
  }

  if (!sections || !Array.isArray(sections)) {
    return errorResponse(
      'The "sections" parameter must be an array for the create action.',
      'MISSING_SECTIONS'
    );
  }

  const lines = [`# ${title.trim()}`, ''];

  for (const section of sections) {
    if (!section || typeof section !== 'object') {
      continue;
    }
    const heading = section.heading ? section.heading.trim() : '';
    const content = section.content ? section.content.trim() : '';

    if (heading) {
      lines.push(`## ${heading}`, '');
    }
    if (content) {
      lines.push(content, '');
    }
  }

  const markdown = lines.join('\n').trimEnd() + '\n';

  return successResponse(markdown, {
    action: 'create',
    title,
    sectionCount: sections.length,
    characterCount: markdown.length
  }, startTime);
}

/**
 * Generate a markdown table from headers and rows.
 *
 * @param {Object} params
 * @param {string[]} params.headers - Column headers
 * @param {string[][]} params.rows - Table rows
 * @param {number} startTime
 * @returns {{ result: string, metadata: Object }}
 */
function handleTable(params, startTime) {
  const { headers, rows } = params;

  if (!headers || !Array.isArray(headers) || headers.length === 0) {
    return errorResponse(
      'The "headers" parameter must be a non-empty array for the table action.',
      'MISSING_HEADERS'
    );
  }

  if (!rows || !Array.isArray(rows)) {
    return errorResponse(
      'The "rows" parameter must be an array for the table action.',
      'MISSING_ROWS'
    );
  }

  const escapedHeaders = headers.map(h => String(h).replace(/\|/g, '\\|'));
  const headerLine = `| ${escapedHeaders.join(' | ')} |`;
  const separatorLine = `| ${headers.map(() => '---').join(' | ')} |`;

  const bodyLines = rows.map(row => {
    const cells = headers.map((_, i) => {
      const value = Array.isArray(row) && i < row.length ? String(row[i]) : '';
      return value.replace(/\|/g, '\\|');
    });
    return `| ${cells.join(' | ')} |`;
  });

  const markdown = [headerLine, separatorLine, ...bodyLines].join('\n') + '\n';

  return successResponse(markdown, {
    action: 'table',
    columnCount: headers.length,
    rowCount: rows.length,
    characterCount: markdown.length
  }, startTime);
}

/**
 * Generate an ordered or unordered list from items.
 *
 * @param {Object} params
 * @param {string[]} params.items - List items
 * @param {boolean} [params.ordered=false]
 * @param {number} startTime
 * @returns {{ result: string, metadata: Object }}
 */
function handleList(params, startTime) {
  const { items, ordered = false } = params;

  if (!items || !Array.isArray(items)) {
    return errorResponse(
      'The "items" parameter must be an array for the list action.',
      'MISSING_ITEMS'
    );
  }

  if (items.length === 0) {
    return errorResponse(
      'The "items" array must not be empty.',
      'EMPTY_ITEMS'
    );
  }

  const listLines = items.map((item, index) => {
    const text = String(item).trim();
    return ordered ? `${index + 1}. ${text}` : `- ${text}`;
  });

  const markdown = listLines.join('\n') + '\n';

  return successResponse(markdown, {
    action: 'list',
    ordered,
    itemCount: items.length,
    characterCount: markdown.length
  }, startTime);
}

/**
 * Wrap code in a fenced code block with optional language tag.
 *
 * @param {Object} params
 * @param {string} params.code - Code content
 * @param {string} [params.language] - Syntax highlighting language
 * @param {number} startTime
 * @returns {{ result: string, metadata: Object }}
 */
function handleCodeblock(params, startTime) {
  const { code, language } = params;

  if (code === undefined || code === null || typeof code !== 'string' || code.length === 0) {
    return errorResponse(
      'The "code" parameter is required for the codeblock action.',
      'MISSING_CODE'
    );
  }

  const lang = language ? String(language).trim() : '';
  const markdown = `\`\`\`${lang}\n${code}\n\`\`\`\n`;

  return successResponse(markdown, {
    action: 'codeblock',
    language: lang || null,
    lineCount: code.split('\n').length,
    characterCount: markdown.length
  }, startTime);
}

/**
 * Extract headings from markdown content and generate a table of contents.
 *
 * @param {Object} params
 * @param {string} params.content - Markdown content to scan
 * @param {number} startTime
 * @returns {{ result: string, metadata: Object }}
 */
function handleToc(params, startTime) {
  const { content } = params;

  if (!content || typeof content !== 'string') {
    return errorResponse(
      'The "content" parameter is required for the toc action.',
      'MISSING_CONTENT'
    );
  }

  const lines = content.split('\n');
  const headings = [];

  for (const line of lines) {
    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (match) {
      const level = match[1].length;
      const text = match[2].trim();
      headings.push({ level, text });
    }
  }

  if (headings.length === 0) {
    return errorResponse(
      'No headings found in the provided content.',
      'NO_HEADINGS'
    );
  }

  // Determine the minimum heading level to use as the base indent
  const minLevel = Math.min(...headings.map(h => h.level));

  const tocLines = ['## Table of Contents', ''];

  for (const heading of headings) {
    const indent = '  '.repeat(heading.level - minLevel);
    const slug = heading.text
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    tocLines.push(`${indent}- [${heading.text}](#${slug})`);
  }

  const markdown = tocLines.join('\n') + '\n';

  return successResponse(markdown, {
    action: 'toc',
    headingCount: headings.length,
    characterCount: markdown.length
  }, startTime);
}

/**
 * Clean up and prettify markdown content.
 * - Normalize heading spacing (exactly one space after #)
 * - Trim trailing whitespace from each line
 * - Ensure blank lines around headings
 * - Ensure blank lines around code blocks
 * - Collapse 3+ consecutive blank lines to 2
 * - Ensure file ends with a single newline
 *
 * @param {Object} params
 * @param {string} params.content - Markdown content to format
 * @param {number} startTime
 * @returns {{ result: string, metadata: Object }}
 */
function handleFormat(params, startTime) {
  const { content } = params;

  if (!content || typeof content !== 'string') {
    return errorResponse(
      'The "content" parameter is required for the format action.',
      'MISSING_CONTENT'
    );
  }

  let lines = content.split('\n');

  // Normalize heading spacing: ensure exactly one space after # characters
  lines = lines.map(line => {
    const headingMatch = line.match(/^(#{1,6})\s*(.+)$/);
    if (headingMatch) {
      return `${headingMatch[1]} ${headingMatch[2].trim()}`;
    }
    return line;
  });

  // Trim trailing whitespace from each line
  lines = lines.map(line => line.trimEnd());

  // Ensure blank lines around headings and code fences
  const result = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isHeading = /^#{1,6}\s/.test(line);
    const isFence = /^```/.test(line);

    // Insert blank line before heading or fence if the previous line is non-empty
    if ((isHeading || isFence) && result.length > 0) {
      const prev = result[result.length - 1];
      if (prev !== '') {
        result.push('');
      }
    }

    result.push(line);

    // Insert blank line after heading or fence if the next line is non-empty
    if ((isHeading || isFence) && i + 1 < lines.length && lines[i + 1] !== '') {
      result.push('');
    }
  }

  // Collapse 3+ consecutive blank lines to 2
  let formatted = result.join('\n');
  formatted = formatted.replace(/\n{3,}/g, '\n\n');

  // Ensure single trailing newline
  formatted = formatted.trimEnd() + '\n';

  return successResponse(formatted, {
    action: 'format',
    originalLength: content.length,
    formattedLength: formatted.length,
    characterCount: formatted.length
  }, startTime);
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Execute a markdown writing operation.
 *
 * @param {Object} params
 * @param {string} params.action - One of: create, table, list, codeblock, toc, format
 * @param {Object} context - Execution context from the runtime
 * @returns {Promise<{result: string, metadata: Object}>}
 */
export async function execute(params, context) {
  const startTime = Date.now();
  const { action } = params;

  const validActions = ['create', 'table', 'list', 'codeblock', 'toc', 'format'];

  if (!action || !validActions.includes(action)) {
    return errorResponse(
      `Invalid action "${action}". Must be one of: ${validActions.join(', ')}`,
      'INVALID_ACTION'
    );
  }

  try {
    switch (action) {
      case 'create':
        return handleCreate(params, startTime);
      case 'table':
        return handleTable(params, startTime);
      case 'list':
        return handleList(params, startTime);
      case 'codeblock':
        return handleCodeblock(params, startTime);
      case 'toc':
        return handleToc(params, startTime);
      case 'format':
        return handleFormat(params, startTime);
      default:
        return errorResponse(
          `Unknown action "${action}".`,
          'UNKNOWN_ACTION'
        );
    }
  } catch (error) {
    return errorResponse(
      `Unexpected error during "${action}" operation: ${error.message}`,
      'UNEXPECTED_ERROR',
      true
    );
  }
}
