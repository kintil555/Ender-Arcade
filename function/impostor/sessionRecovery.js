const { loadAllSessions, deleteSession } = require('./sessionPersistence');
const { destroyGameRoom } = require('./gameRoom');

/**
 * Called once on bot ready. Loads all persisted sessions and decides what
 * to do with each one:
 *
 *  - Sessions that had a game room (channel_id / category_id set) but are
 *    no longer actively handled in-memory are considered "orphaned" — the
 *    bot crashed mid-game. We delete the Discord channels so they don't
 *    pile up, then remove the DB row.
 *
 *  - Sessions still in LOBBY state (no room yet) are also cleaned up
 *    because the lobby message is gone and no one can join anymore.
 *
 * We intentionally do NOT try to resume an in-progress game: the vote
 * collectors, timers, and DM relays are lost and cannot be safely
 * reconstructed. A clean slate is always better than a half-broken game.
 */
async function recoverSessions(client) {
  const rows = await loadAllSessions();
  if (rows.length === 0) return;

  console.log(`[SessionRecovery] Found ${rows.length} persisted session(s) — cleaning up orphans`);

  for (const row of rows) {
    try {
      const guild = await client.guilds.fetch(row.guild_id).catch(() => null);

      if (guild && !row.channel_id && !row.category_id && row.lobby_channel_id && row.lobby_message_id) {
        // Lobby never became a game room — the "Open Game" / Join / Leave
        // buttons are stale (bot restarted before start). Delete the
        // message so the channel doesn't fill up with dead lobby cards,
        // and DM the host instead so they still get told what happened.
        try {
          const lobbyChannel = await guild.channels.fetch(row.lobby_channel_id).catch(() => null);
          if (lobbyChannel && lobbyChannel.isTextBased()) {
            const lobbyMsg = await lobbyChannel.messages.fetch(row.lobby_message_id).catch(() => null);
            if (lobbyMsg) await lobbyMsg.delete().catch(() => {});
          }
          if (row.host_id) {
            const host = await client.users.fetch(row.host_id).catch(() => null);
            if (host) {
              await host.send(
                `⚠️ Lobby "Who Is The Impostor" kamu di **${guild.name}** sudah tidak berlaku (bot sempat restart). ` +
                'Gunakan `/opengame` lagi untuk membuka lobby baru.'
              ).catch(() => {});
            }
          }
        } catch { /* lobby channel/message might already be gone */ }
        console.log(`[SessionRecovery] Removed stale lobby message for session ${row.game_id} in guild ${row.guild_id}`);
      }

      if (guild && (row.channel_id || row.category_id)) {
        // Notify the game room (if it still exists) that the bot restarted
        if (row.channel_id) {
          try {
            const ch = await guild.channels.fetch(row.channel_id).catch(() => null);
            if (ch && ch.isTextBased()) {
              await ch.send(
                '⚠️ **Bot mengalami restart.** Game yang sedang berjalan di channel ini tidak dapat dilanjutkan. ' +
                'Channel ini akan dihapus dalam beberapa detik. Gunakan `/opengame` untuk memulai sesi baru.'
              );
            }
          } catch { /* channel might already be gone */ }
        }

        // Give players a moment to read the notice, then delete the room
        await new Promise((r) => setTimeout(r, 4000));
        await destroyGameRoom(guild, {
          channelId: row.channel_id,
          categoryId: row.category_id,
        });
        console.log(`[SessionRecovery] Deleted orphan room for session ${row.game_id} in guild ${row.guild_id}`);
      }
    } catch (err) {
      console.error(`[SessionRecovery] Error cleaning up session ${row.game_id}:`, err.message);
    } finally {
      // Always remove the DB row regardless of whether Discord cleanup succeeded
      await deleteSession(row.game_id);
    }
  }

  console.log('[SessionRecovery] Orphan cleanup complete');
}

module.exports = { recoverSessions };