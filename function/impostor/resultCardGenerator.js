const { createCanvas, loadImage } = require("canvas");
const { AttachmentBuilder } = require("discord.js");
const { isDummyId, dummyLabel } = require("./dummyPlayer");

/**
 * ============================================================================
 * DESIGN TOKENS
 * ----------------------------------------------------------------------------
 * These mirror the CSS variables in preview/card-preview.html 1:1 (same
 * names, same default values, just expressed as JS numbers/colors instead
 * of CSS strings). If you tweak the HTML preview and export its JSON, paste
 * the new values in here — every field below has a matching key in that
 * exported JSON (minus the `px` suffix).
 * ============================================================================
 */
const TOKENS = {
  cardW: 940,
  cardH: 775,

  radiusCard: 14,
  radiusPanel: 17,
  radiusRowBadge: 10,

  panelBg: "rgba(20, 18, 24, 0.43)",
  panelBorder: "rgba(255,255,255,0.08)",

  fontDisplay: "800 39px 'Segoe UI', sans-serif",
  fontTitleSize: 39,
  fontSubtitleSize: 18,
  fontPanelHeaderSize: 15,
  fontRowSize: 17,
  fontRowSubSize: 15,

  badgeGold: "#f1c40f",
  badgeSilver: "#cfd6de",
  badgeBronze: "#d98a4b",
  badgeDefault: "#3a3f4b",

  creditPositive: "#57f287",
  creditNegative: "#ed4245",

  textPrimary: "#ffffff",
  textSecondary: "rgba(255,255,255,0.68)",
  textMuted: "rgba(255,255,255,0.45)",

  avatarSize: 96,
  avatarBorderWidth: 3,
  rowAvatarSize: 26,

  panelGap: 16,
  panelPaddingX: 20,
  panelPaddingY: 18,
  rowGap: 10,

  margin: 28,
};

const OUTCOME_PRESETS = {
  INNOCENT: {
    accent: "#2ecc71",
    accentSoft: "rgba(46, 204, 113, 0.28)",
    glow: "rgba(46, 204, 113, 0.35)",
    bgTint1: [22, 56, 33],
    bgTint2: [10, 22, 16],
    // NOTE: no emoji in these titles — most Linux hosts (Pterodactyl/VPS)
    // don't ship an emoji font for node-canvas out of the box, so an emoji
    // here renders as a broken tofu box instead of the actual glyph. Using
    // plain text keeps this reliable everywhere without installing extra
    // system fonts. (Discord embeds elsewhere in the bot still use emoji
    // fine since Discord's own client renders those, not canvas.)
    title: "INNOCENTS WIN!",
    badgeLabel: "INNOCENTS WIN",
  },
  IMPOSTOR: {
    accent: "#ed4245",
    accentSoft: "rgba(237, 66, 69, 0.28)",
    glow: "rgba(237, 66, 69, 0.35)",
    bgTint1: [58, 20, 24],
    bgTint2: [23, 8, 8],
    title: "IMPOSTORS WIN!",
    badgeLabel: "IMPOSTORS WIN",
  },
  JOKER: {
    accent: "#f1c40f",
    accentSoft: "rgba(241, 196, 15, 0.28)",
    glow: "rgba(241, 196, 15, 0.35)",
    bgTint1: [58, 47, 10],
    bgTint2: [23, 18, 5],
    title: "JOKER WINS!",
    badgeLabel: "JOKER WINS",
  },
};

const ROLE_LABELS = { IMPOSTOR: "Impostor", INNOCENT: "Innocent", JOKER: "Joker", SHERIFF: "Sheriff" };
const ROLE_CHIP_COLORS = {
  IMPOSTOR: { bg: "rgba(237,66,69,0.22)", fg: "#ff8688" },
  INNOCENT: { bg: "rgba(87,242,135,0.18)", fg: "#8ff5b0" },
  JOKER: { bg: "rgba(241,196,15,0.2)", fg: "#ffe37a" },
  SHERIFF: { bg: "rgba(52,152,219,0.2)", fg: "#8fcaf5" },
};

/** Rounded rect path helper */
function roundRect(ctx, x, y, w, h, r) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

