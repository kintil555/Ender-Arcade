const { read, write } = require('./jsonStore');

const FILE = 'active_sessions';

function saveSession(session) {
  try {
    const data = read(FILE);
    data[session.gameId] = {
      game_id: session.gameId,
      guild_id: session.guildId,
      host_id: session.hostId,
      channel_id: session.channelId || null,
      category_id: session.categoryId || null,
      lobby_channel_id: session.lobbyChannelId || null,
      lobby_message_id: session.lobbyMessageId || null,
      state: session.state,
      player_ids: session.playerIds,
      created_at: session.createdAt,
    };
    write(FILE, data);
  } catch (err) {
    console.error(`[SessionPersistence] Failed to save session ${session.gameId}:`, err.message);
  }
}

function deleteSession(gameId) {
  try {
    const data = read(FILE);
    delete data[gameId];
    write(FILE, data);
  } catch (err) {
    console.error(`[SessionPersistence] Failed to delete session ${gameId}:`, err.message);
  }
}

function loadAllSessions() {
  try {
    const data = read(FILE);
    return Object.values(data);
  } catch (err) {
    console.error('[SessionPersistence] Failed to load sessions:', err.message);
    return [];
  }
}

module.exports = { saveSession, deleteSession, loadAllSessions };
