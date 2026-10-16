import Hls from 'hls.js';
import mpegts from 'mpegts.js';
import { api } from './api';

export interface Track {
  id: number;
  label: string;
  active: boolean;
}

export type EngineKind = 'native' | 'hls' | 'mpegts' | null;

export interface EngineState {
  status: 'idle' | 'loading' | 'playing' | 'paused' | 'buffering' | 'error' | 'ended';
  error: string | null;
  live: boolean;
  /** 0 = direct, 1 = ffmpeg (audio only re-encoded), 2 = ffmpeg (full re-encode) */
  transcode: 0 | 1 | 2;
  duration: number;
  audioTracks: Track[];
  subtitleTracks: Track[];
  volume: number;
  muted: boolean;
  rate: number;
  url: string | null;
  engine: EngineKind;
  width: number;
  height: number;
}

export interface PlayOptions {
  url: string;
  live: boolean;
  startAt?: number;
  userAgent?: string;
  allowTranscode?: boolean;
  /** target buffer (seconds) for live streams: pre-buffer before start and after stalls */
  bufferSeconds?: number;
}

type Listener = (s: EngineState) => void;
type TimeListener = (time: number, duration: number, buffered: number) => void;

const LOAD_TIMEOUT = 30_000;
const STALL_TIMEOUT = 40_000;

export class Engine {
  readonly video: HTMLVideoElement;
  state: EngineState;
  private listeners = new Set<Listener>();
  private timeListeners = new Set<TimeListener>();
  private hls: Hls | null = null;
  private mp: mpegts.Player | null = null;
  private transcodeId: string | null = null;
  private seekOffset = 0;
  private opts: PlayOptions | null = null;
  private attempt: 0 | 1 | 2 = 0;
  private token = 0;
  private loadTimer: ReturnType<typeof setTimeout> | null = null;
  private stallTimer: ReturnType<typeof setTimeout> | null = null;
  private networkRetries = 0;
  private transcodeAvailable: boolean | null = null;
  private holding = false;
  private holdTimer: ReturnType<typeof setInterval> | null = null;
  private initialHoldDone = false;

  constructor() {
    const v = document.createElement('video');
    v.autoplay = true;
    v.playsInline = true;
    v.preload = 'auto';
    v.style.width = '100%';
    v.style.height = '100%';
    v.style.background = '#000';
    this.video = v;
    this.state = {
      status: 'idle', error: null, live: true, transcode: 0, duration: 0, audioTracks: [], subtitleTracks: [],
      volume: 1, muted: false, rate: 1, url: null, engine: null, width: 0, height: 0,
    };
    v.addEventListener('playing', () => { if (this.holding) return; this.clearTimers(); this.set({ status: 'playing' }); });
    v.addEventListener('pause', () => { if (this.holding) return; if (this.state.status !== 'idle' && this.state.status !== 'error' && this.state.status !== 'loading') this.set({ status: 'paused' }); });
    v.addEventListener('waiting', () => {
      if (this.holding) return;
      if (this.state.status === 'playing' || this.state.status === 'buffering') {
        this.set({ status: 'buffering' });
        this.armStall();
        if (this.shouldHold()) this.hold(this.token, this.bufferTarget(), 25_000);
      }
    });
    v.addEventListener('loadeddata', () => {
      // Initial pre-buffer for live streams so playback does not start from an empty buffer
      if (!this.initialHoldDone && this.shouldHold()) { this.initialHoldDone = true; this.hold(this.token, Math.min(this.bufferTarget(), 4), 8_000); }
    });
    v.addEventListener('ended', () => this.set({ status: 'ended' }));
    v.addEventListener('timeupdate', () => this.emitTime());
    v.addEventListener('progress', () => this.emitTime());
    v.addEventListener('durationchange', () => this.set({ duration: this.duration }));
    v.addEventListener('loadedmetadata', () => { this.set({ duration: this.duration, width: v.videoWidth, height: v.videoHeight }); this.refreshTracks(); });
    v.addEventListener('resize', () => this.set({ width: v.videoWidth, height: v.videoHeight }));
    v.addEventListener('volumechange', () => this.set({ volume: v.volume, muted: v.muted }));
    v.addEventListener('ratechange', () => this.set({ rate: v.playbackRate }));
    v.addEventListener('error', () => {
      const err = v.error;
      if (!err) return;
      const code = err.code;
      if (this.state.engine === 'native' || this.state.engine === null) {
        if (code === MediaError.MEDIA_ERR_NETWORK && this.networkRetries < 1) {
          this.networkRetries++;
          setTimeout(() => this.restart(false), 1500);
          return;
        }
      }
      this.onFail(`Media error ${code}${err.message ? ': ' + err.message : ''}`);
    });
    (v as any).audioTracks?.addEventListener?.('change', () => this.refreshTracks());
    v.textTracks?.addEventListener?.('change', () => this.refreshTracks());
  }

