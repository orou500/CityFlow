import express from 'express';
import cors from 'cors';
import { config } from '../config/index.js';
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
import seasonRoutes from '../routes/seasons.js';
import backupRoutes from '../routes/backup.js';
import discordRoutes from '../routes/discord.js';
import realEstateCompanyRoutes from '../routes/realEstateCompanies.js';
import cityContractRoutes from '../routes/cityContracts.js';
import districtRoutes from '../routes/districts.js';
import missionRoutes from '../routes/missions.js';
import stockRoutes from '../routes/stocks.js';
import auctionRoutes from '../routes/auctions.js';
import leaderboardRoutes from '../routes/leaderboards.js';
import onboardingRoutes from '../routes/onboarding.js';
import sizopsAuthRoutes from '../routes/sizopsAuth.js';
import managementRoutes from '../routes/management.js';
import { requireAdmin } from '../middleware/admin.js';
import bonusRoutes from '../routes/bonus.js';
import rentRoutes from '../routes/rent.js';
import careerRoutes from '../routes/career.js';
import companyRoutes from '../routes/companies.js';
import indexRoutes from '../routes/indexes.js';
import imageProxyRoutes from '../routes/imageProxy.js';
import donationRoutes from '../routes/donations.js';
import marketIntelligenceRoutes from '../routes/marketIntelligence.js';
import rewardedAdRoutes from '../routes/rewardedAds.js';
import adminRewardedAdsRoutes from '../routes/adminRewardedAds.js';
import oauthRoutes from '../routes/oauth.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);

  const CORS_ALLOWLIST = [config.frontendUrl, 'capacitor://localhost'];
  app.use(
    cors({
      origin(origin, cb) {
        if (!origin || CORS_ALLOWLIST.includes(origin) || /^https?:\/\/localhost(:\d+)?$/.test(origin)) {
          return cb(null, true);
        }
        return cb(null, false);
      },
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      credentials: false,
      maxAge: 86400,
    }),
  );
  app.use(express.json());

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
  });

  app.use((req, res, next) => {
    res.serverError = (err) => {
      console.error(`[ERROR] ${req.method} ${req.originalUrl}:`, err?.stack || err?.message || err);
      res.status(500).json({ error: 'An unexpected error occurred' });
    };
    next();
  });

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
  app.use('/seasons', seasonRoutes);
  app.use('/admin/backups', backupRoutes);
  app.use('/discord', discordRoutes);
  app.use('/real-estate-companies', realEstateCompanyRoutes);
  app.use('/city-contracts', cityContractRoutes);
  app.use('/districts', districtRoutes);
  app.use('/missions', missionRoutes);
  app.use('/stocks', stockRoutes);
  app.use('/auctions', auctionRoutes);
  app.use('/leaderboards', leaderboardRoutes);
  app.use('/onboarding', onboardingRoutes);
  app.use('/auth', sizopsAuthRoutes);
  app.use('/auth', oauthRoutes);
  app.use('/management', managementRoutes);
  app.use('/bonus', bonusRoutes);
  app.use('/rent', rentRoutes);
  app.use('/career', careerRoutes);
  app.use('/companies', companyRoutes);
  app.use('/indexes', indexRoutes);
  app.use('/image-proxy', imageProxyRoutes);
  app.use('/donations', donationRoutes);
  app.use('/market-intelligence', marketIntelligenceRoutes);
  app.use('/rewarded-ads', rewardedAdRoutes);
  app.use('/admin/rewarded-ads', adminRewardedAdsRoutes);

  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.get('/metrics', requireAdmin, (req, res) => {
    res.json({ ok: true });
  });

  app.use((req, res) => {
    res.status(404).json({ success: false, error: 'Route not found' });
  });

  return app;
}
