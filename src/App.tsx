import React, { useEffect, useRef, useState } from 'react';
import { useStore } from '@/store/app';
import { engine } from '@/lib/engine';
import { api } from '@/lib/api';
import { TitleBar } from '@/components/TitleBar';
import { Sidebar } from '@/components/Sidebar';
import { Player } from '@/components/Player';
import { Toasts } from '@/components/Toast';
import { PinDialog } from '@/components/PinDialog';
import { DetailModal } from '@/components/DetailModal';
import { HomePage } from '@/pages/HomePage';
import { LivePage } from '@/pages/LivePage';
import { MoviesPage } from '@/pages/MoviesPage';
import { SeriesPage } from '@/pages/SeriesPage';
import { FavoritesPage } from '@/pages/FavoritesPage';
import { HistoryPage } from '@/pages/HistoryPage';
import { EpgPage } from '@/pages/EpgPage';
import { SearchPage } from '@/pages/SearchPage';
import { MultiViewPage } from '@/pages/MultiViewPage';
import { PlaylistsPage } from '@/pages/PlaylistsPage';
import { SettingsPage } from '@/pages/SettingsPage';

export function App() {
  const ready = useStore((s) => s.ready);
  const page = useStore((s) => s.page);
  const current = useStore((s) => s.current);
  const playerView = useStore((s) => s.playerView);
  const data = useStore((s) => s.data);
  const t = useStore((s) => s.t);
  const [zapInput, setZapInput] = useState('');
  const zapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { useStore.getState().init().catch((e) => console.error(e)); }, []);

  // Sleep timer
  useEffect(() => {
    const i = setInterval(() => {
      const s = useStore.getState();
      if (s.sleepUntil && Date.now() >= s.sleepUntil) {
        s.stop();
        s.setSleep(0);
        s.toast(t.sleepTimer + ': ' + t.stop);
      }
    }, 15_000);
    return () => clearInterval(i);
  }, [t]);

  // Global keyboard shortcuts
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const s = useStore.getState();
      const target = e.target as HTMLElement | null;
      const typing = !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable);
      if (s.pinPrompt || s.detail) return;
      const full = s.current && s.playerView === 'full';
      if (typing && !(e.key === 'Escape')) return;

      if (/^\d$/.test(e.key) && s.current?.live && s.data && !typing) {
        e.preventDefault();
        const next = (zapInput + e.key).slice(-4);
        setZapInput(next);
        if (zapTimer.current) clearTimeout(zapTimer.current);
        zapTimer.current = setTimeout(() => { s.zapTo(parseInt(next, 10)); setZapInput(''); }, 1500);
        return;
      }
      switch (e.key) {
        case ' ': case 'k':
          if (s.current) { e.preventDefault(); engine.togglePlay(); }
          break;
        case 'f': case 'F':
          if (s.current) { e.preventDefault(); if (s.playerView !== 'full') s.setPlayerView('full'); else api().app.setFullscreen(!s.fullscreen); }
          break;
        case 'Enter':
          if (s.current && s.playerView !== 'full' && !typing) { e.preventDefault(); s.setPlayerView('full'); }
          break;
        case 'm': case 'M':
          if (s.current) engine.setMuted(!engine.state.muted);
          break;
        case 'ArrowUp':
          if (s.current?.live && full) { e.preventDefault(); s.zap(1); }
          break;
        case 'ArrowDown':
          if (s.current?.live && full) { e.preventDefault(); s.zap(-1); }
          break;
        case 'PageUp': if (s.current?.live) { e.preventDefault(); s.zap(1); } break;
        case 'PageDown': if (s.current?.live) { e.preventDefault(); s.zap(-1); } break;
        case 'ArrowLeft':
          if (s.current && !s.current.live && full) { e.preventDefault(); engine.seekBy(-10); }
          break;
        case 'ArrowRight':
          if (s.current && !s.current.live && full) { e.preventDefault(); engine.seekBy(10); }
          break;
        case '+': if (s.current) engine.setVolume(engine.state.volume + 0.05); break;
        case '-': if (s.current) engine.setVolume(engine.state.volume - 0.05); break;
        case 'Escape':
          if (full) { e.preventDefault(); if (s.fullscreen) api().app.setFullscreen(false); else { s.setPlayerView('inline'); s.setPage('live'); } }
          break;
        case 'F11':
          e.preventDefault();
          api().app.setFullscreen(!s.fullscreen);
          break;
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [zapInput]);

  if (!ready) {
    return <div style={{ height: '100%', display: 'grid', placeItems: 'center' }}><div className="spinner lg" /></div>;
  }

  const showFull = !!current && playerView === 'full';
  const pageEl = !data && page !== 'playlists' && page !== 'settings' ? <HomePage /> : {
    home: <HomePage />, live: <LivePage />, movies: <MoviesPage />, series: <SeriesPage />, favorites: <FavoritesPage />, history: <HistoryPage />,
    epg: <EpgPage />, search: <SearchPage />, multiview: <MultiViewPage />, playlists: <PlaylistsPage />, settings: <SettingsPage />,
  }[page];

  return (
    <div className={'app' + (showFull ? ' player-open' : '')}>
      <TitleBar />
      <Sidebar />
      <main className="main">{pageEl}</main>
      {showFull && <Player mode="full" />}
      {zapInput && <div className="zap-osd" style={{ zIndex: 60 }}>{zapInput}</div>}
      <DetailModal />
      <PinDialog />
      <Toasts />
    </div>
  );
}
