import { create } from 'zustand';
import { getApiBaseUrl, loadToken } from '../utils/capacitor';

async function api(path, options = {}) {
  const API = getApiBaseUrl();
  const token = await loadToken();
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API}${path}`, { ...options, headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export const useCompanyStore = create((set, get) => ({
  companies: [],
  companiesTotal: 0,
  companiesPage: 1,
  companiesTotalPages: 0,
  myCompanies: [],
  invitations: [],
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
  companyProgression: null,
  loading: false,
  error: null,

  async fetchCompanies(params = {}) {
    set({ loading: true, error: null });
    try {
      const { search, sort, page = 1, limit = 20 } = params;
      const q = new URLSearchParams();
      if (search) q.set('search', search);
      if (sort) q.set('sort', sort);
      q.set('page', String(page));
      q.set('limit', String(limit));

      const data = await api(`/real-estate-companies?${q}`);
      set({
        companies: data.companies,
        companiesTotal: data.total,
        companiesPage: data.page,
        companiesTotalPages: data.totalPages,
        loading: false,
      });
      return data;
    } catch (err) {
      set({ error: err.message, loading: false });
      throw err;
    }
  },

  async fetchMyCompanies() {
    set({ loading: true, error: null });
    try {
      const data = await api('/real-estate-companies/my');
      set({ myCompanies: data, loading: false });
      return data;
    } catch (err) {
      set({ error: err.message, loading: false });
      throw err;
    }
  },

  async fetchInvitations() {
    try {
      const data = await api('/real-estate-companies/invitations');
      set({ invitations: data });
      return data;
    } catch (err) {
      set({ error: err.message });
      throw err;
    }
  },

  async createCompany(name, description, logo, hqCityId) {
    set({ loading: true, error: null });
    try {
      const data = await api('/real-estate-companies', {
        method: 'POST',
        body: JSON.stringify({ name, description, logo, hqCityId }),
      });
      set({ loading: false });
      return data;
    } catch (err) {
      set({ error: err.message, loading: false });
      throw err;
    }
  },

  async fetchCompany(id) {
    set({ loading: true, error: null });
    try {
      const data = await api(`/real-estate-companies/${id}`);
      set({
        selectedCompany: data,
        companyLoans: data.loans || [],
        loading: false,
      });
      return data;
    } catch (err) {
      set({ error: err.message, loading: false });
      throw err;
    }
  },

  async updateCompany(id, updates) {
    try {
      const data = await api(`/real-estate-companies/${id}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
      });
      set({ selectedCompany: { ...get().selectedCompany, ...data } });
      return data;
    } catch (err) {
      set({ error: err.message });
      throw err;
    }
  },

  async inviteMember(companyId, username) {
    try {
      await api(`/real-estate-companies/${companyId}/invite`, {
        method: 'POST',
        body: JSON.stringify({ username }),
      });
    } catch (err) {
      set({ error: err.message });
      throw err;
    }
  },

  async acceptInvitation(companyId, invitationId) {
    try {
      await api(`/real-estate-companies/${companyId}/invite/${invitationId}/accept`, { method: 'POST' });
      await get().fetchInvitations();
    } catch (err) {
      set({ error: err.message });
      throw err;
    }
  },

  async declineInvitation(companyId, invitationId) {
    try {
      await api(`/real-estate-companies/${companyId}/invite/${invitationId}/decline`, { method: 'POST' });
      await get().fetchInvitations();
    } catch (err) {
      set({ error: err.message });
      throw err;
    }
  },

  async leaveCompany(companyId) {
    try {
      await api(`/real-estate-companies/${companyId}/leave`, { method: 'POST' });
      set({ selectedCompany: null });
    } catch (err) {
      set({ error: err.message });
      throw err;
    }
  },

  async removeMember(companyId, userId) {
    try {
      await api(`/real-estate-companies/${companyId}/members/${userId}`, { method: 'DELETE' });
      await get().fetchCompany(companyId);
    } catch (err) {
      set({ error: err.message });
      throw err;
    }
  },

  async changeRole(companyId, userId, role) {
    try {
      await api(`/real-estate-companies/${companyId}/members/${userId}/role`, {
        method: 'PUT',
        body: JSON.stringify({ role }),
      });
      await get().fetchCompany(companyId);
    } catch (err) {
      set({ error: err.message });
      throw err;
    }
  },

  async transferLeadership(companyId, targetUserId) {
    try {
      await api(`/real-estate-companies/${companyId}/leadership/transfer`, {
        method: 'POST',
        body: JSON.stringify({ targetUserId }),
      });
      await get().fetchCompany(companyId);
    } catch (err) {
      set({ error: err.message });
      throw err;
    }
  },

  async depositTreasury(companyId, amount) {
    try {
      const data = await api(`/real-estate-companies/${companyId}/treasury/deposit`, {
        method: 'POST',
        body: JSON.stringify({ amount }),
      });
      await get().fetchCompany(companyId);
      return data;
    } catch (err) {
      set({ error: err.message });
      throw err;
    }
  },

  async withdrawTreasury(companyId, amount, targetUserId) {
    try {
      const data = await api(`/real-estate-companies/${companyId}/treasury/withdraw`, {
        method: 'POST',
        body: JSON.stringify({ amount, targetUserId }),
      });
      await get().fetchCompany(companyId);
      return data;
    } catch (err) {
      set({ error: err.message });
      throw err;
    }
  },

  async fetchTreasuryTransactions(companyId, page = 1, limit = 20) {
    try {
      const data = await api(`/real-estate-companies/${companyId}/treasury/transactions?page=${page}&limit=${limit}`);
      return data;
    } catch (err) {
      set({ error: err.message });
      throw err;
    }
  },

  async purchaseProperty(companyId, propertyId) {
    try {
      const data = await api(`/real-estate-companies/${companyId}/properties/purchase`, {
        method: 'POST',
        body: JSON.stringify({ propertyId }),
      });
      await get().fetchCompany(companyId);
      return data;
    } catch (err) {
      set({ error: err.message });
      throw err;
    }
  },

  async sellCompanyProperty(companyId, propertyId) {
    try {
      const data = await api(`/real-estate-companies/${companyId}/properties/${propertyId}/sell`, { method: 'POST' });
      await get().fetchCompany(companyId);
      return data;
    } catch (err) {
      set({ error: err.message });
      throw err;
    }
  },

  async fetchCompanyProperties(companyId, page = 1, limit = 20) {
    try {
      const data = await api(`/real-estate-companies/${companyId}/properties?page=${page}&limit=${limit}`);
      set({
        companyProperties: data.properties || data,
        companyPropertiesPage: data.page || page,
        companyPropertiesTotalPages: data.totalPages || 1,
      });
      return data;
    } catch (err) {
      set({ error: err.message });
      throw err;
    }
  },

  async fetchCompanyLoans(companyId) {
    try {
      const data = await api(`/real-estate-companies/${companyId}/loans`);
      set({ companyLoans: data });
      return data;
    } catch (err) {
      set({ error: err.message });
      throw err;
    }
  },

  async repayCompanyLoan(companyId, loanId, amount) {
    try {
      const data = await api(`/real-estate-companies/${companyId}/loans/${loanId}/repay`, {
        method: 'POST',
        body: JSON.stringify({ amount }),
      });
      await get().fetchCompany(companyId);
      return data;
    } catch (err) {
      set({ error: err.message });
      throw err;
    }
  },

  async fetchCompanyAudit(companyId, page = 1, limit = 30) {
    try {
      const data = await api(`/real-estate-companies/${companyId}/audit?page=${page}&limit=${limit}`);
      set({
        companyAuditLogs: data.logs,
        companyAuditTotal: data.total,
        companyAuditPage: data.page || page,
        companyAuditTotalPages: data.totalPages || 1,
      });
      return data;
    } catch (err) {
      set({ error: err.message });
      throw err;
    }
  },

  async fetchCompanyStats(companyId) {
    try {
      const data = await api(`/real-estate-companies/${companyId}/stats`);
      set({ companyStats: data });
      return data;
    } catch (err) {
      set({ error: err.message });
      throw err;
    }
  },

  async fetchCompanyProgression(companyId) {
    try {
      const data = await api(`/real-estate-companies/${companyId}/progression`);
      set({ companyProgression: data });
      return data;
    } catch (err) {
      set({ error: err.message });
      throw err;
    }
  },

  async fetchCompanyMilestones(companyId) {
    try {
      const data = await api(`/real-estate-companies/${companyId}/milestones`);
      return data;
    } catch (err) {
      set({ error: err.message });
      throw err;
    }
  },

  clearSelectedCompany() {
    set({
      selectedCompany: null,
      companyProperties: [],
      companyPropertiesPage: 1,
      companyPropertiesTotalPages: 1,
      companyLoans: [],
      companyAuditLogs: [],
      companyAuditPage: 1,
      companyAuditTotalPages: 1,
      companyStats: null,
    });
  },

  async applyToCompany(companyId, message) {
    try {
      await api(`/real-estate-companies/${companyId}/apply`, {
        method: 'POST',
        body: JSON.stringify({ message }),
      });
    } catch (err) {
      set({ error: err.message });
      throw err;
    }
  },

  async fetchApplications(companyId) {
    try {
      const data = await api(`/real-estate-companies/${companyId}/applications`);
      return data;
    } catch (err) {
      set({ error: err.message });
      throw err;
    }
  },

  async approveApplication(companyId, appId) {
    try {
      await api(`/real-estate-companies/${companyId}/applications/${appId}/approve`, { method: 'POST' });
      await get().fetchCompany(companyId);
    } catch (err) {
      set({ error: err.message });
      throw err;
    }
  },

  async rejectApplication(companyId, appId) {
    try {
      await api(`/real-estate-companies/${companyId}/applications/${appId}/reject`, { method: 'POST' });
    } catch (err) {
      set({ error: err.message });
      throw err;
    }
  },

  async cancelApplication(companyId, appId) {
    try {
      await api(`/real-estate-companies/${companyId}/applications/${appId}/cancel`, { method: 'POST' });
      await get().fetchCompany(companyId);
    } catch (err) {
      set({ error: err.message });
      throw err;
    }
  },

  async createLoanRequest(companyId, principal, durationTicks, loanType) {
    try {
      await api(`/real-estate-companies/${companyId}/loan-requests`, {
        method: 'POST',
        body: JSON.stringify({ principal, durationTicks, loanType }),
      });
    } catch (err) {
      set({ error: err.message });
      throw err;
    }
  },

  async fetchCompanyLoanOptions(companyId) {
    try {
      const data = await api(`/real-estate-companies/${companyId}/loan-options`);
      return data;
    } catch (err) {
      set({ error: err.message });
      throw err;
    }
  },

  async takeDirectLoan(companyId, principal, durationTicks, productId, loanType) {
    try {
      const data = await api(`/real-estate-companies/${companyId}/direct-loan`, {
        method: 'POST',
        body: JSON.stringify({ principal, durationTicks, productId, loanType }),
      });
      await get().fetchCompany(companyId);
      return data;
    } catch (err) {
      set({ error: err.message });
      throw err;
    }
  },

  async fetchLoanRequests(companyId) {
    try {
      const data = await api(`/real-estate-companies/${companyId}/loan-requests`);
      return data;
    } catch (err) {
      set({ error: err.message });
      throw err;
    }
  },

  async voteLoanRequest(companyId, reqId, vote) {
    try {
      await api(`/real-estate-companies/${companyId}/loan-requests/${reqId}/vote`, {
        method: 'POST',
        body: JSON.stringify({ vote }),
      });
      await get().fetchCompany(companyId);
    } catch (err) {
      set({ error: err.message });
      throw err;
    }
  },

  async executeLoanRequest(companyId, reqId) {
    try {
      const data = await api(`/real-estate-companies/${companyId}/loan-requests/${reqId}/execute`, { method: 'POST' });
      await get().fetchCompany(companyId);
      return data;
    } catch (err) {
      set({ error: err.message });
      throw err;
    }
  },

  async createPropertyPurchaseRequest(companyId, propertyId) {
    try {
      await api(`/real-estate-companies/${companyId}/property-purchase-requests`, {
        method: 'POST',
        body: JSON.stringify({ propertyId }),
      });
    } catch (err) {
      set({ error: err.message });
      throw err;
    }
  },

  async fetchPropertyPurchaseRequests(companyId) {
    try {
      const data = await api(`/real-estate-companies/${companyId}/property-purchase-requests`);
      return data;
    } catch (err) {
      set({ error: err.message });
      throw err;
    }
  },

  async votePropertyPurchaseRequest(companyId, reqId, vote) {
    try {
      await api(`/real-estate-companies/${companyId}/property-purchase-requests/${reqId}/vote`, {
        method: 'POST',
        body: JSON.stringify({ vote }),
      });
      await get().fetchCompany(companyId);
    } catch (err) {
      set({ error: err.message });
      throw err;
    }
  },

  async fetchAuctionProposals(companyId) {
    try {
      const data = await api(`/real-estate-companies/${companyId}/auction-bids`);
      return data;
    } catch (err) {
      set({ error: err.message });
      throw err;
    }
  },

  async voteAuctionProposal(auctionId, reqId, vote, companyId) {
    try {
      await api(`/auctions/${auctionId}/company-bid/${reqId}/vote`, {
        method: 'POST',
        body: JSON.stringify({ vote }),
      });
      if (companyId) await get().fetchCompany(companyId);
    } catch (err) {
      set({ error: err.message });
      throw err;
    }
  },

  async initiateIPO(companyId) {
    try {
      const data = await api(`/real-estate-companies/${companyId}/ipo`, { method: 'POST' });
      await get().fetchCompany(companyId);
      return data;
    } catch (err) {
      set({ error: err.message });
      throw err;
    }
  },

  async fetchContracts(companyId) {
    try {
      const data = await api(`/city-contracts/${companyId}/contracts`);
      return data;
    } catch (err) {
      set({ error: err.message });
      throw err;
    }
  },

  async acceptContract(companyId, contractId) {
    try {
      const data = await api(`/city-contracts/${companyId}/contracts/${contractId}/accept`, { method: 'POST' });
      return data;
    } catch (err) {
      set({ error: err.message });
      throw err;
    }
  },

  async proposeContract(companyId, contractId) {
    try {
      const data = await api(`/city-contracts/${companyId}/contracts/${contractId}/propose`, { method: 'POST' });
      await get().fetchCompany(companyId);
      return data;
    } catch (err) {
      set({ error: err.message });
      throw err;
    }
  },

  async voteContractProposal(companyId, contractId, vote) {
    try {
      const data = await api(`/city-contracts/${companyId}/contracts/${contractId}/vote`, {
        method: 'POST',
        body: JSON.stringify({ vote }),
      });
      await get().fetchCompany(companyId);
      return data;
    } catch (err) {
      set({ error: err.message });
      throw err;
    }
  },

  async fetchContractHistory(companyId) {
    try {
      const data = await api(`/city-contracts/${companyId}/contracts/history`);
      return data;
    } catch (err) {
      set({ error: err.message });
      throw err;
    }
  },

  async fetchInvestmentProducts(companyId) {
    try {
      const data = await api(`/real-estate-companies/${companyId}/investments/products`);
      return data;
    } catch (err) {
      set({ error: err.message });
      throw err;
    }
  },

  async fetchInvestments(companyId) {
    try {
      const data = await api(`/real-estate-companies/${companyId}/investments`);
      return data;
    } catch (err) {
      set({ error: err.message });
      throw err;
    }
  },

  async fetchInvestmentPerformance(companyId) {
    try {
      const data = await api(`/real-estate-companies/${companyId}/investments/performance`);
      return data;
    } catch (err) {
      set({ error: err.message });
      throw err;
    }
  },

  async createInvestment(companyId, investmentType, amount, opportunityId) {
    try {
      const body = opportunityId ? { investmentType, amount, opportunityId } : { investmentType, amount };
      const data = await api(`/real-estate-companies/${companyId}/investments`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      await get().fetchCompany(companyId);
      return data;
    } catch (err) {
      set({ error: err.message });
      throw err;
    }
  },

  async voteInvestmentProposal(companyId, investmentId, vote) {
    try {
      const data = await api(`/real-estate-companies/${companyId}/investments/${investmentId}/vote`, {
        method: 'POST',
        body: JSON.stringify({ vote }),
      });
      await get().fetchCompany(companyId);
      return data;
    } catch (err) {
      set({ error: err.message });
      throw err;
    }
  },

  async cancelInvestmentProposal(companyId, investmentId) {
    try {
      const data = await api(`/real-estate-companies/${companyId}/investments/${investmentId}/cancel`, {
        method: 'POST',
      });
      await get().fetchCompany(companyId);
      return data;
    } catch (err) {
      set({ error: err.message });
      throw err;
    }
  },

  async startCompanyProject(companyId, landId, projectType) {
    try {
      const data = await api('/development/company/start', {
        method: 'POST',
        body: JSON.stringify({ companyId, landId, projectType }),
      });
      await get().fetchCompany(companyId);
      return data;
    } catch (err) {
      set({ error: err.message });
      throw err;
    }
  },

  async fetchCompanyProjects(companyId) {
    try {
      const data = await api(`/development/company/projects?companyId=${companyId}`);
      return data;
    } catch (err) {
      set({ error: err.message });
      throw err;
    }
  },

  async createDevelopmentRequest(companyId, propertyId, actionType, actionData) {
    try {
      await api(`/real-estate-companies/${companyId}/development-requests`, {
        method: 'POST',
        body: JSON.stringify({ propertyId, actionType, actionData }),
      });
    } catch (err) {
      set({ error: err.message });
      throw err;
    }
  },

  async fetchDevelopmentRequests(companyId) {
    try {
      const data = await api(`/real-estate-companies/${companyId}/development-requests`);
      return data;
    } catch (err) {
      set({ error: err.message });
      throw err;
    }
  },

  async voteDevelopmentRequest(companyId, reqId, vote) {
    try {
      await api(`/real-estate-companies/${companyId}/development-requests/${reqId}/vote`, {
        method: 'POST',
        body: JSON.stringify({ vote }),
      });
      await get().fetchCompany(companyId);
    } catch (err) {
      set({ error: err.message });
      throw err;
    }
  },
}));
