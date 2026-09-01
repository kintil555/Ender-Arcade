const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");
const { MAX_CHARS_PER_TURN } = require("./GameSession");

const COLOR_LOBBY = 0x5865f2;
const COLOR_PLAYING = 0x57f287;
const COLOR_DONE = 0xf1c40f;

const STORY_LABELS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];

function storyLabel(idx) { return STORY_LABELS[idx] || `#${idx + 1}`; }

function buildLobbyEmbed(session, minPlayers, maxPlayers) {
  const playerLines = session.playerIds.map((id) => `<@${id}>`).join("\n") || "_Belum ada pemain_";
  return new EmbedBuilder()
    .setTitle("📝 SAMBUNG KATA")
    .setColor(COLOR_LOBBY)
    .setDescription(
      "Setiap pemain membangun kalimat bersama secara bergiliran (maks " +
      `${MAX_CHARS_PER_TURN} karakter per giliran).`
    )
    .addFields(
      { name: "Host", value: `<@${session.hostId}>`, inline: true },
      { name: "Pemain", value: `${session.playerIds.length}/${maxPlayers}`, inline: true },
      { name: "Ronde", value: `${session.totalRounds}`, inline: true },
      { name: "Player List", value: playerLines }
    )
    .setFooter({ text: `Game ID: ${session.gameId} | Min ${minPlayers} pemain` });
}

function buildLobbyButtons(disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("story_lobby_join").setLabel("Join").setStyle(ButtonStyle.Success).setDisabled(disabled),
    new ButtonBuilder().setCustomId("story_lobby_leave").setLabel("Leave").setStyle(ButtonStyle.Danger).setDisabled(disabled),
    new ButtonBuilder().setCustomId("story_lobby_start").setLabel("Mulai Game").setStyle(ButtonStyle.Primary).setDisabled(disabled)
  );
}

function buildRoundEmbed(session) {
  const lines = session.playerIds.map((id) => {
    const done = session.hasSubmitted(id);
    return `${done ? "✅" : "⌛"} <@${id}> → Cerita ${storyLabel(session.storyIndexFor(id))}`;
  });

  return new EmbedBuilder()
    .setTitle(`📝 SAMBUNG KATA — Ronde ${session.currentRound}/${session.totalRounds}`)
    .setColor(COLOR_PLAYING)
    .setDescription(
      "Klik tombol di bawah untuk mengisi giliranmu.\n" +
      `Maks ${MAX_CHARS_PER_TURN} karakter, lanjutkan kalimat yang sudah ada.`
    )
    .addFields({ name: "Status Giliran", value: lines.join("\n") })
    .setFooter({ text: `Game ID: ${session.gameId}` });
}

function buildRoundButton(disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("story_submit_turn")
      .setLabel("✏️ Isi Giliran")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled)
  );
}

function buildTurnModal(session, userId) {
  const storyIdx = session.storyIndexFor(userId);
  const currentText = session.stories[storyIdx].join(" ") || "_(kalimat baru, mulai dari sini)_";

  const modal = new ModalBuilder()
    .setCustomId(`story_modal_${session.gameId}`)
    .setTitle(`Cerita ${storyLabel(storyIdx)} — Ronde ${session.currentRound}`);

  const input = new TextInputBuilder()
    .setCustomId("story_input")
    .setLabel(`Lanjutkan (maks ${MAX_CHARS_PER_TURN} karakter)`)
    .setStyle(TextInputStyle.Short)
    .setMaxLength(MAX_CHARS_PER_TURN)
    .setPlaceholder(currentText.slice(0, 100))
    .setRequired(true);

  modal.addComponents(new ActionRowBuilder().addComponents(input));
  return modal;
}

function buildResultEmbed(session) {
  const embed = new EmbedBuilder()
    .setTitle("📝 SAMBUNG KATA — Selesai!")
    .setColor(COLOR_DONE)
    .setFooter({ text: `Game ID: ${session.gameId}` });

  session.stories.forEach((segments, idx) => {
    embed.addFields({
      name: `Cerita ${storyLabel(idx)}`,
      value: segments.join(" ") || "_(kosong)_",
    });
  });

  return embed;
}

module.exports = {
  buildLobbyEmbed,
  buildLobbyButtons,
  buildRoundEmbed,
  buildRoundButton,
  buildTurnModal,
  buildResultEmbed,
  storyLabel,
};
