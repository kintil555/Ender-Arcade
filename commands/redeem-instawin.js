const { EmbedBuilder } = require("discord.js");
const { redeemInstawinCode } = require("../function/impostor/instawin");

module.exports = {
  name: "redeem-instawin",
  description: "Klaim kode Instant Win Token",
  options: [
    {
      name: "kode",
      description: "Kode rahasia Instant Win yang kamu terima",
      type: 3, // STRING
      required: true,
    },
  ],

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const kode = interaction.options.getString("kode");
    const result = redeemInstawinCode(interaction.user.id, kode);

    if (!result.ok) {
      const message =
        result.reason === "ALREADY_CLAIMED"
          ? "⚠️ Kode ini sudah pernah diklaim orang lain. Kode hanya bisa dipakai sekali."
          : "❌ Kode tidak valid.";

      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle("Redeem Gagal")
            .setColor(0xe74c3c)
            .setDescription(message),
        ],
      });
      return;
    }

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle("👑 Instant Win Token Berhasil Diklaim!")
          .setColor(0xf1c40f)
          .setDescription(
            "Kamu sekarang punya **1 Instant Win Token**.\n\n" +
            "**Cara pakai:**\n" +
            "1. Ikut/main di game *Who Is The Impostor* seperti biasa.\n" +
            "2. Kapan saja selama game berlangsung, jalankan `/use-instawin`.\n" +
            "3. Timmu (sesuai role kamu — Impostor, Innocent, dst) akan langsung dinyatakan menang dan game berakhir seketika.\n\n" +
            "Token ini **hanya bisa dipakai 1 kali seumur hidup** — gunakan dengan bijak!"
          ),
      ],
    });

    console.log(`[Instawin] ${interaction.user.tag} redeemed an instant-win code`);
  },
};
