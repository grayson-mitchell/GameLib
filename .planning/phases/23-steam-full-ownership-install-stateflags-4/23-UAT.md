---
phase: 23-steam-full-ownership-install-stateflags-4
plan: 04
artifact: uat
status: diagnosed
total_items: 3
pending_items: 2
passed_items: 0
failed_items: 1
blocked_items: 0
requirements: [REQ-23-07]
run_via: "/gsd:verify-work 23"
last_updated: 2026-07-18
---

# Phase 23 — Steam Full-Ownership Install (StateFlags=4): Real-Hardware UAT

**Plan:** 23-04 (final plan of Phase 23 — steam-full-ownership-install-stateflags-4)
**Purpose:** Close the D-07 pre-ship real-hardware validation gate (REQ-23-07). StateFlags=4 tells
Steam "do not verify" — the only way to prove Steam actually trusts a GameLib-authored `4` across the
real risk surface is real hardware. These three checks cannot be automated (they require a live Steam
client, real owned titles, and real depots) and they **BLOCK phase completion**.

**Status: NOT YET RUN.** This document is the prepared test list + recording template. Every result
below is a placeholder until a human runs the corresponding flow on real hardware and reports back.

**Scope note:** Prove on **macOS first** (where spikes 001-003 ran). Windows/Linux OS coverage is a
**deferred follow-up** (per D-07 in `23-CONTEXT.md`) — it is explicitly NOT a Phase 23 gate. Do not
expand this document's scope to cover Windows/Linux; file a follow-up todo instead if gaps are found
there.

---

## How to read this document

Each gate has:
- **Preconditions** — what must be true before starting (opt-in state, account state, game owned,
  build used)
- **Steps** — the exact sequence to run
- **Expected result** — what "pass" looks like
- **Inspection tip** — how to read the written `.acf` directly, not just trust Steam's UI
- **Result** — `PENDING` until run; then `PASS` / `FAIL` / `DIVERGENCE` with evidence (titles, appIds,
  `.acf` field dumps, screenshots/logs referenced by path, etc.)

Any `FAIL` or divergence must be captured here, not silently marked pass — it blocks phase completion
and routes to `/gsd-plan-phase 23 --gaps`.

### Inspection tool

Use `.planning/spikes/003-stateflags4-full-ownership/inspect-acf.mjs` to read the written manifest's
load-bearing field set directly (StateFlags, BytesToDownload/BytesDownloaded/SizeOnDisk consistency,
buildid, LastOwner, installdir) instead of eyeballing raw VDF text. It defaults to WazHack's appId
(264160) but accepts an explicit path as its second argument — pass the target title's
`appmanifest_{appId}.acf` path for Gates 1-3 below (they use titles other than WazHack), e.g.:

```
node .planning/spikes/003-stateflags4-full-ownership/inspect-acf.mjs gate1-multidepot \
  "$HOME/Library/Application Support/Steam/steamapps/appmanifest_{appId}.acf"
```

Each run also saves a `snapshot-<label>.acf` next to the script for the Results section below — keep
these as evidence (do not commit large binary artifacts, but the small text `.acf` snapshots are fine
to reference by path or paste key fields inline).

---

## Gate 1 — MULTI-DEPOT: larger title installs under StateFlags=4 across depots, no verify/re-download

Source: 23-04-PLAN.md Task 2 (D-07.1). Closes: the multi-depot open item from spike-003's Results
section ("Multi-depot / larger title — confirm StateFlags=4 across depots").

**Preconditions:**
- `enableSteamNativeInstall` opt-in ON (D-13).
- Real authenticated Steam account with a multi-depot larger title owned and NOT yet installed.
  **Target: Cyberpunk 2077 (appId 1091500)** — confirmed in `21-UAT.md` D-UAT-08 as a real owned
  native Apple-Silicon macOS title with 3 depots (base 1460472 ~65GB, 2224089 ~24GB, 2060314
  ~193MB, ~90GB total) once Phase 21's D-UAT-08 fix (commit `64d5afcc`, owner-appId threaded to
  depot key/manifest) is verified on this build. **Control: WazHack (appId 264160)** — the
  proven single-depot macOS title (spike-003) — use as a sanity baseline if Cyberpunk is
  unavailable or still blocked, but WazHack alone does NOT satisfy this gate (it is single-depot).
- A build that includes Phase 23's Plans 01-03 (file-mode fidelity, completeness gate, buildid
  threading, resume/reconciliation) — NOT a stale pre-Phase-23 build.

**Steps:**
1. In the real Steam client, confirm the target title is NOT currently installed (uninstall first
   if a stale copy exists from earlier UAT). Quit Steam.
