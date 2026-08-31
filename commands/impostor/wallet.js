const { getOrCreateWallet } = require("../../function/impostor/economy");
const { renderWalletCard } = require("../../function/impostor/economyCardRenderer");

module.exports = {
    name: "wallet",
    description: "Lihat saldo kredit impostor game kamu",
    options: [
        {
            name: "user",
            description: "Lihat wallet user lain (opsional)",
            type: 6,
            required: false,
        },
    ],
    cooldown: 3000,

    async execute(interaction) {
        await interaction.deferReply();

        const target = interaction.options.getUser("user") || interaction.user;

        try {
            const wallet = await getOrCreateWallet(target.id);
            const credits = Number(wallet.credits);
            const winRate = wallet.total_games > 0
                ? Math.round((wallet.total_wins / wallet.total_games) * 100)
                : 0;

            const image = await renderWalletCard({
                username: target.username,
                credits,
                totalGames: wallet.total_games,
                totalWins: wallet.total_wins,
                winRate,
            });

            await interaction.editReply({
                files: [{ attachment: image, name: "wallet.png" }],
            });
        } catch (err) {
            console.error("[Impostor] wallet error:", err);
            await interaction.editReply({ content: "Gagal mengambil data wallet." });
        }
    },
};