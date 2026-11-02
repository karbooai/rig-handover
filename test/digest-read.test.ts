import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';

// runs/ is read-only: only read from it. Extra cases go to a temp dir.
const tmp = mkdtempSync(join(tmpdir(), 'rig-digest-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe('readNight on runs/2026-10-28.jsonl', () => {
  const night = readNight('runs', '2026-10-28');
  const row = (job: string) => night?.rows.find((r) => r.job === job);

  it('has 5 jobs, sorted, and 1 bad line', () => {
    expect(night).not.toBeNull();
    expect(night?.night).toBe('2026-10-28');
    expect(night?.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
    expect(night?.badLines).toBe(1);
    expect(night?.counts).toEqual({ ok: 10, retry: 4, fail: 1 });
  });

  it('fixtures/refresh: 4 runs, 3 retries, last ok', () => {
    expect(row('fixtures/refresh')).toEqual({
      job: 'fixtures/refresh',
      owner: 'rook',
      runs: 4,
      retries: 3,
      lastStatus: 'ok',
      lastError: null,
      firstAt: '2026-10-29T01:30:00+01:00',
      lastAt: '2026-10-29T01:37:00+01:00',
    });
  });

  it('lane/sync: the truncated last line is not a run', () => {
    expect(row('lane/sync')).toMatchObject({ runs: 8, retries: 1, lastStatus: 'ok', lastError: null });
    expect(row('lane/sync')?.firstAt).toBe('2026-10-28T23:00:06+01:00');
    expect(row('lane/sync')?.lastAt).toBe('2026-10-29T05:00:04+01:00');
  });

  it('notes/backup: last fail with its error', () => {
    expect(row('notes/backup')).toMatchObject({ runs: 1, lastStatus: 'fail', lastError: 'quota exceeded', owner: 'lane-07' });
  });

  it('digest/render: owner null is kept as null', () => {
    expect(row('digest/render')).toMatchObject({ owner: null, runs: 1, lastStatus: 'ok' });
  });
});

describe('readNight edge cases', () => {
  it('a night with no file is null', () => {
    expect(readNight('runs', '2026-10-30')).toBeNull();
    expect(readNight(join(tmp, 'nope'), '2026-10-28')).toBeNull();
  });

  it('a night that is not YYYY-MM-DD is null', () => {
    expect(readNight('runs', '../package')).toBeNull();
  });

  it('an empty file is a night with no rows', () => {
    writeFileSync(join(tmp, '2026-11-01.jsonl'), '');
    expect(readNight(tmp, '2026-11-01')).toEqual({ night: '2026-11-01', rows: [], badLines: 0, counts: { ok: 0, retry: 0, fail: 0 } });
  });

  it('counts invalid records as bad lines and orders by instant, keeping the offset', () => {
    const lines = [
      '{"at":"2026-11-02T01:00:00+01:00","job":"a","status":"ok","owner":"x"}',
      '{"at":"2026-11-01T23:30:00Z","job":"a","status":"retry","owner":"y","error":"late"}', // 00:30+01:00: earlier
      '{"job":"a","status":"ok","owner":"x"}', // no at
      '{"at":"2026-11-02T02:00:00+01:00","job":"a","status":"maybe"}', // bad status
      '{"at":"yesterday","job":"a","status":"ok"}', // bad at
      '[1,2]',
      'not json',
      '',
    ];
    writeFileSync(join(tmp, '2026-11-02.jsonl'), lines.join('\n'));
    const night = readNight(tmp, '2026-11-02');
    expect(night?.badLines).toBe(5);
    expect(night?.rows).toEqual([
      {
        job: 'a',
        owner: 'x',
        runs: 2,
        retries: 1,
        lastStatus: 'ok',
        lastError: null,
        firstAt: '2026-11-01T23:30:00Z',
        lastAt: '2026-11-02T01:00:00+01:00',
      },
    ]);
  });
});
