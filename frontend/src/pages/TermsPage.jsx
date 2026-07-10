import { useTranslation } from 'react-i18next';

export default function TermsPage() {
  const { t } = useTranslation();

  return (
    <div className="flex-1 overflow-y-auto bg-surface transition-colors duration-300">
      <div className="max-w-3xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-bold text-primary mb-2">{t('legal.termsTitle')}</h1>
        <p className="text-muted text-sm mb-8">{t('legal.lastUpdated', { date: '2026-07-10' })}</p>

        <div className="prose dark:prose-invert max-w-none space-y-8 text-secondary leading-relaxed">
          <section>
            <h2 className="text-xl font-bold text-primary mb-3">{t('legal.terms.intro.title')}</h2>
            <p>{t('legal.terms.intro.content')}</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-primary mb-3">{t('legal.terms.disclaimer.title')}</h2>
            <p className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-4 text-sm">
              {t('legal.terms.disclaimer.content')}
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-primary mb-3">{t('legal.terms.account.title')}</h2>
            <ul className="list-disc list-inside space-y-1">
              {t('legal.terms.account.items', { returnObjects: true }).map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-primary mb-3">{t('legal.terms.acceptableUse.title')}</h2>
            <ul className="list-disc list-inside space-y-1">
              {t('legal.terms.acceptableUse.items', { returnObjects: true }).map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-primary mb-3">{t('legal.terms.prohibited.title')}</h2>
            <ul className="list-disc list-inside space-y-1">
              {t('legal.terms.prohibited.items', { returnObjects: true }).map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-primary mb-3">{t('legal.terms.virtualEconomy.title')}</h2>
            <p className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-4 text-sm">
              {t('legal.terms.virtualEconomy.content')}
            </p>
            <ul className="list-disc list-inside space-y-1 mt-3">
              {t('legal.terms.virtualEconomy.items', { returnObjects: true }).map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-primary mb-3">{t('legal.terms.intellectualProperty.title')}</h2>
            <p>{t('legal.terms.intellectualProperty.content')}</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-primary mb-3">{t('legal.terms.content.title')}</h2>
            <p>{t('legal.terms.content.content')}</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-primary mb-3">{t('legal.terms.availability.title')}</h2>
            <p>{t('legal.terms.availability.content')}</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-primary mb-3">{t('legal.terms.liability.title')}</h2>
            <p>{t('legal.terms.liability.content')}</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-primary mb-3">{t('legal.terms.moderation.title')}</h2>
            <p>{t('legal.terms.moderation.content')}</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-primary mb-3">{t('legal.terms.termination.title')}</h2>
            <p>{t('legal.terms.termination.content')}</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-primary mb-3">{t('legal.terms.changes.title')}</h2>
            <p>{t('legal.terms.changes.content')}</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-primary mb-3">{t('legal.terms.disputes.title')}</h2>
            <p>{t('legal.terms.disputes.content')}</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-primary mb-3">{t('legal.terms.contact.title')}</h2>
            <p>{t('legal.terms.contact.content')}</p>
          </section>
        </div>
      </div>
    </div>
  );
}
