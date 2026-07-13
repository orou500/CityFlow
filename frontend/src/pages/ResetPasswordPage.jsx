import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export default function ResetPasswordPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  if (!token) {
    return (
      <div className="min-h-full flex items-center justify-center bg-surface px-4 py-8">
        <div className="bg-card p-8 rounded-lg w-full max-w-md border border-border shadow-lg text-center">
          <h1 className="text-2xl font-bold mb-4 text-primary">{t('auth.invalidLink')}</h1>
          <p className="text-secondary mb-4">{t('auth.invalidResetLink')}</p>
          <Link to="/forgot-password" className="text-blue-600 hover:text-blue-500 underline">
            {t('auth.requestNewReset')}
          </Link>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError(t('auth.passwordsDoNotMatch'));
      return;
    }
    if (password.length < 8) {
      setError(t('auth.passwordTooShort'));
      return;
    }
    if (!/[A-Z]/.test(password)) {
      setError(t('auth.passwordNoUppercase'));
      return;
    }
    if (!/[a-z]/.test(password)) {
      setError(t('auth.passwordNoLowercase'));
      return;
    }
    if (!/[0-9]/.test(password)) {
      setError(t('auth.passwordNoNumber'));
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSuccess(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-full flex items-center justify-center bg-surface px-4 py-8">
      <div className="bg-card p-8 rounded-lg w-full max-w-md border border-border shadow-lg">
        <h1 className="text-2xl font-bold mb-6 text-center text-primary">{t('auth.resetPassword')}</h1>

        {error && (
          <div className="bg-red-900/20 dark:bg-red-900 text-red-600 dark:text-red-300 p-3 rounded mb-4 text-sm">
            {error}
          </div>
        )}

        {success ? (
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 mb-4">
              <span className="text-3xl">✅</span>
            </div>
            <p className="text-secondary mb-4">{t('auth.passwordResetSuccess')}</p>
            <Link to="/login" className="text-blue-600 hover:text-blue-500 underline text-sm">
              {t('auth.login')}
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-muted mb-1">{t('auth.newPassword')}</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded px-3 py-2 text-primary"
                required
                minLength={8}
              />
            </div>
            <div>
              <label className="block text-sm text-muted mb-1">{t('auth.confirmPassword')}</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded px-3 py-2 text-primary"
                required
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white py-2 rounded transition-colors disabled:opacity-50"
            >
              {loading ? t('common.loading') : t('auth.resetPassword')}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
