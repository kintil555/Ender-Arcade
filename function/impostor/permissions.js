const { PermissionFlagsBits, OverwriteType } = require("discord.js");
const { isDummyId } = require("./dummyPlayer");
const { OWNER_ID } = require("../../config/env");

/**
 * True if the interacting user is the bot Owner (via OWNER_ID env)
 * or holds the Discord Administrator permission in this guild.
 */
function isAdminOrOwner(interaction) {
  if (OWNER_ID && interaction.user.id === OWNER_ID) return true;
  return Boolean(
    interaction.member?.permissions?.has(PermissionFlagsBits.Administrator)
  );
}

/**
 * Replies with a rejection and returns false if the user is neither
 * Owner nor Administrator. Returns true (and does nothing) otherwise.
 * Use as: if (!(await guardAdminOrOwner(interaction))) return;
 */
async function guardAdminOrOwner(interaction, message = "❌ Hanya Owner atau Administrator yang bisa pakai command ini.") {
  if (isAdminOrOwner(interaction)) return true;
  await interaction.reply({ content: message, ephemeral: true });
  return false;
}

function buildGameRoomOverwrites({ guildEveryoneId, botId, botPermissions, playerIds }) {
  const desiredBotFlags = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.ReadMessageHistory,
    PermissionFlagsBits.EmbedLinks,
  ];
  // A bot can never grant an overwrite beyond what its own guild-level
  // role already has — Discord rejects the whole channels.create call
  // (50013) otherwise. Filter to only flags the bot actually holds, so
  // this never becomes the cause of a failed room creation.
  const botFlags = botPermissions
    ? desiredBotFlags.filter((flag) => botPermissions.has(flag))
    : desiredBotFlags;

  const overwrites = [
    {
      id: guildEveryoneId,
      deny: [PermissionFlagsBits.ViewChannel],
      type: OverwriteType.Role,
    },
    {
      id: botId,
      allow: botFlags,
      type: OverwriteType.Member,
    },
  ];

  for (const playerId of playerIds) {
    // Dummies aren't real Discord members — Discord would reject a
    // permission overwrite for a fake snowflake, so skip them.
    if (isDummyId(playerId)) continue;

    overwrites.push({
      id: playerId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
      ],
      type: OverwriteType.Member,
    });
  }

  return overwrites;
}

module.exports = { buildGameRoomOverwrites, isAdminOrOwner, guardAdminOrOwner };