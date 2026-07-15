import config from '../../config.js';
import logger from '../../utils/logger.js';

export function requireApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'];

  if (!apiKey || apiKey !== config.apiKey) {
    logger.warn('Unauthorized API request - invalid or missing API key');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  next();
}
