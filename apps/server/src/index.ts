import fs from 'node:fs';
import path from 'node:path';
import { buildApp, SERVER_ROOT } from './app';

// Local config: apps/server/.env, then the repo-root .env (real environment variables win; see .env.example).
for (const file of [path.join(SERVER_ROOT, '.env'), path.join(SERVER_ROOT, '..', '..', '.env')]) {
  if (fs.existsSync(file)) process.loadEnvFile(file);
}

const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? '0.0.0.0';

const app = await buildApp({ logger: process.env.HUDDLE_LOG === '1' });

try {
  await app.listen({ port, host });
  console.log(`[huddle] server listening on http://${host === '0.0.0.0' ? 'localhost' : host}:${port} (gateway: /gateway)`);
} catch (err) {
  console.error('[huddle] failed to start', err);
  process.exit(1);
}

let closing = false;
for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, async () => {
    if (closing) process.exit(1);
    closing = true;
    await app.close().catch(() => {});
    process.exit(0);
  });
}
