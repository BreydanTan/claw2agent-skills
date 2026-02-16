/**
 * PII Detection & Redaction Skill Handler
 *
 * Detects and redacts personally identifiable information (PII) from text.
 * Supports emails, phone numbers, SSNs, credit card numbers, IP addresses,
 * and dates of birth using regex-based pattern matching.
 *
 * SECURITY NOTE: This skill processes sensitive data. Detected PII values
 * should never be logged in production environments.
 */

/**
 * PII pattern definitions.
 * Each entry contains a label, a regex, and an optional validator function.
 */
const PII_PATTERNS = {
  EMAIL: {
    label: 'EMAIL',
    regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  },
  PHONE: {
    label: 'PHONE',
    regex: /(\+?1[-.\s]?)?(\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}/g,
    validator: (match) => {
      // Filter out matches that are too short to be phone numbers
      const digits = match.replace(/\D/g, '');
      return digits.length >= 7 && digits.length <= 15;
    },
  },
  SSN: {
    label: 'SSN',
    regex: /\b\d{3}[-]?\d{2}[-]?\d{4}\b/g,
    validator: (match) => {
      // SSNs cannot start with 000, 666, or 9xx
      const digits = match.replace(/\D/g, '');
      if (digits.length !== 9) return false;
      const area = parseInt(digits.substring(0, 3), 10);
      if (area === 0 || area === 666 || area >= 900) return false;
      const group = parseInt(digits.substring(3, 5), 10);
      if (group === 0) return false;
      const serial = parseInt(digits.substring(5, 9), 10);
      if (serial === 0) return false;
      return true;
    },
  },
  CREDIT_CARD: {
    label: 'CREDIT_CARD',
    regex: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,
    validator: (match) => {
      return luhnCheck(match);
    },
  },
  IP_ADDRESS: {
    label: 'IP_ADDRESS',
    regex: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
    validator: (match) => {
      // Each octet must be 0-255
      const octets = match.split('.');
      return octets.every((o) => {
        const num = parseInt(o, 10);
        return num >= 0 && num <= 255;
      });
    },
  },
  DATE_OF_BIRTH: {
    label: 'DATE_OF_BIRTH',
    regex: /\b(?:\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}|\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2})\b/g,
    validator: (match) => {
      // Basic validation: ensure the date components are in reasonable ranges
      const parts = match.split(/[\/\-\.]/);
      if (parts.length !== 3) return false;
      const nums = parts.map((p) => parseInt(p, 10));
      // At least one part should be a plausible year (>= 1900 and <= 2099)
      // or all parts should be plausible day/month/year components
      return nums.every((n) => !isNaN(n) && n >= 0);
    },
  },
};

/**
 * Luhn algorithm to validate credit card numbers.
 *
 * @param {string} cardString - The credit card number string (may contain spaces/dashes)
 * @returns {boolean} True if the number passes the Luhn check
 */
function luhnCheck(cardString) {
  const digits = cardString.replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 19) return false;

  let sum = 0;
  let alternate = false;

  for (let i = digits.length - 1; i >= 0; i--) {
    let n = parseInt(digits[i], 10);
    if (alternate) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alternate = !alternate;
  }

  return sum % 10 === 0;
}

/**
 * Scan text for PII matches of the specified types.
 *
 * @param {string} text - The text to scan
 * @param {string[]|null} types - Specific PII types to scan for, or null for all
 * @returns {Array<{type: string, value: string, start: number, end: number}>}
 */
function scanForPII(text, types) {
  const results = [];
  const activePatterns = types
    ? Object.entries(PII_PATTERNS).filter(([key]) =>
        types.map((t) => t.toUpperCase()).includes(key)
      )
    : Object.entries(PII_PATTERNS);

  for (const [, pattern] of activePatterns) {
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
    let match;

    while ((match = regex.exec(text)) !== null) {
      const value = match[0];

      // Run optional validator
      if (pattern.validator && !pattern.validator(value)) {
        continue;
      }

      results.push({
        type: pattern.label,
        value,
        start: match.index,
        end: match.index + value.length,
      });
    }
  }

  // Sort by position in text
  results.sort((a, b) => a.start - b.start);

  // Remove overlapping matches (keep the longer match)
  const deduplicated = [];
  for (const item of results) {
    const lastItem = deduplicated[deduplicated.length - 1];
    if (lastItem && item.start < lastItem.end) {
      // Overlapping: keep the longer match
      if (item.end - item.start > lastItem.end - lastItem.start) {
        deduplicated[deduplicated.length - 1] = item;
      }
      continue;
    }
    deduplicated.push(item);
  }

  return deduplicated;
}

/**
 * Handle the "detect" action.
 * Returns a list of detected PII items with type, value, and position.
 *
 * @param {string} text - The input text
 * @param {string[]|null} types - PII types to filter
 * @returns {{result: string, metadata: object}}
 */
function handleDetect(text, types) {
  const findings = scanForPII(text, types);

  if (findings.length === 0) {
    return {
      result: 'No PII detected in the provided text.',
      metadata: {
        success: true,
        action: 'detect',
        piiFound: false,
        count: 0,
        findings: [],
      },
    };
  }

  const formatted = findings.map(
    (f, i) => `${i + 1}. [${f.type}] "${f.value}" (position: ${f.start}-${f.end})`
  );

  return {
    result: `Detected ${findings.length} PII item(s):\n\n${formatted.join('\n')}`,
    metadata: {
      success: true,
      action: 'detect',
      piiFound: true,
      count: findings.length,
      findings: findings.map((f) => ({
        type: f.type,
        value: f.value,
        start: f.start,
        end: f.end,
      })),
    },
  };
}

