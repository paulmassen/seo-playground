import { readFile } from 'node:fs/promises';

const interval = Math.max(Number.parseInt(process.env.GEO_GRID_WORKER_INTERVAL_MS ?? '60000', 10) || 60000, 10_000);
const appUrl = (process.env.GEO_GRID_WORKER_URL ?? `http://127.0.0.1:${process.env.PORT ?? '3000'}`).replace(/\/$/, '');
const endpoint = `${appUrl}/api/cron/geo-grid`;

async function getSecret() {
  if (process.env.CRON_SECRET?.trim()) return process.env.CRON_SECRET.trim();
  if (!process.env.CRON_SECRET_FILE) return null;
  try {
    return (await readFile(process.env.CRON_SECRET_FILE, 'utf8')).trim() || null;
  } catch {
    return null;
  }
}

let running = false;
async function run() {
  if (running) return;
  running = true;
  try {
    const secret = await getSecret();
    if (!secret) {
      console.error('[geo-grid-worker] No CRON_SECRET or CRON_SECRET_FILE is available; retrying shortly.');
      return;
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}` },
      // A pass polls every project's pending tasks one after another, so it can take minutes.
      // Aborting early only hides its result: the server keeps working either way.
      signal: AbortSignal.timeout(10 * 60_000),
    });
    if (!response.ok) {
      console.error(`[geo-grid-worker] ${response.status} while checking scheduled runs.`);
      return;
    }

    const result = await response.json();
    if (result.busy) {
      console.info('[geo-grid-worker] Previous pass still running; skipped this check.');
      return;
    }
    if (result.due || result.started?.length || result.failed?.length || result.completed) {
      console.info(`[geo-grid-worker] due=${result.due ?? 0} started=${result.started?.length ?? 0} checked=${result.pendingChecked ?? 0} completed=${result.completed ?? 0} failed=${result.failed?.length ?? 0}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[geo-grid-worker] ${message}`);
  } finally {
    running = false;
  }
}

console.info(`[geo-grid-worker] Checking ${endpoint} every ${Math.round(interval / 1000)} seconds.`);
void run();
const timer = setInterval(() => void run(), interval);

function stop() {
  clearInterval(timer);
  process.exit(0);
}

process.once('SIGINT', stop);
process.once('SIGTERM', stop);
