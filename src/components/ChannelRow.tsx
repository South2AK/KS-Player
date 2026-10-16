import React from 'react';
import type { Channel } from '@shared/types';
import type { NowNext } from '@/lib/useEpg';
import { useStore } from '@/store/app';
import { fmtTime, progress } from '@/lib/utils';
import { ChannelLogo } from './ChannelLogo';
import { Icon } from './Icon';

interface Props {
  channel: Channel;
  active?: boolean;
  nowNext?: NowNext;
  onClick: () => void;
  onDoubleClick?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  showNumber?: boolean;
  dark?: boolean;
}

export const ChannelRow = React.memo(function ChannelRow({ channel, active, nowNext, onClick, onDoubleClick, onContextMenu, showNumber = true }: Props) {
  const fav = useStore((s) => s.favorites.includes(channel.id));
  const toggleFav = useStore((s) => s.toggleFavorite);
  const settings = useStore((s) => s.settings);
  const now = nowNext?.[0];
  return (
    <div className={'ch-row' + (active ? ' active' : '')} onClick={onClick} onDoubleClick={onDoubleClick} onContextMenu={onContextMenu} title={channel.name}>
      {showNumber && settings.showChannelNumbers && <div className="num">{channel.number ?? ''}</div>}
      <ChannelLogo src={channel.logo} name={channel.name} />
      <div className="meta">
        <div className="name">{channel.name}</div>
        {now ? (
          <div className="epg">
            <span className="bar"><i style={{ width: `${progress(now) * 100}%` }} /></span>
            <span className="ellipsis">{fmtTime(now.start, settings.timeFormat, settings.language)} {now.title}</span>
          </div>
        ) : channel.catchupDays ? (
          <div className="epg"><span className="catchup-tag">CATCH-UP {channel.catchupDays}d</span></div>
        ) : null}
      </div>
      <div className={'actions' + (fav ? ' on' : '')}>
        <button className={'iconbtn' + (fav ? ' fav' : '')} style={{ width: 28, height: 28 }} onClick={(e) => { e.stopPropagation(); toggleFav(channel.id); }} title={fav ? 'Favorit entfernen' : 'Favorit'}>
          <Icon name="heart" size={15} fill={fav} />
        </button>
      </div>
    </div>
  );
});
