import React, { useState } from 'react';
import type { Playlist, PlaylistType } from '@shared/types';
import { useStore } from '@/store/app';
import { api, isElectron } from '@/lib/api';
import { Icon } from '@/components/Icon';
import { Modal } from '@/components/Modal';
import { fmtDate, fmtDateTime } from '@/lib/utils';
import { parseXtreamUrl } from '@shared/xtream';

type Form = { name: string; type: PlaylistType; url: string; username: string; password: string; epgUrl: string; userAgent: string; liveFormat: 'ts' | 'm3u8'; autoRefreshHours: number };
const empty: Form = { name: '', type: 'm3u', url: '', username: '', password: '', epgUrl: '', userAgent: '', liveFormat: 'ts', autoRefreshHours: 12 };

export function PlaylistsPage() {
  const t = useStore((s) => s.t);
  const playlists = useStore((s) => s.playlists);
  const activeId = useStore((s) => s.activePlaylistId);
  const data = useStore((s) => s.data);
  const loading = useStore((s) => s.loading);
  const loadError = useStore((s) => s.loadError);
  const refreshing = useStore((s) => s.refreshing);
  const settings = useStore((s) => s.settings);
  const [editing, setEditing] = useState<Playlist | 'new' | null>(null);
  const [confirm, setConfirm] = useState<Playlist | null>(null);
  const store = useStore.getState;

  return (
    <div className="page">
      <div className="page-header">
        <h1>{t.playlists}</h1>
        <div className="grow" />
        <button className="btn primary" onClick={() => setEditing('new')}><Icon name="plus" size={16} />{t.addPlaylist}</button>
      </div>
      <div className="page-body">
        {playlists.length === 0 ? (
          <div className="empty" style={{ paddingTop: 100 }}>
            <Icon name="layers" size={48} className="ico" /><h3>{t.noPlaylists}</h3><p>{t.noPlaylistsHint}</p>
            <button className="btn primary" onClick={() => setEditing('new')}><Icon name="plus" size={16} />{t.addPlaylist}</button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {playlists.map((p) => {
              const active = p.id === activeId;
              return (
                <div key={p.id} className="card pl-card" style={active ? { borderColor: 'rgba(var(--accent-rgb), 0.6)' } : undefined}>
                  <div className="ico"><Icon name={p.type === 'xtream' ? 'server' : p.type === 'file' ? 'folder' : 'link'} size={22} /></div>
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="row"><span className="name">{p.name}</span>{active && <span className="chip accent">{t.active}</span>}</div>
                    <div className="url ellipsis">{p.type === 'xtream' ? `${p.url} · ${p.username}` : p.url}</div>
                    <div className="stats">
                      {active && data && !loading && <span className="chip">{data.channels.length} {t.items}</span>}
                      {active && loading && <span className="chip"><div className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} />{t.loadingPlaylist}</span>}
                      {active && refreshing && <span className="chip"><div className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} />{t.refreshing}</span>}
                      {active && loadError && <span className="chip" style={{ color: 'var(--danger)' }}>{loadError}</span>}
                      {p.type === 'xtream' && <span className="chip"><Icon name="clock" size={12} />{t.expires}: {p.expiresAt ? fmtDate(p.expiresAt, settings.language) : t.neverExpires}</span>}
                      {p.type === 'xtream' && p.maxConnections !== undefined && <span className="chip">{t.connections}: {p.activeConnections ?? 0}/{p.maxConnections}</span>}
                      {p.type === 'xtream' && p.status && <span className="chip">{p.status}</span>}
                      <span className="chip">{t.lastUpdate}: {p.lastLoadedAt ? fmtDateTime(p.lastLoadedAt, settings.language) : t.never}</span>
                    </div>
                  </div>
                  {!active && <button className="btn sm" onClick={() => store().selectPlaylist(p.id)}>{t.activate}</button>}
                  {active && <button className="btn sm" onClick={() => store().reloadPlaylist()} disabled={loading || refreshing}><Icon name="refresh" size={14} />{t.refresh}</button>}
                  <button className="iconbtn" onClick={() => setEditing(p)} title={t.edit}><Icon name="edit" /></button>
                  <button className="iconbtn danger" onClick={() => setConfirm(p)} title={t.delete}><Icon name="trash" /></button>
                </div>
              );
            })}
          </div>
        )}
      </div>
      {editing && <PlaylistForm initial={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {confirm && (
        <Modal title={t.delete} onClose={() => setConfirm(null)} footer={<><button className="btn" onClick={() => setConfirm(null)}>{t.cancel}</button><button className="btn danger" onClick={async () => { await store().removePlaylist(confirm.id); setConfirm(null); }}>{t.delete}</button></>}>
          <div>{t.deletePlaylistConfirm}</div><div className="muted2">{confirm.name}</div>
        </Modal>
      )}
    </div>
  );
}

