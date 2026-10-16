import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '@/store/app';
import { Icon } from '@/components/Icon';
import { VirtualList } from '@/components/VirtualList';
import { useNowNext } from '@/lib/useEpg';
import { VisibleRow } from './LivePage';
import { Poster } from './MoviesPage';
import { useSeriesEntries } from './SeriesPage';

export function SearchPage() {
  const t = useStore((s) => s.t);
  const data = useStore((s) => s.data);
  const hidden = useStore((s) => s.settings.hiddenCategories);
  const current = useStore((s) => s.current);
  const playChannel = useStore((s) => s.playChannel);
  const openDetail = useStore((s) => s.openDetail);
  const setPage = useStore((s) => s.setPage);
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<'live' | 'movie' | 'series'>('live');
  const [visible, setVisible] = useState<string[]>([]);
  const nowNext = useNowNext(visible);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const query = q.trim().toLowerCase();
  const results = useMemo(() => {
    if (!data || query.length < 2) return { live: [], movie: [], series: [] };
    const words = query.split(/\s+/);
    const match = (n: string) => { const l = n.toLowerCase(); return words.every((w) => l.includes(w)); };
    const live = [], movie = [], series = [];
    for (const c of data.channels) {
      if (hidden.includes(c.kind + '|' + c.group)) continue;
      if (!match(c.kind === 'series' ? (c.seriesTitle || c.name) : c.name)) continue;
      if (c.kind === 'live') live.push(c); else if (c.kind === 'movie') movie.push(c); else series.push(c);
      if (live.length + movie.length + series.length > 3000) break;
    }
    return { live, movie, series };
  }, [data, query, hidden]);
  const seriesEntries = useSeriesEntries(results.series);
  const zapIds = useMemo(() => results.live.map((c) => c.id), [results.live]);

  useEffect(() => {
    if (results.live.length === 0 && results.movie.length) setTab('movie');
    else if (results.live.length === 0 && results.movie.length === 0 && seriesEntries.length) setTab('series');
    else if (results.live.length) setTab('live');
  }, [results.live.length, results.movie.length, seriesEntries.length]);

  return (
    <div className="page">
      <div className="page-header">
        <h1>{t.search}</h1>
        <div className="grow" />
        <div className="search-box" style={{ width: 420 }}>
          <span className="ico"><Icon name="search" size={16} /></span>
          <input ref={inputRef} placeholder={t.searchPlaceholder} value={q} onChange={(e) => setQ(e.target.value)} />
          {q && <button className="iconbtn" style={{ width: 26, height: 26 }} onClick={() => setQ('')}><Icon name="x" size={14} /></button>}
        </div>
      </div>
      {query.length < 2 ? <div className="empty"><Icon name="search" size={40} className="ico" /><h3>{t.searchHint}</h3></div> : (<>
        <div style={{ padding: '0 20px 10px' }}>
          <div className="tabs" style={{ display: 'inline-flex' }}>
            <button className={tab === 'live' ? 'active' : ''} onClick={() => setTab('live')}>{t.live} ({results.live.length})</button>
            <button className={tab === 'movie' ? 'active' : ''} onClick={() => setTab('movie')}>{t.movies} ({results.movie.length})</button>
            <button className={tab === 'series' ? 'active' : ''} onClick={() => setTab('series')}>{t.series} ({seriesEntries.length})</button>
          </div>
        </div>
        {tab === 'live' ? (
          <div style={{ flex: 1, minHeight: 0, padding: '0 10px 10px' }}>
            {results.live.length === 0 ? <div className="empty"><h3>{t.noResults}</h3></div> : (
              <VirtualList items={results.live} itemHeight={56} keyOf={(c) => c.id} render={(c) => (
                <VisibleRow channel={c} active={c.id === current?.channelId} nowNext={nowNext[c.id]} onVisible={(id) => setVisible((v) => (v.includes(id) ? v : [...v.slice(-80), id]))}
                  onClick={() => { playChannel(c, zapIds, 'inline'); setPage('live'); }} onDoubleClick={() => playChannel(c, zapIds, 'full')} />
              )} />
            )}
          </div>
        ) : (
          <div className="page-body">
            <div className="poster-grid">
              {tab === 'movie' && results.movie.slice(0, 200).map((m) => <Poster key={m.id} channel={m} onClick={() => openDetail({ kind: 'movie', channel: m })} />)}
              {tab === 'series' && seriesEntries.slice(0, 200).map((e) => <Poster key={e.channel.id} channel={e.channel} onClick={() => openDetail({ kind: 'series', channel: e.channel, episodes: e.episodes })} />)}
            </div>
            {((tab === 'movie' && !results.movie.length) || (tab === 'series' && !seriesEntries.length)) && <div className="empty"><h3>{t.noResults}</h3></div>}
          </div>
        )}
      </>)}
    </div>
  );
}
