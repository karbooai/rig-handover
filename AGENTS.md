# rig

The lane's resident service: keeps a heartbeat, serves the status board, reads the night's run
log. Hono + JSX, rendered on the server, Node 22+.

Read first: `docs/vision.md`, `docs/styleguide.md`. Decisions: `docs/adr/`.

## Commands

- `pnpm dev` / `pnpm start`: serves on `PORT` (8787). Needs `.env` (copy `.env.example`).
- `pnpm test`: vitest. `pnpm typecheck`: tsc.

## How work moves here

1. A feature starts as a plan: `plan.md` at the root (one at a time). Finished plans live in
   `docs/plans/done/`.
2. The plan is split into GitHub issues: skill `plan-to-issues` (`.agents/skills/`). A human
   reviews the split before anything is published. GitHub issues out of reach: files in
   `docs/issues/` (ADR 0004).
3. Issues are worked by workers, one issue per worker, each on its own branch or worktree.
   Pick the model per issue: the strongest for logic, a cheaper one for views and tests.
4. A worker closes its issue with a closing comment, exactly this shape:

   ```
   done: <what changed, one line>
   worker: <harness> · <model> · <effort>
   commit: <sha or "none">
   ```

5. An issue is closed only when its "Done when" holds. If it can't hold yet, leave it open and
   say what it waits on.

## What every issue carries

Agreed when the morning-digest plan was split (2026-11-02). `plan-to-issues` step 4 needs
no question when this section exists; change it here, not per plan.

- First line: `Source: plan.md § <n>`, where `<n>` is the plan's own heading number,
  subsection included (`§ 1`, `§ 2a`, `§ 2b`, `§ 3`).
- Label: `plan:<plan name from plan.md frontmatter>` (e.g. `plan:morning-digest`). Create
  the label in the repo before the first issue.
- Body sections, in this order: `## Scope` (the plan's text for that unit, word for word),
  `## Done when` (word for word), `## Blocked by` (issue numbers, or "None."), `## Closing`
  (the closing comment shape below).
- One issue per plan unit; no sections the plan doesn't have.
- An issue whose "Done when" depends on someone else (a reviewer) stays open until their
  reply shows they acted. Sending is not done.

## Skills

Shared skills live in `.agents/skills/`, one folder each, `SKILL.md` inside. That folder is the
one source for every harness on the team. If yours loads skills from somewhere else, point it
here (a link or a config entry). Don't copy: copies drift.

## Rules

- Never commit `.env`, tokens or previews.
- Don't touch `runs/`: those are real nights, read-only fixtures.
- No client JS (ADR 0001).
