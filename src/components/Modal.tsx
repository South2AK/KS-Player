import React, { useEffect } from 'react';
import { Icon } from './Icon';

interface Props {
  title?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
  headExtra?: React.ReactNode;
  style?: React.CSSProperties;
}

export function Modal({ title, onClose, children, footer, wide, headExtra, style }: Props) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', h, true);
    return () => window.removeEventListener('keydown', h, true);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={'modal' + (wide ? ' wide' : '')} style={style} role="dialog">
        {(title || headExtra) && (
          <div className="modal-head">
            <h2>{title}</h2>
            {headExtra}
            <button className="iconbtn" onClick={onClose} aria-label="close"><Icon name="x" /></button>
          </div>
        )}
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}
