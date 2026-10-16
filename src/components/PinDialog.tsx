import React, { useEffect, useState } from 'react';
import { useStore } from '@/store/app';
import { Modal } from './Modal';
import { Icon } from './Icon';

/** Global PIN prompt driven by store.pinPrompt (parental control). */
export function PinDialog() {
  const prompt = useStore((s) => s.pinPrompt);
  const pin = useStore((s) => s.settings.parentalPin);
  const resolve = useStore((s) => s.resolvePin);
  const t = useStore((s) => s.t);
  const [value, setValue] = useState('');
  const [error, setError] = useState(false);

  useEffect(() => { setValue(''); setError(false); }, [prompt]);

  useEffect(() => {
    if (!prompt) return;
    const h = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) { e.preventDefault(); push(e.key); }
      else if (e.key === 'Backspace') { e.preventDefault(); setValue((v) => v.slice(0, -1)); }
    };
    window.addEventListener('keydown', h, true);
    return () => window.removeEventListener('keydown', h, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompt, value, pin]);

  if (!prompt) return null;

  function push(d: string) {
    const next = (value + d).slice(0, 4);
    setValue(next);
    if (next.length === 4) {
      if (next === pin) resolve(true);
      else { setError(true); setTimeout(() => setValue(''), 300); }
    }
  }

  return (
    <Modal title={prompt.title} onClose={() => resolve(false)} style={{ width: 340 }}>
      <div className="row" style={{ justifyContent: 'center', color: 'var(--warn)' }}><Icon name="lock" size={28} /></div>
      <div className="pin-dots">
        {[0, 1, 2, 3].map((i) => <i key={i} className={i < value.length ? 'on' : ''} style={error ? { borderColor: 'var(--danger)' } : undefined} />)}
      </div>
      {error && <div className="small" style={{ color: 'var(--danger)', textAlign: 'center' }}>{t.wrongPin}</div>}
      <div className="pin-pad">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => <button key={d} onClick={() => push(d)}>{d}</button>)}
        <button onClick={() => setValue((v) => v.slice(0, -1))}><Icon name="chevronL" /></button>
        <button onClick={() => push('0')}>0</button>
        <button onClick={() => resolve(false)}><Icon name="x" /></button>
      </div>
    </Modal>
  );
}

/** Inline PIN setter used in settings. */
export function PinInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      className="input"
      style={{ width: 120, letterSpacing: 6, textAlign: 'center' }}
      type="password"
      inputMode="numeric"
      maxLength={4}
      placeholder="••••"
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 4))}
    />
  );
}
