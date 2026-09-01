const { ChannelType, PermissionFlagsBits } = require("discord.js");
const { buildGameRoomOverwrites } = require("../impostor/permissions");
const env = require("../../config/env");

const REQUIRED_GUILD_PERMS = [
  { flag: PermissionFlagsBits.ManageChannels, label: "Manage Channels" },
  { flag: PermissionFlagsBits.ViewChannel, label: "View Channels" },
];

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
      `GAME_CATEGORY_ID di .env (${env.GAME_CATEGORY_ID}) tidak ditemukan atau bukan category.`
    );
  }
  return category;
}

/** Creates a private text channel visible only to the given players. */
async function createStoryGameRoom(guild, { playerIds, gameId }) {
  assertBotCanManageChannels(guild);

  const overwrites = buildGameRoomOverwrites({
    guildEveryoneId: guild.roles.everyone.id,
    botId: guild.members.me.id,
    botPermissions: guild.members.me.permissions,
    playerIds,
  });

  const fixedCategory = await resolveFixedCategory(guild);

  const category = fixedCategory || await guild.channels.create({
    name: "📝 Sambung Kata",
    type: ChannelType.GuildCategory,
    permissionOverwrites: overwrites,
  });

  const channel = await guild.channels.create({
    name: "sambung-kata",
    type: ChannelType.GuildText,
    parent: category.id,
    permissionOverwrites: overwrites,
    topic: `Sambung Kata - session ${gameId}`,
  });

  return { categoryId: fixedCategory ? null : category.id, channelId: channel.id };
}

async function destroyStoryGameRoom(guild, { categoryId, channelId }) {
  if (channelId) {
    try {
      const ch = await guild.channels.fetch(channelId).catch(() => null);
      if (ch) await ch.delete("Sambung Kata cleanup");
    } catch { /**/ }
  }
  if (categoryId) {
    try {
      const cat = await guild.channels.fetch(categoryId).catch(() => null);
      if (cat) await cat.delete("Sambung Kata cleanup");
    } catch { /**/ }
  }
}

module.exports = { createStoryGameRoom, destroyStoryGameRoom };
