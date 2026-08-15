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

vi.mock('../../store/useCompanyStore', () => ({
  useCompanyStore: () => ({
    myCompanies: [],
    fetchMyCompanies: vi.fn().mockResolvedValue([]),
    createPropertyPurchaseRequest: vi.fn(),
    createDevelopmentRequest: vi.fn(),
    fetchDevelopmentRequests: vi.fn().mockResolvedValue([]),
    voteDevelopmentRequest: vi.fn(),
  }),
}));

const i18nState = vi.hoisted(() => ({ language: 'en' }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key) => key, i18n: i18nState }),
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
