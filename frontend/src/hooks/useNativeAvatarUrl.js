import { useState, useEffect, useRef } from 'react';
import { isNativePlatform } from '../utils/capacitor';

const blobCache = new Map();

export default function useNativeAvatarUrl(avatarUrl) {
  const [resolvedUrl, setResolvedUrl] = useState(avatarUrl || null);
  const blobUrlRef = useRef(null);

  useEffect(() => {
    if (!avatarUrl || !isNativePlatform()) {
      setResolvedUrl(avatarUrl || null);
      return;
    }

    if (!avatarUrl.startsWith('http://') && !avatarUrl.startsWith('https://')) {
      setResolvedUrl(avatarUrl);
      return;
    }

    if (blobCache.has(avatarUrl)) {
      setResolvedUrl(blobCache.get(avatarUrl));
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(avatarUrl, { redirect: 'follow' });
        if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
        const blob = await res.blob();
        if (cancelled) return;
        const blobUrl = URL.createObjectURL(blob);
        blobCache.set(avatarUrl, blobUrl);
        blobUrlRef.current = blobUrl;
        setResolvedUrl(blobUrl);
      } catch {
        if (!cancelled) setResolvedUrl(avatarUrl);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [avatarUrl]);

  useEffect(() => {
    return () => {
      if (blobUrlRef.current && blobCache.get(avatarUrl) === blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobCache.delete(avatarUrl);
      }
    };
  }, [avatarUrl]);

  return resolvedUrl;
}
