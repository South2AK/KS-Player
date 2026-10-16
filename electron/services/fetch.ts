import fs from 'node:fs';
import { Readable } from 'node:stream';
import zlib from 'node:zlib';

const DEFAULT_UA = 'KS Player/1.0';

export function isFileUrl(u: string): boolean {
  return /^file:\/\//i.test(u) || /^[a-zA-Z]:[\\/]/.test(u) || u.startsWith('\\\\') || u.startsWith('/');
}

export function fileUrlToPath(u: string): string {
  if (/^file:\/\//i.test(u)) return decodeURIComponent(u.replace(/^file:\/\/\/?/i, '')).replace(/\//g, '\\');
  return u;
}

export async function fetchText(url: string, userAgent?: string, timeoutMs = 60_000): Promise<string> {
  if (isFileUrl(url)) {
    const p = fileUrlToPath(url);
    const buf = await fs.promises.readFile(p);
    return decodeMaybeGzip(buf).toString('utf8');
  }
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': userAgent || DEFAULT_UA, Accept: '*/*' },
      redirect: 'follow',
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const buf = Buffer.from(await res.arrayBuffer());
    return decodeMaybeGzip(buf).toString('utf8');
  } finally {
    clearTimeout(t);
  }
}

export async function fetchJson(url: string, userAgent?: string): Promise<any> {
  const text = await fetchText(url, userAgent, 90_000);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('Server lieferte kein gültiges JSON (' + text.slice(0, 80).replace(/\s+/g, ' ') + '…)');
  }
}

function decodeMaybeGzip(buf: Buffer): Buffer {
  if (buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b) return zlib.gunzipSync(buf);
  return buf;
}

/** Opens a readable byte stream for a URL or file, transparently gunzipping .gz content. */
export async function openStream(url: string, userAgent?: string): Promise<{ stream: Readable; abort: () => void }> {
  let raw: Readable;
  let abort = () => {};
  if (isFileUrl(url)) {
    raw = fs.createReadStream(fileUrlToPath(url));
    abort = () => raw.destroy();
  } else {
    const ctrl = new AbortController();
    abort = () => ctrl.abort();
    const res = await fetch(url, {
      headers: { 'User-Agent': userAgent || DEFAULT_UA, Accept: '*/*' },
      redirect: 'follow',
      signal: ctrl.signal,
    });
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    raw = Readable.fromWeb(res.body as any);
  }
  const stream = await gunzipIfNeeded(raw);
  return { stream, abort };
}

function gunzipIfNeeded(raw: Readable): Promise<Readable> {
  return new Promise((resolve, reject) => {
    const onError = (e: Error) => reject(e);
    raw.once('error', onError);
    raw.once('readable', () => {
      raw.off('error', onError);
      const head = raw.read(2) as Buffer | null;
      if (!head) return resolve(raw);
      raw.unshift(head);
      if (head[0] === 0x1f && head[1] === 0x8b) {
        const gz = zlib.createGunzip();
        raw.pipe(gz);
        raw.on('error', (e) => gz.destroy(e));
        resolve(gz);
      } else {
        resolve(raw);
      }
    });
    raw.once('end', () => resolve(raw));
  });
}
