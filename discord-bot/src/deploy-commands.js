import 'dotenv/config';
import { loadCommands } from './utils/commandLoader.js';
import client from './client.js';
import logger from './utils/logger.js';
import config from './config.js';

async function deploy() {
  if (!config.token || !config.clientId) {
    logger.error('DISCORD_TOKEN and DISCORD_CLIENT_ID are required');
    process.exit(1);
  }

  const commands = await loadCommands(client);

  const { REST, Routes } = await import('discord.js');
  const rest = new REST({ version: '10' }).setToken(config.token);

  try {
    logger.info(`Deploying ${commands.length} commands...`);

    if (config.guildId) {
      await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), { body: commands });
      logger.info(`Deployed ${commands.length} commands to guild ${config.guildId}`);
    } else {
      await rest.put(Routes.applicationCommands(config.clientId), { body: commands });
      logger.info(`Deployed ${commands.length} commands globally`);
    }
  } catch (error) {
    logger.error(`Failed to deploy commands: ${error.message}`);
  }

  process.exit(0);
}

deploy();
