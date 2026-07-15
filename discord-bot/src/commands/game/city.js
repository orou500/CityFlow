import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { errorEmbed } from '../../utils/helpers.js';
import config from '../../config.js';

export default {
  data: new SlashCommandBuilder()
    .setName('city')
    .setDescription('View CityFlow city information')
    .addStringOption((o) => o.setName('name').setDescription('City name').setRequired(true)),
  cooldown: 5,

  async execute(interaction) {
    const name = interaction.options.getString('name');
    await interaction.deferReply();

    try {
      const res = await fetch(`${config.apiUrl}/cities`);
      if (!res.ok) return interaction.editReply({ embeds: [errorEmbed('Error', 'Failed to fetch cities.')] });

      const cities = await res.json();
      const city = cities.find(
        (c) => c.name.toLowerCase() === name.toLowerCase() || c.name.toLowerCase().includes(name.toLowerCase()),
      );

      if (!city) {
        return interaction.editReply({ embeds: [errorEmbed('Not Found', `City "${name}" not found.`)] });
      }

      const eventFields = [];
      if (city.activeEvents?.length > 0) {
        for (const ev of city.activeEvents) {
          if (ev.eventId) {
            eventFields.push({
              name: ev.eventId.name || 'Event',
              value: `${ev.eventId.description || ''}\nRemaining: ${ev.remainingTicks} ticks`,
              inline: false,
            });
          }
        }
      }

      const e = new EmbedBuilder()
        .setTitle(`🏙️ ${city.name}, ${city.country}`)
        .setColor(0x1e90ff)
        .setTimestamp()
        .addFields(
          { name: 'Population', value: city.population?.toLocaleString() || 'N/A', inline: true },
          { name: 'Demand Index', value: city.demandIndex?.toFixed(2) || 'N/A', inline: true },
          { name: 'Supply Index', value: city.supplyIndex?.toFixed(2) || 'N/A', inline: true },
          { name: 'Avg Price', value: `$${(city.avgPrice || 0).toLocaleString()}`, inline: true },
          { name: 'Growth Rate', value: `${((city.growthRate || 0) * 100).toFixed(1)}%`, inline: true },
          { name: 'Properties', value: String(city.propertyCount || 0), inline: true },
        );

      if (eventFields.length > 0) {
        e.addFields({ name: '\u200B', value: '**Active Events**', inline: false });
        e.addFields(...eventFields);
      }

      return interaction.editReply({ embeds: [e] });
    } catch (error) {
      return interaction.editReply({ embeds: [errorEmbed('Error', 'Failed to fetch city information.')] });
    }
  },
};
