import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { spawn, ChildProcess } from 'node:child_process';
import { app } from 'electron';
import type { AddressInfo } from 'node:net';
import type { TranscodeSession } from '../../shared/types';

interface Session {
  id: string;
  url: string;
  seek: number;
  userAgent?: string;
  mode: 'audio' | 'full';
  proc?: ChildProcess;
  duration?: number;
}

const sessions = new Map<string, Session>();
const durationCache = new Map<string, number | undefined>();
let server: http.Server | null = null;
let port = 0;
let ffmpegPath: string | null | undefined;

export function getFfmpegPath(): string | null {
  if (ffmpegPath !== undefined) return ffmpegPath;
  const candidates: string[] = [];
  if (app.isPackaged) candidates.push(path.join(process.resourcesPath, 'ffmpeg.exe'));
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const p = require('ffmpeg-static') as string;
    if (p) candidates.push(p.replace('app.asar', 'app.asar.unpacked'));
  } catch { /* not installed */ }
  candidates.push(path.join(process.cwd(), 'ffmpeg.exe'));
  ffmpegPath = candidates.find((c) => c && fs.existsSync(c)) || null;
  return ffmpegPath;
}

function ensureServer(): Promise<number> {
  if (server && port) return Promise.resolve(port);
  return new Promise((resolve, reject) => {
    server = http.createServer(handleRequest);
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      port = (server!.address() as AddressInfo).port;
      resolve(port);
    });
  });
}

function buildArgs(s: Session): string[] {
  const args = ['-hide_banner', '-loglevel', 'error', '-nostdin'];
  if (/^https?:/i.test(s.url)) {
    args.push('-user_agent', s.userAgent || 'KS Player/1.0');
    args.push('-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '5');
  }
  if (s.seek > 0) args.push('-ss', String(s.seek));
  // VOD (known duration): throttle ffmpeg to slightly above realtime so the browser buffer stays bounded.
  if (s.duration && s.duration > 0) args.push('-readrate', '1.25', '-readrate_initial_burst', '10');
  args.push('-i', s.url);
  args.push('-map', '0:v:0?', '-map', '0:a:0?', '-sn', '-dn');
  if (s.mode === 'full') {
    args.push('-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'zerolatency', '-crf', '23', '-pix_fmt', 'yuv420p');
  } else {
    args.push('-c:v', 'copy');
  }
  args.push('-c:a', 'aac', '-ac', '2', '-b:a', '192k', '-af', 'aresample=async=1');
  args.push('-f', 'mpegts', '-mpegts_flags', '+resend_headers', '-muxdelay', '0', 'pipe:1');
  return args;
}

function handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
  const m = (req.url || '').match(/^\/t\/([a-z0-9]+)/i);
  const s = m ? sessions.get(m[1]) : undefined;
  const ff = getFfmpegPath();
  if (!s || !ff) {
    res.writeHead(404);
    res.end();
    return;
  }
  // Only one consumer per session: kill previous ffmpeg
  if (s.proc) { try { s.proc.kill('SIGKILL'); } catch { /* ignore */ } }

  res.writeHead(200, {
    'Content-Type': 'video/mp2t',
    'Cache-Control': 'no-cache, no-store',
    'Access-Control-Allow-Origin': '*',
    Connection: 'keep-alive',
  });
  const proc = spawn(ff, buildArgs(s), { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  s.proc = proc;
  proc.stdout!.pipe(res);
  proc.stderr!.on('data', (d) => console.error('[ffmpeg]', String(d).trim()));
  proc.on('close', () => { if (!res.writableEnded) res.end(); });
  const kill = () => { try { proc.kill('SIGKILL'); } catch { /* ignore */ } };
  req.on('close', kill);
  res.on('close', kill);
}

function probeDuration(s: Session): Promise<number | undefined> {
  const ff = getFfmpegPath();
  if (!ff) return Promise.resolve(undefined);
  return new Promise((resolve) => {
    const args = ['-hide_banner', '-nostdin'];
    if (/^https?:/i.test(s.url)) args.push('-user_agent', s.userAgent || 'KS Player/1.0');
    args.push('-i', s.url);
    const p = spawn(ff, args, { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
    let err = '';
    const t = setTimeout(() => { try { p.kill('SIGKILL'); } catch { /* ignore */ } }, 10_000);
    p.stderr!.on('data', (d) => { err += String(d); });
    p.on('close', () => {
      clearTimeout(t);
      const m = err.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
      if (m) resolve(+m[1] * 3600 + +m[2] * 60 + +m[3]);
      else resolve(undefined);
    });
    p.on('error', () => { clearTimeout(t); resolve(undefined); });
  });
}

export async function startTranscode(url: string, seek = 0, userAgent?: string, mode: 'audio' | 'full' = 'audio'): Promise<TranscodeSession> {
  if (!getFfmpegPath()) throw new Error('ffmpeg nicht gefunden');
  const p = await ensureServer();
  const id = Math.random().toString(36).slice(2, 10);
  const s: Session = { id, url, seek, userAgent, mode };
  sessions.set(id, s);
  let duration: number | undefined;
  if (durationCache.has(url)) duration = durationCache.get(url);
  else { duration = await probeDuration(s); durationCache.set(url, duration); }
  s.duration = duration;
  return { id, url: `http://127.0.0.1:${p}/t/${id}`, duration };
}

export function stopTranscode(id: string) {
  const s = sessions.get(id);
  if (!s) return;
  if (s.proc) { try { s.proc.kill('SIGKILL'); } catch { /* ignore */ } }
  sessions.delete(id);
}

export function stopAllTranscodes() {
  for (const id of [...sessions.keys()]) stopTranscode(id);
  server?.close();
  server = null;
  port = 0;
}
