import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import Suggestion from '../../models/Suggestion.js';
import { successEmbed, errorEmbed, embed } from '../../utils/helpers.js';
import { getGuildConfig } from '../../utils/guildConfig.js';

export default {
  data: new SlashCommandBuilder()
    .setName('suggestion-review')
    .setDescription('Review a suggestion')
    .addStringOption((o) => o.setName('message-id').setDescription('Suggestion message ID').setRequired(true))
    .addStringOption((o) =>
      o
        .setName('status')
        .setDescription('New status')
        .setRequired(true)
        .addChoices(
          { name: 'Accepted', value: 'accepted' },
          { name: 'Rejected', value: 'rejected' },
          { name: 'Under Review', value: 'under_review' },
          { name: 'Implemented', value: 'implemented' },
        ),
    )
    .addStringOption((o) => o.setName('note').setDescription('Review note'))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  cooldown: 5,

  async execute(interaction) {
    const messageId = interaction.options.getString('message-id');
    const status = interaction.options.getString('status');
    const note = interaction.options.getString('note');

    const suggestion = await Suggestion.findOne({ guildId: interaction.guildId, messageId });
    if (!suggestion) return interaction.reply({ embeds: [errorEmbed('Error', 'Suggestion not found.')], ephemeral: true });

    suggestion.status = status;
    suggestion.reviewedBy = interaction.user.id;
    if (note) suggestion.reviewNote = note;
    await suggestion.save();

    const statusLabels = { pending: 'Pending', under_review: 'Under Review', accepted: 'Accepted', rejected: 'Rejected', implemented: 'Implemented' };

    try {
      const guildCfg = await getGuildConfig(interaction.guildId);
      const channelId = guildCfg?.suggestions?.channelId || interaction.guildId;
      const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
      const msg = await channel.messages.fetch(messageId).catch(() => null);
      if (msg) {
        const e = embed('Suggestion', suggestion.content)
          .addFields(
            { name: 'Status', value: `\`${statusLabels[status]}\``, inline: true },
            { name: 'Upvotes', value: String(suggestion.upvotes.length), inline: true },
            { name: 'Downvotes', value: String(suggestion.downvotes.length), inline: true },
          );
        if (note) e.addFields({ name: 'Review Note', value: note });
        await msg.edit({ embeds: [e] });
      }
    } catch {}

    return interaction.reply({ embeds: [successEmbed('Reviewed', `Suggestion status updated to **${statusLabels[status]}**.`)] });
  },
};
