import { Router } from 'express';
import crypto from 'crypto';
import LinkCode from '../../models/LinkCode.js';
import logger from '../../utils/logger.js';

const router = Router();

router.post('/generate', async (req, res) => {
  const { discordUserId } = req.body;

  if (!discordUserId) {
    return res.status(400).json({ error: 'discordUserId is required' });
  }

  try {
    await LinkCode.deleteMany({ discordUserId, used: false });

    const code = crypto.randomInt(100000, 999999).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await LinkCode.create({ code, discordUserId, expiresAt });

    logger.info(`Generated link code for Discord user ${discordUserId}`);
    res.json({ code });
  } catch (err) {
    logger.error(`Link code generation error: ${err.message}`);
    res.status(500).json({ error: 'Failed to generate link code' });
  }
});

router.get('/verify/:code', async (req, res) => {
  const { code } = req.params;

  try {
    const linkCode = await LinkCode.findOne({
      code,
      used: false,
      expiresAt: { $gt: new Date() },
    });

    if (!linkCode) {
      return res.status(404).json({ valid: false, error: 'Invalid or expired code' });
    }

    linkCode.used = true;
    await linkCode.save();

    logger.info(`Link code verified for Discord user ${linkCode.discordUserId}`);
    res.json({ valid: true, discordUserId: linkCode.discordUserId });
  } catch (err) {
    logger.error(`Link code verification error: ${err.message}`);
    res.status(500).json({ error: 'Failed to verify link code' });
  }
});

router.delete('/:discordUserId', async (req, res) => {
  const { discordUserId } = req.params;

  try {
    await LinkCode.deleteMany({ discordUserId });
    logger.info(`Removed link data for Discord user ${discordUserId}`);
    res.json({ success: true });
  } catch (err) {
    logger.error(`Link removal error: ${err.message}`);
    res.status(500).json({ error: 'Failed to remove link' });
  }
});

export default router;
