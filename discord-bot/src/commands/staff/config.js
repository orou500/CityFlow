import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';
import { embed, successEmbed } from '../../utils/helpers.js';
import { getGuildConfig, updateGuildConfig } from '../../utils/guildConfig.js';

export default {
  data: new SlashCommandBuilder()
    .setName('config')
    .setDescription('Configure the bot for this server')
    .addSubcommand((sub) =>
      sub
        .setName('view')
        .setDescription('View current configuration'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('welcome')
        .setDescription('Configure welcome messages')
        .addBooleanOption((o) => o.setName('enabled').setDescription('Enable/disable'))
        .addChannelOption((o) => o.setName('channel').setDescription('Welcome channel').addChannelTypes(ChannelType.GuildText))
        .addStringOption((o) => o.setName('message').setDescription('Message (use {user} and {server})')),
    )
    .addSubcommand((sub) =>
      sub
        .setName('leave')
        .setDescription('Configure leave messages')
        .addBooleanOption((o) => o.setName('enabled').setDescription('Enable/disable'))
        .addChannelOption((o) => o.setName('channel').setDescription('Leave channel').addChannelTypes(ChannelType.GuildText))
        .addStringOption((o) => o.setName('message').setDescription('Message (use {user})')),
    )
    .addSubcommand((sub) =>
      sub
        .setName('logging')
        .setDescription('Configure logging')
        .addBooleanOption((o) => o.setName('enabled').setDescription('Enable/disable'))
        .addChannelOption((o) => o.setName('mod').setDescription('Mod log channel').addChannelTypes(ChannelType.GuildText))
        .addChannelOption((o) => o.setName('audit').setDescription('Audit log channel').addChannelTypes(ChannelType.GuildText))
        .addChannelOption((o) => o.setName('general').setDescription('General log channel').addChannelTypes(ChannelType.GuildText)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('roles')
        .setDescription('Configure role IDs')
        .addRoleOption((o) => o.setName('admin').setDescription('Admin role'))
        .addRoleOption((o) => o.setName('moderator').setDescription('Moderator role'))
        .addRoleOption((o) => o.setName('member').setDescription('Member role')),
    )
    .addSubcommand((sub) =>
      sub
        .setName('moderation')
        .setDescription('Configure moderation settings')
        .addRoleOption((o) => o.setName('mute-role').setDescription('Mute role'))
        .addBooleanOption((o) => o.setName('anti-spam').setDescription('Enable anti-spam'))
        .addBooleanOption((o) => o.setName('anti-raid').setDescription('Enable anti-raid')),
    )
    .addSubcommand((sub) =>
      sub
        .setName('badwords')
        .setDescription('Manage bad word filter')
        .addStringOption((o) => o.setName('word').setDescription('Word to add/remove'))
        .addBooleanOption((o) => o.setName('remove').setDescription('Remove instead of add')),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  cooldown: 3,

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    if (sub === 'view') {
      const cfg = await getGuildConfig(guildId);
      if (!cfg) return interaction.reply({ embeds: [embed('Configuration', 'No configuration set yet. Use `/config` subcommands to configure.')], ephemeral: true });

      const lines = [];
      lines.push(`**Welcome:** ${cfg.welcome?.enabled ? `Enabled in <#${cfg.welcome.channelId}>` : 'Disabled'}`);
      lines.push(`**Leave:** ${cfg.leave?.enabled ? `Enabled in <#${cfg.leave.channelId}>` : 'Disabled'}`);
      lines.push(`**Logging:** ${cfg.logging?.enabled ? 'Enabled' : 'Disabled'}`);
      if (cfg.logging?.channels?.mod) lines.push(`  Mod: <#${cfg.logging.channels.mod}>`);
      if (cfg.logging?.channels?.audit) lines.push(`  Audit: <#${cfg.logging.channels.audit}>`);
      lines.push(`**Verification:** ${cfg.verification?.enabled ? `Enabled (role: <@&${cfg.verification.roleId}>)` : 'Disabled'}`);
      lines.push(`**Mute Role:** ${cfg.moderation?.muteRoleId ? `<@&${cfg.moderation.muteRoleId}>` : 'Not set'}`);
      lines.push(`**Anti-Spam:** ${cfg.moderation?.antiSpam ? 'On' : 'Off'}`);
      lines.push(`**Anti-Raid:** ${cfg.moderation?.antiRaid ? 'On' : 'Off'}`);
      if (cfg.moderation?.badWords?.length) lines.push(`**Bad Words:** ${cfg.moderation.badWords.length} filtered`);
      lines.push(`**Roles:** Admin: ${cfg.roles?.admin ? `<@&${cfg.roles.admin}>` : '—'}, Mod: ${cfg.roles?.moderator ? `<@&${cfg.roles.moderator}>` : '—'}, Member: ${cfg.roles?.member ? `<@&${cfg.roles.member}>` : '—'}`);

      return interaction.reply({ embeds: [embed('Server Configuration', lines.join('\n'))], ephemeral: true });
    }

    const update = {};
    if (sub === 'welcome') {
      const enabled = interaction.options.getBoolean('enabled');
      const channel = interaction.options.getChannel('channel');
      const message = interaction.options.getString('message');
      update['welcome.enabled'] = enabled ?? undefined;
      if (channel) update['welcome.channelId'] = channel.id;
      if (message) update['welcome.message'] = message;
    } else if (sub === 'leave') {
      const enabled = interaction.options.getBoolean('enabled');
      const channel = interaction.options.getChannel('channel');
      const message = interaction.options.getString('message');
      update['leave.enabled'] = enabled ?? undefined;
      if (channel) update['leave.channelId'] = channel.id;
      if (message) update['leave.message'] = message;
    } else if (sub === 'logging') {
      const enabled = interaction.options.getBoolean('enabled');
      const mod = interaction.options.getChannel('mod');
      const audit = interaction.options.getChannel('audit');
      const general = interaction.options.getChannel('general');
      update['logging.enabled'] = enabled ?? undefined;
      if (mod) update['logging.channels.mod'] = mod.id;
      if (audit) update['logging.channels.audit'] = audit.id;
      if (general) update['logging.channels.general'] = general.id;
    } else if (sub === 'roles') {
      const admin = interaction.options.getRole('admin');
      const moderator = interaction.options.getRole('moderator');
      const member = interaction.options.getRole('member');
      if (admin) update['roles.admin'] = admin.id;
      if (moderator) update['roles.moderator'] = moderator.id;
      if (member) update['roles.member'] = member.id;
    } else if (sub === 'moderation') {
      const muteRole = interaction.options.getRole('mute-role');
      const antiSpam = interaction.options.getBoolean('anti-spam');
      const antiRaid = interaction.options.getBoolean('anti-raid');
      if (muteRole) update['moderation.muteRoleId'] = muteRole.id;
      if (antiSpam !== null) update['moderation.antiSpam'] = antiSpam;
      if (antiRaid !== null) update['moderation.antiRaid'] = antiRaid;
    } else if (sub === 'badwords') {
      const word = interaction.options.getString('word')?.toLowerCase();
      const remove = interaction.options.getBoolean('remove');
      if (!word) return interaction.reply({ embeds: [embed('Error', 'Provide a word.')], ephemeral: true });

      const cfg = await getGuildConfig(guildId);
      const current = cfg?.moderation?.badWords || [];

      if (remove) {
        update['moderation.badWords'] = current.filter((w) => w !== word);
      } else {
        update['moderation.badWords'] = [...new Set([...current, word])];
      }
    }

    await updateGuildConfig(guildId, update);
    return interaction.reply({ embeds: [successEmbed('Configuration Updated', `\`${sub}\` settings saved.`)] });
  },
};
