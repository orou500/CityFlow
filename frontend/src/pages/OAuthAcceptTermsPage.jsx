import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../store/useAuthStore';

function TermsContent() {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-lg font-bold text-primary mb-2">{t('legal.terms.intro.title')}</h2>
        <p>{t('legal.terms.intro.content')}</p>
      </section>
      <section>
        <h3 className="font-bold text-primary mb-1">{t('legal.terms.disclaimer.title')}</h3>
        <p>{t('legal.terms.disclaimer.content')}</p>
      </section>
      <section>
        <h3 className="font-bold text-primary mb-1">{t('legal.terms.account.title')}</h3>
        <ul className="list-disc list-inside space-y-1">
          {t('legal.terms.account.items', { returnObjects: true }).map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      </section>
      <section>
        <h3 className="font-bold text-primary mb-1">{t('legal.terms.acceptableUse.title')}</h3>
        <ul className="list-disc list-inside space-y-1">
          {t('legal.terms.acceptableUse.items', { returnObjects: true }).map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      </section>
      <section>
        <h3 className="font-bold text-primary mb-1">{t('legal.terms.prohibited.title')}</h3>
        <ul className="list-disc list-inside space-y-1">
          {t('legal.terms.prohibited.items', { returnObjects: true }).map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      </section>
      <section>
        <h3 className="font-bold text-primary mb-1">{t('legal.terms.virtualEconomy.title')}</h3>
        <p>{t('legal.terms.virtualEconomy.content')}</p>
        <ul className="list-disc list-inside space-y-1 mt-2">
          {t('legal.terms.virtualEconomy.items', { returnObjects: true }).map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      </section>
      <section>
        <h3 className="font-bold text-primary mb-1">{t('legal.terms.intellectualProperty.title')}</h3>
        <p>{t('legal.terms.intellectualProperty.content')}</p>
      </section>
      <section>
        <h3 className="font-bold text-primary mb-1">{t('legal.terms.content.title')}</h3>
        <p>{t('legal.terms.content.content')}</p>
      </section>
      <section>
        <h3 className="font-bold text-primary mb-1">{t('legal.terms.availability.title')}</h3>
        <p>{t('legal.terms.availability.content')}</p>
      </section>
      <section>
        <h3 className="font-bold text-primary mb-1">{t('legal.terms.liability.title')}</h3>
        <p>{t('legal.terms.liability.content')}</p>
      </section>
      <section>
        <h3 className="font-bold text-primary mb-1">{t('legal.terms.moderation.title')}</h3>
        <p>{t('legal.terms.moderation.content')}</p>
      </section>
      <section>
        <h3 className="font-bold text-primary mb-1">{t('legal.terms.termination.title')}</h3>
        <p>{t('legal.terms.termination.content')}</p>
      </section>
      <section>
        <h3 className="font-bold text-primary mb-1">{t('legal.terms.changes.title')}</h3>
        <p>{t('legal.terms.changes.content')}</p>
      </section>
      <section>
        <h3 className="font-bold text-primary mb-1">{t('legal.terms.disputes.title')}</h3>
        <p>{t('legal.terms.disputes.content')}</p>
      </section>
      <section>
        <h3 className="font-bold text-primary mb-1">{t('legal.terms.contact.title')}</h3>
        <p>{t('legal.terms.contact.content')}</p>
      </section>
    </div>
  );
}

function PrivacyContent() {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-lg font-bold text-primary mb-2">{t('legal.privacy.intro.title')}</h2>
        <p>{t('legal.privacy.intro.content')}</p>
      </section>
      <section>
        <h3 className="font-bold text-primary mb-1">{t('legal.privacy.dataCollected.title')}</h3>
        <ul className="list-disc list-inside space-y-1">
          {t('legal.privacy.dataCollected.items', { returnObjects: true }).map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      </section>
      <section>
        <h3 className="font-bold text-primary mb-1">{t('legal.privacy.howWeUse.title')}</h3>
        <ul className="list-disc list-inside space-y-1">
          {t('legal.privacy.howWeUse.items', { returnObjects: true }).map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      </section>
      <section>
        <h3 className="font-bold text-primary mb-1">{t('legal.privacy.storage.title')}</h3>
        <p>{t('legal.privacy.storage.content')}</p>
      </section>
      <section>
        <h3 className="font-bold text-primary mb-1">{t('legal.privacy.protection.title')}</h3>
        <p>{t('legal.privacy.protection.content')}</p>
      </section>
      <section>
        <h3 className="font-bold text-primary mb-1">{t('legal.privacy.cookies.title')}</h3>
        <p>{t('legal.privacy.cookies.content')}</p>
      </section>
      <section>
        <h3 className="font-bold text-primary mb-1">{t('legal.privacy.sharing.title')}</h3>
        <p>{t('legal.privacy.sharing.content')}</p>
      </section>
      <section>
        <h3 className="font-bold text-primary mb-1">{t('legal.privacy.yourRights.title')}</h3>
        <ul className="list-disc list-inside space-y-1">
          {t('legal.privacy.yourRights.items', { returnObjects: true }).map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      </section>
      <section>
        <h3 className="font-bold text-primary mb-1">{t('legal.privacy.children.title')}</h3>
        <p>{t('legal.privacy.children.content')}</p>
      </section>
      <section>
        <h3 className="font-bold text-primary mb-1">{t('legal.privacy.changes.title')}</h3>
        <p>{t('legal.privacy.changes.content')}</p>
      </section>
      <section>
        <h3 className="font-bold text-primary mb-1">{t('legal.privacy.contact.title')}</h3>
        <p>{t('legal.privacy.contact.content')}</p>
      </section>
    </div>
  );
}

export default function OAuthAcceptTermsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const token = useAuthStore((s) => s.token);
  const fetchMe = useAuthStore((s) => s.fetchMe);
  const logout = useAuthStore((s) => s.logout);
  const [activeTab, setActiveTab] = useState('terms');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleAccept() {
    if (!acceptedTerms || !acceptedPrivacy) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/accept-terms', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to accept terms');
        return;
      }
      await fetchMe();
      navigate('/dashboard', { replace: true });
    } catch {
      setError('Failed to accept terms');
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    logout();
    window.location.href = '/login';
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface transition-colors duration-300 px-4 py-8">
      <div className="bg-card rounded-xl border border-border shadow-lg p-8 w-full max-w-2xl">
        <h1 className="text-2xl font-bold text-primary mb-2">{t('auth.welcomeToCityFlow')}</h1>
        <p className="text-secondary mb-6">{t('auth.acceptTermsPrompt')}</p>

        <div className="mb-6">
          <div className="flex border-b border-gray-200 dark:border-gray-700">
            <button
              onClick={() => setActiveTab('terms')}
              className={`flex-1 py-2 text-sm font-medium transition-colors ${
                activeTab === 'terms' ? 'text-orange-500 border-b-2 border-orange-500' : 'text-muted hover:text-primary'
              }`}
            >
              {t('legal.termsTitle')}
            </button>
            <button
              onClick={() => setActiveTab('privacy')}
              className={`flex-1 py-2 text-sm font-medium transition-colors ${
                activeTab === 'privacy'
                  ? 'text-orange-500 border-b-2 border-orange-500'
                  : 'text-muted hover:text-primary'
              }`}
            >
              {t('legal.privacyTitle')}
            </button>
          </div>

          <div className="max-h-72 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-b-lg p-4 text-sm text-secondary leading-relaxed">
            {activeTab === 'terms' ? <TermsContent /> : <PrivacyContent />}
          </div>
        </div>

        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

        <div className="space-y-3 mb-6">
          <label className="flex items-start gap-3 text-sm text-secondary cursor-pointer">
            <input
              type="checkbox"
              checked={acceptedTerms}
              onChange={(e) => setAcceptedTerms(e.target.checked)}
              className="mt-1 rounded border-gray-300 dark:border-gray-600"
            />
            <span>
              {t('auth.agreeTo')} <span className="text-orange-500 dark:text-orange-400">{t('legal.termsTitle')}</span>
            </span>
          </label>
          <label className="flex items-start gap-3 text-sm text-secondary cursor-pointer">
            <input
              type="checkbox"
              checked={acceptedPrivacy}
              onChange={(e) => setAcceptedPrivacy(e.target.checked)}
              className="mt-1 rounded border-gray-300 dark:border-gray-600"
            />
            <span>
              {t('auth.agreeTo')}{' '}
              <span className="text-orange-500 dark:text-orange-400">{t('legal.privacyTitle')}</span>
            </span>
          </label>
        </div>

        <button
          onClick={handleAccept}
          disabled={!acceptedTerms || !acceptedPrivacy || loading}
          className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-gray-300 dark:disabled:bg-gray-700 text-white font-semibold py-2.5 rounded transition-colors"
        >
          {loading ? t('common.loading') : t('auth.acceptAndContinue')}
        </button>

        <button
          onClick={handleLogout}
          className="w-full mt-3 text-sm text-muted hover:text-primary transition-colors py-2"
        >
          {t('nav.logout')}
        </button>
      </div>
    </div>
  );
}
