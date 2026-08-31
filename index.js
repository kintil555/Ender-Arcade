const fs = require("fs");
const path = require("path");
const { Client, Collection, GatewayIntentBits, Events, REST, Routes, Partials, ActivityType } = require("discord.js");
const env = require('./config/env');
require('./database'); // init MySQL for warn system (imp_crime_note_tb only)

const { handleLobbyButton } = require("./function/impostor/lobbyHandler");
const { recoverSessions } = require("./function/impostor/sessionRecovery");
const { gameManager: impostorGameManager } = require("./function/impostor/GameManager");
const { isDummyId } = require("./function/impostor/dummyPlayer");
const { guildConfigManager } = require("./function/impostor/guildConfig");
const { giveWarn } = require("./function/impostor/moderation");
const { handleCafeMessage, handleCafeOrderSelect } = require("./function/cafe/cafeHandler");

console.log('[BOT] Starting standalone impostor bot...');
env.validate();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.DirectMessages,
  ],
  // Required to receive MessageCreate events for uncached DM channels
  // (needed for the !c secret impostor chat, which runs entirely in DMs).
  partials: [Partials.Channel, Partials.Message],
});

client.commands = new Collection();

const commandsPath = path.join(__dirname, "commands");
const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith(".js"));

for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  if (command.name && typeof command.execute === "function") {
    client.commands.set(command.name, command);
  }
}

client.once(Events.ClientReady, async () => {
  console.log(`Bot aktif sebagai ${client.user.tag}`);
  // Clean up any channels/sessions left over from a crash or restart
  try {
    await recoverSessions(client);
  } catch (err) {
    console.error('[BOT] Session recovery error:', err.message);
  }

  client.user.setPresence({
    activities: [{ name: 'Who Is The Impostor', type: ActivityType.Playing }],
    status: 'online',
  });
});

/**
 * Registers all slash commands with Discord automatically on every boot.
 * Discord's PUT /commands endpoint is idempotent (fully replaces the
 * command set), so re-sending the same definitions on every restart is
 * safe and a no-op if nothing changed.
 *
 * Set AUTO_REGISTER_COMMANDS=0 in .env to disable and register manually
 * via `npm run deploy:commands` instead.
 */
async function registerCommandsOnBoot() {
  if (!env.AUTO_REGISTER_COMMANDS) {
    console.log("[BOT] AUTO_REGISTER_COMMANDS=0, skipping automatic command registration");
    return;
  }

  const clientId = env.CLIENT_ID;
  if (!clientId) {
    console.warn("[BOT] CLIENT_ID is not set — skipping automatic slash command registration");
    return;
  }

  const commandData = [...client.commands.values()]
    .filter((cmd) => cmd.name && cmd.description)
    .map((cmd) => ({
      name: cmd.name,
      description: cmd.description,
      options: cmd.options || [],
    }));

  const rest = new REST({ version: "10" }).setToken(env.DISCORD_TOKEN);

  try {
    const guildId = env.GUILD_ID;
    if (guildId) {
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commandData });
      console.log(`[BOT] Registered ${commandData.length} commands to guild ${guildId} (instant)`);

      // Wipe any stale GLOBAL commands so old/renamed commands (e.g. the
      // old imp_* names) don't keep showing up alongside the new guild
      // commands — Discord treats global and guild scope as separate
      // command sets, so switching to guild-scoped registration never
      // auto-clears whatever was previously registered globally.
      try {
        const globalCommands = await rest.get(Routes.applicationCommands(clientId));
        if (globalCommands.length > 0) {
          await rest.put(Routes.applicationCommands(clientId), { body: [] });
          console.log(`[BOT] Cleared ${globalCommands.length} stale global command(s) (now using guild-scoped commands only)`);
        }
      } catch (cleanupErr) {
        console.warn(`[BOT] Could not check/clear global commands: ${cleanupErr.message}`);
      }
    } else {
      await rest.put(Routes.applicationCommands(clientId), { body: commandData });
      console.log(`[BOT] Registered ${commandData.length} commands globally (may take up to 1 hour to propagate)`);
    }
  } catch (err) {
    // Never crash the bot over a registration failure — it can still run
    // and serve previously-registered commands.
    console.error(`[BOT] Failed to auto-register slash commands: ${err.message}`);
  }
}

