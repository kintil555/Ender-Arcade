const { gameManager } = require("./GameManager");
const { GameState } = require("./GameSession");
const { buildTurnModal, buildRoundEmbed, buildRoundButton, buildResultEmbed } = require("./embeds");
const { destroyStoryGameRoom } = require("./gameRoom");

/** Handles the "✏️ Isi Giliran" button — opens the fill-in-turn modal. */
async function handleSubmitTurnButton(interaction) {
  const session = gameManager.getSessionByGameMessage(interaction.message.id);
  if (!session || session.state !== GameState.IN_PROGRESS) {
    await interaction.reply({ content: "Game ini sudah tidak aktif.", ephemeral: true });
    return;
  }
  if (!session.isPlayer(interaction.user.id)) {
    await interaction.reply({ content: "Kamu bukan pemain di game ini.", ephemeral: true });
    return;
  }
  if (session.hasSubmitted(interaction.user.id)) {
    await interaction.reply({ content: "Kamu sudah mengisi giliran ronde ini. Tunggu pemain lain.", ephemeral: true });
    return;
  }

  const modal = buildTurnModal(session, interaction.user.id);
  await interaction.showModal(modal);
}

/** Handles modal submission — records the turn, advances round if needed. */
async function handleTurnModalSubmit(interaction) {
  const gameId = interaction.customId.replace("story_modal_", "");
  const session = gameManager.getSession(gameId);
  if (!session || session.state !== GameState.IN_PROGRESS) {
    await interaction.reply({ content: "Game ini sudah tidak aktif.", ephemeral: true });
    return;
  }
  if (session.hasSubmitted(interaction.user.id)) {
    await interaction.reply({ content: "Kamu sudah mengisi giliran ronde ini.", ephemeral: true });
    return;
  }

  const text = interaction.fields.getTextInputValue("story_input");
  const ok = session.submitTurn(interaction.user.id, text);
  if (!ok) {
    await interaction.reply({ content: "Gagal menyimpan giliranmu. Coba lagi.", ephemeral: true });
    return;
  }

  await interaction.reply({ content: "✅ Giliranmu tersimpan!", ephemeral: true });

  if (!session.allSubmittedThisRound()) {
    await refreshRoundMessage(interaction, session);
    return;
  }

  // Everyone has submitted this round — advance.
  const finished = session.nextRound();
  if (finished) {
    await finishGame(interaction, session);
  } else {
    await refreshRoundMessage(interaction, session, true);
  }
}

async function refreshRoundMessage(interaction, session, isNewRound = false) {
  if (!session.channelId) return;
  try {
    const channel = await interaction.guild.channels.fetch(session.channelId).catch(() => null);
    if (!channel || !session.gameMessageId) return;
    const msg = await channel.messages.fetch(session.gameMessageId).catch(() => null);
    if (!msg) return;
    await msg.edit({
      embeds: [buildRoundEmbed(session)],
      components: [buildRoundButton(false)],
    }).catch(() => {});
    if (isNewRound) {
      const mentions = session.playerIds.map((id) => `<@${id}>`).join(" ");
      await channel.send(`🔔 Ronde ${session.currentRound}/${session.totalRounds} dimulai! ${mentions}`).catch(() => {});
    }
  } catch { /**/ }
}

async function finishGame(interaction, session) {
  if (!session.channelId) return;
  try {
    const channel = await interaction.guild.channels.fetch(session.channelId).catch(() => null);
    if (channel) {
      if (session.gameMessageId) {
        const msg = await channel.messages.fetch(session.gameMessageId).catch(() => null);
        if (msg) await msg.edit({ components: [buildRoundButton(true)] }).catch(() => {});
      }
      await channel.send({ embeds: [buildResultEmbed(session)] }).catch(() => {});
      await channel.send("🎉 Game selesai! Channel ini akan dihapus dalam 30 detik.").catch(() => {});
    }
  } catch (err) {
    console.error("[StoryGame] Failed to post result:", err);
  }

  setTimeout(async () => {
    try {
      await destroyStoryGameRoom(interaction.guild, {
        categoryId: session.categoryId,
        channelId: session.channelId,
      });
    } catch (err) {
      console.error("[StoryGame] Failed to cleanup room:", err);
    } finally {
      gameManager.destroySession(session.gameId);
    }
  }, 30_000);
}

module.exports = { handleSubmitTurnButton, handleTurnModalSubmit };
