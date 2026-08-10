import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import en from '../en.json';
import he from '../he.json';

const here = dirname(fileURLToPath(import.meta.url));
const developmentPageSource = readFileSync(join(here, '../../pages/DevelopmentPage.jsx'), 'utf8');

describe('Upgrade effect strings stay backend-driven (no hardcoded copies)', () => {
  it.each([
    ['en', en],
    ['he', he],
  ])('%s development section has no hardcoded `*Desc` effect strings', (_lang, dict) => {
    const descKeys = Object.keys(dict.development).filter((k) => k.endsWith('Desc'));
    expect(descKeys).toEqual([]);
  });

  it('DevelopmentPage upgrade modal does not render static `*Desc` translations', () => {
    expect(developmentPageSource).not.toMatch(/type\}Desc|u\.type\}Desc/);
  });

  it('DevelopmentPage upgrade modal still renders API-driven effect badges', () => {
    expect(developmentPageSource).toContain('u.valueBoost * 100');
    expect(developmentPageSource).toContain('u.rentBoost * 100');
    expect(developmentPageSource).toContain('u.conditionBoost');
    expect(developmentPageSource).toContain('u.unitBoost * 100');
  });
});
