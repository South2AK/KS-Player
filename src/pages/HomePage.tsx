import React, { useMemo } from 'react';
import { useStore } from '@/store/app';
import { Icon } from '@/components/Icon';
import { ChannelLogo } from '@/components/ChannelLogo';
import { useNowNext } from '@/lib/useEpg';
import { fmtDuration, fmtDate, groupSeries } from '@/lib/utils';
import { Poster } from './MoviesPage';
import { useSeriesEntries } from './SeriesPage';

export function HomePage() {
  const t = useStore((s) => s.t);
  const data = useStore((s) => s.data);
  const playlists = useStore((s) => s.playlists);
  const activeId = useStore((s) => s.activePlaylistId);
  const favorites = useStore((s) => s.favorites);
  const history = useStore((s) => s.history);
  const resume = useStore((s) => s.resume);
  const playChannel = useStore((s) => s.playChannel);
  const play = useStore((s) => s.play);
  const openDetail = useStore((s) => s.openDetail);
  const setPage = useStore((s) => s.setPage);
  const loading = useStore((s) => s.loading);
  const loadError = useStore((s) => s.loadError);
  const pl = playlists.find((p) => p.id === activeId);

  const stats = useMemo(() => {
    if (!data) return { live: 0, movies: 0, series: 0 };
    let live = 0, movies = 0;
    for (const c of data.channels) { if (c.kind === 'live') live++; else if (c.kind === 'movie') movies++; }
    return { live, movies, series: groupSeries(data.channels).size };
  }, [data]);

  const favLive = useMemo(() => (data ? data.channels.filter((c) => c.kind === 'live' && favorites.includes(c.id)).slice(0, 12) : []), [data, favorites]);
  const favIds = useMemo(() => favLive.map((c) => c.id), [favLive]);
  const nowNext = useNowNext(favIds);
  const byId = useMemo(() => new Map(data?.channels.map((c) => [c.id, c]) || []), [data]);

  const continueList = useMemo(() => {
    return history
      .filter((h) => h.playlistId === activeId && h.kind !== 'live')
      .map((h) => {
        const key = h.episodeTitle ? Object.keys(resume).find((k) => k.startsWith('ep:') && resume[k] && h.url && k) : h.channelId;
        return { h, r: key ? resume[key] : undefined };
      })
      .filter((x) => x.h.kind === 'movie' ? resume[x.h.channelId] : true)
      .slice(0, 12);
  }, [history, resume, activeId]);

  const recentLive = useMemo(() => history.filter((h) => h.playlistId === activeId && h.kind === 'live').slice(0, 10), [history, activeId]);
  const newMovies = useMemo(() => (data ? [...data.channels.filter((c) => c.kind === 'movie' && c.added)].sort((a, b) => (b.added || 0) - (a.added || 0)).slice(0, 14) : []), [data]);
  const seriesRaw = useMemo(() => (data ? [...data.channels.filter((c) => c.kind === 'series' && c.added)].sort((a, b) => (b.added || 0) - (a.added || 0)).slice(0, 14) : []), [data]);
  const newSeries = useSeriesEntries(seriesRaw);

  if (!pl) {
    return (
      <div className="page"><div className="page-body">
        <div className="empty" style={{ paddingTop: 120 }}>
          <Icon name="layers" size={48} className="ico" />
          <h3>{t.noPlaylists}</h3>
          <p>{t.noPlaylistsHint}</p>
          <button className="btn primary" onClick={() => setPage('playlists')}><Icon name="plus" size={16} />{t.addPlaylist}</button>
        </div>
      </div></div>
    );
  }

  return (
    <div className="page">
      <div className="page-body" style={{ paddingTop: 20 }}>
        <div className="hero">
          <div className="grow">
            <h2>{pl.name}</h2>
            <p>{pl.type === 'xtream' ? t.xtream : pl.type === 'file' ? t.localFile : t.m3uUrl}{pl.expiresAt ? ` · ${t.expires}: ${fmtDate(pl.expiresAt)}` : ''}</p>
            {loading ? <div className="row" style={{ marginTop: 12 }}><div className="spinner" /><span className="muted2">{t.loadingPlaylist}</span></div> : loadError ? (
              <div className="row" style={{ marginTop: 12, color: 'var(--danger)' }}><Icon name="info" size={16} />{t.loadError}: {loadError}</div>
            ) : (
              <div className="stats">
                <div className="stat" onClick={() => setPage('live')} style={{ cursor: 'pointer' }}><b>{stats.live}</b><span>{t.live}</span></div>
                <div className="stat" onClick={() => setPage('movies')} style={{ cursor: 'pointer' }}><b>{stats.movies}</b><span>{t.movies}</span></div>
                <div className="stat" onClick={() => setPage('series')} style={{ cursor: 'pointer' }}><b>{stats.series}</b><span>{t.series}</span></div>
              </div>
            )}
          </div>
          <button className="btn" onClick={() => setPage('live')}><Icon name="tv" size={16} />{t.live}</button>
          <button className="btn" onClick={() => setPage('epg')}><Icon name="guide" size={16} />{t.epg}</button>
        </div>

        {continueList.length > 0 && (<>
          <div className="section-title">{t.continueWatching}</div>
          <div className="h-scroll">
            {continueList.map(({ h }) => {
              const ch = byId.get(h.channelId);
              const r = h.kind === 'movie' ? resume[h.channelId] : undefined;
              return (
                <div key={h.channelId + (h.episodeTitle || '')} className="tile" style={{ width: 260 }} onClick={() => {
                  if (ch && h.kind === 'series') openDetail({ kind: 'series', channel: ch, episodes: data?.channels.filter((c) => c.kind === 'series' && !c.seriesId && (c.seriesTitle || c.name) === (ch.seriesTitle || ch.name)) });
                  else if (ch) openDetail({ kind: 'movie', channel: ch });
                  else play({ id: h.channelId, channelId: h.channelId, playlistId: h.playlistId, name: h.name, logo: h.logo, url: h.url, kind: h.kind, live: false, subtitle: h.episodeTitle });
                }}>
                  <ChannelLogo src={h.logo} name={h.name} className="logo" />
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="name ellipsis">{h.name}</div>
                    <div className="sub ellipsis">{h.episodeTitle || (r ? `${fmtDuration(r.position)} / ${fmtDuration(r.duration)}` : '')}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </>)}

        {favLive.length > 0 && (<>
          <div className="section-title">{t.favoriteChannels}<span className="count">{favorites.length}</span></div>
          <div className="h-scroll">
            {favLive.map((c) => (
              <div key={c.id} className="tile" onClick={() => { playChannel(c, favIds, 'inline'); setPage('live'); }}>
                <ChannelLogo src={c.logo} name={c.name} className="logo" />
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="name ellipsis">{c.name}</div>
                  <div className="sub ellipsis">{nowNext[c.id]?.[0]?.title || c.group}</div>
                </div>
              </div>
            ))}
          </div>
        </>)}

        {recentLive.length > 0 && (<>
          <div className="section-title">{t.recentlyWatched}</div>
          <div className="h-scroll">
            {recentLive.map((h) => {
              const ch = byId.get(h.channelId);
              return (
                <div key={h.channelId} className="tile" onClick={() => { if (ch) { playChannel(ch, undefined, 'inline'); setPage('live'); } }}>
                  <ChannelLogo src={h.logo} name={h.name} className="logo" />
                  <div className="grow" style={{ minWidth: 0 }}><div className="name ellipsis">{h.name}</div><div className="sub ellipsis">{ch?.group || ''}</div></div>
                </div>
              );
            })}
          </div>
        </>)}

        {newMovies.length > 0 && (<>
          <div className="section-title">{t.recentlyAdded} · {t.movies}</div>
          <div className="h-scroll">{newMovies.map((m) => <Poster key={m.id} channel={m} onClick={() => openDetail({ kind: 'movie', channel: m })} />)}</div>
        </>)}
        {newSeries.length > 0 && (<>
          <div className="section-title">{t.recentlyAdded} · {t.series}</div>
          <div className="h-scroll">{newSeries.map((e) => <Poster key={e.channel.id} channel={e.channel} onClick={() => openDetail({ kind: 'series', channel: e.channel, episodes: e.episodes })} />)}</div>
        </>)}
      </div>
    </div>
  );
}
