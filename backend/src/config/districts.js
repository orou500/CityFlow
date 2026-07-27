export const DISTRICT_CONFIG = {
  maxDistrictsPerCity: 5,
  minDistrictsPerCity: 3,

  influence: {
    ownershipWeight: 0.4,
    investmentWeight: 0.3,
    occupancyWeight: 0.15,
    tenureWeight: 0.15,
    tickDecayRate: 0.005,
    minInfluenceToTrack: 0.01,
  },

  tiers: {
    observer: { min: 0, max: 0.05 },
    minor_investor: { min: 0.05, max: 0.2 },
    significant_investor: { min: 0.2, max: 0.4 },
    market_leader: { min: 0.4, max: 1.0 },
  },

  antiMonopoly: {
    diminishingReturnsThreshold: 0.35,
    diminishingReturnsFactor: 0.5,
    maxInfluenceCap: 0.55,
    competitionBonusThreshold: 0.1,
    competitionBonusFactor: 1.15,
  },

  market: {
    demandVolatility: 0.08,
    supplyVolatility: 0.05,
    priceAdoptionRate: 0.1,
    growthMeanReversion: 0.02,
    minDemand: 0.2,
    maxDemand: 3.0,
    minSupply: 0.2,
    maxSupply: 3.0,
  },

  events: {
    chancePerTick: 0.15,
    maxActiveEvents: 3,
    cooldownTicks: 6,
  },

  history: {
    maxEntries: 200,
  },
};

export const DISTRICT_NAMES = {
  'New York': [
    { name: 'Manhattan', tier: 'premium', baseDemand: 2.0, basePrice: 1200000, growthRate: 0.006 },
    { name: 'Brooklyn', tier: 'growing', baseDemand: 1.6, basePrice: 650000, growthRate: 0.012 },
    { name: 'Queens', tier: 'moderate', baseDemand: 1.3, basePrice: 420000, growthRate: 0.015 },
    { name: 'Bronx', tier: 'affordable', baseDemand: 1.1, basePrice: 280000, growthRate: 0.018 },
    { name: 'Staten Island', tier: 'suburban', baseDemand: 0.9, basePrice: 350000, growthRate: 0.01 },
  ],
  London: [
    { name: 'Westminster', tier: 'premium', baseDemand: 1.9, basePrice: 950000, growthRate: 0.005 },
    { name: 'Camden', tier: 'growing', baseDemand: 1.5, basePrice: 620000, growthRate: 0.01 },
    { name: 'Chelsea', tier: 'premium', baseDemand: 1.8, basePrice: 880000, growthRate: 0.004 },
    { name: 'Canary Wharf', tier: 'commercial', baseDemand: 1.4, basePrice: 550000, growthRate: 0.012 },
    { name: 'Greenwich', tier: 'growing', baseDemand: 1.2, basePrice: 380000, growthRate: 0.014 },
  ],
  Tokyo: [
    { name: 'Shinjuku', tier: 'premium', baseDemand: 1.7, basePrice: 620000, growthRate: 0.004 },
    { name: 'Shibuya', tier: 'premium', baseDemand: 1.8, basePrice: 680000, growthRate: 0.005 },
    { name: 'Ginza', tier: 'commercial', baseDemand: 1.5, basePrice: 720000, growthRate: 0.003 },
    { name: 'Akihabara', tier: 'growing', baseDemand: 1.3, basePrice: 380000, growthRate: 0.012 },
    { name: 'Roppongi', tier: 'premium', baseDemand: 1.6, basePrice: 550000, growthRate: 0.006 },
  ],
  'Tel Aviv': [
    { name: 'Rothschild', tier: 'premium', baseDemand: 2.0, basePrice: 850000, growthRate: 0.008 },
    { name: 'Florentin', tier: 'growing', baseDemand: 1.7, basePrice: 480000, growthRate: 0.018 },
    { name: 'Neve Tzedek', tier: 'premium', baseDemand: 1.8, basePrice: 720000, growthRate: 0.006 },
    { name: 'Jaffa', tier: 'growing', baseDemand: 1.4, basePrice: 420000, growthRate: 0.015 },
  ],
  Dubai: [
    { name: 'Downtown Dubai', tier: 'premium', baseDemand: 1.8, basePrice: 550000, growthRate: 0.01 },
    { name: 'Dubai Marina', tier: 'premium', baseDemand: 1.6, basePrice: 480000, growthRate: 0.012 },
    { name: 'Business Bay', tier: 'commercial', baseDemand: 1.5, basePrice: 420000, growthRate: 0.015 },
    { name: 'JVC', tier: 'growing', baseDemand: 1.3, basePrice: 220000, growthRate: 0.025 },
  ],
  Paris: [
    { name: 'Le Marais', tier: 'premium', baseDemand: 1.9, basePrice: 900000, growthRate: 0.004 },
    { name: 'Montmartre', tier: 'growing', baseDemand: 1.5, basePrice: 550000, growthRate: 0.008 },
    { name: 'La Defense', tier: 'commercial', baseDemand: 1.4, basePrice: 480000, growthRate: 0.01 },
    { name: 'Belleville', tier: 'affordable', baseDemand: 1.2, basePrice: 350000, growthRate: 0.015 },
    { name: 'Bastille', tier: 'growing', baseDemand: 1.6, basePrice: 520000, growthRate: 0.009 },
  ],
};

