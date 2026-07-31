import { useEffect, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { useMissionStore } from '../store/useMissionStore';
import { useSocket } from '../hooks/useSocket';

const CATEGORY_ICONS = {
  beginner: '\uD83C\uDF31',
  property: '\uD83C\uDFE0',
  income: '\uD83D\uDCB5',
  networth: '\uD83D\uDC8E',
  geographic: '\uD83C\uDF0D',
  development: '\uD83C\uDFD7\uFE0F',
  banking: '\uD83C\uDFE6',
  auction: '\uD83C\uDFE9',
  company: '\uD83C\uDFE2',
  district: '\uD83C\uDFD8\uFE0F',
  intelligence: '\uD83D\uDD0D',
  daily: '\uD83D\uDCC5',
  weekly: '\uD83D\uDCC6',
  seasonal: '\u2744\uFE0F',
  event: '\uD83C\uDFAF',
};

const DIFFICULTY_COLORS = {
  easy: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
  medium: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300',
  hard: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300',
  expert: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
  legendary: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300',
};

const STATUS_TABS = ['active', 'completed', 'claimed'];

function ProgressBar({ progress, target, status }) {
  const percent = target > 0 ? Math.min(100, (progress / target) * 100) : 0;
  const barColor =
    status === 'completed'
      ? 'bg-green-500'
      : percent >= 80
        ? 'bg-blue-500'
        : percent >= 40
          ? 'bg-yellow-500'
          : 'bg-gray-400';

  return (
    <div className="w-full">
      <div className="flex justify-between items-center mb-1">
        <span className="text-xs text-secondary">
          {progress.toLocaleString()} / {target.toLocaleString()}
        </span>
        <span className="text-xs font-medium text-primary">{Math.round(percent)}%</span>
      </div>
      <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full ${barColor} rounded-full transition-all duration-500`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

function MissionCard({ mission, onClaim, t }) {
  const def = mission.definition;
  if (!def) return null;

  const isClaimable = mission.status === 'completed';
  const isClaimed = mission.status === 'claimed';
  const isLocked = mission.status === 'active' && mission.progress === 0;

  return (
    <div
      className={`bg-card border rounded-xl p-4 transition-all ${
        isClaimable
          ? 'border-green-300 dark:border-green-700 shadow-md'
          : isClaimed
            ? 'border-gray-200 dark:border-gray-700 opacity-70'
            : 'border-border hover:shadow-sm'
      }`}
    >
      <div className="flex items-start gap-3">
        <span className="text-2xl shrink-0 mt-0.5">{def.icon || '\uD83C\uDFAF'}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="font-semibold text-primary text-sm">{def.name}</div>
              <div className="text-xs text-muted mt-0.5">{def.description}</div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${DIFFICULTY_COLORS[def.difficulty] || ''}`}
              >
                {t(`missions.difficulty.${def.difficulty}`)}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 mt-2">
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-secondary">
              {CATEGORY_ICONS[def.category] || ''} {t(`missions.categories.${def.category}`)}
            </span>
            {def.chainId && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400">
                {t('missions.chain')}
              </span>
            )}
            {def.type !== 'permanent' && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400">
                {t(`missions.types.${def.type}`)}
              </span>
            )}
          </div>

          <div className="mt-3">
            <ProgressBar progress={mission.progress} target={mission.target} status={mission.status} />
          </div>

          <div className="flex items-center justify-between mt-3">
            <div className="flex items-center gap-2 text-xs text-secondary">
              {def.rewards.xp && <span>⭐ {def.rewards.xp.toLocaleString()} XP</span>}
              {def.rewards.balance && <span>💰 ${def.rewards.balance.toLocaleString()}</span>}
              {def.rewards.badge && (
                <span className="text-purple-600 dark:text-purple-400">🏅 {t('missions.badge')}</span>
              )}
              {def.rewards.title && (
                <span className="text-blue-600 dark:text-blue-400">\uD83D\uDCDD {def.rewards.title}</span>
              )}
            </div>
            {isClaimable && (
              <button
                onClick={() => onClaim(mission.missionId)}
                className="px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white text-xs font-medium rounded-lg transition-colors"
              >
                {t('missions.claimReward')}
              </button>
            )}
            {isClaimed && (
              <span className="text-xs text-green-600 dark:text-green-400 font-medium">{t('missions.claimed')}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ChainCard({ missions, t }) {
  if (!missions || missions.length === 0) return null;
  const first = missions[0];
  const def = first?.definition;

  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">{def?.icon || '\uD83D\uDD17'}</span>
        <span className="font-semibold text-primary text-sm">
          {t('missions.chainLabel')} — {def?.name}
        </span>
      </div>
      <div className="space-y-2">
        {missions.map((m, i) => {
          const mDef = m.definition;
          if (!mDef) return null;
          const statusColor =
            m.status === 'claimed'
              ? 'text-green-600 dark:text-green-400'
              : m.status === 'completed'
                ? 'text-yellow-600 dark:text-yellow-400'
                : 'text-muted';
          return (
            <div key={m.missionId} className="flex items-center gap-2">
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  m.status === 'claimed'
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                    : m.status === 'completed'
                      ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400'
                      : 'bg-gray-100 dark:bg-gray-800 text-muted'
                }`}
              >
                {m.status === 'claimed' ? '\u2713' : i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className={`text-xs ${statusColor}`}>{mDef.name}</div>
                <div className="text-[10px] text-muted">
                  {m.progress}/{m.target}
                </div>
              </div>
              {i < missions.length - 1 && <div className="text-muted text-xs">\u2193</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function MissionsPage() {
  const { t } = useTranslation();
  const {
    activeMissions,
    completedMissions,
    claimedMissions,
    loading,
    fetchDashboard,
    claimReward,
    stats,
    fetchStats,
  } = useMissionStore();
  const [searchParams] = useSearchParams();
const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'active');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [difficultyFilter, setDifficultyFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const ITEMS_PER_PAGE = 8;
  const socket = useSocket();

  useEffect(() => {
    fetchDashboard();
    fetchStats();
  }, []);

  useEffect(() => {
    if (!socket) return;
    const handleProgress = (data) => {
      useMissionStore.getState().updateMissionProgressLocal(data.missionId, data.progress, data.target);
    };
    const handleCompleted = () => {
      fetchDashboard();
    };
    const handleClaimed = () => {
      fetchDashboard();
    };
    socket.on('mission:progress', handleProgress);
    socket.on('mission:completed', handleCompleted);
    socket.on('mission:reward:claimed', handleClaimed);
    return () => {
      socket.off('mission:progress', handleProgress);
      socket.off('mission:completed', handleCompleted);
      socket.off('mission:reward:claimed', handleClaimed);
    };
  }, [socket]);

  const currentMissions = useMemo(() => {
    let list =
      activeTab === 'active' ? activeMissions : activeTab === 'completed' ? completedMissions : claimedMissions;
    if (categoryFilter) list = list.filter((m) => m.definition?.category === categoryFilter);
    if (difficultyFilter) list = list.filter((m) => m.definition?.difficulty === difficultyFilter);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (m) => m.definition?.name?.toLowerCase().includes(q) || m.definition?.description?.toLowerCase().includes(q),
      );
    }
    return list;
  }, [activeTab, activeMissions, completedMissions, claimedMissions, categoryFilter, difficultyFilter, searchQuery]);

  const totalPages = Math.ceil(currentMissions.length / ITEMS_PER_PAGE);
  const paginatedMissions = currentMissions.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  useEffect(() => {
    setPage(1);
  }, [activeTab, categoryFilter, difficultyFilter, searchQuery]);

  const dailyMissions = activeMissions.filter((m) => m.definition?.type === 'daily');
  const weeklyMissions = activeMissions.filter((m) => m.definition?.type === 'weekly');

  const handleClaim = async (missionId) => {
    try {
      await claimReward(missionId);
    } catch {}
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-primary">{t('missions.title')}</h1>
            <p className="text-sm text-secondary mt-1">{t('missions.subtitle')}</p>
          </div>
          <div className="flex items-center gap-2">
            {stats && (
              <div className="hidden sm:flex items-center gap-3 text-xs text-secondary">
                <span>{stats.totalActive} active</span>
                <span>{'\u00B7'}</span>
                <span>{stats.totalCompleted} ready</span>
                <span>{'\u00B7'}</span>
                <span>{stats.totalClaimed} claimed</span>
              </div>
            )}
          </div>
        </div>

        {(dailyMissions.length > 0 || weeklyMissions.length > 0) && activeTab === 'active' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {dailyMissions.length > 0 && (
              <div className="bg-card border border-border rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-lg">{'\uD83D\uDCC5'}</span>
                  <span className="font-semibold text-primary text-sm">{t('missions.dailyMissions')}</span>
                </div>
                <div className="space-y-3">
                  {dailyMissions.map((m) => (
                    <MissionCard key={m.missionId} mission={m} onClaim={handleClaim} t={t} />
                  ))}
                </div>
              </div>
            )}
            {weeklyMissions.length > 0 && (
              <div className="bg-card border border-border rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-lg">{'\uD83D\uDCC6'}</span>
                  <span className="font-semibold text-primary text-sm">{t('missions.weeklyMissions')}</span>
                </div>
                <div className="space-y-3">
                  {weeklyMissions.map((m) => (
                    <MissionCard key={m.missionId} mission={m} onClaim={handleClaim} t={t} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="bg-card border border-border rounded-xl mb-4">
          <div className="flex border-b border-border overflow-x-auto">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors ${
                  activeTab === tab
                    ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                    : 'text-secondary hover:text-primary'
                }`}
              >
                {t(`missions.tabs.${tab}`)}
                {tab === 'active' && activeMissions.length > 0 && (
                  <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                    {activeMissions.length}
                  </span>
                )}
                {tab === 'completed' && completedMissions.length > 0 && (
                  <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400">
                    {completedMissions.length}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="p-4 border-b border-border">
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                placeholder={t('missions.search')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-border rounded-lg text-sm text-primary placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-border rounded-lg text-sm text-primary focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">{t('missions.allCategories')}</option>
                {[
                  'beginner',
                  'property',
                  'income',
                  'networth',
                  'geographic',
                  'development',
                  'banking',
                  'auction',
                  'company',
                  'district',
                  'intelligence',
                ].map((cat) => (
                  <option key={cat} value={cat}>
                    {CATEGORY_ICONS[cat]} {t(`missions.categories.${cat}`)}
                  </option>
                ))}
              </select>
              <select
                value={difficultyFilter}
                onChange={(e) => setDifficultyFilter(e.target.value)}
                className="px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-border rounded-lg text-sm text-primary focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">{t('missions.allDifficulties')}</option>
                {['easy', 'medium', 'hard', 'expert', 'legendary'].map((diff) => (
                  <option key={diff} value={diff}>
                    {t(`missions.difficulty.${diff}`)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="p-4">
            {loading ? (
              <div className="text-center py-12 text-secondary">{t('missions.loading')}</div>
            ) : paginatedMissions.length === 0 ? (
              <div className="text-center py-12">
                <span className="text-4xl block mb-3">{'\uD83C\uDFAF'}</span>
                <div className="text-secondary">{t('missions.noMissions')}</div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {paginatedMissions.map((m) => (
                  <MissionCard key={m.missionId} mission={m} onClaim={handleClaim} t={t} />
                ))}
              </div>
            )}

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-4 pt-4 border-t border-border">
                <button
                  onClick={() => setPage(page - 1)}
                  disabled={page <= 1}
                  className="px-3 py-1.5 text-xs bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {t('auctions.prev')}
                </button>
                <span className="text-xs text-secondary">
                  {t('auctions.page')} {page} / {totalPages}
                </span>
                <button
                  onClick={() => setPage(page + 1)}
                  disabled={page >= totalPages}
                  className="px-3 py-1.5 text-xs bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {t('auctions.next')}
                </button>
              </div>
            )}
          </div>
        </div>

        {stats && Object.keys(stats.byCategory || {}).length > 0 && (
          <div className="bg-card border border-border rounded-xl p-4 mt-4">
            <h2 className="font-semibold text-primary text-sm mb-3">{t('missions.progressByCategory')}</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {Object.entries(stats.byCategory).map(([cat, data]) => {
                if (data.total === 0) return null;
                const pct = Math.round((data.completed / data.total) * 100);
                return (
                  <div key={cat} className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm">{CATEGORY_ICONS[cat] || ''}</span>
                      <span className="text-xs font-medium text-primary">{t(`missions.categories.${cat}`)}</span>
                    </div>
                    <div className="text-xs text-secondary">
                      {data.completed}/{data.total} ({pct}%)
                    </div>
                    <div className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full mt-1.5 overflow-hidden">
                      <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
