import { useState, useEffect } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../store/useAuthStore';

export default function OAuthCallbackPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const fetchMe = useAuthStore((s) => s.fetchMe);
  const token = searchParams.get('token');
  const error = searchParams.get('error');
  const deleted = searchParams.get('deleted') === 'true';
  const restoreToken = searchParams.get('restoreToken');
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    if (token) {
      localStorage.setItem('token', token);
      fetchMe().then(() => {
        if (searchParams.get('new_user') === '1') {
          navigate('/auth/accept-terms', { replace: true });
        } else {
          navigate('/dashboard', { replace: true });
        }
      });
    }
  }, [token, fetchMe, navigate, searchParams]);

  async function handleRestore() {
    setRestoring(true);
    try {
      await useAuthStore.getState().restoreAccount(restoreToken);
      navigate('/dashboard', { replace: true });
    } catch {
      navigate('/login', { replace: true });
    } finally {
      setRestoring(false);
    }
  }

  return (
    <div className="min-h-full flex items-center justify-center bg-surface px-4 py-8">
      <div className="bg-card p-8 rounded-lg w-full max-w-md border border-border shadow-lg text-center">
        {deleted && restoreToken && (
          <>
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-yellow-100 dark:bg-yellow-900/30 mb-4">
              <span className="text-3xl">⚠️</span>
            </div>
            <h1 className="text-2xl font-bold mb-4 text-primary">{t('auth.accountDeleted')}</h1>
            <p className="text-secondary mb-4 text-sm">{t('auth.restoreAccountPrompt')}</p>
            <div className="flex gap-2 justify-center">
              <Link
                to="/login"
                className="text-sm bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-white px-4 py-2 rounded-lg"
              >
                {t('common.cancel')}
              </Link>
              <button
                onClick={handleRestore}
                disabled={restoring}
                className="text-sm bg-yellow-600 hover:bg-yellow-500 text-white px-4 py-2 rounded-lg disabled:opacity-50"
              >
                {restoring ? t('common.loading') : t('auth.restoreAccount')}
              </button>
            </div>
          </>
        )}
        {error && (
          <>
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 mb-4">
              <span className="text-3xl">❌</span>
            </div>
            <h1 className="text-2xl font-bold mb-4 text-primary">{t('auth.loginError')}</h1>
            <p className="text-secondary mb-4">{decodeURIComponent(error)}</p>
            <Link to="/login" className="text-blue-600 hover:text-blue-500 underline text-sm">
              {t('auth.backToLogin')}
            </Link>
          </>
        )}
        {token && (
          <>
            <div className="animate-spin w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-secondary">{t('auth.loginSuccess')}</p>
          </>
        )}
        {!token && !error && !deleted && (
          <>
            <h1 className="text-2xl font-bold mb-4 text-primary">{t('auth.loginError')}</h1>
            <p className="text-secondary mb-4">No authentication data received.</p>
            <Link to="/login" className="text-blue-600 hover:text-blue-500 underline text-sm">
              {t('auth.backToLogin')}
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
