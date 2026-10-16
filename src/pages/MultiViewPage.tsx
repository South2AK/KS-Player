import React, { useEffect, useRef, useState } from 'react';
import type { Channel } from '@shared/types';
import { useStore } from '@/store/app';
import { getTileEngine, type Engine, type EngineState } from '@/lib/engine';
import { useChannelList } from '@/lib/hooks';
import { Icon } from '@/components/Icon';
import { Modal } from '@/components/Modal';
import { VirtualList } from '@/components/VirtualList';
import { ChannelRow } from '@/components/ChannelRow';

type Layout = '2x2' | '1+3' | '2x1';

interface Slot { channel: Channel | null }

export function MultiViewPage() {
  const t = useStore((s) => s.t);
  const [layout, setLayout] = useState<Layout>('2x2');
  const [slots, setSlots] = useState<Slot[]>([{ channel: null }, { channel: null }, { channel: null }, { channel: null }]);
  const [audio, setAudio] = useState(0);
  const [picker, setPicker] = useState<number | null>(null);
  const count = layout === '2x1' ? 2 : 4;

  // Stop tiles when leaving the page
  useEffect(() => () => { for (let i = 0; i < 4; i++) getTileEngine(i).stop(); }, []);

  return (
    <div className="page">
      <div className="page-header">
        <h1>{t.multiview}</h1>
        <span className="sub">{t.multiviewHint}</span>
        <div className="grow" />
        <div className="tabs">
          {(['2x2', '1+3', '2x1'] as Layout[]).map((l) => <button key={l} className={layout === l ? 'active' : ''} onClick={() => setLayout(l)}>{l}</button>)}
        </div>
      </div>
      <div className="mv-grid" data-layout={layout}>
        {slots.slice(0, count).map((s, i) => (
          <Tile key={i} index={i} channel={s.channel} audio={audio === i} onPick={() => setPicker(i)} onAudio={() => setAudio(i)}
            onClear={() => { getTileEngine(i).stop(); setSlots((ss) => ss.map((x, j) => (j === i ? { channel: null } : x))); }} />
        ))}
      </div>
      {picker !== null && (
        <Picker onClose={() => setPicker(null)} onSelect={(c) => {
          setSlots((ss) => ss.map((x, j) => (j === picker ? { channel: c } : x)));
          setPicker(null);
        }} />
      )}
    </div>
  );
}

function Tile({ index, channel, audio, onPick, onAudio, onClear }: { index: number; channel: Channel | null; audio: boolean; onPick: () => void; onAudio: () => void; onClear: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const settings = useStore((s) => s.settings);
  const playlists = useStore((s) => s.playlists);
  const activeId = useStore((s) => s.activePlaylistId);
  const t = useStore((s) => s.t);
  const eng: Engine = getTileEngine(index);
  const [st, setSt] = useState<EngineState>(eng.state);
  useEffect(() => eng.subscribe(setSt), [eng]);

  useEffect(() => {
    const box = ref.current;
    if (!box) return;
    box.insertBefore(eng.video, box.firstChild);
    return () => { if (eng.video.parentElement === box) box.removeChild(eng.video); };
  }, [eng]);

  useEffect(() => {
    if (!channel) { eng.stop(); return; }
    const ua = playlists.find((p) => p.id === activeId)?.userAgent || settings.userAgent;
    eng.play({ url: channel.url, live: true, userAgent: ua, allowTranscode: settings.autoTranscode, bufferSeconds: settings.bufferSeconds });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel?.id]);

  useEffect(() => { eng.setMuted(!audio); }, [audio, eng]);

  return (
    <div ref={ref} className={'mv-tile' + (audio ? ' audio' : '')} onClick={() => channel && onAudio()} onDoubleClick={() => channel && useStore.getState().playChannel(channel, undefined, 'full')}>
      {!channel ? (
        <div className="add" onClick={onPick}><div style={{ textAlign: 'center' }}><Icon name="plus" size={32} /><div className="small">{t.selectChannel}</div></div></div>
      ) : (<>
        <div className="label">{audio && <Icon name="volume" size={13} />}{channel.name}{st.status === 'error' && <span style={{ color: 'var(--danger)' }}>· {t.playbackError}</span>}</div>
        {(st.status === 'loading' || st.status === 'buffering') && <div className="player-center"><div className="spinner" /></div>}
        <div className="tools">
          <button onClick={(e) => { e.stopPropagation(); onPick(); }} title={t.selectChannel}><Icon name="list" size={15} /></button>
          {st.status === 'error' && <button onClick={(e) => { e.stopPropagation(); eng.retry(); }} title={t.retry}><Icon name="refresh" size={15} /></button>}
          <button onClick={(e) => { e.stopPropagation(); onClear(); }} title={t.close}><Icon name="x" size={15} /></button>
        </div>
      </>)}
    </div>
  );
}

function Picker({ onClose, onSelect }: { onClose: () => void; onSelect: (c: Channel) => void }) {
  const t = useStore((s) => s.t);
  const [q, setQ] = useState('');
  const list = useChannelList('live', null, q);
  return (
    <Modal title={t.selectChannel} onClose={onClose} style={{ height: '80vh' }}>
      <div className="search-box"><span className="ico"><Icon name="search" size={15} /></span><input autoFocus placeholder={t.search} value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <div style={{ flex: 1, minHeight: 300, height: '60vh' }}>
        <VirtualList items={list} itemHeight={56} keyOf={(c) => c.id} render={(c) => <ChannelRow channel={c} onClick={() => onSelect(c)} />} />
      </div>
    </Modal>
  );
}
