import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import '@testing-library/jest-dom/vitest';

const authState = vi.hoisted(() => ({
  user: { _id: 'user1', username: 'me', role: 'user' },
}));

const i18nState = vi.hoisted(() => ({ language: 'en' }));

const storeSync = vi.hoisted(() => ({ listeners: new Set() }));

const companyState = vi.hoisted(() => ({
  selectedCompany: null,
  companyProperties: [],
  companyPropertiesPage: 1,
  companyPropertiesTotalPages: 1,
  companyLoans: [],
  companyAuditLogs: [],
  companyAuditTotal: 0,
  companyAuditPage: 1,
  companyAuditTotalPages: 1,
  companyStats: null,
  loading: false,
  companyMissions: null,
  fetchCompany: vi.fn().mockResolvedValue(),
  fetchCompanyStats: vi.fn().mockResolvedValue(),
  fetchCompanyAudit: vi.fn().mockResolvedValue(),
  depositTreasury: vi.fn(),
  withdrawTreasury: vi.fn(),
  inviteMember: vi.fn(),
  removeMember: vi.fn(),
  changeRole: vi.fn(),
  leaveCompany: vi.fn().mockResolvedValue(),
  repayCompanyLoan: vi.fn(),
  sellCompanyProperty: vi.fn().mockResolvedValue(),
  clearSelectedCompany: vi.fn(),
  applyToCompany: vi.fn(),
  fetchApplications: vi.fn().mockResolvedValue([]),
  approveApplication: vi.fn(),
  rejectApplication: vi.fn(),
  cancelApplication: vi.fn(),
  createLoanRequest: vi.fn(),
  fetchLoanRequests: vi.fn().mockResolvedValue([]),
  voteLoanRequest: vi.fn(),
  executeLoanRequest: vi.fn(),
  takeDirectLoan: vi.fn(),
  initiateIPO: vi.fn(),
  createPropertyPurchaseRequest: vi.fn(),
  fetchPropertyPurchaseRequests: vi.fn().mockResolvedValue([]),
  votePropertyPurchaseRequest: vi.fn(),
  fetchAuctionProposals: vi.fn().mockResolvedValue([]),
  voteAuctionProposal: vi.fn().mockResolvedValue(),
  fetchContracts: vi.fn().mockResolvedValue([]),
  acceptContract: vi.fn(),
  proposeContract: vi.fn(),
  voteContractProposal: vi.fn(),
  fetchContractHistory: vi.fn().mockResolvedValue([]),
  fetchInvestmentProducts: vi.fn().mockResolvedValue([]),
  fetchInvestments: vi.fn().mockResolvedValue([]),
  fetchInvestmentPerformance: vi.fn().mockResolvedValue(null),
  createInvestment: vi.fn(),
  voteInvestmentProposal: vi.fn(),
  cancelInvestmentProposal: vi.fn(),
  fetchCompanyLoans: vi.fn().mockResolvedValue([]),
  fetchCompanyLoanOptions: vi.fn().mockResolvedValue([]),
  fetchCompanyProperties: vi.fn().mockResolvedValue([]),
  fetchCompanyMissions: vi.fn(),
  claimCompanyMissionReward: vi.fn(),
}));

vi.mock('../../store/useAuthStore', () => ({
  useAuthStore: (selector) => selector(authState),
}));

vi.mock('../../store/useCompanyStore', async () => {
  const { useEffect, useReducer } = await import('react');
  return {
    useCompanyStore: () => {
      const [, force] = useReducer((c) => c + 1, 0);
      useEffect(() => {
        storeSync.listeners.add(force);
        return () => {
          storeSync.listeners.delete(force);
        };
      }, [force]);
      return companyState;
    },
  };
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key) => key, i18n: i18nState }),
}));

vi.mock('../../components/PropertyImage', () => ({
  default: () => null,
}));

import CompanyDetailPage from '../CompanyDetailPage';

function makeMission(overrides = {}) {
  return {
    _id: 'cm1',
    missionId: 'milestone_five_properties',
    status: 'active',
    progress: 2,
    target: 5,
    percentage: 40,
    contributors: [],
    definition: {
      id: 'milestone_five_properties',
      name: 'Property Portfolio',
      description: 'Own 5 properties',
      type: 'milestone',
      icon: '🏢',
      rewards: { xp: 500, treasury: 250000, reputation: 5 },
    },
    ...overrides,
  };
}

function makeDashboard(overrides = {}) {
  return {
    active: [makeMission()],
    completed: [],
    claimed: [],
    stats: {
      totalActive: 1,
      totalCompleted: 0,
      totalClaimed: 0,
      totalXP: 0,
      totalTreasury: 0,
      totalReputation: 0,
    },
    ...overrides,
  };
}