// ── Global command cooldown (12s per user, across all slash commands) ───
const COMMAND_COOLDOWN_MS = 12000;
const lastCommandAt = new Map(); // userId -> timestamp of last allowed command

/**
 * Simple global cooldown: a user can only run one slash command every
 * COMMAND_COOLDOWN_MS, regardless of which command it is. The bot owner
 * (OWNER_ID) is exempt so testing isn't slowed down. Returns the number
 * of seconds still remaining if the user is on cooldown, or 0 if allowed.
 */
function checkCommandCooldown(userId) {
  if (env.OWNER_ID && userId === env.OWNER_ID) return 0;

  const now = Date.now();
  const last = lastCommandAt.get(userId);
  if (last && now - last < COMMAND_COOLDOWN_MS) {
    return Math.ceil((COMMAND_COOLDOWN_MS - (now - last)) / 1000);
  }
  lastCommandAt.set(userId, now);
  return 0;
}

// ── Per-command cooldown overrides ───────────────────────────────────────
// Commands listed here need a stricter cooldown than the 12s global one
// (e.g. /skin hits the external Mojang API, so it gets its own longer
// per-user cooldown on top of the global check).
const PER_COMMAND_COOLDOWN_MS = {
  skin: 60000,
};
const lastPerCommandAt = new Map(); // "userId:commandName" -> timestamp

function checkPerCommandCooldown(userId, commandName) {
  const cooldownMs = PER_COMMAND_COOLDOWN_MS[commandName];
  if (!cooldownMs) return 0;
  if (env.OWNER_ID && userId === env.OWNER_ID) return 0;

  const key = `${userId}:${commandName}`;
  const now = Date.now();
  const last = lastPerCommandAt.get(key);
  if (last && now - last < cooldownMs) {
    return Math.ceil((cooldownMs - (now - last)) / 1000);
  }
  lastPerCommandAt.set(key, now);
  return 0;
}

// ── Slash command dispatcher ─────────────────────────────────────────────
const OPENGAME_COMMAND_NAMES = new Set(["opengame"]);


/**
 * /opengame is only meant to be triggered via the "🎮 Open Game" button
 * posted by /setupgame in the designated channel — this guard catches
 * anyone still typing the slash command manually somewhere else. On a
 * violation: reject the command, delete the rejection notice after a few
 * seconds (keeps the wrong channel clean), and issue a warn using the
 * same escalation system as Neo Dragon Sentinel (2nd warn = timeout if a
 * duration configured, 3rd = ban) — see function/impostor/moderation.js.
 */
