import { Router } from 'express';
import { sendNotification } from '../../utils/notifier.js';
import logger from '../../utils/logger.js';

const router = Router();

router.post('/', async (req, res) => {
  const { type, title, description, fields, color } = req.body;

  if (!type || !title) {
    return res.status(400).json({ error: 'type and title are required' });
  }

  const validTypes = ['announcements', 'worldEvents', 'achievements', 'systemAlerts'];
  if (!validTypes.includes(type)) {
    return res.status(400).json({ error: `Invalid type. Must be one of: ${validTypes.join(', ')}` });
  }

  try {
    const result = await sendNotification(req.app.locals.discordClient, {
      type,
      title,
      description,
      fields,
      color,
    });

    res.json({ success: result });
  } catch (err) {
    logger.error(`Notification API error: ${err.message}`);
    res.status(500).json({ error: 'Failed to send notification' });
  }
});

export default router;
