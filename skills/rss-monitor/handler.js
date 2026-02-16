/**
 * RSS Feed Monitor Skill Handler
 *
 * Subscribe to, fetch, and monitor RSS/Atom feeds.
 * Parse feed entries, track new items, and filter by keywords.
 * Uses lightweight regex-based XML parsing with no external dependencies.
 */

// ---------------------------------------------------------------------------
// In-memory subscription store
// Key: friendly name (string)
// Value: { url, name, addedAt, lastCheckedAt, lastSeenIds: Set<string> }
// ---------------------------------------------------------------------------

const subscriptions = new Map();

// ---------------------------------------------------------------------------
// Private IP / reserved range patterns for SSRF protection
// ---------------------------------------------------------------------------

const PRIVATE_IP_PATTERNS = [
  /^https?:\/\/localhost/i,
  /^https?:\/\/127\./,
  /^https?:\/\/10\./,
  /^https?:\/\/172\.(1[6-9]|2[0-9]|3[01])\./,
  /^https?:\/\/192\.168\./,
  /^https?:\/\/0\./,
  /^https?:\/\/\[::1\]/,
  /^https?:\/\/\[fc/i,
  /^https?:\/\/\[fd/i,
  /^https?:\/\/\[fe80:/i,
  /^https?:\/\/169\.254\./
];

// ---------------------------------------------------------------------------
// URL validation
// ---------------------------------------------------------------------------

/**
 * Validate that a URL is well-formed, uses HTTPS, and does not point to
 * private or reserved IP ranges.
 *
 * @param {string} url
 * @returns {{ valid: boolean, reason?: string }}
 */
function validateUrl(url) {
  if (!url || typeof url !== 'string') {
    return { valid: false, reason: 'URL is required and must be a non-empty string.' };
  }

  const trimmed = url.trim();

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { valid: false, reason: 'URL is malformed.' };
  }

  if (parsed.protocol !== 'https:') {
    return { valid: false, reason: 'Only HTTPS URLs are allowed.' };
  }

  for (const pattern of PRIVATE_IP_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { valid: false, reason: 'URLs pointing to private or reserved IP ranges are not allowed.' };
    }
  }

  return { valid: true };
}

// ---------------------------------------------------------------------------
// XML / Feed parsing utilities
// ---------------------------------------------------------------------------

/**
 * Strip CDATA wrappers from a string.
 * Converts `<![CDATA[content]]>` to `content`.
 *
 * @param {string} text
 * @returns {string}
 */
function stripCdata(text) {
  if (!text) return '';
  return text.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
}

/**
 * Strip HTML tags from a string, leaving only text content.
 *
 * @param {string} html
 * @returns {string}
 */
function stripHtmlTags(html) {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, '').trim();
}

/**
 * Decode common XML/HTML entities.
 *
 * @param {string} text
 * @returns {string}
 */
function decodeEntities(text) {
  if (!text) return '';
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

/**
 * Extract the text content of an XML element by tag name.
 * Handles CDATA sections and returns decoded text.
 *
 * @param {string} xml - XML block to search within
 * @param {string} tagName - Tag name to extract
 * @returns {string} Extracted text or empty string
 */
function extractTag(xml, tagName) {
  // Match both self-closing and content tags, including namespaced variants
  const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i');
  const match = xml.match(regex);
  if (!match) return '';
  return decodeEntities(stripCdata(match[1].trim()));
}

/**
 * Extract the href attribute from an Atom <link> element.
 *
 * @param {string} xml - XML block to search within
 * @returns {string} Link URL or empty string
 */
function extractAtomLink(xml) {
  // Prefer alternate link, fall back to any link with href
  const alternateMatch = xml.match(/<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']*)["'][^>]*\/?>/i);
  if (alternateMatch) return decodeEntities(alternateMatch[1]);

  const hrefMatch = xml.match(/<link[^>]*href=["']([^"']*)["'][^>]*\/?>/i);
  if (hrefMatch) return decodeEntities(hrefMatch[1]);

  // Also try <link>...</link> style
  const contentMatch = xml.match(/<link[^>]*>([\s\S]*?)<\/link>/i);
  if (contentMatch) return decodeEntities(stripCdata(contentMatch[1].trim()));

  return '';
}

