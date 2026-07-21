import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

const PRODUCTION_API = 'https://cityflow.sizops.co.il/api';
const PRODUCTION_UPLOADS = 'https://cityflow.sizops.co.il/uploads';

export function isNativePlatform() {
  return Capacitor.isNativePlatform();
}

export function getPlatform() {
  return Capacitor.getPlatform();
}

export function isAndroid() {
  return getPlatform() === 'android';
}

export function isIOS() {
  return getPlatform() === 'ios';
}

export function isWeb() {
  return !isNativePlatform();
}

export function getApiBaseUrl() {
  // If we are on web, use the relative path (reverse proxy handles /api)
  if (isWeb()) {
    return '/api';
  }

  // If on Native (Android/iOS)
  const platform = getPlatform();
  const isDev = import.meta.env.DEV;
  const envApi = import.meta.env.VITE_API_URL;

  // 1. Prioritize explicit environment variable
  if (envApi) return envApi;

  // 2. Android default: emulator loopback (override with VITE_API_URL for real devices)
  if (platform === 'android') {
    return 'http://10.0.2.2:5000';
  }

  // 3. iOS dev fallback
  if (isDev) {
    return 'http://localhost:5000';
  }

  // 4. Production fallback
  return PRODUCTION_API;
}

export function getUploadsBaseUrl() {
  if (isWeb()) {
    return '/uploads';
  }

  const platform = getPlatform();
  const isDev = import.meta.env.DEV;
  const envUploads = import.meta.env.VITE_UPLOADS_URL;

  if (envUploads) return envUploads;

  if (isDev) {
    return platform === 'android' ? 'http://10.0.2.2:5000/uploads' : 'http://localhost:5000/uploads';
  }

  return PRODUCTION_UPLOADS;
}

export function getAvatarUrl(avatarPath) {
  if (!avatarPath) return null;
  if (avatarPath.startsWith('http://') || avatarPath.startsWith('https://')) {
    return avatarPath;
  }
  if (isNativePlatform()) {
    const base = getApiBaseUrl().replace(/\/api$/, '');
    return `${base}${avatarPath}`;
  }
  return avatarPath;
}

export async function mobileFetch(path, options = {}) {
  const baseUrl = getApiBaseUrl();
  const token = (await Preferences.get({ key: 'token' })).value || localStorage.getItem('token');

  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${baseUrl}${path}`, { ...options, headers });
  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error(`Server returned non-JSON response (${res.status})`);
  }
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export async function saveToken(token) {
  if (isNativePlatform()) {
    await Preferences.set({ key: 'token', value: token });
  }
  localStorage.setItem('token', token);
}

export async function loadToken() {
  if (isNativePlatform()) {
    const result = await Preferences.get({ key: 'token' });
    if (result.value) {
      localStorage.setItem('token', result.value);
      return result.value;
    }
  }
  return localStorage.getItem('token');
}

export async function clearToken() {
  if (isNativePlatform()) {
    await Preferences.remove({ key: 'token' });
  }
  localStorage.removeItem('token');
}

export async function saveSetting(key, value) {
  if (isNativePlatform()) {
    await Preferences.set({ key: `cf_${key}`, value: JSON.stringify(value) });
  }
  localStorage.setItem(`cf_${key}`, JSON.stringify(value));
}

export async function loadSetting(key, defaultValue) {
  try {
    if (isNativePlatform()) {
      const result = await Preferences.get({ key: `cf_${key}` });
      if (result.value !== null) return JSON.parse(result.value);
    } else {
      const raw = localStorage.getItem(`cf_${key}`);
      if (raw !== null) return JSON.parse(raw);
    }
  } catch {
    /* ignore parse errors */
  }
  return defaultValue;
}

export async function clearSettings() {
  if (isNativePlatform()) {
    const keys = await Preferences.keys();
    const cfKeys = keys.keys.filter((k) => k.startsWith('cf_'));
    for (const k of cfKeys) {
      await Preferences.remove({ key: k });
    }
  }
}
