import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import '@testing-library/jest-dom/vitest';

const authState = vi.hoisted(() => ({
  user: { _id: 'owner1', username: 'owner', balance: 1000000 },
  fetchMe: vi.fn(),
}));

const gameState = vi.hoisted(() => ({
  myCompanies: [],
  fetchUserData: vi.fn(),
  createOffer: vi.fn(),
  acceptOffer: vi.fn(),
  rejectOffer: vi.fn(),
  fetchSentOffers: vi.fn().mockResolvedValue([]),
  fetchNotifications: vi.fn(),
  fetchUnreadCount: vi.fn(),
}));

vi.mock('../../store/useAuthStore', () => ({
  useAuthStore: () => authState,
}));

vi.mock('../../store/useGameStore', () => ({
  useGameStore: () => gameState,
}));

const companyState = vi.hoisted(() => ({
  fetchDevelopmentRequests: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../store/useCompanyStore', () => ({
  useCompanyStore: () => ({
    myCompanies: [],
    fetchMyCompanies: vi.fn().mockResolvedValue([]),
    createPropertyPurchaseRequest: vi.fn(),
    createDevelopmentRequest: vi.fn(),
    fetchDevelopmentRequests: companyState.fetchDevelopmentRequests,
    voteDevelopmentRequest: vi.fn(),
  }),
}));

const i18nState = vi.hoisted(() => ({ language: 'en' }));

const translations = vi.hoisted(() => ({
  en: {
    'companyDevelopment.pendingProposals': 'Development Proposals',
    'companyDevelopment.constructionProgress': 'Construction Progress',
    'companyDevelopment.monthsLeft_one': '{{count}} month left',
    'companyDevelopment.monthsLeft_two': '{{count}} months left',
    'companyDevelopment.monthsLeft_other': '{{count}} months left',
    'companyDevelopment.underConstruction': 'Under Construction',
    'companyDevelopment.completed': 'Completed',
    'construction.finalMonth': 'Final Month — Preparing for Occupancy',
  },
  he: {
    'companyDevelopment.pendingProposals': 'הצעות פיתוח',
    'companyDevelopment.constructionProgress': 'התקדמות בנייה',
    'companyDevelopment.monthsLeft_one': 'נותר חודש אחד',
    'companyDevelopment.monthsLeft_two': 'נותרו חודשיים',
    'companyDevelopment.monthsLeft_other': 'נותרו {{count}} חודשים',
    'companyDevelopment.underConstruction': 'בבנייה',
    'companyDevelopment.completed': 'הושלם',
    'construction.finalMonth': 'החודש האחרון — הכנה לאכלוס',
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key, opts = {}) => {
      const lang = i18nState.language || 'en';
      if (opts && opts.count != null) {
        const suffix = opts.count === 1 ? 'one' : opts.count === 2 ? 'two' : 'other';
        const plural = translations[lang][`${key}_${suffix}`];
        if (plural != null) return plural.replace(/{{count}}/g, String(opts.count));
      }
      const val = translations[lang][key];
      return val != null ? val : key;
    },
    i18n: i18nState,
  }),
}));

vi.mock('../../utils/capacitor', () => ({
  getApiBaseUrl: () => 'http://localhost:5000',
}));

vi.mock('../../components/RentInfoPanel', () => ({
  default: () => null,
}));
vi.mock('../../components/PropertyImage', () => ({
  default: () => null,
}));
vi.mock('../../components/RiskDashboard', () => ({
  default: () => null,
}));
vi.mock('../../components/CompactValue', () => ({
  default: () => null,
}));

import PropertyPage from '../PropertyPage';

const PROPERTY_ID = 'p123';

function makePropertyDoc(overrides = {}) {
  return {
    _id: PROPERTY_ID,
    name: 'Test House',
    type: 'house',
    basePrice: 100000,
    currentPrice: 120000,
    forSale: false,
    condition: 100,
    qualityScore: 70,
    propertyRating: 'standard',
    maintenanceLevel: 'none',
    improvements: [],
    investmentHistory: [],
    priceHistory: [{ tick: 1, price: 100000 }],
    ...overrides,
  };
}

