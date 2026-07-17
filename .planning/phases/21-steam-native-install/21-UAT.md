---
phase: 21-steam-native-install
plan: 12
artifact: uat
status: partial
total_items: 11
pending_items: 9
passed_items: 2
failed_items: 0
blocked_items: 0
requirements: [SNI-01, SNI-04, SNI-08, SNI-06]
open_findings: [D-UAT-05 (code-fixed 4267eba0, pending HW re-verify), D-UAT-06 (code-fixed 5c65c200, pending HW re-verify), D-UAT-07 (code-fixed ab0500c6, pending HW re-verify)]
run_via: "/gsd:verify-work 21"
last_updated: 2026-07-17
---

# Phase 21 — Steam Native Install: Real-Machine UAT

**Plan:** 21-12 (Wave 8, final plan of Phase 21 — steam-native-install)
**Purpose:** Close the MUST-VALIDATE items flagged in `21-RESEARCH.md`'s Validation Architecture
(native `.acf` adoption, hard-DRM launch, streaming-to-disk at scale, real multi-depot game, bottled
Windows Steam adoption) plus the three real-machine flows deferred here from Plan 21-10 (D-10 guided
client install, D-11 prompt-to-launch, continue-to-download). None of these are automatable in CI —
each requires a real, authenticated Steam account and (for items 6-8) a real macOS + CrossOver bottle.

**Status: NOT YET RUN.** This document is the prepared test list + recording template. Every result
below is a placeholder until a human runs the corresponding flow on real hardware and reports back.

**Requirements closed by this gate:** SNI-01, SNI-04, SNI-08 (per 21-12-PLAN.md frontmatter), plus
SNI-06 (partial, carried from 21-10 — D-10/D-11/continue-to-download).

---

## How to read this document

Each item has:
- **Preconditions** — what must be true before starting (opt-in state, account state, game owned)
- **Steps** — the exact sequence to run
- **Expected result** — what "pass" looks like
- **Result** — `PENDING` until run; then `PASS` / `FAIL` / `DIVERGENCE` with evidence (titles, appIds,
  screenshots/logs referenced by path, memory numbers, etc.)

Divergences (especially bottle adoption, item 6) must be captured here, not silently marked pass —
per the plan's own `<verification>` clause, any divergence routes to a follow-up gap plan.

---

## Task 1 — Native adoption + hard-DRM launch + cancel-recovery (real Steam)

Source: 21-12-PLAN.md Task 1. Closes: native `.acf` adoption (D-15 native half), Open Question 3
(hard-DRM), D-04 cancel→1026→repair.

### 1a. Native adoption (StateFlags 1026→4)

**Preconditions:** `enableSteamNativeInstall` opt-in ON; real authenticated Steam account; a game
owned on the account, not yet installed.

**Steps:**
1. Install the game via GameLib. Watch the DownloadManager queue show real percent/speed/ETA (not a
   fake/static progress bar).
2. Let the download complete.
3. Restart or focus the real Steam client.
4. Observe Steam's verify pass.

