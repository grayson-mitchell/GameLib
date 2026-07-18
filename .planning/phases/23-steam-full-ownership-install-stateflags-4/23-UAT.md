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

**Diagnosis (CONFIRMED via static analysis + on-disk evidence):**

Symptom refined by user: it is ONE `progress.percent` value rapidly alternating between two figures
(observed 2%↔16%, later 6%↔27%) — both figures CLIMB over time at different rates. The main-screen
download summary AND the progress bar both jump between the two.

Root cause: **two concurrent `downloadDepotFiles` runs for the same appId, with no single-flight
guard.** `SteamGame.installDepotDownload` (games.ts:735) does `nativeInstallsInFlight.add(appId)` but
NEVER checks it on entry — the set is only READ by `stop()` (games.ts:1102). So `install()` can be
entered twice for one appId and spawn two concurrent depot downloads. Each run's `emitProgress`
(depot.ts:1087) computes `percent = doneBytes/plan.totalBytes` against its OWN independent `doneBytes`,
and both emit `progressUpdate` for `{ appName: appId, runner: 'steam' }`. One run is ahead, one behind →
the single `progress.percent` slot flip-flops. A single `emitProgress` stream is monotonic (`doneBytes`
only grows), so the alternation PROVES two concurrent runs.

Ruled OUT as the second climbing source:
- `pollInstallOnce` (library.ts:1195): the stale bottle ACF (see below) has `BytesToDownload 0` /
  `BytesDownloaded 0`, so `readAcfState` returns all-zero byte totals → `denominator === 0` →
  pollInstallOnce SKIPS the percent emit. The leftover poller keeps the game in 'installing' status but
  does NOT emit a climbing percent.
- `buildResumeFinalizeOpts` startup-resume (library.ts:169): only reconciles + heals modes + finalizes
  — it never calls `downloadDepotFiles`, so it emits no climbing percent.

Precondition CONFIRMED on disk (answers the "stale ACF?" question — YES):
`~/Library/Application Support/CrossOver/Bottles/GameLibSteam/drive_c/Program Files (x86)/Steam/
steamapps/appmanifest_990080.acf` exists from a PRIOR attempt with `StateFlags "1026"` (Steam-verify
pending, bit 4 NOT set), `SizeOnDisk 73965345601` (~74GB), `BytesDownloaded 0`, `BytesToDownload 0`,
`InstalledDepots { 990081, 990082 }`. Because bit 4 is unset, `scanDownloadingAppIds()` classifies
990080 as resumable — the state that lets GameLib re-enter an install for it alongside the user's
manual install.

Secondary (cosmetic, NOT the flicker): "slow-then-fast, ~0.5s graph" cadence is the
`PROGRESS_THROTTLE` + `rollingRateMiBs` window from commit `22619287` warming up.

**Gaps (structured for /gsd-plan-phase 23 --gaps):**
```yaml
- truth: "A depot install runs exactly one download per appId with a single, monotonic progress percent"
  status: failed
  reason: "SteamGame.installDepotDownload (games.ts:735) adds appId to nativeInstallsInFlight but never rejects a second concurrent entry (the set is only read by stop() at 1102). Two concurrent downloadDepotFiles runs for one appId each emit progressUpdate with independent doneBytes/plan.totalBytes, so the single progress.percent flip-flops between two climbing figures (confirmed 2%<->16%, later 6%<->27%). Confirmed precondition: a stale StateFlags=1026 appmanifest_990080.acf in the CrossOver bottle marks 990080 resumable."
  severity: major
  test: gate-1-multi-depot
  artifacts:
    - "src/backend/storeManagers/steam/games.ts:735 (installDepotDownload: add without reject-guard)"
    - "src/backend/storeManagers/steam/games.ts:1102 (nativeInstallsInFlight only read by stop())"
    - "src/backend/storeManagers/steam/depot.ts:1087 (emitProgress percent = doneBytes/plan.totalBytes)"
    - "stale ACF: CrossOver/Bottles/GameLibSteam/.../steamapps/appmanifest_990080.acf StateFlags=1026"
  missing:
    - "Single-flight guard: installDepotDownload must reject/join a second concurrent install for an appId already in nativeInstallsInFlight (return the in-flight result or no-op, do NOT start a 2nd downloadDepotFiles)"
    - "Pause/resume must abort the prior run's AbortController before starting a new depot run (no stacking)"
    - "Stale StateFlags=1026 handling so a leftover partial manifest can't trigger a phantom concurrent install racing a user-initiated one"
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