function renderPage(fetchMock) {
  vi.stubGlobal('fetch', fetchMock);
  return render(
    <MemoryRouter initialEntries={[`/property/${PROPERTY_ID}`]}>
      <Routes>
        <Route path="/property/:id" element={<PropertyPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function jsonResponse(body, ok = true) {
  return Promise.resolve({ ok, json: () => Promise.resolve(body) });
}

describe('PropertyPage ownership rendering (isDirectOwner regression)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    gameState.fetchSentOffers.mockResolvedValue([]);
    authState.user = { _id: 'owner1', username: 'owner', balance: 1000000 };
  });

  it('loads without crashing for a direct owner and shows the Offers section', async () => {
    const fetchMock = vi.fn((url) => {
      const u = String(url);
      if (u.includes('/properties/p123/detail')) {
        return jsonResponse({ property: makePropertyDoc({ ownerId: { _id: 'owner1', username: 'owner' } }) });
      }
      if (u.includes('/offers/property/')) return jsonResponse([]);
      if (u.includes('/management/')) return jsonResponse({ perUnitRent: 100, rent: 5000, monthlyIncrease: 100 });
      if (u.includes('/world/status')) return jsonResponse({ currentCycle: 42 });
      if (u.includes('/development/improvements/status/')) return jsonResponse({});
      return jsonResponse({});
    });
    renderPage(fetchMock);

    await waitFor(() => {
      expect(screen.queryByText(/Something went wrong/i)).not.toBeInTheDocument();
    });
    expect(await screen.findByText('propertyDetail.offersTitle')).toBeInTheDocument();
  });

  it('does not crash for a non-owner and does NOT show the Offers section', async () => {
    authState.user = { _id: 'otherUser', username: 'stranger', balance: 5000 };
    const fetchMock = vi.fn((url) => {
      const u = String(url);
      if (u.includes('/properties/p123/detail')) {
        return jsonResponse({ property: makePropertyDoc({ ownerId: { _id: 'owner1', username: 'owner' } }) });
      }
      if (u.includes('/offers/sent')) return jsonResponse([]);
      if (u.includes('/world/status')) return jsonResponse({ currentCycle: 42 });
      return jsonResponse({});
    });
    renderPage(fetchMock);

    await waitFor(() => {
      expect(screen.queryByText(/Something went wrong/i)).not.toBeInTheDocument();
    });
    expect(screen.queryByText('propertyDetail.offersTitle')).not.toBeInTheDocument();
  });

  it('does not crash for a company-owned property (owner null, companyId set)', async () => {
    const fetchMock = vi.fn((url) => {
      const u = String(url);
      if (u.includes('/properties/p123/detail')) {
        return jsonResponse({
          property: makePropertyDoc({ ownerId: null, companyId: { _id: 'c1', name: 'Test Co' } }),
        });
      }
      if (u.includes('/offers/property/')) return jsonResponse([]);
      if (u.includes('/management/')) return jsonResponse({ perUnitRent: 100, rent: 5000, monthlyIncrease: 100 });
      if (u.includes('/world/status')) return jsonResponse({ currentCycle: 42 });
      if (u.includes('/development/improvements/status/')) return jsonResponse({});
      return jsonResponse({});
    });
    renderPage(fetchMock);

    await waitFor(() => {
      expect(screen.queryByText(/Something went wrong/i)).not.toBeInTheDocument();
    });
    // Company-owned property: owner is null -> no Offers section for the viewer.
    expect(screen.queryByText('propertyDetail.offersTitle')).not.toBeInTheDocument();
  });

  it('does not crash for a bank-owned property', async () => {
    const fetchMock = vi.fn((url) => {
      const u = String(url);
      if (u.includes('/properties/p123/detail')) {
        return jsonResponse({ property: makePropertyDoc({ ownerId: null }) });
      }
      if (u.includes('/world/status')) return jsonResponse({ currentCycle: 42 });
      return jsonResponse({});
    });
    renderPage(fetchMock);

    await waitFor(() => {
      expect(screen.queryByText(/Something went wrong/i)).not.toBeInTheDocument();
    });
  });

  it('renders Monthly Increase with a unicode minus, not the literal &minus; text', async () => {
    authState.user = { _id: 'owner1', username: 'owner', balance: 1000000 };
    const fetchMock = vi.fn((url) => {
      const u = String(url);
      if (u.includes('/properties/p123/detail')) {
        return jsonResponse({ property: makePropertyDoc({ ownerId: { _id: 'owner1', username: 'owner' } }) });
      }
      if (u.includes('/offers/property/')) return jsonResponse([]);
      if (u.includes('/management/')) {
        return jsonResponse({
          perUnitRent: 100,
          rent: 5000,
          previousMonthRent: 5325,
          monthlyIncrease: -325,
          monthlyIncreasePct: -6.94,
        });
      }
      if (u.includes('/world/status')) return jsonResponse({ currentCycle: 42 });
      if (u.includes('/development/improvements/status/')) return jsonResponse({});
      return jsonResponse({});
    });
    renderPage(fetchMock);

    // The regression: the old code rendered the literal entity string in the
    // value expression. It must show the real unicode minus.
    expect((await screen.findAllByText(/\u2212\$325/)).length).toBeGreaterThan(0);
    expect(screen.queryByText('&minus;')).not.toBeInTheDocument();
    expect((await screen.findAllByText(/\u22126\.94%/)).length).toBeGreaterThan(0);
  });
});

