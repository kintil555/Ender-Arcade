const { gameManager } = require("./GameManager");
const { GameState } = require("./GameSession");
const { buildLobbyEmbed, buildLobbyButtons, buildRoomCreatedEmbed } = require("./embeds");
const { createGameRoom } = require("./gameRoom");
const { saveSession } = require("./sessionPersistence");
const env = require("../../config/env");

const MIN_PLAYERS = env.MIN_PLAYERS;
const MAX_PLAYERS = env.MAX_PLAYERS;
const LOBBY_IDLE_TIMEOUT_MS = 60_000;

/**
 * Arms (or re-arms) the 60s idle-close timer for a lobby. Called once
 * when the lobby is created, then again on every Join/Leave so activity
 * keeps resetting the clock. If nobody starts the game within the
 * window, the lobby message is deleted (silently — no "lobby closed"
 * message left behind in the channel) and the session destroyed. Every
 * player who had joined (host included) gets a DM explaining why.
 *
 * Also refreshes the lobby message so its "Auto-close" countdown field
 * reflects the new deadline — the countdown itself then ticks in real
 * time client-side via Discord's <t:...:R> timestamp, no further edits
 * needed until the timer is next re-armed. Pass `skipRefresh: true` when
 * the caller is about to update the message itself right after (Join/
 * Leave already call interaction.update()), to avoid a redundant edit.
 */
function armLobbyTimeout(session, client, { skipRefresh = false } = {}) {
  if (session.state !== GameState.LOBBY) return;
  if (session._lobbyTimeout) clearTimeout(session._lobbyTimeout);

  session._lobbyExpiresAt = Date.now() + LOBBY_IDLE_TIMEOUT_MS;
  if (!skipRefresh) refreshLobbyCountdown(session, client);
  saveSession(session); // persist the new deadline so a restart can't leave it stale

  session._lobbyTimeout = session.registerTimer(setTimeout(() => {
    closeIdleLobby(session.gameId, client);
  }, LOBBY_IDLE_TIMEOUT_MS));
}

/**
 * Actually closes an idle lobby: deletes the lobby message, DMs every
 * player, and destroys the session. Shared by two triggers:
 *  1. The per-session setTimeout armed in armLobbyTimeout (fires almost
 *     exactly on time — this is the normal, fast path).
 *  2. startLobbySweeper's periodic safety-net scan (below), which catches
 *     any lobby whose setTimeout never fired — e.g. the event loop was
 *     blocked for a while, or a session survived a crash/restart without
 *     its timer being re-armed. The sweeper compares against the
 *     persisted _lobbyExpiresAt directly instead of trusting a timer.
 * Safe to call twice for the same gameId: the state re-check below makes
 * the second call a no-op.
 */
async function closeIdleLobby(gameId, client) {
  const current = gameManager.getSession(gameId);
  if (!current || current.state !== GameState.LOBBY) return;

  console.log(`[Impostor] Lobby ${gameId} auto-closed after ${LOBBY_IDLE_TIMEOUT_MS / 1000}s idle`);
  try {
    const guild = await client.guilds.fetch(current.guildId).catch(() => null);
    const lobbyChannel = guild && current.lobbyChannelId
      ? await guild.channels.fetch(current.lobbyChannelId).catch(() => null)
      : null;
    if (lobbyChannel && current.lobbyMessageId) {
      const lobbyMsg = await lobbyChannel.messages.fetch(current.lobbyMessageId).catch(() => null);
      if (lobbyMsg) await lobbyMsg.delete().catch(() => {});
    }

    const dmText =
      `⏱️ Lobby "Who Is The Impostor" ditutup otomatis karena tidak ada aktivitas selama ${LOBBY_IDLE_TIMEOUT_MS / 1000} detik. ` +
      "Gunakan `/opengame` untuk membuka lobby baru.";
    await Promise.all(
      current.playerIds.map((id) =>
        client.users.fetch(id)
          .then((user) => user.send(dmText))
          .catch(() => {})
      )
    );
  } catch (err) {
    console.error(`[Impostor] Failed cleaning up idle lobby ${gameId}:`, err.message);
  } finally {
    gameManager.destroySession(gameId);
  }
}

const SWEEP_INTERVAL_MS = 30_000;
let _sweeperHandle = null;

/**
 * Safety-net sweep: every 30s, scans all in-memory LOBBY sessions and
 * force-closes any whose _lobbyExpiresAt has already passed. This exists
 * because the per-session setTimeout in armLobbyTimeout can silently fail
 * to fire (event loop starvation, a session object surviving without its
 * timer re-armed, etc.) — when that happens the lobby message is left
 * showing a stale/incorrect "auto-close" countdown forever instead of
 * actually closing. The sweeper is independent of any single timer and
 * re-derives "is this expired?" straight from the timestamp each pass,
 * so it self-heals regardless of why the primary timer didn't fire.
 * Call once from index.js on bot ready; safe to call multiple times
 * (subsequent calls are no-ops) since only one interval is ever kept.
 */
function startLobbySweeper(client) {
  if (_sweeperHandle) return;
  _sweeperHandle = setInterval(() => {
    const now = Date.now();
    for (const session of gameManager.sessions.values()) {
      if (session.state !== GameState.LOBBY) continue;
      if (!session._lobbyExpiresAt) continue;
      if (session._lobbyExpiresAt <= now) {
        closeIdleLobby(session.gameId, client);
      }
    }
  }, SWEEP_INTERVAL_MS);
  console.log(`[Impostor] Lobby sweeper started (every ${SWEEP_INTERVAL_MS / 1000}s)`);
}

