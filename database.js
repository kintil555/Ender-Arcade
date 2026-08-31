/**
 * MySQL connection — dipakai HANYA untuk warn system (imp_crime_note_tb)
 * agar tetap sync dengan Neo Dragon Sentinel.
 *
 * Economy, guild config, dan active sessions sudah pindah ke JSON lokal (data/).
 */
const env = require('./config/env');
const { Sequelize } = require('sequelize');

console.log('[DB] Connecting to MySQL (warn system only):', {
    host: env.DB_HOST,
    user: env.DB_USER,
    database: env.DB_NAME,
    port: env.DB_PORT,
});

const sequelize = new Sequelize(
    env.DB_NAME,
    env.DB_USER,
    env.DB_PASSWORD,
    {
        host: env.DB_HOST,
        port: env.DB_PORT,
        dialect: 'mysql',
        logging: false,
    }
);

(async () => {
    try {
        await sequelize.authenticate();
        console.log('[DB] ✅ MySQL connected (warn system)');
    } catch (err) {
        console.error('[DB] ⚠️  MySQL connection failed (warn system will not work):', err.message);
        // Non-fatal — JSON-based features still work without MySQL
    }
})();

module.exports = sequelize;
