---
phase: 37
plan: 11
subsystem: backend/steam
tags: [steam, install-poller, native-depot, tdd, regression]

requires:
  - phase: 23
    provides: "D-08 finalize-at-completion write behavior for GameLib-owned native depot installs (ACF written only at finalize, never mid-download)"
provides:
  - "startInstallPolling's grace window no longer fires while a GameLib-owned native depot download is live (gated on isNativeInstallInFlight(appId), read per-tick)"
  - "startInstallPolling's idempotent early return upgrades an existing poll's isNativeHandoff/skippedDepots instead of no-opping when the finalize-time handoff call arrives against a still-live download poll"
affects: [backend/steam, downloadmanager, frontend-library-status]

tech-stack:
  added: []
  patterns:
    - "Idempotent registration functions that gain a second call-shape (upgrade vs. no-op) must special-case the upgrade BEFORE the early return, not bypass it entirely"

key-files:
  created: []
  modified:
    - src/backend/storeManagers/steam/library.ts
    - src/backend/storeManagers/steam/__tests__/library.test.ts

key-decisions:
  - "Discriminator for the grace window is isNativeInstallInFlight(appId), NOT isNativeHandoff — three of startInstallPolling's four call sites leave isNativeHandoff false, and two of those are exactly the paths whose cancel detection the grace window exists to provide (D-01)"
  - "isNativeInstallInFlight is read PER-TICK inside the setInterval callback, never captured at poll-start, because the resume path creates the poll before the flag becomes true"
  - "The finalize-time handoff call now UPGRADES an existing poll entry instead of no-opping against it, fixing the D-02 second-order collision that fixing the grace window alone would have introduced"
  - "GRACE_TICKS and startUninstallPolling are left untouched — the uninstall path is a genuine Steam-owned handoff with no equivalent defect (D-03)"

requirements-completed: []

duration: ~35min
completed: 2026-08-22
---

# Phase 37 Plan 11: Stop the install poller's grace window killing the UI on slow native installs Summary

**Gated `startInstallPolling`'s 60s grace window on `isNativeInstallInFlight(appId)` (read per-tick) instead of the absence of a manifest, and made the finalize-time handoff call upgrade an already-live poll instead of silently no-opping against it.**

## Performance

- **Duration:** ~35 min
- **Tasks:** 2 completed (TDD: RED commit, then GREEN commit)
- **Files modified:** 2

## Accomplishments

- A native depot install streaming chunks past 60s no longer receives a terminal `gameStatusUpdate { status: 'done' }` — the DownloadManager item and progress badge no longer vanish mid-download.
- The `steam://install` / bottle cancel-detection path (Steam owns the download) is unaffected — a poll with no live native download still stops with `'done'` after the grace window, exactly as before (Test B).
- The finalize-time handoff start (`games.ts:1720/1726`) now upgrades a live download poll's `isNativeHandoff`/`skippedDepots` instead of landing on a no-op, which fixing the grace window alone would have caused (D-02). This keeps the 1026 "waiting for Steam restart" interpretation, the restart notify, and the `skippedDepots` completion notice all firing correctly.
- `GRACE_TICKS` and `startUninstallPolling` are byte-identical to their pre-change state (verified by diff — see below).

## Task Commits

1. **Task 1: Write the four tests and PROVE RED before touching library.ts** - `7d1d4f7` (test)
2. **Task 2: Gate the grace window on native-download liveness and upgrade the handoff start** - `1754589` (fix)

_TDD: RED commit (Task 1) then GREEN commit (Task 2) — matches the phase's mandatory RED/GREEN gate sequence._

## Captured RED Output (Task 1, against unmodified library.ts)

**Test A** — a live native download must survive the grace window:

```
● startInstallPolling() idempotency and stopInstallPolling() › Test A (260822-dkf, regression pin): a live native depot download survives the grace window — never emits terminal "done" and keeps polling past GRACE_TICKS

  expect(jest.fn()).not.toHaveBeenCalledWith(...expected)

  Expected: not "gameStatusUpdate", ObjectContaining {"appName": "730", "status": "done"}
  Received:     0, ["gameStatusUpdate", {"appName": "730", "runner": "steam", "status": "done"}]

  Number of calls: 1
```

**Test C** — the finalize-time handoff start must upgrade a live poll:

```
● startInstallPolling() idempotency and stopInstallPolling() › Test C (260822-dkf, D-02 regression pin): the finalize-time handoff start upgrades a live download poll instead of no-opping

  expect(jest.fn()).toHaveBeenCalledWith(...expected)

  - Expected
  + Received

    Object {
  -   "body": "Restart Steam to finish installing {{game}}",
  +   "body": "Installation Finished",
      "title": "CS:GO",
    }

  Number of calls: 1
```