function renderPage(initialUrl = '/real-estate-companies/c1?tab=missions') {
  return render(
    <MemoryRouter initialEntries={[initialUrl]}>
      <Routes>
        <Route path="/real-estate-companies/:id" element={<CompanyDetailPage />} />
        <Route path="/real-estate-companies" element={<div>company-list</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function setStore(patch) {
  Object.assign(companyState, patch);
  storeSync.listeners.forEach((fn) => fn());
}

function resolveMissions(dashboard) {
  companyState.fetchCompanyMissions.mockImplementation(async () => {
    setStore({ companyMissions: dashboard });
    return dashboard;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  companyState.selectedCompany = {
    _id: 'c1',
    name: 'Test Co',
    level: 3,
    xp: 0,
    xpToNextLevel: 500,
    reputation: 10,
    maxMembers: 20,
    members: [{ userId: 'user1', username: 'me', role: 'member' }],
    isMember: true,
    memberRole: 'member',
    founderId: null,
    treasury: { balance: 0 },
    stats: {},
    employees: { count: 0, totalPayroll: 0 },
    hqCityId: null,
    applications: [],
    loans: [],
    ipo: null,
  };
  companyState.companyProperties = [];
  companyState.companyStats = null;
  companyState.companyMissions = null;
  companyState.loading = false;
  authState.user = { _id: 'user1', username: 'me', role: 'user' };
  i18nState.language = 'en';
  storeSync.listeners.clear();
  resolveMissions(makeDashboard());
  companyState.claimCompanyMissionReward.mockResolvedValue({ success: true });
});

describe('CompanyDetailPage — Company Missions tab', () => {
  it('renders missions from companyMissions without crashing (regression: ReferenceError)', async () => {
    resolveMissions(makeDashboard());

    renderPage();

    expect(await screen.findByText('Property Portfolio')).toBeInTheDocument();
    expect(screen.getByText('Own 5 properties')).toBeInTheDocument();
    expect(screen.getByText('2 / 5')).toBeInTheDocument();
    expect(screen.getByText('40%')).toBeInTheDocument();
    expect(screen.getByText('+500 XP')).toBeInTheDocument();
    expect(screen.getByText('+$250,000')).toBeInTheDocument();
    expect(companyState.fetchCompanyMissions).toHaveBeenCalledWith('c1');
  });

  it('shows a loading state while companyMissions is null (not the empty state)', () => {
    companyState.fetchCompanyMissions.mockImplementation(() => new Promise(() => {}));

    renderPage();

    expect(screen.getByText('common.loading')).toBeInTheDocument();
    expect(screen.queryByText('companies.noMissions')).not.toBeInTheDocument();
  });

  it('shows the empty state when the company has zero missions in every list', async () => {
    resolveMissions(makeDashboard({ active: [], completed: [], claimed: [] }));

    renderPage();

    expect(await screen.findByText('companies.noMissions')).toBeInTheDocument();
  });

  it('shows an error state with retry when the missions fetch fails', async () => {
    companyState.fetchCompanyMissions.mockRejectedValueOnce(new Error('boom'));

    renderPage();

    expect(await screen.findByText('common.error')).toBeInTheDocument();
    const retry = screen.getByRole('button', { name: 'common.retry' });
    expect(retry).toBeInTheDocument();

    resolveMissions(makeDashboard());
    fireEvent.click(retry);
    expect(await screen.findByText('Property Portfolio')).toBeInTheDocument();
    expect(companyState.fetchCompanyMissions).toHaveBeenCalledTimes(2);
  });

  it('translates the mission type badge', async () => {
    resolveMissions(
      makeDashboard({
        active: [
          makeMission({
            _id: 'cm-daily',
            missionId: 'daily_collect_rent',
            definition: {
              id: 'daily_collect_rent',
              name: 'Rent Collector',
              description: 'Collect rent today',
              type: 'daily',
              icon: '💰',
              rewards: { xp: 100, treasury: 10000, reputation: 0 },
            },
          }),
        ],
      }),
    );

    renderPage();

    expect(await screen.findByText('companies.missionTypeDaily')).toBeInTheDocument();
    expect(screen.queryByText('daily')).not.toBeInTheDocument();
  });

  it('renders contributor usernames from populated objects and string fallbacks', async () => {
    resolveMissions(
      makeDashboard({
        active: [
          makeMission({
            contributors: [
              { userId: { _id: 'u1', username: 'alice' }, contribution: 2 },
              { userId: '6a8dcad45c35b61275e99747', contribution: 1 },
            ],
          }),
        ],
      }),
    );

    renderPage();

    expect(await screen.findByText('alice')).toBeInTheDocument();
    expect(screen.getByText('companies.missionContributors:')).toBeInTheDocument();
    expect(screen.getByText('6a8dcad4…')).toBeInTheDocument();
  });

  it('claims a completed mission reward exactly once per click and guards double-clicks', async () => {
    let resolveClaim;
    companyState.claimCompanyMissionReward.mockImplementation(() => new Promise((r) => (resolveClaim = r)));
    resolveMissions(
      makeDashboard({
        active: [],
        completed: [makeMission({ _id: 'cm-done', status: 'completed', percentage: 100 })],
        stats: {
          totalActive: 0,
          totalCompleted: 1,
          totalClaimed: 0,
          totalXP: 0,
          totalTreasury: 0,
          totalReputation: 0,
        },
      }),
    );

    renderPage();

    const claimButton = await screen.findByRole('button', {
      name: 'companies.missionClaimReward',
    });
    expect(claimButton).toBeEnabled();

    fireEvent.click(claimButton);
    await waitFor(() => expect(claimButton).toBeDisabled());
    expect(screen.getByRole('button', { name: 'common.loading' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'common.loading' }));
    expect(companyState.claimCompanyMissionReward).toHaveBeenCalledTimes(1);
    expect(companyState.claimCompanyMissionReward).toHaveBeenCalledWith('c1', 'milestone_five_properties');

    resolveClaim({ success: true, rewards: { xp: 500, treasury: 250000, reputation: 5 } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'companies.missionClaimReward' })).toBeEnabled());
  });
});
