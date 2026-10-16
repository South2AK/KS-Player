import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Channel, Programme } from '@shared/types';
import { useStore } from '@/store/app';
import { api } from '@/lib/api';
import { ALL, FAV, useCategories, useChannelList } from '@/lib/hooks';
import { Icon } from '@/components/Icon';
import { ChannelLogo } from '@/components/ChannelLogo';
import { fmtTime, fmtDate } from '@/lib/utils';
import { Modal } from '@/components/Modal';
import { buildCatchupUrl } from '@/components/CatchupModal';

const PX_PER_MIN = 6;
const ROW_H = 56;

export function EpgPage() {
  const t = useStore((s) => s.t);
  const epg = useStore((s) => s.epg);
  const playlistId = useStore((s) => s.activePlaylistId);
  const settings = useStore((s) => s.settings);
  const loadEpg = useStore((s) => s.loadEpg);
  const playChannel = useStore((s) => s.playChannel);
  const play = useStore((s) => s.play);
  const toast = useStore((s) => s.toast);
  const cats = useCategories('live');
  const [category, setCategory] = useState<string>(FAV);
  const favorites = useStore((s) => s.favorites);
  const allChannels = useChannelList('live', category === FAV && !favorites.length ? ALL : category);
  const [dayOffset, setDayOffset] = useState(0);
  const [progs, setProgs] = useState<Record<string, Programme[]>>({});
  const [range, setRange] = useState({ start: 0, end: 30 });
  const [selected, setSelected] = useState<{ ch: Channel; p: Programme } | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const dayStart = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime() + dayOffset * 86_400_000 + settings.epgOffsetHours * 0; }, [dayOffset, settings.epgOffsetHours]);
  const dayEnd = dayStart + 86_400_000;
  const channels = allChannels;
  const visible = channels.slice(range.start, range.end);
  const visibleIds = visible.map((c) => c.id).join(',');

  useEffect(() => {
    if (!playlistId || !epg?.loadedAt || !visible.length) return;
    const ids = visible.map((c) => c.id).filter((id) => !progs[id]);
    if (!ids.length) return;
    api().epg.range(playlistId, ids, dayStart, dayEnd).then((r) => setProgs((p) => ({ ...p, ...Object.fromEntries(ids.map((id) => [id, r[id] || []])) }))).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleIds, playlistId, epg?.loadedAt, dayStart]);
  useEffect(() => { setProgs({}); }, [dayStart, epg?.loadedAt]);

  // Scroll to "now" on first render
  useEffect(() => {
    const el = timelineRef.current;
    if (!el || dayOffset !== 0) return;
    const mins = (Date.now() - dayStart) / 60000;
    el.scrollLeft = Math.max(0, mins * PX_PER_MIN - el.clientWidth / 3);
  }, [dayStart, dayOffset]);

  const onScroll = () => {
    const el = timelineRef.current;
    if (!el) return;
    if (listRef.current) listRef.current.scrollTop = el.scrollTop;
    const start = Math.max(0, Math.floor(el.scrollTop / ROW_H) - 3);
    const end = Math.min(channels.length, Math.ceil((el.scrollTop + el.clientHeight) / ROW_H) + 3);
    setRange((r) => (r.start === start && r.end === end ? r : { start, end }));
  };

  const now = Date.now();
  const width = 24 * 60 * PX_PER_MIN;
  const offset = settings.epgOffsetHours * 3600_000;

  const playSelected = async (catchup: boolean) => {
    if (!selected || !playlistId) return;
    const { ch, p } = selected;
    setSelected(null);
    if (!catchup) { playChannel(ch, channels.map((c) => c.id), 'full'); return; }
    const url = await buildCatchupUrl(playlistId, ch, p.start - offset, Math.min(p.stop - offset, Date.now()));
    if (!url) { toast(t.playbackError, 'error'); return; }
    play({ id: ch.id + ':' + p.start, channelId: ch.id, playlistId, name: ch.name, logo: ch.logo, url, kind: 'live', live: false, group: ch.group, subtitle: `${t.catchup} · ${p.title}` }, undefined, 'full');
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>{t.epg}</h1>
        <span className="sub">{epg?.loading ? t.epgLoading : epg?.loadedAt ? `${t.epgLoaded} · ${epg.channels} ${t.channels}` : epg?.error || t.epgNotLoaded}</span>
        <button className="iconbtn" onClick={() => loadEpg(true)} title={t.epgReload}>{epg?.loading ? <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> : <Icon name="refresh" size={16} />}</button>
        <div className="grow" />
        <select className="select" style={{ width: 220 }} value={category} onChange={(e) => { setCategory(e.target.value); setProgs({}); setRange({ start: 0, end: 30 }); }}>
          <option value={FAV}>{t.favorites}</option>
          <option value={ALL}>{t.all}</option>
          {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <div className="tabs">
          {[-1, 0, 1, 2].map((d) => <button key={d} className={dayOffset === d ? 'active' : ''} onClick={() => setDayOffset(d)}>{d === 0 ? t.today : d === 1 ? t.tomorrow : d === -1 ? t.yesterday : fmtDate(Date.now() + d * 86_400_000, settings.language)}</button>)}
        </div>
        <button className="btn sm" onClick={() => { const el = timelineRef.current; if (el) { setDayOffset(0); el.scrollLeft = Math.max(0, ((Date.now() - dayStart) / 60000) * PX_PER_MIN - el.clientWidth / 3); } }}><Icon name="clock" size={14} />{t.now}</button>
      </div>
      {channels.length === 0 ? <div className="empty"><Icon name="guide" size={40} className="ico" /><h3>{t.noResults}</h3></div> : (
        <div className="epg-grid">
          <div className="epg-ch" ref={listRef} style={{ overflow: 'hidden' }}>
            <div style={{ height: 32, borderBottom: '1px solid var(--border)' }} />
            <div style={{ height: channels.length * ROW_H, position: 'relative' }}>
              {visible.map((c, i) => (
                <div key={c.id} className="epg-row" style={{ position: 'absolute', top: (range.start + i) * ROW_H, left: 0, right: 0 }} onClick={() => playChannel(c, channels.map((x) => x.id), 'full')}>
                  <ChannelLogo src={c.logo} name={c.name} className="logo" />
                  <div className="name ellipsis">{c.name}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="epg-timeline" ref={timelineRef} onScroll={onScroll}>
            <div className="epg-hours" style={{ width }}>
              {Array.from({ length: 24 }, (_, h) => <div key={h} style={{ width: 60 * PX_PER_MIN }}>{fmtTime(dayStart + h * 3600_000, settings.timeFormat, settings.language)}</div>)}
            </div>
            <div style={{ position: 'relative', width, height: channels.length * ROW_H }}>
              {dayOffset === 0 && <div className="epg-nowline" style={{ left: ((now - dayStart) / 60000) * PX_PER_MIN }} />}
              {visible.map((c, i) => (
                <div key={c.id} className="epg-lane" style={{ position: 'absolute', top: (range.start + i) * ROW_H, left: 0, right: 0 }}>
                  {(progs[c.id] || []).map((p) => {
                    const s = Math.max(p.start + offset, dayStart), e = Math.min(p.stop + offset, dayEnd);
                    if (e <= s) return null;
                    const left = ((s - dayStart) / 60000) * PX_PER_MIN;
                    const w = ((e - s) / 60000) * PX_PER_MIN;
                    const isNow = now >= p.start + offset && now < p.stop + offset;
                    const past = p.stop + offset < now;
                    return (
                      <div key={p.start} className={'epg-prog' + (isNow ? ' now' : past ? ' past' : '')} style={{ left, width: Math.max(w - 2, 4) }} title={p.title} onClick={() => setSelected({ ch: c, p })}>
                        <div className="t">{p.title}</div>
                        <div className="tm">{fmtTime(p.start + offset, settings.timeFormat, settings.language)} – {fmtTime(p.stop + offset, settings.timeFormat, settings.language)}</div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      {selected && (
        <Modal title={selected.p.title} onClose={() => setSelected(null)} footer={<>
          {selected.p.start + offset < Date.now() && (selected.ch.catchupDays || 0) > 0 && <button className="btn" onClick={() => playSelected(true)}><Icon name="rewind" size={15} />{t.catchup}</button>}
          <button className="btn primary" onClick={() => playSelected(false)}><Icon name="play" fill size={15} />{selected.ch.name}</button>
        </>}>
          <div className="row"><ChannelLogo src={selected.ch.logo} name={selected.ch.name} className="logo" style={{ width: 48, height: 36, borderRadius: 6, objectFit: 'contain', background: 'var(--bg-3)' }} /><div><div style={{ fontWeight: 600 }}>{selected.ch.name}</div><div className="muted small">{fmtDate(selected.p.start + offset, settings.language)} · {fmtTime(selected.p.start + offset, settings.timeFormat, settings.language)} – {fmtTime(selected.p.stop + offset, settings.timeFormat, settings.language)}</div></div></div>
          {selected.p.category && <span className="chip">{selected.p.category}</span>}
          <div className="muted2" style={{ lineHeight: 1.5 }}>{selected.p.desc || t.noEpg}</div>
        </Modal>
      )}
    </div>
  );
}
