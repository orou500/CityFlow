import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { embed } from '../../utils/helpers.js';

export default {
  data: new SlashCommandBuilder()
    .setName('serverinfo')
    .setDescription('Get server information')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  cooldown: 5,

  async execute(interaction) {
    const g = interaction.guild;
    const textChannels = g.channels.cache.filter((c) => c.type === 0).size;
    const voiceChannels = g.channels.cache.filter((c) => c.type === 2).size;
    const categories = g.channels.cache.filter((c) => c.type === 4).size;

    const e = embed('Server Info', '')
      .setThumbnail(g.iconURL({ size: 256 }))
      .addFields(
        { name: 'Name', value: g.name, inline: true },
        { name: 'ID', value: g.id, inline: true },
        { name: 'Owner', value: `<@${g.ownerId}>`, inline: true },
        { name: 'Members', value: String(g.memberCount), inline: true },
        { name: 'Roles', value: String(g.roles.cache.size), inline: true },
        { name: 'Emojis', value: String(g.emojis.cache.size), inline: true },
        { name: 'Channels', value: `${textChannels} text, ${voiceChannels} voice, ${categories} categories`, inline: true },
        { name: 'Boost Level', value: String(g.premiumTier), inline: true },
        { name: 'Boosts', value: String(g.premiumSubscriptionCount || 0), inline: true },
        { name: 'Created', value: `<t:${Math.floor(g.createdTimestamp / 1000)}:R>`, inline: true },
      );

    if (g.description) e.setDescription(g.description);

    return interaction.reply({ embeds: [e] });
  },
};
