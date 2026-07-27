import express from 'express';
import { body, param, query, validationResult } from 'express-validator';
import User from '../models/User.js';
import MarketReport from '../models/MarketReport.js';
import City from '../models/City.js';
import { REPORT_TYPES } from '../config/marketIntelligence.js';
import {
  generatePriceForecastReport,
  generateRiskAssessmentReport,
  generateGrowthOpportunitiesReport,
  generatePublicTrends,
} from '../engine/marketIntelligence.js';
import { authenticate } from '../middleware/auth.js';
import { cacheGetOrSet } from '../utils/cache.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { cacheKeys } from '../utils/cacheKeys.js';

const router = express.Router();

const purchaseRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many report purchases. Please try again later.',
});

function handleValidationErrors(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: errors.array().map((e) => ({ field: e.path, message: e.msg })),
    });
  }
  next();
}

router.get('/catalog', (req, res) => {
  const catalog = Object.entries(REPORT_TYPES).map(([key, config]) => ({
    reportType: key,
    name: config.name,
    description: config.description,
    requiresCity: config.requiresCity,
    durations: config.durationTicks,
    costs: config.pricing,
    accuracy: config.accuracy,
  }));

  return res.json({ success: true, catalog });
});

router.get(
  '/trends/:cityId',
  authenticate,
  [param('cityId').isMongoId().withMessage('Invalid city ID'), handleValidationErrors],
  async (req, res) => {
    try {
      const { cityId } = req.params;
      const cacheKey = cacheKeys.miTrends(cityId);

      const trends = await cacheGetOrSet(cacheKey, () => generatePublicTrends(cityId), 120);

      return res.json({ success: true, trends });
    } catch (error) {
      if (error.message === 'City not found') {
        return res.status(404).json({ success: false, error: 'City not found' });
      }
      return res.status(500).json({ success: false, error: error.message });
    }
  },
);

router.post(
  '/purchase',
  authenticate,
  purchaseRateLimit,
  [
    body('reportType').isIn(Object.keys(REPORT_TYPES)).withMessage('Invalid report type'),
    body('tier').isIn(['basic', 'advanced', 'premium']).withMessage('Invalid tier'),
    body('cityId').optional({ values: 'null' }).isMongoId().withMessage('Invalid city ID'),
    body('districtId').optional({ values: 'null' }).isMongoId().withMessage('Invalid district ID'),
    handleValidationErrors,
  ],
  async (req, res) => {
    try {
      const { reportType, tier, cityId, districtId } = req.body;
      const userId = req.user._id;

      const reportConfig = REPORT_TYPES[reportType];
      const cost = reportConfig.pricing[tier];

      if (reportConfig.requiresCity && !cityId) {
        return res.status(400).json({ success: false, error: 'cityId is required for this report type' });
      }

      if (reportConfig.requiresDistrict && !districtId) {
        return res.status(400).json({ success: false, error: 'districtId is required for this report type' });
      }

      if (cityId) {
        const city = await City.findById(cityId);
        if (!city) {
          return res.status(404).json({ success: false, error: 'City not found' });
        }
      }

      const existingActive = await MarketReport.findOne({
        userId,
        reportType,
        tier,
        cityId: cityId || null,
        districtId: districtId || null,
        status: 'active',
      });

      if (existingActive) {
        return res.status(400).json({
          success: false,
          error: 'You already have an active report of this type and tier for this location',
        });
      }

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ success: false, error: 'User not found' });
      }

      if (user.balance < cost) {
        return res.status(400).json({ success: false, error: 'Insufficient funds', balance: user.balance, cost });
      }

      let data;
      switch (reportType) {
        case 'price_forecast':
          data = await generatePriceForecastReport(cityId, tier);
          break;
        case 'risk_assessment':
          data = await generateRiskAssessmentReport(cityId, tier);
          break;
        case 'growth_opportunities':
          data = await generateGrowthOpportunitiesReport(tier);
          break;
        default:
          return res.status(400).json({ success: false, error: 'Invalid report type' });
      }

      const currentTick = global.currentTick || 0;
      const purchaseTick = currentTick;
      const expiresTick = currentTick + reportConfig.durationTicks[tier];

      const report = await MarketReport.create({
        userId,
        reportType,
        tier,
        cityId: cityId || null,
        districtId: districtId || null,
        cost,
        purchasedAtTick: purchaseTick,
        expiresAtTick: expiresTick,
        data,
        status: 'active',
      });

      user.balance -= cost;
      await user.save();

      return res.status(201).json({
        success: true,
        report: {
          _id: report._id,
          reportType,
          tier,
          cost,
          purchasedAtTick: report.purchasedAtTick,
          expiresAtTick: report.expiresAtTick,
          data: report.data,
          status: report.status,
        },
        balance: user.balance,
      });
    } catch (error) {
      return res.status(500).json({ success: false, error: error.message });
    }
  },
);

