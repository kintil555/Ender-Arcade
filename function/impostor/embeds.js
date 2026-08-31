const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
} = require("discord.js");
const { mentionOrLabel } = require("./dummyPlayer");

const COLOR_LOBBY = 0x5865f2;
const COLOR_ROOM = 0x57f287;
const COLOR_DISCUSSION = 0xfee75c;
const COLOR_VOTING = 0xeb459e;
const COLOR_WIN = 0x57f287;
const COLOR_LOSE = 0xed4245;

function buildLobbyEmbed(session, minPlayers, maxPlayers) {
  const playerLines = session.playerIds.map((id) => mentionOrLabel(id)).join("\n") || "_No players yet_";
  const fields = [
    { name: "Host", value: `<@${session.hostId}>`, inline: true },
    { name: "Players", value: `${session.playerIds.length}/${maxPlayers}`, inline: true },
    { name: "\u200b", value: "\u200b", inline: true },
    { name: "Player List", value: playerLines },
    { name: "Rules", value: `Minimum: ${minPlayers} players\nMaximum: ${maxPlayers} players` },
  ];

  // Live countdown to auto-close if the lobby stays idle. Uses Discord's
  // own <t:...:R> relative timestamp so it ticks in real time client-side
  // without the bot needing to re-edit the message every second.
  if (session._lobbyExpiresAt) {
    const unix = Math.floor(session._lobbyExpiresAt / 1000);
    fields.push({
      name: "⏱️ Auto-close",
      value: `Lobby akan ditutup otomatis <t:${unix}:R> jika tidak ada aktivitas.`,
    });
  }

  return new EmbedBuilder()
    .setTitle("🎭 WHO IS THE IMPOSTOR?")
    .setColor(COLOR_LOBBY)
    .addFields(fields)
    .setFooter({ text: `Game ID: ${session.gameId}` });
}

function buildLobbyButtons(disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("imp_lobby_join").setLabel("Join").setStyle(ButtonStyle.Success).setDisabled(disabled),
    new ButtonBuilder().setCustomId("imp_lobby_leave").setLabel("Leave").setStyle(ButtonStyle.Danger).setDisabled(disabled),
    new ButtonBuilder().setCustomId("imp_lobby_start").setLabel("Open Game").setStyle(ButtonStyle.Primary).setDisabled(disabled)
  );
}

function buildRoomCreatedEmbed(session) {
  const mentions = session.playerIds.map((id) => mentionOrLabel(id)).join(" ");
  return {
    content: mentions,
    embeds: [
      new EmbedBuilder()
        .setTitle("🎮 Game Room Created!")
        .setColor(COLOR_ROOM)
        .setDescription(
          "Silakan masuk ke channel ini.\n\n" +
          "Game belum dimulai.\nHost harus menjalankan `!startgame`."
        ),
    ],
  };
}

function buildRoleDM({ role, theme, object, teammateIds }) {
  const isImpostor = role === "IMPOSTOR";
  const isJoker = role === "JOKER";
  const isSheriff = role === "SHERIFF";

  const roleColor = isImpostor ? COLOR_LOSE : isJoker ? 0xf1c40f : isSheriff ? 0x3498db : COLOR_ROOM;

  const embed = new EmbedBuilder()
    .setTitle("🎭 WHO IS THE IMPOSTOR?")
    .setColor(roleColor)
    .addFields(
      { name: "Role", value: role, inline: true },
      { name: "Theme", value: theme, inline: true },
      { name: "Object", value: object, inline: true }
    )
    .setFooter({ text: "Don't say this object's name out loud in the game room!" });

  if (isImpostor && teammateIds && teammateIds.length > 0) {
    embed.addFields({
      name: "🤝 Rekan Impostor",
      value: teammateIds.map((id) => mentionOrLabel(id)).join(", "),
    });
    embed.addFields({
      name: "💬 Chat Rahasia Sesama Impostor",
      value: "Kirim `!c <pesan>` di sini (DM ini) untuk berbicara diam-diam dengan rekan impostormu. Pesan tidak akan terlihat oleh innocent.",
    });
  }

  if (isJoker) {
    embed.addFields({
      name: "🃏 Cara Menang",
      value: "Kamu menang jika kamu yang di-vote keluar! Buat semua orang curiga dan vote kamu, tapi jangan sampai ketahuan bahwa itu tujuanmu.",
    });
  }

  if (isSheriff) {
    embed.addFields({
      name: "🔫 Kemampuan Sheriff",
      value: "Kamu bisa menembak mati satu pemain. Saat voting dimulai, kamu akan diberi pilihan: **Vote** (ikut vote seperti biasa) atau **Nembak** (vote berjalan tanpa kamu, lalu kamu pilih target tembak). Tembak impostor = innocent menang. Salah tembak = kamu gugur dan impostor menang.",
    });
  }

  return embed;
}

