// Real-browser regression: the Profile → Portfolio section must NEVER overflow
// its container or the viewport — every asset card fits inside the section,
// and no horizontal page scrolling appears at any breakpoint, in LTR or RTL.
//
// Requires a seeded account (backend/scripts/seedE2EPortfolio.js) and the
// local stack:
//   backend: PORT=5000 JWT_SECRET=cityflow-e2e-secret node src/index.js
//   frontend: npx vite --port 3000
//   E2E_PORTFOLIO_TOKEN=<jwt> npx playwright test profile-portfolio.spec.js --config playwright.config.js
import { test, expect } from 'playwright/test';

const TOKEN = process.env.E2E_PORTFOLIO_TOKEN;
const USERNAME = 'e2e_portfolio';
const BASE = process.env.BASE_URL || 'http://localhost:3000';

const VIEWPORTS = [375, 390, 430, 768, 1024, 1280, 1440, 1920];

async function measurePortfolio(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const link = document.querySelector('a[href^="/property/"]');
    if (!link) return { found: false };
    const section = link.closest('div.rounded-xl');
    const sectionRect = section.getBoundingClientRect();
    const cards = Array.from(section.querySelectorAll('a[href^="/property/"]')).map((card) => {
      const r = card.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width };
    });
    return {
      found: true,
      viewportWidth: window.innerWidth,
      docScrollWidth: doc.scrollWidth,
      section: { left: sectionRect.left, right: sectionRect.right, top: sectionRect.top, bottom: sectionRect.bottom },
      cards,
    };
  });
}

async function assertNoOverflow(m) {
  expect(m.found).toBe(true);
  // No horizontal page scroll.
  expect(m.docScrollWidth).toBeLessThanOrEqual(m.viewportWidth);
  // Section fully inside the viewport.
  expect(m.section.left).toBeGreaterThanOrEqual(0);
  expect(m.section.right).toBeLessThanOrEqual(m.viewportWidth + 0.5);
  // Every card fully inside the section.
  expect(m.cards.length).toBeGreaterThan(0);
  for (const c of m.cards) {
    expect(c.left).toBeGreaterThanOrEqual(m.section.left - 0.5);
    expect(c.right).toBeLessThanOrEqual(m.section.right + 0.5);
    expect(c.width).toBeLessThanOrEqual(m.viewportWidth);
  }
}

test.describe('Profile Portfolio — no overflow', () => {
  test.beforeEach(async ({ page }) => {
    expect(TOKEN, 'E2E_PORTFOLIO_TOKEN must be set').toBeTruthy();
    await page.addInitScript(
      ([token, lang]) => {
        localStorage.setItem('token', token);
        localStorage.setItem('i18n_language', lang);
      },
      [TOKEN, 'en'],
    );
  });

  for (const width of VIEWPORTS) {
    test(`no overflow at ${width}px (LTR)`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${BASE}/profile/${USERNAME}`);
      // Wait for the full portfolio to render (8 seeded assets) — structural,
      // language-agnostic.
      await page.waitForFunction(
        () => document.querySelectorAll('a[href^="/property/"]').length >= 8,
        undefined,
        { timeout: 20000 },
      );
      const m = await measurePortfolio(page);
      await assertNoOverflow(m);
    });
  }

  test('synthetic worst-case cards (very long name + huge value) stay inside the section', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE}/profile/${USERNAME}`);
    await page.waitForFunction(
      () => document.querySelectorAll('a[href^="/property/"]').length >= 8,
      undefined,
      { timeout: 15000 },
    );
    // Inject two worst-case rows directly into the real portfolio grid so the
    // check exercises the actual layout containers.
    await page.evaluate(() => {
      const link = document.querySelector('a[href^="/property/"]');
      const grid = link.closest('div.rounded-xl').querySelector('.grid');
      const mk = (name, value) => {
        const card = document.createElement('a');
        card.href = '/property/fake';
        card.className = 'flex items-center gap-3 min-w-0 bg-gray-50 rounded-lg p-4';
        card.innerHTML = `<img class="w-16 h-16 max-w-full object-cover rounded-lg shrink-0" src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==" alt="">
          <div class="flex-1 min-w-0"><div class="font-medium break-words">${name}</div></div>
          <div class="text-end min-w-0 break-words"><div class="text-sm font-semibold">${value}</div></div>`;
        return card;
      };
      grid.prepend(
        mk(
          'International Business District Office Complex Luxury Commercial Tower Downtown Mixed Use Development',
          '$999,999,999',
        ),
        mk('The Longest Possible Property Name That Keeps Wrapping Inside The Card Without Expanding It Ever', '$125,000,000'),
      );
    });
    const m = await measurePortfolio(page);
    await assertNoOverflow(m);
  });

  test('RTL (Hebrew) — no overflow, body dir rtl, cards inside section', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(
      ([token]) => {
        localStorage.setItem('token', token);
        localStorage.setItem('i18n_language', 'he');
      },
      [TOKEN],
    );
    await page.goto(`${BASE}/profile/${USERNAME}`);
    await page.waitForSelector('body[dir="rtl"]', { timeout: 15000 });
    await page.waitForFunction(
      () => document.querySelectorAll('a[href^="/property/"]').length >= 8,
      undefined,
      { timeout: 15000 },
    );
    const m = await measurePortfolio(page);
    await assertNoOverflow(m);
  });
});