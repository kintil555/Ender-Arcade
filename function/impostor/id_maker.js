// Ported from NEO-Dragon-Sentinel (function/id_maker.js) — kept identical so
// the crime_note_members_tb table stays schema-compatible if this bot is
// later merged back into Neo Dragon.
function generateUniqueId(length = 8, prefix = "id_") {
  const randomNum = Math.random().toString(36).substr(2, length);
  return prefix + randomNum;
}

module.exports = { generateUniqueId };
