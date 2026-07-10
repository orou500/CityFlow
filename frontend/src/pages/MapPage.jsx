import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useGameStore } from '../store/useGameStore';
import WorldMap from '../components/WorldMap';
import MapLegend from '../components/MapLegend';
import WorldStatusWidget from '../components/WorldStatusWidget';

export default function MapPage() {
  const { t } = useTranslation();
  const { cities, fetchCities, activeEvents, fetchActiveEvents, loading } = useGameStore();

  useEffect(() => {
    fetchCities();
    fetchActiveEvents();
  }, [fetchCities, fetchActiveEvents]);

  return (
    <div className="flex-1 p-4 flex flex-col bg-surface">
      <h1 className="text-2xl font-bold mb-4 text-primary">{t('map.title')}</h1>
      <div className="flex-1 min-h-[500px] bg-card rounded-lg overflow-hidden relative border border-border">
        {loading ? (
          <div className="flex items-center justify-center h-full text-muted">{t('common.loading')}</div>
        ) : (
          <WorldMap cities={cities} activeEvents={activeEvents} />
        )}
        <MapLegend />
        <WorldStatusWidget />
      </div>
    </div>
  );
}
