import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import Suggestion from '../../models/Suggestion.js';
import { embed, successEmbed, errorEmbed } from '../../utils/helpers.js';
import { getGuildConfig, logAction } from '../../utils/guildConfig.js';

export default {
  data: new SlashCommandBuilder()
    .setName('suggest')
    .setDescription('Submit a suggestion')
    .addStringOption((o) => o.setName('content').setDescription('Your suggestion').setRequired(true)),
  cooldown: 30,

  async execute(interaction) {
    const content = interaction.options.getString('content');
    const guildCfg = await getGuildConfig(interaction.guildId);

    if (!guildCfg?.suggestions?.enabled) {
      return interaction.reply({ embeds: [errorEmbed('Error', 'Suggestions are not enabled.')], ephemeral: true });
    }

    const channel = await interaction.guild.channels.fetch(guildCfg.suggestions.channelId).catch(() => null);
    if (!channel) return interaction.reply({ embeds: [errorEmbed('Error', 'Suggestion channel not found.')], ephemeral: true });

    const e = embed('New Suggestion', content)
      .setAuthor({ name: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() })
      .addFields(
        { name: 'Status', value: '`Pending`', inline: true },
        { name: 'Upvotes', value: '0', inline: true },
        { name: 'Downvotes', value: '0', inline: true },
      )
      .setFooter({ text: `ID: Pending` });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('suggest_up').setLabel('0').setEmoji({ name: '\u{1F44D}' }).setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('suggest_down').setLabel('0').setEmoji({ name: '\u{1F44E}' }).setStyle(ButtonStyle.Danger),
    );

    const msg = await channel.send({ embeds: [e], components: [row] });

    await Suggestion.create({
      guildId: interaction.guildId,
      authorId: interaction.user.id,
      messageId: msg.id,
      content,
    });

    e.data.footer = { text: `ID: ${msg.id}` };
    await msg.edit({ embeds: [e] });

    return interaction.reply({ embeds: [successEmbed('Suggestion Submitted', 'Your suggestion has been posted.')], ephemeral: true });
  },
};
