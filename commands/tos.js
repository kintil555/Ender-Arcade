const { EmbedBuilder } = require("discord.js");
const env = require("../config/env");

module.exports = {
  name: "tos",
  description: "Tampilkan Terms of Service / peraturan server & komunitas",

  async execute(interaction) {
    const allowedChannelId = env.TOS_CHANNEL_ID;

    if (allowedChannelId && interaction.channelId !== allowedChannelId) {
      await interaction.reply({
        content: `❌ Command ini hanya bisa digunakan di <#${allowedChannelId}>.`,
        ephemeral: true,
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle("📜 Terms of Service & Peraturan Komunitas")
      .setColor(0x5865f2)
      .setDescription(
        "Dengan menggunakan bot dan berpartisipasi di server ini, kamu setuju dengan ketentuan berikut."
      )
      .addFields(
        {
          name: "1. Batasan Umur",
          value:
            "Sesuai [Terms of Service Discord](https://discord.com/terms), pengguna wajib berusia minimal 13 tahun (atau usia minimum yang berlaku di negaramu, jika lebih tinggi). Server ini mengikuti aturan yang sama — anggota di bawah umur tersebut wajib meninggalkan server.",
        },
        {
          name: "2. Perilaku",
          value: "Dilarang toxic, SARA, spam, atau harassment terhadap member lain.",
        },
        {
          name: "3. Fair Play",
          value: "Dilarang cheat, exploit bug, atau memanipulasi hasil game/ekonomi bot.",
        },
        {
          name: "4. Konten",
          value: "Dilarang mengirim konten NSFW, ilegal, atau melanggar [Community Guidelines Discord](https://discord.com/guidelines).",
        },
        {
          name: "5. Data & Privasi",
          value: "Bot menyimpan data terkait progres game (XP, credit, sesi) untuk keperluan fitur saja.",
        },
        {
          name: "6. Moderasi",
          value: "Admin/moderator berhak memberi sanksi (warn, mute, kick, ban) atas pelanggaran, termasuk pelanggaran batas umur di atas.",
        },
        {
          name: "7. Perubahan Aturan",
          value: "Peraturan dapat berubah sewaktu-waktu tanpa pemberitahuan sebelumnya.",
        },
      )
      .setFooter({ text: "Gunakan bot dan server dengan bijak. Terima kasih!" });

    await interaction.reply({ embeds: [embed] });
  },
};
