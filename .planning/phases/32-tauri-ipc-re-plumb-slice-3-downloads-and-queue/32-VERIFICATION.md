---
phase: 32-tauri-ipc-re-plumb-slice-3-downloads-and-queue
verified: 2026-07-24T00:00:00Z
status: human_needed
score: 12/12 must-haves verified
overrides_applied: 0
human_verification:
  - test: "REQ-32-08 dual-build smoke: run `npm start` (Electron) and `pnpm tauri:dev` (Tauri), confirm both boot unchanged and no previously-non-fatal channel becomes a crash."
    expected: "Both builds boot; window.api.* surface unchanged; any channel still unported stays non-fatal (Invariant B) — it rejects with UNPORTED_CHANNEL_MARKER rather than crashing the shell. CORRECTED 2026-08-22: the original expectation named the DownloadDialog channels as the ones that must still marker-reject; `getInstallInfo` has since been PORTED (plan 34.5-43, gameDetailsFlowRegistration.ts:191), so asserting a marker rejection for it would now fail against a correct build. Assert Invariant B itself, not a named channel."
    why_human: "No display / long-running dev server available in this verification environment — cannot launch either Electron or Tauri shell to observe boot behavior."
  - test: "Live queue E2E: with a signed-in Steam library under `pnpm tauri:dev`, enqueue an install, observe the Download Manager screen and the NavShell DownloadsRing update via progressUpdate/changedDMQueueInformation, then pause/resume/cancel from the UI."
    expected: "Queue populates, progress bar updates, pause aborts + resume restarts via reconcilePartialState, cancel removes the item — matching 32-PORTED-CHANNELS.md's documented behavior."
    why_human: "Requires a real running download under a live shell; no automated harness can observe it. UNBLOCKED 2026-08-22 — the original 'doubly-gated' why_human is superseded: G-30-01 was CLOSED 2026-07-23 as a misdiagnosis (30-HUMAN-UAT.md:10,68,103 — the tester clicked Logout on an already-authenticated session; the QR tab is unreachable by design while signed in), a day BEFORE 32-HUMAN-UAT.md's own updated: stamp cited it as live; and G-30-02 was closed and hardware-proven by Phase 33's 33-05 D-13 live gate (REQ-33-01/02/10). Neither gates this item any longer. See the CORRECTION section in 32-HUMAN-UAT.md."
---

# Phase 32: Tauri IPC re-plumb slice 3 — downloads and queue Verification Report

