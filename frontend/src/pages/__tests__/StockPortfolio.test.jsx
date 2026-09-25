import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom/vitest';

const authState = vi.hoisted(() => ({ user: { _id: 'u1', balance: 5000 }, fetchMe: vi.fn() }));

vi.mock('../../store/useAuthStore', () => ({
  useAuthStore: Object.assign((selector) => (selector ? selector(authState) : authState), {
    getState: () => authState,
  }),
  __esModule: true,
}));

const languageState = vi.hoisted(() => ({ language: 'en' }));

const DICT = vi.hoisted(() => ({
  en: {
    'common.loading': 'Loading...',
    'stocks.portfolio': 'My Portfolio',
    'stocks.backToMarket': 'Back to market',
    'stocks.totalValue': 'Total Value',
    'stocks.totalCost': 'Total Cost',
    'stocks.profitLoss': 'Profit/Loss',
    'stocks.tabStocks': 'Stocks',
    'stocks.tabIndexes': 'Indexes',
    'stocks.tabDividends': 'Dividends',
    'stocks.totalUnclaimed': 'Unclaimed dividends',
    'stocks.claimDividends': 'Claim dividends',
    'stocks.dividendClaimed': 'Dividends claimed',
    'stocks.noHoldings': 'No holdings',
    'stocks.browseMarket': 'Browse market',
    'stocks.noDividends': 'No dividends',
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

import StockPortfolio from '../StockPortfolio';

function jsonResponse(body, ok = true, status = 200) {
  return { ok, status, json: async () => body };
}

function makeFetch() {
  return vi.fn(async (url, options = {}) => {
    const path = String(url);
    if (options.method === 'POST' && path.endsWith('/stocks/dividends/claim'))
      return jsonResponse({ totalClaimed: 50, balance: 4329933.36 });
    if (path.endsWith('/companies/portfolio'))
      return jsonResponse({ holdings: [], totalValue: 0, totalCost: 0, totalPL: 0 });
    if (path.endsWith('/indexes/portfolio'))
      return jsonResponse({ holdings: [], totalValue: 0, totalCost: 0, totalPL: 0 });
    if (path.endsWith('/stocks/transactions')) return jsonResponse([]);
    if (path.endsWith('/indexes/user/transactions')) return jsonResponse([]);
    if (path.endsWith('/stocks/dividends'))
      return jsonResponse({
        dividends: [
          {
            companyId: 'c1',
            companyName: 'Vertex Financials',
            ticker: 'VTX',
            shares: 100,
            dividendPerShare: 0.5,
            unclaimed: 50,
            dividendYield: 2.4,
          },
        ],
        totalUnclaimed: 50,
      });
    return jsonResponse({ error: 'not found' }, false, 404);
  });
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/stocks/portfolio']}>
      <StockPortfolio />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  languageState.language = 'en';
});

describe('StockPortfolio', () => {
  it('loads the portfolio and shows the unclaimed dividend total', async () => {
    globalThis.fetch = makeFetch();
    renderPage();

    expect(screen.getByText('Loading...')).toBeInTheDocument();

    await waitFor(() => expect(screen.getByText('My Portfolio')).toBeInTheDocument());
    expect(screen.getByText('No holdings')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Dividends' }));
    await waitFor(() => expect(screen.getByText('Unclaimed dividends:')).toBeInTheDocument());
    expect(screen.getByText('Vertex Financials')).toBeInTheDocument();
  });

  it('refreshes the authenticated user (balance) after claiming dividends', async () => {
    const fetchMock = makeFetch();
    globalThis.fetch = fetchMock;
    renderPage();

    await waitFor(() => expect(screen.getByText('My Portfolio')).toBeInTheDocument());
    expect(authState.fetchMe).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Dividends' }));
    await waitFor(() => expect(screen.getByText('Unclaimed dividends:')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Claim dividends' }));

    await waitFor(() => expect(authState.fetchMe).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText(/Dividends claimed: \$50/)).toBeInTheDocument());

    const claimCall = fetchMock.mock.calls.find(([url, opts]) => opts.method === 'POST');
    expect(claimCall).toBeTruthy();
    expect(String(claimCall[0]).endsWith('/stocks/dividends/claim')).toBe(true);
  });
});
