import type { Channel, Category, ContentKind } from './types';

const ATTR_RE = /([A-Za-z0-9_-]+)="([^"]*)"/g;

export function hashId(input: string): string {
  // FNV-1a 32-bit, twice with different seeds -> 16 hex chars, stable + cheap
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 ^= c; h1 = Math.imul(h1, 0x01000193);
    h2 ^= c; h2 = Math.imul(h2, 0x5bd1e995);
  }
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
}

const VOD_EXT = /\.(mp4|mkv|avi|mov|m4v|wmv|flv|webm|mpg|mpeg|ts|m2ts)(\?|$)/i;
const SERIES_RE = /^(.*?)[\s._-]*S(\d{1,2})[\s._-]*E(\d{1,3})\b/i;
const SERIES_RE2 = /^(.*?)[\s._-]*(\d{1,2})x(\d{1,3})\b/i;

export function detectKind(url: string, group: string, name: string): ContentKind {
  const g = group.toLowerCase();
  const u = url.toLowerCase();
  if (/\/series\//.test(u) || /(^|\W)(series|serien|seri|tv shows?)(\W|$)/.test(g)) return 'series';
  if (SERIES_RE.test(name) || SERIES_RE2.test(name)) return 'series';
  if (/\/movie\//.test(u) || /(^|\W)(vod|movies?|filme?|film|cinema|kino)(\W|$)/.test(g)) return 'movie';
  if (VOD_EXT.test(u) && !/\.ts(\?|$)/i.test(u) && !/\.m2ts(\?|$)/i.test(u)) return 'movie';
  return 'live';
}

export function parseSeries(name: string): { title: string; season: number; episode: number } | null {
  let m = name.match(SERIES_RE);
  if (!m) m = name.match(SERIES_RE2);
  if (!m) return null;
  const title = m[1].replace(/[\s._-]+$/, '').trim() || name;
  return { title, season: parseInt(m[2], 10), episode: parseInt(m[3], 10) };
}

/** Index of the comma separating EXTINF attributes from the channel name (first comma outside quotes). */
function nameSeparator(line: string): number {
  let inQuote = false;
  for (let i = 8; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') inQuote = !inQuote;
    else if (ch === ',' && !inQuote) return i;
  }
  return -1;
}

export interface ParsedM3U {
  channels: Channel[];
  categories: Category[];
  epgUrl?: string;
}

export function parseM3U(text: string): ParsedM3U {
  const lines = text.split(/\r?\n/);
  const channels: Channel[] = [];
  let epgUrl: string | undefined;
  let pending: Partial<Channel> | null = null;
  let number = 0;
  const seen = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw) continue;
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#EXTM3U')) {
      const m = line.match(/(?:x-tvg-url|url-tvg)="([^"]*)"/i);
      if (m && m[1]) epgUrl = m[1].split(',')[0];
      continue;
    }
    if (line.startsWith('#EXTINF')) {
      const comma = nameSeparator(line);
      const attrPart = comma >= 0 ? line.slice(0, comma) : line;
      const name = comma >= 0 ? line.slice(comma + 1).trim() : '';
      const attrs: Record<string, string> = {};
      let m: RegExpExecArray | null;
      ATTR_RE.lastIndex = 0;
      while ((m = ATTR_RE.exec(attrPart))) attrs[m[1].toLowerCase()] = m[2];
      pending = {
        name: name || attrs['tvg-name'] || 'Unbekannt',
        logo: attrs['tvg-logo'] || undefined,
        group: attrs['group-title'] || '',
        tvgId: attrs['tvg-id'] || undefined,
        tvgName: attrs['tvg-name'] || undefined,
        catchupDays: attrs['catchup-days'] ? parseInt(attrs['catchup-days'], 10) : undefined,
        catchupSource: attrs['catchup-source'] || undefined,
      };
      const chno = attrs['tvg-chno'];
      if (chno && !isNaN(parseInt(chno, 10))) pending.number = parseInt(chno, 10);
      continue;
    }
    if (line.startsWith('#EXTGRP:')) {
      if (pending && !pending.group) pending.group = line.slice(8).trim();
      continue;
    }
    if (line.startsWith('#')) continue;
    // URL line
    if (!pending) pending = { name: line, group: '' };
    const url = line;
    const group = pending.group || 'Ohne Kategorie';
    const kind = detectKind(url, group, pending.name || '');
    let id = hashId(url);
    if (seen.has(id)) id = hashId(url + '#' + i);
    seen.add(id);
    number++;
    const ch: Channel = {
      id,
      name: pending.name || 'Unbekannt',
      url,
      logo: pending.logo,
      group,
      kind,
      tvgId: pending.tvgId,
      tvgName: pending.tvgName,
      number: pending.number ?? number,
      catchupDays: pending.catchupDays,
      catchupSource: pending.catchupSource,
    };
    if (kind === 'series') {
      const s = parseSeries(ch.name);
      if (s) { ch.seriesTitle = s.title; ch.season = s.season; ch.episode = s.episode; }
      else ch.seriesTitle = ch.name;
    }
    const em = url.match(/\.([a-z0-9]{2,4})(\?|$)/i);
    if (em) ch.ext = em[1].toLowerCase();
    channels.push(ch);
    pending = null;
  }
  return { channels, categories: buildCategories(channels), epgUrl };
}

export function buildCategories(channels: Channel[]): Category[] {
  const map = new Map<string, Category>();
  for (const c of channels) {
    const key = c.kind + '|' + c.group;
    let cat = map.get(key);
    if (!cat) {
      cat = { id: key, name: c.group, kind: c.kind, count: 0 };
      map.set(key, cat);
    }
    cat.count++;
  }
  return [...map.values()];
}
