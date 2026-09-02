import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useLeaderboardStore } from '../store/useLeaderboardStore';
import { useAuthStore } from '../store/useAuthStore';
import { formatCount, formatMoneyExact } from '../utils/format';
import CompactValue from '../components/CompactValue';
import Avatar from '../components/Avatar';
import useIsMobile from '../hooks/useIsMobile';

const CATEGORIES = ['netWorth', 'properties', 'passiveIncome', 'dealVolume', 'cityInfluence'];
const PAGE_SIZE = 20;

const CATEGORY_ICONS = {
  netWorth: '\uD83D\uDCB0',
  properties: '\uD83C\uDFE0',
  passiveIncome: '\uD83D\uDCC8',
  dealVolume: '\uD83D\uDCBC',
  cityInfluence: '\uD83C\uDFDB\uFE0F',
};

const CATEGORY_FORMATTERS = {
  netWorth: (v) => <CompactValue value={v} prefix="$" />,
  properties: (v) => formatCount(v),
  passiveIncome: (v) => <CompactValue value={v} prefix="$" />,
  dealVolume: (v) => <CompactValue value={v} prefix="$" />,
  cityInfluence: (v) => formatCount(v),
};

function RankBadge({ rank }) {
  if (rank === 1) return <span className="text-lg">{'\uD83E\uDD47'}</span>;
  if (rank === 2) return <span className="text-lg">{'\uD83E\uDD48'}</span>;
  if (rank === 3) return <span className="text-lg">{'\uD83E\uDD49'}</span>;
  return (
    <span className="inline-flex items-center justify-center min-w-7 h-7 max-w-12 px-1.5 rounded-full bg-gray-100 dark:bg-gray-800 text-xs font-semibold text-secondary whitespace-nowrap truncate">
      {rank}
    </span>
  );
}

function MovementIndicator({ change }) {
  const base = 'inline-block max-w-14 overflow-hidden text-ellipsis whitespace-nowrap align-top';
  if (!change || change === 0) return <span className={`text-xs text-muted ${base}`}>{'\u25AC'}</span>;
  if (change > 0)
    return (
      <span className={`text-xs text-green-600 dark:text-green-400 font-medium ${base}`}>
        {'\u25B2'} +{change}
      </span>
    );
  return (
    <span className={`text-xs text-red-500 dark:text-red-400 font-medium ${base}`}>
      {'\u25BC'} {change}
    </span>
  );
}

function PlayerAvatar({ avatar, username, size = 'md' }) {
  const cls = size === 'lg' ? 'w-10 h-10' : 'w-7 h-7';
  const textCls = size === 'lg' ? 'text-base font-bold' : 'text-[10px] font-medium';
  return <Avatar avatar={avatar} name={username} className={cls} textClassName={textCls} />;
}

function PlayerRow({ entry, onClick, formatValue, isCurrentUser }) {
  return (
    <button
      onClick={() => onClick(entry.userId)}
      className={`w-full min-w-0 flex items-center gap-2.5 px-3 py-2.5 sm:py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 active:bg-gray-100 dark:active:bg-gray-800 transition-colors border-b border-border last:border-b-0 ${isCurrentUser ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''}`}
    >
      <div className="w-7 sm:w-8 flex justify-center shrink-0">
        <RankBadge rank={entry.rank} />
      </div>

      <PlayerAvatar avatar={entry.avatar} username={entry.username} />

      <div className="flex-1 text-start min-w-0">
        <div className="text-sm font-medium text-primary truncate">{entry.displayName || entry.username}</div>
        <div className="text-[11px] text-muted truncate sm:hidden">
          {CATEGORY_FORMATTERS[entry._cat]?.(entry.value)}
        </div>
      </div>

      <div className="text-end shrink-0 hidden sm:block min-w-0">
        <div className="text-sm font-semibold text-primary">{formatValue(entry.value)}</div>
      </div>

      <div className="min-w-9 text-end shrink-0">
        <MovementIndicator change={entry.rankChange} />
      </div>
    </button>
  );
}

