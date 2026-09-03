import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../store/useAuthStore';
import { getApiBaseUrl } from '../utils/capacitor';
import { onSocketEvent } from '../utils/socket';

export default function SizOpsSettings() {
  const { t } = useTranslation();
  const token = useAuthStore((s) => s.token);
  const API = getApiBaseUrl();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [password, setPassword] = useState('');

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API}/auth/sizops/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!data.error) setStatus(data);
    } catch {
      /* ignore */
    }
  }, [API, token]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // When the connection is removed server-side (disconnect initiated from the
  // SizOps settings), refresh so the UI always reflects the real state.
  useEffect(() => {
    return onSocketEvent('sizops:connection:updated', (data) => {
      if (data && data.connected === false) {
        setStatus((prev) => (prev ? { ...prev, connected: false, sizopsUserId: '' } : prev));
        fetchStatus();
      }
    });
  }, [fetchStatus]);

  async function handleConnect() {
    setLoading(true);
    setMsg('');
    try {
      const res = await fetch(`${API}/auth/sizops/link-start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.error) {
        setMsg(data.error);
      } else if (data.url) {
        window.location.href = data.url;
        return;
      }
    } catch {
      setMsg(t('settings.sizops.failedToStart'));
    }
    setLoading(false);
  }

  async function handleUnlink() {
    if (!confirm(t('settings.sizops.confirmUnlink'))) return;
    setLoading(true);
    setMsg('');
    try {
      const body = showPassword ? { password } : {};
      const res = await fetch(`${API}/auth/sizops/unlink`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.error) {
        if (data.passwordRequired) {
          setShowPassword(true);
          setMsg(data.error);
        } else {
          setMsg(data.error);
        }
      } else {
        setMsg(t('settings.sizops.unlinkSuccess'));
        setShowPassword(false);
        setPassword('');
        setStatus((prev) => (prev ? { ...prev, connected: false, sizopsUserId: '' } : prev));
        fetchStatus();
      }
    } catch {
      setMsg(t('settings.sizops.failedToUnlink'));
    }
    setLoading(false);
  }

  return (
    <div className="space-y-4">
      {msg && (
        <div
          className={`p-3 rounded text-sm ${
            msg.includes('success') || msg.includes('linked') || msg.includes('unlinked')
              ? 'bg-green-900 text-green-300'
              : 'bg-red-900 text-red-300'
          }`}
        >
          {msg}
        </div>
      )}

      <div>
        <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-3">{t('settings.sizops.title')}</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">{t('settings.sizops.description')}</p>

        {status?.connected ? (
          <div className="flex items-center gap-3 bg-green-900/20 border border-green-800 rounded-lg px-4 py-3">
            <span className="text-green-500 text-lg">✓</span>
            <div className="flex-1">
              <span className="text-sm text-green-600 dark:text-green-400 font-medium">
                {t('settings.sizops.connected')}
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400 ms-2">
                {t('settings.sizops.sizopsId')}: {status.sizopsUserId}
              </span>
            </div>
            <button
              onClick={handleUnlink}
              disabled={loading}
              className="text-xs text-red-600 dark:text-red-400 hover:text-red-500"
            >
              {t('settings.sizops.disconnect')}
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-3">
            <span className="text-gray-400 text-lg">○</span>
            <span className="text-sm text-gray-600 dark:text-gray-400 flex-1">{t('settings.sizops.notConnected')}</span>
            <button
              onClick={handleConnect}
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg font-medium"
            >
              {t('settings.sizops.connect')}
            </button>
          </div>
        )}

        {showPassword && status?.hasPassword && (
          <div className="mt-3 space-y-2">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('settings.sizops.currentPassword')}
              className="w-full bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded px-3 py-2 text-sm text-gray-900 dark:text-white"
            />
            <button
              onClick={handleUnlink}
              disabled={loading || !password}
              className="bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg"
            >
              {t('settings.sizops.confirmDisconnect')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
