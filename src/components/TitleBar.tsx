import React, { useEffect, useState } from 'react';
import { useStore } from '@/store/app';
import { isElectron } from '@/lib/api';
import { fmtTime } from '@/lib/utils';
import { Icon } from './Icon';

export function TitleBar() {
  const playlists = useStore((s) => s.playlists);
  const active = useStore((s) => s.activePlaylistId);
  const select = useStore((s) => s.selectPlaylist);
  const loading = useStore((s) => s.loading);
  const refreshing = useStore((s) => s.refreshing);
  const settings = useStore((s) => s.settings);
  const setPage = useStore((s) => s.setPage);
  const t = useStore((s) => s.t);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(i);
  }, []);

  return (
    <header className="titlebar">
      <div className="brand"><span className="logo">KS</span> KS Player</div>
      {playlists.length > 0 && (
        <div className="playlist-select">
          <Icon name="layers" size={15} className="muted" />
          <select value={active || ''} onChange={(e) => select(e.target.value || null)} title={t.playlists}>
            {playlists.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {loading || refreshing ? (
            <span className="row small muted2" style={{ gap: 6 }} title={refreshing ? t.refreshing : t.loadingPlaylist}><div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />{refreshing ? t.refreshing : t.loading}</span>
          ) : (
            <button className="iconbtn" style={{ width: 26, height: 26 }} title={t.refresh} onClick={() => useStore.getState().reloadPlaylist()}><Icon name="refresh" size={14} /></button>
          )}
        </div>
      )}
      <button className="btn ghost sm" onClick={() => setPage('search')} title={t.search}><Icon name="search" size={16} />{t.search}</button>
      <div className="spacer" />
      <div className={'clock' + (isElectron() ? '' : ' web')}>{fmtTime(now, settings.timeFormat, settings.language)}</div>
    </header>
  );
}
