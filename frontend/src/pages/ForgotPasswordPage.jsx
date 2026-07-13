import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export default function ForgotPasswordPage() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const cooldownRef = useRef(null);

  useEffect(() => {
    if (cooldown > 0) {
      cooldownRef.current = setTimeout(() => setCooldown((c) => c - 1), 1000);
      return () => clearTimeout(cooldownRef.current);
    }
  }, [cooldown]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (res.status === 429) {
        setCooldown(data.retryAfter || 60);
        setError(t('auth.cooldownSeconds', { seconds: data.retryAfter || 60 }));
        return;
      }
      if (!res.ok) throw new Error(data.error);
      setSubmitted(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-full flex items-center justify-center bg-surface px-4 py-8">
      <div className="bg-card p-8 rounded-lg w-full max-w-md border border-border shadow-lg">
        <h1 className="text-2xl font-bold mb-6 text-center text-primary">{t('auth.forgotPassword')}</h1>

        {error && (
          <div className="bg-red-900/20 dark:bg-red-900 text-red-600 dark:text-red-300 p-3 rounded mb-4 text-sm">
            {error}
          </div>
        )}

        {submitted ? (
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 mb-4">
              <span className="text-3xl">📧</span>
            </div>
            <p className="text-secondary mb-4">{t('auth.resetEmailSent')}</p>
            <Link to="/login" className="text-blue-600 hover:text-blue-500 underline text-sm">
              {t('auth.backToLogin')}
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-sm text-secondary">{t('auth.forgotPasswordDesc')}</p>
            <div>
              <label className="block text-sm text-muted mb-1">{t('auth.email')}</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded px-3 py-2 text-primary"
                required
              />
            </div>
            <button
              type="submit"
              disabled={loading || cooldown > 0}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white py-2 rounded transition-colors disabled:opacity-50"
            >
              {cooldown > 0
                ? t('auth.cooldownSeconds', { seconds: cooldown })
                : loading
                  ? t('common.loading')
                  : t('auth.sendResetLink')}
            </button>
          </form>
        )}

        {!submitted && (
          <p className="mt-4 text-sm text-center text-muted">
            <Link to="/login" className="text-blue-600 hover:text-blue-500 underline">
              {t('auth.backToLogin')}
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
