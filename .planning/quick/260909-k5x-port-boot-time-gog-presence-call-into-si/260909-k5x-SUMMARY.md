---
phase: quick-260909-k5x
plan: 01
subsystem: sidecar-boot
tags: [gog, presence, bootstrap, sidecar, tauri]
requires: []
provides:
  - "setGogPresenceWhenOnline() (Block H) -- boot-time GOG presence call, wired into init()"
affects:
  - src/backend/sidecar/bootstrap.ts
tech-stack:
  added: []
  patterns:
    - "Boot-time side-effect block (Block H), following Blocks E/G's guard-flag + outer/inner try/catch + explicit .catch() shape"
key-files:
  created:
    - src/backend/sidecar/__tests__/gogPresenceBootWire.test.ts
    - .planning/todos/pending/2026-09-09-deletepresence-never-resets-interval-so-the-keepalive-cannot-re-arm.md
  modified:
    - src/backend/sidecar/bootstrap.ts
    - src/backend/sidecar/__tests__/testContainment.test.ts
    - .planning/todos/completed/2026-09-06-gog-presence-never-set-at-startup-and-its-keepalive-never-arms.md (moved from pending/)
decisions:
  - "D-K5X-01: Block H has NO load-bearing ordering constraint -- only the generic three (after initLogger, after initOnlineMonitor, before READY_SENTINEL). Blocks D/E/F/G each individually checked and refuted as a dependency."
  - "D-K5X-02: no settings read hoisted to helper entry, unlike Block G's D5 -- port fidelity to the deleted bare main.ts:477 call. The disableGOGPresence/disablePlaytimeSync gate stays inside setPresence() itself, evaluated at online time, not at boot time."
metrics:
  duration: "~90 minutes"
  completed: 2026-09-09
---

# Quick 260909-k5x: Port boot-time GOG presence call into bootstrap.ts as Block H Summary

Restored the deleted `main.ts:477` boot-time GOG presence call as **Block H** of
`bootstrap.ts`'s `init()`, closing both halves of the todo's title: presence is now set at boot
once online, and because `presence.ts`'s 5-minute keep-alive `setInterval` is armed as a side
effect of the first successful `setPresence()` call (guarded by `if (!interval)`, and `interval`
is `undefined` at process start), that same boot-time call also arms the keep-alive.

## Decisions and rationale

**D-K5X-01 -- placement/ordering.** Block H carries no load-bearing ordering constraint of its
own. Only the three generic constraints every boot-time block in this file already satisfies
apply: after `initLogger()` (the helper logs; `heroicLogWriter` is unset before that), after
`initOnlineMonitor()` (it calls `runOnceWhenOnline`), and before the `READY_SENTINEL` write. Each
of the four tempting candidate dependencies was checked and individually refuted in the code
comment and in this plan: Block D (`setPresence` never reads `playtimeSyncQueue`), Block E
(its GOG arm only touches an already-logged-in user and cannot change `GOGUser.isLoggedIn()`),
Block F (Block H paints no dialog, reads no i18n catalog), and Block G (both blocks read
`disablePlaytimeSync` but share no state). Appended after Block G, satisfying all three generic
constraints while leaving the existing A->B->C->D->E->F->G sequence byte-identical.

