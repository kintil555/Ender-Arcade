const { gameManager } = require("../../function/impostor/GameManager");
const { buildLobbyEmbed, buildLobbyButtons } = require("../../function/impostor/embeds");
const { MIN_PLAYERS, MAX_PLAYERS, armLobbyTimeout } = require("../../function/impostor/lobbyHandler");

/**
 * Shared by both the /opengame slash command and the persistent "🎮 Open
 * Game" button posted in the designated game channel (see index.js's
 * imp_channel_opengame handler and commands/impostor/setupgame.js).
 * `interaction` can be either a ChatInputCommandInteraction or a
 * ButtonInteraction — both support .reply()/.user/.guild/.channel the
 * same way, so no branching needed here.
 */
async function openLobby(interaction) {
  const userId = interaction.user.id;

  const existingGame = gameManager.getActiveSessionForPlayer(userId);
  if (existingGame) {
    await interaction.reply({
      content: "Kamu sudah berada di game lain yang sedang aktif. Selesaikan game itu dulu sebelum membuka lobby baru.",
      ephemeral: true,
    });
    return;
  }

  if (!interaction.guild) {
    await interaction.reply({ content: "Command ini hanya dapat digunakan di dalam server.", ephemeral: true });
    return;
  }

  const session = gameManager.createSession({
    hostId: userId,
    guildId: interaction.guild.id,
    lobbyChannelId: interaction.channel.id,
    lobbyMessageId: null,
  });

  // Arm the 60s idle-close timer before the first embed is sent so the
  // countdown field is already populated on the very first message,
  // instead of only appearing after the first Join/Leave.
  armLobbyTimeout(session, interaction.client, { skipRefresh: true });

  const reply = await interaction.reply({
    embeds: [buildLobbyEmbed(session, MIN_PLAYERS, MAX_PLAYERS)],
    components: [buildLobbyButtons(false)],
    fetchReply: true,
  });

  session.lobbyMessageId = reply.id;
  gameManager.registerLobbyMessage(session.gameId, reply.id);
  return session;
}

module.exports = {
  name: "opengame",
  description: "Buka lobby baru untuk game Who Is The Impostor",
  options: [],
  cooldown: 5000,
  openLobby,

  async execute(interaction) {
    await openLobby(interaction);
  },
};