import fs from 'node:fs';
import sax from 'sax';
import type { Channel, EpgStatus, Programme } from '../../shared/types';
import { openStream } from './fetch';
import { storage } from './storage';

interface EpgCache {
  loadedAt: number;
  source: string;
  data: Record<string, Programme[]>;
}

const CACHE_TTL = 12 * 3600_000;

const mem = new Map<string, EpgCache>();
const status = new Map<string, EpgStatus>();
const loading = new Map<string, Promise<EpgStatus>>();
let notify: ((s: EpgStatus) => void) | null = null;

export function setEpgNotifier(fn: (s: EpgStatus) => void) {
  notify = fn;
}

function normalizeName(n: string): string {
  return n
    .toLowerCase()
    .replace(/\b(hd|fhd|uhd|4k|sd|hevc|h265|raw|backup)\b/g, '')
    .replace(/[^a-z0-9äöüß]+/g, '')
    .trim();
}

function setStatus(playlistId: string, patch: Partial<EpgStatus>): EpgStatus {
  const cur = status.get(playlistId) || { playlistId, loadedAt: null, channels: 0, programmes: 0, loading: false };
  const next = { ...cur, ...patch };
  status.set(playlistId, next);
  notify?.(next);
  return next;
}

export function epgStatus(playlistId: string): EpgStatus {
  const s = status.get(playlistId);
  if (s) return s;
  const c = mem.get(playlistId);
  if (c) return summarize(playlistId, c);
  // Peek the disk cache lazily
  const disk = readCache(playlistId);
  if (disk) {
    mem.set(playlistId, disk);
    return setStatus(playlistId, summarize(playlistId, disk));
  }
  return { playlistId, loadedAt: null, channels: 0, programmes: 0, loading: false };
}

function summarize(playlistId: string, c: EpgCache): EpgStatus {
  let programmes = 0;
  for (const list of Object.values(c.data)) programmes += list.length;
  return { playlistId, loadedAt: c.loadedAt, channels: Object.keys(c.data).length, programmes, loading: false, source: c.source };
}

function readCache(playlistId: string): EpgCache | null {
  try {
    const f = storage.epgFile(playlistId);
    if (!fs.existsSync(f)) return null;
    return JSON.parse(fs.readFileSync(f, 'utf8')) as EpgCache;
  } catch {
    return null;
  }
}

