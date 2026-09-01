const { ComponentType } = require("discord.js");
const { GameState } = require("./GameSession");
const { assignRoles } = require("./RoleManager");
const { generateThemePair } = require("./ThemeGenerator");
const { tallyVotes, resolveVoteWinners, isVotingComplete } = require("./VotingManager");
const { gameManager } = require("./GameManager");
const {
  buildRoleDM,
  buildDiscussionEmbed,
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
} = require("./embeds");
const { destroyGameRoom } = require("./gameRoom");
const { saveSession } = require("./sessionPersistence");
const { distributeGameRewards, CREDIT_WIN, CREDIT_LOSE } = require("./economy");
const { isDummyId, mentionOrLabel, dummyLabel } = require("./dummyPlayer");
const { generateResultCard } = require("./resultCardGenerator");
const env = require("../../config/env");

const VOTE_RESULT_DELAY_MS = env.VOTE_RESULT_DELAY_MS;
const CLEANUP_DELAY_MS = env.CLEANUP_DELAY_MS;
const VOTING_COLLECTOR_TIMEOUT_MS = 5 * 60 * 1000;
const SHERIFF_CHOICE_TIMEOUT_MS = 5 * 60 * 1000; // no hard rush — players are told to discuss first
const SHERIFF_SHOOT_TIMEOUT_MS = 15 * 1000;

/**
 * Sends the game result to every player who was in the session, via DM.
 * Replaces the old behavior of posting results into the private game
 * channel (which gets deleted right after anyway). Silently skips any
 * player whose DMs are closed/blocked — doesn't fail the whole game
 * over one player's DM settings.
 */
async function sendResultToPlayers(client, session, payload) {
  const realPlayerIds = session.playerIds.filter((id) => !isDummyId(id));
  await Promise.all(realPlayerIds.map(async (userId) => {
    try {
      const user = await client.users.fetch(userId);
      await user.send(payload);
    } catch (err) {
      console.warn(`[Impostor] Could not DM result to ${userId}: ${err.message}`);
    }
  }));
}

/**
 * Sends a copy of the game result (image or fallback embeds) to a
 * permanent log channel, if RESULT_LOG_CHANNEL_ID is configured. This is
 * separate from the temporary gameChannel, which gets deleted after
 * cleanupGame — without this, results would be lost once the room closes.
 * Silently no-ops if unset or the channel/permissions are invalid, so a
 * misconfigured log channel never breaks the game itself.
 */
async function sendResultToLogChannel(guild, payload) {
  const channelId = env.RESULT_LOG_CHANNEL_ID;
  if (!channelId) return;
  try {
    const logChannel = await guild.channels.fetch(channelId);
    if (!logChannel || !logChannel.isTextBased()) {
      console.warn(`[Impostor] RESULT_LOG_CHANNEL_ID (${channelId}) is not a valid text channel`);
      return;
    }
    await logChannel.send(payload);
  } catch (err) {
    console.error("[Impostor] Failed to send result to log channel:", err);
  }
}

