import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, Night, ReadNight, RunStatus } from './types.js';

type Line = { at: string; instant: number; job: string; status: RunStatus; owner: string | null; error: string | null };

const NIGHT = /^\d{4}-\d{2}-\d{2}$/;
// ISO 8601 with an explicit offset: the instant must not depend on the reader's time zone.
const AT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
const STATUSES: readonly RunStatus[] = ['ok', 'retry', 'fail'];

function isStatus(v: unknown): v is RunStatus {
  return typeof v === 'string' && (STATUSES as readonly string[]).includes(v);
}

// One log line → Line, or null if it is not a valid run record.
export function parseLine(text: string): Line | null {
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const { at, job, status, owner, error } = o;
  if (typeof at !== 'string' || !AT.test(at)) return null;
  const instant = Date.parse(at);
  if (Number.isNaN(instant)) return null;
  if (typeof job !== 'string' || job === '') return null;
  if (!isStatus(status)) return null;
  if (owner !== undefined && owner !== null && typeof owner !== 'string') return null;
  if (error !== undefined && error !== null && typeof error !== 'string') return null;
  return { at, instant, job, status, owner: owner ?? null, error: error ?? null };
}

export function digest(night: string, text: string): Night {
  const counts: Record<RunStatus, number> = { ok: 0, retry: 0, fail: 0 };
  const byJob = new Map<string, { row: DigestRow; first: number; last: number }>();
  let badLines = 0;

  for (const raw of text.split('\n')) {
    if (raw.trim() === '') continue;
    const line = parseLine(raw);
    if (!line) {
      badLines++;
      continue;
    }
    counts[line.status]++;
    const seen = byJob.get(line.job);
    if (!seen) {
      byJob.set(line.job, {
        first: line.instant,
        last: line.instant,
        row: {
          job: line.job,
          owner: line.owner,
          runs: 1,
          retries: line.status === 'retry' ? 1 : 0,
          lastStatus: line.status,
          lastError: line.error,
          firstAt: line.at,
          lastAt: line.at,
        },
      });
      continue;
    }
    const { row } = seen;
    row.runs++;
    if (line.status === 'retry') row.retries++;
    if (line.instant < seen.first) {
      seen.first = line.instant;
      row.firstAt = line.at;
    }
    // Same instant: the later line in the file wins.
    if (line.instant >= seen.last) {
      seen.last = line.instant;
      row.lastAt = line.at;
      row.lastStatus = line.status;
      row.lastError = line.error;
      row.owner = line.owner;
    }
  }

  const rows = [...byJob.values()].map((s) => s.row).sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0));
  return { night, rows, badLines, counts };
}

export const readNight: ReadNight = (runsDir, night) => {
  if (!NIGHT.test(night)) return null;
  let text: string;
  try {
    text = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (e) {
    if (e instanceof Error && 'code' in e && (e.code === 'ENOENT' || e.code === 'ENOTDIR')) return null;
    throw e;
  }
  return digest(night, text);
};
