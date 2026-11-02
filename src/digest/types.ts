// Plan morning-digest § 1. The contract between the run log reader and everything that shows
// it (page, JSON route, board link). Implementation: `readNight` in `src/digest/read.ts`.

export type RunStatus = 'ok' | 'retry' | 'fail';

// One row per job in a night's run log.
export type DigestRow = {
  job: string;
  // Owner on the job's latest line. null stays null here; views render it as `—`.
  owner: string | null;
  // Valid lines for this job.
  runs: number;
  // Lines for this job with status `retry`.
  retries: number;
  // Status and error of the job's latest line (by instant of `at`). No error on that line: null.
  lastStatus: RunStatus;
  lastError: string | null;
  // `at` exactly as written in the log, offset kept (never converted to UTC).
  firstAt: string;
  lastAt: string;
};

export type Night = {
  // `YYYY-MM-DD`, the file name without `.jsonl`.
  night: string;
  // Sorted by job. Empty file: [].
  rows: DigestRow[];
  // Lines that are not valid JSON or miss a valid `at` / `job` / `status`. Counted, never thrown.
  badLines: number;
  // Valid lines per status, over the whole night (for the board's ok / retry / fail counts).
  counts: Record<RunStatus, number>;
};

// `runs/<night>.jsonl` → Night. null: no file for that night (or `night` is not `YYYY-MM-DD`).
export type ReadNight = (runsDir: string, night: string) => Night | null;