  // ---------- subscriptions ----------
  subscribe(fn: Listener): () => void { this.listeners.add(fn); fn(this.state); return () => this.listeners.delete(fn); }
  onTime(fn: TimeListener): () => void { this.timeListeners.add(fn); return () => this.timeListeners.delete(fn); }
  private set(patch: Partial<EngineState>) {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l(this.state);
  }
  private emitTime() {
    const t = this.time, d = this.duration, b = this.bufferedEnd;
    for (const l of this.timeListeners) l(t, d, b);
  }

  // ---------- buffering helpers ----------
  private bufferTarget(): number { return Math.max(1, this.opts?.bufferSeconds ?? 5); }
  private shouldHold(): boolean { return !!this.opts && (this.opts.live || this.attempt > 0); }
  /** Seconds of media buffered ahead of the playhead. */
  aheadSeconds(): number {
    const v = this.video, b = v.buffered;
    if (!b) return 0;
    for (let i = 0; i < b.length; i++) {
      try { if (b.start(i) <= v.currentTime + 0.5 && b.end(i) >= v.currentTime) return b.end(i) - v.currentTime; } catch { /* ignore */ }
    }
    return 0;
  }
  /** Pauses until `target` seconds are buffered (or data stops arriving / maxWait elapses), then resumes. */
  private hold(token: number, target: number, maxWaitMs: number) {
    if (this.holding) return;
    const v = this.video;
    this.holding = true;
    v.pause();
    this.set({ status: 'buffering' });
    const started = Date.now();
    let lastAhead = -1, lastChange = Date.now();
    if (this.holdTimer) clearInterval(this.holdTimer);
    this.holdTimer = setInterval(() => {
      if (token !== this.token || !this.holding) { this.endHold(); return; }
      const ahead = this.aheadSeconds();
      if (Math.abs(ahead - lastAhead) > 0.05) { lastAhead = ahead; lastChange = Date.now(); }
      const dataStalled = Date.now() - lastChange > 5_000 && ahead > 0.5;
      if (ahead >= target || Date.now() - started > maxWaitMs || dataStalled) {
        this.endHold();
        v.play().catch(() => {});
      }
    }, 200);
  }
  private endHold() {
    this.holding = false;
    if (this.holdTimer) { clearInterval(this.holdTimer); this.holdTimer = null; }
  }

  // ---------- getters ----------
  get time(): number { return this.seekOffset + (this.video.currentTime || 0); }
  get duration(): number {
    if (this.attempt > 0 && this.transcodeDuration) return this.transcodeDuration;
    const d = this.video.duration;
    return isFinite(d) ? d : 0;
  }
  get bufferedEnd(): number {
    const b = this.video.buffered;
    if (!b || !b.length) return this.time;
    try { return this.seekOffset + b.end(b.length - 1); } catch { return this.time; }
  }
  private transcodeDuration: number | undefined;

