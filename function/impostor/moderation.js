const { EmbedBuilder } = require("discord.js");
const CrimeNote = require("../../models/imp_crime_note_tb");

/**
 * Ported from NEO-Dragon-Sentinel's commands/warn.js (giveWarn function).
 * Kept as close to the original logic as possible — same escalation rule
 * (2nd active warn -> timeout if a duration is given, 3rd -> ban) — so
 * behavior matches what admins on Neo Dragon are already used to.
 *
 * Runs against this standalone bot's OWN crime_note_members_tb (see
 * models/imp_crime_note_tb.js) for now. See docs/NEO_DRAGON_MERGE.md for
 * how a Neo Dragon admin can point this at the shared DB instead later.
 *
 * @param {import("discord.js").GuildMember} params.target
 * @param {string} params.reason
 * @param {string|import("discord.js").User} params.moderator
 * @param {string} params.guildId
 * @param {number} [params.timeoutDuration] - ms, 0/omitted = no timeout
 */
async function giveWarn({ target, reason, moderator, guildId, timeoutDuration = 0 }) {
  if (!target) {
    throw new Error("Target tidak ditemukan.");
  }

  const previousNotesCount = await CrimeNote.count({
    where: { username_id: target.id, status: "active" },
  }) + 1; // +1 untuk warn yang akan diberikan sekarang

  if (previousNotesCount === 2 && timeoutDuration > 0) {
    await target.timeout(timeoutDuration, reason).catch(console.error);
  } else if (previousNotesCount >= 3) {
    await target.ban({ reason: "Melewati batas warn aktif (3)" }).catch(console.error);
  }

  await CrimeNote.create({
    username_id: target.id,
    reason,
    date: new Date(),
    status: "active",
  });

  const moderatorName =
    typeof moderator === "string" ? moderator : moderator?.tag ?? moderator?.user?.tag ?? "Sistem Bot";

  const warnEmbed = new EmbedBuilder()
    .setTitle("⚠️ Peringatan")
    .setDescription(`Kamu terkena peringatan ke: ${previousNotesCount}`)
    .addFields(
      { name: "Alasan:", value: reason, inline: true },
      { name: "Oleh:", value: moderatorName, inline: true }
    )
    .setColor("#FF0000")
    .setFooter({ text: "Who Is The Impostor — sistem warn sama dengan Neo Dragon Sentinel" });

  try {
    await target.send({ embeds: [warnEmbed] });
  } catch (err) {
    console.error("[Impostor] Error sending warn DM to user:", err);
  }

  return { totalWarn: previousNotesCount };
}

module.exports = { giveWarn };
