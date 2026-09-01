const { GameSession } = require("./GameSession");

class GameManager {
  constructor() {
    this.sessions = new Map();
    this.playerToGame = new Map();
    this.lobbyMessageToGame = new Map();
    this.gameMessageToGame = new Map();
  }

  createSession(params) {
    const session = new GameSession(params);
    this.sessions.set(session.gameId, session);
    this.playerToGame.set(session.hostId, session.gameId);
    console.log(`[StoryGame] Created session ${session.gameId} by ${session.hostId}`);
    return session;
  }

  getSession(gameId) { return this.sessions.get(gameId) || null; }

  getSessionByLobbyMessage(messageId) {
    const gameId = this.lobbyMessageToGame.get(messageId);
    return gameId ? this.sessions.get(gameId) : null;
  }

  getSessionByGameMessage(messageId) {
    const gameId = this.gameMessageToGame.get(messageId);
    return gameId ? this.sessions.get(gameId) : null;
  }

  getActiveSessionForPlayer(userId) {
    const gameId = this.playerToGame.get(userId);
    return gameId ? this.sessions.get(gameId) : null;
  }

  registerLobbyMessage(gameId, messageId) {
    this.lobbyMessageToGame.set(messageId, gameId);
  }

  registerGameMessage(gameId, messageId) {
    this.gameMessageToGame.set(messageId, gameId);
  }

  addPlayerToSession(session, userId) {
    const added = session.addPlayer(userId);
    if (added) this.playerToGame.set(userId, session.gameId);
    return added;
  }

  removePlayerFromSession(session, userId) {
    const removed = session.removePlayer(userId);
    if (removed) this.playerToGame.delete(userId);
    return removed;
  }

  destroySession(gameId) {
    const session = this.sessions.get(gameId);
    if (!session) return;

    session.clearAllHandles();

    for (const playerId of session.playerIds) {
      if (this.playerToGame.get(playerId) === gameId) {
        this.playerToGame.delete(playerId);
      }
    }
    if (session.lobbyMessageId) this.lobbyMessageToGame.delete(session.lobbyMessageId);
    if (session.gameMessageId) this.gameMessageToGame.delete(session.gameMessageId);

    this.sessions.delete(gameId);
    console.log(`[StoryGame] Destroyed session ${gameId}`);
  }
}

const gameManager = new GameManager();
module.exports = { gameManager };
