const { gameManager } = require("./GameManager");
const { GameState } = require("./GameSession");
const { buildLobbyEmbed, buildLobbyButtons, buildRoomCreatedEmbed } = require("./embeds");
const { createGameRoom } = require("./gameRoom");
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

  session._lobbyTimeout = session.registerTimer(setTimeout(async () => {
    // Re-check state: the lobby may have started or been closed already
    // between when this fired and now (race with closegame/startgame).
    const current = gameManager.getSession(session.gameId);
    if (!current || current.state !== GameState.LOBBY) return;

    console.log(`[Impostor] Lobby ${session.gameId} auto-closed after ${LOBBY_IDLE_TIMEOUT_MS / 1000}s idle`);
    try {
      const guild = await client.guilds.fetch(session.guildId).catch(() => null);
      const lobbyChannel = guild && session.lobbyChannelId
        ? await guild.channels.fetch(session.lobbyChannelId).catch(() => null)
        : null;
      if (lobbyChannel && session.lobbyMessageId) {
        const lobbyMsg = await lobbyChannel.messages.fetch(session.lobbyMessageId).catch(() => null);
        if (lobbyMsg) await lobbyMsg.delete().catch(() => {});
      }

      const dmText =
        `⏱️ Lobby "Who Is The Impostor" ditutup otomatis karena tidak ada aktivitas selama ${LOBBY_IDLE_TIMEOUT_MS / 1000} detik. ` +
        "Gunakan `/opengame` untuk membuka lobby baru.";
      await Promise.all(
        session.playerIds.map((id) =>
          client.users.fetch(id)
            .then((user) => user.send(dmText))
            .catch(() => {})
        )
      );
    } catch (err) {
      console.error(`[Impostor] Failed cleaning up idle lobby ${session.gameId}:`, err.message);
    } finally {
      gameManager.destroySession(session.gameId);
    }
  }, LOBBY_IDLE_TIMEOUT_MS));
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

module.exports = { handleLobbyButton, MIN_PLAYERS, MAX_PLAYERS, armLobbyTimeout };