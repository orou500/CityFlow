import { Router } from 'express';
import Property from '../models/Property.js';
import User from '../models/User.js';
import City from '../models/City.js';
import Transaction from '../models/Transaction.js';
import { authenticate, optionalAuth } from '../middleware/auth.js';
import { awardXp } from '../utils/leveling.js';
import { collectOperatingFee } from '../utils/companyFees.js';
import { enqueueNotification } from '../utils/notificationQueue.js';
import { cacheGetOrSet } from '../utils/cache.js';
import { cacheKeys, cacheTTL } from '../utils/cacheKeys.js';
import { onPropertyPurchased, onPropertySold, onPropertyUpgraded } from '../utils/cacheInvalidation.js';
import { invalidateProperty, invalidateUser, onDevelopmentStarted } from '../utils/cacheInvalidation.js';
import { processPlayerProgress } from '../utils/playerProgress.js';
import { getTickNumber } from '../models/GameState.js';
import Auction from '../models/Auction.js';
import RealEstateCompany from '../models/RealEstateCompany.js';
import { addTreasuryTransaction } from '../engine/companyProcessing.js';
import { bulkCreateNotifications } from '../utils/notificationQueue.js';
import {
  calculateDemolitionCost,
  calculateDemolitionSalvage,
  calculateClearedLandValue,
} from '../config/redevelopment.js';
import { getAllProjects, calculateProjectCost } from '../config/developmentProjects.js';
import { finalizeRedevelopmentIfDue } from '../engine/redevelopmentProcessing.js';
import { getPropertyRiskProfile } from '../engine/propertyRisk.js';
import { trackEvent, EVENTS } from '../utils/analytics.js';
import { getAvailableBalance } from '../utils/auctionMoney.js';
import { debitUserBalance, creditUserBalance, addOwnedProperty, removeOwnedProperty } from '../utils/atomicBalance.js';
import { withUserLock } from '../utils/userMutex.js';
import { getCityPropertyLimit } from '../utils/ownershipLimits.js';
import {
  GRADE_NAMES,
  MAX_GRADE,
  GRADE_VALUE_BONUS,
  GRADE_RENT_BONUS,
  GRADE_UPGRADE_COOLDOWN_MS,
  getGradeUpgradeCost,
  getGradeRentMultiplier,
} from '../config/propertyGrades.js';
import { clampMonthlyRent, calculateMaximumRent } from '../config/propertyManagement.js';

const router = Router();
const PROPERTY_XP_COOLDOWN_MS = 24 * 60 * 60 * 1000;

router.get('/', optionalAuth, async (req, res) => {
  try {
    const {
      search,
      minPrice,
      maxPrice,
      city,
      country,
      type,
      seller,
      sort,
      page = '1',
      limit = '21',
      forSale,
      owned,
      minSize,
      maxSize,
    } = req.query;

    const filter = {};

    if (owned === 'true') {
      if (!req.user) return res.status(401).json({ error: 'Authentication required' });
      filter.ownerId = req.user._id;
    }

    if (forSale === 'true') filter.forSale = true;
    else if (forSale === 'false') filter.forSale = false;

    if (minPrice || maxPrice) {
      filter.currentPrice = {};
      if (minPrice) filter.currentPrice.$gte = parseFloat(minPrice);
      if (maxPrice) filter.currentPrice.$lte = parseFloat(maxPrice);
    }

    if (minSize || maxSize) {
      filter.size = {};
      if (minSize) filter.size.$gte = parseFloat(minSize);
      if (maxSize) filter.size.$lte = parseFloat(maxSize);
    }

    if (type && ['apartment', 'house', 'commercial', 'land'].includes(type)) {
      filter.type = type;
    }

    if (seller === 'bank') {
      filter.ownerId = null;
    } else if (seller === 'player') {
      filter.ownerId = { $exists: true, $ne: null };
    }

    const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    if (city || country) {
      const cityQuery = {};
      if (city) cityQuery.name = { $regex: `^${esc(city)}$`, $options: 'i' };
      if (country) cityQuery.country = { $regex: `^${esc(country)}$`, $options: 'i' };
      const found = await City.find(cityQuery).select('_id').lean();
      filter.cityId = { $in: found.length ? found.map((c) => c._id) : [null] };
    }

    if (search) {
      const searchRegex = new RegExp(esc(search), 'i');
      const nameCond = { name: searchRegex };
      const searchedCities = await City.find({ name: searchRegex }).select('_id').lean();
      if (searchedCities.length) {
        const cityCond = { cityId: { $in: searchedCities.map((c) => c._id) } };
        filter.$or = [nameCond, cityCond];
      } else {
        filter.name = searchRegex;
      }
    }

    let sortOption = { createdAt: -1 };
    switch (sort) {
      case 'price_asc':
        sortOption = { currentPrice: 1 };
        break;
      case 'price_desc':
        sortOption = { currentPrice: -1 };
        break;
      case 'oldest':
        sortOption = { createdAt: 1 };
        break;
      case 'return':
        sortOption = { rent: -1 };
        break;
    }

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 21));
    const skip = (pageNum - 1) * limitNum;

    const [total, properties] = await Promise.all([
      Property.countDocuments(filter),
      Property.find(filter)
        .populate('ownerId', 'username')
        .populate('cityId', 'name country')
        .sort(sortOption)
        .skip(skip)
        .limit(limitNum)
        .lean(),
    ]);

    if (req.user) {
      const recordVisit = (await import('../utils/visitTracking.js')).recordVisit;
      recordVisit(req.user._id, 'market', null);
    }

    res.json({ properties, total, page: pageNum, totalPages: Math.ceil(total / limitNum), limit: limitNum });
  } catch (err) {
    res.serverError(err);
  }
});

