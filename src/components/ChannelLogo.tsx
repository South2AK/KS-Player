import React, { useState } from 'react';
import { colorFor, initials } from '@/lib/utils';

export function ChannelLogo({ src, name, className = 'logo', style }: { src?: string; name: string; className?: string; style?: React.CSSProperties }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div className={className + ' placeholder'} style={{ background: colorFor(name), display: 'grid', placeItems: 'center', ...style }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#fff' }}>{initials(name)}</span>
      </div>
    );
  }
  return <img className={className} src={src} alt="" loading="lazy" onError={() => setFailed(true)} style={style} draggable={false} />;
}
