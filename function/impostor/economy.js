const { read, write } = require('./jsonStore');
const { isDummyId } = require('./dummyPlayer');
const env = require('../../config/env');

const CREDIT_WIN  = env.CREDIT_WIN;
const CREDIT_LOSE = env.CREDIT_LOSE;
const XP_PER_CREDIT = env.XP_PER_CREDIT;

const FILE = 'economy';

function _all() { return read(FILE); }

function _save(data) { write(FILE, data); }

function getOrCreateWallet(userId) {
  const data = _all();
  if (!data[userId]) {
    data[userId] = { credits: 0, total_games: 0, total_wins: 0, total_credits_earned: 0 };
    _save(data);
  }
  return data[userId];
}

function _saveWallet(userId, wallet) {
  const data = _all();
  data[userId] = wallet;
  _save(data);
}

function addCredits(userId, amount) {
  const wallet = getOrCreateWallet(userId);
  wallet.credits += amount;
  wallet.total_credits_earned += Math.max(0, amount);
  _saveWallet(userId, wallet);
  return wallet;
}

function didRoleWin(role, winner) {
  if (winner === 'JOKER') return role === 'JOKER';
  if (role === 'JOKER') return false;
  if (role === 'SHERIFF') return winner === 'INNOCENT';
  return role === winner;
}

async function distributeGameRewards(session, winner) {
  const rewards = new Map();

  for (const playerId of session.playerIds) {
    if (isDummyId(playerId)) {
      const role = session.roles.get(playerId) || 'INNOCENT';
      rewards.set(playerId, { credits: 0, won: didRoleWin(role, winner), role, dummy: true });
      continue;
    }

    const role = session.roles.get(playerId) || 'INNOCENT';
    const playerWon = didRoleWin(role, winner);
    const creditAmount = playerWon ? CREDIT_WIN : CREDIT_LOSE;

    try {
      const wallet = getOrCreateWallet(playerId);
      wallet.credits += creditAmount;
      wallet.total_credits_earned += creditAmount;
      wallet.total_games += 1;
      if (playerWon) wallet.total_wins += 1;
      _saveWallet(playerId, wallet);
      rewards.set(playerId, { credits: creditAmount, won: playerWon, role });
    } catch (err) {
      console.error(`[Economy] Failed to reward ${playerId}:`, err.message);
      rewards.set(playerId, { credits: 0, won: playerWon, role, error: true });
    }
  }

  return rewards;
}

function convertCreditsToXP(userId, creditAmount) {
  const wallet = getOrCreateWallet(userId);
  if (wallet.credits < creditAmount || creditAmount <= 0) return null;
  const xpGained = creditAmount * XP_PER_CREDIT;
  wallet.credits -= creditAmount;
  _saveWallet(userId, wallet);
  return { xpGained, creditsSpent: creditAmount, newBalance: wallet.credits };
}

/** For leaderboard — returns top N sorted by credits */
function getTopWallets(limit = 10) {
  const data = _all();
  return Object.entries(data)
    .map(([userId, w]) => ({ userId, ...w }))
    .sort((a, b) => b.credits - a.credits)
    .slice(0, limit);
}

module.exports = {
  getOrCreateWallet,
  addCredits,
  distributeGameRewards,
  convertCreditsToXP,
  getTopWallets,
  CREDIT_WIN,
  CREDIT_LOSE,
  XP_PER_CREDIT,
};