router.get('/:id/detail', authenticate, async (req, res) => {
  try {
    const data = await cacheGetOrSet(
      cacheKeys.propertyDetail(req.params.id),
      async () => {
        const property = await Property.findById(req.params.id).populate('ownerId', 'username').populate('cityId');
        if (!property) return null;

        const rentTransactions = await Transaction.find({
          propertyId: property._id,
          type: 'rent',
        });
        const totalRentEarned = rentTransactions.reduce((sum, t) => sum + t.price, 0);

        const ownerId = property.ownerId?._id || property.ownerId;
        const investmentTransactions = ownerId
          ? await Transaction.find({
              propertyId: property._id,
              type: { $in: ['buy', 'construction', 'upgrade', 'grade_upgrade', 'improvement'] },
              buyerId: ownerId,
            })
          : [];
        const totalInvestmentFromTransactions = investmentTransactions.reduce((sum, t) => sum + t.price, 0);

        const totalMaintenanceSpent = (property.managementHistory || []).reduce(
          (sum, h) => sum + (h.maintenanceCost || 0),
          0,
        );

        const totalInvestment = totalInvestmentFromTransactions + totalMaintenanceSpent;

        const investmentHistory = property.investmentHistory || [];
        const intrinsicValue = property.intrinsicValue || 0;
        const unrealizedGain = intrinsicValue > 0 && totalInvestment > 0 ? intrinsicValue - totalInvestment : 0;
        const roi = totalInvestment > 0 ? ((intrinsicValue - totalInvestment) / totalInvestment) * 100 : 0;

        return {
          property,
          totalRentEarned,
          totalInvestment,
          investmentHistory,
          intrinsicValue,
          unrealizedGain,
          roi,
          riskProfile: getPropertyRiskProfile(property, property.cityId),
        };
      },
      cacheTTL.medium,
    );

    if (!data) return res.status(404).json({ error: 'Property not found' });
    res.json(data);
  } catch (err) {
    res.serverError(err);
  }
});

router.get('/:id', authenticate, async (req, res) => {
  try {
    const data = await cacheGetOrSet(
      cacheKeys.property(req.params.id),
      async () => {
        const property = await Property.findById(req.params.id).populate('ownerId', 'username');
        return property || null;
      },
      cacheTTL.standard,
    );

    if (!data) return res.status(404).json({ error: 'Property not found' });
    res.json(data);
  } catch (err) {
    res.serverError(err);
  }
});

