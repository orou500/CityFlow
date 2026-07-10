import { useTranslation } from 'react-i18next';

export default function CookiesPage() {
  const { t } = useTranslation();

  return (
    <div className="flex-1 overflow-y-auto bg-surface transition-colors duration-300">
      <div className="max-w-3xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-bold text-primary mb-2">{t('legal.cookiesTitle')}</h1>
        <p className="text-muted text-sm mb-8">{t('legal.lastUpdated', { date: '2026-07-10' })}</p>

        <div className="prose dark:prose-invert max-w-none space-y-8 text-secondary leading-relaxed">
          <section>
            <h2 className="text-xl font-bold text-primary mb-3">{t('legal.cookiesPolicy.intro.title')}</h2>
            <p>{t('legal.cookiesPolicy.intro.content')}</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-primary mb-3">{t('legal.cookiesPolicy.whatAre.title')}</h2>
            <p>{t('legal.cookiesPolicy.whatAre.content')}</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-primary mb-3">{t('legal.cookiesPolicy.howWeUse.title')}</h2>
            <ul className="list-disc list-inside space-y-1">
              {t('legal.cookiesPolicy.howWeUse.items', { returnObjects: true }).map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-primary mb-3">{t('legal.cookiesPolicy.types.title')}</h2>
            <div className="space-y-4">
              {['essential', 'functional', 'analytics'].map((type) => (
                <div key={type} className="bg-card rounded-lg border border-border p-4">
                  <h3 className="font-bold text-primary mb-1">{t(`legal.cookiesPolicy.types.${type}.title`)}</h3>
                  <p className="text-sm">{t(`legal.cookiesPolicy.types.${type}.content`)}</p>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-xl font-bold text-primary mb-3">{t('legal.cookiesPolicy.session.title')}</h2>
            <p>{t('legal.cookiesPolicy.session.content')}</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-primary mb-3">{t('legal.cookiesPolicy.thirdParty.title')}</h2>
            <p>{t('legal.cookiesPolicy.thirdParty.content')}</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-primary mb-3">{t('legal.cookiesPolicy.manage.title')}</h2>
            <p>{t('legal.cookiesPolicy.manage.content')}</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-primary mb-3">{t('legal.cookiesPolicy.changes.title')}</h2>
            <p>{t('legal.cookiesPolicy.changes.content')}</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-primary mb-3">{t('legal.cookiesPolicy.contact.title')}</h2>
            <p>{t('legal.cookiesPolicy.contact.content')}</p>
          </section>
        </div>
      </div>
    </div>
  );
}
