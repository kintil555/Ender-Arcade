const { read, write } = require("./jsonStore");
const env = require("../../config/env");

// Terpisah total dari secretCode.js / economy.js — token ini bukan kredit.
// data/instawin.json -> {
//   claimedCodes: { "<CODE>": { userId, claimedAt } },   // kode mana sudah dipakai siapa
//   tokens: { "<userId>": { available: 0|1, usedAt: null|iso } } // token milik tiap user
// }
const FILE = "instawin";

function _state() {
  const data = read(FILE);
  if (!data.claimedCodes) data.claimedCodes = {};
  if (!data.tokens) data.tokens = {};
  return data;
}

/**
 * Redeem sebuah INSTAWIN_CODES oleh userId. Kode ini TIDAK PERNAH
 * di-drop otomatis oleh bot — owner membagikannya sendiri secara manual.
 * Return: { ok: true } | { ok: false, reason: "INVALID" | "ALREADY_CLAIMED" }
 */
function redeemInstawinCode(userId, rawCode) {
  const code = (rawCode || "").trim().toUpperCase();

  if (!env.INSTAWIN_CODES.includes(code)) {
    return { ok: false, reason: "INVALID" };
  }

  const data = _state();
  if (data.claimedCodes[code]) {
    return { ok: false, reason: "ALREADY_CLAIMED" };
  }

  data.claimedCodes[code] = { userId, claimedAt: new Date().toISOString() };

  if (!data.tokens[userId]) data.tokens[userId] = { available: 0, usedAt: null };
  data.tokens[userId].available += 1;

  write(FILE, data);
  return { ok: true };
}

/** Berapa token instant-win yang masih dimiliki userId (belum dipakai). */
function getAvailableTokens(userId) {
  const data = _state();
  return data.tokens[userId]?.available || 0;
}

/**
 * Memakai 1 token milik userId. Return true kalau berhasil dipakai
 * (token berkurang 1), false kalau tidak punya token tersisa.
 * Dipanggil dari command /use-instawin SETELAH game-nya divalidasi valid.
 */
function consumeToken(userId) {
  const data = _state();
  const entry = data.tokens[userId];
  if (!entry || entry.available <= 0) return false;

  entry.available -= 1;
  entry.usedAt = new Date().toISOString();
  write(FILE, data);
  return true;
}

module.exports = { redeemInstawinCode, getAvailableTokens, consumeToken };
