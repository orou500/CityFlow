import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import '@testing-library/jest-dom/vitest';

const languageState = vi.hoisted(() => ({ language: 'en' }));

const DICT = vi.hoisted(() => ({
  en: {
    'common.loading': 'Loading...',
    'stocks.notFound': 'Company not found',
    'stocks.backToMarket': 'Back to market',
    'stocks.sharePrice': 'Price',
    'stocks.marketCap': 'Market Cap',
    'stocks.employees': 'Employees',
    'stocks.offices': 'Offices',
    'stocks.cities': 'Cities',
    'stocks.revenue': 'Revenue',
    'stocks.growthSinceStart': 'since start',
    'stocks.howCalculated': 'How is this calculated?',
    'stocks.infoMarketCap': 'Market Cap',
    'stocks.infoOwnership': 'Ownership',
    'stocks.infoDividend': 'Dividend',
    'stocks.infoPrice': 'Price',
    'stocks.infoQuarterly': 'Quarterly dividends',
    'stocks.priceChart': 'Price Chart',
    'stocks.allTime': 'All',
    'stocks.tabOverview': 'Overview',
    'stocks.tabHistory': 'History',
    'stocks.tabFinancials': 'Financials',
    'stocks.tabEvents': 'Events',
    'stocks.trade': 'Trade',
    'stocks.buy': 'Buy',
    'stocks.sell': 'Sell',
    'stocks.yourPosition': 'Your position',
    'stocks.shares': 'Shares',
    'stocks.companyInfo': 'Company Info',
    'stocks.hq': 'HQ',
    'stocks.officialEvent': 'Official',
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => {
    const dict = DICT[languageState.language] || DICT.en;
    const t = (key, options = {}) => {
      const template = dict[key];
      const interpolate = (s) => s.replace(/\{\{(\w+)\}\}/g, (_, name) => options[name] ?? `{{${name}}}`);
      return template === undefined ? key : interpolate(template);
    };
    return { t, i18n: languageState };
  },
}));

vi.mock('../../utils/capacitor', () => ({
  getApiBaseUrl: () => 'http://localhost',
}));

import CompanyPage from '../CompanyPage';

function makeCompany(overrides = {}) {
  return {
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
    userHolding: { shares: 100, avgBuyPrice: 20.0, currentValue: 2450, profitLoss: 450 },
    performance: [
      { tick: 100, employees: 1000, revenue: 4000000 },
      { tick: 512, employees: 3200, revenue: 12500000 },
    ],
    ...overrides,
  };
}

function jsonResponse(body, ok = true, status = 200) {
  return { ok, status, json: async () => body };
}

function routeFetch(overrides = {}) {
  return vi.fn(async (url, options = {}) => {
    const path = String(url).replace(/^.*\/api/, '/api');
    const pick = (v, def) => (v && v.ok !== undefined ? v : jsonResponse(v ?? def));
    if (path.endsWith('/companies/c1')) return pick(overrides.company, makeCompany());
    if (path.endsWith('/companies/c1/history'))
      return jsonResponse(
        overrides.history ?? [{ tick: 511, price: 23.8, employees: 3100, revenue: 11500000, marketCap: 238000000 }],
      );
    if (path.endsWith('/companies/c1/events')) return jsonResponse(overrides.events ?? []);
    if (path.endsWith('/stocks/c1/statistics'))
      return jsonResponse(
        overrides.stats ?? {
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
        },
      );
    if (path.endsWith('/stocks/public/events/c1'))
      return jsonResponse(overrides.publicEvents ?? overrides.events ?? []);
    return jsonResponse({ error: 'not found' }, false, 404);
  });
}

function renderPage(initialUrl = '/company/c1') {
  return render(
    <MemoryRouter initialEntries={[initialUrl]}>
      <Routes>
        <Route path="/company/:id" element={<CompanyPage />} />
        <Route path="/stocks" element={<div>market-list-page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  languageState.language = 'en';
});

describe('CompanyPage (stock company) — no React error #310 (Rendered fewer hooks than expected)', () => {
  it('renders the loading state first, then the loaded page, without a hooks violation', async () => {
    globalThis.fetch = routeFetch();
    renderPage();

    expect(screen.getByText('Loading...')).toBeInTheDocument();

    await waitFor(() => expect(screen.getByText('Vertex Financials')).toBeInTheDocument());
    expect(screen.getByText('Back to market')).toBeInTheDocument();
    expect(screen.getByText('$24.50')).toBeInTheDocument();
  });

  it('shows the "not found" state when the company fetch fails, then recovers via a fresh mount', async () => {
    globalThis.fetch = routeFetch({ company: jsonResponse({ error: 'boom' }, false, 500) });
    const first = renderPage();

    await waitFor(() => expect(screen.getByText('Company not found')).toBeInTheDocument());

    cleanup();
    globalThis.fetch = routeFetch();
    renderPage();
    await waitFor(() => expect(screen.getByText('Vertex Financials')).toBeInTheDocument());
    expect(first.container).not.toBeInTheDocument();
  });

  it('toggling the "How is this calculated?" panel keeps the hook order stable across re-renders', async () => {
    globalThis.fetch = routeFetch();
    renderPage();

    await waitFor(() => expect(screen.getByText('Vertex Financials')).toBeInTheDocument());

    const toggle = screen.getByRole('button', { name: /How is this calculated/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(toggle);
    await waitFor(() => expect(toggle).toHaveAttribute('aria-expanded', 'true'));
    expect(screen.getByText('Quarterly dividends')).toBeInTheDocument();

    fireEvent.click(toggle);
    await waitFor(() => expect(toggle).toHaveAttribute('aria-expanded', 'false'));
    expect(screen.queryByText('Quarterly dividends')).not.toBeInTheDocument();

    fireEvent.click(toggle);
    await waitFor(() => expect(toggle).toHaveAttribute('aria-expanded', 'true'));
  });

  it('switching tabs and chart ranges never changes the number of hooks executed', async () => {
    const history = [];
    for (let i = 490; i <= 512; i += 1) {
      history.push({
        tick: i,
        price: 20 + (i - 490) * 0.35,
        employees: 1500 + (i - 490) * 70,
        revenue: 5000000 + (i - 490) * 300000,
        marketCap: 200000000 + (i - 490) * 2000000,
      });
    }
    globalThis.fetch = routeFetch({
      history,
      events: [{ type: 'buyback', severity: 'positive', headline: 'Company repurchased shares', tick: 511 }],
    });
    renderPage();

    await waitFor(() => expect(screen.getByText('Vertex Financials')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Financials' }));
    await waitFor(() => expect(screen.getByText('Revenue', { selector: 'div' }).parentElement).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'History' }));
    fireEvent.click(screen.getByRole('button', { name: 'Events' }));
    await waitFor(() => expect(screen.getByText('Company repurchased shares')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Overview' }));
    fireEvent.click(screen.getByRole('button', { name: '7D' }));
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    await waitFor(() => expect(screen.getByText('Vertex Financials')).toBeInTheDocument());
  });

  it('renders cleanly with empty history/events (empty → populated transitions)', async () => {
    globalThis.fetch = routeFetch({ history: [], events: [] });
    renderPage();

    await waitFor(() => expect(screen.getByText('Vertex Financials')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Events' }));
    fireEvent.click(screen.getByRole('button', { name: 'History' }));

    cleanup();
    const populatedEvents = [
      { type: 'share_issuance', severity: 'positive', headline: 'Company raised capital', tick: 510 },
    ];
    globalThis.fetch = routeFetch({ history: [], events: populatedEvents });
    renderPage();
    await waitFor(() => expect(screen.getByText('Vertex Financials')).toBeInTheDocument());
  });

  it('buying and selling inputs re-render with a stable hook order', async () => {
    globalThis.fetch = routeFetch();
    renderPage();

    await waitFor(() => expect(screen.getByText('Vertex Financials')).toBeInTheDocument());

    const inputs = screen.getAllByRole('spinbutton');
    fireEvent.change(inputs[0], { target: { value: '10' } });
    fireEvent.change(inputs[1], { target: { value: '5' } });

    expect(screen.getByText('Buy')).toBeInTheDocument();
    expect(screen.getByText('Sell')).toBeInTheDocument();
    expect(screen.getByText('Vertex Financials')).toBeInTheDocument();

    const toggle = screen.getByRole('button', { name: /How is this calculated/ });
    fireEvent.click(toggle);
    expect(screen.getByText('Quarterly dividends')).toBeInTheDocument();
  });
});
