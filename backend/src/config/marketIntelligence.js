export const REPORT_TYPES = {
  price_forecast: {
    id: 'price_forecast',
    name: 'Price Forecast Report',
    description: 'Predicted price movements with best/worst case scenarios and economic probability breakdown',
    requiresCity: true,
    requiresDistrict: false,
    pricing: { basic: 8000, advanced: 40000, premium: 150000 },
    accuracy: { basic: 0.6, advanced: 0.75, premium: 0.9 },
    durationTicks: { basic: 4, advanced: 6, premium: 8 },
  },
  risk_assessment: {
    id: 'risk_assessment',
    name: 'Risk Assessment Report',
    description: 'City-level risk scoring with factor breakdown, hazard probabilities, and mitigation tips',
    requiresCity: true,
    requiresDistrict: false,
    pricing: { basic: 4000, advanced: 20000, premium: 80000 },
    accuracy: { basic: 0.6, advanced: 0.75, premium: 0.9 },
    durationTicks: { basic: 4, advanced: 6, premium: 8 },
  },
  growth_opportunities: {
    id: 'growth_opportunities',
    name: 'Growth Opportunities Report',
    description: 'Cross-market analysis with emerging cities, undervalued areas, and migration signals',
    requiresCity: false,
    requiresDistrict: false,
    pricing: { basic: 6000, advanced: 30000, premium: 120000 },
    accuracy: { basic: 0.6, advanced: 0.75, premium: 0.9 },
    durationTicks: { basic: 4, advanced: 6, premium: 8 },
    maxResults: { basic: 3, advanced: 5, premium: 8 },
  },
};

export const TIER_INFO = {
  basic: {
    id: 'basic',
    name: 'Basic',
    color: 'gray',
    description: 'Cheap, noisy, useful for a quick directional hint',
  },
  advanced: {
    id: 'advanced',
    name: 'Advanced',
    color: 'blue',
    description: 'More reliable, useful for real investment decisions',
  },
  premium: {
    id: 'premium',
    name: 'Premium',
    color: 'purple',
    description: 'Highest accuracy, longest validity, deepest analysis',
  },
};

export const ATTRACTIVENESS_LABELS = [
  { min: 80, label: 'Very High', color: 'green' },
  { min: 60, label: 'High', color: 'blue' },
  { min: 40, label: 'Moderate', color: 'yellow' },
  { min: 20, label: 'Low', color: 'orange' },
  { min: 0, label: 'Very Low', color: 'red' },
];

export const RISK_LEVEL_LABELS = {
  very_low: { label: 'Very Low', color: 'green' },
  low: { label: 'Low', color: 'blue' },
  moderate: { label: 'Moderate', color: 'yellow' },
  high: { label: 'High', color: 'orange' },
  very_high: { label: 'Very High', color: 'red' },
};

export const DEMAND_TREND_LABELS = {
  strong_up: { label: 'Strong Growth', color: 'green' },
  up: { label: 'Moderate Growth', color: 'green' },
  stable: { label: 'Stable', color: 'yellow' },
  down: { label: 'Moderate Decline', color: 'orange' },
  strong_down: { label: 'Strong Decline', color: 'red' },
};

export const ECONOMIC_PROBABILITY_LABELS = {
  boom: { color: 'green' },
  growth: { color: 'blue' },
  stable: { color: 'gray' },
  slowdown: { color: 'yellow' },
  recession: { color: 'red' },
};
