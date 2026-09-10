// Capital-Markets React error #310 regression E2E.
//
// Runs against the REAL production bundle served by `vite preview` (dist/):
//   BASE_URL=http://localhost:4173 npx playwright test --config playwright.config.js capital-market.spec.js
//
// It mocks the API at the network level (no backend needed) and drives
// /stocks -> /company/:id through the loading -> loaded transition that
// previously crashed the page with React error #310
// ("Rendered fewer hooks than expected").
//
// Test FAILS if any console message matches the production React crash
// signatures: "Minified React error #310", "Rendered fewer hooks than
// expected", or "changed in the order of Hooks".

import { test, expect } from 'playwright/test';

const COMPANY = {
  _id: 'c1',
  name: 'Vertex Financials',
  ticker: 'VTX',
  industry: 'finance',
  size: 'medium',
  isIPO: false,
  sharePrice: 24.5,
  dayChange: 0.75,
  dayChangePercent: 3.16,
  marketCap: 245000000,
  employees: 3200,
  revenue: 12500000,
  cash: 4000000,
  profit: 1500000,
  debt: 800000,
  totalReturn: 18.3,
  dividendYield: 2.4,
  dividendPerShare: 0.6,
  lastDividendTick: 512,
  high52Week: 30.1,
  low52Week: 12.4,
  ipoPrice: 10,
  hqCityId: { name: 'Tel Aviv' },
  offices: [
    { type: 'headquarters', cityId: 'c-a', employees: 1200 },
    { type: 'branch', cityId: 'c-b', employees: 2000 },
  ],
  performance: [
    { tick: 100, employees: 1000, revenue: 4000000 },
    { tick: 512, employees: 3200, revenue: 12500000 },
  ],
};

const HISTORY = [];
for (let i = 490; i <= 512; i += 1) {
  HISTORY.push({
    tick: i,
    price: 20 + (i - 490) * 0.35,
    employees: 1500 + (i - 490) * 70,
    revenue: 5000000 + (i - 490) * 300000,
    marketCap: 200000000 + (i - 490) * 2000000,
  });
}

const STATS = {
  revenue: 12500000,
  profit: 1500000,
  cash: 4000000,
  debt: 800000,
  marketCap: 245000000,
  sharePrice: 24.5,
  ipoPrice: 10,
  sharesOutstanding: 10000000,
  dividendPerShare: 0.6,
  dividendYield: 2.4,
  totalReturn: 18.3,
  capitalRaised: 5000000,
  sharesBoughtBack: 200000,
  tradingVolume: 1500,
  avgDailyVolume: 900,
  totalTrades: 420,
  activeShareholders: 550,
  floatPercentage: 62,
  high52Week: 30.1,
  low52Week: 12.4,
  dividendHistory: [],
};

const EVENTS = [{ type: 'buyback', severity: 'positive', headline: 'Repurchased shares', tick: 511 }];

const REACT_CRASH = /Minified React error #310|Rendered fewer hooks than expected|changed in the order of Hooks/i;

function json(body, status = 200) {
  return { status, contentType: 'application/json', body: JSON.stringify(body) };
}

