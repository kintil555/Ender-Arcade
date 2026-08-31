const { ChannelType } = require("discord.js");
const { buildGameChannelGuideEmbed, buildGameChannelTriggerButton } = require("../../function/impostor/embeds");
const { guildConfigManager } = require("../../function/impostor/guildConfig");
const { MIN_PLAYERS, MAX_PLAYERS } = require("../../function/impostor/lobbyHandler");
const { guardAdminOrOwner } = require("../../function/impostor/permissions");

module.exports = {
  name: "setupgame",
  description: "(Owner/Admin) Tetapkan channel khusus untuk membuka game Who Is The Impostor",
  options: [
    {
      name: "channel",
      description: "Channel yang akan dijadikan channel khusus open game (default: channel saat ini)",
      type: 7, // CHANNEL
      channel_types: [ChannelType.GuildText],
      required: false,
    },
  ],
  cooldown: 5000,

  async execute(interaction) {
    if (!(await guardAdminOrOwner(interaction))) return;

    if (!interaction.guild) {
      await interaction.reply({ content: "Command ini hanya dapat digunakan di dalam server.", ephemeral: true });
      return;
    }

    const targetChannel = interaction.options.getChannel("channel") || interaction.channel;

    await interaction.reply({ content: `⏳ Menyiapkan channel ${targetChannel}...`, ephemeral: true });

    let guideMsg;
    try {
      guideMsg = await targetChannel.send({ embeds: [buildGameChannelGuideEmbed(MIN_PLAYERS, MAX_PLAYERS)] });
      await targetChannel.send({
        content: "Tekan tombol di bawah untuk membuka lobby baru:",
        components: [buildGameChannelTriggerButton()],
      });
    } catch (err) {
      console.error("[Impostor] Failed to post setup guide:", err);
      await interaction.editReply({ content: `❌ Gagal mengirim pesan ke ${targetChannel}. Pastikan bot punya izin Send Messages di sana.` });
      return;
    }

    await guildConfigManager.setGameChannel(interaction.guild.id, {
      channelId: targetChannel.id,
      guideMessageId: guideMsg.id,
      buttonMessageId: null,
    });

    await interaction.editReply({ content: `✅ Channel khusus open game diatur ke ${targetChannel}. Command \`/opengame\` di channel lain sekarang akan ditolak.` });
  },
};