/**
 * Best-effort edit of the lobby message so the "Auto-close" field's
 * relative timestamp reflects the freshly-armed deadline. Failures are
 * swallowed — this is a cosmetic refresh, not critical path.
 */
async function refreshLobbyCountdown(session, client) {
  if (!session.lobbyChannelId || !session.lobbyMessageId) return;
  try {
    const guild = await client.guilds.fetch(session.guildId).catch(() => null);
    const lobbyChannel = guild ? await guild.channels.fetch(session.lobbyChannelId).catch(() => null) : null;
    const lobbyMsg = lobbyChannel ? await lobbyChannel.messages.fetch(session.lobbyMessageId).catch(() => null) : null;
    if (!lobbyMsg) return;
    await lobbyMsg.edit({
      embeds: [buildLobbyEmbed(session, MIN_PLAYERS, MAX_PLAYERS)],
    }).catch(() => {});
  } catch { /* cosmetic only */ }
}

async function handleLobbyButton(interaction) {
  const session = gameManager.getSessionByLobbyMessage(interaction.message.id);
  if (!session || session.state !== GameState.LOBBY) {
    await interaction.reply({ content: "Lobby ini sudah tidak aktif.", ephemeral: true });
    return;
  }

  const userId = interaction.user.id;
  switch (interaction.customId) {
    case "imp_lobby_join": return handleJoin(interaction, session, userId);
    case "imp_lobby_leave": return handleLeave(interaction, session, userId);
    case "imp_lobby_start": return handleStart(interaction, session, userId);
    default: return;
  }
}

async function handleJoin(interaction, session, userId) {
  if (session.isPlayer(userId)) {
    await interaction.reply({ content: "Kamu sudah berada di lobby ini.", ephemeral: true });
    return;
  }
  const existingGame = gameManager.getActiveSessionForPlayer(userId);
  if (existingGame) {
    await interaction.reply({ content: "Kamu sudah berada di game lain yang sedang aktif. Selesaikan game itu dulu.", ephemeral: true });
    return;
  }
  if (session.playerIds.length >= MAX_PLAYERS) {
    await interaction.reply({ content: `Lobby sudah penuh (maksimum ${MAX_PLAYERS} pemain).`, ephemeral: true });
    return;
  }
  gameManager.addPlayerToSession(session, userId);
  armLobbyTimeout(session, interaction.client, { skipRefresh: true });
  await refreshLobbyMessage(interaction, session);
}

async function handleLeave(interaction, session, userId) {
  if (!session.isPlayer(userId)) {
    await interaction.reply({ content: "Kamu tidak berada di lobby ini.", ephemeral: true });
    return;
  }
  if (session.isHost(userId)) {
    await interaction.reply({ content: "Host tidak dapat keluar dari lobby. Gunakan `/closegame` untuk membatalkan.", ephemeral: true });
    return;
  }
  gameManager.removePlayerFromSession(session, userId);
  armLobbyTimeout(session, interaction.client, { skipRefresh: true });
  await refreshLobbyMessage(interaction, session);
}

async function handleStart(interaction, session, userId) {
  if (!session.isHost(userId)) {
    await interaction.reply({ content: "Hanya Host yang dapat memulai game.", ephemeral: true });
    return;
  }
  if (session.playerIds.length < MIN_PLAYERS) {
    await interaction.reply({ content: `Butuh minimal ${MIN_PLAYERS} pemain untuk memulai. Saat ini: ${session.playerIds.length}.`, ephemeral: true });
    return;
  }

  session.state = GameState.ROOM_CREATED;
  if (session._lobbyTimeout) clearTimeout(session._lobbyTimeout);

  // Disable lobby buttons
  try {
    await interaction.update({ components: [buildLobbyButtons(true)] });
  } catch { /**/ }

  // Create private game room
  let categoryId, channelId;
  try {
    ({ categoryId, channelId } = await createGameRoom(interaction.guild, {
      playerIds: session.playerIds,
      gameId: session.gameId,
    }));
  } catch (err) {
    console.error("[Impostor] Failed to create game room:", err);
    const reason = err?.message?.startsWith("Bot tidak punya izin")
      ? err.message
      : "Gagal membuat game room. Coba lagi.";
    await interaction.followUp({ content: `⚠️ ${reason}`, ephemeral: true });
    session.state = GameState.LOBBY;
    return;
  }

  session.categoryId = categoryId;
  session.channelId = channelId;
  gameManager.registerGameChannel(session.gameId, channelId); // also triggers saveSession

  const gameChannel = await interaction.guild.channels.fetch(channelId);
  const roomMsg = buildRoomCreatedEmbed(session);
  await gameChannel.send(roomMsg);
  // Role/theme assignment happens only when the Host explicitly starts the
  // game via !startgame or /startgame (see index.js) — not here.

  // The lobby/selection message (Join/Leave/Open Game) has served its
  // purpose once the private room exists — clean it up so the game
  // channel doesn't accumulate stale lobby messages from past games.
  setTimeout(() => {
    interaction.deleteReply().catch(() => {});
  }, 4000);
}

async function refreshLobbyMessage(interaction, session) {
  try {
    await interaction.update({
      embeds: [buildLobbyEmbed(session, MIN_PLAYERS, MAX_PLAYERS)],
      components: [buildLobbyButtons(false)],
    });
  } catch {
    try {
      await interaction.deferUpdate();
      await interaction.message.edit({
        embeds: [buildLobbyEmbed(session, MIN_PLAYERS, MAX_PLAYERS)],
        components: [buildLobbyButtons(false)],
      });
    } catch { /**/ }
  }
}

module.exports = { handleLobbyButton, MIN_PLAYERS, MAX_PLAYERS, armLobbyTimeout, startLobbySweeper };
