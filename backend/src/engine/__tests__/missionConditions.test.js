import { describe, it, expect, beforeEach } from 'vitest';
import MissionProgress from '../../models/MissionProgress.js';
import User from '../../models/User.js';
import Property from '../../models/Property.js';
import Transaction from '../../models/Transaction.js';
import Loan from '../../models/Loan.js';
import Auction from '../../models/Auction.js';
import RealEstateCompany from '../../models/RealEstateCompany.js';
import District from '../../models/District.js';
import ConstructionProject from '../../models/ConstructionProject.js';
import MarketReport from '../../models/MarketReport.js';
import { createTestUser, createTestCity } from '../../test/helpers.js';
import {
  initializeMissionsForUser,
  updateMissionProgress,
  evaluateCondition,
} from '../../engine/missionProcessing.js';

const getMissionProgress = async (userId, missionId) =>
  MissionProgress.findOne({ userId, missionId }).lean();

const makeProperty = async (overrides = {}) =>
  Property.create({
    cityId: overrides.cityId,
    name: `Prop_${Date.now()}_${Math.random()}`,
    type: 'apartment',
    basePrice: 100000,
    currentPrice: 100000,
    ...overrides,
  });

const makeTransaction = async (overrides = {}) =>
  Transaction.create({
    type: 'buy',
    price: 50000,
    ...overrides,
  });

