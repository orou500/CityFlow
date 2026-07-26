import { describe, it, expect } from 'vitest';
import {
  calculateBaseRisk,
  getRiskLevel,
  getGrowthMultiplier,
  getHazardProbability,
  RISK_LEVELS,
  LOCATION_RISK,
} from '../../config/propertyRisk.js';

const mockCity = (overrides = {}) => ({
  name: 'Test City',
  country: 'Test Country',
  demandIndex: 1.0,
  supplyIndex: 1.0,
  growthRate: 0.01,
  economicCondition: 'stable',
  population: 1000000,
  ...overrides,
});

const mockProperty = (overrides = {}) => ({
  name: 'Test Property',
  type: 'apartment',
  location: 'Suburban',
  condition: 100,
  maintenanceLevel: 'basic',
  riskScore: 20,
  volatility: 0.1,
  ...overrides,
});

describe('calculateBaseRisk', () => {
  it('returns moderate risk for default property in stable city', () => {
    const property = mockProperty();
    const city = mockCity();
    const score = calculateBaseRisk(property, city);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('returns higher risk for coastal property', () => {
    const coastal = calculateBaseRisk(mockProperty({ location: 'Coastal' }), mockCity());
    const suburban = calculateBaseRisk(mockProperty({ location: 'Suburban' }), mockCity());
    expect(coastal).toBeGreaterThan(suburban);
  });

  it('increases risk in recession', () => {
    const recession = calculateBaseRisk(mockProperty(), mockCity({ economicCondition: 'recession' }));
    const boom = calculateBaseRisk(mockProperty(), mockCity({ economicCondition: 'boom' }));
    expect(recession).toBeGreaterThan(boom);
  });

  it('increases risk for commercial properties', () => {
    const commercial = calculateBaseRisk(mockProperty({ type: 'commercial' }), mockCity());
    const apartment = calculateBaseRisk(mockProperty({ type: 'apartment' }), mockCity());
    expect(commercial).toBeGreaterThan(apartment);
  });

  it('increases risk for poor condition', () => {
    const poorCondition = calculateBaseRisk(mockProperty({ condition: 30 }), mockCity());
    const goodCondition = calculateBaseRisk(mockProperty({ condition: 100 }), mockCity());
    expect(poorCondition).toBeGreaterThan(goodCondition);
  });

  it('increases risk for no maintenance', () => {
    const none = calculateBaseRisk(mockProperty({ maintenanceLevel: 'none' }), mockCity());
    const premium = calculateBaseRisk(mockProperty({ maintenanceLevel: 'premium' }), mockCity());
    expect(none).toBeGreaterThan(premium);
  });

  it('clamps score between 0 and 100', () => {
    const veryLow = calculateBaseRisk(
      mockProperty({ location: 'Residential', condition: 100, maintenanceLevel: 'premium' }),
      mockCity({ economicCondition: 'boom', demandIndex: 1.5 }),
    );
    const veryHigh = calculateBaseRisk(
      mockProperty({ location: 'Coastal', type: 'land', condition: 10, maintenanceLevel: 'none' }),
      mockCity({ economicCondition: 'recession', demandIndex: 0.3 }),
    );
    expect(veryLow).toBeGreaterThanOrEqual(0);
    expect(veryHigh).toBeLessThanOrEqual(100);
  });

  it('produces different scores for different locations', () => {
    const locations = Object.keys(LOCATION_RISK);
    const scores = locations.map((loc) => calculateBaseRisk(mockProperty({ location: loc }), mockCity()));
    const unique = new Set(scores);
    expect(unique.size).toBeGreaterThan(1);
  });
});

describe('getRiskLevel', () => {
  it('returns very_low for score 0-20', () => {
    expect(getRiskLevel(0).id).toBe('very_low');
    expect(getRiskLevel(20).id).toBe('very_low');
  });

  it('returns low for score 21-40', () => {
    expect(getRiskLevel(21).id).toBe('low');
    expect(getRiskLevel(40).id).toBe('low');
  });

  it('returns moderate for score 41-60', () => {
    expect(getRiskLevel(50).id).toBe('moderate');
  });

  it('returns high for score 61-80', () => {
    expect(getRiskLevel(70).id).toBe('high');
  });

  it('returns very_high for score 81-100', () => {
    expect(getRiskLevel(90).id).toBe('very_high');
    expect(getRiskLevel(100).id).toBe('very_high');
  });
});

describe('getGrowthMultiplier', () => {
  it('returns higher multiplier for higher risk', () => {
    const veryHigh = getGrowthMultiplier(90);
    const veryLow = getGrowthMultiplier(10);
    expect(veryHigh).toBeGreaterThan(veryLow);
  });

  it('returns 0.5 for very_low risk', () => {
    expect(getGrowthMultiplier(10)).toBeCloseTo(0.5, 1);
  });

  it('returns 2.5 for very_high risk', () => {
    expect(getGrowthMultiplier(90)).toBeCloseTo(2.5, 1);
  });
});

describe('getHazardProbability', () => {
  it('returns base rates for stable city', () => {
    const city = mockCity();
    expect(getHazardProbability('storm', city)).toBeCloseTo(0.05, 2);
    expect(getHazardProbability('earthquake', city)).toBeCloseTo(0.02, 2);
    expect(getHazardProbability('hurricane', city)).toBe(0.03);
  });

  it('increases in recession', () => {
    const city = mockCity({ economicCondition: 'recession' });
    expect(getHazardProbability('storm', city)).toBeCloseTo(0.075, 3);
  });

  it('increases with low demand', () => {
    const city = mockCity({ demandIndex: 0.4 });
    expect(getHazardProbability('storm', city)).toBeCloseTo(0.065, 3);
  });

  it('caps at 0.15', () => {
    const city = mockCity({ economicCondition: 'recession', demandIndex: 0.3 });
    expect(getHazardProbability('storm', city)).toBeLessThanOrEqual(0.15);
  });
});

describe('RISK_LEVELS coverage', () => {
  it('covers entire 0-100 range', () => {
    for (let score = 0; score <= 100; score += 5) {
      const level = getRiskLevel(score);
      expect(level).toBeDefined();
      expect(score).toBeGreaterThanOrEqual(level.minScore);
      expect(score).toBeLessThanOrEqual(level.maxScore);
    }
  });

  it('has unique colors for each level', () => {
    const colors = RISK_LEVELS.map((l) => l.color);
    expect(new Set(colors).size).toBe(RISK_LEVELS.length);
  });

  it('has ascending growth multipliers', () => {
    for (let i = 1; i < RISK_LEVELS.length; i++) {
      expect(RISK_LEVELS[i].growthMultiplier).toBeGreaterThan(RISK_LEVELS[i - 1].growthMultiplier);
    }
  });
});
