import { Events, EmbedBuilder } from 'discord.js';
import { getGuildConfig, logAction } from '../utils/guildConfig.js';
import config from '../config.js';

export default {
  name: Events.MessageDelete,
  once: false,

  async execute(message, client) {
    if (!message.guild || message.author?.bot) return;

    const guildCfg = await getGuildConfig(message.guild.id);

    await logAction(message.guild, guildCfg, new EmbedBuilder()
      .setTitle('Message Deleted')
      .setDescription(`By ${message.author?.tag || 'Unknown'} in <#${message.channel.id}>`)
      .addFields(
        { name: 'Content', value: message.content?.slice(0, 1024) || '*no content*' },
      )
      .setColor(config.errorColor)
      .setTimestamp());
  },
};
