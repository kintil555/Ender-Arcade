const { getTopWallets } = require("../../function/impostor/economy");
const { prepareLeaderboardRows, renderLeaderboardCard } = require("../../function/impostor/economyCardRenderer");

module.exports = {
    name: "leaderboard",
    description: "Lihat leaderboard kredit impostor game",
    options: [],
    cooldown: 5000,

    async execute(interaction) {
        await interaction.deferReply();

        try {
            const top = getTopWallets(10);

            if (!top || top.length === 0) {
                await interaction.editReply({ content: "Belum ada data economy impostor." });
                return;
            }

            const rows = await prepareLeaderboardRows(interaction, top);
            const image = await renderLeaderboardCard({ rows });

            await interaction.editReply({
                files: [{ attachment: image, name: "leaderboard.png" }],
            });
        } catch (err) {
            console.error("[Impostor] leaderboard error:", err);
            await interaction.editReply({ content: "Gagal mengambil data leaderboard." });
        }
    },
};