import InvestmentOpportunity from '../models/InvestmentOpportunity.js';
import City from '../models/City.js';

export const INVESTMENT_TYPES = [
  {
    type: 'government_bond',
    name: 'Government Bonds',
    description: 'Ultra-safe government-backed bonds with modest, reliable returns.',
    baseReturn: 0.03,
    risk: 'very_low',
    minDuration: 24,
    maxDuration: 48,
    minInvestment: 1_000_000,
    maxInvestment: 100_000_000,
    availableCapital: Infinity,
    economySensitivity: -0.3,
  },
  {
    type: 'corporate_bond',
    name: 'Corporate Bonds',
    description: 'Investment-grade corporate debt offering moderate returns.',
    baseReturn: 0.045,
    risk: 'low',
    minDuration: 18,
    maxDuration: 36,
    minInvestment: 2_000_000,
    maxInvestment: 200_000_000,
    availableCapital: 500_000_000,
    economySensitivity: -0.1,
  },
  {
    type: 'fixed_term',
    name: 'Fixed-Term Deposits',
    description: 'Bank deposits with fixed returns and low volatility.',
    baseReturn: 0.035,
    risk: 'low',
    minDuration: 12,
    maxDuration: 24,
    minInvestment: 5_000_000,
    maxInvestment: 300_000_000,
    availableCapital: 1_000_000_000,
    economySensitivity: -0.2,
  },
  {
    type: 'infrastructure_fund',
    name: 'Infrastructure Fund',
    description: 'Long-term investment in public and private infrastructure projects.',
    baseReturn: 0.07,
    risk: 'medium',
    minDuration: 36,
    maxDuration: 72,
    minInvestment: 10_000_000,
    maxInvestment: 500_000_000,
    availableCapital: 800_000_000,
    economySensitivity: 0.2,
  },
  {
    type: 'reit_fund',
    name: 'REIT Fund',
    description: 'Real estate investment trust exposed to property market cycles.',
    baseReturn: 0.085,
    risk: 'medium',
    minDuration: 30,
    maxDuration: 60,
    minInvestment: 5_000_000,
    maxInvestment: 400_000_000,
    availableCapital: 600_000_000,
    economySensitivity: 0.6,
  },
  {
    type: 'commercial_property_fund',
    name: 'Commercial Property Fund',
    description: 'Direct exposure to commercial real estate developments.',
    baseReturn: 0.095,
    risk: 'high',
    minDuration: 36,
    maxDuration: 72,
    minInvestment: 20_000_000,
    maxInvestment: 600_000_000,
    availableCapital: 400_000_000,
    economySensitivity: 0.7,
  },
  {
    type: 'emerging_market_fund',
    name: 'Emerging Market Fund',
    description: 'High-growth emerging market investments with significant volatility.',
    baseReturn: 0.12,
    risk: 'very_high',
    minDuration: 48,
    maxDuration: 96,
    minInvestment: 25_000_000,
    maxInvestment: 500_000_000,
    availableCapital: 300_000_000,
    economySensitivity: 0.9,
  },
];

const ECONOMY_INDEX = {
  boom: 1.5,
  growth: 1.2,
  stable: 1.0,
  slowdown: 0.75,
  recession: 0.5,
};

export async function getGlobalEconomicState() {
  const cities = await City.find({});
  if (cities.length === 0) return { condition: 'stable', index: 1 };

  const conditionCounts = {};
  let totalIndex = 0;

  for (const city of cities) {
    const condition = city.economicCondition || 'stable';
    conditionCounts[condition] = (conditionCounts[condition] || 0) + 1;
    totalIndex += ECONOMY_INDEX[condition] || 1;
  }

  const dominantCondition = Object.entries(conditionCounts).sort((a, b) => b[1] - a[1])[0][0];
  const avgIndex = totalIndex / cities.length;

  return { condition: dominantCondition, index: avgIndex };
}