/**
 * Parse RSS/Atom XML into an array of feed entry objects.
 *
 * @param {string} xml - Raw XML string
 * @returns {{ entries: Array<Object>, feedTitle: string, feedType: string }}
 */
export function parseFeedXml(xml) {
  if (!xml || typeof xml !== 'string') {
    throw new Error('No XML content to parse.');
  }

  const isAtom = /<feed[\s>]/i.test(xml);
  const isRss = /<rss[\s>]/i.test(xml) || /<channel[\s>]/i.test(xml);

  if (!isAtom && !isRss) {
    throw new Error('Unrecognized feed format. Expected RSS or Atom XML.');
  }

  const entries = [];

  if (isAtom) {
    // Atom feed
    const feedTitle = extractTag(xml, 'title');

    // Split on <entry> blocks
    const entryBlocks = xml.split(/<entry[\s>]/i);

    for (let i = 1; i < entryBlocks.length; i++) {
      const block = entryBlocks[i];
      const endIdx = block.indexOf('</entry>');
      const entryXml = endIdx >= 0 ? block.substring(0, endIdx) : block;

      const title = extractTag(entryXml, 'title');
      const link = extractAtomLink(entryXml);
      const summary = stripHtmlTags(extractTag(entryXml, 'summary') || extractTag(entryXml, 'content'));
      const published = extractTag(entryXml, 'published') || extractTag(entryXml, 'updated');
      const author = extractTag(entryXml, 'name') || extractTag(entryXml, 'author');
      const id = extractTag(entryXml, 'id');

      entries.push({
        title,
        link,
        description: summary,
        pubDate: published,
        author,
        id: id || link || title
      });
    }

    return { entries, feedTitle, feedType: 'atom' };
  }

  // RSS feed
  const feedTitle = extractTag(xml, 'title');

  // Split on <item> blocks
  const itemBlocks = xml.split(/<item[\s>]/i);

  for (let i = 1; i < itemBlocks.length; i++) {
    const block = itemBlocks[i];
    const endIdx = block.indexOf('</item>');
    const itemXml = endIdx >= 0 ? block.substring(0, endIdx) : block;

    const title = extractTag(itemXml, 'title');
    const link = extractTag(itemXml, 'link');
    const description = stripHtmlTags(extractTag(itemXml, 'description'));
    const pubDate = extractTag(itemXml, 'pubDate') || extractTag(itemXml, 'dc:date');
    const author = extractTag(itemXml, 'author') || extractTag(itemXml, 'dc:creator');
    const guid = extractTag(itemXml, 'guid');

    entries.push({
      title,
      link,
      description,
      pubDate,
      author,
      id: guid || link || title
    });
  }

  return { entries, feedTitle, feedType: 'rss' };
}

// ---------------------------------------------------------------------------
// Keyword filtering
// ---------------------------------------------------------------------------

/**
 * Filter entries by keywords. An entry matches if any keyword appears
 * (case-insensitive) in the title or description.
 *
 * @param {Array<Object>} entries
 * @param {string[]} keywords
 * @returns {Array<Object>}
 */
function filterByKeywords(entries, keywords) {
  if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
    return entries;
  }

  const lowerKeywords = keywords.map(k => String(k).toLowerCase());

  return entries.filter(entry => {
    const text = `${entry.title} ${entry.description}`.toLowerCase();
    return lowerKeywords.some(kw => text.includes(kw));
  });
}

// ---------------------------------------------------------------------------
// Format entries for display
// ---------------------------------------------------------------------------

/**
 * Format an array of feed entries into a human-readable string.
 *
 * @param {Array<Object>} entries
 * @returns {string}
 */