function buildDiscussionEmbed(theme) {
  return new EmbedBuilder()
    .setTitle("🎤 DISCUSSION PHASE")
    .setColor(COLOR_DISCUSSION)
    .setDescription(
      `**Theme: ${theme}**\n\n` +
      "Deskripsikan objek kalian tanpa menyebut nama objek secara langsung.\n\n" +
      "Diskusikan dan cari tahu siapa yang kemungkinan menjadi impostor. Ketika siap, gunakan tombol di bawah untuk membuka voting."
    );
}

function buildOpenVotingButton() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("imp_open_voting")
      .setLabel("Open Voting")
      .setEmoji("🗳️")
      .setStyle(ButtonStyle.Primary)
  );
}

function buildVotingEmbed(session, alivePlayerIds, votesMap, eligibleTargets) {
  const pending = alivePlayerIds.filter((id) => !votesMap.has(id));
  const pendingText = pending.length > 0 ? pending.map((id) => mentionOrLabel(id)).join("\n") : "_Everyone voted!_";
  const roundLabel = session.voteRound > 1 ? ` (Revote — Round ${session.voteRound})` : "";

  const embed = new EmbedBuilder()
    .setTitle(`🗳️ VOTING${roundLabel}`)
    .setColor(COLOR_VOTING)
    .addFields(
      { name: "Votes", value: `${votesMap.size}/${alivePlayerIds.length}` },
      { name: "Waiting for", value: pendingText }
    );

  if (eligibleTargets) {
    embed.addFields({ name: "Revote candidates", value: eligibleTargets.map((id) => mentionOrLabel(id)).join(", ") });
  }

  return embed;
}

function buildVoteSelectMenuWithLabels(candidates, customId) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder("Select a player to vote out")
      .addOptions(candidates.map((c) => ({ label: c.label, value: c.id })))
  );
}

function buildVoteResultsEmbed({ tally, mostVotedId, verdictText, isImpostorFound }) {
  const lines = [...tally.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id, count]) => `${mentionOrLabel(id)} — ${count} vote${count === 1 ? "" : "s"}`)
    .join("\n");

  const embed = new EmbedBuilder()
    .setTitle("🗳️ VOTING RESULTS")
    .setColor(isImpostorFound ? COLOR_WIN : COLOR_LOSE)
    .setDescription(lines || "_No votes were cast._");

  if (mostVotedId) embed.addFields({ name: "Most voted", value: mentionOrLabel(mostVotedId) });
  embed.addFields({ name: "\u200b", value: verdictText });

  return embed;
}

function buildGameEndEmbed({ won, impostorIds, reason }) {
  const impostorMentions = impostorIds.map((id) => mentionOrLabel(id)).join(", ") || "_none_";
  const title = won === "INNOCENT" ? "🏆 INNOCENTS WIN!" : won === "JOKER" ? "🃏 JOKER WINS!" : "🎭 IMPOSTORS WIN!";
  const color = won === "INNOCENT" ? COLOR_WIN : won === "JOKER" ? 0xf1c40f : COLOR_LOSE;
  return new EmbedBuilder()
    .setTitle(title)
    .setColor(color)
    .setDescription(reason)
    .addFields({ name: "Impostor(s) was/were", value: impostorMentions })
    .setFooter({ text: "This room will be deleted in 10 seconds." });
}

