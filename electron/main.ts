import { app, BrowserWindow, ipcMain, shell, dialog, session, nativeTheme } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import type { AppState, Playlist, PlaylistData, EpgStatus } from '../shared/types';
import { parseM3U } from '../shared/m3u';
import { loadXtream, loadXtreamSeriesInfo, loadXtreamVodInfo, xtreamApiUrl, parseAccount, xtreamCatchupUrl } from '../shared/xtream';
import { fetchText, fetchJson } from './services/fetch';
import { storage } from './services/storage';
import { loadEpg, epgStatus, epgNowNext, epgRange, setEpgNotifier, dropEpg } from './services/epg';
import { startTranscode, stopTranscode, stopAllTranscodes, getFfmpegPath } from './services/transcode';

const isDev = !!process.env.VITE_DEV_SERVER_URL;
let win: BrowserWindow | null = null;

// ---- Chromium flags ----
app.commandLine.appendSwitch('enable-blink-features', 'AudioVideoTracks');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('disable-features', 'HardwareMediaKeyHandling');
{
  const st = safeState();
  if (!st.settings.hardwareAcceleration) app.disableHardwareAcceleration();
}

function safeState(): AppState {
  try { return storage.getState(); } catch { return { favorites: [], history: [], resume: {}, settings: require('../shared/types').DEFAULT_SETTINGS }; }
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  });
}

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function createWindow() {
  const dark = true;
  nativeTheme.themeSource = 'dark';
  win = new BrowserWindow({
    width: 1400,
    height: 860,
    minWidth: 960,
    minHeight: 600,
    show: false,
    backgroundColor: dark ? '#0b0b10' : '#f5f5fa',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#0b0b10', symbolColor: '#ffffff', height: 40 },
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: false, // IPTV servers rarely send CORS headers
      backgroundThrottling: false,
      spellcheck: false,
    },
  });
  win.setMenuBarVisibility(false);

  if (isDev) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL!);
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
  win.once('ready-to-show', () => win?.show());
  win.on('enter-full-screen', () => win?.webContents.send('app:fullscreen', true));
  win.on('leave-full-screen', () => win?.webContents.send('app:fullscreen', false));
  win.on('closed', () => { win = null; });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  // Dev-only: capture a screenshot after load, then quit (used for automated visual checks)
  if (process.env.KS_SCREENSHOT) {
    const target = process.env.KS_SCREENSHOT;
    const delay = Number(process.env.KS_SCREENSHOT_DELAY || 4000);
    win.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        try {
          if (process.env.KS_SCREENSHOT_JS) {
            await win!.webContents.executeJavaScript(process.env.KS_SCREENSHOT_JS, true);
            await new Promise((r) => setTimeout(r, Number(process.env.KS_SCREENSHOT_JS_WAIT || 8000)));
          }
          const img = await win!.webContents.capturePage();
          fs.writeFileSync(target, img.toPNG());
          console.log('[screenshot] saved', target);
        } catch (e) { console.error('[screenshot] failed', e); }
        if (process.env.KS_SCREENSHOT_QUIT !== '0') app.quit();
      }, delay);
    });
  }
}

function setupSession() {
  const ses = session.defaultSession;
  const uaFor = (url: string): string => {
    const st = safeState();
    try {
      const host = new URL(url).host;
      const pl = storage.getPlaylists().find((p) => p.userAgent && p.url && safeHost(p.url) === host);
      if (pl?.userAgent) return pl.userAgent;
    } catch { /* ignore */ }
    return st.settings.userAgent || 'KS Player/1.0';
  };
  ses.webRequest.onBeforeSendHeaders({ urls: ['http://*/*', 'https://*/*'] }, (details, cb) => {
    const h = details.requestHeaders;
    const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)/i.test(details.url);
    if (!isLocal) {
      h['User-Agent'] = uaFor(details.url);
      delete h['Origin'];
      delete h['Referer'];
      delete h['origin'];
      delete h['referer'];
    }
    cb({ requestHeaders: h });
  });
  ses.webRequest.onHeadersReceived({ urls: ['http://*/*', 'https://*/*'] }, (details, cb) => {
    const h = { ...(details.responseHeaders || {}) };
    for (const k of Object.keys(h)) {
      if (/^access-control-/i.test(k) || /^content-security-policy/i.test(k)) delete h[k];
    }
    h['Access-Control-Allow-Origin'] = ['*'];
    h['Access-Control-Allow-Headers'] = ['*'];
    h['Access-Control-Allow-Methods'] = ['GET, HEAD, OPTIONS'];
    cb({ responseHeaders: h });
  });
  app.on('certificate-error', (event, _wc, _url, _error, _cert, callback) => {
    // Self-signed certificates are common with IPTV providers.
    event.preventDefault();
    callback(true);
  });
}

