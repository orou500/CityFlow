import express from 'express';
import { requireApiKey } from './middleware/auth.js';
import notificationRoutes from './routes/notifications.js';
import linkingRoutes from './routes/linking.js';
import config from '../config.js';
import logger from '../utils/logger.js';

export function createApiServer(client) {
  const app = express();

  app.use(express.json());

  app.use(requireApiKey);

  app.use('/api/discord/notify', notificationRoutes);
  app.use('/api/discord/link', linkingRoutes);

  app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  app.locals.discordClient = client;

  const port = config.apiPort;

  const server = app.listen(port, () => {
    logger.info(`Bot API server running on port ${port}`);
  });

  return server;
}
