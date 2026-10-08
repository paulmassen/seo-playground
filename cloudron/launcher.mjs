// Runs the Next.js standalone server and the Geo-grid worker in one container.
// Equivalent of scripts/run-with-worker.mjs, which cannot be used here: it needs the full
// node_modules tree, while the standalone bundle only ships `server.js`.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const env = { ...process.env };

const web = spawn(process.execPath, [join(root, 'server.js')], { cwd: root, env, stdio: 'inherit' });
const worker = spawn(process.execPath, [join(root, 'scripts', 'geo-grid-worker.mjs')], { cwd: root, env, stdio: 'inherit' });
const children = [web, worker];
let stopping = false;

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  children.forEach((child) => child.kill('SIGTERM'));
  // Give SQLite a moment to checkpoint its WAL files before the container goes away.
  setTimeout(() => process.exit(code), 8_000).unref();
  Promise.all(children.map((child) => new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) resolve();
    else child.once('exit', resolve);
  }))).then(() => process.exit(code));
}

process.once('SIGINT', () => stop());
process.once('SIGTERM', () => stop());

for (const child of children) {
  child.once('exit', (code, signal) => {
    if (stopping) return;
    console.error(`[launcher] ${child === web ? 'Web server' : 'Geo-grid worker'} stopped unexpectedly (${signal ?? code ?? 'unknown'}).`);
    // Exiting non-zero lets Cloudron restart the whole app.
    stop(code && code !== 0 ? code : 1);
  });
}
