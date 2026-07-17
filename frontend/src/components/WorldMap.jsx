import { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import L from 'leaflet';
import { formatMoney } from '../utils/format';

function getColor(value) {
  if (value >= 1.5) return '#10b981';
  if (value >= 1.0) return '#f59e0b';
  return '#ef4444';
}

function getEventColor(event) {
  const delta = event.impact?.demandDelta || 0;
  if (delta > 0) return '#10b981';
  if (delta < 0) return '#ef4444';
  return '#f59e0b';
}

function getEventImpactLabel(event) {
  const delta = event.impact?.demandDelta || 0;
  if (delta > 0) return 'positive';
  if (delta < 0) return 'negative';
  return 'neutral';
}

function createCountryIcon(country) {
  const color = getColor(country.avgDemand);
  const { cities } = country;
  return L.divIcon({
    className: '',
    html: `
      <div class="country-pin">
        <div class="country-dot" style="background:${color};box-shadow:0 0 0 3px ${color}33,0 0 12px ${color}44"></div>
        <div class="country-badge">${country.name}</div>
        <div class="country-meta">${cities.length} city${cities.length > 1 ? 's' : ''}</div>
      </div>
    `,
    iconSize: [120, 52],
    iconAnchor: [60, 52],
  });
}

function getEventIcon(event) {
  const color = getEventColor(event);
  return L.divIcon({
    className: '',
    html: `<div class="evt-dot" style="background:${color};box-shadow:0 0 0 2px #fff,0 0 6px ${color}66,0 0 14px ${color}44"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

function FitBounds({ cities }) {
  const map = useMap();
  useEffect(() => {
    if (cities.length > 0) {
      const bounds = L.latLngBounds(cities.map((c) => [c.coordinates.lat, c.coordinates.lng]));
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [cities, map]);
  return null;
}

function CountryPopup({ country, events }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <div className="min-w-[240px] max-w-[280px]">
      <div className="flex items-center gap-2 mb-2 pb-2 border-b border-gray-200 dark:border-gray-700">
        <div className="w-3 h-3 rounded-full shrink-0" style={{ background: getColor(country.avgDemand) }} />
        <h3 className="font-bold text-base text-gray-900 dark:text-white">{country.name}</h3>
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs mb-3">
        <span className="text-gray-500 dark:text-gray-400">{t('map.cities')}:</span>
        <span className="text-gray-800 dark:text-gray-200 font-semibold">{country.cities.length}</span>
        <span className="text-gray-500 dark:text-gray-400">{t('map.population')}:</span>
        <span className="text-gray-800 dark:text-gray-200 font-semibold">
          {country.totalPopulation.toLocaleString()}
        </span>
        <span className="text-gray-500 dark:text-gray-400">{t('map.demand')}:</span>
        <span className="font-semibold" style={{ color: getColor(country.avgDemand) }}>
          {country.avgDemand.toFixed(2)}
        </span>
        <span className="text-gray-500 dark:text-gray-400">{t('map.avgPrice')}:</span>
        <span className="text-gray-800 dark:text-gray-200 font-semibold">{formatMoney(country.avgPrice)}</span>
      </div>

      {events.length > 0 && (
        <div className="mb-3 pb-2 border-b border-gray-200 dark:border-gray-700">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
            {t('map.activeEvents')}
          </p>
          <div className="space-y-1">
            {events.map((evt) => {
              const impact = getEventImpactLabel(evt);
              const impactColor = getEventColor(evt);
              const delta = evt.impact?.demandDelta || 0;
              return (
                <div key={evt._id} className="flex items-center gap-1.5 text-xs">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: impactColor }} />
                  <span className="text-gray-700 dark:text-gray-300 truncate flex-1">{evt.name}</span>
                  {delta !== 0 && (
                    <span className={`font-semibold shrink-0 ${delta > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                      {delta > 0 ? '+' : ''}
                      {delta}%
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
          {t('map.cities')}
        </p>
        <div className="space-y-0.5 max-h-[140px] overflow-y-auto">
          {country.cities.map((city) => (
            <button
              key={city._id}
              onClick={() => navigate(`/city/${city._id}`)}
              className="w-full flex items-center justify-between px-2 py-1 rounded text-xs hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-left"
            >
              <span className="text-gray-700 dark:text-gray-300">{city.name}</span>
              <span className="text-gray-400 dark:text-gray-500">{formatMoney(city.avgPrice)}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function EventPopup({ event, countryName }) {
  const { t } = useTranslation();
  const impact = getEventImpactLabel(event);
  const delta = event.impact?.demandDelta || 0;
  const impactColor = getEventColor(event);
  return (
    <div className="min-w-[230px]">
      <div className="flex items-center gap-2 mb-2 pb-2 border-b border-gray-200 dark:border-gray-700">
        <span
          className="w-3 h-3 rounded-full shrink-0"
          style={{ background: impactColor, boxShadow: `0 0 6px ${impactColor}88` }}
        />
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide font-medium">
            {t('map.activeEvent')}
          </p>
          <h3 className="font-bold text-base text-gray-900 dark:text-white leading-tight">{event.name}</h3>
        </div>
      </div>

      <div className="space-y-1.5 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-gray-400 w-5 shrink-0 text-center">🌍</span>
          <span className="text-gray-700 dark:text-gray-300">{countryName}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-gray-400 w-5 shrink-0 text-center">⚡</span>
          <span className="text-gray-500 dark:text-gray-400">{t('map.impact')}:</span>
          <span
            className={`font-semibold capitalize ${
              impact === 'positive' ? 'text-emerald-600' : impact === 'negative' ? 'text-red-500' : 'text-amber-500'
            }`}
          >
            {impact}
          </span>
        </div>
        {delta !== 0 && (
          <div className="flex items-center gap-2">
            <span className="text-gray-400 w-5 shrink-0 text-center">📈</span>
            <span className="text-gray-500 dark:text-gray-400">{t('map.demand')}:</span>
            <span className={`font-semibold ${delta > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
              {delta > 0 ? '+' : ''}
              {delta}%
            </span>
          </div>
        )}
        {event.impact?.priceMultiplier && event.impact.priceMultiplier !== 1 && (
          <div className="flex items-center gap-2">
            <span className="text-gray-400 w-5 shrink-0 text-center">💰</span>
            <span className="text-gray-500 dark:text-gray-400">{t('map.avgPrice')}:</span>
            <span className={`font-semibold ${event.impact.priceMultiplier > 1 ? 'text-emerald-600' : 'text-red-500'}`}>
              {((event.impact.priceMultiplier - 1) * 100).toFixed(0)}%
            </span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <span className="text-gray-400 w-5 shrink-0 text-center">⏱</span>
          <span className="text-gray-500 dark:text-gray-400">{t('map.duration')}:</span>
          <span className="text-gray-800 dark:text-gray-200 font-semibold">
            {event.remainingTicks} {t('general.periods')}
          </span>
        </div>
      </div>

      {event.description && (
        <p className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
          {event.description}
        </p>
      )}
    </div>
  );
}

export default function WorldMap({ cities, activeEvents = [] }) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const countries = useMemo(() => {
    const map = {};
    cities.forEach((city) => {
      if (!map[city.country]) map[city.country] = [];
      map[city.country].push(city);
    });
    return Object.entries(map).map(([name, cityList]) => ({
      name,
      cities: cityList,
      totalPopulation: cityList.reduce((s, c) => s + (c.population || 0), 0),
      avgDemand: cityList.reduce((s, c) => s + (c.demandIndex || 0), 0) / cityList.length,
      avgPrice: cityList.reduce((s, c) => s + (c.avgPrice || 0), 0) / cityList.length,
      center: {
        lat: cityList.reduce((s, c) => s + c.coordinates.lat, 0) / cityList.length,
        lng: cityList.reduce((s, c) => s + c.coordinates.lng, 0) / cityList.length,
      },
    }));
  }, [cities]);

  const eventsByCountry = useMemo(() => {
    const map = {};
    activeEvents.forEach((event) => {
      let affected = [];
      if (event.type === 'global') {
        affected = countries.map((c) => c.name);
      } else if (event.type === 'local' && event.affectedCities?.length > 0) {
        affected = [...new Set(event.affectedCities.map((c) => c.country).filter(Boolean))];
      }
      affected.forEach((countryName) => {
        if (!map[countryName]) map[countryName] = [];
        map[countryName].push(event);
      });
    });
    return map;
  }, [activeEvents, countries]);

  const eventMarkers = useMemo(() => {
    const markers = [];
    activeEvents.forEach((event) => {
      if (event.type === 'global') {
        countries.forEach((country) => {
          markers.push(
            <Marker
              key={`evt-${event._id}-${country.name}`}
              position={[country.center.lat, country.center.lng]}
              icon={getEventIcon(event)}
            >
              <Popup>
                <EventPopup event={event} countryName={country.name} />
              </Popup>
            </Marker>,
          );
        });
      } else if (event.type === 'local' && event.affectedCities?.length > 0) {
        const seen = new Set();
        event.affectedCities.forEach((city) => {
          if (!city?.country || !city?.coordinates?.lat) return;
          if (seen.has(city.country)) return;
          seen.add(city.country);
          const country = countries.find((c) => c.name === city.country);
          if (!country) return;
          markers.push(
            <Marker
              key={`evt-${event._id}-${country.name}`}
              position={[country.center.lat, country.center.lng]}
              icon={getEventIcon(event)}
            >
              <Popup>
                <EventPopup event={event} countryName={country.name} />
              </Popup>
            </Marker>,
          );
        });
      }
    });
    return markers;
  }, [activeEvents, countries]);

  return (
    <MapContainer center={[20, 0]} zoom={2} className="w-full h-full rounded-lg" scrollWheelZoom={true}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {eventMarkers}
      {countries.map((country) => (
        <Marker
          key={country.name}
          position={[country.center.lat, country.center.lng]}
          icon={createCountryIcon(country)}
          zIndexOffset={1000}
        >
          <Popup>
            <CountryPopup country={country} events={eventsByCountry[country.name] || []} />
          </Popup>
        </Marker>
      ))}
      <FitBounds cities={cities} />
    </MapContainer>
  );
}
