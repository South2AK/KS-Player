import React, { useEffect, useMemo, useState } from 'react';
import type { Channel } from '@shared/types';
import { useStore } from '@/store/app';
import { ALL, useCategories, useChannelList } from '@/lib/hooks';
import { useNowNext } from '@/lib/useEpg';
import { VirtualList } from '@/components/VirtualList';
import { ChannelRow } from '@/components/ChannelRow';
import { Player } from '@/components/Player';
import { Icon } from '@/components/Icon';
import { useContextMenu } from '@/components/ContextMenu';
import { CatchupModal } from '@/components/CatchupModal';
import { fmtTime, progress } from '@/lib/utils';
import { ChannelLogo } from '@/components/ChannelLogo';
import { CategoryList, selectionLabel } from '@/components/CategoryList';

export function LivePage() {
  const t = useStore((s) => s.t);
  const cats = useCategories('live');
  const category = useStore((s) => s.liveCategory) ?? ALL;
  const [q, setQ] = useState('');
  const channels = useChannelList('live', category, q);
  const current = useStore((s) => s.current);
  const playerView = useStore((s) => s.playerView);
  const playChannel = useStore((s) => s.playChannel);
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const favorites = useStore((s) => s.favorites);
  const epg = useStore((s) => s.epg);
  const [visible, setVisible] = useState<string[]>([]);
  const nowNext = useNowNext(visible);
  const ctx = useContextMenu();
  const [catchupFor, setCatchupFor] = useState<Channel | null>(null);
  const data = useStore((s) => s.data);

  const favCount = useMemo(() => (data ? data.channels.filter((c) => c.kind === 'live' && favorites.includes(c.id)).length : 0), [data, favorites]);
  const totalLive = useMemo(() => (data ? data.channels.filter((c) => c.kind === 'live').length : 0), [data]);

  const activeIdx = channels.findIndex((c) => c.id === current?.channelId);
  const zapIds = useMemo(() => channels.map((c) => c.id), [channels]);

  const onRowVisible = (id: string) => setVisible((v) => (v.includes(id) ? v : [...v.slice(-80), id]));

  const onContext = (e: React.MouseEvent, c: Channel) => {
    const fav = favorites.includes(c.id);
    const catId = c.kind + '|' + c.group;
    const locked = settings.lockedCategories.includes(catId);
    ctx.open(e, [
      { label: t.play, icon: 'play', onClick: () => playChannel(c, zapIds, 'full') },
      { label: fav ? t.removeFavorite : t.addFavorite, icon: 'heart', onClick: () => useStore.getState().toggleFavorite(c.id) },
      ...(c.catchupDays ? [{ label: t.catchup, icon: 'rewind', onClick: () => setCatchupFor(c) }] : []),
      { label: t.hideCategory, icon: 'eyeOff', onClick: () => updateSettings({ hiddenCategories: [...settings.hiddenCategories, catId] }) },
      ...(settings.parentalPin ? [{ label: locked ? t.unlockCategory : t.lockCategory, icon: locked ? 'unlock' : 'lock', onClick: async () => {
        if (!(await useStore.getState().requestPin())) return;
        updateSettings({ lockedCategories: locked ? settings.lockedCategories.filter((x) => x !== catId) : [...settings.lockedCategories, catId] });
      } }] : []),
    ]);
  };

  // Keep zap list in sync with the visible list when the current channel is in it
  useEffect(() => {
    if (current && current.live && activeIdx >= 0) useStore.setState({ zapList: zapIds });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zapIds]);

  const showPlayer = !!current && playerView === 'inline';
  const nn = current ? nowNext[current.channelId] : undefined;

  return (
    <div className="page">
      <div className={'live-layout' + (showPlayer ? '' : ' no-player')}>
        {/* categories */}
        <CategoryList kind="live" cats={cats} selected={category} onSelect={(sel) => useStore.setState({ liveCategory: sel })} total={totalLive} favCount={favCount} icon="tv" />

        {/* channels */}
        <div className="pane">
          <div className="pane-head">
            <span className="ellipsis">{selectionLabel(category, cats, t)}</span>
            <span className="count">{channels.length}</span>
            <span className="grow" />
            <select className="select" style={{ width: 'auto', padding: '3px 8px', fontSize: 12 }} value={settings.channelSort} onChange={(e) => updateSettings({ channelSort: e.target.value as any })} title={t.sortBy}>
              <option value="default">{t.sortDefault}</option><option value="az">{t.sortAZ}</option><option value="za">{t.sortZA}</option><option value="added">{t.sortAdded}</option>
            </select>
          </div>
          <div style={{ padding: '0 10px 8px' }}>
            <div className="search-box" style={{ height: 32 }}><span className="ico"><Icon name="search" size={14} /></span><input placeholder={t.search} value={q} onChange={(e) => setQ(e.target.value)} />{q && <button className="iconbtn" style={{ width: 24, height: 24 }} onClick={() => setQ('')}><Icon name="x" size={13} /></button>}</div>
          </div>
          <div className="pane-body" style={{ overflow: 'hidden' }}>
            {channels.length === 0 ? <div className="empty"><Icon name="tv" size={32} className="ico" /><h3>{t.noResults}</h3></div> : (
              <VirtualList
                items={channels}
                itemHeight={56}
                scrollToIndex={activeIdx}
                keyOf={(c) => c.id}
                render={(c) => (
                  <VisibleRow channel={c} active={c.id === current?.channelId} nowNext={nowNext[c.id]} onVisible={onRowVisible}
                    onClick={() => playChannel(c, zapIds, showPlayer || !current ? 'inline' : playerView)}
                    onDoubleClick={() => playChannel(c, zapIds, 'full')}
                    onContextMenu={(e) => onContext(e, c)} />
                )}
              />
            )}
          </div>
        </div>

        {/* player */}
        {showPlayer && (
          <div className="player-pane">
            <Player mode="inline" />
            <div className="player-info scroll" style={{ flex: 1 }}>
              <div className="now">
                <ChannelLogo src={current!.logo} name={current!.name} className="logo" />
                <div className="grow">
                  <div className="title">{current!.name}</div>
                  <div className="muted small">{current!.subtitle || current!.group}</div>
                </div>
                <button className="iconbtn" onClick={() => useStore.getState().setPlayerView('full')} title={t.fullscreen}><Icon name="fullscreen" /></button>
              </div>
              {nn?.[0] ? (
                <div className="prog">
                  <div className="muted small">{t.nowPlaying}</div>
                  <div className="t">{nn[0].title}</div>
                  <div className="time">{fmtTime(nn[0].start, settings.timeFormat, settings.language)} – {fmtTime(nn[0].stop, settings.timeFormat, settings.language)}</div>
                  {nn[0].desc && <div className="desc">{nn[0].desc}</div>}
                  <div className="bar"><i style={{ width: `${progress(nn[0]) * 100}%` }} /></div>
                </div>
              ) : current!.kind === 'live' ? (
                <div className="muted small">{epg?.loading ? t.epgLoading : t.noEpg}</div>
              ) : null}
              {nn?.[1] && (
                <div className="prog">
                  <div className="muted small">{t.next}</div>
                  <div className="t">{nn[1].title}</div>
                  <div className="time">{fmtTime(nn[1].start, settings.timeFormat, settings.language)} – {fmtTime(nn[1].stop, settings.timeFormat, settings.language)}</div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      {ctx.el}
      {catchupFor && <CatchupModal channel={catchupFor} onClose={() => setCatchupFor(null)} />}
    </div>
  );
}

export function VisibleRow(props: React.ComponentProps<typeof ChannelRow> & { onVisible: (id: string) => void }) {
  const { onVisible, ...rest } = props;
  useEffect(() => { onVisible(rest.channel.id); }, [rest.channel.id, onVisible]);
  return <ChannelRow {...rest} />;
}
