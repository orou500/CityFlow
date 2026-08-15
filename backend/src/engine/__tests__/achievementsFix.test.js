import { describe, it, expect, beforeEach } from 'vitest';
import User from '../../models/User.js';
import Property from '../../models/Property.js';
import City from '../../models/City.js';
import MarketReport from '../../models/MarketReport.js';
import MissionProgress from '../../models/MissionProgress.js';
import RealEstateCompany from '../../models/RealEstateCompany.js';
import { createTestUser, createTestCity } from '../../test/helpers.js';
import { checkAndAwardAchievements } from '../careerProcessing.js';
import { claimMissionReward } from '../missionProcessing.js';
import { ACHIEVEMENT_DEFINITIONS, getAchievementById } from '../../config/achievements.js';

const REQUIRED = [
  'Tycoon',
  'Auction Legend',
  'IPO Founder',
  'Globetrotter',
  'Global Investor',
  'High Roller',
  'Market Guru',
  'Debt Free King',
  'World Traveler',
  'District Power',
  'Prophet',
];

describe('achievement audit (definitions exist, conditions resolvable)', () => {
  it('every required achievement name exists in ACHIEVEMENT_DEFINITIONS', () => {
    const names = new Set(ACHIEVEMENT_DEFINITIONS.map((a) => a.name));
    for (const name of REQUIRED) {
      expect(names.has(name), `missing achievement: ${name}`).toBe(true);
    }
  });

  it('definitions have a condition type, target and category', () => {
    for (const a of ACHIEVEMENT_DEFINITIONS) {
      expect(a.condition?.type, `${a.id} condition.type`).toBeTruthy();
      expect(typeof a.condition.target, `${a.id} condition.target`).toBe('number');
      expect(a.category, `${a.id} category`).toBeTruthy();
    }
  });

  it('every achievement has a non-empty icon so the UI never falls back to the wrong icon', () => {
    for (const a of ACHIEVEMENT_DEFINITIONS) {
      expect(typeof a.icon, `${a.id} icon`).toBe('string');
      expect(a.icon.trim(), `${a.id} icon must not be blank`).not.toBe('');
      // A single unpaired surrogate would render as a broken glyph (e.g. a
      // raw escape written as JSX text instead of a JS string).
      expect(a.icon, `${a.id} icon must be a valid emoji sequence`).not.toMatch(/^\\u[0-9a-fA-F]{4}$/);
    }
  });

  it('the 11 title-mirror achievements keep their distinct icons', () => {
    const iconById = Object.fromEntries(ACHIEVEMENT_DEFINITIONS.map((a) => [a.id, a.icon]));
    const expects = {
      tycoon_ach: '🏆',
      auction_100: '🏆',
      ipo_founder_ach: '🏛️',
      globetrotter_ach: '🧭',
      global_investor_ach: '🌍',
      high_roller_ach: '💵',
      market_guru_ach: '💹',
      debt_free: '✅',
      world_traveler_ach: '✈️',
      district_power_ach: '⚡',
      prophet_ach: '🔮',
    };
    for (const [id, icon] of Object.entries(expects)) {
      expect(iconById[id], `${id} icon`).toBe(icon);
    }
  });

  it('Debt Free King keeps the stable id debt_free (no duplicate unlocks)', () => {
    expect(getAchievementById('debt_free').name).toBe('Debt Free King');
    expect(ACHIEVEMENT_DEFINITIONS.filter((a) => a.name === 'Debt Free King')).toHaveLength(1);
  });
});

