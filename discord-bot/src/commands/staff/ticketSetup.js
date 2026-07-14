import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { embed, successEmbed, errorEmbed } from '../../utils/helpers.js';
import { getGuildConfig, updateGuildConfig } from '../../utils/guildConfig.js';
import config from '../../config.js';
import logger from '../../utils/logger.js';

export default {
  data: new SlashCommandBuilder()
    .setName('ticket-setup')
    .setDescription('Set up the ticket system')
    .addChannelOption((o) => o.setName('channel').setDescription('Channel for ticket panel').setRequired(true).addChannelTypes(ChannelType.GuildText))
    .addRoleOption((o) => o.setName('staff-role').setDescription('Staff role for tickets').setRequired(true))
    .addChannelOption((o) => o.setName('log-channel').setDescription('Ticket log channel').addChannelTypes(ChannelType.GuildText))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  cooldown: 10,

  async execute(interaction) {
    const channel = interaction.options.getChannel('channel');
    const staffRole = interaction.options.getRole('staff-role');
    const logChannel = interaction.options.getChannel('log-channel');

    let category = interaction.guild.channels.cache.find((c) => c.name === 'tickets' && c.type === ChannelType.GuildCategory);
    if (!category) {
      category = await interaction.guild.channels.create({
        name: 'tickets',
        type: ChannelType.GuildCategory,
        reason: 'Ticket system setup',
      });
    }

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket_support').setLabel('Support').setEmoji({ name: '\u{1F4AC}' }).setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('ticket_bug').setLabel('Bug Report').setEmoji({ name: '\u{1F41B}' }).setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('ticket_appeal').setLabel('Appeal').setEmoji({ name: '\u2696\uFE0F' }).setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('ticket_partnership').setLabel('Partnership').setEmoji({ name: '\u{1F91D}' }).setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('ticket_suggestion').setLabel('Suggestion').setEmoji({ name: '\u{1F4A1}' }).setStyle(ButtonStyle.Secondary),
    );

    await channel.send({
      embeds: [
        embed('Support Tickets', 'Click a button below to create a ticket.\n\n\u2022 **Support** \u2014 General questions\n\u2022 **Bug Report** \u2014 Report a bug\n\u2022 **Appeal** \u2014 Ban/mute appeals\n\u2022 **Partnership** \u2014 Business inquiries\n\u2022 **Suggestion** \u2014 Feature ideas'),
      ],
      components: [row],
    });

    await updateGuildConfig(interaction.guildId, {
      'tickets.enabled': true,
      'tickets.categoryId': category.id,
      'tickets.logChannelId': logChannel?.id || channel.id,
      'tickets.staffRoleId': staffRole.id,
    });

    return interaction.reply({
      embeds: [successEmbed('Ticket System Set Up', `Category: ${category.name}\nStaff: <@&${staffRole.id}>`)],
      ephemeral: true,
    });
  },
};
