const { gameManager } = require("../../function/impostor/GameManager");
const { GameState } = require("../../function/impostor/GameSession");
const { buildLobbyEmbed, buildLobbyButtons } = require("../../function/impostor/embeds");
const { MIN_PLAYERS, MAX_PLAYERS } = require("../../function/impostor/lobbyHandler");

module.exports = {
  name: "removedummy",
  description: "[DEBUG] Hapus semua dummy player dari lobby",
  options: [],
  cooldown: 2000,

  async execute(interaction) {
    const userId = interaction.user.id;
    const session = gameManager.getActiveSessionForPlayer(userId);

    if (!session) {
      await interaction.reply({ content: "Kamu tidak sedang membuka lobby impostor manapun.", ephemeral: true });
      return;
    }
    if (!session.isHost(userId)) {
      await interaction.reply({ content: "Hanya Host yang dapat menghapus dummy.", ephemeral: true });
      return;
    }
    if (session.state !== GameState.LOBBY) {
      await interaction.reply({ content: "Dummy hanya bisa dihapus selama lobby masih terbuka (belum start).", ephemeral: true });
      return;
    }

    const removed = gameManager.removeDummyPlayers(session);

    await interaction.reply({
      content: removed.length > 0
        ? `🗑️ Menghapus ${removed.length} dummy player. Total pemain sekarang: ${session.playerIds.length}.`
        : "Tidak ada dummy player di lobby ini.",
      ephemeral: true,
    });

    try {
      const lobbyChannel = await interaction.guild.channels.fetch(session.lobbyChannelId);
      const lobbyMsg = await lobbyChannel.messages.fetch(session.lobbyMessageId);
      await lobbyMsg.edit({
        embeds: [buildLobbyEmbed(session, MIN_PLAYERS, MAX_PLAYERS)],
        components: [buildLobbyButtons(false)],
      });
    } catch (err) {
      console.error("[Impostor] removedummy: failed to refresh lobby message:", err.message);
    }
  },
};
