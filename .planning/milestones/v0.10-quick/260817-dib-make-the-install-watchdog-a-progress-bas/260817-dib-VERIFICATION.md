---
phase: quick-260817-dib
verified: 2026-08-17T00:00:00Z
status: passed
score: 6/6 must-haves verified
overrides_applied: 0
deferred:
  - truth: "A native Steam install that keeps making forward progress is NEVER terminated by the DownloadManager watchdog, regardless of total elapsed duration -- proven on REAL WALL-CLOCK time against a real multi-GB download"
    addressed_in: "Phase 23 wave 10 (23-10), operator-run LIVE-GATE.md Gate A"
    evidence: "Plan Task 3 explicitly scopes the wall-clock proof as operator work for phase 23 wave 10 ('the operator runs this as part of phase 23 wave 10 -- this plan is NOT blocking-human'); the SUMMARY's Next Phase Readiness section states the same. Jest's fake-timer proof of the underlying logic (Task 1/2 specs) is verified below; only the real-hardware duration property is deferred."
---

# Quick Task 260817-dib: Install watchdog -> progress-based stall detector Verification Report

**Task Goal:** Make the install watchdog a progress-based stall detector instead of an
8-minute duration ceiling, so a healthy multi-GB native Steam install is no longer declared
failed at 8m00s.
**Verified:** 2026-08-17
**Status:** passed

## Goal Achievement

### Observable Truths (from PLAN frontmatter `must_haves.truths`)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A native Steam install that keeps making forward progress is NEVER terminated by the watchdog, regardless of total elapsed duration | ✓ VERIFIED | `installStallWatchdog.test.ts` "RED vs the old ceiling" spec advances 12×100s (20min) of fake time with genuine `percent`/`bytes` advances every tick; promise still pending. Mirrored end-to-end in `utils.test.ts`'s "RED (the defect)" spec against the real `installQueueElement`. Both pass on current code (`pnpm jest` run, 174/174 green). Structurally guaranteed to have failed pre-fix: `git show ba75d9b90:.../withTimeout.ts` shows a plain `Promise.race([promise, setTimeout(ms)])` with **no** `backendEvents` subscription at all -- no re-arm mechanism existed, so the old code necessarily trips at 480000ms regardless of any emitted progress. SUMMARY's own RED/GREEN evidence (run against the real pre-fix `utils.ts`) independently confirms this empirically. |
| 2 | An install with NO progress for 8 minutes is still terminated, and still aborts its in-flight download exactly as today | ✓ VERIFIED | `utils.test.ts` "stall trip still aborts (locked decision 4)" spec: never-settling install, zero progress events, advances 9min fake time, asserts `result.status === 'error'`, `callAbortController` called with appName, and steam-gated `stop(false)` called. Traced in code: `withStallTimeout` rejects a `StallError` → caught by `isStallError(error)` branch → sets `status = 'error'` → `finally` block (byte-identical to pre-fix, see truth 6) runs the 260816-vgc abort. |
| 3 | Steam's 1s progress HEARTBEAT does not re-arm the watchdog — only an advance in percent/bytes does | ✓ VERIFIED | `installStallWatchdog.test.ts` "anti-vacuity vs the Steam heartbeat (decisive)" spec replays the LITERAL heartbeat payload (`percent: 14, bytes: '5.23 GB'`, unchanged) every 1000ms for 400 ticks and asserts the watchdog still trips (`isStallError(err)` true) at ~stallMs. This is non-trivially satisfiable — an arrival-armed implementation would fail it. Implementation (`installStallWatchdog.ts:90-100`) computes `advanced` strictly from `percent > lastPercent` OR `bytes !== lastBytes`, never from event arrival alone. |
| 4 | A runner with no progress emitter (sideload) behaves identically to today: hard 8-minute bound | ✓ VERIFIED | `sideload/games.ts:185-187`'s `onInstallOrUpdateOutput()` remains an unimplemented no-op stub (unchanged) — it never calls `sendProgressUpdate`/emits on `backendEvents`. Since `withStallTimeout` arms its timer at call time and only re-arms on an observed advance, an emitter-less runner never re-arms and trips at exactly `stallMs` from call time — the same behavior as the old fixed `withTimeout`. Covered explicitly by the "no progress ever rejects at exactly stallMs (sideload / never-reports case)" spec. |
| 5 | Terminal error copy describes what was observed, no longer asserts an unestablished connection fault | ✓ VERIFIED | `utils.ts:212-228` (`isStallError` branch): dialog copy is `i18next.t('box.error.install.stalled', 'No download progress for {{minutes}} minutes — the install was stopped', {minutes})` — uses `{{minutes}}`, never the i18next-reserved `{{count}}`. `grep -n "connection may be stale" utils.ts` shows the string appears only once, inside the separate `isTimeoutError` branch (line 233), never inside the stall branch. `lint-translations` exits 0 with no complaint about the missing key (matches the documented decision that its sibling `box.error.install.failed` is also absent from the catalog). |
| 6 | The 260816-vgc failure-path abort (callAbortController + steam-gated stop(false)) still fires on a stall trip, unchanged | ✓ VERIFIED | `git diff ba75d9b90 HEAD -- src/backend/downloadmanager/utils.ts` shows the diff ends at the `catch` block's new `isStallError` branch; the entire `finally` block (callAbortController, steam-gated `.stop(false)`, badge-clearing, dialog) is untouched. A stall trip reaches it through the same `status = 'error'` assignment as every other failure mode. |

