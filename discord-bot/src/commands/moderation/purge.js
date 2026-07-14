import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { errorEmbed, successEmbed } from '../../utils/helpers.js';
import { getGuildConfig, logModAction } from '../../utils/guildConfig.js';
import { embed } from '../../utils/helpers.js';

export default {
  data: new SlashCommandBuilder()
    .setName('purge')
    .setDescription('Delete messages from a channel')
    .addIntegerOption((o) => o.setName('amount').setDescription('Number of messages to delete (1-100)').setRequired(true).setMinValue(1).setMaxValue(100))
    .addUserOption((o) => o.setName('user').setDescription('Only delete messages from this user'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  cooldown: 5,

  async execute(interaction) {
    const amount = interaction.options.getInteger('amount');
    const targetUser = interaction.options.getUser('user');

    await interaction.deferReply({ ephemeral: true });

    try {
      const fetched = await interaction.channel.messages.fetch({ limit: amount });
      let messages = [...fetched.values()];

      if (targetUser) {
        messages = messages.filter((m) => m.author.id === targetUser.id);
      }

      messages = messages.filter((m) => m.id !== interaction.id);

      if (messages.length === 0) {
        return interaction.editReply({ embeds: [errorEmbed('Error', 'No messages to delete.')], ephemeral: true });
      }

      const deleted = await interaction.channel.bulkDelete(messages, true);

      const guildCfg = await getGuildConfig(interaction.guildId);
      await logModAction(interaction.guild, guildCfg, embed('Purged', `**${deleted.size}** messages deleted by **${interaction.user.tag}** in <#${interaction.channelId}>${targetUser ? `\nFiltered: ${targetUser.tag}` : ''}`));

      return interaction.editReply({ embeds: [successEmbed('Purged', `Deleted **${deleted.size}** messages.`)] });
    } catch (error) {
      return interaction.editReply({ embeds: [errorEmbed('Error', `Failed: ${error.message}`)], ephemeral: true });
    }
  },
};
