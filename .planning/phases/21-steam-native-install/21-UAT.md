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

**Result:** PENDING
**Title/AppID used:** _(record here)_
**Evidence:** _(re-download bytes observed, before/after StateFlags read from the .acf, screenshot path if any)_

### 1b. Launch after GameLib-owned install

**Steps:** Launch the game via GameLib (`steam://rungameid`).

**Expected result:** Game runs.

**Result:** PENDING

### 1c. Hard-DRM title (Open Question 3)

**Preconditions:** A CONFIRMED hard-DRM title owned on the account (e.g. Denuvo or VMProtect-wrapped
— pick a title you know uses one of these; check pcgamingwiki.com/DRM if unsure).

**Steps:** Repeat 1a-1b against this title specifically.

**Expected result:** Adoption succeeds identically to 1a, and the title launches without the DRM
layer rejecting the GameLib-downloaded-then-Steam-adopted file set.

**Result:** PENDING
**Title/AppID used:** _(record here — must be a confirmed hard-DRM title, name the DRM)_
**Evidence:** _(launch succeeded / any DRM-specific error observed)_

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

**Result:** PENDING
**Title/AppID used:** _(record here)_

---

## Task 2 — Streaming-to-disk at 10GB+ scale + real multi-depot game

Source: 21-12-PLAN.md Task 2. Closes: MUST-VALIDATE streaming-to-disk (Assumption A1), MUST-VALIDATE
multi-depot (Assumption A2).

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

## Summary Table (fill in after all items are run)

| # | Item | Requirement(s) | Result | Notes |
|---|------|-----------------|--------|-------|
| 1a | Native adoption (1026→4) | SNI-04 | PENDING | |
| 1b | Launch after GameLib install | SNI-04 | PENDING | |
| 1c | Hard-DRM title launch | SNI-04 (Open Question 3) | PENDING | |
| 1d | Cancel → 1026 → Steam repair | SNI-04 (D-04) | PENDING | |
| 2a | 10GB+ streaming memory bound | SNI-01 (A1) | PENDING | |
| 2b | Byte-correctness spot-check | SNI-01 | PENDING | |
| 2c | Real multi-depot game | SNI-01 (A2) | PENDING | |
| 3 | Bottled Steam adoption | SNI-08 (A3) | PENDING | |
| 4a | D-10 guided client install | SNI-06 (partial) | PENDING | |
| 4b | D-11 prompt-to-launch | SNI-06 (partial) | PENDING | |
| 4c | Continue-to-download | SNI-06 (partial) | PENDING | |

**Gate status:** NOT CLOSED — all items PENDING. Phase 21 cannot be marked complete/verified until
every row above is PASS (or has a captured divergence routed to a follow-up gap plan).

---
*Prepared: 2026-07-16 by Plan 21-12 (autonomous prep). Awaiting human execution on real hardware.*
