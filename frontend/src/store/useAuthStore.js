import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { getApiBaseUrl, saveToken, loadToken, clearToken } from '../utils/capacitor';

function getApiBase() {
  return getApiBaseUrl();
}

async function api(path, options = {}) {
  const API = getApiBase();
  const token = (await loadToken()) || localStorage.getItem('token');
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API}${path}`, { ...options, headers });
  console.log(`API Request: ${options.method || 'GET'} ${API}${path} - Status: ${res.status}`);
  let data;
  try {
    data = await res.json();
  } catch (err) {
    console.error(`API Parse Error: ${API}${path}`, err);
    throw new ApiError(`Server returned non-JSON response (${res.status})`, res.status);
  }
  if (!res.ok) throw new ApiError(data.error || 'Request failed', res.status, data);
  return data;
}

class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
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
          await saveToken(data.token);
          set({ user: data.user, token: data.token, loading: false });
          return data;
        } catch (err) {
          if (err.status === 403 && err.data?.deleted) {
            set({ loading: false });
            throw { ...err, deleted: true, restoreToken: err.data.restoreToken };
          }
          set({ error: err.message, loading: false });
          throw err;
        }
      },

      restoreAccount: async (restoreToken) => {
        set({ loading: true, error: null });
        try {
          const data = await api('/auth/restore-account', {
            method: 'POST',
            body: JSON.stringify({ restoreToken }),
          });
          await saveToken(data.token);
          set({ user: data.user, token: data.token, loading: false });
          return data;
        } catch (err) {
          set({ error: err.message, loading: false });
          throw err;
        }
      },

      register: async (username, email, password, confirmPassword, acceptedTerms, acceptedPrivacy) => {
        set({ loading: true, error: null });
        try {
          await api('/auth/register', {
            method: 'POST',
            body: JSON.stringify({ username, email, password, confirmPassword, acceptedTerms, acceptedPrivacy }),
          });
          set({ loading: false });
          return { registered: true };
        } catch (err) {
          set({ error: err.message, loading: false });
          throw err;
        }
      },

      fetchMe: async () => {
        try {
          const rawToken = await loadToken();
          if (!rawToken) {
            set({ loading: false });
            return null;
          }
          set({ token: rawToken });
          const data = await api('/users/me');
          set({ user: data.user || data, loading: false, token: rawToken });
          return data;
        } catch (err) {
          if (err instanceof ApiError && err.status === 401) {
            get().logout();
          } else {
            set({ loading: false });
          }
        }
      },

      logout: async () => {
        await clearToken();
        localStorage.removeItem('cityflow-auth');
        set({ user: null, token: null });
      },
    }),
    { name: 'cityflow-auth', partialize: (state) => ({ token: state.token }) },
  ),
);
