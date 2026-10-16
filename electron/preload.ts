import { contextBridge, ipcRenderer } from 'electron';
import type { KsApi, EpgStatus } from '../shared/types';

const inv = (ch: string, ...args: unknown[]) => ipcRenderer.invoke(ch, ...args);

const api: KsApi = {
  playlists: {
    list: () => inv('playlists:list'),
    add: (p) => inv('playlists:add', p),
    update: (p) => inv('playlists:update', p),
    remove: (id) => inv('playlists:remove', id),
    load: (id, force) => inv('playlists:load', id, force),
    xtreamSeriesInfo: (id, sid) => inv('playlists:xtreamSeriesInfo', id, sid),
    xtreamVodInfo: (id, sid) => inv('playlists:xtreamVodInfo', id, sid),
    xtreamAccount: (id) => inv('playlists:xtreamAccount', id),
    xtreamCatchupUrl: (id, sid, start, dur) => inv('playlists:xtreamCatchupUrl', id, sid, start, dur),
  },
  epg: {
    load: (id, force) => inv('epg:load', id, force),
    status: (id) => inv('epg:status', id),
    nowNext: (id, ids) => inv('epg:nowNext', id, ids),
    range: (id, ids, from, to) => inv('epg:range', id, ids, from, to),
    onStatus: (cb) => {
      const h = (_e: unknown, s: EpgStatus) => cb(s);
      ipcRenderer.on('epg:status', h);
      return () => ipcRenderer.off('epg:status', h);
    },
  },
  state: {
    get: () => inv('state:get'),
    set: (s) => inv('state:set', s),
    exportBackup: () => inv('state:exportBackup'),
    importBackup: () => inv('state:importBackup'),
  },
  transcode: {
    start: (url, seek, ua, mode) => inv('transcode:start', url, seek, ua, mode),
    stop: (id) => inv('transcode:stop', id),
    available: () => inv('transcode:available'),
  },
  app: {
    version: () => inv('app:version'),
    openExternal: (url) => inv('app:openExternal', url),
    pickFile: (filters) => inv('app:pickFile', filters),
    readTextFile: (p) => inv('app:readTextFile', p),
    setFullscreen: (on) => inv('app:setFullscreen', on),
    isFullscreen: () => inv('app:isFullscreen'),
    minimize: () => inv('app:minimize'),
    maximize: () => inv('app:maximize'),
    close: () => inv('app:close'),
    setAlwaysOnTop: (on) => inv('app:setAlwaysOnTop', on),
    onFullscreenChange: (cb) => {
      const h = (_e: unknown, on: boolean) => cb(on);
      ipcRenderer.on('app:fullscreen', h);
      return () => ipcRenderer.off('app:fullscreen', h);
    },
    setAutoStart: (on) => inv('app:setAutoStart', on),
    platform: process.platform,
    isElectron: true,
  },
};

contextBridge.exposeInMainWorld('ks', api);
