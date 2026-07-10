import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

function formatCountdown(ms) {
  if (ms <= 0) return '00:00:00';
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((n) => String(n).padStart(2, '0')).join(':');
}

function formatTimeAgo(dateStr, t) {
  if (!dateStr) return '-';
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (minutes < 1) return t('worldStatus.justNow');
  if (minutes < 60) return t('worldStatus.minutesAgo', { count: minutes });
  if (hours < 24) return t('worldStatus.hoursAgo', { count: hours });
  return t('worldStatus.daysAgo', { count: days });
}

function formatAge(createdAt, t) {
  if (!createdAt) return '-';
  const diff = Date.now() - new Date(createdAt).getTime();
  const days = Math.floor(diff / 86400000);
  if (days < 60) return t('worldStatus.days', { count: days });
  const months = Math.floor(days / 30);
  if (months < 12) return t('worldStatus.months', { count: months });
  const years = Math.floor(months / 12);
  return t('worldStatus.years', { count: years });
}

export default function WorldStatusWidget() {
  const { t } = useTranslation();
  const [status, setStatus] = useState(null);
  const [countdown, setCountdown] = useState('');

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/world/status');
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    if (!status?.nextUpdateAt) return;

    const tick = () => {
      const remaining = new Date(status.nextUpdateAt).getTime() - Date.now();
      setCountdown(formatCountdown(remaining));
      if (remaining <= 0) {
        setTimeout(fetchStatus, 2000);
      }
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [status?.nextUpdateAt, fetchStatus]);

  if (!status) {
    return (
      <div className="absolute top-4 left-4 z-[1000] bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm border border-gray-200 dark:border-gray-700 rounded-lg p-4 min-w-[200px] shadow-xl">
        <p className="text-xs text-gray-400 dark:text-gray-500">{t('worldStatus.loading')}</p>
      </div>
    );
  }

  const rows = [
    { label: t('worldStatus.nextUpdate'), value: countdown, highlight: true },
    { label: t('worldStatus.completedCycles'), value: status.currentCycle?.toLocaleString() },
    { label: t('worldStatus.worldAge'), value: formatAge(status.worldCreatedAt, t) },
    { label: t('worldStatus.lastUpdate'), value: formatTimeAgo(status.lastUpdateAt, t) },
  ];

  return (
    <div className="absolute top-4 left-4 z-[1000] bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm border border-gray-200 dark:border-gray-700 rounded-lg p-4 min-w-[220px] shadow-xl">
      <h4 className="text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider mb-3">
        {t('worldStatus.title')}
      </h4>
      <div className="space-y-2">
        {rows.map((row) => (
          <div key={row.label} className="flex flex-col">
            <span className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wide">{row.label}</span>
            <span
              className={`text-sm font-semibold ${
                row.highlight ? 'text-primary font-mono tabular-nums' : 'text-gray-800 dark:text-gray-200'
              }`}
            >
              {row.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
