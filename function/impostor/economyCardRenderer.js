const axios = require('axios');
const sharp = require('sharp');

// Adapted from Neo Dragon Sentinel's rank_card_renderer.js
// (https://github.com/Okelahbegitu/NEO-Dragon-Sentinel) — same SVG+sharp
// rendering approach and visual design, retargeted from level/XP data to
// this bot's credits/win-rate economy data.

/**
 * ============================================================================
 * CARD_CONFIG — exported from card-ui-editor.html (Export Config JSON).
 * Tweak the HTML preview and paste the new JSON here to re-theme the cards
 * without touching the SVG-building code below.
 * ============================================================================
 */
const CARD_CONFIG = {
    leaderboard: {
        background: { top: "#22002e", bottom: "#16001f" },
        title: {
            text: "Who is the Impostor?",
            subtitle: "Top 10 pemain berdasarkan kredit",
            subtitleColor: "#ddccf0",
        },
        badges: {
            gold: { fill: "#f2c94c", border: "#b38300", text: "#1a1020" },
            silver: { fill: "#b8b8c8", border: "#8e8e9b" },
            bronze: { fill: "#b87333", border: "#8b5324" },
            default: { fill: "#4a0b5c", border: "#5b1370", text: "#f5efff" },
        },
        layout: { width: 921, rowHeight: 108, rowRadius: 16 },
    },
    wallet: {
        background: { start: "#9b38a8", end: "#3c003d" },
        progressBar: { track: "#052f33", fillStart: "#f394ff", fillEnd: "#872ca0" },
        text: { titleColor: "#ffffff", labelColor: "#ffffff" },
    },
};

function escapeXml(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function encodeDataUrl(buffer, mimeType) {
    return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

async function fetchImageDataUrl(url, fallbackColor = '#6B7280') {
    if (!url) {
        return null;
    }

    try {
        const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 10000 });
        const mimeType = response.headers['content-type'] || 'image/png';
        return encodeDataUrl(Buffer.from(response.data), mimeType);
    } catch (error) {
        const fallbackSvg = `
            <svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
                <rect width="128" height="128" rx="64" fill="${fallbackColor}" />
            </svg>
        `;

        return `data:image/svg+xml;base64,${Buffer.from(fallbackSvg).toString('base64')}`;
    }
}

/**
 * Single-user wallet card. `progress` is win-rate % (0-100) instead of
 * XP-to-next-level progress in the original.
 */
