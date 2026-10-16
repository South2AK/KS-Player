import React, { useMemo } from 'react';
import { useStore } from '@/store/app';
import { Icon } from '@/components/Icon';
import { ChannelLogo } from '@/components/ChannelLogo';
import { fmtDateTime, fmtDuration } from '@/lib/utils';

export function HistoryPage() {
  const t = useStore((s) => s.t);
  const history = useStore((s) => s.history);
  const activeId = useStore((s) => s.activePlaylistId);
  const data = useStore((s) => s.data);
  const resume = useStore((s) => s.resume);
  const settings = useStore((s) => s.settings);
  const playChannel = useStore((s) => s.playChannel);
  const play = useStore((s) => s.play);
  const openDetail = useStore((s) => s.openDetail);
  const setPage = useStore((s) => s.setPage);
  const clear = useStore((s) => s.clearHistory);
  const list = useMemo(() => history.filter((h) => h.playlistId === activeId), [history, activeId]);
  const byId = useMemo(() => new Map(data?.channels.map((c) => [c.id, c]) || []), [data]);

  return (
    <div className="page">
      <div className="page-header">
        <h1>{t.history}</h1><span className="sub">{list.length}</span>
        <div className="grow" />
        {list.length > 0 && <button className="btn sm danger" onClick={clear}><Icon name="trash" size={15} />{t.clearHistory}</button>}
      </div>
      <div className="page-body">
        {list.length === 0 ? <div className="empty"><Icon name="history" size={40} className="ico" /><h3>{t.noHistory}</h3></div> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {list.map((h) => {
              const ch = byId.get(h.channelId);
              const r = h.kind === 'movie' ? resume[h.channelId] : undefined;
              return (
                <div key={h.channelId + (h.episodeTitle || '') + h.at} className="episode-row" onClick={() => {
                  if (ch && h.kind === 'live') { playChannel(ch, undefined, 'inline'); setPage('live'); }
                  else if (ch && h.kind === 'movie') openDetail({ kind: 'movie', channel: ch });
                  else if (ch && h.kind === 'series') openDetail({ kind: 'series', channel: ch, episodes: data?.channels.filter((c) => c.kind === 'series' && !c.seriesId && (c.seriesTitle || c.name) === (ch.seriesTitle || ch.name)) });
                  else play({ id: h.channelId, channelId: h.channelId, playlistId: h.playlistId, name: h.name, logo: h.logo, url: h.url, kind: h.kind, live: h.kind === 'live', subtitle: h.episodeTitle });
                }}>
                  <ChannelLogo src={h.logo} name={h.name} className="thumb" style={{ objectFit: 'contain' }} />
                  <div className="meta">
                    <div className="t">{h.name}</div>
                    <div className="p">{h.episodeTitle || ch?.group || ''}{r ? ` · ${fmtDuration(r.position)} / ${fmtDuration(r.duration)}` : ''}</div>
                  </div>
                  <span className="chip">{h.kind === 'live' ? t.live : h.kind === 'movie' ? t.movies : t.series}</span>
                  <span className="muted small" style={{ width: 130, textAlign: 'right' }}>{fmtDateTime(h.at, settings.language)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
