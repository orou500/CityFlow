import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import '@testing-library/jest-dom/vitest';

const authState = vi.hoisted(() => ({
  user: { _id: 'user1', username: 'me', role: 'user' },
}));

const i18nState = vi.hoisted(() => ({ language: 'en' }));

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
}));

vi.mock('../../store/useAuthStore', () => ({
  useAuthStore: (selector) => selector(authState),
}));

vi.mock('../../store/useCompanyStore', () => ({
  useCompanyStore: () => companyState,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key) => key, i18n: i18nState }),
}));

vi.mock('../../components/PropertyImage', () => ({
  default: () => null,
}));

import CompanyDetailPage from '../CompanyDetailPage';

function makeCompany(overrides = {}) {
  return {
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
    ...overrides,
  };
}

function makeCompanyProperty(overrides = {}) {
  return {
    _id: 'prop1',
    name: 'HQ Tower',
    type: 'commercial',
    currentPrice: 500000,
    rent: 5000,
    occupancy: 92,
    cityId: { name: 'Tel Aviv' },
    developmentLevel: 0,
    ...overrides,
  };
}

function renderPage(initialUrl = '/real-estate-companies/c1') {
  return render(
    <MemoryRouter initialEntries={[initialUrl]}>
      <Routes>
        <Route path="/real-estate-companies/:id" element={<CompanyDetailPage />} />
        <Route path="/real-estate-companies" element={<div>company-list</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

async function openLeaveDialog() {
  fireEvent.click(screen.getByRole('button', { name: 'companies.leaveCompany' }));
  return waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
}

beforeEach(() => {
  vi.clearAllMocks();
  companyState.selectedCompany = makeCompany();
  companyState.companyProperties = [];
  companyState.companyLoans = [];
  companyState.companyStats = null;
  companyState.companyAuditLogs = [];
  companyState.loading = false;
  authState.user = { _id: 'user1', username: 'me', role: 'user' };
  i18nState.language = 'en';
});

describe('CompanyDetailPage — Leave Company confirmation', () => {
  it('opens the confirmation dialog when the header Leave button is clicked (no API call yet)', async () => {
    renderPage();
    await openLeaveDialog();
    expect(screen.getByText('common.confirmLeaveMessage')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'common.confirmLeaveAction' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'common.cancel' })).toBeInTheDocument();
    expect(companyState.leaveCompany).not.toHaveBeenCalled();
  });

  it('Cancel closes the dialog, the player stays in the company and the API is NOT called', async () => {
    renderPage();
    await openLeaveDialog();
    fireEvent.click(screen.getByRole('button', { name: 'common.cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(companyState.leaveCompany).not.toHaveBeenCalled();
  });

  it('Escape closes the dialog and the API is NOT called', async () => {
    renderPage();
    await openLeaveDialog();
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(companyState.leaveCompany).not.toHaveBeenCalled();
  });

  it('Confirm calls leaveCompany exactly once', async () => {
    companyState.leaveCompany.mockResolvedValueOnce(undefined);
    renderPage();
    await openLeaveDialog();
    fireEvent.click(screen.getByRole('button', { name: 'common.confirmLeaveAction' }));
    await waitFor(() => expect(companyState.leaveCompany).toHaveBeenCalledTimes(1));
    expect(companyState.leaveCompany).toHaveBeenCalledWith('c1');
  });

  it('double-clicking Confirm calls leaveCompany exactly once (loading guard + disabled button)', async () => {
    let resolveLeave;
    companyState.leaveCompany.mockImplementation(() => new Promise((r) => (resolveLeave = r)));
    renderPage();
    await openLeaveDialog();
    fireEvent.click(screen.getByRole('button', { name: 'common.confirmLeaveAction' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'common.loading' })).toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: 'common.loading' }));
    expect(companyState.leaveCompany).toHaveBeenCalledTimes(1);
    resolveLeave();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('the members-tab Leave section button opens the same confirmation dialog', async () => {
    renderPage('/real-estate-companies/c1?tab=members');
    const leaveButtons = screen.getAllByRole('button', { name: 'companies.leaveCompany' });
    fireEvent.click(leaveButtons[leaveButtons.length - 1]);
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    expect(screen.getByText('common.confirmLeaveMessage')).toBeInTheDocument();
    expect(companyState.leaveCompany).not.toHaveBeenCalled();
  });

  it('renders the dialog in RTL for Hebrew', async () => {
    i18nState.language = 'he';
    renderPage();
    await openLeaveDialog();
    expect(screen.getByRole('dialog')).toHaveAttribute('dir', 'rtl');
  });
});

describe('CompanyDetailPage — Sell company property confirmation', () => {
  beforeEach(() => {
    companyState.selectedCompany = makeCompany({ memberRole: 'director' });
    companyState.companyProperties = [makeCompanyProperty()];
  });

  it('opens the confirmation dialog when Sell is clicked (no API call yet)', async () => {
    renderPage('/real-estate-companies/c1?tab=properties');
    fireEvent.click(screen.getByRole('button', { name: 'companies.sellProperty' }));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    expect(screen.getByText('common.confirmSellMessage')).toBeInTheDocument();
    expect(companyState.sellCompanyProperty).not.toHaveBeenCalled();
  });

  it('Cancel closes the dialog and the API is NOT called', async () => {
    renderPage('/real-estate-companies/c1?tab=properties');
    fireEvent.click(screen.getByRole('button', { name: 'companies.sellProperty' }));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'common.cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(companyState.sellCompanyProperty).not.toHaveBeenCalled();
  });

  it('Confirm calls sellCompanyProperty exactly once with (companyId, propertyId)', async () => {
    renderPage('/real-estate-companies/c1?tab=properties');
    fireEvent.click(screen.getByRole('button', { name: 'companies.sellProperty' }));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'common.confirmSellAction' }));
    await waitFor(() => expect(companyState.sellCompanyProperty).toHaveBeenCalledTimes(1));
    expect(companyState.sellCompanyProperty).toHaveBeenCalledWith('c1', 'prop1');
  });

  it('double-clicking Confirm calls sellCompanyProperty exactly once', async () => {
    let resolveSell;
    companyState.sellCompanyProperty.mockImplementation(() => new Promise((r) => (resolveSell = r)));
    renderPage('/real-estate-companies/c1?tab=properties');
    fireEvent.click(screen.getByRole('button', { name: 'companies.sellProperty' }));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'common.confirmSellAction' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'common.loading' })).toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: 'common.loading' }));
    expect(companyState.sellCompanyProperty).toHaveBeenCalledTimes(1);
    resolveSell();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('renders the dialog in RTL for Hebrew', async () => {
    i18nState.language = 'he';
    renderPage('/real-estate-companies/c1?tab=properties');
    fireEvent.click(screen.getByRole('button', { name: 'companies.sellProperty' }));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    expect(screen.getByRole('dialog')).toHaveAttribute('dir', 'rtl');
  });
});