async function enforceOpenGameChannelGuard(interaction) {
  if (!OPENGAME_COMMAND_NAMES.has(interaction.commandName)) return false;
  if (!interaction.guild) return false;

  const configuredChannelId = await guildConfigManager.getGameChannelId(interaction.guild.id);
  if (!configuredChannelId) return false; // /setupgame never run — no restriction yet
  if (interaction.channel.id === configuredChannelId) return false; // correct channel, allow through

  const notice = await interaction.reply({
    content: `⚠️ <@${interaction.user.id}>, \`/opengame\` hanya boleh dibuka lewat tombol **🎮 Open Game** di <#${configuredChannelId}>. Gunakan channel itu, bukan command manual di sini.`,
    fetchReply: true,
  });

  setTimeout(() => {
    notice.delete().catch(() => {});
  }, 4000);

  try {
    const member = await interaction.guild.members.fetch(interaction.user.id);
    await giveWarn({
      target: member,
      reason: "Menggunakan /opengame di luar channel khusus yang sudah ditentukan",
      moderator: interaction.client.user,
      guildId: interaction.guild.id,
    });
  } catch (err) {
    console.error("[Impostor] Failed to issue warn for wrong-channel /opengame:", err);
  }

  return true;
}

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isChatInputCommand()) {
    const remaining = checkCommandCooldown(interaction.user.id);
    if (remaining > 0) {
      await interaction.reply({
        content: `⏳ Tunggu **${remaining} detik** lagi sebelum menggunakan command lain.`,
        ephemeral: true,
      });
      return;
    }

    const remainingForCommand = checkPerCommandCooldown(interaction.user.id, interaction.commandName);
    if (remainingForCommand > 0) {
      await interaction.reply({
        content: `⏳ Command \`/${interaction.commandName}\` masih cooldown, tunggu **${remainingForCommand} detik** lagi.`,
        ephemeral: true,
      });
      return;
    }

    try {
      const blocked = await enforceOpenGameChannelGuard(interaction);
      if (blocked) return;
    } catch (err) {
      console.error("[Impostor] Open-game channel guard error:", err);
      // Fail open — a guard bug should never block the command entirely.
    }

    const command = client.commands.get(interaction.commandName);
    if (!command) return;
    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(`Error executing command ${interaction.commandName}:`, error);
      const errorReply = { content: "Terjadi error saat menjalankan command.", ephemeral: true };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(errorReply);
      } else {
        await interaction.reply(errorReply);
      }
    }
    return;
  }

  // Impostor lobby buttons (imp_lobby_*)
  if (interaction.isButton() && interaction.customId.startsWith("imp_lobby_")) {
    try {
      await handleLobbyButton(interaction);
    } catch (err) {
      console.error("[Impostor] Lobby button error:", err);
    }
    return;
  }

  // Persistent "🎮 Open Game" button posted by /setupgame in the
  // designated channel — behaves exactly like /opengame, since the
  // button only exists in the correct channel to begin with.
  if (interaction.isButton() && interaction.customId === "imp_channel_opengame") {
    try {
      const { openLobby } = require("./commands/impostor/opengame");
      await openLobby(interaction);
    } catch (err) {
      console.error("[Impostor] Channel Open Game button error:", err);
    }
    return;
  }

  // Cafe coffee-order select menu
  if (interaction.isStringSelectMenu() && interaction.customId === "cafe_order_select") {
    try {
      await handleCafeOrderSelect(interaction);
    } catch (err) {
      console.error("[Cafe] Order select error:", err);
    }
    return;
  }

  // StringSelect (vote) interactions handled by their own collector in GameFlow.js
});

// !startgame text command - usable inside active game room channel
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot || !message.guild) return;
  if (message.content.trim().toLowerCase() !== "!startgame") return;

  const session = impostorGameManager.getSessionByChannel(message.channel.id);
  if (!session) return;

  if (!session.isHost(message.author.id)) {
    await message.reply("Hanya Host yang dapat memulai game dengan `!startgame`.");
    return;
  }

  const { MIN_PLAYERS } = require("./function/impostor/lobbyHandler");
  if (session.playerIds.length < MIN_PLAYERS) {
    await message.reply(`Butuh minimal ${MIN_PLAYERS} pemain untuk memulai.`);
    return;
  }

  const { runGame } = require("./function/impostor/GameFlow");
  const { GameState } = require("./function/impostor/GameSession");
  if (session.state !== GameState.WAITING_FOR_START && session.state !== GameState.ROOM_CREATED) {
    await message.reply("Game sudah dimulai atau belum dalam state yang tepat.");
    return;
  }

  runGame(client, message.guild, session, message.channel).catch((err) => {
    console.error(`[Impostor] runGame (!startgame) error:`, err);
  });
});

