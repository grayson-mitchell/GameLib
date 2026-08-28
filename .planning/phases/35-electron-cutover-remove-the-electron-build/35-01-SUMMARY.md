---
phase: 35-electron-cutover-remove-the-electron-build
plan: 01
subsystem: infra
tags: [tauri, electron, node-sea, worker_threads, ci, single-instance, deep-link, preflight]

# Dependency graph
requires: []
provides:
  - "Measured (not assumed) answer to whether node:sea isSea() agrees between the sidecar main thread and a spawned worker thread (OQ-1, disposition AGREES)"
  - "OQ-4: release-tauri.yml never launches the built artifact at runtime — a human smoke launch is still an open commitment (NEEDS-HUMAN-SMOKE)"
  - "PD-A evidence package for the single-instance guard decision (D-44-A mechanism, Windows gap, protocol_url_arg() choke point) — no binding choice made"
  - "PD-B corrected electronStub.ts export census: 19 live-consumer exports + 3 internal-only types, not 22 uniformly load-bearing exports"
  - "Deletion manifest for flatpak/flathub (CENSUS-FLATPAK), confirmation that e2e/'s CI=e2e harness is Electron-only and has no Tauri equivalent yet (CENSUS-E2E), and confirmation of zero sidecar->main.ts import edges (CENSUS-MAINTS-EDGES)"
