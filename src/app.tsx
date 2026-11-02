import { Hono } from 'hono';
import { loadConfig, type RigConfig } from './config.js';
import { readNight } from './digest/read.js';
import { lane } from './lane.js';
import { readStatus } from './status.js';
import { Layout } from './views/layout.js';
import { StatusBoard } from './views/status.js';

export function createApp(config: RigConfig = loadConfig()) {
  const app = new Hono();

  app.get('/health', (c) => c.json({ ok: true, lane: lane().id }));

  app.get('/', (c) =>
    c.html(
      <Layout title="status" lane={lane()}>
        <StatusBoard status={readStatus(config)} />
      </Layout>,
    ),
  );

  // Digest JSON (issue #3): the same Night as the page, straight from readNight (ADR 0001).
  app.get('/api/digest/:night', (c) => {
    const night = c.req.param('night');
    const found = readNight(config.runsDir, night);
    if (!found) return c.json({ error: 'no run log', night }, 404);
    return c.json(found);
  });

  return app;
}
