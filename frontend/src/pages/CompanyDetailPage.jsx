import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useCompanyStore } from '../store/useCompanyStore';
import { useAuthStore } from '../store/useAuthStore';
import { formatMoney, formatMoneyExact } from '../utils/format';
import PropertyImage from '../components/PropertyImage';
import Avatar from '../components/Avatar';
import ConfirmDialog from '../components/ConfirmDialog';
import { useCompanySocket, useSocketEvent } from '../hooks/useSocket';
import {
  usernameTextStyle,
  usernameGradientClassName,
  isAnimatedUsername,
  USERNAME_ANIMATED_CLASS,
  USERNAME_EFFECT_CLASS,
} from '../config/supporterCosmetics';

const TABS = [
  'overview',
  'members',
  'applications',
  'treasury',
  'properties',
  'loans',
  'missions',
  'contracts',
  'investments',
  'auctions',
  'audit',
];

// Fallback IPO requirements used only when the backend response does not yet
// carry `ipoRequirements` (the backend is authoritative for IPO eligibility).
const FALLBACK_IPO_REQUIREMENTS = {
  fee: 30_000_000,
  minLevel: 10,
  minMembers: 5,
  minNetWorth: 30_000_000,
  minProperties: 10,
  maxDebtRatio: 0.5,
};

function normalizeId(id) {
  if (!id) return '';
  if (typeof id === 'object') {
    return (id._id || id.id || id)?.toString();
  }
  return id.toString();
}

function formatAuditDetails(log, t) {
  const d = log.details;
  if (!d || Object.keys(d).length === 0) return null;

  switch (log.action) {
    case 'company_created':
      return t('companies.auditDetailCreated', { name: d.name, fee: formatMoney(d.fee || 0) });
    case 'member_joined':
      return t('companies.auditDetailJoined', { user: d.username });
    case 'member_left':
      return t('companies.auditDetailLeft', { role: d.role });
    case 'member_removed':
      return t('companies.auditDetailRemoved', { user: d.targetUsername });
    case 'member_invited':
      return t('companies.auditDetailInvited', { user: d.targetUsername });
    case 'role_changed':
      return t('companies.auditDetailRoleChanged', { role: d.newRole });
    case 'treasury_deposit':
      return t('companies.auditDetailDeposit', {
        amount: formatMoney(d.amount || 0),
        balance: formatMoney(d.balance || 0),
      });
    case 'treasury_withdrawal':
      return t('companies.auditDetailWithdrawal', { amount: formatMoney(d.amount || 0), recipient: d.recipient || '' });
    case 'property_purchased':
      return t('companies.auditDetailPropertyBought', { name: d.propertyName, price: formatMoney(d.price || 0) });
    case 'property_sold':
      return t('companies.auditDetailPropertySold', { name: d.propertyName, price: formatMoney(d.price || 0) });
    case 'loan_taken':
      return t('companies.auditDetailLoanTaken', { amount: formatMoney(d.principal || 0) });
    case 'loan_payment':
      return t('companies.auditDetailLoanPayment', { amount: formatMoney(d.amount || 0) });
    case 'settings_updated':
      return t('companies.auditDetailSettingsUpdated');
    case 'level_up':
      return t('companies.auditDetailLevelUp', { level: d.newLevel, members: d.maxMembers });
    case 'application_submitted':
      return t('companies.auditDetailAppSubmitted', { user: d.username });
    case 'application_approved':
      return t('companies.auditDetailAppApproved', { user: d.username });
    case 'application_rejected':
      return t('companies.auditDetailAppRejected');
    case 'invitation_declined':
      return t('companies.auditDetailInvitationDeclined');
    case 'property_purchase_requested':
      return t('companies.auditDetailPropertyPurchaseRequested', {
        name: d.propertyName,
        price: formatMoney(d.price || 0),
      });
    case 'property_purchase_vote_cast':
      return t('companies.auditDetailPropertyPurchaseVote', { vote: d.vote });
    case 'loan_requested':
      return t('companies.auditDetailLoanRequested', { amount: formatMoney(d.principal || 0) });
    case 'loan_vote_cast':
      return t('companies.auditDetailLoanVote', { vote: d.vote });
    case 'loan_approved':
      return t('companies.auditDetailLoanApproved', { amount: formatMoney(d.principal || 0) });
    case 'loan_rejected':
      return t('companies.auditDetailLoanRejected');
    case 'ipo_listed':
      return t('companies.auditDetailIPO', { ticker: d.ticker, price: formatMoney(d.sharePrice || 0) });
    case 'investment_created':
      return t('companies.auditDetailInvestmentCreated', { name: d.name, principal: formatMoney(d.principal || 0) });
    case 'investment_proposed':
      return t('companies.auditDetailInvestmentProposed', { name: d.name, principal: formatMoney(d.principal || 0) });
    case 'investment_vote_cast':
      return t('companies.auditDetailInvestmentVoteCast', { name: d.name, vote: d.vote });
    case 'investment_approved':
      return t('companies.auditDetailInvestmentApproved', { name: d.name, principal: formatMoney(d.principal || 0) });
    case 'investment_cancelled':
      return t('companies.auditDetailInvestmentCancelled', { name: d.name });
    case 'investment_returned':
      return t('companies.auditDetailInvestmentReturned', {
        name: d.name,
        value: formatMoney(d.currentValue || 0),
        profit: formatMoney(d.profit || 0),
      });
    case 'contract_proposed':
      return t('companies.auditDetailContractProposed', { name: d.name, cost: formatMoney(d.cost || 0) });
    case 'contract_vote_cast':
      return t('companies.auditDetailContractVoteCast', { name: d.name, vote: d.vote });
    case 'contract_approved':
      return t('companies.auditDetailContractApproved', { name: d.name, cost: formatMoney(d.cost || 0) });
    case 'contract_rejected':
      return t('companies.auditDetailContractRejected', { name: d.name });
    case 'contract_completed':
      return t('companies.auditDetailContractCompleted', { name: d.name, reward: formatMoney(d.reward || 0) });
    case 'development_requested':
      return t('companies.auditDetailDevelopmentRequested', { name: d.propertyName, type: d.projectType });
    case 'development_vote_cast':
      return t('companies.auditDetailDevelopmentVoteCast', { name: d.propertyName, vote: d.vote });
    case 'development_executed':
      return t('companies.auditDetailDevelopmentExecuted', { name: d.propertyName, type: d.projectType });
    case 'development_rejected':
      return t('companies.auditDetailDevelopmentRejected', { name: d.propertyName });
    case 'development_failed':
      return t('companies.auditDetailDevelopmentFailed', { name: d.propertyName, error: d.error || '' });
    case 'milestone_completed':
      return t('companies.auditDetailMilestoneCompleted', {
        name: d.name,
        xp: d.xpReward,
        reputation: d.reputationReward,
        treasury: formatMoney(d.treasuryReward || 0),
      });
    case 'employees_hired':
      return t('companies.auditDetailEmployeesHired', { count: d.count, total: d.total });
    case 'employees_fired':
      return d.reason
        ? t('companies.auditDetailEmployeesFiredAuto', { count: d.count, remaining: d.remaining })
        : t('companies.auditDetailEmployeesFired', { count: d.count, remaining: d.remaining });
    case 'salary_updated':
      return t('companies.auditDetailSalaryUpdated', {
        salary: formatMoney(d.monthlySalary),
        payroll: formatMoney(d.totalPayroll),
      });
    case 'auction_bid_requested':
      return t('companies.auditDetailAuctionBidRequested', { amount: formatMoney(d.amount || 0) });
    case 'auction_bid_vote_cast':
      return t('companies.auditDetailAuctionBidVoteCast', {
        vote: d.vote,
        amount: formatMoney(d.amount || 0),
      });
    case 'auction_bid_approved':
      return t('companies.auditDetailAuctionBidApproved', { amount: formatMoney(d.amount || 0) });
    case 'auction_bid_rejected':
      return t('companies.auditDetailAuctionBidRejected', { amount: formatMoney(d.amount || 0) });
    case 'auction_bid_expired':
      return t('companies.auditDetailAuctionBidExpired', { amount: formatMoney(d.amount || 0) });
    case 'auction_bid_proposal_recovered':
      return t('companies.auditDetailAuctionBidProposalRecovered', { reason: d.reason || '' });
    case 'leadership_transferred':
      return t('companies.auditDetailLeadershipTransferred', { user: d.targetUsername || d.newCeo || '' });
    case 'secondary_offering':
      return t('companies.auditDetailSecondaryOffering', { amount: formatMoney(d.amount || d.raised || 0) });
    default:
      // Never expose raw JSON payloads in the user-facing audit UI. The
      // action label still renders via its translation key (with a readable
      // fallback); only unknown detail payloads are hidden.
      return null;
  }
}

// Resolve a company audit action (snake_case, e.g. auction_bid_approved) into
// its localized label. If a translation key is ever missing (including future
// actions), fall back to a human-readable title-case version of the action so
// a raw i18n key can never leak into the UI.
function auditActionLabel(action, t) {
  const key = `companies.audit${action
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('')}`;
  return t(key, {
    defaultValue: action
      .split('_')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' '),
  });
}