**Phase Goal:** Port the download-manager/queue endpoint cluster onto the Tauri sidecar — the progress-notification-heavy slice exercising the `frontendMessage` → `frontend_message` push path at real volume rather than the single `pushGameToLibrary` case the skeleton proved. Third of three mechanical re-plumb slices.
**Verified:** 2026-07-24
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | The five queue-management channels reach the real `downloadqueue.ts` functions through the sidecar RPC loop | ✓ VERIFIED | `downloadQueueFlowRegistration.ts:80-159` imports `removeFromQueue`/`pauseCurrentDownload`/`resumeCurrentDownload`/`cancelCurrentDownload`/`getQueueInformation` from `../downloadmanager/downloadqueue` unmodified and calls them from the `ipcMain` handlers; `downloadQueueFlows.test.ts` drives the real RPC loop end-to-end (all 14 assertions pass, live test run) |
| 2 | Transport-kind split: 4 channels send-kind (`ipcMain.on`), 1 invoke-kind (`ipcMain.handle`) | ✓ VERIFIED | `grep -c "ipcMain.on("` = 4, `grep -c "ipcMain.handle("` = 1 in `downloadQueueFlowRegistration.ts`; matches `downloadmanager/ipc_handler.ts:64-70` character-for-character per code review |
| 3 | `progressUpdate` and `changedDMQueueInformation` reach the `frontend_message` relay with zero `src-tauri` changes | ✓ VERIFIED | 5 `sendFrontendMessage(...)` call sites confirmed in `downloadqueue.ts` (lines 141,157,264,318,366) and 4 in `utils.ts`/`depot.ts` for `progressUpdate`; `git log --oneline -10 -- src-tauri` shows the last `src-tauri` commit predates Phase 32 (`8260df5c`, Phase 31); relay-reach tests pass live |
| 4 | Sidecar never calls `initQueue(isStartup=true)`; disablement is logged, not silent | ✓ VERIFIED | `grep -rn "initQueue(true)\|isStartup: true\|isStartup=true"` against production files (`downloadQueueFlowRegistration.ts`, `installFlowRegistration.ts`, `handlers.ts`) returns nothing; `registerDownloadQueueFlows()` logs the disablement via a `setImmediate`-deferred `logInfo`/`console.info` fallback (lines 94-137) |
| 5 | No file under `src/backend/sidecar/` imports the real `electron` module | ✓ VERIFIED | `electronUntouched.test.ts` passes live; new module imports only `./electronStub` |
| 6 | `install`/`updateGame` enqueue via `addToQueue()`, replacing the Phase 30 direct bypass | ✓ VERIFIED | `installFlowRegistration.ts:109-185` builds a `DMQueueElement` and calls `await addToQueue(dmQueueElement)` for both handlers; `grep -n "sendGameStatusUpdate" installFlowRegistration.ts` only matches a docstring comment, not executable code — the bypass's hand-rolled push/try-catch-finally logic is gone |
| 7 | `install`/`updateGame` resolve `Promise<void>` once QUEUED, not a reconstructed `{status}` shape | ✓ VERIFIED | Both handlers are typed `Promise<void>` and simply `await addToQueue(...)` with no return statement; live test asserts `result === undefined` |
| 8 | `32-PORTED-CHANNELS.md` declares every ported channel (5 queue + install/updateGame + 2 push) with D-04/D-05 boundaries | ✓ VERIFIED | File contains all 9 rows, an explicit "abort-then-reconciled-restart, NOT true in-flight suspend" D-04 note, and a "Deliberately NOT ported" section citing D-05/`main.ts:579` |
| 9 | `32-HUMAN-UAT.md` logs one deferred item naming BOTH G-30-01 and G-30-02 | ✓ VERIFIED | Both blocker IDs present, doubly-gated wording, "wired and unit-proven, never hardware-proven" claim-scope stated |
| 10 | Queue-channel / byte-progress rows moved from SEAM.md §3 (deferred) to §1 (ported); D-05a marked superseded | ✓ VERIFIED | `grep` confirms a new `### Download-queue cluster (real, Phase 32)` entry under §1 and the D-05a "Accepted Constraints" line is struck through and marked closed/superseded |
| 11 | Automated regression suite for this cluster stays green | ✓ VERIFIED | Live run: `src/backend/sidecar` + `src/backend/downloadmanager` = 14 suites / 180 tests, all pass; `npx tsc --noEmit` clean |
| 12 | REQ-32-01..08 all traceable in REQUIREMENTS.md, no orphans | ✓ VERIFIED | `grep "REQ-32"` shows all 8 requirements marked `[x]` with evidence-backed descriptions; PLAN frontmatter (32-01/32-02/32-03) collectively covers REQ-32-01..08 exactly once each |