async function renderWalletCard({ username, credits, totalGames, totalWins, winRate }) {
    const cfg = CARD_CONFIG.wallet;
    const safeUsername = escapeXml(username);
    const safeCredits = escapeXml(Number(credits).toLocaleString());
    const safeGames = escapeXml(totalGames ?? 0);
    const safeWins = escapeXml(totalWins ?? 0);
    const clampedProgress = clamp(Number(winRate) || 0, 0, 100);
    const progressWidth = Math.round((560 * clampedProgress) / 100);

    const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="800" height="240" viewBox="0 0 800 240">
            <defs>
                <linearGradient id="background" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stop-color="${cfg.background.start}" />
                    <stop offset="100%" stop-color="${cfg.background.end}" />
                </linearGradient>
                <linearGradient id="progress" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stop-color="${cfg.progressBar.fillStart}" />
                    <stop offset="100%" stop-color="${cfg.progressBar.fillEnd}" />
                </linearGradient>
                <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="0" dy="10" stdDeviation="12" flood-color="#000000" flood-opacity="0.25" />
                </filter>
            </defs>

            <rect width="800" height="240" rx="22" fill="url(#background)" filter="url(#shadow)" />
            <circle cx="715" cy="55" r="100" fill="#8b5cf6" opacity="0.12" />
            <circle cx="100" cy="210" r="90" fill="#c084fc" opacity="0.1" />

            <text x="40" y="72" fill="${cfg.text.titleColor}" font-family="Arial, sans-serif" font-size="34" font-weight="700">${safeUsername}</text>
            <text x="40" y="118" fill="${cfg.text.titleColor}" font-family="Arial, sans-serif" font-size="24" font-weight="600">${safeCredits} Kredit</text>

            <text x="40" y="166" fill="${cfg.text.labelColor}" font-family="Arial, sans-serif" font-size="18" font-weight="600">Win Rate</text>
            <rect x="40" y="178" width="560" height="30" rx="15" fill="${cfg.progressBar.track}" opacity="0.95" />
            <rect x="40" y="178" width="${progressWidth}" height="30" rx="15" fill="url(#progress)" />
            <text x="620" y="200" fill="${cfg.text.titleColor}" font-family="Arial, sans-serif" font-size="20" font-weight="700">${clampedProgress}%</text>

            <text x="760" y="160" text-anchor="end" fill="${cfg.text.titleColor}" font-family="Arial, sans-serif" font-size="20" font-weight="600">${safeWins}/${safeGames} game menang</text>
        </svg>
    `;

    return sharp(Buffer.from(svg)).png().toBuffer();
}

async function renderLeaderboardCard({ title, rows }) {
    const cfg = CARD_CONFIG.leaderboard;
    const normalizedRows = Array.isArray(rows) ? rows.slice(0, 10) : [];
    const rowHeight = cfg.layout.rowHeight;
    const width = cfg.layout.width;
    const rowRadius = cfg.layout.rowRadius;
    const headerHeight = 130;
    const height = headerHeight + (normalizedRows.length * rowHeight) + 30;
    const startY = 150;
    const rowW = width - 65;

    const rowMarkup = normalizedRows.map((row, index) => {
        const rank = index + 1;
        const baseY = startY + (index * rowHeight);
        const badge = rank === 1 ? cfg.badges.gold
            : rank === 2 ? cfg.badges.silver
            : rank === 3 ? cfg.badges.bronze
            : cfg.badges.default;
        const cardColor = badge.fill;
        const shadowColor = badge.border;
        // gold/default carry their own text color; silver/bronze fall back
        // to a dark readable text color the same way the editor preview does
        const textColor = badge.text || (rank <= 3 ? '#15151A' : cfg.badges.default.text);
        const avatarMarkup = row.avatarUrl ? `<image href="${row.avatarUrl}" x="58" y="${baseY + 20}" width="64" height="64" clip-path="url(#avatarClip${rank})" />` : '';

        return `
            <defs>
                <clipPath id="avatarClip${rank}">
                    <circle cx="90" cy="${baseY + 52}" r="32" />
                </clipPath>
            </defs>
            <g>
                <rect x="35" y="${baseY}" width="${rowW}" height="90" rx="${rowRadius}" fill="${cardColor}" stroke="${shadowColor}" stroke-width="2" />
                <circle cx="90" cy="${baseY + 52}" r="34" fill="#15151A" opacity="0.25" />
                ${avatarMarkup}
                <circle cx="90" cy="${baseY + 52}" r="32" fill="none" stroke="rgba(255,255,255,0.18)" stroke-width="2" />
                <text x="145" y="${baseY + 48}" fill="${textColor}" font-family="Arial, sans-serif" font-size="22" font-weight="700">${escapeXml(row.displayName || 'Unknown')}</text>
                <text x="145" y="${baseY + 73}" fill="${textColor}" opacity="0.75" font-family="Arial, sans-serif" font-size="18" font-weight="600">${escapeXml(Number(row.credits ?? 0).toLocaleString())} kredit &#183; ${escapeXml(row.winRate ?? 0)}% WR</text>
                <text x="${width - 90}" y="${baseY + 58}" text-anchor="end" fill="${textColor}" font-family="Arial, sans-serif" font-size="30" font-weight="700">#${rank}</text>
            </g>
        `;
    }).join('\n');

    const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
            <defs>
                <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="${cfg.background.top}" />
                    <stop offset="100%" stop-color="${cfg.background.bottom}" />
                </linearGradient>
                <filter id="titleShadow" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="0" dy="6" stdDeviation="8" flood-color="#000000" flood-opacity="0.24" />
                </filter>
            </defs>

            <rect width="${width}" height="${height}" fill="url(#bg)" />
            <circle cx="${width - 100}" cy="90" r="150" fill="#8b5cf6" opacity="0.08" />
            <circle cx="120" cy="${height - 70}" r="120" fill="#c084fc" opacity="0.06" />

            <text x="${width / 2}" y="70" text-anchor="middle" fill="#ffffff" font-family="Arial, sans-serif" font-size="54" font-weight="800" filter="url(#titleShadow)">${escapeXml(title || cfg.title.text)}</text>
            <text x="${width / 2}" y="105" text-anchor="middle" fill="${cfg.title.subtitleColor}" font-family="Arial, sans-serif" font-size="20" font-weight="600">${escapeXml(cfg.title.subtitle)}</text>
            ${rowMarkup}
        </svg>
    `;

    return sharp(Buffer.from(svg)).png().toBuffer();
}

/**
 * Builds the row data for renderLeaderboardCard from this bot's
 * getTopWallets() rows (userId, credits, total_games, total_wins),
 * resolving each user's avatar/display name from the guild — same shape
 * as Neo Dragon Sentinel's prepareLeaderboardRows, adapted to credits.
 */
async function prepareLeaderboardRows(interaction, walletRows) {
    const rows = [];

    for (let index = 0; index < 10; index += 1) {
        const row = walletRows[index];

        if (!row) {
            rows.push({ displayName: '-', credits: 0, winRate: 0, avatarUrl: null });
            continue;
        }

        const member = await interaction.guild.members.fetch(row.userId).catch(() => null);
        const displayName = member?.displayName ?? member?.user?.globalName ?? member?.user?.username ?? 'Unknown';
        const avatarUrl = member?.displayAvatarURL?.({ extension: 'png', size: 128 }) ?? null;
        const winRate = row.total_games > 0 ? Math.round((row.total_wins / row.total_games) * 100) : 0;

        rows.push({
            displayName,
            credits: row.credits,
            winRate,
            avatarUrl: await fetchImageDataUrl(avatarUrl),
        });
    }

    return rows;
}

module.exports = {
    renderWalletCard,
    renderLeaderboardCard,
    prepareLeaderboardRows,
};