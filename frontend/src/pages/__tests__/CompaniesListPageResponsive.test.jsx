import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom/vitest';

const companyStore = vi.hoisted(() => ({
  companies: [],
  companiesTotal: 0,
  companiesPage: 1,
  companiesTotalPages: 1,
  myCompanies: [],
  invitations: [],
  loading: false,
  error: null,
  fetchCompanies: vi.fn().mockResolvedValue({}),
  fetchMyCompanies: vi.fn().mockResolvedValue({}),
  fetchInvitations: vi.fn().mockResolvedValue({}),
  createCompany: vi.fn(),
  acceptInvitation: vi.fn(),
  declineInvitation: vi.fn(),
}));

const authState = vi.hoisted(() => ({
  user: { _id: 'u1', username: 'me', balance: 5000000, level: 12, createdAt: new Date().toISOString() },
}));

const gameState = vi.hoisted(() => ({
  userData: null,
  cities: [],
  fetchUserData: vi.fn().mockResolvedValue({}),
  fetchCities: vi.fn().mockResolvedValue({}),
}));

vi.mock('../../store/useCompanyStore', () => ({
  useCompanyStore: () => companyStore,
}));

vi.mock('../../store/useAuthStore', () => ({
  useAuthStore: (selector) => selector(authState),
}));

vi.mock('../../store/useGameStore', () => ({
  useGameStore: (selector) => (selector ? selector(gameState) : gameState),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key) => key }),
}));

import CompaniesListPage from '../CompaniesListPage';

describe('CompaniesListPage responsive layout', () => {
  function renderPage() {
    return render(
      <MemoryRouter>
        <CompaniesListPage />
      </MemoryRouter>,
    );
  }

  it('page root has no overflow-hidden (content must never be silently clipped)', async () => {
    renderPage();
    const root = document.body.querySelector('.max-w-6xl.mx-auto');
    expect(root).toBeTruthy();
    expect(root.className).not.toContain('overflow-hidden');
  });

  it('company card stats row wraps on narrow screens', async () => {
    companyStore.companies = [
      {
        _id: 'c1',
        name: 'Test Company',
        description: 'A description',
        reputation: 12345,
        level: 3,
        members: [{ _id: 'm1' }],
        maxMembers: 10,
        stats: { netWorth: 5000000, propertiesOwned: 2 },
      },
    ];
    renderPage();

    const name = await screen.findByText('Test Company');
    const card = name.closest('a');
    expect(card).toBeTruthy();
    const statsRow = card.querySelector('.mt-3');
    expect(statsRow.className).toContain('flex-wrap');
  });
});
