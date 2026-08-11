import { create } from 'zustand';
import { getApiBaseUrl, loadToken } from '../utils/capacitor';

async function api(path, options = {}) {
  const API = getApiBaseUrl();
  try {
    const token = await loadToken();
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${API}${path}`, { ...options, headers });
    console.log(`Game API Request: ${options.method || 'GET'} ${API}${path} - Status: ${res.status}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  } catch (err) {
    console.error(`Game API Error: ${API}${path}`, err);
    throw err;
  }
}

export const useGameStore = create((set, get) => ({
  cities: [],
  properties: [],
  total: 0,
  page: 1,
  totalPages: 0,
  selectedCity: null,
  cityProperties: [],
  cityEvents: [],
  cityDemographics: null,
  activeEvents: [],
  userData: null,
  loading: false,
  error: null,

  fetchCities: async () => {
    set({ loading: true });
    try {
      const cities = await api('/cities');
      set({ cities, loading: false });
    } catch (err) {
      set({ error: err.message, loading: false });
    }
  },

  fetchCity: async (id) => {
    set({ loading: true });
    try {
      const data = await api(`/cities/${id}`);
      set({
        selectedCity: data.city,
        cityProperties: data.properties,
        cityEvents: data.activeEvents,
        cityDemographics: data.demographics || null,
        loading: false,
      });
    } catch (err) {
      set({ error: err.message, loading: false });
    }
  },

  fetchActiveEvents: async () => {
    try {
      const events = await api('/events/active');
      set({ activeEvents: events });
      return events;
    } catch {
      return [];
    }
  },

  fetchProperties: async (params = {}) => {
    set({ loading: true });
    try {
      const query = new URLSearchParams();
      if (typeof params === 'string') {
        if (params) query.set('cityId', params);
      } else {
        Object.entries(params).forEach(([k, v]) => {
          if (v !== '' && v !== null && v !== undefined) query.set(k, v);
        });
      }
      const qs = query.toString();
      const data = await api(`/properties${qs ? `?${qs}` : ''}`);
      const list = Array.isArray(data) ? data : data.properties;
      set({
        properties: list,
        total: data.total || list.length,
        page: data.page || 1,
        totalPages: data.totalPages || 1,
        loading: false,
      });
    } catch (err) {
      set({ error: err.message, loading: false });
    }
  },

  buyProperty: async (propertyId) => {
    const data = await api('/properties/buy', {
      method: 'POST',
      body: JSON.stringify({ propertyId }),
    });
    return data;
  },

  sellProperty: async (propertyId) => {
    const data = await api('/properties/sell', {
      method: 'POST',
      body: JSON.stringify({ propertyId }),
    });
    return data;
  },

  getPropertyGrade: async (propertyId) => {
    const data = await api(`/properties/${propertyId}/grade`);
    return data;
  },

  upgradePropertyGrade: async (propertyId) => {
    const data = await api('/properties/grade/upgrade', {
      method: 'POST',
      body: JSON.stringify({ propertyId }),
    });
    return data;
  },

  fetchUserData: async () => {
    try {
      const data = await api('/users/me');
      set({ userData: data });
      return data;
    } catch {
      // not authenticated
    }
  },

  loans: [],

  fetchLoans: async () => {
    try {
      const loans = await api('/bank/my');
      set({ loans });
      return loans;
    } catch {
      return [];
    }
  },

  fetchLoanOptions: async () => {
    return await api('/bank/options');
  },

  applyLoan: async (productId, principal, durationTicks) => {
    const data = await api('/bank/apply', {
      method: 'POST',
      body: JSON.stringify({ productId, principal, durationTicks }),
    });
    await get().fetchLoans();
    return data;
  },

  repayLoan: async (loanId, amount) => {
    const data = await api('/bank/repay', {
      method: 'POST',
      body: JSON.stringify({ loanId, amount }),
    });
    await get().fetchLoans();
    return data;
  },

  adminOverview: null,
  adminUsers: [],
  adminUsersTotal: 0,
  adminUsersPage: 1,
  adminUsersTotalPages: 0,
  adminDeletedUsers: [],
  adminUserDetail: null,
  adminUserActivity: { logs: [], total: 0, page: 1, totalPages: 0, categories: [] },
  adminProperties: [],
  adminEvents: [],
  adminCompanies: [],

  fetchAdminOverview: async () => {
    const data = await api('/admin/overview');
    set({ adminOverview: data });
    return data;
  },

  fetchAdminTicks: async () => {
    return await api('/admin/ticks');
  },

  runTicks: async (count) => {
    return await api('/admin/tick/run', {
      method: 'POST',
      body: JSON.stringify({ count }),
    });
  },

  fetchAdminUsers: async (params = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') qs.set(k, v);
    });
    const query = qs.toString() ? `?${qs.toString()}` : '';
    const data = await api(`/admin/users${query}`);
    const users = Array.isArray(data) ? data : Array.isArray(data?.users) ? data.users : [];
    set({
      adminUsers: users,
      adminUsersTotal: Array.isArray(data) ? users.length : data?.total || 0,
      adminUsersPage: Array.isArray(data) ? 1 : data?.page || 1,
      adminUsersTotalPages: Array.isArray(data) ? Math.max(1, Math.ceil(users.length / 25)) : data?.totalPages || 1,
    });
    return data;
  },

  fetchAdminDeletedUsers: async () => {
    const data = await api('/admin/users?deleted=true&limit=100&page=1');
    set({ adminDeletedUsers: Array.isArray(data) ? data : Array.isArray(data?.users) ? data.users : [] });
    return data;
  },

  fetchAdminUserDetail: async (userId) => {
    const data = await api(`/admin/users/${userId}`);
    set({ adminUserDetail: data.user || null });
    return data;
  },

  fetchAdminUserActivity: async (userId, params = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') qs.set(k, v);
    });
    const query = qs.toString() ? `?${qs.toString()}` : '';
    const data = await api(`/admin/users/${userId}/activity${query}`);
    set({ adminUserActivity: data });
    return data;
  },

  clearAdminUserDetail: () =>
    set({ adminUserDetail: null, adminUserActivity: { logs: [], total: 0, page: 1, totalPages: 0, categories: [] } }),

  setUserBalance: async (userId, balance) => {
    return await api(`/admin/users/${userId}/balance`, {
      method: 'PUT',
      body: JSON.stringify({ balance }),
    });
  },

  toggleUserBan: async (userId) => {
    return await api(`/admin/users/${userId}/ban`, { method: 'PUT' });
  },

  setUserRole: async (userId, role) => {
    return await api(`/admin/users/${userId}/role`, {
      method: 'PUT',
      body: JSON.stringify({ role }),
    });
  },

  setUserLevel: async (userId, level) => {
    return await api(`/admin/users/${userId}/level`, {
      method: 'PUT',
      body: JSON.stringify({ level }),
    });
  },

  setUserCreatedAt: async (userId, createdAt) => {
    return await api(`/admin/users/${userId}/created-at`, {
      method: 'PUT',
      body: JSON.stringify({ createdAt }),
    });
  },

  restoreUser: async (userId) => {
    return await api(`/admin/users/${userId}/restore`, { method: 'POST' });
  },

  permanentDeleteUser: async (userId) => {
    return await api(`/admin/users/${userId}/permanent`, { method: 'DELETE' });
  },

  fetchAdminProperties: async (page = 1) => {
    const data = await api(`/admin/properties?page=${page}&limit=200`);
    set({ adminProperties: data.properties });
    return data;
  },

  createProperty: async (data) => {
    return await api('/admin/properties', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateProperty: async (id, data) => {
    return await api(`/admin/properties/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  deleteProperty: async (id) => {
    return await api(`/admin/properties/${id}`, { method: 'DELETE' });
  },

  fetchAdminCompanies: async () => {
    const data = await api('/admin/real-estate-companies');
    set({ adminCompanies: data });
    return data;
  },

  fetchAdminCompany: async (id) => {
    return await api(`/admin/real-estate-companies/${id}`);
  },

  updateAdminCompany: async (id, data) => {
    return await api(`/admin/real-estate-companies/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  deleteAdminCompany: async (id) => {
    return await api(`/admin/real-estate-companies/${id}`, { method: 'DELETE' });
  },

  updateAdminCompanyMemberRole: async (companyId, userId, role) => {
    return await api(`/admin/real-estate-companies/${companyId}/members/${userId}/role`, {
      method: 'PUT',
      body: JSON.stringify({ role }),
    });
  },

  removeAdminCompanyMember: async (companyId, userId) => {
    return await api(`/admin/real-estate-companies/${companyId}/members/${userId}`, {
      method: 'DELETE',
    });
  },

  updateCity: async (id, data) => {
    return await api(`/admin/cities/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  fetchAdminEvents: async () => {
    const data = await api('/admin/events');
    set({ adminEvents: data });
    return data;
  },

  createEvent: async (data) => {
    return await api('/admin/events', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  toggleEvent: async (id, active) => {
    return await api(`/admin/events/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ active }),
    });
  },

  sentOffers: [],
  receivedOffers: [],
  notifications: [],
  unreadCount: 0,
  notificationPage: 1,
  notificationTotalPages: 1,

  fetchSentOffers: async () => {
    try {
      const offers = await api('/offers/sent');
      set({ sentOffers: offers });
      return offers;
    } catch {
      return [];
    }
  },

  fetchReceivedOffers: async () => {
    try {
      const offers = await api('/offers/received');
      set({ receivedOffers: offers });
      return offers;
    } catch {
      return [];
    }
  },

  createOffer: async (propertyId, amount) => {
    return await api('/offers/create', {
      method: 'POST',
      body: JSON.stringify({ propertyId, amount }),
    });
  },

  acceptOffer: async (offerId) => {
    return await api(`/offers/accept/${offerId}`, { method: 'POST' });
  },

  rejectOffer: async (offerId) => {
    return await api(`/offers/reject/${offerId}`, { method: 'POST' });
  },

  counterOffer: async (offerId, counterAmount) => {
    return await api(`/offers/counter/${offerId}`, {
      method: 'POST',
      body: JSON.stringify({ counterAmount }),
    });
  },

  acceptCounterOffer: async (offerId) => {
    return await api(`/offers/accept-counter/${offerId}`, { method: 'POST' });
  },

  fetchNotifications: async (page = 1, limit = 20, filters = {}) => {
    try {
      const params = new URLSearchParams({ page, limit });
      if (filters.priority) params.set('priority', filters.priority);
      if (filters.category) params.set('category', filters.category);
      if (filters.unread !== undefined && filters.unread !== null) params.set('unread', String(filters.unread));
      const data = await api(`/notifications?${params.toString()}`);
      // Defensive dedup by _id: poll + socket events can deliver the same
      // notification twice (initial fetch, reconnect, page change). The
      // server guarantees one DB record per event; this dedup keeps the UI
      // list free of visual duplicates regardless.
      const seen = new Set();
      const deduped = (data.notifications || []).filter((n) => {
        if (!n._id || seen.has(n._id)) return false;
        seen.add(n._id);
        return true;
      });
      // Server is the source of truth: page 1 replaces the list (items
      // deleted on the server must never be re-merged from stale state).
      set({ notifications: deduped, notificationPage: data.page, notificationTotalPages: data.totalPages });
      return deduped;
    } catch {
      return [];
    }
  },

  fetchUnreadCount: async () => {
    try {
      const { count } = await api('/notifications/unread-count');
      set({ unreadCount: count });
      return count;
    } catch {
      return 0;
    }
  },

  markNotificationRead: async (id) => {
    const list = get().notifications || [];
    const item = list.find((n) => n._id === id);
    const wasUnread = item ? !item.read : false;
    const updated = await api(`/notifications/${id}/read`, { method: 'PUT' });
    set({
      notifications: list.map((n) => (n._id === id ? { ...n, read: true } : n)),
      unreadCount: wasUnread ? Math.max(0, (get().unreadCount || 0) - 1) : get().unreadCount,
    });
    return updated;
  },

  markAllRead: async () => {
    const result = await api('/notifications/read-all', { method: 'PUT' });
    set({
      notifications: (get().notifications || []).map((n) => ({ ...n, read: true })),
      unreadCount: 0,
    });
    return result;
  },

  notificationPreferences: null,

  fetchNotificationPreferences: async () => {
    try {
      const { preferences } = await api('/notifications/preferences');
      set({ notificationPreferences: preferences });
      return preferences;
    } catch {
      return null;
    }
  },

  updateNotificationPreferences: async (updates) => {
    const { preferences } = await api('/notifications/preferences', {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
    set({ notificationPreferences: preferences });
    return preferences;
  },

  removeNotification: (id) => {
    const list = get().notifications || [];
    const item = list.find((n) => n._id === id);
    if (!item) return false;
    set({
      notifications: list.filter((n) => n._id !== id),
      unreadCount: Math.max(0, (get().unreadCount || 0) - (item.read ? 0 : 1)),
    });
    return true;
  },

  restoreNotification: (notification) => {
    set({
      notifications: [...(get().notifications || []), notification],
      unreadCount: (get().unreadCount || 0) + (notification.read ? 0 : 1),
    });
  },

  // Optimistic delete: remove immediately, roll back on failure. The API
  // error propagates so callers can surface it to the user.
  deleteNotification: async (id) => {
    const list = get().notifications || [];
    const item = list.find((n) => n._id === id);
    get().removeNotification(id);
    try {
      return await api(`/notifications/${id}`, { method: 'DELETE' });
    } catch (err) {
      if (item) get().restoreNotification(item);
      throw err;
    }
  },

  developmentOptions: [],
  myLand: [],
  myProjects: [],
  myBuildings: [],

  fetchDevelopmentOptions: async (cityId, location) => {
    const query = location ? `?location=${encodeURIComponent(location)}` : '';
    const data = await api(`/development/options/city/${cityId}${query}`);
    set({ developmentOptions: data });
    return data;
  },

  estimateProject: async (landId, projectType) => {
    return await api('/development/estimate', {
      method: 'POST',
      body: JSON.stringify({ landId, projectType }),
    });
  },

  fetchMyLand: async () => {
    const data = await api('/development/my-land');
    set({ myLand: data });
    return data;
  },

  startConstruction: async (landId, projectType) => {
    const data = await api('/development/start', {
      method: 'POST',
      body: JSON.stringify({ landId, projectType }),
    });
    return data;
  },

  fetchMyProjects: async () => {
    const data = await api('/development/projects');
    set({ myProjects: data });
    return data;
  },

  fetchProjectDetail: async (id) => {
    return await api(`/development/projects/${id}`);
  },

  fetchMyBuildings: async () => {
    const data = await api('/development/my-buildings');
    set({ myBuildings: data });
    return data;
  },

  fetchUpgradeOptions: async (propertyId) => {
    return await api(`/development/upgrades/${propertyId}`);
  },

  upgradeBuilding: async (propertyId, upgradeType) => {
    const data = await api('/development/upgrade', {
      method: 'POST',
      body: JSON.stringify({ propertyId, upgradeType }),
    });
    return data;
  },

  fetchImprovementRequirements: async (propertyId) => {
    const data = await api(`/development/improvements/requirements/${propertyId}`);
    return data;
  },

  fetchImprovementOptions: async () => {
    const data = await api('/development/improvements/options');
    return data;
  },

  fetchAvailableImprovements: async (propertyId) => {
    const data = await api(`/development/improvements/available/${propertyId}`);
    return data;
  },

  fetchImprovementStatus: async (propertyId) => {
    const data = await api(`/development/improvements/status/${propertyId}`);
    return data;
  },

  startImprovement: async (propertyId, improvementId) => {
    const data = await api('/development/improvements/start', {
      method: 'POST',
      body: JSON.stringify({ propertyId, improvementId }),
    });
    return data;
  },

  clearSelection: () => {
    set({ selectedCity: null, cityProperties: [], cityEvents: [], cityDemographics: null });
  },

  fetchAdminSeasons: async () => {
    return await api('/admin/seasons');
  },

  fetchAdminCurrentSeason: async () => {
    return await api('/admin/seasons/current');
  },

  fetchAdminSeasonPreview: async () => {
    return await api('/admin/seasons/preview');
  },

  endCurrentSeason: async () => {
    return await api('/admin/seasons/end', {
      method: 'POST',
      body: JSON.stringify({ confirm: true }),
    });
  },

  createSeason: async () => {
    return await api('/admin/seasons/create', {
      method: 'POST',
    });
  },

  fetchSeasonHistory: async () => {
    return await api('/seasons');
  },

  fetchPlayerSeasonHistory: async (userId) => {
    return await api(`/seasons/player/${userId}`);
  },

  fetchSeasonDetail: async (id) => {
    return await api(`/seasons/${id}`);
  },

  maintenance: { enabled: false, message: '' },
  fetchMaintenance: async () => {
    const API = getApiBaseUrl();
    try {
      const res = await fetch(`${API}/maintenance`);
      const data = await res.json();
      set({ maintenance: { enabled: data.enabled, message: data.message || '' } });
      return data;
    } catch {
      set({ maintenance: { enabled: false, message: '' } });
    }
  },
  fetchAdminMaintenance: async () => {
    return await api('/admin/maintenance');
  },
  enableMaintenance: async (message) => {
    return await api('/admin/maintenance/enable', {
      method: 'POST',
      body: JSON.stringify({ message }),
    });
  },
  disableMaintenance: async () => {
    return await api('/admin/maintenance/disable', { method: 'POST' });
  },

  fetchAdminBackups: async () => {
    return await api('/admin/backups');
  },
  fetchBackupLogs: async (id) => {
    return await api(`/admin/backups/${id}/logs`);
  },
  createBackup: async () => {
    return await api('/admin/backups', { method: 'POST' });
  },
  restoreBackup: async (id) => {
    return await api(`/admin/backups/${id}/restore`, { method: 'POST' });
  },
  deleteBackup: async (id) => {
    return await api(`/admin/backups/${id}`, { method: 'DELETE' });
  },
  uploadBackupFile: async (file) => {
    const API = getApiBaseUrl();
    const token = localStorage.getItem('token');
    const formData = new FormData();
    formData.append('backup', file);
    const res = await fetch(`${API}/admin/backups/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Upload failed');
    return data;
  },
  downloadBackup: (id) => {
    const API = getApiBaseUrl();
    const a = document.createElement('a');
    a.href = `${API}/admin/backups/${id}/download`;
    a.target = '_blank';
    a.download = '';
    const authFrame = document.createElement('iframe');
    authFrame.style.display = 'none';
    document.body.appendChild(authFrame);
    const form = authFrame.contentDocument.createElement('form');
    form.method = 'GET';
    form.action = `${API}/admin/backups/${id}/download`;
    authFrame.contentDocument.body.appendChild(form);
    a.click();
    window.open(`${API}/admin/backups/${id}/download`, '_blank');
    document.body.removeChild(authFrame);
  },

  generateDiscordLinkCode: async () => {
    return await api('/discord/link/generate', { method: 'POST' });
  },

  verifyDiscordLink: async (code) => {
    return await api('/discord/link/verify', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
  },

  unlinkDiscord: async () => {
    return await api('/discord/link', { method: 'DELETE' });
  },

  getDiscordLinkStatus: async () => {
    return await api('/discord/link/status');
  },

  getDiscordNotificationSettings: async () => {
    return await api('/discord/notifications/settings');
  },

  updateDiscordNotificationSettings: async (settings) => {
    return await api('/discord/notifications/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
  },
}));
