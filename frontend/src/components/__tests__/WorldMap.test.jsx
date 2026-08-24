import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom/vitest';
import heJson from '../../i18n/he.json';

const navMock = vi.hoisted(() => vi.fn());
const i18nMock = vi.hoisted(() => ({ t: (key) => key }));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: () => navMock };
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: i18nMock.t }),
}));

vi.mock('react-leaflet', () => {
  const React = require('react');
  const MapContainer = ({ children, className }) =>
    React.createElement('div', { 'data-testid': 'map-container', className }, children);
  const TileLayer = () => React.createElement('div', { 'data-testid': 'tile-layer' });
  const Marker = ({ children, position, icon }) =>
    React.createElement(
      'div',
      {
        'data-testid': 'marker',
        'data-position': JSON.stringify(position),
        'data-icon-html': icon?.options?.html || '',
      },
      children,
    );
  const Popup = ({ children }) => React.createElement('div', { 'data-testid': 'popup' }, children);
  const useMap = () => ({ fitBounds: vi.fn() });
  return { MapContainer, TileLayer, Marker, Popup, useMap };
});

vi.mock('leaflet', () => ({
  default: {
    divIcon: (options) => ({ options }),
    latLngBounds: () => ({ pad: () => {} }),
  },
}));

import WorldMap from '../WorldMap';

function makeCity(overrides = {}) {
  return {
    _id: `city_${Math.random().toString(36).slice(2, 8)}`,
    name: 'Test City',
    country: 'Testland',
    population: 1000000,
    demandIndex: 1.2,
    supplyIndex: 1.0,
    avgPrice: 250000,
    coordinates: { lat: 10, lng: 10 },
    ...overrides,
  };
}

function heT(key) {
  const [ns, sub] = key.split('.');
  if (ns && sub && heJson[ns] && heJson[ns][sub] != null) return heJson[ns][sub];
  return key;
}

const worldCities = [
  makeCity({ name: 'New York', country: 'USA', coordinates: { lat: 40.7128, lng: -74.006 } }),
  makeCity({ name: 'Los Angeles', country: 'USA', coordinates: { lat: 34.0522, lng: -118.2437 } }),
  makeCity({ name: 'Miami', country: 'USA', coordinates: { lat: 25.7617, lng: -80.1918 } }),
  makeCity({ name: 'London', country: 'UK', coordinates: { lat: 51.5074, lng: -0.1278 } }),
  makeCity({ name: 'Paris', country: 'France', coordinates: { lat: 48.8566, lng: 2.3522 } }),
  makeCity({ name: 'Tokyo', country: 'Japan', coordinates: { lat: 35.6762, lng: 139.6503 } }),
  makeCity({ name: 'Tel Aviv', country: 'Israel', coordinates: { lat: 32.0853, lng: 34.7818 } }),
];

function renderMap({ cities = worldCities } = {}) {
  return render(
    <MemoryRouter initialEntries={['/map']}>
      <WorldMap cities={cities} />
    </MemoryRouter>,
  );
}

describe('WorldMap', () => {
  beforeEach(() => {
    navMock.mockClear();
    i18nMock.t = (key) => key;
  });

  it('renders one country marker per unique country (5 for the fixture)', () => {
    renderMap();
    const markers = screen.getAllByTestId('marker');
    const badges = markers.map((m) => (m.dataset.iconHtml.match(/country-badge">([^<]+)</) || [])[1]);
    expect(badges).toEqual(expect.arrayContaining(['USA', 'UK', 'France', 'Japan', 'Israel']));
    expect(markers).toHaveLength(5);
  });

  it('lists every city of a country in its popup and navigates on city click', () => {
    renderMap();
    const usaMarker = screen.getAllByTestId('marker').find((m) => m.dataset.iconHtml.includes('USA'));
    expect(usaMarker).toBeTruthy();

    expect(screen.getAllByText('New York').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Los Angeles').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Miami').length).toBeGreaterThan(0);

    const nyButton = screen.getAllByText('New York')[0].closest('button');
    fireEvent.click(nyButton);
    expect(navMock).toHaveBeenCalledWith(`/city/${worldCities[0]._id}`);
  });

  it('handles a full world dataset (49 cities, 2 countries) without crashing', () => {
    const fullCities = Array.from({ length: 49 }, (_, i) =>
      makeCity({
        name: `City ${i}`,
        country: i % 2 === 0 ? 'Alpha' : 'Beta',
        coordinates: { lat: (i % 90) - 45, lng: (i % 180) - 90 },
      }),
    );
    renderMap({ cities: fullCities });
    expect(screen.getAllByTestId('marker')).toHaveLength(2);
    expect(screen.getAllByText('City 0').length).toBeGreaterThan(0);
  });

  it('displays Hebrew city and country names when translations exist', () => {
    i18nMock.t = heT;
    renderMap();
    const israelMarker = screen
      .getAllByTestId('marker')
      .find((m) => JSON.parse(m.dataset.position)[0] === 32.0853 && JSON.parse(m.dataset.position)[1] === 34.7818);
    expect(israelMarker).toBeTruthy();
    expect(israelMarker.dataset.iconHtml).toContain('ישראל');
    expect(screen.getAllByText('תל אביב').length).toBeGreaterThan(0);
  });

  it('falls back to backend names when no translation exists', () => {
    renderMap();
    const japanMarker = screen.getAllByTestId('marker').find((m) => m.dataset.iconHtml.includes('Japan'));
    expect(japanMarker).toBeTruthy();
    expect(japanMarker.dataset.iconHtml).toContain('Japan');
    expect(screen.getAllByText('Tokyo').length).toBeGreaterThan(0);
  });
});