**Expected result:** Steam flips the game's `appmanifest_{appId}.acf` `StateFlags` from `1026` to
`4` with (near) zero re-download (Steam's verify pass finds the files already correct on disk). The
game shows Installed in the real Steam client's own library UI.

**Result:** PASS (with UX divergence — see note)
**Title/AppID used:** WazHack
**Evidence:** GameLib wrote `StateFlags "1026"`, `installdir "WazHack"`, `BytesToDownload "0"`/`BytesDownloaded "0"`. Real progress bar observed during depot download. After a FULL Steam restart (Quit Steam → reopen), Steam adopted the manifest almost immediately and flipped `StateFlags 1026 → 4` with zero re-download (verify pass found files correct on disk). Tested 2026-07-16 on macOS.
**UX divergence (non-blocking):** After the depot download completed, GameLib showed a "Steam installing" spinner and did NOT progress or indicate that the user must FULLY RESTART the Steam client for it to notice + adopt the freshly-written `appmanifest_*.acf`. Focusing the Steam window was not sufficient — Steam only re-reads appmanifest files on startup. The install appeared stuck ("does not progress further") until a manual Steam quit+reopen. Adoption itself works correctly; the gap is purely that the UI gives no guidance at the handoff point. **Recommend:** a hint/banner at poll-time (e.g. "Restart Steam to finish installing") so the handoff isn't mistaken for a hang. Candidate for a follow-up gap/UX plan — does NOT block SNI-01/SNI-04 correctness.

### 1b. Launch after GameLib-owned install

**Steps:** Launch the game via GameLib (`steam://rungameid`).

**Expected result:** Game runs.

**Result:** PASS (on current fixed build) — earlier failure was a stale pre-fix build

> **✅ D-UAT-01 RESOLVED — root cause was the CR-01 directory bug (already fixed this session), NOT wrong-OS depot selection.**
> Initial misdiagnosis: a first install of WazHack on macOS produced a broken app that failed to launch
> with `failed to start process: os error 256` (same error from Steam), fixed by a Steam redownload — which
> looked like a wrong-OS depot download. Investigation disproved that: WazHack's depots are all correctly
> `oslist`-tagged (264161=windows, 264162=macos, 264163=linux), the macOS depot (264162) is 64-bit and runs,
> and it has 0 symlinks — so neither wrong-OS selection nor the symlink half of CR-01 applied.
>
> **Actual root cause:** the pre-fix **CR-01 directory bug**. WazHack's macOS build is a `.app` bundle
> (many directories: `Contents/`, `Contents/MacOS/`, `Contents/Resources/`, …). The OLD `downloadSingleFile`
> wrote directory manifest entries as empty regular files (size 0, no chunks fell into the empty-file fast
> path), corrupting the bundle structure → `os error 256` at launch. The first test ran on a GameLib build
> from BEFORE this session's gap-closure commit `897eb515`.
>
> **Resolution:** a clean install on the CURRENT build (with `897eb515`, which creates real directories via
> `mkdir(recursive)` before the empty-file fast path) installs WazHack correctly and it LAUNCHES. Confirmed
> on macOS 2026-07-16. This is real-hardware validation of the CR-01 directory fix (SNI-01) that the unit
> tests could only prove synthetically. No new defect; no follow-up gap plan required.
>
> **Lesson recorded:** test UAT only against a build that includes the fixes under test — a stale dev
> server silently reintroduced the pre-fix bug and produced a misleading "wrong-OS" symptom.

### 1c. Hard-DRM title (Open Question 3)

**Preconditions:** A CONFIRMED hard-DRM title owned on the account (e.g. Denuvo or VMProtect-wrapped
— pick a title you know uses one of these; check pcgamingwiki.com/DRM if unsure).

**Steps:** Repeat 1a-1b against this title specifically.

**Expected result:** Adoption succeeds identically to 1a, and the title launches without the DRM
layer rejecting the GameLib-downloaded-then-Steam-adopted file set.

**Result:** N/A on macOS-native (deferred to Task 3 / bottle)
**Reason:** No Mac-native Denuvo/hard-DRM title available in the user's library (installed set: Trine 2, HOARD, Dead Island, 7 Days to Die, WazHack, Pillars of Eternity, Wasteland 2/3, Naheulbeuk, Civ VII, Len's Island — none are known Denuvo). Hard-DRM titles are almost all Windows-only, which route to the bottle path on macOS, so native 1c is not testable here. Hard-DRM verification routed to Task 3 (bottle) if a Windows Denuvo title is available; otherwise Open Question 3 remains open. (Civ VII store page could be checked for Denuvo — if present, a Civ VII native install would also exercise this.)

### 1d. Cancel mid-download → 1026 → Steam repair (D-04)

**Steps:**
1. Start installing a game via GameLib.
2. Cancel the install partway through the download.
3. Confirm the `.acf` finalizes to `StateFlags 1026` (not left in a broken/missing state).
4. Launch the game (or focus Steam) and confirm Steam recognizes the incomplete install and repairs
   it (downloads the missing files itself) rather than erroring or requiring a manual "delete and
   reinstall."

**Expected result:** Cancel → honest 1026 manifest → Steam's own repair-on-launch path completes the
install without GameLib intervention.

**Result:** PENDING (unblocked — D-UAT-05 fixed in code, commit `4267eba0`; awaiting real-HW re-run on a fresh build)
**Title/AppID used:** _(record here)_

