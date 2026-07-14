import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config/index.js';
import { connectDB } from './config/db.js';
import { startScheduler } from './engine/scheduler.js';
import authRoutes from './routes/auth.js';
import cityRoutes from './routes/cities.js';
import propertyRoutes from './routes/properties.js';
import userRoutes from './routes/users.js';
import transactionRoutes from './routes/transactions.js';
import bankRoutes from './routes/bank.js';
import adminRoutes from './routes/admin.js';
import offerRoutes from './routes/offers.js';
import notificationRoutes from './routes/notifications.js';
import developmentRoutes from './routes/development.js';
import statsRoutes from './routes/stats.js';
import friendsRoutes from './routes/friends.js';
import eventRoutes from './routes/events.js';
import worldRoutes from './routes/world.js';
import seasonRoutes from './routes/seasons.js';
import backupRoutes from './routes/backup.js';
import bonusRoutes from './routes/bonus.js';
import { maintenanceCheck } from './middleware/maintenance.js';
import { getMaintenanceInfo } from './models/GameState.js';
import { createNewSeason } from './engine/seasonReset.js';
import Season from './models/Season.js';
import { ensureBackupDir, enforceRetention } from './engine/backup.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(cors());
app.use(express.json());

app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/ready', (req, res) => {
  const dbReady = mongoose.connection.readyState === 1;
  if (dbReady) {
    res.json({ status: 'ready', timestamp: new Date().toISOString() });
  } else {
    res.status(503).json({ status: 'not ready', timestamp: new Date().toISOString() });
  }
});

app.get('/maintenance', async (req, res) => {
  try {
    const info = await getMaintenanceInfo();
    res.json(info);
  } catch {
    res.json({ enabled: false, message: '' });
  }
});

app.use(maintenanceCheck);

app.use('/auth', authRoutes);
app.use('/admin', adminRoutes);
app.use('/users', userRoutes);
app.use('/world', worldRoutes);
app.use('/seasons', seasonRoutes);
app.use('/cities', cityRoutes);
app.use('/properties', propertyRoutes);
app.use('/transactions', transactionRoutes);
app.use('/bank', bankRoutes);
app.use('/offers', offerRoutes);
app.use('/notifications', notificationRoutes);
app.use('/development', developmentRoutes);
app.use('/stats', statsRoutes);
app.use('/friends', friendsRoutes);
app.use('/events', eventRoutes);
app.use('/admin/backups', backupRoutes);
app.use('/bonus', bonusRoutes);

app.use((req, res) => {
  console.warn(`404 API Route: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ success: false, error: 'Route not found' });
});

let server;

async function start() {
  await connectDB();

  const activeSeason = await Season.findOne({ status: 'active' });
  if (!activeSeason) {
    console.log('[STARTUP] No active season found, creating Season 1');
    await createNewSeason();
  }

  await ensureBackupDir();
  await enforceRetention().catch(() => {});

  server = app.listen(config.port, () => {
    console.log(`CityFlow API running on port ${config.port}`);
    startScheduler();
  });
}

function shutdown(signal) {
  console.log(`${signal} received. Shutting down gracefully...`);
  if (server) {
    server.close(() => {
      console.log('HTTP server closed');
      mongoose.connection.close(false).then(() => {
        console.log('MongoDB connection closed');
        process.exit(0);
      });
    });
  } else {
    process.exit(0);
  }

  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

start();
