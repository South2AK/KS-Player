import React, { useMemo, useState } from 'react';
import type { Channel } from '@shared/types';
import { useStore } from '@/store/app';
import { ALL, FAV, useChannelList } from '@/lib/hooks';
import { Icon } from '@/components/Icon';
import { CategorySidebar, Poster } from './MoviesPage';
import { groupSeries } from '@/lib/utils';

export interface SeriesEntry { channel: Channel; episodes: Channel[] }

/** Collapses M3U episodes into one entry per series; Xtream series are already one entry each. */
export function useSeriesEntries(list: Channel[]): SeriesEntry[] {
  return useMemo(() => {
    const groups = groupSeries(list);
    const out: SeriesEntry[] = [];
    for (const eps of groups.values()) {
      const first = eps[0];
      if (first.seriesId !== undefined) { out.push({ channel: first, episodes: [] }); continue; }
      const rep: Channel = { ...first, name: first.seriesTitle || first.name, id: 'ms:' + (first.group + '|' + (first.seriesTitle || first.name)).toLowerCase() };
      out.push({ channel: rep, episodes: eps });
    }
    return out;
  }, [list]);
}

export function SeriesPage() {
  const t = useStore((s) => s.t);
  const category = useStore((s) => s.seriesCategory) ?? ALL;
  const [q, setQ] = useState('');
  const raw = useChannelList('series', category === FAV ? ALL : category, q);
  const entries = useSeriesEntries(raw);
  const favorites = useStore((s) => s.favorites);
  const list = category === FAV ? entries.filter((e) => favorites.includes(e.channel.id)) : entries;
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const openDetail = useStore((s) => s.openDetail);
  const data = useStore((s) => s.data);
  const total = useMemo(() => (data ? groupSeries(data.channels).size : 0), [data]);
  const [limit, setLimit] = useState(120);

  return (
    <div className="page">
      <div className="vod-layout">
        <CategorySidebar kind="series" category={category} total={total} onSelect={(id) => { useStore.setState({ seriesCategory: id }); setLimit(120); }} />
        <div className="page" style={{ minWidth: 0 }}>
          <div className="page-header">
            <h1>{t.series}</h1>
            <span className="sub">{list.length} {t.items}</span>
            <div className="grow" />
            <div className="search-box" style={{ width: 280 }}><span className="ico"><Icon name="search" size={15} /></span><input placeholder={t.search} value={q} onChange={(e) => { setQ(e.target.value); setLimit(120); }} /></div>
            <select className="select" style={{ width: 'auto' }} value={settings.vodSort} onChange={(e) => updateSettings({ vodSort: e.target.value as any })}>
              <option value="default">{t.sortDefault}</option><option value="az">{t.sortAZ}</option><option value="za">{t.sortZA}</option><option value="added">{t.sortAdded}</option><option value="rating">{t.sortRating}</option>
            </select>
          </div>
          <div className="page-body" onScroll={(e) => { const el = e.currentTarget; if (el.scrollTop + el.clientHeight > el.scrollHeight - 600 && limit < list.length) setLimit((l) => l + 120); }}>
            {list.length === 0 ? <div className="empty"><Icon name="series" size={36} className="ico" /><h3>{t.noResults}</h3></div> : (
              <div className="poster-grid">
                {list.slice(0, limit).map((e) => (
                  <Poster key={e.channel.id} channel={e.channel} sub={e.episodes.length ? `${e.episodes.length} ${t.episodes}` : undefined} onClick={() => openDetail({ kind: 'series', channel: e.channel, episodes: e.episodes })} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
