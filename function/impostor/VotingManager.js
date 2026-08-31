function tallyVotes(votesMap) {
  const tally = new Map();
  for (const targetId of votesMap.values()) {
    tally.set(targetId, (tally.get(targetId) || 0) + 1);
  }
  return tally;
}

function resolveVoteWinners(votesMap) {
  const tally = tallyVotes(votesMap);
  if (tally.size === 0) return { winners: [], tally, isTie: false };

  const maxVotes = Math.max(...tally.values());
  const winners = [...tally.entries()]
    .filter(([, count]) => count === maxVotes)
    .map(([targetId]) => targetId);

  return { winners, tally, isTie: winners.length > 1 };
}

function getPendingVoters(alivePlayerIds, votesMap) {
  return alivePlayerIds.filter((id) => !votesMap.has(id));
}

function isVotingComplete(alivePlayerIds, votesMap) {
  return getPendingVoters(alivePlayerIds, votesMap).length === 0;
}

module.exports = { tallyVotes, resolveVoteWinners, getPendingVoters, isVotingComplete };
