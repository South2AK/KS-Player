import React, { useEffect, useMemo, useState } from 'react';
import type { Channel, Programme } from '@shared/types';
import { useStore } from '@/store/app';
import { api } from '@/lib/api';
import { fmtTime, fmtDate } from '@/lib/utils';
import { Modal } from './Modal';
import { Icon } from './Icon';

/** Builds a catch-up URL for M3U playlists using the catchup-source template (or Xtream via IPC). */
export async function buildCatchupUrl(playlistId: string, ch: Channel, startMs: number, endMs: number): Promise<string | null> {
  const durationMin = Math.max(1, Math.round((endMs - startMs) / 60000));
  if (ch.streamId !== undefined && ch.id.startsWith('xl')) {
    return api().playlists.xtreamCatchupUrl(playlistId, ch.streamId, startMs, durationMin);
  }
  const tpl = ch.catchupSource;
  if (!tpl) return null;
  const s = new Date(startMs), e = new Date(endMs);
  const pad = (n: number) => String(n).padStart(2, '0');
  const rep: Record<string, string> = {
    '${start}': String(Math.floor(startMs / 1000)),
    '${end}': String(Math.floor(endMs / 1000)),
    '${timestamp}': String(Math.floor(startMs / 1000)),
    '${duration}': String(durationMin * 60),
    '${offset}': String(Math.floor((Date.now() - startMs) / 1000)),
    '{utc}': String(Math.floor(startMs / 1000)),
    '{utcend}': String(Math.floor(endMs / 1000)),
    '{lutc}': String(Math.floor(Date.now() / 1000)),
    '{duration}': String(durationMin * 60),
    '{Y}': String(s.getFullYear()), '{m}': pad(s.getMonth() + 1), '{d}': pad(s.getDate()), '{H}': pad(s.getHours()), '{M}': pad(s.getMinutes()), '{S}': pad(s.getSeconds()),
    '{start-year}': String(s.getFullYear()), '{start-month}': pad(s.getMonth() + 1), '{start-day}': pad(s.getDate()), '{start-hour}': pad(s.getHours()), '{start-min}': pad(s.getMinutes()),
    '{end-year}': String(e.getFullYear()), '{end-month}': pad(e.getMonth() + 1), '{end-day}': pad(e.getDate()), '{end-hour}': pad(e.getHours()), '{end-min}': pad(e.getMinutes()),
  };
  let url = tpl;
  for (const [k, v] of Object.entries(rep)) url = url.split(k).join(v);
  if (!/^https?:/i.test(url)) {
    // relative query appended to channel URL
    url = ch.url + (ch.url.includes('?') ? '&' : '?') + url.replace(/^\?/, '');
  }
  return url;
}

export function CatchupModal({ onClose, channel }: { onClose: () => void; channel?: Channel }) {
  const current = useStore((s) => s.current);
  const data = useStore((s) => s.data);
  const playlistId = useStore((s) => s.activePlaylistId);
  const settings = useStore((s) => s.settings);
  const play = useStore((s) => s.play);
  const toast = useStore((s) => s.toast);
  const t = useStore((s) => s.t);
  const ch = channel || data?.channels.find((c) => c.id === current?.channelId);
  const days = Math.min(ch?.catchupDays || 1, 14);
  const [day, setDay] = useState(0);
  const [progs, setProgs] = useState<Programme[]>([]);
  const [loading, setLoading] = useState(true);

  const dayStart = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime() - day * 86_400_000; }, [day]);

  useEffect(() => {
    if (!ch || !playlistId) return;
    setLoading(true);
    api().epg.range(playlistId, [ch.id], dayStart, dayStart + 86_400_000)
      .then((r) => setProgs((r[ch.id] || []).filter((p) => p.start < Date.now())))
      .catch(() => setProgs([]))
      .finally(() => setLoading(false));
  }, [ch, playlistId, dayStart]);

  if (!ch || !playlistId) return null;

  const playProg = async (p: Programme) => {
    const url = await buildCatchupUrl(playlistId, ch, p.start, Math.min(p.stop, Date.now()));
    if (!url) { toast(t.playbackError, 'error'); return; }
    onClose();
    play({
      id: ch.id + ':' + p.start, channelId: ch.id, playlistId, name: ch.name, logo: ch.logo, url, kind: 'live', live: false, group: ch.group,
      subtitle: `${t.catchup} · ${fmtTime(p.start, settings.timeFormat, settings.language)} ${p.title}`, catchup: { start: p.start, end: p.stop, title: p.title },
    }, undefined, 'full');
  };

  const dayLabel = (i: number) => (i === 0 ? t.today : i === 1 ? t.yesterday : fmtDate(Date.now() - i * 86_400_000, settings.language));

  return (
    <Modal title={`${t.catchup} · ${ch.name}`} onClose={onClose}>
      <div className="tabs" style={{ overflowX: 'auto' }}>
        {Array.from({ length: days }, (_, i) => <button key={i} className={day === i ? 'active' : ''} onClick={() => setDay(i)}>{dayLabel(i)}</button>)}
      </div>
      {loading ? <div className="row" style={{ justifyContent: 'center', padding: 20 }}><div className="spinner" /></div> : progs.length === 0 ? (
        <div className="empty"><Icon name="clock" size={30} className="ico" /><h3>{t.noEpg}</h3></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: '55vh', overflow: 'auto' }}>
          {progs.map((p) => (
            <div key={p.start} className="episode-row" onClick={() => playProg(p)}>
              <div className="num" style={{ width: 90, fontSize: 12 }}>{fmtTime(p.start, settings.timeFormat, settings.language)}</div>
              <div className="meta"><div className="t">{p.title}</div>{p.desc && <div className="p">{p.desc}</div>}</div>
              <Icon name="play" size={16} className="muted" />
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
