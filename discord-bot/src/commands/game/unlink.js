import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import LinkCode from '../../models/LinkCode.js';
import logger from '../../utils/logger.js';

export default {
  data: new SlashCommandBuilder()
    .setName('unlink')
    .setDescription('Unlink your CityFlow account from Discord'),
  cooldown: 30,

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    try {
      const result = await LinkCode.deleteMany({ discordUserId: interaction.user.id });

      const embed = new EmbedBuilder()
        .setTitle('🔓 Account Unlinked')
        .setDescription('Your Discord account has been unlinked from CityFlow.\n\nYou can use `/link` to link again at any time.')
        .setColor(0x44ff44)
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
      logger.info(`Discord user ${interaction.user.id} unlinked their account`);
    } catch (err) {
      logger.error(`Unlink command error: ${err.message}`);
      await interaction.editReply({
        embeds: [new EmbedBuilder().setTitle('Error').setDescription('Failed to unlink account.').setColor(0xff4444)],
      });
    }
  },
};
