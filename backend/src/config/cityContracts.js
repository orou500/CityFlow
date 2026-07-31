import { calculateXPReward } from './companyProgression.js';

export const CONTRACT_TIERS = [
  {
    tier: 1,
    minLevel: 1,
    maxLevel: 5,
    types: [
      {
        type: 'renovation',
        name: 'Urban Renovation Project',
        description: 'Renovate aging buildings in a residential district.',
        baseCost: 1_000_000,
        baseReward: 1_400_000,
        baseDuration: 6,
        baseXp: 300,
        baseReputation: 25,
        category: 'renovation',
      },
      {
        type: 'small_housing',
        name: 'Small Housing Development',
        description: 'Build a small affordable housing block for local residents.',
        baseCost: 3_000_000,
        baseReward: 4_200_000,
        baseDuration: 8,
        baseXp: 600,
        baseReputation: 40,
        category: 'housing',
      },
      {
        type: 'small_office',
        name: 'Local Office Building',
        description: 'Construct a small office building for local businesses.',
        baseCost: 5_000_000,
        baseReward: 6_800_000,
        baseDuration: 10,
        baseXp: 800,
        baseReputation: 50,
        category: 'commercial',
      },
      {
        type: 'affordable_housing',
        name: 'Affordable Housing Project',
        description: 'Build affordable housing for city residents.',
        baseCost: 2_000_000,
        baseReward: 3_000_000,
        baseDuration: 8,
        baseXp: 500,
        baseReputation: 35,
        category: 'housing',
      },
    ],
  },
  {
    tier: 2,
    minLevel: 6,
    maxLevel: 15,
    types: [
      {
        type: 'apartment_complex',
        name: 'Apartment Complex',
        description: 'Develop a modern apartment complex for city residents.',
        baseCost: 12_000_000,
        baseReward: 17_000_000,
        baseDuration: 12,
        baseXp: 1500,
        baseReputation: 100,
        category: 'housing',
      },
      {
        type: 'shopping_center',
        name: 'Shopping Center',
        description: 'Build a community shopping center.',
        baseCost: 15_000_000,
        baseReward: 21_000_000,
        baseDuration: 14,
        baseXp: 1800,
        baseReputation: 120,
        category: 'commercial',
      },
      {
        type: 'hotel',
        name: 'Boutique Hotel',
        description: 'Construct a boutique hotel to attract visitors.',
        baseCost: 18_000_000,
        baseReward: 25_000_000,
        baseDuration: 16,
        baseXp: 2000,
        baseReputation: 140,
        category: 'hospitality',
      },
      {
        type: 'office_district',
        name: 'Office District',
        description: 'Create a commercial office district.',
        baseCost: 20_000_000,
        baseReward: 28_000_000,
        baseDuration: 16,
        baseXp: 2200,
        baseReputation: 150,
        category: 'commercial',
      },
    ],
  },
  {
    tier: 3,
    minLevel: 16,
    maxLevel: 30,
    types: [
      {
        type: 'office_tower',
        name: 'Office Tower Redevelopment',
        description: 'Redevelop a central office tower into premium space.',
        baseCost: 60_000_000,
        baseReward: 85_000_000,
        baseDuration: 18,
        baseXp: 4000,
        baseReputation: 250,
        category: 'commercial',
      },
      {
        type: 'mixed_use',
        name: 'Mixed-Use Development',
        description: 'Develop a large mixed-use residential and commercial zone.',
        baseCost: 80_000_000,
        baseReward: 115_000_000,
        baseDuration: 20,
        baseXp: 5000,
        baseReputation: 300,
        category: 'mixed',
      },
      {
        type: 'district',
        name: 'Urban Redevelopment District',
        description: 'Renovate an entire urban district.',
        baseCost: 100_000_000,
        baseReward: 140_000_000,
        baseDuration: 24,
        baseXp: 6000,
        baseReputation: 350,
        category: 'mixed',
      },
      {
        type: 'urban_redevelopment',
        name: 'Urban Redevelopment',
        description: 'Renovate an urban district.',
        baseCost: 50_000_000,
        baseReward: 75_000_000,
        baseDuration: 20,
        baseXp: 3500,
        baseReputation: 220,
        category: 'mixed',
      },
    ],
  },
  {
    tier: 4,
    minLevel: 31,
    maxLevel: 50,
    types: [
      {
        type: 'airport',
        name: 'Regional Airport Expansion',
        description: 'Expand a regional airport to handle more traffic.',
        baseCost: 400_000_000,
        baseReward: 600_000_000,
        baseDuration: 30,
        baseXp: 15000,
        baseReputation: 800,
        category: 'infrastructure',
      },
      {
        type: 'stadium',
        name: 'Sports Stadium',
        description: 'Build a modern sports stadium for the city.',
        baseCost: 500_000_000,
        baseReward: 750_000_000,
        baseDuration: 32,
        baseXp: 18000,
        baseReputation: 900,
        category: 'infrastructure',
      },
      {
        type: 'technology_park',
        name: 'Technology Park',
        description: 'Develop a technology park to attract global companies.',
        baseCost: 600_000_000,
        baseReward: 900_000_000,
        baseDuration: 36,
        baseXp: 22000,
        baseReputation: 1000,
        category: 'infrastructure',
      },
      {
        type: 'mega_residential',
        name: 'Mega Residential Project',
        description: 'Construct a massive residential development.',
        baseCost: 700_000_000,
        baseReward: 1_000_000_000,
        baseDuration: 40,
        baseXp: 25000,
        baseReputation: 1100,
        category: 'housing',
      },
      {
        type: 'infrastructure',
        name: 'Infrastructure Project',
        description: 'Improve city infrastructure.',
        baseCost: 300_000_000,
        baseReward: 450_000_000,
        baseDuration: 28,
        baseXp: 12000,
        baseReputation: 700,
        category: 'infrastructure',
      },
    ],
  },
];

