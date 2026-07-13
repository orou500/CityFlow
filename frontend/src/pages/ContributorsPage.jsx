import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

export default function ContributorsPage() {
  const { t } = useTranslation();
  const [contributors, setContributors] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/contributors.json')
      .then((res) => {
        if (!res.ok) throw new Error('Not found');
        return res.json();
      })
      .then((data) => {
        setContributors(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => {
        setContributors([]);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="min-h-full flex items-center justify-center p-4 bg-surface">
        <div className="text-muted">{t('common.loading')}</div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-surface transition-colors duration-300">
      <div className="max-w-3xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-bold text-primary mb-2">{t('contributors.title')}</h1>
        <p className="text-muted text-sm mb-8">{t('contributors.subtitle')}</p>

        {contributors.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted mb-4">{t('contributors.noContributors')}</p>
            <p className="text-sm text-muted">{t('contributors.beFirst')}</p>
            <Link
              to="/"
              className="inline-block mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded transition-colors"
            >
              {t('contributors.backToHome')}
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {contributors.map((c, i) => (
              <div
                key={i}
                className="bg-white dark:bg-gray-800 rounded-lg p-5 border border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600 transition-colors"
              >
                <div className="flex items-center gap-3">
                  {c.github ? (
                    <img
                      src={`https://github.com/${c.github}.png?size=64`}
                      alt={c.name}
                      className="w-12 h-12 rounded-full bg-gray-200 dark:bg-gray-700"
                      onError={(e) => {
                        e.target.style.display = 'none';
                      }}
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-lg">
                      {c.name?.charAt(0)?.toUpperCase() || '?'}
                    </div>
                  )}
                  <div>
                    <h3 className="font-semibold text-primary">{c.name}</h3>
                    {c.github && (
                      <a
                        href={`https://github.com/${c.github}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        @{c.github}
                      </a>
                    )}
                    {c.role && <p className="text-xs text-muted mt-0.5">{c.role}</p>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
