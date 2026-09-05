const { EmbedBuilder } = require("discord.js");
const { gameManager } = require("../function/impostor/GameManager");
const { GameState } = require("../function/impostor/GameSession");
const { getAvailableTokens, consumeToken } = require("../function/impostor/instawin");
const { isDummyId } = require("../function/impostor/dummyPlayer");

// Role -> tim pemenang yang dipakai finalOutcome.winner di GameFlow.js
// (lihat didRoleWin di economy.js untuk pemetaan yang sama).
function winningTeamForRole(role) {
  if (role === "JOKER") return "JOKER";
  if (role === "SHERIFF") return "INNOCENT";
  return role; // "IMPOSTOR" | "INNOCENT"
}

module.exports = {
  name: "use-instawin",
  description: "Gunakan Instant Win Token untuk langsung memenangkan timmu di game yang sedang berjalan",
  options: [],

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const userId = interaction.user.id;

    const available = getAvailableTokens(userId);
    if (available <= 0) {
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle("Tidak Ada Token")
            .setColor(0xe74c3c)
            .setDescription("Kamu tidak punya Instant Win Token. Dapatkan lewat `/redeem-instawin`."),
        ],
      });
      return;
    }

    const session = gameManager.getActiveSessionForPlayer(userId);
    if (!session || isDummyId(userId)) {
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle("Tidak Sedang Bermain")
            .setColor(0xe74c3c)
            .setDescription("Kamu harus sedang berada di dalam game yang berjalan untuk memakai token ini."),
        ],
      });
      return;
    }

    const usableStates = [GameState.DISCUSSION, GameState.VOTING];
    if (!usableStates.includes(session.state)) {
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle("Belum Bisa Dipakai")
            .setColor(0xe74c3c)
            .setDescription("Token hanya bisa dipakai saat game sedang berlangsung (fase diskusi atau voting)."),
        ],
      });
      return;
    }

    const role = session.roles.get(userId) || "INNOCENT";
    const winnerTeam = winningTeamForRole(role);

    const triggered = session.triggerForceWin(winnerTeam, userId);
    if (!triggered) {
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle("Gagal Dipakai")
            .setColor(0xe74c3c)
            .setDescription("Game sedang dalam proses transisi fase, coba lagi sesaat lagi."),
        ],
      });
      return;
    }

    // Baru consume token SETELAH triggerForceWin berhasil, supaya kalau
    // gagal (misal race di atas) token tidak hilang percuma.
    consumeToken(userId);

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle("👑 Instant Win Token Digunakan!")
          .setColor(0xf1c40f)
          .setDescription(
            `Kamu memakai token dan langsung memenangkan game untuk timmu (**${winnerTeam}**)!\n\n` +
            "Token ini sudah habis terpakai. Cek channel game untuk hasil resminya."
          ),
      ],
    });

    console.log(`[Instawin] ${interaction.user.tag} used Instant Win Token in session ${session.gameId} (team: ${winnerTeam})`);
  },
};