function formatEntries(entries) {
  if (entries.length === 0) return 'No entries found.';

  return entries.map((entry, idx) => {
    const parts = [`${idx + 1}. ${entry.title || '(no title)'}`];
    if (entry.link) parts.push(`   URL: ${entry.link}`);
    if (entry.pubDate) parts.push(`   Date: ${entry.pubDate}`);
    if (entry.author) parts.push(`   Author: ${entry.author}`);
    if (entry.description) {
      const desc = entry.description.length > 200
        ? entry.description.substring(0, 200) + '...'
        : entry.description;
      parts.push(`   ${desc}`);
    }
    return parts.join('\n');
  }).join('\n\n');
}

// ---------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------

/**
 * Subscribe to an RSS/Atom feed.
 */
function handleSubscribe(params) {
  const { url, name } = params;

  const urlCheck = validateUrl(url);
  if (!urlCheck.valid) {
    return {
      result: `Error: ${urlCheck.reason}`,
      metadata: { success: false, error: 'INVALID_URL', reason: urlCheck.reason }
    };
  }

  const feedName = (name && typeof name === 'string' && name.trim().length > 0)
    ? name.trim()
    : url.trim();

  // Check for duplicate by name or URL
  for (const [existingName, sub] of subscriptions) {
    if (existingName === feedName || sub.url === url.trim()) {
      return {
        result: `Error: A subscription already exists for "${existingName}" (${sub.url}).`,
        metadata: { success: false, error: 'DUPLICATE_FEED', existingName, existingUrl: sub.url }
      };
    }
  }

  const now = new Date().toISOString();
  subscriptions.set(feedName, {
    url: url.trim(),
    name: feedName,
    addedAt: now,
    lastCheckedAt: null,
    lastSeenIds: new Set()
  });

  return {
    result: `Subscribed to feed "${feedName}" (${url.trim()}).`,
    metadata: {
      success: true,
      action: 'subscribe',
      name: feedName,
      url: url.trim(),
      addedAt: now,
      totalSubscriptions: subscriptions.size
    }
  };
}

/**
 * Unsubscribe from a feed by name or URL.
 */
function handleUnsubscribe(params) {
  const { name, url } = params;
  const identifier = (name && typeof name === 'string' && name.trim().length > 0)
    ? name.trim()
    : (url && typeof url === 'string' ? url.trim() : '');

  if (!identifier) {
    return {
      result: 'Error: A feed name or URL is required to unsubscribe.',
      metadata: { success: false, error: 'FEED_NOT_FOUND' }
    };
  }

  // Try by name first
  if (subscriptions.has(identifier)) {
    const sub = subscriptions.get(identifier);
    subscriptions.delete(identifier);
    return {
      result: `Unsubscribed from feed "${identifier}" (${sub.url}).`,
      metadata: {
        success: true,
        action: 'unsubscribe',
        name: identifier,
        url: sub.url,
        totalSubscriptions: subscriptions.size
      }
    };
  }

  // Try by URL
  for (const [feedName, sub] of subscriptions) {
    if (sub.url === identifier) {
      subscriptions.delete(feedName);
      return {
        result: `Unsubscribed from feed "${feedName}" (${sub.url}).`,
        metadata: {
          success: true,
          action: 'unsubscribe',
          name: feedName,
          url: sub.url,
          totalSubscriptions: subscriptions.size
        }
      };
    }
  }

  return {
    result: `Error: No subscription found matching "${identifier}".`,
    metadata: { success: false, error: 'FEED_NOT_FOUND', identifier }
  };
}

/**
 * Fetch and parse a feed URL directly, returning parsed entries.
 */
