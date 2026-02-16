/**
 * Discord Bot Skill Handler
 *
 * Interacts with the Discord API (v10) to send messages,
 * get channel information, and list guild channels.
 */

const DISCORD_API_BASE = "https://discord.com/api/v10";

/**
 * Execute a Discord API action.
 *
 * @param {object} params - The tool parameters.
 * @param {string} params.action - "sendMessage" | "getChannel" | "listChannels"
 * @param {string} [params.channelId] - Discord channel ID (required for sendMessage and getChannel).
 * @param {string} [params.content] - Message content (required for sendMessage).
 * @param {object} context - Execution context provided by the runtime.
 * @param {string} context.apiKey - The Discord Bot Token.
 * @returns {Promise<{result: string, metadata: object}>}
 */
export async function execute(params, context) {
  const { action, channelId, content } = params;
  const token = context?.apiKey;

  if (!token) {
    throw new Error(
      "Discord Bot Token is required. Please configure your API key."
    );
  }

  const headers = {
    Authorization: `Bot ${token}`,
    "Content-Type": "application/json",
  };

  switch (action) {
    case "sendMessage":
      return await sendMessage(headers, { channelId, content });
    case "getChannel":
      return await getChannel(headers, { channelId });
    case "listChannels":
      return await listChannels(headers, { channelId });
    default:
      throw new Error(
        `Unknown action: "${action}". Supported actions: sendMessage, getChannel, listChannels.`
      );
  }
}

/**
 * Send a message to a Discord channel.
 */
async function sendMessage(headers, { channelId, content }) {
  if (!channelId) {
    throw new Error("channelId is required for the sendMessage action.");
  }
  if (!content) {
    throw new Error("content is required for the sendMessage action.");
  }

  const response = await fetch(
    `${DISCORD_API_BASE}/channels/${channelId}/messages`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ content }),
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      `Discord API error (${response.status}): ${error.message || response.statusText}`
    );
  }

  const msg = await response.json();

  return {
    result: `Message sent successfully to channel ${channelId}.\nMessage ID: ${msg.id}\nTimestamp: ${msg.timestamp}\nContent: ${msg.content}`,
    metadata: {
      messageId: msg.id,
      channelId: msg.channel_id,
      timestamp: msg.timestamp,
      author: {
        id: msg.author?.id,
        username: msg.author?.username,
      },
    },
  };
}

/**
 * Get details about a Discord channel.
 */
async function getChannel(headers, { channelId }) {
  if (!channelId) {
    throw new Error("channelId is required for the getChannel action.");
  }

  const response = await fetch(
    `${DISCORD_API_BASE}/channels/${channelId}`,
    {
      method: "GET",
      headers,
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      `Discord API error (${response.status}): ${error.message || response.statusText}`
    );
  }

  const channel = await response.json();

  const channelTypes = {
    0: "Text",
    1: "DM",
    2: "Voice",
    3: "Group DM",
    4: "Category",
    5: "Announcement",
    10: "Announcement Thread",
    11: "Public Thread",
    12: "Private Thread",
    13: "Stage Voice",
    14: "Directory",
    15: "Forum",
    16: "Media",
  };

  return {
    result: [
      `Channel Information:`,
      `  Name: #${channel.name || "(unnamed)"}`,
      `  ID: ${channel.id}`,
      `  Type: ${channelTypes[channel.type] || `Unknown (${channel.type})`}`,
      `  Guild ID: ${channel.guild_id || "N/A (DM)"}`,
      `  Topic: ${channel.topic || "(no topic set)"}`,
      `  NSFW: ${channel.nsfw ?? "N/A"}`,
      `  Position: ${channel.position ?? "N/A"}`,
    ].join("\n"),
    metadata: {
      id: channel.id,
      name: channel.name,
      type: channel.type,
      typeName: channelTypes[channel.type] || "Unknown",
      guildId: channel.guild_id,
      topic: channel.topic,
      nsfw: channel.nsfw,
      position: channel.position,
    },
  };
}

/**
 * List all channels in the guild that the given channel belongs to.
 * First fetches the channel to determine its guild, then lists guild channels.
 */
async function listChannels(headers, { channelId }) {
  if (!channelId) {
    throw new Error(
      "channelId is required for the listChannels action (used to determine the guild)."
    );
  }

  // Step 1: Get the channel to find its guild ID
  const channelResponse = await fetch(
    `${DISCORD_API_BASE}/channels/${channelId}`,
    {
      method: "GET",
      headers,
    }
  );

  if (!channelResponse.ok) {
    const error = await channelResponse.json().catch(() => ({}));
    throw new Error(
      `Discord API error fetching channel (${channelResponse.status}): ${error.message || channelResponse.statusText}`
    );
  }

  const channel = await channelResponse.json();

  if (!channel.guild_id) {
    throw new Error(
      "This channel does not belong to a guild (it may be a DM). Cannot list guild channels."
    );
  }

  // Step 2: List all channels in the guild
  const guildResponse = await fetch(
    `${DISCORD_API_BASE}/guilds/${channel.guild_id}/channels`,
    {
      method: "GET",
      headers,
    }
  );

  if (!guildResponse.ok) {
    const error = await guildResponse.json().catch(() => ({}));
    throw new Error(
      `Discord API error listing channels (${guildResponse.status}): ${error.message || guildResponse.statusText}`
    );
  }

  const channels = await guildResponse.json();

  const channelTypes = {
    0: "Text",
    1: "DM",
    2: "Voice",
    4: "Category",
    5: "Announcement",
    13: "Stage",
    15: "Forum",
    16: "Media",
  };

  const formatted = channels
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map((ch) => {
      const type = channelTypes[ch.type] || `Type(${ch.type})`;
      const prefix = ch.type === 4 ? "\n" : "  ";
      const name = ch.type === 4 ? ch.name.toUpperCase() : `#${ch.name}`;
      return `${prefix}${name} (${type}) - ID: ${ch.id}`;
    });

  return {
    result: `Channels in guild ${channel.guild_id}:\n${formatted.join("\n")}`,
    metadata: {
      guildId: channel.guild_id,
      channelCount: channels.length,
      channels: channels.map((ch) => ({
        id: ch.id,
        name: ch.name,
        type: ch.type,
      })),
    },
  };
}
