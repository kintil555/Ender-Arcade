const { EmbedBuilder } = require("discord.js");
const { redeemCode } = require("../function/impostor/secretCode");
const { addCredits } = require("../function/impostor/economy");

module.exports = {
  name: "redeem",
  description: "Klaim kode rahasia untuk mendapatkan kredit bonus",
  options: [
    {
      name: "kode",
      description: "Kode rahasia yang kamu temukan",
      type: 3, // STRING
      required: true,
    },
  ],

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const kode = interaction.options.getString("kode");
    const result = redeemCode(interaction.user.id, kode);

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

    const wallet = addCredits(interaction.user.id, result.reward);

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle("🎉 Kode Rahasia Berhasil Diklaim!")
          .setColor(0xf1c40f)
          .setDescription(`Kamu mendapatkan **${result.reward.toLocaleString()} kredit**!`)
          .addFields({
            name: "💳 Saldo Sekarang",
            value: wallet.credits.toLocaleString(),
            inline: true,
          })
          .setFooter({ text: "Kode ini sudah hangus dan tidak bisa dipakai lagi." }),
      ],
    });

    console.log(`[SecretCode] ${interaction.user.tag} redeemed a secret code (+${result.reward} credits)`);
  },
};
