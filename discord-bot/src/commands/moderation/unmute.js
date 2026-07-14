import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import Warning from '../../models/Warning.js';
import { successEmbed, errorEmbed } from '../../utils/helpers.js';
import { getGuildConfig, logModAction } from '../../utils/guildConfig.js';
import { embed } from '../../utils/helpers.js';

export default {
  data: new SlashCommandBuilder()
    .setName('unmute')
    .setDescription('Unmute a user')
    .addUserOption((o) => o.setName('user').setDescription('User to unmute').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  cooldown: 3,

  async execute(interaction) {
    const user = interaction.options.getUser('user');
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);

    if (!member) return interaction.reply({ embeds: [errorEmbed('Error', 'User not found.')], ephemeral: true });

    const guildCfg = await getGuildConfig(interaction.guildId);
    const muteRoleId = guildCfg?.moderation?.muteRoleId;

    if (!muteRoleId) return interaction.reply({ embeds: [errorEmbed('Error', 'Mute role not configured.')], ephemeral: true });

    const muteRole = await interaction.guild.roles.fetch(muteRoleId);
    if (!muteRole) return interaction.reply({ embeds: [errorEmbed('Error', 'Mute role not found.')], ephemeral: true });

    if (!member.roles.cache.has(muteRoleId)) {
      return interaction.reply({ embeds: [errorEmbed('Error', 'User is not muted.')], ephemeral: true });
    }

    await member.roles.remove(muteRole);

    await Warning.updateMany(
      { guildId: interaction.guildId, userId: user.id, action: 'mute', active: true },
      { active: false },
    );

    try {
      await user.send({ embeds: [embed('Unmuted', `You have been unmuted in **${interaction.guild.name}**.`)] });
    } catch {}

    await logModAction(interaction.guild, guildCfg, embed('Unmuted', `**${user.tag}** unmuted by **${interaction.user.tag}**`));

    return interaction.reply({ embeds: [successEmbed('Unmuted', `${user.tag} has been unmuted.`)] });
  },
};
