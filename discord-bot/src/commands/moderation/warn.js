import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import Warning from '../../models/Warning.js';
import { embed, errorEmbed, successEmbed } from '../../utils/helpers.js';
import { getGuildConfig, logModAction } from '../../utils/guildConfig.js';
import config from '../../config.js';

export default {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Warn a user')
    .addUserOption((o) => o.setName('user').setDescription('User to warn').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Reason').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  cooldown: 5,

  async execute(interaction) {
    const user = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason');
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);

    if (!member) return interaction.reply({ embeds: [errorEmbed('Error', 'User not found.')], ephemeral: true });
    if (member.roles.highest.position >= interaction.member.roles.highest.position) {
      return interaction.reply({ embeds: [errorEmbed('Error', 'Cannot warn someone with equal or higher role.')], ephemeral: true });
    }

    await Warning.create({
      guildId: interaction.guildId,
      userId: user.id,
      moderatorId: interaction.user.id,
      reason,
      action: 'warn',
    });

    const count = await Warning.countDocuments({ guildId: interaction.guildId, userId: user.id, active: true });

    try {
      await user.send({ embeds: [embed('Warning', `You have been warned in **${interaction.guild.name}**.\n\n**Reason:** ${reason}\n**Active warnings:** ${count}`)] });
    } catch {}

    const guildCfg = await getGuildConfig(interaction.guildId);
    await logModAction(interaction.guild, guildCfg, embed('Warned', `**${user.tag}** warned by **${interaction.user.tag}**\n\nReason: ${reason}\nActive warnings: ${count}`));

    return interaction.reply({ embeds: [successEmbed('Warned', `${user.tag} has been warned. (${count} active warnings)`)] });
  },
};
