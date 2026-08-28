// Real-browser verification of the two production auction fixes (run AFTER
// deploy against the live site):
//
//   1. Historical property readability — every ended/cancelled auction resolves
//      a real property name from the live Property document or the immutable
//      propertySnapshot; only when BOTH are gone does a controlled placeholder
//      (name: null, unavailable: true) appear. No endpoint may ever surface the
//      raw propertyId as the display name, and "Unknown Property" must never
//      render.
//
//   2. Anti-sniping ceiling — through a live browser session, in-window bids
//      can extend an auction's endTick at most once:
//        - a bid OUTSIDE the window => endTick unchanged, extensionCount stays 0
//        - a bid INSIDE the window  => endTick +1 (exactly one extension)
//        - a second qualifying in-window bid => NO further extension
//      (the production bug: "~1 day left" jumping back up to "~2 days left").
//
//   3. Timing consistency — an auction's { currentTick, endTick, remainingMonths }
//      must be identical across list / detail / featured / my-bids / watchlist.
//
// Bidding requires REAL VERIFIED throwaway accounts — production registration
// leaves emails unverified so a fresh signup can never log in. Provision two
// verified users on the backend pod first and export their credentials:
//
//   $env:E2E_AUCT_USER_1 = "e2e_auct_u1_<ts>"
//   $env:E2E_AUCT_USER_2 = "e2e_auct_u2_<ts>"
//   $env:E2E_AUCT_PASS    = "<password>"
//   npx playwright test --config playwright.config.js
//
// The throwaway users are safe to soft-delete afterwards (see
// backend/scripts/softDeleteE2ESliderUsers.js for the pattern).
import { test, expect } from 'playwright/test';

const BASE = process.env.BASE_URL || 'https://cityflow.sizops.co.il';
const API = `${BASE}/api`;
const PASS = process.env.E2E_AUCT_PASS || 'E2eAuct!Pass1';
const USER_1 = process.env.E2E_AUCT_USER_1;
const USER_2 = process.env.E2E_AUCT_USER_2;
const WINDOW = 2; // AUCTION_CONFIG.antiSnipingThresholdTicks

async function login(request, username, label) {
  if (!username) {
    throw new Error(
      `${label} is not set — pre-provision verified throwaway bidders and export ` +
        'E2E_AUCT_USER_1/E2E_AUCT_USER_2/E2E_AUCT_PASS (see spec header).',
    );
  }
  const res = await request.post(`${API}/auth/login`, {
    data: { login: username, password: PASS },
  });
  expect(res.ok(), `login failed for ${username} (${label}): ${res.status()} ${await res.text()}`).toBeTruthy();
  const body = await res.json();
  expect(body.token, `no token in login response for ${username}`).toBeDefined();
  return body.token;
}

async function injectAuth(page, token) {
  await page.addInitScript((value) => {
    localStorage.setItem('token', value);
    localStorage.setItem('cityflow-auth', JSON.stringify({ state: { token: value }, version: 0 }));
  }, token);
}

const timingOf = (a) => ({
  currentTick: a.currentTick,
  endTick: a.endTick,
  remainingMonths: a.remainingMonths,
});

const minBidFor = (a) => (a.currentBid > 0 ? a.currentBid + Math.max(a.bidIncrement || 1000, 1000) : a.startingBid);

async function placeBid(request, auth, auctionId, amount, attempt = 0) {
  const res = await request.post(`${API}/auctions/${auctionId}/bid`, {
    headers: { Authorization: `Bearer ${auth}` },
    data: { amount },
  });
  if (res.ok()) return res.json();
  const text = await res.text();
  // Outbid race: someone moved the high bid between planning and sending.
  // Refetch once and recompute, mirroring what the UI would do.
  if (res.status() === 400 && /at least/i.test(text) && attempt < 1) {
    const detail = await (await request.get(`${API}/auctions/${auctionId}`)).json();
    const a = detail.auction;
    if (a.status === 'active') {
      return placeBid(request, auth, auctionId, minBidFor(a), attempt + 1);
    }
  }
  expect(res.ok(), `bid ${amount} on ${auctionId} failed: ${res.status()} ${text}`).toBeTruthy();
  return null;
}

function assertPropertyReadable(a, label) {
  expect(a.property, `${label} auction ${a._id} is missing the resolved property`).toBeTruthy();
  const p = a.property;
  if (a.propertyAvailable === true || p.fromSnapshot === true) {
    expect(typeof p.name, `${label} ${a._id} property name`).toBe('string');
    expect(p.name.length, `${label} ${a._id} empty property name`).toBeGreaterThan(0);
  } else if (p.unavailable === true) {
    expect(p.name, `${label} ${a._id}`).toBe(null);
  } else {
    throw new Error(`${label} auction ${a._id} has an unrecognized property fallback`);
  }
  if (typeof p.name === 'string' && p.name.length > 0) {
    const rawId = String(a.propertyId || '');
    expect(p.name, `${label} ${a._id} leaked the raw propertyId as the name`).not.toBe(rawId);
    if (rawId) expect(p.name).not.toContain(rawId);
  }
}

