const config = {
  token: process.env.DISCORD_TOKEN,
  clientId: process.env.DISCORD_CLIENT_ID,
  guildId: process.env.DISCORD_GUILD_ID,
  mongoUri: process.env.MONGODB_URI,
  apiUrl: process.env.CITYFLOW_API_URL || 'http://cityflow-backend:5000/api',
  logLevel: process.env.LOG_LEVEL || 'info',
  apiPort: parseInt(process.env.BOT_API_PORT) || 5001,
  apiKey: process.env.BOT_API_KEY,
  embedColor: 0x1e90ff,
  accentColor: 0xffa500,
  errorColor: 0xff4444,
  successColor: 0x44ff44,
  verification: {
    defaultRoleId: null,
    unverifiedRoleId: null,
  },
  permissions: {
    admin: ['Administrator'],
    moderator: ['ManageMessages', 'KickMembers', 'BanMembers'],
  },
};

export default config;