export function parseXmltvDate(s: string): number {
  // 20240904193000 +0200  |  20240904193000
  const m = s.trim().match(/^(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?\s*(?:([+-])(\d{2})(\d{2}))?$/);
  if (!m) return NaN;
  const [, Y, M, D, h = '00', mi = '00', sec = '00', sign, oh, om] = m;
  let t = Date.UTC(+Y, +M - 1, +D, +h, +mi, +sec);
  if (sign) {
    const off = (+oh * 60 + +om) * 60_000;
    t += sign === '+' ? -off : off;
  }
  return t;
}

export async function loadEpg(
  playlistId: string,
  url: string,
  channels: Channel[],
  userAgent: string | undefined,
  force: boolean,
): Promise<EpgStatus> {
  const inflight = loading.get(playlistId);
  if (inflight) return inflight;

  if (!force) {
    const existing = mem.get(playlistId) || readCache(playlistId);
    if (existing && existing.source === url && Date.now() - existing.loadedAt < CACHE_TTL) {
      mem.set(playlistId, existing);
      return setStatus(playlistId, summarize(playlistId, existing));
    }
  }

  const p = doLoad(playlistId, url, channels, userAgent).finally(() => loading.delete(playlistId));
  loading.set(playlistId, p);
  return p;
}

async function doLoad(playlistId: string, url: string, channels: Channel[], userAgent?: string): Promise<EpgStatus> {
  setStatus(playlistId, { loading: true, error: undefined, source: url });

  // Build lookup tables: xmltv channel id -> our channel ids
  const byTvgId = new Map<string, string[]>();
  const byName = new Map<string, string[]>();
  for (const c of channels) {
    if (c.kind !== 'live') continue;
    if (c.tvgId) {
      const k = c.tvgId.toLowerCase();
      (byTvgId.get(k) || byTvgId.set(k, []).get(k)!).push(c.id);
    }
    const n = normalizeName(c.tvgName || c.name);
    if (n) (byName.get(n) || byName.set(n, []).get(n)!).push(c.id);
  }

  const xmlIdToOurs = new Map<string, string[]>();
  const data: Record<string, Programme[]> = {};
  let programmeCount = 0;

  try {
    const { stream, abort } = await openStream(url, userAgent);
    await new Promise<void>((resolve, reject) => {
      const parser = sax.createStream(false, { lowercase: true, trim: false });
      let curChannelId: string | null = null;
      let curDisplayNames: string[] = [];
      let curProg: { channel: string; start: number; stop: number; title: string; desc: string; category: string; icon?: string } | null = null;
      let textTarget: 'title' | 'desc' | 'category' | 'display-name' | null = null;
      let text = '';

      parser.on('opentag', (node: sax.Tag) => {
        const name = node.name;
        if (name === 'channel') {
          curChannelId = String(node.attributes.id || '');
          curDisplayNames = [];
        } else if (name === 'display-name' && curChannelId !== null) {
          textTarget = 'display-name';
          text = '';
        } else if (name === 'programme') {
          const start = parseXmltvDate(String(node.attributes.start || ''));
          const stop = parseXmltvDate(String(node.attributes.stop || ''));
          const ch = String(node.attributes.channel || '');
          if (!isNaN(start) && xmlIdToOurs.has(ch)) {
            curProg = { channel: ch, start, stop: isNaN(stop) ? start + 3600_000 : stop, title: '', desc: '', category: '' };
          } else {
            curProg = null;
          }
        } else if (curProg && (name === 'title' || name === 'desc' || name === 'category')) {
          textTarget = name;
          text = '';
        } else if (curProg && name === 'icon' && node.attributes.src) {
          curProg.icon = String(node.attributes.src);
        }
      });
      parser.on('text', (t: string) => { if (textTarget) text += t; });
      parser.on('cdata', (t: string) => { if (textTarget) text += t; });
      parser.on('closetag', (name: string) => {
        if (name === 'display-name' && textTarget === 'display-name') {
          curDisplayNames.push(text.trim());
          textTarget = null;
        } else if (name === 'channel' && curChannelId !== null) {
          const targets = new Set<string>();
          const idKey = curChannelId.toLowerCase();
          for (const id of byTvgId.get(idKey) || []) targets.add(id);
          if (targets.size === 0) {
            for (const dn of curDisplayNames) {
              for (const id of byName.get(normalizeName(dn)) || []) targets.add(id);
            }
            if (targets.size === 0) for (const id of byName.get(normalizeName(curChannelId)) || []) targets.add(id);
          }
          if (targets.size) xmlIdToOurs.set(curChannelId, [...targets]);
          curChannelId = null;
        } else if (curProg && textTarget && name === textTarget) {
          const v = text.trim();
          if (name === 'title' && !curProg.title) curProg.title = v;
          else if (name === 'desc' && !curProg.desc) curProg.desc = v;
          else if (name === 'category' && !curProg.category) curProg.category = v;
          textTarget = null;
        } else if (name === 'programme' && curProg) {
          const prog: Programme = { start: curProg.start, stop: curProg.stop, title: curProg.title || '–' };
          if (curProg.desc) prog.desc = curProg.desc;
          if (curProg.category) prog.category = curProg.category;
          if (curProg.icon) prog.icon = curProg.icon;
          for (const id of xmlIdToOurs.get(curProg.channel) || []) {
            (data[id] || (data[id] = [])).push(prog);
            programmeCount++;
          }
          curProg = null;
        }
      });
      parser.on('error', (e: Error) => {
        // sax in non-strict mode is forgiving; keep going where possible
        (parser as any)._parser.error = null;
        (parser as any)._parser.resume?.();
        if (programmeCount === 0 && String(e.message).includes('Non-whitespace before first tag')) {
          abort();
          reject(new Error('Keine gültige XMLTV-Datei'));
        }
      });
      parser.on('end', () => resolve());
      stream.on('error', reject);
      stream.pipe(parser);
    });
  } catch (e: any) {
    return setStatus(playlistId, { loading: false, error: e?.message || String(e) });
  }

  // Sort + dedupe per channel and drop stale entries (older than 2 days)
  const cutoff = Date.now() - 2 * 86_400_000;
  for (const id of Object.keys(data)) {
    const list = data[id].filter((p) => p.stop >= cutoff).sort((a, b) => a.start - b.start);
    const out: Programme[] = [];
    for (const p of list) {
      const last = out[out.length - 1];
      if (last && last.start === p.start) continue;
      out.push(p);
    }
    data[id] = out;
  }

  const cache: EpgCache = { loadedAt: Date.now(), source: url, data };
  mem.set(playlistId, cache);
  try {
    fs.mkdirSync(require('node:path').dirname(storage.epgFile(playlistId)), { recursive: true });
    fs.writeFileSync(storage.epgFile(playlistId), JSON.stringify(cache));
  } catch (e) {
    console.error('[epg] cache write failed', e);
  }
  return setStatus(playlistId, summarize(playlistId, cache));
}

function getData(playlistId: string): Record<string, Programme[]> {
  let c = mem.get(playlistId);
  if (!c) {
    const disk = readCache(playlistId);
    if (disk) {
      mem.set(playlistId, disk);
      c = disk;
    }
  }
  return c?.data || {};
}

export function epgNowNext(playlistId: string, channelIds: string[], now = Date.now()): Record<string, [Programme | null, Programme | null]> {
  const data = getData(playlistId);
  const out: Record<string, [Programme | null, Programme | null]> = {};
  for (const id of channelIds) {
    const list = data[id];
    if (!list || !list.length) continue;
    // binary search for first programme with stop > now
    let lo = 0, hi = list.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (list[mid].stop <= now) lo = mid + 1; else hi = mid;
    }
    const cur = list[lo];
    if (cur && cur.start <= now) out[id] = [cur, list[lo + 1] || null];
    else out[id] = [null, cur || null];
  }
  return out;
}

export function epgRange(playlistId: string, channelIds: string[], from: number, to: number): Record<string, Programme[]> {
  const data = getData(playlistId);
  const out: Record<string, Programme[]> = {};
  for (const id of channelIds) {
    const list = data[id];
    if (!list) continue;
    out[id] = list.filter((p) => p.stop > from && p.start < to);
  }
  return out;
}

export function dropEpg(playlistId: string) {
  mem.delete(playlistId);
  status.delete(playlistId);
}
