const env = require("../../config/env");
const { buildCafeMenuEmbed, buildCafeMenuSelect, buildOrderConfirmationEmbed, getCoffeeById } = require("./menu");

// Word(s) that trigger the cafe menu when someone chats in the allowed
// channel. Kept simple/literal on purpose — "cafe" or "cafetaria"
// anywhere in the message (case-insensitive) is enough to trigger.
const TRIGGER_WORDS = ["cafe", "café", "cafetaria"];

function isCafeChannel(channelId) {
  if (!env.CAFE_CHANNEL_ID) return false;
  return channelId === env.CAFE_CHANNEL_ID;
}

function messageMentionsCafe(content) {
  const lower = content.toLowerCase();
  return TRIGGER_WORDS.some((w) => lower.includes(w));
}

/**
 * Called from index.js's MessageCreate listener. Only replies when the
 * message is in the configured CAFE_CHANNEL_ID and mentions one of the
 * trigger words — everywhere else this is a silent no-op.
 */
async function handleCafeMessage(message) {
  if (message.author.bot || !message.guild) return;
  if (!isCafeChannel(message.channel.id)) return;
  if (!messageMentionsCafe(message.content)) return;

  await message.reply({
    embeds: [buildCafeMenuEmbed(message.author.username)],
    components: [buildCafeMenuSelect()],
  });
}

/**
 * Called from index.js's InteractionCreate listener when the cafe
 * select-menu is used. Only the person who receives the menu can use
 * it on their own message — but since the menu is posted per-reply (not
 * shared), we still guard against someone else picking a different
 * user's dropdown out from under them.
 */
async function handleCafeOrderSelect(interaction) {
  const coffeeId = interaction.values[0];
  const coffee = getCoffeeById(coffeeId);
  if (!coffee) {
    await interaction.reply({ content: "Menu tidak ditemukan, coba lagi.", ephemeral: true });
    return;
  }

  await interaction.update({
    embeds: [buildOrderConfirmationEmbed(interaction.user.username, coffee)],
    components: [],
  });
}

module.exports = {
  isCafeChannel,
  messageMentionsCafe,
  handleCafeMessage,
  handleCafeOrderSelect,
};