router.post('/buy', authenticate, async (req, res) => {
  try {
    const { propertyId } = req.body;
    const property = await Property.findById(propertyId);
    if (!property) return res.status(404).json({ error: 'Property not found' });
    if (!property.forSale) return res.status(400).json({ error: 'Property not for sale' });

    if (property.type === 'land' && property.developmentLevel > 0) {
      return res.status(400).json({ error: 'This land is under development and cannot be bought directly' });
    }

    const buyer = await User.findById(req.user._id);
    if (!buyer) return res.status(404).json({ error: 'User not found' });

    if (property.ownerId && property.ownerId.toString() === buyer._id.toString()) {
      return res.status(400).json({ error: 'You already own this property' });
    }

    const city = await City.findById(property.cityId);
    if (!city) return res.status(404).json({ error: 'City not found' });

    const ownedInCity = await Property.countDocuments({ ownerId: buyer._id, cityId: city._id });
    const maxAllowed = await getCityPropertyLimit(city);
    if (ownedInCity >= maxAllowed) {
      return res.status(400).json({
        error: `City ownership limit reached. You can own at most ${maxAllowed} properties in ${city.name}`,
        limit: maxAllowed,
        owned: ownedInCity,
      });
    }

    const price = property.currentPrice;
    if (getAvailableBalance(buyer) < price) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    const sellerId = property.ownerId;

    await withUserLock(`buy:${buyer._id}`, async () => {
      // Atomic claim: only one request can transition the property from
      // for-sale (with the same owner we validated) to owned.
      const claimed = await Property.findOneAndUpdate(
        {
          _id: property._id,
          forSale: true,
          ownerId: sellerId || null,
        },
        {
          $set: {
            ownerId: buyer._id,
            forSale: false,
            lastPurchasePrice: price,
            lastPurchaseDate: new Date(),
            activeImprovement: undefined,
            // Buying resets the demolition/redevelopment lifecycle: a cleared
            // plot starts fresh (normal land) for its new owner.
            'redevelopment.status': 'none',
          },
          $push: {
            investmentHistory: {
              type: 'purchase',
              amount: price,
              description: `Purchased by ${buyer.username}`,
            },
          },
        },
        { new: true },
      );
      if (!claimed) {
        const err = new Error('This property is no longer available');
        err.status = 409;
        throw err;
      }

      // Atomic debit with available-balance guard; refunds the claim if the
      // buyer can no longer afford it (concurrent spend elsewhere).
      const debited = await debitUserBalance(buyer._id, price);
      if (!debited) {
        await Property.updateOne(
          { _id: property._id },
          {
            $set: {
              ownerId: sellerId || null,
              forSale: true,
              lastPurchasePrice: undefined,
              lastPurchaseDate: undefined,
            },
          },
        );
        const err = new Error('Insufficient balance');
        err.status = 400;
        throw err;
      }

      if (sellerId) {
        await creditUserBalance(sellerId, price);
        await removeOwnedProperty(sellerId, property._id);
      }
      await addOwnedProperty(buyer._id, property._id);

      await collectOperatingFee(buyer._id, price, 'property_purchase');

      const lastBuyTx = await Transaction.findOne({
        buyerId: buyer._id,
        type: 'buy',
      }).sort({ createdAt: -1 });
      const boughtRecently = lastBuyTx && new Date() - new Date(lastBuyTx.createdAt) < PROPERTY_XP_COOLDOWN_MS;

      await Transaction.create({
        propertyId: property._id,
        buyerId: buyer._id,
        sellerId: sellerId && sellerId.toString() !== buyer._id.toString() ? sellerId : undefined,
        price,
        type: 'buy',
      });

      if (!boughtRecently) {
        await awardXp(debited, 10, 'property_buy');
      }
      await User.updateOne(
        { _id: buyer._id },
        {
          $inc: {
            'lifetimeStats.totalTransactions': 1,
            'lifetimeStats.totalPropertiesOwned': 1,
            'lifetimeStats.totalMoneySpent': price,
          },
        },
      );

      await onPropertyPurchased(buyer._id, sellerId, property._id, city._id);
      trackEvent(EVENTS.PROPERTY_PURCHASED, { userId: buyer._id, propertyId: property._id, price });

      await processPlayerProgress(buyer._id, 'property_buy', { skipXp: true });

      res.json({ property: claimed, balance: debited.balance });
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    res.serverError(err);
  }
});

router.post('/sell', authenticate, async (req, res) => {
  try {
    const { propertyId } = req.body;
    const property = await Property.findById(propertyId);
    if (!property) return res.status(404).json({ error: 'Property not found' });
    if (!property.ownerId || property.ownerId.toString() !== req.user._id.toString()) {
      return res.status(400).json({ error: 'You do not own this property' });
    }
    if (property.forSale) {
      return res.status(400).json({ error: 'Property is already listed for sale' });
    }

    if (property.developmentLevel === 1) {
      return res.status(400).json({ error: 'Property is under construction and cannot be sold yet' });
    }

    const salePrice = property.currentPrice;
    const purchasedAt = property.lastPurchaseDate;

    await withUserLock(`sell:${req.user._id}`, async () => {
      // Atomic claim: only one request can transition owned â†’ for-sale.
      const claimed = await Property.findOneAndUpdate(
        {
          _id: property._id,
          ownerId: req.user._id,
          forSale: false,
          developmentLevel: { $ne: 1 },
        },
        {
          $set: {
            ownerId: null,
            forSale: true,
            lastPurchasePrice: salePrice,
            lastPurchaseDate: new Date(),
          },
        },
        { new: true },
      );
      if (!claimed) {
        const err = new Error('This property is no longer sellable');
        err.status = 409;
        throw err;
      }

      await creditUserBalance(req.user._id, salePrice);
      await removeOwnedProperty(req.user._id, property._id);

      await collectOperatingFee(req.user._id, salePrice, 'property_sale');

      await Transaction.create({
        propertyId: property._id,
        sellerId: req.user._id,
        price: salePrice,
        type: 'sell',
      });

      const seller = await User.findById(req.user._id);
      const heldLongEnough = purchasedAt && new Date() - new Date(purchasedAt) >= PROPERTY_XP_COOLDOWN_MS;
      if (heldLongEnough) {
        await awardXp(seller, 5, 'property_sell');
      }
      await User.updateOne(
        { _id: req.user._id },
        { $inc: { 'lifetimeStats.totalTransactions': 1, 'lifetimeStats.totalMoneyEarned': salePrice } },
      );

      await onPropertySold(req.user._id, property._id, property.cityId);
      trackEvent(EVENTS.PROPERTY_SOLD, { userId: req.user._id, propertyId: property._id, price: salePrice });

      await processPlayerProgress(req.user._id, 'property_sell', { skipXp: true });
    });

    const seller = await User.findById(req.user._id);
    res.json({ property, balance: seller.balance });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    res.serverError(err);
  }
});

router.get('/:id/grade', authenticate, async (req, res) => {
  try {
    const property = await Property.findById(req.params.id);
    if (!property) return res.status(404).json({ error: 'Property not found' });
    if (!property.ownerId || property.ownerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'You do not own this property' });
    }

    const grade = property.grade || 1;
    const nextGrade = grade < MAX_GRADE ? grade + 1 : null;
    const upgradeCost = getGradeUpgradeCost(grade, property.currentPrice);

    const now = new Date();
    const lastUpgrade = property.lastGradeUpgradeAt;
    const cooldownRemaining = lastUpgrade
      ? Math.max(0, GRADE_UPGRADE_COOLDOWN_MS - (now.getTime() - new Date(lastUpgrade).getTime()))
      : 0;
    const nextAvailableAt = cooldownRemaining > 0 ? new Date(now.getTime() + cooldownRemaining) : null;

    res.json({
      grade,
      gradeName: GRADE_NAMES[grade - 1],
      nextGrade,
      nextGradeName: nextGrade ? GRADE_NAMES[nextGrade - 1] : null,
      upgradeCost,
      valueBonus: GRADE_VALUE_BONUS[grade - 1],
      rentBonus: GRADE_RENT_BONUS[grade - 1],
      nextValueBonus: nextGrade ? GRADE_VALUE_BONUS[nextGrade - 1] : null,
      nextRentBonus: nextGrade ? GRADE_RENT_BONUS[nextGrade - 1] : null,
      lastUpgradeAt: lastUpgrade ? new Date(lastUpgrade).toISOString() : null,
      cooldownRemaining,
      nextAvailableAt: nextAvailableAt ? nextAvailableAt.toISOString() : null,
    });
  } catch (err) {
    res.serverError(err);
  }
});

