/**
 * Google Maps API Skill Handler (Layer 1)
 * Geocode addresses, search places, and calculate routes via Google Maps.
 */

const VALID_ACTIONS = ['geocode', 'search_places', 'get_directions', 'get_place_details'];
const DEFAULT_TIMEOUT_MS = 30000;
const MAX_TIMEOUT_MS = 120000;
function getClient(context) { if (context?.providerClient) return { client: context.providerClient, type: 'provider' }; if (context?.gatewayClient) return { client: context.gatewayClient, type: 'gateway' }; return null; }
function providerNotConfiguredError() { return { result: 'Error: Provider client required for Google Maps API access.', metadata: { success: false, error: { code: 'PROVIDER_NOT_CONFIGURED', message: 'Provider client required.', retriable: false } } }; }
function resolveTimeout(context) { const c = context?.config?.timeoutMs; if (typeof c === 'number' && c > 0) return Math.min(c, MAX_TIMEOUT_MS); return DEFAULT_TIMEOUT_MS; }
async function requestWithTimeout(client, method, path, opts, timeoutMs) { const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs); try { const r = await client.request(method, path, null, { ...opts, signal: controller.signal }); clearTimeout(timer); return r; } catch (err) { clearTimeout(timer); if (err.name === 'AbortError') throw { code: 'TIMEOUT', message: `Request timed out after ${timeoutMs}ms.` }; throw { code: 'UPSTREAM_ERROR', message: err.message || 'Unknown upstream error' }; } }
const SENSITIVE_PATTERNS = [/(?:api[_-]?key|token|secret|password|authorization|bearer)\s*[:=]\s*\S+/gi];
function redactSensitive(text) { if (typeof text !== 'string') return text; let c = text; for (const p of SENSITIVE_PATTERNS) c = c.replace(p, '[REDACTED]'); return c; }
function validateNonEmptyString(value, fieldName) { if (!value || typeof value !== 'string') return { valid: false, error: `The "${fieldName}" parameter is required and must be a non-empty string.` }; const t = value.trim(); if (!t.length) return { valid: false, error: `The "${fieldName}" parameter must not be empty.` }; return { valid: true, value: t }; }

export function validate(params) { const { action } = params || {}; if (!action || !VALID_ACTIONS.includes(action)) return { valid: false, error: `Invalid action "${action}". Must be one of: ${VALID_ACTIONS.join(', ')}` }; switch (action) {
    case 'geocode': {
      const v_address = validateNonEmptyString(params.address, 'address');
      if (!v_address.valid) return { valid: false, error: v_address.error };
      return { valid: true };
    }
    case 'search_places': {
      const v_query = validateNonEmptyString(params.query, 'query');
      if (!v_query.valid) return { valid: false, error: v_query.error };
      return { valid: true };
    }
    case 'get_directions': {
      const v_origin = validateNonEmptyString(params.origin, 'origin');
      if (!v_origin.valid) return { valid: false, error: v_origin.error };
      const v_destination = validateNonEmptyString(params.destination, 'destination');
      if (!v_destination.valid) return { valid: false, error: v_destination.error };
      return { valid: true };
    }
    case 'get_place_details': {
      const v_placeId = validateNonEmptyString(params.placeId, 'placeId');
      if (!v_placeId.valid) return { valid: false, error: v_placeId.error };
      return { valid: true };
    }
    default: return { valid: false, error: `Unknown.` };
  }
}

async function handleGeocode(params, context) {
  const v_address = validateNonEmptyString(params.address, 'address');
  if (!v_address.valid) return { result: `Error: ${v_address.error}`, metadata: { success: false, action: 'geocode', error: 'INVALID_INPUT', timestamp: new Date().toISOString() } };
  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();
  const timeoutMs = resolveTimeout(context);
  try {
    const data = await requestWithTimeout(resolved.client, 'GET', `/geocode/json?address=${encodeURIComponent(v_address.value)}`, {}, timeoutMs);
    return { result: redactSensitive(JSON.stringify(data, null, 2)), metadata: { success: true, action: 'geocode', timestamp: new Date().toISOString() } };
  } catch (err) {
    return { result: redactSensitive(`Error: ${err.message}`), metadata: { success: false, action: 'geocode', error: err.code || 'UPSTREAM_ERROR', timestamp: new Date().toISOString() } };
  }
}