async function runGame(client, guild, session, gameChannel) {
  try {
    session.state = GameState.WAITING_FOR_START;
    saveSession(session);

    // 1. Theme + roles
    const themePair = await generateThemePair();
    session.theme = themePair.theme;
    session.themeSource = themePair.source;

    const { impostorIds, jokerId, sheriffId, innocentIds } = assignRoles(session.playerIds);
    session.impostorIds = impostorIds;
    session.jokerId = jokerId;
    session.sheriffId = sheriffId;

    for (const id of impostorIds) { session.roles.set(id, "IMPOSTOR"); session.objects.set(id, themePair.impostor); }
    if (jokerId) { session.roles.set(jokerId, "JOKER"); session.objects.set(jokerId, themePair.innocent); }
    if (sheriffId) { session.roles.set(sheriffId, "SHERIFF"); session.objects.set(sheriffId, themePair.innocent); }
    for (const id of innocentIds) { session.roles.set(id, "INNOCENT"); session.objects.set(id, themePair.innocent); }

    // 2. Send DMs (skip dummies — they have no real Discord account to DM)
    const dmFailures = [];
    for (const playerId of session.playerIds) {
      if (isDummyId(playerId)) continue;
      try {
        const member = await guild.members.fetch(playerId);
        const role = session.roles.get(playerId);
        const object = session.objects.get(playerId);
        const teammateIds = role === "IMPOSTOR"
          ? impostorIds.filter((id) => id !== playerId)
          : undefined;
        await member.send({ embeds: [buildRoleDM({ role, theme: session.theme, object, teammateIds })] });
      } catch {
        dmFailures.push(playerId);
      }
    }
    if (dmFailures.length > 0) {
      await gameChannel.send(
        `⚠️ Tidak dapat mengirim DM ke: ${dmFailures.map((id) => mentionOrLabel(id)).join(", ")}. Pastikan DM dari member server diaktifkan.`
      );
    }

    // 3. Discussion phase — waits until Host triggers !vote or /vote
    session.state = GameState.DISCUSSION;
    await gameChannel.send({
      embeds: [buildDiscussionEmbed(session.theme)],
    });
    await gameChannel.send(
      "🗣️ Sesi diskusi dimulai. Diskusikan objek kalian masing-masing!\n" +
      "Host dapat memulai voting kapan saja dengan `!vote` atau `/vote`."
    );
    await waitForVoteTrigger(session, gameChannel);

    // 4. Voting (single, final round — ties trigger a revote automatically).
    // If a living Sheriff chooses to shoot instead of voting, the vote still
    // happens for everyone else, but the FINAL outcome is decided by the
    // Sheriff's shot (see below) rather than by the vote result directly —
    // unless the vote eliminates the Joker, which always wins outright.
    const voteOutcome = await runVotingLoop(session, gameChannel);
    if (!voteOutcome) return;

    const { eliminatedId, sheriffChoseShoot } = voteOutcome;
    session.eliminatedIds.add(eliminatedId);

    const wasImpostor = session.impostorIds.includes(eliminatedId);
    const wasJoker = session.isJoker(eliminatedId);
    // Real per-candidate tally (playerId -> vote count), not the total
    // number of voters. Previously this used `session.votes.size` (total
    // voters) as the count for `eliminatedId` alone, which showed the wrong
    // number whenever votes were split across multiple targets.
    const voteTally = tallyVotes(session.votes);

    let finalOutcome;

    if (wasJoker) {
      // Joker wins outright the moment they're voted out — no Sheriff
      // shooting phase happens at all, regardless of the Sheriff's choice.
      finalOutcome = { winner: "JOKER", reason: `${mentionOrLabel(eliminatedId)} adalah Joker dan berhasil membuat semua orang memvote dirinya!` };
    } else if (sheriffChoseShoot && session.isSheriffAlive()) {
      // Sheriff opted to shoot instead of voting: the vote's own target does
      // NOT decide the game — the Sheriff's shot does, per the game rules
      // ("Sheriff magang" — pick wrong and the vote's impostor-catch doesn't
      // save them; pick right and it doesn't matter that the vote missed).
      // Note: the Sheriff shot result is still announced separately (see
      // runSheriffShootingPhase → buildSheriffResultEmbed) since it's its
      // own distinct beat in the flow, not part of the final results card.
      finalOutcome = await runSheriffShootingPhase(session, gameChannel);
    } else {
      // Normal resolution: the vote result decides the winner directly.
      finalOutcome = wasImpostor
        ? { winner: "INNOCENT", reason: "Impostor berhasil ditemukan dan dieliminasi!" }
        : { winner: "IMPOSTOR", reason: "Pemain yang divote bukan impostor — impostor menang!" };
    }

    // 5. Finish
    session.state = GameState.GAME_FINISHED;

    // 6. Distribute economy rewards, then render everything (vote results +
    // winner + rewards) as ONE generated image instead of three separate
    // back-to-back embeds — avoids the rapid-fire message spam players
    // found confusing/overwhelming.
    let rewards = new Map();
    try {
      rewards = await distributeGameRewards(session, finalOutcome.winner);
    } catch (err) {
      console.error("[Impostor] Failed to distribute rewards:", err);
    }

    try {
      const attachment = await generateResultCard(guild, {
        session,
        voteTally,
        mostVotedId: eliminatedId,
        winner: finalOutcome.winner,
        reason: finalOutcome.reason,
        rewards,
      });
      await sendResultToPlayers(client, session, { files: [attachment] });
      await sendResultToLogChannel(guild, { files: [attachment] });
      await gameChannel.send("📬 Hasil game sudah dikirim ke DM masing-masing pemain. Channel ini akan ditutup sebentar lagi.").catch(() => {});
    } catch (err) {
      console.error("[Impostor] Failed to generate result card image, falling back to embeds:", err);
      // Fallback keeps the game usable even if canvas/avatar fetch fails.
      const fallbackEmbeds = [
        buildVoteResultsEmbed({
          tally: voteTally,
          mostVotedId: eliminatedId,
          isImpostorFound: wasImpostor,
          verdictText: wasJoker
            ? `${mentionOrLabel(eliminatedId)} adalah **JOKER**! 🃏`
            : wasImpostor
              ? `${mentionOrLabel(eliminatedId)} adalah **IMPOSTOR**! 🎉`
              : `❌ WRONG!\n${mentionOrLabel(eliminatedId)} adalah **INNOCENT**.`,
        }),
        buildGameEndEmbed({ won: finalOutcome.winner, impostorIds: session.impostorIds, reason: finalOutcome.reason }),
        buildRewardEmbed(rewards, finalOutcome.winner),
      ];
      await sendResultToPlayers(client, session, { embeds: fallbackEmbeds });
      await sendResultToLogChannel(guild, { embeds: fallbackEmbeds });
      await gameChannel.send("📬 Hasil game sudah dikirim ke DM masing-masing pemain. Channel ini akan ditutup sebentar lagi.").catch(() => {});
    }

    await cleanupGame(guild, session, CLEANUP_DELAY_MS);
  } catch (err) {
    console.error(`[Impostor] Game ${session.gameId} crashed:`, err);
    try { await gameChannel.send("⚠️ Terjadi error tak terduga. Game ini akan dihentikan."); } catch { /**/ }
    await cleanupGame(guild, session, 3000);
  }
}

