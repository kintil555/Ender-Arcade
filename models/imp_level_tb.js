const { DataTypes } = require('sequelize');
const path = require('path');
const sequelize = require(path.join(__dirname, '..', 'database'));

/**
 * Ported from NEO-Dragon-Sentinel's level_tb (see models/level_tb.js
 * there). Table name and column names are kept IDENTICAL on purpose —
 * this uses the SAME MySQL connection as the warn system (database.js,
 * shared with Neo Dragon's DB per .env DB_NAME), so this model reads and
 * writes the exact same `level_tb` table Neo Dragon uses. No migration
 * needed: XP given here shows up immediately in Neo Dragon's /level,
 * /rank, leaderboard, etc.
 */
const imp_level_tb = sequelize.define('imp_level_tb', {
  username_id: {
    type: DataTypes.STRING(50),
    allowNull: false,
    primaryKey: true,
  },
  level: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
  },
  xp: {
    type: DataTypes.BIGINT,
    allowNull: false,
    defaultValue: 0,
  },
}, {
  tableName: 'level_tb',
  timestamps: false,
});

// No .sync() here on purpose — this table is owned/created by Neo Dragon
// Sentinel's own level_tb model. Syncing from two codebases against the
// same table risks a schema fight; this bot only ever reads/writes rows.

module.exports = imp_level_tb;