router.get(
  '/reports',
  authenticate,
  [
    query('status').optional().isIn(['active', 'expired', 'evaluated', 'all']),
    query('reportType').optional().isIn(Object.keys(REPORT_TYPES)),
    query('cityId').optional().isMongoId(),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('offset').optional().isInt({ min: 0 }),
    handleValidationErrors,
  ],
  async (req, res) => {
    try {
      const userId = req.user._id;
      const { status = 'active', reportType, cityId, limit = 50, offset = 0 } = req.query;

      const filter = { userId };
      if (status !== 'all') filter.status = status;
      if (reportType) filter.reportType = reportType;
      if (cityId) filter.cityId = cityId;

      const [reports, total] = await Promise.all([
        MarketReport.find(filter).sort({ createdAt: -1 }).skip(Number(offset)).limit(Number(limit)).lean(),
        MarketReport.countDocuments(filter),
      ]);

      return res.json({ success: true, reports, total, offset: Number(offset), limit: Number(limit) });
    } catch (error) {
      return res.status(500).json({ success: false, error: error.message });
    }
  },
);

router.get(
  '/reports/:id',
  authenticate,
  [param('id').isMongoId().withMessage('Invalid report ID'), handleValidationErrors],
  async (req, res) => {
    try {
      const report = await MarketReport.findById(req.params.id);
      if (!report) {
        return res.status(404).json({ success: false, error: 'Report not found' });
      }
      if (report.userId.toString() !== req.user._id.toString()) {
        return res.status(403).json({ success: false, error: 'Not authorized' });
      }

      return res.json({ success: true, report });
    } catch (error) {
      return res.status(500).json({ success: false, error: error.message });
    }
  },
);

router.get('/performance', authenticate, async (req, res) => {
  try {
    const userId = req.user._id;

    const evaluatedReports = await MarketReport.find({
      userId,
      status: 'evaluated',
      forecastAccuracy: { $ne: null },
    }).sort({ evaluationTick: -1 });

    const recentReports = evaluatedReports.slice(0, 20);

    const reportTypeStats = {};
    for (const report of evaluatedReports) {
      if (!reportTypeStats[report.reportType]) {
        reportTypeStats[report.reportType] = {
          count: 0,
          totalAccuracy: 0,
          avgAccuracy: 0,
          bestAccuracy: 0,
          worstAccuracy: 100,
        };
      }
      const stats = reportTypeStats[report.reportType];
      stats.count++;
      stats.totalAccuracy += report.forecastAccuracy;
      stats.avgAccuracy = Math.round((stats.totalAccuracy / stats.count) * 10) / 10;
      stats.bestAccuracy = Math.max(stats.bestAccuracy, report.forecastAccuracy);
      stats.worstAccuracy = Math.min(stats.worstAccuracy, report.forecastAccuracy);
    }

    const tierStats = {};
    for (const report of evaluatedReports) {
      if (!tierStats[report.tier]) {
        tierStats[report.tier] = {
          count: 0,
          totalAccuracy: 0,
          avgAccuracy: 0,
          totalCost: 0,
        };
      }
      const stats = tierStats[report.tier];
      stats.count++;
      stats.totalAccuracy += report.forecastAccuracy;
      stats.avgAccuracy = Math.round((stats.totalAccuracy / stats.count) * 10) / 10;
      stats.totalCost += report.cost;
    }

    const overallAccuracy =
      evaluatedReports.length > 0
        ? Math.round(
            (evaluatedReports.reduce((sum, r) => sum + r.forecastAccuracy, 0) / evaluatedReports.length) * 10,
          ) / 10
        : 0;

    return res.json({
      success: true,
      performance: {
        overallAccuracy,
        totalReports: evaluatedReports.length,
        reportTypeStats,
        tierStats,
        recentReports,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
