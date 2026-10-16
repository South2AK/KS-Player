import React, { useMemo, useState } from 'react';
import { useStore } from '@/store/app';
import { Icon } from '@/components/Icon';
import { VirtualList } from '@/components/VirtualList';
import { useNowNext } from '@/lib/useEpg';
import { VisibleRow } from './LivePage';
import { Poster } from './MoviesPage';
import { useSeriesEntries } from './SeriesPage';

export function FavoritesPage() {
  const t = useStore((s) => s.t);
  const data = useStore((s) => s.data);
  const favorites = useStore((s) => s.favorites);
  const current = useStore((s) => s.current);
  const playChannel = useStore((s) => s.playChannel);
  const openDetail = useStore((s) => s.openDetail);
  const setPage = useStore((s) => s.setPage);
  const [tab, setTab] = useState<'live' | 'movie' | 'series'>('live');
  const [visible, setVisible] = useState<string[]>([]);
  const nowNext = useNowNext(visible);

  const live = useMemo(() => (data ? data.channels.filter((c) => c.kind === 'live' && favorites.includes(c.id)) : []), [data, favorites]);
  const movies = useMemo(() => (data ? data.channels.filter((c) => c.kind === 'movie' && favorites.includes(c.id)) : []), [data, favorites]);
  const seriesRaw = useMemo(() => (data ? data.channels.filter((c) => c.kind === 'series') : []), [data]);
  const seriesAll = useSeriesEntries(seriesRaw);
  const series = useMemo(() => seriesAll.filter((e) => favorites.includes(e.channel.id)), [seriesAll, favorites]);
  const zapIds = useMemo(() => live.map((c) => c.id), [live]);
  const empty = live.length + movies.length + series.length === 0;

  return (
    <div className="page">
      <div className="page-header">
        <h1>{t.favorites}</h1>
        <div className="grow" />
        <div className="tabs">
          <button className={tab === 'live' ? 'active' : ''} onClick={() => setTab('live')}>{t.live} ({live.length})</button>
          <button className={tab === 'movie' ? 'active' : ''} onClick={() => setTab('movie')}>{t.movies} ({movies.length})</button>
          <button className={tab === 'series' ? 'active' : ''} onClick={() => setTab('series')}>{t.series} ({series.length})</button>
        </div>
      </div>
      {empty ? <div className="empty"><Icon name="heart" size={40} className="ico" /><h3>{t.noFavorites}</h3></div> : tab === 'live' ? (
        <div style={{ flex: 1, minHeight: 0, padding: '0 10px 10px' }}>
          {live.length === 0 ? <div className="empty"><h3>{t.noResults}</h3></div> : (
            <VirtualList items={live} itemHeight={56} keyOf={(c) => c.id} render={(c) => (
              <VisibleRow channel={c} active={c.id === current?.channelId} nowNext={nowNext[c.id]} onVisible={(id) => setVisible((v) => (v.includes(id) ? v : [...v.slice(-80), id]))}
                onClick={() => { playChannel(c, zapIds, 'inline'); setPage('live'); }} onDoubleClick={() => playChannel(c, zapIds, 'full')} />
            )} />
          )}
        </div>
      ) : (
        <div className="page-body">
          <div className="poster-grid">
            {tab === 'movie' && movies.map((m) => <Poster key={m.id} channel={m} onClick={() => openDetail({ kind: 'movie', channel: m })} />)}
            {tab === 'series' && series.map((e) => <Poster key={e.channel.id} channel={e.channel} onClick={() => openDetail({ kind: 'series', channel: e.channel, episodes: e.episodes })} />)}
          </div>
          {((tab === 'movie' && !movies.length) || (tab === 'series' && !series.length)) && <div className="empty"><h3>{t.noResults}</h3></div>}
        </div>
      )}
    </div>
  );
}
