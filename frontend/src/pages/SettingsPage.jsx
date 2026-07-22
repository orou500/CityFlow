import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../store/useAuthStore';
import { getApiBaseUrl } from '../utils/capacitor';
import DiscordSettings from '../components/DiscordSettings';

export default function SettingsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { logout } = useAuthStore();
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  async function handleDeleteAccount() {
    const token = useAuthStore.getState().token;
    const API = getApiBaseUrl();
    setDeleting(true);
    try {
      const res = await fetch(`${API}/users/account`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.error) return;
      await logout();
      navigate('/login');
    } catch {
      /* ignore */
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('settings.title')}</h1>

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <DiscordSettings />
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-sm font-medium text-red-600 dark:text-red-400 mb-3">{t('profile.dangerZone')}</h3>
        {!showDeleteConfirm ? (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="text-sm bg-red-900/20 dark:bg-red-900/30 hover:bg-red-900/40 text-red-600 dark:text-red-400 px-4 py-2 rounded-lg transition-colors"
          >
            {t('profile.deleteAccount')}
          </button>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-gray-600 dark:text-gray-400">{t('profile.deleteAccountConfirm')}</p>
            <p className="text-xs text-gray-500 dark:text-gray-500">{t('profile.deleteAccountWarning')}</p>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder={t('profile.deleteAccountPlaceholder')}
              className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded px-3 py-2 text-gray-900 dark:text-white text-sm"
            />
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setDeleteConfirmText('');
                }}
                className="text-sm bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-900 dark:text-white px-4 py-2 rounded-lg transition-colors"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={deleteConfirmText !== 'DELETE' || deleting}
                className="text-sm bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
              >
                {deleting ? t('common.loading') : t('profile.confirmDelete')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
