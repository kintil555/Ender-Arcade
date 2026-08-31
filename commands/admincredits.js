const { EmbedBuilder } = require("discord.js");
const { read, write } = require("../function/impostor/jsonStore");
const { getOrCreateWallet } = require("../function/impostor/economy");
const { guardAdminOrOwner } = require("../function/impostor/permissions");

const FILE = 'economy';

module.exports = {
  name: "admincredits",
  description: "[ADMIN] Manage kredit impostor user",
  options: [
    {
      name: "add",
      description: "Tambah kredit ke user",
      type: 1,
      options: [
        { name: "user", description: "Target user", type: 6, required: true },
        { name: "amount", description: "Jumlah kredit", type: 4, required: true, min_value: 1 },
      ],
    },
    {
      name: "remove",
      description: "Kurangi kredit dari user",
      type: 1,
      options: [
        { name: "user", description: "Target user", type: 6, required: true },
        { name: "amount", description: "Jumlah kredit", type: 4, required: true, min_value: 1 },
      ],
    },
    {
      name: "set",
      description: "Set kredit user ke nilai tertentu",
      type: 1,
      options: [
        { name: "user", description: "Target user", type: 6, required: true },
        { name: "amount", description: "Nilai kredit baru", type: 4, required: true, min_value: 0 },
      ],
    },
    {
      name: "reset",
      description: "Reset kredit + stats user ke 0",
      type: 1,
      options: [
        { name: "user", description: "Target user", type: 6, required: true },
      ],
    },
    {
      name: "view",
      description: "Lihat data lengkap user",
      type: 1,
      options: [
        { name: "user", description: "Target user", type: 6, required: true },
      ],
    },
  ],

  async execute(interaction) {
    if (!(await guardAdminOrOwner(interaction))) return;

    await interaction.deferReply({ ephemeral: true });

    const sub = interaction.options.getSubcommand();
    const target = interaction.options.getUser("user");
    const amount = interaction.options.getInteger("amount");

    try {
      const wallet = getOrCreateWallet(target.id);
      const data = read(FILE);

      if (sub === "add") {
        const before = wallet.credits;
        wallet.credits += amount;
        wallet.total_credits_earned += amount;
        data[target.id] = wallet;
        write(FILE, data);
        await reply(interaction, target, "✅ Kredit Ditambahkan", 0x57f287, [
          { name: "Sebelum", value: before.toLocaleString(), inline: true },
          { name: "Ditambah", value: `+${amount.toLocaleString()}`, inline: true },
          { name: "Sesudah", value: wallet.credits.toLocaleString(), inline: true },
        ]);

      } else if (sub === "remove") {
        const before = wallet.credits;
        wallet.credits = Math.max(0, wallet.credits - amount);
        data[target.id] = wallet;
        write(FILE, data);
        const actual = before - wallet.credits;
        await reply(interaction, target, "✅ Kredit Dikurangi", 0xe74c3c, [
          { name: "Sebelum", value: before.toLocaleString(), inline: true },
          { name: "Dikurangi", value: `-${actual.toLocaleString()}`, inline: true },
          { name: "Sesudah", value: wallet.credits.toLocaleString(), inline: true },
        ]);

      } else if (sub === "set") {
        const before = wallet.credits;
        wallet.credits = amount;
        data[target.id] = wallet;
        write(FILE, data);
        await reply(interaction, target, "✅ Kredit Di-set", 0x3498db, [
          { name: "Sebelum", value: before.toLocaleString(), inline: true },
          { name: "Di-set ke", value: amount.toLocaleString(), inline: true },
          { name: "Sesudah", value: wallet.credits.toLocaleString(), inline: true },
        ]);

      } else if (sub === "reset") {
        data[target.id] = { credits: 0, total_games: 0, total_wins: 0, total_credits_earned: 0 };
        write(FILE, data);
        await reply(interaction, target, "🔄 Data User Direset", 0xf39c12, [
          { name: "Kredit", value: "0", inline: true },
          { name: "Total Game", value: "0", inline: true },
          { name: "Total Menang", value: "0", inline: true },
        ]);

      } else if (sub === "view") {
        const winRate = wallet.total_games > 0
          ? Math.round((wallet.total_wins / wallet.total_games) * 100)
          : 0;
        await reply(interaction, target, "📋 Data User", 0x9b59b6, [
          { name: "💳 Kredit", value: wallet.credits.toLocaleString(), inline: true },
          { name: "🎮 Total Game", value: String(wallet.total_games), inline: true },
          { name: "🏆 Total Menang", value: String(wallet.total_wins), inline: true },
          { name: "📈 Win Rate", value: `${winRate}%`, inline: true },
          { name: "💰 Total Earned", value: wallet.total_credits_earned.toLocaleString(), inline: true },
        ]);
      }

      console.log(`[AdminCredits] ${interaction.user.tag} → /${sub} on ${target.tag}`);
    } catch (err) {
      console.error("[AdminCredits] Error:", err);
      await interaction.editReply({ content: "❌ Terjadi error. Cek log bot." });
    }
  },
};

async function reply(interaction, target, title, color, fields) {
  const embed = new EmbedBuilder()
    .setTitle(title)
    .setColor(color)
    .setThumbnail(target.displayAvatarURL({ dynamic: true }))
    .setDescription(`User: ${target.tag} (<@${target.id}>)`)
    .addFields(fields)
    .setFooter({ text: `Dieksekusi oleh ${interaction.user.tag}` })
    .setTimestamp();
  await interaction.editReply({ embeds: [embed] });
}
