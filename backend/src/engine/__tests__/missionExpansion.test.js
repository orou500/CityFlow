import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import mongoose from 'mongoose';
import User from '../../models/User.js';
import Property from '../../models/Property.js';
import City from '../../models/City.js';
import Transaction from '../../models/Transaction.js';
import MissionProgress from '../../models/MissionProgress.js';
import FriendRequest from '../../models/FriendRequest.js';
import UserVisit from '../../models/UserVisit.js';
import CompanyAuditLog from '../../models/CompanyAuditLog.js';
import Auction from '../../models/Auction.js';
import StockTransaction from '../../models/StockTransaction.js';
import StockHolding from '../../models/StockHolding.js';
import Company from '../../models/Company.js';
import RealEstateCompany from '../../models/RealEstateCompany.js';
import { createTestUser, createTestCity } from '../../test/helpers.js';
import {
  initializeMissionsForUser,
  updateMissionProgress,
  evaluateCondition,
  SUPPORTED_CONDITION_TYPES,
} from '../missionProcessing.js';
import { MISSION_DEFINITIONS } from '../../config/missions.js';

const getMissionProgress = async (userId, missionId) => MissionProgress.findOne({ userId, missionId }).lean();

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

async function getLeanUser(userId) {
  return User.findById(userId).lean();
}

afterAll(async () => {
  await UserVisit.deleteMany({});
  await FriendRequest.deleteMany({});
  await CompanyAuditLog.deleteMany({});
  await StockTransaction.deleteMany({});
  await StockHolding.deleteMany({});
  await Company.deleteMany({});
  await City.deleteMany({});
  await Property.deleteMany({});
});