function safeHost(u: string): string {
  try { return new URL(/^https?:/i.test(u) ? u : 'http://' + u).host; } catch { return ''; }
}

// ---------------- Playlist loading ----------------
async function loadPlaylist(id: string, force: boolean): Promise<PlaylistData> {
  const playlists = storage.getPlaylists();
  const p = playlists.find((x) => x.id === id);
  if (!p) throw new Error('Playlist nicht gefunden');
  // Cached content is returned immediately regardless of age; the renderer refreshes stale data in the background.
  if (!force) {
    const cached = storage.getPlaylistData(id);
    if (cached && cached.channels?.length) return cached;
  }
  let data: PlaylistData;
  const st = safeState();
  if (p.type === 'xtream') {
    const res = await loadXtream(p, fetchJson, p.liveFormat || st.settings.liveFormat);
    data = { playlistId: id, channels: res.channels, categories: res.categories, loadedAt: res.loadedAt, epgUrlFromPlaylist: res.epgUrlFromPlaylist };
    Object.assign(p, res.account);
  } else {
    const text = await fetchText(p.url, p.userAgent);
    const parsed = parseM3U(text);
    if (!parsed.channels.length) throw new Error('Keine Kanäle in der Playlist gefunden');
    data = { playlistId: id, channels: parsed.channels, categories: parsed.categories, loadedAt: Date.now(), epgUrlFromPlaylist: parsed.epgUrl };
  }
  p.lastLoadedAt = Date.now();
  storage.savePlaylists(playlists);
  storage.savePlaylistData(data);
  return data;
}