**Score:** 12/12 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/backend/sidecar/downloadQueueFlowRegistration.ts` | Fourth curated flow module, 4 send + 1 invoke registrations, D-05 log | ✓ VERIFIED | Exists, 94 lines of logic, exports `registerDownloadQueueFlows`, wired from `handlers.ts` |
| `src/backend/sidecar/__tests__/downloadQueueFlows.test.ts` | Real-RPC-loop harness, per-channel assertions | ✓ VERIFIED | 14 `it()` blocks covering registration, queue-ops, relay-reach, D-05 gate, REQ-32-08 gate, install/updateGame enqueue — all pass live |
| `src/backend/sidecar/handlers.ts` | `registerDownloadQueueFlows()` call wired in | ✓ VERIFIED | Line 77, alongside the other four curated flow registrations, before `ensureStoresRegistered()` |
| `src/backend/sidecar/installFlowRegistration.ts` | install/updateGame re-routed to `addToQueue()` | ✓ VERIFIED | Lines 109-185; bypass fully removed |
| `.planning/phases/32-.../32-PORTED-CHANNELS.md` | Declared 9-channel ported list | ✓ VERIFIED | Present, matches SUMMARY-verified as-shipped state |
| `.planning/phases/32-.../32-HUMAN-UAT.md` | Doubly-gated deferred item | ✓ VERIFIED | Present, both blockers named |
| `.planning/phases/27-.../SEAM.md` | §3→§1 move | ✓ VERIFIED | Confirmed via grep |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `downloadQueueFlowRegistration.ts` | `downloadmanager/downloadqueue.ts` | direct import of 5 functions | ✓ WIRED | Confirmed by source read + passing live tests exercising the real functions |
| `sidecar/handlers.ts` | `downloadQueueFlowRegistration.ts` | `registerDownloadQueueFlows()` call | ✓ WIRED | Line 77 of `handlers.ts` |
| `installFlowRegistration.ts` | `downloadmanager/downloadqueue.ts` (`addToQueue`) | `addToQueue(dmQueueElement)` in `install`/`updateGame` | ✓ WIRED | Both handlers call it and `await` the result |
| `downloadqueue.ts`/`depot.ts` push sites | frontend (`frontend_message` relay) | `sendFrontendMessage` → `ipc.ts` → `electronStub` → sidecar RPC | ✓ WIRED | 5 `changedDMQueueInformation` + 4 `progressUpdate` call sites confirmed; relay-reach tests pass live |
| `32-PORTED-CHANNELS.md` | `SEAM.md` | channel-list cross-reference / §3→§1 move | ✓ WIRED | Confirmed via grep of both files |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full sidecar+downloadmanager Jest suite | `npx jest src/backend/sidecar src/backend/downloadmanager` | 14 suites / 180 tests passed | ✓ PASS |
| TypeScript compiles clean | `npx tsc --noEmit` | No errors | ✓ PASS |
| Transport-kind grep gate | `grep -c "ipcMain.on(" / "ipcMain.handle("` | 4 / 1 | ✓ PASS |
| D-05 boot-resume grep gate | `grep -rn "initQueue(true)\|isStartup..."` against production sidecar files | empty | ✓ PASS |
| No `src-tauri` changes this phase | `git log --oneline -10 -- src-tauri` | last commit `8260df5c` predates Phase 32 | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| REQ-32-01 | 32-02 | install/updateGame enqueue via addToQueue(), retiring D-05a bypass | ✓ SATISFIED | Code read + live tests |
| REQ-32-02 | 32-01 | New curated `downloadQueueFlowRegistration.ts` module, runner-generic | ✓ SATISFIED | Code read |
| REQ-32-03 | 32-01 | `progressUpdate` rides relay with zero new throttle/src-tauri code | ✓ SATISFIED | Grep gate + call-site confirmation |
| REQ-32-04 | 32-01 | Five queue channels map to real functions; D-04 pause caveat honestly declared | ✓ SATISFIED | Code read, PORTED-CHANNELS.md |
| REQ-32-05 | 32-01 | Boot auto-resume disabled + logged, pre-initQueue cancelability preserved | ✓ SATISFIED | Grep gate + docstring/log |
| REQ-32-06 | 32-03 | Sign-off via automated tests; one doubly-gated deferred UAT item | ✓ SATISFIED | 32-HUMAN-UAT.md |
| REQ-32-07 | 32-03 | Declared ported-channel list artifact; SEAM §3→§1 move | ✓ SATISFIED | 32-PORTED-CHANNELS.md + SEAM.md grep |
| REQ-32-08 | 32-01 | Additive/reversible invariant; dual-build smoke | ? NEEDS HUMAN | Automated portion (electronUntouched gate) verified; the dual-build boot smoke itself was never run this session (no display) |

No orphaned requirements found — REQUIREMENTS.md lists exactly REQ-32-01..08 for Phase 32, and each is claimed by exactly one of the three plans' frontmatter.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/backend/sidecar/installFlowRegistration.ts` (effective behavior via `downloadmanager/utils.ts:139`) | n/a (behavioral, not textual) | Regression: a genuine Steam install error (`status === 'error'`, not abort/deferred) no longer force-clears the "installing" badge nor shows the "Installation failed" dialog — the retired Phase 30 bypass handled this case; the shared `installQueueElement` only force-clears on `runner !== 'steam' \|\| deferredToSetup \|\| wasAborted` | ⚠️ Warning | Confirmed independently by reading `downloadmanager/utils.ts:139` — a plain Steam depot error is provably excluded from the force-clear condition. This is code-review finding WR-01, re-confirmed here by direct source inspection, not just trusted from 32-REVIEW.md. Not a phase must-have failure (no must-have specifies error-path parity) but a real, user-facing functional regression on the Tauri build once G-30-02 unblocks live installs. |
| `src/backend/sidecar/installFlowRegistration.ts:109-133` | n/a | WR-02: dropping the non-steam-runner guard without porting `ipc_handler.ts`'s Legendary DLC fan-out loop means a Legendary/Epic install invoked through the Tauri sidecar with `installDlcs` populated silently installs only the base game | ⚠️ Warning | Confirmed via docstring + `ipc_handler.ts` comparison; no test exercises this path (WR-03) |
| `src/backend/sidecar/__tests__/downloadQueueFlows.test.ts:456-537` | n/a | WR-03: no test drives an `error`/`abort` resolution through `install`/`updateGame` for a `runner: 'steam'` element — confirmed by reading the file: `beforeEach` only ever mocks `installQueueElement`/`updateQueueElement` to resolve `{status: 'done'}` | ℹ️ Info | Coverage gap that let WR-01 land unnoticed; test suite is green because it never exercises the regressed path |

