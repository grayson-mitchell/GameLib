---
task: 260907-odi
type: quick
title: 'Fix the GOG playtime sync lock — release it on throw, clear a stranded one at boot'
finding: A1 (quick-260906-gej sweep, FINDINGS.md section A)
subsystem: backend/gog, backend/sidecar
tags: [gog, playtime-sync, sidecar-boot, try-finally, stranded-lock]
key-files:
  created:
    - src/backend/sidecar/__tests__/playtimeLockBootClear.test.ts
  modified:
    - src/backend/storeManagers/gog/library.ts
    - src/backend/sidecar/bootstrap.ts
    - src/backend/storeManagers/gog/__tests__/library.test.ts
    - src/backend/sidecar/__tests__/testContainment.test.ts
    - .planning/todos/completed/2026-09-06-gog-playtime-sync-lock-never-cleared-at-boot.md (git mv from pending/)
metrics:
  completed: 2026-09-07
---

# Quick 260907-odi: Fix the GOG playtime sync lock — release it on throw, clear a stranded one at boot — Summary

One-liner: two disjoint `try/finally` (in-process throw) and boot-time (`clearStrandedPlaytimeSyncLock`, process death) fixes close finding A1 — GOG playtime sync was permanently wedgeable by a single interrupted sync, and now recovers from both failure modes.

## What was built

**LEG 1 — `src/backend/storeManagers/gog/library.ts`, `syncQueuedPlaytime()`:** wrapped the
critical section (the post-session loop plus the queue-overwrite) in `try { ... } finally {
playtimeSyncQueue.delete('lock') }`. `playtimeSyncQueue.set(userData.galaxyUserId, failed)`
deliberately stays as the **last statement inside the `try`**, not in `finally` — if the loop
throws, that line never runs, so the queue keeps its original, un-overwritten contents and no
session is lost; only the lock is released. The promise still **rejects** on a throw (no
`catch` was added) — the fix changes lock/queue state, not the function's settlement.

