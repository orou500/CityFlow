import { create } from 'zustand';

const API = '/api';

async function api(path, options = {}) {
  const token = localStorage.getItem('token');
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API}${path}`, { ...options, headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
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

  applyLoan: async (principal, durationTicks) => {
    const data = await api('/bank/apply', {
      method: 'POST',
      body: JSON.stringify({ principal, durationTicks }),
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
  adminProperties: [],
  adminEvents: [],

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

  fetchAdminUsers: async () => {
    const data = await api('/admin/users');
    set({ adminUsers: data });
    return data;
  },

  setUserBalance: async (userId, balance) => {
    return await api(`/admin/users/${userId}/balance`, {
      method: 'PUT',
      body: JSON.stringify({ balance }),
    });
  },

  toggleUserBan: async (userId) => {
    return await api(`/admin/users/${userId}/ban`, { method: 'PUT' });
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

  fetchNotifications: async () => {
    try {
      const notifications = await api('/notifications');
      set({ notifications });
      return notifications;
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
    return await api(`/notifications/${id}/read`, { method: 'PUT' });
  },

  markAllRead: async () => {
    return await api('/notifications/read-all', { method: 'PUT' });
  },

  deleteNotification: async (id) => {
    return await api(`/notifications/${id}`, { method: 'DELETE' });
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

  clearSelection: () => {
    set({ selectedCity: null, cityProperties: [], cityEvents: [] });
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
    try {
      const res = await fetch('/api/maintenance');
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
    const token = localStorage.getItem('token');
    const formData = new FormData();
    formData.append('backup', file);
    const res = await fetch('/api/admin/backups/upload', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Upload failed');
    return data;
  },
  downloadBackup: (id) => {
    const a = document.createElement('a');
    a.href = `/api/admin/backups/${id}/download`;
    a.target = '_blank';
    a.download = '';
    const authFrame = document.createElement('iframe');
    authFrame.style.display = 'none';
    document.body.appendChild(authFrame);
    const form = authFrame.contentDocument.createElement('form');
    form.method = 'GET';
    form.action = `/api/admin/backups/${id}/download`;
    authFrame.contentDocument.body.appendChild(form);
    a.click();
    window.open(`/api/admin/backups/${id}/download`, '_blank');
    document.body.removeChild(authFrame);
  },
}));