function installApiMocks(page, { delayCompany = false } = {}) {
  const errors = [];
  page.on('console', (msg) => {
    const type = msg.type();
    if (type === 'error' || type === 'warning') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(String(err)));

  const delay = (ms) => new Promise((r) => setTimeout(r, ms));

  page.route('**/api/**', async (route) => {
    const suffix = route.request().url().replace(/^.*\/api/, '/api');

    if (suffix === '/api/users/me')
      return route.fulfill(
        json({
          _id: 'u1',
          username: 'trader',
          role: 'user',
          acceptedTerms: true,
          acceptedPrivacy: true,
          onboardingV2: { status: 'completed', completedSteps: [], startedAt: null, completedAt: Date.now(), skippedAt: null },
        }),
      );
    if (suffix === '/api/companies') return route.fulfill(json([COMPANY]));
    if (suffix === '/api/companies/market/overview')
      return route.fulfill(
        json({
          totalMarketCap: 245000000,
          totalCompanies: 1,
          gainers: [{ ticker: 'VTX', dayChangePercent: 3.16 }],
          losers: [],
          industries: {},
        }),
      );
    if (suffix === '/api/companies/c1') {
      if (delayCompany) await delay(700);
      return route.fulfill(json(COMPANY));
    }
    if (suffix === '/api/companies/c1/history') return route.fulfill(json(HISTORY));
    if (suffix === '/api/companies/c1/events') return route.fulfill(json(EVENTS));
    if (suffix === '/api/stocks/c1/statistics') return route.fulfill(json(STATS));
    if (suffix === '/api/stocks/public/events/c1') return route.fulfill(json(EVENTS));
    if (suffix === '/api/stocks/public') return route.fulfill(json([COMPANY]));
    if (suffix === '/api/stocks/public/statistics') return route.fulfill(json({}));
    if (suffix === '/api/indexes') return route.fulfill(json({ indexes: [] }));
    return route.fulfill(json({ error: 'not found' }, 404));
  });

  return errors;
}

async function seedToken(page) {
  await page.addInitScript(() => localStorage.setItem('token', 'e2e-token'));
}

async function assertNoReactCrash(page, errors) {
  const crashes = errors.filter((e) => REACT_CRASH.test(e));
  expect(crashes, `React #310 console errors: ${JSON.stringify(crashes)}`).toEqual([]);
}

for (const { name, viewport } of [
  { name: 'desktop', viewport: { width: 1280, height: 720 } },
  { name: 'mobile', viewport: { width: 390, height: 844 } },
]) {
  test.describe(`Capital Markets page (@${name} ${viewport.width}x${viewport.height})`, () => {
    test.use({ viewport });

    test('market page loads and opening a company renders without React #310', async ({ page }) => {
      const errors = installApiMocks(page);
      await seedToken(page);

      await page.goto('/stocks');
      await expect(page.getByRole('link', { name: /Vertex Financials/ }).first()).toBeVisible({ timeout: 20_000 });

      await page.getByRole('link', { name: /Vertex Financials/ }).first().click();

      await expect(page).toHaveURL(/\/company\/c1/);
      await expect(page.getByRole('heading', { name: 'Vertex Financials', level: 1 })).toBeVisible({ timeout: 20_000 });
      await expect(page.getByText('$24.50').first()).toBeVisible({ timeout: 20_000 });

      const toggle = page.getByRole('button', { name: /How is this calculated/ }).first();
      await toggle.click();
      await expect(page.getByText(/Dividends are paid quarterly/i).first()).toBeVisible({ timeout: 10_000 });
      await toggle.click();
      await expect(page.getByText(/Dividends are paid quarterly/i).first()).not.toBeVisible();

      await page.getByRole('button', { name: 'Financials' }).first().click();
      await expect(page.getByText('Trading Statistics').first()).toBeVisible({ timeout: 10_000 });
      await page.getByRole('button', { name: 'Events' }).first().click();
      await expect(page.getByText('Repurchased shares').first()).toBeVisible({ timeout: 10_000 });

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `horizontal overflow on ${name}: ${overflow}px`).toBeLessThanOrEqual(1);

      await assertNoReactCrash(page, errors);
    });

    test('survives the loading -> loaded transition that previously threw #310', async ({ page }) => {
      const errors = installApiMocks(page, { delayCompany: true });
      await seedToken(page);

      await page.goto('/company/c1');
      await expect(page.getByText('Loading...').first()).toBeVisible({ timeout: 10_000 });
      await expect(page.getByRole('heading', { name: 'Vertex Financials', level: 1 })).toBeVisible({ timeout: 30_000 });

      await page.getByRole('button', { name: 'Overview' }).first().click();
      await expect(page.getByRole('heading', { name: 'Vertex Financials', level: 1 })).toBeVisible();

      await assertNoReactCrash(page, errors);
    });

    test('shows the not-found state without a hooks violation when the company is missing', async ({ page }) => {
      const errors = installApiMocks(page);
      await seedToken(page);

      await page.route('**/api/companies/c1', (route) => route.fulfill(json({ error: 'gone' }, 404)));
      await page.route('**/api/companies/c1/history', (route) => route.fulfill(json({ error: 'gone' }, 404)));
      await page.route('**/api/companies/c1/events', (route) => route.fulfill(json({ error: 'gone' }, 404)));

      await page.goto('/company/c1');
      await expect(page.getByText(/Company not found/i).first()).toBeVisible({ timeout: 20_000 });

      await assertNoReactCrash(page, errors);
    });
  });
}