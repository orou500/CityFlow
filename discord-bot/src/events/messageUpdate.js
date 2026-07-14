import { Events, EmbedBuilder } from 'discord.js';
import { getGuildConfig, logAction } from '../utils/guildConfig.js';
import config from '../config.js';

export default {
  name: Events.MessageUpdate,
  once: false,

  async execute(oldMessage, newMessage, client) {
    if (!oldMessage.guild || oldMessage.author?.bot) return;
    if (oldMessage.content === newMessage.content) return;

    const guildCfg = await getGuildConfig(oldMessage.guild.id);

    const before = oldMessage.content?.slice(0, 1024) || '*empty*';
    const after = newMessage.content?.slice(0, 1024) || '*empty*';

    await logAction(oldMessage.guild, guildCfg, new EmbedBuilder()
      .setTitle('Message Edited')
      .setDescription(`By ${oldMessage.author.tag} in <#${oldMessage.channel.id}>`)
      .addFields(
        { name: 'Before', value: before, inline: false },
        { name: 'After', value: after, inline: false },
      )
      .setColor(config.embedColor)
      .setTimestamp());
  },
};
