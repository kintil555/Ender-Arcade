const level_tb = require("../../models/imp_level_tb");

/**
 * Ported from NEO-Dragon-Sentinel's function/add_xp.js. Writes to the
 * SAME `level_tb` table Neo Dragon uses (see models/imp_level_tb.js), so
 * XP given from this bot immediately reflects in Neo Dragon's own
 * /level, /rank, and leaderboard commands — no separate/duplicate XP
 * system, no manual sync needed.
 *
 * `member` is optional (a discord.js GuildMember) — pass it to also
 * apply/remove Neo Dragon's level-role rewards on level up/down, same as
 * Neo Dragon's own add_xp. If omitted, only xp/level columns are updated
 * (no role changes) — still safe to call from contexts without a member
 * (e.g. DM-only interactions).
 */
async function add_xp(userOrMember, gain_xp, client = null) {
  try {
    const user = userOrMember.user ?? userOrMember;
    const member = userOrMember.roles ? userOrMember : null;

    const [user_level_data] = await level_tb.findOrCreate({
      where: { username_id: user.id },
      defaults: { username_id: user.id, level: 1, xp: 0 },
    });
    const previousLevel = user_level_data.level;
    user_level_data.xp += gain_xp;
    let levelUps = 0;

    let max_xp = 50 * user_level_data.level ** 2;

    if (gain_xp > 0) {
      while (user_level_data.xp >= max_xp) {
        user_level_data.xp -= max_xp;
        user_level_data.level++;
        levelUps += 1;
        max_xp = 50 * user_level_data.level ** 2;

        // Same level-role thresholds as Neo Dragon Sentinel's add_xp.
        if (member) {
          if (user_level_data.level >= 100) {
            await member.roles.add("1032920319113052161").catch(() => null);
          } else if (user_level_data.level >= 75) {
            await member.roles.add("1487271663413231737").catch(() => null);
          } else if (user_level_data.level >= 50) {
            await member.roles.add("1487271507938775200").catch(() => null);
          } else if (user_level_data.level >= 25) {
            await member.roles.add("1487271274597191851").catch(() => null);
          } else if (user_level_data.level >= 5) {
            await member.roles.add("1487271116102701229").catch(() => null);
          }
        }
      }
    } else if (gain_xp < 0) {
      while (user_level_data.xp < 0 && user_level_data.level > 1) {
        user_level_data.level--;
        max_xp = 50 * user_level_data.level ** 2;
        user_level_data.xp += max_xp;

        if (member) {
          if (user_level_data.level < 100) await member.roles.remove("1487271946252193952").catch(() => null);
          if (user_level_data.level < 75) await member.roles.remove("1487271663413231737").catch(() => null);
          if (user_level_data.level < 50) await member.roles.remove("1487271507938775200").catch(() => null);
          if (user_level_data.level < 25) await member.roles.remove("1487271274597191851").catch(() => null);
          if (user_level_data.level < 5) await member.roles.remove("1487271116102701229").catch(() => null);
        }
      }
      if (user_level_data.xp < 0) user_level_data.xp = 0;
    }

    await user_level_data.save();

    if (client && levelUps > 0) {
      client.channels.fetch("1033321345037123604").then((channel) => {
        if (!channel?.send) return;
        channel.send(`🎉 <@${user.id}> naik ${levelUps} level dan sekarang level ${user_level_data.level}!`);
      }).catch((err) => {
        console.error("[Impostor] Error fetching channel for level up announcement:", err);
      });
    }

    return { user_level_data, leveledUp: levelUps > 0, levelUps, previousLevel };
  } catch (error) {
    console.error("[Impostor] Error adding XP via level_tb:", error);
    return null;
  }
}

module.exports = add_xp;
