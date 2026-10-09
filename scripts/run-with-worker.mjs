import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { serverOptions } from './server-options.mjs';

const mode = process.argv[2];
if (mode !== 'dev' && mode !== 'start') {
  console.error('Usage: node scripts/run-with-worker.mjs <dev|start>');
  process.exit(1);
}

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const nextBin = join(root, 'node_modules', 'next', 'dist', 'bin', 'next');
const cronSecret = process.env.CRON_SECRET?.trim() || randomBytes(32).toString('base64url');
const { port, hostname } = serverOptions();
const env = { ...process.env, PORT: port, CRON_SECRET: cronSecret };
const web = spawn(process.execPath, [nextBin, mode, '-p', port, '-H', hostname], { cwd: root, env, stdio: 'inherit' });
const worker = spawn(process.execPath, [join(root, 'scripts', 'geo-grid-worker.mjs')], { cwd: root, env, stdio: 'inherit' });
const children = [web, worker];
let stopping = false;

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  children.forEach((child) => child.kill('SIGTERM'));
  setTimeout(() => process.exit(code), 5_000).unref();
}

process.once('SIGINT', () => stop());
process.once('SIGTERM', () => stop());

for (const child of children) {
  child.once('exit', (code, signal) => {
    if (stopping) return;
    console.error(`[launcher] ${child === web ? 'Web server' : 'Geo-grid worker'} stopped unexpectedly (${signal ?? code ?? 'unknown'}).`);
    process.exitCode = code && code !== 0 ? code : 1;
    stop(process.exitCode);
  });
}
