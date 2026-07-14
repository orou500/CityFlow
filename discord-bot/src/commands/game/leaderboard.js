import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { embed, errorEmbed } from '../../utils/helpers.js';
import config from '../../config.js';

export default {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('View CityFlow leaderboards')
    .addStringOption((o) =>
      o
        .setName('type')
        .setDescription('Leaderboard type')
        .addChoices(
          { name: 'Wealth', value: 'wealth' },
          { name: 'Properties', value: 'properties' },
          { name: 'Level', value: 'level' },
        ),
    ),
  cooldown: 10,

  async execute(interaction) {
    const type = interaction.options.getString('type') || 'wealth';

    await interaction.deferReply();

    try {
      const res = await fetch(`${config.apiUrl}/stats/leaderboard?type=${type}&limit=10`);
      if (!res.ok) return interaction.editReply({ embeds: [errorEmbed('Error', 'Failed to fetch leaderboard.')] });

      const data = await res.json();
      const players = data.leaderboard || data.players || data;

      if (!Array.isArray(players) || players.length === 0) {
        return interaction.editReply({ embeds: [errorEmbed('Leaderboard', 'No players found.')] });
      }

      const medals = ['\u{1F947}', '\u{1F948}', '\u{1F949}'];
      const lines = players.map((p, i) => {
        const medal = medals[i] || `\`${i + 1}.\``;
        const val = type === 'wealth' ? `$${(p.netWorth || p.balance || 0).toLocaleString()}` : type === 'properties' ? String(p.propertyCount || p.ownedProperties?.length || 0) : `Lv. ${p.level || 1}`;
        return `${medal} **${p.username}** \u2014 ${val}`;
      });

      const titleMap = { wealth: 'Top Wealth', properties: 'Most Properties', level: 'Highest Level' };
      return interaction.editReply({ embeds: [embed(titleMap[type], lines.join('\n'))] });
    } catch (error) {
      return interaction.editReply({ embeds: [errorEmbed('Error', 'Failed to fetch leaderboard.')] });
    }
  },
};
