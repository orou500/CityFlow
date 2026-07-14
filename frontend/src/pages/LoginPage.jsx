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
  const [registered, setRegistered] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState('');
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
        setRegisteredEmail(form.email);
        setRegistered(true);
      } else {
        await login(form.email.trim(), form.password);
        navigate('/');
      }
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
        {registered ? (
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 mb-4">
              <span className="text-3xl">📧</span>
            </div>
            <h1 className="text-2xl font-bold mb-4 text-primary">{t('auth.checkYourEmail')}</h1>
            <p className="text-secondary mb-2 text-sm">
              {t('auth.verificationEmailSentTo')} <strong>{registeredEmail}</strong>
            </p>
            <p className="text-muted text-xs mb-4">{t('auth.checkSpamFolder')}</p>
            <Link to="/login" className="text-blue-600 hover:text-blue-500 underline text-sm">
              {t('auth.backToLogin')}
            </Link>
          </div>
        ) : (
          <>
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
                      <Link
                        to="/terms"
                        target="_blank"
                        className="text-orange-500 dark:text-orange-400 hover:underline"
                      >
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
                      <Link
                        to="/privacy"
                        target="_blank"
                        className="text-orange-500 dark:text-orange-400 hover:underline"
                      >
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
              <>
                <div className="relative my-4">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-200 dark:border-gray-700" />
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-2 bg-card text-muted">{t('auth.orContinueWith')}</span>
                  </div>
                </div>
                <a
                  href="/api/auth/google"
                  className="w-full flex items-center justify-center gap-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 py-2 rounded transition-colors hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                      fill="#4285F4"
                    />
                    <path
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      fill="#34A853"
                    />
                    <path
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      fill="#FBBC05"
                    />
                    <path
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      fill="#EA4335"
                    />
                  </svg>
                  {t('auth.signInWithGoogle')}
                </a>
              </>
            )}

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
          </>
        )}
      </div>
    </div>
  );
}
