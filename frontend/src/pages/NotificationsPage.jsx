import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../store/useGameStore';
import { useAuthStore } from '../store/useAuthStore';
import { useToast } from '../components/Toast';
import Pagination from '../components/Pagination';
import { formatMoneyExact } from '../utils/format';

const TYPE_CONFIG = {
  property_offer: { icon: '🤝', color: 'text-blue-500', route: '/marketplace' },
  offer_accepted: { icon: '✅', color: 'text-blue-500', route: '/marketplace' },
  offer_rejected: { icon: '❌', color: 'text-red-500', route: '/marketplace' },
  offer_countered: { icon: '🔄', color: 'text-amber-500', route: '/marketplace' },
  offer_expired: { icon: '⏰', color: 'text-gray-500', route: '/marketplace' },
  construction_complete: { icon: '🏗️', color: 'text-blue-500', route: '/development' },
  friend_request: { icon: '👤', color: 'text-blue-500', route: '/friends' },
  company_vote: { icon: '🏢', color: 'text-purple-500' },
  mission_complete: { icon: '🎯', color: 'text-green-500', route: '/missions', tab: 'completed' },
  mission_reward: { icon: '🎁', color: 'text-amber-500', route: '/missions' },
  mission_chain_unlocked: { icon: '🔗', color: 'text-purple-500', route: '/missions' },
  season_reward: { icon: '🏆', color: 'text-yellow-500', route: '/leaderboards' },
  dividend: { icon: '💵', color: 'text-green-500' },
  system: { icon: '📢', color: 'text-gray-500' },
};

const PRIORITY_CONFIG = {
  critical: {
    label: 'Critical',
    badge: 'bg-red-500',
    dot: 'bg-red-500',
    border: 'border-l-red-500',
    ring: 'ring-red-500/30',
  },
  high: {
    label: 'High',
    badge: 'bg-orange-500',
    dot: 'bg-orange-500',
    border: 'border-l-orange-500',
    ring: 'ring-orange-500/30',
  },
  medium: {
    label: 'Medium',
    badge: 'bg-blue-500',
    dot: 'bg-blue-400',
    border: 'border-l-blue-500',
    ring: 'ring-blue-500/30',
  },
  low: {
    label: 'Low',
    badge: 'bg-gray-400',
    dot: 'bg-gray-400',
    border: 'border-l-gray-400',
    ring: 'ring-gray-400/30',
  },
};

const FILTER_TABS = [
  { key: 'all', labelKey: 'notifications.filters.all', filters: {} },
  { key: 'unread', labelKey: 'notifications.filters.unread', filters: { unread: true } },
  { key: 'critical', labelKey: 'notifications.filters.critical', filters: { priority: 'critical' } },
  { key: 'high', labelKey: 'notifications.filters.high', filters: { priority: 'high' } },
];

function timeAgo(dateStr, t) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t('notifications.time.justNow');
  if (mins < 60) return t('notifications.time.minutes', { count: mins });
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return t('notifications.time.hours', { count: hrs });
  const days = Math.floor(hrs / 24);
  if (days < 30) return t('notifications.time.days', { count: days });
  return new Date(dateStr).toLocaleDateString();
}