/**
 * Waits until the Host triggers voting via `!vote` (message) or `/vote`
 * (slash command). Both are wired to call session.triggerVote() from
 * index.js; this just awaits that signal.
 */
function waitForVoteTrigger(session, channel) {
  return new Promise((resolve) => {
    session._resolveVoteTrigger = resolve;
  });
}

/**
 * Runs the full voting phase for one round: optionally asks a living
 * Sheriff to choose Vote/Shoot first, then runs the vote (auto-handling
 * ties via revote). Returns { eliminatedId, sheriffChoseShoot } or null if
 * voting was aborted (e.g. collector timeout with no votes at all).
 */
async function runVotingLoop(session, channel) {
  session.state = GameState.VOTING;
  session.voteRound = 0;
  session.eligibleVoteTargets = null;
  session.sheriffChoice = null;

  // Ask the Sheriff to choose Vote vs Shoot before the first vote round.
  // This choice applies to the whole voting phase (not re-asked on ties).
  let sheriffChoseShoot = false;
  if (session.isSheriffAlive()) {
    sheriffChoseShoot = await askSheriffChoice(session, channel);
  }

  while (true) {
    session.voteRound += 1;
    session.votes.clear();

    const alive = session.alivePlayers();
    // If the Sheriff chose to shoot, they sit out the vote entirely.
    const voters = sheriffChoseShoot ? alive.filter((id) => id !== session.sheriffId) : alive;
    const candidates = session.eligibleVoteTargets || alive;
    const labels = await resolvePlayerLabels(channel.guild, candidates);

    const voteMsg = await channel.send({
      embeds: [buildVotingEmbed(session, voters, session.votes, session.eligibleVoteTargets)],
      components: [buildVoteSelectMenuWithLabels(labels, "imp_vote_select")],
    });

    // Dummies can't click Discord components — auto-cast a random vote for
    // each dummy so the round doesn't stall waiting on them.
    for (const dummyId of voters.filter((id) => isDummyId(id))) {
      const options = candidates.filter((id) => id !== dummyId);
      if (options.length === 0) continue;
      const target = options[Math.floor(Math.random() * options.length)];
      session.votes.set(dummyId, target);
    }
    if (session.votes.size > 0) {
      try {
        await voteMsg.edit({ embeds: [buildVotingEmbed(session, voters, session.votes, session.eligibleVoteTargets)] });
      } catch { /**/ }
    }

    const result = await collectVotes(session, voteMsg, channel, voters, candidates);
    if (!result) return null;

    session.eligibleVoteTargets = null;
    const { winners } = resolveVoteWinners(session.votes);
    let eliminatedId;
    if (winners.length <= 1) {
      eliminatedId = winners.length === 1 ? winners[0] : alive[Math.floor(Math.random() * alive.length)];
    } else {
      await channel.send(`⚖️ Terjadi seri antara: ${winners.map((id) => mentionOrLabel(id)).join(", ")}. Melakukan revote...`);
      session.eligibleVoteTargets = winners;
      continue;
    }

    return { eliminatedId, sheriffChoseShoot };
  }
}

