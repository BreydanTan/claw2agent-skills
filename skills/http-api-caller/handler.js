/**
 * HTTP / API Caller Skill Handler
 *
 * Makes HTTP requests to external APIs with full control over method,
 * headers, body, query parameters, timeout, and retry policy.
 *
 * Security:
 * - HTTPS-only (rejects http, file, ftp, and other schemes)
 * - Blocks requests to private/internal IP ranges (SSRF protection)
 * - Sanitizes URL input
 * - Redacts sensitive headers (Authorization, etc.) from response metadata
 * - Enforces timeout limits (default 30s, max 60s)
 */

const ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

const DEFAULT_TIMEOUT = 30000;
const MAX_TIMEOUT = 60000;
const MAX_RETRIES = 3;
const DEFAULT_RETRIES = 0;

const SENSITIVE_HEADER_PATTERNS = [
  /^authorization$/i,
  /^proxy-authorization$/i,
  /^cookie$/i,
  /^set-cookie$/i,
  /^x-api-key$/i,
  /^x-auth-token$/i,
];

/**
 * Private/internal IP patterns for SSRF protection.
 * Blocks: 127.x.x.x, 10.x.x.x, 172.16-31.x.x, 192.168.x.x, 0.0.0.0,
 *         ::1, localhost, and link-local addresses.
 */
const PRIVATE_IP_PATTERNS = [
  /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
  /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
  /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/,
  /^192\.168\.\d{1,3}\.\d{1,3}$/,
  /^0\.0\.0\.0$/,
  /^::1$/,
  /^fc00:/i,
  /^fd00:/i,
  /^fe80:/i,
  /^169\.254\.\d{1,3}\.\d{1,3}$/,
];

const BLOCKED_HOSTNAMES = ['localhost', 'localhost.localdomain', '[::1]'];

/**
 * Validate and sanitize the request URL.
 * Returns the parsed URL object or throws with an error code.
 *
 * @param {string} rawUrl - The raw URL string from the user
 * @returns {URL} Parsed and validated URL
 */
export function validateUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') {
    throw { code: 'INVALID_URL', message: 'URL is required and must be a non-empty string.' };
  }

  const trimmed = rawUrl.trim();

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw { code: 'INVALID_URL', message: `Invalid URL format: "${trimmed}"` };
  }

  // Enforce HTTPS only
  if (parsed.protocol !== 'https:') {
    throw {
      code: 'INVALID_URL',
      message: `Only https:// URLs are allowed. Received protocol: "${parsed.protocol}"`,
    };
  }

  // Block private/internal hostnames
  const hostname = parsed.hostname.toLowerCase();

  if (BLOCKED_HOSTNAMES.includes(hostname)) {
    throw {
      code: 'BLOCKED_URL',
      message: `Requests to "${hostname}" are blocked for security reasons.`,
    };
  }

  // Block private IP ranges
  for (const pattern of PRIVATE_IP_PATTERNS) {
    if (pattern.test(hostname)) {
      throw {
        code: 'BLOCKED_URL',
        message: `Requests to private/internal IP addresses are blocked for security reasons.`,
      };
    }
  }

  return parsed;
}

/**
 * Validate the HTTP method.
 *
 * @param {string} method - HTTP method string
 * @returns {string} Validated uppercase method
 */
export function validateMethod(method) {
  const upper = (method || 'GET').toUpperCase();
  if (!ALLOWED_METHODS.includes(upper)) {
    throw {
      code: 'INVALID_METHOD',
      message: `Invalid HTTP method: "${method}". Allowed: ${ALLOWED_METHODS.join(', ')}`,
    };
  }
  return upper;
}

/**
 * Build the Authorization header from the auth config.
 *
 * @param {Object} auth - Auth configuration
 * @param {string} auth.type - "bearer" or "basic"
 * @param {string} [auth.token] - Bearer token
 * @param {string} [auth.username] - Basic auth username
 * @param {string} [auth.password] - Basic auth password
 * @returns {string|null} The Authorization header value, or null
 */
