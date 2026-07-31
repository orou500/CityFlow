import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import { useCareerStore } from '../store/useCareerStore';
import { useMissionStore } from '../store/useMissionStore';
import { formatCompact } from '../utils/format';

const CATEGORY_ICONS = {
  beginner: '🌱',
  investor: '🏘️',
  wealth: '💰',
  auctions: '🔨',
  companies: '🏢',
  banking: '🏦',
  development: '🏗️',
  districts: '🗺️',
  intelligence: '📊',
  stocks: '📈',
  prestige: '🌟',
};

export default function CareerPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { career, fetchCareer, setTitle, prestige } = useCareerStore();
  const { fetchDashboard } = useMissionStore();
  const [loading, setLoading] = useState(true);
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'overview');
  const [titleMsg, setTitleMsg] = useState('');
  const [prestigeMsg, setPrestigeMsg] = useState('');
  const [prestigeLoading, setPrestigeLoading] = useState(false);

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }
    load();
  }, [user]);

  const load = async () => {
    setLoading(true);
    try {
      await Promise.all([fetchCareer(), fetchDashboard()]);
    } catch (err) {
      console.error('CareerPage load error:', err);
    }
    setLoading(false);
  };

  const handleSetTitle = async (title) => {
    try {
      await setTitle(title);
      setTitleMsg(t('career.titleUpdated'));
      setTimeout(() => setTitleMsg(''), 2000);
    } catch (err) {
      setTitleMsg(err.message);
    }
  };

  const handlePrestige = async () => {
    if (!confirm(t('career.prestigeConfirm'))) return;
    setPrestigeLoading(true);
    try {
      await prestige();
      setPrestigeMsg(t('career.prestigeSuccess'));
      setTimeout(() => setPrestigeMsg(''), 3000);
    } catch (err) {
      setPrestigeMsg(err.message);
    }
    setPrestigeLoading(false);
  };

  if (!user) return null;

  if (loading) {
    return (
      <div className="flex-1 p-4 md:p-6 overflow-y-auto">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-center py-16 text-muted">{t('common.loading')}</div>
        </div>
      </div>
    );
  }

  if (!career) {
    return (
      <div className="flex-1 p-4 md:p-6 overflow-y-auto">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-center py-16 text-muted">{t('common.error')}</div>
        </div>
      </div>
    );
  }

  const xpPercent = career.xpToNextLevel > 0 ? Math.min(Math.round((career.xp / career.xpToNextLevel) * 100), 100) : 0;

  const tabs = [
    { id: 'overview', label: t('career.overview') },
    { id: 'achievements', label: t('career.achievements') },
    { id: 'titles', label: t('career.titles') },
    { id: 'prestige', label: t('career.prestige') },
  ];

  return (
    <div className="flex-1 p-4 md:p-6 overflow-y-auto">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-primary">{t('career.title')}</h1>
          <div className="flex items-center gap-2 text-sm text-muted">
            <span className="font-semibold text-blue-600 dark:text-blue-400">
              {t('career.achievementPoints')}: {career.achievementPoints}/{career.totalAchievementPoints}
            </span>
          </div>
        </div>

        {/* Level & XP Card */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6 mb-6">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <span className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                {t('career.level')} {career.level}
              </span>
              {career.prestigeLevel > 0 && (
                <span className="text-lg font-semibold text-purple-500">
                  ✦ {t('career.prestige')} {career.prestigeLevel}
                </span>
              )}
              {career.title && (
                <span className="text-sm bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-3 py-1 rounded-full">
                  {career.title}
                </span>
              )}
            </div>
            <span className="text-xs text-muted">
              {formatCompact(career.xp)} / {formatCompact(career.xpToNextLevel)} XP
            </span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
            <div
              className="bg-gradient-to-r from-blue-500 to-purple-600 h-full rounded-full transition-all duration-500"
              style={{ width: `${xpPercent}%` }}
            />
          </div>
          <div className="flex justify-between mt-1 text-xs text-muted">
            <span>
              {xpPercent}% {t('career.toNextLevel')}
            </span>
            <span>
              {t('career.maxLevel')}: {career.maxLevel}
            </span>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 border-b border-gray-200 dark:border-gray-700 pb-2 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-blue-600 text-white'
                  : 'text-secondary hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Achievement Summary */}
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
              <h2 className="text-lg font-bold text-primary mb-4">{t('career.progressByCategory')}</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {Object.entries(CATEGORY_ICONS).map(([cat, icon]) => {
                  const catAchs = career.achievements.filter((a) => a.category === cat);
                  const earned = catAchs.filter((a) => a.earned).length;
                  const total = catAchs.length;
                  if (total === 0) return null;
                  return (
                    <div key={cat} className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-lg">{icon}</span>
                        <span className="text-sm font-medium text-primary">{t(`career.categories.${cat}`)}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted mb-1">
                        <span>
                          {earned}/{total}
                        </span>
                        <span>{Math.round((earned / total) * 100)}%</span>
                      </div>
                      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 overflow-hidden">
                        <div
                          className="bg-blue-500 h-full rounded-full transition-all"
                          style={{ width: `${(earned / total) * 100}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Stats */}
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
              <h2 className="text-lg font-bold text-primary mb-4">{t('career.stats')}</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center">
                  <div className="text-xl font-bold text-primary">
                    {career.earnedAchievementCount}/{career.totalAchievementCount}
                  </div>
                  <div className="text-xs text-muted mt-1">{t('career.achievementsUnlocked')}</div>
                </div>
                <div className="text-center">
                  <div className="text-xl font-bold text-primary">{career.achievementPoints}</div>
                  <div className="text-xs text-muted mt-1">{t('career.totalPoints')}</div>
                </div>
                <div className="text-center">
                  <div className="text-xl font-bold text-primary">{career.titles?.length || 0}</div>
                  <div className="text-xs text-muted mt-1">{t('career.titlesEarned')}</div>
                </div>
                <div className="text-center">
                  <div className="text-xl font-bold text-primary">{career.prestigeLevel}</div>
                  <div className="text-xs text-muted mt-1">{t('career.prestigeLevel')}</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Achievements Tab */}
        {activeTab === 'achievements' && (
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-lg font-bold text-primary mb-4">{t('career.allAchievements')}</h2>
            {career.achievements.length === 0 ? (
              <p className="text-muted text-sm">{t('career.noAchievements')}</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {career.achievements.map((ach) => (
                  <div
                    key={ach.id}
                    className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                      ach.earned
                        ? 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800'
                        : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 opacity-60'
                    }`}
                  >
                    <span className="text-xl shrink-0">{ach.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className={`text-sm font-medium ${ach.earned ? 'text-primary' : 'text-muted'}`}>
                          {ach.name}
                        </p>
                        {ach.earned && <span className="text-green-500 text-xs">✓</span>}
                      </div>
                      <p className="text-xs text-muted mt-0.5">{ach.description}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-blue-500">+{ach.points} pts</span>
                        {ach.rewardBadge && (
                          <span className="text-xs bg-yellow-100 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400 px-1.5 py-0.5 rounded">
                            {t('career.badge')}
                          </span>
                        )}
                        {ach.rewardTitle && (
                          <span className="text-xs bg-purple-100 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400 px-1.5 py-0.5 rounded">
                            {t('career.titleLabel')}
                          </span>
                        )}
                        {ach.hidden && !ach.earned && <span className="text-xs text-muted">???</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Titles Tab */}
        {activeTab === 'titles' && (
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-lg font-bold text-primary mb-4">{t('career.selectTitle')}</h2>
            {titleMsg && (
              <p
                className={`text-sm mb-3 ${titleMsg.includes('Updated') || titleMsg.includes('success') ? 'text-green-500' : 'text-red-500'}`}
              >
                {titleMsg}
              </p>
            )}
            <div className="flex flex-wrap gap-2 mb-4">
              <button
                onClick={() => handleSetTitle('')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  !career.title
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-800 text-secondary hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                {t('career.noTitle')}
              </button>
              {career.titles.map((title) => (
                <button
                  key={title}
                  onClick={() => handleSetTitle(title)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    career.title === title
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-800 text-secondary hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
                >
                  {title}
                </button>
              ))}
            </div>
            {career.titles.length === 0 && <p className="text-sm text-muted">{t('career.noTitlesEarned')}</p>}
          </div>
        )}

        {/* Prestige Tab */}
        {activeTab === 'prestige' && (
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-lg font-bold text-primary mb-4">{t('career.prestigeSystem')}</h2>
            {prestigeMsg && (
              <p
                className={`text-sm mb-3 ${prestigeMsg.includes('success') || prestigeMsg.includes('Prestige') ? 'text-green-500' : 'text-red-500'}`}
              >
                {prestigeMsg}
              </p>
            )}
            <div className="space-y-4">
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-primary">{t('career.currentPrestige')}</span>
                  <span className="text-lg font-bold text-purple-500">
                    {career.prestigeLevel} / {career.maxPrestige}
                  </span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-purple-500 to-pink-500 h-full rounded-full transition-all"
                    style={{ width: `${(career.prestigeLevel / career.maxPrestige) * 100}%` }}
                  />
                </div>
              </div>

              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                <p className="text-sm text-muted mb-3">{t('career.prestigeDescription')}</p>
                <ul className="text-sm text-muted space-y-1 mb-4">
                  <li>
                    • {t('career.prestigeRequirement')}: {t('career.level')} {career.prestigeRequirementLevel}
                  </li>
                  <li>• {t('career.prestigeRewards')}</li>
                </ul>
                <button
                  onClick={handlePrestige}
                  disabled={
                    prestigeLoading ||
                    career.level < career.prestigeRequirementLevel ||
                    career.prestigeLevel >= career.maxPrestige
                  }
                  className="px-6 py-2.5 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {prestigeLoading ? t('common.loading') : t('career.prestigeButton')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
