import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key) => key, i18n: { language: 'en' } }),
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
});
