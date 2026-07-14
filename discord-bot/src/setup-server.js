import 'dotenv/config';
import { REST, Routes, ChannelType, PermissionFlagsBits } from 'discord.js';
import logger from './utils/logger.js';
import config from './config.js';

const rest = new REST({ version: '10' }).setToken(config.token);

const CHANNELS_TO_CREATE = [
  { name: 'welcome', type: ChannelType.GuildText, topic: 'Welcome messages and verification' },
  { name: 'rules', type: ChannelType.GuildText, topic: 'Server rules — read before chatting' },
  { name: 'announcements', type: ChannelType.GuildText, topic: 'Official CityFlow announcements', extra: { sendMessages: false } },
  { name: 'general', type: ChannelType.GuildText, topic: 'General discussion' },
  { name: 'game-chat', type: ChannelType.GuildText, topic: 'Discuss CityFlow game strategy' },
  { name: 'support', type: ChannelType.GuildText, topic: 'Get help with the game or server' },
  { name: 'suggestions', type: ChannelType.GuildText, topic: 'Submit your ideas with /suggest' },
  { name: 'mod-logs', type: ChannelType.GuildText, topic: 'Moderation action logs', extra: { view: false } },
  { name: 'audit-logs', type: ChannelType.GuildText, topic: 'Verification and audit logs', extra: { view: false } },
];

const TICKET_CATEGORY = { name: 'Tickets', type: ChannelType.GuildCategory };

async function setup() {
  const guildId = config.guildId;
  if (!guildId) {
    logger.error('DISCORD_GUILD_ID is required in .env');
    process.exit(1);
  }

  logger.info(`Setting up guild ${guildId}...`);

  const guild = await rest.get(Routes.guild(guildId));
  logger.info(`Guild: ${guild.name}`);

  // Create roles
  const rolesToCreate = [
    { name: 'Verified', color: 0x44ff44, reason: 'Given after verification' },
    { name: 'Moderator', color: 0xffa500, reason: 'Staff moderator role' },
    { name: 'Member', color: 0x1e90ff, reason: 'Default member role' },
  ];

  const roleIds = {};
  for (const r of rolesToCreate) {
    try {
      const role = await rest.post(Routes.guildRoles(guildId), {
        body: { name: r.name, color: r.color, mentionable: false },
      });
      roleIds[r.name] = role.id;
      logger.info(`Created role @${r.name}: ${role.id}`);
    } catch (err) {
      logger.error(`Failed to create @${r.name}: ${err.message}`);
    }
  }

  // Create mute role
  logger.info('Creating Muted role...');
  let muteRoleId;
  try {
    const muteRole = await rest.post(Routes.guildRoles(guildId), {
      body: {
        name: 'Muted',
        color: 0x808080,
        permissions: '0',
        mentionable: false,
      },
    });
    muteRoleId = muteRole.id;
    logger.info(`Created Muted role: ${muteRoleId}`);
  } catch (err) {
    logger.error(`Failed to create Muted role: ${err.message}`);
  }

  // Create channels
  logger.info('Creating channels...');
  const channelIds = {};
  for (const ch of CHANNELS_TO_CREATE) {
    try {
      const created = await rest.post(Routes.guildChannels(guildId), {
        body: {
          name: ch.name,
          type: ch.type,
          topic: ch.topic,
        },
      });
      channelIds[ch.name] = created.id;
      logger.info(`Created #${ch.name}: ${created.id}`);

      // Hide mod-logs and audit-logs from everyone
      if (ch.extra?.view === false) {
        await rest.put(Routes.channelPermission(guildId, created.id, guildId), {
          body: {
            type: 0,
            allow: '0',
            deny: '1024',
          },
        });
        logger.info(`Locked #${ch.name} from @everyone`);
      }

      // Make announcements read-only
      if (ch.extra?.sendMessages === false) {
        await rest.put(Routes.channelPermission(guildId, created.id, guildId), {
          body: {
            type: 0,
            allow: '0',
            deny: '2048',
          },
        });
        logger.info(`Made #${ch.name} read-only`);
      }
    } catch (err) {
      logger.error(`Failed to create #${ch.name}: ${err.message}`);
    }
  }

  // Create ticket category
  logger.info('Creating Tickets category...');
  let ticketCategoryId;
  try {
    const category = await rest.post(Routes.guildChannels(guildId), {
      body: {
        name: TICKET_CATEGORY.name,
        type: TICKET_CATEGORY.type,
      },
    });
    ticketCategoryId = category.id;
    logger.info(`Created Tickets category: ${ticketCategoryId}`);
  } catch (err) {
    logger.error(`Failed to create Tickets category: ${err.message}`);
  }

  // Print summary
  logger.info('\n========== SETUP COMPLETE ==========');
  logger.info('Copy these values into your /config commands:');
  logger.info('');
  logger.info('Role IDs:');
  for (const [name, id] of Object.entries(roleIds)) {
    logger.info(`  @${name.padEnd(16)} ${id}`);
  }
  logger.info(`  @${'Muted'.padEnd(16)} ${muteRoleId || 'FAILED'}`);
  logger.info('');
  logger.info('Channel IDs:');
  for (const [name, id] of Object.entries(channelIds)) {
    logger.info(`  #${name.padEnd(16)} ${id}`);
  }
  logger.info('');
  logger.info('Run these commands in Discord:');
  logger.info(`  /config roles admin:@Administrator moderator:@Moderator member:@Member`);
  logger.info(`  /config logging enabled:true mod:#mod-logs audit:#audit-logs general:#general`);
  logger.info(`  /config moderation mute-role:@Muted anti-spam:true`);
  logger.info(`  /config welcome enabled:true channel:#welcome message:"Welcome {user} to {server}! Verify to get started."`);
  logger.info(`  /config leave enabled:true channel:#general message:"{user} has left the server."`);
  logger.info(`  /verify-setup channel:#rules role:@Verified log-channel:#audit-logs`);
  logger.info(`  /ticket-setup channel:#support staff-role:@Moderator log-channel:#audit-logs`);
  logger.info(`  /suggestion-setup channel:#suggestions review-channel:#audit-logs`);
  logger.info('=====================================');
}

setup().catch((err) => {
  logger.error(`Setup failed: ${err.message}`);
  process.exit(1);
});
