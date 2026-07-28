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
    console.error(`Career API Error: ${path}`, err);
    throw err;
  }
}

export const useCareerStore = create((set) => ({
  career: null,
  loading: false,
  error: null,

  fetchCareer: async () => {
    set({ loading: true, error: null });
    try {
      const data = await api('/career');
      set({ career: data.career, loading: false });
      return data.career;
    } catch (err) {
      set({ error: err.message, loading: false });
      return null;
    }
  },

  setTitle: async (title) => {
    const data = await api('/career/title', {
      method: 'POST',
      body: JSON.stringify({ title }),
    });
    set((state) => ({
      career: state.career ? { ...state.career, title: data.title } : null,
    }));
    return data;
  },

  prestige: async () => {
    const data = await api('/career/prestige', { method: 'POST' });
    set((state) => ({
      career: state.career
        ? {
            ...state.career,
            level: data.prestige.level,
            xp: data.prestige.xp,
            xpToNextLevel: data.prestige.xpToNextLevel,
            prestigeLevel: data.prestige.prestigeLevel,
          }
        : null,
    }));
    return data;
  },
}));
