import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import playlists from '../data/playlists';

function getInitialPlaylist() {
  return playlists[0]?.id || 'empty';
}

function getInitialTrack(playlistId) {
  const pl = playlists.find((p) => p.id === playlistId);
  const track = pl?.tracks?.[0];
  return track?.id || null;
}

const emptyTrack = { id: null, title: 'No tracks', artist: '', src: '', duration: 0 };
const emptyPlaylist = { id: 'empty', name: 'My Playlist', description: '', icon: '', tracks: [] };

export const useAudioStore = create(
  persist(
    (set, get) => ({
      playing: false,
      volume: 0.5,
      muted: false,
      currentPlaylistId: getInitialPlaylist(),
      currentTrackId: getInitialTrack(getInitialPlaylist()),
      autoStart: true,

      getCurrentPlaylist: () => {
        return playlists.find((p) => p.id === get().currentPlaylistId) || playlists[0] || emptyPlaylist;
      },

      getCurrentTrack: () => {
        const pl = get().getCurrentPlaylist();
        const trackId = get().currentTrackId;
        if (!trackId || !pl.tracks.length) return emptyTrack;
        return pl.tracks.find((t) => t.id === trackId) || pl.tracks[0] || emptyTrack;
      },

      getTrackIndex: () => {
        const pl = get().getCurrentPlaylist();
        return pl.tracks.findIndex((t) => t.id === get().currentTrackId);
      },

      play: () => set({ playing: true }),
      pause: () => set({ playing: false }),
      togglePlay: () => set((s) => ({ playing: !s.playing })),

      setVolume: (volume) => set({ volume: Math.max(0, Math.min(1, volume)), muted: false }),
      toggleMute: () => set((s) => ({ muted: !s.muted })),

      setCurrentPlaylist: (playlistId) => {
        const firstTrack = getInitialTrack(playlistId);
        const isSame = playlistId === get().currentPlaylistId;
        if (!isSame) {
          set({ currentPlaylistId: playlistId, currentTrackId: firstTrack, playing: firstTrack != null });
        }
      },

      nextTrack: () => {
        const { currentPlaylistId } = get();
        const pl = playlists.find((p) => p.id === currentPlaylistId);
        if (!pl || !pl.tracks.length) return;
        const idx = pl.tracks.findIndex((t) => t.id === get().currentTrackId);
        const nextIdx = (idx + 1) % pl.tracks.length;
        set({ currentTrackId: pl.tracks[nextIdx].id, playing: true });
      },

      prevTrack: () => {
        const { currentPlaylistId } = get();
        const pl = playlists.find((p) => p.id === currentPlaylistId);
        if (!pl || !pl.tracks.length) return;
        const idx = pl.tracks.findIndex((t) => t.id === get().currentTrackId);
        const prevIdx = (idx - 1 + pl.tracks.length) % pl.tracks.length;
        set({ currentTrackId: pl.tracks[prevIdx].id, playing: true });
      },

      setAutoStart: (autoStart) => set({ autoStart }),

      getPlaylists: () => playlists,
    }),
    {
      name: 'cityflow-audio',
      partialize: (state) => ({
        volume: state.volume,
        muted: state.muted,
        currentPlaylistId: state.currentPlaylistId,
        currentTrackId: state.currentTrackId,
        autoStart: state.autoStart,
      }),
    },
  ),
);
