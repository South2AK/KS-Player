// Dev runner: builds main/preload with esbuild (watch), starts vite dev server, launches electron.
import { spawn } from 'node:child_process';
import { context } from 'esbuild';
import { createServer } from 'vite';
import electronPath from 'electron';

const ctx = await context({
  entryPoints: ['electron/main.ts', 'electron/preload.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outdir: 'dist-electron',
  external: ['electron', 'ffmpeg-static'],
  sourcemap: true,
});
await ctx.watch();

const server = await createServer({ configFile: 'vite.config.ts' });
await server.listen();
const url = `http://localhost:${server.config.server.port}`;
console.log('[dev] renderer at', url);

const child = spawn(electronPath, ['.'], {
  stdio: 'inherit',
  env: { ...process.env, VITE_DEV_SERVER_URL: url },
});
child.on('exit', async () => {
  await ctx.dispose();
  await server.close();
  process.exit(0);
});