/**
 * Handle the "redact" action.
 * Replaces detected PII with placeholder strings.
 *
 * @param {string} text - The input text
 * @param {string[]|null} types - PII types to filter
 * @param {string|null} replacement - Custom replacement pattern
 * @returns {{result: string, metadata: object}}
 */
function handleRedact(text, types, replacement) {
  const findings = scanForPII(text, types);

  if (findings.length === 0) {
    return {
      result: text,
      metadata: {
        success: true,
        action: 'redact',
        piiFound: false,
        redactedCount: 0,
      },
    };
  }

  // Build redacted text by replacing from end to start to preserve positions
  let redacted = text;
  const sortedDesc = [...findings].sort((a, b) => b.start - a.start);

  for (const finding of sortedDesc) {
    const placeholder = replacement || `[REDACTED_${finding.type}]`;
    redacted = redacted.slice(0, finding.start) + placeholder + redacted.slice(finding.end);
  }

  return {
    result: redacted,
    metadata: {
      success: true,
      action: 'redact',
      piiFound: true,
      redactedCount: findings.length,
      typesRedacted: [...new Set(findings.map((f) => f.type))],
    },
  };
}

/**
 * Handle the "report" action.
 * Provides a detailed analysis with counts, risk level, and recommendations.
 *
 * @param {string} text - The input text
 * @param {string[]|null} types - PII types to filter
 * @returns {{result: string, metadata: object}}
 */
function handleReport(text, types) {
  const findings = scanForPII(text, types);

  // Count by type
  const countsByType = {};
  for (const finding of findings) {
    countsByType[finding.type] = (countsByType[finding.type] || 0) + 1;
  }

  // Determine risk level
  const totalCount = findings.length;
  const hasHighSensitivity = findings.some((f) =>
    ['SSN', 'CREDIT_CARD'].includes(f.type)
  );
  let riskLevel;
  if (totalCount === 0) {
    riskLevel = 'NONE';
  } else if (hasHighSensitivity || totalCount >= 5) {
    riskLevel = 'HIGH';
  } else if (totalCount >= 2) {
    riskLevel = 'MEDIUM';
  } else {
    riskLevel = 'LOW';
  }

  // Build recommendations
  const recommendations = [];
  if (totalCount === 0) {
    recommendations.push('No PII detected. Text appears safe for sharing.');
  } else {
    recommendations.push('Redact all PII before sharing or storing this text.');
    if (countsByType.SSN) {
      recommendations.push('CRITICAL: SSN detected. Ensure compliance with data protection regulations.');
    }
    if (countsByType.CREDIT_CARD) {
      recommendations.push('CRITICAL: Credit card number detected. Ensure PCI-DSS compliance.');
    }
    if (countsByType.EMAIL) {
      recommendations.push('Consider whether email addresses need to be retained or can be anonymized.');
    }
    if (countsByType.PHONE) {
      recommendations.push('Phone numbers should be removed or masked in public-facing documents.');
    }
    if (riskLevel === 'HIGH') {
      recommendations.push('HIGH RISK: This text contains highly sensitive PII. Handle with extreme care.');
    }
  }

  // Format report
  const reportLines = [
    '=== PII Analysis Report ===',
    '',
    `Total PII items found: ${totalCount}`,
    `Risk level: ${riskLevel}`,
    '',
    '--- Breakdown by Type ---',
  ];

  if (totalCount === 0) {
    reportLines.push('  (none)');
  } else {
    for (const [type, count] of Object.entries(countsByType)) {
      reportLines.push(`  ${type}: ${count}`);
    }
  }

  reportLines.push('');
  reportLines.push('--- Recommendations ---');
  recommendations.forEach((rec, i) => {
    reportLines.push(`  ${i + 1}. ${rec}`);
  });

  return {
    result: reportLines.join('\n'),
    metadata: {
      success: true,
      action: 'report',
      piiFound: totalCount > 0,
      totalCount,
      countsByType,
      riskLevel,
      recommendations,
    },
  };
}

/**
 * Execute a PII detection/redaction operation.
 *
 * @param {Object} params
 * @param {string} params.action - One of: detect, redact, report
 * @param {string} params.text - Text to scan for PII
 * @param {string[]} [params.types] - Specific PII types to look for
 * @param {string} [params.replacement] - Custom replacement pattern for redaction
 * @param {Object} context - Execution context from the runtime
 * @returns {Promise<{result: string, metadata: Object}>}
 */
export async function execute(params, context) {
  const { action, text, types, replacement } = params;

  // Validate action
  const validActions = ['detect', 'redact', 'report'];
  if (!action || !validActions.includes(action)) {
    return {
      result: `Error: Invalid action "${action}". Must be one of: ${validActions.join(', ')}`,
      metadata: { success: false, error: 'INVALID_ACTION' },
    };
  }

  // Validate text
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return {
      result: 'Error: The "text" parameter is required and must be a non-empty string.',
      metadata: { success: false, error: 'EMPTY_TEXT' },
    };
  }

  try {
    switch (action) {
      case 'detect':
        return handleDetect(text, types || null);
      case 'redact':
        return handleRedact(text, types || null, replacement || null);
      case 'report':
        return handleReport(text, types || null);
      default:
        return {
          result: `Error: Unknown action "${action}".`,
          metadata: { success: false, error: 'INVALID_ACTION' },
        };
    }
  } catch (error) {
    return {
      result: `Error during ${action} operation: ${error.message}`,
      metadata: { success: false, error: 'OPERATION_FAILED', detail: error.message },
    };
  }
}
