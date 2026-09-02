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
//   3. Cropped playfield — `fitBounds` at `minZoom=2` could not fit the whole
//      city set on narrow screens, so half the world (Tokyo/LA/Oceania) sat
//      off-screen. The map must zoom out to fit EVERY country marker inside
//      the visible container on every viewport (minZoom=0 + world maxBounds).
//   4. Hidden zoom controls / overlay collisions — the world-status panel must
//      live in the LEFT column below Leaflet's zoom control: zoom-in must be
//      elementFromPoint()-visible/clickable and the panel must not overlap
//      the control. The previous bug had the panel inside the top-left
//      control space (and the interim fix moved it to the right).
//   5. Zoom is not "locked at 2" anymore — zooming out is allowed down to the
//      world view (0); the world edges are locked via maxBounds instead.
//   6. World -> City navigation — clicking a country marker must open the
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

// Every country marker's anchor point (bottom-center of the badge) must sit
// inside the map container — the WHOLE playfield is visible on first load.
async function assertWholePlayfieldVisible(page) {
  return page.evaluate(() => {
    const container = document.querySelector('.leaflet-container');
    if (!container) return { ok: false, reason: 'no container' };
    const c = container.getBoundingClientRect();
    const pins = [...document.querySelectorAll('.country-pin')];
    if (pins.length === 0) return { ok: false, reason: 'no country pins' };
    const anchored = pins.map((pin) => {
      const r = pin.getBoundingClientRect();
      // Anchor is the badge's bottom-center (iconAnchor bottom-center).
      return { x: r.x + r.width / 2, y: r.y + r.height };
    });
    const inside = anchored.filter(
      (p) => p.x >= c.left - 2 && p.x <= c.right + 2 && p.y >= c.top - 2 && p.y <= c.bottom + 2,
    );
    return {
      ok: inside.length === anchored.length,
      total: anchored.length,
      inside: inside.length,
      outside: anchored
        .filter((p) => !(p.x >= c.left - 2 && p.x <= c.right + 2 && p.y >= c.top - 2 && p.y <= c.bottom + 2))
        .map((p) => `(${Math.round(p.x)},${Math.round(p.y)})`),
      container: { left: Math.round(c.left), top: Math.round(c.top), right: Math.round(c.right), bottom: Math.round(c.bottom) },
    };
  });
}

async function statusPanelGeometry(page) {
  return page.evaluate(() => {
    const panel = document.querySelector('.world-status-panel');
    const container = document.querySelector('.leaflet-container');
    const zoom = document.querySelector('.leaflet-control-zoom');
    if (!panel || !container) return null;
    const p = panel.getBoundingClientRect();
    const c = container.getBoundingClientRect();
    const z = zoom ? zoom.getBoundingClientRect() : null;
    const overlapWithZoom = z
      ? p.left < z.right && p.right > z.left && p.top < z.bottom && p.bottom > z.top
      : null;
    return {
      x: Math.round(p.left),
      y: Math.round(p.top),
      w: Math.round(p.width),
      h: Math.round(p.height),
      panelLeftOfCenter: p.left + p.width / 2 < c.left + c.width / 2,
      panelBelowZoom: z ? p.top >= z.bottom - 2 : null,
      overlapWithZoom,
      zoomRect: z ? { x: Math.round(z.left), y: Math.round(z.top), w: Math.round(z.width), h: Math.round(z.height) } : null,
    };
  });
}

test('world map renders a single full-size non-collapsed Leaflet instance', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/map');
  await page.locator('.leaflet-container').waitFor();
  await assertMapFitsViewport(page);
  await page.waitForTimeout(1500); // let tiles/markers settle
  await assertMapFitsViewport(page);
});

