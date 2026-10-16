import type { Channel, Programme } from '@shared/types';

export function fmtTime(ms: number, format: '24h' | '12h' = '24h', lang = 'de'): string {
  const d = new Date(ms);
  return d.toLocaleTimeString(lang === 'de' ? 'de-DE' : 'en-US', { hour: '2-digit', minute: '2-digit', hour12: format === '12h' });
}

export function fmtDate(ms: number, lang = 'de'): string {
  return new Date(ms).toLocaleDateString(lang === 'de' ? 'de-DE' : 'en-US', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function fmtDateTime(ms: number, lang = 'de'): string {
  return new Date(ms).toLocaleString(lang === 'de' ? 'de-DE' : 'en-US', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function fmtDuration(sec: number): string {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function progress(p: Programme, now = Date.now()): number {
  const len = p.stop - p.start;
  if (len <= 0) return 0;
  return Math.max(0, Math.min(1, (now - p.start) / len));
}

export function initials(name: string): string {
  const parts = name.replace(/[^\p{L}\p{N} ]/gu, ' ').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
}

export function colorFor(str: string): string {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  const hue = Math.abs(h) % 360;
  return `hsl(${hue} 45% 38%)`;
}

export function sortChannels<T extends Channel>(list: T[], mode: string): T[] {
  switch (mode) {
    case 'az': return [...list].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    case 'za': return [...list].sort((a, b) => b.name.localeCompare(a.name, undefined, { numeric: true }));
    case 'added': return [...list].sort((a, b) => (b.added || 0) - (a.added || 0));
    case 'rating': return [...list].sort((a, b) => (parseFloat(b.rating || '0') || 0) - (parseFloat(a.rating || '0') || 0));
    default: return list;
  }
}

export function cleanTitle(name: string): string {
  return name.replace(/^\s*(\[[^\]]*\]|\([^)]*\)|[A-Z]{2,3}\s*[|:-])\s*/g, '').trim() || name;
}

export function debounce<T extends (...a: any[]) => void>(fn: T, ms: number): T {
  let t: ReturnType<typeof setTimeout> | null = null;
  return ((...args: any[]) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  }) as T;
}

export function classNames(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

export function isLiveUrl(url: string): boolean {
  const u = url.toLowerCase();
  if (/\.(mp4|mkv|avi|mov|m4v|wmv|flv|webm|mpg|mpeg)(\?|$)/.test(u)) return false;
  if (/\/(movie|series)\//.test(u)) return false;
  return true;
}

/** Group series episodes from M3U into series entries. */
export function groupSeries(channels: Channel[]): Map<string, Channel[]> {
  const map = new Map<string, Channel[]>();
  for (const c of channels) {
    if (c.kind !== 'series') continue;
    const key = (c.seriesId ? 'xs' + c.seriesId : (c.group + '|' + (c.seriesTitle || c.name)).toLowerCase());
    (map.get(key) || map.set(key, []).get(key)!).push(c);
  }
  return map;
}
