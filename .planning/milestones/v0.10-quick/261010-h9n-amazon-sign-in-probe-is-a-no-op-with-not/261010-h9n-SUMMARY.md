---
phase: quick-261010-h9n
plan: 01
status: complete
completed: 2026-10-10
commits:
  - 268bae390
files_modified:
  - src/backend/signInProbe/classify.ts
  - src/backend/signInProbe/runnerProbes.ts
  - src/backend/signInProbe/__tests__/classify.test.ts
  - src/backend/signInProbe/__tests__/runnerProbes.test.ts
  - .planning/todos/completed/2026-10-10-amazon-probe-is-a-no-op-with-nothing-installed.md
  - .planning/phases/49-cross-store-signed-out-offline-mode/49-REVIEW-DISPOSITION.md
  - .planning/phases/49-cross-store-signed-out-offline-mode/49-SPEC.md
---

# Quick 261010-h9n: Amazon probe no longer reads `healthy` with nothing installed

**Fix commit `268bae390`.** `classifyNileOutput` returns `unknown` for the zero-installed shape
(`[]` on stdout, `ERROR [CLI]: No games installed` on stderr, exit 0, no auth call). Before, that
text matched none of the three guards and fell through to `healthy`, which `signInState` maps to
`connected`, so a user with no installed Amazon game could never be told their sign-in expired
(49-LIVE-GATE Run 1 item 6, F-49-R1-4; review WR-02).

## What was done

1. **Measured before changing** (the live gate's 7 observations, plus one more today): ran the
   bundled `public/bin/arm64/darwin/nile/nile` with an isolated `NILE_CONFIG_PATH`. Exit 0; stderr
   is `ERROR [CLI]:<TAB> No games installed` (a tab, then a space); identical with an empty
   `installed.json` and with none. The marker is therefore the bare phrase, prefix unpinned.
2. **Classifier guard** (`classify.ts`): new `NILE_NO_GAMES_INSTALLED_MARKER`; the branch sits after
   both refresh-failure branches (an auth failure still decides first) and before `errored`, so
   `healthy` stays last. Module still has one type-only import (T-49-09 gate).
3. **Header note** (`runnerProbes.ts`): the nile limit bullet now states the zero-installed no-op,
   that `library sync` is not a permitted substitute (D-16), and that a replacement command is
   gated on the Amazon induction live gate.
4. **Tests**: `classify.test.ts` gains the marker literal, both stdout/stderr orders -> `unknown`,
   and 401 + no-games -> `expired`; the old "empty output (nothing installed)" row is relabelled
   since the empty string was never the nothing-installed shape. `runnerProbes.test.ts` feeds the
   two live chunks through `onOutput` and asserts `unknown`.
5. **Docs**: todo moved to `completed/` with a `## Fix` section; WR-02 `fixed` in
   `49-REVIEW-DISPOSITION.md`; the `empty` boundary row in `49-SPEC.md` carries the disposition
   (the ACCEPTED text is untouched).

## Decision: guard, not a new probe command

The todo offered `nile library sync` as the probe. Not taken: 49-CONTEXT D-16 says the pass never
triggers a library sync for any store (49-RESEARCH rejected it on exactly that ground), and the
49-SPEC boundary row gates any replacement command on the Amazon induction
(`2026-10-10-amazon-expiry-strings-need-a-real-induction.md`, `ready: live-gate`) because its
expired-token output cannot be measured until then. The detection gap for a zero-installed profile
therefore remains (no auth call is made); what changed is that the probe no longer claims health
it has no evidence for. That open question lives on the induction todo.

## Verification

| Check | Result |
|---|---|
| `npx jest src/backend/signInProbe/__tests__/{classify,runnerProbes}.test.ts` | 69/69 |
| Mutation: guard removed | 3 failed / 66 passed, exactly the three new negative rows |
| `npx jest src/backend/signInProbe` (restored) | 191/191 |
| `npx tsc --noEmit` | clean |
| `npx eslint` on the four source paths | clean |
| `npx prettier --check` on the four source paths | clean (the three `.planning` paths are prettier-ignored per `--file-info`) |
| `pnpm planning-gates` | 12/12 |
| `graphify update .` | run after the code commit |

## Deviations

- Plan's jest `--selectProjects backend` was wrong (the project is `Backend`); corrected in the plan
  before the verify ran.
- Planning and execution were done inline in the orchestrator rather than via planner/executor
  subagents, per the recorded cost lesson for ≤5-file tasks; the artifacts (PLAN, SUMMARY, STATE
  row, atomic fix commit, docs commit) are the same.
