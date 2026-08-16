---
phase: 23-steam-full-ownership-install-stateflags-4
plan: 05
artifact: uat
status: testing
total_items: 3
pending_items: 1
passed_items: 2
failed_items: 0
blocked_items: 0
open_gaps: [G-23-01, G-23-02]
notes: "Gate 2 PASS is CONDITIONAL — Denuvo launch proven but required a manual +x workaround (blocker gap G-23-02, native install applies no execute bits). Phase NOT closable until G-23-02 fixed + Gate 2 re-run clean, and Gate 3 run."
requirements: [REQ-23-07]
run_via: "/gsd:verify-work 23"
last_updated: 2026-07-21
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

**Result:** ✅ **PASS** — real macOS hardware, 2026-07-19 (user-confirmed). Gate 1 steps 4–6 ran to
completion: the written `appmanifest.acf` showed `StateFlags "4"`, Steam adopted the multi-depot install
with **no verify pass and no re-download across any depot**, and the title launched. Steps 1–3 (single
monotonic progress through a pause/resume cycle, no flicker) were hardware-confirmed earlier the same
day. The prior run's ~2.5h multi-depot download-time blocker cleared with the Phase 25 host fan-out fix
now on this branch, letting the download finish so 4–6 could be observed. Gate 1 CLOSED.

**⚠ Gate 1's LAUNCH HALF REOPENED 2026-08-16 — trustworthiness verdict: MASKED** (23-07 Task 2, see
`23-TRACE.md` §"Gate 1 trustworthiness assessment"). Cyberpunk 2077's own manifest was censused and
carries **no executable flags** (`stage=plan-build appId=1091500 depots=3 flagBearing=32
executableFlagged=0 distinctFlagValues=[64]`), so a GameLib `StateFlags=4` install of it would land
zero executable files — exactly as HUMANKIND's did. The launch recorded here therefore **cannot** be
explained by execute bits GameLib applied, and does not demonstrate that the native install path
produces a launchable game. The adoption half of this gate (StateFlags=4 accepted, no verify pass, no
re-download) is **unaffected and still stands**. The launch half must be re-confirmed by 23-10 against
a freshly GameLib-installed title with the Steam client verified not running. The operator could not
recall whether the 2026-07-19 launch was started from GameLib or the Steam client (honest UNKNOWN),
and it is no longer reconstructable — Cyberpunk retains no Mach-O binary on disk.

_Historical (fix landing, superseded by the PASS above):_ Plan 23-05 closed the diagnosed root
cause: `installDepotDownload` now has a single-flight guard (join a LIVE entry instead of starting
a second `downloadSteamDepots`), fail-safe registry cleanup on every exit path (success/error/
cancel/throw), pause/resume abort-before-restart (no stacking of concurrent runs), and startup-
resume reconciliation that skips any appId already owned by a live in-process install (a stale
`StateFlags=1026` manifest can no longer spawn a phantom concurrent install). Commits: `cc77a9df`
(RED, single-flight), `ddde970d` (GREEN, single-flight), `7fccfb2a` (RED, pause/resume +
reconciliation), `f963de8b` (GREEN, pause/resume + reconciliation). Full steam backend suite
568/568, `tsc --noEmit` 0 errors, grep gates confirmed (`nativeInstallsInFlight` read on entry in
games.ts; `isNativeInstallInFlight` read at the resume consumption site in library.ts). **This is
NOT a hardware PASS** — the fix has only been proven by automated regression tests against mocked
`downloadSteamDepots`/`ensureSteamClientReady`/`resolveSteamInstallTarget` seams. The real
multi-depot hardware re-run (Hogwarts Legacy 990080 or Cyberpunk 2077 1091500, precondition:
delete the stale `appmanifest_990080.acf`) with a single monotonic progress percent through a
pause/resume cycle, completing to `StateFlags=4` with no verify/re-download and a successful
launch, remains an **outstanding human step** — same pattern as the steam-startup-resume-crash
hardware verification. Do not treat this row as closed until that human run is recorded below.
**Title/AppID used:** Hogwarts Legacy (appId 990080) — multi-depot (original defect); hardware
re-run not yet performed
**Depot count / per-depot sizes:** _(pending hardware re-run)_
**`.acf` field dump (pre-Steam-launch):** _(pending hardware re-run)_
**`.acf` field dump (post-Steam-launch):** _(pending hardware re-run)_
**Verify/re-download observed?** _(pending hardware re-run)_
**Launch confirmed?** _(pending download completion)_

