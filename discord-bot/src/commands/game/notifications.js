import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import GuildConfig from '../../models/GuildConfig.js';
import logger from '../../utils/logger.js';

export default {
  data: new SlashCommandBuilder()
    .setName('notifications')
    .setDescription('Manage CityFlow notification channel settings')
    .addSubcommand((sub) =>
      sub
        .setName('set')
        .setDescription('Set a notification channel')
        .addStringOption((o) =>
          o
            .setName('type')
            .setDescription('Notification type')
            .setRequired(true)
            .addChoices(
              { name: 'Announcements', value: 'announcements' },
              { name: 'World Events', value: 'worldEvents' },
              { name: 'Achievements', value: 'achievements' },
              { name: 'System Alerts', value: 'systemAlerts' },
            ),
        )
        .addChannelOption((o) => o.setName('channel').setDescription('Channel to post notifications').setRequired(true)),
    )
    .addSubcommand((sub) => sub.setName('status').setDescription('Show current notification channel configuration')),
  cooldown: 5,

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (!interaction.memberPermissions?.has('Administrator')) {
      return interaction.reply({
        embeds: [new EmbedBuilder().setTitle('Permission Denied').setDescription('Server administrators only.').setColor(0xff4444)],
        ephemeral: true,
      });
    }

    if (subcommand === 'status') {
      return this.showStatus(interaction);
    }

    if (subcommand === 'set') {
      return this.setChannel(interaction);
    }
  },

  async showStatus(interaction) {
    await interaction.deferReply({ ephemeral: true });

    try {
      const config = await GuildConfig.findOne({ guildId: interaction.guildId });
      const channels = config?.cityflow?.notificationChannels || {};

      const e = new EmbedBuilder()
        .setTitle('🔔 CityFlow Notification Channels')
        .setColor(0x1e90ff)
        .setTimestamp()
        .addFields(
          {
            name: '📢 Announcements',
            value: channels.announcements ? `<#${channels.announcements}>` : 'Not configured',
            inline: true,
          },
          {
            name: '🌎 World Events',
            value: channels.worldEvents ? `<#${channels.worldEvents}>` : 'Not configured',
            inline: true,
          },
          {
            name: '🏆 Achievements',
            value: channels.achievements ? `<#${channels.achievements}>` : 'Not configured',
            inline: true,
          },
          {
            name: '🚨 System Alerts',
            value: channels.systemAlerts ? `<#${channels.systemAlerts}>` : 'Not configured',
            inline: true,
          },
        )
        .setFooter({ text: 'Use /notifications set to configure channels' });

      return interaction.editReply({ embeds: [e] });
    } catch (err) {
      logger.error(`Notifications status error: ${err.message}`);
      return interaction.editReply({
        embeds: [new EmbedBuilder().setTitle('Error').setDescription('Failed to load settings.').setColor(0xff4444)],
      });
    }
  },

  async setChannel(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const type = interaction.options.getString('type');
    const channel = interaction.options.getChannel('channel');

    if (!channel.isTextBased()) {
      return interaction.editReply({
        embeds: [new EmbedBuilder().setTitle('Error').setDescription('Channel must be a text channel.').setColor(0xff4444)],
      });
    }

    try {
      const update = {};
      update[`cityflow.notificationChannels.${type}`] = channel.id;

      await GuildConfig.findOneAndUpdate(
        { guildId: interaction.guildId },
        {
          $set: update,
          $setOnInsert: { guildId: interaction.guildId, guildName: interaction.guild.name },
        },
        { upsert: true },
      );

      const typeLabels = {
        announcements: '📢 Announcements',
        worldEvents: '🌎 World Events',
        achievements: '🏆 Achievements',
        systemAlerts: '🚨 System Alerts',
      };

      const e = new EmbedBuilder()
        .setTitle('✅ Channel Updated')
        .setDescription(`${typeLabels[type]} notifications will now be sent to <#${channel.id}>`)
        .setColor(0x44ff44)
        .setTimestamp();

      return interaction.editReply({ embeds: [e] });
    } catch (err) {
      logger.error(`Notifications set error: ${err.message}`);
      return interaction.editReply({
        embeds: [new EmbedBuilder().setTitle('Error').setDescription('Failed to update settings.').setColor(0xff4444)],
      });
    }
  },
};
