import { Events, EmbedBuilder } from 'discord.js';
import { getGuildConfig, logAction } from '../utils/guildConfig.js';
import config from '../config.js';

export default {
  name: Events.GuildMemberAdd,
  once: false,

  async execute(member, client) {
    const guildCfg = await getGuildConfig(member.guild.id);

    if (guildCfg?.welcome?.enabled && guildCfg.welcome.channelId) {
      const channel = await member.guild.channels.fetch(guildCfg.welcome.channelId).catch(() => null);
      if (channel) {
        const msg = (guildCfg.welcome.message || 'Welcome {user} to {server}!')
          .replace('{user}', `<@${member.id}>`)
          .replace('{server}', member.guild.name);

        await channel.send({
          embeds: [
            new EmbedBuilder()
              .setTitle('Welcome!')
              .setDescription(msg)
              .setColor(config.embedColor)
              .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
              .setTimestamp(),
          ],
        });
      }
    }

    if (guildCfg?.moderation?.autoRoleEnabled && guildCfg.moderation.autoRoleId) {
      const role = await member.guild.roles.fetch(guildCfg.moderation.autoRoleId).catch(() => null);
      if (role) {
        await member.roles.add(role).catch(() => {});
      }
    }

    await logAction(member.guild, guildCfg, new EmbedBuilder()
      .setTitle('Member Joined')
      .setDescription(`${member.user.tag} (${member.id})`)
      .addFields(
        { name: 'Account Created', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true },
        { name: 'Member Count', value: String(member.guild.memberCount), inline: true },
      )
      .setColor(config.successColor)
      .setTimestamp());
  },
};
