import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import config from '../../config.js';

export default {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show all available commands'),
  cooldown: 5,

  async execute(interaction) {
    const e = new EmbedBuilder()
      .setTitle('CityFlow Bot Commands')
      .setColor(config.embedColor)
      .setTimestamp()
      .addFields(
        {
          name: 'Moderation',
          value: '`/warn` `/mute` `/unmute` `/kick` `/ban` `/unban` `/timeout` `/purge` `/slowmode`',
        },
        {
          name: 'Staff Tools',
          value: '`/userinfo` `/serverinfo` `/warnings` `/infractions` `/nickname` `/lock` `/unlock`',
        },
        {
          name: 'CityFlow',
          value: '`/profile` `/leaderboard` `/stats`',
        },
        {
          name: 'Setup (Admin)',
          value: '`/config` `/verify-setup` `/ticket-setup` `/suggestion-setup`',
        },
        {
          name: 'Community',
          value: '`/suggest` `/suggestion-review`',
        },
      );

    return interaction.reply({ embeds: [e], ephemeral: true });
  },
};
