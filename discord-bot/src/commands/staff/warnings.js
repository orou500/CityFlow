import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import Warning from '../../models/Warning.js';
import { embed, errorEmbed } from '../../utils/helpers.js';

export default {
  data: new SlashCommandBuilder()
    .setName('warnings')
    .setDescription('View warnings for a user')
    .addUserOption((o) => o.setName('user').setDescription('User to check').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  cooldown: 3,

  async execute(interaction) {
    const user = interaction.options.getUser('user');
    const warnings = await Warning.find({ guildId: interaction.guildId, userId: user.id }).sort({ createdAt: -1 }).limit(25);

    if (warnings.length === 0) {
      return interaction.reply({ embeds: [embed('Warnings', `${user.tag} has no warnings.`)] });
    }

    const lines = warnings.map((w, i) => {
      const date = `<t:${Math.floor(w.createdAt.getTime() / 1000)}:d>`;
      const status = w.active ? 'Active' : 'Resolved';
      return `**${i + 1}.** [${status}] \`${w.action}\` by <@${w.moderatorId}> on ${date}\n> ${w.reason}`;
    });

    return interaction.reply({ embeds: [embed(`Warnings — ${user.tag}`, lines.join('\n\n'))] });
  },
};
