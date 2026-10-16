import React from 'react';
import { useStore, type Page } from '@/store/app';
import { Icon } from './Icon';
import { ChannelLogo } from './ChannelLogo';

const NAV: { page: Page; icon: string; key: 'home' | 'live' | 'movies' | 'series' | 'favorites' | 'history' | 'epg' | 'search' | 'multiview' }[] = [
  { page: 'home', icon: 'home', key: 'home' },
  { page: 'live', icon: 'tv', key: 'live' },
  { page: 'movies', icon: 'film', key: 'movies' },
  { page: 'series', icon: 'series', key: 'series' },
  { page: 'epg', icon: 'guide', key: 'epg' },
  { page: 'favorites', icon: 'heart', key: 'favorites' },
  { page: 'history', icon: 'history', key: 'history' },
  { page: 'search', icon: 'search', key: 'search' },
  { page: 'multiview', icon: 'grid', key: 'multiview' },
];

export function Sidebar() {
  const page = useStore((s) => s.page);
  const setPage = useStore((s) => s.setPage);
  const t = useStore((s) => s.t);
  const current = useStore((s) => s.current);
  const setPlayerView = useStore((s) => s.setPlayerView);
  const hasData = useStore((s) => !!s.data);

  return (
    <nav className="sidebar">
      {NAV.map((n) => (
        <button key={n.page} className={'nav-btn' + (page === n.page ? ' active' : '')} onClick={() => setPage(n.page)} disabled={!hasData && n.page !== 'home'}>
          <span className="ico"><Icon name={n.icon} /></span>
          {t[n.key]}
        </button>
      ))}
      <div className="grow" />
      {current && (
        <div className="now-card" onClick={() => setPlayerView('full')} title={t.nowPlaying}>
          <ChannelLogo src={current.logo} name={current.name} className="thumb" />
          <div className="meta">
            <div className="name">{current.name}</div>
            <div className="sub">{current.subtitle || (current.live ? t.liveTag : t.nowPlaying)}</div>
          </div>
        </div>
      )}
      <button className={'nav-btn' + (page === 'playlists' ? ' active' : '')} onClick={() => setPage('playlists')}>
        <span className="ico"><Icon name="layers" /></span>{t.playlists}
      </button>
      <button className={'nav-btn' + (page === 'settings' ? ' active' : '')} onClick={() => setPage('settings')}>
        <span className="ico"><Icon name="settings" /></span>{t.settings}
      </button>
    </nav>
  );
}