export const DISTRICT_EVENTS = [
  {
    type: 'positive',
    name: 'Metro Expansion',
    description: 'New metro station announced for the district',
    effects: { demandDelta: 0.15, priceDelta: 0.08, growthDelta: 0.005 },
    durationTicks: 12,
  },
  {
    type: 'positive',
    name: 'Corporate HQ Move',
    description: 'Major corporation relocating headquarters to the district',
    effects: { demandDelta: 0.2, priceDelta: 0.1, growthDelta: 0.008 },
    durationTicks: 18,
  },
  {
    type: 'positive',
    name: 'Tourism Boom',
    description: 'Surge in tourism driving up rental demand',
    effects: { demandDelta: 0.12, priceDelta: 0.05, growthDelta: 0.003 },
    durationTicks: 8,
  },
  {
    type: 'positive',
    name: 'Infrastructure Upgrade',
    description: 'Major infrastructure improvements in the district',
    effects: { demandDelta: 0.08, priceDelta: 0.04, growthDelta: 0.004, supplyDelta: 0.05 },
    durationTicks: 15,
  },
  {
    type: 'positive',
    name: 'Tech Hub Development',
    description: 'New technology innovation center opening',
    effects: { demandDelta: 0.18, priceDelta: 0.07, growthDelta: 0.006 },
    durationTicks: 20,
  },
  {
    type: 'negative',
    name: 'Crime Increase',
    description: 'Rising crime rates affecting district desirability',
    effects: { demandDelta: -0.15, priceDelta: -0.08, growthDelta: -0.005 },
    durationTicks: 10,
  },
  {
    type: 'negative',
    name: 'Employer Closure',
    description: 'Major local employer shutting down operations',
    effects: { demandDelta: -0.2, priceDelta: -0.1, growthDelta: -0.008 },
    durationTicks: 16,
  },
  {
    type: 'negative',
    name: 'Population Decline',
    description: 'Residents leaving the district for other areas',
    effects: { demandDelta: -0.1, priceDelta: -0.05, growthDelta: -0.004 },
    durationTicks: 12,
  },
  {
    type: 'negative',
    name: 'Environmental Issues',
    description: 'Environmental concerns impacting property values',
    effects: { demandDelta: -0.12, priceDelta: -0.06, growthDelta: -0.003 },
    durationTicks: 14,
  },
  {
    type: 'negative',
    name: 'Infrastructure Decay',
    description: 'Aging infrastructure reducing district appeal',
    effects: { demandDelta: -0.08, priceDelta: -0.04, growthDelta: -0.002, supplyDelta: -0.03 },
    durationTicks: 10,
  },
];

export const DISTRICT_TIERS = {
  premium: { color: 'purple', label: 'Premium' },
  growing: { color: 'green', label: 'Growing' },
  commercial: { color: 'blue', label: 'Commercial' },
  affordable: { color: 'amber', label: 'Affordable' },
  suburban: { color: 'gray', label: 'Suburban' },
};
