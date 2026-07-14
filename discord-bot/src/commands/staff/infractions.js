import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import Warning from '../../models/Warning.js';
import { embed } from '../../utils/helpers.js';

export default {
  data: new SlashCommandBuilder()
    .setName('infractions')
    .setDescription('View all infractions for a user')
    .addUserOption((o) => o.setName('user').setDescription('User to check').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  cooldown: 3,

  async execute(interaction) {
    const user = interaction.options.getUser('user');
    const actions = await Warning.find({ guildId: interaction.guildId, userId: user.id }).sort({ createdAt: -1 });

    if (actions.length === 0) {
      return interaction.reply({ embeds: [embed('Infractions', `${user.tag} has no infractions.`)] });
    }

    const byAction = {};
    for (const a of actions) {
      byAction[a.action] = (byAction[a.action] || 0) + 1;
    }

    const breakdown = Object.entries(byAction).map(([k, v]) => `**${k}**: ${v}`).join('\n');
    const active = actions.filter((a) => a.active).length;

    const e = embed(`Infractions — ${user.tag}`, '')
      .addFields(
        { name: 'Total', value: String(actions.length), inline: true },
        { name: 'Active', value: String(active), inline: true },
        { name: 'Breakdown', value: breakdown, inline: false },
      );

    return interaction.reply({ embeds: [e] });
  },
};