function PlaylistForm({ initial, onClose }: { initial: Playlist | null; onClose: () => void }) {
  const t = useStore((s) => s.t);
  const [f, setF] = useState<Form>(initial ? { ...empty, name: initial.name, type: initial.type, url: initial.url, username: initial.username || '', password: initial.password || '', epgUrl: initial.epgUrl || '', userAgent: initial.userAgent || '', liveFormat: initial.liveFormat || 'ts', autoRefreshHours: initial.autoRefreshHours ?? 12 } : empty);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (patch: Partial<Form>) => setF((x) => ({ ...x, ...patch }));

  const pickFile = async () => {
    const p = await api().app.pickFile();
    if (p) set({ url: p, name: f.name || p.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') || '' });
  };

  const detected = f.type === 'm3u' ? parseXtreamUrl(f.url) : null;
  const valid = f.name.trim() && f.url.trim() && (f.type !== 'xtream' || (f.username.trim() && f.password.trim()));
  const save = async () => {
    if (!valid) return;
    setBusy(true); setErr(null);
    const st = useStore.getState();
    const payload = {
      name: f.name.trim(), type: f.type, url: f.url.trim(), username: f.type === 'xtream' ? f.username.trim() : undefined, password: f.type === 'xtream' ? f.password : undefined,
      epgUrl: f.epgUrl.trim() || undefined, userAgent: f.userAgent.trim() || undefined, liveFormat: f.type === 'xtream' ? f.liveFormat : undefined, autoRefreshHours: f.autoRefreshHours,
    };
    try {
      if (initial) {
        await st.updatePlaylist({ ...initial, ...payload });
        if (st.activePlaylistId === initial.id) st.refreshPlaylist(initial.id, false);
      } else {
        const np = await st.addPlaylist(payload);
        await st.selectPlaylist(np.id, true);
        const after = useStore.getState();
        if (after.loadError) { setErr(after.loadError); setBusy(false); return; }
        st.setPage('live');
      }
      onClose();
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally { setBusy(false); }
  };

  return (
    <Modal title={initial ? t.editPlaylist : t.addPlaylist} onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>{t.cancel}</button>
      <button className="btn primary" onClick={save} disabled={!valid || busy}>{busy ? <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2, borderTopColor: '#fff' }} /> : <Icon name="check" size={16} />}{t.save}</button>
    </>}>
      <div className="tabs">
        {(['m3u', 'xtream', 'file'] as PlaylistType[]).map((tp) => <button key={tp} className={f.type === tp ? 'active' : ''} onClick={() => set({ type: tp })} disabled={!!initial}>{tp === 'm3u' ? t.m3uUrl : tp === 'xtream' ? t.xtream : t.localFile}</button>)}
      </div>
      <div className="field"><label>{t.playlistName}</label><input className="input" value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="Meine Playlist" autoFocus /></div>
      {f.type === 'm3u' && (
        <div className="field"><label>{t.m3uUrl}</label>
          <input className="input" value={f.url} onChange={(e) => set({ url: e.target.value })} placeholder="http://server/get.php?username=…&password=…&type=m3u_plus" />
          {detected ? (
            <div className="row" style={{ marginTop: 4 }}>
              <span className="chip accent"><Icon name="server" size={12} />{t.xtreamDetected}</span>
              <button className="btn sm" onClick={() => set({ type: 'xtream', url: detected.server, username: detected.username, password: detected.password, name: f.name || detected.server.replace(/^https?:\/\//, '') })}><Icon name="check" size={14} />{t.useAsXtream}</button>
            </div>
          ) : <span className="hint">{t.m3uHint}</span>}
        </div>
      )}
      {f.type === 'file' && (
        <div className="field"><label>{t.localFile}</label>
          <div className="row"><input className="input" value={f.url} onChange={(e) => set({ url: e.target.value })} placeholder="C:\…\playlist.m3u" />{isElectron() && <button className="btn" onClick={pickFile}><Icon name="folder" size={16} />{t.chooseFile}</button>}</div>
        </div>
      )}
      {f.type === 'xtream' && (<>
        <div className="field"><label>{t.serverUrl}</label><input className="input" value={f.url} onChange={(e) => { const d = parseXtreamUrl(e.target.value); if (d && (e.target.value.includes('?') || /\/(live|movie|series)\//i.test(e.target.value))) set({ url: d.server, username: d.username, password: d.password }); else set({ url: e.target.value }); }} placeholder="http://host:8080" /><span className="hint">{t.m3uHint}</span></div>
        <div className="row" style={{ alignItems: 'stretch' }}>
          <div className="field grow"><label>{t.username}</label><input className="input" value={f.username} onChange={(e) => set({ username: e.target.value })} /></div>
          <div className="field grow"><label>{t.password}</label><input className="input" type="password" value={f.password} onChange={(e) => set({ password: e.target.value })} /></div>
        </div>
        <div className="field"><label>{t.liveFormat}</label>
          <select className="select" value={f.liveFormat} onChange={(e) => set({ liveFormat: e.target.value as any })}><option value="ts">MPEG-TS (.ts)</option><option value="m3u8">HLS (.m3u8)</option></select>
        </div>
      </>)}
      <div className="field"><label>{t.epgUrl}</label><input className="input" value={f.epgUrl} onChange={(e) => set({ epgUrl: e.target.value })} placeholder="http://…/xmltv.xml(.gz)" /><span className="hint">{f.type === 'xtream' ? 'Leer lassen = Xtream-EPG des Servers' : 'Leer lassen = x-tvg-url aus der Playlist'}</span></div>
      <div className="row" style={{ alignItems: 'stretch' }}>
        <div className="field grow"><label>{t.userAgent}</label><input className="input" value={f.userAgent} onChange={(e) => set({ userAgent: e.target.value })} placeholder="z. B. VLC/3.0.18" /></div>
        <div className="field" style={{ width: 160 }}><label>{t.autoRefresh}</label><input className="input" type="number" min={1} max={168} value={f.autoRefreshHours} onChange={(e) => set({ autoRefreshHours: Math.max(1, parseInt(e.target.value) || 12) })} /></div>
      </div>
      {err && <div style={{ color: 'var(--danger)' }}><Icon name="info" size={14} /> {err}</div>}
    </Modal>
  );
}
