const { DataTypes } = require('sequelize');
const path = require('path');
const sequelize = require(path.join(__dirname, '..', 'database'));
const { generateUniqueId } = require('../function/impostor/id_maker');

/**
 * Ported from NEO-Dragon-Sentinel's crime_note_members_tb (see
 * models/crime_note_members_tb.js there). Table name and column names are
 * kept IDENTICAL on purpose — this bot is meant to eventually be merged
 * back into Neo Dragon, and matching the schema exactly means the two
 * tables' data is compatible without a migration if that happens.
 *
 * For now this runs on the standalone bot's OWN database (see database.js)
 * — it is NOT the same physical table as Neo Dragon's, just the same
 * shape. See docs/NEO_DRAGON_MERGE.md for merge instructions.
 */
const imp_crime_note_tb = sequelize.define('crime_note_member_tb', {
  username_id: {
    type: DataTypes.STRING(50),
    allowNull: false,
  },
  id_note: {
    type: DataTypes.TEXT,
    allowNull: true,
    primaryKey: true,
    defaultValue: () => generateUniqueId(16),
  },
  date: {
    type: DataTypes.DATE(3),
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
  reason: {
    type: DataTypes.TEXT(),
    allowNull: true,
  },
  status: {
    type: DataTypes.ENUM('active', 'expired'),
    defaultValue: 'active',
  },
}, {
  tableName: 'crime_note_members_tb',
  timestamps: false,
});

// Auto-sync (create table if not exists)
imp_crime_note_tb.sync({ alter: false }).catch((err) => {
  console.error('[Impostor] Failed to sync crime_note_members_tb:', err.message);
});

module.exports = imp_crime_note_tb;
