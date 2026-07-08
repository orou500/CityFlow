import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../store/useAuthStore';
import { translateError } from '../i18n/errors';

export default function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { login, register, error, loading } = useAuthStore();
  const [isRegister, setIsRegister] = useState(false);
  const [form, setForm] = useState({ username: '', email: '', password: '' });

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (isRegister) {
        await register(form.username, form.email, form.password);
      } else {
        await login(form.email.trim(), form.password);
      }
      navigate('/');
    } catch {}
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
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-2 rounded transition-colors disabled:opacity-50"
          >
            {loading ? t('common.loading') : isRegister ? t('auth.register') : t('auth.login')}
          </button>
        </form>

        <p className="mt-4 text-sm text-center text-muted">
          {isRegister ? t('auth.hasAccount') : t('auth.noAccount')}{' '}
          <button
            onClick={() => setIsRegister(!isRegister)}
            className="text-emerald-600 dark:text-emerald-400 hover:text-emerald-500"
          >
            {isRegister ? t('auth.login') : t('auth.register')}
          </button>
        </p>
      </div>
    </div>
  );
}
