import { ChannelType } from 'discord.js';
import GuildConfig from '../models/GuildConfig.js';
import logger from '../utils/logger.js';

export async function getGuildConfig(guildId) {
  return GuildConfig.findOne({ guildId });
}

export async function updateGuildConfig(guildId, updates) {
  return GuildConfig.findOneAndUpdate({ guildId }, { $set: updates }, { upsert: true, new: true });
}

export async function getLogChannel(guild, config) {
  if (!config?.logging?.enabled) return null;
  const channelId = config.logging.channels?.mod || config.logging.channels?.audit || config.logging.channels?.general;
  if (!channelId) return null;
  try {
    return await guild.channels.fetch(channelId);
  } catch {
    return null;
  }
}

export async function getModLogChannel(guild, config) {
  if (!config?.logging?.enabled || !config.logging.channels?.mod) return null;
  try {
    return await guild.channels.fetch(config.logging.channels.mod);
  } catch {
    return null;
  }
}

export async function getAuditLogChannel(guild, config) {
  if (!config?.logging?.enabled || !config.logging.channels?.audit) return null;
  try {
    return await guild.channels.fetch(config.logging.channels.audit);
  } catch {
    return null;
  }
}

export async function logAction(guild, config, embed) {
  const channel = await getLogChannel(guild, config);
  if (channel) {
    try {
      await channel.send({ embeds: [embed] });
    } catch (err) {
      logger.error(`Failed to send log: ${err.message}`);
    }
  }
}

export async function logModAction(guild, config, embed) {
  const channel = await getModLogChannel(guild, config);
  if (channel) {
    try {
      await channel.send({ embeds: [embed] });
    } catch (err) {
      logger.error(`Failed to send mod log: ${err.message}`);
    }
  }
}