**Tests B and D passed unmodified at HEAD**, as required (2 passed, 2 failed, 212 skipped when filtered to `-t "260822-dkf"`). No pre-existing test in the file (the CR-01 grace test at the original line 4785, or the two-bare-calls idempotency test at the original line 4764) was modified, and both stayed green throughout.

## Fixture Integrity (per the phase's ledgered "fixture went green against a live defect" lesson)

Test A's fixture sets **both halves** required by the defect: `existsSync` mocked `false` (no manifest on disk — D-08's deliberate finalize-only write) **and** `isNativeInstallInFlight` spied `true` (the depot run is genuinely streaming right now). The falsifier holds: this test cannot be made green without changing the grace condition itself, because at HEAD the condition has no way to distinguish "cancelled" from "GameLib's own download, no manifest yet" — both fixture halves are load-bearing.

Test D was engineered to be a valid interaction pin (a bare call after the handoff upgrade must not clear `isNativeHandoff`, and must not create a second interval) while genuinely passing at HEAD: rather than asserting a fixed expected value for the "waiting for restart" `context` field (which would be `undefined` at HEAD and `'steam-waiting-for-restart'` after the fix — an assertion that could only be written to be true in one of the two states), it compares the field's value **before** and **after** the extra bare call, using the `'downloading'`-branch context (recomputed every tick, no fire-once guard) rather than `notify()` (which has a fire-once guard and would be consumed by the first observation). This equality-based framing stays green in both states while genuinely failing if a bare call actively downgraded the flag.

## Deviations from Plan

None affecting the shipped fix. One test-design refinement not spelled out verbatim in PLAN.md: Test D's exact assertion mechanism (before/after comparison via the `'downloading'`-branch `context` field rather than `notify()`) was chosen during implementation to satisfy the plan's literal requirement that Test D be green at HEAD — a direct `notify()`-based assertion of "the flag is true" would necessarily be RED at HEAD (the D-02 bug means the upgrade never happens pre-fix), which would have contradicted the plan's own classification of Test D as a HEAD-green interaction pin. The before/after comparison approach satisfies the plan's literal `<done>` criterion ("no pre-existing test in the file changed... tests B and D pass at HEAD") while still catching a genuine downgrade regression, verified empirically by running the suite against unmodified `library.ts` before making any `library.ts` edit.

## Verification

- `npx jest src/backend/storeManagers/steam/__tests__/library.test.ts` — **216/216 green** (212 pre-existing + 4 new: Tests A–D).
- `npx jest src/backend/storeManagers/steam/__tests__/games.test.ts` — **260/260 green** (unmodified; `games.ts` was not edited).
- `npx tsc --noEmit -p .` — no new errors.
- `git diff src/backend/storeManagers/steam/library.ts` confirmed by inspection: `GRACE_TICKS` (line 1834) and `startUninstallPolling` (unchanged region) are untouched — the only diff hunks fall inside `pollInstallOnce`'s docstring reference, `startInstallPolling`'s docstring, its idempotent-return block, and its grace-window branch.
- `prettier --check` was **not** run as a gate (it is red repo-wide in this checkout per the operator's standing instruction); no formatting was swept into either commit.

## D-03: Uninstall Poller Left Untouched

`startUninstallPolling` has exactly one call site (`games.ts:2259`, inside the `root === 'native'` branch, immediately after `shell.openExternal('steam://uninstall/...')`) — Steam genuinely owns that uninstall, which is precisely the handoff shape the grace window was built for. There is no GameLib-owned uninstall path (the bottle path uses `uninstallBottleGameDirectly()` directly and starts no poller), so there is no equivalent defect to fix. `library.ts`'s uninstall-poller region and the shared `GRACE_TICKS` constant are byte-identical to their state before this change.

## OPEN — Operator Live Gate (not attempted, not claimed)

This fix is **unit-proven only**. The defect is UI-visible and no unit test observes the actual live UI over a real >60s install — that gate is deliberately out of scope for this quick task and is handed to the operator:

> Start a native install of a title that takes longer than 60 seconds and confirm the UI keeps reporting progress past the 60s mark, continuously, through to completion. Proven >60s installs on this machine: appId **8930** (Civilization V) and **49520** (Borderlands 2). Watch for the `install polling ... stopped after grace window` warning — it must **NOT** appear for a live native install — and confirm the DownloadManager item does not vanish at ~60s.

The originating todo (`.planning/todos/pending/2026-08-22-install-poller-grace-window-kills-ui-on-slow-native-installs.md`) should **not** be marked resolved until that live gate has been run.

## Self-Check

- `src/backend/storeManagers/steam/library.ts` — FOUND, modified as described.
- `src/backend/storeManagers/steam/__tests__/library.test.ts` — FOUND, modified as described.
- Commit `7d1d4f7` — FOUND in `git log`.
- Commit `1754589` — FOUND in `git log`.

## Self-Check: PASSED