/**
 * Presents the Sheriff with a Vote/Shoot choice via buttons and waits for
 * their decision. Returns true if they chose to shoot, false if they chose
 * to vote (or the choice times out / they never respond, which defaults to
 * voting normally so the game isn't stuck waiting forever).
 */
function askSheriffChoice(session, channel) {
  return new Promise(async (resolve) => {
    let msg;
    try {
      msg = await channel.send({
        content: mentionOrLabel(session.sheriffId),
        embeds: [buildSheriffChoiceEmbed(session.sheriffId, 300)],
        components: [buildSheriffChoiceButtons(false)],
      });
    } catch {
      resolve(false);
      return;
    }

    const collector = msg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      filter: (i) => i.user.id === session.sheriffId,
      time: SHERIFF_CHOICE_TIMEOUT_MS,
      max: 1,
    });
    session.registerCollector(collector);

    let decided = false;
    collector.on("collect", async (interaction) => {
      decided = true;
      const choseShoot = interaction.customId === "imp_sheriff_shoot";
      session.sheriffChoice = choseShoot ? "SHOOT" : "VOTE";
      try {
        await interaction.update({
          embeds: [buildSheriffChoiceEmbed(session.sheriffId, 0)],
          components: [buildSheriffChoiceButtons(true)],
        });
        await channel.send(
          choseShoot
            ? `🔫 Sheriff memilih untuk **Nembak**. Voting tetap berjalan tanpa Sheriff, dan Sheriff akan menembak setelah hasil vote keluar.`
            : `🗳️ Sheriff memilih untuk **ikut Vote** seperti pemain biasa.`
        );
      } catch { /**/ }
      collector.stop("decided");
      resolve(choseShoot);
    });

    collector.on("end", async (_c, reason) => {
      if (decided) return;
      session.sheriffChoice = "VOTE";
      try {
        await msg.edit({ components: [buildSheriffChoiceButtons(true)] });
        await channel.send("⌛ Sheriff tidak memilih tepat waktu — otomatis ikut Vote.");
      } catch { /**/ }
      resolve(false);
    });
  });
}