> **🔴 D-UAT-05 (BLOCKER, found 2026-07-16, real macOS) — interrupted Steam native installs wedge the DownloadManager queue across app restart; pause/stop/cancel buttons non-functional.**
>
> **Reported:** "last uat I was testing installing Civilization VII, and stopped part way through. When
> reopening the app that download is showing and can't pause, or stop (stop button and pause button do
> not work), so I can't install another game and cancel."
>
> **State captured:** persisted `download-manager.json` held TWO stuck steam installs —
> `1295660` Sid Meier's Civilization VII (20 GiB) + `1091500` Cyberpunk 2077 (70 GiB), `finished: []`.
>
> **Root-cause hypothesis (code-read, needs debug-session confirmation):** the DM queue persists to
> electron-store and `main.ts:572` calls `initQueue()` at app startup, which auto-resumes queue[0].
> Resuming a *steam native* install re-enters `installDepotDownload` → `ensureSteamClientReady` +
> `resolveSteamInstallTarget` (two `await`s) BEFORE `createAbortController(appId)` +
> `nativeInstallsInFlight.add(appId)` (games.ts:724-739). While wedged in that pre-download phase (or on
> a stalled steam-user CM re-auth after restart), `pauseCurrentDownload`/`cancelCurrentDownload` →
> `stopCurrentDownload` → `callAbortController(appName)` + `SteamGame.stop()` find nothing abortable
> (`nativeInstallsInFlight` not yet populated, or the current await ignores the signal) → buttons no-op,
> element never leaves the queue, every restart re-wedges. gog/legendary don't hit this because their
> resume path registers the abort controller synchronously at the top.
>
> **Candidate fixes (for the gap/debug cycle):** (a) register the AbortController +
> `nativeInstallsInFlight` FIRST in `installDepotDownload`, before the `ensureSteamClientReady`/
> `resolveSteamInstallTarget` awaits, and make those awaits abort-aware; (b) make
> `cancelCurrentDownload` able to remove a `currentElement === null` queue head (so a not-yet-running
> persisted item can still be cancelled after restart); (c) consider NOT auto-resuming steam native
> installs on startup (leave them paused, require an explicit user Resume) so a restart never silently
> re-wedges. Route to `/gsd-debug` or a Phase-21 gap plan.
>
> **Workaround used to unblock UAT:** quit GameLib → empty the `queue` array in
> `~/Library/Application Support/gamelib/store/download-manager.json` → relaunch.
>
> **✅ FIXED IN CODE (commit `4267eba0`, debug session `.planning/debug/steam-dm-queue-wedge.md`).**
> Root cause was THREE converging mechanisms (all confirmed by code trace, not just the original
> hypothesis): (1) `currentElement` stayed `null` from module load until `initQueue()` ran ~5s after
> startup, so pause/stop/cancel (all guarded on `if (currentElement)`) were complete no-ops in that
> window — including the `removeFromQueue()` that clears the persisted head; (2) the AbortController +
> `nativeInstallsInFlight` were registered only after two awaits in `installDepotDownload`, so `stop()`
> hit the no-op branch during that window; (3) `buildDepotPlan` never checked `opts.signal`, so a cancel
> during the (long, on a cold restart) PICS/manifest plan-build phase had no effect. Fix: seed
> `currentElement` from the persisted queue head at module load; register the AbortController before both
> seam awaits with `signal.aborted` checks; add `throwIfAborted(opts.signal)` between every PICS/manifest
> step and map plan-build aborts to `{status:'cancelled'}`. Backend suite 1224/1224 (7 new regression
> tests incl. a fix-revert guard); GOG/Epic/Amazon paths untouched. **Still needs real-HW re-verification**
> (dev UI could not be exercised by the debugger) — re-run the interrupt+cancel+restart flow on a fresh
> build before closing.

---

## Task 2 — Streaming-to-disk at 10GB+ scale + real multi-depot game

Source: 21-12-PLAN.md Task 2. Closes: MUST-VALIDATE streaming-to-disk (Assumption A1), MUST-VALIDATE
multi-depot (Assumption A2).

