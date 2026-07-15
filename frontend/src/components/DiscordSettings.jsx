import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../store/useAuthStore';

export default function DiscordSettings() {
  const { t } = useTranslation();
  const token = useAuthStore((s) => s.token);
  const [linkStatus, setLinkStatus] = useState({ linked: false });
  const [linkCode, setLinkCode] = useState('');
  const [verifyCode, setVerifyCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [notifSettings, setNotifSettings] = useState(null);
  const [notifsLoading, setNotifsLoading] = useState(false);

  useEffect(() => {
    fetchLinkStatus();
    fetchNotifSettings();
  }, []);

  async function fetchLinkStatus() {
    try {
      const res = await fetch('/api/discord/link/status', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setLinkStatus(data);
    } catch {
      /* ignore */
    }
  }

  async function fetchNotifSettings() {
    setNotifsLoading(true);
    try {
      const res = await fetch('/api/discord/notifications/settings', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setNotifSettings(data);
    } catch {
      /* ignore */
    }
    setNotifsLoading(false);
  }

  async function generateCode() {
    setLoading(true);
    setMsg('');
    try {
      const res = await fetch('/api/discord/link/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.error) setMsg(data.error);
      else setLinkCode(data.code);
    } catch {
      setMsg(t('discord.failedToGenerateCode'));
    }
    setLoading(false);
  }

  async function verifyLink() {
    if (!verifyCode) return;
    setLoading(true);
    setMsg('');
    try {
      const res = await fetch('/api/discord/link/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ code: verifyCode }),
      });
      const data = await res.json();
      if (data.error) {
        setMsg(data.error);
      } else {
        setMsg(t('discord.linkSuccess'));
        setLinkCode('');
        setVerifyCode('');
        fetchLinkStatus();
      }
    } catch {
      setMsg(t('discord.failedToVerify'));
    }
    setLoading(false);
  }

  async function unlink() {
    if (!confirm(t('discord.confirmUnlink'))) return;
    setLoading(true);
    setMsg('');
    try {
      const res = await fetch('/api/discord/link', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.error) setMsg(data.error);
      else {
        setMsg(t('discord.unlinkSuccess'));
        setLinkStatus({ linked: false });
      }
    } catch {
      setMsg(t('discord.failedToUnlink'));
    }
    setLoading(false);
  }

  async function updateNotifPref(key, value) {
    if (!notifSettings) return;
    const updated = { ...notifSettings.preferences, [key]: value };
    setNotifSettings({ ...notifSettings, preferences: updated });
    try {
      await fetch('/api/discord/notifications/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ preferences: updated }),
      });
    } catch {
      setNotifSettings(notifSettings);
    }
  }

  return (
    <div className="space-y-6">
      {msg && (
        <div
          className={`p-3 rounded text-sm ${
            msg.includes('success') || msg.includes('linked')
              ? 'bg-green-900 text-green-300'
              : 'bg-red-900 text-red-300'
          }`}
        >
          {msg}
        </div>
      )}

      <div>
        <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-3">{t('discord.linkTitle')}</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">{t('discord.linkDescription')}</p>

        {linkStatus.linked ? (
          <div className="flex items-center gap-3 bg-green-900/20 border border-green-800 rounded-lg px-4 py-3">
            <span className="text-green-500 text-lg">✓</span>
            <div className="flex-1">
              <span className="text-sm text-green-600 dark:text-green-400 font-medium">{t('discord.linked')}</span>
              <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">
                ID: {linkStatus.discordId}
              </span>
            </div>
            <button
              onClick={unlink}
              disabled={loading}
              className="text-xs text-red-600 dark:text-red-400 hover:text-red-500"
            >
              {t('discord.unlink')}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {linkCode ? (
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">{t('discord.enterCodeInCityflow')}</p>
                <div className="flex items-center gap-3">
                  <code className="text-lg font-mono font-bold text-gray-900 dark:text-white bg-gray-100 dark:bg-gray-700 px-3 py-1 rounded">
                    {linkCode}
                  </code>
                </div>
                <div className="mt-3 flex gap-2">
                  <input
                    type="text"
                    value={verifyCode}
                    onChange={(e) => setVerifyCode(e.target.value)}
                    placeholder={t('discord.enterYourCode')}
                    className="flex-1 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded px-3 py-2 text-sm text-gray-900 dark:text-white"
                    maxLength={6}
                  />
                  <button
                    onClick={verifyLink}
                    disabled={loading || verifyCode.length !== 6}
                    className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg"
                  >
                    {t('discord.verify')}
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={generateCode}
                disabled={loading}
                className="bg-[#5865F2] hover:bg-[#4752C4] text-white text-sm px-4 py-2 rounded-lg font-medium flex items-center gap-2"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
                </svg>
                {t('discord.linkDiscordAccount')}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
        <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-3">{t('discord.notifications')}</h3>
        {notifsLoading ? (
          <div className="text-sm text-gray-500">{t('common.loading')}</div>
        ) : notifSettings ? (
          <div className="space-y-3">
            {[
              { key: 'gameEvents', label: t('discord.gameEvents'), emoji: '🌍' },
              { key: 'worldEvents', label: t('discord.worldEvents'), emoji: '🏙️' },
              { key: 'achievements', label: t('discord.achievements'), emoji: '🏆' },
              { key: 'systemAlerts', label: t('discord.systemAlerts'), emoji: '🚨' },
            ].map((item) => (
              <div key={item.key} className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 rounded-lg px-4 py-3">
                <div className="flex items-center gap-2">
                  <span>{item.emoji}</span>
                  <span className="text-sm text-gray-900 dark:text-white">{item.label}</span>
                </div>
                <button
                  onClick={() => updateNotifPref(item.key, !notifSettings.preferences[item.key])}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                    notifSettings.preferences[item.key] ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
                  }`}
                >
                  <span
                    className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                      notifSettings.preferences[item.key] ? 'translate-x-5' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
