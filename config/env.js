const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

module.exports = {
    DISCORD_TOKEN: process.env.DISCORD_TOKEN,
    CLIENT_ID: process.env.CLIENT_ID,
    GUILD_ID: process.env.GUILD_ID,
    RESULT_LOG_CHANNEL_ID: process.env.RESULT_LOG_CHANNEL_ID || null,
    OWNER_ID: process.env.OWNER_ID || null,
    // Existing category ID where game-room channels get created into,
    // instead of the bot creating a brand-new category per game.
    // Leave empty to keep the old behavior (bot creates+deletes its own category).
    GAME_CATEGORY_ID: process.env.GAME_CATEGORY_ID || null,

    // ---- Cafe feature ----
    // Channel ID where the bot listens for "cafe"/"cafetaria" mentions
    // and replies with the coffee-order menu. Leave empty to disable.
    CAFE_CHANNEL_ID: process.env.CAFE_CHANNEL_ID || null,

    // ---- TOS feature ----
    // Channel ID where /tos boleh dipakai. Leave empty = bisa dipakai di channel manapun.
    TOS_CHANNEL_ID: process.env.TOS_CHANNEL_ID || null,

    // ---- Secret redeem code event ----
    // 3 kode rahasia, tiap kode punya rewardnya sendiri, dipisah koma.
    // Format tiap entri: KODE:JUMLAH_KREDIT (":JUMLAH" boleh dikosongkan
    // untuk pakai default SECRET_CODE_REWARD).
    // Contoh .env:
    // SECRET_CODES=LORDENDO-D3HC-RYGJ-8WN6-7T7Y-DPEE-DE4M:500,LORDENDO-XXXX:1000,LORDENDO-YYYY:250
    SECRET_CODES: (() => {
        const map = new Map();
        const defaultReward = Number(process.env.SECRET_CODE_REWARD) || 500;
        (process.env.SECRET_CODES || "")
            .split(",")
            .map((c) => c.trim())
            .filter(Boolean)
            .forEach((entry) => {
                const [rawCode, rawReward] = entry.split(":");
                const code = (rawCode || "").trim().toUpperCase();
                if (!code) return;
                const reward = Number(rawReward);
                map.set(code, Number.isFinite(reward) && reward > 0 ? reward : defaultReward);
            });
        return map; // Map<string code, number reward>
    })(),
    // Reward default kalau sebuah kode di SECRET_CODES tidak menyertakan ":JUMLAH".
    SECRET_CODE_REWARD: Number(process.env.SECRET_CODE_REWARD) || 500,
    // Peluang (0-1) bot mengirim base64 kode setelah game selesai.
    SECRET_CODE_DROP_CHANCE: Number(process.env.SECRET_CODE_DROP_CHANCE) || 0.75,

    DB_HOST: process.env.DB_SERVER || process.env.DB_HOST || "localhost",
    DB_USER: process.env.DB_USER || "root",
    DB_NAME: process.env.DB_NAME,
    DB_PASSWORD: (process.env.DB_PASS || process.env.DB_PASSWORD || "").trim(),
    DB_PORT: parseInt(process.env.DB_PORT || "3306"),

    // ---- System ----
    AUTO_REGISTER_COMMANDS: process.env.AUTO_REGISTER_COMMANDS !== "0",

    // ---- Impostor game timing/rules ----
    MIN_PLAYERS: Number(process.env.IMP_MIN_PLAYERS) || Number(process.env.MIN_PLAYERS) || 4,
    MAX_PLAYERS: Number(process.env.IMP_MAX_PLAYERS) || Number(process.env.MAX_PLAYERS) || 10,
    VOTE_RESULT_DELAY_MS: Number(process.env.VOTE_RESULT_DELAY_MS) || 3000,
    CLEANUP_DELAY_MS: Number(process.env.CLEANUP_DELAY_MS) || 10000,

    // ---- Impostor economy ----
    CREDIT_WIN: Number(process.env.IMP_CREDIT_WIN) || 50,
    CREDIT_LOSE: Number(process.env.IMP_CREDIT_LOSE) || 20,
    XP_PER_CREDIT: Number(process.env.IMP_XP_PER_CREDIT) || 2,

    // ---- AI theme generation (tried in order: Gemini -> OpenRouter -> Grok -> Groq/Llama) ----
    GEMINI_API_KEY: process.env.GEMINI_API_KEY || null,
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || null,
    GROK_API_KEY: process.env.GROK_API_KEY || null,
    GROQ_API_KEY: process.env.GROQ_API_KEY || null,
    AI_REQUEST_TIMEOUT_MS: Number(process.env.AI_REQUEST_TIMEOUT_MS) || 8000,

    validate() {
        const required = ['DISCORD_TOKEN', 'CLIENT_ID', 'DB_NAME'];
        const missing = required.filter((key) => !this[key]);
        if (missing.length > 0) {
            console.warn(`[ENV] Warning - Missing env vars: ${missing.join(', ')}`);
        }
    },
};
