import React, { useEffect, useRef, useState } from 'react';
import type { Settings } from '@shared/types';
import { DEFAULT_SETTINGS } from '@shared/types';
import { useStore } from '@/store/app';
import { api, isElectron } from '@/lib/api';
import { Icon } from '@/components/Icon';
import { Modal } from '@/components/Modal';
import { PinInput } from '@/components/PinDialog';

const ACCENTS = ['#7c5cff', '#3b82f6', '#06b6d4', '#22c55e', '#f59e0b', '#ef4444', '#ec4899', '#a855f7'];

function Row({ label, desc, children }: { label: string; desc?: string; children: React.ReactNode }) {
  return <div className="setting"><div className="lbl"><div>{label}</div>{desc && <div className="d">{desc}</div>}</div>{children}</div>;
}
function Switch({ on, onChange }: { on: boolean; onChange: (v: boolean, e: React.MouseEvent) => void }) {
  return <button className={'switch' + (on ? ' on' : '')} onClick={(e) => onChange(!on, e)} role="switch" aria-checked={on} />;
}

export function SettingsPage() {
  const t = useStore((s) => s.t);
  const s = useStore((st) => st.settings);
  const update = useStore((st) => st.updateSettings);
  const data = useStore((st) => st.data);
  const toast = useStore((st) => st.toast);
  const transcodeAvailable = useStore((st) => st.transcodeAvailable);
  const [version, setVersion] = useState('');
  const [pinModal, setPinModal] = useState(false);
  const [newPin, setNewPin] = useState('');
  const [catModal, setCatModal] = useState<'hidden' | 'locked' | null>(null);
  const [catQuery, setCatQuery] = useState('');
  const lastToggled = useRef<string | null>(null);
  useEffect(() => { api().app.version().then(setVersion).catch(() => {}); }, []);

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => update({ [k]: v } as Partial<Settings>);

  const changePin = async () => {
    if (s.parentalPin && !(await useStore.getState().requestPin(t.changePin))) return;
    setNewPin('');
    setPinModal(true);
  };
  const removePin = async () => {
    if (!(await useStore.getState().requestPin())) return;
    update({ parentalPin: '', lockedCategories: [] });
  };

  const allCats = data?.categories || [];

  return (
    <div className="page">
      <div className="page-header"><h1>{t.settings}</h1></div>
      <div className="page-body">
        <div className="settings-grid">
          <div className="card">
            <h3>{t.general}</h3>
            <Row label={t.language}><select className="select" value={s.language} onChange={(e) => set('language', e.target.value as any)}><option value="de">Deutsch</option><option value="en">English</option></select></Row>
            <Row label={t.theme}><select className="select" value={s.theme} onChange={(e) => set('theme', e.target.value as any)}><option value="dark">{t.themeDark}</option><option value="amoled">{t.themeAmoled}</option><option value="light">{t.themeLight}</option></select></Row>
            <Row label={t.accentColor}><div className="color-dots">{ACCENTS.map((c) => <button key={c} className={s.accent === c ? 'on' : ''} style={{ background: c }} onClick={() => set('accent', c)} />)}</div></Row>
            <Row label={t.timeFormat}><select className="select" value={s.timeFormat} onChange={(e) => set('timeFormat', e.target.value as any)}><option value="24h">24h</option><option value="12h">12h</option></select></Row>
            <Row label={t.showNumbers}><Switch on={s.showChannelNumbers} onChange={(v) => set('showChannelNumbers', v)} /></Row>
            <Row label={t.hideEmpty}><Switch on={s.hideEmptyCategories} onChange={(v) => set('hideEmptyCategories', v)} /></Row>
            {isElectron() && <Row label={t.autoStart}><Switch on={s.autoStart} onChange={(v) => { set('autoStart', v); api().app.setAutoStart(v).catch(() => {}); }} /></Row>}
            <Row label={t.autoPlayLast}><Switch on={s.autoPlayLast} onChange={(v) => set('autoPlayLast', v)} /></Row>
          </div>

          <div className="card">
            <h3>{t.playback}</h3>
            <Row label={t.buffering} desc={t.bufferHint}>
              <select className="select" value={String(s.bufferSeconds)} onChange={(e) => set('bufferSeconds', parseInt(e.target.value))}>
                <option value="2">{t.bufferLow}</option><option value="5">{t.bufferNormal}</option><option value="10">{t.bufferHigh}</option><option value="20">{t.bufferMax}</option>
              </select>
            </Row>
            <Row label={t.liveFormat} desc="Xtream Codes"><select className="select" value={s.liveFormat} onChange={(e) => set('liveFormat', e.target.value as any)}><option value="ts">MPEG-TS</option><option value="m3u8">HLS</option></select></Row>
            <Row label={t.autoTranscode} desc={`${t.ffmpegStatus}: ${transcodeAvailable ? t.available : t.notAvailable}`}><Switch on={s.autoTranscode} onChange={(v) => set('autoTranscode', v)} /></Row>
            <Row label={t.aspect}><select className="select" value={s.aspect} onChange={(e) => set('aspect', e.target.value as any)}><option value="contain">Fit</option><option value="cover">Zoom</option><option value="fill">Stretch</option><option value="16:9">16:9</option><option value="4:3">4:3</option></select></Row>
            <Row label={t.subtitleSize}><input className="input" type="range" min={60} max={200} step={10} value={s.subtitleSize} onChange={(e) => set('subtitleSize', parseInt(e.target.value))} style={{ padding: 0 }} /></Row>
            <Row label={t.defaultUserAgent}><input className="input" value={s.userAgent} onChange={(e) => set('userAgent', e.target.value)} /></Row>
            <Row label={t.epgOffset}><input className="input" type="number" step={0.5} min={-12} max={12} value={s.epgOffsetHours} onChange={(e) => set('epgOffsetHours', parseFloat(e.target.value) || 0)} style={{ width: 100 }} /></Row>
            <Row label={t.sortBy + ' · ' + t.live}><select className="select" value={s.channelSort} onChange={(e) => set('channelSort', e.target.value as any)}><option value="default">{t.sortDefault}</option><option value="az">{t.sortAZ}</option><option value="za">{t.sortZA}</option><option value="added">{t.sortAdded}</option></select></Row>
            {isElectron() && <Row label={t.hardwareAccel}><Switch on={s.hardwareAcceleration} onChange={(v) => set('hardwareAcceleration', v)} /></Row>}
          </div>

          <div className="card">
            <h3>{t.parental}</h3>
            <Row label={t.pin} desc={s.parentalPin ? '••••' : t.lockHint}>
              <div className="row">
                <button className="btn sm" onClick={changePin}><Icon name="lock" size={14} />{s.parentalPin ? t.changePin : t.setPin}</button>
                {s.parentalPin && <button className="btn sm danger" onClick={removePin}><Icon name="unlock" size={14} />{t.delete}</button>}
              </div>
            </Row>
            <Row label={t.lockedCategories} desc={`${s.lockedCategories.length}`}><button className="btn sm" disabled={!s.parentalPin} onClick={async () => { if (await useStore.getState().requestPin()) setCatModal('locked'); }}>{t.manageCategories}</button></Row>
            <Row label={t.hiddenCategories} desc={`${s.hiddenCategories.length}`}><button className="btn sm" onClick={() => setCatModal('hidden')}>{t.manageCategories}</button></Row>
          </div>

          <div className="card">
            <h3>{t.backup}</h3>
            <Row label={t.exportBackup}><button className="btn sm" onClick={async () => { const r = await api().state.exportBackup(); if (r) toast(t.backupDone, 'success'); }}><Icon name="download" size={14} />{t.exportBackup}</button></Row>
            {isElectron() && <Row label={t.importBackup}><button className="btn sm" onClick={async () => { const st = await api().state.importBackup(); if (st) { const pl = await api().playlists.list(); useStore.setState({ favorites: st.favorites, history: st.history, resume: st.resume, playlists: pl }); update(st.settings); toast(t.importDone, 'success'); } }}><Icon name="upload" size={14} />{t.importBackup}</button></Row>}
            <Row label={t.resetSettings}><button className="btn sm danger" onClick={() => update({ ...DEFAULT_SETTINGS, lastPlaylistId: s.lastPlaylistId })}><Icon name="refresh" size={14} />{t.resetSettings}</button></Row>
          </div>

          <div className="card">
            <h3>{t.about}</h3>
            <Row label="KS Player" desc={`${t.version} ${version || '–'}`}><span className="chip">Electron · hls.js · mpegts.js · ffmpeg</span></Row>
            <Row label={t.shortcuts} desc={t.keysHint}><Icon name="keyboard" className="muted" /></Row>
            <Row label={t.dataDir}><span /></Row>
          </div>
        </div>
      </div>

      {pinModal && (
        <Modal title={t.setPin} onClose={() => setPinModal(false)} style={{ width: 340 }} footer={<><button className="btn" onClick={() => setPinModal(false)}>{t.cancel}</button><button className="btn primary" disabled={newPin.length !== 4} onClick={() => { update({ parentalPin: newPin }); setPinModal(false); }}>{t.save}</button></>}>
          <div className="row" style={{ justifyContent: 'center' }}><PinInput value={newPin} onChange={setNewPin} /></div>
          <div className="muted small" style={{ textAlign: 'center' }}>4 {t.pin}</div>
        </Modal>
      )}
      {catModal && (
        <Modal title={catModal === 'hidden' ? t.hiddenCategories : t.lockedCategories} onClose={() => { setCatModal(null); setCatQuery(''); }}>
          {allCats.length === 0 && <div className="muted">{t.noResults}</div>}
          <div className="search-box"><span className="ico"><Icon name="search" size={15} /></span><input placeholder={t.search} value={catQuery} onChange={(e) => setCatQuery(e.target.value)} autoFocus /></div>
          <div className="small muted">{t.multiSelectHint}</div>
          <div style={{ maxHeight: '55vh', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }} onMouseDown={(e) => { if (e.shiftKey) e.preventDefault(); }}>
            {(['live', 'movie', 'series'] as const).map((k) => {
              const list = allCats.filter((c) => c.kind === k && (!catQuery || c.name.toLowerCase().includes(catQuery.toLowerCase())));
              if (!list.length) return null;
              const key = catModal === 'hidden' ? 'hiddenCategories' : 'lockedCategories';
              const cur = useStore.getState().settings[key];
              const toggle = (id: string, v: boolean, shift: boolean) => {
                let ids = [id];
                if (shift && lastToggled.current) {
                  const a = list.findIndex((c) => c.id === lastToggled.current), b = list.findIndex((c) => c.id === id);
                  if (a >= 0 && b >= 0) ids = list.slice(Math.min(a, b), Math.max(a, b) + 1).map((c) => c.id);
                }
                lastToggled.current = id;
                const now = useStore.getState().settings[key];
                set(key, v ? [...new Set([...now, ...ids])] : now.filter((x) => !ids.includes(x)));
              };
              const allIds = list.map((c) => c.id);
              return (
                <React.Fragment key={k}>
                  <div className="section-title" style={{ margin: '8px 0 4px' }}>
                    {k === 'live' ? t.live : k === 'movie' ? t.movies : t.series}
                    <span className="count">{allIds.filter((id) => cur.includes(id)).length} / {allIds.length}</span>
                    <span className="grow" />
                    <button className="btn sm ghost" onClick={() => set(key, [...new Set([...cur, ...allIds])])}>{t.selectAll}</button>
                    <button className="btn sm ghost" onClick={() => set(key, cur.filter((x) => !allIds.includes(x)))}>{t.selectNone}</button>
                  </div>
                  {list.map((c) => {
                    const on = cur.includes(c.id);
                    return (
                      <div key={c.id} className="setting" style={{ padding: '6px 8px', cursor: 'pointer' }} onClick={(e) => toggle(c.id, !on, e.shiftKey)}>
                        <div className="lbl"><div className="ellipsis">{c.name}</div><div className="d">{c.count}</div></div>
                        <Switch on={on} onChange={(v, e) => { e.stopPropagation(); toggle(c.id, v, e.shiftKey); }} />
                      </div>
                    );
                  })}
                </React.Fragment>
              );
            })}
          </div>
        </Modal>
      )}
    </div>
  );
}