> **Findings observed during Task 2 (Civ VII native install, macOS 2026-07-16):**
>
> - **D-UAT-02 (SNI-03 UX) — FIXED (commit `6640e8ce`).** The DownloadManager showed ETA as raw seconds
>   ("1247s") and the download speed was wrong/absent: `depot.ts` emitted `eta` as `` `${sec}s` `` and
>   `downSpeed` as raw **bytes/sec** while the UI (`ProgressHeader:92`) labels it "MB/s" and gog/legendary
>   emit MiB/s. Fixed: `eta` now zero-padded `HH:MM:SS` (new `formatEta`), `downSpeed` now MiB/s. Test added.
> - **D-UAT-03 (SNI-01/SNI-03 perf) — ROOT-CAUSED (spike 2026-07-16), fix pending.** Native install is
>   **VERY slow**. Micro-benchmark (scratchpad/lzma-bench.mjs, 10-core machine) confirms: the pure-JS `lzma`
>   v2.3.2 decompressor (`depot/decompress.ts` VZ path) runs at **~5 MB/s single-threaded**, vs native zlib
>   ~800 MB/s. It executes on the Electron **main thread**, so it both caps throughput AND blocks the event
>   loop — the 32-way network concurrency (FILE_CONCURRENCY=8 × CHUNK_CONCURRENCY=4) is wasted because every
>   chunk's decompress serializes onto one core. Projection for a 15 GB all-LZMA game: **~51 min of pure
>   decompression** single-threaded → **~5 min** with a worker pool.
>   **Fix (chosen):** `worker_threads` decompression pool (size ≈ cores, cap ~8), transferable ArrayBuffers,
>   keeps pure-JS codec (respects the no-native-modules constraint; `lzma-native` rejected). ~10× speedup +
>   main thread freed. Implementation in progress.
> - **D-UAT-04 (minor UX) — OPEN.** The install button label reads "steam installing" (awkward status text);
>   and per Task 1a there's no "restart Steam to finish" hint. Batch into the UX gap plan. Also: `buildDepotPlan`
>   still logs nothing about depot selection — add selection logging for observability.

### 2a. Large-game (10GB+) streaming — memory bound (A1)

**Preconditions:** Opt-in ON; a real game owned on the account that is 10GB+ installed size.

**Steps:**
1. Start installing the large game via GameLib.
2. While it downloads, monitor GameLib's main-process memory (Activity Monitor on macOS / Task
   Manager on Windows / `ps`/`top` on Linux — track the Electron main-process PID's RSS).
3. Sample RSS periodically (e.g. every 30-60s) through the whole download.

**Expected result:** RSS stays bounded — it does NOT grow proportionally with the largest file size
or the total install size (i.e. it does not look like the whole file/depot is being buffered in
memory). RSS should plateau around `O(concurrency × chunk size)` per Pattern 2 in RESEARCH.md, not
climb linearly with bytes downloaded.

**Result:** PENDING
**Title/AppID used:** _(record here)_
**Total install size:** _(record here)_
**Memory profile:** _(record RSS samples or a summary: min/max/plateau value)_

### 2b. Byte-correctness spot-check

**Steps:** After 2a completes, pick 2-3 of the largest downloaded files. Compute SHA1 and compare
against a known-good reference (e.g. a Steam-downloaded copy of the same file, or Steam's own
post-verify pass reporting no corrections needed).

