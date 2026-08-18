import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import '@testing-library/jest-dom/vitest';
import i18n from '../../i18n';

// Override the global react-i18next mock (src/test/setup.js) so translations
// actually resolve against the real EN/HE resource files.
vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useTranslation: () => ({ t: (key, opts) => i18n.t(key, opts), i18n }),
  };
});

const authState = vi.hoisted(() => ({
  user: { _id: 'user1', username: 'me', role: 'user' },
}));

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

vi.mock('../../components/PropertyImage', () => ({
  default: () => null,
}));

vi.mock('../../components/ConfirmDialog', () => ({
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

function makeAuditLog(action, overrides = {}) {
  return {
    _id: `log-${action}`,
    action,
    userId: { _id: 'user2', username: 'orou500' },
    details: { auctionBidId: 'ab1', auctionId: 'au1', amount: 1404146 },
    createdAt: '2026-08-18T10:00:00.000Z',
    ...overrides,
  };
}

function makeProposal(status, overrides = {}) {
  return {
    _id: `prop-${status}`,
    status,
    amount: 2000,
    requestedBy: { _id: 'user2', username: 'other' },
    auctionId: { _id: 'au1', propertyId: { _id: 'p1', name: 'Heritage Building' } },
    votes: [],
    votingEndsAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function renderPage(initialUrl) {
  return render(
    <MemoryRouter initialEntries={[initialUrl]}>
      <Routes>
        <Route path="/real-estate-companies/:id" element={<CompanyDetailPage />} />
        <Route path="/real-estate-companies" element={<div>company-list</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(async () => {
  vi.clearAllMocks();
  companyState.selectedCompany = makeCompany();
  companyState.companyAuditLogs = [];
  companyState.companyStats = null;
  companyState.loading = false;
  authState.user = { _id: 'user1', username: 'me', role: 'user' };
  await i18n.changeLanguage('en');
});

afterEach(async () => {
  await i18n.changeLanguage('en');
});

describe('CompanyDetailPage — Audit Log localized rendering', () => {
  it('renders auction bid audit actions as localized labels, not raw keys (EN)', async () => {
    companyState.companyAuditLogs = [
      makeAuditLog('auction_bid_requested'),
      makeAuditLog('auction_bid_vote_cast'),
      makeAuditLog('auction_bid_approved'),
      makeAuditLog('auction_bid_rejected'),
    ];
    renderPage('/real-estate-companies/c1?tab=audit');

    expect(await screen.findByText('auction bid requested')).toBeInTheDocument();
    expect(screen.getByText('auction bid vote cast')).toBeInTheDocument();
    expect(screen.getByText('auction bid approved')).toBeInTheDocument();
    expect(screen.getByText('auction bid rejected')).toBeInTheDocument();

    // Localized details with context, never raw JSON.
    expect(screen.getByText('Proposed auction bid of $1.4M')).toBeInTheDocument();
    expect(screen.getByText('Auction bid of $1.4M approved and executed')).toBeInTheDocument();

    // No raw translation keys or raw payloads anywhere.
    expect(screen.queryByText(/companies\.audit/i)).toBeNull();
    expect(screen.queryByText(/auctionBidId/i)).toBeNull();
    expect(screen.queryByText(/companies\.auditAuctionBid/i)).toBeNull();
  });

  it('renders auction bid audit actions in Hebrew (HE)', async () => {
    await i18n.changeLanguage('he');
    companyState.companyAuditLogs = [makeAuditLog('auction_bid_approved'), makeAuditLog('auction_bid_vote_cast')];
    renderPage('/real-estate-companies/c1?tab=audit');

    expect(await screen.findByText('הצעת המכרז אושרה')).toBeInTheDocument();
    expect(screen.getByText('הצבעה על הצעת מכרז')).toBeInTheDocument();
    expect(screen.queryByText(/companies\.audit/i)).toBeNull();
  });

  it('falls back to a human-readable label for future/unknown actions (no raw key)', async () => {
    companyState.companyAuditLogs = [makeAuditLog('auction_bid_made_up')];
    renderPage('/real-estate-companies/c1?tab=audit');

    expect(await screen.findByText('Auction Bid Made Up')).toBeInTheDocument();
    expect(screen.queryByText(/companies\.audit/i)).toBeNull();
  });
});

describe('CompanyDetailPage — Auction Proposals status badges', () => {
  it('renders every proposal status as localized text, never raw keys (EN)', async () => {
    companyState.fetchAuctionProposals.mockResolvedValue([
      makeProposal('pending'),
      makeProposal('resolving'),
      makeProposal('approved'),
      makeProposal('executed'),
      makeProposal('rejected'),
      makeProposal('expired'),
    ]);
    renderPage('/real-estate-companies/c1?tab=auctions');

    expect(await screen.findByText('Auction Proposals')).toBeInTheDocument();
    // Statuses appear on multiple badges (pending+resolving, approved+executed).
    expect(screen.getAllByText('Pending').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Approved').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Rejected')).toBeInTheDocument();
    expect(screen.getByText('Expired')).toBeInTheDocument();

    // No raw translation keys (common.approved etc.) anywhere in the tab.
    expect(screen.queryByText(/common\./i)).toBeNull();
    expect(screen.queryByText(/companies\./i)).toBeNull();
  });

  it('renders the approved status in Hebrew (HE)', async () => {
    await i18n.changeLanguage('he');
    companyState.fetchAuctionProposals.mockResolvedValue([
      makeProposal('approved'),
      makeProposal('rejected'),
      makeProposal('expired'),
    ]);
    renderPage('/real-estate-companies/c1?tab=auctions');

    expect(await screen.findByText('אושר')).toBeInTheDocument();
    expect(screen.getByText('נדחה')).toBeInTheDocument();
    expect(screen.getByText('פג תוקף')).toBeInTheDocument();
    expect(screen.queryByText(/common\./i)).toBeNull();
  });

  it('does not show vote buttons for resolved proposals', async () => {
    companyState.fetchAuctionProposals.mockResolvedValue([makeProposal('approved'), makeProposal('rejected')]);
    renderPage('/real-estate-companies/c1?tab=auctions');

    await screen.findByText('Approved');
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Approve Bid' })).not.toBeInTheDocument();
    });
  });
});
