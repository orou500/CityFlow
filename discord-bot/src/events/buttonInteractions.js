import { Events, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getGuildConfig } from '../utils/guildConfig.js';
import { embed, errorEmbed } from '../utils/helpers.js';
import config from '../config.js';
import logger from '../utils/logger.js';

export default {
  name: Events.InteractionCreate,
  once: false,

  async execute(interaction, client) {
    if (!interaction.isButton()) return;

    if (interaction.customId === 'verify_button') {
      await handleVerify(interaction, client);
    } else if (interaction.customId.startsWith('ticket_')) {
      await handleTicket(interaction, client);
    } else if (interaction.customId === 'ticket_close') {
      await handleCloseTicket(interaction, client);
    } else if (interaction.customId.startsWith('suggest_')) {
      await handleSuggestionVote(interaction, client);
    }
  },
};

async function handleVerify(interaction, client) {
  const guildCfg = await getGuildConfig(interaction.guild.id);
  if (!guildCfg?.verification?.enabled) return;

  const roleId = guildCfg.verification.roleId;
  if (!roleId) return interaction.reply({ embeds: [errorEmbed('Error', 'Verification role not configured.')], ephemeral: true });

  const role = await interaction.guild.roles.fetch(roleId).catch(() => null);
  if (!role) return interaction.reply({ embeds: [errorEmbed('Error', 'Verification role not found.')], ephemeral: true });

  if (interaction.member.roles.cache.has(roleId)) {
    return interaction.reply({ embeds: [embed('Already Verified', 'You are already verified.')], ephemeral: true });
  }

  try {
    await interaction.member.roles.add(roleId);

    const logChannelId = guildCfg.verification.logChannelId;
    if (logChannelId) {
      const logCh = await interaction.guild.channels.fetch(logChannelId).catch(() => null);
      if (logCh) {
        await logCh.send({
          embeds: [
            new EmbedBuilder()
              .setTitle('User Verified')
              .setDescription(`${interaction.user.tag} (${interaction.user.id})`)
              .setColor(config.successColor)
              .setTimestamp(),
          ],
        });
      }
    }

    await interaction.reply({ embeds: [embed('Verified', 'You have been verified! You now have access to the server.')], ephemeral: true });
  } catch (error) {
    await interaction.reply({ embeds: [errorEmbed('Error', 'Failed to verify. Contact staff.')], ephemeral: true });
  }
}

async function handleTicket(interaction, client) {
  const guildCfg = await getGuildConfig(interaction.guild.id);
  if (!guildCfg?.tickets?.enabled) return;

  const categoryMap = {
    ticket_support: 'support',
    ticket_bug: 'bug',
    ticket_appeal: 'appeal',
    ticket_partnership: 'partnership',
    ticket_suggestion: 'suggestion',
  };

  const category = categoryMap[interaction.customId] || 'support';
  const labelMap = { support: 'Support', bug: 'Bug Report', appeal: 'Appeal', partnership: 'Partnership', suggestion: 'Suggestion' };

  await interaction.deferReply({ ephemeral: true });

  const ticketChannel = await interaction.guild.channels.create({
    name: `ticket-${interaction.user.username}-${Date.now()}`,
    type: 0,
    parent: guildCfg.tickets.categoryId || null,
    permissionOverwrites: [
      { id: interaction.guild.id, deny: ['ViewChannel'] },
      { id: interaction.user.id, allow: ['ViewChannel', 'SendMessages'] },
      ...(guildCfg.tickets.staffRoleId ? [{ id: guildCfg.tickets.staffRoleId, allow: ['ViewChannel', 'SendMessages'] }] : []),
      { id: client.user.id, allow: ['ViewChannel', 'SendMessages'] },
    ],
    reason: `Ticket by ${interaction.user.tag}`,
  });

  const { Ticket } = await import('../models/Ticket.js');
  await Ticket.create({
    guildId: interaction.guild.id,
    channelId: ticketChannel.id,
    creatorId: interaction.user.id,
    category,
  });

  const closeRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket_close').setLabel('Close Ticket').setEmoji({ name: '\u{1F512}' }).setStyle(ButtonStyle.Danger),
  );

  await ticketChannel.send({
    embeds: [
      new EmbedBuilder()
        .setTitle(`${labelMap[category]} Ticket`)
        .setDescription(`Hello ${interaction.user}, thank you for creating a ticket.\nA staff member will assist you shortly.\n\n**Category:** ${labelMap[category]}`)
        .setColor(config.embedColor)
        .setTimestamp(),
    ],
    components: [closeRow],
    content: guildCfg.tickets.staffRoleId ? `<@&${guildCfg.tickets.staffRoleId}>` : '',
  });

  await interaction.editReply({ embeds: [embed('Ticket Created', `Your ticket has been created: <#${ticketChannel.id}>`)] });
}

