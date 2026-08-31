const { GameState } = require("../../function/impostor/GameSession");
const { isAdminOrOwner } = require("../../function/impostor/permissions");

module.exports = {
  name: "startgame",
  description: "[Host/Admin/Owner] Mulai game impostor: bagikan tema & role ke semua pemain",
  options: [],
  cooldown: 2000,

  async execute(interaction) {
    const { gameManager } = require("../../function/impostor/GameManager");
    const { MIN_PLAYERS } = require("../../function/impostor/lobbyHandler");
    const { runGame } = require("../../function/impostor/GameFlow");

    const session = gameManager.getSessionByChannel(interaction.channelId);
    if (!session) {
      await interaction.reply({ content: "Tidak ada game impostor aktif di channel ini.", ephemeral: true });
      return;
    }
    if (!session.isHost(interaction.user.id) && !isAdminOrOwner(interaction)) {
      await interaction.reply({ content: "Hanya Host, Admin, atau Owner yang dapat memulai game dengan `/startgame`.", ephemeral: true });
      return;
    }
    if (session.playerIds.length < MIN_PLAYERS) {
      await interaction.reply({ content: `Butuh minimal ${MIN_PLAYERS} pemain untuk memulai.`, ephemeral: true });
      return;
    }
    if (session.state !== GameState.WAITING_FOR_START && session.state !== GameState.ROOM_CREATED) {
      await interaction.reply({ content: "Game sudah dimulai atau belum dalam state yang tepat.", ephemeral: true });
      return;
    }

    await interaction.reply({ content: "🎮 Game dimulai! Membagikan tema dan role..." });

    runGame(interaction.client, interaction.guild, session, interaction.channel).catch((err) => {
      console.error(`[Impostor] runGame (/startgame) error:`, err);
    });
  },
};