export function getContractTierForLevel(level) {
  for (const tier of CONTRACT_TIERS) {
    if (level >= tier.minLevel && level <= tier.maxLevel) return tier;
  }
  return CONTRACT_TIERS[CONTRACT_TIERS.length - 1];
}

export function getContractTypesForLevel(level) {
  const tiers = CONTRACT_TIERS.filter((t) => t.minLevel <= level);
  return tiers.flatMap((t) => t.types.map((type) => ({ ...type, tier: t.tier })));
}

export function getCityScale(city) {
  const population = city.population || 1_000_000;
  const base = 1_000_000;
  return Math.max(0.5, Math.min(5.0, Math.sqrt(population / base)));
}

export function getEconomicMultiplier(condition) {
  const multipliers = {
    boom: 1.25,
    growth: 1.1,
    stable: 1.0,
    slowdown: 0.85,
    recession: 0.7,
  };
  return multipliers[condition] || 1.0;
}

export function getDemandMultiplier(city) {
  const demand = city.demandIndex || 1.0;
  const supply = city.supplyIndex || 1.0;
  const ratio = demand / Math.max(0.1, supply);
  return Math.max(0.7, Math.min(1.5, ratio));
}

export function getGrowthMultiplier(city) {
  const growth = city.growthRate || 0.01;
  return Math.max(0.8, Math.min(1.3, 1 + growth * 10));
}

