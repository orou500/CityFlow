import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { embed, errorEmbed } from '../../utils/helpers.js';
import config from '../../config.js';

export default {
  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription('View CityFlow global statistics'),
  cooldown: 10,

  async execute(interaction) {
    await interaction.deferReply();

    try {
      const res = await fetch(`${config.apiUrl}/stats`);
      if (!res.ok) return interaction.editReply({ embeds: [errorEmbed('Error', 'Failed to fetch stats.')] });

      const data = await res.json();

      const e = embed('CityFlow Statistics', '')
        .addFields(
          { name: 'Total Players', value: String(data.playersCount || 0), inline: true },
          { name: 'Total Properties', value: String(data.propertiesCount || 0), inline: true },
          { name: 'Total Cities', value: String(data.citiesCount || 0), inline: true },
          { name: 'Total Transactions', value: String(data.transactionsCount || 0), inline: true },
        )
        .setColor(0x1e90ff)
        .setTimestamp();

      return interaction.editReply({ embeds: [e] });
    } catch (error) {
      console.error(`[STATS] Error: ${error.message}`);
      return interaction.editReply({ embeds: [errorEmbed('Error', 'Failed to fetch stats.')] });
    }
  },
};
