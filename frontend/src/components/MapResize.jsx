import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';

/**
 * Keeps the Leaflet map in sync with layout/viewport changes.
 *
 * react-leaflet v4 measures the map container once at mount; if the container
 * is resized afterwards (sidebar toggle animates the layout margin over 300ms,
 * window resized, mobile URL bar shown/hidden, device orientation change) the
 * map tiles and marker positions go stale until invalidateSize() is called.
 * This component observes both the container (ResizeObserver) and the window,
 * debounces the redraw, and cleans up all listeners on unmount (StrictMode-safe).
 */
export default function MapResize({ debounceMs = 150 }) {
  const map = useMap();
  const timerRef = useRef(null);

  useEffect(() => {
    const schedule = () => {
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => map.invalidateSize(), debounceMs);
    };

    const ResizeObserverCtor = typeof ResizeObserver !== 'undefined' ? ResizeObserver : null;
    let observer = null;
    let container = null;
    try {
      container = map.getContainer ? map.getContainer() : null;
    } catch {
      container = null;
    }
    if (container && ResizeObserverCtor) {
      observer = new ResizeObserverCtor(schedule);
      observer.observe(container);
    }

    // Container observation misses whole-viewport changes (window resize,
    // mobile dynamic toolbars, orientation), so listen at the window level too.
    window.addEventListener('resize', schedule);
    window.addEventListener('orientationchange', schedule);

    // Safety net for the mount-time measure (and the delayed 300ms layout
    // animation) even in browsers without a ResizeObserver.
    const settle = setTimeout(schedule, debounceMs);

    return () => {
      clearTimeout(timerRef.current);
      clearTimeout(settle);
      if (observer) {
        observer.disconnect();
        observer = null;
      }
      window.removeEventListener('resize', schedule);
      window.removeEventListener('orientationchange', schedule);
    };
  }, [map, debounceMs]);

  return null;
}