function buildRewardEmbed(rewards, winner) {
  const roleLabels = { IMPOSTOR: "Impostor", INNOCENT: "Innocent", JOKER: "Joker", SHERIFF: "Sheriff" };
  const lines = [];
  for (const [playerId, info] of rewards.entries()) {
    const icon = info.won ? "🏆" : "📉";
    const roleLabel = roleLabels[info.role] || info.role;
    const status = info.error ? " _(gagal)_" : "";
    lines.push(`${icon} ${mentionOrLabel(playerId)} [${roleLabel}] — **+${info.credits} kredit**${status}`);
  }

  return new EmbedBuilder()
    .setTitle("💰 Hadiah Kredit Game")
    .setColor(winner === "INNOCENT" ? 0x57f287 : winner === "JOKER" ? 0xf1c40f : 0xed4245)
    .setDescription(lines.join("\n") || "_Tidak ada pemain_")
    .setFooter({ text: "Gunakan /credit_to_xp untuk tukar kredit → XP" });
}

function buildSheriffChoiceEmbed(sheriffId, timeoutSeconds) {
  return new EmbedBuilder()
    .setTitle("🔫 Giliran Sheriff!")
    .setColor(0x3498db)
    .setDescription(
      `${mentionOrLabel(sheriffId)} adalah Sheriff. Waktunya memilih:\n\n` +
      "🗳️ **Vote** — ikut voting seperti pemain biasa.\n" +
      "🔫 **Nembak** — tidak ikut vote, tapi setelah hasil vote keluar kamu akan diberi kesempatan menembak mati satu pemain.\n\n" +
      `Pemain lain silakan diskusi dulu untuk menyarankan siapa yang layak ditembak Sheriff.\n\nWaktu memilih: ${timeoutSeconds} detik.`
    );
}

function buildSheriffChoiceButtons(disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("imp_sheriff_vote").setLabel("Vote").setStyle(ButtonStyle.Primary).setDisabled(disabled),
    new ButtonBuilder().setCustomId("imp_sheriff_shoot").setLabel("Nembak").setStyle(ButtonStyle.Danger).setDisabled(disabled)
  );
}

function buildSheriffShootEmbed(candidates, secondsLeft) {
  return new EmbedBuilder()
    .setTitle("🔫 Sheriff: Pilih Target Tembak")
    .setColor(0x3498db)
    .setDescription(
      `Pilih satu pemain untuk ditembak dari daftar di bawah.\n\n⏳ Sisa waktu: **${secondsLeft} detik**`
    );
}

function buildSheriffShootSelectMenu(candidates) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("imp_sheriff_shoot_select")
      .setPlaceholder("Pilih target tembak")
      .addOptions(candidates.map((c) => ({ label: c.label, value: c.id })))
  );
}

function buildSheriffResultEmbed({ targetId, wasImpostor }) {
  return new EmbedBuilder()
    .setTitle(wasImpostor ? "🎯 TEMBAKAN TEPAT SASARAN!" : "💥 TEMBAKAN MELESET!")
    .setColor(wasImpostor ? COLOR_WIN : COLOR_LOSE)
    .setDescription(
      wasImpostor
        ? `Sheriff menembak ${mentionOrLabel(targetId)} — dan benar, dia **IMPOSTOR**! 🎉`
        : `Sheriff menembak ${mentionOrLabel(targetId)} — ternyata dia **bukan impostor**. Sheriff gugur akibat salah tembak.`
    );
}

/**
 * Guide embed posted by /setupgame in the designated game channel.
 * IMPORTANT: every line here must match how the bot's actual code works —
 * this is not free-form marketing copy. Verified against GameFlow.js,
 * lobbyHandler.js, embeds.js (Sheriff/vote button+select-menu builders),
 * economy.js and the wallet/credit_to_xp/leaderboard/status commands
 * before writing this, since an earlier draft copied stale text from an
 * old screenshot that no longer matched the code (e.g. it claimed !vote
 * @user and !shoot @user were text commands, and invented !claim/!balance/
 * !exchange and a win-streak bonus that don't exist anywhere in the bot).
 */
