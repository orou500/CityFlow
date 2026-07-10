import express from 'express';
import cors from 'cors';
import authRoutes from '../routes/auth.js';
import cityRoutes from '../routes/cities.js';
import propertyRoutes from '../routes/properties.js';
import userRoutes from '../routes/users.js';
import transactionRoutes from '../routes/transactions.js';
import bankRoutes from '../routes/bank.js';
import adminRoutes from '../routes/admin.js';
import offerRoutes from '../routes/offers.js';
import notificationRoutes from '../routes/notifications.js';
import developmentRoutes from '../routes/development.js';
import statsRoutes from '../routes/stats.js';
import friendsRoutes from '../routes/friends.js';
import eventRoutes from '../routes/events.js';
import worldRoutes from '../routes/world.js';

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.use('/auth', authRoutes);
  app.use('/cities', cityRoutes);
  app.use('/properties', propertyRoutes);
  app.use('/users', userRoutes);
  app.use('/transactions', transactionRoutes);
  app.use('/bank', bankRoutes);
  app.use('/admin', adminRoutes);
  app.use('/offers', offerRoutes);
  app.use('/notifications', notificationRoutes);
  app.use('/development', developmentRoutes);
  app.use('/stats', statsRoutes);
  app.use('/friends', friendsRoutes);
  app.use('/events', eventRoutes);
  app.use('/world', worldRoutes);

  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.use((req, res) => {
    res.status(404).json({ success: false, error: 'Route not found' });
  });

  return app;
}