async function handleCloseTicket(interaction, client) {
  const { Ticket } = await import('../models/Ticket.js');

  const ticket = await Ticket.findOne({ guildId: interaction.guild.id, channelId: interaction.channel.id, status: 'open' });
  if (!ticket) return interaction.reply({ embeds: [errorEmbed('Error', 'No open ticket found.')], ephemeral: true });

  await interaction.deferReply();

  const messages = [];
  let lastId;
  while (true) {
    const options = { limit: 100 };
    if (lastId) options.before = lastId;
    const fetched = await interaction.channel.messages.fetch(options);
    if (fetched.size === 0) break;
    messages.push(...fetched.values());
    lastId = fetched.last().id;
  }
  messages.reverse();

  const transcript = messages.map((m) => {
    const time = new Date(m.createdTimestamp).toISOString();
    return `[${time}] ${m.author.tag}: ${m.content || '*no content*'}`;
  }).join('\n');

  const transcriptEmbed = new EmbedBuilder()
    .setTitle('Ticket Transcript')
    .setDescription(`Ticket: ${ticket.category}\nCreator: <@${ticket.creatorId}>\nClosed by: <@${interaction.user.id}>\nMessages: ${messages.length}`)
    .setColor(config.embedColor)
    .setTimestamp();

  const guildCfg = await getGuildConfig(interaction.guild.id);
  if (guildCfg?.tickets?.logChannelId) {
    const logChannel = await interaction.guild.channels.fetch(guildCfg.tickets.logChannelId).catch(() => null);
    if (logChannel) {
      await logChannel.send({ embeds: [transcriptEmbed] });
      if (transcript.length > 2000) {
        await logChannel.send({ files: [{ attachment: Buffer.from(transcript), name: 'transcript.txt' }] });
      } else {
        await logChannel.send({ content: transcript || '*no messages*' });
      }
    }
  }

  ticket.status = 'closed';
  ticket.closedBy = interaction.user.id;
  await ticket.save();

  await interaction.editReply({ embeds: [embed('Ticket Closed', 'This ticket will be deleted in 5 seconds.')] });
  setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
}

async function handleSuggestionVote(interaction, client) {
  const Suggestion = (await import('../models/Suggestion.js')).default;
  const suggestion = await Suggestion.findOne({ guildId: interaction.guild.id, messageId: interaction.message.id });
  if (!suggestion) return interaction.reply({ embeds: [errorEmbed('Error', 'Suggestion not found.')], ephemeral: true });

  const userId = interaction.user.id;

  if (interaction.customId === 'suggest_up') {
    if (suggestion.upvotes.includes(userId)) {
      suggestion.upvotes = suggestion.upvotes.filter((id) => id !== userId);
    } else {
      suggestion.upvotes.push(userId);
      suggestion.downvotes = suggestion.downvotes.filter((id) => id !== userId);
    }
  } else if (interaction.customId === 'suggest_down') {
    if (suggestion.downvotes.includes(userId)) {
      suggestion.downvotes = suggestion.downvotes.filter((id) => id !== userId);
    } else {
      suggestion.downvotes.push(userId);
      suggestion.upvotes = suggestion.upvotes.filter((id) => id !== userId);
    }
  }

  await suggestion.save();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('suggest_up').setLabel(String(suggestion.upvotes.length)).setEmoji({ name: '\u{1F44D}' }).setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('suggest_down').setLabel(String(suggestion.downvotes.length)).setEmoji({ name: '\u{1F44E}' }).setStyle(ButtonStyle.Danger),
  );

  await interaction.update({ components: [row] });
}