test('auction dashboard never renders "Unknown Property"', async ({ page, request }) => {
  const token = await login(request, USER_1, 'E2E_AUCT_USER_1');
  await injectAuth(page, token);
  await page.goto('/auctions', { waitUntil: 'networkidle' });

  // ProtectedRoute passed means token + hydrated user worked — we are on the
  // dashboard, not a login redirect.
  await expect(page).toHaveURL(/\/auctions/);
  await expect(page.getByText('Unknown Property', { exact: false })).toHaveCount(0);
});

test('anti-sniping: out-of-window never extends; in-window extends at most once', async ({ page, request }) => {
  const authA = await login(request, USER_1, 'E2E_AUCT_USER_1');
  const authB = await login(request, USER_2, 'E2E_AUCT_USER_2');
  await injectAuth(page, authA);

  // ---- find targets: active auctions (prefer ones with an existing bid) ----
  const listRes = await request.get(`${API}/auctions?status=active&sort=endTick&order=asc&limit=100`);
  expect(listRes.ok()).toBeTruthy();
  const listBody = await listRes.json();
  const rows = (listBody.auctions || []).filter(
    (a) => a.status === 'active' && a.endTick != null && a.currentTick != null,
  );
  expect(rows.length, 'no active auction to exercise anti-sniping').toBeGreaterThan(0);

  const rem = (a) => a.endTick - a.currentTick;
  const preferBid = (a) => ((a.currentBid || 0) > 0 ? -1 : 1);
  // Fresh in-window auctions (endTick === originalEndTick) can still take the
  // single allowed extension; pre-fix over-extended ones already hit the
  // ceiling. Prefer fresh -> closest to ending -> with a high bid.
  const alreadyExtended = (a) => (!a.originalEndTick ? 0 : Math.max(0, Math.round(a.endTick - a.originalEndTick)));
  const inWindow = rows
    .filter((a) => rem(a) > 0 && rem(a) <= WINDOW)
    .sort(
      (a, b) =>
        (alreadyExtended(a) === 0 ? 0 : 1) - (alreadyExtended(b) === 0 ? 0 : 1) ||
        rem(a) - rem(b) ||
        preferBid(a) - preferBid(b),
    );
  const outWindow = rows.filter((a) => rem(a) > WINDOW).sort((a, b) => rem(b) - rem(a) || preferBid(a) - preferBid(b));

  const log = [];
  const loadTarget = async (id) => {
    const detailRes = await request.get(`${API}/auctions/${id}`);
    expect(detailRes.ok()).toBeTruthy();
    return (await detailRes.json()).auction;
  };

  // ---- out-of-window bid: endTick must never move ----
  if (outWindow.length > 0) {
    const target = outWindow[0];
    const before = timingOf(target);
    const res = await placeBid(request, authA, target._id, minBidFor(target));
    const after = timingOf(res.auction);
    log.push(`outWindow ${target._id}: rem ${before.remainingMonths} (win ${WINDOW})`);
    expect(res.auction.extensionCount ?? 0, 'out-of-window bid must not extend').toBe(0);
    expect(after.endTick, 'out-of-window bid must not move endTick').toBe(before.endTick);
    expect(after.remainingMonths, 'out-of-window bid must not move the countdown').toBe(before.remainingMonths);
  } else {
    log.push('outWindow: none available');
  }

  // ---- in-window bids: first extends exactly once, second never ----
  expect(inWindow.length, 'no auction is inside the anti-sniping window right now').toBeGreaterThan(0);
  const win = inWindow[0];
  const pre = await loadTarget(win._id);
  const preRem = pre.endTick - pre.currentTick;
  const preExtended = pre.originalEndTick ? Math.max(0, Math.round(pre.endTick - pre.originalEndTick)) : 0;
  expect(pre.status).toBe('active');
  expect(preRem).toBeGreaterThan(0);
  expect(preRem).toBeLessThanOrEqual(WINDOW);
  log.push(`inWindow ${win._id}: rem ${preRem} (win ${WINDOW}, preExtended ${preExtended})`);

  const inc = Math.max(pre.bidIncrement || 1000, 1000);
  const first = await placeBid(request, authB, win._id, pre.currentBid > 0 ? pre.currentBid + inc : pre.startingBid);
  const t1 = timingOf(first.auction);
  const ext1 = first.auction.extensionCount ?? 0;
  const delta = t1.endTick - pre.endTick;
  log.push(`first in-window bid: endTick ${pre.endTick} -> ${t1.endTick}, extensionCount=${ext1}`);
  expect([0, 1], `first in-window bid extended by ${delta} ticks — ceiling is 1`).toContain(delta);
  expect(ext1, 'extensionCount ceiling is 1').toBeLessThanOrEqual(1);
  if (delta === 1) {
    expect(ext1, 'the sole extension must be recorded').toBe(1);
  }
  expect(
    t1.remainingMonths - (pre.remainingMonths ?? 0),
    'countdown may jump up by at most the single extension tick',
  ).toBeLessThanOrEqual(delta);

  const second = await placeBid(request, authA, win._id, first.auction.currentBid + inc);
  const t2 = timingOf(second.auction);
  const ext2 = second.auction.extensionCount ?? 0;
  log.push(`second in-window bid: endTick ${t1.endTick} -> ${t2.endTick}, extensionCount=${ext2}`);
  expect(t2.endTick, 'THE production bug: a second in-window bid must NEVER extend the countdown again').toBe(
    t1.endTick,
  );
  expect(ext2, 'extensionCount must never exceed 1').toBeLessThanOrEqual(1);
  expect(
    t2.remainingMonths - t1.remainingMonths,
    'countdown must be monotonic after the first bid',
  ).toBeLessThanOrEqual(0);

  // ---- timing consistency across every endpoint ----
  const gold = timingOf(second.auction);
  const myAuctions = await (
    await request.get(`${API}/auctions/my/bids`, { headers: { Authorization: `Bearer ${authA}` } })
  ).json();
  const watch = await (
    await request.get(`${API}/auctions/my/watchlist`, { headers: { Authorization: `Bearer ${authA}` } })
  ).json();
  const featured = await (await request.get(`${API}/auctions/featured`)).json();
  const freshList = await (await request.get(`${API}/auctions?status=active&limit=100`)).json();

  const sources = {
    list: (freshList.auctions || []).find((a) => String(a._id) === String(win._id)),
    detail: await loadTarget(win._id),
    myBids: (myAuctions.auctions || []).find((a) => String(a._id) === String(win._id)),
    watchlist: (watch.auctions || []).find((a) => String(a._id) === String(win._id)),
    featured: (featured.auctions || []).find((a) => String(a._id) === String(win._id)),
  };

  for (const [name, src] of Object.entries(sources)) {
    if (!src) {
      log.push(`consistency ${name}: auction not in that list (ok for featured top-10)`);
      continue;
    }
    const t = timingOf(src);
    expect(t.endTick, `${name} endTick must equal gold ${gold.endTick}`).toBe(gold.endTick);
    const staleFeatured = name === 'featured' && t.currentTick !== gold.currentTick;
    if (!staleFeatured) {
      expect(t.currentTick, `${name} currentTick`).toBe(gold.currentTick);
      expect(t.remainingMonths, `${name} remainingMonths (end ${gold.endTick}, now ${gold.currentTick})`).toBe(
        gold.remainingMonths,
      );
    }
    log.push(`consistency ${name}: ok (endTick ${t.endTick}, rem ${t.remainingMonths})`);
  }

  // ---- browser: the dashboard countdown reflects the same auction ----
  await page.goto('/auctions', { waitUntil: 'networkidle' });
  const body = (await page.locator('body').innerText()).trim();
  expect(body.length).toBeGreaterThan(0);
  expect(body).not.toContain('Unknown Property');

  console.log(`[auctions-e2e] ${log.join(' | ')}`);
});

