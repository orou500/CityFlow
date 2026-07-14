import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';
import { successEmbed, errorEmbed } from '../../utils/helpers.js';

export default {
  data: new SlashCommandBuilder()
    .setName('unlock')
    .setDescription('Unlock a channel')
    .addChannelOption((o) => o.setName('channel').setDescription('Channel to unlock').addChannelTypes(ChannelType.GuildText))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  cooldown: 3,

  async execute(interaction) {
    const channel = interaction.options.getChannel('channel') || interaction.channel;

    try {
      await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: null }, { reason: `Unlocked by ${interaction.user.tag}` });
      return interaction.reply({ embeds: [successEmbed('Unlocked', `<#${channel.id}> has been unlocked.`)] });
    } catch (error) {
      return interaction.reply({ embeds: [errorEmbed('Error', error.message)], ephemeral: true });
    }
  },
};
