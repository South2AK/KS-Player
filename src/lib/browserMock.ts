import type { AppState, KsApi, Playlist, PlaylistData, EpgStatus } from '@shared/types';
import { DEFAULT_SETTINGS } from '@shared/types';
import { parseM3U } from '@shared/m3u';
import { loadXtream, loadXtreamSeriesInfo, loadXtreamVodInfo, xtreamApiUrl, parseAccount, xtreamCatchupUrl } from '@shared/xtream';

/**
 * Browser-only fallback used when the renderer runs outside Electron (e.g. `vite dev` in a browser).
 * Data is kept in localStorage; playlist fetches are subject to CORS.
 */
export function createBrowserMock(): KsApi {
  const LS = 'ks-player';
  const read = <T,>(k: string, fb: T): T => {
    try { const v = localStorage.getItem(`${LS}:${k}`); return v ? (JSON.parse(v) as T) : fb; } catch { return fb; }
  };
  const write = (k: string, v: unknown) => { try { localStorage.setItem(`${LS}:${k}`, JSON.stringify(v)); } catch { /* quota */ } };
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const fetchJson = async (url: string) => {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  };
  const dataCache = new Map<string, PlaylistData>();
  const epgListeners = new Set<(s: EpgStatus) => void>();
  const emptyEpg = (id: string): EpgStatus => ({ playlistId: id, loadedAt: null, channels: 0, programmes: 0, loading: false, error: 'EPG nur in der Desktop-App' });

  return {
    playlists: {
      list: async () => read<Playlist[]>('playlists', []),
      add: async (p) => { const l = read<Playlist[]>('playlists', []); const np = { ...p, id: uid(), createdAt: Date.now() } as Playlist; l.push(np); write('playlists', l); return np; },
      update: async (p) => { const l = read<Playlist[]>('playlists', []); const i = l.findIndex((x) => x.id === p.id); if (i >= 0) l[i] = p; else l.push(p); write('playlists', l); return p; },
      remove: async (id) => { write('playlists', read<Playlist[]>('playlists', []).filter((x) => x.id !== id)); dataCache.delete(id); },
      load: async (id) => {
        const p = read<Playlist[]>('playlists', []).find((x) => x.id === id);
        if (!p) throw new Error('Playlist nicht gefunden');
        const cached = dataCache.get(id);
        if (cached) return cached;
        let data: PlaylistData;
        if (p.type === 'xtream') {
          const r = await loadXtream(p, fetchJson, p.liveFormat || 'ts');
          data = { playlistId: id, channels: r.channels, categories: r.categories, loadedAt: r.loadedAt, epgUrlFromPlaylist: r.epgUrlFromPlaylist };
        } else {
          const r = await fetch(p.url);
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          const parsed = parseM3U(await r.text());
          data = { playlistId: id, channels: parsed.channels, categories: parsed.categories, loadedAt: Date.now(), epgUrlFromPlaylist: parsed.epgUrl };
        }
        dataCache.set(id, data);
        return data;
      },
      xtreamSeriesInfo: async (id, sid) => {
        const p = read<Playlist[]>('playlists', []).find((x) => x.id === id);
        if (!p) throw new Error('Playlist nicht gefunden');
        return loadXtreamSeriesInfo(p, sid, fetchJson);
      },
      xtreamVodInfo: async (id, sid) => {
        const p = read<Playlist[]>('playlists', []).find((x) => x.id === id);
        if (!p) throw new Error('Playlist nicht gefunden');
        return loadXtreamVodInfo(p, sid, fetchJson);
      },
      xtreamAccount: async (id) => {
        const p = read<Playlist[]>('playlists', []).find((x) => x.id === id);
        if (!p) throw new Error('Playlist nicht gefunden');
        return parseAccount(await fetchJson(xtreamApiUrl(p)));
      },
      xtreamCatchupUrl: async (id, sid, start, dur) => {
        const p = read<Playlist[]>('playlists', []).find((x) => x.id === id);
        if (!p) throw new Error('Playlist nicht gefunden');
        return xtreamCatchupUrl(p, sid, start, dur);
      },
    },
    epg: {
      load: async (id) => emptyEpg(id),
      status: async (id) => emptyEpg(id),
      nowNext: async () => ({}),
      range: async () => ({}),
      onStatus: (cb) => { epgListeners.add(cb); return () => epgListeners.delete(cb); },
    },
    state: {
      get: async () => {
        const s = read<Partial<AppState>>('state', {});
        return { favorites: s.favorites || [], history: s.history || [], resume: s.resume || {}, settings: { ...DEFAULT_SETTINGS, ...(s.settings || {}) } };
      },
      set: async (s) => write('state', s),
      exportBackup: async () => {
        const blob = new Blob([JSON.stringify({ version: 1, playlists: read('playlists', []), state: read('state', {}) }, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'ks-player-backup.json';
        a.click();
        return a.download;
      },
      importBackup: async () => null,
    },
    transcode: {
      start: async () => { throw new Error('Transcoding nur in der Desktop-App'); },
      stop: async () => {},
      available: async () => false,
    },
    app: {
      version: async () => 'web',
      openExternal: async (url) => { window.open(url, '_blank'); },
      pickFile: async () => null,
      readTextFile: async () => '',
      setFullscreen: async (on) => { if (on) await document.documentElement.requestFullscreen?.(); else if (document.fullscreenElement) await document.exitFullscreen(); },
      isFullscreen: async () => !!document.fullscreenElement,
      minimize: async () => {},
      maximize: async () => {},
      close: async () => window.close(),
      setAlwaysOnTop: async () => {},
      onFullscreenChange: (cb) => { const h = () => cb(!!document.fullscreenElement); document.addEventListener('fullscreenchange', h); return () => document.removeEventListener('fullscreenchange', h); },
      setAutoStart: async () => {},
      platform: 'web',
      isElectron: false,
    },
  };
}
