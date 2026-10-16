import type { KsApi } from '@shared/types';
import { createBrowserMock } from './browserMock';

let cached: KsApi | null = null;

/** Returns the Electron bridge, or a browser-only fallback (limited: no CORS bypass, no transcoding). */
export function api(): KsApi {
  if (cached) return cached;
  cached = window.ks ?? createBrowserMock();
  return cached;
}

export const isElectron = () => !!window.ks;
