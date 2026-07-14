import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import Warning from '../../models/Warning.js';
import { embed, errorEmbed, successEmbed } from '../../utils/helpers.js';
import { getGuildConfig, logModAction } from '../../utils/guildConfig.js';

export default {
  data: new SlashCommandBuilder()
    .setName('unban')
    .setDescription('Unban a user')
    .addStringOption((o) => o.setName('userid').setDescription('User ID to unban').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
  cooldown: 5,

  async execute(interaction) {
    const userId = interaction.options.getString('userid');

    try {
      const ban = await interaction.guild.bans.fetch(userId);
      if (!ban) return interaction.reply({ embeds: [errorEmbed('Error', 'User is not banned.')], ephemeral: true });
    } catch {
      return interaction.reply({ embeds: [errorEmbed('Error', 'User not found or not banned.')], ephemeral: true });
    }

    await interaction.guild.members.unban(userId);

    await Warning.updateMany(
      { guildId: interaction.guildId, userId, action: 'ban', active: true },
      { active: false },
    );

    const guildCfg = await getGuildConfig(interaction.guildId);
    await logModAction(interaction.guild, guildCfg, embed('Unbanned', `User \`${userId}\` unbanned by **${interaction.user.tag}**`));

    return interaction.reply({ embeds: [successEmbed('Unbanned', `User \`${userId}\` has been unbanned.`)] });
  },
};
