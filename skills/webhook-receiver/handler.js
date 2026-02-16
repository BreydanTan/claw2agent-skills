/**
 * Webhook Receiver Skill Handler
 *
 * Register, manage, and inspect incoming webhook endpoints.
 * Stores received webhook payloads in memory for later inspection and processing.
 * Supports HMAC-SHA256 signature validation for secure webhook delivery.
 */

import { createHmac, randomUUID } from "node:crypto";

/**
 * In-memory store for webhook endpoints and their payloads.
 *
 * Structure:
 *   endpoints: Map<endpointId, { id, name, secret, createdAt, maxPayloads }>
 *   payloads:  Map<endpointId, Array<{ id, timestamp, headers, body }>>
 */
const endpoints = new Map();
const payloads = new Map();

/**
 * Validate that an endpoint ID contains only alphanumeric characters and hyphens.
 */
function isValidEndpointId(id) {
  return /^[a-zA-Z0-9-]+$/.test(id);
}

/**
 * Compute HMAC-SHA256 signature for a given payload and secret.
 */
function computeSignature(secret, body) {
  const hmac = createHmac("sha256", secret);
  hmac.update(typeof body === "string" ? body : JSON.stringify(body));
  return "sha256=" + hmac.digest("hex");
}

/**
 * Execute a webhook receiver action.
 *
 * @param {object} params - The tool parameters.
 * @param {string} params.action - "register" | "unregister" | "list" | "inspect" | "receive" | "clear"
 * @param {string} [params.endpointId] - Unique endpoint identifier.
 * @param {string} [params.name] - Human-friendly endpoint name.
 * @param {string} [params.secret] - Shared secret for HMAC-SHA256 validation.
 * @param {*} [params.payload] - Webhook payload data (for receive action).
 * @param {object} [params.headers] - Webhook request headers (for receive action).
 * @param {number} [params.maxPayloads] - Max payloads to store per endpoint.
 * @param {number} [params.limit] - Number of payloads to return (for inspect).
 * @param {number} [params.offset] - Offset for pagination (for inspect).
 * @param {object} context - Execution context provided by the runtime.
 * @returns {Promise<{result: string, metadata: object}>}
 */
export async function execute(params, context) {
  const { action } = params;

  switch (action) {
    case "register":
      return registerEndpoint(params);
    case "unregister":
      return unregisterEndpoint(params);
    case "list":
      return listEndpoints();
    case "inspect":
      return inspectEndpoint(params);
    case "receive":
      return receiveWebhook(params);
    case "clear":
      return clearPayloads(params);
    default:
      return {
        result: `Invalid action: "${action}". Supported actions: register, unregister, list, inspect, receive, clear.`,
        metadata: {
          success: false,
          errorCode: "INVALID_ACTION",
        },
      };
  }
}

/**
 * Register a new webhook endpoint.
 */
function registerEndpoint(params) {
  let { endpointId, name, secret, maxPayloads = 100 } = params;

  // Generate an ID if not provided
  if (!endpointId) {
    endpointId = randomUUID().slice(0, 12);
  }

  // Validate endpoint ID format
  if (!isValidEndpointId(endpointId)) {
    return {
      result: `Invalid endpoint ID "${endpointId}". Only alphanumeric characters and hyphens are allowed.`,
      metadata: {
        success: false,
        errorCode: "INVALID_ENDPOINT_ID",
      },
    };
  }

  // Check for duplicates
  if (endpoints.has(endpointId)) {
    return {
      result: `Endpoint "${endpointId}" already exists. Use a different ID or unregister the existing one first.`,
      metadata: {
        success: false,
        errorCode: "DUPLICATE_ENDPOINT",
      },
    };
  }

  const endpoint = {
    id: endpointId,
    name: name || endpointId,
    secret: secret || null,
    createdAt: new Date().toISOString(),
    maxPayloads,
  };

  endpoints.set(endpointId, endpoint);
  payloads.set(endpointId, []);

  return {
    result: `Webhook endpoint "${endpoint.name}" registered successfully with ID "${endpointId}".${secret ? " HMAC-SHA256 signature validation is enabled." : ""}`,
    metadata: {
      success: true,
      endpointId,
      name: endpoint.name,
      hasSecret: !!secret,
      createdAt: endpoint.createdAt,
      maxPayloads,
    },
  };
}

/**
 * Unregister an existing webhook endpoint and remove its stored payloads.
 */
function unregisterEndpoint(params) {
  const { endpointId } = params;

  if (!endpointId) {
    return {
      result: "An endpoint ID is required to unregister.",
      metadata: {
        success: false,
        errorCode: "MISSING_ENDPOINT_ID",
      },
    };
  }

  if (!endpoints.has(endpointId)) {
    return {
      result: `Endpoint "${endpointId}" not found.`,
      metadata: {
        success: false,
        errorCode: "ENDPOINT_NOT_FOUND",
      },
    };
  }

  const endpoint = endpoints.get(endpointId);
  const payloadCount = (payloads.get(endpointId) || []).length;

  endpoints.delete(endpointId);
  payloads.delete(endpointId);

  return {
    result: `Endpoint "${endpoint.name}" (${endpointId}) unregistered. ${payloadCount} stored payload(s) removed.`,
    metadata: {
      success: true,
      endpointId,
      name: endpoint.name,
      payloadsRemoved: payloadCount,
    },
  };
}

/**
 * List all registered endpoints. Never exposes secrets.
 */
