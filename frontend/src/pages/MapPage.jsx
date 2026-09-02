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

  // Expose the Leaflet instance for debugging and tests (reads camera state).
  const handleMapCreated = (map) => {
    window.__cfMap = map;
  };

  return (
    <div className="flex-1 p-4 [@media(max-height:480px)]:p-2 flex flex-col min-h-0 bg-surface">
      <h1 className="text-2xl font-bold mb-4 text-primary [@media(max-height:480px)]:text-lg [@media(max-height:480px)]:mb-1.5">
        {t('map.title')}
      </h1>
      <div className="mb-3 [@media(max-height:480px)]:mb-1.5 [@media(max-height:480px)]:py-1 [@media(max-height:480px)]:px-3 bg-card rounded-lg border border-border px-5 py-3">
        <WorldResetCountdown />
      </div>
      <div className="flex-1 min-h-0 bg-card rounded-lg overflow-hidden relative border border-border">
        {/* Keep the map mounted across refetches: unmounting/remounting Leaflet
            on every `loading` toggle re-inits the map, resets the camera and
            reloads tiles (double init, blank flash). The loader is an overlay,
            so a single map instance survives the fetch lifecycle. */}
        <WorldMap cities={cities} activeEvents={activeEvents} onMapCreated={handleMapCreated} />
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