// ---------------- IPC ----------------
function registerIpc() {
  ipcMain.handle('playlists:list', () => storage.getPlaylists());
  ipcMain.handle('playlists:add', (_e, p: Omit<Playlist, 'id' | 'createdAt'>) => {
    const list = storage.getPlaylists();
    const np: Playlist = { ...p, id: uid(), createdAt: Date.now() };
    list.push(np);
    storage.savePlaylists(list);
    return np;
  });
  ipcMain.handle('playlists:update', (_e, p: Playlist) => {
    const list = storage.getPlaylists();
    const i = list.findIndex((x) => x.id === p.id);
    if (i >= 0) list[i] = { ...list[i], ...p }; else list.push(p);
    storage.savePlaylists(list);
    return list[i >= 0 ? i : list.length - 1];
  });
  ipcMain.handle('playlists:remove', (_e, id: string) => {
    storage.savePlaylists(storage.getPlaylists().filter((x) => x.id !== id));
    storage.removePlaylistData(id);
    dropEpg(id);
  });
  ipcMain.handle('playlists:load', (_e, id: string, force?: boolean) => loadPlaylist(id, !!force));
  ipcMain.handle('playlists:xtreamSeriesInfo', (_e, id: string, seriesId: number) => {
    const p = storage.getPlaylists().find((x) => x.id === id);
    if (!p) throw new Error('Playlist nicht gefunden');
    return loadXtreamSeriesInfo(p, seriesId, fetchJson);
  });
  ipcMain.handle('playlists:xtreamVodInfo', (_e, id: string, streamId: number) => {
    const p = storage.getPlaylists().find((x) => x.id === id);
    if (!p) throw new Error('Playlist nicht gefunden');
    return loadXtreamVodInfo(p, streamId, fetchJson);
  });
  ipcMain.handle('playlists:xtreamAccount', async (_e, id: string) => {
    const list = storage.getPlaylists();
    const p = list.find((x) => x.id === id);
    if (!p) throw new Error('Playlist nicht gefunden');
    const json = await fetchJson(xtreamApiUrl(p), p.userAgent);
    const acc = parseAccount(json);
    Object.assign(p, acc);
    storage.savePlaylists(list);
    return acc;
  });
  ipcMain.handle('playlists:xtreamCatchupUrl', (_e, id: string, streamId: number, startMs: number, durationMin: number) => {
    const p = storage.getPlaylists().find((x) => x.id === id);
    if (!p) throw new Error('Playlist nicht gefunden');
    return xtreamCatchupUrl(p, streamId, startMs, durationMin);
  });

  ipcMain.handle('epg:load', async (_e, playlistId: string, force?: boolean) => {
    const p = storage.getPlaylists().find((x) => x.id === playlistId);
    if (!p) throw new Error('Playlist nicht gefunden');
    const data = storage.getPlaylistData(playlistId);
    if (!data) throw new Error('Playlist zuerst laden');
    const url = p.epgUrl || data.epgUrlFromPlaylist;
    if (!url) return { playlistId, loadedAt: null, channels: 0, programmes: 0, loading: false, error: 'Keine EPG-URL' } as EpgStatus;
    return loadEpg(playlistId, url, data.channels, p.userAgent, !!force);
  });
  ipcMain.handle('epg:status', (_e, playlistId: string) => epgStatus(playlistId));
  ipcMain.handle('epg:nowNext', (_e, playlistId: string, ids: string[]) => epgNowNext(playlistId, ids));
  ipcMain.handle('epg:range', (_e, playlistId: string, ids: string[], from: number, to: number) => epgRange(playlistId, ids, from, to));

  ipcMain.handle('state:get', () => storage.getState());
  ipcMain.handle('state:set', (_e, s: AppState) => storage.saveState(s));
  ipcMain.handle('state:exportBackup', async () => {
    const r = await dialog.showSaveDialog(win!, { defaultPath: 'ks-player-backup.json', filters: [{ name: 'JSON', extensions: ['json'] }] });
    if (r.canceled || !r.filePath) return null;
    const backup = { version: 1, playlists: storage.getPlaylists(), state: storage.getState() };
    fs.writeFileSync(r.filePath, JSON.stringify(backup, null, 2));
    return r.filePath;
  });
  ipcMain.handle('state:importBackup', async () => {
    const r = await dialog.showOpenDialog(win!, { filters: [{ name: 'JSON', extensions: ['json'] }], properties: ['openFile'] });
    if (r.canceled || !r.filePaths[0]) return null;
    const json = JSON.parse(fs.readFileSync(r.filePaths[0], 'utf8'));
    if (Array.isArray(json.playlists)) {
      const cur = storage.getPlaylists();
      for (const p of json.playlists) if (!cur.find((x) => x.id === p.id)) cur.push(p);
      storage.savePlaylists(cur);
    }
    if (json.state) {
      const st = storage.getState();
      const merged: AppState = {
        favorites: [...new Set([...(st.favorites || []), ...(json.state.favorites || [])])],
        history: json.state.history || st.history,
        resume: { ...st.resume, ...(json.state.resume || {}) },
        settings: { ...st.settings, ...(json.state.settings || {}) },
      };
      storage.saveState(merged);
      return merged;
    }
    return storage.getState();
  });

  ipcMain.handle('transcode:start', (_e, url: string, seek?: number, ua?: string, mode?: 'audio' | 'full') => startTranscode(url, seek || 0, ua, mode || 'audio'));
  ipcMain.handle('transcode:stop', (_e, id: string) => stopTranscode(id));
  ipcMain.handle('transcode:available', () => !!getFfmpegPath());

  ipcMain.handle('app:version', () => app.getVersion());
  ipcMain.handle('app:openExternal', (_e, url: string) => shell.openExternal(url));
  ipcMain.handle('app:pickFile', async (_e, filters?: { name: string; extensions: string[] }[]) => {
    const r = await dialog.showOpenDialog(win!, { properties: ['openFile'], filters: filters || [{ name: 'Playlist', extensions: ['m3u', 'm3u8', 'txt'] }] });
    return r.canceled ? null : r.filePaths[0];
  });
  ipcMain.handle('app:readTextFile', (_e, p: string) => fs.promises.readFile(p, 'utf8'));
  ipcMain.handle('app:setFullscreen', (_e, on: boolean) => { win?.setFullScreen(on); });
  ipcMain.handle('app:isFullscreen', () => !!win?.isFullScreen());
  ipcMain.handle('app:minimize', () => win?.minimize());
  ipcMain.handle('app:maximize', () => { if (!win) return; win.isMaximized() ? win.unmaximize() : win.maximize(); });
  ipcMain.handle('app:close', () => win?.close());
  ipcMain.handle('app:setAlwaysOnTop', (_e, on: boolean) => win?.setAlwaysOnTop(on, 'screen-saver'));
  ipcMain.handle('app:setAutoStart', (_e, on: boolean) => app.setLoginItemSettings({ openAtLogin: on, path: process.execPath }));
}

app.whenReady().then(() => {
  setupSession();
  registerIpc();
  setEpgNotifier((s) => win?.webContents.send('epg:status', s));
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => {
  stopAllTranscodes();
  app.quit();
});
app.on('before-quit', () => stopAllTranscodes());