describe('Mission Conditions', () => {
  let user, city, district;

  beforeEach(async () => {
    await MissionProgress.deleteMany({});
    await User.deleteMany({});
    await Property.deleteMany({});
    await Transaction.deleteMany({});
    await Loan.deleteMany({});
    await Auction.deleteMany({});
    await RealEstateCompany.deleteMany({});
    await District.deleteMany({});
    await ConstructionProject.deleteMany({});
    await MarketReport.deleteMany({});
    user = await createTestUser({ balance: 10000000 });
    city = await createTestCity();
    district = await District.create({
      cityId: city._id,
      name: 'Test District',
      tier: 'premium',
      influence: [],
    });
  });

  // ── PROPERTY CONDITIONS ───────────────────────────────

  it('properties_owned: counts Properties owned', async () => {
    await initializeMissionsForUser(user._id);
    await makeProperty({ ownerId: user._id, cityId: city._id });
    await makeProperty({ ownerId: user._id, cityId: city._id });
    await updateMissionProgress(user._id, 'property_buy');
    const mp = await getMissionProgress(user._id, 'first_property');
    // target=1, progress capped at Math.min(2, 1) = 1
    expect(mp.progress).toBe(1);
    expect(mp.status).toBe('completed');
  });

  it('total_rent_collected: counts rent Transactions (buyerId)', async () => {
    await initializeMissionsForUser(user._id);
    await makeTransaction({ buyerId: user._id, type: 'rent' });
    await makeTransaction({ buyerId: user._id, type: 'rent' });
    await updateMissionProgress(user._id, 'rent_collected');
    const mp = await getMissionProgress(user._id, 'first_rent');
    expect(mp.progress).toBe(1);
    expect(mp.status).toBe('completed');
  });

  it('total_upgrades: counts upgrade/grade_upgrade Transactions', async () => {
    await initializeMissionsForUser(user._id);
    await makeTransaction({ buyerId: user._id, type: 'upgrade' });
    await makeTransaction({ buyerId: user._id, type: 'grade_upgrade' });
    await updateMissionProgress(user._id, 'property_upgrade');
    const mp = await getMissionProgress(user._id, 'first_upgrade');
    expect(mp.progress).toBe(1);
    expect(mp.status).toBe('completed');
  });

  it('total_properties_sold: counts sell and offer-buy Transactions where user is sellerId', async () => {
    await initializeMissionsForUser(user._id);
    await makeTransaction({ sellerId: user._id, type: 'sell' });
    await makeTransaction({ sellerId: user._id, type: 'buy' });
    await updateMissionProgress(user._id, 'property_sell');
    const mp = await getMissionProgress(user._id, 'first_sell');
    expect(mp.progress).toBe(1);
    expect(mp.status).toBe('completed');
  });

  // ── AUCTION CONDITIONS ───────────────────────────────

  it('auctions_won: counts ended Auctions where winnerId is set', async () => {
    await initializeMissionsForUser(user._id);
    const prop = await makeProperty({ cityId: city._id });
    await Auction.create([
      { propertyId: prop._id, sellerType: 'bank', startingBid: 50000, currentBid: 55000, bidIncrement: 1000, winnerId: user._id, winningBid: 55000, status: 'ended', startTick: 0, endTick: 10, originalEndTick: 10 },
      { propertyId: prop._id, sellerType: 'bank', startingBid: 60000, currentBid: 65000, bidIncrement: 1000, winnerId: user._id, winningBid: 65000, status: 'ended', startTick: 0, endTick: 10, originalEndTick: 10 },
    ]);
    await updateMissionProgress(user._id, 'auction_won');
    const mp = await getMissionProgress(user._id, 'first_auction');
    expect(mp.progress).toBe(1);
    expect(mp.status).toBe('completed');
  });

  it('auctions_sold: counts ended Auctions where sellerId matches', async () => {
    await initializeMissionsForUser(user._id);
    const prop = await makeProperty({ cityId: city._id });
    await Auction.create([
      { propertyId: prop._id, sellerId: user._id, sellerType: 'player', startingBid: 50000, bidIncrement: 1000, status: 'ended', startTick: 0, endTick: 10, originalEndTick: 10 },
    ]);
    await updateMissionProgress(user._id, 'auction_sold');
    const mp = await getMissionProgress(user._id, 'auction_sell');
    expect(mp.progress).toBe(1);
    expect(mp.status).toBe('completed');
  });

  it('rare_auctions_won: counts won auctions whose Property has propertyRating=elite', async () => {
    await initializeMissionsForUser(user._id);
    const eliteProp = await makeProperty({ cityId: city._id, propertyRating: 'elite' });
    const normalProp = await makeProperty({ cityId: city._id });
    await Auction.create([
      { propertyId: eliteProp._id, sellerType: 'bank', startingBid: 50000, bidIncrement: 1000, winnerId: user._id, winningBid: 55000, status: 'ended', startTick: 0, endTick: 10, originalEndTick: 10 },
      { propertyId: normalProp._id, sellerType: 'bank', startingBid: 60000, bidIncrement: 1000, winnerId: user._id, winningBid: 65000, status: 'ended', startTick: 0, endTick: 10, originalEndTick: 10 },
    ]);
    await updateMissionProgress(user._id, 'auction_won');
    const mp = await getMissionProgress(user._id, 'auction_rare');
    expect(mp.progress).toBe(1);
    expect(mp.status).toBe('completed');
  });

  // ── INCOME / NET WORTH CONDITIONS ────────────────────

  it('monthly_income: sums rent from owned Properties', async () => {
    await initializeMissionsForUser(user._id);
    await makeProperty({ ownerId: user._id, cityId: city._id, rent: 600 });
    await makeProperty({ ownerId: user._id, cityId: city._id, rent: 500 });
    await updateMissionProgress(user._id, 'income_event');
    const mp = await getMissionProgress(user._id, 'income_1k');
    // value=1100, target=1000, capped at 1000
    expect(mp.progress).toBe(1000);
    expect(mp.status).toBe('completed');
  });

  it('net_worth: balance + sum of currentPrice of owned Properties', async () => {
    await initializeMissionsForUser(user._id);
    await User.updateOne({ _id: user._id }, { balance: 500000 });
    await makeProperty({ ownerId: user._id, cityId: city._id, currentPrice: 300000 });
    await makeProperty({ ownerId: user._id, cityId: city._id, currentPrice: 200000 });
    user = await User.findById(user._id).lean();
    await updateMissionProgress(user._id, 'networth_update');
    const mp = await getMissionProgress(user._id, 'networth_1m');
    expect(mp.progress).toBe(1000000);
    expect(mp.status).toBe('completed');
  });

  // ── PROPERTY QUALITY CONDITIONS ──────────────────────

  it('own_legendary_property: counts Properties with propertyRating=elite owned by user', async () => {
    await initializeMissionsForUser(user._id);
    await makeProperty({ ownerId: user._id, cityId: city._id, propertyRating: 'elite' });
    await updateMissionProgress(user._id, 'property_buy');
    const mp = await getMissionProgress(user._id, 'own_legendary_property');
    expect(mp.progress).toBe(1);
    expect(mp.status).toBe('completed');
  });

  // ── GEOGRAPHIC CONDITIONS ────────────────────────────

  it('unique_cities: counts distinct cityIds among owned Properties', async () => {
    await initializeMissionsForUser(user._id);
    const city2 = await createTestCity();
    await makeProperty({ ownerId: user._id, cityId: city._id });
    await makeProperty({ ownerId: user._id, cityId: city2._id });
    await updateMissionProgress(user._id, 'property_buy');
    const mp = await getMissionProgress(user._id, 'geo_first_city');
    expect(mp.progress).toBe(2);
    expect(mp.status).toBe('completed');
  });

  it('city_owned: counts Properties owned in city matching condition.cityName', async () => {
    const dubai = await createTestCity({ name: 'Dubai' });
    await initializeMissionsForUser(user._id);
    await makeProperty({ ownerId: user._id, cityId: dubai._id });
    await updateMissionProgress(user._id, 'property_buy');
    const mp = await getMissionProgress(user._id, 'geo_dubai');
    expect(mp.progress).toBe(1);
    expect(mp.status).toBe('completed');
  });

  it('unique_districts: counts distinct districtIds among owned Properties', async () => {
    await initializeMissionsForUser(user._id);
    const district2 = await District.create({ cityId: city._id, name: 'District 2', tier: 'growing', influence: [] });
    await makeProperty({ ownerId: user._id, cityId: city._id, districtId: district._id });
    await makeProperty({ ownerId: user._id, cityId: city._id, districtId: district2._id });
    await updateMissionProgress(user._id, 'property_buy');
    const mp = await getMissionProgress(user._id, 'district_10');
    // value=2 < target=10
    expect(mp.progress).toBe(2);
    expect(mp.status).toBe('active');
  });

  it('district_leader: counts districts where user has the top influence score', async () => {
    await initializeMissionsForUser(user._id);
    const otherUser = await createTestUser();
    await District.updateOne(
      { _id: district._id },
      {
        influence: [
          { userId: user._id, score: 0.8, tier: 'market_leader' },
          { userId: otherUser._id, score: 0.6, tier: 'significant_investor' },
        ],
      },
    );
    await updateMissionProgress(user._id, 'district_update');
    const mp = await getMissionProgress(user._id, 'district_influence');
    expect(mp.progress).toBe(1);
    expect(mp.status).toBe('completed');
  });

  it('district_leader: does not count districts where another user has higher score', async () => {
    await initializeMissionsForUser(user._id);
    const otherUser = await createTestUser();
    await District.updateOne(
      { _id: district._id },
      {
        influence: [
          { userId: user._id, score: 0.4, tier: 'significant_investor' },
          { userId: otherUser._id, score: 0.9, tier: 'market_leader' },
        ],
      },
    );
    await updateMissionProgress(user._id, 'district_update');
    const mp = await getMissionProgress(user._id, 'district_influence');
    expect(mp.progress).toBe(0);
    expect(mp.status).toBe('active');
  });

  // ── CONSTRUCTION CONDITIONS ──────────────────────────

  it('total_construction_completed: counts completed ConstructionProjects', async () => {
    await initializeMissionsForUser(user._id);
    const land1 = await makeProperty({ cityId: city._id });
    const land2 = await makeProperty({ cityId: city._id });
    await ConstructionProject.create([
      { ownerId: user._id, landId: land1._id, cityId: city._id, projectType: 'residential', projectName: 'C1', category: 'residential', totalCost: 50000, constructionPeriods: 5, status: 'completed', completionPeriod: 10 },
      { ownerId: user._id, landId: land2._id, cityId: city._id, projectType: 'residential', projectName: 'C2', category: 'residential', totalCost: 60000, constructionPeriods: 5, status: 'completed', completionPeriod: 12 },
    ]);
    await updateMissionProgress(user._id, 'construction_complete');
    const mp = await getMissionProgress(user._id, 'dev_first');
    // target=1, capped at 1
    expect(mp.progress).toBe(1);
    expect(mp.status).toBe('completed');
  });

  // ── BANKING CONDITIONS ───────────────────────────────

  it('total_loans_taken: counts Loan documents', async () => {
    await initializeMissionsForUser(user._id);
    await Loan.create([
      { userId: user._id, principal: 50000, paymentPerTick: 1000, interestRate: 0.05, durationTicks: 10, remainingBalance: 50000, ticksRemaining: 10, active: true },
    ]);
    await updateMissionProgress(user._id, 'loan_taken');
    const mp = await getMissionProgress(user._id, 'bank_first_loan');
    expect(mp.progress).toBe(1);
    expect(mp.status).toBe('completed');
  });

  it('credit_score: reads creditScore from User doc', async () => {
    await initializeMissionsForUser(user._id);
    await User.updateOne({ _id: user._id }, { creditScore: 780 });
    user = await User.findById(user._id).lean();
    await updateMissionProgress(user._id, 'credit_update');
    const mp = await getMissionProgress(user._id, 'bank_excellent_credit');
    // value=780, target=750, capped at 750
    expect(mp.progress).toBe(750);
    expect(mp.status).toBe('completed');
  });

  // ── COMPANY CONDITIONS ───────────────────────────────

  it('joined_company: checks membership in RealEstateCompany via members.userId', async () => {
    await initializeMissionsForUser(user._id);
    await RealEstateCompany.create({
      name: 'TestCo',
      founderId: user._id,
      members: [{ userId: user._id, role: 'ceo' }],
    });
    await updateMissionProgress(user._id, 'company_join');
    const mp = await getMissionProgress(user._id, 'company_join');
    expect(mp.progress).toBe(1);
    expect(mp.status).toBe('completed');
  });

  it('company_votes_cast: counts votes in loanRequests and propertyPurchaseRequests', async () => {
    await initializeMissionsForUser(user._id);
    const otherUser = await createTestUser();
    const prop = await makeProperty({ cityId: city._id });
    await RealEstateCompany.create({
      name: 'VoteCo',
      founderId: otherUser._id,
      members: [{ userId: user._id, role: 'member' }, { userId: otherUser._id, role: 'ceo' }],
      loanRequests: [{
        requestedBy: otherUser._id,
        principal: 50000,
        durationTicks: 10,
        loanType: 'business',
        status: 'pending',
        createdTick: 1,
        votes: [{ userId: user._id, vote: 'yes' }],
      }],
      propertyPurchaseRequests: [{
        requestedBy: otherUser._id,
        propertyId: prop._id,
        status: 'pending',
        createdTick: 1,
        votes: [{ userId: user._id, vote: 'yes' }],
      }],
    });
    await updateMissionProgress(user._id, 'company_vote');
    const mp = await getMissionProgress(user._id, 'company_vote');
    // target=1, value=2, capped at 1
    expect(mp.progress).toBe(1);
    expect(mp.status).toBe('completed');
  });

  it('company_projects_completed: counts completed ConstructionProjects with companyId set', async () => {
    await initializeMissionsForUser(user._id);
    const company = await RealEstateCompany.create({
      name: 'BuildCo',
      founderId: user._id,
      members: [{ userId: user._id, role: 'ceo' }],
    });
    const land = await makeProperty({ cityId: city._id });
    await ConstructionProject.create([
      { ownerId: user._id, companyId: company._id, landId: land._id, cityId: city._id, projectType: 'residential', projectName: 'CP1', category: 'residential', totalCost: 50000, constructionPeriods: 5, status: 'completed', completionPeriod: 10 },
    ]);
    await updateMissionProgress(user._id, 'company_project_done');
    const mp = await getMissionProgress(user._id, 'company_project');
    expect(mp.progress).toBe(1);
    expect(mp.status).toBe('completed');
  });

  it('company_properties_purchased: counts Properties with companyId set to user company', async () => {
    await initializeMissionsForUser(user._id);
    const company = await RealEstateCompany.create({
      name: 'PropCo',
      founderId: user._id,
      members: [{ userId: user._id, role: 'ceo' }],
    });
    await makeProperty({ cityId: city._id, companyId: company._id });
    await makeProperty({ cityId: city._id, companyId: company._id });
    await updateMissionProgress(user._id, 'company_purchase');
    const mp = await getMissionProgress(user._id, 'company_purchase');
    // target=1, value=2, capped at 1
    expect(mp.progress).toBe(1);
    expect(mp.status).toBe('completed');
  });

  // ── MARKET INTELLIGENCE CONDITIONS ───────────────────

  it('reports_purchased: counts MarketReports for user', async () => {
    await initializeMissionsForUser(user._id);
    await MarketReport.create([
      { userId: user._id, cityId: city._id, data: {}, forecastAccuracy: 80, priceForecast: [], tier: 'basic', reportType: 'city_market', cost: 1000, purchasedAtTick: 1, expiresAtTick: 100 },
      { userId: user._id, cityId: city._id, data: {}, forecastAccuracy: 85, priceForecast: [], tier: 'basic', reportType: 'city_market', cost: 1000, purchasedAtTick: 2, expiresAtTick: 100 },
    ]);
    await updateMissionProgress(user._id, 'report_purchased');
    const mp = await getMissionProgress(user._id, 'mi_first_report');
    // target=1, capped at 1
    expect(mp.progress).toBe(1);
    expect(mp.status).toBe('completed');
  });

  it('forecast_accuracy_90: returns 1 if any MarketReport has accuracy >=90', async () => {
    await initializeMissionsForUser(user._id);
    await MarketReport.create([
      { userId: user._id, cityId: city._id, data: {}, forecastAccuracy: 92, priceForecast: [], tier: 'basic', reportType: 'city_market', cost: 1000, purchasedAtTick: 1, expiresAtTick: 100 },
    ]);
    await updateMissionProgress(user._id, 'report_purchased');
    const mp = await getMissionProgress(user._id, 'mi_accuracy');
    expect(mp.progress).toBe(1);
    expect(mp.status).toBe('completed');
  });

  // ── DAILY CONDITIONS ─────────────────────────────────

  it('rent_collected_today: returns 1 if rent Transaction exists for today', async () => {
    await initializeMissionsForUser(user._id);
    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);
    await makeTransaction({
      buyerId: user._id,
      type: 'rent',
      createdAt: new Date(dayStart.getTime() + 60000),
    });
    await updateMissionProgress(user._id, 'rent_collected');
    const mp = await getMissionProgress(user._id, 'daily_collect_rent');
    expect(mp.progress).toBe(1);
    expect(mp.status).toBe('completed');
  });

  it('bonus_claimed_today: returns 1 if lastPeriodBonusClaim is today', async () => {
    await initializeMissionsForUser(user._id);
    await User.updateOne({ _id: user._id }, { lastPeriodBonusClaim: new Date() });
    user = await User.findById(user._id).lean();
    await updateMissionProgress(user._id, 'bonus_claimed');
    const mp = await getMissionProgress(user._id, 'daily_bonus');
    expect(mp.progress).toBe(1);
    expect(mp.status).toBe('completed');
  });

  it('login_today: returns 1 if lastLoginAt is today', async () => {
    await initializeMissionsForUser(user._id);
    await User.updateOne({ _id: user._id }, { lastLoginAt: new Date() });
    user = await User.findById(user._id).lean();
    await updateMissionProgress(user._id, 'login');
    const mp = await getMissionProgress(user._id, 'daily_login');
    expect(mp.progress).toBe(1);
    expect(mp.status).toBe('completed');
  });

  // ── WEEKLY CONDITIONS ────────────────────────────────

  it('money_earned_this_week: sums sell (sellerId) and rent (buyerId) Transactions from this week', async () => {
    const weekStart = new Date();
    weekStart.setUTCHours(0, 0, 0, 0);
    weekStart.setUTCDate(weekStart.getUTCDate() - weekStart.getUTCDay());
    await makeTransaction({
      sellerId: user._id, type: 'sell', price: 50000,
      createdAt: new Date(weekStart.getTime() + 60000),
    });
    await makeTransaction({
      buyerId: user._id, type: 'rent', price: 3000,
      createdAt: new Date(weekStart.getTime() + 120000),
    });
    const value = await evaluateCondition(user._id, null, { type: 'money_earned_this_week', target: 100000 }, {});
    expect(value).toBe(53000);
  });

  it('properties_bought_this_week: counts Properties purchased this week', async () => {
    const weekStart = new Date();
    weekStart.setUTCHours(0, 0, 0, 0);
    weekStart.setUTCDate(weekStart.getUTCDate() - weekStart.getUTCDay());
    await makeProperty({
      ownerId: user._id, cityId: city._id,
      lastPurchaseDate: new Date(weekStart.getTime() + 60000),
    });
    await makeProperty({
      ownerId: user._id, cityId: city._id,
      lastPurchaseDate: new Date(weekStart.getTime() + 120000),
    });
    const value = await evaluateCondition(user._id, null, { type: 'properties_bought_this_week', target: 5 }, {});
    expect(value).toBe(2);
  });

  it('auctions_won_this_week: counts ended Auctions won this week by winnerId', async () => {
    const weekStart = new Date();
    weekStart.setUTCHours(0, 0, 0, 0);
    weekStart.setUTCDate(weekStart.getUTCDate() - weekStart.getUTCDay());
    const prop = await makeProperty({ cityId: city._id });
    await Auction.create({
      propertyId: prop._id,
      sellerType: 'bank',
      startingBid: 50000,
      bidIncrement: 1000,
      winnerId: user._id,
      winningBid: 55000,
      status: 'ended',
      startTick: 0,
      endTick: 10,
      originalEndTick: 10,
      updatedAt: new Date(weekStart.getTime() + 60000),
    });
    const value = await evaluateCondition(user._id, null, { type: 'auctions_won_this_week', target: 1 }, {});
    expect(value).toBe(1);
  });

  it('rent_collected_this_week: counts rent Transactions this week', async () => {
    await initializeMissionsForUser(user._id);
    const weekStart = new Date();
    weekStart.setUTCHours(0, 0, 0, 0);
    weekStart.setUTCDate(weekStart.getUTCDate() - weekStart.getUTCDay());
    const prop = await makeProperty({ cityId: city._id });
    for (let i = 0; i < 3; i++) {
      await Transaction.create({
        buyerId: user._id,
        type: 'rent',
        price: 1000,
        propertyId: prop._id,
        createdAt: new Date(weekStart.getTime() + i * 60000),
      });
    }
    await updateMissionProgress(user._id, 'rent_collect');
    const mp = await getMissionProgress(user._id, 'weekly_collect_rent');
    expect(mp.progress).toBe(3);
  });

  it('bonus_claimed_this_week: counts period_bonus Transactions this week', async () => {
    await initializeMissionsForUser(user._id);
    const weekStart = new Date();
    weekStart.setUTCHours(0, 0, 0, 0);
    weekStart.setUTCDate(weekStart.getUTCDate() - weekStart.getUTCDay());
    for (let i = 0; i < 5; i++) {
      await Transaction.create({
        buyerId: user._id,
        type: 'period_bonus',
        price: 500,
        createdAt: new Date(weekStart.getTime() + i * 60000),
      });
    }
    await updateMissionProgress(user._id, 'bonus_claim');
    const mp = await getMissionProgress(user._id, 'weekly_bonus');
    expect(mp.progress).toBe(5);
    expect(mp.status).toBe('completed');
  });

  it('login_count_this_week: counts login Transactions this week', async () => {
    await initializeMissionsForUser(user._id);
    const weekStart = new Date();
    weekStart.setUTCHours(0, 0, 0, 0);
    weekStart.setUTCDate(weekStart.getUTCDate() - weekStart.getUTCDay());
    for (let i = 0; i < 3; i++) {
      await Transaction.create({ buyerId: user._id, price: 0, type: 'login', createdAt: new Date(weekStart.getTime() + i * 60000) });
    }
    await updateMissionProgress(user._id, 'login');
    const mp = await getMissionProgress(user._id, 'weekly_login');
    expect(mp.progress).toBe(3);
    expect(mp.status).toBe('active');
  });

  it('login_count_this_week: completes at 5 logins', async () => {
    await initializeMissionsForUser(user._id);
    const weekStart = new Date();
    weekStart.setUTCHours(0, 0, 0, 0);
    weekStart.setUTCDate(weekStart.getUTCDate() - weekStart.getUTCDay());
    for (let i = 0; i < 5; i++) {
      await Transaction.create({ buyerId: user._id, price: 0, type: 'login', createdAt: new Date(weekStart.getTime() + i * 60000) });
    }
    await updateMissionProgress(user._id, 'login');
    const mp = await getMissionProgress(user._id, 'weekly_login');
    expect(mp.progress).toBe(5);
    expect(mp.status).toBe('completed');
  });

  it('login_count_this_week: returns 0 if no logins', async () => {
    await initializeMissionsForUser(user._id);
    await updateMissionProgress(user._id, 'login');
    const mp = await getMissionProgress(user._id, 'weekly_login');
    expect(mp.progress).toBe(0);
    expect(mp.status).toBe('active');
  });
});
