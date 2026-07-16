import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { errorEmbed } from '../../utils/helpers.js';
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
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();

      const e = new EmbedBuilder()
        .setTitle('CityFlow Statistics')
        .setColor(0x1e90ff)
        .setTimestamp()
        .addFields(
          { name: 'Total Players', value: `${data.playersCount || 0}`, inline: true },
          { name: 'Total Properties', value: `${data.propertiesCount || 0}`, inline: true },
          { name: 'Total Cities', value: `${data.citiesCount || 0}`, inline: true },
          { name: 'Total Transactions', value: `${data.transactionsCount || 0}`, inline: true },
        );

      return interaction.editReply({ embeds: [e] });
    } catch (error) {
      console.error(`[STATS]`, error);
      try {
        await interaction.editReply({ embeds: [errorEmbed('Error', 'Failed to fetch stats.')] });
      } catch {
        await interaction.followUp({ embeds: [errorEmbed('Error', 'Failed to fetch stats.')], ephemeral: true }).catch(() => {});
      }
    }
  },
};
