const { EmbedBuilder } = require("discord.js");
const { gameManager } = require("../../function/impostor/GameManager");

module.exports = {
  name: "status",
  description: "Lihat status game impostor aktif kamu",
  options: [],
  cooldown: 3000,

  async execute(interaction) {
    const session =
      gameManager.getActiveSessionForPlayer(interaction.user.id) ||
      gameManager.getSessionByChannel(interaction.channel.id);

    if (!session) {
      await interaction.reply({ content: "Kamu tidak sedang berada di game impostor manapun.", ephemeral: true });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle("📊 Impostor Game Status")
      .setColor(0x5865f2)
      .addFields(
        { name: "Game ID", value: session.gameId, inline: true },
        { name: "State", value: session.state, inline: true },
        { name: "Host", value: `<@${session.hostId}>`, inline: true },
        { name: "Players", value: `${session.playerIds.length}`, inline: true },
        { name: "Alive", value: `${session.alivePlayers().length}`, inline: true },
        { name: "Theme", value: session.theme || "_not started_", inline: true }
      );

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
