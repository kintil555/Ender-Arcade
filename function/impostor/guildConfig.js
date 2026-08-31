const { read, write } = require('./jsonStore');

const FILE = 'guild_config';

class GuildConfigManager {
  constructor() {
    this.cache = new Map();
  }

  get(guildId) {
    if (this.cache.has(guildId)) return this.cache.get(guildId);
    const data = read(FILE);
    const entry = data[guildId] || null;
    this.cache.set(guildId, entry);
    return entry;
  }

  getGameChannelId(guildId) {
    return this.get(guildId)?.game_channel_id || null;
  }

  setGameChannel(guildId, { channelId, guideMessageId, buttonMessageId }) {
    const data = read(FILE);
    const entry = {
      guild_id: guildId,
      game_channel_id: channelId,
      guide_message_id: guideMessageId,
      button_message_id: buttonMessageId,
    };
    data[guildId] = entry;
    write(FILE, data);
    this.cache.set(guildId, entry);
    return entry;
  }
}

const guildConfigManager = new GuildConfigManager();
module.exports = { guildConfigManager };