export function buildAuthHeader(auth) {
  if (!auth || typeof auth !== 'object' || !auth.type) {
    return null;
  }

  const type = auth.type.toLowerCase();

  if (type === 'bearer') {
    if (!auth.token) {
      throw {
        code: 'INVALID_URL',
        message: 'Bearer auth requires a "token" field.',
      };
    }
    return `Bearer ${auth.token}`;
  }

  if (type === 'basic') {
    if (!auth.username) {
      throw {
        code: 'INVALID_URL',
        message: 'Basic auth requires a "username" field.',
      };
    }
    const credentials = `${auth.username}:${auth.password || ''}`;
    const encoded = typeof btoa === 'function'
      ? btoa(credentials)
      : Buffer.from(credentials).toString('base64');
    return `Basic ${encoded}`;
  }

  throw {
    code: 'INVALID_URL',
    message: `Unsupported auth type: "${auth.type}". Use "bearer" or "basic".`,
  };
}

/**
 * Append query parameters to a URL object.
 *
 * @param {URL} url - The URL object to modify
 * @param {Object} queryParams - Key-value pairs to append
 * @returns {URL} The modified URL
 */
export function applyQueryParams(url, queryParams) {
  if (!queryParams || typeof queryParams !== 'object') {
    return url;
  }

  for (const [key, value] of Object.entries(queryParams)) {
    url.searchParams.append(key, String(value));
  }

  return url;
}

/**
 * Redact sensitive header values for safe logging.
 *
 * @param {Object} headers - Headers object
 * @returns {Object} Headers with sensitive values redacted
 */
function redactHeaders(headers) {
  if (!headers || typeof headers !== 'object') {
    return {};
  }

  const redacted = {};
  for (const [key, value] of Object.entries(headers)) {
    const isSensitive = SENSITIVE_HEADER_PATTERNS.some((pattern) => pattern.test(key));
    redacted[key] = isSensitive ? '[REDACTED]' : value;
  }
  return redacted;
}

/**
 * Sleep for a given number of milliseconds.
 *
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute an HTTP request to an external API.
 *
 * @param {Object} params
 * @param {string} params.url - Request URL (must be https)
 * @param {string} [params.method="GET"] - HTTP method
 * @param {Object} [params.headers] - Request headers
 * @param {*} [params.body] - Request body (object for JSON, string for text)
 * @param {Object} [params.queryParams] - URL query parameters
 * @param {number} [params.timeout=30000] - Timeout in ms (max 60000)
 * @param {number} [params.retries=0] - Retry count on failure (max 3)
 * @param {Object} [params.auth] - Auth config: { type, token?, username?, password? }
 * @param {Object} context - Execution context provided by the runtime
 * @returns {Promise<{result: string, metadata: Object}>}
 */