async function handleFetch(params) {
  const { url, maxItems = 10, keywords } = params;

  const urlCheck = validateUrl(url);
  if (!urlCheck.valid) {
    return {
      result: `Error: ${urlCheck.reason}`,
      metadata: { success: false, error: 'INVALID_URL', reason: urlCheck.reason }
    };
  }

  const clampedMax = Math.min(Math.max(1, maxItems), 100);

  let xml;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(url.trim(), {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ClawAgent/1.0; +https://github.com/claw2agent)',
        'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml'
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        result: `Error: Feed returned HTTP ${response.status}.`,
        metadata: { success: false, error: 'FETCH_ERROR', statusCode: response.status, url: url.trim() }
      };
    }

    xml = await response.text();
  } catch (error) {
    if (error.name === 'AbortError') {
      return {
        result: 'Error: Feed request timed out after 15 seconds.',
        metadata: { success: false, error: 'TIMEOUT', url: url.trim() }
      };
    }
    return {
      result: `Error: Failed to fetch feed: ${error.message}`,
      metadata: { success: false, error: 'FETCH_ERROR', errorMessage: error.message, url: url.trim() }
    };
  }

  let parsed;
  try {
    parsed = parseFeedXml(xml);
  } catch (error) {
    return {
      result: `Error: Failed to parse feed: ${error.message}`,
      metadata: { success: false, error: 'PARSE_ERROR', errorMessage: error.message, url: url.trim() }
    };
  }

  let entries = parsed.entries;

  // Apply keyword filter
  entries = filterByKeywords(entries, keywords);

  // Limit results
  const limited = entries.slice(0, clampedMax);

  const formatted = formatEntries(limited);

  return {
    result: `Feed: ${parsed.feedTitle || '(untitled)'} (${parsed.feedType})\nShowing ${limited.length} of ${entries.length} entries:\n\n${formatted}`,
    metadata: {
      success: true,
      action: 'fetch',
      feedTitle: parsed.feedTitle,
      feedType: parsed.feedType,
      url: url.trim(),
      totalEntries: parsed.entries.length,
      filteredEntries: entries.length,
      returnedEntries: limited.length,
      keywords: keywords || null,
      entries: limited
    }
  };
}

/**
 * List all subscribed feeds.
 */
function handleList() {
  if (subscriptions.size === 0) {
    return {
      result: 'No feed subscriptions.',
      metadata: { success: true, action: 'list', subscriptionCount: 0, subscriptions: [] }
    };
  }

  const subs = [];
  for (const [, sub] of subscriptions) {
    subs.push({
      name: sub.name,
      url: sub.url,
      addedAt: sub.addedAt,
      lastCheckedAt: sub.lastCheckedAt
    });
  }

  const formatted = subs.map((s, idx) => {
    const lastChecked = s.lastCheckedAt || 'never';
    return `${idx + 1}. ${s.name}\n   URL: ${s.url}\n   Added: ${s.addedAt}\n   Last checked: ${lastChecked}`;
  }).join('\n\n');

  return {
    result: `Feed subscriptions (${subs.length}):\n\n${formatted}`,
    metadata: {
      success: true,
      action: 'list',
      subscriptionCount: subs.length,
      subscriptions: subs
    }
  };
}

/**
 * Check all subscribed feeds for new entries since the last check.
 * Updates lastCheckedAt and lastSeenIds for each subscription.
 */
