import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import crypto from 'crypto';
import LinkCode from '../../models/LinkCode.js';
import config from '../../config.js';
import logger from '../../utils/logger.js';

export default {
  data: new SlashCommandBuilder()
    .setName('link')
    .setDescription('Link your CityFlow account to receive personalized notifications'),
  cooldown: 60,

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    try {
      await LinkCode.deleteMany({ discordUserId: interaction.user.id, used: false });

      const code = crypto.randomInt(100000, 999999).toString();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

      await LinkCode.create({ code, discordUserId: interaction.user.id, expiresAt });

      const embed = new EmbedBuilder()
        .setTitle('🔗 Link Your CityFlow Account')
        .setDescription('Enter this code in CityFlow to link your account:')
        .addFields({ name: 'Your Linking Code', value: `\`${code}\``, inline: false })
        .addFields({
          name: 'How to link',
          value: '1. Go to your CityFlow profile settings\n2. Click "Link Discord"\n3. Enter the code above\n4. Your accounts will be connected!',
          inline: false,
        })
        .setColor(0x5865f2)
        .setFooter({ text: 'Code expires in 10 minutes' })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
      logger.info(`Link code generated for Discord user ${interaction.user.id}`);
    } catch (err) {
      logger.error(`Link command error: ${err.message}`);
      await interaction.editReply({
        embeds: [new EmbedBuilder().setTitle('Error').setDescription('Failed to generate link code.').setColor(0xff4444)],
      });
    }
  },
};