None of these are debt markers (no TBD/FIXME/XXX/TODO found in phase-modified files) and none are must-have failures — they are pre-existing-quality findings from `32-REVIEW.md`, independently re-confirmed against source in this verification rather than taken on trust.

### Human Verification Required

### 1. REQ-32-08 dual-build smoke

**Test:** Run `npm start` (Electron) and `pnpm tauri:dev` (Tauri); confirm both boot unchanged, `window.api.*` call sites are untouched, and any channel still unported rejects non-fatally rather than crashing the shell.
**Expected:** Both builds boot normally with no new crashes.
**Why human:** No display / long-running dev server available in this verification environment.

> **CORRECTED 2026-08-22 — stale by behaviour.** This test originally named "DownloadDialog
> channels" as the ones that must *still* marker-reject. That channel, `getInstallInfo`, has since
> been **ported** (plan 34.5-43, registered at
> `src/backend/sidecar/gameDetailsFlowRegistration.ts:191`). Running the check as originally
> worded would FAIL against a correct build, and "fixing" that failure would mean un-porting a
> working channel. The surviving assertion is **Invariant B** itself — no previously-non-fatal
> channel has become a crash — not any named channel. Run the Tauri leg as `pnpm tauri:dev`;
> `tauri dev` serves a stale static bundle.

### 2. Live queue E2E (UNBLOCKED 2026-08-22, pending)

**Test:** With a signed-in Steam library under `pnpm tauri:dev`, enqueue an install, observe progress via the Download Manager screen and the NavShell DownloadsRing, then pause/resume/cancel.
**Expected:** Queue populates and updates live; pause aborts + resume restarts via `reconcilePartialState`; cancel removes the item.
**Why human:** Requires a real running download under a live shell — no automated harness can observe it.

