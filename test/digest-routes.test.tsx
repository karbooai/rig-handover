import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { Night } from '../src/digest/types.js';

// runs/ is read-only: every night used here lives in a temp dir.
let dir = '';
const app = () =>
  createApp({ adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: dir });

const NORMAL = '2026-11-03';
const EMPTY = '2026-11-04';
const BAD = '2026-11-05';
const MISSING = '2026-11-06';

const line = (at: string, job: string, status: string, owner: string | null, error?: string) =>
  JSON.stringify({ at, job, status, owner, ...(error ? { error } : {}) });

beforeAll(() => {
  process.env.LANE_MARKER = 'TEST-MARKER';
  dir = mkdtempSync(join(tmpdir(), 'rig-routes-'));
  const normal = [
    line('2026-11-03T01:00:00+01:00', 'zeta/cleanup', 'ok', 'lane-07'),
    line('2026-11-03T01:10:00+01:00', 'alpha/retry', 'retry', 'rook', 'timeout'),
    line('2026-11-03T01:20:00+01:00', 'alpha/retry', 'retry', 'rook', 'timeout'),
    line('2026-11-03T01:30:00+01:00', 'alpha/retry', 'retry', 'rook', 'timeout'),
    line('2026-11-03T01:40:00+01:00', 'alpha/retry', 'ok', 'rook'),
    line('2026-11-03T02:00:00+01:00', 'mid/broken', 'fail', 'lane-07', 'quota exceeded'),
    line('2026-11-03T02:10:00+01:00', 'beta/noowner', 'ok', null),
  ];
  writeFileSync(join(dir, `${NORMAL}.jsonl`), normal.join('\n') + '\n');
  writeFileSync(join(dir, `${EMPTY}.jsonl`), '');
  writeFileSync(
    join(dir, `${BAD}.jsonl`),
    line('2026-11-05T01:00:00+01:00', 'only/job', 'ok', 'rook') + '\n{"at":"2026-11-05T02:00:00+01:00","job":"tru',
  );
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

const getJson = async (night: string) => {
  const res = await app().request(`/api/digest/${night}`);
  return { res, body: (await res.json()) as Night };
};
const getPage = async (night: string) => {
  const res = await app().request(`/digest/${night}`);
  return { res, html: await res.text() };
};
// The row with this job in the page: from its cell to the end of its <tr>.
const rowHtml = (html: string, job: string) => {
  const at = html.indexOf(job);
  expect(at).toBeGreaterThan(-1);
  const start = html.lastIndexOf('<tr', at);
  return html.slice(start, html.indexOf('</tr>', at));
};

describe('GET /digest/:night', () => {
  it('200 with the lane banner and one row per job', async () => {
    const { res, html } = await getPage(NORMAL);
    expect(res.status).toBe(200);
    expect(html).toContain('TEST-MARKER');
    expect(html).toContain('<table');
    for (const job of ['alpha/retry', 'beta/noowner', 'mid/broken', 'zeta/cleanup']) expect(html).toContain(job);
    expect(html.match(/<tr/g)?.length).toBe(5); // header + 4 jobs
  });

  it('404 for a night with no file', async () => {
    const { res } = await getPage(MISSING);
    expect(res.status).toBe(404);
  });

  it('empty night says nothing ran', async () => {
    const { res, html } = await getPage(EMPTY);
    expect(res.status).toBe(200);
    expect(html).toContain('nothing ran');
  });

  it('a bad line still gives 200 and is reported', async () => {
    const { res, html } = await getPage(BAD);
    expect(res.status).toBe(200);
    expect(html).toContain('only/job');
    expect(html).toContain('1 line could not be read');
  });

  it('a clean night has no could-not-be-read line', async () => {
    const { html } = await getPage(NORMAL);
    expect(html).not.toContain('could not be read');
  });

  it('marks rows with 3+ retries or a last fail as warn, and only those', async () => {
    const { html } = await getPage(NORMAL);
    expect(rowHtml(html, 'alpha/retry')).toContain('warn');
    expect(rowHtml(html, 'mid/broken')).toContain('warn');
    expect(rowHtml(html, 'beta/noowner')).not.toContain('warn');
    expect(rowHtml(html, 'zeta/cleanup')).not.toContain('warn');
  });

  it('renders null owner and null error as —', async () => {
    const { html } = await getPage(NORMAL);
    expect(rowHtml(html, 'beta/noowner')).toContain('—');
  });
});

describe('GET /api/digest/:night', () => {
  it('200 with the Night object, rows sorted by job, owner null kept', async () => {
    const { res, body } = await getJson(NORMAL);
    expect(res.status).toBe(200);
    expect(body.night).toBe(NORMAL);
    expect(body.badLines).toBe(0);
    expect(body.counts).toEqual({ ok: 3, retry: 3, fail: 1 });
    expect(body.rows.map((r) => r.job)).toEqual(['alpha/retry', 'beta/noowner', 'mid/broken', 'zeta/cleanup']);
    expect(body.rows.find((r) => r.job === 'beta/noowner')).toMatchObject({ owner: null, lastError: null });
    expect(body.rows.find((r) => r.job === 'alpha/retry')).toMatchObject({ retries: 3, runs: 4, lastStatus: 'ok' });
    expect(body.rows.find((r) => r.job === 'mid/broken')).toMatchObject({ lastStatus: 'fail', lastError: 'quota exceeded' });
  });

  it('404 with an error body for a night with no file', async () => {
    const res = await app().request(`/api/digest/${MISSING}`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'no run log', night: MISSING });
  });

  it('empty night is 200 with no rows', async () => {
    const { res, body } = await getJson(EMPTY);
    expect(res.status).toBe(200);
    expect(body.rows).toEqual([]);
  });

  it('a bad line still gives 200 with badLines 1', async () => {
    const { res, body } = await getJson(BAD);
    expect(res.status).toBe(200);
    expect(body.badLines).toBe(1);
    expect(body.rows).toHaveLength(1);
  });
});

describe('page and JSON agree', () => {
  it('lists the jobs in the same order', async () => {
    const { body } = await getJson(NORMAL);
    const { html } = await getPage(NORMAL);
    const jobs = body.rows.map((r) => r.job);
    const positions = jobs.map((j) => html.indexOf(j));
    expect(positions.every((p) => p > -1)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });
});
