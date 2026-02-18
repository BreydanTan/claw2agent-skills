import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import { execute, parseFeedXml, _getSubscriptions } from '../handler.js';

// ---------------------------------------------------------------------------
// Sample XML fixtures
// ---------------------------------------------------------------------------

const SAMPLE_RSS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Test RSS Feed</title>
    <link>https://example.com</link>
    <description>A test RSS feed</description>
    <item>
      <title>First Article</title>
      <link>https://example.com/article-1</link>
      <description><![CDATA[<p>This is the <b>first</b> article description.</p>]]></description>
      <pubDate>Mon, 01 Jan 2024 12:00:00 GMT</pubDate>
      <author>Alice</author>
      <guid>article-1</guid>
    </item>
    <item>
      <title>Second Article</title>
      <link>https://example.com/article-2</link>
      <description>This is the second article about security vulnerabilities.</description>
      <pubDate>Tue, 02 Jan 2024 12:00:00 GMT</pubDate>
      <author>Bob</author>
      <guid>article-2</guid>
    </item>
    <item>
      <title>Third Article</title>
      <link>https://example.com/article-3</link>
      <description>A short update on the project release.</description>
      <pubDate>Wed, 03 Jan 2024 12:00:00 GMT</pubDate>
      <guid>article-3</guid>
    </item>
  </channel>
</rss>`;

const SAMPLE_ATOM_XML = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Test Atom Feed</title>
  <link href="https://example.com" rel="alternate"/>
  <entry>
    <title>Atom Entry One</title>
    <link href="https://example.com/entry-1" rel="alternate"/>
    <summary><![CDATA[Summary of the first entry with <em>HTML</em>.]]></summary>
    <published>2024-01-01T12:00:00Z</published>
    <author><name>Charlie</name></author>
    <id>urn:uuid:entry-1</id>
  </entry>
  <entry>
    <title>Atom Entry Two</title>
    <link href="https://example.com/entry-2" rel="alternate"/>
    <summary>Summary of the second entry about deployment.</summary>
    <updated>2024-01-02T12:00:00Z</updated>
    <author><name>Dana</name></author>
    <id>urn:uuid:entry-2</id>
  </entry>
</feed>`;

const SAMPLE_RSS_ENTITIES = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Entity &amp; Test Feed</title>
    <item>
      <title>Article with &amp; entities &lt;special&gt;</title>
      <link>https://example.com/entities</link>
      <description>Testing &quot;entities&quot; and &apos;quotes&apos;</description>
      <guid>entity-article</guid>
    </item>
  </channel>