describe('PropertyPage — Sell property confirmation', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    i18nState.language = 'en';
    gameState.fetchSentOffers.mockResolvedValue([]);
    authState.user = { _id: 'owner1', username: 'owner', balance: 1000000 };
  });

  function ownedPropertyFetchMock({ onSell }) {
    return vi.fn((url, options) => {
      const u = String(url);
      const method = options?.method || 'GET';
      if (u.includes('/properties/sell')) {
        if (method !== 'POST') return jsonResponse({}, false);
        onSell();
        return jsonResponse({ property: { currentPrice: 120000 } });
      }
      if (u.includes('/properties/p123/detail')) {
        return jsonResponse({ property: makePropertyDoc({ ownerId: { _id: 'owner1', username: 'owner' } }) });
      }
      if (u.includes('/offers/property/')) return jsonResponse([]);
      if (u.includes('/management/')) return jsonResponse({ perUnitRent: 100, rent: 5000, monthlyIncrease: 100 });
      if (u.includes('/world/status')) return jsonResponse({ currentCycle: 42 });
      if (u.includes('/development/improvements/status/')) return jsonResponse({});
      return jsonResponse({});
    });
  }

  async function clickSell() {
    const sellBtn = await screen.findByRole('button', { name: /propertyDetail\.sellProperty/ });
    fireEvent.click(sellBtn);
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
  }

  it('shows the confirmation dialog when the owner clicks Sell, without selling yet', async () => {
    const onSell = vi.fn();
    renderPage(ownedPropertyFetchMock({ onSell }));
    await clickSell();
    expect(screen.getByText('common.confirmSellMessage')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'common.confirmSellAction' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'common.cancel' })).toBeInTheDocument();
    expect(onSell).not.toHaveBeenCalled();
  });

  it('Cancel closes the dialog and the property is NOT sold (no API call)', async () => {
    const onSell = vi.fn();
    renderPage(ownedPropertyFetchMock({ onSell }));
    await clickSell();
    fireEvent.click(screen.getByRole('button', { name: 'common.cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(onSell).not.toHaveBeenCalled();
  });

  it('Escape closes the dialog and the property is NOT sold', async () => {
    const onSell = vi.fn();
    renderPage(ownedPropertyFetchMock({ onSell }));
    await clickSell();
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(onSell).not.toHaveBeenCalled();
  });

  it('Confirm sells the property via POST /properties/sell exactly once', async () => {
    const onSell = vi.fn();
    renderPage(ownedPropertyFetchMock({ onSell }));
    await clickSell();
    fireEvent.click(screen.getByRole('button', { name: 'common.confirmSellAction' }));
    await waitFor(() => expect(onSell).toHaveBeenCalledTimes(1));
  });

  it('double-clicking Confirm sells exactly once (loading guard + disabled button)', async () => {
    let resolveSell;
    const onSell = vi.fn();
    const fetchMock = vi.fn((url, options) => {
      const u = String(url);
      if (u.includes('/properties/sell')) {
        onSell();
        return new Promise((r) => (resolveSell = r));
      }
      if (u.includes('/properties/p123/detail')) {
        return jsonResponse({ property: makePropertyDoc({ ownerId: { _id: 'owner1', username: 'owner' } }) });
      }
      if (u.includes('/offers/property/')) return jsonResponse([]);
      if (u.includes('/management/')) return jsonResponse({ perUnitRent: 100, rent: 5000, monthlyIncrease: 100 });
      if (u.includes('/world/status')) return jsonResponse({ currentCycle: 42 });
      if (u.includes('/development/improvements/status/')) return jsonResponse({});
      return jsonResponse({});
    });
    renderPage(fetchMock);
    await clickSell();
    fireEvent.click(screen.getByRole('button', { name: 'common.confirmSellAction' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'common.loading' })).toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: 'common.loading' }));
    expect(onSell).toHaveBeenCalledTimes(1);
    resolveSell(jsonResponse({ property: { currentPrice: 120000 } }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('renders the confirmation dialog in RTL for Hebrew', async () => {
    i18nState.language = 'he';
    const onSell = vi.fn();
    renderPage(ownedPropertyFetchMock({ onSell }));
    await clickSell();
    expect(screen.getByRole('dialog')).toHaveAttribute('dir', 'rtl');
    expect(onSell).not.toHaveBeenCalled();
  });
});

describe('PropertyPage — authoritative rent maximum (GET == POST)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    i18nState.language = 'en';
    gameState.fetchSentOffers.mockResolvedValue([]);
    authState.user = { _id: 'owner1', username: 'owner', balance: 1000000 };
  });

  function managementFetchMock({ rentPost, managementData }) {
    return vi.fn((url, options) => {
      const u = String(url);
      const method = options?.method || 'GET';
      if (u.includes('/management/p123/rent')) {
        return rentPost
          ? rentPost(method)
          : jsonResponse({ error: 'Rent must be between 100 and 67524 per unit' }, false);
      }
      if (u.includes('/properties/p123/detail')) {
        return jsonResponse({ property: makePropertyDoc({ ownerId: { _id: 'owner1', username: 'owner' } }) });
      }
      if (u.includes('/offers/property/')) return jsonResponse([]);
      if (u.includes('/management/')) return jsonResponse(managementData);
      if (u.includes('/world/status')) return jsonResponse({ currentCycle: 42 });
      if (u.includes('/development/improvements/status/')) return jsonResponse({});
      return jsonResponse({});
    });
  }

  const fullManagementData = {
    perUnitRent: 100,
    rent: 5000,
    rentChangeAvailable: true,
    effectiveMaxPerUnit: 67524,
    maximumRentPerUnit: 75000,
  };

  it('the rent input max equals the server effectiveMaxPerUnit, not the raw value cap', async () => {
    renderPage(managementFetchMock({ managementData: fullManagementData }));

    const input = await screen.findByRole('spinbutton');
    expect(input).toHaveAttribute('max', '67524');
  });

  it('after a rejected POST the displayed maximum resyncs to the server value', async () => {
    const postCalls = [];
    const fetchMock = vi.fn((url, options) => {
      const u = String(url);
      const method = options?.method || 'GET';
      if (u.includes('/management/p123/rent') && method === 'POST') {
        postCalls.push(1);
        return jsonResponse({ error: 'Rent must be between 100 and 67524 per unit' }, false);
      }
      if (u.includes('/properties/p123/detail')) {
        return jsonResponse({ property: makePropertyDoc({ ownerId: { _id: 'owner1', username: 'owner' } }) });
      }
      if (u.includes('/offers/property/')) return jsonResponse([]);
      // First GET returns the stale high max; after the failed POST the page
      // must refetch and adopt the server's current authoritative max.
      if (u.includes('/management/')) {
        return jsonResponse(
          postCalls.length > 0 ? { ...fullManagementData, effectiveMaxPerUnit: 50000 } : fullManagementData,
        );
      }
      if (u.includes('/world/status')) return jsonResponse({ currentCycle: 42 });
      if (u.includes('/development/improvements/status/')) return jsonResponse({});
      return jsonResponse({});
    });
    renderPage(fetchMock);

    const input = await screen.findByRole('spinbutton');
    expect(input).toHaveAttribute('max', '67524');

    fireEvent.change(input, { target: { value: '67524' } });
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }));

    await waitFor(() => expect(postCalls.length).toBe(1));
    await waitFor(() => expect(input).toHaveAttribute('max', '50000'));
  });

  it('displays the server occupancy verbatim — no floor/min/rounding on the frontend', async () => {
    renderPage(
      managementFetchMock({
        managementData: { ...fullManagementData, occupancy: 100, perUnitRent: 100 },
      }),
    );

    expect(await screen.findAllByText('100%').then((els) => els.length)).toBeGreaterThan(0);
  });
});

