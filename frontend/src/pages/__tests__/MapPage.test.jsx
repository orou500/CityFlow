import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const i18nState = vi.hoisted(() => ({ language: 'en' }));

const gameState = vi.hoisted(() => ({
  cities: [],
  activeEvents: [],
  loading: false,
  fetchCities: vi.fn().mockResolvedValue(),
  fetchActiveEvents: vi.fn().mockResolvedValue(),
}));

const worldMapState = vi.hoisted(() => ({ mounts: 0, lastCitiesLength: -1, lastEventsLength: -1 }));

vi.mock('../../store/useGameStore', () => ({
  useGameStore: () => gameState,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key) => key, i18n: i18nState }),
}));

// The map instance — count REAL mounts (effect runs once per mount), never
// re-renders. A regression here would silently reset the camera/tiles.
vi.mock('../../components/WorldMap', () => {
  const React = require('react');
  return {
    default: ({ cities, activeEvents }) => {
      React.useEffect(() => {
        worldMapState.mounts += 1;
        return () => {
          worldMapState.mounts -= 1;
        };
      }, []);
      worldMapState.lastCitiesLength = cities.length;
      worldMapState.lastEventsLength = activeEvents.length;
      return React.createElement('div', {
        'data-testid': 'world-map',
        'data-cities': String(cities.length),
        'data-events': String(activeEvents.length),
      });
    },
  };
});

// Stub the overlay widgets so the test never touches /world/status over the network.
vi.mock('../../components/WorldResetCountdown', () => ({ default: () => null }));
vi.mock('../../components/MapLegend', () => ({ default: () => null }));
vi.mock('../../components/WorldStatusWidget', () => ({ default: () => null }));

import MapPage from '../MapPage';

describe('MapPage', () => {
  beforeEach(() => {
    gameState.cities = [];
    gameState.activeEvents = [];
    gameState.loading = false;
    gameState.fetchCities.mockClear();
    gameState.fetchActiveEvents.mockClear();
    worldMapState.mounts = 0;
    worldMapState.lastCitiesLength = -1;
    worldMapState.lastEventsLength = -1;
  });

  it('fetches cities and active events on mount', () => {
    render(<MapPage />);
    expect(gameState.fetchCities).toHaveBeenCalledTimes(1);
    expect(gameState.fetchActiveEvents).toHaveBeenCalledTimes(1);
  });

  it('keeps exactly one map instance alive across the fetch loading lifecycle', () => {
    const { rerender } = render(<MapPage />);
    expect(worldMapState.mounts).toBe(1);

    // fetchCities flips the shared store `loading` flag while refetching —
    // the fix is that this must NOT unmount/remount Leaflet.
    gameState.loading = true;
    rerender(<MapPage />);
    expect(screen.getByTestId('world-map')).toBeTruthy();
    expect(worldMapState.mounts).toBe(1);

    gameState.cities = [{ _id: 'city_a' }, { _id: 'city_b' }];
    gameState.activeEvents = [{ _id: 'evt_1' }];
    gameState.loading = false;
    rerender(<MapPage />);
    expect(worldMapState.mounts).toBe(1);
    expect(worldMapState.lastCitiesLength).toBe(2);
    expect(worldMapState.lastEventsLength).toBe(1);
  });

  it('shows the loader as an overlay instead of replacing the map', () => {
    const { rerender } = render(<MapPage />);
    gameState.loading = true;
    rerender(<MapPage />);
    // Map AND spinner coexist — nothing was unmounted in favour of the loader.
    expect(screen.getByTestId('world-map')).toBeTruthy();
    expect(screen.getByText('common.loading')).toBeTruthy();

    gameState.loading = false;
    rerender(<MapPage />);
    expect(screen.queryByText('common.loading')).toBeNull();
    expect(screen.getByTestId('world-map')).toBeTruthy();
  });
});
