import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import en from '../en.json';
import he from '../he.json';

const here = dirname(fileURLToPath(import.meta.url));
const dashboardSource = readFileSync(join(here, '../../pages/PlayerDashboard.jsx'), 'utf8');

const TRANSACTION_TYPES = [
  'buy',
  'sell',
  'rent',
  'loan',
  'loan_payment',
  'loan_repay',
  'penalty',
  'repossess',
  'construction',
  'upgrade',
  'grade_upgrade',
  'improvement',
  'development',
  'period_bonus',
  'login',
];

describe('Transaction type translations', () => {
  it.each([
    ['en', en],
    ['he', he],
  ])('%s defines a label for every official transaction type', (_lang, dict) => {
    const keys = Object.keys(dict.transaction.type);
    for (const type of TRANSACTION_TYPES) {
      expect(keys, `missing transaction.type.${type} in ${_lang}`).toContain(type);
    }
  });

  it.each([
    ['en', en],
    ['he', he],
  ])('%s has no duplicate transaction type keys', (_lang, dict) => {
    const keys = Object.keys(dict.transaction.type);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('PlayerDashboard renders transaction types with a fallback for unknown types', () => {
    expect(dashboardSource).toContain('defaultValue');
    expect(dashboardSource).toMatch(/transaction\.type\.\$\{tx\.type\}/);
  });
});