2. Install the title via GameLib's native install path (no `GAMELIB_SPIKE_STATEFLAGS4` env flag —
   this is the productionized path, not the spike toggle).
3. Let ALL depots download to completion. Confirm the DownloadManager queue's total reflects the
   SUMMED size across all depots (per 21-UAT.md 2c precedent), and that files from every depot are
   actually present on disk (spot-check the install directory).
4. Before starting Steam, inspect the written `appmanifest_{appId}.acf` with `inspect-acf.mjs`.
   Confirm: `StateFlags "4"`; `BytesToDownload == BytesDownloaded == SizeOnDisk` (non-zero);
   `buildid` non-zero (current public-branch build); `InstalledDepots` lists ALL depot GIDs used
   (not just the base depot).
5. Start Steam. **Observe WITHOUT clicking Install/Verify:**
   - Does the title show **Ready to Play** / Installed immediately (no "Verifying…" progress bar)?
   - Does Steam kick off ANY re-download or per-depot verify pass? (watch the download/activity
     tab across all depots, not just the base one)
6. Re-inspect the `.acf` after Steam has seen it — confirm Steam left `StateFlags` at `4` (did not
   rewrite it back to something else).
7. Launch the title (Play button, or via GameLib). Confirm it runs.

**Expected result:** The written `.acf` has `StateFlags "4"` with a consistent non-zero byte count,
current buildid, and the full multi-depot `InstalledDepots` set. Steam shows the game Ready with **NO
verify pass and NO re-download across ANY of the depots** (not just the base depot — a partial-depot
verify would be a real divergence). The game launches.

**Result:** ISSUE — progress display defect during multi-depot download (never reached completion/adoption)
**Title/AppID used:** Hogwarts Legacy (appId 990080) — multi-depot
**Depot count / per-depot sizes:** _(not recorded — blocked by progress bug before completion)_
**`.acf` field dump (pre-Steam-launch):** _(n/a — download never completed)_
**`.acf` field dump (post-Steam-launch):** _(n/a)_
**Verify/re-download observed?** _(n/a — did not reach Steam adoption)_
**Launch confirmed?** _(n/a)_

**Reported behavior (2026-07-18):** At download start, MB/s barely changed and the graph updated
slowly — unclear it was even working. After ~2 min the opposite: graph updated much faster and **two
stats appeared showing download %**, flickering between two values (1% ↔ 5%). Paused; on resume the
same pattern — ~1-2 min of slow updates, then graph updating ~every 0.5s with progress **flashing
between two values** (now 2% ↔ 16%). Strongly implicates commit `22619287` ("rolling instantaneous
speed + real disk rate for Steam") — two competing progress sources (network-received % vs
disk-written %) appear to be racing on the same display.

**Diagnosis (static analysis, HIGH confidence on defect class):**
Two INDEPENDENT `progressUpdate` producers exist for the same `{ appName: appId, runner: 'steam' }`,
computing `percent` from DIFFERENT sources:
1. `depot.ts` `emitProgress` (L1087): `percent = min(100, round(doneBytes / plan.totalBytes * 100))`
   where `doneBytes` = decompressed bytes written this process. Monotonic within one run.
2. `library.ts` `pollInstallOnce` (L1195): `percent = round(bytesDownloaded / bytesToDownload * 100)`
   read from the on-disk ACF (`readAcfState`), emitted every ~3s by `startInstallPolling`.
Because a single `emitProgress` run's `doneBytes` only increases, the observed BACKWARDS jump
(16% → 2%) is impossible from one stream — it proves two producers were emitting for the same appId
concurrently, and the DownloadManager's single `progress.percent` slot flip-flops between them. The two
percent scales are unrelated (decompressed-disk vs ACF download bytes), so any overlap diverges by a
large margin — matching 2% ↔ 16%.
Overlap triggers (any of these; exact one not pinned without runtime logs):
  - a leftover `startInstallPolling` from a PRIOR install attempt of the same title still running
    against a stale partial ACF (constant low % vs the live climbing %);
  - two concurrent `installDepotDownload`/`downloadDepotFiles` runs for one appId (no in-flight guard
    on the DownloadManager side, only `nativeInstallsInFlight` inside SteamGame);
  - a pause/resume that starts a fresh depot run while the previous run's workers are still draining.
Secondary: the "slow-then-fast, ~0.5s graph" cadence is the `PROGRESS_THROTTLE` + `rollingRateMiBs`
window behavior from commit `22619287` warming up — cosmetic, not the flicker cause.

