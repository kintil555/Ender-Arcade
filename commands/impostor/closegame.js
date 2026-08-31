const { gameManager } = require("../../function/impostor/GameManager");
const { cleanupGame } = require("../../function/impostor/GameFlow");
const { isAdminOrOwner } = require("../../function/impostor/permissions");
const { OWNER_ID } = require("../../config/env");

module.exports = {
  name: "closegame",
  description: "Batalkan dan hapus game impostor aktif (Host atau Administrator)",
  options: [
    {
      name: "game_id",
      description: "[Owner only] Game ID untuk menutup game host lain dari channel manapun",
      type: 3, // STRING
      required: false,
    },
  ],
  cooldown: 3000,

  async execute(interaction) {
    const userId = interaction.user.id;
    const channelId = interaction.channel.id;
    const gameIdArg = interaction.options.getString("game_id");

    let session;
    if (gameIdArg) {
      // Explicit game_id lets Owner reach into any session, from any
      // channel, without needing to be the host or physically inside
      // that game's channel.
      if (userId !== OWNER_ID) {
        await interaction.reply({ content: "❌ Opsi `game_id` hanya bisa dipakai Owner.", ephemeral: true });
        return;
      }
      session = gameManager.getSession(gameIdArg);
      if (!session) {
        await interaction.reply({ content: `Game dengan ID \`${gameIdArg}\` tidak ditemukan.`, ephemeral: true });
        return;
      }
    } else {
      session =
        gameManager.getActiveSessionForPlayer(userId) ||
        gameManager.getSessionByChannel(channelId);
    }

    if (!session) {
      await interaction.reply({ content: "Tidak ada game impostor aktif yang ditemukan.", ephemeral: true });
      return;
    }

    const isAdmin = isAdminOrOwner(interaction);
    if (!session.isHost(userId) && !isAdmin) {
      await interaction.reply({ content: "Hanya Host, Admin, atau Owner yang dapat menutup game ini.", ephemeral: true });
      return;
    }

    const guild = gameIdArg ? await interaction.client.guilds.fetch(session.guildId).catch(() => null) : interaction.guild;
    if (!guild) {
      await interaction.reply({ content: "Guild dari game ini tidak ditemukan (bot mungkin sudah dikeluarkan).", ephemeral: true });
      return;
    }

    await interaction.reply({ content: `🛑 Game \`${session.gameId}\` dibatalkan. Membersihkan resource...`, ephemeral: Boolean(gameIdArg) });
    console.log(`[Impostor] Game ${session.gameId} force-closed by ${userId} (admin=${Boolean(isAdmin)}, remote=${Boolean(gameIdArg)})`);

    // Delete lobby message if still exists
    if (session.lobbyChannelId && session.lobbyMessageId) {
      try {
        const lobbyChannel = await guild.channels.fetch(session.lobbyChannelId).catch(() => null);
        if (lobbyChannel) {
          const lobbyMsg = await lobbyChannel.messages.fetch(session.lobbyMessageId).catch(() => null);
          if (lobbyMsg) await lobbyMsg.delete().catch(() => {});
        }
      } catch { /* already deleted */ }
    }

    if (session.categoryId || session.channelId) {
      await cleanupGame(guild, session, 0);
    } else {
      gameManager.destroySession(session.gameId);
    }
  },
};