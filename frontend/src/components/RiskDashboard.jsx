import { useTranslation } from 'react-i18next';

const HAZARD_ICONS = {
  hurricane: '\u{1F300}',
  flood: '\u{1F4A7}',
  earthquake: '\u{1F30A}',
  wildfire: '\u{1F525}',
  storm: '\u{26C8}',
};

const SEVERITY_COLORS = {
  high: 'text-red-400',
  moderate: 'text-yellow-400',
  low: 'text-green-400',
};

export default function RiskDashboard({ riskProfile }) {
  const { t } = useTranslation();

  if (!riskProfile) return null;

  const {
    riskScore,
    riskLabel,
    riskColor,
    growthMultiplier,
    activeHazards,
    potentialHazards,
    riskHistory,
    recentEvents,
    riskLevel,
    factors,
    reductionTips,
  } = riskProfile;

  const growthLabel =
    growthMultiplier < 0.6
      ? 'veryLowGrowth'
      : growthMultiplier < 0.9
        ? 'lowGrowth'
        : growthMultiplier < 1.2
          ? 'moderateGrowth'
          : growthMultiplier < 2.0
            ? 'highGrowth'
            : 'veryHighGrowth';

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 mb-4">
      <h3 className="text-lg font-bold text-white mb-3">{t('propertyRisk.title')}</h3>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-gray-900 rounded p-3">
          <div className="text-gray-400 text-sm mb-1">{t('propertyRisk.riskScore')}</div>
          <div className="text-2xl font-bold" style={{ color: riskColor }}>
            {riskScore}
            <span className="text-sm ml-2 font-normal opacity-80">/ 100</span>
          </div>
        </div>
        <div className="bg-gray-900 rounded p-3">
          <div className="text-gray-400 text-sm mb-1">{t('propertyRisk.riskLevel')}</div>
          <div className="text-lg font-semibold" style={{ color: riskColor }}>
            {t(riskLabel)}
          </div>
        </div>
      </div>

      <div className="mb-4">
        <div className="bg-gray-900 rounded-lg p-3">
          <div className="flex justify-between items-center mb-1">
            <span className="text-gray-400 text-sm">{t('propertyRisk.expectedGrowth')}</span>
            <span
              className={`text-sm font-bold ${riskLevel === 'very_high' || riskLevel === 'high' ? 'text-green-400' : 'text-blue-400'}`}
            >
              {t(`propertyRisk.${growthLabel}`)}
            </span>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-2">
            <div
              className="h-2 rounded-full"
              style={{ width: `${Math.min(100, growthMultiplier * 40)}%`, backgroundColor: riskColor }}
            />
          </div>
        </div>
      </div>

      {factors && factors.length > 0 && (
        <div className="mb-4">
          <h4 className="text-sm font-semibold text-gray-300 mb-2">{t('propertyRisk.riskFactors')}</h4>
          <div className="space-y-1">
            {factors.map((f, i) => (
              <div key={i} className="flex items-center gap-2 text-sm bg-gray-900 rounded px-3 py-2">
                <span>{f.icon}</span>
                <span className="text-white flex-1">{f.label}</span>
                <span className={SEVERITY_COLORS[f.severity] || 'text-gray-400'}>
                  {f.severity === 'high' ? 'High' : f.severity === 'moderate' ? 'Medium' : 'Low'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeHazards && activeHazards.length > 0 && (
        <div className="mb-4">
          <h4 className="text-sm font-semibold text-red-400 mb-2">{t('propertyRisk.activeHazards')}</h4>
          {activeHazards.map((h, i) => (
            <div key={i} className="bg-red-900/30 border border-red-800 rounded p-2 mb-1 text-sm">
              <div className="flex items-center gap-2">
                <span>{HAZARD_ICONS[h.type] || '\u{26A0}'}</span>
                <span className="text-white font-medium">{t(`propertyRisk.hazard.${h.type}`)}</span>
                <span className="ml-auto text-red-300">
                  {t('propertyRisk.severity')}: {h.severity}%
                </span>
              </div>
              {h.remainingTicks > 0 && (
                <div className="text-gray-400 mt-1">
                  {t('propertyRisk.remainingTicks')}: {h.remainingTicks} | {t('propertyRisk.conditionDamage')}:{' '}
                  {h.conditionDamage}%
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {potentialHazards && potentialHazards.length > 0 && !activeHazards?.length && (
        <div className="mb-4">
          <h4 className="text-sm font-semibold text-yellow-400 mb-2">{t('propertyRisk.potentialHazards')}</h4>
          <div className="flex flex-wrap gap-1">
            {potentialHazards.map((h, i) => (
              <span key={i} className="bg-gray-700 text-gray-300 text-xs px-2 py-1 rounded flex items-center gap-1">
                {HAZARD_ICONS[h] || '\u{26A0}'} {t(`propertyRisk.hazard.${h}`)}
              </span>
            ))}
          </div>
        </div>
      )}

      {recentEvents && recentEvents.length > 0 && (
        <div className="mb-4">
          <h4 className="text-sm font-semibold text-gray-300 mb-2">{t('propertyRisk.recentEvents')}</h4>
          {recentEvents.slice(-3).reverse().map((e, i) => (
            <div key={i} className="bg-gray-750 border border-gray-700 rounded p-2 mb-1 text-xs text-gray-400">
              <div>Month {e.tick}: {e.description}</div>
            </div>
          ))}
        </div>
      )}

      {reductionTips && reductionTips.length > 0 && (
        <div className="mb-4">
          <h4 className="text-sm font-semibold text-blue-400 mb-2">{t('propertyRisk.howToReduce')}</h4>
          <div className="space-y-1">
            {reductionTips.map((tip, i) => (
              <div key={i} className="flex items-center gap-2 text-sm bg-gray-900 rounded px-3 py-2">
                <span>{tip.icon}</span>
                <span className="text-gray-300">{tip.action}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {riskHistory && riskHistory.length > 0 && (
        <div className="mb-4">
          <h4 className="text-sm font-semibold text-gray-300 mb-2">{t('propertyRisk.riskHistory')}</h4>
          <div className="flex items-end gap-1 h-12">
            {riskHistory.slice(-24).map((h, i) => {
              const height = (h.riskScore / 100) * 48;
              return (
                <div
                  key={i}
                  className="flex-1 rounded-t opacity-70 hover:opacity-100 cursor-default"
                  style={{ height: `${height}px`, backgroundColor: riskColor }}
                  title={`Month ${h.tick}: ${h.riskScore}`}
                />
              );
            })}
          </div>
        </div>
      )}

      <div className="bg-gray-900/50 border border-gray-700 rounded p-3">
        <div className="text-sm font-semibold text-gray-300 mb-1">{t('propertyRisk.diversificationTip')}</div>
        <div className="text-xs text-gray-500">{t('propertyRisk.diversificationTipText')}</div>
      </div>
    </div>
  );
}
