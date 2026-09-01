const { EmbedBuilder } = require("discord.js");
const { convertCreditsToXP, addCredits, getOrCreateWallet, XP_PER_CREDIT } = require("../../function/impostor/economy");
const add_xp = require("../../function/impostor/add_xp");

// Wired to Neo Dragon Sentinel's level_tb via the shared MySQL connection
// (see models/imp_level_tb.js + function/impostor/add_xp.js). XP given
// here is applied for real and shows up in Neo Dragon's /level, /rank,
// and leaderboard immediately — this is no longer a simulated conversion.
module.exports = {
    name: "credit_to_xp",
    description: "Tukar kredit impostor menjadi XP",
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

            // Apply the XP for real to Neo Dragon's level_tb. If this fails
            // (e.g. MySQL down), refund the credits already deducted above
            // so the user never loses credits without receiving XP.
            const xpResult = await add_xp(interaction.member ?? interaction.user, result.xpGained, interaction.client);
            if (!xpResult) {
                addCredits(userId, result.creditsSpent);
                await interaction.editReply({
                    content: "Gagal menerapkan XP ke sistem level (koneksi database bermasalah). Kredit kamu sudah dikembalikan — coba lagi nanti.",
                });
                return;
            }

            const newBalance = Number(result.newBalance);

            const embed = new EmbedBuilder()
                .setTitle("✅ Konversi Kredit Berhasil")
                .setColor(0x57f287)
                .addFields(
                    { name: "💳 Kredit Dipakai", value: `**${result.creditsSpent.toLocaleString()}**`, inline: true },
                    { name: "⭐ XP Didapat", value: `**+${result.xpGained.toLocaleString()}**`, inline: true },
                    { name: "💰 Sisa Kredit", value: `**${newBalance.toLocaleString()}**`, inline: true },
                );

            if (xpResult.leveledUp) {
                embed.addFields({
                    name: "🎉 Level Up!",
                    value: `Level ${xpResult.previousLevel} → **${xpResult.user_level_data.level}**`,
                });
            }

            embed.setFooter({ text: `Rate: 1 kredit = ${XP_PER_CREDIT} XP` });

            await interaction.editReply({ embeds: [embed] });
        } catch (err) {
            console.error("[Impostor] credit_to_xp error:", err);
            await interaction.editReply({ content: "Terjadi kesalahan saat konversi." });
        }
    },
};
