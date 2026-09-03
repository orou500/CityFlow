import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { getApiBaseUrl } from '../utils/capacitor';
import { formatMoney } from '../utils/format';

const API = getApiBaseUrl();

async function api(path, options = {}) {
  const token = localStorage.getItem('token');
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { ...options, headers });
  let data = {};
  try {
    data = await res.json();
  } catch {
    data = {};
  }
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data;
}

const RANGES = ['today', '7d', '30d', 'all'];

function Card({ label, value, sub }) {
  return (
    <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-4 py-3 border border-gray-200 dark:border-gray-700">
      <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">{label}</div>
      <div className="text-lg font-semibold text-gray-900 dark:text-white mt-1">{value}</div>
      {sub && <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">{sub}</div>}
    </div>
  );
}

function fmtPct(n) {
  if (n === null || n === undefined) return '—';
  return `${n}%`;
}

export default function RewardedAdsAdminPanel() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [days, setDays] = useState(30);
  const [daily, setDaily] = useState(null);
  const [sessions, setSessions] = useState(null);
  const [sessionsPage, setSessionsPage] = useState(1);
  const [sessionStatus, setSessionStatus] = useState('all');
  const [cpmDraft, setCpmDraft] = useState('');
  const [savingCpm, setSavingCpm] = useState(false);
  const [cpmSaved, setCpmSaved] = useState(false);
  const [activeRange, setActiveRange] = useState('all');
  const [activeChart, setActiveChart] = useState('sessions');
  const savingTimer = useRef(null);

  const loadDashboard = useCallback(async () => {
    try {
      const d = await api('/admin/rewarded-ads/dashboard');
      setData(d);
      setCpmDraft(String(d.estimatedCpm ?? ''));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDaily = useCallback(async () => {
    try {
      const d = await api(`/admin/rewarded-ads/daily?days=${days}`);
      setDaily(d);
    } catch {
      // non-fatal for the chart
    }
  }, [days]);

  const loadSessions = useCallback(async () => {
    try {
      const q = new URLSearchParams({ limit: '15', page: String(sessionsPage) });
      if (sessionStatus !== 'all') q.set('status', sessionStatus);
      const s = await api(`/admin/rewarded-ads/sessions?${q.toString()}`);
      setSessions(s);
    } catch {
      // non-fatal for the table
    }
  }, [sessionsPage, sessionStatus]);

  useEffect(() => {
    loadDashboard();
    loadSessions();
  }, [loadDashboard, loadSessions]);

  useEffect(() => {
    loadDaily();
  }, [loadDaily]);

  useEffect(() => {
    return () => clearTimeout(savingTimer.current);
  }, []);

  const saveCpm = async () => {
    const v = Number(cpmDraft);
    if (!Number.isFinite(v) || v < 0) return;
    setSavingCpm(true);
    setCpmSaved(false);
    try {
      const res = await api('/admin/rewarded-ads/config', { method: 'PUT', body: JSON.stringify({ estimatedCpm: v }) });
      setData((d) => ({ ...d, estimatedCpm: res.estimatedCpm }));
      setCpmSaved(true);
      clearTimeout(savingTimer.current);
      savingTimer.current = setTimeout(() => setCpmSaved(false), 3000);
    } finally {
      setSavingCpm(false);
    }
  };

  const active = data?.ranges?.[activeRange];

  const chartData = useMemo(() => {
    if (!daily?.points) return [];
    return daily.points.map((p) => ({
      ...p,
      label: p.date.slice(5),
    }));
  }, [daily]);

  const funnel = useMemo(() => {
    if (!active) return null;
    const started = active.totalSessions;
    const attempts = active.completionAttempts;
    const completed = active.completed;
    const rewarded = active.rewarded || 0;
    const attemptRate = started > 0 ? Math.round((attempts / started) * 100) : null;
    const completeRate = active.completionRate;
    const rewardRate = completed > 0 ? Math.round((rewarded / completed) * 100) : null;
    return [
      { stage: t('rewardedAdsAdmin.funnelStarted'), value: started, pct: null },
      { stage: t('rewardedAdsAdmin.funnelAttempts'), value: attempts, pct: attemptRate, of: started },
      { stage: t('rewardedAdsAdmin.funnelCompleted'), value: completed, pct: completeRate, of: attempts },
      { stage: t('rewardedAdsAdmin.funnelRewarded'), value: rewarded, pct: rewardRate, of: completed },
    ];
  }, [active, t]);

  if (loading) return <p className="text-sm text-gray-500 dark:text-gray-400">{t('common.loading')}</p>;

  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {data?.enabled === false && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3 text-sm text-yellow-700 dark:text-yellow-300">
          {t('rewardedAdsAdmin.disabledNotice')}
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{t('rewardedAdsAdmin.overviewTitle')}</h3>
        <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setActiveRange(r)}
              className={`px-3 py-1 text-xs rounded transition-colors ${
                activeRange === r
                  ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              {t(`rewardedAdsAdmin.range.${r}`)}
            </button>
          ))}
        </div>
      </div>

      {active && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          <Card label={t('rewardedAdsAdmin.sessions')} value={active.totalSessions} />
          <Card label={t('rewardedAdsAdmin.impressions')} value={active.impressions.toLocaleString()} />
          <Card label={t('rewardedAdsAdmin.completed')} value={active.completed} />
          <Card label={t('rewardedAdsAdmin.completionRate')} value={fmtPct(active.completionRate)} />
          <Card label={t('rewardedAdsAdmin.completionAttempts')} value={active.completionAttempts} />
          <Card label={t('rewardedAdsAdmin.failedCompletions')} value={active.failedCompletions} />
          <Card
            label={t('rewardedAdsAdmin.estimatedRevenue')}
            value={formatMoney(active.estimatedRevenue)}
            sub={t('rewardedAdsAdmin.estimatedSub', { cpm: data?.estimatedCpm })}
          />
          <Card label={t('rewardedAdsAdmin.realSpend')} value={formatMoney(data?.spend?.[activeRange] ?? 0)} />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
              {t('rewardedAdsAdmin.dailyChartTitle')}
            </h4>
            <div className="flex gap-1">
              {[7, 30, 90].map((d) => (
                <button
                  key={d}
                  onClick={() => setDays(d)}
                  className={`px-2 py-0.5 text-xs rounded transition-colors ${
                    days === d
                      ? 'bg-blue-600 text-white'
                      : 'bg-white dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                  }`}
                >
                  {d}d
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-3 mb-2">
            {[
              { key: 'sessions', label: t('rewardedAdsAdmin.sessions') },
              { key: 'impressions', label: t('rewardedAdsAdmin.impressions') },
              { key: 'completed', label: t('rewardedAdsAdmin.completed') },
            ].map((m) => (
              <button
                key={m.key}
                onClick={() => setActiveChart(m.key)}
                className={`text-xs ${activeChart === m.key ? 'text-blue-600 dark:text-blue-400 font-semibold' : 'text-gray-500 dark:text-gray-400'}`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="rewardedGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="label" stroke="#6b7280" fontSize={10} tickLine={false} minTickGap={24} />
                <YAxis stroke="#6b7280" fontSize={10} tickLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1f2937',
                    border: '1px solid #374151',
                    borderRadius: '8px',
                    color: '#f3f4f6',
                    fontSize: '12px',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey={activeChart}
                  stroke="#3b82f6"
                  strokeWidth={2}
                  fill="url(#rewardedGradient)"
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
            {t('rewardedAdsAdmin.funnelTitle')}
          </h4>
          {funnel && (
            <div className="space-y-2">
              {funnel.map((f, i) => (
                <div key={i}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-gray-600 dark:text-gray-300">{f.stage}</span>
                    <span className="text-gray-900 dark:text-white font-medium">
                      {f.value}
                      {f.pct !== null && <span className="text-gray-400 dark:text-gray-500 ms-2">{fmtPct(f.pct)}</span>}
                    </span>
                  </div>
                  <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all"
                      style={{
                        width: f.pct === null ? (f.value > 0 ? 100 : 0) : `${Math.max(0, Math.min(100, f.pct))}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-3">{t('rewardedAdsAdmin.funnelNote')}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
            {t('rewardedAdsAdmin.limitsTitle')}
          </h4>
          {data?.limits && (
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500 dark:text-gray-400">{t('rewardedAdsAdmin.rewardAmount')}</dt>
                <dd className="text-gray-900 dark:text-white">{formatMoney(data.limits.rewardAmount)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500 dark:text-gray-400">{t('rewardedAdsAdmin.cooldown')}</dt>
                <dd className="text-gray-900 dark:text-white">{data.limits.cooldownMinutes} min</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500 dark:text-gray-400">{t('rewardedAdsAdmin.dailyLimit')}</dt>
                <dd className="text-gray-900 dark:text-white">{data.limits.dailyLimit}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500 dark:text-gray-400">{t('rewardedAdsAdmin.sessionTtl')}</dt>
                <dd className="text-gray-900 dark:text-white">{data.limits.sessionTtlMinutes} min</dd>
              </div>
            </dl>
          )}
        </div>

        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">{t('rewardedAdsAdmin.cpmTitle')}</h4>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">{t('rewardedAdsAdmin.cpmHint')}</p>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="0"
              step="0.1"
              value={cpmDraft}
              onChange={(e) => setCpmDraft(e.target.value)}
              className="w-24 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm text-gray-900 dark:text-white"
              aria-label={t('rewardedAdsAdmin.cpmInput')}
            />
            <button
              onClick={saveCpm}
              disabled={savingCpm}
              className="px-3 py-1 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-300 dark:disabled:bg-gray-600 text-white text-sm rounded transition-colors"
            >
              {savingCpm ? t('common.loading') : t('rewardedAdsAdmin.saveCpm')}
            </button>
          </div>
          {cpmSaved && (
            <p className="text-xs text-green-600 dark:text-green-400 mt-2">{t('rewardedAdsAdmin.cpmSaved')}</p>
          )}
        </div>

        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
            {t('rewardedAdsAdmin.providerTitle')}
          </h4>
          <p className="text-sm text-gray-600 dark:text-gray-300">{data?.provider?.provider}</p>
          <div className="mt-3 flex flex-col gap-2">
            <a
              href={data?.provider?.publisherDashboardUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              {t('rewardedAdsAdmin.openDashboard')} ↗
            </a>
            {data?.provider?.publisherHelpUrl && (
              <a
                href={data?.provider?.publisherHelpUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
              >
                {t('rewardedAdsAdmin.openHelp')} ↗
              </a>
            )}
          </div>
        </div>
      </div>

      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
            {t('rewardedAdsAdmin.recentSessions')}
          </h4>
          <div className="flex items-center gap-2">
            <select
              value={sessionStatus}
              onChange={(e) => {
                setSessionStatus(e.target.value);
                setSessionsPage(1);
              }}
              className="bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded px-2 py-1 text-xs text-gray-900 dark:text-white"
            >
              <option value="all">{t('rewardedAdsAdmin.statusAll')}</option>
              <option value="completed">{t('rewardedAdsAdmin.statusCompleted')}</option>
              <option value="pending">{t('rewardedAdsAdmin.statusPending')}</option>
              <option value="expired">{t('rewardedAdsAdmin.statusExpired')}</option>
              <option value="aborted">{t('rewardedAdsAdmin.statusAborted')}</option>
            </select>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-start">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 uppercase text-xs">
                <th className="px-3 py-2 font-medium">{t('rewardedAdsAdmin.thUser')}</th>
                <th className="px-3 py-2 font-medium">{t('rewardedAdsAdmin.thDate')}</th>
                <th className="px-3 py-2 font-medium">{t('rewardedAdsAdmin.thStatus')}</th>
                <th className="px-3 py-2 font-medium">{t('rewardedAdsAdmin.thReward')}</th>
                <th className="px-3 py-2 font-medium">{t('rewardedAdsAdmin.thImpressions')}</th>
                <th className="px-3 py-2 font-medium">{t('rewardedAdsAdmin.thAttempts')}</th>
                <th className="px-3 py-2 font-medium">{t('rewardedAdsAdmin.thFailed')}</th>
              </tr>
            </thead>
            <tbody>
              {sessions?.sessions?.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-gray-400 dark:text-gray-500">
                    {t('admin.noData')}
                  </td>
                </tr>
              )}
              {sessions?.sessions?.map((s) => (
                <tr key={s.id} className="border-b border-gray-100 dark:border-gray-800">
                  <td className="px-3 py-2 text-gray-900 dark:text-white">{s.user || '—'}</td>
                  <td className="px-3 py-2 text-gray-600 dark:text-gray-300">
                    {new Date(s.date).toLocaleDateString()} {new Date(s.date).toLocaleTimeString()}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`px-2 py-0.5 rounded text-xs ${
                        s.status === 'completed'
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                          : s.status === 'pending'
                            ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                      }`}
                    >
                      {t(`rewardedAdsAdmin.status.${s.status}`)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-gray-900 dark:text-white">{formatMoney(s.rewardAmount)}</td>
                  <td className="px-3 py-2 text-gray-600 dark:text-gray-300">{s.impressions}</td>
                  <td className="px-3 py-2 text-gray-600 dark:text-gray-300">{s.completionAttempts}</td>
                  <td className="px-3 py-2 text-gray-600 dark:text-gray-300">{s.failedCompletions}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {sessions && sessions.totalPages > 1 && (
          <div className="flex items-center justify-between mt-3 text-sm">
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {t('rewardedAdsAdmin.pageOf', { page: sessions.page, total: sessions.totalPages })}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setSessionsPage((p) => Math.max(1, p - 1))}
                disabled={sessions.page <= 1}
                className="px-3 py-1 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-xs disabled:opacity-40"
              >
                {t('common.previous')}
              </button>
              <button
                onClick={() => setSessionsPage((p) => Math.min(sessions.totalPages, p + 1))}
                disabled={sessions.page >= sessions.totalPages}
                className="px-3 py-1 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-xs disabled:opacity-40"
              >
                {t('common.next')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
