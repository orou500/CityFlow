import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { errorEmbed } from '../../utils/helpers.js';
import config from '../../config.js';

export default {
  data: new SlashCommandBuilder().setName('market').setDescription('View current CityFlow market status'),
  cooldown: 10,

  async execute(interaction) {
    await interaction.deferReply();

    try {
      const [eventsRes, statsRes] = await Promise.all([
        fetch(`${config.apiUrl}/events/active`),
        fetch(`${config.apiUrl}/stats/overview`),
      ]);

      if (!eventsRes.ok || !statsRes.ok) {
        return interaction.editReply({ embeds: [errorEmbed('Error', 'Failed to fetch market data.')] });
      }

      const events = await eventsRes.json();
      const stats = await statsRes.json();

      const e = new EmbedBuilder()
        .setTitle('📊 CityFlow Market Status')
        .setColor(0x1e90ff)
        .setTimestamp()
        .addFields(
          { name: 'Total Players', value: String(stats.totalPlayers || 0), inline: true },
          { name: 'Total Properties', value: String(stats.totalProperties || 0), inline: true },
          {
            name: 'Money in Circulation',
            value: `$${(stats.moneyInCirculation || 0).toLocaleString()}`,
            inline: true,
          },
          { name: 'Total Transactions', value: String(stats.totalTransactions || 0), inline: true },
        );

      if (events.length > 0) {
        const eventList = events
          .slice(0, 5)
          .map((ev) => `• **${ev.name}** (${ev.type}) - ${ev.remainingTicks} ticks remaining`)
          .join('\n');
        e.addFields({ name: 'Active Events', value: eventList || 'None', inline: false });
      } else {
        e.addFields({ name: 'Active Events', value: 'No active events', inline: false });
      }

      return interaction.editReply({ embeds: [e] });
    } catch (error) {
      return interaction.editReply({ embeds: [errorEmbed('Error', 'Failed to fetch market status.')] });
    }
  },
};