function listEndpoints() {
  if (endpoints.size === 0) {
    return {
      result: "No webhook endpoints registered.",
      metadata: {
        success: true,
        totalEndpoints: 0,
        endpoints: [],
      },
    };
  }

  const endpointList = [];
  for (const [id, endpoint] of endpoints) {
    const storedPayloads = (payloads.get(id) || []).length;
    endpointList.push({
      id,
      name: endpoint.name,
      createdAt: endpoint.createdAt,
      hasSecret: !!endpoint.secret,
      payloadCount: storedPayloads,
      maxPayloads: endpoint.maxPayloads,
    });
  }

  const formatted = endpointList.map((ep) => {
    return `  - ${ep.name} (${ep.id}): ${ep.payloadCount} payload(s), created ${ep.createdAt}${ep.hasSecret ? " [secured]" : ""}`;
  });

  return {
    result: `Registered webhook endpoints (${endpointList.length}):\n\n${formatted.join("\n")}`,
    metadata: {
      success: true,
      totalEndpoints: endpointList.length,
      endpoints: endpointList,
    },
  };
}

/**
 * Inspect stored payloads for a given endpoint. Supports pagination with limit/offset.
 */
function inspectEndpoint(params) {
  const { endpointId, limit, offset = 0 } = params;

  if (!endpointId) {
    return {
      result: "An endpoint ID is required to inspect payloads.",
      metadata: {
        success: false,
        errorCode: "MISSING_ENDPOINT_ID",
      },
    };
  }

  if (!endpoints.has(endpointId)) {
    return {
      result: `Endpoint "${endpointId}" not found.`,
      metadata: {
        success: false,
        errorCode: "ENDPOINT_NOT_FOUND",
      },
    };
  }

  const stored = payloads.get(endpointId) || [];

  if (stored.length === 0) {
    return {
      result: `No payloads stored for endpoint "${endpointId}".`,
      metadata: {
        success: true,
        endpointId,
        totalPayloads: 0,
        payloads: [],
      },
    };
  }

  const sliceEnd = limit !== undefined ? offset + limit : stored.length;
  const page = stored.slice(offset, sliceEnd);

  const formatted = page.map((p, i) => {
    const bodyPreview =
      typeof p.body === "string"
        ? p.body.length > 200
          ? p.body.slice(0, 200) + "..."
          : p.body
        : JSON.stringify(p.body).length > 200
          ? JSON.stringify(p.body).slice(0, 200) + "..."
          : JSON.stringify(p.body);
    return `  ${offset + i + 1}. [${p.timestamp}] ${bodyPreview}`;
  });

  return {
    result: `Payloads for endpoint "${endpointId}" (showing ${page.length} of ${stored.length}):\n\n${formatted.join("\n")}`,
    metadata: {
      success: true,
      endpointId,
      totalPayloads: stored.length,
      offset,
      returned: page.length,
      payloads: page,
    },
  };
}

/**
 * Simulate receiving a webhook. Validates HMAC-SHA256 signature if a secret is configured.
 */
function receiveWebhook(params) {
  const { endpointId, payload, headers = {} } = params;

  if (!endpointId) {
    return {
      result: "An endpoint ID is required to receive a webhook.",
      metadata: {
        success: false,
        errorCode: "MISSING_ENDPOINT_ID",
      },
    };
  }

  if (!endpoints.has(endpointId)) {
    return {
      result: `Endpoint "${endpointId}" not found.`,
      metadata: {
        success: false,
        errorCode: "ENDPOINT_NOT_FOUND",
      },
    };
  }

  if (payload === undefined || payload === null) {
    return {
      result: "A payload is required for the receive action.",
      metadata: {
        success: false,
        errorCode: "MISSING_PAYLOAD",
      },
    };
  }

  const endpoint = endpoints.get(endpointId);

  // Validate HMAC-SHA256 signature if the endpoint has a secret
  if (endpoint.secret) {
    const providedSignature = headers["x-signature-256"];
    if (!providedSignature) {
      return {
        result: "Signature validation failed: missing x-signature-256 header.",
        metadata: {
          success: false,
          errorCode: "INVALID_SIGNATURE",
        },
      };
    }

    const expectedSignature = computeSignature(endpoint.secret, payload);
    if (providedSignature !== expectedSignature) {
      return {
        result: "Signature validation failed: the provided signature does not match the expected HMAC-SHA256 signature.",
        metadata: {
          success: false,
          errorCode: "INVALID_SIGNATURE",
        },
      };
    }
  }

  const stored = payloads.get(endpointId) || [];
  const entry = {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    headers,
    body: payload,
  };

  stored.push(entry);

  // Enforce max payloads limit by removing oldest entries
  while (stored.length > endpoint.maxPayloads) {
    stored.shift();
  }

  payloads.set(endpointId, stored);

  return {
    result: `Webhook received and stored for endpoint "${endpoint.name}" (${endpointId}). Total stored: ${stored.length}.`,
    metadata: {
      success: true,
      endpointId,
      payloadId: entry.id,
      timestamp: entry.timestamp,
      totalStored: stored.length,
    },
  };
}

/**
 * Clear all stored payloads for a given endpoint.
 */
function clearPayloads(params) {
  const { endpointId } = params;

  if (!endpointId) {
    return {
      result: "An endpoint ID is required to clear payloads.",
      metadata: {
        success: false,
        errorCode: "MISSING_ENDPOINT_ID",
      },
    };
  }

  if (!endpoints.has(endpointId)) {
    return {
      result: `Endpoint "${endpointId}" not found.`,
      metadata: {
        success: false,
        errorCode: "ENDPOINT_NOT_FOUND",
      },
    };
  }

  const stored = payloads.get(endpointId) || [];
  const count = stored.length;
  payloads.set(endpointId, []);

  return {
    result: `Cleared ${count} payload(s) from endpoint "${endpointId}".`,
    metadata: {
      success: true,
      endpointId,
      payloadsCleared: count,
    },
  };
}

/**
 * Exported for testing purposes only.
 */
export { endpoints, payloads, computeSignature };