function Podium({ topThree, activeCategory, isMobile }) {
  const formatter = CATEGORY_FORMATTERS[activeCategory];
  const nameOf = (e) => e.displayName || e.username;

  if (isMobile) {
    const [first, second, third] = topThree;
    const medalCard = (entry, medal) => (
      <div className="flex flex-col items-center flex-1 min-w-0 rounded-lg bg-gray-50 dark:bg-gray-800/50 px-2 py-2.5">
        <PlayerAvatar avatar={entry.avatar} username={entry.username} size="lg" />
        <div className="mt-1.5 w-full text-center min-w-0">
          <div className="text-[11px] font-medium text-primary truncate">{nameOf(entry)}</div>
          <div className="text-xs font-bold text-secondary mt-0.5 truncate">{formatter(entry.value)}</div>
        </div>
        <div className="mt-0.5 text-sm">{medal}</div>
      </div>
    );

    return (
      <div className="px-3 py-3 border-b border-border bg-gradient-to-b from-gray-50/50 to-transparent dark:from-gray-800/20">
        <div className="flex flex-col gap-3 min-w-0">
          {first && (
            <div className="flex items-center justify-center gap-3 min-w-0 rounded-lg bg-gray-50 dark:bg-gray-800/50 px-3 py-2.5">
              <span className="text-2xl shrink-0">{'\uD83E\uDD47'}</span>
              <div className="min-w-0 text-start">
                <div className="text-sm font-semibold text-primary truncate">{nameOf(first)}</div>
                <div className="text-xs font-bold text-green-600 dark:text-green-400 truncate">
                  {formatter(first.value)}
                </div>
              </div>
            </div>
          )}
          {(second || third) && (
            <div className="flex items-stretch gap-2.5 min-w-0">
              {second && medalCard(second, '\uD83E\uDD48')}
              {third && medalCard(third, '\uD83E\uDD49')}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="px-3 py-3 border-b border-border bg-gradient-to-b from-gray-50/50 to-transparent dark:from-gray-800/20">
      <div className="flex items-end justify-center gap-4 sm:gap-8">
        {topThree.length >= 2 && (
          <div className="flex flex-col items-center flex-1 min-w-0 max-w-[110px]">
            <PlayerAvatar avatar={topThree[1].avatar} username={topThree[1].username} size="lg" />
            <div className="mt-1.5 text-center w-full min-w-0">
              <div className="text-[11px] font-medium text-primary truncate">{nameOf(topThree[1])}</div>
              <div className="text-xs sm:text-sm font-bold text-secondary mt-0.5 truncate">
                {formatter(topThree[1].value)}
              </div>
            </div>
            <div className="mt-0.5 text-sm">{'\uD83E\uDD48'}</div>
          </div>
        )}
        {topThree.length >= 1 && (
          <div className="flex flex-col items-center flex-1 min-w-0 max-w-[110px]">
            <div className="mb-0.5 text-base">{'\uD83E\uDD47'}</div>
            <PlayerAvatar avatar={topThree[0].avatar} username={topThree[0].username} size="lg" />
            <div className="mt-1.5 text-center w-full min-w-0">
              <div className="text-[11px] font-medium text-primary truncate">{nameOf(topThree[0])}</div>
              <div className="text-xs sm:text-sm font-bold text-green-600 dark:text-green-400 mt-0.5 truncate">
                {formatter(topThree[0].value)}
              </div>
            </div>
          </div>
        )}
        {topThree.length >= 3 && (
          <div className="flex flex-col items-center flex-1 min-w-0 max-w-[110px]">
            <PlayerAvatar avatar={topThree[2].avatar} username={topThree[2].username} size="lg" />
            <div className="mt-1.5 text-center w-full min-w-0">
              <div className="text-[11px] font-medium text-primary truncate">{nameOf(topThree[2])}</div>
              <div className="text-xs sm:text-sm font-bold text-secondary mt-0.5 truncate">
                {formatter(topThree[2].value)}
              </div>
            </div>
            <div className="mt-0.5 text-sm">{'\uD83E\uDD49'}</div>
          </div>
        )}
      </div>
    </div>
  );
}

function PlayerProfile({ profile, onClose }) {
  const { t } = useTranslation();

  const CATEGORY_LABELS = {
    netWorth: t('leaderboard.categories.netWorth'),
    properties: t('leaderboard.categories.properties'),
    passiveIncome: t('leaderboard.categories.passiveIncome'),
    dealVolume: t('leaderboard.categories.dealVolume'),
    cityInfluence: t('leaderboard.categories.cityInfluence'),
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border rounded-t-2xl sm:rounded-xl shadow-xl sm:max-w-md w-full max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-primary">{t('leaderboard.profile.title')}</h3>
            <button onClick={onClose} className="text-muted hover:text-primary transition-colors text-2xl leading-none">
              {'\u00D7'}
            </button>
          </div>

          <div className="flex items-center gap-4 mb-6">
            <Avatar
              avatar={profile.user.avatar}
              name={profile.user.displayName || profile.user.username}
              className="w-14 h-14"
              textClassName="text-xl font-bold"
            />
            <div className="min-w-0">
              <div className="text-lg font-bold text-primary truncate">
                {profile.user.displayName || profile.user.username}
              </div>
              <div className="text-sm text-muted">@{profile.user.username}</div>
              {profile.user.bio && <div className="text-xs text-secondary mt-1 line-clamp-2">{profile.user.bio}</div>}
              <div className="text-xs text-muted mt-1">
                {t('leaderboard.profile.level')} {profile.user.level} · {profile.user.propertyCount}{' '}
                {t('leaderboard.categories.properties').toLowerCase()}
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            {Object.entries(profile.ranks || {}).map(([cat, data]) => (
              <div
                key={cat}
                className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800/50"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm shrink-0">{CATEGORY_ICONS[cat]}</span>
                  <span className="text-sm text-secondary truncate">{CATEGORY_LABELS[cat]}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {data.rank ? (
                    <>
                      <span className="text-sm font-semibold text-primary">#{data.rank}</span>
                      <span className="text-xs text-muted">{'\u00B7'}</span>
                      <span className="text-sm text-secondary max-w-24 truncate">
                        {CATEGORY_FORMATTERS[cat](data.value)}
                      </span>
                    </>
                  ) : (
                    <span className="text-xs text-muted">{'\u2014'}</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {profile.user.achievements?.length > 0 && (
            <div className="mt-4">
              <div className="text-sm font-medium text-secondary mb-2">{t('leaderboard.profile.achievements')}</div>
              <div className="flex flex-wrap gap-1.5">
                {profile.user.achievements.map((a, i) => (
                  <span
                    key={i}
                    className="text-xs bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300 px-2 py-0.5 rounded-full"
                  >
                    {typeof a === 'string' ? a : a.icon ? `${a.icon} ${a.name}` : a.name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Pagination({ page, totalPages, onPageChange }) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  if (totalPages <= 1) return null;

  if (isMobile) {
    return (
      <div className="flex items-center justify-center gap-3 py-3 px-3">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          aria-label={t('leaderboard.prevPage')}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-sm font-medium text-secondary hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          {'\u2190'}
        </button>
        <span className="text-xs text-secondary whitespace-nowrap tabular-nums">
          {page} / {totalPages}
        </span>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          aria-label={t('leaderboard.nextPage')}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-sm font-medium text-secondary hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          {'\u2192'}
        </button>
      </div>
    );
  }

  const pages = [];
  const start = Math.max(1, page - 2);
  const end = Math.min(totalPages, page + 2);
  for (let i = start; i <= end; i++) pages.push(i);

  return (
    <div className="flex flex-wrap items-center justify-center gap-1 py-3 px-3">
      <button
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        aria-label={t('leaderboard.prevPage')}
        className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-secondary hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        {'\u2190'}
      </button>
      {start > 1 && (
        <>
          <button
            onClick={() => onPageChange(1)}
            className="min-w-8 h-8 px-1 rounded-lg text-xs font-medium text-secondary hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            1
          </button>
          {start > 2 && <span className="text-xs text-muted px-1">{'\u2026'}</span>}
        </>
      )}
      {pages.map((p) => (
        <button
          key={p}
          onClick={() => onPageChange(p)}
          className={`min-w-8 h-8 px-1 rounded-lg text-xs font-medium transition-colors ${
            p === page ? 'bg-blue-600 text-white' : 'text-secondary hover:bg-gray-100 dark:hover:bg-gray-800'
          }`}
        >
          {p}
        </button>
      ))}
      {end < totalPages && (
        <>
          {end < totalPages - 1 && <span className="text-xs text-muted px-1">{'\u2026'}</span>}
          <button
            onClick={() => onPageChange(totalPages)}
            className="min-w-8 h-8 px-1 rounded-lg text-xs font-medium text-secondary hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            {totalPages}
          </button>
        </>
      )}
      <button
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        aria-label={t('leaderboard.nextPage')}
        className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-secondary hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        {'\u2192'}
      </button>
    </div>
  );
}

export default function LeaderboardPage() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const isMobile = useIsMobile();
  const {
    rankings,
    myRanks,
    loading,
    error,
    total,
    rewards,
    seasonNumber,
    fetchRankings,
    fetchMyRank,
    fetchPlayerProfile,
    fetchLeaderboardRewards,
    playerProfile,
    clearPlayerProfile,
  } = useLeaderboardStore();

  const [activeCategory, setActiveCategory] = useState('netWorth');
  const [page, setPage] = useState(1);
  const [showProfile, setShowProfile] = useState(false);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const getRewardForRank = (rank) => {
    if (!rank || !rewards) return null;
    return rewards.find((r) => r.rank === rank || (r.minRank && rank >= r.minRank && rank <= r.maxRank)) || null;
  };

  useEffect(() => {
    fetchLeaderboardRewards();
  }, [fetchLeaderboardRewards]);

  const loadPage = useCallback(
    (cat, p) => {
      const offset = (p - 1) * PAGE_SIZE;
      fetchRankings(cat, { limit: PAGE_SIZE, offset });
    },
    [fetchRankings],
  );

  useEffect(() => {
    setPage(1);
    loadPage(activeCategory, 1);
    if (user) fetchMyRank();
  }, [activeCategory, user, loadPage, fetchMyRank]);

  const handlePageChange = (p) => {
    setPage(p);
    loadPage(activeCategory, p);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleRetry = () => {
    loadPage(activeCategory, page);
    if (user) fetchMyRank();
  };

  const handlePlayerClick = async (userId) => {
    await fetchPlayerProfile(userId);
    setShowProfile(true);
  };

  const CATEGORY_LABELS = {
    netWorth: t('leaderboard.categories.netWorth'),
    properties: t('leaderboard.categories.properties'),
    passiveIncome: t('leaderboard.categories.passiveIncome'),
    dealVolume: t('leaderboard.categories.dealVolume'),
    cityInfluence: t('leaderboard.categories.cityInfluence'),
  };

  const isFirstPage = page === 1;
  const topThree = isFirstPage ? rankings.slice(0, 3) : [];
  const listRows = isFirstPage ? rankings.slice(3) : rankings;

  const myNetWorthRank = myRanks?.netWorth?.rank || null;
  const myReward = getRewardForRank(myNetWorthRank);

  return (
    <div className="max-w-4xl mx-auto w-full min-w-0 px-3 sm:px-4 py-4 sm:py-6">
      <div className="mb-4 sm:mb-5">
        <h1 className="text-xl sm:text-2xl font-bold text-primary">{t('leaderboard.title')}</h1>
        <p className="text-xs sm:text-sm text-secondary mt-1">{t('leaderboard.subtitle')}</p>
      </div>

      {seasonNumber != null && (
        <div className="bg-card border border-border rounded-xl p-3 sm:p-4 mb-4 sm:mb-5 min-w-0">
          <div className="flex items-center justify-between gap-2 min-w-0">
            <h2 className="text-xs sm:text-sm font-semibold text-primary shrink-0">
              {t('leaderboard.season', { number: seasonNumber })}
            </h2>
            <span className="text-[11px] sm:text-xs text-muted min-w-0 truncate text-end">
              {t('leaderboard.rewards.endOfSeason')}
            </span>
          </div>

          {rewards?.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 sm:gap-2 mt-3 min-w-0">
              {rewards.map((tier, i) => (
                <div
                  key={i}
                  className="rounded-lg bg-gray-50 dark:bg-gray-800/50 px-2 py-1.5 sm:py-2 text-center min-w-0"
                >
                  <div className="text-[10px] sm:text-[11px] text-muted truncate">
                    {tier.rank ? `#${tier.rank}` : `#${tier.minRank}\u2013#${tier.maxRank}`}
                  </div>
                  <div className="text-xs sm:text-sm font-bold text-yellow-600 dark:text-yellow-400 truncate min-w-0">
                    {formatMoneyExact(tier.reward)}
                  </div>
                </div>
              ))}
            </div>
          )}

          {myReward && (
            <div className="mt-2.5 text-xs sm:text-sm text-secondary">
              {t('leaderboard.rewards.yourReward', { rank: myNetWorthRank, amount: formatMoneyExact(myReward.reward) })}
            </div>
          )}
        </div>
      )}

      {user && myRanks && (
        <div className="bg-card border border-border rounded-xl p-3 sm:p-4 mb-4 sm:mb-5 min-w-0">
          <h2 className="text-xs sm:text-sm font-medium text-secondary mb-2">{t('leaderboard.yourRank')}</h2>
          <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
            {CATEGORIES.map((cat) => {
              const data = myRanks[cat] || {};
              return (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors shrink-0 ${
                    activeCategory === cat
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-border hover:border-blue-300 dark:hover:border-blue-700'
                  }`}
                >
                  <span className="text-base">{CATEGORY_ICONS[cat]}</span>
                  <div className="text-start">
                    <div className="text-[10px] sm:text-xs text-muted leading-tight">{CATEGORY_LABELS[cat]}</div>
                    <div className="text-xs sm:text-sm font-bold text-primary leading-tight">
                      {data.rank ? `#${data.rank}` : '\u2014'}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex gap-1.5 overflow-x-auto pb-2 mb-3 sm:mb-4 -mx-3 px-3 sm:mx-0 sm:px-0 scrollbar-hide min-w-0">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium whitespace-nowrap transition-colors ${
              activeCategory === cat
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-secondary hover:text-primary'
            }`}
          >
            <span>{CATEGORY_ICONS[cat]}</span>
            <span className="hidden sm:inline">{CATEGORY_LABELS[cat]}</span>
          </button>
        ))}
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden min-w-0">
        {loading ? (
          <div className="p-8 text-center text-muted">{t('common.loading')}</div>
        ) : error && rankings.length === 0 ? (
          <div className="p-8 text-center" role="alert">
            <div className="text-muted mb-3">{t('leaderboard.errorLoad')}</div>
            <button
              onClick={handleRetry}
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-500 transition-colors"
            >
              {t('leaderboard.retry')}
            </button>
          </div>
        ) : rankings.length === 0 ? (
          <div className="p-8 text-center text-muted">{t('leaderboard.noRankings')}</div>
        ) : (
          <div>
            <div className="hidden sm:flex px-4 py-2 border-b border-border items-center text-xs text-muted">
              <div className="w-8 text-center">#</div>
              <div className="w-7 ms-2" />
              <div className="flex-1 ms-2">{t('leaderboard.player')}</div>
              <div className="text-end me-2">{CATEGORY_LABELS[activeCategory]}</div>
              <div className="w-9 text-end">{t('leaderboard.change')}</div>
            </div>

            {isFirstPage && topThree.length > 0 && (
              <Podium topThree={topThree} activeCategory={activeCategory} isMobile={isMobile} />
            )}

            {listRows.map((entry) => (
              <PlayerRow
                key={`${entry.userId}-${entry.rank}`}
                entry={{ ...entry, _cat: activeCategory }}
                onClick={handlePlayerClick}
                formatValue={CATEGORY_FORMATTERS[activeCategory]}
                isCurrentUser={user && entry.userId === user._id}
              />
            ))}
          </div>
        )}

        {!loading && rankings.length > 0 && (
          <Pagination page={page} totalPages={totalPages} onPageChange={handlePageChange} />
        )}
      </div>

      {!loading && total > 0 && (
        <div className="text-center text-[11px] sm:text-xs text-muted mt-2">
          {t('leaderboard.showing', {
            count: isFirstPage ? Math.min(topThree.length + listRows.length, PAGE_SIZE) : listRows.length,
            total,
          })}
        </div>
      )}

      {showProfile && playerProfile && (
        <PlayerProfile
          profile={playerProfile}
          onClose={() => {
            setShowProfile(false);
            clearPlayerProfile();
          }}
        />
      )}
    </div>
  );
}
