// Delegates to opengame.js's shared openLobby() so lobby-creation logic
// (including arming the idle-close timer) lives in exactly one place.
const { openLobby } = require("./opengame");

module.exports = {
  name: "imp_opengame",
  description: "Buka lobby baru untuk game Who Is The Impostor",
  options: [],
  cooldown: 5000,

  async execute(interaction) {
    await openLobby(interaction);
  },
};