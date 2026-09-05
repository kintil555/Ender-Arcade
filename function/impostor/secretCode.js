const crypto = require("crypto");
const { read, write } = require("./jsonStore");
const env = require("../../config/env");

const FILE = "secret_codes"; // data/secret_codes.json -> { claimed: { "<CODE>": { userId, claimedAt } } }

function _state() {
  const data = read(FILE);
  if (!data.claimed) data.claimed = {};
  return data;
}

function _isClaimed(code, data) {
  return Boolean(data.claimed[code]);
}

/** Kode-kode dari .env yang belum pernah diklaim siapa pun. */
function getUnclaimedCodes() {
  const data = _state();
  return env.SECRET_CODES.filter((c) => !_isClaimed(c, data));
}

/**
 * Dipanggil setiap game selesai. Berdasarkan SECRET_CODE_DROP_CHANCE,
 * mungkin mengembalikan { code, base64 } untuk dikirim ke channel game.
 * Return null kalau tidak drop atau semua 3 kode sudah habis.
 */
function maybeDropSecretCode() {
  if (!env.SECRET_CODES.length) return null;

  const unclaimed = getUnclaimedCodes();
  if (unclaimed.length === 0) return null;

  if (Math.random() > env.SECRET_CODE_DROP_CHANCE) return null;

  const code = unclaimed[Math.floor(Math.random() * unclaimed.length)];
  const base64 = Buffer.from(code, "utf8").toString("base64");
  return { code, base64 };
}

/**
 * Coba redeem kode oleh userId.
 * Return salah satu:
 *  { ok: true, reward }
 *  { ok: false, reason: "INVALID" | "ALREADY_CLAIMED" }
 */
function redeemCode(userId, rawCode) {
  const code = (rawCode || "").trim().toUpperCase();

  if (!env.SECRET_CODES.includes(code)) {
    return { ok: false, reason: "INVALID" };
  }

  const data = _state();
  if (_isClaimed(code, data)) {
    return { ok: false, reason: "ALREADY_CLAIMED" };
  }

  data.claimed[code] = { userId, claimedAt: new Date().toISOString() };
  write(FILE, data);

  return { ok: true, reward: env.SECRET_CODE_REWARD };
}

module.exports = { maybeDropSecretCode, redeemCode, getUnclaimedCodes };
