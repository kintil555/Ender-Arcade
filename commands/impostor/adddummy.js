const { gameManager } = require("../../function/impostor/GameManager");
const { GameState } = require("../../function/impostor/GameSession");
const { buildLobbyEmbed, buildLobbyButtons } = require("../../function/impostor/embeds");
const { MIN_PLAYERS, MAX_PLAYERS } = require("../../function/impostor/lobbyHandler");

module.exports = {
  name: "adddummy",
  description: "[DEBUG] Isi slot lobby dengan dummy player untuk testing solo",
  options: [
    {
      name: "jumlah",
      description: "Jumlah dummy yang ditambahkan (default: 1)",
      type: 4, // INTEGER
      required: false,
      min_value: 1,
      max_value: 9,
    },
  ],
  cooldown: 2000,

  async execute(interaction) {
    const userId = interaction.user.id;
    const session = gameManager.getActiveSessionForPlayer(userId);

    if (!session) {
      await interaction.reply({ content: "Kamu tidak sedang membuka lobby impostor manapun.", ephemeral: true });
      return;
    }
    if (!session.isHost(userId)) {
      await interaction.reply({ content: "Hanya Host yang dapat menambahkan dummy.", ephemeral: true });
      return;
    }
    if (session.state !== GameState.LOBBY) {
      await interaction.reply({ content: "Dummy hanya bisa ditambahkan selama lobby masih terbuka (belum start).", ephemeral: true });
      return;
    }

    const requested = interaction.options.getInteger("jumlah") || 1;
    const freeSlots = MAX_PLAYERS - session.playerIds.length;

    if (freeSlots <= 0) {
      await interaction.reply({ content: `Lobby sudah penuh (maksimum ${MAX_PLAYERS} pemain).`, ephemeral: true });
      return;
    }

    const toAdd = Math.min(requested, freeSlots);
    const added = gameManager.addDummyPlayers(session, toAdd);

    await interaction.reply({
      content: `🤖 Menambahkan ${added.length} dummy player. Total pemain sekarang: ${session.playerIds.length}.`,
      ephemeral: true,
    });

    // Refresh the public lobby message so everyone sees the updated player list.
    try {
      const lobbyChannel = await interaction.guild.channels.fetch(session.lobbyChannelId);
      const lobbyMsg = await lobbyChannel.messages.fetch(session.lobbyMessageId);
      await lobbyMsg.edit({
        embeds: [buildLobbyEmbed(session, MIN_PLAYERS, MAX_PLAYERS)],
        components: [buildLobbyButtons(false)],
      });
    } catch (err) {
      console.error("[Impostor] adddummy: failed to refresh lobby message:", err.message);
    }
  },
};
