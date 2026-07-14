import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import Warning from '../../models/Warning.js';
import { embed, errorEmbed, successEmbed, parseDuration, formatDuration } from '../../utils/helpers.js';
import { getGuildConfig, logModAction } from '../../utils/guildConfig.js';

export default {
  data: new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('Timeout a user')
    .addUserOption((o) => o.setName('user').setDescription('User to timeout').setRequired(true))
    .addStringOption((o) => o.setName('duration').setDescription('Duration (e.g. 10m, 1h, 7d)').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Reason'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  cooldown: 5,

  async execute(interaction) {
    const user = interaction.options.getUser('user');
    const durationStr = interaction.options.getString('duration');
    const reason = interaction.options.getString('reason') || 'No reason provided';
    const duration = parseDuration(durationStr);

    if (!duration) return interaction.reply({ embeds: [errorEmbed('Error', 'Invalid duration. Use format: `10m`, `1h`, `7d`')], ephemeral: true });
    if (duration > 2419200000) return interaction.reply({ embeds: [errorEmbed('Error', 'Max timeout is 28 days.')], ephemeral: true });

    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (!member) return interaction.reply({ embeds: [errorEmbed('Error', 'User not found.')], ephemeral: true });
    if (member.roles.highest.position >= interaction.member.roles.highest.position) {
      return interaction.reply({ embeds: [errorEmbed('Error', 'Cannot timeout someone with equal or higher role.')], ephemeral: true });
    }

    await member.timeout(duration, reason);

    await Warning.create({
      guildId: interaction.guildId,
      userId: user.id,
      moderatorId: interaction.user.id,
      reason,
      action: 'timeout',
      duration,
    });

    try {
      await user.send({ embeds: [embed('Timed Out', `You have been timed out in **${interaction.guild.name}** for **${formatDuration(duration)}**.\n\n**Reason:** ${reason}`)] });
    } catch {}

    const guildCfg = await getGuildConfig(interaction.guildId);
    await logModAction(interaction.guild, guildCfg, embed('Timed Out', `**${user.tag}** timed out by **${interaction.user.tag}** for **${formatDuration(duration)}**\n\nReason: ${reason}`));

    return interaction.reply({ embeds: [successEmbed('Timed Out', `${user.tag} has been timed out for ${formatDuration(duration)}.`)] });
  },
};