describe('CompanyDetailPage — Auction Proposals tab & deep-link', () => {
  beforeEach(() => {
    companyState.selectedCompany = makeCompany({ memberRole: 'member' });
    companyState.fetchAuctionProposals.mockResolvedValue([
      {
        _id: 'ab1',
        status: 'pending',
        amount: 2000,
        requestedBy: { _id: 'user2', username: 'other' },
        auctionId: { _id: 'a1', propertyId: { _id: 'p1', name: 'Heritage Building' } },
        votes: [],
        createdAt: new Date().toISOString(),
      },
    ]);
  });

  it('renders the Auction Proposals tab with the proposal card and vote buttons', async () => {
    renderPage('/real-estate-companies/c1?tab=auctions');

    expect(await screen.findByText('companies.auctionBidProposal')).toBeInTheDocument();
    expect(screen.getByText('Heritage Building')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'companies.approveBid' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'companies.rejectBid' })).toBeInTheDocument();
  });

  it('shows the proposer cannot vote (own proposal hides vote buttons)', async () => {
    companyState.fetchAuctionProposals.mockResolvedValue([
      {
        _id: 'ab2',
        status: 'pending',
        amount: 1500,
        requestedBy: { _id: 'user1', username: 'me' },
        auctionId: { _id: 'a2', propertyId: { _id: 'p2', name: 'Skyline' } },
        votes: [],
        createdAt: new Date().toISOString(),
      },
    ]);
    renderPage('/real-estate-companies/c1?tab=auctions');

    expect(await screen.findByText('Skyline')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'companies.approveBid' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'companies.rejectBid' })).not.toBeInTheDocument();
  });

  it('deep-link with proposalId renders the highlighted proposal', async () => {
    renderPage('/real-estate-companies/c1?tab=auctions&proposalId=ab1');

    expect(await screen.findByText('companies.auctionBidProposal')).toBeInTheDocument();
    const card = document.getElementById('auction-proposal-ab1');
    expect(card).not.toBeNull();
    expect(card.className).toContain('ring-blue-500');
  });

  it('contract notification deep-link opens Contracts → Proposed and highlights the offered contract', async () => {
    companyState.fetchContracts = vi.fn().mockResolvedValue([
      {
        _id: 'ct1',
        name: 'Harbor Bridge',
        status: 'proposed',
        description: 'Build the harbor bridge',
        reward: 100000,
        cost: 50000,
        durationTicks: 4,
        proposal: { status: 'pending', votes: [], proposedBy: { _id: 'user2', username: 'other' } },
      },
    ]);
    renderPage('/real-estate-companies/c1?tab=contracts&subTab=proposed&contractId=ct1');

    // Contracts tab + Proposed sub-view open automatically; the offered
    // contract is visible with the deep-link highlight ring.
    expect(await screen.findByText('Harbor Bridge')).toBeInTheDocument();
    const card = document.getElementById('company-contract-ct1');
    expect(card).not.toBeNull();
    expect(card.className).toContain('ring-blue-500');
  });

  it('contract deep-link falls back gracefully when the contract no longer exists', async () => {
    companyState.fetchContracts = vi.fn().mockResolvedValue([]);
    renderPage('/real-estate-companies/c1?tab=contracts&subTab=proposed&contractId=ct9');

    // No crash: the empty proposed-contracts state renders instead.
    expect(await screen.findByText('companies.noProposedContracts')).toBeInTheDocument();
    expect(document.getElementById('company-contract-ct9')).toBeNull();
  });

  it('clicking Approve Bid calls voteAuctionProposal with (auctionId, proposalId, vote, companyId)', async () => {
    companyState.voteAuctionProposal.mockResolvedValue();
    renderPage('/real-estate-companies/c1?tab=auctions');

    fireEvent.click(await screen.findByRole('button', { name: 'companies.approveBid' }));

    await waitFor(() => {
      expect(companyState.voteAuctionProposal).toHaveBeenCalledWith('a1', 'ab1', 'yes', 'c1');
    });
  });
});
