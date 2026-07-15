import { EmbedBuilder } from 'discord.js';
import GuildConfig from '../models/GuildConfig.js';
import config from '../config.js';
import logger from './logger.js';

const TYPE_CONFIG = {
  announcements: {
    emoji: '📢',
    color: 0x5865f2,
    channelKey: 'announcements',
  },
  worldEvents: {
    emoji: '🌎',
    color: 0x57f287,
    channelKey: 'worldEvents',
  },
  achievements: {
    emoji: '🏆',
    color: 0xfee75c,
    channelKey: 'achievements',
  },
  systemAlerts: {
    emoji: '🚨',
    color: 0xed4245,
    channelKey: 'systemAlerts',
  },
};

export async function sendNotification(client, { type, title, description, fields, color }) {
  const typeConf = TYPE_CONFIG[type];
  if (!typeConf) {
    logger.warn(`Unknown notification type: ${type}`);
    return false;
  }

  try {
    const guildConfigs = await GuildConfig.find({ 'cityflow.enabled': true });

    if (guildConfigs.length === 0) {
      logger.warn('No guilds with CityFlow integration enabled');
      return false;
    }

    let sent = false;

    for (const guildConfig of guildConfigs) {
      const channelId = guildConfig.cityflow?.notificationChannels?.[typeConf.channelKey];
      if (!channelId) {
        logger.debug(`No channel configured for ${type} in guild ${guildConfig.guildId}`);
        continue;
      }

      try {
        const channel = await client.channels.fetch(channelId);
        if (!channel || !channel.isTextBased()) {
          logger.warn(`Channel ${channelId} not found or not text-based in guild ${guildConfig.guildId}`);
          continue;
        }

        const embed = new EmbedBuilder()
          .setTitle(`${typeConf.emoji} ${title}`)
          .setDescription(description || '')
          .setColor(color || typeConf.color)
          .setTimestamp();

        if (fields && fields.length > 0) {
          embed.addFields(
            fields.map((f) => ({
              name: f.name,
              value: String(f.value),
              inline: f.inline !== undefined ? f.inline : true,
            })),
          );
        }

        embed.setFooter({ text: 'CityFlow' });

        await channel.send({ embeds: [embed] });
        sent = true;
        logger.info(`Sent ${type} notification to channel ${channelId} in guild ${guildConfig.guildId}`);
      } catch (err) {
        logger.error(`Failed to send to channel ${channelId}: ${err.message}`);
      }
    }

    return sent;
  } catch (err) {
    logger.error(`Notification error: ${err.message}`);
    return false;
  }
}
