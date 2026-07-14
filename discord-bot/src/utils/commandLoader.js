import { REST, Routes } from 'discord.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import config from '../config.js';
import logger from '../utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function loadCommands(client) {
  const commands = [];
  const folders = fs.readdirSync(path.join(__dirname, '..', 'commands'));

  for (const folder of folders) {
    const files = fs.readdirSync(path.join(__dirname, '..', 'commands', folder)).filter((f) => f.endsWith('.js'));
    for (const file of files) {
      const { default: command } = await import(`../commands/${folder}/${file}`);
      if (command?.data && command?.execute) {
        client.commands.set(command.data.name, command);
        commands.push(command.data.toJSON());
        logger.info(`Loaded command: ${command.data.name}`);
      }
    }
  }

  return commands;
}

export async function deployCommands(commands) {
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
}
