// Real-browser verification of the CityFlow World Map fixes (run AFTER the fix
// is deployed against the live site):
//
//   npx playwright test worldmap.spec.js --config playwright.config.js
//
// The world map route (/map) is PUBLIC — no login is required, unlike the
// auction spec, so the geometry/control assertions run on any deployment.
//
// What this guards against (the production bugs):
//   1. Double Leaflet init / blank map  — exactly ONE .leaflet-container must
//      exist and be non-collapsed (non-zero width/height). The old page
//      unmounted WorldMap whenever the shared store `loading` flipped, so a
//      refetch destroyed and recreated the map (camera reset + blank flash).
//   2. Stretch / overflow — with `min-h-[500px]` on the map wrapper and no
//      `min-h-0` in the flex chain, the map pushed past the fixed-height
//      .app-shell on short viewports and was cut off below the fold. Now the
//      map must fit inside the viewport: no document scrollbar, map bottom on
//      screen, and the same guarantee in a phone-sized/landscape viewport.
//   3. Hidden zoom controls — the world-status panel sat on top of Leaflet's
//      top-left zoom control (z-index: 0 vs z-10). Now the zoom-in button must
//      be elementFromPoint()-visible/clickable and zooming must move the map.
//   4. Zoom floor — `minZoom={2}`: zooming out at zoom 2 must be disabled.
//   5. World -> City navigation — clicking a country marker must open the
//      popup and route to /city/:id.
import { test, expect } from 'playwright/test';

const BASE = process.env.BASE_URL || 'https://cityflow.sizops.co.il';

async function mapGeometry(page) {
  return page.evaluate(() => {
    const el = document.querySelector('.leaflet-container');
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return {
      width: rect.width,
      height: rect.height,
      top: rect.top,
      bottom: rect.bottom,
      count: document.querySelectorAll('.leaflet-container').length,
      clientWidth: document.documentElement.clientWidth,
      clientHeight: document.documentElement.clientHeight,
      scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight,
    };
  });
}

async function assertMapFitsViewport(page) {
  const geo = await mapGeometry(page);
  expect(geo, 'expected a .leaflet-container to exist').toBeTruthy();
  expect(geo.count, 'exactly one Leaflet instance').toBe(1);
  expect(geo.width, 'map has real width').toBeGreaterThan(300);
  expect(geo.height, 'map has real height').toBeGreaterThan(250);
  expect(geo.scrollWidth, 'no horizontal page scrollbar').toBeLessThanOrEqual(geo.clientWidth + 1);
  expect(geo.scrollHeight, 'no vertical page scrollbar').toBeLessThanOrEqual(geo.clientHeight + 1);
  expect(geo.bottom, 'map bottom stays within the viewport (no stretch below the fold)').toBeLessThanOrEqual(
    geo.clientHeight + 1,
  );
}

test('world map renders a single full-size non-collapsed Leaflet instance', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/map');
  await page.locator('.leaflet-container').waitFor();
  await assertMapFitsViewport(page);
  await page.waitForTimeout(1500); // let tiles/markers settle
  await assertMapFitsViewport(page);
});

test('map is fully usable in phone-sized and landscape viewports', async ({ page }) => {
  for (const viewport of [
    { width: 390, height: 844 }, // iPhone portrait
    { width: 844, height: 390 }, // iPhone landscape
    { width: 412, height: 915 }, // Android portrait
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/map');
    await page.locator('.leaflet-container').waitFor();
    const geo = await mapGeometry(page);
    expect(geo.count, `single map instance at ${viewport.width}x${viewport.height}`).toBe(1);
    expect(geo.scrollWidth, `no horizontal page scrollbar at ${viewport.width}x${viewport.height}`).toBeLessThanOrEqual(
      geo.clientWidth + 1,
    );
    expect(geo.bottom, `map bottom on screen at ${viewport.width}x${viewport.height}`).toBeLessThanOrEqual(
      geo.clientHeight + 1,
    );
  }
});

test('zoom controls are visible, uncovered and functional (zoom floor = 2)', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/map');
  const zoomIn = page.locator('a.leaflet-control-zoom-in');
  const zoomOut = page.locator('a.leaflet-control-zoom-out');
  await zoomIn.waitFor();

  const isHitVisible = (locator) =>
    locator.evaluate((el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return false;
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return el === hit || el.contains(hit);
    });

  // The world-status panel used to cover the top-left zoom control.
  expect(await isHitVisible(zoomIn), 'zoom-in button not covered by the status panel').toBe(true);

  // minZoom=2 means zoom-out is disabled while the initial zoom is 2.
  await expect(zoomOut).toHaveClass(/leaflet-disabled/);

  const before = await page.locator('.leaflet-map-pane').evaluate((el) => el.style.transform);
  await zoomIn.click();
  await expect
    .poll(() => page.locator('.leaflet-map-pane').evaluate((el) => el.style.transform), { timeout: 5000 })
    .not.toBe(before);
  // Zoomed in past the floor, the zoom-out button is enabled again.
  await expect(zoomOut).not.toHaveClass(/leaflet-disabled/);
});

test('panning the map keeps valid geometry (no collapse, no overflow)', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/map');
  const container = page.locator('.leaflet-container');
  await container.waitFor();
  const box = await container.boundingBox();
  expect(box).toBeTruthy();

  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX - 160, startY - 120, { steps: 8 });
  await page.mouse.up();

  await page.waitForTimeout(600);
  await assertMapFitsViewport(page);
});

test('world -> city navigation via the country marker popup', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/map');

  const marker = page.locator('.country-pin').first();
  const hasMarker = (await marker.count()) > 0;
  test.skip(!hasMarker, 'no country markers on the live world (world may be reset)');

  await marker.waitFor({ timeout: 30_000 });
  await marker.click();
  await page.locator('.leaflet-popup-content button').first().waitFor({ timeout: 5000 });

  const cityButton = page.locator('.leaflet-popup-content button').first();
  const cityName = (await cityButton.textContent()).trim();
  await cityButton.click();
  await page.waitForURL(/\/city\/.+/);
  expect(page.url()).toMatch(/\/city\/.+/);
});