describe('PropertyPage — construction progress section (development.left regression)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    i18nState.language = 'en';
    gameState.fetchSentOffers.mockResolvedValue([]);
    authState.user = { _id: 'owner1', username: 'owner', balance: 1000000 };
  });

  function makeDevReq(overrides = {}) {
    return {
      _id: 'dr1',
      status: 'executed',
      actionType: 'construction',
      actionData: { projectType: 'apartment_building' },
      requestedBy: { _id: 'owner1', username: 'owner' },
      votes: [],
      estimatedCost: 500000,
      estimatedValueIncrease: 100000,
      propertyId: { _id: PROPERTY_ID },
      constructionProjectId: {
        _id: 'cp1',
        status: 'under_construction',
        progress: 75,
        completionPeriod: 50,
        startPeriod: 30,
      },
      ...overrides,
    };
  }

  function companyOwnedFetchMock(devRequests, { currentCycle = 46 } = {}) {
    companyState.fetchDevelopmentRequests.mockResolvedValue(devRequests);
    return vi.fn((url) => {
      const u = String(url);
      if (u.includes('/properties/p123/detail')) {
        return jsonResponse({
          property: makePropertyDoc({ ownerId: null, companyId: { _id: 'c1', name: 'Test Co' } }),
        });
      }
      if (u.includes('/offers/property/')) return jsonResponse([]);
      if (u.includes('/management/')) return jsonResponse({ perUnitRent: 100, rent: 5000, monthlyIncrease: 100 });
      if (u.includes('/world/status')) return jsonResponse({ currentCycle });
      if (u.includes('/development/improvements/status/')) return jsonResponse({});
      return jsonResponse({});
    });
  }

  it('English: shows "Construction Progress: 75% · 4 months left" with no literal key', async () => {
    renderPage(companyOwnedFetchMock([makeDevReq()]));

    expect(await screen.findByText(/Construction Progress: 75%/)).toBeInTheDocument();
    expect(screen.getByText('4 months left')).toBeInTheDocument();
    expect(screen.getByText('·')).toBeInTheDocument();
    expect(screen.queryByText(/development\.left/)).not.toBeInTheDocument();

    // The whole progress row must read as "<progress>% · <countdown>" — the `·`
    // separator guarantees the two values are not concatenated without spacing.
    const row = screen.getByText('·').closest('div');
    expect(row.textContent).toMatch(/75%\s*·\s*4 months left/);
    expect(row.textContent).not.toMatch(/75%4 months/);
  });

  it('Hebrew: renders "התקדמות בנייה: 75% · נותרו 4 חודשים" in RTL text', async () => {
    i18nState.language = 'he';
    renderPage(companyOwnedFetchMock([makeDevReq()]));

    expect(await screen.findByText(/התקדמות בנייה: 75%/)).toBeInTheDocument();
    expect(screen.getByText('נותרו 4 חודשים')).toBeInTheDocument();
    expect(screen.getByText('·')).toBeInTheDocument();
    expect(screen.queryByText(/development\.left/)).not.toBeInTheDocument();
  });

  it('progress 0% renders "Construction Progress: 0%" and a plural countdown', async () => {
    renderPage(
      companyOwnedFetchMock(
        [makeDevReq({ constructionProjectId: { ...makeDevReq().constructionProjectId, progress: 0 } })],
        {
          currentCycle: 42,
        },
      ),
    );

    expect(await screen.findByText(/Construction Progress: 0%/)).toBeInTheDocument();
    expect(screen.getByText('8 months left')).toBeInTheDocument();
  });

  it('progress 100% and remaining = 0 shows the localized Final Month message', async () => {
    renderPage(
      companyOwnedFetchMock(
        [
          makeDevReq({
            constructionProjectId: {
              ...makeDevReq().constructionProjectId,
              progress: 100,
              completionPeriod: 60,
              currentPeriod: 60,
              status: 'completed',
            },
          }),
        ],
        { currentCycle: 60 },
      ),
    );

    expect(await screen.findByText(/Construction Progress: 100%/)).toBeInTheDocument();
    expect(screen.getByText('Final Month — Preparing for Occupancy')).toBeInTheDocument();
  });

  it('a property with no development requests shows no broken translation key', async () => {
    renderPage(companyOwnedFetchMock([]));

    await waitFor(() => expect(screen.queryByText(/Construction Progress/)).not.toBeInTheDocument());
    expect(screen.queryByText(/development\.left/)).not.toBeInTheDocument();
    expect(screen.queryByText(/monthsLeft/)).not.toBeInTheDocument();
  });

  it('switching language updates the countdown on the mounted page without a reload', async () => {
    const { rerender } = renderPage(companyOwnedFetchMock([makeDevReq()]));

    expect(await screen.findByText('4 months left')).toBeInTheDocument();

    i18nState.language = 'he';
    rerender(
      <MemoryRouter initialEntries={[`/property/${PROPERTY_ID}`]}>
        <Routes>
          <Route path="/property/:id" element={<PropertyPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('נותרו 4 חודשים')).toBeInTheDocument();
    expect(screen.queryByText('4 months left')).not.toBeInTheDocument();
    expect(screen.queryByText(/development\.left/)).not.toBeInTheDocument();
  });
});
