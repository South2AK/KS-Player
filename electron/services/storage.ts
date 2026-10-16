import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import type { AppState, Playlist, PlaylistData } from '../../shared/types';
import { DEFAULT_SETTINGS } from '../../shared/types';

function dataDir(): string {
  const d = path.join(app.getPath('userData'), 'ks-data');
  fs.mkdirSync(d, { recursive: true });
  return d;
}

function readJson<T>(file: string, fallback: T): T {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch (e) {
    console.error('[storage] read failed', file, e);
    return fallback;
  }
}

function writeJson(file: string, data: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data));
  fs.renameSync(tmp, file);
}

export const storage = {
  dir: dataDir,

  // ---- playlists ----
  getPlaylists(): Playlist[] {
    return readJson<Playlist[]>(path.join(dataDir(), 'playlists.json'), []);
  },
  savePlaylists(list: Playlist[]): void {
    writeJson(path.join(dataDir(), 'playlists.json'), list);
  },

  // ---- cached playlist content ----
  getPlaylistData(id: string): PlaylistData | null {
    return readJson<PlaylistData | null>(path.join(dataDir(), 'cache', id + '.json'), null);
  },
  savePlaylistData(data: PlaylistData): void {
    writeJson(path.join(dataDir(), 'cache', data.playlistId + '.json'), data);
  },
  removePlaylistData(id: string): void {
    for (const f of [path.join(dataDir(), 'cache', id + '.json'), path.join(dataDir(), 'epg', id + '.json')]) {
      try { fs.unlinkSync(f); } catch { /* ignore */ }
    }
  },

  // ---- epg cache ----
  epgFile(id: string): string {
    return path.join(dataDir(), 'epg', id + '.json');
  },

  // ---- app state ----
  getState(): AppState {
    const s = readJson<Partial<AppState>>(path.join(dataDir(), 'state.json'), {});
    return {
      favorites: s.favorites || [],
      history: s.history || [],
      resume: s.resume || {},
      settings: { ...DEFAULT_SETTINGS, ...(s.settings || {}) },
    };
  },
  saveState(state: AppState): void {
    writeJson(path.join(dataDir(), 'state.json'), state);
  },
};
