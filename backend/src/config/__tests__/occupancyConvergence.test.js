import { describe, it, expect } from 'vitest';
import { simulateOccupancy, OCCUPANCY_FACTORS, calculatePropertyRentIncome } from '../propertyManagement.js';

/**
 * Regression: occupancy convergence must reach the intended maximum.
 *
 * The old convergence (Math.round(current + (target - current) * 0.1)) has a
 * dead zone: any integer within 5 of the target rounds back to itself, so a
 * property climbing from below permanently stalled at target - 4. With the
 * configured maximum of 100, even a fully-desirable property could never
 * exceed 96% — observed in production as a hard 96% ceiling for every
 * non-house property (no 97/98/99 values existed at all).
 */
function runToStable(initial, property, cityDemand, citySupply, maxTicks = 60) {
  let occ = initial;
  const seen = new Set();
  for (let t = 0; t < maxTicks; t++) {
    const next = simulateOccupancy({ ...property, occupancy: occ }, cityDemand, citySupply);
    if (next === occ) return { stableAt: t, value: occ };
    if (seen.has(next) && seen.has(occ)) return { cycle: true, value: [occ, next] };
    seen.add(occ);
    occ = next;
  }
  return { didNotConverge: true, value: occ };
}

const extreme = {
  type: 'apartment',
  rent: 5000,
  rentPerUnit: 5000,
  qualityScore: 100,
  condition: 100,
  maintenanceLevel: 'premium',
  _investmentOccupancyBonus: 12,
  units: [{ rentPrice: 5000 }],
};

describe('simulateOccupancy — convergence to the intended maximum', () => {
  it('a fully-desirable property converges to the configured maximum of 100', () => {
    for (const start of [0, 50, 70, 92, 95]) {
      const res = runToStable(start, extreme, 3.0, 0.3);
      expect(res.value, `start=${start}`).toBe(100);
    }
  });

  it('occupancy never exceeds the configured maximum (100)', () => {
    expect(simulateOccupancy({ ...extreme, occupancy: 100 }, 3.0, 0.3)).toBe(100);
    expect(simulateOccupancy({ ...extreme, occupancy: 100 }, 0.3, 3.0)).toBeLessThanOrEqual(100);
  });

  it('never goes below the configured minimum (0)', () => {
    const result = simulateOccupancy({ ...extreme, occupancy: 1 }, 0.3, 3.0);
    expect(result).toBeGreaterThanOrEqual(0);
  });

  it('high-demand extreme property reaches 100 (was stuck at 96)', () => {
    const res = runToStable(50, extreme, 3.0, 0.3);
    expect(res.value).toBe(100);
  });

  it('low-rent / high-demand property still reaches the full maximum', () => {
    const cheap = { ...extreme, rent: 100, rentPerUnit: 100 };
    const res = runToStable(50, cheap, 3.0, 0.3);
    expect(res.value).toBe(100);
  });

  it('hotel (commercial + units) reaches 100 under the same conditions', () => {
    const hotel = { ...extreme, type: 'commercial', buildingType: 'hotel' };
    const res = runToStable(92, hotel, 3.0, 0.3);
    expect(res.value).toBe(100);
  });

  it('commercial property reaches 100 under the same conditions', () => {
    const commercial = { ...extreme, type: 'commercial' };
    const res = runToStable(92, commercial, 3.0, 0.3);
    expect(res.value).toBe(100);
  });

  it('residential apartment reaches 100 under the same conditions', () => {
    const res = runToStable(92, extreme, 3.0, 0.3);
    expect(res.value).toBe(100);
  });

  it('a lower-demand property converges to its own target, never above it', () => {
    // Typical property: quality 70, no maintenance, rent at market. Its target
    // is well below 100 — occupancy must converge to that target, not overshoot.
    const typical = {
      type: 'apartment',
      rent: 5000,
      rentPerUnit: 5000,
      qualityScore: 70,
      condition: 100,
      maintenanceLevel: 'none',
      _investmentOccupancyBonus: 0,
      units: [{ rentPrice: 5000 }],
    };
    const res = runToStable(0, typical, 1.8, 0.9);
    const target = simulateOccupancy({ ...typical, occupancy: res.value }, 1.8, 0.9);
    expect(target).toBe(res.value); // stable at the fixed point
    expect(res.value).toBeLessThanOrEqual(100);
    expect(res.value).toBeGreaterThanOrEqual(0);
  });

  it('houses always return exactly 100 regardless of inputs', () => {
    expect(simulateOccupancy({ type: 'house', occupancy: 0 }, 0.3, 3.0)).toBe(100);
    expect(simulateOccupancy({ type: 'house', occupancy: 50 }, 3.0, 0.3)).toBe(100);
  });

  it('NaN/Infinity inputs never produce NaN occupancy', () => {
    const nanProps = [
      { ...extreme, occupancy: NaN, qualityScore: NaN, rent: NaN, rentPerUnit: NaN },
      { ...extreme, occupancy: 'not-a-number', qualityScore: Infinity },
      { ...extreme, occupancy: undefined, qualityScore: -Infinity },
    ];
    for (const p of nanProps) {
      const res = simulateOccupancy(p, 1.8, 0.9);
      expect(Number.isNaN(res)).toBe(false);
      expect(res).toBeGreaterThanOrEqual(0);
      expect(res).toBeLessThanOrEqual(100);
    }
  });

  it('no values above 100 from any input combination', () => {
    for (const occupancy of [0, 50, 100]) {
      for (const demand of [0.3, 1.0, 3.0]) {
        for (const supply of [0.3, 1.0, 3.0]) {
          const res = simulateOccupancy({ ...extreme, occupancy }, demand, supply);
          expect(res).toBeLessThanOrEqual(100);
          expect(res).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });
});

describe('rent income at maximum occupancy', () => {
  it('100% occupancy produces the full gross rent', () => {
    const prop = { type: 'apartment', rent: 10000, occupancy: 100 };
    expect(calculatePropertyRentIncome(prop)).toBe(10000);
  });

  it('96% occupancy (the old dead-zone ceiling) produces less than 100%', () => {
    expect(calculatePropertyRentIncome({ type: 'apartment', rent: 10000, occupancy: 96 })).toBe(9600);
  });

  it('the occupancy-adjusted pool matches the displayed income at 100%', () => {
    const prop = { type: 'apartment', rent: 10000, occupancy: 100 };
    expect(calculatePropertyRentIncome(prop)).toBe(10000);
    expect(OCCUPANCY_FACTORS.maxOccupancy).toBe(100);
  });
});
