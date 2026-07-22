import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLeaderboardStore } from '../store/useLeaderboardStore';
import CompactValue from '../components/CompactValue';
import { getAvatarUrl } from '../utils/capacitor';
import useNativeAvatarUrl from '../hooks/useNativeAvatarUrl';

const EVENT_TYPE_ICONS = {
  wealth: '\uD83D\uDCB0',
  development: '\uD83C\uDFD7\uFE0F',
  expansion: '\uD83C\uDF0D',
  income: '\uD83D\uDCC8',
  influence: '\uD83C\uDFDB\uFE0F',
};

const EVENT_TYPE_COLORS = {
  wealth: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
  development: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
  expansion: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300',
  income: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300',
  influence: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
};

const STATUS_COLORS = {
  active: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
  completed: 'bg-gray-100 dark:bg-gray-800 text-muted',
  upcoming: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300',
};

function EventCard({ event, onClick }) {
  const { t } = useTranslation();
  const isActive = event.status === 'active';
  const isCompleted = event.status === 'completed';

  const formatDate = (d) => {
    try {
      return new Date(d).toLocaleDateString();
    } catch {
      return '\u2014';
    }
  };

  return (
    <button
      onClick={() => onClick(event)}
      className="w-full text-left bg-card border border-border rounded-xl p-3 sm:p-4 hover:shadow-md active:bg-gray-50 dark:active:bg-gray-800/50 transition-all"
    >
      <div className="flex items-start gap-3">
        <span className="text-2xl shrink-0 mt-0.5">{EVENT_TYPE_ICONS[event.type] || '\uD83C\uDFAF'}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="font-semibold text-primary text-sm">{event.name}</div>
              <div className="text-xs text-muted mt-0.5 line-clamp-2">{event.description}</div>
            </div>
            <span
              className={`text-[10px] sm:text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${STATUS_COLORS[event.status]}`}
            >
              {t(`leaderboard.events.status.${event.status}`)}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 mt-2">
            <span className={`text-[10px] sm:text-xs px-2 py-0.5 rounded-full ${EVENT_TYPE_COLORS[event.type]}`}>
              {t(`leaderboard.events.types.${event.type}`)}
            </span>
            {isActive && (
              <span className="text-[10px] sm:text-xs text-secondary">
                {t('leaderboard.events.participants')}: {event.participants?.length || 0}
              </span>
            )}
            {isCompleted && event.participants?.[0] && (
              <span className="text-[10px] sm:text-xs text-secondary">
                {t('leaderboard.events.winner')}: {event.participants[0].displayName || event.participants[0].username}
              </span>
            )}
            {!isActive && !isCompleted && (
              <span className="text-[10px] sm:text-xs text-secondary">
                {t('leaderboard.events.starts')}: {formatDate(event.startDate)}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

function EventDetailPagination({ page, totalPages, onPageChange }) {
  if (totalPages <= 1) return null;
  const pages = [];
  const start = Math.max(1, page - 1);
  const end = Math.min(totalPages, page + 1);
  for (let i = start; i <= end; i++) pages.push(i);

  return (
    <div className="flex items-center justify-center gap-1 py-2 border-t border-border">
      <button
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        className="px-2 py-1 rounded text-xs text-secondary hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30"
      >
        {'\u2190'}
      </button>
      {start > 1 && (
        <button
          onClick={() => onPageChange(1)}
          className="w-7 h-7 rounded text-[11px] text-secondary hover:bg-gray-100 dark:hover:bg-gray-800"
        >
          1
        </button>
      )}
      {start > 2 && <span className="text-[11px] text-muted px-0.5">{'\u2026'}</span>}
      {pages.map((p) => (
        <button
          key={p}
          onClick={() => onPageChange(p)}
          className={`w-7 h-7 rounded text-[11px] font-medium transition-colors ${
            p === page ? 'bg-blue-600 text-white' : 'text-secondary hover:bg-gray-100 dark:hover:bg-gray-800'
          }`}
        >
          {p}
        </button>
      ))}
      {end < totalPages - 1 && <span className="text-[11px] text-muted px-0.5">{'\u2026'}</span>}
      {end < totalPages && (
        <button
          onClick={() => onPageChange(totalPages)}
          className="w-7 h-7 rounded text-[11px] text-secondary hover:bg-gray-100 dark:hover:bg-gray-800"
        >
          {totalPages}
        </button>
      )}
      <button
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        className="px-2 py-1 rounded text-xs text-secondary hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30"
      >
        {'\u2192'}
      </button>
    </div>
  );
}

const EVENT_PAGE_SIZE = 15;

function EventDetail({ event, onClose }) {
  const { t } = useTranslation();
  const formatValue = (val) => <CompactValue value={val} prefix="$" />;
  const [page, setPage] = useState(1);

  const participants = event.participants || [];
  const totalParticipants = participants.length;
  const totalPages = Math.max(1, Math.ceil(totalParticipants / EVENT_PAGE_SIZE));

  const formatDate = (d) => {
    try {
      return new Date(d).toLocaleDateString();
    } catch {
      return '\u2014';
    }
  };

  const topThree = participants.slice(0, 3);
  const pageStart = page === 1 ? 3 : (page - 1) * EVENT_PAGE_SIZE;
  const pageParticipants =
    page === 1
      ? participants.slice(3, 3 + EVENT_PAGE_SIZE)
      : participants.slice(pageStart, pageStart + EVENT_PAGE_SIZE);

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border rounded-t-2xl sm:rounded-xl shadow-xl sm:max-w-lg w-full max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 sm:p-5 border-b border-border shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-2xl shrink-0">{EVENT_TYPE_ICONS[event.type] || '\uD83C\uDFAF'}</span>
              <div className="min-w-0">
                <h2 className="text-base sm:text-lg font-bold text-primary truncate">{event.name}</h2>
                <p className="text-[11px] sm:text-xs text-secondary">{event.description}</p>
              </div>
            </div>
            <button onClick={onClose} className="text-muted hover:text-primary text-2xl leading-none shrink-0 ml-2">
              {'\u00D7'}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 mt-2.5 text-[11px] sm:text-xs text-secondary">
            <span className={`px-2 py-0.5 rounded-full font-medium ${EVENT_TYPE_COLORS[event.type]}`}>
              {t(`leaderboard.events.types.${event.type}`)}
            </span>
            <span>
              {t('leaderboard.events.timeline')}: {formatDate(event.startDate)} — {formatDate(event.endDate)}
            </span>
            <span className="text-muted">{'\u00B7'}</span>
            <span>
              {totalParticipants} {t('leaderboard.events.participants').toLowerCase()}
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          {totalParticipants === 0 ? (
            <div className="p-8 text-center text-muted">{t('leaderboard.events.noParticipants')}</div>
          ) : (
            <>
              {topThree.length > 0 && (
                <div className="px-4 py-3 border-b border-border bg-gradient-to-b from-gray-50/50 to-transparent dark:from-gray-800/20">
                  <div className="flex items-end justify-center gap-4 sm:gap-6">
                    {topThree.length >= 2 && (
                      <EventPodiumItem participant={topThree[1]} medal={'\uD83E\uDD48'} formatValue={formatValue} />
                    )}
                    {topThree.length >= 1 && (
                      <EventPodiumItem
                        participant={topThree[0]}
                        medal={'\uD83E\uDD47'}
                        formatValue={formatValue}
                        highlight
                      />
                    )}
                    {topThree.length >= 3 && (
                      <EventPodiumItem participant={topThree[2]} medal={'\uD83E\uDD49'} formatValue={formatValue} />
                    )}
                  </div>
                </div>
              )}

              {pageParticipants.length > 0 && (
                <div className="px-2 py-2">
                  {pageParticipants.map((p) => (
                    <EventParticipantRow key={p.userId} participant={p} formatValue={formatValue} />
                  ))}
                </div>
              )}

              <EventDetailPagination page={page} totalPages={totalPages} onPageChange={setPage} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function EventPodiumItem({ participant, medal, formatValue, highlight = false }) {
  const avatarUrl = useNativeAvatarUrl(getAvatarUrl(participant.avatar || null));
  const initial = (participant.displayName || participant.username || '?').charAt(0).toUpperCase();

  return (
    <div className="flex flex-col items-center flex-1 min-w-0 max-w-[100px]">
      {medal === '\uD83E\uDD47' && <div className="text-sm mb-0.5">{medal}</div>}
      {avatarUrl ? (
        <img src={avatarUrl} alt="" className="w-9 h-9 rounded-full object-cover" />
      ) : (
        <div className="w-9 h-9 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-medium">
          {initial}
        </div>
      )}
      <div className="mt-1 text-center w-full">
        <div className="text-[10px] font-medium text-primary truncate">
          {participant.displayName || participant.username}
        </div>
        <div
          className={`text-[11px] sm:text-xs font-bold mt-0.5 ${highlight ? 'text-green-600 dark:text-green-400' : 'text-secondary'}`}
        >
          {formatValue(participant.value)}
        </div>
      </div>
      {medal !== '\uD83E\uDD47' && <div className="text-sm mt-0.5">{medal}</div>}
    </div>
  );
}

function EventParticipantRow({ participant, formatValue }) {
  const avatarUrl = useNativeAvatarUrl(getAvatarUrl(participant.avatar || null));
  const initial = (participant.displayName || participant.username || '?').charAt(0).toUpperCase();

  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50">
      <span className="w-6 text-center text-[11px] font-semibold text-muted shrink-0">#{participant.rank}</span>
      {avatarUrl ? (
        <img src={avatarUrl} alt="" className="w-6 h-6 rounded-full object-cover shrink-0" />
      ) : (
        <div className="w-6 h-6 rounded-full bg-blue-600 text-white text-[9px] flex items-center justify-center font-medium shrink-0">
          {initial}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <span className="text-xs sm:text-sm font-medium text-primary truncate block">
          {participant.displayName || participant.username}
        </span>
      </div>
      <span className="text-xs sm:text-sm font-semibold text-primary shrink-0">{formatValue(participant.value)}</span>
    </div>
  );
}

export default function CompetitiveEventsPage() {
  const { t } = useTranslation();
  const { events, fetchEvents, fetchEvent, selectedEvent } = useLeaderboardStore();
  const [activeFilter, setActiveFilter] = useState('all');
  const [showDetail, setShowDetail] = useState(false);
  const [eventsPage, setEventsPage] = useState(1);
  const EVENTS_PAGE_SIZE = 10;

  useEffect(() => {
    fetchEvents();
  }, []);

  const handleEventClick = async (event) => {
    await fetchEvent(event._id);
    setShowDetail(true);
  };

  const filtered = activeFilter === 'all' ? events : events.filter((e) => e.status === activeFilter);
  const totalEventPages = Math.max(1, Math.ceil(filtered.length / EVENTS_PAGE_SIZE));
  const pagedEvents = filtered.slice((eventsPage - 1) * EVENTS_PAGE_SIZE, eventsPage * EVENTS_PAGE_SIZE);

  const activeCount = events.filter((e) => e.status === 'active').length;
  const completedCount = events.filter((e) => e.status === 'completed').length;

  const handleFilterChange = (f) => {
    setActiveFilter(f);
    setEventsPage(1);
  };

  return (
    <div className="max-w-4xl mx-auto px-3 sm:px-4 py-4 sm:py-6">
      <div className="mb-4 sm:mb-5">
        <h1 className="text-xl sm:text-2xl font-bold text-primary">{t('leaderboard.events.title')}</h1>
        <p className="text-xs sm:text-sm text-secondary mt-1">{t('leaderboard.events.subtitle')}</p>
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-2 mb-3 sm:mb-4 -mx-3 px-3 sm:mx-0 sm:px-0 scrollbar-hide">
        {['all', 'active', 'upcoming', 'completed'].map((f) => (
          <button
            key={f}
            onClick={() => handleFilterChange(f)}
            className={`px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium whitespace-nowrap transition-colors ${
              activeFilter === f
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-secondary hover:text-primary'
            }`}
          >
            {t(`leaderboard.events.filters.${f}`)}
            {f === 'active' && activeCount > 0 && (
              <span className="ml-1.5 bg-green-400 text-green-900 text-[10px] px-1 rounded-full font-bold">
                {activeCount}
              </span>
            )}
            {f === 'completed' && completedCount > 0 && (
              <span className="ml-1.5 bg-gray-400 text-gray-900 text-[10px] px-1 rounded-full font-bold">
                {completedCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-6 sm:p-8 text-center">
          <div className="text-4xl mb-3">{'\uD83C\uDFAF'}</div>
          <div className="text-sm font-medium text-secondary mb-1">{t('leaderboard.events.noEvents')}</div>
          <div className="text-xs text-muted">{t('leaderboard.events.autoGenerated')}</div>
        </div>
      ) : (
        <>
          <div className="space-y-2 sm:space-y-3">
            {pagedEvents.map((event) => (
              <EventCard key={event._id} event={event} onClick={handleEventClick} />
            ))}
          </div>

          {totalEventPages > 1 && (
            <div className="flex items-center justify-center gap-1 mt-3">
              <button
                onClick={() => setEventsPage((p) => Math.max(1, p - 1))}
                disabled={eventsPage <= 1}
                className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-secondary hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30"
              >
                {'\u2190'}
              </button>
              {Array.from({ length: totalEventPages }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  onClick={() => setEventsPage(p)}
                  className={`w-8 h-8 rounded-lg text-xs font-medium transition-colors ${
                    p === eventsPage
                      ? 'bg-blue-600 text-white'
                      : 'text-secondary hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`}
                >
                  {p}
                </button>
              ))}
              <button
                onClick={() => setEventsPage((p) => Math.min(totalEventPages, p + 1))}
                disabled={eventsPage >= totalEventPages}
                className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-secondary hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30"
              >
                {'\u2192'}
              </button>
            </div>
          )}

          <div className="text-center text-[11px] text-muted mt-2">
            {t('leaderboard.showing', {
              count: pagedEvents.length,
              total: filtered.length,
            })}
          </div>
        </>
      )}

      {showDetail && selectedEvent && <EventDetail event={selectedEvent} onClose={() => setShowDetail(false)} />}
    </div>
  );
}
