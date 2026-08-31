const { EmbedBuilder, AttachmentBuilder } = require("discord.js");
const axios = require("axios");
const { fetchMojangSkin } = require("../function/skinFetcher");

module.exports = {
  name: "skin",
  description: "Lihat skin Minecraft Java Edition dari username (via Mojang API)",
  options: [
    {
      name: "username",
      description: "Username Minecraft Java Edition",
      type: 3, // STRING
      required: true,
    },
  ],
  cooldown: 60000, // 60s — matches the global cooldown notice below

  async execute(interaction) {
    await interaction.deferReply();

    const username = interaction.options.getString("username").trim();

    try {
      const result = await fetchMojangSkin(username);

      if (!result) {
        await interaction.editReply({
          content: `❌ Username \`${username}\` tidak ditemukan (bukan akun Minecraft Java Edition yang valid).`,
        });
        return;
      }

      const { uuid, name, skinUrl, slim } = result;
      // mc-heads.net renders a 3D body preview straight from the skin
      // URL we just resolved from Mojang — no extra Mojang API calls,
      // just a visual convenience on top of the data we already fetched.
      const renderUrl = `https://mc-heads.net/body/${uuid}/300`;

      const embed = new EmbedBuilder()
        .setTitle(`🧑‍🚀 Skin Minecraft — ${name}`)
        .setColor(0x55ff55)
        .setThumbnail(renderUrl)
        .addFields(
          { name: "Username", value: name, inline: true },
          { name: "UUID", value: `\`${uuid}\``, inline: true },
          { name: "Model", value: slim ? "Slim (Alex)" : "Classic (Steve)", inline: true },
        )
        .setImage(renderUrl)
        .setFooter({ text: "Data dari Mojang API" });

      let skinAttachment = null;
      try {
        const skinRes = await axios.get(skinUrl, { responseType: "arraybuffer", timeout: 8000 });
        skinAttachment = new AttachmentBuilder(Buffer.from(skinRes.data), { name: "skin.png" });
      } catch {
        // Skin texture download failed — the embed's render preview
        // (mc-heads.net) still works fine without the raw attachment.
      }

      await interaction.editReply({
        embeds: [embed],
        files: skinAttachment ? [skinAttachment] : [],
      });
    } catch (err) {
      console.error("[Skin] Fetch error:", err.message);
      await interaction.editReply({
        content: "⚠️ Gagal mengambil data skin dari Mojang API. Coba lagi nanti.",
      });
    }
  },
};