**Gaps (structured for /gsd-plan-phase 23 --gaps):**
```yaml
- truth: "A multi-depot title installs with a single, monotonic download-progress percent"
  status: failed
  reason: "Two independent progressUpdate producers (depot.ts emitProgress via doneBytes/plan.totalBytes, and library.ts pollInstallOnce via ACF bytesDownloaded/bytesToDownload) emit for the same {appName:appId, runner:'steam'} with divergent percent math and no mutual exclusion. When they overlap, the DownloadManager percent flip-flops (observed 2% <-> 16%). Backwards jumps are impossible from a single emitProgress stream (doneBytes only grows), confirming concurrent producers."
  severity: major
  test: gate-1-multi-depot
  artifacts:
    - "src/backend/storeManagers/steam/depot.ts:1087 (emitProgress percent)"
    - "src/backend/storeManagers/steam/library.ts:1195 (pollInstallOnce percent)"
    - "src/backend/storeManagers/steam/games.ts:726 (installDepotDownload; poller starts only after download, so overlap comes from a leftover/second poller or a double download run)"
  missing:
    - "Mutual exclusion / single source of truth for steam progressUpdate percent during a native/bottle depot download"
    - "Stop/replace any existing startInstallPolling(appId) before starting a depot download run"
    - "A DownloadManager-side in-flight guard preventing two concurrent depot runs for one appId"
```

---

## Gate 2 — HARD-DRM: confirmed hard-DRM title launches under StateFlags=4, no re-validation

Source: 23-04-PLAN.md Task 2 (D-07.2). Closes: spike-001's open DRM caveat (also still open in
`21-UAT.md` 1c — no native Mac Denuvo title was available at that time).

**Preconditions:**
- `enableSteamNativeInstall` opt-in ON.
- A **confirmed hard-DRM title** owned on the account (Denuvo or VMProtect-wrapped — check
  pcgamingwiki.com/DRM if unsure which owned titles qualify). Prefer a native macOS build if one
  exists; if the only hard-DRM title owned is Windows-only, this gate runs through the CrossOver
  bottle path instead (native vs. bottle distinction should be recorded either way — both are
  in-scope for "macOS-first", per D-07's "macOS first" wording covering the whole platform, not
  strictly the native depot path).
- Title NOT yet installed via GameLib or Steam.

**Steps:**
1. Confirm the title is uninstalled. Quit Steam.
2. Install via GameLib's native install path (or the bottle path if the title is Windows-only —
   record which path was used).
3. Inspect the written `.acf` with `inspect-acf.mjs` before starting Steam — confirm `StateFlags
   "4"` with the same consistent field set as Gate 1.
4. Start Steam (or the bottled Windows Steam, if bottle path). Confirm NO verify/re-download (same
   observation as Gate 1).
5. Launch the title via `steam://` (through GameLib or directly). Confirm it launches successfully
   — the DRM layer does NOT reject the GameLib-downloaded-then-Steam-adopted file set (no DRM
   error dialog, no "corrupted install" message, no forced re-verify triggered by the DRM
   handshake itself).

**Expected result:** Adoption succeeds identically to Gate 1 (`StateFlags=4`, no verify/re-download),
and the title launches with DRM intact — no re-validation, no DRM-triggered repair/re-download.

**Result:** PENDING
**Title/AppID used:** _(record here)_
**DRM type confirmed:** _(Denuvo / VMProtect / other — cite source, e.g. pcgamingwiki)_
**Install path used:** _(native macOS / CrossOver bottle)_
**`.acf` field dump:** _(paste inspect-acf.mjs output or snapshot path)_
**Verify/re-download observed?** _(yes/no)_
**Launch confirmed with DRM intact?** _(yes/no — describe any DRM-related dialog/error if it occurred)_

---

## Gate 3 — INTERRUPT-RESUME: killed mid-download, resumed, reconciles to Steam-trusted StateFlags=4

Source: 23-04-PLAN.md Task 2 (D-07.3), scoped by D-04. Closes: the resume/interrupted-download
ownership open item from spike-003's Results section, and validates 23-03's `reconcilePartialState` +
startup-resume wiring (`buildResumeFinalizeOpts`) on real hardware for the first time.

**Preconditions:**
- `enableSteamNativeInstall` opt-in ON.
- A real game owned on the account, large enough that a mid-download kill is practical to time (a
  multi-GB title — WazHack is likely too small to interrupt reliably; prefer a mid-size title
  distinct from Gates 1-2 to avoid state contamination, or reuse Gate 1's title on a fresh
  uninstall).
- Confirm the title is NOT currently installed. Quit Steam before starting (isolates the resume
  test from any live Steam file-locking interference).