export function generateContractForCity(company, city, tickNumber, options = {}) {
  const level = company.level || 1;
  const availableTypes = getContractTypesForLevel(level);
  if (availableTypes.length === 0) return null;

  const template = availableTypes[Math.floor(Math.random() * availableTypes.length)];
  const cityScale = getCityScale(city);
  const economicMultiplier = getEconomicMultiplier(city.economicCondition);
  const demandMultiplier = getDemandMultiplier(city);
  const growthMultiplier = getGrowthMultiplier(city);
  const levelMultiplier = 1 + (level - 1) * 0.03;

  const baseCost = template.baseCost * levelMultiplier * cityScale * demandMultiplier;
  const cost = Math.round(baseCost / economicMultiplier);
  const reward = Math.round(baseCost * 1.35 * economicMultiplier * growthMultiplier);
  const expectedProfit = reward - cost;
  const minConstructionTicks = (CONTRACT_BUILDING_CONSTRUCTION[template.type] || 0) + CONSTRUCTION_BUFFER_TICKS + DEV_REQUEST_VOTE_OVERHEAD;
  const durationTicks = Math.max(4, minConstructionTicks, Math.round(template.baseDuration * (1 + (level - 1) * 0.02)));
  const xpReward = Math.round(template.baseXp * levelMultiplier * cityScale * economicMultiplier);
  const reputationReward = Math.round(template.baseReputation * levelMultiplier * economicMultiplier);

  const name = `${city.name} ${template.name}`;
  const description = `${template.description} ${city.name} is currently experiencing ${city.economicCondition} economic conditions.`;

  return {
    companyId: company._id,
    cityId: city._id,
    contractType: template.type,
    contractTier: template.tier,
    name,
    description,
    requiredLevel: template.tier > 1 ? CONTRACT_TIERS.find((t) => t.tier === template.tier).minLevel : 1,
    requiredTreasury: cost,
    cost,
    reward,
    reputationReward,
    xpReward,
    durationTicks,
    totalBudget: cost,
    expectedProfit,
    status: 'available',
    generatedTick: tickNumber,
    expiresAtTick: tickNumber + 48,
  };
}

export function generateContractTypeFromDemand(city, companyLevel) {
  const level = companyLevel || 1;
  const types = getContractTypesForLevel(level);
  const demand = city.demandIndex || 1;
  const supply = city.supplyIndex || 1;
  const ratio = demand / supply;

  if (ratio > 1.2) {
    const housing = types.filter((t) => t.category === 'housing');
    if (housing.length > 0) return housing[Math.floor(Math.random() * housing.length)];
  }
  if (city.economicCondition === 'boom') {
    const commercial = types.filter((t) => t.category === 'commercial' || t.category === 'mixed');
    if (commercial.length > 0) return commercial[Math.floor(Math.random() * commercial.length)];
  }
  if (city.economicCondition === 'recession') {
    const infra = types.filter((t) => t.category === 'infrastructure' || t.category === 'renovation');
    if (infra.length > 0) return infra[Math.floor(Math.random() * infra.length)];
  }

  return types[Math.floor(Math.random() * types.length)];
}

export function calculateContractXPReward(cost, xpReward) {
  return Math.round(xpReward + calculateXPReward('contract_completed', cost));
}

// Map contract types to the construction period (ticks) of the most relevant building type.
// Used to ensure contract deadlines are always achievable.
const CONTRACT_BUILDING_CONSTRUCTION = {
  small_housing: 20,       // apartment_building
  affordable_housing: 25,  // housing_complex
  small_office: 18,        // retail_complex
  apartment_complex: 30,   // luxury_apartments
  shopping_center: 35,     // shopping_center
  hotel: 30,               // hotel
  office_district: 25,     // office_building
  office_tower: 25,        // office_building
  mixed_use: 35,           // max(residential_max=30, commercial_max=35)
  district: 40,            // max(all)
};

const CONSTRUCTION_BUFFER_TICKS = 4;      // flexibility after construction completes
const DEV_REQUEST_VOTE_OVERHEAD = 8;       // company must vote on the development request (construction) after contract starts

export const VOTE_THRESHOLD = 0.5;
export const CONTRACT_PROPOSAL_EXPIRE_TICKS = 8;
export const CONTRACT_AVAILABLE_EXPIRE_TICKS = 48;