router.post('/grade/upgrade', authenticate, async (req, res) => {
  try {
    const { propertyId } = req.body;
    const property = await Property.findById(propertyId);
    if (!property) return res.status(404).json({ error: 'Property not found' });
    if (!property.ownerId || property.ownerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'You do not own this property' });
    }
    if (property.redevelopment?.status === REDEVELOPING_STATUS) {
      return res.status(400).json({ error: 'Property is being redeveloped and cannot be upgraded' });
    }

    const currentGrade = property.grade || 1;
    if (currentGrade >= MAX_GRADE) {
      return res.status(400).json({ error: 'Property is already at maximum grade' });
    }

    const now = new Date();
    if (property.lastGradeUpgradeAt) {
      const elapsed = now.getTime() - new Date(property.lastGradeUpgradeAt).getTime();
      if (elapsed < GRADE_UPGRADE_COOLDOWN_MS) {
        const remainingMs = GRADE_UPGRADE_COOLDOWN_MS - elapsed;
        const remainingH = Math.ceil(remainingMs / (60 * 60 * 1000));
        return res.status(429).json({
          error: `Upgrade cooldown active. Try again in ${remainingH} hour${remainingH > 1 ? 's' : ''}.`,
          cooldownRemaining: remainingMs,
          nextAvailableAt: new Date(now.getTime() + remainingMs).toISOString(),
        });
      }
    }

    const cost = getGradeUpgradeCost(currentGrade, property.currentPrice);
    if (cost === null) {
      return res.status(400).json({ error: 'Property is already at maximum grade' });
    }

    const user = await User.findById(req.user._id);
    if (user.balance < cost) {
      return res.status(400).json({ error: `Insufficient funds. Required: $${cost.toLocaleString()}` });
    }

    user.balance -= cost;
    await user.save();

    collectOperatingFee(user._id, cost, 'property_upgrade');

    const newGrade = currentGrade + 1;
    const oneTimeBoost = 0.01;
    const prevPrice = property.currentPrice;
    const prevRent = property.rent || 0;
    property.currentPrice = Math.round(property.currentPrice * (1 + oneTimeBoost));
    property.grade = newGrade;
    const gradeRentFactor = getGradeRentMultiplier(newGrade);
    property.rent = clampMonthlyRent(
      property.currentPrice * 0.004 * 0.75 * gradeRentFactor,
      calculateMaximumRent(property),
    );
    property.gradeHistory = property.gradeHistory || [];
    property.gradeHistory.push({ grade: newGrade, upgradedAt: new Date(), cost });
    property.lastGradeUpgradeAt = new Date();

    if (!property.investmentHistory) property.investmentHistory = [];
    property.investmentHistory.push({
      type: 'grade_upgrade',
      amount: cost,
      description: `Grade ${newGrade}`,
    });

    await property.save();

    await Transaction.create({
      propertyId: property._id,
      buyerId: user._id,
      price: cost,
      type: 'grade_upgrade',
    });

    await enqueueNotification({
      userId: user._id,
      type: 'system',
      title: 'Property Grade Upgraded',
      message: `"${property.name}" upgraded to Grade ${GRADE_NAMES[newGrade - 1]}. Value: $${prevPrice.toLocaleString()} â†’ $${property.currentPrice.toLocaleString()}. Rent: $${prevRent.toLocaleString()} â†’ $${property.rent.toLocaleString()}.`,
      eventKey: `property:${property._id}:grade:${newGrade}`,
      route: `/property/${property._id}`,
      entityType: 'property',
      entityId: property._id,
      relatedId: property._id,
      global: false,
    });

    await awardXp(user, 15, 'property_grade_upgrade');
    user.lifetimeStats.totalTransactions += 1;
    user.lifetimeStats.totalMoneySpent += cost;
    user.lastUpgradeAt = new Date();
    await user.save();

    await onPropertyUpgraded(user._id, property._id);

    await processPlayerProgress(user._id, 'property_upgrade', { skipXp: true });

    res.json({ property, balance: user.balance, grade: newGrade, upgradeCost: cost });
  } catch (err) {
    res.serverError(err);
  }
});

