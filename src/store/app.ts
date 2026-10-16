import { create } from 'zustand';
import type { AppState, Channel, ContentKind, EpgStatus, HistoryEntry, Playlist, PlaylistData, ResumeEntry, Settings } from '@shared/types';
import { DEFAULT_SETTINGS } from '@shared/types';
import { api } from '@/lib/api';
import { engine } from '@/lib/engine';
import { dicts, type Dict, type TKey } from '@/lib/i18n';
import { debounce } from '@/lib/utils';

export type Page = 'home' | 'live' | 'movies' | 'series' | 'favorites' | 'history' | 'epg' | 'search' | 'multiview' | 'playlists' | 'settings';

export interface PlayTarget {
  /** unique key for resume/history (channel id, or 'ep:' + episode id) */
  id: string;
  channelId: string;
  playlistId: string;
  name: string;
  subtitle?: string;
  logo?: string;
  url: string;
  kind: ContentKind;
  live: boolean;
  group?: string;
  seriesKey?: string;
  streamId?: number;
  catchup?: { start: number; end: number; title: string };
  catchupDays?: number;
}

export interface Toast { id: number; text: string; kind: 'info' | 'error' | 'success' }

export interface DetailTarget {
  kind: 'movie' | 'series';
  channel: Channel;
  /** M3U series: all episodes */
  episodes?: Channel[];
}

interface Store {
  ready: boolean;
  playlists: Playlist[];
  activePlaylistId: string | null;
  data: PlaylistData | null;
  loading: boolean;
  loadError: string | null;
  /** background refresh of the active playlist in progress */
  refreshing: boolean;
  favorites: string[];
  history: HistoryEntry[];
  resume: Record<string, ResumeEntry>;
  settings: Settings;
  epg: EpgStatus | null;
  page: Page;
  liveCategory: string | string[] | null;
  movieCategory: string | string[] | null;
  seriesCategory: string | string[] | null;
  current: PlayTarget | null;
  playerView: 'inline' | 'full';
  zapList: string[];
  unlocked: string[];
  toasts: Toast[];
  pinPrompt: { title: string; resolve: (ok: boolean) => void } | null;
  detail: DetailTarget | null;
  fullscreen: boolean;
  transcodeAvailable: boolean;
  sleepUntil: number | null;

  t: Dict;
  init(): Promise<void>;
  setPage(p: Page): void;
  selectPlaylist(id: string | null, force?: boolean): Promise<void>;
  reloadPlaylist(): Promise<void>;
  refreshPlaylist(id: string, silent?: boolean): Promise<void>;
  addPlaylist(p: Omit<Playlist, 'id' | 'createdAt'>): Promise<Playlist>;
  updatePlaylist(p: Playlist): Promise<void>;
  removePlaylist(id: string): Promise<void>;
  loadEpg(force?: boolean): Promise<void>;
  toggleFavorite(channelId: string): void;
  isFavorite(channelId: string): boolean;
  setResume(id: string, entry: ResumeEntry | null): void;
  clearHistory(): void;
  updateSettings(patch: Partial<Settings>): void;
  play(target: PlayTarget, zapList?: string[], view?: 'inline' | 'full'): Promise<void>;
  playChannel(ch: Channel, zapList?: string[], view?: 'inline' | 'full'): Promise<void>;
  zap(delta: number): void;
  zapTo(number: number): void;
  stop(): void;
  setPlayerView(v: 'inline' | 'full'): void;
  toast(text: string, kind?: Toast['kind']): void;
  dismissToast(id: number): void;
  requestPin(title?: string): Promise<boolean>;
  resolvePin(ok: boolean): void;
  ensureUnlocked(categoryId: string): Promise<boolean>;
  isLocked(categoryId: string): boolean;
  openDetail(d: DetailTarget | null): void;
  setSleep(minutes: number): void;
}

let toastId = 0;
let epgUnsub: (() => void) | null = null;

