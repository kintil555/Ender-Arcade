const { ChannelType, PermissionFlagsBits } = require("discord.js");
const { buildGameRoomOverwrites } = require("./permissions");
const env = require("../../config/env");

const REQUIRED_GUILD_PERMS = [
  { flag: PermissionFlagsBits.ManageChannels, label: "Manage Channels" },
  { flag: PermissionFlagsBits.ViewChannel, label: "View Channels" },
];

/**
 * Checks the bot's own guild-level permissions before attempting to
 * create anything. Throws a clear, human-readable error instead of
 * letting a raw DiscordAPIError[50013] bubble up.
 */
function assertBotCanManageChannels(guild) {
  const botPerms = guild.members.me.permissions;
  const missing = REQUIRED_GUILD_PERMS.filter((p) => !botPerms.has(p.flag)).map((p) => p.label);
  if (missing.length > 0) {
    throw new Error(
      `Bot tidak punya izin server yang dibutuhkan: ${missing.join(", ")}. ` +
      `Aktifkan izin ini di role bot lewat Server Settings > Roles.`
    );
  }
}

async function resolveFixedCategory(guild) {
  if (!env.GAME_CATEGORY_ID) return null;
  const category = await guild.channels.fetch(env.GAME_CATEGORY_ID).catch(() => null);
  if (!category || category.type !== ChannelType.GuildCategory) {
    throw new Error(
      `GAME_CATEGORY_ID di .env (${env.GAME_CATEGORY_ID}) tidak ditemukan atau bukan category. ` +
      `Pastikan ID kategori benar dan bot masih bisa melihatnya.`
    );
  }
  return category;
}

async function createGameRoom(guild, { playerIds, gameId }) {
  assertBotCanManageChannels(guild);

  const overwrites = buildGameRoomOverwrites({
    guildEveryoneId: guild.roles.everyone.id,
    botId: guild.members.me.id,
    botPermissions: guild.members.me.permissions,
    playerIds,
  });

  const fixedCategory = await resolveFixedCategory(guild);

  // If GAME_CATEGORY_ID is set, drop the game-room straight into that
  // existing category instead of creating (and later deleting) a new one.
  const category = fixedCategory || await guild.channels.create({
    name: "🎭 Impostor Game",
    type: ChannelType.GuildCategory,
    permissionOverwrites: overwrites,
  });

  const channel = await guild.channels.create({
    name: "game-room",
    type: ChannelType.GuildText,
    parent: category.id,
    permissionOverwrites: overwrites,
    topic: `Who Is The Impostor - session ${gameId}`,
  });

  // Only report categoryId as "ours to delete" when we created it ourselves.
  return { categoryId: fixedCategory ? null : category.id, channelId: channel.id };
}

async function destroyGameRoom(guild, { categoryId, channelId }) {
  if (channelId) {
    try {
      const ch = await guild.channels.fetch(channelId).catch(() => null);
      if (ch) await ch.delete("Impostor game cleanup");
    } catch { /**/ }
  }
  if (categoryId) {
    try {
      const cat = await guild.channels.fetch(categoryId).catch(() => null);
      if (cat) await cat.delete("Impostor game cleanup");
    } catch { /**/ }
  }
}

module.exports = { createGameRoom, destroyGameRoom };