function buildGameChannelGuideEmbed(minPlayers, maxPlayers) {
  return new EmbedBuilder()
    .setTitle("🎭 Who is the Impostor?")
    .setColor(COLOR_LOBBY)
    .setDescription("Selamat datang di channel game **Who is the Impostor**!")
    .addFields(
      {
        name: "📖 Cara Bermain:",
        value:
          "1. Tekan tombol **🎮 Open Game** di bawah untuk membuka lobby baru\n" +
          "2. Pemain lain tekan **Join** untuk ikut bermain (tombol **Leave** untuk keluar lagi sebelum game dimulai)\n" +
          "3. Host tekan tombol **Open Game** di lobby → bot buat **private room** khusus pemain\n" +
          "4. Di private room, host ketik `!startgame` (atau `/startgame`) → setiap pemain dapat **tema rahasia** via DM\n" +
          "5. Bergiliran tulis clue tentang temamu (tanpa sebut nama tema langsung)\n" +
          "6. Host ketik `!vote` (atau `/vote`) untuk membuka voting → setiap pemain pilih tersangka lewat **menu dropdown** yang muncul\n" +
          "7. Kalau ada **Sheriff**, dia akan diberi **tombol Vote/Nembak**; kalau pilih Nembak, ada **menu dropdown** untuk pilih target setelah hasil vote\n" +
          "8. Hasil diumumkan, kredit dibagikan & room otomatis tutup",
      },
      {
        name: "⏱️ Lobby Tidak Aktif:",
        value:
          "Lobby yang dibuka lewat **Open Game** otomatis **ditutup** kalau tidak ada aktivitas (Join/Leave/mulai game) selama **60 detik**\n" +
          "Embed lobby menampilkan hitung mundur real-time sebelum lobby ditutup\n" +
          "Semua pemain yang sempat join akan dapat **DM pemberitahuan** kalau lobby ditutup otomatis",
      },
      {
        name: "🎭 Role Spesial:",
        value:
          "🎭 **Impostor** — Bisa lebih dari 1 (tergantung jumlah pemain), saling sengkongkol lewat DM `!c <pesan>` ke bot (bukan chat di channel — pesan ini di-relay bot ke sesama impostor yang masih hidup lewat DM)\n" +
          "🕵️ **Sheriff** — Bisa pilih **Nembak** (tombol) lalu pilih target dari dropdown. Benar = innocent menang, salah = Sheriff gugur\n" +
          "🃏 **Joker** — Menang sendirian kalau berhasil dituduh lewat vote!",
      },
      {
        name: "🏆 Cara Menang:",
        value:
          "**Innocent & Sheriff** menang jika impostor berhasil dituduh\n" +
          "**Joker** menang sendiri jika dia yang dituduh\n" +
          "**Impostor** menang jika salah dituduh, atau hasil vote seri",
      },
      {
        name: "💰 Sistem Kredit:",
        value:
          "Menang game → dapat kredit, kalah tetap dapat kredit lebih kecil (lihat `/wallet` untuk jumlah pasti)\n" +
          "`/wallet` — Cek saldo kredit & statistik kamu\n" +
          "`/credit_to_xp <jumlah>` — Tukar kredit jadi XP\n" +
          "`/leaderboard` — Lihat 10 besar kredit terbanyak",
      },
      { name: "⚠️ Penting:", value: `Game hanya bisa dibuka lewat tombol di channel ini (min ${minPlayers}, maks ${maxPlayers} pemain). Command \`/opengame\` di channel lain akan ditolak dan pesan dihapus.` }
    );
}

/** Persistent button posted below the guide embed — pressing it opens a lobby, same as /opengame. */
function buildGameChannelTriggerButton() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("imp_channel_opengame").setLabel("🎮 Open Game").setStyle(ButtonStyle.Success)
  );
}

module.exports = {
  buildLobbyEmbed,
  buildLobbyButtons,
  buildRoomCreatedEmbed,
  buildRoleDM,
  buildDiscussionEmbed,
  buildOpenVotingButton,
  buildVotingEmbed,
  buildVoteSelectMenuWithLabels,
  buildVoteResultsEmbed,
  buildGameEndEmbed,
  buildRewardEmbed,
  buildSheriffChoiceEmbed,
  buildSheriffChoiceButtons,
  buildSheriffShootEmbed,
  buildSheriffShootSelectMenu,
  buildSheriffResultEmbed,
  buildGameChannelGuideEmbed,
  buildGameChannelTriggerButton,
};