import React, { useEffect, useMemo, useState } from 'react';
import type { Channel, Episode, SeriesInfo, VodInfo } from '@shared/types';
import { useStore } from '@/store/app';
import { api } from '@/lib/api';
import { fmtDuration } from '@/lib/utils';
import { Modal } from './Modal';
import { Icon } from './Icon';

export function DetailModal() {
  const detail = useStore((s) => s.detail);
  const close = () => useStore.getState().openDetail(null);
  if (!detail) return null;
  return detail.kind === 'movie' ? <MovieDetail channel={detail.channel} onClose={close} /> : <SeriesDetail channel={detail.channel} episodes={detail.episodes} onClose={close} />;
}

function Meta({ info }: { info: { genre?: string; releaseDate?: string; year?: string; rating?: string; duration?: string; director?: string; cast?: string } }) {
  const t = useStore((s) => s.t);
  const rows: [string, string | undefined][] = [
    [t.genre, info.genre], [t.released, info.releaseDate || info.year], [t.rating, info.rating], [t.duration, info.duration], [t.director, info.director], [t.cast, info.cast],
  ];
  const shown = rows.filter(([, v]) => v);
  if (!shown.length) return null;
  return <dl>{shown.map(([k, v]) => <React.Fragment key={k}><dt>{k}</dt><dd>{v}</dd></React.Fragment>)}</dl>;
}

function MovieDetail({ channel, onClose }: { channel: Channel; onClose: () => void }) {
  const t = useStore((s) => s.t);
  const playlistId = useStore((s) => s.activePlaylistId)!;
  const play = useStore((s) => s.play);
  const resume = useStore((s) => s.resume[channel.id]);
  const fav = useStore((s) => s.favorites.includes(channel.id));
  const toggleFav = useStore((s) => s.toggleFavorite);
  const [info, setInfo] = useState<VodInfo | null>(null);
  useEffect(() => {
    if (channel.streamId !== undefined && channel.id.startsWith('xv')) {
      api().playlists.xtreamVodInfo(playlistId, channel.streamId).then(setInfo).catch(() => {});
    }
  }, [channel, playlistId]);
  const start = (fromStart: boolean) => {
    if (fromStart) useStore.getState().setResume(channel.id, null);
    onClose();
    play({ id: channel.id, channelId: channel.id, playlistId, name: channel.name, logo: channel.logo, url: info?.url || channel.url, kind: 'movie', live: false, group: channel.group }, undefined, 'full');
  };
  const cover = info?.cover || channel.logo;
  const backdrop = info?.backdrop || channel.backdrop;
  return (
    <Modal wide onClose={onClose} title={<span className="ellipsis">{channel.name}</span>} headExtra={
      <button className={'iconbtn' + (fav ? ' active' : '')} onClick={() => toggleFav(channel.id)} style={fav ? { color: 'var(--danger)' } : undefined}><Icon name="heart" fill={fav} /></button>
    }>
      <div className="detail" style={{ position: 'relative' }}>
        {backdrop && <div className="backdrop" style={{ backgroundImage: `url(${backdrop})` }} />}
        <div>{cover ? <img className="cover" src={cover} alt="" /> : <div className="cover" />}</div>
        <div style={{ position: 'relative' }}>
          <h2>{info?.name || channel.name}</h2>
          <div className="meta">
            {(info?.rating || channel.rating) && <span className="chip"><Icon name="star" size={12} /> {info?.rating || channel.rating}</span>}
            {(info?.releaseDate || channel.year) && <span className="chip">{(info?.releaseDate || channel.year || '').slice(0, 4)}</span>}
            {channel.ext && <span className="chip">{channel.ext.toUpperCase()}</span>}
            <span className="chip">{channel.group}</span>
          </div>
          <div className="row" style={{ gap: 8, margin: '8px 0 14px' }}>
            {resume && resume.position > 30 ? (<>
              <button className="btn primary" onClick={() => start(false)}><Icon name="play" fill size={16} />{t.resume} · {fmtDuration(resume.position)}</button>
              <button className="btn" onClick={() => start(true)}><Icon name="refresh" size={16} />{t.restart}</button>
            </>) : (
              <button className="btn primary" onClick={() => start(true)}><Icon name="play" fill size={16} />{t.play}</button>
            )}
          </div>
          {(info?.plot || channel.plot) && <div className="plot">{info?.plot || channel.plot}</div>}
          <Meta info={{ genre: info?.genre || channel.genre, releaseDate: info?.releaseDate, year: channel.year, rating: info?.rating || channel.rating, duration: info?.duration, director: info?.director, cast: info?.cast }} />
        </div>
      </div>
    </Modal>
  );
}

