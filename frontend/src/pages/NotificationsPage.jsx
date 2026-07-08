import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../store/useGameStore';
import { useAuthStore } from '../store/useAuthStore';

const TYPE_CONFIG = {
  property_offer: { icon: '🤝', color: 'text-blue-500', route: '/dashboard' },
  offer_accepted: { icon: '✅', color: 'text-emerald-500', route: '/marketplace' },
  offer_rejected: { icon: '❌', color: 'text-red-500', route: '/marketplace' },
  offer_countered: { icon: '🔄', color: 'text-amber-500', route: '/marketplace' },
  offer_expired: { icon: '⏰', color: 'text-gray-500', route: '/marketplace' },
  construction_complete: { icon: '🏗️', color: 'text-emerald-500', route: '/development' },
  friend_request: { icon: '👤', color: 'text-blue-500', route: '/friends' },
};

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
  const { notifications, fetchNotifications, fetchUnreadCount, markNotificationRead, markAllRead, deleteNotification } =
    useGameStore();
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchNotifications(), fetchUnreadCount()]);
    setLoading(false);
  }, [fetchNotifications, fetchUnreadCount]);

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }
    load();
  }, [user]);

  const handleClick = async (notification) => {
    if (!notification.read) {
      await markNotificationRead(notification._id);
      await fetchUnreadCount();
    }
    const cfg = TYPE_CONFIG[notification.type];
    if (cfg?.route) navigate(cfg.route);
  };

  const handleMarkAllRead = async () => {
    await markAllRead();
    await Promise.all([fetchNotifications(), fetchUnreadCount()]);
  };

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    await deleteNotification(id);
    await Promise.all([fetchNotifications(), fetchUnreadCount()]);
  };

  if (!user) return null;

  return (
    <div className="flex-1 p-4 md:p-6 overflow-y-auto">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-primary">{t('notifications.title')}</h1>
          {notifications.some((n) => !n.read) && (
            <button
              onClick={handleMarkAllRead}
              className="text-sm text-emerald-600 hover:text-emerald-500 font-medium transition-colors"
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
              return (
                <button
                  key={n._id}
                  onClick={() => handleClick(n)}
                  className={`w-full text-left flex items-start gap-3 p-4 rounded-lg border transition-colors ${
                    n.read
                      ? 'bg-card border-border'
                      : 'bg-emerald-50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-800'
                  }`}
                >
                  <span className={`text-xl shrink-0 mt-0.5 ${cfg.color}`}>{cfg.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className={`text-sm font-medium ${n.read ? 'text-primary' : 'text-primary'}`}>{n.title}</p>
                      <span className="text-[10px] text-muted whitespace-nowrap shrink-0 mt-0.5">
                        {timeAgo(n.createdAt, t)}
                      </span>
                    </div>
                    <p className="text-xs text-secondary mt-0.5 line-clamp-2">{n.message}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 mt-1">
                    {!n.read && <span className="w-2 h-2 rounded-full bg-emerald-500" />}
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
      </div>
    </div>
  );
}
