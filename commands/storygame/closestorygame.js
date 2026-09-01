const { gameManager } = require("../../function/storygame/GameManager");
const { GameState } = require("../../function/storygame/GameSession");
const { destroyStoryGameRoom } = require("../../function/storygame/gameRoom");

module.exports = {
  name: "closestorygame",
  description: "(Host) Tutup/batalkan game Sambung Kata yang sedang berjalan",
  options: [],
  cooldown: 5000,

  async execute(interaction) {
    const session = gameManager.getActiveSessionForPlayer(interaction.user.id);
    if (!session) {
      await interaction.reply({ content: "Kamu tidak sedang berada di game Sambung Kata manapun.", ephemeral: true });
      return;
    }
    if (!session.isHost(interaction.user.id)) {
      await interaction.reply({ content: "Hanya Host yang dapat menutup game ini.", ephemeral: true });
      return;
    }

    await interaction.reply({ content: "🛑 Game ditutup.", ephemeral: true });

    if (session.state !== GameState.LOBBY && session.channelId) {
      try {
        await destroyStoryGameRoom(interaction.guild, {
          categoryId: session.categoryId,
          channelId: session.channelId,
        });
      } catch (err) {
        console.error("[StoryGame] closegame cleanup error:", err);
      }
    } else if (session.lobbyMessageId && session.lobbyChannelId) {
      try {
        const ch = await interaction.guild.channels.fetch(session.lobbyChannelId).catch(() => null);
        const msg = ch ? await ch.messages.fetch(session.lobbyMessageId).catch(() => null) : null;
        if (msg) await msg.delete().catch(() => {});
      } catch { /**/ }
    }

    gameManager.destroySession(session.gameId);
  },
};
