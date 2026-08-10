import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import { createServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config/index.js';
import { connectDB } from './config/db.js';
import { connectRedis, disconnectRedis, isRedisConnected } from './config/redis.js';
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
import rentRoutes from './routes/rent.js';
import managementRoutes from './routes/management.js';
import oauthRoutes from './routes/oauth.js';
import discordRoutes from './routes/discord.js';
import companyRoutes from './routes/companies.js';
import stockRoutes from './routes/stocks.js';
import indexRoutes from './routes/indexes.js';
import imageProxyRoutes from './routes/imageProxy.js';
import leaderboardRoutes from './routes/leaderboards.js';
import realEstateCompanyRoutes from './routes/realEstateCompanies.js';
import cityContractRoutes from './routes/cityContracts.js';
import donationRoutes from './routes/donations.js';
import districtRoutes from './routes/districts.js';
import marketIntelligenceRoutes from './routes/marketIntelligence.js';
import auctionRoutes from './routes/auctions.js';
import missionRoutes from './routes/missions.js';
import onboardingRoutes from './routes/onboarding.js';
import careerRoutes from './routes/career.js';
import { maintenanceCheck } from './middleware/maintenance.js';
import { getMaintenanceInfo, getTickNumber } from './models/GameState.js';
import { createNewSeason } from './engine/seasonReset.js';
import Season from './models/Season.js';
import { ensureBackupDir, enforceRetention } from './engine/backup.js';
import { getCacheMetrics, getHitRate, getCacheKeyCount } from './utils/cache.js';
import { getPubSubMetrics } from './utils/pubsub.js';
import { getQueueStats, QUEUE_NAMES } from './utils/jobQueue.js';
import { getNotificationQueueSize } from './utils/notificationQueue.js';
import { initSocketIO, getAdapterStatus, shutdownSocketIO } from './socket/index.js';
import { startJobProcessors, shutdownJobProcessors } from './utils/jobProcessors.js';
import { getOnlineCount, getMultipleStatuses } from './utils/presence.js';
import { getDelayedJobCount } from './utils/delayedJobs.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);

app.use(cors());
app.use(express.json());

app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/ready', (req, res) => {
  const dbReady = mongoose.connection.readyState === 1;
  const redisReady = isRedisConnected();
  const socketStatus = getAdapterStatus();
  const status = dbReady ? 'ready' : 'not ready';
  const code = dbReady ? 200 : 503;
  res.status(code).json({
    status,
    db: dbReady,
    redis: redisReady,
    socketio: socketStatus.connected,
    timestamp: new Date().toISOString(),
  });
});

app.get('/metrics', async (req, res) => {
  const cacheKeys = await getCacheKeyCount();
  const notifQueueSize = await getNotificationQueueSize();
  const delayedJobs = await getDelayedJobCount();
  const onlineUsers = await getOnlineCount();
  const socketStatus = getAdapterStatus();

  const queueStats = {};
  for (const name of Object.values(QUEUE_NAMES)) {
    const stats = await getQueueStats(name);
    if (stats) queueStats[name] = stats;
  }

  res.json({
    cache: { ...getCacheMetrics(), hitRate: getHitRate(), totalKeys: cacheKeys },
    pubsub: getPubSubMetrics(),
    queues: { notificationQueueSize: notifQueueSize, delayedJobs, bullmq: queueStats },
    websocket: {
      ...socketStatus,
      onlineUsers,
    },
    redis: { connected: isRedisConnected() },
  });
});

app.get('/presence/:userId', async (req, res) => {
  const { getStatus } = await import('./utils/presence.js');
  const status = await getStatus(req.params.userId);
  res.json(status);
});

app.get('/presence/batch', async (req, res) => {
  const ids = (req.query.ids || '').split(',').filter(Boolean);
  if (ids.length === 0) return res.json([]);
  const statuses = await getMultipleStatuses(ids);
  res.json(statuses);
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
app.use('/rent', rentRoutes);
app.use('/management', managementRoutes);
app.use('/discord', discordRoutes);
app.use('/auth', oauthRoutes);
app.use('/companies', companyRoutes);
app.use('/stocks', stockRoutes);
app.use('/indexes', indexRoutes);
app.use('/image-proxy', imageProxyRoutes);
app.use('/leaderboards', leaderboardRoutes);
app.use('/real-estate-companies', realEstateCompanyRoutes);
app.use('/city-contracts', cityContractRoutes);
app.use('/donations', donationRoutes);
app.use('/districts', districtRoutes);
app.use('/market-intelligence', marketIntelligenceRoutes);
app.use('/auctions', auctionRoutes);
app.use('/missions', missionRoutes);
app.use('/onboarding', onboardingRoutes);
app.use('/career', careerRoutes);

app.use((req, res) => {
  console.warn(`404 API Route: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ success: false, error: 'Route not found' });
});

async function start() {
  try {
    await connectDB();
    await connectRedis();

    global.currentTick = await getTickNumber();
    console.log(`[STARTUP] Current tick: ${global.currentTick}`);

    const activeSeason = await Season.findOne({ status: 'active' });
    if (!activeSeason) {
      console.log('[STARTUP] No active season found, creating Season 1');
      await createNewSeason();
    }

    await ensureBackupDir();
    await enforceRetention().catch(() => {});

    await initSocketIO(httpServer);
    startJobProcessors();

    httpServer.listen(config.port, () => {
      console.log(`CityFlow API running on port ${config.port}`);
      startScheduler();
    });
  } catch (err) {
    console.error('[STARTUP] Failed to start server:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

function shutdown(signal) {
  console.log(`${signal} received. Shutting down gracefully...`);
  if (httpServer) {
    httpServer.close(async () => {
      console.log('HTTP server closed');
      await shutdownSocketIO();
      shutdownJobProcessors();
      await disconnectRedis();
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
