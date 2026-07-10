import { useTranslation } from 'react-i18next';

export default function MapLegend() {
  const { t } = useTranslation();

  const items = [
    { color: '#10b981', label: t('legend.high'), desc: '\u2265 1.5' },
    { color: '#f59e0b', label: t('legend.medium'), desc: '1.0 \u2013 1.49' },
    { color: '#ef4444', label: t('legend.low'), desc: '< 1.0' },
  ];

  return (
    <div className="absolute bottom-6 right-6 z-10 bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm border border-gray-200 dark:border-gray-700 rounded-lg p-4 min-w-[170px] shadow-xl">
      <h4 className="text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider mb-3">
        {t('legend.title')}
      </h4>
      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.color} className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-full shrink-0"
              style={{ backgroundColor: item.color, border: '2px solid rgba(255,255,255,0.6)' }}
            />
            <div className="text-xs">
              <p className="text-gray-700 dark:text-gray-200 font-medium">{item.label}</p>
              <p className="text-gray-400 dark:text-gray-500">{item.desc}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 space-y-1.5">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-gray-500 shrink-0" />
          <p className="text-xs text-gray-500 dark:text-gray-400">{t('legend.country')}</p>
        </div>
        <div className="flex items-center gap-2">
          <div
            className="w-2.5 h-2.5 rounded-full shrink-0 animate-evt-pulse"
            style={{ backgroundColor: '#f59e0b', border: '1.5px solid rgba(255,255,255,0.7)' }}
          />
          <p className="text-xs text-gray-500 dark:text-gray-400">{t('legend.activeEvent')}</p>
        </div>
        <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">{t('legend.clickHint')}</p>
      </div>
    </div>
  );
}
