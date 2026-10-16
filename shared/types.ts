// Shared types between Electron main process and renderer.

export type PlaylistType = 'm3u' | 'xtream' | 'file';
export type ContentKind = 'live' | 'movie' | 'series';

export interface Playlist {
  id: string;
  name: string;
  type: PlaylistType;
  /** M3U URL, local file path, or Xtream server base URL (http://host:port) */
  url: string;
  username?: string;
  password?: string;
  epgUrl?: string;
  userAgent?: string;
  createdAt: number;
  lastLoadedAt?: number;
  /** Xtream account info */
  expiresAt?: number | null;
  maxConnections?: number;
  activeConnections?: number;
  status?: string;
  /** Xtream: live stream container ('ts' | 'm3u8') */
  liveFormat?: 'ts' | 'm3u8';
  autoRefreshHours?: number;
}

export interface Channel {
  id: string;
  name: string;
  url: string;
  logo?: string;
  group: string;
  kind: ContentKind;
  tvgId?: string;
  tvgName?: string;
  number?: number;
  /** Xtream stream id */
  streamId?: number;
  /** Xtream series id */
  seriesId?: number;
  catchupDays?: number;
  catchupSource?: string;
  added?: number;
  ext?: string;
  rating?: string;
  year?: string;
  plot?: string;
  backdrop?: string;
  genre?: string;
  duration?: string;
  /** For M3U series detection: parsed series title, season, episode */
  seriesTitle?: string;
  season?: number;
  episode?: number;
}

export interface Category {
  id: string;
  name: string;
  kind: ContentKind;
  count: number;
}

export interface PlaylistData {
  playlistId: string;
  channels: Channel[];
  categories: Category[];
  loadedAt: number;
  epgUrlFromPlaylist?: string;
}

export interface Programme {
  start: number;
  stop: number;
  title: string;
  desc?: string;
  category?: string;
  icon?: string;
}

export interface EpgStatus {
  playlistId: string;
  loadedAt: number | null;
  channels: number;
  programmes: number;
  loading: boolean;
  error?: string;
  source?: string;
}

export interface Episode {
  id: string;
  title: string;
  season: number;
  episode: number;
  url: string;
  plot?: string;
  duration?: string;
  logo?: string;
  rating?: string;
  added?: number;
  releaseDate?: string;
}

export interface SeriesInfo {
  name: string;
  plot?: string;
  cast?: string;
  director?: string;
  genre?: string;
  releaseDate?: string;
  rating?: string;
  cover?: string;
  backdrop?: string;
  seasons: { season: number; name?: string; episodes: Episode[] }[];
}

export interface VodInfo {
  name: string;
  plot?: string;
  cast?: string;
  director?: string;
  genre?: string;
  releaseDate?: string;
  rating?: string;
  cover?: string;
  backdrop?: string;
  duration?: string;
  url: string;
}

export interface HistoryEntry {
  channelId: string;
  playlistId: string;
  kind: ContentKind;
  name: string;
  logo?: string;
  url: string;
  at: number;
  /** For series episodes */
  seriesId?: string;
  episodeTitle?: string;
}

export interface ResumeEntry {
  position: number;
  duration: number;
  at: number;
}

export interface Settings {
  language: 'de' | 'en';
  theme: 'dark' | 'light' | 'amoled';
  accent: string;
  autoStart: boolean;
  autoPlayLast: boolean;
  liveFormat: 'ts' | 'm3u8';
  autoTranscode: boolean;
  userAgent: string;
  epgOffsetHours: number;
  timeFormat: '24h' | '12h';
  channelSort: 'default' | 'az' | 'za' | 'added';
  vodSort: 'default' | 'az' | 'za' | 'added' | 'rating';
  showChannelNumbers: boolean;
  hideEmptyCategories: boolean;
  confirmExit: boolean;
  bufferSeconds: number;
  hardwareAcceleration: boolean;
  parentalPin: string;
  lockedCategories: string[];
  hiddenCategories: string[];
  lastPlaylistId?: string;
  lastChannelId?: string;
  volume: number;
  muted: boolean;
  aspect: 'contain' | 'cover' | 'fill' | '16:9' | '4:3';
  subtitleSize: number;
  sleepTimerMinutes: number;
}

export interface AppState {
  favorites: string[];
  history: HistoryEntry[];
  resume: Record<string, ResumeEntry>;
  settings: Settings;
}

export const DEFAULT_SETTINGS: Settings = {
  language: 'de',
  theme: 'dark',
  accent: '#7c5cff',
  autoStart: false,
  autoPlayLast: false,
  liveFormat: 'ts',
  autoTranscode: true,
  userAgent: 'KS Player/1.0',
  epgOffsetHours: 0,
  timeFormat: '24h',
  channelSort: 'default',
  vodSort: 'default',
  showChannelNumbers: true,
  hideEmptyCategories: true,
  confirmExit: false,
  bufferSeconds: 10,
  hardwareAcceleration: true,
  parentalPin: '',
  lockedCategories: [],
  hiddenCategories: [],
  volume: 1,
  muted: false,
  aspect: 'contain',
  subtitleSize: 100,
  sleepTimerMinutes: 0,
};

export interface TranscodeSession {
  id: string;
  url: string;
  duration?: number;
}

export interface KsApi {
  playlists: {
    list(): Promise<Playlist[]>;
    add(p: Omit<Playlist, 'id' | 'createdAt'>): Promise<Playlist>;
    update(p: Playlist): Promise<Playlist>;
    remove(id: string): Promise<void>;
    load(id: string, force?: boolean): Promise<PlaylistData>;
    xtreamSeriesInfo(playlistId: string, seriesId: number): Promise<SeriesInfo>;
    xtreamVodInfo(playlistId: string, streamId: number): Promise<VodInfo>;
    xtreamAccount(playlistId: string): Promise<Partial<Playlist>>;
    xtreamCatchupUrl(playlistId: string, streamId: number, startMs: number, durationMin: number): Promise<string>;
  };
  epg: {
    load(playlistId: string, force?: boolean): Promise<EpgStatus>;
    status(playlistId: string): Promise<EpgStatus>;
    nowNext(playlistId: string, channelIds: string[]): Promise<Record<string, [Programme | null, Programme | null]>>;
    range(playlistId: string, channelIds: string[], from: number, to: number): Promise<Record<string, Programme[]>>;
    onStatus(cb: (s: EpgStatus) => void): () => void;
  };
  state: {
    get(): Promise<AppState>;
    set(state: AppState): Promise<void>;
    exportBackup(): Promise<string | null>;
    importBackup(): Promise<AppState | null>;
  };
  transcode: {
    start(url: string, seekSeconds?: number, userAgent?: string, mode?: 'audio' | 'full'): Promise<TranscodeSession>;
    stop(id: string): Promise<void>;
    available(): Promise<boolean>;
  };
  app: {
    version(): Promise<string>;
    openExternal(url: string): Promise<void>;
    pickFile(filters?: { name: string; extensions: string[] }[]): Promise<string | null>;
    readTextFile(path: string): Promise<string>;
    setFullscreen(on: boolean): Promise<void>;
    isFullscreen(): Promise<boolean>;
    minimize(): Promise<void>;
    maximize(): Promise<void>;
    close(): Promise<void>;
    setAlwaysOnTop(on: boolean): Promise<void>;
    onFullscreenChange(cb: (on: boolean) => void): () => void;
    setAutoStart(on: boolean): Promise<void>;
    platform: string;
    isElectron: boolean;
  };
}

declare global {
  interface Window {
    ks?: KsApi;
  }
}