affects: [35-04, 35-07, 35-09, 35-12, 35-13, 35-14, 35-19]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Throwaway meta/*.ts probes for empirical measurement instead of assumed reasoning, mirroring the target function's exact guarded shape", "Temporary env-gated branch in a production entry file, snapshotted by SHA-256 before edit and restored+reverified after, to measure packaged-SEA-only behaviour without leaving production source modified"]

key-files:
  created:
    - meta/probeSeaInWorker.ts
    - .planning/phases/35-electron-cutover-remove-the-electron-build/35-PREFLIGHT.md
  modified: []

key-decisions:
  - "OQ-1: node:sea isSea() AGREES between main thread and worker thread in both dev (false/false) and packaged SEA (true/true) contexts — D-14's app.isPackaged unification is safe as designed, no new devSecretVault.test.ts case owed"
  - "OQ-4: NEEDS-HUMAN-SMOKE — CI never launches the built artifact; closing 34-07 proves the pipeline builds, not that anyone runs the result"
  - "PD-B: corrected 35-CONTEXT.md's 'same 22 exports' framing — 3 of electronStub.ts's 22 exports (ElectronStubTransport, IpcHandler, IpcListener) have zero external consumers and are internal-only plumbing types, not live API surface"
  - "CENSUS-E2E: the CI=e2e Playwright harness launches build/main/main.js via _electron and has no Tauri-native equivalent — a correction owed to 35-CONTEXT.md D-19 and the ROADMAP before plans 35-04/35-14 rely on it as a free smoke harness"

requirements-completed: [REQ-35-11, REQ-35-16, REQ-35-20]

# Metrics
duration: ~20min
completed: 2026-08-28
---

# Phase 35 Plan 01: Preflight Measurement Summary

**Measured (not assumed) five research open questions plus two pattern-mapper decisions via reproducible commands, written once to 35-PREFLIGHT.md for six downstream plans to consume.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-08-28 (continuation agent picked up after a prior executor was killed by a 600s stream-idle watchdog with zero commits)
- **Completed:** 2026-08-28T01:00:23Z
- **Tasks:** 2/2 completed
- **Files modified:** 2 (both newly created — `meta/probeSeaInWorker.ts`, `35-PREFLIGHT.md`)

## Accomplishments

- OQ-1 measured empirically in both the dev/unpackaged context (`main=false worker=false`) and the packaged SEA sidecar context (`main=true worker=true`), via a throwaway probe plus a temporary, fully-reverted env-gated branch in `src/sidecar/index.ts` — disposition `AGREES`.
- OQ-4 measured by reading `.github/workflows/release-tauri.yml` end to end (436 lines): no step launches the built artifact — disposition `NEEDS-HUMAN-SMOKE`.
- PD-A evidence gathered from `src-tauri/src/main.rs` (D-44-A rejection mechanism, Windows guard gap, `protocol_url_arg()`'s three call sites and its 7 unit tests) with three options A/B/C presented, no binding choice made (per plan constraint — 35-07 owns the decision).
- PD-B census corrected via precise `from 'electron'` import-line grep after a first noisier pass (`grep -rl '\bName\b'`) false-positived on MUI component names sharing Electron export names (`Menu`, `screen`, `session`) — real result: 19 of 22 exports have live external consumers, 3 (`ElectronStubTransport`, `IpcHandler`, `IpcListener`) are internal-only types with zero consumers outside `electronStub.ts` itself.
- Three censuses (flatpak/flathub deletion manifest, e2e/'s Electron coupling, sidecar→main.ts import edges) confirmed with literal commands and raw output.

## Task Commits

Each task was committed atomically:

1. **Task 1: Measure node:sea isSea() inside a spawned worker thread (OQ-1)** - `d3e6dcfa0` (feat)
2. **Task 2: Answer OQ-4, PD-A, PD-B and the three preflight censuses** - `2ce5cbf69` (docs)

_No separate plan-metadata commit was made — per this execution's explicit constraints, STATE.md and ROADMAP.md are NOT touched by this agent; the orchestrator owns updating them by hand. See "State Tracking" below._

## Files Created/Modified

- `meta/probeSeaInWorker.ts` - throwaway probe: runs `isPackagedSidecar()`'s exact guarded `require('node:sea')` shape on both the sidecar main thread and inside an `eval`-mode `worker_threads.Worker`, prints `main=<v> worker=<v>`, always exits 0. Deleted by plan 35-18.
- `.planning/phases/35-electron-cutover-remove-the-electron-build/35-PREFLIGHT.md` - measured answers to OQ-1, OQ-4, PD-A, PD-B, CENSUS-FLATPAK, CENSUS-E2E, CENSUS-MAINTS-EDGES, each with the exact command and raw output that produced it (358 lines, 7 sections, 26 fenced command/output blocks).

## Decisions Made

- **OQ-1 (D-14): `AGREES`.** Both dev (`false`/`false`) and packaged-SEA (`true`/`true`) contexts agree internally. `isPackagedSidecar()`'s value is safe to trust identically from a worker-thread caller as from the main thread. Plan 35-04 may proceed making `app.isPackaged` a third caller without owing `devSecretVault.test.ts` a new worker-context test case on the strength of this measurement.
- **OQ-4 (D-16): `NEEDS-HUMAN-SMOKE`.** `release-tauri.yml`'s last step (`tauri-apps/tauri-action@v1`, line 429) builds and uploads to a draft release; nothing runs the artifact. `pnpm verify:updater-key` (the closest thing to a runtime check in the file) validates the updater signing key, not the built app. Closing user-deferred plan 34-07 proves the pipeline builds successfully — it does not add a launch step, so it does not change this disposition.
- **PD-A: evidence only, no choice made** (per plan constraint — plan 35-07 owns the decision). D-44-A's rejection sentence restated verbatim from `main.rs:5507`. One fact this preflight could NOT confirm: whether the plugin-callback-before-`tauri::Builder::default()` race D-44-A describes still holds at the pinned `tauri = 2.11.5` — flagged explicitly as unconfirmed rather than assumed, since re-deriving it would require reading the crate's own source/changelog (out of scope for this measurement pass). Plan 35-07 must re-check this before relying on D-44-A's mechanism as current.
- **PD-B: `PLATFORM_EXPORT_COUNT: 19`,** correcting `35-CONTEXT.md`'s "same 22 exports" framing. `ElectronStubTransport`, `IpcHandler`, `IpcListener` are exported types with zero consumers outside `electronStub.ts` — internal plumbing for the stub's own `bindTransport`/registry mechanism, not live Electron-API-shaped surface. The remaining 19 all have confirmed non-test, non-mock, non-main.ts/preload consumers; none of the 22 real exports turned out to be fully dead code (`protocol` and `nativeImage` are `SURVIVES`/`SURVIVES-AS-GAP` with caveats, not `DEAD`).
- **CENSUS-E2E correction:** the `CI=e2e` Playwright harness (`e2e/helpers.ts`, `_electron.launch()` against `build/main/main.js`) is Electron-only and has no Tauri equivalent today. `35-CONTEXT.md` D-19 and the ROADMAP describe it as a ready-made cheap harness for a Tauri runtime smoke check (`R-34.5-G1-PKG` half (b)) — that framing needs correcting before plans 35-04/35-14 plan around it as free.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking, environment tooling gap] No `timeout`/`gtimeout` binary available on this macOS host**
- **Found during:** Task 1, attempting to wrap the SEA build in a bounded foreground command per the mandatory pacing rules
- **Issue:** Neither `timeout` nor `gtimeout` exists in this shell's `PATH`. The prior executor's death (600s watchdog kill with zero commits) was directly caused by an unbounded foreground build.
- **Fix:** Used Node's own `child_process.spawnSync(..., { timeout: N })` to run `pnpm build:sidecar-sea` and the compiled SEA binary with an explicit wall-clock bound and reliable stdout capture (a `perl -e 'alarm shift; exec @ARGV'` wrapper was tried first but silently truncated captured stdout on this host and was abandoned in favor of the Node-native approach).
- **Files modified:** none (tooling choice only, no source change)
- **Verification:** both the build and the run completed well inside their bounds (build ~15s, probe run <1s) with narration between every tool call
- **Committed in:** n/a (process choice, not a code change)

**2. [Rule 3 - Blocking, first-pass measurement error] Initial PD-B census used an imprecise grep and drew a wrong conclusion**
- **Found during:** Task 2, before writing PD-B's final content
- **Issue:** A first pass used `grep -rl '\bName\b'` across `src/**/*.{ts,tsx}` for each of the assumed export names. This matched frontend React components (MUI's `Menu`, local variables named `screen`/`session`/`net`/`app`) that have nothing to do with `electronStub.ts`, and — worse — the assumed export list itself (`crashReporter`, `globalShortcut`, `autoUpdater`, `contextBridge`, `webContents`, `webFrame`, `systemPreferences`, `desktopCapturer`, `ipcRenderer`) does not match `electronStub.ts`'s actual 22 exports at all.
- **Fix:** Re-ran `grep -n "^export"` against the real file to get the authoritative 22-name list, then re-derived the census using `grep -rn "from 'electron'"` (the precise, backend-only consumption pattern), cross-checked a few ambiguous cases (`ipcMain`→`ipc.ts`, `BrowserWindow`→`main_window.ts`) by confirming those intermediate files themselves have live sidecar-side consumers, not just `main.ts`.
- **Files modified:** `.planning/phases/35-electron-cutover-remove-the-electron-build/35-PREFLIGHT.md` (PD-B section written once, with the correct data — the erroneous first pass was never committed)
- **Verification:** cross-checked against the plan's own plan-time partial findings for `Menu`/`Tray`/`protocol`, which matched exactly
- **Committed in:** `2ce5cbf69` (Task 2 commit — the erroneous draft was never separately committed)

---

**Total deviations:** 2 auto-fixed (1 tooling/blocking, 1 self-caught measurement error before commit)
**Impact on plan:** Neither deviation changed the plan's scope or touched production source. Both are process corrections that improved the accuracy of what was ultimately recorded.

## Issues Encountered

- The predecessor agent that started this plan was killed by the orchestrator's 600-second stream-idle watchdog while attempting an unbounded `pnpm build:sidecar-sea` foreground call, with zero commits made. This execution mitigated the same risk by wrapping every build/run step in an explicit timeout (via `spawnSync`'s `timeout` option) and narrating between tool calls, per the handoff's mandatory pacing rules.
- `meta/probeSeaInWorker.ts` was already present (uncommitted, good work) at the start of this continuation and required no rewrite — only its one documented defect (the "entirely self-contained" claim in its header comment, which would have been false if route 1's temporary production-file edit had been used without disclosure) was checked and found to already be phrased conditionally/accurately enough that no correction to the probe file itself was needed; the actual disclosure of the temporary `src/sidecar/index.ts` edit and its full reversion lives in `35-PREFLIGHT.md`'s OQ-1 section instead.

## State Tracking

Per this execution's explicit constraints, **no `gsd-sdk state.*`/`roadmap.*`/`phase.complete` verb was invoked**, and `.planning/STATE.md` / `.planning/ROADMAP.md` were not modified by this agent — those verbs are recorded (MEMORY.md) as corrupting both files. `.planning/REQUIREMENTS.md` was also left untouched; this plan's `requirements` frontmatter (`REQ-35-11`, `REQ-35-16`, `REQ-35-20`) is recorded here in this SUMMARY's frontmatter for the orchestrator to apply by hand.

## User Setup Required

None - no external service configuration required. PD-A's evidence flags that plan 35-07's eventual single-instance decision may involve a `checkpoint:human-verify`/decision gate, but that belongs to 35-07, not this plan.

## Next Phase Readiness

- Plan 35-04 can proceed with D-14's `app.isPackaged` unification without an owed test case, and knows OQ-3's `session.fromPartition` census is already settled.
- Plan 35-07 has PD-A's full evidence package (D-44-A mechanism, Windows gap, `protocol_url_arg()` choke point + its 7 tests) to turn into a decision checkpoint, plus the one explicitly unconfirmed fact (tauri 2.11.5 plugin-callback-ordering) it must re-check itself.
- Plan 35-12 has the flatpak/flathub deletion manifest (7 files + `flathub/update-flathub.ts` + 5 package.json scripts).
- Plan 35-13 has the corrected `PLATFORM_EXPORT_COUNT: 19` (not 22) with the 3 dropped internal-only types named, plus `nativeImage`'s known-hollow-stub caveat and `protocol`'s D-05-accepted gap status.
- Plan 35-14 has CENSUS-MAINTS-EDGES's confirmed zero import edges from the sidecar into `backend/main.ts`, validating its point-of-no-return ordering, and CENSUS-E2E's correction that `CI=e2e` is not a free Tauri smoke harness.
- Plan 35-19 has OQ-4's `NEEDS-HUMAN-SMOKE` disposition to plan a `checkpoint:human-verify` around.
- No blockers. `pnpm codecheck` exits 0. `git diff --stat fb42d70d6..HEAD` shows exactly two files added, no production source modified.

---
*Phase: 35-electron-cutover-remove-the-electron-build*
*Completed: 2026-08-28*

## Self-Check: PASSED

- FOUND: `meta/probeSeaInWorker.ts`
- FOUND: `.planning/phases/35-electron-cutover-remove-the-electron-build/35-PREFLIGHT.md`
- FOUND: `.planning/phases/35-electron-cutover-remove-the-electron-build/35-01-SUMMARY.md`
- FOUND: commit `d3e6dcfa0` (Task 1)
- FOUND: commit `2ce5cbf69` (Task 2)