**D-K5X-02 -- no settings hoist.** Unlike Block G's D5 (which hoisted `GlobalConfig.get()
.getSettings()` to helper entry because the deleted source's own `main.ts:470-476` had a literal
`if (!settings.disablePlaytimeSync)` wrapper), Block H's deleted source (`main.ts:477`) was a bare
`runOnceWhenOnline(gogPresence.setPresence)` with zero settings access at the call site.
Reproducing that exactly means the `disableGOGPresence || disablePlaytimeSync ||
!GOGUser.isLoggedIn() || !isOnline()` gate stays exactly where the deleted source left it -- inside
`setPresence()` itself, evaluated at online time, not at boot time. Consequence: no skip-log arm
exists in Block H (the deleted source never had one), and a user toggling `disableGOGPresence`
between boot and coming online sees the new value honoured -- consistent with `presence.ts`'s own
`settingChanged` listener, which already makes live toggling the documented model for this flag.

## Test suite: `gogPresenceBootWire.test.ts`

A dedicated suite (following `playtimeQueueBootDrain.test.ts`'s exact preamble shape) with
**exactly 5 cases**, verified via `Tests: 5 passed, 5 total`:

1. Wiring proof: `init()` calls `gogPresence.setPresence()` exactly once.
2. Direct call, enabled: `setGogPresenceWhenOnline()` calls it exactly once.
3. D-K5X-02 receipt: with `disableGOGPresence: true` mocked into `GlobalConfig`, the helper
   STILL calls `setPresence()` and emits no skip-log.
4. Never-fails-boot (async arm): a rejecting `setPresence()` is caught and produces a
   `[bootstrap] setGogPresenceWhenOnline` warning after a microtask flush.
5. Never-fails-boot (inner arm, deferred): with `runOnceWhenOnline` mocked to CAPTURE rather
   than invoke, a synchronously-throwing `setPresence()` invoked from the captured callback does
   not throw and produces the same warning.

No `expect(runOnceWhenOnline).toHaveBeenCalled()` anywhere in the file, and no `'node:os'`
reference (containment is structural via `jest.setupContainment.ts`).

Registered `gogPresenceBootWire.test.ts` alphabetically into `testContainment.test.ts`'s
`STRUCTURALLY_CONTAINED_SUITES` (61 -> 62 entries; directory now 66 `*.test.ts` files: 4
`IN_SCOPE_SUITES` + 62 below), with a doc-comment paragraph explaining why it's contained (mirrors
`playtimeQueueBootDrain.test.ts`'s own entry) and updated the recount comment.

## Mutation proofs

All 4 required mutations were applied, run, observed on the correct case, and reverted (verified
byte-identical to the pre-mutation file via `diff` after each revert):

| # | Mutation | Result |
|---|----------|--------|
| 1 | Deleted the Block H call site from `init()` | **Case 1 RED** (`Received number of calls: 0`); cases 2-5 unaffected. |
| 2 | Deleted the inner `try/catch` from the callback | **Case 5 RED** (`toThrow()` — synchronous throw escaped the deleted inner guard); case 1 (and 2-4) stayed green, confirming case 5 exercises a distinct code path. |
| 3 | Hoisted a `GlobalConfig.get().getSettings()` read with an early return on `disableGOGPresence` to helper entry | **Case 3 RED** (`Received number of calls: 0` for `setPresence`) — proves the gate must stay inside `setPresence()`. Case 5 also went RED as a side effect (the real/mocked `GlobalConfig` default in this test environment resolves `disableGOGPresence: true`, so the hoisted early return fired before `runOnceWhenOnline` was ever called, leaving `capturedCallback` undefined) — recorded honestly, not filtered out, since it strengthens rather than weakens the proof that the hoist breaks the intended behavior. |
| 4 | Destructured `const { setPresence } = gogPresence` at import and called the bare binding | **All 5 cases RED** (stronger than the plan's minimum "cases 1/2/3 RED") — proves the `jest.spyOn(gogPresence, 'setPresence')` seam is real and load-bearing, not decorative. |

## Backend project failure count (honesty bar)

Per the plan's stated bar, a fully green `pnpm test:ci` is NOT the standard -- the standard is
that the Backend project's failure count did not increase.

- **Pre-Task-1 baseline** (`npx jest --selectProjects Backend --runInBand --silent`, captured
  before any Task 1 edit): `Test Suites: 211 passed, 211 total` / `Tests: 2 skipped, 4755 passed,
  4757 total` -- **0 failures**.
- **Post-Task-2 measurement** (same command, after all three tasks landed): `Test Suites: 212
  passed, 212 total` / `Tests: 2 skipped, 4760 passed, 4762 total` -- **0 failures**.

Failure count: **0 -> 0** (did not increase). The Backend project was actually fully green at
both baseline and post-measurement in this run -- the standing findings about the Backend project
and repo-wide lint being red at HEAD did not manifest in either capture on this branch/session.
The +1 suite / +5 tests delta is exactly the new `gogPresenceBootWire.test.ts` file.

## Other gates run

- `pnpm codecheck` (`tsc --noEmit`): clean, both after Task 1 and again at the end.
- The eight named suites (`gogPresenceBootWire`, `testContainment`, `structuralContainment`,
  `bootstrap`, `bootstrapWirings`, `bootstrapUserReconcile`, `playtimeQueueBootDrain`,
  `electronUntouched`): `Test Suites: 8 passed, 8 total` / `Tests: 147 passed, 147 total`.
- `npx eslint` on the three touched files: `0 errors` (42 pre-existing-pattern warnings, e.g.
  `restrict-template-expressions` on `${String(error)}`, matching the shape already used
  throughout `bootstrap.ts`'s other blocks).
- `npx prettier --check` on the three touched files: clean.
- `pnpm planning-gates`: `9/9 planning gates passed`, including the todo-frontmatter gate.
- `graphify update .`: ran successfully (`42526 nodes, 49415 edges, 3657 communities`).
  `graphify-out/graph.html` was regenerated in place this run, not deleted (the standing finding
  about `graphify update` deleting it did not manifest here) -- `graphify-out/` is untracked by
  git either way, so there is nothing to commit or restore.

## Todo triage

- Closed `.planning/todos/pending/2026-09-06-gog-presence-never-set-at-startup-and-its-keepalive-never-arms.md`
  via `git mv` to `.planning/todos/completed/`, with a `RESOLVED 2026-09-09 by quick-260909-k5x`
  status paragraph naming D-K5X-01, D-K5X-02, the three guard layers, the closed keep-alive half,
  and a pointer to the new sibling todo. `resolved_by: quick-260909-k5x` added.
- Filed a new todo, `.planning/todos/pending/2026-09-09-deletepresence-never-resets-interval-so-the-keepalive-cannot-re-arm.md`,
  for a separate, real, NOT-fixed-here defect found during triage: `deletePresence()` calls
  `clearInterval(interval)` but never resets `interval` to `undefined`, so `setPresence()`'s
  `if (!interval)` re-arm guard stays falsy-blocked after any `deletePresence()` call within the
  same process. `severity: medium`, `platform: any`, `ready: code`, in that adjacent order,
  bare lowercase values -- verified against `pnpm planning-gates`.

## Deviations from Plan

None -- plan executed exactly as written. Task 1's `pnpm codecheck` gate, the exact-string
node-based grep gate, the 5-case anti-vacuity gate, all 4 mutation proofs, `pnpm planning-gates`,
and the git-sees-the-rename check all passed on the first attempt with no rework needed.

## Commits

- `ff033c44b` -- `feat(quick-260909-k5x): port boot-time GOG presence call into bootstrap.ts as Block H`
- `e6193abec` -- `test(quick-260909-k5x): add gogPresenceBootWire suite and containment registration`
- `6c9d0c795` -- `docs(quick-260909-k5x): close gog-presence-boot todo, file deletePresence() interval defect`

## Self-Check

- `src/backend/sidecar/bootstrap.ts` exports `setGogPresenceWhenOnline` -- FOUND (grep confirms).
- `src/backend/sidecar/__tests__/gogPresenceBootWire.test.ts` exists -- FOUND.
- `src/backend/sidecar/__tests__/testContainment.test.ts` registers `gogPresenceBootWire.test.ts`
  -- FOUND.
- `.planning/todos/completed/2026-09-06-gog-presence-never-set-at-startup-and-its-keepalive-never-arms.md`
  exists, `.planning/todos/pending/` copy does not -- FOUND / CONFIRMED ABSENT.
- `.planning/todos/pending/2026-09-09-deletepresence-never-resets-interval-so-the-keepalive-cannot-re-arm.md`
  exists -- FOUND.
- Commits `ff033c44b`, `e6193abec`, `6c9d0c795` exist in `git log` -- FOUND (all three verified
  via `git show --stat --oneline` immediately after each commit).

## Self-Check: PASSED