// !vote text command - Host uses this during discussion to open voting
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot || !message.guild) return;
  if (message.content.trim().toLowerCase() !== "!vote") return;

  const session = impostorGameManager.getSessionByChannel(message.channel.id);
  if (!session) return;

  if (!session.isHost(message.author.id)) {
    await message.reply("Hanya Host yang dapat memulai voting.");
    return;
  }

  const { GameState } = require("./function/impostor/GameSession");
  if (session.state !== GameState.DISCUSSION) {
    await message.reply("Voting hanya dapat dimulai saat sesi diskusi berlangsung.");
    return;
  }

  const triggered = session.triggerVote();
  if (!triggered) {
    await message.reply("Voting sudah dimulai atau tidak dapat dipicu saat ini.");
  }
});

// !c <pesan> - private DM relay so impostors (2+ of them) can secretly
// coordinate. Only works in DMs with the bot, and only for players
// currently marked IMPOSTOR in an active, non-finished game.
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot || message.guild) return; // DM only (no guild context)

  const content = message.content.trim();
  if (!content.toLowerCase().startsWith("!c ")) return;

  const text = content.slice(3).trim();
  if (!text) {
    await message.reply("Format: `!c <pesan>` — pesan tidak boleh kosong.");
    return;
  }

  const session = impostorGameManager.getActiveSessionForPlayer(message.author.id);
  if (!session) {
    await message.reply("Kamu tidak sedang berada di game impostor manapun.");
    return;
  }

  const { GameState } = require("./function/impostor/GameSession");
  if (session.state === GameState.GAME_FINISHED || session.state === GameState.CLEANUP) {
    await message.reply("Game sudah selesai, chat rahasia tidak tersedia lagi.");
    return;
  }

  const role = session.roles.get(message.author.id);
  if (role !== "IMPOSTOR") {
    await message.reply("Hanya impostor yang dapat menggunakan chat rahasia ini.");
    return;
  }
  if (session.eliminatedIds.has(message.author.id)) {
    await message.reply("Kamu sudah dieliminasi dan tidak dapat mengirim pesan rahasia lagi.");
    return;
  }

  const teammates = session.impostorIds.filter(
    (id) => id !== message.author.id && !isDummyId(id) && !session.eliminatedIds.has(id)
  );

  if (teammates.length === 0) {
    await message.reply("Kamu tidak punya rekan impostor lain yang aktif saat ini.");
    return;
  }

  let sentCount = 0;
  for (const teammateId of teammates) {
    try {
      const member = await client.users.fetch(teammateId);
      await member.send(`🎭 **[Impostor Chat]** ${message.author.username}: ${text}`);
      sentCount += 1;
    } catch {
      // teammate has DMs closed or is unreachable — skip silently
    }
  }

  if (sentCount > 0) {
    await message.reply(`✅ Pesan terkirim ke ${sentCount} rekan impostor.`);
  } else {
    await message.reply("⚠️ Gagal mengirim pesan ke rekan impostor manapun (DM mungkin tertutup).");
  }
});

// Cafe order menu — replies with the coffee menu when "cafe"/"cafetaria"
// is mentioned in the configured CAFE_CHANNEL_ID (see .env). No-op
// everywhere else.
client.on(Events.MessageCreate, async (message) => {
  try {
    await handleCafeMessage(message);
  } catch (err) {
    console.error("[Cafe] Message handler error:", err);
  }
});

client.on("error", (err) => {
  console.error("[BOT] Client error:", err.message);
});

process.on("unhandledRejection", (reason) => {
  console.error("[BOT] Unhandled promise rejection:", reason instanceof Error ? reason.message : reason);
});

(async () => {
  try {
    if (!env.DISCORD_TOKEN) {
      throw new Error('DISCORD_TOKEN is not set');
    }
    console.log('[BOT] ✅ Discord token found, logging in...');
    await client.login(env.DISCORD_TOKEN);
    await registerCommandsOnBoot();
  } catch (err) {
    console.error('[BOT] ❌ Discord login failed:', err.message);
    process.exit(1);
  }
})();

module.exports = client;