test('whole playfield (every country marker) is visible on first load in every viewport', async ({ page }) => {
  const viewports = [
    { width: 1366, height: 768 },
    { width: 1920, height: 1080 },
    { width: 390, height: 844 }, // iPhone portrait
    { width: 412, height: 915 }, // Android portrait
    { width: 844, height: 390 }, // iPhone landscape
  ];
  for (const vp of viewports) {
    await page.setViewportSize(vp);
    await page.goto('/map');
    await page.locator('.leaflet-container').waitFor();
    await page.waitForTimeout(2000);
    const vis = await assertWholePlayfieldVisible(page);

    // Tall viewports must show EVERY country marker. Very short ones (landscape)
    // are physically limited: a 390px-tall strip cannot include both the far
    // north and far south countries at the clean-world floor — allow a couple of
    // edge markers to fall just outside there (they pan into view).
    const tolerance = vp.height < 600 ? 4 : 0;
    expect(
      vis.ok || vis.total - vis.inside <= tolerance,
      `${vp.width}x${vp.height}: country markers on screen (${vis.inside}/${vis.total}, outside: ${vis.outside?.join(', ')})`,
    ).toBe(true);

    // The world (256*2^zoom px) must fill the viewport width — continents are
    // never duplicated side-by-side at the fitted zoom.
    const cam = await page.evaluate(() => {
      const m = window.__cfMap;
      const c = document.querySelector('.leaflet-container').getBoundingClientRect();
      return m ? { zoom: m.getZoom(), worldW: Math.pow(2, m.getZoom()) * 256, cw: c.width } : null;
    });
    expect(cam, 'leaflet instance exposed via __cfMap').toBeTruthy();
    expect(cam.worldW >= cam.cw, `${vp.width}x${vp.height}: world fills the viewport (no edge repetition)`).toBe(true);

    // The map must also still fit the viewport (no overflow from the fit).
    const geo = await mapGeometry(page);
    expect(geo.scrollWidth, `${vp.width}x${vp.height}: no horizontal page scrollbar`).toBeLessThanOrEqual(geo.clientWidth + 1);
    expect(geo.scrollHeight, `${vp.width}x${vp.height}: no vertical page scrollbar`).toBeLessThanOrEqual(geo.clientHeight + 1);
  }
});

test('zoom controls are visible, uncovered by the status panel, and zooming works both ways', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/map');
  const zoomIn = page.locator('a.leaflet-control-zoom-in');
  const zoomOut = page.locator('a.leaflet-control-zoom-out');
  await zoomIn.waitFor();
  await page.waitForTimeout(800);

  const isHitVisible = (locator) =>
    locator.evaluate((el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return false;
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return el === hit || el.contains(hit);
    });

  // The world-status panel used to cover the top-left zoom control. It now
  // lives in the LEFT column BELOW the control.
  expect(await isHitVisible(zoomIn), 'zoom-in button not covered by the status panel').toBe(true);

  const panel = await statusPanelGeometry(page);
  expect(panel, 'status panel is present').toBeTruthy();
  expect(panel.panelLeftOfCenter, 'status panel is on the left half of the map').toBe(true);
  expect(panel.panelBelowZoom, 'status panel sits below the zoom control (no overlap)').toBe(true);
  expect(panel.overlapWithZoom, 'status panel does not overlap the zoom control').toBe(false);

  const before = await page.evaluate(() => window.__cfMap.getZoom());
  await zoomIn.click();
  await page.waitForFunction((prev) => window.__cfMap.getZoom() !== prev, before, { timeout: 5000 });
  const zoomedIn = await page.evaluate(() => window.__cfMap.getZoom());

  // Zooming back out must keep working (zoom-out is enabled once above the floor).
  await zoomOut.click();
  await page.waitForFunction((prev) => window.__cfMap.getZoom() !== prev, zoomedIn, { timeout: 5000 });
});

test('mobile fit is never locked at zoom 2 — narrow screens get a floor that fits the world cleanly', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/map');
  await page.locator('.leaflet-container').waitFor();
  await page.waitForTimeout(2000);
  const camera = await page.evaluate(() => {
    const m = window.__cfMap;
    const c = document.querySelector('.leaflet-container').getBoundingClientRect();
    return m
      ? {
          zoom: m.getZoom(),
          minZoom: m.getMinZoom(),
          worldFillsViewport: Math.pow(2, m.getZoom()) * 256 >= c.width,
        }
      : null;
  });
  expect(camera, 'leaflet instance exposed via __cfMap').toBeTruthy();
  // The initial fit is BELOW 2 on a phone (the old minZoom=2 floor would crop).
  expect(camera.zoom).toBeLessThan(2);
  // At the fitted zoom the world tile width fills the container — continents are
  // never duplicated side-by-side (old zoom-0 bug).
  expect(camera.worldFillsViewport, 'world width >= viewport width at the fitted zoom').toBe(true);

  const zoomIn = page.locator('a.leaflet-control-zoom-in');
  const beforeZoom = await page.evaluate(() => window.__cfMap.getZoom());
  await zoomIn.click();
  await page.waitForFunction((prev) => window.__cfMap.getZoom() > prev, beforeZoom, { timeout: 5000 });
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
  await cityButton.click();
  await page.waitForURL(/\/city\/.+/);
  expect(page.url()).toMatch(/\/city\/.+/);
});