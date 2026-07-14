import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { embed, successEmbed, errorEmbed } from '../../utils/helpers.js';
import { getGuildConfig, updateGuildConfig } from '../../utils/guildConfig.js';

export default {
  data: new SlashCommandBuilder()
    .setName('suggestion-setup')
    .setDescription('Set up the suggestion system')
    .addChannelOption((o) => o.setName('channel').setDescription('Channel for suggestions').setRequired(true).addChannelTypes(ChannelType.GuildText))
    .addChannelOption((o) => o.setName('review-channel').setDescription('Staff review channel').addChannelTypes(ChannelType.GuildText))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  cooldown: 10,

  async execute(interaction) {
    const channel = interaction.options.getChannel('channel');
    const reviewChannel = interaction.options.getChannel('review-channel');

    await updateGuildConfig(interaction.guildId, {
      'suggestions.enabled': true,
      'suggestions.channelId': channel.id,
      'suggestions.reviewChannelId': reviewChannel?.id || channel.id,
    });

    return interaction.reply({
      embeds: [successEmbed('Suggestion System Set Up', `Suggestions: <#${channel.id}>\nReviews: <#${reviewChannel?.id || channel.id}>`)],
      ephemeral: true,
    });
  },
};
