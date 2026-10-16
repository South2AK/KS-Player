import React, { useMemo, useState } from 'react';
import type { Channel } from '@shared/types';
import { useStore } from '@/store/app';
import { ALL, useCategories, useChannelList } from '@/lib/hooks';
import { Icon } from '@/components/Icon';
import { CategoryList } from '@/components/CategoryList';
import { cleanTitle } from '@/lib/utils';

export function Poster({ channel, sub, onClick, onContextMenu }: { channel: Channel; sub?: string; onClick: () => void; onContextMenu?: (e: React.MouseEvent) => void }) {
  const fav = useStore((s) => s.favorites.includes(channel.id));
  const toggleFav = useStore((s) => s.toggleFavorite);
  const resume = useStore((s) => s.resume[channel.id]);
  const [failed, setFailed] = useState(false);
  const rating = channel.rating ? parseFloat(channel.rating) : NaN;
  return (
    <div className="poster" onClick={onClick} onContextMenu={onContextMenu} title={channel.name}>
      <div className="img">
        {channel.logo && !failed ? <img src={channel.logo} alt="" loading="lazy" onError={() => setFailed(true)} draggable={false} /> : <div className="ph">{cleanTitle(channel.name).slice(0, 1).toUpperCase()}</div>}
        {!isNaN(rating) && rating > 0 && <span className="rating">★ {rating.toFixed(1)}</span>}
        <button className={'fav' + (fav ? ' on' : '')} onClick={(e) => { e.stopPropagation(); toggleFav(channel.id); }}><Icon name="heart" size={16} fill={fav} /></button>
        {resume && resume.duration > 0 && <div className="progress"><i style={{ width: `${(resume.position / resume.duration) * 100}%` }} /></div>}
      </div>
      <div className="name">{cleanTitle(channel.name)}</div>
      {(sub || channel.year) && <div className="sub">{sub || channel.year}</div>}
    </div>
  );
}

export function CategorySidebar({ kind, category, onSelect, total }: { kind: 'movie' | 'series'; category: string | string[]; onSelect: (sel: string | string[]) => void; total: number }) {
  const cats = useCategories(kind);
  const favorites = useStore((s) => s.favorites);
  const data = useStore((s) => s.data);
  const favCount = useMemo(() => (data ? data.channels.filter((c) => c.kind === kind && favorites.includes(c.id)).length : 0), [data, favorites, kind]);
  return <CategoryList kind={kind} cats={cats} selected={category} onSelect={(sel) => onSelect(sel ?? ALL)} total={total} favCount={favCount} icon={kind === 'movie' ? 'film' : 'series'} />;
}

export function MoviesPage() {
  const t = useStore((s) => s.t);
  const category = useStore((s) => s.movieCategory) ?? ALL;
  const [q, setQ] = useState('');
  const movies = useChannelList('movie', category, q);
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const openDetail = useStore((s) => s.openDetail);
  const data = useStore((s) => s.data);
  const total = useMemo(() => (data ? data.channels.filter((c) => c.kind === 'movie').length : 0), [data]);
  const [limit, setLimit] = useState(120);
  const shown = movies.slice(0, limit);

  return (
    <div className="page">
      <div className="vod-layout">
        <CategorySidebar kind="movie" category={category} total={total} onSelect={(id) => { useStore.setState({ movieCategory: id }); setLimit(120); }} />
        <div className="page" style={{ minWidth: 0 }}>
          <div className="page-header">
            <h1>{t.movies}</h1>
            <span className="sub">{movies.length} {t.items}</span>
            <div className="grow" />
            <div className="search-box" style={{ width: 280 }}><span className="ico"><Icon name="search" size={15} /></span><input placeholder={t.search} value={q} onChange={(e) => { setQ(e.target.value); setLimit(120); }} /></div>
            <select className="select" style={{ width: 'auto' }} value={settings.vodSort} onChange={(e) => updateSettings({ vodSort: e.target.value as any })}>
              <option value="default">{t.sortDefault}</option><option value="az">{t.sortAZ}</option><option value="za">{t.sortZA}</option><option value="added">{t.sortAdded}</option><option value="rating">{t.sortRating}</option>
            </select>
          </div>
          <div className="page-body" onScroll={(e) => { const el = e.currentTarget; if (el.scrollTop + el.clientHeight > el.scrollHeight - 600 && limit < movies.length) setLimit((l) => l + 120); }}>
            {movies.length === 0 ? <div className="empty"><Icon name="film" size={36} className="ico" /><h3>{t.noResults}</h3></div> : (
              <div className="poster-grid">
                {shown.map((m) => <Poster key={m.id} channel={m} onClick={() => openDetail({ kind: 'movie', channel: m })} />)}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
