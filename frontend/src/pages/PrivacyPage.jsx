import { useTranslation } from 'react-i18next';

export default function PrivacyPage() {
  const { t } = useTranslation();

  return (
    <div className="flex-1 overflow-y-auto bg-surface transition-colors duration-300">
      <div className="max-w-3xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-bold text-primary mb-2">{t('legal.privacyTitle')}</h1>
        <p className="text-muted text-sm mb-8">{t('legal.lastUpdated', { date: '2026-07-10' })}</p>

        <div className="prose dark:prose-invert max-w-none space-y-8 text-secondary leading-relaxed">
          <section>
            <h2 className="text-xl font-bold text-primary mb-3">{t('legal.privacy.intro.title')}</h2>
            <p>{t('legal.privacy.intro.content')}</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-primary mb-3">{t('legal.privacy.dataCollected.title')}</h2>
            <ul className="list-disc list-inside space-y-1">
              {t('legal.privacy.dataCollected.items', { returnObjects: true }).map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-primary mb-3">{t('legal.privacy.howWeUse.title')}</h2>
            <ul className="list-disc list-inside space-y-1">
              {t('legal.privacy.howWeUse.items', { returnObjects: true }).map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-primary mb-3">{t('legal.privacy.storage.title')}</h2>
            <p>{t('legal.privacy.storage.content')}</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-primary mb-3">{t('legal.privacy.protection.title')}</h2>
            <p>{t('legal.privacy.protection.content')}</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-primary mb-3">{t('legal.privacy.cookies.title')}</h2>
            <p>{t('legal.privacy.cookies.content')}</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-primary mb-3">{t('legal.privacy.sharing.title')}</h2>
            <p>{t('legal.privacy.sharing.content')}</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-primary mb-3">{t('legal.privacy.yourRights.title')}</h2>
            <ul className="list-disc list-inside space-y-1">
              {t('legal.privacy.yourRights.items', { returnObjects: true }).map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-primary mb-3">{t('legal.privacy.children.title')}</h2>
            <p>{t('legal.privacy.children.content')}</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-primary mb-3">{t('legal.privacy.changes.title')}</h2>
            <p>{t('legal.privacy.changes.content')}</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-primary mb-3">{t('legal.privacy.contact.title')}</h2>
            <p>{t('legal.privacy.contact.content')}</p>
          </section>
        </div>
      </div>
    </div>
  );
}
