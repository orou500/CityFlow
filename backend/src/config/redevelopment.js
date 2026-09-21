import { getLocationMultiplier } from './developmentProjects.js';

/**
 * Property Demolition & Redevelopment economics.
 *
 * All costs and the resulting cleared-land value are derived HERE on the
 * server — the client only ever displays server-computed numbers and never
 * sends a price.
 *
 * Economy model:
 * - Demolition CHARGES the owner (clearance fees) and REFUNDS a fraction of
 *   the building value as salvage. The building itself is destroyed, so the
 *   owner only ever recovers part of its value — demolition is a real,
 *   deliberate economic choice, not a free trick.
 * - The cleared land's value comes from the LOCATION (same logic as
 *   naturally-generated land), but is capped so that
 *   `land value + salvage <= building value`. This guarantees demolition can
 *   NEVER increase a player's net worth — there is no way to farm value by
 *   buying cheap and demolishing.
 * - Redevelopment charges the full construction cost of the chosen
 *   DEVELOPMENT_PROJECTS entry and takes its constructionPeriods (in ticks),
 *   so politics/timing is identical to greenfield construction.
 */

export const REDEVELOPMENT_CONFIG = {
  // Flat clearance base charged for demolishing any building.
  demolitionCostBase: 500000,
  // Plus this fraction of the building's current value.
  demolitionCostPercentOfValue: 0.02,
  // Hard min/max on the combined demolition charge.
  demolitionCostMin: 500000,
  demolitionCostMax: 5000000,
  // Fraction of the building's current value refunded to the owner as salvage.
  demolitionSalvagePercent: 0.4,
};

/**
 * Server-authoritative demolition charge for a building.
 * cost = base + percentOfValue, clamped to [min, max].
 */
export function calculateDemolitionCost(buildingCurrentPrice) {
  const value = Math.max(0, Number(buildingCurrentPrice) || 0);
  const cfg = REDEVELOPMENT_CONFIG;
  const raw = cfg.demolitionCostBase + value * cfg.demolitionCostPercentOfValue;
  return Math.round(Math.min(cfg.demolitionCostMax, Math.max(cfg.demolitionCostMin, raw)));
}

/**
 * Server-authoritative salvage refund for a demolished building.
 */
export function calculateDemolitionSalvage(buildingCurrentPrice) {
  const value = Math.max(0, Number(buildingCurrentPrice) || 0);
  return Math.round(value * REDEVELOPMENT_CONFIG.demolitionSalvagePercent);
}

/**
 * Value of the cleared plot after demolition.
 *
 * Raw location land value mirrors property generation:
 *   city.avgPrice x location cost multiplier x demand modifier
 * capped at `building value x (1 - salvagePercent)` so that
 * `land + salvage <= building` — demolition can never inflate net worth.
 */
export function calculateClearedLandValue(city, location, buildingCurrentPrice) {
  const value = Math.max(0, Number(buildingCurrentPrice) || 0);

  const locationMultiplier = getLocationMultiplier(location || null).costMultiplier;

  let rawLandValue = 1;
  if (city?.avgPrice) {
    const demandPriceMod = 0.85 + ((Number(city.demandIndex) || 1.0) / 3.0) * 0.3;
    rawLandValue = city.avgPrice * locationMultiplier * demandPriceMod;
  }

  const maxLandValue = Math.max(0, Math.floor(value * (1 - REDEVELOPMENT_CONFIG.demolitionSalvagePercent)));
  return Math.round(Math.min(rawLandValue, maxLandValue));
}