function truncate(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + "…").width > maxWidth) {
    t = t.slice(0, -1);
  }
  return t + "…";
}

/**
 * Resolve a Discord avatar image (or a generated placeholder) for a
 * player id. Returns a loaded canvas Image, or null on total failure
 * (caller falls back to a plain colored circle).
 */
async function resolveAvatarImage(guild, playerId) {
  if (isDummyId(playerId)) {
    // Simple deterministic placeholder identicon-ish fallback: solid color
    // circle with initials, generated locally (no network needed for dummies).
    return null;
  }
  try {
    const member = await guild.members.fetch(playerId);
    const url = member.displayAvatarURL({ extension: "png", size: 128 });
    return await loadImage(url);
  } catch {
    return null;
  }
}

function resolveDisplayName(guild, playerId, member) {
  if (isDummyId(playerId)) return dummyLabel(playerId).replace(/^🤖\s*/, "");
  return member?.displayName || member?.user?.username || playerId;
}

function drawAvatarCircle(ctx, img, cx, cy, r, fallbackLabel, borderColor, borderWidth) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.closePath();
  if (img) {
    ctx.save();
    ctx.clip();
    ctx.drawImage(img, cx - r, cy - r, r * 2, r * 2);
    ctx.restore();
  } else {
    ctx.fillStyle = "#3a3f4b";
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = `700 ${Math.floor(r * 0.8)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText((fallbackLabel || "?").slice(0, 1).toUpperCase(), cx, cy + 1);
  }
  if (borderWidth > 0) {
    ctx.beginPath();
    ctx.arc(cx, cy, r - borderWidth / 2, 0, Math.PI * 2);
    ctx.lineWidth = borderWidth;
    ctx.strokeStyle = borderColor;
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Draws one panel's frame + header, returns the {x, y, w, h} content
 * area available for rows inside it.
 */
function drawPanelFrame(ctx, x, y, w, h, headerText, accentColor) {
  roundRect(ctx, x, y, w, h, TOKENS.radiusPanel);
  ctx.fillStyle = TOKENS.panelBg;
  ctx.fill();
  ctx.strokeStyle = TOKENS.panelBorder;
  ctx.lineWidth = 1;
  ctx.stroke();

  const padX = TOKENS.panelPaddingX;
  const padY = TOKENS.panelPaddingY;

  // accent dot
  ctx.beginPath();
  ctx.arc(x + padX + 3, y + padY + 5, 3, 0, Math.PI * 2);
  ctx.fillStyle = accentColor;
  ctx.fill();

  ctx.fillStyle = TOKENS.textSecondary;
  ctx.font = `700 ${TOKENS.fontPanelHeaderSize}px 'Segoe UI', sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(headerText.toUpperCase(), x + padX + 12, y + padY + 5);

  const contentTop = y + padY + 24;
  return {
    x: x + padX,
    y: contentTop,
    w: w - padX * 2,
    h: y + h - padY - contentTop,
  };
}

function rankBadgeColor(index) {
  if (index === 0) return { bg: TOKENS.badgeGold, fg: "#2b2100" };
  if (index === 1) return { bg: TOKENS.badgeSilver, fg: "#22262c" };
  if (index === 2) return { bg: TOKENS.badgeBronze, fg: "#2b1a08" };
  return { bg: TOKENS.badgeDefault, fg: "#ffffff" };
}

/**
 * Main entry point.
 *
 * @param {import('discord.js').Guild} guild
 * @param {object} params
 * @param {object} params.session               - GameSession
 * @param {Map<string, number>} params.voteTally - playerId -> vote count (post-tally)
 * @param {string} params.mostVotedId
 * @param {boolean} params.isImpostorFound
 * @param {string} params.verdictText            - short plain-text verdict (mentions stripped by caller if needed)
 * @param {"INNOCENT"|"IMPOSTOR"|"JOKER"} params.winner
 * @param {string} params.reason
 * @param {Map<string, {credits:number, won:boolean, role:string, dummy?:boolean, error?:boolean}>} params.rewards
 * @returns {Promise<AttachmentBuilder>}
 */