**Steps:**
1. Start installing the title via GameLib's native path.
2. Partway through the download (after at least one depot has some but not all files/chunks on
   disk — check the install directory to confirm partial state), **kill GameLib** (force-quit the
   app, not a graceful Cancel) to simulate an interrupted-download crash, distinct from D-04's
   cancel path. Optionally also kill/ensure Steam is not running during this step.
3. Confirm on disk that the install directory contains a genuine partial state (some files
   present, others missing) — this is what makes the test meaningful.
4. Relaunch GameLib. Per 23-03's wiring, `SteamLibraryManager.init()`'s startup resume should
   detect the in-progress download (`scanDownloadingAppIds`), rebuild a real `DepotPlan`
   (`buildDepotPlan`), and reconcile it (`reconcilePartialState`) — confirm in the DownloadManager
   queue / logs that the download resumes (not a full restart-from-zero).
5. Let the resume complete. Confirm from logs/observation that files already correctly on disk
   were NOT re-downloaded (only the missing/incomplete files were fetched) — this is the
   `reconcilePartialState` sha1-skip behavior from 23-03; a full re-download here would be a
   regression, not just a missed optimization.
6. Inspect the written `.acf` with `inspect-acf.mjs`. Confirm the reconciled install earned a
   trustworthy `StateFlags "4"` (not stuck at `1026`) — per 23-03, this requires the resume path's
   `canWriteFullOwnership` gate inputs (`allFilesVerified`, `allModesApplied`, `buildid`,
   `outcome`) to all be satisfied. If any file failed to reconcile, the correct/expected behavior
   is a fail-closed `1026`, NOT a crash and NOT a false `4` — record which one actually happened.
7. Start Steam. Confirm no unexpected re-download/verify (same check as Gates 1-2, if `.acf`
   showed `4`) — or confirm Steam's own verify pass completes normally if the manifest fell back
   to `1026`.
8. Launch the title. Confirm it runs.
9. **Specifically watch for:** any silent Steam-in-CrossOver auto-open during this resume flow —
   the folded todo `steam-startup-download-resume-autoopens-crossover.md` (D-04) flags this as a
   known prior bug where a bottle-eligible game's startup resume silently launched Steam inside
   CrossOver without user action. Confirm this does NOT happen (no CrossOver/bottle window opens
   unprompted at any point in steps 4-8).

**Expected result:** Resume reconciles the partial download (no full re-download of already-correct
files), produces a Steam-trusted `StateFlags "4"` (or an honest, non-crashing `1026` fallback if
reconciliation genuinely could not prove completeness — record which), the game launches, and there is
**no silent Steam-in-CrossOver auto-open** at any point in the resume flow.

**Result:** PENDING
**Title/AppID used:** _(record here)_
**Partial-state confirmed before resume?** _(describe what was present/missing on disk)_
**Resume behavior observed:** _(re-downloaded everything / skipped already-correct files — describe)_
**`.acf` StateFlags after resume:** _(4, or 1026 fallback — record which, and if 1026, why)_
**`.acf` field dump:** _(paste inspect-acf.mjs output or snapshot path)_
**No full re-download confirmed?** _(yes/no)_
**No silent Steam-in-CrossOver auto-open observed?** _(yes/no — describe if it occurred)_
**Launch confirmed?** _(yes/no)_

---

## Summary Table (fill in after all gates are run)

| # | Gate | Requirement | Result | Notes |
|---|------|-------------|--------|-------|
| 1 | Multi-depot StateFlags=4 (no verify/re-download) | REQ-23-07 (D-07.1) | **ISSUE** | Hogwarts Legacy (990080): download % flip-flops 2%↔16% — two concurrent `progressUpdate` producers (emitProgress vs pollInstallOnce). Never reached completion. |
| 2 | Hard-DRM launch under StateFlags=4 | REQ-23-07 (D-07.2) | PENDING | Blocked behind Gate 1 (need a clean completing install first) |
| 3 | Interrupt-resume reconciled StateFlags=4 + launch + no re-download + no bottle auto-open | REQ-23-07 (D-07.3) + D-04 | PENDING | Blocked behind Gate 1 |

**Gate status:** NOT CLOSED. 1 ISSUE (Gate 1 — progress-display defect), 2 PENDING. Phase 23 cannot be
marked complete/verified until every gate is PASS. Gate 1's diagnosed defect routes to a fix plan via
`/gsd-plan-phase 23 --gaps`.

**Windows/Linux coverage:** Explicitly deferred, not dropped (per D-07 in `23-CONTEXT.md`). Not
tracked in this document — file a follow-up todo if/when that work is scheduled.

---
*Prepared: 2026-07-17 by Plan 23-04 (autonomous prep). Awaiting human execution on real macOS hardware.*
