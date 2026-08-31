const { isAdminOrOwner } = require("../../function/impostor/permissions");
const { OWNER_ID } = require("../../config/env");

// Accepts a raw message ID or a full Discord message link and returns
// { channelId, messageId }, using the current interaction channel when
// only a bare ID is given.
function parseMessageRef(raw, fallbackChannelId) {
  const linkMatch = raw.match(/channels\/\d+\/(\d+)\/(\d+)/);
  if (linkMatch) return { channelId: linkMatch[1], messageId: linkMatch[2] };
  if (/^\d+$/.test(raw.trim())) return { channelId: fallbackChannelId, messageId: raw.trim() };
  return null;
}

module.exports = {
  name: "deletemsg",
  description: "[Owner] Hapus pesan bot berdasarkan message ID atau link",
  options: [
    {
      name: "pesan",
      description: "Message ID, atau link pesan Discord",
      type: 3, // STRING
      required: true,
    },
  ],
  cooldown: 2000,

  async execute(interaction) {
    // Owner-only, deliberately stricter than guardAdminOrOwner (Admin
    // role should not be able to reach into arbitrary channels and
    // delete bot messages bot-wide).
    if (interaction.user.id !== OWNER_ID) {
      await interaction.reply({ content: "❌ Command ini hanya untuk Owner.", ephemeral: true });
      return;
    }

    const raw = interaction.options.getString("pesan");
    const ref = parseMessageRef(raw, interaction.channel.id);
    if (!ref) {
      await interaction.reply({ content: "Format tidak valid. Kirim message ID atau link pesan Discord.", ephemeral: true });
      return;
    }

    try {
      const channel = await interaction.client.channels.fetch(ref.channelId);
      if (!channel || !channel.isTextBased()) {
        await interaction.reply({ content: "Channel dari pesan itu tidak ditemukan atau bukan text channel.", ephemeral: true });
        return;
      }

      const message = await channel.messages.fetch(ref.messageId);
      if (message.author.id !== interaction.client.user.id) {
        await interaction.reply({ content: "Pesan itu bukan dari bot ini — tidak bisa dihapus lewat command ini.", ephemeral: true });
        return;
      }

      await message.delete();
      await interaction.reply({ content: `✅ Pesan berhasil dihapus dari <#${ref.channelId}>.`, ephemeral: true });
    } catch (err) {
      const notFound = err?.code === 10008; // Unknown Message
      await interaction.reply({
        content: notFound
          ? "Pesan tidak ditemukan — sudah terhapus, atau ID/link salah."
          : `Gagal menghapus pesan: ${err.message}`,
        ephemeral: true,
      });
    }
  },
};