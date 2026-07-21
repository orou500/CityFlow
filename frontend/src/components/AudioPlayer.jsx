import { useEffect, useRef, useState, useCallback } from 'react';
import { useAudioStore } from '../store/useAudioStore';

function formatTime(s) {
  if (!s || !isFinite(s)) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export default function AudioPlayer() {
  const audioRef = useRef(null);
  const playingRef = useRef(false);
  const [showVolume, setShowVolume] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const progressRef = useRef(null);
  const volumeTimerRef = useRef(null);

  const {
    playing,
    volume,
    muted,
    currentTrackId,
    autoStart,
    play,
    pause,
    togglePlay,
    setVolume: setStoreVolume,
    toggleMute,
    nextTrack,
    prevTrack,
    setAutoStart,
    getCurrentTrack,
    getCurrentPlaylist,
  } = useAudioStore();

  const track = getCurrentTrack();
  const playlist = getCurrentPlaylist();
  const trackIndex = useAudioStore.getState().getTrackIndex();
  const totalTracks = playlist.tracks.length;

  const effectiveVolume = muted ? 0 : volume;
  const progress = duration > 0 ? currentTime / duration : 0;

  const handleTimeUpdate = useCallback(() => {
    const el = audioRef.current;
    if (el) setCurrentTime(el.currentTime);
  }, []);

  const handleLoadedMetadata = useCallback(() => {
    const el = audioRef.current;
    if (el) {
      setDuration(el.duration);
      setCurrentTime(el.currentTime);
    }
  }, []);

  const handleCanPlay = useCallback(() => {
    if (playingRef.current) {
      audioRef.current?.play().catch(() => {});
    }
  }, []);

  const seekTo = useCallback(
    (clientX) => {
      const el = audioRef.current;
      const rect = progressRef.current?.getBoundingClientRect();
      if (!rect || !el) return;
      const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const newTime = x * duration;
      if (isFinite(newTime)) {
        el.currentTime = newTime;
        setCurrentTime(newTime);
      }
    },
    [duration],
  );

  const handleProgressMouseDown = useCallback(
    (e) => {
      e.preventDefault();
      seekTo(e.clientX);
      const rect = progressRef.current?.getBoundingClientRect();
      if (!rect) return;

      const onMove = (ev) => {
        const x = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
        const newTime = x * duration;
        if (isFinite(newTime) && audioRef.current) {
          audioRef.current.currentTime = newTime;
          setCurrentTime(newTime);
        }
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [duration, seekTo],
  );

  const handleVolumeEnter = useCallback(() => {
    if (volumeTimerRef.current) clearTimeout(volumeTimerRef.current);
    setShowVolume(true);
  }, []);

  const handleVolumeLeave = useCallback(() => {
    volumeTimerRef.current = setTimeout(() => {
      setShowVolume(false);
    }, 400);
  }, []);

  useEffect(() => {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title,
        artist: track.artist,
        album: playlist.name,
      });
      navigator.mediaSession.setActionHandler('play', () => play());
      navigator.mediaSession.setActionHandler('pause', () => pause());
      navigator.mediaSession.setActionHandler('previoustrack', () => prevTrack());
      navigator.mediaSession.setActionHandler('nexttrack', () => nextTrack());
    }
  }, [track, playlist]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    el.volume = effectiveVolume;
  }, [effectiveVolume]);

  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);

  useEffect(() => {
    const unsub = useAudioStore.persist.onFinishHydration(() => {
      const state = useAudioStore.getState();
      if (state.autoStart) {
        state.play();
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) {
      if (el.readyState >= 2) {
        el.play().catch(() => {});
      } else {
        el.addEventListener('canplay', handleCanPlay, { once: true });
      }
    } else {
      el.pause();
    }
    return () => {
      el.removeEventListener('canplay', handleCanPlay);
    };
  }, [playing, currentTrackId]);

  useEffect(() => {
    return () => {
      if (volumeTimerRef.current) clearTimeout(volumeTimerRef.current);
    };
  }, []);

  return (
    <div className="border-t border-border pt-2 pb-2 px-2 space-y-1.5 shrink-0">
      <audio
        ref={audioRef}
        src={track.src}
        onEnded={nextTrack}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        preload="auto"
        autoPlay={playing}
      />

      <div className="flex items-center gap-1.5 px-1">
        <svg className="w-3.5 h-3.5 text-muted shrink-0" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
        </svg>
        <span className="text-[10px] text-muted truncate flex-1">{playlist.name}</span>
        <button
          onClick={() => setAutoStart(!autoStart)}
          className={`text-[10px] px-1.5 py-0.5 rounded transition-colors shrink-0 ${
            autoStart
              ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
              : 'bg-gray-100 dark:bg-gray-800 text-muted'
          }`}
          title={autoStart ? 'Auto-play: on' : 'Auto-play: off'}
        >
          Auto
        </button>
      </div>

      <div className="flex items-center gap-1 px-1">
        <span className="text-[11px] text-primary truncate flex-1">{track.title}</span>
        <span className="text-[10px] text-muted shrink-0">
          {trackIndex + 1}/{totalTracks}
        </span>
      </div>

      <div className="flex items-center gap-1.5 px-1">
        <span className="text-[10px] text-muted w-7 text-right tabular-nums shrink-0">{formatTime(currentTime)}</span>
        <div
          ref={progressRef}
          className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden cursor-pointer group relative"
          onMouseDown={handleProgressMouseDown}
        >
          <div className="h-full bg-blue-500 rounded-full transition-none" style={{ width: `${progress * 100}%` }} />
        </div>
        <span className="text-[10px] text-muted w-7 text-left tabular-nums shrink-0">{formatTime(duration)}</span>
      </div>

      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-0.5">
          <button
            onClick={prevTrack}
            className="p-1 text-muted hover:text-primary transition-colors"
            title="Previous track"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
            </svg>
          </button>

          <button
            onClick={togglePlay}
            className="p-1 text-primary hover:text-blue-600 transition-colors"
            title={playing ? 'Pause' : 'Play'}
          >
            {playing ? (
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>

          <button
            onClick={nextTrack}
            className="p-1 text-muted hover:text-primary transition-colors"
            title="Next track"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
            </svg>
          </button>
        </div>

        <div className="relative" onMouseEnter={handleVolumeEnter} onMouseLeave={handleVolumeLeave}>
          <button
            onClick={toggleMute}
            className="p-1 text-muted hover:text-primary transition-colors"
            title={muted ? 'Unmute' : 'Mute'}
          >
            {muted || volume === 0 ? (
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
              </svg>
            ) : volume < 0.5 ? (
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
              </svg>
            )}
          </button>
          {showVolume && (
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-card border border-border rounded-lg shadow-lg p-1.5 z-50 whitespace-nowrap">
              <div className="flex items-center gap-1.5">
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={volume}
                  onChange={(e) => setStoreVolume(parseFloat(e.target.value))}
                  className="w-20 h-1 accent-blue-500 cursor-pointer"
                />
                <span className="text-[10px] text-muted w-8 text-right tabular-nums">{Math.round(volume * 100)}%</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
