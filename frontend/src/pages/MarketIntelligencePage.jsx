import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { getApiBaseUrl } from '../utils/capacitor';
import { useAuthStore } from '../store/useAuthStore';

const API = getApiBaseUrl();

async function api(path, options = {}) {
  const token = localStorage.getItem('token');
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { ...options, headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

const TIER_STYLES = {
  basic: { bg: 'bg-blue-900/40', border: 'border-blue-700', text: 'text-blue-300', label: 'Basic' },
  advanced: { bg: 'bg-purple-900/40', border: 'border-purple-700', text: 'text-purple-300', label: 'Advanced' },
  premium: { bg: 'bg-yellow-900/40', border: 'border-yellow-700', text: 'text-yellow-300', label: 'Premium' },
};

const STATUS_STYLES = {
  active: { bg: 'bg-green-900/50', text: 'text-green-300', label: 'Active' },
  expired: { bg: 'bg-gray-700/50', text: 'text-gray-400', label: 'Expired' },
  evaluated: { bg: 'bg-blue-900/50', text: 'text-blue-300', label: 'Evaluated' },
};

function StatCard({ label, value, sub }) {
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
      <div className="text-xs text-gray-400 mb-1">{label}</div>
      <div className="text-xl font-bold text-white">{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
    </div>
  );
}

function ReportCard({ report, onClick }) {
  const { t } = useTranslation();
  const tierStyle = TIER_STYLES[report.tier] || TIER_STYLES.basic;
  const statusStyle = STATUS_STYLES[report.status] || STATUS_STYLES.active;
  const ticksLeft = Math.max(0, report.expiresAtTick - (report.currentTick || 0));

  return (
    <button
      onClick={() => onClick(report)}
      className="w-full text-left bg-gray-800 border border-gray-700 hover:border-gray-500 rounded-lg p-4 transition-colors"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-white">{t(`mi.reportTypes.${report.reportType}`)}</span>
        <span className={`text-xs px-2 py-0.5 rounded ${tierStyle.bg} ${tierStyle.border} ${tierStyle.text} border`}>
          {t(`mi.tiers.${report.tier}`)}
        </span>
      </div>
      <div className="flex items-center justify-between">
        <span className={`text-xs px-2 py-0.5 rounded ${statusStyle.bg} ${statusStyle.text}`}>
          {t(`mi.status.${report.status}`)}
        </span>
        {report.status === 'active' && (
          <span className="text-xs text-gray-400">{t('mi.ticksRemaining', { count: ticksLeft })}</span>
        )}
        {report.forecastAccuracy != null && (
          <span className="text-xs text-gray-400">
            {t('mi.accuracy')}: {report.forecastAccuracy}%
          </span>
        )}
      </div>
    </button>
  );
}

function ReportDetail({ report, onClose }) {
  const { t } = useTranslation();
  const tierStyle = TIER_STYLES[report.tier] || TIER_STYLES.basic;

  function renderContent() {
    const data = report.data;
    if (!data) return <div className="text-gray-400 text-sm">{t('mi.noData')}</div>;

    switch (report.reportType) {
      case 'price_forecast':
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard label={t('mi.currentPrice')} value={`$${data.snapshot?.avgPrice?.toLocaleString()}`} />
              <StatCard label={t('mi.demandIndex')} value={data.snapshot?.demandIndex} />
              <StatCard label={t('mi.supplyIndex')} value={data.snapshot?.supplyIndex} />
              <StatCard
                label={t('mi.economicCondition')}
                value={t(`mi.econConditions.${data.snapshot?.economicCondition}`)}
              />
            </div>
            {data.forecast && (
              <div className="bg-gray-900 rounded-lg p-4 space-y-3">
                <h4 className="text-sm font-medium text-white">{t('mi.priceForecast')}</h4>
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div className="text-center">
                    <div className="text-xs text-gray-400">{t('mi.bestCase')}</div>
                    <div className="text-green-400 font-medium">{data.forecast.bestCase?.change}%</div>
                    <div className="text-xs text-gray-500">${data.forecast.bestCase?.newPrice?.toLocaleString()}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-gray-400">{t('mi.mostLikely')}</div>
                    <div className="text-white font-medium">{data.forecast.mostLikely?.change}%</div>
                    <div className="text-xs text-gray-500">${data.forecast.mostLikely?.newPrice?.toLocaleString()}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-gray-400">{t('mi.worstCase')}</div>
                    <div className="text-red-400 font-medium">{data.forecast.worstCase?.change}%</div>
                    <div className="text-xs text-gray-500">${data.forecast.worstCase?.newPrice?.toLocaleString()}</div>
                  </div>
                </div>
                {data.forecast.confidenceInterval && (
                  <div className="text-xs text-gray-400 text-center">
                    {t('mi.confidence')}: {data.forecast.confidenceInterval}
                  </div>
                )}
                {data.forecast.priceToRentRatio?.current != null && (
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-gray-400">{t('mi.priceToRent')}: </span>
                      <span className="text-white">{data.forecast.priceToRentRatio.current}x</span>
                    </div>
                    <div>
                      <span className="text-gray-400">{t('mi.projectedPTR')}: </span>
                      <span className="text-white">{data.forecast.priceToRentRatio.projected}x</span>
                    </div>
                  </div>
                )}
              </div>
            )}
            {data.economicProbability && (
              <div className="bg-gray-900 rounded-lg p-4">
                <h4 className="text-sm font-medium text-white mb-2">{t('mi.economicProbabilities')}</h4>
                <div className="space-y-1">
                  {Object.entries(data.economicProbability).map(([key, val]) => (
                    <div key={key} className="flex items-center gap-2 text-sm">
                      <span className="text-gray-400 w-20">{t(`mi.econConditions.${key}`)}</span>
                      <div className="flex-1 bg-gray-700 rounded-full h-2">
                        <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${val}%` }} />
                      </div>
                      <span className="text-white w-10 text-right">{val}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );

      case 'risk_assessment':
        return (
          <div className="space-y-4">
            <div className="bg-gray-900 rounded-lg p-4 text-center">
              <div className="text-xs text-gray-400 mb-1">{t('mi.overallRisk')}</div>
              <div
                className={`text-3xl font-bold ${
                  data.overall?.level === 'low' || data.overall?.level === 'very_low'
                    ? 'text-green-400'
                    : data.overall?.level === 'high' || data.overall?.level === 'very_high'
                      ? 'text-red-400'
                      : 'text-yellow-400'
                }`}
              >
                {data.overall?.score}/100
              </div>
              <div className="text-sm text-gray-400">{t(`mi.riskLevels.${data.overall?.level}`)}</div>
              {data.expectedVolatility != null && (
                <div className="text-xs text-gray-500 mt-1">
                  {t('mi.expectedVolatility')}: {data.expectedVolatility}%
                </div>
              )}
            </div>
            {data.factors?.length > 0 && (
              <div className="bg-gray-900 rounded-lg p-4 space-y-2">
                <h4 className="text-sm font-medium text-white">{t('mi.riskFactors')}</h4>
                {data.factors.map((f, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="text-gray-300">{f.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500">
                        {f.contribution > 0 ? '+' : ''}
                        {f.contribution}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded text-xs ${
                          f.level === 'high'
                            ? 'bg-red-900 text-red-300'
                            : f.level === 'moderate'
                              ? 'bg-yellow-900 text-yellow-300'
                              : 'bg-green-900 text-green-300'
                        }`}
                      >
                        {t(`mi.riskFactorLevels.${f.level}`)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {data.hazardProbabilities?.length > 0 && (
              <div className="bg-gray-900 rounded-lg p-4">
                <h4 className="text-sm font-medium text-white mb-2">{t('mi.hazardProbabilities')}</h4>
                <div className="space-y-1">
                  {data.hazardProbabilities.map((h, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <span className="text-gray-300 capitalize">{h.type}</span>
                      <span className="text-white">{h.probability4Ticks}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {data.mitigationTips?.length > 0 && (
              <div className="bg-gray-900 rounded-lg p-4">
                <h4 className="text-sm font-medium text-white mb-2">{t('mi.mitigationTips')}</h4>
                <ul className="space-y-1">
                  {data.mitigationTips.map((tip, i) => (
                    <li key={i} className="text-sm text-gray-300 flex items-start gap-2">
                      <span className="text-blue-400">{'\u2022'}</span>
                      <span>{tip}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        );

      case 'growth_opportunities':
        return (
          <div className="space-y-4">
            {data.emergingCities?.length > 0 && (
              <div className="bg-gray-900 rounded-lg p-4">
                <h4 className="text-sm font-medium text-white mb-2">{t('mi.emergingCities')}</h4>
                <div className="space-y-2">
                  {data.emergingCities.map((c, i) => (
                    <div key={i} className="flex items-center justify-between text-sm bg-gray-800 rounded p-2">
                      <div>
                        <span className="text-white font-medium">{c.name}</span>
                        <span className="text-gray-400 ml-2">{c.country}</span>
                      </div>
                      <div className="text-right">
                        <div className="text-green-400">+{c.growthRate}%</div>
                        <div className="text-xs text-gray-400">${c.avgPrice?.toLocaleString()}</div>
                        <div className="text-xs text-gray-500">{c.reason}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {data.emergingDistricts?.length > 0 && (
              <div className="bg-gray-900 rounded-lg p-4">
                <h4 className="text-sm font-medium text-white mb-2">{t('mi.emergingDistricts')}</h4>
                <div className="space-y-2">
                  {data.emergingDistricts.map((d, i) => (
                    <div key={i} className="flex items-center justify-between text-sm bg-gray-800 rounded p-2">
                      <div>
                        <span className="text-white font-medium">{d.name}</span>
                        <span className="text-gray-400 ml-2">{d.cityName}</span>
                      </div>
                      <div className="text-right">
                        <div className="text-green-400">+{d.growthRate}%</div>
                        <div className="text-xs text-gray-400">{d.reason}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {data.undervaluedAreas?.length > 0 && (
              <div className="bg-gray-900 rounded-lg p-4">
                <h4 className="text-sm font-medium text-white mb-2">{t('mi.undervaluedAreas')}</h4>
                <div className="space-y-2">
                  {data.undervaluedAreas.map((a, i) => (
                    <div key={i} className="flex items-center justify-between text-sm bg-gray-800 rounded p-2">
                      <div>
                        <span className="text-white font-medium">{a.name}</span>
                        <span className="text-gray-400 ml-2">{a.cityName}</span>
                      </div>
                      <div className="text-right">
                        <div className="text-green-400">-{a.discountPercent}%</div>
                        <div className="text-xs text-gray-400">${a.currentPrice?.toLocaleString()}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {data.eventDrivenOpportunities?.length > 0 && (
              <div className="bg-gray-900 rounded-lg p-4">
                <h4 className="text-sm font-medium text-white mb-2">{t('mi.eventDrivenOpportunities')}</h4>
                <div className="space-y-2">
                  {data.eventDrivenOpportunities.map((e, i) => (
                    <div key={i} className="flex items-center justify-between text-sm bg-gray-800 rounded p-2">
                      <div>
                        <span className="text-white font-medium">{e.name}</span>
                        <span className="text-gray-400 ml-2">{e.cityName}</span>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-gray-400">{e.eventName}</div>
                        <div className="text-green-400">{e.expectedImpact}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {data.populationGrowthSignals?.length > 0 && (
              <div className="bg-gray-900 rounded-lg p-4">
                <h4 className="text-sm font-medium text-white mb-2">{t('mi.populationGrowthSignals')}</h4>
                <div className="space-y-2">
                  {data.populationGrowthSignals.map((c, i) => (
                    <div key={i} className="flex items-center justify-between text-sm bg-gray-800 rounded p-2">
                      <div>
                        <span className="text-white font-medium">{c.name}</span>
                      </div>
                      <div className="text-right">
                        <div className="text-green-400">+{c.growthRate}%</div>
                        <div className="text-xs text-gray-400">{c.reason}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );

      default:
        return <div className="text-gray-400 text-sm">{t('mi.noData')}</div>;
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-bold text-white">{t(`mi.reportTypes.${report.reportType}`)}</h3>
          <span className={`text-xs px-2 py-0.5 rounded ${tierStyle.bg} ${tierStyle.border} ${tierStyle.text} border`}>
            {t(`mi.tiers.${report.tier}`)}
          </span>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors text-sm">
          {t('mi.close')}
        </button>
      </div>
      {renderContent()}
      {report.status === 'evaluated' && report.forecastAccuracy != null && (
        <div className="bg-gray-900 rounded-lg p-4 text-center">
          <div className="text-xs text-gray-400 mb-1">{t('mi.forecastAccuracy')}</div>
          <div className="text-2xl font-bold text-blue-400">{report.forecastAccuracy}%</div>
          <div className="text-xs text-gray-500">
            {t('mi.evaluationTick')}: {report.evaluationTick}
          </div>
        </div>
      )}
    </div>
  );
}

function PurchaseForm({ reportType, tierInfo, cities, selectedCity, onSelectCity, onPurchase, onCancel }) {
  const { t } = useTranslation();
  const [selectedTier, setSelectedTier] = useState('basic');
  const [formCity, setFormCity] = useState(selectedCity || '');

  const needsCity = tierInfo.requiresCity;

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
      <h3 className="text-lg font-bold text-white mb-1">{t(`mi.reportTypes.${reportType}`)}</h3>
      <p className="text-sm text-gray-400 mb-4">{t('mi.purchaseReport')}</p>

      {needsCity && (
        <div className="mb-4">
          <label className="block text-sm text-gray-300 mb-1">{t('mi.selectCity')}</label>
          <select
            value={formCity}
            onChange={(e) => {
              setFormCity(e.target.value);
              onSelectCity(e.target.value);
            }}
            className="bg-gray-900 border border-gray-700 text-white rounded p-2 text-sm w-full"
          >
            <option value="">{t('mi.selectCity')}</option>
            {cities.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="space-y-3 mb-4">
        {['basic', 'advanced', 'premium'].map((tier) => {
          const style = TIER_STYLES[tier];
          const cost = tierInfo.costs[tier];
          const accuracy = tierInfo.accuracy[tier];
          const duration = tierInfo.durations?.[tier] || 0;
          return (
            <button
              key={tier}
              onClick={() => setSelectedTier(tier)}
              className={`w-full text-left p-3 rounded-lg border transition-colors ${
                selectedTier === tier
                  ? `${style.bg} ${style.border} border`
                  : 'bg-gray-900 border-gray-700 hover:border-gray-500'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`font-medium ${selectedTier === tier ? style.text : 'text-white'}`}>
                  {t(`mi.tiers.${tier}`)}
                </span>
                <span className="text-white font-semibold">${cost?.toLocaleString()}</span>
              </div>
              <div className="text-xs text-gray-400 mt-1">
                {t('mi.accuracy')}: {Math.round(accuracy * 100)}% · {t('mi.ticks.count', { count: duration })}
              </div>
            </button>
          );
        })}
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => onPurchase(selectedTier)}
          disabled={needsCity && !formCity}
          className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-medium py-2 px-4 rounded transition-colors disabled:opacity-50"
        >
          {t('mi.purchase')}
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors"
        >
          {t('mi.cancel')}
        </button>
      </div>
    </div>
  );
}

function WhatYouGet({ reportType }) {
  const { t } = useTranslation();
  const items = t(`mi.whatYouGet.${reportType}`, { returnObjects: true });
  if (!Array.isArray(items)) return null;

  return (
    <div className="bg-gray-900/50 rounded-lg p-3 mt-2">
      <div className="text-xs font-medium text-gray-300 mb-1.5">{t('mi.whatYouGet.title')}</div>
      <ul className="space-y-1">
        {items.map((item, i) => (
          <li key={i} className="text-xs text-gray-400 flex items-start gap-1.5">
            <span className="text-green-400 mt-0.5">{'\u2713'}</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PerformanceTab({ performance }) {
  const { t } = useTranslation();
  if (!performance) return <div className="text-gray-400 text-sm">{t('mi.noPerformanceData')}</div>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label={t('mi.totalReports')} value={performance.totalReports} />
        <StatCard label={t('mi.overallAccuracy')} value={`${performance.overallAccuracy}%`} />
      </div>
      {performance.reportTypeStats && Object.keys(performance.reportTypeStats).length > 0 && (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
          <h4 className="text-sm font-medium text-white mb-3">{t('mi.byReportType')}</h4>
          <div className="space-y-2">
            {Object.entries(performance.reportTypeStats).map(([type, stats]) => (
              <div key={type} className="flex items-center justify-between text-sm bg-gray-900 rounded p-2">
                <span className="text-gray-300">{t(`mi.reportTypes.${type}`)}</span>
                <div className="flex items-center gap-4">
                  <span className="text-gray-400">
                    {stats.count} {t('mi.reports')}
                  </span>
                  <span className="text-white font-medium">{stats.avgAccuracy}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {performance.recentReports?.length > 0 && (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
          <h4 className="text-sm font-medium text-white mb-3">{t('mi.recentEvaluations')}</h4>
          <div className="space-y-2">
            {performance.recentReports.slice(0, 10).map((r, i) => (
              <div key={i} className="flex items-center justify-between text-sm bg-gray-900 rounded p-2">
                <div className="flex items-center gap-2">
                  <span className="text-gray-300">{t(`mi.reportTypes.${r.reportType}`)}</span>
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded ${TIER_STYLES[r.tier]?.bg} ${TIER_STYLES[r.tier]?.text}`}
                  >
                    {t(`mi.tiers.${r.tier}`)}
                  </span>
                </div>
                <span className="text-white font-medium">{r.forecastAccuracy}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function MarketIntelligencePage() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const [activeTab, setActiveTab] = useState('catalog');
  const [catalog, setCatalog] = useState([]);
  const [reports, setReports] = useState([]);
  const [selectedReport, setSelectedReport] = useState(null);
  const [performance, setPerformance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [purchasing, setPurchasing] = useState(null);
  const [cities, setCities] = useState([]);
  const [selectedCity, setSelectedCity] = useState('');
  const [purchaseForm, setPurchaseForm] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [catalogRes, reportsRes, citiesRes] = await Promise.all([
        api('/market-intelligence/catalog'),
        api('/market-intelligence/reports?status=active&limit=50'),
        api('/cities'),
      ]);
      setCatalog(catalogRes.catalog || []);
      setReports(reportsRes.reports || []);
      setCities(Array.isArray(citiesRes) ? citiesRes : citiesRes.cities || []);

      if (reportsRes.reports?.length > 0) {
        const report = reportsRes.reports[0];
        if (report.currentTick) {
          setReports((prev) => prev.map((r) => ({ ...r, currentTick: report.currentTick })));
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadReports(status = 'active') {
    try {
      const res = await api(`/market-intelligence/reports?status=${status}&limit=50`);
      setReports(res.reports || []);
    } catch (err) {
      setError(err.message);
    }
  }

  async function loadPerformance() {
    try {
      const res = await api('/market-intelligence/performance');
      setPerformance(res.performance || null);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handlePurchase(reportType, tier) {
    const config = catalog.find((c) => c.reportType === reportType);
    if (!config) return;

    if (config.requiresCity && !selectedCity) {
      setError(t('mi.selectCity'));
      return;
    }

    setPurchasing(reportType);
    setError(null);
    try {
      const body = { reportType, tier };
      if (selectedCity) body.cityId = selectedCity;

      const result = await api('/market-intelligence/purchase', {
        method: 'POST',
        body: JSON.stringify(body),
      });

      setReports((prev) => [{ ...result.report, currentTick: result.report.purchasedAtTick }, ...prev]);
      setSelectedReport({ ...result.report, currentTick: result.report.purchasedAtTick });
      setActiveTab('reports');
      useAuthStore.getState().fetchMe();
      setPurchaseForm(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setPurchasing(null);
    }
  }

  function handleTabChange(tab) {
    setActiveTab(tab);
    setSelectedReport(null);
    setPurchaseForm(null);
    setError(null);
    if (tab === 'reports') loadReports('active');
    if (tab === 'performance') loadPerformance();
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-4">
        <div className="text-center py-12 text-gray-400">{t('mi.loading')}</div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4">
      <h1 className="text-3xl font-bold text-white mb-2">{t('mi.title')}</h1>
      <p className="text-gray-400 mb-6">{t('mi.subtitle')}</p>

      {error && (
        <div className="bg-red-900/50 border border-red-800 text-red-300 px-4 py-3 rounded mb-4 text-sm">
          {error}
          <button onClick={() => setError(null)} className="ml-2 text-red-400 hover:text-red-300">
            {t('mi.dismiss')}
          </button>
        </div>
      )}

      <div className="flex gap-1 mb-6 bg-gray-800 rounded-lg p-1">
        {['catalog', 'reports', 'performance'].map((tab) => (
          <button
            key={tab}
            onClick={() => handleTabChange(tab)}
            className={`flex-1 py-2 px-4 rounded text-sm font-medium transition-colors ${
              activeTab === tab ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            {t(`mi.tabs.${tab}`)}
          </button>
        ))}
      </div>

      {activeTab === 'catalog' && (
        <div className="space-y-4">
          {purchaseForm && (
            <PurchaseForm
              key={purchaseForm.reportType}
              reportType={purchaseForm.reportType}
              tierInfo={purchaseForm}
              cities={cities}
              selectedCity={selectedCity}
              onSelectCity={(cityId) => setSelectedCity(cityId)}
              onPurchase={(tier) => handlePurchase(purchaseForm.reportType, tier)}
              onCancel={() => setPurchaseForm(null)}
            />
          )}

          {catalog.map((item) => (
            <div key={item.reportType} className="bg-gray-800 border border-gray-700 rounded-lg p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-lg font-bold text-white">{t(`mi.reportTypes.${item.reportType}`)}</h3>
                  <p className="text-sm text-gray-400 mt-1">{t(`mi.reportDescriptions.${item.reportType}`)}</p>
                </div>
              </div>
              <WhatYouGet reportType={item.reportType} />
              <div className="grid grid-cols-3 gap-2 mt-3 mb-3">
                {['basic', 'advanced', 'premium'].map((tier) => (
                  <div
                    key={tier}
                    className={`rounded p-2 text-center ${TIER_STYLES[tier].bg} border ${TIER_STYLES[tier].border}`}
                  >
                    <div className={`text-xs font-medium ${TIER_STYLES[tier].text}`}>{t(`mi.tiers.${tier}`)}</div>
                    <div className="text-white font-semibold text-sm">${item.costs?.[tier]?.toLocaleString()}</div>
                    <div className="text-xs text-gray-400">
                      {Math.round((item.accuracy?.[tier] || 0) * 100)}% {t('mi.accuracy')}
                    </div>
                  </div>
                ))}
              </div>
              <button
                onClick={() => setPurchaseForm(item)}
                disabled={purchasing === item.reportType}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium py-2 px-4 rounded transition-colors disabled:opacity-50 text-sm"
              >
                {purchasing === item.reportType ? t('mi.purchasing') : t('mi.purchaseReport')}
              </button>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'reports' && !selectedReport && (
        <div className="space-y-4">
          <div className="flex gap-2 mb-4">
            {['active', 'evaluated', 'all'].map((status) => (
              <button
                key={status}
                onClick={() => loadReports(status)}
                className={`px-3 py-1.5 rounded text-sm transition-colors ${
                  status === 'active'
                    ? 'bg-green-900 text-green-300'
                    : status === 'evaluated'
                      ? 'bg-blue-900 text-blue-300'
                      : 'bg-gray-700 text-gray-300'
                }`}
              >
                {t(`mi.status.${status}`)}
              </button>
            ))}
          </div>
          {reports.length === 0 ? (
            <div className="text-center py-12 text-gray-400">{t('mi.noReports')}</div>
          ) : (
            <div className="space-y-2">
              {reports.map((r) => (
                <ReportCard key={r._id} report={r} onClick={setSelectedReport} />
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'reports' && selectedReport && (
        <ReportDetail report={selectedReport} onClose={() => setSelectedReport(null)} />
      )}

      {activeTab === 'performance' && <PerformanceTab performance={performance} />}
    </div>
  );
}
