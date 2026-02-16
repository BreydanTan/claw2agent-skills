/**
 * Telegram Bot Skill Handler
 *
 * Interacts with the Telegram Bot API to send messages,
 * retrieve updates, and get bot information.
 */

const TELEGRAM_API_BASE = "https://api.telegram.org";

/**
 * Execute a Telegram Bot API action.
 *
 * @param {object} params - The tool parameters.
 * @param {string} params.action - "sendMessage" | "getUpdates" | "getMe"
 * @param {string} [params.chatId] - Target chat ID (required for sendMessage).
 * @param {string} [params.text] - Message text (required for sendMessage).
 * @param {string} [params.parseMode] - Optional parse mode: Markdown | MarkdownV2 | HTML.
 * @param {object} context - Execution context provided by the runtime.
 * @param {string} context.apiKey - The Telegram Bot Token.
 * @returns {Promise<{result: string, metadata: object}>}
 */
export async function execute(params, context) {
  const { action, chatId, text, parseMode } = params;
  const token = context?.apiKey;

  if (!token) {
    throw new Error(
      "Telegram Bot Token is required. Please configure your API key."
    );
  }

  const baseUrl = `${TELEGRAM_API_BASE}/bot${token}`;

  switch (action) {
    case "sendMessage":
      return await sendMessage(baseUrl, { chatId, text, parseMode });
    case "getUpdates":
      return await getUpdates(baseUrl);
    case "getMe":
      return await getMe(baseUrl);
    default:
      throw new Error(
        `Unknown action: "${action}". Supported actions: sendMessage, getUpdates, getMe.`
      );
  }
}

/**
 * Send a message to a Telegram chat.
 */
async function sendMessage(baseUrl, { chatId, text, parseMode }) {
  if (!chatId) {
    throw new Error("chatId is required for the sendMessage action.");
  }
  if (!text) {
    throw new Error("text is required for the sendMessage action.");
  }

  const body = {
    chat_id: chatId,
    text: text,
  };

  if (parseMode) {
    body.parse_mode = parseMode;
  }

  const response = await fetch(`${baseUrl}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await response.json();

  if (!data.ok) {
    throw new Error(
      `Telegram API error: ${data.description || "Unknown error"} (code: ${data.error_code || "N/A"})`
    );
  }

  const msg = data.result;
  return {
    result: `Message sent successfully to chat ${chatId}.\nMessage ID: ${msg.message_id}\nDate: ${new Date(msg.date * 1000).toISOString()}`,
    metadata: {
      messageId: msg.message_id,
      chatId: msg.chat.id,
      date: new Date(msg.date * 1000).toISOString(),
      from: msg.from?.username || msg.from?.first_name || "bot",
    },
  };
}

/**
 * Get recent updates (incoming messages) for the bot.
 */
async function getUpdates(baseUrl) {
  const response = await fetch(`${baseUrl}/getUpdates`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });

  const data = await response.json();

  if (!data.ok) {
    throw new Error(
      `Telegram API error: ${data.description || "Unknown error"} (code: ${data.error_code || "N/A"})`
    );
  }

  const updates = data.result || [];

  if (updates.length === 0) {
    return {
      result: "No new updates available.",
      metadata: { updateCount: 0 },
    };
  }

  const formatted = updates.map((update) => {
    const msg = update.message || update.edited_message;
    if (msg) {
      const sender = msg.from?.username || msg.from?.first_name || "unknown";
      const chatTitle = msg.chat.title || msg.chat.username || msg.chat.id;
      const text = msg.text || "(non-text message)";
      return `[${update.update_id}] ${sender} in ${chatTitle}: ${text}`;
    }
    return `[${update.update_id}] (non-message update)`;
  });

  return {
    result: `Found ${updates.length} update(s):\n\n${formatted.join("\n")}`,
    metadata: {
      updateCount: updates.length,
      latestUpdateId: updates[updates.length - 1].update_id,
    },
  };
}

/**
 * Get basic information about the bot.
 */
async function getMe(baseUrl) {
  const response = await fetch(`${baseUrl}/getMe`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });

  const data = await response.json();

  if (!data.ok) {
    throw new Error(
      `Telegram API error: ${data.description || "Unknown error"} (code: ${data.error_code || "N/A"})`
    );
  }

  const bot = data.result;
  return {
    result: [
      `Bot Information:`,
      `  Name: ${bot.first_name}`,
      `  Username: @${bot.username}`,
      `  Bot ID: ${bot.id}`,
      `  Can Join Groups: ${bot.can_join_groups ?? "N/A"}`,
      `  Can Read Group Messages: ${bot.can_read_all_group_messages ?? "N/A"}`,
      `  Supports Inline Queries: ${bot.supports_inline_queries ?? "N/A"}`,
    ].join("\n"),
    metadata: {
      botId: bot.id,
      username: bot.username,
      firstName: bot.first_name,
      canJoinGroups: bot.can_join_groups,
      canReadAllGroupMessages: bot.can_read_all_group_messages,
      supportsInlineQueries: bot.supports_inline_queries,
    },
  };
}
