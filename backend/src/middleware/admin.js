import { authenticate } from './auth.js';

export async function requireAdmin(req, res, next) {
  await authenticate(req, res, () => {
    if (!req.user) return;
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  });
}