async function isAuthorizedForProperty(property, userId) {
  if (property.ownerId && property.ownerId.toString() === userId.toString()) return true;
  if (property.companyId) {
    const company = await RealEstateCompany.findById(property.companyId);
    if (company) {
      const member = company.members.find((m) => m.userId?.toString() === userId.toString());
      if (member && ['ceo', 'director'].includes(member.role)) return true;
    }
  }
  return false;
}

async function hasLiveAuction(propertyId) {
  return !!(await Auction.findOne({ propertyId, status: { $in: ['upcoming', 'active', 'ending'] } }).lean());
}

const REDEVELOPING_STATUS = 'redeveloping';

/**
 * Redevelopment status & quote. Also acts as the lazy completion hook: a
 * redevelopment whose completion tick has already passed is finalized here so
 * the player sees the finished building the moment they look at it.
 */
router.get('/:id/redevelopment/status', authenticate, async (req, res) => {
  try {
    let property = await Property.findById(req.params.id).populate('cityId');
    if (!property) return res.status(404).json({ error: 'Property not found' });
    if (!(await isAuthorizedForProperty(property, req.user._id))) {
      return res.status(403).json({ error: 'You do not own this property' });
    }

    const currentTick = await getTickNumber();

    if (property.redevelopment?.status === 'redeveloping') {
      await finalizeRedevelopmentIfDue(property, currentTick);
      if (property.redevelopment?.status === 'none') {
        property = await Property.findById(req.params.id).populate('cityId');
      }
    }

    const status = property.redevelopment?.status || 'none';

    if (status === 'land') {
      const allProjects = getAllProjects();
      const options = allProjects.map((p) => {
        const projectLoc = property.location || null;
        return {
          id: p.id,
          name: p.name,
          category: p.category,
          propertyType: p.propertyType,
          unitsGenerated: p.unitsGenerated,
          constructionPeriods: p.constructionPeriods,
          baseRentPerUnit: p.baseRentPerUnit,
          estimatedCost: calculateProjectCost(p, property.cityId, projectLoc),
          minLandSize: p.minLandSize,
          eligible: !property.size || property.size >= p.minLandSize,
        };
      });
      return res.json({
        status: 'land',
        landValue: property.currentPrice,
        landSize: property.size,
        clearedAtTick: property.redevelopment.demolishedAtTick,
        options,
      });
    }

    if (status === 'redeveloping') {
      return res.json({
        status: 'redeveloping',
        projectType: property.redevelopment.projectType,
        projectName: property.redevelopment.projectName,
        constructionCost: property.redevelopment.constructionCost,
        constructionPeriods: property.redevelopment.constructionPeriods,
        startedTick: property.redevelopment.startedTick,
        completionTick: property.redevelopment.completionTick,
        remainingTicks: Math.max(0, property.redevelopment.completionTick - currentTick),
      });
    }

    const demolitionCost = calculateDemolitionCost(property.currentPrice);
    const demolitionSalvage = calculateDemolitionSalvage(property.currentPrice);
    const eligibleForDemolition =
      property.type !== 'land' &&
      property.developmentLevel !== 1 &&
      !property.forSale &&
      !property.activeImprovement?.improvementId &&
      !property.parentBuilding &&
      !(await hasLiveAuction(property._id)) &&
      !(await Property.exists({ parentBuilding: property._id }));

    res.json({
      status: 'none',
      eligibleForDemolition,
      demolitionCost,
      demolitionSalvage,
      netProceeds: demolitionSalvage - demolitionCost,
      buildingValue: property.currentPrice,
    });
  } catch (err) {
    res.serverError(err);
  }
});