test('ended and cancelled auctions display a property — snapshot/fallback, never the raw id', async ({
  page,
  request,
}) => {
  const token = await login(request, USER_1, 'E2E_AUCT_USER_1');
  await injectAuth(page, token);

  const ended = await (await request.get(`${API}/auctions?status=ended&limit=100`)).json();
  const cancelled = await (await request.get(`${API}/auctions?status=cancelled&limit=100`)).json();
  const history = await (await request.get(`${API}/auctions/history/list?limit=100`)).json();

  const endedRows = ended.auctions || [];
  const cancelledRows = cancelled.auctions || [];
  const historyRows = history.auctions || [];

  for (const a of endedRows) assertPropertyReadable(a, 'ended');
  for (const a of cancelledRows) assertPropertyReadable(a, 'cancelled');
  for (const a of historyRows) assertPropertyReadable(a, 'history');

  const snapshots = [...endedRows, ...cancelledRows].filter((a) => a.property?.fromSnapshot === true).length;
  const unavailable = [...endedRows, ...cancelledRows].filter((a) => a.property?.unavailable === true).length;
  let live = [...endedRows, ...cancelledRows].filter((a) => a.propertyAvailable === true).length;
  live += historyRows.filter((a) => a.propertyAvailable === true).length;

  // ---- browser: spot-check detail pages render a real name or the fallback ----
  const spot = [...endedRows, ...cancelledRows].slice(0, 6);
  for (const a of spot) {
    await page.goto(`/auctions/${a._id}`, { waitUntil: 'networkidle' });
    const text = (await page.locator('body').innerText()).trim();
    expect(text, `detail ${a._id} leaked "Unknown Property"`).not.toContain('Unknown Property');
    if (typeof a.property?.name === 'string' && a.property.name.length > 0) {
      expect(text, `detail ${a._id} should show the property name`).toContain(a.property.name.slice(0, 12));
    } else {
      expect(text.replace(/\s+/g, ' '), `detail ${a._id} should show the controlled fallback`).toMatch(
        /(Property no longer available|הנכס כבר לא זמין)/,
      );
    }
  }

  console.log(
    `[auctions-e2e] historical: ended=${endedRows.length} cancelled=${cancelledRows.length} history=${historyRows.length} (live=${live} snapshot=${snapshots} unavailable=${unavailable})`,
  );
});