**Reported behavior (2026-07-19) — REGRESSION FIX CONFIRMED ON HARDWARE (steps 1–3):** Human ran
Gate 1 on real macOS hardware after deleting the stale `appmanifest_990080.acf`. Steps 1–3 (install
via native path + pause/resume cycle) observed a **single, monotonic download percent with NO
flicker between two climbing values** — the 2%↔16% / 6%↔27% flip-flop from the 2026-07-18 run is
GONE. This confirms Plan 23-05's single-flight guard (`installDepotDownload` now joins/rejects a
second concurrent entry instead of spawning a racing `downloadDepotFiles`) holds on real hardware,
not just against mocked seams. Steps 4–6 (`.acf` StateFlags=4 inspection, no-verify/no-re-download
on Steam start, launch) remain PENDING the multi-depot download's completion (~2.5h at the current
single-host throughput — the known Phase 25 fan-out cap, NOT a Gate 1 defect). Gate 1 does NOT close
until steps 4–6 are recorded. WazHack cannot substitute here (single-depot; cannot prove the
multi-depot `InstalledDepots` set or absence of a partial-depot verify).

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

**Result:** IN PROGRESS — attempt 1 (Kingdom Come: Deliverance II) DIVERGED before adoption;
retrying with HUMANKIND (see below).

**Attempt 1 — Kingdom Come: Deliverance II (appId 1771300), Denuvo, native depot path (2026-07-21):**
DIVERGENCE — install failed during plan-build, before any `.acf` was written, so the hard-DRM
*launch* hypothesis was never reached. GameLib resolved keys/manifests for depots 1771302 (~199MB)
and 1771303 (~82GB main content) successfully, then Steam's CM returned **EResult 40 (`Blocked` —
region/content blocked)** on the decryption-key request for depot **1771304 (~735MB)**. GameLib
classifies EResult 40 as non-retryable (`depotErrors.ts:52` `NON_RETRYABLE_ERESULTS`), so it failed
fast (~256ms, no retries) and aborted the WHOLE install with user-facing copy "This game's content
isn't available to download right now."

Log evidence (`~/Library/Logs/GameLib/gamelib.log`, 22:01:29):
`Installation of 1771300 failed with: ... (couldn't get decryption key for depot 1771304 (app 1771300): Blocked)`

Notes:
- Depot 1771304 was selected because it appears in an owned package's `depotids`
  (`select.ts:174` ownership gate). This is NOT an owner-appId (D-UAT-08) bug — 1771304 is a
  base-app depot and the key was correctly requested under appId 1771300.
- Root observation: **owning a depot (package `depotids`) ≠ Steam issuing its decryption key** —
  for region/DRM-gated depots Steam re-checks at key-request time and can return `Blocked`.
- Open question (does NOT block the Gate 2 retry): is depot 1771304 *required*, or an
  optional/region-alternate depot the official client would skip? If the official Steam client
  installs KCD2 fully on this account without 1771304 → GameLib's "fail the whole install on one
  blocked owned depot" is a defect (should skip-and-warn on a non-essential blocked depot). Captured
  as gap `G-23-01` below. This is title/region-specific, so a different hard-DRM title still gives a
  valid Gate 2 result.

