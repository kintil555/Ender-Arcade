-- Run this once on your DB to add the session persistence table.
-- The bot also auto-creates it via Sequelize sync on first run,
-- so this file is provided as a manual reference / for CI pipelines.

CREATE TABLE IF NOT EXISTS `imp_active_sessions_tb` (
  `game_id`          VARCHAR(100) NOT NULL,
  `guild_id`         VARCHAR(50)  NOT NULL,
  `host_id`          VARCHAR(50)  NOT NULL,
  `channel_id`       VARCHAR(50)  DEFAULT NULL,
  `category_id`      VARCHAR(50)  DEFAULT NULL,
  `lobby_channel_id` VARCHAR(50)  DEFAULT NULL,
  `lobby_message_id` VARCHAR(50)  DEFAULT NULL,
  `state`            VARCHAR(30)  NOT NULL DEFAULT 'LOBBY',
  `player_ids`       TEXT         NOT NULL DEFAULT '[]',
  `created_at`       BIGINT       NOT NULL,
  PRIMARY KEY (`game_id`),
  INDEX `idx_guild_id` (`guild_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
