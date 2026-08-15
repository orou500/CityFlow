import { useCallback, useEffect, useRef, useState } from 'react';
import { getApiBaseUrl } from '../utils/capacitor';

// Single source of truth for the World Reset countdown: the server's
// /world/status endpoint, which derives `nextResetAt` from the same GameState
// tick counter the engine uses to trigger the reset (tick 720). The client
// never calculates the reset itself — it only measures the absolute
// server-provided instant, which makes the countdown timezone-independent.
export function useWorldResetCountdown(intervalMs = 1000) {
  const API = getApiBaseUrl();
  const [nextResetAt, setNextResetAt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const resetAtRef = useRef(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`${API}/world/status`);
      if (res.ok) {
        const data = await res.json();
        if (data.nextResetAt) {
          resetAtRef.current = data.nextResetAt;
          setNextResetAt(data.nextResetAt);
        }
      }
    } catch {
      // Silent — keep showing the previous value; retried on the next tick.
    } finally {
      setLoading(false);
    }
  }, [API]);

  useEffect(() => {
    refresh();
    const id = setInterval(() => {
      const nowMs = Date.now();
      setNow(nowMs);
      const resetMs = resetAtRef.current ? new Date(resetAtRef.current).getTime() : null;
      if (resetMs != null && nowMs >= resetMs) {
        // The countdown reached zero: refetch the world state so the next
        // cycle's reset date is displayed. Never shows negative time.
        refresh();
      }
    }, intervalMs);
    return () => clearInterval(id);
  }, [refresh, intervalMs]);

  const remainingMs = nextResetAt ? Math.max(0, new Date(nextResetAt).getTime() - now) : 0;
  return { nextResetAt, remainingMs, loading };
}
