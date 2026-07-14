import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { successEmbed, errorEmbed } from '../../utils/helpers.js';

export default {
  data: new SlashCommandBuilder()
    .setName('nickname')
    .setDescription('Change a user\'s nickname')
    .addUserOption((o) => o.setName('user').setDescription('User').setRequired(true))
    .addStringOption((o) => o.setName('nickname').setDescription('New nickname (empty to reset)').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames),
  cooldown: 3,

  async execute(interaction) {
    const user = interaction.options.getUser('user');
    const nickname = interaction.options.getString('nickname');
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);

    if (!member) return interaction.reply({ embeds: [errorEmbed('Error', 'User not found.')], ephemeral: true });
    if (!member.manageable) return interaction.reply({ embeds: [errorEmbed('Error', 'Cannot change this user\'s nickname.')], ephemeral: true });

    try {
      await member.setNickname(nickname === 'reset' ? null : nickname, `Set by ${interaction.user.tag}`);
      return interaction.reply({ embeds: [successEmbed('Nickname', `Nickname updated for **${user.tag}**.`)] });
    } catch (error) {
      return interaction.reply({ embeds: [errorEmbed('Error', error.message)], ephemeral: true });
    }
  },
};
