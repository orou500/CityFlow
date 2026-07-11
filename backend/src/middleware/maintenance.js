import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { isMaintenanceMode } from '../models/GameState.js';
import User from '../models/User.js';

export async function maintenanceCheck(req, res, next) {
  try {
    const maintenance = await isMaintenanceMode();
    if (!maintenance) return next();

    if (req.method === 'GET') return next();

    if (req.path.startsWith('/auth')) return next();

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, config.jwtSecret);
        const user = await User.findById(decoded.userId).select('role');
        if (user && user.role === 'admin') return next();
      } catch {
        // token invalid, fall through to maintenance block
      }
    }

    return res.status(503).json({
      error: 'Service Unavailable',
      maintenance: true,
      message: 'CityFlow is currently undergoing maintenance. Please check back later.',
    });
  } catch {
    next();
  }
}