/**
 * Runs the Sheriff's shooting phase after the vote has been resolved.
 * Presents a 15-second countdown with a select menu of players still alive
 * (after the vote's own elimination). Returns the final { winner, reason }.
 */
async function runSheriffShootingPhase(session, channel) {
  const candidates = session.alivePlayers().filter((id) => id !== session.sheriffId);

  if (candidates.length === 0) {
    // No one left to shoot (edge case) — falls back to the vote's own result.
    const eliminatedId = [...session.eliminatedIds].pop();
    const wasImpostor = session.impostorIds.includes(eliminatedId);
    return wasImpostor
      ? { winner: "INNOCENT", reason: "Impostor berhasil ditemukan dan dieliminasi!" }
      : { winner: "IMPOSTOR", reason: "Tidak ada target tersisa untuk ditembak Sheriff — hasil vote yang menentukan." };
  }

  const labels = await resolvePlayerLabels(channel.guild, candidates);
  const secondsTotal = SHERIFF_SHOOT_TIMEOUT_MS / 1000;

  let shootMsg;
  try {
    shootMsg = await channel.send({
      content: mentionOrLabel(session.sheriffId),
      embeds: [buildSheriffShootEmbed(labels, secondsTotal)],
      components: [buildSheriffShootSelectMenu(labels)],
    });
  } catch {
    return { winner: "IMPOSTOR", reason: "Sheriff tidak dapat menembak (gagal mengirim pesan) — impostor menang." };
  }

  const targetId = await new Promise((resolve) => {
    let resolved = false;
    const collector = shootMsg.createMessageComponentCollector({
      componentType: ComponentType.StringSelect,
      filter: (i) => i.user.id === session.sheriffId,
      time: SHERIFF_SHOOT_TIMEOUT_MS,
      max: 1,
    });
    session.registerCollector(collector);

    // Countdown ticker: update the embed roughly every 5 seconds.
    let secondsLeft = secondsTotal;
    const tick = setInterval(async () => {
      secondsLeft -= 5;
      if (secondsLeft <= 0 || resolved) return;
      try {
        await shootMsg.edit({ embeds: [buildSheriffShootEmbed(labels, secondsLeft)] });
      } catch { /**/ }
    }, 5000);
    session.registerTimer(tick);

    collector.on("collect", async (interaction) => {
      resolved = true;
      clearInterval(tick);
      const choice = interaction.values[0];
      try {
        await interaction.update({ components: [] });
      } catch { /**/ }
      resolve(choice);
    });

    collector.on("end", (collected) => {
      if (resolved) return;
      resolved = true;
      clearInterval(tick);
      if (collected.size === 0) resolve(null);
    });
  });

  if (!targetId) {
    try { await channel.send("⌛ Sheriff tidak memilih target tepat waktu — tembakan meleset secara default."); } catch { /**/ }
    session.eliminatedIds.add(session.sheriffId);
    return { winner: "IMPOSTOR", reason: "Sheriff tidak menembak siapa pun tepat waktu dan dianggap gugur — impostor menang." };
  }

  const wasImpostor = session.impostorIds.includes(targetId);
  session.eliminatedIds.add(targetId);

  await channel.send({ embeds: [buildSheriffResultEmbed({ targetId, wasImpostor })] });

  if (wasImpostor) {
    return { winner: "INNOCENT", reason: `Sheriff berhasil menembak impostor ${mentionOrLabel(targetId)}!` };
  }

  // Sheriff shot the wrong person: they're "gugur" (out) and impostor wins.
  session.eliminatedIds.add(session.sheriffId);
  return { winner: "IMPOSTOR", reason: `Sheriff salah tembak ${mentionOrLabel(targetId)} (bukan impostor) dan gugur — impostor menang.` };
}

