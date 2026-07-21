import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useLeaderboardStore } from '../store/useLeaderboardStore';
import { useAuthStore } from '../store/useAuthStore';
import CompactValue from './CompactValue';
import { getAvatarUrl } from '../utils/capacitor';
import useNativeAvatarUrl from '../hooks/useNativeAvatarUrl';

function MiniAvatar({ avatar, username }) {
  const avatarUrl = useNativeAvatarUrl(getAvatarUrl(avatar || null));
  const initial = (username || '?').charAt(0).toUpperCase();

  if (avatarUrl) {
    return <img src={avatarUrl} alt="" className="w-6 h-6 rounded-full object-cover" />;
  }
  return (
    <div className="w-6 h-6 rounded-full bg-blue-600 text-white text-[10px] flex items-center justify-center font-medium">
      {initial}
    </div>
  );
}

function MiniRankBadge({ rank }) {
  if (rank === 1) return <span className="text-sm">🥇</span>;
  if (rank === 2) return <span className="text-sm">🥈</span>;
  if (rank === 3) return <span className="text-sm">🥉</span>;
  return <span className="text-xs font-semibold text-muted w-6 text-center">#{rank}</span>;
}

export default function LeaderboardWidget() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const { summary, fetchSummary } = useLeaderboardStore();
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetchSummary().then(() => setLoaded(true));
  }, []);

  if (!user || !loaded || !summary) return null;

  const { summary: catSummary, activeEvents } = summary;

  const topNetWorth = catSummary?.netWorth?.topPlayer;
  const totalPlayers = catSummary?.netWorth?.totalPlayers || 0;

  if (!topNetWorth && (!activeEvents || activeEvents.length === 0)) return null;

  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-primary">{t('leaderboard.widget.title')}</h3>
        <Link to="/leaderboards" className="text-xs text-blue-600 dark:text-blue-400 hover:underline">
          {t('leaderboard.widget.viewAll')}
        </Link>
      </div>

      {topNetWorth && (
        <div className="mb-3">
          <div className="text-xs text-muted mb-1">{t('leaderboard.widget.topNetWorth')}</div>
          <div className="flex items-center gap-2">
            <MiniRankBadge rank={1} />
            <MiniAvatar avatar={topNetWorth.avatar} username={topNetWorth.username} />
            <span className="text-sm font-medium text-primary truncate">
              {topNetWorth.displayName || topNetWorth.username}
            </span>
            <span className="ml-auto text-sm font-bold text-green-600 dark:text-green-400">
              <CompactValue value={topNetWorth.value} prefix="$" />
            </span>
          </div>
          <div className="text-[10px] text-muted mt-1">
            {t('leaderboard.widget.totalPlayers', { count: totalPlayers })}
          </div>
        </div>
      )}

      {activeEvents && activeEvents.length > 0 && (
        <div className="border-t border-border pt-3">
          <div className="text-xs text-muted mb-1">{t('leaderboard.widget.activeEvents')}</div>
          {activeEvents.slice(0, 2).map((event) => (
            <Link
              key={event._id}
              to="/events"
              className="flex items-center gap-2 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-800/50 rounded px-1 -mx-1 transition-colors"
            >
              <span className="w-5 text-center text-xs">🏆</span>
              <span className="text-secondary truncate">{event.name}</span>
              <span className="ml-auto text-xs text-muted shrink-0">
                {event.participants?.length || 0} {t('leaderboard.widget.players')}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
