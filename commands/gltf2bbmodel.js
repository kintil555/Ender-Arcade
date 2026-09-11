const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const axios = require("axios");
const { EmbedBuilder, AttachmentBuilder } = require("discord.js");
const { convertGltfToBbmodel } = require("../function/gltf2bbmodel");

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // batas aman lampiran Discord (non-boosted)
const TMP_DIR = path.join(os.tmpdir(), "ender-arcade-gltf2bbmodel");

module.exports = {
  name: "gltf2bbmodel",
  description: "Convert file .gltf (hasil export Blockbench) menjadi .bbmodel",
  options: [
    {
      name: "file",
      description: "File .gltf yang mau dikonversi (harus hasil export 'Embedded' dari Blockbench)",
      type: 11, // ATTACHMENT
      required: true,
    },
    {
      name: "uv_mode",
      description: "Mode UV output (default: Per Face)",
      type: 3, // STRING
      required: false,
      choices: [
        { name: "Per Face (UV asli tiap face)", value: "face" },
        { name: "Box UV (layout box standar)", value: "box" },
      ],
    },
  ],
  cooldown: 15000,

  async execute(interaction) {
    await interaction.deferReply();

    const attachment = interaction.options.getAttachment("file");
    const originalName = attachment.name || "model.gltf";
    const uvMode = interaction.options.getString("uv_mode") || "face";

    if (!originalName.toLowerCase().endsWith(".gltf")) {
      await interaction.editReply({
        content: "❌ File harus berekstensi `.gltf` (bukan `.glb` atau `.bbmodel`). Export dari Blockbench sebagai glTF **Embedded/Single File**.",
      });
      return;
    }

    if (attachment.size > MAX_UPLOAD_BYTES) {
      await interaction.editReply({
        content: `❌ File terlalu besar (${(attachment.size / 1024 / 1024).toFixed(1)} MB). Maksimal ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`,
      });
      return;
    }

    // Setiap job dapat folder sementara unik sendiri, supaya request
    // paralel dari user berbeda tidak saling tabrakan / timpa file.
    const jobId = crypto.randomBytes(8).toString("hex");
    const jobDir = path.join(TMP_DIR, jobId);
    const inputPath = path.join(jobDir, "input.gltf");

    const baseName = path
      .basename(originalName, path.extname(originalName))
      .replace(/[^a-zA-Z0-9_\-]/g, "_")
      .slice(0, 48) || "model";
    const outputPath = path.join(jobDir, `${baseName}.bbmodel`);

    try {
      await fs.promises.mkdir(jobDir, { recursive: true });

      // Download attachment ke disk (bukan simpan permanen — folder ini
      // dihapus lagi di blok finally, apa pun hasilnya).
      const res = await axios.get(attachment.url, {
        responseType: "arraybuffer",
        timeout: 15000,
        maxContentLength: MAX_UPLOAD_BYTES + 1024,
      });
      await fs.promises.writeFile(inputPath, res.data);

      const raw = await fs.promises.readFile(inputPath, "utf8");
      let gltfJson;
      try {
        gltfJson = JSON.parse(raw);
      } catch {
        throw new Error("File bukan JSON glTF yang valid (mungkin ter-corrupt atau ini file .glb biner, bukan .gltf teks).");
      }

      const bbmodel = convertGltfToBbmodel(gltfJson, { name: baseName, uvMode });
      await fs.promises.writeFile(outputPath, JSON.stringify(bbmodel));

      const fileBuffer = await fs.promises.readFile(outputPath);
      const outAttachment = new AttachmentBuilder(fileBuffer, { name: `${baseName}.bbmodel` });

      const embed = new EmbedBuilder()
        .setTitle("✅ Konversi berhasil")
        .setColor(0x55ff55)
        .addFields(
          { name: "Cube", value: `${bbmodel.elements.length}`, inline: true },
          { name: "Resolusi texture", value: `${bbmodel.resolution.width}x${bbmodel.resolution.height}`, inline: true },
          { name: "Mode UV", value: uvMode === "box" ? "Box UV" : "Per Face", inline: true },
        )
        .setFooter({ text: "File sementara di server sudah dihapus otomatis" });

      await interaction.editReply({ embeds: [embed], files: [outAttachment] });
    } catch (err) {
      console.error("[gltf2bbmodel] Convert error:", err.message);
      await interaction.editReply({
        content: `⚠️ Gagal convert: ${err.message}`,
      });
    } finally {
      // Cleanup wajib jalan baik sukses maupun gagal — jangan sampai file
      // user menumpuk di server.
      await fs.promises.rm(jobDir, { recursive: true, force: true }).catch((cleanupErr) => {
        console.error("[gltf2bbmodel] Cleanup error:", cleanupErr.message);
      });
    }
  },
};
