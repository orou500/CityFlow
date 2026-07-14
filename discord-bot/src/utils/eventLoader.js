import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from './logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function loadEvents(client) {
  const eventFiles = fs.readdirSync(path.join(__dirname, '..', 'events')).filter((f) => f.endsWith('.js'));

  for (const file of eventFiles) {
    const { default: event } = await import(`../events/${file}`);
    if (event?.name && event?.execute) {
      if (event.once) {
        client.once(event.name, (...args) => event.execute(...args, client));
      } else {
        client.on(event.name, (...args) => event.execute(...args, client));
      }
      logger.info(`Loaded event: ${event.name}`);
    }
  }
}
