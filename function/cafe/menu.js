const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require("discord.js");

const COLOR_CAFE = 0x6f4e37; // coffee brown

// 10 jenis kopi paling umum di kafe, tiap kopi punya deskripsi singkat
// biar user tahu bedanya sebelum pesan.
const COFFEE_MENU = [
  { id: "espresso", label: "Espresso", emoji: "☕", desc: "Kopi murni pekat, diseduh cepat tanpa campuran susu/air." },
  { id: "americano", label: "Americano", emoji: "☕", desc: "Espresso + air panas, rasa lebih ringan dari espresso." },
  { id: "latte", label: "Café Latte", emoji: "🥛", desc: "Espresso + susu steamed banyak, foam tipis, rasa lembut." },
  { id: "cappuccino", label: "Cappuccino", emoji: "☕", desc: "Espresso, susu steamed, dan foam susu tebal seimbang." },
  { id: "macchiato", label: "Macchiato", emoji: "☕", desc: "Espresso dengan sedikit foam susu di atasnya, rasa kopi kuat." },
  { id: "flat_white", label: "Flat White", emoji: "🥛", desc: "Mirip latte tapi foam lebih tipis, espresso lebih terasa." },
  { id: "mocha", label: "Mocha", emoji: "🍫", desc: "Espresso, susu steamed, dan cokelat — manis dan creamy." },
  { id: "affogato", label: "Affogato", emoji: "🍨", desc: "Satu-dua shot espresso panas dituang di atas es krim vanila." },
  { id: "kopi_tubruk", label: "Kopi Tubruk", emoji: "🫖", desc: "Kopi khas Indonesia, diseduh tradisional tanpa filter." },
  { id: "kopi_susu", label: "Kopi Susu", emoji: "🥤", desc: "Kopi dengan campuran susu kental manis, manis dan creamy." },
];

function getCoffeeById(id) {
  return COFFEE_MENU.find((c) => c.id === id) || null;
}

function buildCafeMenuEmbed(username) {
  const lines = COFFEE_MENU.map((c) => `${c.emoji} **${c.label}** — ${c.desc}`).join("\n");
  return new EmbedBuilder()
    .setTitle("☕ Cafetaria — Mau pesan kopi apa?")
    .setColor(COLOR_CAFE)
    .setDescription(`Halo ${username}! Pilih salah satu menu kopi di bawah ini:`)
    .addFields({ name: "Menu Kopi", value: lines })
    .setFooter({ text: "Pilih lewat menu dropdown di bawah" });
}

function buildCafeMenuSelect() {
  const select = new StringSelectMenuBuilder()
    .setCustomId("cafe_order_select")
    .setPlaceholder("Pilih jenis kopi...")
    .addOptions(
      COFFEE_MENU.map((c) => ({
        label: c.label,
        description: c.desc.slice(0, 90),
        value: c.id,
        emoji: c.emoji,
      }))
    );
  return new ActionRowBuilder().addComponents(select);
}

function buildOrderConfirmationEmbed(username, coffee) {
  return new EmbedBuilder()
    .setTitle("✅ Pesanan diterima!")
    .setColor(COLOR_CAFE)
    .setDescription(`${coffee.emoji} **${coffee.label}** untuk **${username}** sedang disiapkan. Selamat menunggu!`);
}

module.exports = {
  COFFEE_MENU,
  getCoffeeById,
  buildCafeMenuEmbed,
  buildCafeMenuSelect,
  buildOrderConfirmationEmbed,
};