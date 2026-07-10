import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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

export const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      loading: true,
      error: null,

      login: async (login, password) => {
        set({ loading: true, error: null });
        try {
          const data = await api('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ login, password }),
          });
          localStorage.setItem('token', data.token);
          set({ user: data.user, token: data.token, loading: false });
          return data;
        } catch (err) {
          set({ error: err.message, loading: false });
          throw err;
        }
      },

      register: async (username, email, password, confirmPassword) => {
        set({ loading: true, error: null });
        try {
          const data = await api('/auth/register', {
            method: 'POST',
            body: JSON.stringify({ username, email, password, confirmPassword }),
          });
          localStorage.setItem('token', data.token);
          set({ user: data.user, token: data.token, loading: false });
          return data;
        } catch (err) {
          set({ error: err.message, loading: false });
          throw err;
        }
      },

      fetchMe: async () => {
        try {
          const rawToken = localStorage.getItem('token');
          if (rawToken) set({ token: rawToken });
          const data = await api('/users/me');
          set({ user: data.user || data, loading: false, token: rawToken });
          return data;
        } catch {
          get().logout();
        }
      },

      logout: () => {
        localStorage.removeItem('token');
        set({ user: null, token: null });
      },
    }),
    { name: 'cityflow-auth', partialize: (state) => ({ token: state.token }) },
  ),
);