> **CORRECTED 2026-08-22 — both gates are dead, and one was already dead when the deferral was
> written.** The original "doubly-gated" framing is superseded:
>
> - **G-30-01 — CLOSED 2026-07-23 as a misdiagnosis.** `30-HUMAN-UAT.md:10` retitles it
>   *"CORRECTED 2026-07-23, was a misdiagnosis"*, `:68` states *"G-30-01 is closed"*, and `:103`
>   states a future retest *"does not need to 'fix G-30-01' as a precondition."* There was no
>   QR-login defect: the Tauri build read a real already-authenticated session from the shared
>   on-disk `steamConfigStore.userData` (377 owned games), so the Steam tile correctly rendered
>   Logout and the tester clicked it; the QR tab is unreachable **by design** while signed in.
>   Record: `.planning/debug/resolved/steam-logon-button-tauri.md`. This is dated **one day
>   before** `32-HUMAN-UAT.md`'s own `updated:` stamp — the deferral cited an already-closed gate.
> - **G-30-02 — CLOSED and hardware-proven** by Phase 33 (`33-01`, `33-02`, and the `33-05` D-13
>   live gate, 2026-07-24 — REQ-33-01/02/10), re-confirmed since by real native installs under
>   `tauri:dev`.
>
> **Surface note (34.10 nav redesign):** the queue badge is no longer in a sidebar. Watch
> `NavShell/components/DownloadsRing/index.tsx:66` and `screens/DownloadManager/index.tsx:39`,
> both subscribing via the preload method `handleDMQueueInformation`
> (`src/preload/api/downloadmanager.ts:7`).
>
> **Cost note:** no fresh multi-GB download is needed — move the title's `.acf` aside and resume
> over content already on disk (a prior live gate closed KCD2 in 71.5s, zero bytes moved).

### Gaps Summary

No must-have truths, artifacts, or key links failed. All 12 derived must-haves (5 from 32-01, 3 from 32-02, 4 from 32-03) are independently verified against the actual codebase — the five queue channels are correctly transport-split and reach real `downloadqueue.ts` functions, the two push channels are proven to ride the existing relay with zero `src-tauri` changes, boot auto-resume is disabled and logged, `install`/`updateGame` are fully re-routed off the Phase 30 bypass onto `addToQueue()` with correct `Promise<void>` semantics, and all three doc artifacts (`32-PORTED-CHANNELS.md`, `32-HUMAN-UAT.md`, `SEAM.md`) accurately and honestly declare the shipped boundary. REQ-32-01..08 are all satisfied with codebase evidence and none are orphaned.

Status is `human_needed` rather than `passed` for two reasons, neither of which is a phase-goal failure: (1) the REQ-32-08 dual-build smoke check could not be run in this environment (no display), and (2) the live queue E2E is honestly and correctly logged as doubly-gated-deferred rather than claimed complete.

One finding is flagged for developer attention even though it does not block this verification: WR-01 (Steam install genuine-error badge-stuck regression) is a real, independently-confirmed functional regression introduced by retiring the Phase 30 D-05a bypass, currently invisible to the test suite (WR-03) and currently unreachable in practice because G-30-02 already blocks any Tauri install from running far enough to hit it. It does not block Phase 32's goal (porting the queue cluster onto the sidecar) but should be fixed before or alongside the Phase 33 G-30-02 install-hang fix, since fixing G-30-02 will make WR-01 immediately reachable by real users. Recommend either: (a) opening a small gap/fix plan now referencing `32-REVIEW.md` WR-01/WR-02/WR-03, or (b) explicitly carrying it forward as tracked debt into Phase 33's G-30-02 work (mirroring how G-30-01/G-30-02 are already carried forward). This is a recommendation, not a verification-blocking gap, since no phase must-have specified error-path behavioral parity.

> **UPDATE 2026-08-22 — WR-01 was discharged via option (b) and is no longer outstanding.** Phase
> 33 took it up as **REQ-33-02**: `installQueueElement`'s finally-guard (`downloadmanager/utils.ts`)
> was extended to push a terminal `sendGameStatusUpdate({status:'done'})` on Steam
> `status === 'error'`, with a failure dialog on the same path. Do not re-file WR-01 off this
> document. **WR-02 (Legendary DLC fan-out) and WR-03 (the test-coverage gap that hid WR-01) are
> NOT covered by that fix** and remain open as recorded in `32-REVIEW.md` / `deferred-items.md`.

---

_Verified: 2026-07-24_
_Verifier: Claude (gsd-verifier)_
