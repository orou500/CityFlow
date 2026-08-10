import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const storeActions = vi.hoisted(() => ({
  adminOverview: null,
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
  useTranslation: () => ({ t: (key, opts) => (opts ? `${key}:${JSON.stringify(opts)}` : key) }),
}));

vi.mock('../../components/PropertyImage', () => ({ default: () => <div /> }));
vi.mock('../../hooks/useSocket', () => ({ useSocket: () => null }));

import AdminPage from '../../pages/AdminPage';

describe('AdminPage users tab', () => {
  beforeEach(() => {
    storeActions.adminUsers = [];
    storeActions.adminDeletedUsers = [];
  });

  it('renders the users tab without crashing', async () => {
    render(<AdminPage />);
    const tab = await screen.findByText('admin.users');
    fireEvent.click(tab);
    expect((await screen.findAllByText(/admin.totalUsers/)).length).toBeGreaterThan(0);
  });

  it('renders users with deleted users present', async () => {
    storeActions.adminUsers = [{ _id: 'u1', username: 'alice', email: 'a@t.com', role: 'user' }];
    storeActions.adminDeletedUsers = [
      { _id: 'u2', username: 'gone', email: 'g@t.com', deletedAt: new Date().toISOString() },
    ];
    render(<AdminPage />);
    const tab = await screen.findByText('admin.users');
    fireEvent.click(tab);
    expect(await screen.findByText('alice')).toBeInTheDocument();
  });

  it('renders with realistic full user documents', async () => {
    storeActions.adminUsers = [
      {
        _id: 'u1',
        username: 'real_user',
        normalizedUsername: 'real_user',
        email: 'real@t.com',
        role: 'user',
        balance: 123456,
        ownedProperties: [],
        banned: false,
        preferredLanguage: 'en',
        theme: 'dark',
        onboarding: { completed: true, completedAt: new Date().toISOString() },
        avatar: '',
        bio: '',
        displayName: '',
        lastLoginAt: new Date().toISOString(),
        lastDailyLogin: new Date().toISOString(),
        achievements: ['first_property'],
        profileVisibility: { portfolio: true, activity: true },
        friends: [],
        acceptedTerms: true,
        acceptedTermsAt: new Date().toISOString(),
        acceptedPrivacy: true,
        acceptedPrivacyAt: new Date().toISOString(),
        deletedAt: null,
        emailVerified: true,
        emailVerifiedAt: new Date().toISOString(),
        creditScore: 650,
        companyId: null,
        creditScoreUpdatedTick: 0,
        lastPeriodBonusClaim: null,
        uncollectedRent: 0,
        rentStorageStartedAt: null,
        lastRentCollectedAt: null,
        lastUpgradeAt: null,
        pushNotificationsEnabled: true,
        level: 12,
        xp: 500,
        xpToNextLevel: 1000,
        title: '',
        titles: [],
        prestigeLevel: 0,
        achievementPoints: 120,
        lifetimeStats: {
          totalTransactions: 50,
          totalPropertiesOwned: 5,
          totalMoneyEarned: 1000000,
          totalMoneySpent: 800000,
          totalLoansTaken: 1,
          totalFriendsAdded: 2,
          totalUpgrades: 3,
          totalConstructionStarted: 1,
          totalSeasonsCompleted: 1,
          totalRentCollected: 10,
          stockProfit: 5000,
        },
        supporter: { badge: 'none', title: '', isAnonymous: false },
        donationStats: { totalDonated: 0, donorSince: null, donationCount: 0 },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        propertyCount: 5,
      },
    ];
    storeActions.adminDeletedUsers = [];
    render(<AdminPage />);
    const tab = await screen.findByText('admin.users');
    fireEvent.click(tab);
    expect(await screen.findByText('real_user')).toBeInTheDocument();

    // open the user detail modal
    fireEvent.click(screen.getByText('admin.viewLogs'));
    expect(await screen.findByText('admin.allCategories')).toBeInTheDocument();
  });
});
