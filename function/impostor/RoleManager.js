const JOKER_CHANCE_AT_4 = 0.7; // 70% chance when exactly 4 players
const SHERIFF_CHANCE = 0.8; // 80% chance regardless of player count

function getImpostorCount(playerCount) {
  if (playerCount >= 9) return 3;
  if (playerCount >= 6) return 2;
  if (playerCount >= 4) return 1;
  throw new Error(`Cannot assign impostors for ${playerCount} players (minimum is 4)`);
}

/** Whether a Joker should be included this game, per the player count rules. */
function shouldIncludeJoker(playerCount) {
  if (playerCount > 4) return true;
  if (playerCount === 4) return Math.random() < JOKER_CHANCE_AT_4;
  return false;
}

/** Whether a Sheriff should be included this game (80% at any player count). */
function shouldIncludeSheriff() {
  return Math.random() < SHERIFF_CHANCE;
}

/**
 * Assigns roles for a game: IMPOSTOR, JOKER (optional, max 1), SHERIFF
 * (optional, max 1, drawn from the non-impostor pool), and INNOCENT for
 * everyone else.
 *
 * Returns { impostorIds, jokerId, sheriffId, innocentIds } where innocentIds
 * excludes the joker and sheriff (they're tracked separately) but the
 * sheriff is still gameplay-wise "on the innocent team" per game rules.
 */
function assignRoles(playerIds) {
  const impostorCount = getImpostorCount(playerIds.length);
  const shuffled = [...playerIds].sort(() => Math.random() - 0.5);

  const impostorIds = shuffled.slice(0, impostorCount);
  let pool = shuffled.slice(impostorCount);

  let jokerId = null;
  if (shouldIncludeJoker(playerIds.length) && pool.length > 0) {
    jokerId = pool.shift();
  }

  let sheriffId = null;
  if (shouldIncludeSheriff() && pool.length > 0) {
    sheriffId = pool.shift();
  }

  const innocentIds = pool;
  return { impostorIds, jokerId, sheriffId, innocentIds };
}

module.exports = { getImpostorCount, shouldIncludeJoker, shouldIncludeSheriff, assignRoles };