async function applyDemolitionMoney(property, user, salvage, cost) {
  const net = salvage - cost;
  if (property.companyId) {
    const company = await RealEstateCompany.findById(property.companyId);
    if (!company) {
      const err = new Error('Company not found');
      err.status = 404;
      throw err;
    }
    if (net < 0) {
      if (company.treasury.balance < -net) {
        const err = new Error(`Insufficient treasury. Required: $${(-net).toLocaleString()}`);
        err.status = 400;
        throw err;
      }
      company.treasury.balance -= -net;
      addTreasuryTransaction(
        company,
        { type: 'demolition', amount: -net },
        property.redevelopment.demolishedAtTick || 0,
      );
    } else if (net > 0) {
      company.treasury.balance += net;
      addTreasuryTransaction(
        company,
        { type: 'demolition', amount: net },
        property.redevelopment.demolishedAtTick || 0,
      );
    }
    await company.save();
  } else if (net < 0) {
    const debited = await debitUserBalance(user._id, -net);
    if (!debited) {
      const err = new Error('Insufficient balance');
      err.status = 400;
      throw err;
    }
  } else if (net > 0) {
    await creditUserBalance(user._id, net);
  }
}

/**
 * Demolish a building into a cleared plot (server-authoritative cost/salvage).
 * Atomic claim-then-money; restores the claim if the payment fails.
 */
