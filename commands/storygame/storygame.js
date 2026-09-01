const { gameManager } = require("../../function/storygame/GameManager");
const { buildLobbyEmbed, buildLobbyButtons } = require("../../function/storygame/embeds");
const { MIN_PLAYERS, MAX_PLAYERS, armLobbyTimeout } = require("../../function/storygame/lobbyHandler");

module.exports = {
  name: "storygame",
  description: "Buka lobby baru untuk game Sambung Kata",
  options: [
    {
      name: "ronde",
      description: "Jumlah ronde (default 10)",
      type: 4, // INTEGER
      required: false,
      min_value: 1,
      max_value: 50,
    },
  ],
  cooldown: 5000,

  async execute(interaction) {
    const userId = interaction.user.id;

    const existingGame = gameManager.getActiveSessionForPlayer(userId);
    if (existingGame) {
      await interaction.reply({
        content: "Kamu sudah berada di game lain yang sedang aktif. Selesaikan game itu dulu.",
        ephemeral: true,
      });
      return;
    }

    if (!interaction.guild) {
      await interaction.reply({ content: "Command ini hanya dapat digunakan di dalam server.", ephemeral: true });
      return;
    }

    const totalRounds = interaction.options.getInteger("ronde") || 10;

    const session = gameManager.createSession({
      hostId: userId,
      guildId: interaction.guild.id,
      lobbyChannelId: interaction.channel.id,
      totalRounds,
    });

    armLobbyTimeout(session, interaction.client, { skipRefresh: true });

    const reply = await interaction.reply({
      embeds: [buildLobbyEmbed(session, MIN_PLAYERS, MAX_PLAYERS)],
      components: [buildLobbyButtons(false)],
      fetchReply: true,
    });

    session.lobbyMessageId = reply.id;
    gameManager.registerLobbyMessage(session.gameId, reply.id);
  },
};