**LEG 2 — `src/backend/sidecar/bootstrap.ts`:** added `clearStrandedPlaytimeSyncLock()` (Block
D), a new exported function that checks `playtimeSyncQueue.has('lock')` and, if a lock is
present, deletes it and logs a `logWarning` explaining a previous sync died mid-flight; if no
lock is present it does nothing and logs nothing. Wired into `init()` behind a new module-scope
once-guard (`playtimeLockClearInitialized`, matching the file's existing 7-guard convention),
called after `initLogger()` and before `READY_SENTINEL` is written, so the lock is already clear
before any RPC-driven sync can arrive. This mirrors the deleted Electron `main.ts:469`
(`playtimeSyncQueue.delete('lock')` on every app boot) and is the only leg that can recover from
process death (SIGKILL, crash, power loss) — `finally` never runs if the process is killed.

**Root cause note (from both files' new comments):** `playtimeSyncQueue` is a file-backed
`CacheStore` (`gog/electronStores.ts:42`) that survives process restarts. `CacheStore` only
evaluates lifespan/expiry inside `get()` (`cache.ts:64-88`); the `lock` guard uses `has()`
(`cache.ts:142`), a raw passthrough with no expiry check, and nothing ever calls `get('lock')`
for that key — so a stranded lock never ages out on its own. Neither leg alone closes the gap:
LEG 1 covers in-process throws, LEG 2 covers process death; together they cover the two ways the
critical section can be abandoned without releasing the lock.

## RED-then-GREEN evidence

### LEG 1 (`gog/library.ts` / `library.test.ts`)

RED — ran against the unmodified `library.ts` restored via `git show HEAD:src/backend/storeManagers/gog/library.ts` (the file at the commit this branch was built on, before this task's fix; restored non-destructively per the standing `git-checkout-fires-post-checkout-hook` finding, never `git checkout --`):

```
finding A1 LEG 1 -- syncQueuedPlaytime releases the lock when postPlaytimeSession throws
  ✕ releases the lock after postPlaytimeSession rejects -- RED today: the rejection propagates with the lock still set (5 ms)
  ✓ does not lose queued sessions when postPlaytimeSession rejects -- the queue keeps both original sessions
  ✓ happy path is unchanged: lock released AND queue overwritten with the (empty) failed array on success

  ● finding A1 LEG 1 ... › releases the lock after postPlaytimeSession rejects ...
    expect(received).toBe(expected) // Object.is equality
    Expected: false
    Received: true
      462 |     expect(mockPlaytimeHas('lock')).toBe(false)
          |                                     ^

Test Suites: 1 failed, 1 total
Tests:       1 failed, 9 skipped, 2 passed, 12 total
```

Exactly the predicted failure: without the fix, the lock is never released on a throw. The
other two new tests pass even against unfixed code (queue-preservation and the happy path don't
exercise the lock-release-on-throw path), which is expected — only the regression test is RED.

GREEN — after restoring the fixed `library.ts`:

```
finding A1 LEG 1 -- syncQueuedPlaytime releases the lock when postPlaytimeSession throws
  ✓ releases the lock after postPlaytimeSession rejects -- RED today: the rejection propagates with the lock still set (5 ms)
  ✓ does not lose queued sessions when postPlaytimeSession rejects -- the queue keeps both original sessions
  ✓ happy path is unchanged: lock released AND queue overwritten with the (empty) failed array on success

Test Suites: 1 passed, 1 total
Tests:       9 skipped, 3 passed, 12 total
```

### LEG 2 (`sidecar/bootstrap.ts` / `playtimeLockBootClear.test.ts`)

RED — ran against the unmodified `bootstrap.ts` restored via `git show HEAD:src/backend/sidecar/bootstrap.ts`:

```
finding A1 LEG 2 -- sidecar boot clears a stranded GOG playtime sync lock
  ✕ wiring proof: init() clears a stranded lock and logs it (7 ms)
    clearStrandedPlaytimeSyncLock() -- the two arms, called directly
    ✕ stranded arm: a seeded lock is cleared, and the exact message is logged once
    ✕ clean arm: no lock seeded -- the store is untouched and nothing is logged

  ● ... wiring proof ...
    Expected: false
    Received: true
      72 |     expect(playtimeSyncQueue.has('lock')).toBe(false)

  ● ... stranded arm ...
    TypeError: (0 , bootstrap_1.clearStrandedPlaytimeSyncLock) is not a function
      88 |       clearStrandedPlaytimeSyncLock()

  ● ... clean arm ...
    Expected: false
    Received: true
      100 |       expect(playtimeSyncQueue.has('lock')).toBe(false)

Test Suites: 1 failed, 1 total
Tests:       3 failed, 3 total
```

All 3 fail against unfixed code — `clearStrandedPlaytimeSyncLock` doesn't exist yet, so even the
"clean arm" test fails: with no boot-time clear at all, a lock set by an earlier test/process
persists and `has('lock')` starts `true`.

GREEN — after restoring the fixed `bootstrap.ts`:

```
PASS Backend src/backend/sidecar/__tests__/playtimeLockBootClear.test.ts
  finding A1 LEG 2 -- sidecar boot clears a stranded GOG playtime sync lock
    ✓ wiring proof: init() clears a stranded lock and logs it
    clearStrandedPlaytimeSyncLock() -- the two arms, called directly
      ✓ stranded arm: a seeded lock is cleared, and the exact message is logged once (1 ms)
      ✓ clean arm: no lock seeded -- the store is untouched and nothing is logged (1 ms)

Test Suites: 1 passed, 1 total
Tests:       3 passed, 3 total
```

### Full suite confirmation (fixed code, both legs)

```
Test Suites: 202 passed, 202 total
Tests:       2 skipped, 4594 passed, 4596 total
Snapshots:   0 total
Time:        34.914 s
```

### Gates

- `pnpm codecheck` (`tsc --noEmit`): clean, zero output.
- `npx prettier --check` on all 5 touched/created files: `All matched files use Prettier code style!`
- `pnpm lint` (`eslint --max-warnings 4157`): see Deviations below — pre-existing, unowned
  breach; this task's own new-warning footprint was minimized to 7 (down from an initial 8) and
  is documented per-line below.

## Deviations from Plan

### Auto-fixed issues

**1. [Rule 3 — blocking] New test file unclassified in the containment ledger**
- **Found during:** running the full backend suite after adding `playtimeLockBootClear.test.ts`.
- **Issue:** `testContainment.test.ts`'s `T-34.2-83` set-equality gate requires every
  `*.test.ts` file under `src/backend/sidecar/__tests__/` to be classified in exactly one of
  `IN_SCOPE_SUITES` / `STRUCTURALLY_CONTAINED_SUITES`. The new file was in neither, so the gate
  failed the whole suite run.
- **Fix:** added `'playtimeLockBootClear.test.ts'` to `STRUCTURALLY_CONTAINED_SUITES`
  (alphabetically, between `'pathShim.test.ts'` and `'rendererPathGuard.test.ts'`) — the correct
  list, since the file has no per-suite `jest.mock('os', ...)` and relies on
  `jest.setupContainment.ts`'s structural containment, matching `migrationsWiring.test.ts`'s
  precedent. Also updated the file's stale header count comment from "57 files: 4 + 53" to "58
  files: 4 + 54 (quick-260907-odi added `playtimeLockBootClear.test.ts`)".
- **Files modified:** `src/backend/sidecar/__tests__/testContainment.test.ts`
- **Not in the plan's `files_modified` list** — this is a 5th file, added because it was a
  necessary correctness requirement to make the plan's own new test file's suite pass at all,
  not a scope expansion into unrelated code.

**2. [Rule 1 — minor, self-contained] Avoidable new `restrict-template-expressions` lint warning in the new boot-clear function**
- **Found during:** isolating which lint warnings, if any, were newly introduced by this task's
  4 originally-planned files (see the lint-budget investigation below).
- **Issue:** `clearStrandedPlaytimeSyncLock()`'s catch block logged `` `...failed: ${error}` ``
  (template-interpolating a `catch`-typed `unknown`), which is `bootstrap.ts`'s dominant
  pre-existing pattern (used at 12 other call sites in the file) but does trigger
  `@typescript-eslint/restrict-template-expressions`.
- **Fix:** changed to `` `...failed: ${String(error)}` ``, matching a second, already-present,
  warning-free precedent in the same file (`applyMigrations() failed`, line 379;
  `downloadAntiCheatData failed`, line 678). Confirmed via `npx eslint --format json
  src/backend/sidecar/bootstrap.ts` that this dropped the file's warning count from 10 to 9,
  with no warning remaining near the new function.
- **Files modified:** `src/backend/sidecar/bootstrap.ts` (same file already in `files_modified`).

### Investigated, deliberately NOT fixed (documented per the plan's own instruction: "if a gate genuinely cannot pass, STOP and report it — do not weaken a test or gate to make it green")

**`pnpm lint`'s `--max-warnings 4157` ratchet is red at HEAD, independent of this task.**

Measured total: 4202 warnings (0 errors) against a 4157 ceiling — a 45-warning breach.
Standing project memory (`backend-suite-and-lint-are-red-at-head.md`, re-measured 2026-09-06,
Phase 41) already records this exact gate as red at HEAD — "4188-4199 warnings vs the 4157
ceiling, exit 1 ... unowned debt, neither is yours" — independently of any change in this task.

To confirm this task's own contribution rather than assume it, I mapped every warning in the 5
touched/created files against this task's own diff hunks (`git diff -U0`, cross-referenced
against `npx eslint --format json .`'s per-line output):

- `src/backend/storeManagers/gog/library.ts`: **0** new warnings. My diff hunks (lines
  169–227ish) contain none of the file's 58 warnings — all pre-exist outside the touched range.
- `src/backend/storeManagers/gog/__tests__/library.test.ts`: **5** new warnings, all
  `@typescript-eslint/no-unsafe-return`, at the 5 delegating-arrow mocks I added/rewired
  (`configStore.get_nodefault`, `playtimeSyncQueue.{has,get,set,delete}` — lines 114, 119-122).
  This is the same `(...a: unknown[]) => mockX(...a)` pattern already present, unmodified, at
  line 111 (`privateBranchesStore.get`) in the same file, which already carried this identical
  warning before this task touched anything. The pattern is required by this suite's
  `resetMocks: true` config (arrows must re-delegate to survive resets); changing it would
  regress test infrastructure to save a warning count, which is out of scope.
- `src/backend/sidecar/bootstrap.ts`: **1** new warning before the fix above (now 0 — see
  deviation #2).
- `src/backend/sidecar/__tests__/playtimeLockBootClear.test.ts`: **2** new warnings (both at
  line 38, `no-unsafe-assignment` + `no-unsafe-member-access` on `.default`), from
  `jest.requireActual('../fileStore').default` in the `backend/store_backend` mock. This is a
  byte-identical copy of `migrationsWiring.test.ts`'s own sanctioned line 42 pattern (same two
  rules, same columns) — an already-accepted precedent for exactly this containment shape.
- `src/backend/sidecar/__tests__/testContainment.test.ts`: 0 new warnings — the change was a
  one-line array insertion and a comment edit, neither of which is unsafe-typed.

Net: this task introduces **7** warnings (after the `String(error)` fix), all of which either
match an already-accepted identical precedent in the same file or are structurally required by
the suite's own `resetMocks: true` mock-survival contract. 4202 − 7 = 4195, which independently
corroborates the memory record's 4188-4199 baseline range — the ratchet was already breached
before this task ran. I did not touch the `--max-warnings 4157` value, did not "fix" any
pre-existing warning outside this task's own diff hunks, and did not weaken any test or the gate
itself to force it green. This is unowned debt (Phase 39, per the same memory record) and is
out of scope here per the plan's own scope fence.

### Deliberately out of scope (per plan's scope fences — confirmed untouched)

- `gog/library.ts:188-196`'s offline double-push (`if (!isOnline()) { failed.push(session) }`
  immediately followed by an unconditional `postPlaytimeSession()` call, missing a `continue`) —
  left byte-identical; only the `try`/`finally` wrapper and comments were added around it.
- The boot-time queue **drain** (`runOnceWhenOnline(() => syncQueuedPlaytime())`) was **not**
  restored. This is finding A2, filed separately, and remains open — the todo's resolution note
  says so explicitly.
- No other finding's code was touched.

### STATE.md / ROADMAP.md — deliberately not updated by this task

Another session was concurrently active in this repo with uncommitted work in
`.planning/STATE.md` (a Phase 42 Roadmap Evolution entry) and `.planning/ROADMAP.md` (adding
Phase 42). Per explicit instruction, this task never staged either file and never ran
`gsd-sdk query commit` (which stages broadly). Verified immediately before the commit below via
`git status --porcelain`: both files showed ` M` (modified, unstaged) — confirmed neither
appeared in `git show --stat HEAD` for this task's commit. This task therefore does **not**
add a STATE.md "Quick Tasks" row; that update is deferred to whoever next touches STATE.md
cleanly, or can be reconciled after the concurrent session commits. HEAD did not move under me
during this session (verified via `git log --oneline -1` matching the sha this task branched
from), but per instruction this would not have been treated as an error if it had.

## Todo closure

`.planning/todos/pending/2026-09-06-gog-playtime-sync-lock-never-cleared-at-boot.md` moved via
`git mv` to `.planning/todos/completed/`, `status` rewritten to a RESOLVED prose string naming
both legs, noting the original "Fix sketch" only prescribed the boot-clear leg (LEG 2 — a
boot-clear alone would not have released the lock for the remainder of a still-running process
after an in-process throw) and that A2 (the boot-time queue drain) remains open, filed
separately.

## Self-Check

```
FOUND: src/backend/storeManagers/gog/library.ts
FOUND: src/backend/sidecar/bootstrap.ts
FOUND: src/backend/storeManagers/gog/__tests__/library.test.ts
FOUND: src/backend/sidecar/__tests__/playtimeLockBootClear.test.ts
FOUND: src/backend/sidecar/__tests__/testContainment.test.ts
FOUND: .planning/todos/completed/2026-09-06-gog-playtime-sync-lock-never-cleared-at-boot.md
```

(Commit sha check appended after commit, below.)
