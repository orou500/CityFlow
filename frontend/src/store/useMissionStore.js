import { create } from 'zustand';
import { getApiBaseUrl, loadToken } from '../utils/capacitor';

async function api(path, options = {}) {
  const API = getApiBaseUrl();
  try {
    const token = await loadToken();
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${API}${path}`, { ...options, headers });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  } catch (err) {
    console.error(`Mission API Error: ${path}`, err);
    throw err;
  }
}

export const useMissionStore = create((set, get) => ({
  dashboard: null,
  activeMissions: [],
  completedMissions: [],
  claimedMissions: [],
  definitions: [],
  categories: [],
  types: [],
  chainData: null,
  chains: [],
  stats: null,
  loading: false,
  error: null,

  fetchDashboard: async () => {
    set({ loading: true, error: null });
    try {
      const data = await api('/missions/dashboard');
      set({
        dashboard: data,
        activeMissions: data.active || [],
        completedMissions: data.completed || [],
        claimedMissions: data.claimed || [],
        stats: data.stats || null,
        chains: data.chains || [],
        loading: false,
      });
      return data;
    } catch (err) {
      set({ error: err.message, loading: false });
      return null;
    }
  },

  fetchActiveMissions: async (filters = {}) => {
    try {
      const query = new URLSearchParams();
      if (filters.category) query.set('category', filters.category);
      if (filters.difficulty) query.set('difficulty', filters.difficulty);
      const qs = query.toString();
      const data = await api(`/missions/active${qs ? `?${qs}` : ''}`);
      set({ activeMissions: data.missions || [] });
      return data.missions;
    } catch {
      return [];
    }
  },

  fetchCompletedMissions: async () => {
    try {
      const data = await api('/missions/completed');
      set({ completedMissions: data.missions || [] });
      return data.missions;
    } catch {
      return [];
    }
  },

  fetchClaimedMissions: async () => {
    try {
      const data = await api('/missions/claimed');
      set({ claimedMissions: data.missions || [] });
      return data.missions;
    } catch {
      return [];
    }
  },

  fetchDefinitions: async (filters = {}) => {
    try {
      const query = new URLSearchParams();
      if (filters.category) query.set('category', filters.category);
      if (filters.type) query.set('type', filters.type);
      const qs = query.toString();
      const data = await api(`/missions/definitions${qs ? `?${qs}` : ''}`);
      set({
        definitions: data.missions || [],
        categories: data.categories || [],
        types: data.types || [],
      });
      return data;
    } catch {
      return null;
    }
  },

  fetchChain: async (chainId) => {
    try {
      const data = await api(`/missions/chain/${chainId}`);
      set({ chainData: data });
      return data;
    } catch {
      return null;
    }
  },

  fetchStats: async () => {
    try {
      const data = await api('/missions/stats');
      set({ stats: data.stats });
      return data.stats;
    } catch {
      return null;
    }
  },

  claimReward: async (missionId) => {
    const data = await api(`/missions/claim/${missionId}`, { method: 'POST' });
    await get().fetchDashboard();
    return data;
  },

  refreshMissions: async () => {
    const data = await api('/missions/refresh', { method: 'POST' });
    await get().fetchDashboard();
    return data;
  },

  updateMissionProgressLocal: (missionId, progress, _target) => {
    set((state) => ({
      activeMissions: state.activeMissions.map((m) => (m.missionId === missionId ? { ...m, progress } : m)),
    }));
  },

  moveMissionToCompleted: (missionId) => {
    set((state) => {
      const mission = state.activeMissions.find((m) => m.missionId === missionId);
      if (!mission) return state;
      return {
        activeMissions: state.activeMissions.filter((m) => m.missionId !== missionId),
        completedMissions: [
          { ...mission, status: 'completed', completedAt: new Date().toISOString() },
          ...state.completedMissions,
        ],
      };
    });
  },
}));
