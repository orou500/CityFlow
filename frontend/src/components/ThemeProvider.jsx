import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useAuthStore } from '../store/useAuthStore';

const ThemeContext = createContext();

function getSystemTheme() {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getStoredTheme() {
  try {
    return localStorage.getItem('cityflow-theme') || 'system';
  } catch {
    return 'system';
  }
}

function resolveTheme(preference) {
  if (preference === 'system') return getSystemTheme();
  return preference;
}

function applyTheme(resolved) {
  const root = document.documentElement;
  if (resolved === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
}

export function ThemeProvider({ children }) {
  const user = useAuthStore((s) => s.user);
  const [preference, setPreferenceState] = useState(() => {
    const stored = getStoredTheme();
    if (user?.theme) return user.theme;
    return stored;
  });

  const setPreference = useCallback(
    (newPref) => {
      setPreferenceState(newPref);
      try {
        localStorage.setItem('cityflow-theme', newPref);
      } catch {}
      const resolved = resolveTheme(newPref);
      applyTheme(resolved);

      if (user) {
        fetch('/api/users/theme', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('token')}`,
          },
          body: JSON.stringify({ theme: newPref }),
        }).catch(() => {});
      }
    },
    [user],
  );

  useEffect(() => {
    if (user?.theme) {
      setPreferenceState(user.theme);
      const resolved = resolveTheme(user.theme);
      applyTheme(resolved);
      return;
    }
    const stored = getStoredTheme();
    setPreferenceState(stored);
    const resolved = resolveTheme(stored);
    applyTheme(resolved);
  }, [user?.theme]);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      const p = getStoredTheme();
      if (p === 'system') {
        applyTheme(resolveTheme('system'));
      }
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('theme-transition');
    const timer = setTimeout(() => root.classList.remove('theme-transition'), 400);
    return () => clearTimeout(timer);
  }, [preference]);

  const resolved = resolveTheme(preference);

  return <ThemeContext.Provider value={{ preference, resolved, setPreference }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
