const GameState = Object.freeze({
  LOBBY: "LOBBY",
  ROOM_CREATED: "ROOM_CREATED",
  WAITING_FOR_START: "WAITING_FOR_START",
  DISCUSSION: "DISCUSSION",
  VOTING: "VOTING",
  RESULT: "RESULT",
  CHECK_WIN: "CHECK_WIN",
  GAME_FINISHED: "GAME_FINISHED",
  CLEANUP: "CLEANUP",
});

let idCounter = 0;
function nextGameId() {
  idCounter += 1;
  return `imp_${Date.now()}_${idCounter}`;
}

class GameSession {
  constructor({ hostId, guildId, lobbyChannelId, lobbyMessageId }) {
    this.gameId = nextGameId();
    this.hostId = hostId;
    this.guildId = guildId;

    this.lobbyChannelId = lobbyChannelId;
    this.lobbyMessageId = lobbyMessageId;

    this.categoryId = null;
    this.channelId = null;

    this.playerIds = [hostId];
    this.eliminatedIds = new Set();

    this.impostorIds = [];
    this.jokerId = null;
    this.sheriffId = null;
    this.roles = new Map();
    this.objects = new Map();
    this.theme = null;
    this.themeSource = null;

    this.votes = new Map();
    this.voteRound = 0;
    this.eligibleVoteTargets = null;

    // Sheriff's choice for the current voting round: null (not decided
    // yet), "VOTE" (join the vote normally), or "SHOOT" (sit out the vote
    // and get a shooting phase after votes are tallied).
    this.sheriffChoice = null;

    this.state = GameState.LOBBY;
    this.createdAt = Date.now();

    this._timers = new Set();
    this._collectors = new Set();

    // Resolver for the pending "waitForVoteTrigger" promise in GameFlow.js,
    // set while the game is in the DISCUSSION state. triggerVote() calls it.
    this._resolveVoteTrigger = null;
  }

  /**
   * Called by the !vote / /vote handlers in index.js once the Host asks to
   * move from discussion into voting. No-op if not currently waiting
   * (wrong state, or already triggered).
   * Returns true if it actually triggered the transition.
   */
  triggerVote() {
    if (this.state !== GameState.DISCUSSION || !this._resolveVoteTrigger) return false;
    const resolve = this._resolveVoteTrigger;
    this._resolveVoteTrigger = null;
    resolve();
    return true;
  }

  addPlayer(userId) {
    if (this.playerIds.includes(userId)) return false;
    this.playerIds.push(userId);
    return true;
  }

  removePlayer(userId) {
    const idx = this.playerIds.indexOf(userId);
    if (idx === -1) return false;
    this.playerIds.splice(idx, 1);
    return true;
  }

  isPlayer(userId) { return this.playerIds.includes(userId); }
  isHost(userId) { return this.hostId === userId; }

  alivePlayers() { return this.playerIds.filter((id) => !this.eliminatedIds.has(id)); }
  aliveImpostors() { return this.impostorIds.filter((id) => !this.eliminatedIds.has(id)); }
  aliveInnocents() { return this.alivePlayers().filter((id) => !this.impostorIds.includes(id)); }

  isJoker(userId) { return this.jokerId === userId; }
  isSheriff(userId) { return this.sheriffId === userId; }
  isSheriffAlive() { return this.sheriffId !== null && !this.eliminatedIds.has(this.sheriffId); }

  registerTimer(h) { this._timers.add(h); return h; }
  registerCollector(c) { this._collectors.add(c); return c; }

  clearAllHandles() {
    for (const t of this._timers) clearTimeout(t);
    this._timers.clear();
    for (const c of this._collectors) {
      try { if (!c.ended) c.stop("cleanup"); } catch { /**/ }
    }
    this._collectors.clear();
  }
}

module.exports = { GameState, GameSession };
