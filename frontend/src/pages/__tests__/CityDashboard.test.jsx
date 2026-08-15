import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import '@testing-library/jest-dom/vitest';

const authState = vi.hoisted(() => ({
  user: { _id: 'owner1', username: 'owner' },
  fetchMe: vi.fn(),
}));

const i18nState = vi.hoisted(() => ({ language: 'en' }));

const gameState = vi.hoisted(() => ({
  selectedCity: null,
  cityProperties: [],
  cityEvents: [],
  cityDemographics: null,
  loading: false,
  fetchCity: vi.fn().mockResolvedValue(),
  buyProperty: vi.fn(),
  sellProperty: vi.fn().mockResolvedValue(),
}));

vi.mock('../../store/useAuthStore', () => ({
  useAuthStore: () => authState,
}));

vi.mock('../../store/useGameStore', () => ({
  useGameStore: () => gameState,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key) => key, i18n: i18nState }),
}));

vi.mock('../../utils/capacitor', () => ({
  getApiBaseUrl: () => 'http://localhost:5000',
}));

vi.mock('../../components/PropertyImage', () => ({
  default: () => null,
}));

import CityDashboard from '../CityDashboard';

function makeCity(overrides = {}) {
  return {
    _id: 'city1',
    name: 'Tel Aviv',
    country: 'Israel',
    population: 460000,
    demandIndex: 1.2,
    supplyIndex: 0.9,
    growthRate: 0.03,
    avgRent: 5000,
    avgPrice: 500000,
    ...overrides,
  };
}

function makeProp(overrides = {}) {
  return {
    _id: 'p1',
    name: 'Seaside Flat',
    type: 'house',
    currentPrice: 600000,
    rent: 8000,
    forSale: false,
    ownerId: { _id: 'owner1', username: 'owner' },
    ...overrides,
  };
}

function jsonResponse(body, ok = true) {
  return Promise.resolve({ ok, json: () => Promise.resolve(body) });
}

function renderPage() {
  vi.stubGlobal(
    'fetch',
    vi.fn((url) => {
      const u = String(url);
      if (u.includes('/cities/')) return jsonResponse([]);
      if (u.includes('/districts/city/')) return jsonResponse([]);
      return jsonResponse({});
    }),
  );
  return render(
    <MemoryRouter initialEntries={['/city/city1']}>
      <Routes>
        <Route path="/city/:id" element={<CityDashboard />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  gameState.selectedCity = makeCity();
  gameState.cityProperties = [makeProp()];
  gameState.cityEvents = [];
  gameState.cityDemographics = null;
  gameState.loading = false;
  authState.user = { _id: 'owner1', username: 'owner' };
  i18nState.language = 'en';
});

describe('CityDashboard — Sell property confirmation', () => {
  it('shows the confirmation dialog when an owner clicks Sell, without selling yet', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'city.sell' }));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    expect(screen.getByText('common.confirmSellMessage')).toBeInTheDocument();
    expect(gameState.sellProperty).not.toHaveBeenCalled();
  });

  it('Cancel closes the dialog and the property is NOT sold', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'city.sell' }));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'common.cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(gameState.sellProperty).not.toHaveBeenCalled();
  });

  it('Confirm sells the property exactly once with its id', async () => {
    gameState.sellProperty.mockResolvedValueOnce({});
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'city.sell' }));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'common.confirmSellAction' }));
    await waitFor(() => expect(gameState.sellProperty).toHaveBeenCalledTimes(1));
    expect(gameState.sellProperty).toHaveBeenCalledWith('p1');
  });

  it('double-clicking Confirm sells exactly once (loading guard + disabled button)', async () => {
    let resolveSell;
    gameState.sellProperty.mockImplementation(() => new Promise((r) => (resolveSell = r)));
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'city.sell' }));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'common.confirmSellAction' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'common.loading' })).toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: 'common.loading' }));
    expect(gameState.sellProperty).toHaveBeenCalledTimes(1);
    resolveSell();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('renders the confirmation dialog in RTL for Hebrew', async () => {
    i18nState.language = 'he';
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'city.sell' }));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    expect(screen.getByRole('dialog')).toHaveAttribute('dir', 'rtl');
    expect(gameState.sellProperty).not.toHaveBeenCalled();
  });
});