function collectVotes(session, message, channel, alivePlayerIds, candidateIds) {
  return new Promise((resolve) => {
    // Edge case: if dummy auto-votes already completed the round (e.g. all
    // remaining alive players are dummies), resolve immediately.
    if (isVotingComplete(alivePlayerIds, session.votes)) {
      channel.send("🗳️ Voting selesai!\n\nHasil akan diumumkan dalam 3 detik...").catch(() => {});
      const timer = setTimeout(() => resolve(true), VOTE_RESULT_DELAY_MS);
      session.registerTimer(timer);
      return;
    }

    const collector = message.createMessageComponentCollector({
      componentType: ComponentType.StringSelect,
      time: VOTING_COLLECTOR_TIMEOUT_MS,
    });
    session.registerCollector(collector);

    collector.on("collect", async (interaction) => {
      const voterId = interaction.user.id;
      if (!alivePlayerIds.includes(voterId)) {
        await interaction.reply({ content: "Kamu tidak dapat memberikan vote di game ini.", ephemeral: true });
        return;
      }
      if (session.votes.has(voterId)) {
        await interaction.reply({ content: "Kamu sudah melakukan vote dan tidak dapat mengubahnya.", ephemeral: true });
        return;
      }
      const targetId = interaction.values[0];
      if (targetId === voterId) {
        await interaction.reply({ content: "Kamu tidak dapat vote dirimu sendiri.", ephemeral: true });
        return;
      }
      if (!candidateIds.includes(targetId)) {
        await interaction.reply({ content: "Target vote tidak valid untuk ronde ini.", ephemeral: true });
        return;
      }

      session.votes.set(voterId, targetId);
      await interaction.reply({ content: `✅ Vote tercatat untuk ${mentionOrLabel(targetId)}.`, ephemeral: true });

      try {
        await message.edit({ embeds: [buildVotingEmbed(session, alivePlayerIds, session.votes, session.eligibleVoteTargets)] });
      } catch { /**/ }

      if (isVotingComplete(alivePlayerIds, session.votes)) collector.stop("complete");
    });

    collector.on("end", async (_c, reason) => {
      if (reason !== "complete") {
        if (session.votes.size === 0) { resolve(false); return; }
      }
      try {
        await channel.send("🗳️ Voting selesai!\n\nHasil akan diumumkan dalam 3 detik...");
      } catch { resolve(false); return; }
      const timer = setTimeout(() => resolve(true), VOTE_RESULT_DELAY_MS);
      session.registerTimer(timer);
    });
  });
}

async function resolvePlayerLabels(guild, playerIds) {
  const labels = [];
  for (const id of playerIds) {
    if (isDummyId(id)) {
      labels.push({ id, label: dummyLabel(id) });
      continue;
    }
    try {
      const member = await guild.members.fetch(id);
      labels.push({ id, label: member.displayName || member.user.username });
    } catch {
      labels.push({ id, label: `Player ${id.slice(-4)}` });
    }
  }
  return labels;
}

function evaluateWinCondition(session) {
  // Kept for reference/future use — the current single-vote flow decides
  // the winner directly from the vote outcome (see runGame) and no longer
  // calls this, since there's no multi-round elimination anymore.
  const aliveImpostors = session.aliveImpostors();
  const aliveInnocents = session.aliveInnocents();

  if (aliveImpostors.length === 0)
    return { finished: true, winner: "INNOCENT", reason: "Semua impostor berhasil ditemukan!" };
  if (aliveImpostors.length >= aliveInnocents.length)
    return { finished: true, winner: "IMPOSTOR", reason: "Jumlah impostor yang tersisa sama dengan atau lebih banyak dari innocent!" };
  return { finished: false };
}

async function cleanupGame(guild, session, delayMs) {
  session.state = GameState.CLEANUP;
  saveSession(session);
  await new Promise((r) => setTimeout(r, delayMs));
  try {
    await destroyGameRoom(guild, { categoryId: session.categoryId, channelId: session.channelId });
  } catch { /**/ }
  gameManager.destroySession(session.gameId);
}

module.exports = { runGame, cleanupGame };