**Attempt 2 — HUMANKIND (appId 1124300), Denuvo, NATIVE depot path (2026-07-21):**
**Result:** PASS (DRM hypothesis) — CONDITIONAL on G-23-02 fix. StateFlags=4 adoption + Denuvo launch
both confirmed; the launch required a manual +x workaround (G-23-02), so this is not yet a clean
end-to-end native-install pass. Re-run WITHOUT the manual chmod once G-23-02 is fixed.
**Title/AppID used:** HUMANKIND (1124300)
**DRM type confirmed:** Denuvo Anti-tamper (Sega/Amplitude; Gamepressure + PCGamingWiki "big list of third-party DRM on Steam")
**Install path used:** NATIVE macOS depot path (HUMANKIND ships a native Apple-Silicon `.app` — NOT bottle; corrects the earlier Windows-only assumption)
**Steps 1–4:** PASS — installed to `~/Library/Application Support/Steam/steamapps/common/Humankind`,
`appmanifest_1124300.acf` written, `StateFlags 4`, no verify/re-download observed.
**Launch:** FAIL — GameLib reported "Failed to start process for this game: OS error 256". Root cause
confirmed on disk: **0 of 18,809 installed files carry the execute bit.** The main binary
`Humankind.app/Contents/MacOS/Humankind` and the nested helper
`Contents/Frameworks/ZFGameBrowser.app/Contents/MacOS/ZFGameBrowser` both landed `-rw-r--r--`.
GameLib's own code documents this exact symptom (`depot.ts:71,1188`): a missing +x fails macOS launch
with `os error 256`. The StateFlags=4 native path is supposed to apply the manifest's EDepotFileFlag
modes (`applyEDepotFileModes`, chmod 0o755 when `flags & (EXECUTABLE_FLAG|CUSTOM_EXECUTABLE_FLAG)`,
depot.ts:1195/1222) but applied NOTHING here → gap G-23-02.
**Workaround applied (2026-07-21):** manually `chmod +x` the two real executables above to unblock the
launch step and reach the DRM test. This does NOT fix the underlying defect (the install itself still
produces non-executable binaries).
**Verify/re-download observed?** No (steps 1–4).
**Launch confirmed with DRM intact?** YES (2026-07-21, after manual chmod +x workaround) — HUMANKIND
launched past "os error 256", **Denuvo accepted the GameLib-installed / Steam-adopted (StateFlags=4)
file set with no re-validation, no DRM error dialog, and reached the main menu.** This proves D-07.2's
hard-DRM hypothesis: a Denuvo title trusts a GameLib-authored StateFlags=4 install. Caveat: the launch
was only reachable after manually setting +x (G-23-02) — the native install itself is not yet
end-to-end launchable without that fix.

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
| 1 | Multi-depot StateFlags=4 (no verify/re-download) | REQ-23-07 (D-07.1) | ⚠️ **PARTIAL — adoption PASS (HW), launch half REOPENED** | Adoption hardware-confirmed 2026-07-19 and still stands: `StateFlags=4`, Steam adopted the multi-depot install with no verify/re-download. Plan 23-05 fix (single-flight guard + pause/resume abort + reconciliation) held; Phase 25 fan-out cleared the download-time blocker so steps 4–6 could complete. **Launch half downgraded 2026-08-16 by 23-07 Task 2 — verdict MASKED:** Cyberpunk's manifest carries `executableFlagged=0`, so that launch cannot have run on GameLib-applied execute bits. Re-confirm in 23-10 against a fresh GameLib install with Steam verified not running. |
| 2 | Hard-DRM launch under StateFlags=4 | REQ-23-07 (D-07.2) | ✅ PASS (HW, conditional) | HUMANKIND (1124300, Denuvo) installed to StateFlags=4, no verify/re-download, **Denuvo launched to main menu** — DRM hypothesis proven. Conditional: launch needed a manual +x workaround (blocker gap G-23-02, native install applies no execute bits). Attempt 1 (KCD2) diverged on a `Blocked` depot key (gap G-23-01). Re-run clean after G-23-02 fix. |
| 3 | Interrupt-resume reconciled StateFlags=4 + launch + no re-download + no bottle auto-open | REQ-23-07 (D-07.3) + D-04 | PENDING | Gate 1's hardware re-run now PASS; ready to run |

## Gaps

