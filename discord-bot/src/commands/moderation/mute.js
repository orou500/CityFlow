import { SlashCommandBuilder, PermissionFlagsBits, GuildMember } from 'discord.js';
import Warning from '../../models/Warning.js';
import { embed, errorEmbed, successEmbed, parseDuration, formatDuration } from '../../utils/helpers.js';
import { getGuildConfig, logModAction } from '../../utils/guildConfig.js';

export default {
  data: new SlashCommandBuilder()
    .setName('mute')
    .setDescription('Mute a user')
    .addUserOption((o) => o.setName('user').setDescription('User to mute').setRequired(true))
    .addStringOption((o) => o.setName('duration').setDescription('Duration (e.g. 10m, 1h, 1d)').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Reason'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  cooldown: 5,

  async execute(interaction) {
    const user = interaction.options.getUser('user');
    const durationStr = interaction.options.getString('duration');
    const reason = interaction.options.getString('reason') || 'No reason provided';
    const duration = parseDuration(durationStr);

    if (!duration) return interaction.reply({ embeds: [errorEmbed('Error', 'Invalid duration. Use format: `10m`, `1h`, `1d`')], ephemeral: true });
    if (duration > 2419200000) return interaction.reply({ embeds: [errorEmbed('Error', 'Max mute duration is 28 days.')], ephemeral: true });

    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (!member) return interaction.reply({ embeds: [errorEmbed('Error', 'User not found.')], ephemeral: true });
    if (member.roles.highest.position >= interaction.member.roles.highest.position) {
      return interaction.reply({ embeds: [errorEmbed('Error', 'Cannot mute someone with equal or higher role.')], ephemeral: true });
    }

    const guildCfg = await getGuildConfig(interaction.guildId);
    const muteRoleId = guildCfg?.moderation?.muteRoleId;

    if (!muteRoleId) {
      return interaction.reply({ embeds: [errorEmbed('Error', 'Mute role not configured. Set it with `/config`.')], ephemeral: true });
    }

    const muteRole = await interaction.guild.roles.fetch(muteRoleId);
    if (!muteRole) return interaction.reply({ embeds: [errorEmbed('Error', 'Mute role not found.')], ephemeral: true });

    await member.roles.add(muteRole);
    await Warning.create({
      guildId: interaction.guildId,
      userId: user.id,
      moderatorId: interaction.user.id,
      reason,
      action: 'mute',
      duration,
    });

    setTimeout(async () => {
      try {
        const m = await interaction.guild.members.fetch(user.id);
        await m.roles.remove(muteRole).catch(() => {});
      } catch {}
    }, duration);

    try {
      await user.send({ embeds: [embed('Muted', `You have been muted in **${interaction.guild.name}** for **${formatDuration(duration)}**.\n\n**Reason:** ${reason}`)] });
    } catch {}

    await logModAction(interaction.guild, guildCfg, embed('Muted', `**${user.tag}** muted by **${interaction.user.tag}** for **${formatDuration(duration)}**\n\nReason: ${reason}`));

    return interaction.reply({ embeds: [successEmbed('Muted', `${user.tag} has been muted for ${formatDuration(duration)}.`)] });
  },
};
