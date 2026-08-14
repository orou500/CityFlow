import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const here = dirname(fileURLToPath(import.meta.url));
const tickSource = readFileSync(join(here, '../tick.js'), 'utf8');

describe('tick.js phase ordering (rent-growth correctness)', () => {
  it('runs processPropertyManagement BEFORE processRentGrowth', () => {
    // Rent growth must use the CURRENT quality/occupancy state. If management
    // runs after growth, a freshly upgraded property gets one tick of stale
    // (decayed) quality, which can drive its rent baseline down and push a
    // legally-set player rent above the 2x market cap (Heritage-Building bug).
    const managementIdx = tickSource.indexOf('processPropertyManagement(tickNumber)');
    const growthIdx = tickSource.indexOf('processRentGrowth(tickNumber)');
    expect(managementIdx).toBeGreaterThan(-1);
    expect(growthIdx).toBeGreaterThan(-1);
    expect(managementIdx).toBeLessThan(growthIdx);
  });

  it('keeps rent growth before rent accrual (collected pool uses the grown rent)', () => {
    const growthIdx = tickSource.indexOf('processRentGrowth(tickNumber)');
    const accrualIdx = tickSource.indexOf('processRent()');
    expect(growthIdx).toBeGreaterThan(-1);
    expect(accrualIdx).toBeGreaterThan(-1);
    expect(growthIdx).toBeLessThan(accrualIdx);
  });
});