export default function CompanyDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const {
    selectedCompany: company,
    companyProperties,
    companyPropertiesPage,
    companyPropertiesTotalPages,
    companyLoans,
    companyAuditLogs,
    companyAuditTotal,
    companyAuditPage,
    companyAuditTotalPages,
    companyStats,
    loading,
    fetchCompany,
    fetchCompanyStats,
    fetchCompanyAudit,
    depositTreasury,
    withdrawTreasury,
    inviteMember,
    removeMember,
    changeRole,
    transferLeadership,
    leaveCompany,
    repayCompanyLoan,
    sellCompanyProperty,
    clearSelectedCompany,
    applyToCompany,
    fetchApplications,
    approveApplication,
    rejectApplication,
    cancelApplication,
    createLoanRequest,
    fetchLoanRequests,
    voteLoanRequest,
    executeLoanRequest,
    takeDirectLoan,
    initiateIPO,
    createPropertyPurchaseRequest,
    fetchPropertyPurchaseRequests,
    votePropertyPurchaseRequest,
    fetchAuctionProposals,
    voteAuctionProposal,
    fetchContracts,
    acceptContract,
    proposeContract,
    voteContractProposal,
    fetchContractHistory,
    fetchInvestmentProducts,
    fetchInvestments,
    fetchInvestmentPerformance,
    createInvestment,
    voteInvestmentProposal,
    cancelInvestmentProposal,
    fetchCompanyLoans,
    fetchCompanyLoanOptions,
    fetchCompanyProperties,
    companyMissions,
    fetchCompanyMissions,
    claimCompanyMissionReward,
  } = useCompanyStore();

  const [tab, setTab] = useState(searchParams.get('tab') || 'overview');
  const [depositAmount, setDepositAmount] = useState('');
  const [depositError, setDepositError] = useState('');
  const [depositLoading, setDepositLoading] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawError, setWithdrawError] = useState('');
  const [withdrawLoading, setWithdrawLoading] = useState(false);
  const [inviteUsername, setInviteUsername] = useState('');
  const [inviteError, setInviteError] = useState('');
  const [repayAmounts, setRepayAmounts] = useState({});
  const [applications, setApplications] = useState([]);
  const [loanRequests, setLoanRequests] = useState([]);
  const [applyMessage, setApplyMessage] = useState('');
  const [loanReqAmount, setLoanReqAmount] = useState('');
  const [loanReqDuration, setLoanReqDuration] = useState('');
  const [loanReqType, setLoanReqType] = useState('business');
  const [loanReqError, setLoanReqError] = useState('');
  const [missionsError, setMissionsError] = useState(false);
  const [claimingMissionId, setClaimingMissionId] = useState(null);
  const [directLoanAmount, setDirectLoanAmount] = useState('');
  const [directLoanDuration, setDirectLoanDuration] = useState('');
  const [directLoanProduct, setDirectLoanProduct] = useState('');
  const [directLoanOptions, setDirectLoanOptions] = useState(null);
  const [directLoanError, setDirectLoanError] = useState('');
  const [directLoanLoading, setDirectLoanLoading] = useState(false);
  const [ipoLoading, setIpoLoading] = useState(false);
  const [ipoError, setIpoError] = useState('');
  const [applySuccess, setApplySuccess] = useState(false);
  const [applyError, setApplyError] = useState('');
  const [propertyPurchaseRequests, setPropertyPurchaseRequests] = useState([]);
  const [auctionProposals, setAuctionProposals] = useState([]);
  // Live clock so the company voting countdown (votingEndsAt) ticks without
  // a page refresh.
  const [now, setNow] = useState(Date.now());
  const [contracts, setContracts] = useState([]);
  const [contractHistory, setContractHistory] = useState([]);
  const [investments, setInvestments] = useState([]);
  const [investmentProducts, setInvestmentProducts] = useState([]);
  const [investmentPerformance, setInvestmentPerformance] = useState(null);
  const [investAmount, setInvestAmount] = useState('');
  const [selectedInvestmentProduct, setSelectedInvestmentProduct] = useState('');
  const [investmentError, setInvestmentError] = useState('');
  const [investmentLoading, setInvestmentLoading] = useState(false);
  const [contractSubTab, setContractSubTab] = useState(searchParams.get('subTab') || 'active');
  const [investmentSubTab, setInvestmentSubTab] = useState('active');
  const [propertiesPage, setPropertiesPage] = useState(1);
  const [auditPage, setAuditPage] = useState(1);
  const [auditLimit] = useState(30);
  const [transactionsPage, setTransactionsPage] = useState(1);
  const [transactionsLimit] = useState(10);
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
  const [leaveLoading, setLeaveLoading] = useState(false);
  const [transferTarget, setTransferTarget] = useState(null);
  const [transferLoading, setTransferLoading] = useState(false);
  const [sellConfirmPropertyId, setSellConfirmPropertyId] = useState(null);
  const [sellLoading, setSellLoading] = useState(false);

  const handleSetTab = (t2) => {
    setTab(t2);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (t2 === 'overview') {
        next.delete('tab');
      } else {
        next.set('tab', t2);
      }
      return next;
    });
  };

  const handleConfirmLeave = async () => {
    if (leaveLoading) return;
    setLeaveLoading(true);
    try {
      await leaveCompany(id);
      navigate('/real-estate-companies');
    } catch {
      setLeaveLoading(false);
      setLeaveConfirmOpen(false);
    }
  };

  const handleConfirmTransfer = async () => {
    if (transferLoading || !transferTarget) return;
    setTransferLoading(true);
    try {
      await transferLeadership(id, transferTarget);
      setTransferTarget(null);
    } catch {
      setTransferTarget(null);
    } finally {
      setTransferLoading(false);
    }
  };

  const transferTargetMember = transferTarget
    ? company.members?.find((m) => (m.userId?._id || m.userId)?.toString() === transferTarget?.toString())
    : null;
  const transferTargetName = transferTargetMember
    ? (typeof transferTargetMember.userId === 'object' && transferTargetMember.userId?.username) ||
      transferTargetMember.username ||
      ''
    : '';

  const handleConfirmSell = async () => {
    if (sellLoading || !sellConfirmPropertyId) return;
    setSellLoading(true);
    try {
      await sellCompanyProperty(id, sellConfirmPropertyId);
      setSellConfirmPropertyId(null);
    } catch {
      setSellConfirmPropertyId(null);
    } finally {
      setSellLoading(false);
    }
  };

  useEffect(() => {
    fetchCompany(id);
    fetchCompanyStats(id);
    return () => clearSelectedCompany();
  }, [id]);

  useEffect(() => {
    if (tab === 'audit') fetchCompanyAudit(id, auditPage, auditLimit);
    const canViewApplications = user?.role === 'admin' || ['ceo', 'director', 'officer'].includes(company?.memberRole);
    if (tab === 'applications' && company && canViewApplications) {
      fetchApplications(id)
        .then(setApplications)
        .catch(() => {});
    }
    if (tab === 'overview' || tab === 'loans') {
      fetchCompanyLoans(id).catch(() => {});
      fetchLoanRequests(id)
        .then(setLoanRequests)
        .catch(() => {});
    }
    if (tab === 'overview' || tab === 'properties') {
      fetchPropertyPurchaseRequests(id)
        .then(setPropertyPurchaseRequests)
        .catch(() => {});
    }
    if (tab === 'overview' || tab === 'auctions') {
      fetchAuctionProposals(id)
        .then(setAuctionProposals)
        .catch(() => {});
    }
    if (tab === 'properties') {
      fetchCompanyProperties(id, propertiesPage);
    }
    if (tab === 'loans') {
      fetchCompanyLoans(id).catch(() => {});
      fetchLoanRequests(id)
        .then(setLoanRequests)
        .catch(() => {});
      if (company?.memberRole === 'ceo' || user?.role === 'admin') {
        fetchCompanyLoanOptions(id)
          .then(setDirectLoanOptions)
          .catch(() => {});
      }
    }
    if (tab === 'contracts') {
      fetchContracts(id)
        .then(setContracts)
        .catch(() => {});
      fetchContractHistory(id)
        .then(setContractHistory)
        .catch(() => {});
    }
    if (tab === 'investments') {
      fetchInvestments(id)
        .then(setInvestments)
        .catch(() => {});
      fetchInvestmentProducts(id)
        .then(setInvestmentProducts)
        .catch(() => {});
      fetchInvestmentPerformance(id)
        .then(setInvestmentPerformance)
        .catch(() => {});
    }
    if (tab === 'missions') {
      setMissionsError(false);
      fetchCompanyMissions(id).catch(() => setMissionsError(true));
    }
  }, [tab, id, propertiesPage, auditPage, company?.memberRole, user?.role]);

  useCompanySocket(id);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(interval);
  }, []);

  useSocketEvent('vote:created', () => {
    if (tab === 'overview' || tab === 'auctions') refreshAuctionProposals();
  });
  useSocketEvent('vote:completed', () => {
    if (tab === 'overview' || tab === 'auctions') refreshAuctionProposals();
    fetchCompany(id).catch(() => {});
    fetchCompanyStats(id);
  });
  useSocketEvent('vote:expired', () => {
    if (tab === 'overview' || tab === 'auctions') refreshAuctionProposals();
  });

  const proposalIdParam = searchParams.get('proposalId');
  const contractIdParam = searchParams.get('contractId');

  useEffect(() => {
    if (!proposalIdParam) return;
    const timer = setTimeout(() => {
      const el = document.getElementById(`auction-proposal-${proposalIdParam}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [proposalIdParam, auctionProposals, tab]);

  useEffect(() => {
    if (!contractIdParam || tab !== 'contracts') return;
    const timer = setTimeout(() => {
      const el = document.getElementById(`company-contract-${contractIdParam}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [contractIdParam, contracts, contractHistory, contractSubTab, tab]);

  if (loading || !company) {
    return <div className="max-w-6xl mx-auto px-4 py-8 text-center text-gray-500">{t('common.loading')}</div>;
  }

  const isMemberFromMembers = company.members?.some((m) => {
    const uid = m.userId?._id || m.userId;
    return normalizeId(uid) === normalizeId(user?._id);
  });
  const isMember = company.isMember || isMemberFromMembers || false;
  const memberRole =
    company.memberRole || company.members?.find((m) => normalizeId(m.userId) === normalizeId(user?._id))?.role || null;
  const isAdmin = user?.role === 'admin';
  const isCEO = memberRole === 'ceo';
  const isDirector = memberRole === 'director' || isCEO || isAdmin;
  const isOfficer = memberRole === 'officer' || isDirector || isAdmin;
  const myMember = company.members?.find((m) => {
    const uid = m.userId?._id || m.userId;
    return uid?.toString() === user?._id?.toString();
  });

  const handleDeposit = async () => {
    const amt = parseFloat(depositAmount);
    if (!amt || amt <= 0) return;
    setDepositError('');
    setDepositLoading(true);
    try {
      await depositTreasury(id, amt);
      setDepositAmount('');
      fetchCompanyStats(id);
      useAuthStore.getState().fetchMe();
    } catch (err) {
      setDepositError(err.message || t('common.error'));
    } finally {
      setDepositLoading(false);
    }
  };

  const handleWithdraw = async () => {
    const amt = parseFloat(withdrawAmount);
    if (!amt || amt <= 0) return;
    setWithdrawError('');
    setWithdrawLoading(true);
    try {
      await withdrawTreasury(id, amt);
      setWithdrawAmount('');
      fetchCompanyStats(id);
      useAuthStore.getState().fetchMe();
    } catch (err) {
      setWithdrawError(err.message || t('common.error'));
    } finally {
      setWithdrawLoading(false);
    }
  };

  const handleInvite = async () => {
    if (!inviteUsername.trim()) return;
    setInviteError('');
    try {
      await inviteMember(id, inviteUsername.trim());
      setInviteUsername('');
    } catch (err) {
      setInviteError(err.message);
    }
  };

  const handleRepay = async (loanId) => {
    const amt = parseFloat(repayAmounts[loanId]) || 0;
    try {
      await repayCompanyLoan(id, loanId, amt || undefined);
      setRepayAmounts((prev) => ({ ...prev, [loanId]: '' }));
      fetchCompanyStats(id);
      fetchCompanyLoans(id);
    } catch {}
  };

  const handleApply = async () => {
    setApplyError('');
    setApplySuccess(false);
    try {
      await applyToCompany(id, applyMessage);
      setApplyMessage('');
      setApplySuccess(true);
      fetchCompany(id);
    } catch (err) {
      setApplyError(err.message);
    }
  };

  const handleCancelApplication = async () => {
    const pendingApp = company.applications?.find(
      (a) => (a.userId?._id || a.userId)?.toString() === user?._id?.toString() && a.status === 'pending',
    );
    if (!pendingApp) return;
    try {
      await cancelApplication(id, pendingApp._id);
      setApplySuccess(false);
      fetchCompany(id);
    } catch (err) {
      setApplyError(err.message);
    }
  };

  const handleApproveApp = async (appId) => {
    try {
      await approveApplication(id, appId);
      const apps = await fetchApplications(id);
      setApplications(apps);
    } catch {}
  };

  const handleRejectApp = async (appId) => {
    try {
      await rejectApplication(id, appId);
      const apps = await fetchApplications(id);
      setApplications(apps);
    } catch {}
  };

  const handleLoanRequest = async () => {
    const amt = parseFloat(loanReqAmount);
    const dur = parseInt(loanReqDuration);
    if (!amt || !dur) return;
    setLoanReqError('');
    try {
      await createLoanRequest(id, amt, dur, loanReqType);
      setLoanReqAmount('');
      setLoanReqDuration('');
      const reqs = await fetchLoanRequests(id);
      setLoanRequests(reqs);
    } catch (err) {
      setLoanReqError(err.message || t('common.error'));
    }
  };

  const selectedProduct = investmentProducts.find((p) => (p._id || p.type) === selectedInvestmentProduct);

  const handleInvest = async () => {
    const amt = parseFloat(investAmount);
    if (!amt || !selectedProduct) return;
    setInvestmentError('');
    setInvestmentLoading(true);
    try {
      const isOpportunity = selectedProduct.isOpportunity;
      await createInvestment(id, selectedProduct.type, amt, isOpportunity ? selectedProduct._id : undefined);
      setInvestAmount('');
      setSelectedInvestmentProduct('');
      const [invList, perf] = await Promise.all([fetchInvestments(id), fetchInvestmentPerformance(id)]);
      setInvestments(invList);
      setInvestmentPerformance(perf);
    } catch (err) {
      setInvestmentError(err.message || t('common.error'));
    } finally {
      setInvestmentLoading(false);
    }
  };

  const handleDirectLoan = async () => {
    const amt = parseFloat(directLoanAmount);
    const dur = parseInt(directLoanDuration);
    const productId = directLoanProduct || directLoanOptions?.products?.[0]?.id;
    if (!amt || !dur || !productId) return;
    setDirectLoanError('');
    setDirectLoanLoading(true);
    try {
      await takeDirectLoan(id, amt, dur, productId);
      setDirectLoanAmount('');
      setDirectLoanDuration('');
      await fetchCompanyLoans(id);
      await fetchCompanyLoanOptions(id).then(setDirectLoanOptions);
      const reqs = await fetchLoanRequests(id);
      setLoanRequests(reqs);
    } catch (err) {
      setDirectLoanError(err.message || t('common.error'));
    } finally {
      setDirectLoanLoading(false);
    }
  };

  const handleVoteLoan = async (reqId, vote) => {
    try {
      await voteLoanRequest(id, reqId, vote);
      const reqs = await fetchLoanRequests(id);
      setLoanRequests(reqs);
    } catch {}
  };

  const handleExecuteLoan = async (reqId) => {
    try {
      await executeLoanRequest(id, reqId);
      const reqs = await fetchLoanRequests(id);
      setLoanRequests(reqs);
      fetchCompanyStats(id);
    } catch {}
  };

  const handleVotePropertyPurchase = async (reqId, vote) => {
    try {
      await votePropertyPurchaseRequest(id, reqId, vote);
      const reqs = await fetchPropertyPurchaseRequests(id);
      setPropertyPurchaseRequests(reqs);
    } catch {}
  };

  const refreshAuctionProposals = async () => {
    try {
      const reqs = await fetchAuctionProposals(id);
      setAuctionProposals(reqs);
    } catch {}
  };

  const handleVoteAuctionProposal = async (proposal, vote) => {
    try {
      const auctionId = proposal.auctionId?._id || proposal.auctionId;
      await voteAuctionProposal(auctionId, proposal._id, vote, id);
      await refreshAuctionProposals();
      fetchCompanyStats(id);
    } catch {}
  };

  const handleIPO = async () => {
    setIpoLoading(true);
    setIpoError('');
    try {
      await initiateIPO(id);
      fetchCompanyStats(id);
    } catch (err) {
      setIpoError(err.message || t('common.error'));
    }
    setIpoLoading(false);
  };

  const ipoRequirements = company?.ipoRequirements || FALLBACK_IPO_REQUIREMENTS;

  return (
    <div className="w-full min-w-0 max-w-6xl mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-4 sm:space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-2">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <Link
            to="/real-estate-companies"
            className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 text-xs sm:text-sm shrink-0"
          >
            {t('companies.backToList')}
          </Link>
          <div className="w-9 h-9 sm:w-12 sm:h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center text-white font-bold text-base sm:text-lg shrink-0">
            {company.name.charAt(0)}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white truncate">{company.name}</h1>
            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 whitespace-normal">
              Lv.{company.level} · {company.xp || 0}/{company.xpToNextLevel || 500} XP · {company.reputation}{' '}
              {t('companies.reputation')} · {company.members?.length || 0}/{company.maxMembers} {t('companies.members')}
            </p>
          </div>
        </div>
        {isMember && (
          <button
            onClick={() => setLeaveConfirmOpen(true)}
            className="px-3 py-1 text-xs bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/50"
          >
            {t('companies.leaveCompany')}
          </button>
        )}
      </div>

      <div className="flex gap-0.5 overflow-x-auto border-b border-gray-200 dark:border-gray-700 -mx-3 sm:-mx-4 px-3 sm:px-4">
        {TABS.map((t2) => {
          const pendingCount =
            t2 === 'properties'
              ? propertyPurchaseRequests.filter((r) => r.status === 'pending').length
              : t2 === 'loans'
                ? loanRequests.filter((r) => r.status === 'pending').length
                : t2 === 'auctions'
                  ? auctionProposals.filter((r) => r.status === 'pending').length
                  : 0;
          return (
            <button
              key={t2}
              onClick={() => handleSetTab(t2)}
              className={`flex items-center gap-1.5 px-2.5 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${tab === t2 ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}
            >
              {t(`companies.tab${t2.charAt(0).toUpperCase() + t2.slice(1)}`)}
              {pendingCount > 0 && (
                <span className="px-1.5 py-0.5 text-[10px] bg-red-500 text-white rounded-full min-w-[1.25rem] text-center">
                  {pendingCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {tab === 'overview' && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4">
          {[
            {
              label: t('companies.netWorth'),
              value: formatMoney(companyStats?.netWorth || company.stats?.netWorth || 0),
              color: 'blue',
            },
            { label: t('companies.treasury'), value: formatMoney(company.treasury?.balance || 0), color: 'green' },
            {
              label: t('companies.properties'),
              value: companyStats?.propertiesOwned || company.stats?.propertiesOwned || 0,
              color: 'purple',
            },
            {
              label: t('companies.rentalIncome'),
              value: formatMoney(companyStats?.totalRentalIncome || company.stats?.totalRentalIncome || 0),
              color: 'yellow',
            },
            {
              label: t('companies.members'),
              value: `${company.members?.length || 0}/${company.maxMembers}`,
              color: 'indigo',
            },
            { label: t('companies.activeLoans'), value: companyLoans.filter((l) => l.active).length, color: 'red' },
            { label: t('companies.reputation'), value: company.reputation, color: 'amber' },
            { label: t('companies.level'), value: company.level, color: 'cyan' },
            {
              label: t('companies.employeeCount'),
              value: company.employees?.count || 0,
              color: 'teal',
            },
            {
              label: t('companies.monthlyPayroll'),
              value: formatMoney(company.employees?.totalPayroll || 0),
              color: 'orange',
            },
            {
              label: t('companies.hqCity'),
              value: company.hqCityId && typeof company.hqCityId === 'object' ? company.hqCityId.name : t('common.na'),
              color: 'slate',
            },
          ].map((stat) => (
            <div
              key={stat.label}
              className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-2.5 sm:p-4"
            >
              <div className="text-xs sm:text-xs text-gray-500 dark:text-gray-400">{stat.label}</div>
              <div className="text-base sm:text-lg font-bold text-gray-900 dark:text-white mt-1 break-words">
                {stat.value}
              </div>
            </div>
          ))}
          {company.shareBreakdown && (
            <div className="col-span-2 md:col-span-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 sm:p-4">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">{t('companies.ownership')}</h3>
              <div className="space-y-2">
                {company.shareBreakdown.map((s, idx) => (
                  <div key={s.userId || `treasury-${idx}`} className="flex items-center justify-between gap-2">
                    <span className="text-sm text-gray-700 dark:text-gray-300 truncate min-w-0">
                      {s.isTreasury
                        ? t('companies.treasuryOwnership')
                        : typeof s.userId === 'object' && s.userId?.username
                          ? s.userId.username
                          : 'Unknown'}
                    </span>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="w-20 sm:w-32 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full ${s.isTreasury ? 'bg-green-500' : 'bg-blue-600'}`}
                          style={{ width: `${s.percentage}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-500 dark:text-gray-400 w-12 text-end">{s.percentage}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {company.employees && company.employees.count > 0 && (
            <div className="col-span-2 md:col-span-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 sm:p-4">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">{t('companies.employees')}</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <span className="text-xs text-gray-500 dark:text-gray-400">{t('companies.employeeCount')}</span>
                  <div className="text-lg font-bold text-gray-900 dark:text-white">{company.employees.count}</div>
                </div>
                <div>
                  <span className="text-xs text-gray-500 dark:text-gray-400">{t('companies.monthlyPayroll')}</span>
                  <div className="text-lg font-bold text-gray-900 dark:text-white">
                    {formatMoney(company.employees.totalPayroll)}
                  </div>
                </div>
                <div>
                  <span className="text-xs text-gray-500 dark:text-gray-400">{t('companies.salaryPerEmployee')}</span>
                  <div className="text-lg font-bold text-gray-900 dark:text-white">
                    {formatMoney(company.employees.monthlySalaryPerEmployee)}
                  </div>
                </div>
                <div>
                  <span className="text-xs text-gray-500 dark:text-gray-400">{t('companies.maxEmployees')}</span>
                  <div className="text-lg font-bold text-gray-900 dark:text-white">
                    {company.employees.maxEmployees}
                  </div>
                </div>
              </div>
              {company.employees.departments && company.employees.departments.length > 0 && (
                <div className="mt-3 space-y-1">
                  <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                    {t('companies.departments')}
                  </span>
                  {company.employees.departments.map((dept, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400"
                    >
                      <span>{dept.name}</span>
                      <span>
                        {dept.count} employees · {formatMoney(dept.budget)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {company.levelBenefits &&
            (() => {
              const xpInLevel =
                company.xpInCurrentLevel ?? Math.max(0, (company.xp || 0) - (company.xpForCurrentLevel || 0));
              const xpNeeded =
                company.xpNeededForLevel ??
                Math.max(1, (company.xpToNextLevel || 500) - (company.xpForCurrentLevel || 0));
              const progressPct = Math.min(100, (xpInLevel / xpNeeded) * 100);
              return (
                <div className="col-span-2 md:col-span-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 sm:p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                      {t('companies.progression')}
                    </h3>
                    {company.level < 50 && (
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {Math.round(xpInLevel)} / {Math.round(xpNeeded)} XP
                      </span>
                    )}
                  </div>

                  {company.level < 50 && (
                    <div className="mb-3">
                      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
                        <div
                          className="bg-gradient-to-r from-cyan-500 to-blue-500 h-3 rounded-full transition-all duration-500"
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>
                      <div className="flex justify-between mt-1">
                        <span className="text-[10px] text-gray-400">Lv.{company.level}</span>
                        <span className="text-[10px] text-gray-400">
                          {company.level < 50 ? `${Math.round(progressPct)}%` : 'MAX'}
                        </span>
                        <span className="text-[10px] text-gray-400">Lv.{Math.min(50, company.level + 1)}</span>
                      </div>
                    </div>
                  )}

                  {company.level >= 50 && (
                    <div className="mb-3 text-center">
                      <span className="text-sm font-bold text-yellow-500 dark:text-yellow-400">
                        {t('companies.maxLevel') || 'MAX LEVEL'}
                      </span>
                    </div>
                  )}

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
                    <div className="text-center">
                      <div className="text-xs text-gray-500 dark:text-gray-400">{t('companies.maxMembers')}</div>
                      <div className="text-sm font-medium text-gray-900 dark:text-white">
                        {company.levelBenefits.maxMembers}
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-xs text-gray-500 dark:text-gray-400">{t('companies.maxLoanAmount')}</div>
                      <div className="text-sm font-medium text-gray-900 dark:text-white">
                        {formatMoney(company.levelBenefits.maxLoanAmount)}
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {t('companies.loanInterestDiscount')}
                      </div>
                      <div className="text-sm font-medium text-gray-900 dark:text-white">
                        {(company.levelBenefits.loanInterestDiscount * 100).toFixed(1)}%
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-xs text-gray-500 dark:text-gray-400">{t('companies.treasuryCapacity')}</div>
                      <div className="text-sm font-medium text-gray-900 dark:text-white">
                        {company.levelBenefits.treasuryCapacity === Infinity
                          ? '∞'
                          : formatMoney(company.levelBenefits.treasuryCapacity)}
                      </div>
                    </div>
                    {company.levelBenefits.canTakeContracts && (
                      <div className="text-center">
                        <div className="text-xs text-green-600 dark:text-green-400">
                          ✓ {t('companies.contracts') || 'Contracts'}
                        </div>
                        <div className="text-xs text-gray-400">Lv.3+</div>
                      </div>
                    )}
                    {company.levelBenefits.canStartProjects && (
                      <div className="text-center">
                        <div className="text-xs text-green-600 dark:text-green-400">
                          ✓ {t('companies.projects') || 'Projects'}
                        </div>
                        <div className="text-xs text-gray-400">Lv.5+</div>
                      </div>
                    )}
                    {company.levelBenefits.premiumContracts && (
                      <div className="text-center">
                        <div className="text-xs text-green-600 dark:text-green-400">
                          ✓ {t('companies.premiumContracts') || 'Premium'}
                        </div>
                        <div className="text-xs text-gray-400">Lv.10+</div>
                      </div>
                    )}
                    {company.levelBenefits.advancedGovernance && (
                      <div className="text-center">
                        <div className="text-xs text-green-600 dark:text-green-400">
                          ✓ {t('companies.advancedGovernance') || 'Gov+'}
                        </div>
                        <div className="text-xs text-gray-400">Lv.15+</div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

          {(loanRequests.some((r) => r.status === 'pending') ||
            propertyPurchaseRequests.some((r) => r.status === 'pending')) && (
            <div className="col-span-2 md:col-span-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 sm:p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{t('companies.pendingVotes')}</h3>
                <span className="text-xs px-2 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 rounded-lg">
                  {loanRequests.filter((r) => r.status === 'pending').length +
                    propertyPurchaseRequests.filter((r) => r.status === 'pending').length}{' '}
                  {t('companies.pendingVotes')}
                </span>
              </div>
              <div className="space-y-2">
                {propertyPurchaseRequests
                  .filter((r) => r.status === 'pending')
                  .map((req) => {
                    const prop = req.propertyId;
                    const totalVoters = Math.max(1, (company.members?.length || 1) - 1);
                    const yesVotes = (req.votes || []).filter((v) => v.vote === 'yes').length;
                    const myVote = (req.votes || []).find((v) => normalizeId(v.userId) === normalizeId(user?._id));
                    const requesterId = normalizeId(req.requestedBy);
                    const isProposer = requesterId && requesterId === normalizeId(user?._id);
                    const canVote = isMember && !myVote && !isProposer;
                    return (
                      <div
                        key={req._id}
                        className="flex items-center justify-between gap-2 p-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <PropertyImage
                              property={prop || {}}
                              alt={prop?.name}
                              className="w-8 h-8 object-cover rounded shrink-0"
                            />
                            <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
                              {t('companies.propertyPurchase')}: {prop?.name || t('companies.unknown')}
                            </span>
                            {isProposer && (
                              <span className="text-xs px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded">
                                {t('companies.proposedByYou')}
                              </span>
                            )}
                            {myVote && (
                              <span className="text-xs px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded">
                                {t('companies.youVoted')} {t(`companies.${myVote.vote}`)}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            {formatMoney(prop?.currentPrice || 0)} · {yesVotes}/{totalVoters} {t('companies.yes')}
                          </div>
                        </div>
                        {canVote ? (
                          <div className="flex gap-2 shrink-0">
                            <button
                              onClick={() => handleVotePropertyPurchase(req._id, 'yes')}
                              className="px-3 py-1 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700"
                            >
                              {t('companies.yes')}
                            </button>
                            <button
                              onClick={() => handleVotePropertyPurchase(req._id, 'no')}
                              className="px-3 py-1 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700"
                            >
                              {t('companies.no')}
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleSetTab('properties')}
                            className="px-3 py-1 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                          >
                            {t('companies.view')}
                          </button>
                        )}
                      </div>
                    );
                  })}
                {loanRequests
                  .filter((r) => r.status === 'pending')
                  .map((req) => {
                    const totalVoters = Math.max(1, (company.members?.length || 1) - 1);
                    const yesVotes = (req.votes || []).filter((v) => v.vote === 'yes').length;
                    const myVote = (req.votes || []).find((v) => normalizeId(v.userId) === normalizeId(user?._id));
                    const requesterId = normalizeId(req.requestedBy);
                    const isProposer = requesterId && requesterId === normalizeId(user?._id);
                    const canVote = isMember && !myVote && !isProposer;
                    return (
                      <div
                        key={req._id}
                        className="flex items-center justify-between gap-2 p-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
                              🏦 {t('companies.loan')}: {formatMoney(req.principal)}
                            </span>
                            {isProposer && (
                              <span className="text-xs px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded">
                                {t('companies.proposedByYou')}
                              </span>
                            )}
                            {myVote && (
                              <span className="text-xs px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded">
                                {t('companies.youVoted')} {t(`companies.${myVote.vote}`)}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            {req.durationTicks} {t('companies.months')} · {yesVotes}/{totalVoters} {t('companies.yes')}
                          </div>
                        </div>
                        {canVote ? (
                          <div className="flex gap-2 shrink-0">
                            <button
                              onClick={() => handleVoteLoan(req._id, 'yes')}
                              className="px-3 py-1 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700"
                            >
                              {t('companies.yes')}
                            </button>
                            <button
                              onClick={() => handleVoteLoan(req._id, 'no')}
                              className="px-3 py-1 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700"
                            >
                              {t('companies.no')}
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleSetTab('loans')}
                            className="px-3 py-1 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                          >
                            {t('companies.view')}
                          </button>
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {company.ipo?.listed ? (
            <div className="col-span-2 md:col-span-4 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3 sm:p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-green-800 dark:text-green-300">
                    {t('companies.publiclyListed')}
                  </h3>
                  <div className="text-xs text-green-600 dark:text-green-400 mt-1 whitespace-normal">
                    {t('companies.ticker')}: {company.ipo.ticker} · {t('companies.sharePrice')}: $
                    {company.ipo.sharePrice}
                  </div>
                </div>
                <span className="text-2xl">📈</span>
              </div>
            </div>
          ) : (
            isCEO && (
              <div className="col-span-2 md:col-span-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 sm:p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{t('companies.goPublic')}</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 whitespace-normal">
                      {t('companies.ipoFee')}: {formatMoneyExact(ipoRequirements.fee)} ·{' '}
                      {t('companies.ipoRequirements', { min: ipoRequirements.minLevel })}
                    </p>
                  </div>
                  <button
                    onClick={handleIPO}
                    disabled={ipoLoading}
                    className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 disabled:opacity-50"
                  >
                    {ipoLoading ? t('common.loading') : t('companies.initiateIPO')}
                  </button>
                </div>
                {ipoError && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{ipoError}</p>}
              </div>
            )
          )}

          {!isMember && !company.ipo?.listed && (
            <div className="col-span-2 md:col-span-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 sm:p-4">
              {user?.companyId ? (
                <div className="flex items-center gap-3">
                  <span className="text-2xl">ℹ️</span>
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                      {t('companies.alreadyInCompany')}
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t('companies.leaveFirstToApply')}</p>
                  </div>
                </div>
              ) : applySuccess || company.hasPendingApplication ? (
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-2xl shrink-0">⏳</span>
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-yellow-700 dark:text-yellow-400">
                        {t('companies.applicationPending')}
                      </h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {t('companies.waitingForApproval')}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={handleCancelApplication}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700"
                  >
                    {t('companies.cancelApplication')}
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                      {t('companies.applyToJoin')}
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t('companies.applyDescription')}</p>
                  </div>
                  <button
                    onClick={handleApply}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
                  >
                    {t('companies.apply')}
                  </button>
                </div>
              )}
              {applyError && <p className="text-xs text-red-600 dark:text-red-400 mt-2">{applyError}</p>}
            </div>
          )}
        </div>
      )}

      {tab === 'members' && (
        <div className="space-y-3 sm:space-y-4">
          {isOfficer && (
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 sm:p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{t('companies.inviteMember')}</h3>
                <span
                  className={`text-xs px-2 py-1 rounded-lg ${(company.members?.length || 0) >= company.maxMembers ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'}`}
                >
                  {t('companies.memberCount', { count: company.members?.length || 0, max: company.maxMembers })}
                </span>
              </div>
              {(company.members?.length || 0) >= company.maxMembers ? (
                <p className="text-sm text-red-600 dark:text-red-400">{t('companies.maxMembersReached')}</p>
              ) : (
                <form
                  className="flex flex-col sm:flex-row gap-2 sm:items-center"
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleInvite();
                  }}
                >
                  <label className="flex flex-1 flex-col min-w-0">
                    <span className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                      {t('companies.usernameLabel')}
                    </span>
                    <input
                      value={inviteUsername}
                      onChange={(e) => setInviteUsername(e.target.value)}
                      placeholder={t('companies.usernamePlaceholder')}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm min-w-0"
                    />
                  </label>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 self-start sm:self-auto"
                  >
                    {t('companies.invite')}
                  </button>
                </form>
              )}
              {inviteError && <p className="text-sm text-red-600 dark:text-red-400 mt-2">{inviteError}</p>}
            </div>
          )}
          <div className="space-y-2">
            {company.members?.map((member) => {
              const memberUser = member.userId;
              const uid = memberUser?._id || memberUser;
              const isSelf = uid?.toString() === user?._id?.toString();
              const cos = typeof memberUser === 'object' && memberUser?.cosmetics ? memberUser.cosmetics : null;
              const us = cos?.usernameStyle;
              const memberNameStyle = usernameTextStyle(us);
              const memberNameClass = [
                usernameGradientClassName(us),
                isAnimatedUsername(us) ? USERNAME_ANIMATED_CLASS : '',
                cos?.usernameEffect ? USERNAME_EFFECT_CLASS[cos.usernameEffect] : '',
              ]
                .filter(Boolean)
                .join(' ');
              return (
                <div
                  key={member._id}
                  className="flex flex-wrap items-center justify-between gap-x-2 gap-y-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <Avatar
                      avatar={typeof memberUser === 'object' ? memberUser?.avatar : undefined}
                      name={typeof memberUser === 'object' && memberUser?.username ? memberUser.username : '?'}
                      className="w-8 h-8"
                      textClassName="text-sm font-medium"
                      frame={cos?.avatarFrame}
                    />
                    <div className="min-w-0">
                      <span
                        className="text-sm font-medium text-gray-900 dark:text-white truncate block"
                        style={memberNameStyle}
                      >
                        <span className={memberNameClass}>
                          {typeof memberUser === 'object' && memberUser?.username ? memberUser.username : 'Unknown'}
                        </span>
                        {isSelf && ' (You)'}
                      </span>
                      <div className="text-xs text-gray-500 dark:text-gray-400 whitespace-normal">
                        {t(`companies.role${member.role.charAt(0).toUpperCase() + member.role.slice(1)}`)} ·{' '}
                        {member.shares} shares
                      </div>
                    </div>
                  </div>
                  {isCEO && !isSelf && (
                    <div className="flex flex-wrap gap-x-2 gap-y-1 justify-end">
                      {member.role === 'recruit' && (
                        <button
                          onClick={() => changeRole(id, uid, 'member')}
                          className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          {t('companies.promote')}
                        </button>
                      )}
                      {member.role === 'member' && (
                        <>
                          <button
                            onClick={() => changeRole(id, uid, 'officer')}
                            className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                          >
                            {t('companies.promote')}
                          </button>
                          <button
                            onClick={() => changeRole(id, uid, 'recruit')}
                            className="text-xs text-yellow-600 dark:text-yellow-400 hover:underline"
                          >
                            {t('companies.demote')}
                          </button>
                        </>
                      )}
                      {member.role === 'officer' && (
                        <>
                          <button
                            onClick={() => changeRole(id, uid, 'director')}
                            className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                          >
                            {t('companies.promote')}
                          </button>
                          <button
                            onClick={() => changeRole(id, uid, 'member')}
                            className="text-xs text-yellow-600 dark:text-yellow-400 hover:underline"
                          >
                            {t('companies.demote')}
                          </button>
                        </>
                      )}
                      {member.role === 'director' && (
                        <button
                          onClick={() => changeRole(id, uid, 'officer')}
                          className="text-xs text-yellow-600 dark:text-yellow-400 hover:underline"
                        >
                          {t('companies.demote')}
                        </button>
                      )}
                      {['director', 'officer', 'member'].includes(member.role) && (
                        <button
                          onClick={() => setTransferTarget(uid)}
                          className="text-xs text-purple-600 dark:text-purple-400 hover:underline"
                        >
                          {t('companies.transferLeadership')}
                        </button>
                      )}
                      <button
                        onClick={() => removeMember(id, uid)}
                        className="text-xs text-red-600 dark:text-red-400 hover:underline"
                      >
                        {t('companies.remove')}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {isMember && isCEO && (
            <div className="bg-white dark:bg-gray-800 border border-amber-200 dark:border-amber-700/40 rounded-lg p-3 sm:p-4">
              <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-300 mb-2">
                {t('companies.ceoCannotLeave')}
              </h3>
              <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
                {t('companies.ceoCannotLeaveDescription')}
              </p>
              <div className="flex flex-wrap gap-2">
                {company.members
                  ?.filter((m) => ['director', 'officer', 'member'].includes(m.role))
                  .map((m) => (
                    <button
                      key={m._id}
                      onClick={() => setTransferTarget(m.userId?._id || m.userId)}
                      className="px-3 py-1.5 bg-purple-600 text-white rounded-lg text-xs hover:bg-purple-700"
                    >
                      {t('companies.transferLeadershipTo', {
                        name: (m.userId && typeof m.userId === 'object' && m.userId.username) || m.username || 'Member',
                      })}
                    </button>
                  ))}
              </div>
            </div>
          )}
          {isMember && !isCEO && (
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 sm:p-4">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
                {t('companies.leaveCompany')}
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">{t('companies.leaveCompanyDescription')}</p>
              <button
                onClick={() => setLeaveConfirmOpen(true)}
                className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700"
              >
                {t('companies.leaveCompany')}
              </button>
            </div>
          )}
        </div>
      )}

      {tab === 'applications' && (
        <div className="space-y-3 sm:space-y-4">
          {isOfficer || user?.role === 'admin' ? (
            <>
              {applications.length === 0 ? (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  <div className="text-3xl mb-2">📋</div>
                  <p>{t('companies.noApplications')}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {applications.map((app) => {
                    const applicant = app.userId;
                    return (
                      <div
                        key={app._id}
                        className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-2">
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <div className="w-8 h-8 bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center text-sm font-medium text-gray-600 dark:text-gray-300 shrink-0">
                              {typeof applicant === 'object' && applicant?.username
                                ? applicant.username.charAt(0).toUpperCase()
                                : '?'}
                            </div>
                            <div className="min-w-0">
                              <span className="text-sm font-medium text-gray-900 dark:text-white block truncate">
                                {typeof applicant === 'object' && applicant?.username ? applicant.username : 'Unknown'}
                                {typeof applicant === 'object' && applicant?.level ? ` (Lv.${applicant.level})` : ''}
                              </span>
                              {app.message && (
                                <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 break-words">
                                  {app.message}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 justify-end">
                            <span
                              className={`text-xs px-2 py-1 rounded-lg ${app.status === 'pending' ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400' : app.status === 'approved' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'}`}
                            >
                              {t(`companies.appStatus${app.status.charAt(0).toUpperCase() + app.status.slice(1)}`)}
                            </span>
                            {app.status === 'pending' && (isOfficer || user?.role === 'admin') && (
                              <div className="flex gap-2">
                                <button
                                  onClick={() => handleApproveApp(app._id)}
                                  className="px-3 py-1 bg-green-600 text-white rounded-lg text-xs hover:bg-green-700"
                                >
                                  {t('companies.approve')}
                                </button>
                                <button
                                  onClick={() => handleRejectApp(app._id)}
                                  className="px-3 py-1 bg-red-600 text-white rounded-lg text-xs hover:bg-red-700"
                                >
                                  {t('companies.reject')}
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">{t('companies.noPermission')}</div>
          )}
        </div>
      )}

      {tab === 'treasury' &&
        (() => {
          const allTxs = company.treasury?.transactions || [];
          const totalTransactionPages = Math.max(1, Math.ceil(allTxs.length / transactionsLimit));
          const currentTxPage = Math.min(transactionsPage, totalTransactionPages);
          const txs = [...allTxs]
            .reverse()
            .slice((currentTxPage - 1) * transactionsLimit, currentTxPage * transactionsLimit);
          const incomeTypes = [
            'deposit',
            'capital_contribution',
            'rent_income',
            'property_sale',
            'loan_disbursement',
            'contract_reward',
            'investment_return',
            'operating_fee',
          ];
          const expenseTypes = ['withdrawal', 'loan_payment', 'property_purchase'];
          const totalIncome = txs.filter((tx) => incomeTypes.includes(tx.type)).reduce((sum, tx) => sum + tx.amount, 0);
          const totalExpenses = txs
            .filter((tx) => expenseTypes.includes(tx.type))
            .reduce((sum, tx) => sum + tx.amount, 0);
          const cashFlow = totalIncome - totalExpenses;
          return (
            <div className="space-y-3 sm:space-y-4">
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 sm:p-4">
                <p className="text-xs sm:text-sm text-blue-700 dark:text-blue-300">
                  {t('companies.treasuryDescription')}
                </p>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4">
                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-2.5 sm:p-4">
                  <div className="text-xs text-gray-500 dark:text-gray-400">{t('companies.treasuryBalance')}</div>
                  <div className="text-base sm:text-lg font-bold text-gray-900 dark:text-white mt-1 break-words">
                    {formatMoney(company.treasury?.balance || 0)}
                  </div>
                </div>
                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-2.5 sm:p-4">
                  <div className="text-xs text-gray-500 dark:text-gray-400">{t('companies.totalIncome')}</div>
                  <div className="text-base sm:text-lg font-bold text-green-600 dark:text-green-400 mt-1 break-words">
                    {formatMoney(totalIncome)}
                  </div>
                </div>
                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-2.5 sm:p-4">
                  <div className="text-xs text-gray-500 dark:text-gray-400">{t('companies.totalExpenses')}</div>
                  <div className="text-base sm:text-lg font-bold text-red-600 dark:text-red-400 mt-1 break-words">
                    {formatMoney(totalExpenses)}
                  </div>
                </div>
                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-2.5 sm:p-4">
                  <div className="text-xs text-gray-500 dark:text-gray-400">{t('companies.monthlyCashFlow')}</div>
                  <div
                    className={`text-base sm:text-lg font-bold mt-1 break-words ${cashFlow >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}
                  >
                    {cashFlow >= 0 ? '+' : ''}
                    {formatMoney(cashFlow)}
                  </div>
                </div>
              </div>
              {isMember && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 sm:p-4">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
                      {t('companies.deposit')}
                    </h3>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                      {t('common.available')}: {formatMoney(user?.balance || 0)}
                    </div>
                    {depositError && <div className="text-xs text-red-600 dark:text-red-400 mb-2">{depositError}</div>}
                    <div className="flex gap-2">
                      <input
                        type="number"
                        value={depositAmount}
                        onChange={(e) => {
                          setDepositAmount(e.target.value);
                          setDepositError('');
                        }}
                        placeholder="$"
                        disabled={depositLoading}
                        className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm disabled:opacity-50"
                      />
                      <button
                        onClick={handleDeposit}
                        disabled={depositLoading || !depositAmount || parseFloat(depositAmount) <= 0}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {depositLoading ? '...' : t('companies.contribute')}
                      </button>
                    </div>
                  </div>
                  {isDirector && (
                    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 sm:p-4">
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
                        {t('companies.withdraw')}
                      </h3>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                        {t('companies.treasuryBalance')}: {formatMoney(company.treasury?.balance || 0)}
                      </div>
                      {withdrawError && (
                        <div className="text-xs text-red-600 dark:text-red-400 mb-2">{withdrawError}</div>
                      )}
                      <div className="flex gap-2">
                        <input
                          type="number"
                          value={withdrawAmount}
                          onChange={(e) => {
                            setWithdrawAmount(e.target.value);
                            setWithdrawError('');
                          }}
                          placeholder="$"
                          disabled={withdrawLoading}
                          className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm disabled:opacity-50"
                        />
                        <button
                          onClick={handleWithdraw}
                          disabled={withdrawLoading || !withdrawAmount || parseFloat(withdrawAmount) <= 0}
                          className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {withdrawLoading ? '...' : t('companies.withdraw')}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                  {t('companies.transactionHistory')}
                </h3>
                {txs.length > 0 ? (
                  <div className="space-y-2">
                    {txs.map((tx) => {
                      const isIncome = incomeTypes.includes(tx.type);
                      const typeIcons = {
                        deposit: '💰',
                        capital_contribution: '💰',
                        rent_income: '🏠',
                        property_sale: '🏷️',
                        loan_disbursement: '🏦',
                        contract_reward: '📋',
                        investment_return: '📈',
                        withdrawal: '💸',
                        loan_payment: '💳',
                        property_purchase: '🏢',
                        operating_fee: '⚙️',
                      };
                      return (
                        <div
                          key={tx._id}
                          className="flex items-center justify-between gap-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="text-lg shrink-0">{typeIcons[tx.type] || '📄'}</span>
                            <div className="min-w-0">
                              <span className="text-sm text-gray-900 dark:text-white block truncate">
                                {tx.description}
                              </span>
                              <div className="text-xs text-gray-500 dark:text-gray-400">
                                {tx.type.replace(/_/g, ' ')}
                              </div>
                            </div>
                          </div>
                          <span
                            className={`text-sm font-medium shrink-0 ${isIncome ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}
                          >
                            {isIncome ? '+' : '-'}${tx.amount.toLocaleString()}
                          </span>
                        </div>
                      );
                    })}
                    {totalTransactionPages > 1 && (
                      <div className="flex justify-center items-center gap-2 pt-2">
                        <button
                          onClick={() => setTransactionsPage((p) => Math.max(1, p - 1))}
                          disabled={currentTxPage <= 1}
                          className="px-3 py-1 text-xs rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-40"
                        >
                          {t('marketplace.previous')}
                        </button>
                        <span className="px-3 py-1 text-xs text-gray-500 dark:text-gray-400">
                          {currentTxPage}/{totalTransactionPages}
                        </span>
                        <button
                          onClick={() => setTransactionsPage((p) => Math.min(totalTransactionPages, p + 1))}
                          disabled={currentTxPage >= totalTransactionPages}
                          className="px-3 py-1 text-xs rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-40"
                        >
                          {t('marketplace.next')}
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                    <div className="text-3xl mb-2">💰</div>
                    <p>{t('companies.noTransactions')}</p>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

      {tab === 'properties' && (
        <div className="space-y-3 sm:space-y-4">
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 sm:p-4">
            <p className="text-xs sm:text-sm text-blue-700 dark:text-blue-300">
              {t('companies.propertiesDescription')}
            </p>
          </div>

          {propertyPurchaseRequests.filter((r) => r.status === 'pending').length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{t('companies.pendingPurchases')}</h3>
              {propertyPurchaseRequests
                .filter((r) => r.status === 'pending')
                .map((req) => {
                  const prop = req.propertyId;
                  const totalVoters = Math.max(1, (company.members?.length || 1) - 1);
                  const yesVotes = (req.votes || []).filter((v) => v.vote === 'yes').length;
                  const noVotes = (req.votes || []).filter((v) => v.vote === 'no').length;
                  const myVote = (req.votes || []).find((v) => normalizeId(v.userId) === normalizeId(user?._id));
                  const requesterId = normalizeId(req.requestedBy);
                  const isProposer = requesterId && requesterId === normalizeId(user?._id);
                  const canVote = isMember && !myVote && !isProposer;
                  const progress = totalVoters > 0 ? (yesVotes / totalVoters) * 100 : 0;
                  const thresholdMet = yesVotes / totalVoters >= 0.5;

                  return (
                    <div
                      key={req._id}
                      className="bg-white dark:bg-gray-800 border-s-4 border-purple-500 border-y border-e border-gray-200 dark:border-gray-700 rounded-lg p-3"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <PropertyImage
                              property={prop || {}}
                              alt={prop?.name}
                              className="w-12 h-12 object-cover rounded-md shrink-0"
                            />
                            <span className="text-sm font-medium text-gray-900 dark:text-white block truncate">
                              {prop?.name || t('companies.unknown')}
                            </span>
                            <span className="text-xs px-2 py-0.5 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 rounded-lg">
                              {t('companies.pending')}
                            </span>
                            {isProposer && (
                              <span className="text-xs px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-lg">
                                {t('companies.proposedByYou')}
                              </span>
                            )}
                            {myVote && (
                              <span className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg">
                                {t('companies.youVoted')} {t(`companies.${myVote.vote}`)}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            {formatMoney(prop?.currentPrice || 0)} · {prop?.type} · {t('companies.proposedBy')}{' '}
                            {typeof req.requestedBy === 'object' ? req.requestedBy.username : t('companies.unknown')}
                          </div>
                          <div className="mt-2">
                            <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                              <span>
                                {t('companies.votes')}: {yesVotes}/{totalVoters} {t('companies.yes')}
                                {noVotes > 0 && `, ${noVotes} ${t('companies.no')}`}
                              </span>
                              <span>{Math.round(progress)}%</span>
                            </div>
                            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                              <div
                                className={`h-2 rounded-full transition-all ${thresholdMet ? 'bg-green-500' : 'bg-purple-500'}`}
                                style={{ width: `${Math.min(100, progress)}%` }}
                              />
                            </div>
                          </div>
                        </div>
                        <div className="shrink-0">
                          {canVote ? (
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleVotePropertyPurchase(req._id, 'yes')}
                                className="px-3 py-1 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700"
                              >
                                {t('companies.yes')}
                              </button>
                              <button
                                onClick={() => handleVotePropertyPurchase(req._id, 'no')}
                                className="px-3 py-1 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700"
                              >
                                {t('companies.no')}
                              </button>
                            </div>
                          ) : (
                            <span className="text-xs text-gray-500 dark:text-gray-400 italic">
                              {isProposer
                                ? t('companies.waitingForVotes')
                                : myVote
                                  ? t('companies.voteRecorded')
                                  : t('companies.membersOnly')}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}

          {companyProperties.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              <div className="text-3xl mb-2">🏠</div>
              <p>{t('companies.noProperties')}</p>
            </div>
          ) : (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{t('companies.properties')}</h3>
              {companyProperties.map((prop) => (
                <div
                  key={prop._id}
                  className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <PropertyImage
                        property={prop}
                        alt={prop.name}
                        className="w-14 h-14 object-cover rounded-md shrink-0"
                      />
                      <div className="min-w-0">
                        <span className="text-sm font-medium text-gray-900 dark:text-white block truncate">
                          {prop.name}
                        </span>
                        <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          {prop.type} · {prop.cityId?.name || 'Unknown'} · {t('properties.rent')}:{' '}
                          {formatMoney(prop.rent || 0)} · {t('properties.occupancy')}: {prop.occupancy || 0}%
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-sm font-medium text-gray-900 dark:text-white">
                        {formatMoney(prop.currentPrice)}
                      </span>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-2 flex-wrap">
                    <Link
                      to={`/property/${prop._id}`}
                      className="px-3 py-1 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                      {t('properties.manage')}
                    </Link>
                    {prop.type !== 'land' && isDirector && (
                      <Link
                        to={`/development?tab=improvements&propertyId=${prop._id}`}
                        className="px-3 py-1 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700"
                      >
                        {t('properties.improve')}
                      </Link>
                    )}
                    {prop.type === 'land' && isDirector && prop.developmentLevel === 0 && (
                      <Link
                        to={`/development?tab=construction&propertyId=${prop._id}`}
                        className="px-3 py-1 text-xs bg-purple-600 text-white rounded-lg hover:bg-purple-700"
                      >
                        {t('companies.startProject')}
                      </Link>
                    )}
                    {isDirector && (
                      <button
                        onClick={() => setSellConfirmPropertyId(prop._id)}
                        className="px-3 py-1 text-xs bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/50"
                      >
                        {t('companies.sellProperty')}
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {companyPropertiesTotalPages > 1 && (
                <div className="flex justify-center gap-2 pt-2">
                  <button
                    onClick={() => setPropertiesPage((p) => Math.max(1, p - 1))}
                    disabled={companyPropertiesPage <= 1}
                    className="px-3 py-1 text-xs rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-40"
                  >
                    {t('marketplace.previous')}
                  </button>
                  <span className="px-3 py-1 text-xs text-gray-500 dark:text-gray-400">
                    {companyPropertiesPage}/{companyPropertiesTotalPages}
                  </span>
                  <button
                    onClick={() => setPropertiesPage((p) => Math.min(companyPropertiesTotalPages, p + 1))}
                    disabled={companyPropertiesPage >= companyPropertiesTotalPages}
                    className="px-3 py-1 text-xs rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-40"
                  >
                    {t('marketplace.next')}
                  </button>
                </div>
              )}
            </div>
          )}
          {company.levelBenefits?.canStartProjects && (
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 sm:p-4">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
                {t('companies.developmentProjects')}
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                {t('companies.developmentProjectsDescription')}
              </p>
              <button
                onClick={() => window.open('/development', '_blank')}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700"
              >
                {t('companies.startProject')}
              </button>
            </div>
          )}
        </div>
      )}

      {tab === 'loans' && (
        <div className="space-y-3 sm:space-y-4">
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 sm:p-4">
            <p className="text-xs sm:text-sm text-blue-700 dark:text-blue-300">{t('companies.loansDescription')}</p>
          </div>

          {isCEO && (
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 sm:p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">🏦</span>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                  {t('companies.companyBankLoan')}
                </h3>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                {t('companies.companyBankLoanDescription')}
              </p>

              {directLoanOptions && (
                <div className="mb-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div className="bg-gray-50 dark:bg-gray-700/50 rounded p-2">
                    <div className="text-gray-500 dark:text-gray-400">{t('companies.companyNetWorth')}</div>
                    <div className="font-medium text-gray-900 dark:text-white">
                      {formatMoney(directLoanOptions.netWorth)}
                    </div>
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-700/50 rounded p-2">
                    <div className="text-gray-500 dark:text-gray-400">{t('companies.maxDebt')}</div>
                    <div className="font-medium text-gray-900 dark:text-white">
                      {formatMoney(directLoanOptions.maxDebt)}
                    </div>
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-700/50 rounded p-2">
                    <div className="text-gray-500 dark:text-gray-400">{t('companies.reputation')}</div>
                    <div className="font-medium text-gray-900 dark:text-white">{directLoanOptions.reputation}</div>
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-700/50 rounded p-2">
                    <div className="text-gray-500 dark:text-gray-400">{t('companies.level')}</div>
                    <div className="font-medium text-gray-900 dark:text-white">{directLoanOptions.level}</div>
                  </div>
                </div>
              )}

              {directLoanOptions?.products?.length === 0 ? (
                <p className="text-xs text-gray-500 dark:text-gray-400">{t('companies.noLoanProducts')}</p>
              ) : (
                <>
                  <div className="space-y-2 mb-3">
                    {(directLoanOptions?.products || []).map((product) => (
                      <div
                        key={product.id}
                        onClick={() => {
                          setDirectLoanProduct(product.id);
                          setDirectLoanAmount('');
                        }}
                        className={`cursor-pointer border rounded-lg p-3 transition-colors ${
                          directLoanProduct === product.id
                            ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                            : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                              {product.name}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                              {product.description}
                            </div>
                          </div>
                          <div className="text-end shrink-0">
                            <div className="text-sm font-bold text-purple-600 dark:text-purple-400">
                              {(product.interestRate * 100).toFixed(1)}%
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              {t('companies.interestRate')}
                            </div>
                          </div>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-500 dark:text-gray-400">
                          <span>
                            {t('companies.loanRange')}: {formatMoney(product.minPrincipal)} -{' '}
                            {formatMoney(product.maxPrincipal)}
                          </span>
                          <span>
                            · {t('companies.durations')}:{' '}
                            {product.durations.map((d) => `${d} ${t('companies.months')}`).join(', ')}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {directLoanProduct && (
                    <div className="space-y-3 border-t border-gray-200 dark:border-gray-700 pt-3">
                      <div className="flex flex-wrap gap-2">
                        <input
                          type="number"
                          value={directLoanAmount}
                          onChange={(e) => setDirectLoanAmount(e.target.value)}
                          placeholder={t('companies.amount')}
                          className="w-full sm:flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                        />
                        <select
                          value={directLoanDuration}
                          onChange={(e) => setDirectLoanDuration(e.target.value)}
                          className="w-full sm:w-auto px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                        >
                          <option value=""> {t('companies.selectDuration')}</option>
                          {(directLoanOptions?.products.find((p) => p.id === directLoanProduct)?.durations || []).map(
                            (d) => (
                              <option key={d} value={d}>
                                {d} {t('companies.months')}
                              </option>
                            ),
                          )}
                        </select>
                        <button
                          onClick={handleDirectLoan}
                          disabled={directLoanLoading || !directLoanAmount || !directLoanDuration}
                          className="w-full sm:w-auto px-4 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 disabled:opacity-50"
                        >
                          {directLoanLoading ? t('common.loading') : t('companies.takeLoan')}
                        </button>
                      </div>

                      {(() => {
                        const product = directLoanOptions?.products.find((p) => p.id === directLoanProduct);
                        const principal = parseFloat(directLoanAmount) || 0;
                        const ticks = parseInt(directLoanDuration) || 0;
                        if (!product || !principal || !ticks) return null;
                        const interest = Math.round(principal * product.interestRate);
                        const total = principal + interest;
                        const payment = Math.ceil(total / ticks);
                        return (
                          <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3 text-xs">
                            <div className="font-medium text-purple-800 dark:text-purple-300 mb-1">
                              {t('companies.loanTermsPreview')}
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                              <div>
                                <div className="text-gray-500 dark:text-gray-400">{t('companies.principal')}</div>
                                <div className="font-medium text-gray-900 dark:text-white">
                                  {formatMoney(principal)}
                                </div>
                              </div>
                              <div>
                                <div className="text-gray-500 dark:text-gray-400">{t('companies.totalInterest')}</div>
                                <div className="font-medium text-gray-900 dark:text-white">{formatMoney(interest)}</div>
                              </div>
                              <div>
                                <div className="text-gray-500 dark:text-gray-400">{t('companies.totalRepayment')}</div>
                                <div className="font-medium text-gray-900 dark:text-white">{formatMoney(total)}</div>
                              </div>
                              <div>
                                <div className="text-gray-500 dark:text-gray-400">{t('companies.paymentPerTick')}</div>
                                <div className="font-medium text-gray-900 dark:text-white">{formatMoney(payment)}</div>
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </>
              )}
              {directLoanError && <p className="text-xs text-red-600 dark:text-red-400 mt-2">{directLoanError}</p>}
            </div>
          )}

          {isDirector && (
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 sm:p-4">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
                {t('companies.requestLoanVote')}
              </h3>
              <div className="flex flex-wrap gap-2">
                <input
                  type="number"
                  value={loanReqAmount}
                  onChange={(e) => setLoanReqAmount(e.target.value)}
                  placeholder={t('companies.amount')}
                  className="w-full sm:flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                />
                <select
                  value={loanReqDuration}
                  onChange={(e) => setLoanReqDuration(e.target.value)}
                  className="w-1/3 sm:w-auto px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                >
                  <option value="">{t('companies.durationMonths')}</option>
                  {[6, 12, 24, 36, 48, 60].map((d) => (
                    <option key={d} value={d}>
                      {d} {t('companies.months')}
                    </option>
                  ))}
                </select>
                <select
                  value={loanReqType}
                  onChange={(e) => setLoanReqType(e.target.value)}
                  className="w-1/3 sm:flex-none px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                >
                  <option value="business">{t('companies.loanTypeBusiness')}</option>
                  <option value="expansion">{t('companies.loanTypeExpansion')}</option>
                </select>
                <button
                  onClick={handleLoanRequest}
                  className="w-full sm:w-auto px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
                >
                  {t('companies.requestVote')}
                </button>
              </div>
              {(() => {
                const principal = parseFloat(loanReqAmount) || 0;
                const ticks = parseInt(loanReqDuration) || 0;
                if (!principal || !ticks) return null;
                const reputation = company.reputation || 0;
                const reputationDiscount = Math.min(0.02, reputation * 0.0001);
                const levelDiscount = company.levelBenefits?.loanInterestDiscount || 0;
                const baseRate = 0.08 - reputationDiscount - levelDiscount;
                const rate = Math.max(0.03, baseRate);
                const interest = Math.round(principal * rate);
                const total = principal + interest;
                const payment = Math.ceil(total / ticks);
                return (
                  <div className="mt-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 text-xs">
                    <div className="font-medium text-blue-800 dark:text-blue-300 mb-1">
                      {t('companies.loanTermsPreview')}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div>
                        <div className="text-gray-500 dark:text-gray-400">{t('companies.principal')}</div>
                        <div className="font-medium text-gray-900 dark:text-white">{formatMoney(principal)}</div>
                      </div>
                      <div>
                        <div className="text-gray-500 dark:text-gray-400">{t('companies.interestRate')}</div>
                        <div className="font-medium text-gray-900 dark:text-white">{(rate * 100).toFixed(1)}%</div>
                      </div>
                      <div>
                        <div className="text-gray-500 dark:text-gray-400">{t('companies.totalRepayment')}</div>
                        <div className="font-medium text-gray-900 dark:text-white">{formatMoney(total)}</div>
                      </div>
                      <div>
                        <div className="text-gray-500 dark:text-gray-400">{t('companies.paymentPerTick')}</div>
                        <div className="font-medium text-gray-900 dark:text-white">{formatMoney(payment)}</div>
                      </div>
                    </div>
                    <div className="mt-1 text-gray-500 dark:text-gray-400">
                      {t('companies.totalInterest')}: {formatMoney(interest)} · {ticks} {t('companies.months')}
                    </div>
                  </div>
                );
              })()}
              {loanReqError && <p className="text-xs text-red-600 dark:text-red-400 mt-2">{loanReqError}</p>}
            </div>
          )}

          {loanRequests.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{t('companies.loanRequests')}</h3>
              {loanRequests.map((req) => {
                const totalVoters = Math.max(1, (company.members?.length || 1) - 1);
                const yesVotes = (req.votes || []).filter((v) => v.vote === 'yes').length;
                const noVotes = (req.votes || []).filter((v) => v.vote === 'no').length;
                const myVote = (req.votes || []).find((v) => normalizeId(v.userId) === normalizeId(user?._id));
                const requesterId = normalizeId(req.requestedBy);
                const isProposer = requesterId && requesterId === normalizeId(user?._id);
                const canVote = isMember && !myVote && !isProposer && req.status === 'pending';
                const canExecute = isCEO && req.status === 'approved';
                const progress = totalVoters > 0 ? (yesVotes / totalVoters) * 100 : 0;
                const thresholdMet = yesVotes / totalVoters >= 0.5;

                return (
                  <div
                    key={req._id}
                    className="bg-white dark:bg-gray-800 border-s-4 border-purple-500 border-y border-e border-gray-200 dark:border-gray-700 rounded-lg p-3"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-gray-900 dark:text-white block truncate">
                            {formatMoney(req.principal)} {req.loanType} {t('companies.loan')}
                          </span>
                          <span
                            className={`text-xs px-2 py-0.5 rounded-lg ${
                              req.status === 'pending'
                                ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
                                : req.status === 'approved'
                                  ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                                  : req.status === 'executed'
                                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                                    : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                            }`}
                          >
                            {t(`companies.loanReqStatus${req.status.charAt(0).toUpperCase() + req.status.slice(1)}`)}
                          </span>
                          {isProposer && (
                            <span className="text-xs px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-lg">
                              {t('companies.proposedByYou')}
                            </span>
                          )}
                          {myVote && (
                            <span className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg">
                              {t('companies.youVoted')} {t(`companies.${myVote.vote}`)}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          {t('companies.by')}{' '}
                          {typeof req.requestedBy === 'object' ? req.requestedBy.username : t('companies.unknown')} ·{' '}
                          {req.durationTicks} {t('companies.months')}
                        </div>
                        <div className="mt-2">
                          <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                            <span>
                              {t('companies.votes')}: {yesVotes}/{totalVoters} {t('companies.yes')}
                              {noVotes > 0 && `, ${noVotes} ${t('companies.no')}`}
                            </span>
                            <span>{Math.round(progress)}%</span>
                          </div>
                          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                            <div
                              className={`h-2 rounded-full transition-all ${thresholdMet ? 'bg-green-500' : 'bg-purple-500'}`}
                              style={{ width: `${Math.min(100, progress)}%` }}
                            />
                          </div>
                        </div>
                      </div>
                      <div className="shrink-0">
                        {canVote ? (
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleVoteLoan(req._id, 'yes')}
                              className="px-3 py-1 bg-green-600 text-white rounded-lg text-xs hover:bg-green-700"
                            >
                              {t('companies.yes')}
                            </button>
                            <button
                              onClick={() => handleVoteLoan(req._id, 'no')}
                              className="px-3 py-1 bg-red-600 text-white rounded-lg text-xs hover:bg-red-700"
                            >
                              {t('companies.no')}
                            </button>
                          </div>
                        ) : canExecute ? (
                          <button
                            onClick={() => handleExecuteLoan(req._id)}
                            className="px-3 py-1 bg-blue-600 text-white rounded-lg text-xs hover:bg-blue-700"
                          >
                            {t('companies.executeLoan')}
                          </button>
                        ) : (
                          <span className="text-xs text-gray-500 dark:text-gray-400 italic">
                            {isProposer
                              ? t('companies.waitingForVotes')
                              : myVote
                                ? t('companies.voteRecorded')
                                : t('companies.membersOnly')}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {(() => {
            const activeLoans = companyLoans.filter((l) => l.active);
            return (
              <>
                {activeLoans.length === 0 && loanRequests.length === 0 && (
                  <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                    <div className="text-3xl mb-2">🏦</div>
                    <p>{t('companies.noLoans')}</p>
                  </div>
                )}
                {activeLoans.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                      {t('companies.activeLoans')}
                    </h3>
                    {activeLoans.map((loan) => {
                      const loanDuration = loan.durationTicks || loan.ticksRemaining || 0;
                      const remaining = Math.max(0, loan.ticksRemaining || 0);
                      const paidTicks = Math.max(0, loanDuration - remaining);
                      const progress = loanDuration > 0 ? (paidTicks / loanDuration) * 100 : 0;
                      return (
                        <div
                          key={loan._id}
                          className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-2.5 sm:p-3"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-2 mb-2">
                            <div className="min-w-0 flex-1">
                              <div className="text-xs sm:text-sm font-medium text-gray-900 dark:text-white truncate">
                                {loan.type} {t('companies.loan')}
                              </div>
                              <div className="text-xs text-gray-500 dark:text-gray-400 whitespace-normal">
                                {t('companies.principal')}: ${loan.principal.toLocaleString()} ·{' '}
                                {t('companies.interest')}: {(loan.interestRate * 100).toFixed(1)}%
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 justify-end">
                              <span
                                className={`text-xs px-2 py-1 rounded-lg ${loan.active ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-gray-100 dark:bg-gray-700 text-gray-500'}`}
                              >
                                {loan.active ? t('companies.active') : t('companies.paid')}
                              </span>
                              {loan.active && isDirector && (
                                <div className="flex gap-1 shrink-0">
                                  <input
                                    type="number"
                                    value={repayAmounts[loan._id] || ''}
                                    onChange={(e) =>
                                      setRepayAmounts((prev) => ({ ...prev, [loan._id]: e.target.value }))
                                    }
                                    placeholder={t('companies.repayAmount')}
                                    className="w-20 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-xs"
                                  />
                                  <button
                                    onClick={() => handleRepay(loan._id)}
                                    className="px-3 py-1 bg-green-600 text-white rounded-lg text-xs hover:bg-green-700"
                                  >
                                    {t('companies.repay')}
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                            {t('companies.paymentPerTick')}: $
                            {loan.paymentPerTick?.toLocaleString?.() || loan.paymentPerTick || 0} ·{' '}
                            {t('companies.remaining')}: $
                            {loan.remainingBalance?.toLocaleString?.() || loan.remainingBalance || 0}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                            {t('common.remaining')}: {remaining} {t('companies.months')} / {t('companies.duration')}:{' '}
                            {loanDuration} {t('companies.months')}
                          </div>
                          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                            <div
                              className="bg-blue-600 h-2 rounded-full transition-all"
                              style={{ width: `${Math.min(100, progress)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            );
          })()}
        </div>
      )}

      {tab === 'missions' &&
        (() => {
          const missions = companyMissions;
          const missionTypeKeys = {
            daily: 'companies.missionTypeDaily',
            weekly: 'companies.missionTypeWeekly',
            milestone: 'companies.missionTypeMilestone',
          };
          const handleClaim = async (missionId) => {
            if (claimingMissionId) return;
            setClaimingMissionId(missionId);
            try {
              await claimCompanyMissionReward(id, missionId);
            } catch {
            } finally {
              setClaimingMissionId(null);
            }
          };
          if (missionsError) {
            return (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                <p className="text-sm mb-3">{t('common.error')}</p>
                <button
                  onClick={() => {
                    setMissionsError(false);
                    fetchCompanyMissions(id).catch(() => setMissionsError(true));
                  }}
                  className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700"
                >
                  {t('common.retry')}
                </button>
              </div>
            );
          }
          if (!missions) {
            return (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                <p className="text-sm">{t('common.loading')}</p>
              </div>
            );
          }
          return (
            <div className="space-y-3 sm:space-y-4">
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 sm:p-4">
                <p className="text-xs sm:text-sm text-blue-700 dark:text-blue-300">
                  {t('companies.missionsDescription')}
                </p>
              </div>

              {missions?.stats && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
                  <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border dark:border-gray-700">
                    <p className="text-xs text-gray-500 dark:text-gray-400">{t('companies.missionStatActive')}</p>
                    <p className="text-lg font-bold">{missions.stats.totalActive}</p>
                  </div>
                  <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border dark:border-gray-700">
                    <p className="text-xs text-gray-500 dark:text-gray-400">{t('companies.missionStatCompleted')}</p>
                    <p className="text-lg font-bold text-green-600">{missions.stats.totalCompleted}</p>
                  </div>
                  <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border dark:border-gray-700">
                    <p className="text-xs text-gray-500 dark:text-gray-400">{t('companies.missionStatXPEarned')}</p>
                    <p className="text-lg font-bold text-purple-600">{missions.stats.totalXP.toLocaleString()}</p>
                  </div>
                  <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border dark:border-gray-700">
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {t('companies.missionStatTreasuryEarned')}
                    </p>
                    <p className="text-lg font-bold text-yellow-600">
                      ${missions.stats.totalTreasury.toLocaleString()}
                    </p>
                  </div>
                </div>
              )}

              {missions?.active?.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-2 dark:text-gray-200">{t('companies.missionsActive')}</h3>
                  <div className="space-y-2">
                    {missions.active.map((m) => (
                      <div
                        key={m._id}
                        className="bg-white dark:bg-gray-800 rounded-lg p-3 sm:p-4 border dark:border-gray-700"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-lg">{m.definition?.icon || '📋'}</span>
                              <span className="font-medium text-sm dark:text-gray-200">
                                {m.definition?.name || m.missionId}
                              </span>
                              <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
                                {t(missionTypeKeys[m.definition?.type] || 'companies.missionTypeMilestone')}
                              </span>
                            </div>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{m.definition?.description}</p>
                            <div className="mt-2">
                              <div className="flex items-center justify-between text-xs mb-1">
                                <span className="text-gray-500 dark:text-gray-400">
                                  {m.progress} / {m.target}
                                </span>
                                <span className="text-gray-500 dark:text-gray-400">{m.percentage}%</span>
                              </div>
                              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                                <div
                                  className="bg-blue-600 h-2 rounded-full transition-all"
                                  style={{ width: `${m.percentage}%` }}
                                />
                              </div>
                            </div>
                            {m.contributors?.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1">
                                <span className="text-xs text-gray-400">{t('companies.missionContributors')}:</span>
                                {m.contributors.map((c) => {
                                  const contributorId = c.userId?._id || c.userId;
                                  return (
                                    <span
                                      key={contributorId}
                                      className="text-xs bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded"
                                    >
                                      {c.userId?.username ||
                                        (typeof contributorId === 'string' ? `${contributorId.slice(0, 8)}…` : '')}
                                    </span>
                                  );
                                })}
                              </div>
                            )}
                            <div className="mt-2 flex items-center gap-3 text-xs">
                              {m.definition?.rewards?.xp > 0 && (
                                <span className="text-purple-600">+{m.definition.rewards.xp} XP</span>
                              )}
                              {m.definition?.rewards?.treasury > 0 && (
                                <span className="text-yellow-600">
                                  +${m.definition.rewards.treasury.toLocaleString()}
                                </span>
                              )}
                              {m.definition?.rewards?.reputation > 0 && (
                                <span className="text-blue-600">+{m.definition.rewards.reputation} Rep</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {missions?.completed?.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-2 dark:text-gray-200">
                    {t('companies.missionsReadyToClaim')}
                  </h3>
                  <div className="space-y-2">
                    {missions.completed.map((m) => (
                      <div
                        key={m._id}
                        className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 sm:p-4 border border-green-200 dark:border-green-800"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <span className="text-lg">{m.definition?.icon || '✅'}</span>
                            <div>
                              <span className="font-medium text-sm dark:text-gray-200">
                                {m.definition?.name || m.missionId}
                              </span>
                              <p className="text-xs text-gray-500 dark:text-gray-400">{m.definition?.description}</p>
                            </div>
                          </div>
                          <button
                            onClick={() => handleClaim(m.missionId)}
                            disabled={claimingMissionId === m.missionId}
                            className="px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {claimingMissionId === m.missionId
                              ? t('common.loading')
                              : t('companies.missionClaimReward')}
                          </button>
                        </div>
                        <div className="mt-2 flex items-center gap-3 text-xs">
                          {m.definition?.rewards?.xp > 0 && (
                            <span className="text-purple-600">+{m.definition.rewards.xp} XP</span>
                          )}
                          {m.definition?.rewards?.treasury > 0 && (
                            <span className="text-yellow-600">+${m.definition.rewards.treasury.toLocaleString()}</span>
                          )}
                          {m.definition?.rewards?.reputation > 0 && (
                            <span className="text-blue-600">+{m.definition.rewards.reputation} Rep</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {missions?.claimed?.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-2 dark:text-gray-200">{t('companies.missionsClaimed')}</h3>
                  <div className="space-y-1">
                    {missions.claimed.map((m) => (
                      <div
                        key={m._id}
                        className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 py-1"
                      >
                        <span>{m.definition?.icon || '✓'}</span>
                        <span>{m.definition?.name || m.missionId}</span>
                        <span className="text-green-600">{t('companies.missionCompleted')}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!missions?.active?.length && !missions?.completed?.length && !missions?.claimed?.length && (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  <p className="text-sm">{t('companies.noMissions')}</p>
                </div>
              )}
            </div>
          );
        })()}

      {tab === 'contracts' && (
        <div className="space-y-3 sm:space-y-4">
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 sm:p-4">
            <p className="text-xs sm:text-sm text-blue-700 dark:text-blue-300">{t('companies.contractsDescription')}</p>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {['active', 'available', 'proposed', 'history'].map((st) => (
              <button
                key={st}
                onClick={() => setContractSubTab(st)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap ${
                  contractSubTab === st
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                }`}
              >
                {t(`companies.contractSubTab${st.charAt(0).toUpperCase() + st.slice(1)}`)}
              </button>
            ))}
          </div>
          {contractSubTab === 'available' && (
            <ContractAvailableList
              contracts={contracts}
              company={company}
              isDirector={isDirector}
              t={t}
              id={id}
              highlightId={contractIdParam}
              setContracts={setContracts}
              fetchContracts={fetchContracts}
              proposeContract={proposeContract}
            />
          )}
          {contractSubTab === 'proposed' && (
            <ContractProposalList
              contracts={contracts}
              company={company}
              user={user}
              t={t}
              id={id}
              highlightId={contractIdParam}
              setContracts={setContracts}
              fetchContracts={fetchContracts}
              voteContractProposal={voteContractProposal}
              fetchCompany={fetchCompany}
            />
          )}
          {contractSubTab === 'active' && (
            <ContractActiveList contracts={contracts} t={t} highlightId={contractIdParam} />
          )}
          {contractSubTab === 'history' && (
            <ContractHistoryList contracts={contractHistory} t={t} highlightId={contractIdParam} />
          )}
        </div>
      )}

      {tab === 'investments' && (
        <div className="space-y-3 sm:space-y-4">
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 sm:p-4">
            <p className="text-xs sm:text-sm text-blue-700 dark:text-blue-300">
              {t('companies.investmentsDescription')}
            </p>
          </div>

          {investmentPerformance && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3">
                <div className="text-xs text-gray-500 dark:text-gray-400">{t('companies.totalInvested')}</div>
                <div className="text-sm font-bold text-gray-900 dark:text-white">
                  {formatMoney(investmentPerformance.totalInvested)}
                </div>
              </div>
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3">
                <div className="text-xs text-gray-500 dark:text-gray-400">{t('companies.currentValue')}</div>
                <div className="text-sm font-bold text-gray-900 dark:text-white">
                  {formatMoney(investmentPerformance.currentValue)}
                </div>
              </div>
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3">
                <div className="text-xs text-gray-500 dark:text-gray-400">{t('companies.unrealizedProfit')}</div>
                <div
                  className={`text-sm font-bold ${investmentPerformance.unrealizedProfit >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}
                >
                  {investmentPerformance.unrealizedProfit >= 0 ? '+' : ''}
                  {formatMoney(investmentPerformance.unrealizedProfit)}
                </div>
              </div>
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3">
                <div className="text-xs text-gray-500 dark:text-gray-400">{t('companies.maturedProfit')}</div>
                <div
                  className={`text-sm font-bold ${investmentPerformance.maturedProfit >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}
                >
                  {investmentPerformance.maturedProfit >= 0 ? '+' : ''}
                  {formatMoney(investmentPerformance.maturedProfit)}
                </div>
              </div>
            </div>
          )}

          <div className="flex gap-2 overflow-x-auto pb-1">
            {['active', 'opportunities', 'proposals', 'history'].map((st) => (
              <button
                key={st}
                onClick={() => setInvestmentSubTab(st)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap ${
                  investmentSubTab === st
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                }`}
              >
                {t(`companies.investmentSubTab${st.charAt(0).toUpperCase() + st.slice(1)}`)}
              </button>
            ))}
          </div>

          {investmentSubTab === 'opportunities' && (
            <InvestmentOpportunitiesList
              products={investmentProducts}
              isDirector={isDirector}
              t={t}
              selectedInvestmentProduct={selectedInvestmentProduct}
              setSelectedInvestmentProduct={setSelectedInvestmentProduct}
              investAmount={investAmount}
              setInvestAmount={setInvestAmount}
              handleInvest={handleInvest}
              investmentLoading={investmentLoading}
              investmentError={investmentError}
            />
          )}

          {investmentSubTab === 'proposals' && (
            <InvestmentProposalList
              investments={investments}
              company={company}
              user={user}
              t={t}
              id={id}
              setInvestments={setInvestments}
              setInvestmentPerformance={setInvestmentPerformance}
              fetchInvestments={fetchInvestments}
              fetchInvestmentPerformance={fetchInvestmentPerformance}
              voteInvestmentProposal={voteInvestmentProposal}
              cancelInvestmentProposal={cancelInvestmentProposal}
              fetchCompany={fetchCompany}
            />
          )}

          {investmentSubTab === 'active' && <InvestmentActiveList investments={investments} t={t} />}

          {investmentSubTab === 'history' && <InvestmentHistoryList investments={investments} t={t} />}
        </div>
      )}

      {tab === 'auctions' && (
        <div className="space-y-3">
          {auctionProposals.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              <div className="text-3xl mb-2">🏢</div>
              <p>{t('companies.noAuctionProposals')}</p>
            </div>
          ) : (
            auctionProposals.map((proposal) => {
              const auctionObj = proposal.auctionId || {};
              const propertyObj = auctionObj.propertyId || {};
              const proposer =
                typeof proposal.requestedBy === 'object' && proposal.requestedBy?.username
                  ? proposal.requestedBy.username
                  : proposal.requestedBy?.toString?.() || '';
              const yesVotes = (proposal.votes || []).filter((v) => v.vote === 'yes').length;
              const myVote = (proposal.votes || []).find(
                (v) => normalizeId(v.userId?._id || v.userId) === normalizeId(user?._id),
              );
              const requesterId = normalizeId(proposal.requestedBy?._id || proposal.requestedBy);
              const isProposer = requesterId === normalizeId(user?._id);
              const canVote = isMember && proposal.status === 'pending' && !myVote && !isProposer;

              // Backend-authoritative voting deadline (votingEndsAt), never the
              // auction's total remaining duration.
              const votingEndsAt = proposal.votingEndsAt ? new Date(proposal.votingEndsAt).getTime() : null;
              const remainingMs = votingEndsAt ? votingEndsAt - now : 0;
              const remainingH = Math.max(0, Math.floor(remainingMs / (60 * 60 * 1000)));
              const remainingM = Math.max(0, Math.floor((remainingMs % (60 * 60 * 1000)) / (60 * 1000)));
              const noVotes = (proposal.votes || []).filter((v) => v.vote === 'no').length;
              const isDeepLinked = proposalIdParam && proposal._id?.toString() === proposalIdParam.toString();

              return (
                <div
                  key={proposal._id}
                  id={`auction-proposal-${proposal._id}`}
                  className={`bg-white dark:bg-gray-800 border rounded-lg p-3 sm:p-4 ${
                    isDeepLinked
                      ? 'border-blue-500 ring-2 ring-blue-500/40 shadow-lg'
                      : 'border-gray-200 dark:border-gray-700'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-gray-900 dark:text-white">
                          {t('companies.auctionBidProposal')}
                        </span>
                        <span
                          className={`text-xs px-2 py-0.5 rounded ${
                            proposal.status === 'pending' || proposal.status === 'resolving'
                              ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
                              : proposal.status === 'approved' || proposal.status === 'executed'
                                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                                : proposal.status === 'rejected'
                                  ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                          }`}
                        >
                          {proposal.status === 'pending' || proposal.status === 'resolving'
                            ? t('companies.pending')
                            : proposal.status === 'approved' || proposal.status === 'executed'
                              ? t('common.approved')
                              : proposal.status === 'rejected'
                                ? t('common.rejected')
                                : t('companies.auctionBidStatusExpired')}
                        </span>
                      </div>

                      <div className="mt-1.5 space-y-0.5 text-xs text-gray-500 dark:text-gray-400">
                        <div className="flex items-center gap-1">
                          <span className="inline-block w-4 text-center">🏠</span>
                          <span className="truncate">
                            {propertyObj.name ||
                              (auctionObj._id
                                ? `${t('companies.propertyPurchase')} #${auctionObj._id.toString().slice(-6)}`
                                : t('companies.unknown'))}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="inline-block w-4 text-center">💰</span>
                          <span>
                            {t('auctions.bidAmount')}:{' '}
                            <span className="font-semibold text-gray-900 dark:text-white">
                              {formatMoney(proposal.amount || 0)}
                            </span>
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="inline-block w-4 text-center">👤</span>
                          <span>
                            {t('companies.proposedBy')}: {proposer || t('companies.unknown')}
                            {isProposer && (
                              <span className="ms-1 text-xs px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded">
                                {t('companies.proposedByYou')}
                              </span>
                            )}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="inline-block w-4 text-center">🗳️</span>
                          <span className="whitespace-normal">
                            {t('companies.yes')}: {yesVotes}
                            <span className="mx-1 text-gray-400">·</span>
                            {t('companies.no')}: {noVotes}
                          </span>
                        </div>
                        {proposal.status === 'pending' && votingEndsAt && (
                          <div className="flex items-center gap-1">
                            <span className="inline-block w-4 text-center">⏳</span>
                            <span className="whitespace-normal">
                              {t('companies.auctionBidExpiresIn')}: {remainingH}h {remainingM}m
                            </span>
                          </div>
                        )}
                        {proposal.status === 'approved' && proposal.resolution && (
                          <div className="flex items-center gap-1">
                            <span className="inline-block w-4 text-center">✅</span>
                            <span className="whitespace-normal">
                              {t('companies.yes')}: {proposal.resolution.yes}
                              <span className="mx-1 text-gray-400">·</span>
                              {t('companies.no')}: {proposal.resolution.no}
                            </span>
                          </div>
                        )}
                        <div className="flex items-center gap-1">
                          <span className="inline-block w-4 text-center">🗯️</span>
                          <span>
                            {t('companies.yourVote')}:{' '}
                            {myVote ? (
                              <>
                                {t('companies.voted')} {t(`companies.${myVote.vote}`)}
                              </>
                            ) : (
                              t('companies.notVoted')
                            )}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-2 shrink-0">
                      {canVote ? (
                        <>
                          <button
                            onClick={() => handleVoteAuctionProposal(proposal, 'yes')}
                            className="px-3 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 min-w-[4.5rem]"
                          >
                            {t('companies.approveBid')}
                          </button>
                          <button
                            onClick={() => handleVoteAuctionProposal(proposal, 'no')}
                            className="px-3 py-1.5 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700 min-w-[4.5rem]"
                          >
                            {t('companies.rejectBid')}
                          </button>
                        </>
                      ) : myVote || proposal.status !== 'pending' ? (
                        <Link
                          to={`/auctions/${auctionObj._id || ''}`}
                          className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                        >
                          {t('companies.view')}
                        </Link>
                      ) : (
                        <span className="px-3 py-1.5 text-xs text-gray-500">{t('companies.membersOnly')}</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {tab === 'audit' && (
        <div className="space-y-2">
          {companyAuditLogs.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              <div className="text-3xl mb-2">📋</div>
              <p>{t('companies.noAuditLogs')}</p>
            </div>
          ) : (
            <>
              {companyAuditLogs.map((log) => (
                <div
                  key={log._id}
                  className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="text-sm text-gray-900 dark:text-white truncate min-w-0">
                        {typeof log.userId === 'object' && log.userId?.username ? log.userId.username : 'System'}
                      </span>
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        {auditActionLabel(log.action, t)}
                      </span>
                    </div>
                    <span className="text-xs text-gray-400 dark:text-gray-500">
                      {new Date(log.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  {log.details &&
                    Object.keys(log.details).length > 0 &&
                    (() => {
                      const detail = formatAuditDetails(log, t);
                      return detail ? (
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 break-words">{detail}</div>
                      ) : null;
                    })()}
                </div>
              ))}
              {companyAuditTotalPages > 1 && (
                <div className="flex justify-center gap-2 pt-2">
                  <button
                    onClick={() => setAuditPage((p) => Math.max(1, p - 1))}
                    disabled={companyAuditPage <= 1}
                    className="px-3 py-1 text-xs rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-40"
                  >
                    {t('marketplace.previous')}
                  </button>
                  <span className="px-3 py-1 text-xs text-gray-500 dark:text-gray-400">
                    {companyAuditPage}/{companyAuditTotalPages}
                  </span>
                  <button
                    onClick={() => setAuditPage((p) => Math.min(companyAuditTotalPages, p + 1))}
                    disabled={companyAuditPage >= companyAuditTotalPages}
                    className="px-3 py-1 text-xs rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-40"
                  >
                    {t('marketplace.next')}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      <ConfirmDialog
        open={!!transferTarget}
        title={t('companies.confirmTransferTitle')}
        message={t('companies.confirmTransferMessage', {
          name: transferTargetName || t('common.member'),
        })}
        confirmLabel={t('companies.transferLeadership')}
        cancelLabel={t('common.cancel')}
        onConfirm={handleConfirmTransfer}
        onCancel={() => setTransferTarget(null)}
        loading={transferLoading}
        destructive={false}
      />
      <ConfirmDialog
        open={leaveConfirmOpen}
        title={t('companies.leaveCompany')}
        message={t('common.confirmLeaveMessage')}
        confirmLabel={t('common.confirmLeaveAction')}
        cancelLabel={t('common.cancel')}
        onConfirm={handleConfirmLeave}
        onCancel={() => setLeaveConfirmOpen(false)}
        loading={leaveLoading}
      />
      <ConfirmDialog
        open={!!sellConfirmPropertyId}
        title={t('companies.sellProperty')}
        message={t('common.confirmSellMessage')}
        confirmLabel={t('common.confirmSellAction')}
        cancelLabel={t('common.cancel')}
        onConfirm={handleConfirmSell}
        onCancel={() => setSellConfirmPropertyId(null)}
        loading={sellLoading}
      />
    </div>
  );
}

function ContractAvailableList({
  contracts,
  company,
  isDirector,
  t,
  id,
  highlightId,
  setContracts,
  fetchContracts,
  proposeContract,
}) {
  const [proposeError, setProposeError] = useState('');
  const available = contracts.filter((c) => c.status === 'available');
  return (
    <div className="space-y-2">
      {proposeError && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-700 dark:text-red-300 flex items-center justify-between">
          <span>{proposeError}</span>
          <button onClick={() => setProposeError('')} className="text-red-500 hover:text-red-700 font-bold ms-2">
            ×
          </button>
        </div>
      )}
      {available.length === 0 ? (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          <div className="text-3xl mb-2">📋</div>
          <p>{t('companies.noAvailableContracts')}</p>
        </div>
      ) : (
        available.map((contract) => {
          const hasInsufficientFunds = company.treasury?.balance < (contract.requiredTreasury || 0);
          const canPropose = company.level >= contract.requiredLevel && isDirector && !hasInsufficientFunds;
          const isDeepLinked = highlightId && contract._id?.toString() === highlightId.toString();
          return (
            <div
              key={contract._id}
              id={`company-contract-${contract._id}`}
              className={`bg-white dark:bg-gray-800 border rounded-lg p-3 ${
                isDeepLinked
                  ? 'border-blue-500 ring-2 ring-blue-500/40 shadow-lg'
                  : 'border-gray-200 dark:border-gray-700'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-sm font-medium text-gray-900 dark:text-white">{contract.name}</span>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{contract.description}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {t('companies.reward')}: {formatMoney(contract.reward)} · {t('companies.cost')}:{' '}
                    {formatMoney(contract.cost)} · {t('companies.duration')}: {contract.durationTicks}{' '}
                    {t('companies.months')}
                  </div>
                  {contract.requiredLevel > 1 && (
                    <div className="text-xs text-orange-600 dark:text-orange-400 mt-0.5">
                      {t('companies.requiredLevel')}: {contract.requiredLevel}
                    </div>
                  )}
                  {hasInsufficientFunds && (
                    <div className="text-xs text-red-600 dark:text-red-400 mt-0.5">
                      {t('companies.insufficientTreasury') || 'Insufficient treasury balance'}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {canPropose && (
                    <button
                      onClick={async () => {
                        setProposeError('');
                        try {
                          await proposeContract(id, contract._id);
                          const list = await fetchContracts(id);
                          setContracts(list);
                        } catch (err) {
                          setProposeError(err.message || t('common.error'));
                        }
                      }}
                      className="px-3 py-1 bg-blue-600 text-white rounded-lg text-xs hover:bg-blue-700"
                    >
                      {t('companies.propose')}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

function ContractProposalList({
  contracts,
  company,
  user,
  t,
  id,
  highlightId,
  setContracts,
  fetchContracts,
  voteContractProposal,
  fetchCompany,
}) {
  const proposed = contracts.filter((c) => c.status === 'proposed');
  return (
    <div className="space-y-2">
      {proposed.length === 0 ? (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          <div className="text-3xl mb-2">🗳️</div>
          <p>{t('companies.noProposedContracts')}</p>
        </div>
      ) : (
        proposed.map((contract) => {
          const proposal = contract.proposal || {};
          const totalVoters = Math.max(1, (company.members?.length || 1) - 1);
          const yesVotes = (proposal.votes || []).filter((v) => v.vote === 'yes').length;
          const noVotes = (proposal.votes || []).filter((v) => v.vote === 'no').length;
          const userVoted = (proposal.votes || []).some(
            (v) => (v.userId?._id || v.userId)?.toString() === user?._id?.toString(),
          );
          const isProposer = (proposal.proposedBy?._id || proposal.proposedBy)?.toString() === user?._id?.toString();
          const isDeepLinked = highlightId && contract._id?.toString() === highlightId.toString();
          return (
            <div
              key={contract._id}
              id={`company-contract-${contract._id}`}
              className={`bg-white dark:bg-gray-800 border rounded-lg p-3 ${
                isDeepLinked
                  ? 'border-blue-500 ring-2 ring-blue-500/40 shadow-lg'
                  : 'border-gray-200 dark:border-gray-700'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-sm font-medium text-gray-900 dark:text-white">{contract.name}</span>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{contract.description}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {t('companies.reward')}: {formatMoney(contract.reward)} · {t('companies.cost')}:{' '}
                    {formatMoney(contract.cost)} · {t('companies.duration')}: {contract.durationTicks}{' '}
                    {t('companies.months')}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {t('companies.votes')}: {yesVotes}/{totalVoters} {t('companies.yes')} · {noVotes}{' '}
                    {t('companies.no')}
                    {proposal.expiresAtTick && (
                      <span className="ms-2">
                        · {t('companies.expiresIn')}:{' '}
                        {Math.max(0, proposal.expiresAtTick - (contract.currentTick || 0))} {t('companies.months')}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {!isProposer && !userVoted && (
                    <>
                      <button
                        onClick={async () => {
                          try {
                            await voteContractProposal(id, contract._id, 'yes');
                            const list = await fetchContracts(id);
                            setContracts(list);
                            await fetchCompany(id);
                          } catch {}
                        }}
                        className="px-3 py-1 bg-green-600 text-white rounded-lg text-xs hover:bg-green-700"
                      >
                        {t('companies.yes')}
                      </button>
                      <button
                        onClick={async () => {
                          try {
                            await voteContractProposal(id, contract._id, 'no');
                            const list = await fetchContracts(id);
                            setContracts(list);
                            await fetchCompany(id);
                          } catch {}
                        }}
                        className="px-3 py-1 bg-red-600 text-white rounded-lg text-xs hover:bg-red-700"
                      >
                        {t('companies.no')}
                      </button>
                    </>
                  )}
                  {userVoted && (
                    <span className="text-xs px-2 py-1 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                      {t('companies.voted')}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

function ContractActiveList({ contracts, t, highlightId }) {
  const active = contracts.filter((c) => c.status === 'active');
  return (
    <div className="space-y-2">
      {active.length === 0 ? (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          <div className="text-3xl mb-2">🚧</div>
          <p>{t('companies.noActiveContracts')}</p>
        </div>
      ) : (
        active.map((contract) => {
          const progress =
            contract.endTick > contract.startTick
              ? Math.min(
                  100,
                  Math.round(
                    (((contract.currentTick || 0) - (contract.startTick || 0)) /
                      (contract.endTick - contract.startTick)) *
                      100,
                  ),
                )
              : 0;
          return (
            <div
              key={contract._id}
              id={`company-contract-${contract._id}`}
              className={`bg-white dark:bg-gray-800 border rounded-lg p-3 ${
                highlightId && contract._id?.toString() === highlightId.toString()
                  ? 'border-blue-500 ring-2 ring-blue-500/40 shadow-lg'
                  : 'border-gray-200 dark:border-gray-700'
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="min-w-0">
                  <span className="text-sm font-medium text-gray-900 dark:text-white">{contract.name}</span>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{contract.description}</div>
                </div>
                <span className="text-xs px-2 py-1 rounded-lg bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400">
                  {t('companies.active')}
                </span>
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                {t('companies.reward')}: {formatMoney(contract.reward)} · {t('companies.cost')}:{' '}
                {formatMoney(contract.cost)} · {t('companies.completionIn')}:{' '}
                {Math.max(0, (contract.endTick || 0) - (contract.currentTick || 0))} {t('companies.months')}
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div className="bg-yellow-500 h-2 rounded-full transition-all" style={{ width: `${progress}%` }} />
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 text-end">{progress}%</div>
            </div>
          );
        })
      )}
    </div>
  );
}

function ContractHistoryList({ contracts, t, highlightId }) {
  return (
    <div className="space-y-2">
      {contracts.length === 0 ? (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          <div className="text-3xl mb-2">📜</div>
          <p>{t('companies.noContractHistory')}</p>
        </div>
      ) : (
        contracts.map((contract) => (
          <div
            key={contract._id}
            id={`company-contract-${contract._id}`}
            className={`bg-white dark:bg-gray-800 border rounded-lg p-3 ${
              highlightId && contract._id?.toString() === highlightId.toString()
                ? 'border-blue-500 ring-2 ring-blue-500/40 shadow-lg'
                : 'border-gray-200 dark:border-gray-700'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <span className="text-sm font-medium text-gray-900 dark:text-white">{contract.name}</span>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{contract.description}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {t('companies.reward')}: {formatMoney(contract.reward)} · {t('companies.cost')}:{' '}
                  {formatMoney(contract.cost)}
                </div>
              </div>
              <span
                className={`text-xs px-2 py-1 rounded-lg ${
                  contract.status === 'completed'
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                    : contract.status === 'failed'
                      ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                }`}
              >
                {t(`companies.contractStatus${contract.status.charAt(0).toUpperCase() + contract.status.slice(1)}`)}
              </span>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function InvestmentOpportunitiesList({
  products,
  isDirector,
  t,
  selectedInvestmentProduct,
  setSelectedInvestmentProduct,
  investAmount,
  setInvestAmount,
  handleInvest,
  investmentLoading,
  investmentError,
}) {
  return (
    <div className="space-y-2">
      {products.length === 0 ? (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          <div className="text-3xl mb-2">📈</div>
          <p>{t('companies.noOpportunities')}</p>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {products.map((product) => (
              <div
                key={product._id || product.type}
                onClick={() => {
                  if (!isDirector) return;
                  setSelectedInvestmentProduct(product._id || product.type);
                  setInvestAmount('');
                }}
                className={`border rounded-lg p-3 transition-colors ${
                  !isDirector
                    ? 'border-gray-200 dark:border-gray-700 opacity-70'
                    : selectedInvestmentProduct === (product._id || product.type)
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 cursor-pointer'
                      : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-900 dark:text-white truncate">{product.name}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{product.description}</div>
                  </div>
                  <div className="text-end shrink-0">
                    <div className="text-sm font-bold text-blue-600 dark:text-blue-400">
                      {((product.currentAnnualReturnRate || product.annualReturnRate) * 100).toFixed(1)}%
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">{t('companies.return')}</div>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-500 dark:text-gray-400">
                  <span>
                    {t('companies.minInvestment')}: {formatMoney(product.minInvestment)}
                  </span>
                  <span>
                    · {t('companies.maxInvestment')}: {formatMoney(product.maxInvestment)}
                  </span>
                  <span>
                    · {t('companies.duration')}: {product.durationTicks} {t('companies.months')}
                  </span>
                  <span>
                    · {t('companies.risk')}: {product.risk}
                  </span>
                  {product.economyState && (
                    <span>
                      · {t('companies.economyState')}: {product.economyState}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {isDirector && selectedInvestmentProduct && (
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 sm:p-4">
              <div className="flex flex-wrap gap-2">
                <input
                  type="number"
                  value={investAmount}
                  onChange={(e) => setInvestAmount(e.target.value)}
                  placeholder={t('companies.amount')}
                  className="w-full sm:flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                />
                <button
                  onClick={handleInvest}
                  disabled={investmentLoading || !investAmount}
                  className="w-full sm:w-auto px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
                >
                  {investmentLoading ? t('common.loading') : t('companies.invest')}
                </button>
              </div>
              {investmentError && <p className="text-xs text-red-600 dark:text-red-400 mt-2">{investmentError}</p>}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function InvestmentProposalList({
  investments,
  company,
  user,
  t,
  id,
  setInvestments,
  setInvestmentPerformance,
  fetchInvestments,
  fetchInvestmentPerformance,
  voteInvestmentProposal,
  cancelInvestmentProposal,
  fetchCompany,
}) {
  const proposed = investments.filter((inv) => inv.status === 'proposed');
  return (
    <div className="space-y-2">
      {proposed.length === 0 ? (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          <div className="text-3xl mb-2">🗳️</div>
          <p>{t('companies.noInvestmentProposals')}</p>
        </div>
      ) : (
        proposed.map((inv) => {
          const proposal = inv.proposal || {};
          const totalVoters = Math.max(1, (company.members?.length || 1) - 1);
          const yesVotes = (proposal.votes || []).filter((v) => v.vote === 'yes').length;
          const noVotes = (proposal.votes || []).filter((v) => v.vote === 'no').length;
          const userVoted = (proposal.votes || []).some(
            (v) => (v.userId?._id || v.userId)?.toString() === user?._id?.toString(),
          );
          const isProposer = (proposal.proposedBy?._id || proposal.proposedBy)?.toString() === user?._id?.toString();
          return (
            <div
              key={inv._id}
              className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-sm font-medium text-gray-900 dark:text-white">{inv.name}</span>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                    {t('companies.principal')}: {formatMoney(inv.principal)} · {t('companies.return')}:{' '}
                    {((inv.annualReturnRate || 0) * 100).toFixed(1)}% · {t('companies.risk')}: {inv.risk}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {t('companies.votes')}: {yesVotes}/{totalVoters} {t('companies.yes')} · {noVotes}{' '}
                    {t('companies.no')}
                    {proposal.expiresAtTick && (
                      <span className="ms-2">
                        · {t('companies.expiresIn')}: {Math.max(0, proposal.expiresAtTick - (inv.currentTick || 0))}{' '}
                        {t('companies.months')}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {!isProposer && !userVoted && (
                    <>
                      <button
                        onClick={async () => {
                          try {
                            await voteInvestmentProposal(id, inv._id, 'yes');
                            const [list, perf] = await Promise.all([
                              fetchInvestments(id),
                              fetchInvestmentPerformance(id),
                            ]);
                            setInvestments(list);
                            setInvestmentPerformance(perf);
                            await fetchCompany(id);
                          } catch {}
                        }}
                        className="px-3 py-1 bg-green-600 text-white rounded-lg text-xs hover:bg-green-700"
                      >
                        {t('companies.yes')}
                      </button>
                      <button
                        onClick={async () => {
                          try {
                            await voteInvestmentProposal(id, inv._id, 'no');
                            const [list, perf] = await Promise.all([
                              fetchInvestments(id),
                              fetchInvestmentPerformance(id),
                            ]);
                            setInvestments(list);
                            setInvestmentPerformance(perf);
                            await fetchCompany(id);
                          } catch {}
                        }}
                        className="px-3 py-1 bg-red-600 text-white rounded-lg text-xs hover:bg-red-700"
                      >
                        {t('companies.no')}
                      </button>
                    </>
                  )}
                  {isProposer && (
                    <button
                      onClick={async () => {
                        try {
                          await cancelInvestmentProposal(id, inv._id);
                          const [list, perf] = await Promise.all([
                            fetchInvestments(id),
                            fetchInvestmentPerformance(id),
                          ]);
                          setInvestments(list);
                          setInvestmentPerformance(perf);
                          await fetchCompany(id);
                        } catch {}
                      }}
                      className="px-3 py-1 bg-red-600 text-white rounded-lg text-xs hover:bg-red-700"
                    >
                      {t('common.cancel')}
                    </button>
                  )}
                  {userVoted && (
                    <span className="text-xs px-2 py-1 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                      {t('companies.voted')}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

function InvestmentActiveList({ investments, t }) {
  const active = investments.filter((inv) => inv.status === 'active');
  return (
    <div className="space-y-2">
      {active.length === 0 ? (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          <div className="text-3xl mb-2">📊</div>
          <p>{t('companies.noActiveInvestments')}</p>
        </div>
      ) : (
        active.map((inv) => {
          const progress =
            inv.maturityTick > inv.startTick
              ? Math.min(
                  100,
                  Math.round(
                    (((inv.currentTick || 0) - (inv.startTick || 0)) / (inv.maturityTick - inv.startTick)) * 100,
                  ),
                )
              : 0;
          const returnPct = inv.principal > 0 ? ((inv.currentValue - inv.principal) / inv.principal) * 100 : 0;
          return (
            <div
              key={inv._id}
              className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3"
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="min-w-0">
                  <span className="text-sm font-medium text-gray-900 dark:text-white">{inv.name}</span>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {t('companies.principal')}: {formatMoney(inv.principal)} · {t('companies.currentValue')}:{' '}
                    {formatMoney(inv.currentValue)} · {t('companies.risk')}: {inv.risk}
                  </div>
                </div>
                <span
                  className={`text-xs px-2 py-1 rounded-lg ${returnPct >= 0 ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'}`}
                >
                  {returnPct >= 0 ? '+' : ''}
                  {returnPct.toFixed(1)}%
                </span>
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                {t('companies.maturityIn')}: {Math.max(0, (inv.maturityTick || 0) - (inv.currentTick || 0))}{' '}
                {t('companies.months')}
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div className="bg-blue-500 h-2 rounded-full transition-all" style={{ width: `${progress}%` }} />
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 text-end">{progress}%</div>
            </div>
          );
        })
      )}
    </div>
  );
}

function InvestmentHistoryList({ investments, t }) {
  const history = investments.filter(
    (inv) => inv.status === 'matured' || inv.status === 'withdrawn' || inv.status === 'rejected',
  );
  return (
    <div className="space-y-2">
      {history.length === 0 ? (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          <div className="text-3xl mb-2">📜</div>
          <p>{t('companies.noInvestmentHistory')}</p>
        </div>
      ) : (
        history.map((inv) => {
          const returnPct = inv.principal > 0 ? ((inv.currentValue - inv.principal) / inv.principal) * 100 : 0;
          return (
            <div
              key={inv._id}
              className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-sm font-medium text-gray-900 dark:text-white">{inv.name}</span>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {t('companies.principal')}: {formatMoney(inv.principal)} · {t('companies.finalValue')}:{' '}
                    {formatMoney(inv.currentValue)} · {t('companies.risk')}: {inv.risk}
                  </div>
                </div>
                <span
                  className={`text-xs px-2 py-1 rounded-lg ${inv.status === 'matured' && returnPct >= 0 ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : inv.status === 'rejected' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'}`}
                >
                  {t(`companies.investmentStatus${inv.status.charAt(0).toUpperCase() + inv.status.slice(1)}`)}
                </span>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
