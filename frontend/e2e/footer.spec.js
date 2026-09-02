// Real-browser verification that the CityFlow footer is a NORMAL document-flow
// footer and never sticky/fixed or viewport-glued:
//
//   1. Computed `position` is never `fixed`/`sticky` on any page/viewport.
//   2. Short pages (e.g. /contributors, /map) fit the viewport at rest
//      (documentScrollHeight == clientHeight) — the footer sits at the bottom
//      purely via the layout structure (min-height shell + flex), not by
//      positioning.
//   3. Long pages (e.g. /terms) scroll the DOCUMENT; the footer is below the
//      fold on load and only reaches viewport after scrolling through content.
//   4. On /map the footer never overlaps the map — it sits strictly below the
//      map container, and the map still fills the available viewport.
//   5. The same holds for mobile viewports and RTL (no horizontal overflow).
//
// Run against the built site:
//   BASE_URL=http://127.0.0.1:3001 npx playwright test footer.spec.js --config playwright.config.js
import { test, expect } from 'playwright/test';

const LOGIN_ROUTES = ['/', '/login'];

async function footerState(page) {
  return page.evaluate(() => {
    const footer = document.querySelector('footer');
    const main = document.querySelector('.app-shell main');
    const shell = document.querySelector('.app-shell');
    if (!footer || !main) {
      return { present: false, hasFooter: !!footer, hasMain: !!main };
    }
    const doc = document.documentElement;
    const fr = footer.getBoundingClientRect();
    const mr = main.getBoundingClientRect();
    const style = getComputedStyle(footer);
    const mainStyle = getComputedStyle(main);
    return {
      present: true,
      position: style.position,
      mainOverflowY: mainStyle.overflowY,
      footerTop: Math.round(fr.top),
      footerBottom: Math.round(fr.bottom),
      footerLeft: Math.round(fr.left),
      footerRight: Math.round(fr.right),
      mainLeft: Math.round(mr.left),
      mainRight: Math.round(mr.right),
      footerWithinMainX: fr.left >= mr.left - 2 && fr.right <= mr.right + 2,
      scrollHeight: doc.scrollHeight,
      clientHeight: doc.clientHeight,
      scrollWidth: doc.scrollWidth,
      clientWidth: doc.clientWidth,
      noVerticalScrollbar: doc.scrollHeight <= doc.clientHeight,
      noHorizontalOverflow: doc.scrollWidth <= doc.clientWidth,
      footerInViewport: fr.top < doc.clientHeight && fr.bottom > 0,
    };
  });
}

async function goto(page, url) {
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  // Give client-rendered shell/footer a moment to mount.
  await page.waitForFunction(() => !!document.querySelector('footer'), undefined, { timeout: 20000 });
  await page.waitForTimeout(1200);
}

// Pages WITHOUT the app layout must not be covered either (they still work).
for (const route of LOGIN_ROUTES) {
  test(`footer is static and flow-based on ${route}`, async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await goto(page, route);
    const s = await footerState(page);
    expect(s.present, `footer present on ${route}`).toBe(true);
    expect(['static', 'relative'].includes(s.position), `${route}: footer position is ${s.position}`).toBe(true);
    expect(s.noHorizontalOverflow, `${route}: no horizontal overflow`).toBe(true);
  });
}

test('footer is in normal document flow on a short page (no inner scroll shell)', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await goto(page, '/contributors');
  const s = await footerState(page);
  expect(s.present).toBe(true);
  // <main> must not be an inner scroll container — the document is the scroller.
  expect(['visible', 'auto'].includes(s.mainOverflowY)).toBe(true);
  // At rest the page fits the viewport exactly (footer pinned via structure).
  expect(s.noVerticalScrollbar, 'short page does not scroll unnecessarily').toBe(true);
  expect(s.footerInViewport, 'footer visible at the bottom of the short page').toBe(true);
});

test('footer stays below the fold on a long page and scrolls into view (document scroll)', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await goto(page, '/terms');
  const before = await footerState(page);
  if (!before.present) throw new Error('footer missing on /terms');
  // /terms is a long text page — the document must scroll past the footer.
  const longPage = before.scrollHeight > before.clientHeight + 100;
  expect(longPage, `/terms should be a long page (scrollHeight ${before.scrollHeight})`).toBe(true);
  expect(before.footerInViewport, 'footer is below the fold on load').toBe(false);
  expect(before.noHorizontalOverflow).toBe(true);

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => {
    const doc = document.documentElement;
    const fr = document.querySelector('footer').getBoundingClientRect();
    return {
      footerTop: Math.round(fr.top),
      footerBottom: Math.round(fr.bottom),
      footerVisibleAtBottom: fr.top < doc.clientHeight && fr.bottom > 0,
      atBottom: Math.abs(window.scrollY + doc.clientHeight - doc.scrollHeight) < 8,
    };
  });
  expect(after.atBottom, 'scrolled to the true bottom of the document').toBe(true);
  expect(after.footerVisibleAtBottom, 'footer reached after scrolling through content').toBe(true);
});

const MAPPAGE_VIEWPORTS = [
  { width: 1366, height: 768 },
  { width: 390, height: 844 },
  { width: 412, height: 915 },
  { width: 844, height: 390 },
];

for (const vp of MAPPAGE_VIEWPORTS) {
  test(`footer never overlaps the map and stays below it (${vp.width}x${vp.height})`, async ({ page }) => {
    await page.setViewportSize(vp);
    await goto(page, '/map');
    await page.locator('.leaflet-container').waitFor({ timeout: 20000 });
    await page.waitForTimeout(2000);
    const s = await footerState(page);
    const map = await page.evaluate(() => {
      const r = document.querySelector('.leaflet-container').getBoundingClientRect();
      return { top: Math.round(r.top), bottom: Math.round(r.bottom), width: Math.round(r.width), height: Math.round(r.height) };
    });

    expect(s.present, 'footer present on /map').toBe(true);
    expect(['static', 'relative'].includes(s.position), `footer static on map (got ${s.position})`).toBe(true);
    expect(s.noHorizontalOverflow, `${vp.width}x${vp.height}: no horizontal overflow`).toBe(true);
    expect(s.noVerticalScrollbar, `${vp.width}x${vp.height}: map page fits the viewport at rest`).toBe(true);

    // Footer strictly below the map — never overlapping it.
    expect(map.bottom, 'map has real height').toBeGreaterThan(200);
    expect(map.width, 'map has real width').toBeGreaterThan(300);
    expect(s.footerTop, 'footer starts at/after the map bottom').toBeGreaterThanOrEqual(map.bottom - 2);
    expect(s.footerWithinMainX, 'footer stays inside the main column (RTL/LTR)').toBe(true);
  });
}

test('footer is static and unclipped in RTL', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await goto(page, '/map');
  await page.locator('.leaflet-container').waitFor({ timeout: 20000 });
  await page.evaluate(() => {
    document.body.dir = 'rtl';
    document.documentElement.dir = 'rtl';
  });
  await page.waitForTimeout(300);
  const s = await footerState(page);
  expect(s.present).toBe(true);
  expect(['static', 'relative'].includes(s.position)).toBe(true);
  expect(s.footerWithinMainX, 'RTL footer stays inside main').toBe(true);
  expect(s.noHorizontalOverflow, 'RTL no horizontal overflow').toBe(true);
});