async function handleSearchPlaces(params, context) {
  const v_query = validateNonEmptyString(params.query, 'query');
  if (!v_query.valid) return { result: `Error: ${v_query.error}`, metadata: { success: false, action: 'search_places', error: 'INVALID_INPUT', timestamp: new Date().toISOString() } };
  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();
  const timeoutMs = resolveTimeout(context);
  try {
    const data = await requestWithTimeout(resolved.client, 'GET', `/place/textsearch/json?query=${encodeURIComponent(v_query.value)}&radius=${encodeURIComponent(String(params.radius ?? '5000'))}`, {}, timeoutMs);
    return { result: redactSensitive(JSON.stringify(data, null, 2)), metadata: { success: true, action: 'search_places', timestamp: new Date().toISOString() } };
  } catch (err) {
    return { result: redactSensitive(`Error: ${err.message}`), metadata: { success: false, action: 'search_places', error: err.code || 'UPSTREAM_ERROR', timestamp: new Date().toISOString() } };
  }
}

async function handleGetDirections(params, context) {
  const v_origin = validateNonEmptyString(params.origin, 'origin');
  if (!v_origin.valid) return { result: `Error: ${v_origin.error}`, metadata: { success: false, action: 'get_directions', error: 'INVALID_INPUT', timestamp: new Date().toISOString() } };
  const v_destination = validateNonEmptyString(params.destination, 'destination');
  if (!v_destination.valid) return { result: `Error: ${v_destination.error}`, metadata: { success: false, action: 'get_directions', error: 'INVALID_INPUT', timestamp: new Date().toISOString() } };
  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();
  const timeoutMs = resolveTimeout(context);
  try {
    const data = await requestWithTimeout(resolved.client, 'GET', `/directions/json?origin=${encodeURIComponent(v_origin.value)}&destination=${encodeURIComponent(v_destination.value)}&mode=${encodeURIComponent(String(params.mode ?? 'driving'))}`, {}, timeoutMs);
    return { result: redactSensitive(JSON.stringify(data, null, 2)), metadata: { success: true, action: 'get_directions', timestamp: new Date().toISOString() } };
  } catch (err) {
    return { result: redactSensitive(`Error: ${err.message}`), metadata: { success: false, action: 'get_directions', error: err.code || 'UPSTREAM_ERROR', timestamp: new Date().toISOString() } };
  }
}

async function handleGetPlaceDetails(params, context) {
  const v_placeId = validateNonEmptyString(params.placeId, 'placeId');
  if (!v_placeId.valid) return { result: `Error: ${v_placeId.error}`, metadata: { success: false, action: 'get_place_details', error: 'INVALID_INPUT', timestamp: new Date().toISOString() } };
  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();
  const timeoutMs = resolveTimeout(context);
  try {
    const data = await requestWithTimeout(resolved.client, 'GET', `/place/details/json?place_id=${encodeURIComponent(v_placeId.value)}`, {}, timeoutMs);
    return { result: redactSensitive(JSON.stringify(data, null, 2)), metadata: { success: true, action: 'get_place_details', timestamp: new Date().toISOString() } };
  } catch (err) {
    return { result: redactSensitive(`Error: ${err.message}`), metadata: { success: false, action: 'get_place_details', error: err.code || 'UPSTREAM_ERROR', timestamp: new Date().toISOString() } };
  }
}

export async function execute(params, context) { const { action } = params || {}; if (!action || !VALID_ACTIONS.includes(action)) return { result: `Error: Invalid action "${action}". Must be one of: ${VALID_ACTIONS.join(', ')}`, metadata: { success: false, action: action || null, error: 'INVALID_ACTION', timestamp: new Date().toISOString() } }; try { switch (action) {
      case 'geocode': return await handleGeocode(params, context);
      case 'search_places': return await handleSearchPlaces(params, context);
      case 'get_directions': return await handleGetDirections(params, context);
      case 'get_place_details': return await handleGetPlaceDetails(params, context);
      default: return { result: 'Error: Unknown action.', metadata: { success: false, action, error: 'INVALID_ACTION', timestamp: new Date().toISOString() } };
    } } catch (error) { return { result: redactSensitive(`Error: ${error.message}`), metadata: { success: false, action, error: 'UPSTREAM_ERROR', timestamp: new Date().toISOString() } }; }
}

export const meta = { name: 'google-maps-api', version: '1.0.0', description: 'Geocode addresses, search places, and calculate routes via Google Maps.', actions: VALID_ACTIONS };
export { getClient, providerNotConfiguredError, resolveTimeout, requestWithTimeout, redactSensitive, validateNonEmptyString, VALID_ACTIONS, DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS };
