import 'dotenv/config';
import client from './client.js';
import { connectDatabase } from './utils/database.js';
import { loadCommands } from './utils/commandLoader.js';
import { loadEvents } from './utils/eventLoader.js';
import { createApiServer } from './api/server.js';
import logger from './utils/logger.js';
import config from './config.js';

async function start() {
  if (!config.token) {
    logger.error('DISCORD_TOKEN is required');
    process.exit(1);
  }

  if (!config.apiKey) {
    logger.warn('BOT_API_KEY not set - API server will reject all requests');
  }

  await connectDatabase();

  await loadCommands(client);
  await loadEvents(client);

  client.once('ready', () => {
    logger.info(`Logged in as ${client.user.tag}`);
    client.user.setActivity('CityFlow | /help', { type: 3 });
  });

  client.on('error', (err) => logger.error(`Client error: ${err.message}`));

  await client.login(config.token);

  createApiServer(client);
}

start().catch((err) => {
  logger.error(`Failed to start: ${err.message}`);
  process.exit(1);
});
