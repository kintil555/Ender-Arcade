const DUMMY_PREFIX = "dummy_";

/** True if this playerId represents a debug dummy, not a real Discord user. */
function isDummyId(id) {
  return typeof id === "string" && id.startsWith(DUMMY_PREFIX);
}

/** Generates a unique-enough dummy id scoped to a game session. */
function makeDummyId(gameId, n) {
  return `${DUMMY_PREFIX}${gameId}_${n}`;
}

/** Display label for a dummy id, e.g. "🤖 Dummy 3". */
function dummyLabel(id) {
  const n = id.split("_").pop();
  return `🤖 Dummy ${n}`;
}

/**
 * Renders a mention-or-label for a player id: real Discord mention for real
 * users, plain bot-emoji label for dummies (Discord can't mention fake IDs).
 */
function mentionOrLabel(id) {
  return isDummyId(id) ? dummyLabel(id) : `<@${id}>`;
}

module.exports = { isDummyId, makeDummyId, dummyLabel, mentionOrLabel, DUMMY_PREFIX };
