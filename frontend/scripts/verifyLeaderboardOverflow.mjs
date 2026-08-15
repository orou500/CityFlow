import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = fileURLToPath(new URL('../dist', import.meta.url));
const PORT = 4173;

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.woff2': 'font/woff2',
};

const server = createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(new URL(req.url, `http://localhost:${PORT}`).pathname);
    if (path === '/') path = '/index.html';
    let file = normalize(join(ROOT, path));
    if (!file.startsWith(ROOT)) {
      res.writeHead(403);
      res.end();
      return;
    }
    let data;
    try {
      data = await readFile(file);
    } catch {
      file = join(ROOT, 'index.html');
      data = await readFile(file);
    }
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(data);
  } catch (err) {
    res.writeHead(500);
    res.end(String(err));
  }
});

await new Promise((r) => server.listen(PORT, r));

// ---------------- API intercept data ----------------
const EXTREME = process.env.DATA_MODE !== 'normal';

function makeData() {
  if (!EXTREME) {
    const user = {
      _id: 'me',
      username: 'citymogul',
      displayName: 'City Mogul',
      balance: 154000000,
      level: 42,
      role: 'user',
      acceptedTerms: true,
      acceptedPrivacy: true,
      achievements: [],
      propertyCount: 9,
    };
    const entry = (rank) => ({
      userId: `u${rank}`,
      username: `player${rank}`,
      displayName: `Player ${rank}`,
      avatar: null,
      rank,
      value: 154000000 - rank * 7000000,
      rankChange: rank % 3 === 0 ? -2 : rank % 3 === 1 ? 1 : 0,
    });
    return {
      user,
      rankings: Array.from({ length: 20 }, (_, i) => entry(987654321 + i)),
      total: 500,
      rewards: Array.from({ length: 5 }, (_, i) => ({ rank: i + 1, reward: 500000000 - i * 10000000 })),
      myRanks: {
        netWorth: { rank: 42, value: 154000000 },
        properties: { rank: 9, value: 9 },
        passiveIncome: { rank: 17, value: 3500000 },
        dealVolume: { rank: 61, value: 84000000 },
        cityInfluence: { rank: 28, value: 1440 },
      },
    };
  }

  const user = {
    _id: 'me',
    username: 'veryLongUsernameThatCouldOverflowEverything',
    displayName: 'Very Very Long Display Name That Could Over Overflow The Whole Page',
    balance: 9999999999999999,
    level: 99,
    role: 'user',
    acceptedTerms: true,
    acceptedPrivacy: true,
    achievements: [],
    propertyCount: 999,
  };
  const entry = (rank) => ({
    userId: `u${rank}`,
    username: `super_extra_mega_long_username_that_will_never_break_${rank}`,
    displayName: `This Is An Extremely Long Player Display Name For Rank ${rank} With Lots Of Words To Test Ellipsis`,
    avatar: null,
    rank,
    value: 9999999999999999,
    rankChange: rank === 3 ? -999999999 : 999999999,
  });
  return {
    user,
    rankings: Array.from({ length: 20 }, (_, i) => entry(987654321 + i)),
    total: 500,
    rewards: Array.from({ length: 5 }, (_, i) => ({ rank: i + 1, reward: 9999999999999999 - i })),
    myRanks: {
      netWorth: { rank: 999999999, value: 9999999999999999 },
      properties: { rank: 888888888, value: 999999999 },
      passiveIncome: { rank: 777777777, value: 9999999999999999 },
      dealVolume: { rank: 666666666, value: 9999999999999999 },
      cityInfluence: { rank: 555555555, value: 999999999 },
    },
  };
}

const API_DATA = makeData();