export async function execute(params, context) {
  const {
    url: rawUrl,
    method: rawMethod,
    headers: userHeaders = {},
    body,
    queryParams,
    timeout: rawTimeout,
    retries: rawRetries,
    auth,
  } = params || {};

  // --- Validate URL ---
  let parsedUrl;
  try {
    parsedUrl = validateUrl(rawUrl);
  } catch (err) {
    return {
      result: `Error: ${err.message}`,
      metadata: { success: false, error: err.code || 'INVALID_URL' },
    };
  }

  // --- Validate method ---
  let method;
  try {
    method = validateMethod(rawMethod);
  } catch (err) {
    return {
      result: `Error: ${err.message}`,
      metadata: { success: false, error: err.code || 'INVALID_METHOD' },
    };
  }

  // --- Apply query parameters ---
  try {
    applyQueryParams(parsedUrl, queryParams);
  } catch (err) {
    return {
      result: `Error applying query parameters: ${err.message}`,
      metadata: { success: false, error: 'INVALID_URL' },
    };
  }

  // --- Build headers ---
  const finalHeaders = { ...userHeaders };

  // Apply auth header
  try {
    const authHeader = buildAuthHeader(auth);
    if (authHeader) {
      finalHeaders['Authorization'] = authHeader;
    }
  } catch (err) {
    return {
      result: `Error: ${err.message}`,
      metadata: { success: false, error: err.code || 'INVALID_URL' },
    };
  }

  // --- Prepare body ---
  let fetchBody = undefined;
  if (body !== undefined && body !== null && !['GET', 'HEAD'].includes(method)) {
    if (typeof body === 'object') {
      fetchBody = JSON.stringify(body);
      if (!finalHeaders['Content-Type'] && !finalHeaders['content-type']) {
        finalHeaders['Content-Type'] = 'application/json';
      }
    } else {
      fetchBody = String(body);
    }
  }

  // --- Timeout and retries ---
  const timeout = Math.min(Math.max(1, rawTimeout || DEFAULT_TIMEOUT), MAX_TIMEOUT);
  const retries = Math.min(Math.max(0, rawRetries ?? DEFAULT_RETRIES), MAX_RETRIES);

  // --- Execute with retries ---
  let lastError;
  const startTime = Date.now();

  for (let attempt = 0; attempt <= retries; attempt++) {
    // Exponential backoff for retries (0ms, 1s, 2s, 4s)
    if (attempt > 0) {
      const backoff = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
      await sleep(backoff);
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(parsedUrl.toString(), {
        method,
        headers: finalHeaders,
        body: fetchBody,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const elapsed = Date.now() - startTime;

      // --- Parse response ---
      const contentType = response.headers.get('content-type') || '';
      let responseBody;
      let responseFormat;

      const rawText = await response.text();

      if (contentType.includes('application/json') || contentType.includes('+json')) {
        try {
          responseBody = JSON.parse(rawText);
          responseFormat = 'json';
        } catch {
          responseBody = rawText;
          responseFormat = 'text';
        }
      } else {
        // Attempt to parse as JSON even if content-type doesn't match
        try {
          responseBody = JSON.parse(rawText);
          responseFormat = 'json';
        } catch {
          responseBody = rawText;
          responseFormat = 'text';
        }
      }

      // --- Build response headers (redacted) ---
      const responseHeaders = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      // --- Build metadata ---
      const metadata = {
        success: response.ok,
        statusCode: response.status,
        statusText: response.statusText,
        method,
        url: parsedUrl.toString(),
        responseFormat,
        contentType: contentType || null,
        elapsed,
        attempt: attempt + 1,
        totalAttempts: attempt + 1,
        requestHeaders: redactHeaders(finalHeaders),
        responseHeaders: redactHeaders(responseHeaders),
      };

      if (!response.ok) {
        const resultText = typeof responseBody === 'object'
          ? JSON.stringify(responseBody, null, 2)
          : String(responseBody);

        return {
          result: `HTTP ${response.status} ${response.statusText}\n\n${resultText}`,
          metadata: { ...metadata, error: 'HTTP_ERROR' },
        };
      }

      const resultText = typeof responseBody === 'object'
        ? JSON.stringify(responseBody, null, 2)
        : String(responseBody);

      return {
        result: resultText,
        metadata,
      };
    } catch (error) {
      lastError = error;

      // Abort errors are timeouts - do not retry
      if (error.name === 'AbortError') {
        const elapsed = Date.now() - startTime;
        return {
          result: `Error: Request timed out after ${timeout}ms.`,
          metadata: {
            success: false,
            error: 'TIMEOUT',
            method,
            url: parsedUrl.toString(),
            timeout,
            elapsed,
            attempt: attempt + 1,
            totalAttempts: attempt + 1,
          },
        };
      }

      // For non-timeout errors, continue to retry if attempts remain
      if (attempt === retries) {
        break;
      }
    }
  }

  // All retries exhausted
  const elapsed = Date.now() - startTime;
  return {
    result: `Error: Network error after ${retries + 1} attempt(s): ${lastError.message}`,
    metadata: {
      success: false,
      error: 'NETWORK_ERROR',
      errorMessage: lastError.message,
      method,
      url: parsedUrl.toString(),
      elapsed,
      totalAttempts: retries + 1,
    },
  };
}
