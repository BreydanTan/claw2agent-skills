const assert = require('assert');
const { pathToFileURL } = require('url');
const path = require('path');

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------

const results = { passed: 0, failed: 0, errors: [] };

async function test(name, fn) {
  try {
    await fn();
    results.passed++;
    console.log(`  PASS  ${name}`);
  } catch (err) {
    results.failed++;
    results.errors.push({ name, message: err.message });
    console.log(`  FAIL  ${name}`);
    console.log(`        ${err.message}`);
  }
}

function summary() {
  console.log('');
  console.log(`Results: ${results.passed} passed, ${results.failed} failed, ${results.passed + results.failed} total`);
  if (results.failed > 0) {
    console.log('');
    console.log('Failures:');
    for (const err of results.errors) {
      console.log(`  - ${err.name}: ${err.message}`);
    }
    process.exit(1);
  }
}

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
// Main
// ---------------------------------------------------------------------------

async function main() {
  // Dynamic import of the ES module handler
  const handlerPath = path.resolve(__dirname, '..', 'handler.js');
  const handlerUrl = pathToFileURL(handlerPath).href;
  const { execute, parseFeedXml, _getSubscriptions } = await import(handlerUrl);

  console.log('RSS Feed Monitor Skill - Handler Tests');
  console.log('======================================');
  console.log('');

  // Helper to reset subscriptions between test groups
  function clearSubscriptions() {
    const subs = _getSubscriptions();
    subs.clear();
  }

  // -----------------------------------------------------------------------
  // Invalid / missing action
  // -----------------------------------------------------------------------

  console.log('Action validation');

  await test('returns error for missing action', async () => {
    const res = await execute({}, {});
    assert.strictEqual(res.metadata.success, false);
    assert.strictEqual(res.metadata.error, 'INVALID_ACTION');
  });

  await test('returns error for invalid action', async () => {
    const res = await execute({ action: 'unknown' }, {});
    assert.strictEqual(res.metadata.success, false);
    assert.strictEqual(res.metadata.error, 'INVALID_ACTION');
    assert.ok(res.result.includes('Error'));
  });

  await test('returns error for null action', async () => {
    const res = await execute({ action: null }, {});
    assert.strictEqual(res.metadata.success, false);
    assert.strictEqual(res.metadata.error, 'INVALID_ACTION');
  });

  // -----------------------------------------------------------------------
  // XML parsing: RSS
  // -----------------------------------------------------------------------

  console.log('');
  console.log('XML parsing - RSS');

  await test('parses standard RSS XML', async () => {
    const result = parseFeedXml(SAMPLE_RSS_XML);
    assert.strictEqual(result.feedType, 'rss');
    assert.strictEqual(result.feedTitle, 'Test RSS Feed');
    assert.strictEqual(result.entries.length, 3);
  });

  await test('extracts RSS entry fields correctly', async () => {
    const result = parseFeedXml(SAMPLE_RSS_XML);
    const first = result.entries[0];
    assert.strictEqual(first.title, 'First Article');
    assert.strictEqual(first.link, 'https://example.com/article-1');
    assert.strictEqual(first.pubDate, 'Mon, 01 Jan 2024 12:00:00 GMT');
    assert.strictEqual(first.author, 'Alice');
    assert.strictEqual(first.id, 'article-1');
  });

  await test('strips CDATA and HTML from RSS descriptions', async () => {
    const result = parseFeedXml(SAMPLE_RSS_XML);
    const first = result.entries[0];
    // CDATA wrapper should be removed and HTML tags stripped
    assert.ok(!first.description.includes('<![CDATA['));
    assert.ok(!first.description.includes('<p>'));
    assert.ok(!first.description.includes('<b>'));
    assert.ok(first.description.includes('first'));
    assert.ok(first.description.includes('article description'));
  });

  await test('handles RSS entries without author', async () => {
    const result = parseFeedXml(SAMPLE_RSS_XML);
    const third = result.entries[2];
    assert.strictEqual(third.title, 'Third Article');
    assert.strictEqual(third.author, '');
  });

  await test('decodes XML entities in RSS', async () => {
    const result = parseFeedXml(SAMPLE_RSS_ENTITIES);
    assert.strictEqual(result.feedTitle, 'Entity & Test Feed');
    const entry = result.entries[0];
    assert.ok(entry.title.includes('&'));
    assert.ok(entry.title.includes('<special>'));
    assert.ok(entry.description.includes('"entities"'));
  });

  // -----------------------------------------------------------------------
  // XML parsing: Atom
  // -----------------------------------------------------------------------

  console.log('');
  console.log('XML parsing - Atom');

  await test('parses standard Atom XML', async () => {
    const result = parseFeedXml(SAMPLE_ATOM_XML);
    assert.strictEqual(result.feedType, 'atom');
    assert.strictEqual(result.feedTitle, 'Test Atom Feed');
    assert.strictEqual(result.entries.length, 2);
  });

  await test('extracts Atom entry fields correctly', async () => {
    const result = parseFeedXml(SAMPLE_ATOM_XML);
    const first = result.entries[0];
    assert.strictEqual(first.title, 'Atom Entry One');
    assert.strictEqual(first.link, 'https://example.com/entry-1');
    assert.strictEqual(first.pubDate, '2024-01-01T12:00:00Z');
    assert.strictEqual(first.author, 'Charlie');
    assert.strictEqual(first.id, 'urn:uuid:entry-1');
  });

  await test('strips CDATA and HTML from Atom summaries', async () => {
    const result = parseFeedXml(SAMPLE_ATOM_XML);
    const first = result.entries[0];
    assert.ok(!first.description.includes('<![CDATA['));
    assert.ok(!first.description.includes('<em>'));
    assert.ok(first.description.includes('first entry'));
  });

  await test('uses updated date when published is missing in Atom', async () => {
    const result = parseFeedXml(SAMPLE_ATOM_XML);
    const second = result.entries[1];
    assert.strictEqual(second.pubDate, '2024-01-02T12:00:00Z');
  });

  // -----------------------------------------------------------------------
  // XML parsing: errors
  // -----------------------------------------------------------------------

  console.log('');
  console.log('XML parsing - errors');

  await test('throws on null input', async () => {
    assert.throws(() => parseFeedXml(null), /No XML content/);
  });

  await test('throws on empty string', async () => {
    assert.throws(() => parseFeedXml(''), /No XML content/);
  });

  await test('throws on non-feed XML', async () => {
    assert.throws(() => parseFeedXml('<html><body>Not a feed</body></html>'), /Unrecognized feed format/);
  });

  // -----------------------------------------------------------------------
  // subscribe action
  // -----------------------------------------------------------------------

  console.log('');
  console.log('subscribe action');

  clearSubscriptions();

  await test('subscribes to a valid feed URL', async () => {
    const res = await execute({
      action: 'subscribe',
      url: 'https://example.com/feed.xml',
      name: 'Example Feed'
    }, {});
    assert.strictEqual(res.metadata.success, true);
    assert.strictEqual(res.metadata.action, 'subscribe');
    assert.strictEqual(res.metadata.name, 'Example Feed');
    assert.strictEqual(res.metadata.url, 'https://example.com/feed.xml');
    assert.strictEqual(res.metadata.totalSubscriptions, 1);
    assert.ok(res.result.includes('Subscribed'));
  });

  await test('rejects duplicate subscription by name', async () => {
    const res = await execute({
      action: 'subscribe',
      url: 'https://other.com/feed.xml',
      name: 'Example Feed'
    }, {});
    assert.strictEqual(res.metadata.success, false);
    assert.strictEqual(res.metadata.error, 'DUPLICATE_FEED');
  });

  await test('rejects duplicate subscription by URL', async () => {
    const res = await execute({
      action: 'subscribe',
      url: 'https://example.com/feed.xml',
      name: 'Different Name'
    }, {});
    assert.strictEqual(res.metadata.success, false);
    assert.strictEqual(res.metadata.error, 'DUPLICATE_FEED');
  });

  await test('rejects invalid URL (missing)', async () => {
    const res = await execute({ action: 'subscribe' }, {});
    assert.strictEqual(res.metadata.success, false);
    assert.strictEqual(res.metadata.error, 'INVALID_URL');
  });

  await test('rejects HTTP URL (not HTTPS)', async () => {
    const res = await execute({
      action: 'subscribe',
      url: 'http://example.com/feed.xml',
      name: 'HTTP Feed'
    }, {});
    assert.strictEqual(res.metadata.success, false);
    assert.strictEqual(res.metadata.error, 'INVALID_URL');
    assert.ok(res.metadata.reason.includes('HTTPS'));
  });

  await test('rejects private IP URL', async () => {
    const res = await execute({
      action: 'subscribe',
      url: 'https://192.168.1.1/feed.xml',
      name: 'Private Feed'
    }, {});
    assert.strictEqual(res.metadata.success, false);
    assert.strictEqual(res.metadata.error, 'INVALID_URL');
    assert.ok(res.metadata.reason.includes('private'));
  });

  await test('rejects localhost URL', async () => {
    const res = await execute({
      action: 'subscribe',
      url: 'https://localhost/feed.xml',
      name: 'Localhost Feed'
    }, {});
    assert.strictEqual(res.metadata.success, false);
    assert.strictEqual(res.metadata.error, 'INVALID_URL');
  });

  await test('uses URL as name when name is not provided', async () => {
    clearSubscriptions();
    const res = await execute({
      action: 'subscribe',
      url: 'https://example.com/rss'
    }, {});
    assert.strictEqual(res.metadata.success, true);
    assert.strictEqual(res.metadata.name, 'https://example.com/rss');
  });

  // -----------------------------------------------------------------------
  // unsubscribe action
  // -----------------------------------------------------------------------

  console.log('');
  console.log('unsubscribe action');

  clearSubscriptions();

  // Set up a subscription to unsubscribe from
  await execute({ action: 'subscribe', url: 'https://example.com/feed.xml', name: 'My Feed' }, {});
  await execute({ action: 'subscribe', url: 'https://other.com/feed.xml', name: 'Other Feed' }, {});

  await test('unsubscribes by name', async () => {
    const res = await execute({ action: 'unsubscribe', name: 'My Feed' }, {});
    assert.strictEqual(res.metadata.success, true);
    assert.strictEqual(res.metadata.action, 'unsubscribe');
    assert.strictEqual(res.metadata.name, 'My Feed');
    assert.strictEqual(res.metadata.totalSubscriptions, 1);
    assert.ok(res.result.includes('Unsubscribed'));
  });

  await test('unsubscribes by URL', async () => {
    const res = await execute({ action: 'unsubscribe', url: 'https://other.com/feed.xml' }, {});
    assert.strictEqual(res.metadata.success, true);
    assert.strictEqual(res.metadata.name, 'Other Feed');
    assert.strictEqual(res.metadata.totalSubscriptions, 0);
  });

  await test('returns error for non-existing subscription', async () => {
    const res = await execute({ action: 'unsubscribe', name: 'Nonexistent' }, {});
    assert.strictEqual(res.metadata.success, false);
    assert.strictEqual(res.metadata.error, 'FEED_NOT_FOUND');
  });

  await test('returns error when no name or URL provided', async () => {
    const res = await execute({ action: 'unsubscribe' }, {});
    assert.strictEqual(res.metadata.success, false);
    assert.strictEqual(res.metadata.error, 'FEED_NOT_FOUND');
  });

  // -----------------------------------------------------------------------
  // list action
  // -----------------------------------------------------------------------

  console.log('');
  console.log('list action');

  clearSubscriptions();

  await test('lists empty subscriptions', async () => {
    const res = await execute({ action: 'list' }, {});
    assert.strictEqual(res.metadata.success, true);
    assert.strictEqual(res.metadata.action, 'list');
    assert.strictEqual(res.metadata.subscriptionCount, 0);
    assert.deepStrictEqual(res.metadata.subscriptions, []);
    assert.ok(res.result.includes('No feed subscriptions'));
  });

  await test('lists subscriptions after adding feeds', async () => {
    await execute({ action: 'subscribe', url: 'https://example.com/feed1.xml', name: 'Feed One' }, {});
    await execute({ action: 'subscribe', url: 'https://example.com/feed2.xml', name: 'Feed Two' }, {});

    const res = await execute({ action: 'list' }, {});
    assert.strictEqual(res.metadata.success, true);
    assert.strictEqual(res.metadata.subscriptionCount, 2);
    assert.strictEqual(res.metadata.subscriptions.length, 2);
    assert.strictEqual(res.metadata.subscriptions[0].name, 'Feed One');
    assert.strictEqual(res.metadata.subscriptions[1].name, 'Feed Two');
    assert.ok(res.result.includes('Feed One'));
    assert.ok(res.result.includes('Feed Two'));
    assert.ok(res.result.includes('https://example.com/feed1.xml'));
  });

  await test('list shows lastCheckedAt as never when not yet checked', async () => {
    const res = await execute({ action: 'list' }, {});
    assert.strictEqual(res.metadata.subscriptions[0].lastCheckedAt, null);
    assert.ok(res.result.includes('never'));
  });

  // -----------------------------------------------------------------------
  // fetch action (URL validation only, no real network)
  // -----------------------------------------------------------------------

  console.log('');
  console.log('fetch action - URL validation');

  await test('fetch rejects missing URL', async () => {
    const res = await execute({ action: 'fetch' }, {});
    assert.strictEqual(res.metadata.success, false);
    assert.strictEqual(res.metadata.error, 'INVALID_URL');
  });

  await test('fetch rejects HTTP URL', async () => {
    const res = await execute({ action: 'fetch', url: 'http://example.com/feed' }, {});
    assert.strictEqual(res.metadata.success, false);
    assert.strictEqual(res.metadata.error, 'INVALID_URL');
  });

  await test('fetch rejects malformed URL', async () => {
    const res = await execute({ action: 'fetch', url: 'not-a-url' }, {});
    assert.strictEqual(res.metadata.success, false);
    assert.strictEqual(res.metadata.error, 'INVALID_URL');
  });

  await test('fetch rejects private IP 10.x', async () => {
    const res = await execute({ action: 'fetch', url: 'https://10.0.0.1/feed' }, {});
    assert.strictEqual(res.metadata.success, false);
    assert.strictEqual(res.metadata.error, 'INVALID_URL');
  });

  await test('fetch rejects 127.x URL', async () => {
    const res = await execute({ action: 'fetch', url: 'https://127.0.0.1/feed' }, {});
    assert.strictEqual(res.metadata.success, false);
    assert.strictEqual(res.metadata.error, 'INVALID_URL');
  });

  // -----------------------------------------------------------------------
  // parseFeedXml: advanced parsing
  // -----------------------------------------------------------------------

  console.log('');
  console.log('parseFeedXml - advanced');

  await test('parses RSS with no description', async () => {
    const xml = `<rss><channel><title>Minimal</title>
      <item><title>No Desc</title><link>https://example.com/1</link><guid>1</guid></item>
    </channel></rss>`;
    const result = parseFeedXml(xml);
    assert.strictEqual(result.entries.length, 1);
    assert.strictEqual(result.entries[0].title, 'No Desc');
    assert.strictEqual(result.entries[0].description, '');
  });

  await test('parses Atom with content instead of summary', async () => {
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
    assert.strictEqual(result.entries.length, 1);
    assert.strictEqual(result.entries[0].description, 'This is the full content.');
  });

  await test('falls back to link as id when guid is missing in RSS', async () => {
    const xml = `<rss><channel><title>No GUID</title>
      <item><title>No GUID Item</title><link>https://example.com/no-guid</link></item>
    </channel></rss>`;
    const result = parseFeedXml(xml);
    assert.strictEqual(result.entries[0].id, 'https://example.com/no-guid');
  });

  await test('falls back to title as id when both guid and link are missing in RSS', async () => {
    const xml = `<rss><channel><title>Fallback</title>
      <item><title>Only Title</title><description>Some desc</description></item>
    </channel></rss>`;
    const result = parseFeedXml(xml);
    assert.strictEqual(result.entries[0].id, 'Only Title');
  });

  await test('handles multiple items correctly', async () => {
    const result = parseFeedXml(SAMPLE_RSS_XML);
    assert.strictEqual(result.entries.length, 3);
    assert.strictEqual(result.entries[0].title, 'First Article');
    assert.strictEqual(result.entries[1].title, 'Second Article');
    assert.strictEqual(result.entries[2].title, 'Third Article');
  });

  // -----------------------------------------------------------------------
  // check action (empty subscriptions)
  // -----------------------------------------------------------------------

  console.log('');
  console.log('check action');

  clearSubscriptions();

  await test('check with no subscriptions returns informative message', async () => {
    const res = await execute({ action: 'check' }, {});
    assert.strictEqual(res.metadata.success, true);
    assert.strictEqual(res.metadata.action, 'check');
    assert.strictEqual(res.metadata.subscriptionCount, 0);
    assert.ok(res.result.includes('No feed subscriptions'));
  });

  // -----------------------------------------------------------------------
  // Done
  // -----------------------------------------------------------------------

  clearSubscriptions();
  summary();
}

main().catch(err => {
  console.error('Test runner failed:', err);
  process.exit(1);
});