**Expected result:** Byte-identical (SHA1 matches, or Steam's verify pass reports zero corrections).

**Result:** PENDING
**Files checked:** _(record filenames + SHA1 comparison result)_

### 2c. Real multi-depot game (A2)

**Preconditions:** A real multi-depot game owned on the account (e.g. Wasteland 3, Dead Island, or
any title known to ship base game + separate language/DLC depots).

**Steps:**
1. Install via GameLib. Confirm the DownloadManager queue's total reflects the SUMMED size across all
   depots (D-03), not just one depot.
2. Confirm all depots actually download (check the install directory / logs for each depot's files).
3. After completion, confirm Steam adopts + verifies with no forced full re-download and no
   cross-depot file collision corrupting the install (e.g. two depots both trying to write the same
   relative path in a way that clobbers correct content).

**Expected result:** Correct summed total shown during download; all depots present on disk; Steam
adopts cleanly; no collision corruption.

**Result:** PENDING
**Title/AppID used:** _(record here)_
**Depot count / per-depot sizes:** _(record here)_

---

## Task 3 — Bottled Steam adoption on macOS (D-15 bottle half)

Source: 21-12-PLAN.md Task 3. Closes: MUST-VALIDATE bottle adoption (Assumption A3) — RESEARCH's own
"D-15 (bottle manifest adoption)" row, flagged as inference not yet tested.

**Preconditions:** macOS machine with a provisioned CrossOver bottle (Phase 17's guided setup already
run, `isBottleReady()` true); opt-in ON; a bottle-eligible (Windows-only, no native Mac build) Steam
game owned on the account.

**Steps:**
1. Install the bottle-eligible game via GameLib. Confirm the WINDOWS depot (not macOS) downloads
   directly into the bottle's own `steamapps/` (via `getBottleSteamappsDir()`), and the queue shows
   real progress — NOT routed through Wine dispatch (`tellBottledSteamToInstall`) for the download
   itself.
2. Launch or focus the bottled Windows Steam client (inside CrossOver). Confirm it runs its own
   verify pass and adopts the GameLib-written `1026` manifest, flipping `StateFlags` to `4` — the
   same behavior as native (re-run of spike 001's procedure, this time against the bottle).
3. Launch the game through the bottle. Confirm it runs.

**Expected result:** Bottled Windows Steam adopts the manifest identically to native Steam (1026→4,
no meaningful re-download) and the game launches through the bottle.

**If bottled Steam does NOT adopt identically:** Do not silently mark this passed. Capture the exact
divergence (what Steam did instead — e.g. refused to recognize the manifest, required a full
re-download, or crashed) below. This routes to a follow-up gap plan per the phase plan's own
`<verification>` clause — it is the one D-15 risk RESEARCH flagged as inference, not tested.

**Result:** PENDING
**Title/AppID used:** _(record here)_
**Bottle name:** _(record here)_
**Divergence (if any):** _(describe exactly what happened, with evidence — logs, screenshots, .acf contents before/after)_

---

## Task 4 — Deferred from Plan 21-10: guided client install, prompt-to-launch, continue-to-download

Source: 21-10-SUMMARY.md "Deferred Verification" section — Task 3 of Plan 21-10 was code-complete but
explicitly deferred to this UAT session by the orchestrator, so all Phase 21 real-machine validation
happens together at end-of-phase. These three flows are NOT covered by any of Task 1-3 above (which
all assume Steam is already installed and ready) — they test the D-10/D-11 client-setup gate that
runs BEFORE a native depot install can even start.

### 4a. D-10 guided native Steam-client install

**Preconditions:** Opt-in ON; a machine (or a clean user account / VM) where the Steam client is NOT
installed at all.

**Steps:**
1. With Steam NOT installed, start a Steam native install via GameLib for any owned game.
2. Confirm a consent dialog appears BEFORE anything is downloaded/run (the D-10 consent gate).
3. On consent, confirm the OFFICIAL Steam installer runs NON-SILENTLY:
   - **Windows:** `SteamSetup.exe` launches and its own installer window is visible (no `/S` or
     silent-install flag — you should see Valve's real installer UI).
   - **macOS:** the official `steam.dmg` downloads and mounts, and Finder shows the drag-to-
     Applications view (no silent unattended install).
   - **Linux:** the official Steam download page opens in the default browser (link-out, no
     automated install attempted).

**Expected result:** Consent dialog → real, visible, non-silent official installer/download-page
per-OS as described. GameLib does not attempt any silent/unattended install.

**Result:** PENDING
**OS tested:** _(record here — ideally run on more than one OS if available)_
**Evidence:** _(installer window seen / download page opened, screenshot path if any)_

### 4b. D-11 prompt-to-launch

**Preconditions:** Opt-in ON; Steam client IS installed, but has never been launched (so
`steamapps/libraryfolders.vdf` does not yet exist in the default Steam path).

**Steps:**
1. Confirm (before starting) that `libraryfolders.vdf` is genuinely absent — check the default Steam
   path's `steamapps/` directory directly.
2. Start a Steam native install via GameLib for any owned game.
3. Confirm a "launch Steam once" banner appears (not the D-10 consent dialog — this is the
   needs-launch branch, distinct from needs-install).
4. Confirm GameLib does NOT create/write `libraryfolders.vdf` itself at any point during this flow
   (re-check the `steamapps/` directory — the file should still be absent, or only appear once YOU
   manually launch Steam, never before).

**Expected result:** "Launch Steam once" banner shown; GameLib never authors `libraryfolders.vdf`
(T-21-21 — this is a trust-boundary mitigation, not just a UX nicety).

**Result:** PENDING
**Evidence:** _(banner text/screenshot; confirmation libraryfolders.vdf was not written by GameLib)_

### 4c. Continue-to-download (auto-retry once Steam is ready)

**Preconditions:** Continuing directly from 4b (or a fresh equivalent setup) — Steam client installed
but not yet launched, GameLib install attempt already showing the "launch Steam once" banner.

**Steps:**
1. Manually launch Steam once (satisfying the banner's ask) and let it fully start up (so
   `libraryfolders.vdf` now exists).
2. Without manually restarting the GameLib install, confirm GameLib's background recheck-poll
   detects readiness and AUTOMATICALLY retries the install — the depot download should begin without
   the user needing to click "Install" again.

**Expected result:** Once Steam is ready (client installed + `libraryfolders.vdf` exists), the
pending install auto-continues to the depot download with no extra user action beyond having
launched Steam.

**Result:** PENDING
**Evidence:** _(time from Steam launch to auto-retry observed, or confirmation it required a manual re-click — note as a deviation if so)_

---

## New findings during 1d attempt (2026-07-17)

> **🟠 D-UAT-06 (MAJOR, 2026-07-17) — a Windows-only / non-native-installable title (Cyberpunk 2077,
> appId 1091500) silently "installing → cancelled" on macOS with no explanation.**
>
> **Reported:** clicking Install on Cyberpunk 2077 says "installing" but never shows a %, then the
> DownloadManager shows "cancelled" under it. Pressing X removes it; retrying gives the same result.
>
> **ROOT CAUSE (confirmed via dev-terminal log 2026-07-17 — original Windows-only hypothesis was WRONG):**
> Cyberpunk 2077 DOES have macOS depots; selection worked correctly (os=macos arch=64 english → 3 depots:
> `1460472` ~65 GB, `2224089` ~24 GB, `2060314` ~193 MB, ~90 GB total; `selectAllDepots union … -> 3 depot(s)`).
> The install fails ~3 s later, DURING plan-build (before any chunk streaming), with:
> `SteamGame: depot install failed for appId 1091500: Steam servers dropped the connection. Retry to continue.`
> → `[DownloadManager]: Installation of 1091500 failed with: Steam servers dropped the connection.`
> Two distinct defects:
> 1. **No retry on a CM connection drop during the manifest/PICS phase.** `buildDepotPlan` fetches
>    `getRawManifest` + decryption keys per depot over the `steam-user` CM connection; for a big
>    multi-depot game that phase is long and the CM drops the connection ("repeat for same results" =
>    repeatable, not a one-off blip). The phase's locked "retry across content servers" logic only covers
>    the CHUNK-download phase (`downloadDepotFiles`), NOT manifest/PICS fetching. Needs: retry/reconnect
>    (ensureConnected + backoff) around the manifest-fetch steps, or a bounded whole-plan-build retry.
> 2. **Surfacing bug.** Backend classifies this as `error` with a "Retry to continue" message, but the UI
>    showed the user "cancelled" and only an X (remove) — no visible Retry affordance for a steam native
>    install error. Confirm the generic error+Retry surface actually renders for `runner==='steam'`
>    installs (games.ts claims D-06/D-07 reuse it) and isn't mislabeled as cancelled.
> **NOT a routing bug and NOT a stale-abort regression** (`createAbortController` overwrites with a fresh
> controller each attempt — verified). **Routed to debug session** `.planning/debug/steam-cm-drop-planbuild.md`.
> **Note:** also observed a double depot-selection log line per app (`-> depots [..]` immediately followed
> by `-> depots []`) — likely benign DLC-app enumeration, but worth a glance during the fix.
>
> **✅ FIXED IN CODE (commit `5c65c200`, debug session resolved).** Two independent root causes:
> (1) **backend** — `buildDepotPlan` called `ensureConnected()` once up front then ran the whole
> PICS/manifest + per-depot `getDepotDecryptionKey`/`getRawManifest` loop unguarded; a mid-loop CM drop
> (steam-user nulls `client.steamID` on drop) hard-failed before any chunk streamed, so the chunk-phase
> retry never applied. Fix: bounded, **abort-interruptible** `withPlanBuildRetry` (3 attempts, 500 ms
> backoff) around every plan-build network step, re-resolving the steam client after each reconnect —
> without weakening D-UAT-05 abort semantics. (2) **frontend (pre-existing, ALL runners)** —
> `DownloadManagerItem` collapsed `status==='error'` into `canceled`, rendering genuine errors as
> "(Canceled)" with only an X and NO Retry anywhere (games.ts's claim of an "existing error+Retry surface"
> was false). Fix: pure `classifyDMItemStatus` marks `error` as a distinct failed state ("(Failed)") with a
> working **Retry** that re-enqueues. Full jest 1364/1364 (6 new depot cases + 9 new status cases); tsc
> clean; no GOG/Epic/Amazon regression. **Needs real-HW re-verification** — retry Cyberpunk on a fresh
> build; confirm it rides through the CM drop, or at least shows "(Failed)" + a working Retry (not
> "cancelled").
>
> **🟠 D-UAT-07 (MAJOR/UX, 2026-07-17) — GamePage detail action button does not handle
> steam-waiting-for-restart; shows a greyed, disabled "Installing" with no actionable path.**
>
> **Reported:** Civ VII shows the "Restart Steam to finish" hint on the Library tile (21-16 working
> there), but on the game DETAIL screen the primary action button is greyed out and reads "installing".
>
> **Root cause (code-localized):** 21-16 wired the `steam-waiting-for-restart` `statusContext` into the
> status LABELS only — `frontend/hooks/constants.ts` `getStatusLabel` (tile) and
> `GamePage/components/GameStatus.tsx`'s status TEXT (line 93-99 branch). It did NOT update the GamePage
> primary **action button**, which derives its disabled/greyed state and label purely from `is.installing`
> (true while the 1026 manifest waits for Steam). So the detail page treats the waiting state as an active
> install: button disabled, label "Installing", no way for the user to act. Fix scope: make the GamePage
> action button (and its disabled/label logic) aware of `statusContext === 'steam-waiting-for-restart'` —
> either surface a "Restart Steam" affordance or at least not present a stuck, greyed "Installing".
> Candidate for the same gap/debug cycle as D-UAT-05/06.
>
> **✅ FIXED IN CODE (commit `ab0500c6`).** `MainButton.tsx` now reads `statusContext` and shows
> "Restart Steam to finish" (Warning icon, no spinner) for `is.installing && runner==='steam' &&
> statusContext==='steam-waiting-for-restart'`, checked before the generic steam-installing branch.
> Button stays disabled (nothing for GamerLib to do — user restarts Steam) but no longer looks like an
> active download. +2 regression tests (MainButton.steamWaitingRestart.test.tsx); frontend suite 119/119,
> tsc clean. **Needs real-HW re-verification** on the Civ VII detail page after a fresh build.

## Summary Table (fill in after all items are run)

| # | Item | Requirement(s) | Result | Notes |
|---|------|-----------------|--------|-------|
| 1a | Native adoption (1026→4) | SNI-04 | PASS | WazHack; adoption 1026→4, zero re-download. UX gap: no "restart Steam" hint (follow-up). |
| 1b | Launch after GameLib install | SNI-04/SNI-01 | PASS | WazHack launches on current fixed build. Earlier fail = stale pre-897eb515 build hitting CR-01 directory bug (D-UAT-01, now resolved — real-HW validation of the CR-01 fix). |
| 1c | Hard-DRM title launch | SNI-04 (Open Question 3) | PENDING | |
| 1d | Cancel → 1026 → Steam repair | SNI-04 (D-04) | PENDING | Unblocked — D-UAT-05 fixed in code (commit 4267eba0); re-run on a fresh build. Also re-verifies D-UAT-05 itself (interrupt+cancel+restart). |
| 2a | 10GB+ streaming memory bound | SNI-01 (A1) | PENDING | |
| 2b | Byte-correctness spot-check | SNI-01 | PENDING | |
| 2c | Real multi-depot game | SNI-01 (A2) | PENDING | |
| 3 | Bottled Steam adoption | SNI-08 (A3) | PENDING | |
| 4a | D-10 guided client install | SNI-06 (partial) | PENDING | |
| 4b | D-11 prompt-to-launch | SNI-06 (partial) | PENDING | |
| 4c | Continue-to-download | SNI-06 (partial) | PENDING | |

**Gate status:** NOT CLOSED. 2 PASS (1a, 1b), 1 N/A-native (1c), 8 PENDING. Phase 21 cannot be marked
complete/verified until every row above is PASS (or has a captured divergence routed to a follow-up gap
plan). **D-UAT-05** (DM-queue wedge on restart + non-functional pause/stop for interrupted native
installs) is **fixed in code** (commit `4267eba0`) but needs real-HW re-verification — re-running 1d on a
fresh build exercises it. The Task 2/3 install-heavy tests can now be run reliably (interrupt/cancel works).

---
*Prepared: 2026-07-16 by Plan 21-12 (autonomous prep). Awaiting human execution on real hardware.*