describe('new achievements (High Roller, Global Investor, Prophet, Globetrotter, IPO Founder)', () => {
  beforeEach(async () => {
    await User.deleteMany({});
    await Property.deleteMany({});
    await City.deleteMany({});
    await MarketReport.deleteMany({});
    await MissionProgress.deleteMany({});
  });

  it('high_roller_ach unlocks at $100k monthly income', async () => {
    const user = await createTestUser({});
    const city = await createTestCity();
    await Property.create({
      cityId: city._id,
      name: `IncProp_${Date.now()}`,
      type: 'house',
      basePrice: 200000,
      currentPrice: 200000,
      rent: 60000,
      ownerId: user._id,
    });
    await Property.create({
      cityId: city._id,
      name: `IncProp2_${Date.now()}`,
      type: 'house',
      basePrice: 200000,
      currentPrice: 200000,
      rent: 50000,
      ownerId: user._id,
    });

    const awarded = await checkAndAwardAchievements(user._id, 'test');
    expect(awarded.map((a) => a.id)).toContain('high_roller_ach');

    const updated = await User.findById(user._id);
    expect(updated.achievements).toContain('high_roller_ach');
    expect(updated.titles).toContain('High Roller');

    // Idempotency: a second evaluation awards nothing new.
    const again = await checkAndAwardAchievements(user._id, 'test');
    expect(again.find((a) => a.id === 'high_roller_ach')).toBeUndefined();
  });

  it('global_investor_ach unlocks with properties in 5 cities', async () => {
    const user = await createTestUser({});
    const cities = [];
    for (let i = 0; i < 5; i += 1) {
      cities.push(await createTestCity({ name: `AchCity_${Date.now()}_${i}` }));
    }
    for (const c of cities) {
      await Property.create({
        cityId: c._id,
        name: `GeoProp_${Date.now()}_${c.name}`,
        type: 'apartment',
        basePrice: 100000,
        currentPrice: 100000,
        ownerId: user._id,
      });
    }

    const awarded = await checkAndAwardAchievements(user._id, 'test');
    expect(awarded.map((a) => a.id)).toContain('global_investor_ach');
  });

  it('prophet_ach unlocks at 90% forecast accuracy', async () => {
    const user = await createTestUser({});
    await MarketReport.create({
      userId: user._id,
      cityId: (await createTestCity())._id,
      data: {},
      forecastAccuracy: 92,
      priceForecast: [],
      tier: 'basic',
      reportType: 'city_market',
      cost: 1000,
      purchasedAtTick: 1,
      expiresAtTick: 100,
    });
    const awarded = await checkAndAwardAchievements(user._id, 'test');
    expect(awarded.map((a) => a.id)).toContain('prophet_ach');
  });

  it('globetrotter_ach unlocks with properties in 6 countries', async () => {
    const user = await createTestUser({});
    const countries = ['AchCountry A', 'B', 'C', 'D', 'E', 'F'];
    for (const country of countries) {
      const city = await createTestCity({ name: `GlobeCity_${Date.now()}_${country}`, country });
      await Property.create({
        cityId: city._id,
        name: `GlobeProp_${Date.now()}_${country}`,
        type: 'apartment',
        basePrice: 100000,
        currentPrice: 100000,
        ownerId: user._id,
      });
    }
    const awarded = await checkAndAwardAchievements(user._id, 'test');
    expect(awarded.map((a) => a.id)).toContain('globetrotter_ach');
  });

  it('ipo_founder_ach unlocks when a founded company is listed via IPO', async () => {
    const user = await createTestUser({});
    await RealEstateCompany.create({
      name: `AchCompany_${Date.now()}`,
      founderId: user._id,
      hqCityId: (await createTestCity())._id,
      ipo: { listed: true },
      members: [{ userId: user._id, role: 'ceo', shares: 700 }],
      shares: { treasuryShares: 300 },
    });

    const awarded = await checkAndAwardAchievements(user._id, 'test');
    expect(awarded.map((a) => a.id)).toContain('ipo_founder_ach');
  });
});

describe('mission titles are granted to user.titles on claim', () => {
  beforeEach(async () => {
    await User.deleteMany({});
    await MissionProgress.deleteMany({});
  });

  it('claiming a title mission adds the title to user.titles (persisted)', async () => {
    const user = await createTestUser({});
    // The mission must exist as a completed progress row before claiming.
    await MissionProgress.create({
      userId: user._id,
      missionId: 'income_100k',
      status: 'completed',
      progress: 100000,
      target: 100000,
      type: 'permanent',
    });

    await claimMissionReward(user._id, 'income_100k');

    const updated = await User.findById(user._id);
    expect(updated.titles).toContain('High Roller');
  });
});