router.post('/:id/demolish', authenticate, async (req, res) => {
  try {
    const property = await Property.findById(req.params.id).populate('cityId');
    if (!property) return res.status(404).json({ error: 'Property not found' });
    if (!(await isAuthorizedForProperty(property, req.user._id))) {
      return res.status(403).json({ error: 'You do not own this property' });
    }
    if (property.type === 'land') return res.status(400).json({ error: 'Only buildings can be demolished' });
    if (property.forSale)
      return res.status(400).json({ error: 'Property is listed for sale and cannot be demolished' });
    if (property.developmentLevel === 1) {
      return res.status(400).json({ error: 'Property is under construction and cannot be demolished' });
    }
    if (property.redevelopment?.status === REDEVELOPING_STATUS) {
      return res.status(400).json({ error: 'Property is being redeveloped and cannot be demolished' });
    }
    if (property.activeImprovement?.improvementId) {
      return res.status(400).json({ error: 'Cancel the active improvement before demolishing' });
    }
    if (property.parentBuilding) {
      return res.status(400).json({ error: 'This property is part of a larger building and cannot be demolished' });
    }
    if (await Property.exists({ parentBuilding: property._id })) {
      return res.status(400).json({ error: 'This building contains sub-properties that must be removed first' });
    }
    if (await hasLiveAuction(property._id)) {
      return res.status(400).json({ error: 'Property is in an auction and cannot be demolished' });
    }

    const user = await User.findById(req.user._id);
    const currentTick = await getTickNumber();
    const demolitionCost = calculateDemolitionCost(property.currentPrice);
    const demolitionSalvage = calculateDemolitionSalvage(property.currentPrice);
    const net = demolitionSalvage - demolitionCost;

    const city = property.cityId;

    let claimed = null;
    await withUserLock(`demolish:${property._id}`, async () => {
      claimed = await Property.findOneAndUpdate(
        {
          _id: property._id,
          type: { $ne: 'land' },
          developmentLevel: { $ne: 1 },
          forSale: false,
          'redevelopment.status': 'none',
        },
        {
          $set: {
            type: 'land',
            developmentLevel: 0,
            name: `Cleared Land - ${city?.name || 'City'}`,
            forSale: false,
            rent: 0,
            condition: 100,
            qualityScore: 70,
            maintenanceLevel: 'none',
            occupancy: 0,
            improvements: [],
            activeImprovement: undefined,
            upgrades: [],
            upgradeLevel: 0,
            rentPerUnit: 0,
            maxValidatedRentPerUnit: 0,
            rentPotential: 0,
            previousMonthRent: 0,
            'redevelopment.status': 'land',
            'redevelopment.demolitionCost': demolitionCost,
            'redevelopment.demolitionSalvage': demolitionSalvage,
            'redevelopment.previousType': property.type,
            'redevelopment.demolishedAtTick': currentTick,
            'redevelopment.startedByUserId': null,
          },
          $push: {
            investmentHistory: {
              type: 'demolition',
              amount: demolitionCost,
              tick: currentTick,
              description: `Demolished ${property.name}`,
            },
          },
        },
        { new: true },
      );
      if (!claimed) {
        const err = new Error('This property is no longer demolishable');
        err.status = 409;
        throw err;
      }

      const landValue = calculateClearedLandValue(city, property.location, property.currentPrice);
      claimed.basePrice = landValue;
      claimed.currentPrice = landValue;
      await claimed.save();

      try {
        await applyDemolitionMoney(claimed, user, demolitionSalvage, demolitionCost);
      } catch (moneyErr) {
        await Property.updateOne(
          { _id: claimed._id },
          {
            $set: {
              type: property.type,
              developmentLevel: property.developmentLevel,
              name: property.name,
              rent: property.rent,
              condition: property.condition,
              qualityScore: property.qualityScore,
              maintenanceLevel: property.maintenanceLevel,
              occupancy: property.occupancy,
              improvements: property.improvements,
              upgrades: property.upgrades,
              upgradeLevel: property.upgradeLevel,
              rentPerUnit: property.rentPerUnit,
              maxValidatedRentPerUnit: property.maxValidatedRentPerUnit,
              rentPotential: property.rentPotential,
              previousMonthRent: property.previousMonthRent,
              basePrice: property.basePrice,
              currentPrice: property.currentPrice,
              'redevelopment.status': 'none',
              'redevelopment.demolitionCost': 0,
              'redevelopment.demolitionSalvage': 0,
              'redevelopment.previousType': null,
            },
            $pop: { investmentHistory: 1 },
          },
        );
        throw moneyErr;
      }

      await Transaction.create({
        propertyId: claimed._id,
        buyerId: property.companyId ? undefined : user._id,
        companyId: property.companyId || undefined,
        price: demolitionCost,
        type: 'demolition',
      });
    });

    const claimedFresh = await Property.findById(claimed._id).populate('cityId');

    const ownerIdStr = claimedFresh.ownerId?.toString?.() || '';
    if (claimedFresh.companyId) {
      const company = await RealEstateCompany.findById(claimedFresh.companyId);
      if (company?.members?.length) {
        await bulkCreateNotifications(
          company.members.map((m) => ({
            userId: m.userId,
            type: 'system',
            title: 'Building Demolished',
            message: `${property.name} was demolished. Salvage $${demolitionSalvage.toLocaleString()} (cost $${demolitionCost.toLocaleString()}).`,
            eventKey: `redevelopment:${claimed._id}:demolished:${m.userId}`,
            route: `/property/${claimed._id}`,
            entityType: 'property',
            entityId: claimed._id,
            relatedId: claimed._id,
            global: false,
          })),
        );
      }
    } else if (ownerIdStr) {
      await enqueueNotification({
        userId: ownerIdStr,
        type: 'system',
        title: 'Building Demolished',
        message: `${property.name} was demolished. Salvage $${demolitionSalvage.toLocaleString()} (cost $${demolitionCost.toLocaleString()}).`,
        eventKey: `redevelopment:${claimed._id}:demolished`,
        route: `/property/${claimed._id}`,
        entityType: 'property',
        entityId: claimed._id,
        relatedId: claimed._id,
        global: false,
      });
    }

    if (ownerIdStr) {
      await User.updateOne(
        { _id: ownerIdStr },
        { $inc: { 'lifetimeStats.totalDemolitions': 1, 'lifetimeStats.totalTransactions': 1 } },
      );
      await processPlayerProgress(ownerIdStr, 'property_demolish', { skipXp: true });
    }

    await Promise.all([
      invalidateProperty(claimed._id).catch(() => {}),
      invalidateUser(ownerIdStr).catch(() => {}),
      onDevelopmentStarted(ownerIdStr, claimedFresh.companyId).catch(() => {}),
    ]);

    const freshUser = await User.findById(user._id);

    res.json({
      property: claimedFresh,
      status: 'land',
      landValue: claimedFresh.currentPrice,
      netProceeds: net,
      balance: freshUser ? freshUser.balance : user.balance,
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    res.serverError(err);
  }
});

/**
 * Start redevelopment on a cleared plot (land). The construction is
 * tick-scheduled (completionTick = start + constructionPeriods) and finalized
 * server-side by the tick engine or the lazy status hook. Owner pays from
 * their wallet; company properties are charged to the company treasury.
 */
router.post('/:id/redevelop', authenticate, async (req, res) => {
  try {
    const { projectType } = req.body;
    const property = await Property.findById(req.params.id).populate('cityId');
    if (!property) return res.status(404).json({ error: 'Property not found' });
    if (!(await isAuthorizedForProperty(property, req.user._id))) {
      return res.status(403).json({ error: 'You do not own this property' });
    }
    if (property.type !== 'land') return res.status(400).json({ error: 'Only cleared land can be redeveloped' });
    if (property.redevelopment?.status !== 'land') {
      return res.status(400).json({ error: 'This land is not cleared for redevelopment' });
    }
    if (property.developmentLevel !== 0) {
      return res.status(400).json({ error: 'This land already has a building' });
    }
    if (property.forSale) return res.status(400).json({ error: 'Land is listed for sale' });
    if (await hasLiveAuction(property._id)) {
      return res.status(400).json({ error: 'Land is in an auction and cannot be redeveloped' });
    }

    const allProjects = getAllProjects();
    const project = allProjects.find((p) => p.id === projectType);
    if (!project) return res.status(400).json({ error: 'Invalid project type' });

    if (property.size && property.size < project.minLandSize) {
      return res.status(400).json({
        error: `Land too small. Minimum size required: ${project.minLandSize} sq ft`,
      });
    }

    const user = await User.findById(req.user._id);
    const currentTick = await getTickNumber();
    const constructionCost = calculateProjectCost(project, property.cityId, property.location);

    if (!property.companyId && user.balance < constructionCost) {
      return res.status(400).json({
        error: `Insufficient funds. Required: $${constructionCost.toLocaleString()}`,
        required: constructionCost,
        balance: user.balance,
      });
    }

    let claimed = null;
    await withUserLock(`redevelop:${property._id}`, async () => {
      claimed = await Property.findOneAndUpdate(
        {
          _id: property._id,
          type: 'land',
          developmentLevel: 0,
          forSale: false,
          'redevelopment.status': 'land',
        },
        {
          $set: {
            developmentLevel: 1,
            forSale: false,
            'redevelopment.status': REDEVELOPING_STATUS,
            'redevelopment.startedByUserId': user._id,
            'redevelopment.startedAt': new Date(),
            'redevelopment.startedTick': currentTick,
            'redevelopment.completionTick': currentTick + project.constructionPeriods,
            'redevelopment.projectType': project.id,
            'redevelopment.projectName': project.name,
            'redevelopment.constructionCost': constructionCost,
            'redevelopment.constructionPeriods': project.constructionPeriods,
          },
          $push: {
            investmentHistory: {
              type: 'redevelopment',
              amount: constructionCost,
              tick: currentTick,
              description: `Redevelopment: ${project.name}`,
            },
          },
        },
        { new: true },
      );
      if (!claimed) {
        const err = new Error('This land is no longer available for redevelopment');
        err.status = 409;
        throw err;
      }

      try {
        if (property.companyId) {
          const company = await RealEstateCompany.findById(property.companyId);
          if (!company) {
            const err = new Error('Company not found');
            err.status = 404;
            throw err;
          }
          if (company.treasury.balance < constructionCost) {
            const err = new Error(
              `Insufficient treasury. Required: $${constructionCost.toLocaleString()}, Balance: $${company.treasury.balance.toLocaleString()}`,
            );
            err.status = 400;
            throw err;
          }
          company.treasury.balance -= constructionCost;
          addTreasuryTransaction(company, { type: 'redevelopment', amount: constructionCost }, currentTick);
          await company.save();
        } else {
          const debited = await debitUserBalance(user._id, constructionCost);
          if (!debited) {
            const err = new Error('Insufficient balance');
            err.status = 400;
            throw err;
          }
        }
      } catch (moneyErr) {
        await Property.updateOne(
          { _id: claimed._id },
          {
            $set: {
              developmentLevel: 0,
              'redevelopment.status': 'land',
              'redevelopment.startedByUserId': null,
              'redevelopment.startedAt': null,
              'redevelopment.startedTick': 0,
              'redevelopment.completionTick': 0,
              'redevelopment.projectType': null,
              'redevelopment.projectName': null,
              'redevelopment.constructionCost': 0,
              'redevelopment.constructionPeriods': 0,
            },
            $pop: { investmentHistory: 1 },
          },
        );
        throw moneyErr;
      }

      await Transaction.create({
        propertyId: claimed._id,
        buyerId: property.companyId ? undefined : user._id,
        companyId: property.companyId || undefined,
        price: constructionCost,
        type: 'redevelopment',
      });
    });

    const claimedFresh = await Property.findById(claimed._id).populate('cityId');
    const ownerIdStr = claimedFresh.ownerId?.toString?.() || '';

    if (claimedFresh.companyId) {
      const company = await RealEstateCompany.findById(claimedFresh.companyId);
      if (company?.members?.length) {
        await bulkCreateNotifications(
          company.members.map((m) => ({
            userId: m.userId,
            type: 'system',
            title: 'Redevelopment Started',
            message: `Redevelopment of ${project.name} has started (${project.constructionPeriods} ticks).`,
            eventKey: `redevelopment:${claimed._id}:started:${m.userId}`,
            route: `/property/${claimed._id}`,
            entityType: 'property',
            entityId: claimed._id,
            relatedId: claimed._id,
            global: false,
          })),
        );
      }
    } else if (ownerIdStr) {
      await enqueueNotification({
        userId: ownerIdStr,
        type: 'system',
        title: 'Redevelopment Started',
        message: `${project.name} will be completed in ${project.constructionPeriods} ticks (${project.constructionPeriods * 6} hours).`,
        eventKey: `redevelopment:${claimed._id}:started`,
        route: `/property/${claimed._id}`,
        entityType: 'property',
        entityId: claimed._id,
        relatedId: claimed._id,
        global: false,
      });
    }

    if (ownerIdStr) {
      await User.updateOne(
        { _id: ownerIdStr },
        { $inc: { 'lifetimeStats.totalTransactions': 1, 'lifetimeStats.totalConstructionStarted': 1 } },
      );
      await processPlayerProgress(ownerIdStr, 'construction_start', { skipXp: true });
    }

    await Promise.all([
      invalidateProperty(claimed._id).catch(() => {}),
      onDevelopmentStarted(ownerIdStr, claimedFresh.companyId).catch(() => {}),
    ]);

    const freshUser = await User.findById(user._id);

    res.status(201).json({
      property: claimedFresh,
      status: REDEVELOPING_STATUS,
      completionTick: claimedFresh.redevelopment.completionTick,
      balance: freshUser ? freshUser.balance : user.balance,
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    res.serverError(err);
  }
});

export default router;