async function generateResultCard(guild, params) {
  const { session, voteTally, mostVotedId, winner, reason, rewards } = params;
  const preset = OUTCOME_PRESETS[winner] || OUTCOME_PRESETS.INNOCENT;

  const W = TOKENS.cardW;
  const H = TOKENS.cardH;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  // ---- Background ----
  const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
  bgGrad.addColorStop(0, `rgb(${preset.bgTint1.join(",")})`);
  bgGrad.addColorStop(1, `rgb(${preset.bgTint2.join(",")})`);
  roundRect(ctx, 0, 0, W, H, TOKENS.radiusCard);
  ctx.save();
  ctx.clip();
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();

  // border
  roundRect(ctx, 0.5, 0.5, W - 1, H - 1, TOKENS.radiusCard);
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineWidth = 1;
  ctx.stroke();

  const M = TOKENS.margin;

  // ---- Compact outcome heading ----
  // Replaces the old big-avatar + huge-title header: just a medium-size
  // winner line in the outcome's accent color, plus one short reason line
  // underneath. Frees up almost all vertical space for the panels below.
  const headerY = M;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = preset.accent;
  ctx.font = `800 ${TOKENS.fontTitleSize}px 'Segoe UI', sans-serif`;
  ctx.fillText(truncate(ctx, preset.title, W - M * 2), M, headerY + TOKENS.fontTitleSize);

  ctx.font = `500 ${TOKENS.fontSubtitleSize}px 'Segoe UI', sans-serif`;
  ctx.fillStyle = TOKENS.textSecondary;
  ctx.fillText(truncate(ctx, reason || "", W - M * 2), M, headerY + TOKENS.fontTitleSize + TOKENS.fontSubtitleSize + 8);

  const headerBlockH = TOKENS.fontTitleSize + TOKENS.fontSubtitleSize + 8;

  // ---- Panels grid: 2 top panels + 1 full-width bottom panel ----
  const panelsTop = headerY + headerBlockH + 22;
  const panelsBottom = H - M - 20; // leave room for footer note
  const gap = TOKENS.panelGap;
  const totalPanelsH = panelsBottom - panelsTop;
  const topRowH = totalPanelsH * 0.42;
  const bottomRowH = totalPanelsH - topRowH - gap;
  const colW = (W - M * 2 - gap) / 2;

  // --- Panel: Voting Results ---
  {
    const px = M, py = panelsTop, pw = colW, ph = topRowH;
    const content = drawPanelFrame(ctx, px, py, pw, ph, "Voting Results", preset.accent);
    const sorted = [...voteTally.entries()].sort((a, b) => b[1] - a[1]);
    await drawRowList(ctx, guild, content, sorted.length ? sorted : [[mostVotedId, 0]], async ([id, count], i, rowY, rowH) => {
      const badge = rankBadgeColor(i);
      let cx = content.x;
      // rank badge
      roundRect(ctx, cx, rowY, 22, 22, TOKENS.radiusRowBadge);
      ctx.fillStyle = badge.bg;
      ctx.fill();
      ctx.fillStyle = badge.fg;
      ctx.font = "800 12px 'Segoe UI', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(i + 1), cx + 11, rowY + 11 + 1);
      cx += 22 + 10;

      const img = await resolveAvatarImage(guild, id);
      const member = !isDummyId(id) ? await safeFetchMember(guild, id) : null;
      drawAvatarCircle(ctx, img, cx + TOKENS.rowAvatarSize / 2, rowY + rowH / 2, TOKENS.rowAvatarSize / 2, resolveDisplayName(guild, id, member), preset.accent, 2);
      cx += TOKENS.rowAvatarSize + 10;

      const name = resolveDisplayName(guild, id, member);
      ctx.textAlign = "left";
      ctx.fillStyle = TOKENS.textPrimary;
      ctx.font = `600 ${TOKENS.fontRowSize}px 'Segoe UI', sans-serif`;
      const metaText = `${count} vote${count === 1 ? "" : "s"}`;
      ctx.font = `600 ${TOKENS.fontRowSubSize}px 'Segoe UI', sans-serif`;
      const metaW = ctx.measureText(metaText).width;
      ctx.font = `600 ${TOKENS.fontRowSize}px 'Segoe UI', sans-serif`;
      const nameMaxW = content.x + content.w - cx - metaW - 10;
      ctx.fillText(truncate(ctx, name, nameMaxW), cx, rowY + rowH / 2 + 5);

      ctx.textAlign = "right";
      ctx.fillStyle = TOKENS.textSecondary;
      ctx.font = `600 ${TOKENS.fontRowSubSize}px 'Segoe UI', sans-serif`;
      ctx.fillText(metaText, content.x + content.w, rowY + rowH / 2 + 5);
    });
  }

  // --- Panel: Roles Revealed ---
  {
    const px = M + colW + gap, py = panelsTop, pw = colW, ph = topRowH;
    const content = drawPanelFrame(ctx, px, py, pw, ph, "Roles Revealed", preset.accent);
    const revealedIds = [...session.impostorIds];
    if (session.jokerId) revealedIds.push(session.jokerId);
    if (mostVotedId && !revealedIds.includes(mostVotedId)) revealedIds.push(mostVotedId);

    await drawRowList(ctx, guild, content, revealedIds, async (id, i, rowY, rowH) => {
      let cx = content.x;
      const img = await resolveAvatarImage(guild, id);
      const member = !isDummyId(id) ? await safeFetchMember(guild, id) : null;
      drawAvatarCircle(ctx, img, cx + TOKENS.rowAvatarSize / 2, rowY + rowH / 2, TOKENS.rowAvatarSize / 2, resolveDisplayName(guild, id, member), preset.accent, 2);
      cx += TOKENS.rowAvatarSize + 10;

      const role = session.impostorIds.includes(id) ? "IMPOSTOR" : session.isJoker(id) ? "JOKER" : session.isSheriff(id) ? "SHERIFF" : "INNOCENT";
      const chip = ROLE_CHIP_COLORS[role] || ROLE_CHIP_COLORS.INNOCENT;
      const chipLabel = (ROLE_LABELS[role] || role).toUpperCase();

      ctx.font = "700 11px 'Segoe UI', sans-serif";
      const chipTextW = ctx.measureText(chipLabel).width;
      const chipW = chipTextW + 16;
      const chipH = 18;
      const chipX = content.x + content.w - chipW;

      const name = resolveDisplayName(guild, id, member);
      ctx.textAlign = "left";
      ctx.fillStyle = TOKENS.textPrimary;
      ctx.font = `600 ${TOKENS.fontRowSize}px 'Segoe UI', sans-serif`;
      const nameMaxW = chipX - cx - 10;
      ctx.fillText(truncate(ctx, name, nameMaxW), cx, rowY + rowH / 2 + 5);

      roundRect(ctx, chipX, rowY + (rowH - chipH) / 2, chipW, chipH, chipH / 2);
      ctx.fillStyle = chip.bg;
      ctx.fill();
      ctx.fillStyle = chip.fg;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(chipLabel, chipX + chipW / 2, rowY + rowH / 2 + 1);
    });
  }

  // --- Panel: Rewards (full width, 2-column row layout) ---
  {
    const px = M, py = panelsTop + topRowH + gap, pw = W - M * 2, ph = bottomRowH;
    const content = drawPanelFrame(ctx, px, py, pw, ph, "Hadiah Kredit Game", preset.accent);

    const entries = [...rewards.entries()];
    const colGap = 24;
    const rewardColW = (content.w - colGap) / 2;
    const rowH2 = 26;
    const maxRowsPerCol = Math.max(1, Math.floor(content.h / (rowH2 + 4)));

    for (let i = 0; i < entries.length; i++) {
      const [id, info] = entries[i];
      const col = Math.floor(i / maxRowsPerCol);
      const rowInCol = i % maxRowsPerCol;
      if (col >= 2) break; // overflow guard — extra players just won't fit visually
      const rx = content.x + col * (rewardColW + colGap);
      const ry = content.y + rowInCol * (rowH2 + 4);

      let cx = rx;
      const img = await resolveAvatarImage(guild, id);
      const member = !isDummyId(id) ? await safeFetchMember(guild, id) : null;
      drawAvatarCircle(ctx, img, cx + TOKENS.rowAvatarSize / 2, ry + rowH2 / 2, TOKENS.rowAvatarSize / 2, resolveDisplayName(guild, id, member), preset.accent, 2);
      cx += TOKENS.rowAvatarSize + 10;

      const creditText = `${info.credits >= 0 ? "+" : ""}${info.credits}`;
      ctx.font = `800 ${TOKENS.fontRowSize}px 'Segoe UI', sans-serif`;
      const creditW = ctx.measureText(creditText).width;

      const roleLabel = (ROLE_LABELS[info.role] || info.role).toUpperCase();
      const chip = ROLE_CHIP_COLORS[info.role] || ROLE_CHIP_COLORS.INNOCENT;
      ctx.font = "700 11px 'Segoe UI', sans-serif";
      const chipTextW = ctx.measureText(roleLabel).width;
      const chipW = chipTextW + 14;
      const chipH = 16;

      const rightBlockW = creditW + 10 + chipW;
      const nameMaxW = rewardColW - (cx - rx) - rightBlockW - 12;

      const name = resolveDisplayName(guild, id, member);
      ctx.textAlign = "left";
      ctx.fillStyle = TOKENS.textPrimary;
      ctx.font = `600 ${TOKENS.fontRowSize}px 'Segoe UI', sans-serif`;
      ctx.textBaseline = "alphabetic";
      ctx.fillText(truncate(ctx, name, Math.max(20, nameMaxW)), cx, ry + rowH2 / 2 + 5);

      const chipX = rx + rewardColW - rightBlockW;
      roundRect(ctx, chipX, ry + (rowH2 - chipH) / 2, chipW, chipH, chipH / 2);
      ctx.fillStyle = chip.bg;
      ctx.fill();
      ctx.fillStyle = chip.fg;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "700 11px 'Segoe UI', sans-serif";
      ctx.fillText(roleLabel, chipX + chipW / 2, ry + rowH2 / 2 + 1);

      ctx.textAlign = "right";
      ctx.font = `800 ${TOKENS.fontRowSize}px 'Segoe UI', sans-serif`;
      ctx.fillStyle = info.credits >= 0 ? TOKENS.creditPositive : TOKENS.creditNegative;
      ctx.fillText(creditText, rx + rewardColW, ry + rowH2 / 2 + 5);
    }
  }

  // ---- Footer note ----
  ctx.textAlign = "right";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = TOKENS.textMuted;
  ctx.font = "500 11px 'Segoe UI', sans-serif";
  ctx.fillText("Gunakan /credit_to_xp untuk tukar kredit → XP", W - M, H - 14);

  const buffer = canvas.toBuffer("image/png");
  return new AttachmentBuilder(buffer, { name: "game-result.png" });
}

