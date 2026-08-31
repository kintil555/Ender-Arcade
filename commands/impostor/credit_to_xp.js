const { EmbedBuilder } = require("discord.js");
const { convertCreditsToXP, getOrCreateWallet, XP_PER_CREDIT } = require("../../function/impostor/economy");

// NOTE: Standalone build — Neo Dragon's level_tb/add_xp role system is not
// wired in here since it's Neo-Dragon-specific. This command just deducts
// credits and reports the XP-equivalent value; hook up add_xp() again once
// this file is copied back into the Neo Dragon project.
module.exports = {
    name: "credit_to_xp",
    description: "Tukar kredit impostor menjadi XP (standalone: hanya deduksi kredit)",
    options: [
        {
            name: "amount",
            description: "Jumlah kredit yang ingin ditukar",
            type: 4, // INTEGER
            required: true,
            min_value: 1,
        },
    ],
    cooldown: 5000,

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const amount = interaction.options.getInteger("amount");
        const userId = interaction.user.id;

        if (amount < 1) {
            await interaction.editReply({ content: "Jumlah kredit minimal 1." });
            return;
        }

        try {
            const wallet = await getOrCreateWallet(userId);
            const currentCredits = Number(wallet.credits);

            if (currentCredits < amount) {
                await interaction.editReply({
                    content: `Kredit tidak cukup. Saldo kamu: **${currentCredits.toLocaleString()} kredit**.`,
                });
                return;
            }

            const result = await convertCreditsToXP(userId, amount);
            if (!result) {
                await interaction.editReply({ content: "Konversi gagal. Coba lagi." });
                return;
            }

            const newBalance = Number(result.newBalance);

            const embed = new EmbedBuilder()
                .setTitle("✅ Konversi Kredit Berhasil (standalone mode)")
                .setColor(0x57f287)
                .addFields(
                    { name: "💳 Kredit Dipakai", value: `**${result.creditsSpent.toLocaleString()}**`, inline: true },
                    { name: "⭐ XP Setara", value: `**+${result.xpGained.toLocaleString()}**`, inline: true },
                    { name: "💰 Sisa Kredit", value: `**${newBalance.toLocaleString()}**`, inline: true },
                )
                .setFooter({ text: `Rate: 1 kredit = ${XP_PER_CREDIT} XP | XP belum di-apply ke level system (Neo Dragon only)` });

            await interaction.editReply({ embeds: [embed] });
        } catch (err) {
            console.error("[Impostor] credit_to_xp error:", err);
            await interaction.editReply({ content: "Terjadi kesalahan saat konversi." });
        }
    },
};
