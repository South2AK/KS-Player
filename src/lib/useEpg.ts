import { useEffect, useMemo, useState } from 'react';
import type { Programme } from '@shared/types';
import { api } from './api';
import { useStore } from '@/store/app';

export type NowNext = [Programme | null, Programme | null];

const cache = new Map<string, { v: NowNext; at: number }>();
const TTL = 60_000;
let pending: Set<string> | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const waiters = new Set<() => void>();

async function flush(playlistId: string) {
  const ids = pending ? [...pending] : [];
  pending = null;
  flushTimer = null;
  if (!ids.length) return;
  const now = Date.now();
  try {
    const res = await api().epg.nowNext(playlistId, ids);
    for (const id of ids) cache.set(id, { v: res[id] || [null, null], at: now });
  } catch {
    for (const id of ids) cache.set(id, { v: [null, null], at: now });
  }
  for (const w of waiters) w();
}

function request(playlistId: string, ids: string[]) {
  const now = Date.now();
  const missing = ids.filter((id) => {
    const c = cache.get(id);
    return !c || now - c.at > TTL;
  });
  if (!missing.length) return;
  if (!pending) pending = new Set();
  for (const id of missing) pending.add(id);
  if (!flushTimer) flushTimer = setTimeout(() => flush(playlistId), 30);
}

/** Now/next programme for a set of channel ids; refreshes every minute. */
export function useNowNext(ids: string[]): Record<string, NowNext> {
  const playlistId = useStore((s) => s.activePlaylistId);
  const epgLoadedAt = useStore((s) => s.epg?.loadedAt);
  const key = ids.join(',');
  const [ver, setVer] = useState(0);

  useEffect(() => {
    if (!playlistId || !epgLoadedAt) return;
    const w = () => setVer((x) => x + 1);
    waiters.add(w);
    request(playlistId, ids);
    const i = setInterval(() => request(playlistId, ids), TTL);
    return () => { waiters.delete(w); clearInterval(i); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, playlistId, epgLoadedAt]);

  return useMemo(() => {
    const out: Record<string, NowNext> = {};
    for (const id of ids) { const c = cache.get(id); if (c) out[id] = c.v; }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ver, epgLoadedAt]);
}

export function clearEpgCache() {
  cache.clear();
}