async function safeFetchMember(guild, id) {
  try { return await guild.members.fetch(id); } catch { return null; }
}

/**
 * Generic vertical row-list drawer shared by all three panels. `items` is
 * any array; `drawItem(item, index, rowY, rowH)` is called per row and is
 * responsible for drawing that row's content within [content.x, content.x+content.w].
 * Rows are evenly spaced to fill the content box (up to a sane row height cap).
 */
async function drawRowList(ctx, guild, content, items, drawItem) {
  if (!items.length) {
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = TOKENS.textMuted;
    ctx.font = `500 ${TOKENS.fontRowSize}px 'Segoe UI', sans-serif`;
    ctx.fillText("Tidak ada data", content.x, content.y + 14);
    return;
  }
  // Rows keep a natural height and stack from the top — they don't stretch
  // to fill the panel when there's only one or two of them (a single vote
  // result row centered/top-aligned in a tall empty panel looked awkward).
  const rowH = Math.min(34, Math.max(24, content.h / Math.max(items.length, 3)));
  for (let i = 0; i < items.length; i++) {
    const rowY = content.y + i * (rowH + 6);
    if (rowY > content.y + content.h - 4) break; // overflow guard
    await drawItem(items[i], i, rowY, rowH);
  }
}

module.exports = { generateResultCard, TOKENS, OUTCOME_PRESETS };
