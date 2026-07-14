import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import Warning from '../../models/Warning.js';
import { embed, errorEmbed, successEmbed } from '../../utils/helpers.js';
import { getGuildConfig, logModAction } from '../../utils/guildConfig.js';

export default {
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Kick a user')
    .addUserOption((o) => o.setName('user').setDescription('User to kick').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Reason'))
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),
  cooldown: 5,

  async execute(interaction) {
    const user = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') || 'No reason provided';
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);

    if (!member) return interaction.reply({ embeds: [errorEmbed('Error', 'User not found.')], ephemeral: true });
    if (member.roles.highest.position >= interaction.member.roles.highest.position) {
      return interaction.reply({ embeds: [errorEmbed('Error', 'Cannot kick someone with equal or higher role.')], ephemeral: true });
    }
    if (!member.kickable) {
      return interaction.reply({ embeds: [errorEmbed('Error', 'I cannot kick this user.')], ephemeral: true });
    }

    try {
      await user.send({ embeds: [embed('Kicked', `You have been kicked from **${interaction.guild.name}**.\n\n**Reason:** ${reason}`)] });
    } catch {}

    await member.kick(reason);

    await Warning.create({
      guildId: interaction.guildId,
      userId: user.id,
      moderatorId: interaction.user.id,
      reason,
      action: 'kick',
    });

    const guildCfg = await getGuildConfig(interaction.guildId);
    await logModAction(interaction.guild, guildCfg, embed('Kicked', `**${user.tag}** kicked by **${interaction.user.tag}**\n\nReason: ${reason}`));

    return interaction.reply({ embeds: [successEmbed('Kicked', `${user.tag} has been kicked.`)] });
  },
};
