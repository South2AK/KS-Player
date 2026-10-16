import React from 'react';

const P: Record<string, string> = {
  home: 'M3 11l9-8 9 8v9a2 2 0 0 1-2 2h-4v-7H9v7H5a2 2 0 0 1-2-2z',
  tv: 'M3 6h18a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1zm5 15h8M12 18v3',
  film: 'M4 4h16a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM3 9h18M3 15h18M8 4v16M16 4v16',
  series: 'M4 6h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1zM10 9l5 3-5 3z',
  heart: 'M12 21s-7-4.6-9.3-8.7C.9 8.9 3 5 6.6 5c2 0 3.4 1 4.4 2.5C12 6 13.4 5 15.4 5 19 5 21.1 8.9 19.3 12.3 17 16.4 12 21 12 21z',
  history: 'M3 12a9 9 0 1 0 3-6.7M3 3v5h5M12 7v5l3 2',
  guide: 'M3 5h18v14H3zM3 10h18M8 10v9M14 10v9',
  search: 'M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14zM20 20l-4-4',
  grid: 'M3 3h8v8H3zM13 3h8v8h-8zM3 13h8v8H3zM13 13h8v8h-8z',
  list: 'M4 6h16M4 12h16M4 18h16',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  play: 'M6 4l14 8-14 8z',
  pause: 'M6 4h4v16H6zM14 4h4v16h-4z',
  stop: 'M5 5h14v14H5z',
  volume: 'M11 5L6 9H2v6h4l5 4zM15.5 8.5a5 5 0 0 1 0 7M19 5a9 9 0 0 1 0 14',
  mute: 'M11 5L6 9H2v6h4l5 4zM23 9l-6 6M17 9l6 6',
  fullscreen: 'M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5',
  minimize: 'M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7',
  pip: 'M3 5h18v14H3zM12 11h8v6h-8z',
  prev: 'M19 20L9 12l10-8zM5 4v16',
  next: 'M5 4l10 8-10 8zM19 4v16',
  back10: 'M3 12a9 9 0 1 0 3-6.7M3 3v5h5',
  fwd10: 'M21 12a9 9 0 1 1-3-6.7M21 3v5h-5',
  x: 'M6 6l12 12M18 6L6 18',
  plus: 'M12 5v14M5 12h14',
  check: 'M4 12l5 5L20 7',
  chevronL: 'M15 5l-7 7 7 7',
  chevronR: 'M9 5l7 7-7 7',
  chevronD: 'M5 9l7 7 7-7',
  more: 'M12 6h.01M12 12h.01M12 18h.01',
  lock: 'M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4',
  unlock: 'M6 11h12v10H6zM8 11V7a4 4 0 0 1 7.5-2',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  eyeOff: 'M3 3l18 18M10.6 10.6a3 3 0 0 0 4.2 4.2M9.9 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.3 4.1M6.6 6.6C3.7 8.6 2 12 2 12s3.5 7 10 7c1.6 0 3-.4 4.2-1',
  refresh: 'M21 12a9 9 0 1 1-2.6-6.4M21 3v6h-6',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  edit: 'M4 20h4l10.5-10.5a2 2 0 0 0-4-4L4 16z',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 7v5l3 2',
  moon: 'M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10z',
  audio: 'M9 18V6l12-2v12M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM21 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
  subtitles: 'M3 5h18v14H3zM7 14h4M13 14h4M7 10h2M11 10h6',
  aspect: 'M3 5h18v14H3zM7 9h10v6H7z',
  speed: 'M12 14l4-6M4 14a8 8 0 1 1 16 0',
  folder: 'M3 6h6l2 2h10v11H3z',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  server: 'M3 5h18v6H3zM3 13h18v6H3zM7 8h.01M7 16h.01',
  star: 'M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z',
  download: 'M12 3v12M6 11l6 6 6-6M4 21h16',
  upload: 'M12 21V9M6 13l6-6 6 6M4 3h16',
  pin: 'M12 17v5M5 8h14l-2 6H7zM9 3h6v5H9z',
  keyboard: 'M2 6h20v12H2zM6 10h.01M10 10h.01M14 10h.01M18 10h.01M6 14h12',
  layers: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5',
  rewind: 'M11 19L2 12l9-7zM22 19l-9-7 9-7z',
  live: 'M12 12m-3 0a3 3 0 1 0 6 0 3 3 0 1 0-6 0M5 5a10 10 0 0 0 0 14M19 5a10 10 0 0 1 0 14M8 8a5 5 0 0 0 0 8M16 8a5 5 0 0 1 0 8',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  filter: 'M3 5h18l-7 8v6l-4 2v-8z',
  sort: 'M3 6h18M6 12h12M9 18h6',
  cast: 'M2 16a6 6 0 0 1 6 6M2 12a10 10 0 0 1 10 10M2 8a14 14 0 0 1 14 14M4 4h16a1 1 0 0 1 1 1v13h-6',
};

export function Icon({ name, size = 18, className, style, fill }: { name: keyof typeof P | string; size?: number; className?: string; style?: React.CSSProperties; fill?: boolean }) {
  const d = P[name] || P.info;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={fill ? 0 : 1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden
    >
      <path d={d} />
    </svg>
  );
}