describe('Mission config integrity', () => {
  it('every mission definition uses a supported condition type', () => {
    const unknown = MISSION_DEFINITIONS.filter((m) => !SUPPORTED_CONDITION_TYPES.includes(m.condition.type)).map(
      (m) => `${m.id}:${m.condition.type}`,
    );
    expect(unknown).toEqual([]);
  });

  it('mission ids are unique', () => {
    const ids = MISSION_DEFINITIONS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('the new mission categories exist', () => {
    const categories = new Set(MISSION_DEFINITIONS.map((m) => m.category));
    expect(categories.has('social')).toBe(true);
    expect(categories.has('marketplace')).toBe(true);
    expect(categories.has('stocks')).toBe(true);
    expect(categories.has('exploration')).toBe(true);
    expect(categories.has('engagement')).toBe(true);
  });

  it('includes the expected new missions across categories', () => {
    const ids = new Set(MISSION_DEFINITIONS.map((m) => m.id));
    for (const id of [
      'social_first_friend',
      'social_10_friends',
      'social_accept_request',
      'social_visit_profile',
      'social_invite_player',
      'social_recruit_3',
      'social_company_contract',
      'market_list_property',
      'market_profit_sale',
      'market_property_value_1m',
      'stock_first_buy',
      'stock_first_dividend',
      'stock_3_companies',
      'stock_make_profit',
      'stock_ipo_shares',
      'explore_city_3',
      'explore_districts_5',
      'explore_countries_3',
      'explore_market_report',
      'company_hire_employee',
      'company_take_loan',
      'company_ipo',
      'engage_login_streak_3',
      'engage_login_streak_7',
      'engage_login_streak_14',
      'engage_complete_3',
      'engage_achievement',
      'daily_profile_visit',
      'daily_check_market',
      'daily_stock_trade',
      'weekly_stock_trades',
      'weekly_visits',
      'weekly_auction_bids',
      'property_first_improvement',
      'income_rent_100k',
    ]) {
      expect(ids.has(id), `missing mission ${id}`).toBe(true);
    }
  });
});

describe('Mission Conditions — social', () => {
  let user;

  beforeEach(async () => {
    await User.deleteMany({});
    await FriendRequest.deleteMany({});
    await UserVisit.deleteMany({});
    await MissionProgress.deleteMany({});
    await RealEstateCompany.deleteMany({});
    await CompanyAuditLog.deleteMany({});
    user = await createTestUser();
  });

  it('friends_added: counts accepted friends', async () => {
    const friend1 = await createTestUser();
    const friend2 = await createTestUser();
    await User.updateOne({ _id: user._id }, { $set: { friends: [friend1._id, friend2._id] } });
    const lean = await getLeanUser(user._id);

    const value = await evaluateCondition(user._id, 'social_3_friends', { type: 'friends_added', target: 3 }, lean);
    expect(value).toBe(2);
  });

  it('friend_requests_accepted: counts accepted requests where the user is the receiver', async () => {
    const sender = await createTestUser();
    await FriendRequest.create({ senderId: sender._id, receiverId: user._id, status: 'accepted' });
    await FriendRequest.create({ senderId: user._id, receiverId: sender._id, status: 'accepted' });

    const value = await evaluateCondition(
      user._id,
      'social_accept_request',
      { type: 'friend_requests_accepted', target: 1 },
      await getLeanUser(user._id),
    );
    expect(value).toBe(1);
  });

  it('profiles_visited: counts profile visits made by the user', async () => {
    const other = await createTestUser();
    await UserVisit.create({ userId: user._id, targetType: 'profile', targetId: other._id });
    await UserVisit.create({ userId: user._id, targetType: 'profile', targetId: other._id });

    const value = await evaluateCondition(
      user._id,
      'social_visit_profile',
      { type: 'profiles_visited', target: 1 },
      await getLeanUser(user._id),
    );
    expect(value).toBe(2);
  });

  it('company_members_recruited: counts company members excluding the player', async () => {
    const m1 = await createTestUser();
    const m2 = await createTestUser();
    await RealEstateCompany.create({
      name: 'Recruit Co',
      founderId: user._id,
      members: [
        { userId: user._id, role: 'ceo', shares: 1000 },
        { userId: m1._id, role: 'member', shares: 100 },
        { userId: m2._id, role: 'recruit', shares: 50 },
      ],
      treasury: { balance: 0, transactions: [] },
      active: true,
      level: 1,
      foundedTick: 0,
    });

    const value = await evaluateCondition(
      user._id,
      'social_recruit_3',
      { type: 'company_members_recruited', target: 3 },
      await getLeanUser(user._id),
    );
    expect(value).toBe(2);
  });

  it('company audit conditions read the audit log', async () => {
    const company = await RealEstateCompany.create({
      name: 'Audit Co',
      founderId: user._id,
      members: [{ userId: user._id, role: 'ceo', shares: 1000 }],
      treasury: { balance: 0, transactions: [] },
      active: true,
      level: 1,
      foundedTick: 0,
    });
    await CompanyAuditLog.create({ companyId: company._id, userId: user._id, action: 'member_invited' });
    await CompanyAuditLog.create({ companyId: company._id, userId: user._id, action: 'loan_taken' });
    await CompanyAuditLog.create({ companyId: company._id, userId: user._id, action: 'employees_hired' });
    await CompanyAuditLog.create({ companyId: company._id, userId: user._id, action: 'contract_completed' });
    await CompanyAuditLog.create({ companyId: company._id, userId: user._id, action: 'ipo_listed' });
    const lean = await getLeanUser(user._id);

    expect(
      await evaluateCondition(user._id, 'social_invite_player', { type: 'company_invites_sent', target: 1 }, lean),
    ).toBe(1);
    expect(
      await evaluateCondition(user._id, 'company_take_loan', { type: 'company_loans_taken', target: 1 }, lean),
    ).toBe(1);
    expect(
      await evaluateCondition(user._id, 'company_hire_employee', { type: 'company_employees_hired', target: 1 }, lean),
    ).toBe(1);
    expect(
      await evaluateCondition(
        user._id,
        'social_company_contract',
        { type: 'company_contracts_completed', target: 1 },
        lean,
      ),
    ).toBe(1);
    expect(await evaluateCondition(user._id, 'company_ipo', { type: 'company_ipo_listed', target: 1 }, lean)).toBe(1);
  });
});

describe('Mission Conditions — marketplace & auctions', () => {
  let user;
  let city;

  beforeEach(async () => {
    await User.deleteMany({});
    await Property.deleteMany({});
    await Transaction.deleteMany({});
    await MissionProgress.deleteMany({});
    await Auction.deleteMany({});
    user = await createTestUser();
    city = await createTestCity();
  });

  it('properties_bought: counts buy transactions', async () => {
    await makeTransaction({ buyerId: user._id, type: 'buy' });
    await makeTransaction({ buyerId: user._id, type: 'buy' });
    const value = await evaluateCondition(
      user._id,
      'market_buy_property',
      { type: 'properties_bought', target: 1 },
      await getLeanUser(user._id),
    );
    expect(value).toBe(2);
  });

  it('properties_listed: counts owned properties listed for sale', async () => {
    await makeProperty({ ownerId: user._id, cityId: city._id, forSale: true });
    await makeProperty({ ownerId: user._id, cityId: city._id, forSale: false });
    const value = await evaluateCondition(
      user._id,
      'market_list_property',
      { type: 'properties_listed', target: 1 },
      await getLeanUser(user._id),
    );
    expect(value).toBe(1);
  });

  it('property_value: sums current price of owned properties', async () => {
    await makeProperty({ ownerId: user._id, cityId: city._id, currentPrice: 300000 });
    await makeProperty({ ownerId: user._id, cityId: city._id, currentPrice: 700000 });
    const value = await evaluateCondition(
      user._id,
      'market_property_value_1m',
      { type: 'property_value', target: 1000000 },
      await getLeanUser(user._id),
    );
    expect(value).toBe(1000000);
  });

  it('property_sale_profit: counts only profitable sales', async () => {
    const win = await makeProperty({ ownerId: null, cityId: city._id, lastPurchasePrice: 80000 });
    const loss = await makeProperty({ ownerId: null, cityId: city._id, lastPurchasePrice: 150000 });
    await makeTransaction({ sellerId: user._id, propertyId: win._id, type: 'sell', price: 100000 });
    await makeTransaction({ sellerId: user._id, propertyId: loss._id, type: 'sell', price: 100000 });
    const value = await evaluateCondition(
      user._id,
      'market_profit_sale',
      { type: 'property_sale_profit', target: 1 },
      await getLeanUser(user._id),
    );
    expect(value).toBe(1);
  });

  it('property_improvements: counts improvement transactions', async () => {
    await makeTransaction({ buyerId: user._id, type: 'improvement' });
    const value = await evaluateCondition(
      user._id,
      'property_first_improvement',
      { type: 'property_improvements', target: 1 },
      await getLeanUser(user._id),
    );
    expect(value).toBe(1);
  });

  it('rent_total_earned: sums rent transaction prices', async () => {
    await makeTransaction({ buyerId: user._id, type: 'rent', price: 40000 });
    await makeTransaction({ buyerId: user._id, type: 'rent', price: 60000 });
    const value = await evaluateCondition(
      user._id,
      'income_rent_100k',
      { type: 'rent_total_earned', target: 100000 },
      await getLeanUser(user._id),
    );
    expect(value).toBe(100000);
  });

  it('auction_bids_placed: counts auctions where the user bid', async () => {
    const auction = await Auction.create({
      propertyId: new mongoose.Types.ObjectId(),
      sellerType: 'bank',
      startingBid: 100,
      startTick: 1,
      endTick: 100,
      originalEndTick: 100,
      bidIncrement: 10,
      status: 'active',
    });
    auction.bids.push({ bidderId: user._id, amount: 200, tick: 10, username: user.username });
    await auction.save();

    const value = await evaluateCondition(
      user._id,
      'auction_participate',
      { type: 'auction_bids_placed', target: 1 },
      await getLeanUser(user._id),
    );
    expect(value).toBe(1);
  });
});

describe('Mission Conditions — stock market', () => {
  let user;
  let city;

  beforeEach(async () => {
    await User.deleteMany({});
    await StockTransaction.deleteMany({});
    await StockHolding.deleteMany({});
    await Company.deleteMany({});
    await MissionProgress.deleteMany({});
    await City.deleteMany({});
    user = await createTestUser();
    city = await createTestCity();
  });

  function makeCompany(overrides = {}) {
    return Company.create({
      name: 'Test Stock Co',
      ticker: `STK${Math.floor(Math.random() * 10000)}`,
      industry: 'technology',
      hqCityId: city._id,
      active: true,
      isIPO: false,
      ...overrides,
    });
  }

  it('stocks_bought: counts buy transactions', async () => {
    const co = await makeCompany();
    await StockTransaction.create({
      userId: user._id,
      companyId: co._id,
      type: 'buy',
      shares: 10,
      price: 50,
      total: 500,
    });
    const value = await evaluateCondition(
      user._id,
      'stock_first_buy',
      { type: 'stocks_bought', target: 1 },
      await getLeanUser(user._id),
    );
    expect(value).toBe(1);
  });

  it('dividends_received: counts dividend claim transactions', async () => {
    const co = await makeCompany();
    await StockTransaction.create({
      userId: user._id,
      companyId: co._id,
      type: 'dividend',
      shares: 0,
      price: 0,
      total: 100,
    });
    const value = await evaluateCondition(
      user._id,
      'stock_first_dividend',
      { type: 'dividends_received', target: 1 },
      await getLeanUser(user._id),
    );
    expect(value).toBe(1);
  });

  it('stocks_owned_companies: counts companies with shares held', async () => {
    const c1 = await makeCompany();
    const c2 = await makeCompany();
    const c3 = await makeCompany();
    await StockHolding.create({ userId: user._id, companyId: c1._id, shares: 5, avgBuyPrice: 10 });
    await StockHolding.create({ userId: user._id, companyId: c2._id, shares: 0, avgBuyPrice: 10 });
    await StockHolding.create({ userId: user._id, companyId: c3._id, shares: 7, avgBuyPrice: 10 });
    const value = await evaluateCondition(
      user._id,
      'stock_3_companies',
      { type: 'stocks_owned_companies', target: 3 },
      await getLeanUser(user._id),
    );
    expect(value).toBe(2);
  });

  it('stock_profit: reads realized profit from lifetimeStats', async () => {
    await User.updateOne({ _id: user._id }, { $set: { 'lifetimeStats.stockProfit': 25000 } });
    const value = await evaluateCondition(
      user._id,
      'stock_make_profit',
      { type: 'stock_profit', target: 10000 },
      await getLeanUser(user._id),
    );
    expect(value).toBe(25000);
  });

  it('ipo_shares_bought: counts buys in IPO companies only', async () => {
    const ipo = await makeCompany({ isIPO: true });
    const regular = await makeCompany();
    await StockTransaction.create({
      userId: user._id,
      companyId: ipo._id,
      type: 'buy',
      shares: 10,
      price: 100,
      total: 1000,
    });
    await StockTransaction.create({
      userId: user._id,
      companyId: regular._id,
      type: 'buy',
      shares: 10,
      price: 50,
      total: 500,
    });
    const value = await evaluateCondition(
      user._id,
      'stock_ipo_shares',
      { type: 'ipo_shares_bought', target: 1 },
      await getLeanUser(user._id),
    );
    expect(value).toBe(1);
  });
});

describe('Mission Conditions — exploration & engagement', () => {
  let user;

  beforeEach(async () => {
    await User.deleteMany({});
    await UserVisit.deleteMany({});
    await MissionProgress.deleteMany({});
    await City.deleteMany({});
    await Property.deleteMany({});
    await Transaction.deleteMany({});
    await StockTransaction.deleteMany({});
    await Auction.deleteMany({});
    user = await createTestUser();
  });

  it('city_visits / district_visits / market_visits count distinct targets', async () => {
    const c1 = new mongoose.Types.ObjectId();
    const c2 = new mongoose.Types.ObjectId();
    const d1 = new mongoose.Types.ObjectId();
    await UserVisit.create({ userId: user._id, targetType: 'city', targetId: c1 });
    await UserVisit.create({ userId: user._id, targetType: 'city', targetId: c1 });
    await UserVisit.create({ userId: user._id, targetType: 'city', targetId: c2 });
    await UserVisit.create({ userId: user._id, targetType: 'district', targetId: d1 });
    await UserVisit.create({ userId: user._id, targetType: 'market', targetId: null });

    const lean = await getLeanUser(user._id);
    expect(await evaluateCondition(user._id, 'explore_city_3', { type: 'city_visits', target: 3 }, lean)).toBe(2);
    expect(await evaluateCondition(user._id, 'explore_districts_5', { type: 'district_visits', target: 5 }, lean)).toBe(
      1,
    );
    expect(await evaluateCondition(user._id, 'engage_check_market', { type: 'market_visits', target: 5 }, lean)).toBe(
      1,
    );
  });

  it('countries_owned: counts distinct countries of owned properties', async () => {
    const c1 = await createTestCity({ country: 'Israel' });
    const c2 = await createTestCity({ country: 'USA' });
    const c3 = await createTestCity({ country: 'USA' });
    await makeProperty({ ownerId: user._id, cityId: c1._id });
    await makeProperty({ ownerId: user._id, cityId: c2._id });
    await makeProperty({ ownerId: user._id, cityId: c3._id });
    const value = await evaluateCondition(
      user._id,
      'explore_countries_3',
      { type: 'countries_owned', target: 3 },
      await getLeanUser(user._id),
    );
    expect(value).toBe(2);
  });

  it('login_streak: counts consecutive login days', async () => {
    const today = new Date();
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    const twoDaysAgo = new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000);
    const fourDaysAgo = new Date(today.getTime() - 4 * 24 * 60 * 60 * 1000);
    await makeTransaction({ buyerId: user._id, type: 'login', createdAt: today });
    await makeTransaction({ buyerId: user._id, type: 'login', createdAt: yesterday });
    await makeTransaction({ buyerId: user._id, type: 'login', createdAt: twoDaysAgo });
    await makeTransaction({ buyerId: user._id, type: 'login', createdAt: fourDaysAgo });

    const value = await evaluateCondition(
      user._id,
      'engage_login_streak_3',
      { type: 'login_streak', target: 3 },
      await getLeanUser(user._id),
    );
    expect(value).toBe(3);
  });

  it('login_streak: counts a streak that ended yesterday (no login today)', async () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    await makeTransaction({ buyerId: user._id, type: 'login', createdAt: yesterday });
    await makeTransaction({ buyerId: user._id, type: 'login', createdAt: twoDaysAgo });

    const value = await evaluateCondition(
      user._id,
      'engage_login_streak_3',
      { type: 'login_streak', target: 3 },
      await getLeanUser(user._id),
    );
    expect(value).toBe(2);
  });

  it('missions_completed: counts completed and claimed missions', async () => {
    await MissionProgress.create({
      userId: user._id,
      missionId: 'first_property',
      status: 'completed',
      progress: 1,
      target: 1,
    });
    await MissionProgress.create({
      userId: user._id,
      missionId: 'first_rent',
      status: 'claimed',
      progress: 1,
      target: 1,
    });
    await MissionProgress.create({
      userId: user._id,
      missionId: 'first_upgrade',
      status: 'active',
      progress: 0,
      target: 1,
    });
    const value = await evaluateCondition(
      user._id,
      'engage_complete_3',
      { type: 'missions_completed', target: 3 },
      await getLeanUser(user._id),
    );
    expect(value).toBe(2);
  });

  it('achievements_unlocked: counts achievements on the user', async () => {
    await User.updateOne({ _id: user._id }, { $set: { achievements: ['first_property', 'first_rent'] } });
    const value = await evaluateCondition(
      user._id,
      'engage_achievement',
      { type: 'achievements_unlocked', target: 1 },
      await getLeanUser(user._id),
    );
    expect(value).toBe(2);
  });

  it('views_today / views_this_week count UserVisit by period', async () => {
    await UserVisit.create({ userId: user._id, targetType: 'profile', targetId: new mongoose.Types.ObjectId() });
    await UserVisit.create({
      userId: user._id,
      targetType: 'profile',
      targetId: new mongoose.Types.ObjectId(),
      createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
    });
    const lean = await getLeanUser(user._id);
    expect(await evaluateCondition(user._id, 'daily_profile_visit', { type: 'views_today', target: 1 }, lean)).toBe(1);
    expect(await evaluateCondition(user._id, 'weekly_visits', { type: 'views_this_week', target: 5 }, lean)).toBe(1);
  });

  it('stock_trades_today / stock_trades_this_week count by period', async () => {
    const co = await Company.create({
      name: 'Trade Co',
      ticker: `TRD${Math.floor(Math.random() * 10000)}`,
      industry: 'finance',
      hqCityId: new mongoose.Types.ObjectId(),
      active: true,
    });
    await StockTransaction.create({
      userId: user._id,
      companyId: co._id,
      type: 'buy',
      shares: 1,
      price: 10,
      total: 10,
    });
    const lean = await getLeanUser(user._id);
    expect(
      await evaluateCondition(user._id, 'daily_stock_trade', { type: 'stock_trades_today', target: 1 }, lean),
    ).toBe(1);
    expect(
      await evaluateCondition(user._id, 'weekly_stock_trades', { type: 'stock_trades_this_week', target: 5 }, lean),
    ).toBe(1);
  });
});

describe('Mission progress via real action flow', () => {
  it('visiting a profile advances social_visit_profile through the full mission pipeline', async () => {
    await User.deleteMany({});
    await UserVisit.deleteMany({});
    await MissionProgress.deleteMany({});

    const visitor = await createTestUser();
    const target = await createTestUser();
    await initializeMissionsForUser(visitor._id);

    const { recordVisit } = await import('../../utils/visitTracking.js');
    await recordVisit(visitor._id, 'profile', target._id);

    const mp = await getMissionProgress(visitor._id, 'social_visit_profile');
    expect(mp).not.toBeNull();
    expect(mp.progress).toBe(1);
    expect(mp.status).toBe('completed');
  });
});
