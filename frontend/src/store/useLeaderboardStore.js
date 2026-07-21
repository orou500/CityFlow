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

export const useLeaderboardStore = create((set) => ({
  rankings: [],
  myRank: null,
  myRanks: null,
  history: [],
  playerProfile: null,
  events: [],
  selectedEvent: null,
  summary: null,
  total: 0,
  loading: false,
  error: null,

  fetchRankings: async (category, { season, limit, offset } = {}) => {
    set({ loading: true, error: null });
    try {
      const params = new URLSearchParams();
      if (season) params.set('season', season);
      if (limit) params.set('limit', limit);
      if (offset) params.set('offset', offset);
      const qs = params.toString() ? `?${params.toString()}` : '';
      const data = await api(`/leaderboards/rankings/${category}${qs}`);
      set({
        rankings: data.rankings,
        total: data.total,
        loading: false,
      });
      return data;
    } catch (err) {
      set({ error: err.message, loading: false });
    }
  },

  fetchMyRank: async (category) => {
    try {
      const params = category ? `?category=${category}` : '';
      const data = await api(`/leaderboards/my-rank${params}`);
      set({ myRanks: data });
      return data;
    } catch {
      return null;
    }
  },

  fetchHistory: async (category, { season, limit } = {}) => {
    try {
      const params = new URLSearchParams();
      if (season) params.set('season', season);
      if (limit) params.set('limit', limit);
      const qs = params.toString() ? `?${params.toString()}` : '';
      const data = await api(`/leaderboards/history/${category}${qs}`);
      set({ history: data.history || [] });
      return data;
    } catch {
      set({ history: [] });
    }
  },

  fetchPlayerProfile: async (userId) => {
    try {
      const data = await api(`/leaderboards/player/${userId}`);
      set({ playerProfile: data });
      return data;
    } catch {
      set({ playerProfile: null });
      return null;
    }
  },

  fetchEvents: async (status) => {
    try {
      const qs = status ? `?status=${status}` : '';
      const data = await api(`/leaderboards/events${qs}`);
      set({ events: data.events || [] });
      return data;
    } catch {
      set({ events: [] });
    }
  },

  fetchEvent: async (id) => {
    try {
      const data = await api(`/leaderboards/events/${id}`);
      set({ selectedEvent: data.event });
      return data;
    } catch {
      set({ selectedEvent: null });
      return null;
    }
  },

  fetchSummary: async () => {
    try {
      const data = await api('/leaderboards/summary');
      set({ summary: data });
      return data;
    } catch {
      return null;
    }
  },

  clearPlayerProfile: () => set({ playerProfile: null }),
  clearHistory: () => set({ history: [] }),
}));