async function handleCheck(params) {
  const { maxItems = 10, keywords } = params;

  if (subscriptions.size === 0) {
    return {
      result: 'No feed subscriptions to check. Use the "subscribe" action to add feeds first.',
      metadata: { success: true, action: 'check', subscriptionCount: 0, newItems: [] }
    };
  }

  const clampedMax = Math.min(Math.max(1, maxItems), 100);
  const allNewItems = [];
  const errors = [];
  const now = new Date().toISOString();

  for (const [feedName, sub] of subscriptions) {
    let xml;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(sub.url, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; ClawAgent/1.0; +https://github.com/claw2agent)',
          'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml'
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        errors.push({ feed: feedName, error: `HTTP ${response.status}` });
        continue;
      }

      xml = await response.text();
    } catch (error) {
      const msg = error.name === 'AbortError' ? 'Timeout' : error.message;
      errors.push({ feed: feedName, error: msg });
      continue;
    }

    let parsed;
    try {
      parsed = parseFeedXml(xml);
    } catch (error) {
      errors.push({ feed: feedName, error: `Parse error: ${error.message}` });
      continue;
    }

    // Determine new entries
    const newEntries = parsed.entries.filter(entry => !sub.lastSeenIds.has(entry.id));

    // Update seen IDs
    const allIds = new Set(parsed.entries.map(e => e.id));
    sub.lastSeenIds = allIds;
    sub.lastCheckedAt = now;

    // Apply keyword filter to new entries
    const filtered = filterByKeywords(newEntries, keywords);

    for (const entry of filtered) {
      allNewItems.push({ ...entry, feedName });
    }
  }

  // Limit results
  const limited = allNewItems.slice(0, clampedMax);

  let resultText;
  if (limited.length === 0 && errors.length === 0) {
    resultText = 'No new entries found across all subscribed feeds.';
  } else {
    const parts = [];
    if (limited.length > 0) {
      const formatted = limited.map((entry, idx) => {
        const lines = [`${idx + 1}. [${entry.feedName}] ${entry.title || '(no title)'}`];
        if (entry.link) lines.push(`   URL: ${entry.link}`);
        if (entry.pubDate) lines.push(`   Date: ${entry.pubDate}`);
        if (entry.description) {
          const desc = entry.description.length > 200
            ? entry.description.substring(0, 200) + '...'
            : entry.description;
          lines.push(`   ${desc}`);
        }
        return lines.join('\n');
      }).join('\n\n');
      parts.push(`New entries (${limited.length} of ${allNewItems.length}):\n\n${formatted}`);
    } else {
      parts.push('No new entries found.');
    }

    if (errors.length > 0) {
      const errText = errors.map(e => `  - ${e.feed}: ${e.error}`).join('\n');
      parts.push(`\nErrors:\n${errText}`);
    }

    resultText = parts.join('\n');
  }

  return {
    result: resultText,
    metadata: {
      success: true,
      action: 'check',
      subscriptionCount: subscriptions.size,
      totalNewItems: allNewItems.length,
      returnedNewItems: limited.length,
      errors,
      keywords: keywords || null,
      newItems: limited
    }
  };
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Execute an RSS feed monitoring operation.
 *
 * @param {Object} params
 * @param {string} params.action - One of: subscribe, unsubscribe, fetch, list, check
 * @param {string} [params.url] - RSS/Atom feed URL
 * @param {string} [params.name] - Friendly name for the subscription
 * @param {number} [params.maxItems=10] - Maximum items to return
 * @param {string[]} [params.keywords] - Filter entries containing these keywords
 * @param {Object} context - Execution context provided by the runtime
 * @returns {Promise<{result: string, metadata: Object}>}
 */
export async function execute(params, context) {
  const { action } = params;

  const validActions = ['subscribe', 'unsubscribe', 'fetch', 'list', 'check'];

  if (!action || !validActions.includes(action)) {
    return {
      result: `Error: Invalid action "${action}". Must be one of: ${validActions.join(', ')}`,
      metadata: { success: false, error: 'INVALID_ACTION' }
    };
  }

  switch (action) {
    case 'subscribe':
      return handleSubscribe(params);
    case 'unsubscribe':
      return handleUnsubscribe(params);
    case 'fetch':
      return handleFetch(params);
    case 'list':
      return handleList();
    case 'check':
      return handleCheck(params);
    default:
      return {
        result: `Error: Unknown action "${action}".`,
        metadata: { success: false, error: 'INVALID_ACTION' }
      };
  }
}

/**
 * Expose the subscriptions map for testing purposes.
 * Allows tests to clear state between runs.
 */
export function _getSubscriptions() {
  return subscriptions;
}