function apiHandler(route) {
  const url = new URL(route.request().url());
  const p = url.pathname;
  let body = { error: 'not found' };
  let status = 404;
  const m = p.match(/^\/api\/leaderboards\/rankings\/([a-zA-Z]+)/);
  if (m) {
    body = { rankings: API_DATA.rankings, total: API_DATA.total, seasonNumber: 7 };
    status = 200;
  } else if (p.includes('/api/leaderboards/rewards')) {
    body = { rewards: API_DATA.rewards, seasonNumber: 7 };
    status = 200;
  } else if (p.includes('/api/leaderboards/my-rank')) {
    body = API_DATA.myRanks;
    status = 200;
  } else if (p.match(/^\/api\/leaderboards\/player\//)) {
    body = {
      user: API_DATA.user,
      ranks: { netWorth: { rank: 4, value: 9999999999999999 }, properties: { rank: 5, value: 6 } },
    };
    status = 200;
  } else if (p.includes('/api/users/me')) {
    body = API_DATA.user;
    status = 200;
  } else if (p.includes('/api/maintenance')) {
    body = { enabled: false, message: '' };
    status = 200;
  } else if (p.includes('/api/notifications/unread-count')) {
    body = { count: 0 };
    status = 200;
  }
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

// ---------------- measurement ----------------
const VIEWPORTS = [
  { w: 320, h: 844, name: 'iPhone SE' },
  { w: 360, h: 800, name: 'Android small' },
  { w: 375, h: 812, name: 'iPhone X/12 mini' },
  { w: 390, h: 844, name: 'iPhone 12/13/14' },
  { w: 393, h: 852, name: 'iPhone 14 Pro' },
  { w: 414, h: 896, name: 'iPhone 11/XR' },
  { w: 430, h: 932, name: 'iPhone 14 Pro Max' },
];

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

function scanPage() {
  const docEl = document.documentElement;
  const body = document.body;
  const main = document.querySelector('main');
  const scan = {
    docEl: { sw: docEl.scrollWidth, cw: docEl.clientWidth },
    body: { sw: body.scrollWidth, cw: body.clientWidth },
    main: main ? { sw: main.scrollWidth, cw: main.clientWidth } : null,
    offenders: [],
  };
  if (main) {
    const mr = main.getBoundingClientRect();
    for (const el of main.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      const pad = 1;
      const overRight = r.right > mr.right + pad;
      const overLeft = r.left < mr.left - pad;
      if (overRight || overLeft) {
        const cs = getComputedStyle(el);
        scan.offenders.push({
          tag: el.tagName.toLowerCase(),
          id: el.id || '',
          cls: (el.className && el.className.baseVal !== undefined
            ? el.className.baseVal
            : String(el.className || '')
          ).slice(0, 160),
          text: (el.textContent || '').slice(0, 60).replace(/\s+/g, ' ').trim(),
          left: Math.round(r.left * 10) / 10,
          right: Math.round(r.right * 10) / 10,
          width: Math.round(r.width * 10) / 10,
          display: cs.display,
          minWidth: cs.minWidth,
          whiteSpace: cs.whiteSpace,
          overflowX: cs.overflowX,
          position: cs.position,
        });
      }
    }
  }
  return scan;
}

let failures = 0;
const results = [];
const browser = await chromium.launch();

for (const vp of VIEWPORTS) {
  for (const lang of ['en', 'he']) {
    const context = await browser.newContext({
      viewport: { width: vp.w, height: vp.h },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 3,
      userAgent: IPHONE_UA,
    });
    await context.addInitScript(
      ([l, token]) => {
        localStorage.setItem('i18n_language', l);
        localStorage.setItem('token', token);
      },
      [lang, 'test-token'],
    );
    const page = await context.newPage();
    await page.route('**/api/**', apiHandler);
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`http://localhost:${PORT}/leaderboards`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    const scan = await page.evaluate(scanPage);
    const dbg = await page.evaluate(() => ({
      innerWidth: window.innerWidth,
      mobilePagination: !!document.querySelector('button[aria-label="leaderboard.prevPage"] + span'),
      mobilePodium: !!document.querySelector('span.text-2xl'),
    }));
    if (vp.w === 320 && lang === 'en') console.log('DEBUG mobile markup:', JSON.stringify(dbg));

    const ok =
      scan.docEl.sw <= scan.docEl.cw && scan.body.sw <= scan.body.cw && (!scan.main || scan.main.sw <= scan.main.cw);
    if (!ok) failures++;
    results.push({ ...vp, lang, scan, ok, errors: errors.slice(0, 3) });
    await context.close();
  }
}

server.close();

for (const r of results) {
  const flag = r.ok ? 'PASS' : 'FAIL';
  console.log(`\n[${flag}] ${r.name} ${r.lang} (cw=${r.scan.docEl.cw}px, vw=${r.scan.docEl.cw}px)`);
  if (!r.ok) {
    console.log(`  docEl: ${r.scan.docEl.sw} vs ${r.scan.docEl.cw}`);
    console.log(`  body : ${r.scan.body.sw} vs ${r.scan.body.cw}`);
    if (r.scan.main) console.log(`  main : ${r.scan.main.sw} vs ${r.scan.main.cw}`);
    const seen = new Set();
    for (const o of r.scan.offenders.slice(0, 12)) {
      const key = `${o.tag}.${o.cls}`;
      if (seen.has(key)) continue;
      seen.add(key);
      console.log(`  > <${o.tag} class="${o.cls}"> left=${o.left} right=${o.right} w=${o.width}`);
      console.log(
        `    text="${o.text}" | display=${o.display} minWidth=${o.minWidth} ws=${o.whiteSpace} ox=${o.overflowX} pos=${o.position}`,
      );
    }
  }
  if (r.errors.length) console.log(`  pageErrors: ${r.errors.join(' | ')}`);
}

console.log(
  `\n==== DATA_MODE=${EXTREME ? 'extreme' : 'normal'}: ${results.length - failures}/${results.length} viewport-lang combos pass ====`,
);
process.exit(failures ? 1 : 0);
