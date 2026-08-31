const { GameState } = require("../../function/impostor/GameSession");

module.exports = {
  name: "vote",
  description: "[Host] Mulai sesi voting untuk game impostor yang sedang diskusi",
  options: [],
  cooldown: 2000,

  async execute(interaction) {
    // vote is triggered lazily via require() to avoid a require cycle with
    // GameManager -> GameFlow -> ... during module load.
    const { gameManager } = require("../../function/impostor/GameManager");
    const session = gameManager.getSessionByChannel(interaction.channelId);

    if (!session) {
      await interaction.reply({ content: "Tidak ada game impostor aktif di channel ini.", ephemeral: true });
      return;
    }
    if (!session.isHost(interaction.user.id)) {
      await interaction.reply({ content: "Hanya Host yang dapat memulai voting.", ephemeral: true });
      return;
    }
    if (session.state !== GameState.DISCUSSION) {
      await interaction.reply({ content: "Voting hanya dapat dimulai saat sesi diskusi berlangsung.", ephemeral: true });
      return;
    }

    const triggered = session.triggerVote();
    if (triggered) {
      await interaction.reply({ content: "🗳️ Voting dimulai oleh Host!", ephemeral: false });
    } else {
      await interaction.reply({ content: "Voting sudah dimulai atau tidak dapat dipicu saat ini.", ephemeral: true });
    }
  },
};
