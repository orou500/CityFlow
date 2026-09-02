import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useGameStore } from '../store/useGameStore';
import WorldMap from '../components/WorldMap';
import MapLegend from '../components/MapLegend';
import WorldStatusWidget from '../components/WorldStatusWidget';
import WorldResetCountdown from '../components/WorldResetCountdown';

export default function MapPage() {
  const { t } = useTranslation();
  const { cities, fetchCities, activeEvents, fetchActiveEvents, loading } = useGameStore();

  useEffect(() => {
    fetchCities();
    fetchActiveEvents();
  }, [fetchCities, fetchActiveEvents]);

  return (
    <div className="flex-1 p-4 flex flex-col min-h-0 bg-surface">
      <h1 className="text-2xl font-bold mb-4 text-primary">{t('map.title')}</h1>
      <div className="mb-3 bg-card rounded-lg border border-border px-5 py-3">
        <WorldResetCountdown />
      </div>
      <div className="flex-1 min-h-0 bg-card rounded-lg overflow-hidden relative border border-border">
        {/* Keep the map mounted across refetches: unmounting/remounting Leaflet
            on every `loading` toggle re-inits the map, resets the camera and
            reloads tiles (double init, blank flash). The loader is an overlay,
            so a single map instance survives the fetch lifecycle. */}
        <WorldMap cities={cities} activeEvents={activeEvents} />
        {loading && (
          <div className="absolute inset-0 z-[500] flex items-center justify-center bg-black/40 text-white">
            {t('common.loading')}
          </div>
        )}
        <MapLegend />
        <WorldStatusWidget />
      </div>
    </div>
  );
}