</rss>`;

// ---------------------------------------------------------------------------
// Helper to reset subscriptions between test groups
// ---------------------------------------------------------------------------

function clearSubscriptions() {
  const subs = _getSubscriptions();
  subs.clear();
}

// ---------------------------------------------------------------------------
// Action validation
// ---------------------------------------------------------------------------

describe('Action validation', () => {
  beforeEach(() => {
    clearSubscriptions();
  });

  it('returns error for missing action', async () => {
    const res = await execute({}, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'INVALID_ACTION');
  });

  it('returns error for invalid action', async () => {
    const res = await execute({ action: 'unknown' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'INVALID_ACTION');
    assert.ok(res.result.includes('Error'));
  });

  it('returns error for null action', async () => {
    const res = await execute({ action: null }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'INVALID_ACTION');
  });
});

// ---------------------------------------------------------------------------
// XML parsing: RSS
// ---------------------------------------------------------------------------

describe('XML parsing - RSS', () => {
  it('parses standard RSS XML', () => {
    const result = parseFeedXml(SAMPLE_RSS_XML);
    assert.equal(result.feedType, 'rss');
    assert.equal(result.feedTitle, 'Test RSS Feed');
    assert.equal(result.entries.length, 3);
  });

  it('extracts RSS entry fields correctly', () => {
    const result = parseFeedXml(SAMPLE_RSS_XML);
    const first = result.entries[0];
    assert.equal(first.title, 'First Article');
    assert.equal(first.link, 'https://example.com/article-1');
    assert.equal(first.pubDate, 'Mon, 01 Jan 2024 12:00:00 GMT');
    assert.equal(first.author, 'Alice');
    assert.equal(first.id, 'article-1');
  });

  it('strips CDATA and HTML from RSS descriptions', () => {
    const result = parseFeedXml(SAMPLE_RSS_XML);
    const first = result.entries[0];
    // CDATA wrapper should be removed and HTML tags stripped
    assert.ok(!first.description.includes('<![CDATA['));
    assert.ok(!first.description.includes('<p>'));
    assert.ok(!first.description.includes('<b>'));
    assert.ok(first.description.includes('first'));
    assert.ok(first.description.includes('article description'));
  });

  it('handles RSS entries without author', () => {
    const result = parseFeedXml(SAMPLE_RSS_XML);
    const third = result.entries[2];
    assert.equal(third.title, 'Third Article');
    assert.equal(third.author, '');
  });

  it('decodes XML entities in RSS', () => {
    const result = parseFeedXml(SAMPLE_RSS_ENTITIES);
    assert.equal(result.feedTitle, 'Entity & Test Feed');
    const entry = result.entries[0];
    assert.ok(entry.title.includes('&'));
    assert.ok(entry.title.includes('<special>'));
    assert.ok(entry.description.includes('"entities"'));
  });
});

// ---------------------------------------------------------------------------
// XML parsing: Atom
// ---------------------------------------------------------------------------

describe('XML parsing - Atom', () => {
  it('parses standard Atom XML', () => {
    const result = parseFeedXml(SAMPLE_ATOM_XML);
    assert.equal(result.feedType, 'atom');
    assert.equal(result.feedTitle, 'Test Atom Feed');
    assert.equal(result.entries.length, 2);
  });

  it('extracts Atom entry fields correctly', () => {
    const result = parseFeedXml(SAMPLE_ATOM_XML);
    const first = result.entries[0];
    assert.equal(first.title, 'Atom Entry One');
    assert.equal(first.link, 'https://example.com/entry-1');
    assert.equal(first.pubDate, '2024-01-01T12:00:00Z');
    assert.equal(first.author, 'Charlie');
    assert.equal(first.id, 'urn:uuid:entry-1');
  });

  it('strips CDATA and HTML from Atom summaries', () => {
    const result = parseFeedXml(SAMPLE_ATOM_XML);
    const first = result.entries[0];
    assert.ok(!first.description.includes('<![CDATA['));
    assert.ok(!first.description.includes('<em>'));
    assert.ok(first.description.includes('first entry'));
  });

  it('uses updated date when published is missing in Atom', () => {
    const result = parseFeedXml(SAMPLE_ATOM_XML);
    const second = result.entries[1];
    assert.equal(second.pubDate, '2024-01-02T12:00:00Z');
  });
});

// ---------------------------------------------------------------------------
// XML parsing: errors
// ---------------------------------------------------------------------------

describe('XML parsing - errors', () => {
  it('throws on null input', () => {
    assert.throws(() => parseFeedXml(null), /No XML content/);
  });

  it('throws on empty string', () => {
    assert.throws(() => parseFeedXml(''), /No XML content/);
  });

  it('throws on non-feed XML', () => {
    assert.throws(() => parseFeedXml('<html><body>Not a feed</body></html>'), /Unrecognized feed format/);
  });
});

// ---------------------------------------------------------------------------
// subscribe action
// ---------------------------------------------------------------------------

describe('subscribe action', () => {
  beforeEach(() => {
    clearSubscriptions();
  });

  it('subscribes to a valid feed URL', async () => {
    const res = await execute({
      action: 'subscribe',
      url: 'https://example.com/feed.xml',
      name: 'Example Feed'
    }, {});
    assert.equal(res.metadata.success, true);
    assert.equal(res.metadata.action, 'subscribe');
    assert.equal(res.metadata.name, 'Example Feed');
    assert.equal(res.metadata.url, 'https://example.com/feed.xml');
    assert.equal(res.metadata.totalSubscriptions, 1);
    assert.ok(res.result.includes('Subscribed'));
  });

  it('rejects duplicate subscription by name', async () => {
    await execute({
      action: 'subscribe',
      url: 'https://example.com/feed.xml',
      name: 'Example Feed'
    }, {});
    const res = await execute({
      action: 'subscribe',
      url: 'https://other.com/feed.xml',
      name: 'Example Feed'
    }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'DUPLICATE_FEED');
  });

  it('rejects duplicate subscription by URL', async () => {
    await execute({
      action: 'subscribe',
      url: 'https://example.com/feed.xml',
      name: 'Example Feed'
    }, {});
    const res = await execute({
      action: 'subscribe',
      url: 'https://example.com/feed.xml',
      name: 'Different Name'
    }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'DUPLICATE_FEED');
  });

  it('rejects invalid URL (missing)', async () => {
    const res = await execute({ action: 'subscribe' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'INVALID_URL');
  });

  it('rejects HTTP URL (not HTTPS)', async () => {
    const res = await execute({
      action: 'subscribe',
      url: 'http://example.com/feed.xml',
      name: 'HTTP Feed'
    }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'INVALID_URL');
    assert.ok(res.metadata.reason.includes('HTTPS'));
  });

  it('rejects private IP URL', async () => {
    const res = await execute({
      action: 'subscribe',
      url: 'https://192.168.1.1/feed.xml',
      name: 'Private Feed'
    }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'INVALID_URL');
    assert.ok(res.metadata.reason.includes('private'));
  });

  it('rejects localhost URL', async () => {
    const res = await execute({
      action: 'subscribe',
      url: 'https://localhost/feed.xml',
      name: 'Localhost Feed'
    }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'INVALID_URL');
  });

  it('uses URL as name when name is not provided', async () => {
    const res = await execute({
      action: 'subscribe',
      url: 'https://example.com/rss'
    }, {});
    assert.equal(res.metadata.success, true);
    assert.equal(res.metadata.name, 'https://example.com/rss');
  });
});

// ---------------------------------------------------------------------------
// unsubscribe action
// ---------------------------------------------------------------------------

describe('unsubscribe action', () => {
  beforeEach(async () => {
    clearSubscriptions();
    await execute({ action: 'subscribe', url: 'https://example.com/feed.xml', name: 'My Feed' }, {});
    await execute({ action: 'subscribe', url: 'https://other.com/feed.xml', name: 'Other Feed' }, {});
  });

  it('unsubscribes by name', async () => {
    const res = await execute({ action: 'unsubscribe', name: 'My Feed' }, {});
    assert.equal(res.metadata.success, true);
    assert.equal(res.metadata.action, 'unsubscribe');
    assert.equal(res.metadata.name, 'My Feed');
    assert.equal(res.metadata.totalSubscriptions, 1);
    assert.ok(res.result.includes('Unsubscribed'));
  });

  it('unsubscribes by URL', async () => {
    const res = await execute({ action: 'unsubscribe', url: 'https://other.com/feed.xml' }, {});
    assert.equal(res.metadata.success, true);
    assert.equal(res.metadata.name, 'Other Feed');
    assert.equal(res.metadata.totalSubscriptions, 1);
  });

  it('returns error for non-existing subscription', async () => {
    const res = await execute({ action: 'unsubscribe', name: 'Nonexistent' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'FEED_NOT_FOUND');
  });

  it('returns error when no name or URL provided', async () => {
    const res = await execute({ action: 'unsubscribe' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'FEED_NOT_FOUND');
  });
});

// ---------------------------------------------------------------------------
// list action
// ---------------------------------------------------------------------------

describe('list action', () => {
  beforeEach(() => {
    clearSubscriptions();
  });

  it('lists empty subscriptions', async () => {
    const res = await execute({ action: 'list' }, {});
    assert.equal(res.metadata.success, true);
    assert.equal(res.metadata.action, 'list');
    assert.equal(res.metadata.subscriptionCount, 0);
    assert.deepEqual(res.metadata.subscriptions, []);
    assert.ok(res.result.includes('No feed subscriptions'));
  });

  it('lists subscriptions after adding feeds', async () => {
    await execute({ action: 'subscribe', url: 'https://example.com/feed1.xml', name: 'Feed One' }, {});
    await execute({ action: 'subscribe', url: 'https://example.com/feed2.xml', name: 'Feed Two' }, {});

    const res = await execute({ action: 'list' }, {});
    assert.equal(res.metadata.success, true);
    assert.equal(res.metadata.subscriptionCount, 2);
    assert.equal(res.metadata.subscriptions.length, 2);
    assert.equal(res.metadata.subscriptions[0].name, 'Feed One');
    assert.equal(res.metadata.subscriptions[1].name, 'Feed Two');
    assert.ok(res.result.includes('Feed One'));
    assert.ok(res.result.includes('Feed Two'));
    assert.ok(res.result.includes('https://example.com/feed1.xml'));
  });

  it('list shows lastCheckedAt as never when not yet checked', async () => {
    await execute({ action: 'subscribe', url: 'https://example.com/feed1.xml', name: 'Feed One' }, {});
    const res = await execute({ action: 'list' }, {});
    assert.equal(res.metadata.subscriptions[0].lastCheckedAt, null);
    assert.ok(res.result.includes('never'));
  });
});

// ---------------------------------------------------------------------------
// fetch action (URL validation only, no real network)
// ---------------------------------------------------------------------------

describe('fetch action - URL validation', () => {
  beforeEach(() => {
    clearSubscriptions();
  });

  it('fetch rejects missing URL', async () => {
    const res = await execute({ action: 'fetch' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'INVALID_URL');
  });

  it('fetch rejects HTTP URL', async () => {
    const res = await execute({ action: 'fetch', url: 'http://example.com/feed' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'INVALID_URL');
  });

  it('fetch rejects malformed URL', async () => {
    const res = await execute({ action: 'fetch', url: 'not-a-url' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'INVALID_URL');
  });

  it('fetch rejects private IP 10.x', async () => {
    const res = await execute({ action: 'fetch', url: 'https://10.0.0.1/feed' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'INVALID_URL');
  });

  it('fetch rejects 127.x URL', async () => {
    const res = await execute({ action: 'fetch', url: 'https://127.0.0.1/feed' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'INVALID_URL');
  });
});

// ---------------------------------------------------------------------------
// parseFeedXml: advanced parsing
// ---------------------------------------------------------------------------

describe('parseFeedXml - advanced', () => {
  it('parses RSS with no description', () => {
    const xml = `<rss><channel><title>Minimal</title>
      <item><title>No Desc</title><link>https://example.com/1</link><guid>1</guid></item>
    </channel></rss>`;
    const result = parseFeedXml(xml);
    assert.equal(result.entries.length, 1);
    assert.equal(result.entries[0].title, 'No Desc');
    assert.equal(result.entries[0].description, '');
  });

  it('parses Atom with content instead of summary', () => {
    const xml = `<feed xmlns="http://www.w3.org/2005/Atom">
      <title>Content Feed</title>
      <entry>
        <title>Content Entry</title>
        <link href="https://example.com/c1" rel="alternate"/>
        <content>This is the full content.</content>
        <id>c1</id>
      </entry>
    </feed>`;
    const result = parseFeedXml(xml);
    assert.equal(result.entries.length, 1);
    assert.equal(result.entries[0].description, 'This is the full content.');
  });

  it('falls back to link as id when guid is missing in RSS', () => {
    const xml = `<rss><channel><title>No GUID</title>
      <item><title>No GUID Item</title><link>https://example.com/no-guid</link></item>
    </channel></rss>`;
    const result = parseFeedXml(xml);
    assert.equal(result.entries[0].id, 'https://example.com/no-guid');
  });

  it('falls back to title as id when both guid and link are missing in RSS', () => {
    const xml = `<rss><channel><title>Fallback</title>
      <item><title>Only Title</title><description>Some desc</description></item>
    </channel></rss>`;
    const result = parseFeedXml(xml);
    assert.equal(result.entries[0].id, 'Only Title');
  });

  it('handles multiple items correctly', () => {
    const result = parseFeedXml(SAMPLE_RSS_XML);
    assert.equal(result.entries.length, 3);
    assert.equal(result.entries[0].title, 'First Article');
    assert.equal(result.entries[1].title, 'Second Article');
    assert.equal(result.entries[2].title, 'Third Article');
  });
});

// ---------------------------------------------------------------------------
// check action (empty subscriptions)
// ---------------------------------------------------------------------------

describe('check action', () => {
  beforeEach(() => {
    clearSubscriptions();
  });

  it('check with no subscriptions returns informative message', async () => {
    const res = await execute({ action: 'check' }, {});
    assert.equal(res.metadata.success, true);
    assert.equal(res.metadata.action, 'check');
    assert.equal(res.metadata.subscriptionCount, 0);
    assert.ok(res.result.includes('No feed subscriptions'));
  });
});