function SeriesDetail({ channel, episodes, onClose }: { channel: Channel; episodes?: Channel[]; onClose: () => void }) {
  const t = useStore((s) => s.t);
  const playlistId = useStore((s) => s.activePlaylistId)!;
  const play = useStore((s) => s.play);
  const resumeMap = useStore((s) => s.resume);
  const fav = useStore((s) => s.favorites.includes(channel.id));
  const toggleFav = useStore((s) => s.toggleFavorite);
  const [info, setInfo] = useState<SeriesInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [season, setSeason] = useState<number | null>(null);

  const isXtream = channel.seriesId !== undefined && channel.id.startsWith('xs');
  useEffect(() => {
    if (!isXtream) return;
    setLoading(true);
    api().playlists.xtreamSeriesInfo(playlistId, channel.seriesId!).then(setInfo).catch((e) => setError(e?.message || String(e))).finally(() => setLoading(false));
  }, [channel, playlistId, isXtream]);

  const seasons = useMemo(() => {
    if (info) return info.seasons;
    const map = new Map<number, Episode[]>();
    const out: SeriesInfo['seasons'] = [];
    for (const e of episodes || []) {
      const s = e.season ?? 1;
      (map.get(s) || map.set(s, []).get(s)!).push({ id: e.id, title: e.name, season: s, episode: e.episode ?? 0, url: e.url, logo: e.logo });
    }
    for (const [s, eps] of [...map.entries()].sort((a, b) => a[0] - b[0])) out.push({ season: s, episodes: eps.sort((a, b) => a.episode - b.episode) });
    return out;
  }, [info, episodes]);

  useEffect(() => { if (season === null && seasons.length) setSeason(seasons[0].season); }, [seasons, season]);
  const cur = seasons.find((s) => s.season === season);
  const seriesKey = channel.id;

  const playEp = (ep: Episode) => {
    onClose();
    play({
      id: 'ep:' + ep.id, channelId: channel.id, playlistId, name: channel.name, logo: info?.cover || channel.logo, url: ep.url, kind: 'series', live: false, group: channel.group,
      subtitle: `S${String(ep.season).padStart(2, '0')}E${String(ep.episode).padStart(2, '0')} · ${ep.title}`, seriesKey,
    }, undefined, 'full');
  };

  const cover = info?.cover || channel.logo;
  const backdrop = info?.backdrop || channel.backdrop;
  return (
    <Modal wide onClose={onClose} title={<span className="ellipsis">{channel.name}</span>} headExtra={
      <button className={'iconbtn' + (fav ? ' active' : '')} onClick={() => toggleFav(channel.id)} style={fav ? { color: 'var(--danger)' } : undefined}><Icon name="heart" fill={fav} /></button>
    }>
      <div className="detail" style={{ position: 'relative' }}>
        {backdrop && <div className="backdrop" style={{ backgroundImage: `url(${backdrop})` }} />}
        <div>{cover ? <img className="cover" src={cover} alt="" /> : <div className="cover" />}</div>
        <div style={{ position: 'relative', minWidth: 0 }}>
          <h2>{info?.name || channel.name}</h2>
          <div className="meta">
            {(info?.rating || channel.rating) && <span className="chip"><Icon name="star" size={12} /> {info?.rating || channel.rating}</span>}
            {(info?.releaseDate || channel.year) && <span className="chip">{(info?.releaseDate || channel.year || '').slice(0, 4)}</span>}
            <span className="chip">{seasons.length} {t.seasons}</span>
            <span className="chip">{channel.group}</span>
          </div>
          {(info?.plot || channel.plot) && <div className="plot">{info?.plot || channel.plot}</div>}
          <Meta info={{ genre: info?.genre || channel.genre, releaseDate: info?.releaseDate, rating: undefined, director: info?.director, cast: info?.cast }} />
          {loading && <div className="row" style={{ justifyContent: 'center', padding: 20 }}><div className="spinner" /></div>}
          {error && <div style={{ color: 'var(--danger)' }}>{error}</div>}
          {seasons.length > 0 && (
            <div className="tabs" style={{ overflowX: 'auto', marginBottom: 8 }}>
              {seasons.map((s) => <button key={s.season} className={s.season === season ? 'active' : ''} onClick={() => setSeason(s.season)}>{s.name || `${t.season} ${s.season}`}</button>)}
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: '40vh', overflow: 'auto' }}>
            {cur?.episodes.map((ep) => {
              const r = resumeMap['ep:' + ep.id];
              return (
                <div key={ep.id} className="episode-row" onClick={() => playEp(ep)}>
                  <div className="num">{ep.episode}</div>
                  {ep.logo ? <img className="thumb" src={ep.logo} alt="" loading="lazy" /> : <div className="thumb" />}
                  <div className="meta">
                    <div className="t">{ep.title}</div>
                    <div className="p">{ep.plot || (ep.duration ? ep.duration : '')}</div>
                  </div>
                  {r && r.duration > 0 && <div className="progress"><i style={{ width: `${(r.position / r.duration) * 100}%` }} /></div>}
                  <Icon name="play" size={16} className="muted" />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Modal>
  );
}
