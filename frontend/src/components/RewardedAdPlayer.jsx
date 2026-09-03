import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getApiBaseUrl } from '../utils/capacitor';
import { parseVast, fireUrl } from '../utils/vastParser';

const API = getApiBaseUrl();

/**
 * RewardedAdPlayer — plays a server-issued rewarded-ad session.
 *
 * The ad source lives server-side: this component only requests
 * `/rewarded-ads/session/:id/vast` (ownership-checked proxy), parses the VAST
 * 3.0 document, plays every Linear creative sequentially (falling back through
 * the media files), fires impression/tracking beacons, and reports completion
 * once every ad has ended. Seeks/skips are not offered; the reward is
 * validated and granted atomically by the backend on completion.
 *
 * Lifecycle safety:
 * - The <video> element is only mounted once a real media src is available, so
 *   it never fires a spurious MEDIA_ERR_SRC_NOT_SUPPORTED on an empty src while
 *   the (async) VAST fetch is still in flight.
 * - Initialization is idempotent per session: React StrictMode (dev) mounts the
 *   component twice, but only the first run actually starts the fetch so the
 *   VAST is never requested twice and the successful result is never cancelled
 *   by a stale cleanup closure.
 */
export default function RewardedAdPlayer({ sessionId, onComplete, onError }) {
  const { t } = useTranslation();
  const videoRef = useRef(null);
  const adsRef = useRef([]);
  const adIndexRef = useRef(0);
  const mediaIndexRef = useRef(0);
  const settledRef = useRef(false);
  const startedRef = useRef(false);
  const srcRef = useRef('');
  const mutedRef = useRef(true);
  const tRef = useRef(t);
  tRef.current = t;

  const [phase, setPhase] = useState('loading');
  const [src, setSrc] = useState('');
  const [adIndex, setAdIndex] = useState(0);
  const [muted, setMuted] = useState(true);
  const [isMuted, setIsMuted] = useState(true);

  const completeFlow = useCallback(() => {
    if (settledRef.current) return;
    settledRef.current = true;
    onComplete?.();
  }, [onComplete]);

  const failFlow = useCallback(
    (message) => {
      if (settledRef.current) return;
      settledRef.current = true;
      setPhase('error');
      onError?.(message);
    },
    [onError],
  );

  const applySrc = useCallback((url) => {
    srcRef.current = url;
    setSrc(url);
  }, []);

  const startAd = useCallback(
    (ad) => {
      if (settledRef.current) return;
      mediaIndexRef.current = 0;
      const media = ad.media[0];
      if (!media) {
        failFlow('NO_MEDIA');
        return;
      }
      applySrc(media.url);
      ad.impressions.forEach(fireUrl);
      (ad.tracking.start || []).forEach(fireUrl);
    },
    [failFlow, applySrc],
  );

  const handleLoadedData = useCallback(() => {
    const video = videoRef.current;
    if (!video || !srcRef.current) return;
    video
      .play()
      .then(() => {
        // sound allowed
        setMuted(false);
        setIsMuted(false);
      })
      .catch(() => {
        // autoplay policy — retry muted so the ad still plays
        if (!mutedRef.current) return;
        video.muted = true;
        setMuted(true);
        setIsMuted(true);
        video.play().catch(() => {});
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleVideoError = useCallback(() => {
    // Ignore media errors raised before a real ad src was assigned (e.g. an
    // empty-<video> element during the async VAST fetch) — there is nothing to
    // fall back to yet, and failures in that window are the fetch's job.
    if (settledRef.current || !srcRef.current) return;

    const ad = adsRef.current[adIndexRef.current];
    if (!ad) {
      failFlow('NO_AD');
      return;
    }
    const next = ad.media[mediaIndexRef.current + 1];
    if (next) {
      mediaIndexRef.current += 1;
      applySrc(next.url);
      return;
    }
    failFlow('MEDIA_ERROR');
  }, [failFlow, applySrc]);

  const handleEnded = useCallback(() => {
    const ad = adsRef.current[adIndexRef.current];
    if (!ad) return;
    (ad.tracking.complete || []).forEach(fireUrl);
    if (adIndexRef.current < adsRef.current.length - 1) {
      adIndexRef.current += 1;
      setAdIndex(adIndexRef.current);
      startAd(adsRef.current[adIndexRef.current]);
    } else {
      completeFlow();
    }
  }, [completeFlow, startAd]);

  const toggleMuted = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const next = !video.muted;
    video.muted = next;
    setIsMuted(next);
  }, []);

  useEffect(() => {
    // Idempotent per session: under React StrictMode (dev) this effect runs,
    // cleans up, then runs again. We only want ONE fetch and ONE success path,
    // and the cleanup must not cancel that single attempt.
    if (startedRef.current || settledRef.current) return;
    startedRef.current = true;

    adsRef.current = [];
    adIndexRef.current = 0;
    mediaIndexRef.current = 0;
    srcRef.current = '';
    setPhase('loading');
    setAdIndex(0);
    setSrc('');

    const token = localStorage.getItem('token');
    const headers = { Accept: 'application/xml, text/xml;q=0.9, */*;q=0.1' };
    if (token) headers.Authorization = `Bearer ${token}`;

    fetch(`${API}/rewarded-ads/session/${sessionId}/vast`, { headers })
      .then(async (res) => {
        if (!res.ok) throw new Error(`VAST status ${res.status}`);
        const xml = await res.text();
        if (settledRef.current) return;
        const ads = parseVast(xml);
        if (ads.length === 0) throw new Error('No ads');
        adsRef.current = ads;
        startAd(ads[0]);
      })
      .catch((err) => {
        if (settledRef.current) return;
        failFlow(tRef.current('rewardedAds.loadFailed'));
      });
    // No cleanup that cancels the in-flight request: the idempotent guard above
    // means the fetch started here is the only one, and finishing it (or never
    // finishing) is safe; a stale success is ignored via settledRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, startAd, failFlow]);

  const renderedPhase = settledRef.current && phase === 'error' ? 'error' : phase;

  return (
    <div
      className="relative w-full overflow-hidden rounded-xl bg-black"
      data-testid="ad-player"
      data-phase={renderedPhase}
    >
      {phase === 'loading' && (
        <div className="flex h-52 items-center justify-center text-sm text-white/70">{t('rewardedAds.loading')}</div>
      )}
      {src ? (
        <video
          key={src}
          ref={videoRef}
          className="w-full"
          style={{ aspectRatio: '16 / 9' }}
          src={src}
          playsInline
          autoPlay
          muted={muted}
          controls={false}
          disablePictureInPicture
          onLoadedData={handleLoadedData}
          onEnded={handleEnded}
          onError={handleVideoError}
        />
      ) : (
        <div className="flex h-52 items-center justify-center text-sm text-white/70">{t('rewardedAds.loading')}</div>
      )}
      {src && adsRef.current.length > 1 && (
        <div className="absolute left-3 top-3 rounded bg-black/60 px-2 py-1 text-xs text-white">
          {adIndex + 1} / {adsRef.current.length}
        </div>
      )}
      {src && (
        <button
          type="button"
          className="absolute bottom-3 right-3 rounded-full bg-black/60 px-3 py-1.5 text-xs text-white"
          onClick={toggleMuted}
        >
          {isMuted ? t('rewardedAds.unmute') : t('rewardedAds.mute')}
        </button>
      )}
    </div>
  );
}
