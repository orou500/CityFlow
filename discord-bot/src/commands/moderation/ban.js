import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import Warning from '../../models/Warning.js';
import { embed, errorEmbed, successEmbed } from '../../utils/helpers.js';
import { getGuildConfig, logModAction } from '../../utils/guildConfig.js';

export default {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a user')
    .addUserOption((o) => o.setName('user').setDescription('User to ban').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Reason'))
    .addIntegerOption((o) => o.setName('days').setDescription('Days of messages to delete (0-7)').setMinValue(0).setMaxValue(7))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
  cooldown: 5,

  async execute(interaction) {
    const user = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') || 'No reason provided';
    const days = interaction.options.getInteger('days') || 0;
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);

    if (member && member.roles.highest.position >= interaction.member.roles.highest.position) {
      return interaction.reply({ embeds: [errorEmbed('Error', 'Cannot ban someone with equal or higher role.')], ephemeral: true });
    }
    if (member && !member.bannable) {
      return interaction.reply({ embeds: [errorEmbed('Error', 'I cannot ban this user.')], ephemeral: true });
    }

    try {
      await user.send({ embeds: [embed('Banned', `You have been banned from **${interaction.guild.name}**.\n\n**Reason:** ${reason}`)] });
    } catch {}

    await interaction.guild.members.ban(user.id, { deleteMessageDays: days, reason });

    await Warning.create({
      guildId: interaction.guildId,
      userId: user.id,
      moderatorId: interaction.user.id,
      reason,
      action: 'ban',
    });

    const guildCfg = await getGuildConfig(interaction.guildId);
    await logModAction(interaction.guild, guildCfg, embed('Banned', `**${user.tag}** banned by **${interaction.user.tag}**\n\nReason: ${reason}${days ? `\nMessages deleted: ${days} day(s)` : ''}`));

    return interaction.reply({ embeds: [successEmbed('Banned', `${user.tag} has been banned.`)] });
  },
};