**Score:** 6/6 truths verified

### Deferred Items

The real wall-clock property (a >8-minute healthy install actually completing) cannot be
proven by jest. Per task instructions this is not counted as a gap.

| # | Item | Addressed In | Evidence |
|---|------|--------------|----------|
| 1 | Real multi-GB install survives past 8 minutes wall-clock and reaches 100% | Phase 23 wave 10 (23-10), operator-run LIVE-GATE.md Gate A | Plan Task 3 / SUMMARY both explicitly scope this as operator work, not blocking-human for this quick task |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/backend/downloadmanager/installStallWatchdog.ts` | Runner-agnostic re-armable stall watchdog, exports `withStallTimeout`/`isStallError`/`INSTALL_NO_PROGRESS_TIMEOUT_MS`, min 60 lines | ✓ VERIFIED | 117 lines. All three exports present and match `<interfaces>` contract. Imports nothing from `storeManagers/steam` (confirmed by inspection — only imports `backend_events` and `common/types`). |
| `src/backend/downloadmanager/__tests__/installStallWatchdog.test.ts` | Fake-timer RED/GREEN coverage, min 80 lines | ✓ VERIFIED | 257 lines, 10 specs covering both decisive cases, advance-scoping (bytes-only, percent-only), transparent pass-through, listener hygiene, cross-appName scoping. All 10 pass. |
| `.planning/quick/260817-dib-make-the-install-watchdog-a-progress-bas/LIVE-GATE.md` | Operator recipe proving the wall-clock property, contains "proof by absence" | ✓ VERIFIED | Exists, contains Gate A/Gate B, blackhole-IP instruction (`203.0.113.1`, not `127.0.0.1`), inverted-harness explanation, and an anti-false-pass calibration step. String "proof by absence" present twice. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `steam/depot.ts` emitProgress | `backendEvents` `progressUpdate-<appId>` | `sendProgressUpdate` instead of raw `sendFrontendMessage` | ✓ WIRED | `depot.ts:1912` now calls `sendProgressUpdate({appName: plan.appId, ...})`; unused `sendFrontendMessage` import removed. `backend/utils.ts:1425-1428`'s `sendProgressUpdate` performs both the IPC send and `backendEvents.emit(\`progressUpdate-${payload.appName}\`, payload)`. |
| `installStallWatchdog.ts` | `backendEvents` `progressUpdate-<appName>` | `backendEvents.on` listener, re-arms only on ADVANCE | ✓ WIRED | Confirmed by anti-vacuity spec (truth 3) and by direct code inspection of the `listener` closure. |
| `utils.ts` `installQueueElement` | `callAbortController(appName)` + steam-gated `stop(false)` | catch sets `status='error'`, finally runs the unchanged 260816-vgc abort | ✓ WIRED | Diff-confirmed unmodified `finally` block; spec-confirmed both calls fire on a stall trip. |
| **appName/appId identity check (not in PLAN, verified per task instructions)** | | | ✓ VERIFIED | `libraryManagerMap.steam.getGame(id)` constructs `new SteamGame(id)` (`library.ts:621`); `SteamGame.appId = appId` from that same constructor arg (`games.ts:497-498`); `downloadSteamDepots(this.appId, ...)` (`games.ts:1498`) threads that value through `buildDepotPlan(appId, ...)` into `DepotPlan.appId` (`depot.ts:719`). So `plan.appId` used in the `sendProgressUpdate` payload is literally the same string as the `appName` the watchdog listens on (`progressUpdate-${appName}` in `utils.ts:175-193`) — no appId/appName mismatch. |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full watchdog + wiring + depot test suite | `pnpm jest src/backend/downloadmanager src/backend/storeManagers/steam/__tests__/depot.test.ts` | 174/174 passed | ✓ PASS |
| Type check | `pnpm codecheck` | clean, no errors | ✓ PASS |
| Lint (touched files) | `pnpm exec eslint <6 touched files>` | 0 errors, 151 pre-existing-style warnings | ✓ PASS |
| Translation lint | `pnpm lint-translations` | exit 0, no complaint re: `box.error.install.stalled`/`.failed` | ✓ PASS |
| Old `withTimeout` has no re-arm mechanism (structural pre-fix check) | `git show ba75d9b90:src/backend/storeManagers/steam/withTimeout.ts` | plain `Promise.race` + single `setTimeout`, zero `backendEvents` reference | ✓ PASS (confirms RED specs are structurally decisive, not just asserted) |
| Anti-false-pass calibration log contains both target lines | `grep -n "Installation of 1124300 failed with:\|Aborting in-flight download..." RUN-20260817-humankind-watchdog.log` | both lines present (lines 141, 143) | ✓ PASS |

### Probe Execution

Not applicable — this task has no `scripts/*/tests/probe-*.sh` probes; verification is via jest specs and the deferred operator LIVE-GATE.md recipe (documented above as a Deferred Item, not a gap).

### Requirements Coverage

No `.planning/REQUIREMENTS.md` entry exists for `QUICK-260817-dib` — expected for a quick task (not a roadmap phase). Not orphaned; quick tasks are not required to have REQUIREMENTS.md entries.

### Anti-Patterns Found

None. `grep -n -E "TBD|FIXME|XXX|TODO|HACK|PLACEHOLDER"` across all three modified/created source files (`installStallWatchdog.ts`, `utils.ts`, `depot.ts`) returned no hits.

### Human Verification Required

None for this quick task. The one item requiring real hardware (wall-clock survival of a healthy multi-GB install) is explicitly deferred to Phase 23 wave 10's operator-run LIVE-GATE.md per the plan's own scoping ("this plan is NOT blocking-human") — see Deferred Items above.

### Gaps Summary

No gaps. All six PLAN `must_haves.truths`, all three artifacts, and all three key links verified against actual code (not SUMMARY claims), with tests independently re-run and passing (174/174), `tsc` clean, lint clean (0 errors), and the `finally`-block-preservation claim confirmed via `git diff` against the pre-fix commit rather than by reading the SUMMARY's description of it. The decisive anti-vacuity spec (Steam's literal 1s heartbeat replay) is genuinely non-trivial and would fail against an arrival-armed implementation. The appId/appName identity underlying the depot→watchdog wiring was independently traced through `library.ts` → `games.ts` → `depot.ts` and confirmed to match, closing the one plausible silent-blind-spot the task instructions specifically flagged.

---
_Verified: 2026-08-17_
_Verifier: Claude (gsd-verifier)_
