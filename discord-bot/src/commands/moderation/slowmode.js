import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';
import { errorEmbed, successEmbed } from '../../utils/helpers.js';
import { getGuildConfig, logModAction } from '../../utils/guildConfig.js';
import { embed } from '../../utils/helpers.js';

export default {
  data: new SlashCommandBuilder()
    .setName('slowmode')
    .setDescription('Set slowmode on a channel')
    .addIntegerOption((o) => o.setName('seconds').setDescription('Slowmode seconds (0 to disable)').setRequired(true).setMinValue(0).setMaxValue(21600))
    .addChannelOption((o) => o.setName('channel').setDescription('Channel to set slowmode on').addChannelTypes(ChannelType.GuildText))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  cooldown: 5,

  async execute(interaction) {
    const seconds = interaction.options.getInteger('seconds');
    const channel = interaction.options.getChannel('channel') || interaction.channel;

    try {
      await channel.setSlowmode(seconds, `Set by ${interaction.user.tag}`);

      const guildCfg = await getGuildConfig(interaction.guildId);
      await logModAction(interaction.guild, guildCfg, embed('Slowmode', `Slowmode set to **${seconds}s** in <#${channel.id}> by **${interaction.user.tag}**`));

      return interaction.reply({
        embeds: [successEmbed('Slowmode', seconds === 0 ? `Slowmode disabled in <#${channel.id}>` : `Slowmode set to **${seconds}s** in <#${channel.id}>`)],
      });
    } catch (error) {
      return interaction.reply({ embeds: [errorEmbed('Error', `Failed: ${error.message}`)], ephemeral: true });
    }
  },
};
