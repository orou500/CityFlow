import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../store/useAuthStore';
import { translateError } from '../i18n/errors';

export default function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { login, register, error, loading } = useAuthStore();
  const [isRegister, setIsRegister] = useState(false);
  const [resendEmail, setResendEmail] = useState('');
  const [resendLoading, setResendLoading] = useState(false);
  const [resendSent, setResendSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const cooldownRef = useRef(null);
  const [form, setForm] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    acceptedTerms: false,
    acceptedPrivacy: false,
  });

  useEffect(() => {
    if (cooldown > 0) {
      cooldownRef.current = setTimeout(() => setCooldown((c) => c - 1), 1000);
      return () => clearTimeout(cooldownRef.current);
    }
  }, [cooldown]);

  const isVerificationError = error === 'Please verify your email before logging in';

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (isRegister) {
        if (form.password.length < 8) {
          useAuthStore.setState({ error: t('auth.passwordTooShort'), loading: false });
          return;
        }
        if (!/[A-Z]/.test(form.password)) {
          useAuthStore.setState({ error: t('auth.passwordNoUppercase'), loading: false });
          return;
        }
        if (!/[a-z]/.test(form.password)) {
          useAuthStore.setState({ error: t('auth.passwordNoLowercase'), loading: false });
          return;
        }
        if (!/[0-9]/.test(form.password)) {
          useAuthStore.setState({ error: t('auth.passwordNoNumber'), loading: false });
          return;
        }
        await register(
          form.username,
          form.email,
          form.password,
          form.confirmPassword,
          form.acceptedTerms,
          form.acceptedPrivacy,
        );
      } else {
        await login(form.email.trim(), form.password);
      }
      navigate('/');
    } catch {}
  };

  const handleResend = async () => {
    setResendLoading(true);
    try {
      const res = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resendEmail.trim() }),
      });
      const data = await res.json();
      if (res.status === 429) {
        setCooldown(data.retryAfter || 60);
        return;
      }
      setResendSent(true);
    } catch {
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <div className="min-h-full flex items-center justify-center bg-surface px-4 py-8">
      <div className="bg-card p-8 rounded-lg w-full max-w-md border border-border shadow-lg">
        <h1 className="text-2xl font-bold mb-6 text-center text-primary">
          {isRegister ? t('auth.register') : t('auth.login')}
        </h1>

        {error && (
          <div className="bg-red-900/20 dark:bg-red-900 text-red-600 dark:text-red-300 p-3 rounded mb-4 text-sm">
            {t(`errors.${error}`, { defaultValue: error })}
            {isVerificationError && !resendSent && (
              <div className="mt-3 pt-3 border-t border-red-800">
                <p className="mb-2 text-xs text-red-400">{t('auth.enterEmailToResend')}</p>
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={resendEmail}
                    onChange={(e) => setResendEmail(e.target.value)}
                    placeholder={t('auth.email')}
                    className="flex-1 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded px-2 py-1 text-sm text-primary"
                  />
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={resendLoading || !resendEmail.trim() || cooldown > 0}
                    className="text-xs bg-red-600 hover:bg-red-500 text-white px-3 py-1 rounded disabled:opacity-50 whitespace-nowrap"
                  >
                    {cooldown > 0
                      ? t('auth.cooldownSeconds', { seconds: cooldown })
                      : resendLoading
                        ? '...'
                        : t('auth.resendVerification')}
                  </button>
                </div>
              </div>
            )}
            {isVerificationError && resendSent && (
              <div className="mt-3 pt-3 border-t border-red-800">
                <p className="text-xs text-green-400">{t('auth.verificationResent')}</p>
              </div>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {isRegister && (
            <div>
              <label className="block text-sm text-muted mb-1">{t('auth.username')}</label>
              <input
                type="text"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                className="w-full bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded px-3 py-2 text-primary"
                required
              />
            </div>
          )}
          <div>
            <label className="block text-sm text-muted mb-1">
              {isRegister ? t('auth.email') : t('auth.loginLabel')}
            </label>
            <input
              type={isRegister ? 'email' : 'text'}
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded px-3 py-2 text-primary"
              required
            />
          </div>
          <div>
            <label className="block text-sm text-muted mb-1">{t('auth.password')}</label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="w-full bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded px-3 py-2 text-primary"
              required
              minLength={8}
            />
            {isRegister && <p className="mt-1 text-xs text-muted">{t('auth.passwordRequirements')}</p>}
          </div>
          {isRegister && (
            <div>
              <label className="block text-sm text-muted mb-1">{t('auth.confirmPassword')}</label>
              <input
                type="password"
                value={form.confirmPassword}
                onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                className="w-full bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded px-3 py-2 text-primary"
                required
              />
            </div>
          )}
          {isRegister && (
            <div className="space-y-2">
              <label className="flex items-start gap-2 text-sm text-secondary">
                <input
                  type="checkbox"
                  checked={form.acceptedTerms}
                  onChange={(e) => setForm({ ...form, acceptedTerms: e.target.checked })}
                  className="mt-1 rounded border-gray-300 dark:border-gray-600"
                  required
                />
                <span>
                  {t('auth.agreeTo')}{' '}
                  <Link to="/terms" target="_blank" className="text-orange-500 dark:text-orange-400 hover:underline">
                    {t('legal.termsTitle')}
                  </Link>
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm text-secondary">
                <input
                  type="checkbox"
                  checked={form.acceptedPrivacy}
                  onChange={(e) => setForm({ ...form, acceptedPrivacy: e.target.checked })}
                  className="mt-1 rounded border-gray-300 dark:border-gray-600"
                  required
                />
                <span>
                  {t('auth.agreeTo')}{' '}
                  <Link to="/privacy" target="_blank" className="text-orange-500 dark:text-orange-400 hover:underline">
                    {t('legal.privacyTitle')}
                  </Link>
                </span>
              </label>
            </div>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white py-2 rounded transition-colors disabled:opacity-50"
          >
            {loading ? t('common.loading') : isRegister ? t('auth.register') : t('auth.login')}
          </button>
        </form>

        {!isRegister && (
          <p className="mt-3 text-sm text-center">
            <Link to="/forgot-password" className="text-blue-600 hover:text-blue-500 underline">
              {t('auth.forgotPassword')}
            </Link>
          </p>
        )}

        <p className="mt-4 text-sm text-center text-muted">
          {isRegister ? t('auth.hasAccount') : t('auth.noAccount')}{' '}
          <button
            onClick={() => setIsRegister(!isRegister)}
            className="text-orange-500 dark:text-orange-400 hover:text-orange-500"
          >
            {isRegister ? t('auth.login') : t('auth.register')}
          </button>
        </p>
      </div>
    </div>
  );
}
