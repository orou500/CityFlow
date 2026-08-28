import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import User from '../models/User.js';

const VERIFY_OPTIONS = { algorithms: ['HS256'] };

export async function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  let decoded;
  try {
    const token = header.split(' ')[1];
    decoded = jwt.verify(token, config.jwtSecret, VERIFY_OPTIONS);
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
  try {
    const user = await User.findById(decoded.userId);
    // Reject deleted or banned accounts — a token must never outlive the
    // account state (aligned with the Socket.IO handshake middleware).
    if (!user || user.deletedAt || user.banned) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    req.user = user;
    next();
  } catch {
    return res.status(500).json({ error: 'Database unavailable' });
  }
}

export async function optionalAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return next();
  }
  let decoded;
  try {
    const token = header.split(' ')[1];
    decoded = jwt.verify(token, config.jwtSecret, VERIFY_OPTIONS);
  } catch {
    return next();
  }
  try {
    const user = await User.findById(decoded.userId);
    if (user && !user.deletedAt && !user.banned) {
      req.user = user;
    }
  } catch {
    // ignore DB errors on optional auth
  }
  next();
}
