const { gameManager } = require("./GameManager");
const { GameState } = require("./GameSession");
const { buildLobbyEmbed, buildLobbyButtons, buildRoundEmbed, buildRoundButton } = require("./embeds");
const { createStoryGameRoom } = require("./gameRoom");

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 10;
const LOBBY_IDLE_TIMEOUT_MS = 60_000;

function armLobbyTimeout(session, client, { skipRefresh = false } = {}) {
  if (session.state !== GameState.LOBBY) return;
  if (session._lobbyTimeout) clearTimeout(session._lobbyTimeout);

  session._lobbyExpiresAt = Date.now() + LOBBY_IDLE_TIMEOUT_MS;
  if (!skipRefresh) refreshLobbyCountdown(session, client);

  session._lobbyTimeout = session.registerTimer(setTimeout(async () => {
    const current = gameManager.getSession(session.gameId);
    if (!current || current.state !== GameState.LOBBY) return;

    console.log(`[StoryGame] Lobby ${session.gameId} auto-closed after idle`);
    try {
      const guild = await client.guilds.fetch(session.guildId).catch(() => null);
      const lobbyChannel = guild && session.lobbyChannelId
        ? await guild.channels.fetch(session.lobbyChannelId).catch(() => null)
        : null;
      if (lobbyChannel && session.lobbyMessageId) {
        const lobbyMsg = await lobbyChannel.messages.fetch(session.lobbyMessageId).catch(() => null);
        if (lobbyMsg) await lobbyMsg.delete().catch(() => {});
      }
      const dmText = "⏱️ Lobby \"Sambung Kata\" ditutup otomatis karena tidak ada aktivitas. Gunakan `/storygame` untuk membuka lobby baru.";
      await Promise.all(
        session.playerIds.map((id) => client.users.fetch(id).then((u) => u.send(dmText)).catch(() => {}))
      );
    } catch (err) {
      console.error(`[StoryGame] Failed cleaning up idle lobby ${session.gameId}:`, err.message);
    } finally {
      gameManager.destroySession(session.gameId);
    }
  }, LOBBY_IDLE_TIMEOUT_MS));
}

async function refreshLobbyCountdown(session, client) {
  if (!session.lobbyChannelId || !session.lobbyMessageId) return;
  try {
    const guild = await client.guilds.fetch(session.guildId).catch(() => null);
    const lobbyChannel = guild ? await guild.channels.fetch(session.lobbyChannelId).catch(() => null) : null;
    const lobbyMsg = lobbyChannel ? await lobbyChannel.messages.fetch(session.lobbyMessageId).catch(() => null) : null;
    if (!lobbyMsg) return;
    await lobbyMsg.edit({ embeds: [buildLobbyEmbed(session, MIN_PLAYERS, MAX_PLAYERS)] }).catch(() => {});
  } catch { /* cosmetic */ }
}

async function handleLobbyButton(interaction) {
  const session = gameManager.getSessionByLobbyMessage(interaction.message.id);
  if (!session || session.state !== GameState.LOBBY) {
    await interaction.reply({ content: "Lobby ini sudah tidak aktif.", ephemeral: true });
    return;
  }

  const userId = interaction.user.id;
  switch (interaction.customId) {
    case "story_lobby_join": return handleJoin(interaction, session, userId);
    case "story_lobby_leave": return handleLeave(interaction, session, userId);
    case "story_lobby_start": return handleStart(interaction, session, userId);
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
    await interaction.reply({ content: "Kamu sudah berada di game lain yang sedang aktif.", ephemeral: true });
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
    await interaction.reply({ content: "Host tidak dapat keluar. Batalkan lobby dengan menutup pesan atau minta admin.", ephemeral: true });
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
    await interaction.reply({ content: `Butuh minimal ${MIN_PLAYERS} pemain. Saat ini: ${session.playerIds.length}.`, ephemeral: true });
    return;
  }

  if (session._lobbyTimeout) clearTimeout(session._lobbyTimeout);

  try {
    await interaction.update({ components: [buildLobbyButtons(true)] });
  } catch { /**/ }

  let categoryId, channelId;
  try {
    ({ categoryId, channelId } = await createStoryGameRoom(interaction.guild, {
      playerIds: session.playerIds,
      gameId: session.gameId,
    }));
  } catch (err) {
    console.error("[StoryGame] Failed to create game room:", err);
    await interaction.followUp({ content: `⚠️ ${err.message || "Gagal membuat game room."}`, ephemeral: true });
    return;
  }

  session.categoryId = categoryId;
  session.channelId = channelId;
  session.startGame();

  const gameChannel = await interaction.guild.channels.fetch(channelId);
  const mentions = session.playerIds.map((id) => `<@${id}>`).join(" ");
  const roundMsg = await gameChannel.send({
    content: mentions,
    embeds: [buildRoundEmbed(session)],
    components: [buildRoundButton(false)],
  });
  session.gameMessageId = roundMsg.id;
  gameManager.registerGameMessage(session.gameId, roundMsg.id);

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
