import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { getApiBaseUrl } from '../utils/capacitor';
import Avatar from '../components/Avatar';

const API = getApiBaseUrl();

const BADGE_COLORS = {
  founding_supporter: 'from-yellow-500 to-orange-600',
  early_supporter: 'from-blue-400 to-purple-500',
  supporter: 'from-green-400 to-teal-500',
};

export default function SupporterRecognitionPage() {
  const { t } = useTranslation();
  const [data, setData] = useState(null);

  useEffect(() => {
    fetch(`${API}/donations/top-supporters`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => {});
  }, []);

  return (
    <div className="max-w-4xl mx-auto p-4">
      <h1 className="text-3xl font-bold text-primary mb-2">{t('donations.supporters')}</h1>
      <p className="text-muted mb-6">{t('donations.supportersDescription')}</p>

      {data && (
        <div className="bg-card border border-border rounded-lg p-6 mb-8">
          <div className="text-center mb-6">
            <div className="text-3xl font-bold text-yellow-400">${data.totalDonations?.toLocaleString() || 0}</div>
            <div className="text-muted text-sm">{t('donations.totalRaised')}</div>
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {data?.supporters?.map((s, i) => (
          <div
            key={i}
            className="bg-card border border-border rounded-lg p-4 hover:border-gray-400 dark:hover:border-gray-600 transition"
          >
            <div className="flex items-center gap-3 mb-2">
              <Avatar
                avatar={s.avatar}
                name={s.displayName || s.username}
                className="w-10 h-10"
                textClassName="text-lg font-bold"
              />
              <div className="flex-1 min-w-0">
                <div className="text-primary font-semibold truncate">{s.displayName || s.username}</div>
                <div className="text-xs text-muted">#{i + 1}</div>
              </div>
            </div>

            <div
              className={`text-xs font-bold px-2 py-1 rounded bg-gradient-to-r ${BADGE_COLORS[s.badge] || 'from-gray-500 to-gray-600'} text-white inline-block mb-2`}
            >
              {s.title || s.badge}
            </div>

            <div className="text-sm text-muted">
              <span className="text-yellow-400 font-semibold">${s.totalDonated?.toLocaleString()}</span> donated
            </div>
          </div>
        ))}
      </div>

      {data?.supporters?.length === 0 && (
        <div className="text-center text-muted py-12">{t('donations.noSupporters')}</div>
      )}
    </div>
  );
}
