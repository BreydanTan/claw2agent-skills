/**
 * Remind Me Skill Handler
 *
 * In-memory reminder system using setTimeout and a Map.
 * Supports setting, listing, and cancelling reminders.
 */

/**
 * In-memory store for active reminders.
 * Key: reminderId (string), Value: { message, timerId, scheduledFor, createdAt, delay, unit }
 */
const reminders = new Map();

/**
 * Monotonically increasing counter for generating unique reminder IDs.
 */
let nextId = 1;

/**
 * Callbacks registered to receive reminder notifications.
 * Skills or the runtime can register listeners via onReminder().
 */
const listeners = [];

/**
 * Register a callback to be notified when a reminder fires.
 * @param {function} callback - Function called with (reminderId, message, scheduledFor).
 */
export function onReminder(callback) {
  if (typeof callback === "function") {
    listeners.push(callback);
  }
}

/**
 * Execute a reminder action.
 *
 * @param {object} params - The tool parameters.
 * @param {string} params.action - "set" | "list" | "cancel"
 * @param {string} [params.message] - Reminder message (required for set).
 * @param {number} [params.delay] - Delay amount (required for set).
 * @param {string} [params.unit="minutes"] - Time unit: "seconds" | "minutes" | "hours".
 * @param {object} context - Execution context provided by the runtime.
 * @returns {Promise<{result: string, metadata: object}>}
 */
export async function execute(params, context) {
  const { action, message, delay, unit = "minutes" } = params;

  switch (action) {
    case "set":
      return setReminder(message, delay, unit);
    case "list":
      return listReminders();
    case "cancel":
      return cancelReminder(params);
    default:
      throw new Error(
        `Unknown action: "${action}". Supported actions: set, list, cancel.`
      );
  }
}

/**
 * Convert delay + unit to milliseconds.
 */
function toMilliseconds(delay, unit) {
  switch (unit) {
    case "seconds":
      return delay * 1000;
    case "minutes":
      return delay * 60 * 1000;
    case "hours":
      return delay * 60 * 60 * 1000;
    default:
      throw new Error(
        `Invalid unit: "${unit}". Supported units: seconds, minutes, hours.`
      );
  }
}

/**
 * Set a new reminder.
 */
function setReminder(message, delay, unit) {
  if (!message || message.trim().length === 0) {
    throw new Error("A message is required for the set action.");
  }
  if (delay === undefined || delay === null || typeof delay !== "number" || delay <= 0) {
    throw new Error(
      "A positive numeric delay is required for the set action."
    );
  }

  const ms = toMilliseconds(delay, unit);
  const reminderId = `reminder_${nextId++}`;
  const createdAt = new Date().toISOString();
  const scheduledFor = new Date(Date.now() + ms).toISOString();

  const timerId = setTimeout(() => {
    // Fire the reminder
    const entry = reminders.get(reminderId);
    if (entry) {
      // Notify all registered listeners
      for (const listener of listeners) {
        try {
          listener(reminderId, entry.message, entry.scheduledFor);
        } catch {
          // Ignore listener errors
        }
      }

      // Log to console as a fallback notification
      console.log(
        `[Reminder Fired] ${reminderId}: "${entry.message}" (scheduled for ${entry.scheduledFor})`
      );

      // Remove from active reminders
      reminders.delete(reminderId);
    }
  }, ms);

  // Store the reminder
  reminders.set(reminderId, {
    message,
    timerId,
    scheduledFor,
    createdAt,
    delay,
    unit,
  });

  return {
    result: `Reminder set successfully.\n  ID: ${reminderId}\n  Message: "${message}"\n  Fires in: ${delay} ${unit}\n  Scheduled for: ${scheduledFor}`,
    metadata: {
      reminderId,
      scheduledFor,
      message,
      delay,
      unit,
      activeReminders: reminders.size,
    },
  };
}

/**
 * List all active reminders.
 */
function listReminders() {
  if (reminders.size === 0) {
    return {
      result: "No active reminders.",
      metadata: { activeReminders: 0, reminders: [] },
    };
  }

  const now = new Date();
  const entries = [];

  for (const [id, entry] of reminders) {
    const scheduledDate = new Date(entry.scheduledFor);
    const remainingMs = Math.max(0, scheduledDate.getTime() - now.getTime());
    const remainingSec = Math.ceil(remainingMs / 1000);

    let remainingDisplay;
    if (remainingSec >= 3600) {
      const h = Math.floor(remainingSec / 3600);
      const m = Math.floor((remainingSec % 3600) / 60);
      remainingDisplay = `${h}h ${m}m`;
    } else if (remainingSec >= 60) {
      const m = Math.floor(remainingSec / 60);
      const s = remainingSec % 60;
      remainingDisplay = `${m}m ${s}s`;
    } else {
      remainingDisplay = `${remainingSec}s`;
    }

    entries.push({
      id,
      message: entry.message,
      scheduledFor: entry.scheduledFor,
      remaining: remainingDisplay,
      remainingMs,
    });
  }

  const formatted = entries.map(
    (e) =>
      `  - ${e.id}: "${e.message}" (fires in ${e.remaining}, at ${e.scheduledFor})`
  );

  return {
    result: `Active reminders (${entries.length}):\n\n${formatted.join("\n")}`,
    metadata: {
      activeReminders: entries.length,
      reminders: entries.map((e) => ({
        reminderId: e.id,
        message: e.message,
        scheduledFor: e.scheduledFor,
        remainingMs: e.remainingMs,
      })),
    },
  };
}

/**
 * Cancel a specific reminder by ID.
 * Accepts the reminder ID either as params.key or by searching params for a reminder_* pattern.
 */
function cancelReminder(params) {
  // Accept reminderId from multiple possible parameter locations
  const reminderId =
    params.reminderId ||
    params.key ||
    params.id ||
    params.message; // fallback: user might pass the ID as the message

  if (!reminderId || String(reminderId).trim().length === 0) {
    throw new Error(
      "A reminder ID is required for the cancel action. Pass it as the 'message' parameter (e.g., 'reminder_1')."
    );
  }

  const id = String(reminderId).trim();

  if (!reminders.has(id)) {
    // Try partial matching
    const matchingIds = Array.from(reminders.keys()).filter((k) =>
      k.includes(id)
    );

    if (matchingIds.length === 1) {
      return cancelById(matchingIds[0]);
    }

    if (matchingIds.length > 1) {
      return {
        result: `Multiple reminders match "${id}": ${matchingIds.join(", ")}. Please specify the exact ID.`,
        metadata: { cancelled: false, matchingIds },
      };
    }

    return {
      result: `No active reminder found with ID "${id}".`,
      metadata: { cancelled: false, reminderId: id },
    };
  }

  return cancelById(id);
}

/**
 * Cancel a reminder by its exact ID.
 */
function cancelById(id) {
  const entry = reminders.get(id);
  clearTimeout(entry.timerId);
  reminders.delete(id);

  return {
    result: `Reminder "${id}" cancelled successfully.\n  Message was: "${entry.message}"\n  Was scheduled for: ${entry.scheduledFor}`,
    metadata: {
      reminderId: id,
      cancelled: true,
      cancelledMessage: entry.message,
      wasScheduledFor: entry.scheduledFor,
      activeReminders: reminders.size,
    },
  };
}
