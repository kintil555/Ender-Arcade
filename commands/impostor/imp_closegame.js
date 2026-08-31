const { gameManager } = require("../../function/impostor/GameManager");
const { cleanupGame } = require("../../function/impostor/GameFlow");
const { isAdminOrOwner } = require("../../function/impostor/permissions");

module.exports = {
  name: "imp_closegame",
  description: "Batalkan dan hapus game impostor aktif (Host atau Administrator)",
  options: [],
  cooldown: 3000,

  async execute(interaction) {
    const userId = interaction.user.id;
    const channelId = interaction.channel.id;

    let session =
      gameManager.getActiveSessionForPlayer(userId) ||
      gameManager.getSessionByChannel(channelId);

    if (!session) {
      await interaction.reply({ content: "Tidak ada game impostor aktif yang ditemukan.", ephemeral: true });
      return;
    }

    const isAdmin = isAdminOrOwner(interaction);
    if (!session.isHost(userId) && !isAdmin) {
      await interaction.reply({ content: "Hanya Host, Admin, atau Owner yang dapat menutup game ini.", ephemeral: true });
      return;
    }

    await interaction.reply({ content: "🛑 Game dibatalkan. Membersihkan resource..." });
    console.log(`[Impostor] Game ${session.gameId} force-closed by ${userId} (admin=${Boolean(isAdmin)})`);

    if (session.categoryId || session.channelId) {
      await cleanupGame(interaction.guild, session, 0);
    } else {
      gameManager.destroySession(session.gameId);
    }
  },
};
