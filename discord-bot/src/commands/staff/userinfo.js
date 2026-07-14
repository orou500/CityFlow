import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { embed } from '../../utils/helpers.js';
import Warning from '../../models/Warning.js';

export default {
  data: new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('Get information about a user')
    .addUserOption((o) => o.setName('user').setDescription('User to inspect'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  cooldown: 3,

  async execute(interaction) {
    const targetUser = interaction.options.getUser('user') || interaction.user;
    const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

    const warnings = await Warning.countDocuments({ guildId: interaction.guildId, userId: targetUser.id, active: true });
    const totalActions = await Warning.countDocuments({ guildId: interaction.guildId, userId: targetUser.id });

    const e = embed('User Info', '').setColor(0x1e90ff)
      .setThumbnail(targetUser.displayAvatarURL({ size: 256 }))
      .addFields(
        { name: 'User', value: `${targetUser.tag}\n\`${targetUser.id}\``, inline: true },
        { name: 'Created', value: `<t:${Math.floor(targetUser.createdTimestamp / 1000)}:R>`, inline: true },
      );

    if (member) {
      e.addFields(
        { name: 'Joined', value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`, inline: true },
        { name: 'Roles', value: member.roles.cache.filter((r) => r.id !== interaction.guildId).map((r) => `<@&${r.id}>`).join(', ') || 'None', inline: false },
        { name: 'Active Warnings', value: String(warnings), inline: true },
        { name: 'Total Infractions', value: String(totalActions), inline: true },
      );
      if (member.premiumSince) {
        e.addFields({ name: 'Boosting Since', value: `<t:${Math.floor(member.premiumSinceTimestamp / 1000)}:R>`, inline: true });
      }
    }

    return interaction.reply({ embeds: [e] });
  },
};
