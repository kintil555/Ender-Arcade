const GameState = Object.freeze({
  LOBBY: "LOBBY",
  IN_PROGRESS: "IN_PROGRESS",
  FINISHED: "FINISHED",
});

const MAX_CHARS_PER_TURN = 25;

let idCounter = 0;
function nextGameId() {
  idCounter += 1;
  return `story_${Date.now()}_${idCounter}`;
}

/**
 * "Sambung Kata" — N players each contribute one short phrase (max
 * MAX_CHARS_PER_TURN chars) per round to build N parallel sentences.
 * Rotation: in round r, player at index i writes into story index
 * (i + r) % playerCount — so across rounds every player has contributed
 * to every story, and no one writes two consecutive turns on the same
 * story (their own).
 */
class GameSession {
  constructor({ hostId, guildId, lobbyChannelId, totalRounds }) {
    this.gameId = nextGameId();
    this.hostId = hostId;
    this.guildId = guildId;
    this.lobbyChannelId = lobbyChannelId;
    this.lobbyMessageId = null;
    this.gameMessageId = null;

    // Private game-room channel (created on start, like the Impostor
    // game) so outsiders can't see or interfere with an in-progress game.
    this.categoryId = null;
    this.channelId = null;

    this.playerIds = [hostId];
    this.totalRounds = totalRounds || 10;

    this.state = GameState.LOBBY;
    this.currentRound = 0; // 1-indexed once started
    this.stories = []; // array of string[] segments, one array per player/story
    // Set of playerIds who have already submitted this round
    this.submittedThisRound = new Set();

    this.createdAt = Date.now();
    this._timers = new Set();
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

  get storyCount() { return this.playerIds.length; }

  /** Index of the story this player must write into for the current round. */
  storyIndexFor(userId, round = this.currentRound) {
    const playerIdx = this.playerIds.indexOf(userId);
    if (playerIdx === -1) return -1;
    return (playerIdx + (round - 1)) % this.storyCount;
  }

  hasSubmitted(userId) { return this.submittedThisRound.has(userId); }

  allSubmittedThisRound() { return this.submittedThisRound.size >= this.playerIds.length; }

  startGame() {
    this.state = GameState.IN_PROGRESS;
    this.currentRound = 1;
    this.stories = this.playerIds.map(() => []);
    this.submittedThisRound = new Set();
  }

  /** Records a submission; returns false if invalid or already submitted. */
  submitTurn(userId, text) {
    if (this.state !== GameState.IN_PROGRESS) return false;
    if (!this.isPlayer(userId)) return false;
    if (this.hasSubmitted(userId)) return false;

    const trimmed = text.trim().slice(0, MAX_CHARS_PER_TURN);
    if (!trimmed) return false;

    const storyIdx = this.storyIndexFor(userId);
    this.stories[storyIdx].push(trimmed);
    this.submittedThisRound.add(userId);
    return true;
  }

  /** Advances to next round. Returns true if game just finished. */
  nextRound() {
    if (this.currentRound >= this.totalRounds) {
      this.state = GameState.FINISHED;
      return true;
    }
    this.currentRound += 1;
    this.submittedThisRound = new Set();
    return false;
  }

  registerTimer(h) { this._timers.add(h); return h; }
  clearAllHandles() {
    for (const t of this._timers) clearTimeout(t);
    this._timers.clear();
  }
}

module.exports = { GameState, GameSession, MAX_CHARS_PER_TURN };
