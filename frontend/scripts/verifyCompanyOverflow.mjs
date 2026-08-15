import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = fileURLToPath(new URL('../dist', import.meta.url));
const PORT = 4174;

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
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

const LONG = 'A'.repeat(80);
const LONG_NAME = `Super Mega Ultra Long Company Name That Will Definitely Overflow Everything ${LONG}`;
const LONG_USERNAME = `an_extremely_long_player_username_that_could_break_layouts_${LONG}`;
const HUGE = 9999999999999999;

function tx(type, extra = {}) {
  return {
    _id: `tx_${type}_${Math.random().toString(36).slice(2)}`,
    type,
    amount: HUGE,
    description: `An extremely long treasury transaction description for type ${type} with many many words ${LONG}`,
    createdAt: new Date('2026-08-01T12:00:00.000Z'),
    ...extra,
  };
}

function makeData() {
  const commonUser = {
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

  const baseCompany = {
    _id: 'comp1',
    founderId: 'me',
    name: 'Test Company',
    description: 'A realistic company',
    hqCityId: { _id: 'city1', name: 'Tel Aviv' },
    level: 12,
    xp: 50000,
    xpToNextLevel: 120000,
    reputation: 1000,
    prestige: 250,
    maxMembers: 10,
    isMember: true,
    memberRole: 'ceo',
    hasPendingApplication: false,
    ipo: { listed: false },
    employees: { count: 5, maxEmployees: 10, monthlySalaryPerEmployee: 5000, totalPayroll: 25000 },
    levelBenefits: { loanInterestDiscount: 0.05 },
    invitations: [],
    applications: [],
    loans: [],
    treasury: {
      balance: 50000000,
      transactions: [
        tx('rent_income'),
        tx('property_purchase'),
        tx('loan_disbursement'),
        tx('withdrawal'),
        tx('deposit'),
        tx('loan_payment'),
        tx('contract_reward'),
        tx('investment_return'),
        tx('property_sale'),
        tx('capital_contribution'),
      ],
    },
    stats: { netWorth: 120000000, propertiesOwned: 3, totalRentalIncome: 12000000 },
    shareBreakdown: [
      { userId: 'me', percentage: 60, isTreasury: false },
      { isTreasury: true, percentage: 40 },
    ],
    ipoRequirements: {
      fee: 30000000,
      minLevel: 10,
      minMembers: 5,
      minNetWorth: 30000000,
      minProperties: 10,
      maxDebtRatio: 0.5,
    },
  };

  if (EXTREME) {
    const userId = (i) => ({ _id: `u${i}`, username: LONG_USERNAME + i });
    const members = [];
    const shareBreakdown = [];
    for (let i = 0; i < 8; i++) {
      const uid = i === 0 ? { _id: 'me', username: LONG_USERNAME + i } : userId(i);
      members.push({
        _id: `m${i}`,
        userId: uid,
        role: ['ceo', 'director', 'officer', 'officer', 'member', 'member', 'recruit', 'recruit'][i],
        shares: 99999,
        joinedAt: new Date('2026-01-01T00:00:00.000Z'),
        invitedBy: 'me',
      });
      shareBreakdown.push({ userId: uid, percentage: 12.5, isTreasury: false });
    }
    return {
      company: {
        ...baseCompany,
        name: LONG_NAME,
        description: `An extremely long company description used for stress testing the mobile layout ${LONG}`,
        members,
        shareBreakdown,
        invitations: [
          { _id: 'inv1', userId: userId(9), invitedBy: 'me', status: 'pending', createdAt: new Date() },
          { _id: 'inv2', userId: userId(10), invitedBy: 'me', status: 'pending', createdAt: new Date() },
        ],
        applications: [
          {
            _id: 'app1',
            userId: userId(11),
            message: `An extremely long application message ${LONG}`,
            status: 'pending',
            createdAt: new Date(),
          },
          {
            _id: 'app2',
            userId: userId(12),
            message: `Another long application message ${LONG}`,
            status: 'pending',
            createdAt: new Date(),
          },
        ],
        treasury: { ...baseCompany.treasury, balance: HUGE },
        stats: { netWorth: HUGE, propertiesOwned: 999, totalRentalIncome: HUGE },
        xp: 999999999,
        xpToNextLevel: 999999999,
        reputation: 999999999,
        prestige: 999999999,
        employees: { count: 999, maxEmployees: 9999, monthlySalaryPerEmployee: 999999, totalPayroll: HUGE },
      },
      user: {
        _id: 'me',
        username: LONG_USERNAME,
        displayName: `Very Very Long Display Name That Could Overflow ${LONG}`,
        balance: HUGE,
        level: 99,
        role: 'user',
        companyId: 'comp1',
        acceptedTerms: true,
        acceptedPrivacy: true,
        achievements: [],
      },
    };
  }

  const userId = (i) => ({ _id: `u${i}`, username: `player${i}` });
  const members = [
    {
      _id: 'm0',
      userId: { _id: 'me', username: 'citymogul' },
      role: 'ceo',
      shares: 500,
      joinedAt: new Date('2026-01-01'),
      invitedBy: 'me',
    },
    { _id: 'm1', userId: userId(1), role: 'director', shares: 200, joinedAt: new Date('2026-02-01'), invitedBy: 'me' },
    { _id: 'm2', userId: userId(2), role: 'officer', shares: 100, joinedAt: new Date('2026-03-01'), invitedBy: 'me' },
    { _id: 'm3', userId: userId(3), role: 'member', shares: 100, joinedAt: new Date('2026-04-01'), invitedBy: 'me' },
    { _id: 'm4', userId: userId(4), role: 'recruit', shares: 100, joinedAt: new Date('2026-05-01'), invitedBy: 'me' },
  ];
  return {
    company: {
      ...baseCompany,
      members,
      shareBreakdown: [
        { userId: { _id: 'me', username: 'citymogul' }, percentage: 50, isTreasury: false },
        { isTreasury: true, percentage: 50 },
      ],
      invitations: [{ _id: 'inv1', userId: userId(9), invitedBy: 'me', status: 'pending', createdAt: new Date() }],
      applications: [
        {
          _id: 'app1',
          userId: userId(11),
          message: 'I would love to join this great company!',
          status: 'pending',
          createdAt: new Date(),
        },
      ],
    },
    user: { ...commonUser, companyId: 'comp1' },
  };
}

const API_DATA = makeData();
const C = API_DATA.company;

const LENDING_PRODUCT = {
  id: 'loan_standard',
  name: 'Standard Business Loan',
  description: 'A standard loan product for growing companies',
  interestRate: 0.075,
  minPrincipal: 5000000,
  maxPrincipal: 50000000,
  durationTicks: 48,
};

const INVESTMENT_PRODUCT = {
  _id: 'prod1',
  name: 'Growth Real Estate Fund',
  description: 'A long term investment product with great returns and moderate risk',
  minInvestment: 1000000,
  maxInvestment: 10000000,
  durationTicks: 48,
  risk: 'moderate',
  currentAnnualReturnRate: 0.12,
  annualReturnRate: 0.12,
  economyState: 'growing',
};

const PROP = (i) => ({
  _id: `prop${i}`,
  name: EXTREME
    ? `Property Name That Is Extremely Long For Stress Testing Purposes ${i} ${LONG}`
    : `Downtown Tower ${i}`,
  type: 'apartment',
  currentPrice: EXTREME ? HUGE : 50000000,
  basePrice: 50000000,
  rent: EXTREME ? HUGE : 1500000,
  occupancy: 97,
  developmentLevel: 3,
  cityId: { _id: 'city1', name: EXTREME ? `An Extremely Long City Name ${LONG}` : 'Tel Aviv' },
});

const COMPANY_PROPERTIES = [PROP(1), PROP(2), PROP(3), PROP(4)];

function apiHandler(route) {
  const url = new URL(route.request().url());
  const p = url.pathname;
  let body = { error: 'not found' };
  let status = 404;
  try {
    if (p === '/api/real-estate-companies/comp1') {
      body = C;
      status = 200;
    } else if (p === '/api/real-estate-companies/comp1/stats') {
      body = C.stats;
      status = 200;
    } else if (p === '/api/real-estate-companies/comp1/loans') {
      body = [
        {
          _id: 'loan1',
          type: 'business',
          principal: EXTREME ? HUGE : 30000000,
          interestRate: 0.08,
          durationTicks: 48,
          ticksRemaining: 30,
          active: true,
          createdAt: new Date(),
        },
        {
          _id: 'loan2',
          type: 'construction',
          principal: EXTREME ? HUGE : 12000000,
          interestRate: 0.06,
          durationTicks: 24,
          ticksRemaining: 0,
          active: false,
          createdAt: new Date(),
        },
      ];
      status = 200;
    } else if (p === '/api/real-estate-companies/comp1/loan-requests') {
      body = [
        {
          _id: 'lr1',
          requestedBy: 'u2',
          principal: EXTREME ? HUGE : 25000000,
          durationTicks: 36,
          loanType: 'business',
          status: 'pending',
          createdTick: 100,
          votes: [
            { userId: 'u1', vote: 'yes', votedAt: new Date() },
            { userId: 'u2', vote: 'no', votedAt: new Date() },
          ],
        },
      ];
      status = 200;
    } else if (p === '/api/real-estate-companies/comp1/loan-options') {
      body = [
        LENDING_PRODUCT,
        {
          ...LENDING_PRODUCT,
          id: 'loan_emergency',
          name: 'Emergency Loan With A Very Long Name',
          interestRate: 0.15,
          minPrincipal: 1000000,
          maxPrincipal: 5000000,
        },
      ];
      status = 200;
    } else if (p === '/api/real-estate-companies/comp1/property-purchase-requests') {
      body = [
        {
          _id: 'ppr1',
          requestedBy: 'u2',
          propertyId: COMPANY_PROPERTIES[0],
          status: 'pending',
          createdTick: 100,
          votes: [{ userId: 'u1', vote: 'yes', votedAt: new Date() }],
        },
      ];
      status = 200;
    } else if (p === '/api/real-estate-companies/comp1/properties') {
      body = { properties: COMPANY_PROPERTIES, page: 1, totalPages: 2, total: 8 };
      status = 200;
    } else if (p === '/api/real-estate-companies/comp1/audit') {
      body = {
        logs: Array.from({ length: 8 }, (_, i) => ({
          _id: `aud${i}`,
          userId: i % 2 ? { _id: `u${i}`, username: EXTREME ? LONG_USERNAME : `player${i}` } : null,
          action: [
            'member_invited',
            'treasury_withdrawal',
            'property_purchase',
            'loan_executed',
            'member_role_changed',
          ][i % 5],
          createdAt: new Date('2026-08-10T10:00:00.000Z'),
          details: {
            targetUsername: EXTREME ? LONG_USERNAME : 'playerX',
            amount: EXTREME ? HUGE : 5000000,
            note: `An extremely long audit detail string for stress testing the layout ${LONG}`,
          },
        })),
        total: 8,
        page: 1,
        totalPages: 1,
      };
      status = 200;
    } else if (p === '/api/city-contracts/comp1/contracts/history') {
      body = [
        {
          _id: 'ch1',
          title: 'Completed Road Construction Contract',
          status: 'completed',
          reward: EXTREME ? HUGE : 5000000,
          completedAt: new Date(),
          cityId: 'city1',
        },
      ];
      status = 200;
    } else if (p === '/api/city-contracts/comp1/contracts') {
      body = [
        {
          _id: 'ct1',
          title: EXTREME ? `Extremely Long City Contract Title For Stress Testing ${LONG}` : 'City Park Renovation',
          description: EXTREME
            ? `Extremely long contract description with lots of details ${LONG}`
            : 'Renovate the central city park',
          reward: EXTREME ? HUGE : 8000000,
          requiredLevel: 8,
          requiredTreasury: EXTREME ? HUGE : 20000000,
          status: 'available',
          durationTicks: 24,
        },
      ];
      status = 200;
    } else if (p === '/api/real-estate-companies/comp1/investments') {
      body = [
        {
          _id: 'inv1',
          investmentType: 'real_estate',
          amount: EXTREME ? HUGE : 5000000,
          status: 'pending',
          requestedBy: 'u2',
          votes: [{ userId: 'u1', vote: 'yes', votedAt: new Date() }],
          createdAt: new Date(),
        },
      ];
      status = 200;
    } else if (p === '/api/real-estate-companies/comp1/investments/products') {
      body = [
        INVESTMENT_PRODUCT,
        {
          ...INVESTMENT_PRODUCT,
          _id: 'prod2',
          name: 'High Risk Venture Fund With A Very Long Name',
          risk: 'high',
          currentAnnualReturnRate: 0.22,
          annualReturnRate: 0.22,
        },
      ];
      status = 200;
    } else if (p === '/api/real-estate-companies/comp1/investments/performance') {
      body = {
        totalInvested: EXTREME ? HUGE : 15000000,
        totalReturns: EXTREME ? HUGE : 2500000,
        annualizedReturn: 0.12,
      };
      status = 200;
    } else if (p === '/api/users/me') {
      body = API_DATA.user;
      status = 200;
    } else if (p.includes('/api/maintenance')) {
      body = { enabled: false, message: '' };
      status = 200;
    } else if (p.includes('/api/notifications/unread-count')) {
      body = { count: 0 };
      status = 200;
    } else {
      route.continue();
      return;
    }
  } catch (err) {
    body = { error: String(err) };
    status = 500;
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

const TABS = [
  'overview',
  'members',
  'applications',
  'treasury',
  'properties',
  'loans',
  'contracts',
  'investments',
  'audit',
];

let failures = 0;
const results = [];
const browser = await chromium.launch();

for (const vp of VIEWPORTS) {
  for (const lang of ['en', 'he']) {
    for (const tab of TABS) {
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
      await page.goto(`http://localhost:${PORT}/real-estate-companies/comp1?tab=${tab}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(400);
      const scan = await page.evaluate(scanPage);

      const ok =
        scan.docEl.sw <= scan.docEl.cw && scan.body.sw <= scan.body.cw && (!scan.main || scan.main.sw <= scan.main.cw);
      if (!ok) failures++;
      results.push({ ...vp, lang, tab, scan, ok, errors: errors.slice(0, 3) });
      await context.close();
    }
  }
}

server.close();

for (const r of results) {
  const flag = r.ok ? 'PASS' : 'FAIL';
  console.log(`[${flag}] ${r.name} ${r.lang} ${r.tab} (cw=${r.scan.docEl.cw}px)`);
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
  `\n==== DATA_MODE=${EXTREME ? 'extreme' : 'normal'}: ${results.length - failures}/${results.length} viewport-lang-tab combos pass ====`,
);
process.exit(failures ? 1 : 0);
