import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { embed, errorEmbed } from '../../utils/helpers.js';
import config from '../../config.js';

export default {
  data: new SlashCommandBuilder()
    .setName('profile')
    .setDescription('View a CityFlow player profile')
    .addStringOption((o) => o.setName('username').setDescription('CityFlow username').setRequired(true)),
  cooldown: 5,

  async execute(interaction) {
    const username = interaction.options.getString('username');

    await interaction.deferReply();

    try {
      const res = await fetch(`${config.apiUrl}/users/search?username=${encodeURIComponent(username)}`);
      if (!res.ok) return interaction.editReply({ embeds: [errorEmbed('Error', 'Player not found.')] });

      const data = await res.json();
      const u = data.user;

      const e = embed(`${u.username}'s Profile`, '')
        .setThumbnail(u.avatar ? `${config.apiUrl.replace('/api', '')}${u.avatar}` : null)
        .addFields(
          { name: 'Level', value: String(u.level || 1), inline: true },
          { name: 'XP', value: String(u.xp || 0), inline: true },
          { name: 'Net Worth', value: `$${(u.netWorth || 0).toLocaleString()}`, inline: true },
          { name: 'Balance', value: `$${(u.balance || 0).toLocaleString()}`, inline: true },
          { name: 'Properties', value: String(u.ownedProperties?.length || 0), inline: true },
          { name: 'Seasons Played', value: String(u.totalSeasonsCompleted || 0), inline: true },
        );

      return interaction.editReply({ embeds: [e] });
    } catch (error) {
      return interaction.editReply({ embeds: [errorEmbed('Error', 'Failed to fetch profile.')] });
    }
  },
};
