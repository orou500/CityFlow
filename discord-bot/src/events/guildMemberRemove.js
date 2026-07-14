import { Events, EmbedBuilder } from 'discord.js';
import { getGuildConfig, logAction } from '../utils/guildConfig.js';
import config from '../config.js';

export default {
  name: Events.GuildMemberRemove,
  once: false,

  async execute(member, client) {
    const guildCfg = await getGuildConfig(member.guild.id);

    if (guildCfg?.leave?.enabled && guildCfg.leave.channelId) {
      const channel = await member.guild.channels.fetch(guildCfg.leave.channelId).catch(() => null);
      if (channel) {
        const msg = (guildCfg.leave.message || '{user} has left the server.')
          .replace('{user}', member.user.tag);

        await channel.send({
          embeds: [
            new EmbedBuilder()
              .setTitle('Goodbye')
              .setDescription(msg)
              .setColor(config.errorColor)
              .setTimestamp(),
          ],
        });
      }
    }

    await logAction(member.guild, guildCfg, new EmbedBuilder()
      .setTitle('Member Left')
      .setDescription(`${member.user.tag} (${member.id})`)
      .addFields(
        { name: 'Member Count', value: String(member.guild.memberCount), inline: true },
      )
      .setColor(config.errorColor)
      .setTimestamp());
  },
};
