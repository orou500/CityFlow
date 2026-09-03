import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const language = vi.hoisted(() => ({ value: 'en' }));

vi.mock('../../i18n', () => ({
  default: {
    get language() {
      return language.value;
    },
  },
}));

const storeActions = vi.hoisted(() => ({
  loading: null,
  adminOverview: { totalUsers: 1, totalProperties: 1, totalBalance: 100 },
  adminUsers: [],
  adminUsersTotal: 0,
  adminUsersPage: 1,
  adminUsersTotalPages: 1,
  adminDeletedUsers: [],
  adminUserDetail: null,
  adminUserActivity: { logs: [], total: 0, page: 1, totalPages: 0, categories: [] },
  adminProperties: [],
  adminEvents: [],
  adminCompanies: [],
  cities: [],
  fetchAdminOverview: vi.fn().mockResolvedValue({}),
  fetchAdminTicks: vi.fn().mockResolvedValue({ ticks: [] }),
  runTicks: vi.fn(),
  fetchAdminUsers: vi.fn().mockResolvedValue({ users: [], total: 0, page: 1, totalPages: 1 }),
  fetchAdminDeletedUsers: vi.fn().mockResolvedValue({ users: [] }),
  fetchAdminUserDetail: vi.fn().mockResolvedValue({}),
  fetchAdminUserActivity: vi.fn().mockResolvedValue({ logs: [], total: 0, page: 1, totalPages: 0, categories: [] }),
  clearAdminUserDetail: vi.fn(),
  setUserBalance: vi.fn(),
  toggleUserBan: vi.fn(),
  setUserRole: vi.fn(),
  setUserLevel: vi.fn(),
  setUserCreatedAt: vi.fn(),
  restoreUser: vi.fn(),
  permanentDeleteUser: vi.fn(),
  fetchAdminProperties: vi.fn().mockResolvedValue({ properties: [], total: 0, page: 1, totalPages: 1 }),
  createProperty: vi.fn(),
  updateProperty: vi.fn(),
  deleteProperty: vi.fn(),
  fetchAdminEvents: vi.fn().mockResolvedValue({ events: [] }),
  createEvent: vi.fn(),
  toggleEvent: vi.fn(),
  updateCity: vi.fn(),
  fetchCities: vi.fn().mockResolvedValue([]),
  fetchAdminSeasons: vi.fn().mockResolvedValue([]),
  fetchAdminCurrentSeason: vi.fn().mockResolvedValue(null),
  fetchAdminSeasonPreview: vi.fn().mockResolvedValue(null),
  endCurrentSeason: vi.fn(),
  createSeason: vi.fn(),
  fetchAdminMaintenance: vi.fn().mockResolvedValue({}),
  enableMaintenance: vi.fn(),
  disableMaintenance: vi.fn(),
  fetchMaintenance: vi.fn().mockResolvedValue({}),
  fetchAdminBackups: vi.fn().mockResolvedValue([]),
  fetchBackupLogs: vi.fn().mockResolvedValue({}),
  createBackup: vi.fn(),
  restoreBackup: vi.fn(),
  deleteBackup: vi.fn(),
  uploadBackupFile: vi.fn(),
  fetchAdminCompanies: vi.fn().mockResolvedValue({ companies: [] }),
  fetchAdminCompany: vi.fn(),
  updateAdminCompany: vi.fn(),
  deleteAdminCompany: vi.fn(),
  updateAdminCompanyMemberRole: vi.fn(),
  removeAdminCompanyMember: vi.fn(),
}));

vi.mock('../../store/useGameStore', () => ({
  useGameStore: () => storeActions,
}));

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key, opts) => (opts ? `${key}:${JSON.stringify(opts)}` : key) }),
}));

vi.mock('../../components/PropertyImage', () => ({ default: () => <div /> }));
vi.mock('../../hooks/useSocket', () => ({ useSocket: () => null }));

import AdminPage from '../../pages/AdminPage';

describe('AdminPage responsive layout', () => {
  beforeEach(() => {
    language.value = 'en';
  });

  it('renders the responsive root container (min-w-0) that does not overflow', async () => {
    render(<AdminPage />);
    expect(await screen.findByText('admin.title')).toBeInTheDocument();

    const root = document.body.querySelector('.h-full.min-w-0');
    expect(root).toBeTruthy();
    expect(root.className).toContain('overflow-y-auto');
  });

  it('renders each Admin section via tab navigation', async () => {
    render(<AdminPage />);
    await screen.findByText('admin.title');

    for (const tabLabel of [
      'admin.overview',
      'admin.periodsTab',
      'admin.users',
      'admin.properties',
      'admin.cities',
      'admin.companies',
    ]) {
      const tab = await screen.findByText(tabLabel);
      fireEvent.click(tab);
      expect(tab).toBeTruthy();
    }
  });

  it('opens the city edit modal with a viewport-fitting panel (max-h + scrollable)', async () => {
    storeActions.cities = [
      {
        _id: 'c1',
        name: 'Test City',
        population: 1000,
        demandIndex: 5,
        supplyIndex: 3,
        avgPrice: 50000,
        avgRent: 500,
        growthRate: 2,
        economicCondition: 'stable',
      },
    ];
    render(<AdminPage />);
    await screen.findByText('admin.title');

    fireEvent.click(await screen.findByText('admin.cities'));
    fireEvent.click(await screen.findByText('admin.edit'));

    const dialog = await screen.findByRole('dialog');
    expect(dialog.className).toContain('max-h-[90vh]');
    expect(dialog.className).toContain('overflow-y-auto');
  });

  it('sets dir="rtl" on the admin root when Hebrew is active', async () => {
    language.value = 'he';
    render(<AdminPage />);
    await screen.findByText('admin.title');
    const root = document.body.querySelector('.h-full.min-w-0');
    expect(root).toHaveAttribute('dir', 'rtl');
  });
});