  // ---------- control ----------
  async play(opts: PlayOptions) {
    const token = ++this.token;
    this.cleanup();
    this.opts = opts;
    this.attempt = 0;
    this.networkRetries = 0;
    this.seekOffset = 0;
    this.transcodeDuration = undefined;
    this.initialHoldDone = false;
    this.endHold();
    this.set({ status: 'loading', error: null, live: opts.live, transcode: 0, duration: 0, url: opts.url, audioTracks: [], subtitleTracks: [], width: 0, height: 0 });
    if (this.transcodeAvailable === null) {
      try { this.transcodeAvailable = await api().transcode.available(); } catch { this.transcodeAvailable = false; }
    }
    if (token !== this.token) return;
    await this.start(token, opts.startAt || 0);
  }

  private async start(token: number, position: number) {
    const opts = this.opts!;
    this.clearTimers();
    this.set({ status: 'loading', error: null, transcode: this.attempt });
    let url = opts.url;
    let engine: EngineKind = 'native';
    let live = opts.live;

    if (this.attempt > 0) {
      try {
        const session = await api().transcode.start(opts.url, position, opts.userAgent, this.attempt === 1 ? 'audio' : 'full');
        if (token !== this.token) { api().transcode.stop(session.id); return; }
        this.transcodeId = session.id;
        this.transcodeDuration = session.duration && session.duration > 0 ? session.duration : undefined;
        this.seekOffset = position;
        url = session.url;
        engine = 'mpegts';
        live = true; // served as a live TS stream; seeking restarts ffmpeg
      } catch (e: any) {
        this.set({ status: 'error', error: e?.message || String(e) });
        return;
      }
    } else {
      const lower = url.toLowerCase().split('?')[0];
      if (/\.m3u8$/.test(lower) || /m3u8/.test(url.toLowerCase())) engine = Hls.isSupported() ? 'hls' : 'native';
      else if (/\.(ts|m2ts)$/.test(lower) || /timeshift/.test(lower) || (opts.live && !/\.[a-z0-9]{2,4}$/.test(lower))) engine = 'mpegts';
      else engine = 'native';
      if (engine === 'mpegts' && !mpegts.isSupported()) engine = 'native';
    }

    this.set({ engine });
    const v = this.video;
    v.playbackRate = this.state.rate;
    const target = this.bufferTarget();
    this.initialHoldDone = false;
    this.endHold();

    this.loadTimer = setTimeout(() => {
      if (token === this.token && this.state.status === 'loading') this.onFail('Timeout');
    }, LOAD_TIMEOUT);

    if (engine === 'hls') {
      const hls = new Hls({
        enableWorker: true,
        backBufferLength: 30,
        maxBufferLength: Math.max(30, target * 6),
        maxMaxBufferLength: 600,
        maxBufferSize: 120 * 1000 * 1000,
        liveSyncDurationCount: target >= 15 ? 6 : target >= 8 ? 4 : 3,
        fragLoadingMaxRetry: 6,
        levelLoadingMaxRetry: 4,
        manifestLoadingMaxRetry: 3,
        nudgeMaxRetry: 10,
      });
      this.hls = hls;
      hls.on(Hls.Events.MANIFEST_PARSED, () => { v.play().catch(() => {}); });
      hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, () => this.refreshTracks());
      hls.on(Hls.Events.AUDIO_TRACK_SWITCHED, () => this.refreshTracks());
      hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, () => this.refreshTracks());
      hls.on(Hls.Events.SUBTITLE_TRACK_SWITCH, () => this.refreshTracks());
      hls.on(Hls.Events.LEVEL_LOADED, (_e, data) => { this.set({ live: !!data.details.live, duration: this.duration }); });
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (!data.fatal) return;
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR && this.networkRetries < 2) {
          this.networkRetries++;
          setTimeout(() => { if (token === this.token) hls.startLoad(); }, 1500);
        } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR && this.networkRetries < 2) {
          this.networkRetries++;
          hls.recoverMediaError();
        } else {
          this.onFail(`HLS: ${data.details}`);
        }
      });
      hls.attachMedia(v);
      hls.loadSource(url);
      if (position > 0 && !live) v.currentTime = position;
    } else if (engine === 'mpegts') {
      const player = mpegts.createPlayer(
        { type: 'mpegts', isLive: live, url, cors: true, withCredentials: false },
        {
          enableWorker: true,
          enableStashBuffer: true,
          stashInitialSize: this.attempt > 0 ? 128 * 1024 : Math.min(2048, 128 * target) * 1024,
          // Latency chasing only for the low-latency setting; otherwise keep whatever buffer we have.
          liveBufferLatencyChasing: live && target <= 2 && !(this.attempt > 0 && this.transcodeDuration),
          liveBufferLatencyMaxLatency: Math.max(6, target * 3),
          liveBufferLatencyMinRemain: Math.max(1.5, target),
          autoCleanupSourceBuffer: true,
          autoCleanupMaxBackwardDuration: 60,
          autoCleanupMinBackwardDuration: 30,
          lazyLoad: false,
          reuseRedirectedURL: true,
        },
      );
      this.mp = player;
      player.attachMediaElement(v);
      player.on(mpegts.Events.ERROR, (type: string, detail: string, info: any) => {
        if (type === mpegts.ErrorTypes.NETWORK_ERROR && this.networkRetries < 2 && this.attempt === 0) {
          this.networkRetries++;
          setTimeout(() => { if (token === this.token) { try { player.unload(); player.load(); player.play(); } catch { /* ignore */ } } }, 1500);
          return;
        }
        this.onFail(`${type}: ${detail}${info?.msg ? ' – ' + info.msg : ''}`);
      });
      player.on(mpegts.Events.MEDIA_INFO, () => this.refreshTracks());
      player.load();
      player.play()?.catch?.(() => {});
      if (!live && position > 0) v.currentTime = position;
    } else {
      v.src = url;
      if (position > 0) v.currentTime = position;
      v.play().catch(() => {});
    }
  }

  private onFail(reason: string) {
    if (this.state.status === 'idle') return;
    const opts = this.opts;
    if (!opts) return;
    const canTranscode = opts.allowTranscode !== false && this.transcodeAvailable;
    if (canTranscode && this.attempt < 2) {
      const pos = opts.live ? 0 : this.time;
      this.attempt = (this.attempt + 1) as 1 | 2;
      this.networkRetries = 0;
      this.teardownEngines();
      const token = this.token;
      this.start(token, pos);
      return;
    }
    this.clearTimers();
    this.set({ status: 'error', error: reason });
  }

  /** Manually force compatibility mode (ffmpeg). */
  forceTranscode() {
    if (!this.opts) return;
    const pos = this.opts.live ? 0 : this.time;
    this.attempt = this.attempt === 1 ? 2 : 1;
    this.networkRetries = 0;
    this.teardownEngines();
    this.start(this.token, pos);
  }

  retry() {
    if (!this.opts) return;
    const pos = this.opts.live ? 0 : this.time;
    this.play({ ...this.opts, startAt: pos });
  }

  private restart(resetAttempt: boolean) {
    if (!this.opts) return;
    const pos = this.opts.live ? 0 : this.time;
    if (resetAttempt) this.attempt = 0;
    this.teardownEngines();
    this.start(this.token, pos);
  }

  stop() {
    this.token++;
    this.cleanup();
    this.opts = null;
    this.set({ status: 'idle', error: null, url: null, engine: null, audioTracks: [], subtitleTracks: [], duration: 0, width: 0, height: 0 });
  }

  togglePlay() {
    const v = this.video;
    if (this.state.status === 'error') { this.retry(); return; }
    if (this.holding) { this.endHold(); v.play().catch(() => {}); return; }
    if (v.paused) v.play().catch(() => {}); else v.pause();
  }

  seek(t: number) {
    if (!this.opts) return;
    const d = this.duration;
    if (d > 0) t = Math.max(0, Math.min(d - 0.5, t));
    if (this.attempt > 0 && !this.opts.live) {
      this.teardownEngines();
      this.start(this.token, t);
    } else if (this.attempt > 0) {
      return; // live transcode: not seekable
    } else {
      this.video.currentTime = Math.max(0, t);
    }
    this.emitTime();
  }
  seekBy(delta: number) { this.seek(this.time + delta); }

  setVolume(v: number) { this.video.volume = Math.max(0, Math.min(1, v)); if (v > 0) this.video.muted = false; }
  setMuted(m: boolean) { this.video.muted = m; }
  setRate(r: number) { this.video.playbackRate = r; }

  setAudioTrack(id: number) {
    if (this.hls) { this.hls.audioTrack = id; return; }
    const tracks = (this.video as any).audioTracks;
    if (tracks && tracks.length) {
      for (let i = 0; i < tracks.length; i++) tracks[i].enabled = i === id;
      this.refreshTracks();
    }
  }
  setSubtitleTrack(id: number) {
    if (this.hls) { this.hls.subtitleTrack = id; this.hls.subtitleDisplay = id >= 0; return; }
    const tt = this.video.textTracks;
    if (tt) {
      for (let i = 0; i < tt.length; i++) tt[i].mode = i === id ? 'showing' : 'disabled';
      this.refreshTracks();
    }
  }

  private refreshTracks() {
    let audio: Track[] = [];
    let subs: Track[] = [];
    if (this.hls) {
      audio = this.hls.audioTracks.map((t, i) => ({ id: i, label: t.name || t.lang || `Audio ${i + 1}`, active: this.hls!.audioTrack === i }));
      subs = this.hls.subtitleTracks.map((t, i) => ({ id: i, label: t.name || t.lang || `Sub ${i + 1}`, active: this.hls!.subtitleTrack === i }));
    } else {
      const at = (this.video as any).audioTracks;
      if (at && at.length > 1) {
        for (let i = 0; i < at.length; i++) audio.push({ id: i, label: at[i].label || at[i].language || `Audio ${i + 1}`, active: !!at[i].enabled });
      }
      const tt = this.video.textTracks;
      if (tt && tt.length) {
        for (let i = 0; i < tt.length; i++) subs.push({ id: i, label: tt[i].label || tt[i].language || `Sub ${i + 1}`, active: tt[i].mode === 'showing' });
      }
    }
    this.set({ audioTracks: audio, subtitleTracks: subs });
  }

  private armStall() {
    if (this.stallTimer) clearTimeout(this.stallTimer);
    this.stallTimer = setTimeout(() => {
      if (this.state.status === 'buffering') this.onFail('Stream stalled');
    }, STALL_TIMEOUT);
  }
  private clearTimers() {
    if (this.loadTimer) clearTimeout(this.loadTimer);
    if (this.stallTimer) clearTimeout(this.stallTimer);
    this.loadTimer = null;
    this.stallTimer = null;
  }
  private teardownEngines() {
    this.clearTimers();
    this.endHold();
    if (this.hls) { try { this.hls.destroy(); } catch { /* ignore */ } this.hls = null; }
    if (this.mp) { try { this.mp.pause(); this.mp.unload(); this.mp.detachMediaElement(); this.mp.destroy(); } catch { /* ignore */ } this.mp = null; }
    if (this.transcodeId) { const id = this.transcodeId; this.transcodeId = null; api().transcode.stop(id).catch(() => {}); }
    const v = this.video;
    v.removeAttribute('src');
    try { v.load(); } catch { /* ignore */ }
  }
  private cleanup() {
    this.teardownEngines();
    this.seekOffset = 0;
    this.transcodeDuration = undefined;
  }
}

export const engine = new Engine();
/** Secondary engines for multi-view tiles. */
export const tileEngines: Engine[] = [];
export function getTileEngine(i: number): Engine {
  while (tileEngines.length <= i) tileEngines.push(new Engine());
  return tileEngines[i];
}