export const useStore = create<Store>((set, get) => {
  const persist = debounce(() => {
    const s = get();
    const st: AppState = { favorites: s.favorites, history: s.history, resume: s.resume, settings: s.settings };
    api().state.set(st).catch(() => {});
  }, 400);

  return {
    ready: false,
    playlists: [],
    activePlaylistId: null,
    data: null,
    loading: false,
    loadError: null,
    refreshing: false,
    favorites: [],
    history: [],
    resume: {},
    settings: DEFAULT_SETTINGS,
    epg: null,
    page: 'home',
    liveCategory: null,
    movieCategory: null,
    seriesCategory: null,
    current: null,
    playerView: 'inline',
    zapList: [],
    unlocked: [],
    toasts: [],
    pinPrompt: null,
    detail: null,
    fullscreen: false,
    transcodeAvailable: false,
    sleepUntil: null,
    t: dicts.de,

    async init() {
      const a = api();
      const [state, playlists, transcodeAvailable] = await Promise.all([a.state.get(), a.playlists.list(), a.transcode.available().catch(() => false)]);
      const settings = { ...DEFAULT_SETTINGS, ...state.settings };
      set({ favorites: state.favorites, history: state.history, resume: state.resume, settings, playlists, t: dicts[settings.language] || dicts.de, transcodeAvailable, ready: true });
      applyTheme(settings);
      engine.setVolume(settings.volume);
      engine.setMuted(settings.muted);
      a.app.onFullscreenChange((on) => set({ fullscreen: on }));
      if (epgUnsub) epgUnsub();
      epgUnsub = a.epg.onStatus((s) => { if (s.playlistId === get().activePlaylistId) set({ epg: s }); });
      const lastId = settings.lastPlaylistId && playlists.find((p) => p.id === settings.lastPlaylistId) ? settings.lastPlaylistId : playlists[0]?.id;
      if (lastId) {
        set({ page: 'live' });
        await get().selectPlaylist(lastId);
        if (settings.autoPlayLast && settings.lastChannelId) {
          const ch = get().data?.channels.find((c) => c.id === settings.lastChannelId);
          if (ch && ch.kind === 'live') get().playChannel(ch, undefined, 'inline');
        }
      } else {
        set({ page: 'playlists' });
      }
      // Periodic background refresh of the active playlist (checked every 10 minutes)
      setInterval(() => {
        const s = get();
        const p = s.playlists.find((x) => x.id === s.activePlaylistId);
        if (!p || !s.data || s.refreshing || s.loading) return;
        const ttl = (p.autoRefreshHours ?? 12) * 3600_000;
        if (Date.now() - s.data.loadedAt > ttl) s.refreshPlaylist(p.id, true);
      }, 10 * 60_000);
    },

    setPage(page) {
      const s = get();
      // The inline preview only lives on the Live page: stop it when navigating elsewhere (except into full view).
      if (page !== 'live' && s.current && s.playerView === 'inline') s.stop();
      set({ page });
    },

    async selectPlaylist(id, force = false) {
      if (!id) { set({ activePlaylistId: null, data: null, epg: null }); return; }
      set({ activePlaylistId: id, loading: true, loadError: null, epg: null });
      get().updateSettings({ lastPlaylistId: id });
      try {
        // Returns the locally cached playlist instantly when one exists (only a first load hits the network).
        const data = await api().playlists.load(id, force);
        if (get().activePlaylistId !== id) return;
        const playlists = await api().playlists.list();
        set({ data, loading: false, playlists, liveCategory: null, movieCategory: null, seriesCategory: null });
        get().loadEpg(false);
        const p = playlists.find((x) => x.id === id);
        const ttl = ((p?.autoRefreshHours ?? 12) * 3600_000);
        if (!force && Date.now() - data.loadedAt > ttl) get().refreshPlaylist(id, true);
      } catch (e: any) {
        set({ loading: false, loadError: e?.message || String(e) });
      }
    },

    async reloadPlaylist() {
      const id = get().activePlaylistId;
      if (id) await get().refreshPlaylist(id, false);
    },

    /** Re-downloads the playlist in the background and swaps the data in place; the UI keeps working meanwhile. */
    async refreshPlaylist(id, silent = true) {
      if (get().refreshing) return;
      if (!get().data) { await get().selectPlaylist(id, true); return; }
      set({ refreshing: true });
      try {
        const data = await api().playlists.load(id, true);
        if (get().activePlaylistId !== id) return;
        const playlists = await api().playlists.list();
        set({ data, playlists, loadError: null });
        get().loadEpg(false);
        if (!silent) get().toast(get().t.refreshDone, 'success');
      } catch (e: any) {
        if (!silent) get().toast(`${get().t.refreshFailed}: ${e?.message || e}`, 'error');
        else console.warn('[playlist] background refresh failed', e);
      } finally {
        set({ refreshing: false });
      }
    },

    async addPlaylist(p) {
      const np = await api().playlists.add(p);
      set({ playlists: [...get().playlists, np] });
      return np;
    },
    async updatePlaylist(p) {
      await api().playlists.update(p);
      set({ playlists: get().playlists.map((x) => (x.id === p.id ? p : x)) });
    },
    async removePlaylist(id) {
      await api().playlists.remove(id);
      const playlists = get().playlists.filter((x) => x.id !== id);
      set({ playlists });
      if (get().activePlaylistId === id) {
        get().stop();
        await get().selectPlaylist(playlists[0]?.id || null);
        if (!playlists.length) set({ page: 'playlists' });
      }
    },

    async loadEpg(force = false) {
      const id = get().activePlaylistId;
      if (!id) return;
      try {
        const status = await api().epg.status(id);
        set({ epg: status });
        if (force || !status.loadedAt || Date.now() - status.loadedAt > 12 * 3600_000) {
          const s = await api().epg.load(id, force);
          if (get().activePlaylistId === id) set({ epg: s });
        }
      } catch (e: any) {
        set({ epg: { playlistId: id, loadedAt: null, channels: 0, programmes: 0, loading: false, error: e?.message } });
      }
    },

    toggleFavorite(channelId) {
      const favs = get().favorites;
      set({ favorites: favs.includes(channelId) ? favs.filter((f) => f !== channelId) : [...favs, channelId] });
      persist();
    },
    isFavorite(channelId) { return get().favorites.includes(channelId); },

    setResume(id, entry) {
      const resume = { ...get().resume };
      if (entry) resume[id] = entry; else delete resume[id];
      set({ resume });
      persist();
    },
    clearHistory() { set({ history: [] }); persist(); },

    updateSettings(patch) {
      const settings = { ...get().settings, ...patch };
      set({ settings, t: dicts[settings.language] || dicts.de });
      applyTheme(settings);
      persist();
    },

    async play(target, zapList, view) {
      const s = get();
      const ua = s.playlists.find((p) => p.id === target.playlistId)?.userAgent || s.settings.userAgent;
      const startAt = !target.live && s.resume[target.id] ? s.resume[target.id].position : 0;
      const nextView = view || (target.live ? s.playerView : 'full');
      set({ current: target, playerView: nextView, zapList: zapList || (target.live ? s.zapList : []) });
      if (target.live && target.kind === 'live') get().updateSettings({ lastChannelId: target.channelId });
      // history
      const entry: HistoryEntry = {
        channelId: target.channelId, playlistId: target.playlistId, kind: target.kind, name: target.name, logo: target.logo, url: target.url, at: Date.now(),
        seriesId: target.seriesKey, episodeTitle: target.subtitle,
      };
      const history = [entry, ...s.history.filter((h) => !(h.channelId === target.channelId && h.episodeTitle === target.subtitle))].slice(0, 200);
      set({ history });
      persist();
      await engine.play({ url: target.url, live: target.live, startAt, userAgent: ua, allowTranscode: s.settings.autoTranscode, bufferSeconds: s.settings.bufferSeconds });
    },

    async playChannel(ch, zapList, view) {
      const s = get();
      if (!s.activePlaylistId) return;
      const catId = ch.kind + '|' + ch.group;
      if (s.isLocked(catId) && !(await s.ensureUnlocked(catId))) return;
      await s.play({
        id: ch.id, channelId: ch.id, playlistId: s.activePlaylistId, name: ch.name, logo: ch.logo, url: ch.url, kind: ch.kind,
        live: ch.kind === 'live', group: ch.group, streamId: ch.streamId, catchupDays: ch.catchupDays,
      }, zapList, view);
    },

    zap(delta) {
      const s = get();
      if (!s.current || !s.current.live || !s.data) return;
      const list = s.zapList.length ? s.zapList : s.data.channels.filter((c) => c.kind === 'live').map((c) => c.id);
      const idx = list.indexOf(s.current.channelId);
      if (idx < 0) return;
      const next = list[(idx + delta + list.length) % list.length];
      const ch = s.data.channels.find((c) => c.id === next);
      if (ch) s.playChannel(ch, list, s.playerView);
    },
    zapTo(number) {
      const s = get();
      if (!s.data) return;
      const ch = s.data.channels.find((c) => c.kind === 'live' && c.number === number);
      if (ch) s.playChannel(ch, undefined, s.playerView);
      else s.toast(`${s.t.channelNumberInput} ${number}: ${s.t.noResults}`, 'error');
    },

    stop() {
      engine.stop();
      set({ current: null, playerView: 'inline' });
    },
    setPlayerView(v) { set({ playerView: v }); },

    toast(text, kind = 'info') {
      const id = ++toastId;
      set({ toasts: [...get().toasts, { id, text, kind }] });
      setTimeout(() => get().dismissToast(id), kind === 'error' ? 6000 : 3500);
    },
    dismissToast(id) { set({ toasts: get().toasts.filter((t) => t.id !== id) }); },

    requestPin(title) {
      return new Promise<boolean>((resolve) => {
        set({ pinPrompt: { title: title || get().t.enterPin, resolve } });
      });
    },
    resolvePin(ok) {
      const p = get().pinPrompt;
      set({ pinPrompt: null });
      p?.resolve(ok);
    },
    isLocked(categoryId) {
      const s = get();
      return !!s.settings.parentalPin && s.settings.lockedCategories.includes(categoryId) && !s.unlocked.includes(categoryId);
    },
    async ensureUnlocked(categoryId) {
      const s = get();
      if (!s.isLocked(categoryId)) return true;
      const ok = await s.requestPin();
      if (ok) set({ unlocked: [...get().unlocked, categoryId] });
      return ok;
    },

    openDetail(d) { set({ detail: d }); },

    setSleep(minutes) {
      set({ sleepUntil: minutes > 0 ? Date.now() + minutes * 60_000 : null });
      get().updateSettings({ sleepTimerMinutes: minutes });
    },
  };
});

export function applyTheme(s: Settings) {
  const root = document.documentElement;
  root.dataset.theme = s.theme;
  root.style.setProperty('--accent', s.accent);
  root.style.setProperty('--accent-rgb', hexToRgb(s.accent));
  root.style.setProperty('--sub-size', `${s.subtitleSize}%`);
  root.lang = s.language;
}

function hexToRgb(hex: string): string {
  const m = hex.replace('#', '');
  const n = parseInt(m.length === 3 ? m.split('').map((c) => c + c).join('') : m, 16);
  if (isNaN(n)) return '124, 92, 255';
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

export const useT = () => useStore((s) => s.t);
export type { TKey };
