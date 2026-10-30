import { buildApp } from './app';

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