export function calculateCurrentReturn(baseReturn, risk, economyIndex, economySensitivity) {
  const riskMultipliers = {
    very_low: 0.9,
    low: 0.95,
    medium: 1.0,
    high: 1.1,
    very_high: 1.2,
  };

  const economyEffect = (economyIndex - 1) * economySensitivity;
  const riskEffect = (riskMultipliers[risk] || 1) - 1;
  const noise = (Math.random() - 0.5) * 0.02;

  return Math.max(0.005, baseReturn * (1 + economyEffect + riskEffect) + noise);
}

export function getDurationForType(type) {
  return Math.floor(type.minDuration + Math.random() * (type.maxDuration - type.minDuration));
}

export function getMaxInvestmentForLevel(level, baseMax) {
  return Math.round(baseMax * (1 + (level - 1) * 0.05));
}

export async function generateInvestmentOpportunities(tickNumber) {
  const existingActive = await InvestmentOpportunity.countDocuments({ active: true });
  if (existingActive >= 6) return 0;

  const { condition, index } = await getGlobalEconomicState();

  let typesToGenerate = INVESTMENT_TYPES;

  if (condition === 'boom' || condition === 'growth') {
    typesToGenerate = INVESTMENT_TYPES.filter((t) => t.economySensitivity >= 0 || t.type === 'corporate_bond');
  } else if (condition === 'recession' || condition === 'slowdown') {
    typesToGenerate = INVESTMENT_TYPES.filter((t) => t.economySensitivity <= 0 || t.type === 'reit_fund');
  }

  const targetCount = 6;
  const toGenerate = targetCount - existingActive;
  let generated = 0;

  for (let i = 0; i < toGenerate; i++) {
    const baseType = typesToGenerate[Math.floor(Math.random() * typesToGenerate.length)];
    const durationTicks = getDurationForType(baseType);
    const currentReturn = calculateCurrentReturn(
      baseType.baseReturn,
      baseType.risk,
      index,
      baseType.economySensitivity,
    );

    await InvestmentOpportunity.create({
      type: baseType.type,
      name: generateOpportunityName(baseType, condition),
      description: baseType.description,
      baseAnnualReturnRate: baseType.baseReturn,
      currentAnnualReturnRate: currentReturn,
      durationTicks,
      risk: baseType.risk,
      minInvestment: baseType.minInvestment,
      maxInvestment: baseType.maxInvestment,
      availableCapital: baseType.availableCapital,
      economyState: condition,
      globalEconomicIndex: index,
      active: true,
      createdTick: tickNumber,
      expiresAtTick: tickNumber + 24,
    });

    generated++;
  }

  return generated;
}

function generateOpportunityName(baseType, condition) {
  const prefixes = {
    boom: ['High-Yield', 'Growth', 'Premium'],
    growth: ['Strong', 'Expanding', 'Growth'],
    stable: ['Reliable', 'Steady', 'Core'],
    slowdown: ['Defensive', 'Cautious', 'Conservative'],
    recession: ['Safe-Haven', 'Protected', 'Crisis-Resistant'],
  };

  const prefixList = prefixes[condition] || prefixes.stable;
  const prefix = prefixList[Math.floor(Math.random() * prefixList.length)];
  return `${prefix} ${baseType.name}`;
}

export async function expireInvestmentOpportunities(tickNumber) {
  const result = await InvestmentOpportunity.updateMany(
    { active: true, expiresAtTick: { $lte: tickNumber } },
    { active: false },
  );

  return result.modifiedCount;
}

export function getInvestmentTypeConfig(type) {
  return INVESTMENT_TYPES.find((t) => t.type === type);
}

export const VOTE_THRESHOLD = 0.5;
export const INVESTMENT_PROPOSAL_EXPIRE_TICKS = 8;
export const LARGE_INVESTMENT_THRESHOLD = 10_000_000;
export const LARGE_INVESTMENT_TREASURY_PCT = 0.25;
