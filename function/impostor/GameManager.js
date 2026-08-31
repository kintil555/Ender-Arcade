const { GameSession } = require("./GameSession");
const { makeDummyId, isDummyId } = require("./dummyPlayer");
const { saveSession, deleteSession } = require("./sessionPersistence");

class GameManager {
  constructor() {
    this.sessions = new Map();
    this.playerToGame = new Map();
    this.channelToGame = new Map();
    this.lobbyMessageToGame = new Map();
  }

  createSession(params) {
    const session = new GameSession(params);
    this.sessions.set(session.gameId, session);
    this.playerToGame.set(session.hostId, session.gameId);
    console.log(`[Impostor] Created session ${session.gameId} by ${session.hostId}`);
    saveSession(session); // fire-and-forget — non-blocking
    return session;
  }

  getSession(gameId) { return this.sessions.get(gameId) || null; }

  getSessionByLobbyMessage(messageId) {
    const gameId = this.lobbyMessageToGame.get(messageId);
    return gameId ? this.sessions.get(gameId) : null;
  }

  getSessionByChannel(channelId) {
    const gameId = this.channelToGame.get(channelId);
    return gameId ? this.sessions.get(gameId) : null;
  }

  getActiveSessionForPlayer(userId) {
    const gameId = this.playerToGame.get(userId);
    return gameId ? this.sessions.get(gameId) : null;
  }

  isPlayerInAnyGame(userId) { return this.playerToGame.has(userId); }

  registerLobbyMessage(gameId, messageId) {
    this.lobbyMessageToGame.set(messageId, gameId);
    const session = this.sessions.get(gameId);
    if (session) saveSession(session);
  }

  registerGameChannel(gameId, channelId) {
    this.channelToGame.set(channelId, gameId);
    const session = this.sessions.get(gameId);
    if (session) saveSession(session);
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

  /**
   * Debug helper: fills empty lobby slots with fake players so the game
   * can be started/tested solo. Dummies are never registered in
   * playerToGame (they can't "be" in a real game from Discord's side).
   * Returns the list of dummy ids added.
   */
  addDummyPlayers(session, count) {
    const added = [];
    let n = session.playerIds.filter((id) => isDummyId(id)).length;
    for (let i = 0; i < count; i += 1) {
      n += 1;
      const dummyId = makeDummyId(session.gameId, n);
      if (session.addPlayer(dummyId)) added.push(dummyId);
    }
    return added;
  }

  /** Removes all dummy players currently in the session. */
  removeDummyPlayers(session) {
    const dummies = session.playerIds.filter((id) => isDummyId(id));
    for (const id of dummies) session.removePlayer(id);
    return dummies;
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
    if (session.channelId) this.channelToGame.delete(session.channelId);

    this.sessions.delete(gameId);
    deleteSession(gameId); // fire-and-forget
    console.log(`[Impostor] Destroyed session ${gameId}`);
  }
}

// Singleton
const gameManager = new GameManager();
module.exports = { gameManager };
