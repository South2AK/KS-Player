import type { Channel, Category, Playlist, PlaylistData, SeriesInfo, VodInfo, Episode } from './types';
import { buildCategories } from './m3u';

export type FetchJson = (url: string, userAgent?: string) => Promise<any>;

export function xtreamBase(url: string): string {
  let u = url.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(u)) u = 'http://' + u;
  // Strip trailing player_api.php / get.php etc.
  u = u.replace(/\/(player_api\.php|get\.php|xmltv\.php|panel_api\.php).*$/i, '');
  return u;
}

export function xtreamApiUrl(p: Playlist, action?: string, extra?: Record<string, string | number>): string {
  const base = xtreamBase(p.url);
  const params = new URLSearchParams({ username: p.username || '', password: p.password || '' });
  if (action) params.set('action', action);
  if (extra) for (const [k, v] of Object.entries(extra)) params.set(k, String(v));
  return `${base}/player_api.php?${params.toString()}`;
}

export function xtreamEpgUrl(p: Playlist): string {
  const base = xtreamBase(p.url);
  return `${base}/xmltv.php?username=${encodeURIComponent(p.username || '')}&password=${encodeURIComponent(p.password || '')}`;
}

export function xtreamLiveUrl(p: Playlist, streamId: number, format: 'ts' | 'm3u8'): string {
  const base = xtreamBase(p.url);
  const u = encodeURIComponent(p.username || '');
  const pw = encodeURIComponent(p.password || '');
  return format === 'm3u8' ? `${base}/live/${u}/${pw}/${streamId}.m3u8` : `${base}/live/${u}/${pw}/${streamId}.ts`;
}

