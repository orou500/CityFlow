import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';
import { successEmbed, errorEmbed } from '../../utils/helpers.js';

export default {
  data: new SlashCommandBuilder()
    .setName('lock')
    .setDescription('Lock a channel')
    .addChannelOption((o) => o.setName('channel').setDescription('Channel to lock').addChannelTypes(ChannelType.GuildText))
    .addStringOption((o) => o.setName('reason').setDescription('Reason'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  cooldown: 3,

  async execute(interaction) {
    const channel = interaction.options.getChannel('channel') || interaction.channel;
    const reason = interaction.options.getString('reason') || `Locked by ${interaction.user.tag}`;

    try {
      await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: false }, { reason });
      return interaction.reply({ embeds: [successEmbed('Locked', `<#${channel.id}> has been locked.`)] });
    } catch (error) {
      return interaction.reply({ embeds: [errorEmbed('Error', error.message)], ephemeral: true });
    }
  },
};
