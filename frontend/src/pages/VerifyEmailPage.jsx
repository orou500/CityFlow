import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getApiBaseUrl } from '../utils/capacitor';

export default function VerifyEmailPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('no-token');
      return;
    }

    fetch(`${getApiBaseUrl()}/auth/verify-email?token=${token}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setStatus('success');
      })
      .catch((err) => {
        setError(err.message);
        setStatus('error');
      });
  }, [token]);

  if (!token) {
    return (
      <div className="min-h-full flex items-center justify-center bg-surface px-4 py-8">
        <div className="bg-card p-8 rounded-lg w-full max-w-md border border-border shadow-lg text-center">
          <h1 className="text-2xl font-bold mb-4 text-primary">{t('auth.invalidLink')}</h1>
          <p className="text-secondary mb-4">{t('auth.invalidVerifyLink')}</p>
          <Link to="/login" className="text-blue-600 hover:text-blue-500 underline">
            {t('auth.backToLogin')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full flex items-center justify-center bg-surface px-4 py-8">
      <div className="bg-card p-8 rounded-lg w-full max-w-md border border-border shadow-lg text-center">
        {status === 'loading' && (
          <>
            <div className="animate-spin w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-secondary">{t('common.loading')}</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 mb-4">
              <span className="text-3xl">✅</span>
            </div>
            <h1 className="text-2xl font-bold mb-4 text-primary">{t('auth.emailVerified')}</h1>
            <p className="text-secondary mb-4">{t('auth.emailVerifiedDesc')}</p>
            <Link to="/login" className="text-blue-600 hover:text-blue-500 underline text-sm">
              {t('auth.login')}
            </Link>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 mb-4">
              <span className="text-3xl">❌</span>
            </div>
            <h1 className="text-2xl font-bold mb-4 text-primary">{t('auth.verificationFailed')}</h1>
            <p className="text-secondary mb-4">{error || t('auth.invalidOrExpiredToken')}</p>
            <Link to="/login" className="text-blue-600 hover:text-blue-500 underline text-sm">
              {t('auth.backToLogin')}
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