export function xtreamCatchupUrl(p: Playlist, streamId: number, startMs: number, durationMin: number): string {
  const base = xtreamBase(p.url);
  const d = new Date(startMs);
  const pad = (n: number) => String(n).padStart(2, '0');
  const start = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}:${pad(d.getHours())}-${pad(d.getMinutes())}`;
  return `${base}/streaming/timeshift.php?username=${encodeURIComponent(p.username || '')}&password=${encodeURIComponent(p.password || '')}&stream=${streamId}&start=${start}&duration=${durationMin}`;
}

function toNum(v: any): number | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Number(v);
  return isNaN(n) ? undefined : n;
}

function str(v: any): string | undefined {
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim();
  return s ? s : undefined;
}

export function parseAccount(json: any): Partial<Playlist> {
  const ui = json?.user_info || {};
  const exp = toNum(ui.exp_date);
  return {
    expiresAt: exp ? exp * 1000 : null,
    maxConnections: toNum(ui.max_connections),
    activeConnections: toNum(ui.active_cons),
    status: str(ui.status),
  };
}

export async function loadXtream(
  p: Playlist,
  fetchJson: FetchJson,
  liveFormat: 'ts' | 'm3u8',
): Promise<PlaylistData & { account: Partial<Playlist> }> {
  const ua = p.userAgent;
  const account = await fetchJson(xtreamApiUrl(p), ua);
  if (!account || !account.user_info) throw new Error('Xtream: ungültige Antwort vom Server');
  if (account.user_info.auth === 0 || account.user_info.auth === '0') {
    throw new Error('Xtream: Benutzername oder Passwort falsch');
  }

  const [liveCats, vodCats, seriesCats, live, vod, series] = await Promise.all([
    fetchJson(xtreamApiUrl(p, 'get_live_categories'), ua).catch(() => []),
    fetchJson(xtreamApiUrl(p, 'get_vod_categories'), ua).catch(() => []),
    fetchJson(xtreamApiUrl(p, 'get_series_categories'), ua).catch(() => []),
    fetchJson(xtreamApiUrl(p, 'get_live_streams'), ua).catch(() => []),
    fetchJson(xtreamApiUrl(p, 'get_vod_streams'), ua).catch(() => []),
    fetchJson(xtreamApiUrl(p, 'get_series'), ua).catch(() => []),
  ]);

  const catName = (list: any[], id: any): string => {
    const c = Array.isArray(list) ? list.find((x) => String(x.category_id) === String(id)) : null;
    return c?.category_name || 'Ohne Kategorie';
  };

  const channels: Channel[] = [];
  const base = xtreamBase(p.url);
  const u = encodeURIComponent(p.username || '');
  const pw = encodeURIComponent(p.password || '');

  if (Array.isArray(live)) {
    for (const s of live) {
      const id = toNum(s.stream_id);
      if (id === undefined) continue;
      channels.push({
        id: 'xl' + id,
        name: String(s.name ?? ''),
        url: xtreamLiveUrl(p, id, liveFormat),
        logo: str(s.stream_icon),
        group: catName(liveCats, s.category_id),
        kind: 'live',
        tvgId: str(s.epg_channel_id),
        number: toNum(s.num),
        streamId: id,
        catchupDays: toNum(s.tv_archive) ? toNum(s.tv_archive_duration) || 1 : undefined,
        added: toNum(s.added) ? toNum(s.added)! * 1000 : undefined,
      });
    }
  }
  if (Array.isArray(vod)) {
    for (const s of vod) {
      const id = toNum(s.stream_id);
      if (id === undefined) continue;
      const ext = str(s.container_extension) || 'mp4';
      channels.push({
        id: 'xv' + id,
        name: String(s.name ?? ''),
        url: `${base}/movie/${u}/${pw}/${id}.${ext}`,
        logo: str(s.stream_icon),
        group: catName(vodCats, s.category_id),
        kind: 'movie',
        number: toNum(s.num),
        streamId: id,
        ext,
        rating: str(s.rating) || str(s.rating_5based),
        year: str(s.year) || str(s.releaseDate)?.slice(0, 4),
        plot: str(s.plot),
        genre: str(s.genre),
        added: toNum(s.added) ? toNum(s.added)! * 1000 : undefined,
      });
    }
  }
  if (Array.isArray(series)) {
    for (const s of series) {
      const id = toNum(s.series_id);
      if (id === undefined) continue;
      const backdrop = Array.isArray(s.backdrop_path) ? s.backdrop_path[0] : str(s.backdrop_path);
      channels.push({
        id: 'xs' + id,
        name: String(s.name ?? ''),
        url: '',
        logo: str(s.cover),
        group: catName(seriesCats, s.category_id),
        kind: 'series',
        number: toNum(s.num),
        seriesId: id,
        seriesTitle: String(s.name ?? ''),
        rating: str(s.rating) || str(s.rating_5based),
        year: str(s.releaseDate)?.slice(0, 4) || str(s.year),
        plot: str(s.plot),
        genre: str(s.genre),
        backdrop: backdrop ? String(backdrop) : undefined,
        added: toNum(s.last_modified) ? toNum(s.last_modified)! * 1000 : undefined,
      });
    }
  }

  // Preserve category order from the server where possible
  const orderMap = new Map<string, number>();
  let i = 0;
  for (const list of [liveCats, vodCats, seriesCats]) {
    if (Array.isArray(list)) for (const c of list) orderMap.set(String(c.category_name), i++);
  }
  const categories: Category[] = buildCategories(channels).sort((a, b) => {
    const oa = orderMap.get(a.name) ?? 1e9;
    const ob = orderMap.get(b.name) ?? 1e9;
    return oa - ob || a.name.localeCompare(b.name);
  });

  return {
    playlistId: p.id,
    channels,
    categories,
    loadedAt: Date.now(),
    epgUrlFromPlaylist: xtreamEpgUrl(p),
    account: parseAccount(account),
  };
}

export async function loadXtreamSeriesInfo(p: Playlist, seriesId: number, fetchJson: FetchJson): Promise<SeriesInfo> {
  const json = await fetchJson(xtreamApiUrl(p, 'get_series_info', { series_id: seriesId }), p.userAgent);
  const info = json?.info || {};
  const base = xtreamBase(p.url);
  const u = encodeURIComponent(p.username || '');
  const pw = encodeURIComponent(p.password || '');
  const seasons: SeriesInfo['seasons'] = [];
  const eps = json?.episodes || {};
  const seasonMeta: any[] = Array.isArray(json?.seasons) ? json.seasons : [];
  const entries: [string, any[]][] = Array.isArray(eps)
    ? eps.map((list: any[], idx: number) => [String(idx + 1), list] as [string, any[]])
    : (Object.entries(eps) as [string, any[]][]);
  for (const [seasonKey, list] of entries) {
    if (!Array.isArray(list)) continue;
    const seasonNum = parseInt(seasonKey, 10);
    const meta = seasonMeta.find((s) => Number(s.season_number) === seasonNum);
    const episodes: Episode[] = list.map((e: any) => {
      const ext = str(e.container_extension) || 'mp4';
      const ei = e.info || {};
      return {
        id: String(e.id),
        title: str(e.title) || `Episode ${e.episode_num}`,
        season: seasonNum,
        episode: toNum(e.episode_num) ?? 0,
        url: `${base}/series/${u}/${pw}/${e.id}.${ext}`,
        plot: str(ei.plot),
        duration: str(ei.duration),
        logo: str(ei.movie_image),
        rating: str(ei.rating),
        releaseDate: str(ei.releasedate) || str(ei.release_date),
        added: toNum(e.added) ? toNum(e.added)! * 1000 : undefined,
      };
    });
    episodes.sort((a, b) => a.episode - b.episode);
    seasons.push({ season: seasonNum, name: str(meta?.name), episodes });
  }
  seasons.sort((a, b) => a.season - b.season);
  const backdrop = Array.isArray(info.backdrop_path) ? info.backdrop_path[0] : str(info.backdrop_path);
  return {
    name: str(info.name) || '',
    plot: str(info.plot),
    cast: str(info.cast),
    director: str(info.director),
    genre: str(info.genre),
    releaseDate: str(info.releaseDate) || str(info.release_date),
    rating: str(info.rating),
    cover: str(info.cover),
    backdrop: backdrop ? String(backdrop) : undefined,
    seasons,
  };
}

export async function loadXtreamVodInfo(p: Playlist, streamId: number, fetchJson: FetchJson): Promise<VodInfo> {
  const json = await fetchJson(xtreamApiUrl(p, 'get_vod_info', { vod_id: streamId }), p.userAgent);
  const info = json?.info || {};
  const md = json?.movie_data || {};
  const base = xtreamBase(p.url);
  const u = encodeURIComponent(p.username || '');
  const pw = encodeURIComponent(p.password || '');
  const ext = str(md.container_extension) || 'mp4';
  const backdrop = Array.isArray(info.backdrop_path) ? info.backdrop_path[0] : str(info.backdrop_path);
  return {
    name: str(md.name) || str(info.name) || '',
    plot: str(info.plot) || str(info.description),
    cast: str(info.cast) || str(info.actors),
    director: str(info.director),
    genre: str(info.genre),
    releaseDate: str(info.releasedate) || str(info.release_date),
    rating: str(info.rating),
    cover: str(info.movie_image) || str(info.cover_big),
    backdrop: backdrop ? String(backdrop) : undefined,
    duration: str(info.duration),
    url: `${base}/movie/${u}/${pw}/${md.stream_id ?? streamId}.${ext}`,
  };
}

/**
 * Recognises Xtream credentials inside pasted links:
 *  - http://host:port/get.php?username=U&password=P&type=m3u_plus
 *  - http://host:port/player_api.php?username=U&password=P
 *  - http://host:port/live|movie|series/U/P/123.ts   (single stream link)
 *  - http://host:port/U/P/123
 */
export function parseXtreamUrl(input: string): { server: string; username: string; password: string } | null {
  const raw = input.trim();
  if (!raw) return null;
  let u: URL;
  try { u = new URL(/^https?:\/\//i.test(raw) ? raw : "http://" + raw); } catch { return null; }
  const server = u.protocol + "//" + u.host;
  const qu = u.searchParams.get("username"), qp = u.searchParams.get("password");
  if (qu && qp) return { server, username: qu, password: qp };
  const parts = u.pathname.split("/").filter(Boolean);
  if (parts.length >= 3 && /^(live|movie|series|timeshift)$/i.test(parts[0])) return { server, username: decodeURIComponent(parts[1]), password: decodeURIComponent(parts[2]) };
  if (parts.length === 3 && /^\d+(\.[a-z0-9]+)?$/i.test(parts[2])) return { server, username: decodeURIComponent(parts[0]), password: decodeURIComponent(parts[1]) };
  return null;
}
