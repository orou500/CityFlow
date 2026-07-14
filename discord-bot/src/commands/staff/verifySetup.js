import { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType } from 'discord.js';
import { embed, successEmbed, errorEmbed } from '../../utils/helpers.js';
import { updateGuildConfig } from '../../utils/guildConfig.js';

export default {
  data: new SlashCommandBuilder()
    .setName('verify-setup')
    .setDescription('Set up the verification system')
    .addChannelOption((o) => o.setName('channel').setDescription('Channel for verification message').setRequired(true).addChannelTypes(ChannelType.GuildText))
    .addRoleOption((o) => o.setName('role').setDescription('Role to give on verification').setRequired(true))
    .addChannelOption((o) => o.setName('log-channel').setDescription('Verification log channel').addChannelTypes(ChannelType.GuildText))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  cooldown: 10,

  async execute(interaction) {
    const channel = interaction.options.getChannel('channel');
    const role = interaction.options.getRole('role');
    const logChannel = interaction.options.getChannel('log-channel');

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('verify_button')
        .setLabel('Verify')
        .setEmoji({ name: '\u2705' })
        .setStyle(ButtonStyle.Success),
    );

    const msg = await channel.send({
      embeds: [
        embed('Server Verification', 'Click the button below to verify and gain access to the server.')
          .setColor(0x1e90ff),
      ],
      components: [row],
    });

    await updateGuildConfig(interaction.guildId, {
      'verification.enabled': true,
      'verification.channelId': channel.id,
      'verification.messageId': msg.id,
      'verification.roleId': role.id,
      'verification.logChannelId': logChannel?.id || channel.id,
    });

    return interaction.reply({
      embeds: [successEmbed('Verification Set Up', `Verification message sent in <#${channel.id}>\nRole: <@&${role.id}>`)],
      ephemeral: true,
    });
  },
};