```yaml
- id: G-23-01
  truth: "A native depot install completes when the user owns the game, even if one owned depot's decryption key is Blocked (region/DRM-gated)"
  status: open
  reason: "KCD2 (appId 1771300) install aborted entirely because Steam returned EResult 40 (Blocked) for depot 1771304's decryption key. GameLib selected 1771304 via the package-ownership gate (select.ts:174), but owning a depot != Steam granting its key. classifyDepotError treats EResult 40 as non-retryable and fails the WHOLE install (depotErrors.ts:52), rather than skipping a non-essential blocked depot and continuing."
  severity: unknown  # major IF 1771304 is optional/region-alternate (official client skips it); not-a-bug IF 1771304 is required and genuinely region-blocked for this account
  surfaced_by: gate-2 (attempt 1, KCD2)
  decisive_diagnostic: "Install KCD2 in the official Steam client on this account/region; observe whether depot 1771304 downloads. Blocked there too => genuine region block (not a GameLib bug). Downloads fine => GameLib over-selection/hard-fail defect."
  observability_shipped_23_09: "23-09 shipped the diagnostic + observability half only (user-locked scope, no selection-policy change): classifyDepotError now gives EResult 40 (Blocked) a dedicated steam.download.error.depotBlocked message naming the specific blocked depot id and stating the game may still be installable directly through the Steam client, and wrapDepotKeyError now logs a warning at the failure site naming the depot id, owning appId, and EResult before the error propagates (previously this context was only visible once the whole install failed and got classified). No change to select.ts, NON_RETRYABLE_ERESULTS, or retry/abort behavior -- a Blocked key still fails the install exactly as before, only the message and the log improved. Whatever the 23-10 Task 3 diagnostic finds, this occurrence (and the next one) is now legible."
  artifacts:
    - "src/backend/storeManagers/steam/depot/select.ts:174 (ownership gate includes owned-but-key-blocked depot)"
    - "src/backend/storeManagers/steam/depotErrors.ts:52 (EResult 40 non-retryable -> whole-install abort)"
    - "~/Library/Logs/GameLib/gamelib.log 22:01:29 (couldn't get decryption key for depot 1771304 (app 1771300): Blocked)"
  missing:
    - "Decide policy: should a Blocked key on a non-essential owned depot skip-and-warn (continue install) rather than abort? Requires distinguishing required vs optional/region-alternate depots at selection time."
    - "The conditional required-vs-optional depot selection-policy follow-up is recorded in deferred-items.md ('Skip-and-warn policy for a Blocked key on a non-essential owned depot (G-23-01)'), explicitly GATED on 23-10 Task 3's diagnostic verdict -- do not start until that verdict is recorded."

- id: G-23-02
  truth: "A native macOS game installed via the StateFlags=4 full-ownership path is launchable (its Mach-O executables land with the execute bit)"
  status: open
  severity: blocker  # any native macOS (and likely Linux) game is unlaunchable via native install
  reason: "HUMANKIND (1124300) installed to StateFlags=4 cleanly (steps 1-4 pass) but 0 of 18,809 files carry +x. Main binary Humankind.app/Contents/MacOS/Humankind landed -rw-r--r--; macOS launch fails with 'os error 256'. The StateFlags=4 path (which skips Steam's own verify pass) is supposed to apply the manifest's EDepotFileFlag modes via applyEDepotFileModes (chmod 0o755 on EXECUTABLE_FLAG=32/CUSTOM_EXECUTABLE_FLAG=128) but applied nothing for this install."
  surfaced_by: gate-2 (attempt 2, HUMANKIND, native path)
  root_cause: "CONFIRMED 2026-08-16 by 23-07 live hardware trace (23-TRACE.md, verdict H2). HUMANKIND's Steam manifest carries NO executable flags at all: stage=plan-build reported depots=2 totalFiles=18949 flagBearing=140 executableFlagged=0 distinctFlagValues=[64] — the only EDepotFileFlag value present across both depots is 64 (Directory), and the 140 flag-bearing entries are exactly the 140 directory entries. GameLib applied precisely what the manifest specified, which was nothing executable. The writer is NOT defective: the WazHack (264160) control reproduced Steam's own mode layout byte-for-byte (171 files, 1 +x, same file, same modes), with a clean 1:1 executableFlagged=1 -> chmodAttempts=1 -> one -rwxr-xr-x file on disk. The real defect is architectural: EDepotFileFlag is not a sufficient source of executability on macOS. Steam's own HUMANKIND install carries 18,002 of 18,809 files +x (per-file, not blanket) despite the manifest supplying zero — the official client derives execute bits by some other means. Under StateFlags=4 no verify pass ever runs, so nothing supplies them."
  open_question: "ANSWERED 2026-08-16 by 23-07 Task 2 — verdict MASKED. Cyberpunk 2077's own manifest was censused (stage=plan-build appId=1091500 depots=3 totalFiles=133 flagBearing=32 executableFlagged=0 distinctFlagValues=[64]) and carries NO executable flags, the identical signature to HUMANKIND. A GameLib StateFlags=4 install of Cyberpunk would therefore land zero executable files, so Gate 1's recorded 2026-07-19 launch CANNOT have run on execute bits GameLib applied. Gate 1's launch half does not stand; its adoption half (StateFlags=4 accepted, no verify, no re-download) is unaffected. HONESTY LIMIT: this establishes what did NOT launch it, not what did — the specific mechanism (Steam UI Play vs a steam:// handoff starting Steam, which then re-applies modes) is UNOBSERVED and no longer observable here (Cyberpunk retains no Mach-O binary on disk, and the operator could not recall which was used — honest UNKNOWN, not reconstructed). 23-10 must re-confirm the launch half against a freshly GameLib-installed title with the Steam client verified not running, rather than reconstructing the 2026-07-19 event."
  artifacts:
    - "src/backend/storeManagers/steam/depot.ts:1195 (if (file.flags) guard -> applyEDepotFileModes) — NOT the defect: the guard is correct, but the manifest supplies no executable flags for it to act on (corrects this entry's original 2026-07-21 supposition that flags were 'empty for all files'; flags were present, just directory-only)"
    - "src/backend/storeManagers/steam/depot.ts:524-531 (flags: f.flags copied from steam-user content_manifest parser mappings) — EXONERATED, mapping populates flags correctly in both traced runs"
    - "src/backend/storeManagers/steam/depot.ts:71,1188 (code's own note: missing +x => macOS os error 256)"
    - "23-TRACE.md 'Live run 2' — verdict H2, both census lines verbatim"
    - "~/Library/Logs/GameLib/23-07-archive/humankind-pre-uninstall-baseline.txt — Steam's own reference layout, 18,002/18,809 +x, excluding .wem/.txt/.dll/.manifest"
    - "on-disk: ~/Library/Application Support/Steam/steamapps/common/Humankind (0/18809 files +x before manual chmod)"
  decisive_diagnostic: "RESOLVED — no further diagnosis needed. The stage=plan-build census (executableFlagged=0, distinctFlagValues=[64]) is decisive and reproducible: it is emitted at buildDepotPlan return BEFORE any bytes download, so it can be re-observed from a started-then-cancelled install without a full re-download."
  missing:
    - "Derive executability independently of EDepotFileFlag, by Mach-O magic-byte detection — never by path (23-08 Task 3's own grep gate requires grep -c 'Contents/MacOS' == 0). Must discriminate Mach-O SUBTYPE, not merely 'is Mach-O': Steam leaves Mach-O bundles non-executable (WazHack's unitypurchasing, HUMANKIND's freetype6) while marking executables and dylibs +x (freetype6.dylib beside it IS +x)."
    - "Fail closed per REQ-23-01: while executability cannot be established for a title, canWriteFullOwnership(...) must decline StateFlags=4 and fall back to Phase 21's 1026 verify-handoff so Steam's own verify pass supplies the bits. Run 2 wrote no .acf at all, so the gate's live behavior on this path is UNOBSERVED."
```