export default function NotificationsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const {
    notifications,
    notificationPage,
    notificationTotalPages,
    fetchNotifications,
    fetchUnreadCount,
    markNotificationRead,
    markAllRead,
    deleteNotification,
  } = useGameStore();
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('all');
  const { addToast } = useToast();

  const load = useCallback(
    async (page, filterKey = activeFilter) => {
      setLoading(true);
      const filterDef = FILTER_TABS.find((f) => f.key === filterKey) || FILTER_TABS[0];
      await Promise.all([fetchNotifications(page, 20, filterDef.filters), fetchUnreadCount()]);
      setLoading(false);
    },
    [fetchNotifications, fetchUnreadCount, activeFilter],
  );

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }
    load(1, 'all');
  }, [user]);

  const handleFilterChange = (key) => {
    setActiveFilter(key);
    load(1, key);
  };

  const handlePageChange = (page) => {
    load(page);
  };

  const handleClick = async (notification) => {
    if (!notification.read) {
      await markNotificationRead(notification._id);
      await fetchUnreadCount();
    }

    // Priority 1: notification has route metadata from backend (may already
    // carry query params, e.g. /property/:id?section=offers). Merge tab and
    // proposal deep-link params through URLSearchParams so existing query
    // strings are preserved and never produce malformed URLs.
    if (notification.route) {
      const url = new URL(notification.route, window.location.origin);
      if (notification.tab) url.searchParams.set('tab', notification.tab);
      if (notification.proposalId) url.searchParams.set('proposalId', notification.proposalId);
      navigate(`${url.pathname}${url.search}`);
      return;
    }

    // Priority 2: company_vote with company ID
    if (notification.type === 'company_vote' && notification.relatedId) {
      navigate(`/real-estate-companies/${notification.relatedId}?tab=overview`);
      return;
    }

    // Priority 3: mission_complete with relatedId
    if (notification.type === 'mission_complete' && notification.relatedId) {
      navigate(`/missions?tab=completed`);
      return;
    }

    // Priority 4: offer notifications carry the property entity — deep-link
    // to the property's Offers section instead of the marketplace.
    if (
      ['property_offer', 'offer_accepted', 'offer_rejected', 'offer_countered', 'offer_expired'].includes(
        notification.type,
      ) &&
      notification.entityId
    ) {
      navigate(`/property/${notification.entityId}?section=offers`);
      return;
    }

    // Priority 5: use TYPE_CONFIG fallback
    const cfg = TYPE_CONFIG[notification.type];
    if (cfg?.route) {
      const tabParam = cfg.tab || notification.tab ? `?tab=${cfg.tab || notification.tab}` : '';
      navigate(`${cfg.route}${tabParam}`);
    }
  };

  const handleMarkAllRead = async () => {
    await markAllRead();
    await Promise.all([fetchNotifications(1), fetchUnreadCount()]);
  };

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    try {
      await deleteNotification(id); // optimistic removal in the store
      await fetchUnreadCount();
      // If the deleted item emptied the current page, fall back to the last
      // available page so the list never shows an empty page.
      const { notifications: list, notificationTotalPages: total } = useGameStore.getState();
      if (list.length === 0 && total > 1 && notificationPage > 1) {
        await load(Math.min(notificationPage, total - 1));
      }
    } catch (err) {
      const message = err?.message || '';
      addToast({
        _id: `delete-error-${id}`,
        title: t('notifications.deleteError'),
        message,
        type: 'system',
        read: true,
      });
    }
  };

  if (!user) return null;

  return (
    <div className="flex-1 p-4 md:p-6 overflow-y-auto">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold text-primary mb-4">{t('notifications.title')}</h1>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div className="flex gap-1.5">
            {FILTER_TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => handleFilterChange(tab.key)}
                className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                  activeFilter === tab.key
                    ? 'bg-blue-500 text-white border-blue-500'
                    : 'bg-card text-secondary border-border hover:border-blue-400'
                }`}
              >
                {t(tab.labelKey)}
              </button>
            ))}
          </div>
          {notifications.some((n) => !n.read) && (
            <button
              onClick={handleMarkAllRead}
              className="text-sm text-blue-600 hover:text-blue-500 font-medium transition-colors"
            >
              {t('notifications.markAllRead')}
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted">{t('common.loading')}</div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted">
            <span className="text-4xl mb-3">🔔</span>
            <p className="text-lg font-medium">{t('notifications.empty')}</p>
            <p className="text-sm mt-1">{t('notifications.emptyHint')}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {notifications.map((n) => {
              const cfg = TYPE_CONFIG[n.type] || { icon: '📄', color: 'text-gray-500' };
              const pcfg = PRIORITY_CONFIG[n.priority] || PRIORITY_CONFIG.low;
              return (
                <button
                  key={n._id}
                  onClick={() => handleClick(n)}
                  className={`w-full text-left flex items-start gap-3 p-4 rounded-lg border-l-4 transition-colors ${
                    n.read
                      ? 'bg-card border-border'
                      : 'bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800'
                  } ${pcfg.border}`}
                >
                  <span className={`text-xl shrink-0 mt-0.5 ${cfg.color}`}>{cfg.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {n.type === 'dividend' ? (
                          <p className="text-sm font-medium text-primary truncate">
                            {t('notifications.dividendReceivedTitle')}
                          </p>
                        ) : (
                          <p className="text-sm font-medium text-primary truncate">{n.title}</p>
                        )}
                        <span
                          className={`text-[9px] font-bold uppercase tracking-wide text-white px-1.5 py-0.5 rounded ${pcfg.badge}`}
                        >
                          {t(`notifications.priority.${n.priority || 'low'}`)}
                        </span>
                      </div>
                      <span className="text-[10px] text-muted whitespace-nowrap shrink-0 mt-0.5">
                        {timeAgo(n.createdAt, t)}
                      </span>
                    </div>
                    {n.type === 'dividend' ? (
                      <p className="text-xs text-secondary mt-0.5 line-clamp-2">
                        {t('notifications.dividendReceived', {
                          amount: formatMoneyExact(n.amount || 0),
                          company: n.companyName || '',
                        })}
                      </p>
                    ) : (
                      <p className="text-xs text-secondary mt-0.5 line-clamp-2">{n.message}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 mt-1">
                    {!n.read && <span className={`w-2 h-2 rounded-full ${pcfg.dot}`} />}
                    <button
                      onClick={(e) => handleDelete(e, n._id)}
                      className="text-muted hover:text-red-500 transition-colors p-0.5"
                      title={t('notifications.delete')}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </button>
              );
            })}
          </div>
        )}
        <Pagination page={notificationPage} totalPages={notificationTotalPages} onPageChange={handlePageChange} />
      </div>
    </div>
  );
}
