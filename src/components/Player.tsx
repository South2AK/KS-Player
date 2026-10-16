import React, { useCallback, useEffect, useRef, useState } from 'react';
import { engine, type EngineState } from '@/lib/engine';
import { useStore } from '@/store/app';
import { api, isElectron } from '@/lib/api';
import { fmtDuration, fmtTime, progress } from '@/lib/utils';
import { useNowNext } from '@/lib/useEpg';
import { useChannelList } from '@/lib/hooks';
import { Icon } from './Icon';
import { ChannelLogo } from './ChannelLogo';
import { ChannelRow } from './ChannelRow';
import { VirtualList } from './VirtualList';
import { CatchupModal } from './CatchupModal';

type Menu = 'audio' | 'subs' | 'aspect' | 'speed' | 'sleep' | null;

export function useEngineState(): EngineState {
  const [s, setS] = useState(engine.state);
  useEffect(() => engine.subscribe(setS), []);
  return s;
}

export function Player({ mode }: { mode: 'inline' | 'full' }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const current = useStore((s) => s.current);
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const setPlayerView = useStore((s) => s.setPlayerView);
  const setPage = useStore((s) => s.setPage);
  const stop = useStore((s) => s.stop);
  const zap = useStore((s) => s.zap);
  const setResume = useStore((s) => s.setResume);
  const fullscreen = useStore((s) => s.fullscreen);
  const t = useStore((s) => s.t);
  const sleepUntil = useStore((s) => s.sleepUntil);
  const setSleep = useStore((s) => s.setSleep);
  const transcodeAvailable = useStore((s) => s.transcodeAvailable);
  const st = useEngineState();
  const [time, setTime] = useState({ t: 0, d: 0, b: 0 });
  const [ui, setUi] = useState(true);
  const [menu, setMenu] = useState<Menu>(null);
  const [showList, setShowList] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [catchup, setCatchup] = useState(false);
  const [onTop, setOnTop] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nowNext = useNowNext(current?.live && current.kind === 'live' ? [current.channelId] : []);
  const nn = current ? nowNext[current.channelId] : undefined;

  // Attach the shared <video> element
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    box.insertBefore(engine.video, box.firstChild);
    return () => { if (engine.video.parentElement === box) box.removeChild(engine.video); };
  }, [mode]);

  useEffect(() => engine.onTime((t, d, b) => setTime({ t, d, b })), []);

  // Resume positions for VOD
  useEffect(() => {
    if (!current || current.live) return;
    const id = current.id;
    const i = setInterval(() => {
      const d = engine.duration, p = engine.time;
      if (d > 60 && p > 30) {
        if (p / d < 0.95) setResume(id, { position: p, duration: d, at: Date.now() });
        else setResume(id, null);
      }
    }, 5000);
    return () => clearInterval(i);
  }, [current, setResume]);

  // Auto-hide UI
  const poke = useCallback(() => {
    setUi(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => { if (!menu) setUi(false); }, 3200);
  }, [menu]);
  useEffect(() => { poke(); return () => { if (hideTimer.current) clearTimeout(hideTimer.current); }; }, [poke, current]);

  // Persist volume
  useEffect(() => {
    if (st.volume !== settings.volume || st.muted !== settings.muted) updateSettings({ volume: st.volume, muted: st.muted });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st.volume, st.muted]);

  useEffect(() => { setMenu(null); setShowList(false); setShowInfo(false); }, [current?.id]);

  if (!current) return null;
  const isLive = current.live;
  const paused = st.status === 'paused' || st.status === 'ended';
  const showBusy = st.status === 'loading' || st.status === 'buffering';
  const durationKnown = time.d > 0 && !isLive;

  const toggleFull = async () => {
    if (mode === 'inline') { setPlayerView('full'); return; }
    await api().app.setFullscreen(!fullscreen);
  };
  const minimize = async () => {
    if (fullscreen) await api().app.setFullscreen(false);
    setPlayerView('inline');
    setPage('live');
  };
  const closePlayer = async () => {
    if (fullscreen) await api().app.setFullscreen(false);
    stop();
  };
  const pip = async () => {
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await engine.video.requestPictureInPicture();
    } catch { /* unsupported */ }
  };
  const seekTo = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!durationKnown) return;
    const r = e.currentTarget.getBoundingClientRect();
    engine.seek(((e.clientX - r.left) / r.width) * time.d);
  };
  const toggleOnTop = async () => { const v = !onTop; setOnTop(v); await api().app.setAlwaysOnTop(v); };

  const sleepLeft = sleepUntil ? Math.max(0, Math.round((sleepUntil - Date.now()) / 60000)) : 0;

  const menuEl = menu && (
    <div className="player-menu" onMouseMove={(e) => e.stopPropagation()}>
      {menu === 'audio' && (<>
        <div className="mh">{t.audio}</div>
        {st.audioTracks.length === 0 && <button disabled className="muted">{t.none}</button>}
        {st.audioTracks.map((a) => <button key={a.id} className={a.active ? 'active' : ''} onClick={() => engine.setAudioTrack(a.id)}>{a.active && <Icon name="check" size={14} />}{a.label}</button>)}
      </>)}
      {menu === 'subs' && (<>
        <div className="mh">{t.subtitles}</div>
        <button className={st.subtitleTracks.every((s) => !s.active) ? 'active' : ''} onClick={() => engine.setSubtitleTrack(-1)}>{t.off}</button>
        {st.subtitleTracks.map((s) => <button key={s.id} className={s.active ? 'active' : ''} onClick={() => engine.setSubtitleTrack(s.id)}>{s.active && <Icon name="check" size={14} />}{s.label}</button>)}
      </>)}
      {menu === 'aspect' && (<>
        <div className="mh">{t.aspect}</div>
        {(['contain', 'cover', 'fill', '16:9', '4:3'] as const).map((a) => (
          <button key={a} className={settings.aspect === a ? 'active' : ''} onClick={() => updateSettings({ aspect: a })}>{settings.aspect === a && <Icon name="check" size={14} />}{{ contain: 'Fit', cover: 'Zoom', fill: 'Stretch', '16:9': '16:9', '4:3': '4:3' }[a]}</button>
        ))}
      </>)}
      {menu === 'speed' && (<>
        <div className="mh">{t.speed}</div>
        {[0.5, 0.75, 1, 1.25, 1.5, 2].map((r) => <button key={r} className={st.rate === r ? 'active' : ''} onClick={() => engine.setRate(r)}>{st.rate === r && <Icon name="check" size={14} />}{r}×</button>)}
      </>)}
      {menu === 'sleep' && (<>
        <div className="mh">{t.sleepTimer}</div>
        {[0, 15, 30, 60, 90, 120].map((m) => <button key={m} className={(m === 0 ? !sleepUntil : sleepLeft > 0 && settings.sleepTimerMinutes === m) ? 'active' : ''} onClick={() => setSleep(m)}>{m === 0 ? t.off : `${m} ${t.minutes}`}</button>)}
      </>)}
    </div>
  );

  return (
    <div
      ref={boxRef}
      className={'player-box' + (mode === 'full' ? ' full' : '') + (mode === 'full' && isElectron() && !fullscreen ? ' win-controls' : '') + (ui || paused || st.status === 'error' ? ' show-ui' : '')}
      data-aspect={settings.aspect}
      onMouseMove={poke}
      onMouseLeave={() => { if (mode === 'inline') setUi(false); }}
      onClick={(e) => { if (e.target === engine.video) poke(); }}
      onDoubleClick={(e) => { if (e.target === engine.video) toggleFull(); }}
      style={mode === 'full' ? { cursor: ui ? 'default' : 'none' } : undefined}
    >
      {/* center status */}
      <div className="player-center">
        {!showBusy && st.status !== 'error' && (
          <button className="center-btn" onClick={(e) => { e.stopPropagation(); engine.togglePlay(); poke(); }} title={paused ? t.play : 'Pause'}>
            <Icon name={paused ? 'play' : 'pause'} fill size={30} />
          </button>
        )}
        {showBusy && <div className="status"><div className="spinner lg" /><div className="small">{st.transcode ? t.transcoding : t.loading}</div></div>}
        {st.status === 'error' && (
          <div className="status">
            <div className="err">{t.playbackError}</div>
            <div className="detail">{st.error}</div>
            <div className="row">
              <button className="btn sm" onClick={() => engine.retry()}><Icon name="refresh" size={14} />{t.retry}</button>
              {transcodeAvailable && <button className="btn sm primary" onClick={() => engine.forceTranscode()}>{t.transcodeNow}</button>}
            </div>
          </div>
        )}
      </div>

      {menuEl}

      {mode === 'full' && showList && current.kind === 'live' && <SideList onClose={() => setShowList(false)} />}
      {mode === 'full' && showInfo && <SideInfo onClose={() => setShowInfo(false)} />}
      {catchup && current.kind === 'live' && <CatchupModal onClose={() => setCatchup(false)} />}

      <div className="player-overlay">
        <div className="player-top">
          {mode === 'full' && (
            <button className="back-btn" onClick={minimize} title={`${t.back} (Esc)`} aria-label={t.back}>
              <Icon name="chevronL" size={22} />
            </button>
          )}
          <ChannelLogo src={current.logo} name={current.name} className="logo" />
          <div className="grow">
            <div className="title">{current.name}</div>
            <div className="sub">
              {current.subtitle || (nn?.[0] ? `${fmtTime(nn[0].start, settings.timeFormat, settings.language)} – ${fmtTime(nn[0].stop, settings.timeFormat, settings.language)} · ${nn[0].title}` : current.group)}
            </div>
          </div>
          {isLive && <span className="chip live">{t.liveTag}</span>}
          {st.transcode > 0 && <span className="chip accent" title={t.transcoding}>ffmpeg</span>}
          {st.width > 0 && <span className="chip">{st.height >= 2160 ? '4K' : st.height >= 1080 ? 'FHD' : st.height >= 720 ? 'HD' : 'SD'} · {st.width}×{st.height}</span>}
          {sleepLeft > 0 && <span className="chip"><Icon name="moon" size={12} /> {sleepLeft} min</span>}
          {mode === 'full' ? (<>
            {isElectron() && <button className="iconbtn" style={{ color: onTop ? 'var(--accent)' : '#fff' }} onClick={toggleOnTop} title={t.alwaysOnTop}><Icon name="pin" /></button>}
            <button className="iconbtn" style={{ color: '#fff' }} onClick={minimize} title={t.back}><Icon name="minimize" /></button>
            <button className="iconbtn" style={{ color: '#fff' }} onClick={closePlayer} title={t.close}><Icon name="x" /></button>
          </>) : (
            <button className="iconbtn" style={{ color: '#fff' }} onClick={closePlayer} title={t.stop}><Icon name="x" /></button>
          )}
        </div>

        <div className="player-bottom" onMouseDown={(e) => e.stopPropagation()}>
          {durationKnown && (
            <div className="seekbar" onClick={seekTo}>
              <div className="track">
                <div className="buf" style={{ width: `${Math.min(100, (time.b / time.d) * 100)}%` }} />
                <div className="pos" style={{ width: `${Math.min(100, (time.t / time.d) * 100)}%` }} />
              </div>
              <div className="knob" style={{ left: `${Math.min(100, (time.t / time.d) * 100)}%` }} />
            </div>
          )}
          {isLive && nn?.[0] && (
            <div className="seekbar" style={{ cursor: 'default' }}>
              <div className="track"><div className="pos" style={{ width: `${progress(nn[0]) * 100}%` }} /></div>
            </div>
          )}
          <div className="player-controls">
            {isLive && current.kind === 'live' && <button className="pbtn" onClick={() => zap(-1)} title={t.prevChannel}><Icon name="prev" /></button>}
            {!isLive && <button className="pbtn" onClick={() => engine.seekBy(-10)} title="-10s"><Icon name="back10" /></button>}
            <button className="pbtn" onClick={() => engine.togglePlay()} title={paused ? t.play : 'Pause'}><Icon name={paused ? 'play' : 'pause'} fill size={22} /></button>
            {!isLive && <button className="pbtn" onClick={() => engine.seekBy(10)} title="+10s"><Icon name="fwd10" /></button>}
            {isLive && current.kind === 'live' && <button className="pbtn" onClick={() => zap(1)} title={t.nextChannel}><Icon name="next" /></button>}
            <button className="pbtn" onClick={() => engine.setMuted(!st.muted)} title={t.mute}><Icon name={st.muted || st.volume === 0 ? 'mute' : 'volume'} /></button>
            <input className="vol" type="range" min={0} max={1} step={0.02} value={st.muted ? 0 : st.volume} onChange={(e) => engine.setVolume(parseFloat(e.target.value))} title={t.volume} />
            <span className="time">{durationKnown ? `${fmtDuration(time.t)} / ${fmtDuration(time.d)}` : isLive ? fmtTime(Date.now(), settings.timeFormat, settings.language) : fmtDuration(time.t)}</span>
            <div className="spacer" />
            {isLive && current.kind === 'live' && (current.catchupDays || 0) > 0 && (
              <button className="pbtn" onClick={() => setCatchup(true)} title={t.catchup}><Icon name="rewind" /></button>
            )}
            {mode === 'full' && current.kind === 'live' && <button className={'pbtn' + (showList ? ' active' : '')} onClick={() => setShowList((v) => !v)} title={t.channelList}><Icon name="list" /></button>}
            {mode === 'full' && <button className={'pbtn' + (showInfo ? ' active' : '')} onClick={() => setShowInfo((v) => !v)} title={t.info}><Icon name="info" /></button>}
            <button className={'pbtn' + (menu === 'audio' ? ' active' : '')} onClick={() => setMenu(menu === 'audio' ? null : 'audio')} title={t.audio}><Icon name="audio" /></button>
            <button className={'pbtn' + (menu === 'subs' ? ' active' : '')} onClick={() => setMenu(menu === 'subs' ? null : 'subs')} title={t.subtitles}><Icon name="subtitles" /></button>
            <button className={'pbtn' + (menu === 'aspect' ? ' active' : '')} onClick={() => setMenu(menu === 'aspect' ? null : 'aspect')} title={t.aspect}><Icon name="aspect" /></button>
            {!isLive && <button className={'pbtn' + (menu === 'speed' ? ' active' : '')} onClick={() => setMenu(menu === 'speed' ? null : 'speed')} title={t.speed}><Icon name="speed" /></button>}
            <button className={'pbtn' + (menu === 'sleep' ? ' active' : '')} onClick={() => setMenu(menu === 'sleep' ? null : 'sleep')} title={t.sleepTimer}><Icon name="moon" /></button>
            {transcodeAvailable && <button className={'pbtn' + (st.transcode ? ' active' : '')} onClick={() => engine.forceTranscode()} title={t.transcoding}><Icon name="cast" /></button>}
            <button className="pbtn" onClick={pip} title={t.pip}><Icon name="pip" /></button>
            <button className="pbtn" onClick={toggleFull} title={t.fullscreen}><Icon name="fullscreen" /></button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SideList({ onClose }: { onClose: () => void }) {
  const current = useStore((s) => s.current);
  const zapList = useStore((s) => s.zapList);
  const data = useStore((s) => s.data);
  const playChannel = useStore((s) => s.playChannel);
  const t = useStore((s) => s.t);
  const [q, setQ] = useState('');
  const all = useChannelList('live', null, q);
  const list = React.useMemo(() => {
    if (q.trim()) return all;
    if (!data) return [];
    if (!zapList.length) return all;
    const map = new Map(data.channels.map((c) => [c.id, c]));
    return zapList.map((id) => map.get(id)!).filter(Boolean);
  }, [all, zapList, data, q]);
  const [range, setRange] = useState<string[]>([]);
  const nowNext = useNowNext(range);
  const idx = list.findIndex((c) => c.id === current?.channelId);
  return (
    <div className="player-side" onMouseMove={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
      <div className="head">
        <Icon name="list" />{t.channelList}
        <span className="grow" />
        <button className="iconbtn" style={{ color: '#fff' }} onClick={onClose}><Icon name="x" /></button>
      </div>
      <div style={{ padding: '0 12px 8px' }}>
        <div className="search-box"><span className="ico"><Icon name="search" size={15} /></span><input placeholder={t.search} value={q} onChange={(e) => setQ(e.target.value)} autoFocus /></div>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <VirtualList
          items={list}
          itemHeight={56}
          scrollToIndex={idx}
          keyOf={(c) => c.id}
          render={(c) => (
            <RowWithEpg
              channel={c}
              active={c.id === current?.channelId}
              nowNext={nowNext[c.id]}
              onVisible={(id) => setRange((r) => (r.includes(id) ? r : [...r.slice(-60), id]))}
              onClick={() => playChannel(c, zapList.length ? zapList : list.map((x) => x.id), 'full')}
            />
          )}
        />
      </div>
    </div>
  );
}

function RowWithEpg({ channel, active, nowNext, onVisible, onClick }: { channel: any; active: boolean; nowNext: any; onVisible: (id: string) => void; onClick: () => void }) {
  useEffect(() => { onVisible(channel.id); }, [channel.id, onVisible]);
  return <ChannelRow channel={channel} active={active} nowNext={nowNext} onClick={onClick} />;
}

function SideInfo({ onClose }: { onClose: () => void }) {
  const current = useStore((s) => s.current);
  const settings = useStore((s) => s.settings);
  const t = useStore((s) => s.t);
  const nowNext = useNowNext(current?.kind === 'live' ? [current.channelId] : []);
  const st = useEngineState();
  if (!current) return null;
  const nn = nowNext[current.channelId];
  return (
    <div className="player-side" style={{ left: 'auto', right: 0, borderRight: 0, borderLeft: '1px solid var(--border-strong)' }} onMouseMove={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
      <div className="head"><Icon name="info" />{t.info}<span className="grow" /><button className="iconbtn" style={{ color: '#fff' }} onClick={onClose}><Icon name="x" /></button></div>
      <div className="player-info">
        <div className="now">
          <ChannelLogo src={current.logo} name={current.name} className="logo" />
          <div><div className="title">{current.name}</div><div className="muted small">{current.subtitle || current.group}</div></div>
        </div>
        {nn?.[0] ? (
          <div className="prog">
            <div className="muted small">{t.nowPlaying}</div>
            <div className="t">{nn[0].title}</div>
            <div className="time">{fmtTime(nn[0].start, settings.timeFormat, settings.language)} – {fmtTime(nn[0].stop, settings.timeFormat, settings.language)}</div>
            {nn[0].desc && <div className="desc">{nn[0].desc}</div>}
            <div className="bar"><i style={{ width: `${progress(nn[0]) * 100}%` }} /></div>
          </div>
        ) : current.kind === 'live' ? <div className="muted small">{t.noEpg}</div> : null}
        {nn?.[1] && (
          <div className="prog">
            <div className="muted small">{t.next}</div>
            <div className="t">{nn[1].title}</div>
            <div className="time">{fmtTime(nn[1].start, settings.timeFormat, settings.language)} – {fmtTime(nn[1].stop, settings.timeFormat, settings.language)}</div>
            {nn[1].desc && <div className="desc">{nn[1].desc}</div>}
          </div>
        )}
        <div className="prog small">
          <div className="muted">Engine: {st.engine || '–'}{st.transcode ? ' + ffmpeg' : ''}</div>
          {st.width > 0 && <div className="muted">{st.width}×{st.height}</div>}
          <div className="muted ellipsis" title={current.url}>{current.url}</div>
        </div>
      </div>
    </div>
  );
}