**Gate status:** NOT CLOSED. Revised 2026-08-16 after 23-07's hardware trace. **No gate now has a
clean unconditional PASS on its launch half.** Gate 1's *adoption* half is hardware-confirmed
(2026-07-19) and stands; its *launch* half was downgraded to MASKED by 23-07 Task 2 — Cyberpunk's
manifest carries `executableFlagged=0`, so that launch cannot have run on GameLib-applied execute
bits. Gate 2's Denuvo-launch hypothesis is proven, but only after a manual `+x` workaround. Both
launch results therefore trace to the same cause: blocker gap **G-23-02**, whose root cause is now
CONFIRMED (verdict H2, `23-TRACE.md`) — Steam manifests for native macOS titles generally carry **no**
executable flags at all (2 of the 3 titles censused carry none; the third carries exactly one), so a
writer that only replays `EDepotFileFlag` cannot produce a launchable install, and `StateFlags=4`
guarantees no verify pass will repair it. Gap **G-23-01** (KCD2 `Blocked` depot key aborts the whole
install) also open. Gate 3 (interrupt-resume) still to run — its launch step will hit G-23-02 too.
Phase 23 cannot be marked complete/verified until G-23-02 is FIXED (23-08), Gate 2 re-runs clean
without a manual chmod, Gate 1's launch half is re-confirmed on a fresh GameLib install with Steam
verified not running (23-10), and Gate 3 passes. Gaps route to `/gsd-debug` / `/gsd-plan-phase 23 --gaps`.

**Windows/Linux coverage:** Explicitly deferred, not dropped (per D-07 in `23-CONTEXT.md`). Not
tracked in this document — file a follow-up todo if/when that work is scheduled.

---
*Prepared: 2026-07-17 by Plan 23-04 (autonomous prep). Awaiting human execution on real macOS hardware.*
