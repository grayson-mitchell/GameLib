---
phase: 23-steam-full-ownership-install-stateflags-4
plan: 05
artifact: uat
status: complete
total_items: 3
pending_items: 0
passed_items: 3
failed_items: 0
blocked_items: 0
open_gaps: [G-23-01]
notes: "ALL THREE GATES PASS on real hardware as of 2026-08-19 — REQ-23-07 is CLOSABLE. Gate 3 (interrupt-resume) executed for the first time 2026-08-19: HUMANKIND force-quit at 15,538/18,809 files with no .acf, user-initiated resume skipped 15,643 of 18,949 files (jobCount=3306, terminal percent=76% on a fully successful install), earned StateFlags=4 not a fail-closed 1026, applied 21 +x via healReconciledFileModes with zero manual chmod (measured 11:52, before Steam started 11:54:20), Steam adopted with 'Verifying file sizes only'/'Verification complete' in the same second and no re-download, reached main menu, no CrossOver auto-open. Two honesty limits recorded: the Gate 3 launch was Steam-UI-mediated (Gate 1 separately re-proved GameLib's own launch path the same day), and the first no-auto-open check was VACUOUS (pgrep for 'crossover' cannot see processes named services.exe/winedevice.exe) and was discarded and replaced with two proven-firing checks. G-23-01 stays OPEN by decision, not by oversight: its decisive diagnostic is ANSWERED (the official Windows Steam client installed KCD2 in full WITHOUT depot 1771304 and never requested its key), making it a confirmed over-selection + hard-fail defect at severity major, whose fix is explicitly out of 23-10's scope and routes to its own gap cycle. One new defect filed by Gate 3: a resumed install's progress can never reach 100%. PRIOR: Gates 1 and 2 both PASS as of 2026-08-19. Gate 2 re-ran CLEAN (attempt 3) — HUMANKIND installed to StateFlags=4, Steam adopted with no verify/re-download, game LAUNCHED with NO manual chmod; blocker gap G-23-02 RESOLVED, and it took THREE fixes, not one (23-08 + 260818-v81 reconcile-heal reach + 260819-b1q fat-binary probe). Gate 1's launch half — MASKED since 2026-08-16 because neither whose-execute-bits nor which-client was known — was re-confirmed the same day (23-10 Task 3): +x count held at 21/18,809 across a COLD Steam start with byte-identical file lists (Steam's own layout is 18,002/18,809, so Steam supplied zero bits), and GameLib logged the steam://rungameid handoff at 09:42:10, the same second steam_osx started. Phase still NOT closable: Gate 3 (interrupt-resume) has never been run and G-23-01's KCD2 diagnostic is unrun."
requirements: [REQ-23-07]
run_via: "/gsd:verify-work 23"
last_updated: 2026-08-19
---

# Phase 23 — Steam Full-Ownership Install (StateFlags=4): Real-Hardware UAT

**Plan:** 23-04 (final plan of Phase 23 — steam-full-ownership-install-stateflags-4)
**Purpose:** Close the D-07 pre-ship real-hardware validation gate (REQ-23-07). StateFlags=4 tells
Steam "do not verify" — the only way to prove Steam actually trusts a GameLib-authored `4` across the
real risk surface is real hardware. These three checks cannot be automated (they require a live Steam
client, real owned titles, and real depots) and they **BLOCK phase completion**.

**Status: ALL THREE GATES RUN AND PASSED on real macOS hardware (Gate 1 2026-07-19 + 2026-08-19,
Gate 2 2026-08-19, Gate 3 2026-08-19).** REQ-23-07 is closable — see **FINAL GATE STATUS** near the end
of this document. Nothing below is a placeholder any more; every `Result:` carries real recorded
observations, and the failed/superseded attempts are retained above their replacements rather than
overwritten.

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

### ✅ LAUNCH HALF RE-CONFIRMED 2026-08-19 — MASK LIFTED (23-10 Task 3)

**Title used: HUMANKIND (appId 1124300)** — not Cyberpunk. A deliberate substitution: Gate 1 requires a
multi-depot title, and HUMANKIND qualifies (`InstalledDepots` = 1124302 + 1124303). It is also the only
title on this machine carrying a *freshly GameLib-authored* `StateFlags=4` install, which the gate's
re-confirmation clause explicitly requires. Cyberpunk could not be used: it retains no Mach-O binary on
disk, which is what made the 2026-07-19 event unreconstructable in the first place.

**What masked this gate, restated:** the recorded launch could not be attributed. It was impossible to
say whether GameLib's execute bits ran the game or whether Steam repaired the install first — and
Cyberpunk's `executableFlagged=0` manifest proved GameLib's bits could not have been the explanation.
Two independent facts were missing: *whose bits* and *which client*. This run establishes both, measured
at the time rather than reconstructed.

**Fact 1 — the execute bits are provably GameLib's, across a COLD Steam start.**

| Moment | Steam state | Files with `+x` |
|---|---|---|
| 2026-08-19 09:22 (Gate 2 attempt 3) | running since 23:14 prev. day, never rescanned | **21** / 18,809 |
| 2026-08-19 09:38:35 (this gate, pre-launch baseline) | **not running** (`pgrep` clean) | **21** / 18,809 |
| 2026-08-19 09:42:53 (post-launch) | cold-started 09:42:10, full startup scan done | **21** / 18,809 |

The pre- and post-launch file *lists* were captured and diffed: **byte-identical, zero drift**. Steam's
own HUMANKIND install carries **18,002 of 18,809** files `+x` (`23-07-archive/humankind-pre-uninstall-baseline.txt`),
so an adoption or repair pass that supplied execute bits would have moved this number by three orders of
magnitude. Across a full cold start — process launch, startup scan, manifest adoption, ACF rewrite at
09:42, game launch — **Steam applied exactly zero execute bits.** The running binary is
`Humankind.app/Contents/MacOS/Humankind` (pid 96330), one of the 21 files GameLib chmod'd.

**Fact 2 — the launching client was GameLib, logged at the moment of the launch.**

```
(09:42:10) [INFO]: [Steam]: SteamGame: launching appId 1124300 via steam://rungameid/1124300
```

`steam_osx` process start: `Wed Aug 19 09:42:10 2026` — the same second. Steam was not running before
this line and was started *by* it. The operator clicked Play in GameLib; the Steam UI was never used.

**Adoption half re-observed on the same run (independent of the 2026-07-19 Cyberpunk result):**
`StateFlags "4"` survived Steam's cold startup scan unchanged (ACF rewritten by Steam at 09:42, flags
still `4`); `SizeOnDisk` 37,592,580,261 == exact sum of both depot sizes (37,342,725,351 + 249,854,910);
`buildid` 23181593 non-zero; `InstalledDepots` lists **both** depot GIDs, not just the base; no
`steamapps/downloading/1124300` directory; appid present in `libraryfolders.vdf` apps map at full size.
No verify pass, no re-download, on either depot.

**Result:** ✅ **PASS — launch half re-confirmed unconditionally.** The mask is lifted.

**Honesty limits, stated rather than papered over:**
1. **Steam is still in the launch path.** GameLib does not exec the binary directly — it hands off via
   `steam://rungameid/`, which cold-started Steam. That was never the masking concern, which was
   specifically *whose execute bits ran the game*; Fact 1 answers that decisively and Steam's presence
   in the path does not weaken it. But this run does NOT demonstrate a Steam-free launch, and no claim
   to that effect should be read into it.
2. **Different title from the original 2026-07-19 run.** The adoption half recorded above on Cyberpunk
   (3 depots) is untouched and still stands on its own; this run re-observes adoption on HUMANKIND
   (2 depots) as corroboration, not replacement.
3. **A cold Steam start applying no modes is an observation, not a guarantee.** It is strong evidence
   for this title on this build; it does not prove Steam never repairs modes under other conditions
   (e.g. a user-initiated Verify, which is exactly what `StateFlags=4` exists to skip).

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
  status: resolved  # was: failed — left stale after the fix landed; reconciled 2026-08-19 by 23-10 Task 3c
  resolved_by: "23-05 (single-flight guard + pause/resume abort-before-restart + stale-1026 reconciliation), hardware-confirmed on the Gate 1 re-run — the flip-flop was GONE (see the Gate 1 narrative above)"
  see_also: "The 'monotonic progress percent' half of this truth is STILL not fully satisfied, by a DIFFERENT defect in the same expression this entry already names in its artifacts (depot.ts percent = doneBytes/plan.totalBytes). Gate 3 found on 2026-08-19 that on a RESUMED install the numerator is run-scoped while the denominator is plan-scoped, so progress starts at 0% and can never reach 100% — measured: a fully successful install finished at 76%. Filed at .planning/todos/pending/2026-08-19-resumed-install-progress-percent-starts-at-zero-and-never-reaches-100.md. Same expression, distinct defect: this entry was TWO CONCURRENT RUNS flip-flopping; that one is ONE RUN under-counting."
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

**Decisive diagnostic ANSWERED 2026-08-19 (23-10 Task 3b) — GameLib defect, not a region block.**
Read from the official client's own artifacts rather than a fresh 90 GB re-install (operator-sanctioned
2026-08-19; a re-run regenerates the identical manifest and log lines, and Steam's own manifest + content
log are the ground truth this project already relies on for the bottle). The official client here is the
real Valve **Windows** Steam client in the `GameLibSteam` CrossOver bottle — the only official client that
can install this Windows-only title. Same account: its `LastOwner` is byte-identical to the macOS
`appmanifest_1124300.acf` (value withheld per T-23-37).

- Bottle `steamapps/appmanifest_1771300.acf` (mtime 2026-08-15 20:47): `StateFlags "4"`,
  `SizeOnDisk "96422090071"` (~90G, matches `du` on `common/KingdomComeDeliverance2`),
  `buildid "23914554"`, `InstalledDepots` = **1771302, 1771303, 1771306**.
  **Depot 1771304 is ABSENT.** The official client installed KCD2 **completely without it.**
- Bottle `logs/content_log.txt`, spanning 2026-07-11 → 2026-08-15 (covering the whole install):
  **zero** occurrences of `1771304`, against 1771302 ×3, 1771303 ×5966, 1771306 ×3.
  The official client never even *requested* 1771304's decryption key.

**Verdict:** depot 1771304 is **not required** for this account/region/platform. GameLib's whole-install
abort on its Blocked key is a genuine **over-selection + hard-fail defect** — `G-23-01` `severity: major`,
`status: open`, and the deferred skip-and-warn selection-policy follow-up in `deferred-items.md` is now
**UNGATED**. Not implemented here (23-10 explicitly forbids it); it routes to its own gap cycle.

**Honesty limit:** this proves 1771304 is not *needed*, NOT that Steam would have issued its key to the
official client — it never asked. The decision rule turned on whether the official client completes
without the depot, so the disposition is unaffected.

**Amendment (2026-08-19, phase 23.2-01) — the "before any `.acf` was written" half of this Attempt 1
narrative is WRONG.** Read from `downloadSteamDepots`'s source (full derivation in
`.planning/phases/23.2-steam-depot-selection-required-vs-optional-depots-and-skip-a/23.2-MANIFEST-WRITE-TAXONOMY.md`
Case A): a `buildDepotPlan` throw — exactly what happened here, an `EResult 40 Blocked` key request
during plan-build — routes through the catch block's unconditional `finalize()` call
(`depot.ts:2836`), which DOES write a manifest: `StateFlags "1026"`, `buildid "0"`, and a
present-but-empty `InstalledDepots` block. This code path (commit `eacbc7ccf`, 2026-07-15) already
existed on 2026-07-21, six days before this Attempt 1 was run, and is unchanged in shape through
2026-08-19 — so **a `.acf` almost certainly WAS written** on this run, contradicting the original
"before any `.acf` was written" claim. This is corrected in place per this project's rule against
silent rewrites; the original sentence above is left unmodified. **This amendment does NOT alter or
weaken the EResult 40 / depot 1771304 finding** — the region/key-block observation and the resulting
G-23-01 gap disposition are unaffected; only the "no `.acf`" half of the narrative is wrong.
Whether this specific 2026-07-21 run's `.acf` was checked in the macOS `steamapps` (KCD2 is a
Windows title and installs into the CrossOver bottle's `steamapps` via
`opts.targetSteamappsDirOverride`, `games.ts:1525-1526`, not the macOS library) is **NOT
established from any recorded evidence** — no artifact from that run states which directory was
inspected. See the adjudication in
`.planning/todos/pending/2026-08-19-failed-plan-build-writes-1026-stub-manifest-clobbering-a-complete-install.md`
for the full three-explanation writeup; this is recorded as the most likely unfalsified
explanation, not as an established fact.

**A suspected second divergence — RAISED, then DISPROVEN 2026-08-19.** The official client installs
depot **1771306** (13,650,395,848 bytes), which this Attempt 1 narrative does not mention, so it looked
as though GameLib's selection might differ from Steam's in *both* directions. It does not. A live
plan-build selection census from a started-then-aborted KCD2 install settled it:

```
Steam depot selection: os=windows arch=64 language=english branch=public -> depots
  [1771302(size=199419496), 1771303(size=82572274727),
   1771304(size=735856088), 1771306(size=13650395848)]
Steam depot selection: selectAllDepots union across base + DLC apps -> 4 depot(s)
```

**GameLib DOES select 1771306** — at a size byte-identical to the official client's `InstalledDepots`
entry — it was simply never reached before the 1771304 abort. The false inference came from reading
this narrative's list of depots whose *keys were resolved* as if it were the *selected* set; it was
flagged UNCONFIRMED when raised, and the census disproved it.

**This makes the remaining defect narrower and better-evidenced, not broader:** GameLib's selected set
**minus 1771304** equals Steam's installed set **exactly**. So skip-and-warn is provably sufficient for
this title rather than merely plausible, and there is **no depot-enumeration gap** and no
silently-incomplete-install risk. The same census also confirms language filtering works (1771305 czech,
1771307 french, 1771308 german, 1771309 japanese, 3118101 spanish — all skipped with logged reasons).

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

**Attempt 3 — HUMANKIND (appId 1124300), Denuvo, NATIVE depot path (2026-08-19) — THE CLEAN RE-RUN:**
**Result:** ✅ **PASS — UNCONDITIONAL.** Installed to `StateFlags=4`, Steam adopted it with no verify
and no re-download, and **the game launched with NO manual chmod anywhere.** This is the workaround-free
end-to-end native install attempt 2 could not produce, and it closes G-23-02.
**Title/AppID used:** HUMANKIND (1124300), Denuvo, native Apple-Silicon `.app` (same title as attempt 2)
**Steps 1–4:** PASS — 18,809 files / 35G under
`~/Library/Application Support/Steam/steamapps/common/Humankind`; `appmanifest_1124300.acf` written
`StateFlags 4`, `BytesDownloaded == BytesToDownload == SizeOnDisk == 37592580261`.
**Execute bits (the G-23-02 property):** PASS — **0 Mach-O EXECUTE/DYLIB files left without `+x`**
across all 18,809. `Humankind.app/Contents/MacOS/Humankind` landed `-rwxr-xr-x`. The Mach-O fallback
fired **42 times** this run (vs **7** on every prior run). The one fat binary still without `+x`,
`Contents/PlugIns/AkSoundEngine.bundle/Contents/MacOS/AkSoundEngine`, is an **MH_BUNDLE — correctly
declined by design** (Steam leaves dlopen'd bundles non-executable; the subtype-discrimination
constraint this gap's `missing:` list required).
**Verify/re-download observed?** No. Steam accepted `StateFlags=4` unchanged on its startup scan —
`.acf` byte-identical before and after, appid written into `libraryfolders.vdf`'s apps map at full
size (`"1124300" "37592580261"`), nothing under `steamapps/downloading/1124300`.
**Launch confirmed with DRM intact?** YES — operator-confirmed 2026-08-19, no manual chmod.

**Two honesty limits on this result, neither of which weakens the G-23-02 closure:**

1. **The launch MECHANISM was not recorded.** Whether the operator launched from GameLib or from the
   Steam UI is UNKNOWN — not reconstructed. This is the same distinction that downgraded Gate 1's
   launch half to MASKED, so attempt 3 must NOT be read as re-confirming Gate 1 (see the Summary
   Table's Gate 1 row, unchanged).
   **However, the execute bits are provably GameLib's work regardless of launch mechanism:** they were
   measured on disk at 09:22 while the Steam client had been running continuously since 23:14 the
   previous evening — i.e. Steam had never rescanned and could not have applied them. That timestamped
   pre-adoption measurement is stronger evidence than "Steam not running at launch" would have been,
   and it is what closes G-23-02. What it does not establish is which client started the process.
2. **Steam initially did NOT see the install** and offered a full 37.6 GB re-download, surfacing as a
   misleading "not enough space" error (disk was 97% full). Cause: Steam adopts a GameLib-written
   `.acf` only at its next STARTUP scan, and this Steam session predated the install by ~10 hours.
   Resolved by quitting and restarting Steam — the `.acf` survived the quit byte-identical. This is
   pre-existing documented Steam behavior, NOT a regression and NOT part of this gate's contract, but
   it is what made the broken test installs *appear* accepted while the good one did not: Steam was
   restarted between the earlier attempts and so rescanned, but not this time.

**What actually fixed G-23-02 — 23-08 alone was NOT sufficient.** Three defects had to be closed, and
the first two each looked sufficient in isolation:
- **23-08** shipped the Mach-O magic-byte fallback, but wired it only into the fresh-download call site.
- **quick `260818-v81`** — `healReconciledFileModes`'s `jobFiles.has(file) || !file.flags` early-continue
  skipped EVERY flagless manifest entry, so the reconcile-heal path (which nearly every real
  multi-session install takes) never reached mode application at all.
- **quick `260819-b1q`** — the actual cause of the launch failure: `applyMachOExecutableFallback` read
  only `MACHO_PROBE_BYTES = 4096`, then tried to inspect a fat binary's first slice header *at its file
  offset* out of that same 4096-byte buffer. HUMANKIND's first slice sits at `0x4000` = **16384**, so
  `detectMachOEndianness` bailed and **every universal binary was silently classified non-executable**
  — including the main game binary. The deterministic signature was exactly 7 `+x` files, the identical
  list on both a completed and a partial install, all 7 THIN Mach-O.

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

**Result:** ✅ **PASS — real macOS hardware, 2026-08-19 (23-10 Task 2, first and only execution).**
The resume reconciled a genuine partial download, skipped the already-correct files, earned a
Steam-trusted `StateFlags "4"` (not a fail-closed `1026`), applied execute bits through the
`healReconciledFileModes` path with **no manual chmod**, was adopted by Steam with a size-only check and
no re-download, and launched to the main menu. No Steam-in-CrossOver auto-open.

**Title/AppID used:** HUMANKIND (1124300), native Apple-Silicon `.app`, 2 depots, Denuvo. Reused on a
FULL fresh uninstall — explicitly permitted by this gate's preconditions ("or reuse Gate 1's title on a
fresh uninstall"). Install dir, `appmanifest_1124300.acf`, and `steamapps/downloading/1124300` all
removed, with Steam quit, before step 1.

**Partial-state confirmed before resume?** YES. GameLib force-quit (`kill -9` on the app AND its node
sidecar — a simulated crash, NOT the graceful Cancel path) at **15,538 of 18,809 files**, and
`appmanifest_1124300.acf` was confirmed ABSENT on disk. Note the partial was ~83% by FILE COUNT but only
~26% by BYTES — the interrupted run had fetched mostly small files and left the bulk assets. That
asymmetry matters for reading every number below.

**Resume behavior observed:** RESUMED, did not restart from zero. Relaunch did NOT auto-drive recovery
(correct — per D-04's 2026-07-18 softening, `init()` only DETECTS and flags `steamResumePending`); the
operator's own Install click triggered it. Two independent confirmations:
1. The on-disk file count climbed **from** the 15,538 kill baseline and never dropped toward zero
   (sampled every 30s: 16,237 @11:15:32 → 18,809 @11:23:35, then flat while the large files filled).
2. `healReconciledFileModes` ran FIRST: 21 `applied secondary Mach-O executable fallback (chmod 0o755)`
   lines at 11:13:53–11:13:55, **before** `downloadDepotFiles: first bytes written after 420ms` at
   11:13:55. Mode application to files already on disk is only reachable for entries reconcile
   classified as present-and-correct. This is the exact path quick `260818-v81` fixed, and Gate 3 is the
   first deliberate exercise of it.

**`.acf` StateFlags after resume:** **`4`** — the reconciled-complete outcome, NOT the fail-closed
`1026`. Written at 11:50:16:
`Writing StateFlags=4 full-ownership manifest for appId 1124300 (sizeOnDisk=37592580261, buildid=23181593)`

**`.acf` field dump:** `StateFlags 4`; `BytesToDownload == BytesDownloaded == SizeOnDisk ==
37592580261`; `buildid 23181593`; `installdir Humankind`. Tool verdict: *"StateFlags==4? true, bytes
consistent? true, bytes non-zero? true, buildid set? true → Steam is treating this as FullyInstalled
(no verify pending)."* Snapshot (pre-Steam):
`.planning/spikes/003-stateflags4-full-ownership/snapshot-gate3-resume.acf`. `LastOwner` deliberately
not inlined (T-23-37).

**No full re-download confirmed?** YES — and by direct instrumentation, not inference. The final census
line quantifies the skip:
```
steam-flags-census stage=download-complete appId=1124300 totalFiles=18949 flagBearing=140
  executableFlagged=0 chmodAttempts=0 modeCallsites=0 jobCount=3306 reconciledSkipped=15643
  distinctFlagValues=[64]
```
**`reconciledSkipped=15643` of 18,949, with only `jobCount=3306` fetched.** Corroborated by the terminal
`chunk-stream stats @2181s: percent=76% totalAttempts=33267 rotations=2 timeouts=0` — a fully successful
install whose progress reading topped out at 76%, the missing 24% being precisely the reconciled-skip
bytes. (That ceiling is a real user-facing defect, filed separately — see "Defect found by this gate".)

**Execute-bit census on the RESUMED install** (distinct code path from Gate 2's — `healReconciledFileModes`,
not `downloadSingleFile`): 18,809 total files, **21 with `+x`**, matching Gate 1's and Gate 2's baseline
exactly.
```
-rwxr-xr-x  Humankind.app/Contents/MacOS/Humankind
-rwxr-xr-x  Humankind.app/Contents/Frameworks/ZFGameBrowser.app/Contents/MacOS/ZFGameBrowser
```
**NO manual `chmod` was applied at any point in this run.** `chmodAttempts=0` is correct and expected —
HUMANKIND's manifest is flagless (`executableFlagged=0`, `distinctFlagValues=[64]`, the H2 verdict), so
all 21 bits came from the Mach-O magic-byte fallback, none from `EDepotFileFlag`.

**Steam adoption (step 7):** PASS, no re-download. Steam started 11:54:20 (first start since before the
resume began) and its own `content_log.txt` records the whole check in a single second:
```
[2026-08-19 11:54:20] Verifying installation...
[2026-08-19 11:54:20] Verifying file sizes only
[2026-08-19 11:54:20] Verification complete
```
**"Verifying file sizes only"** — a size sanity check, not a content re-hash of 35 GB, and no
`Update Required` / `Update Running` / re-download entry anywhere today. `StateFlags` remained `4` after
adoption and after launch. The operator saw a brief "validating" message and judged it acceptable; the
log shows the content check was sub-second, and the ~35s between Steam start and game start
(11:54:24→11:54:59) is ordinary pre-launch housekeeping (workshop items, parental settings, subscription
list, AutoCloud sync, stats), most likely surfacing as `Validating parental settings` at 11:54:26.

**No silent Steam-in-CrossOver auto-open observed?** **YES — none.** See the method note below: the
first check used for this was VACUOUS and was replaced.
- 0 bottle-shaped processes (`*.exe` / `wineserver` / `wine64`) started on 2026-08-19. The check is
  proven capable of firing: it detects 8 such processes running continuously since 2026-08-15 20:46.
- 0 files touched anywhere under `CrossOver/Bottles` between 11:13 and 11:56. Control: the same query
  reports 11,824 files touched in the preceding 30 days, so it demonstrably fires.
- `CrossOver.app` `kMDItemLastUsedDate` = 2026-07-20, i.e. the GUI was never launched.

**Launch confirmed?** YES — reached the **main menu**, operator quit it deliberately (Steam:
`App Running` 11:55:00 → `Fully Installed` 11:55:55). Denuvo accepted the reconciled, GameLib-authored
`StateFlags=4` file set with no DRM error and no forced re-validation.

---

### Honesty limits on Gate 3

1. **The launch was Steam-mediated.** The operator clicked **Play in the Steam UI**, not GameLib's Play
   action, so this run does NOT independently establish GameLib's own launch path. It does not need to:
   Gate 1's launch half was re-confirmed deliberately earlier the same day (see the Gate 1 section).
   Recording the launching client at the time — rather than reconstructing it later — is the specific
   discipline whose absence masked Gate 1 for three days and left Gate 2 attempt 3 unable to speak to it.
2. **The execute bits are still provably GameLib's, regardless of launch client.** The 21 `+x` were
   measured on disk at ~11:52, and Steam did not start until **11:54:20** — so no Steam process existed
   that could have applied them. Same argument that closed G-23-02 in Gate 2 attempt 3, established here
   by timestamp rather than by inference.
3. **The first no-auto-open check was VACUOUS and its result was discarded.** A 30s-interval sampler ran
   `pgrep -qif crossover` for 72 consecutive samples (11:15:32→11:51:18) and reported "none" every time —
   but bottled processes present as `C:\windows\system32\services.exe`, `winedevice.exe`, `wineserver`,
   none of which contain the string "crossover". It reported "none" while 8 such processes had been
   running continuously since 2026-08-15, i.e. it could not have detected an auto-open. It was never
   proven to fail against a known-bad input. Replaced with the two proven-firing checks recorded above.
   Same shape as [gate-can-be-nonvacuous-and-measure-wrong-property] and the standing "a grep assertion
   must FAIL against a known-bad input" lesson.
4. **Sampling gap at the start.** Automated sampling began at 11:15:32, ~97 seconds after the resume
   started at 11:13:55. One manual check at 11:14:24 covers part of that gap. The retrospective
   bottle-mtime and process-start-time evidence (points above) is not sample-based and covers the whole
   window, so this gap does not weaken the conclusion.
5. **`reconciledSkipped=15643` is the depot writer's own report** of what it skipped. It is corroborated
   by two independent observations (the file-count floor never dropping, and the 76% terminal progress
   matching the byte split), but it is not a third-party measurement of what was fetched over the wire.

### Defect found by this gate (filed, not fixed here)

**A resumed install's progress reports from 0% and can never reach 100%** —
`.planning/todos/pending/2026-08-19-resumed-install-progress-percent-starts-at-zero-and-never-reaches-100.md`,
severity major. `depot.ts:2044` computes `percent = doneBytes / totalBytes` where the numerator is
run-scoped (`:1938`, initialized to 0 AFTER `healReconciledFileModes` at `:1930`, so reconciled-skip
bytes never count) and the denominator is plan-scoped (`plan.totalBytes`, `:1915`). This run is the
measurement: a fully successful install finished at **76%**. Reporting-only — it does not affect what
lands on disk, the reconcile skip, mode application, or the `StateFlags` decision, so it is outside this
gate's contract and does not qualify the PASS.

---

## Summary Table (fill in after all gates are run)

| # | Gate | Requirement | Result | Notes |
|---|------|-------------|--------|-------|
| 1 | Multi-depot StateFlags=4 (no verify/re-download) | REQ-23-07 (D-07.1) | ✅ **PASS — BOTH HALVES (HW; adoption 2026-07-19, launch re-confirmed 2026-08-19)** | Adoption hardware-confirmed 2026-07-19 (Cyberpunk, 3 depots) and still stands: `StateFlags=4`, Steam adopted the multi-depot install with no verify/re-download. Plan 23-05 fix (single-flight guard + pause/resume abort + reconciliation) held; Phase 25 fan-out cleared the download-time blocker so steps 4–6 could complete. **Launch half was downgraded 2026-08-16 by 23-07 Task 2 (verdict MASKED)** — Cyberpunk's manifest carries `executableFlagged=0`, so that launch could not have run on GameLib-applied execute bits. **MASK LIFTED 2026-08-19 (23-10 Task 3)** on HUMANKIND (1124300, 2 depots, freshly GameLib-installed): `+x` held at **21/18,809 pre-launch with Steam not running → 21/18,809 after a COLD Steam start**, file lists byte-identical — against Steam's own 18,002/18,809 layout, so Steam supplied **zero** execute bits; and the launching client was logged at the moment (`09:42:10 SteamGame: launching appId 1124300 via steam://rungameid/1124300`, `steam_osx` started the same second). Both missing facts — whose bits, which client — established at the time, not reconstructed. Honesty limits in the Gate 1 section (Steam remains in the launch path via `steam://`; title differs from the 2026-07-19 run). |
| 2 | Hard-DRM launch under StateFlags=4 | REQ-23-07 (D-07.2) | ✅ **PASS — UNCONDITIONAL (HW, 2026-08-19)** | **Attempt 3 is the clean re-run.** HUMANKIND (1124300, Denuvo) installed to StateFlags=4 (18,809 files), Steam adopted with no verify/re-download, **launched with NO manual chmod**. Execute bits: 0 Mach-O EXECUTE/DYLIB missing `+x`; fallback fired 42× vs 7 previously; the lone remaining fat binary is an MH_BUNDLE, correctly declined. Closes blocker gap **G-23-02**, which needed THREE fixes (23-08 + quick `260818-v81` + quick `260819-b1q`), not one. Attempt 1 (KCD2) diverged on a `Blocked` depot key — gap G-23-01, still open. Launch MECHANISM (GameLib vs Steam UI) NOT recorded, so this does **not** re-confirm Gate 1's launch half. |
| 3 | Interrupt-resume reconciled StateFlags=4 + launch + no re-download + no bottle auto-open | REQ-23-07 (D-07.3) + D-04 | ✅ **PASS (HW, 2026-08-19)** | **Executed for the first time, as written.** HUMANKIND (1124300) on a fresh uninstall; GameLib force-quit (`kill -9`, not Cancel) at 15,538/18,809 files with no `.acf` on disk; user-initiated Install click resumed it (auto-drive correctly absent per D-04's softening). Reconcile skipped **15,643 of 18,949 files** (`jobCount=3306`), corroborated by a terminal `percent=76%` on a fully successful install — the 24-point gap is the skipped bytes. Earned `StateFlags "4"`, NOT a fail-closed 1026; `BytesToDownload == BytesDownloaded == SizeOnDisk == 37592580261`, `buildid 23181593`. Execute bits via the distinct `healReconciledFileModes` path: 21 `+x`, both named binaries `-rwxr-xr-x`, **zero manual chmod** — and measured at ~11:52, before Steam started at 11:54:20, so provably GameLib-applied. Steam adopted with `"Verifying file sizes only" / "Verification complete"` in the same second and no re-download. Reached the main menu; operator quit deliberately. No CrossOver auto-open (0 bottle processes started today, 0 bottle writes in-window, both checks proven to fire). **Honesty limits:** the launch was **Steam-UI-mediated**, so this does not independently re-prove GameLib's launch path (Gate 1 did that separately the same day); and the first no-auto-open check was vacuous and was discarded and replaced. Surfaced one new defect, filed not fixed: resumed-install progress can never reach 100%. |

## Gaps

```yaml
- id: G-23-01
  truth: "A native depot install completes when the user owns the game, even if one owned depot's decryption key is Blocked (region/DRM-gated)"
  status: open
  reason: "KCD2 (appId 1771300) install aborted entirely because Steam returned EResult 40 (Blocked) for depot 1771304's decryption key. GameLib selected 1771304 via the package-ownership gate (select.ts:174), but owning a depot != Steam granting its key. classifyDepotError treats EResult 40 as non-retryable and fails the WHOLE install (depotErrors.ts:52), rather than skipping a non-essential blocked depot and continuing."
  severity: major  # RESOLVED 2026-08-19 from unknown: the official client installs KCD2 fully WITHOUT 1771304, so the depot is optional and GameLib's whole-install abort is a defect
  surfaced_by: gate-2 (attempt 1, KCD2)
  decisive_diagnostic: "ANSWERED 2026-08-19 (23-10 Task 3b). Rule was: install KCD2 in the official Steam client on this account/region; observe whether depot 1771304 downloads. Blocked there too => genuine region block (not a GameLib bug). Official client installs the game without it => GameLib over-selection/hard-fail defect."
  diagnostic_verdict: "GameLib DEFECT, not a region block. Read from the official client's own artifacts rather than a fresh 90GB re-install (operator-sanctioned; a re-run regenerates identical data, and Steam's own manifest + content log are the ground truth this project already uses for the bottle). Official client = the real Valve WINDOWS Steam client in the GameLibSteam CrossOver bottle, the only official client that can install this Windows-only title; same account, LastOwner byte-identical to the macOS appmanifest_1124300.acf (value withheld per T-23-37). (1) Bottle steamapps/appmanifest_1771300.acf, mtime 2026-08-15 20:47: StateFlags \"4\", SizeOnDisk 96422090071 (~90G, matches du on common/KingdomComeDeliverance2), buildid 23914554, InstalledDepots = 1771302, 1771303, 1771306 -- depot 1771304 ABSENT, i.e. the official client installed KCD2 COMPLETELY WITHOUT IT. (2) Bottle logs/content_log.txt spanning 2026-07-11 to 2026-08-15 (covering the whole install): ZERO occurrences of 1771304, against 1771302 x3, 1771303 x5966, 1771306 x3 -- the official client never even REQUESTED 1771304's decryption key. Therefore 1771304 is not required for this account/region/platform and GameLib's whole-install abort on its Blocked key is an over-selection + hard-fail defect. The deferred skip-and-warn selection-policy follow-up in deferred-items.md is now UNGATED and routes to its own gap cycle; NOT implemented in 23-10, which forbids it."
  diagnostic_honesty_limit: "This proves 1771304 is not NEEDED; it does NOT prove Steam would have issued its key to the official client, which never asked. The decision rule turned on whether the official client completes without the depot, so the disposition is unaffected."
  second_divergence_RESOLVED: "DISPROVEN 2026-08-19 by a live plan-build selection census -- there is NO second divergence. GameLib DOES select depot 1771306; it was merely never reached before the 1771304 abort. Measured directly from select.ts:225 on a started-then-aborted KCD2 install: `Steam depot selection: os=windows arch=64 language=english branch=public -> depots [1771302(size=199419496), 1771303(size=82572274727), 1771304(size=735856088), 1771306(size=13650395848)]` with `selectAllDepots union across base + DLC apps -> 4 depot(s)`. The 1771306 size is BYTE-IDENTICAL to the official client's InstalledDepots entry. The earlier 'differs in BOTH directions' claim was inferred from Gate 2 Attempt 1's narrative, which recorded only the depots whose KEYS were resolved before the abort -- not what was SELECTED -- and it was explicitly flagged UNCONFIRMED at the time. CONSEQUENCE: GameLib's selected set MINUS 1771304 equals Steam's installed set EXACTLY, so skip-and-warn is provably sufficient for this title rather than merely plausible, and there is no depot-enumeration gap and no silently-incomplete-install risk. Language filtering also verified working (1771305 czech, 1771307 french, 1771308 german, 1771309 japanese, 3118101 spanish all skipped with reasons)."
  observability_shipped_23_09: "23-09 shipped the diagnostic + observability half only (user-locked scope, no selection-policy change): classifyDepotError now gives EResult 40 (Blocked) a dedicated steam.download.error.depotBlocked message naming the specific blocked depot id and stating the game may still be installable directly through the Steam client, and wrapDepotKeyError now logs a warning at the failure site naming the depot id, owning appId, and EResult before the error propagates (previously this context was only visible once the whole install failed and got classified). No change to select.ts, NON_RETRYABLE_ERESULTS, or retry/abort behavior -- a Blocked key still fails the install exactly as before, only the message and the log improved. Whatever the 23-10 Task 3 diagnostic finds, this occurrence (and the next one) is now legible."
  artifacts:
    - "src/backend/storeManagers/steam/depot/select.ts:174 (ownership gate includes owned-but-key-blocked depot)"
    - "src/backend/storeManagers/steam/depotErrors.ts:52 (EResult 40 non-retryable -> whole-install abort)"
    - "~/Library/Logs/GameLib/gamelib.log 22:01:29 (couldn't get decryption key for depot 1771304 (app 1771300): Blocked)"
  missing:
    - "Decide policy: should a Blocked key on a non-essential owned depot skip-and-warn (continue install) rather than abort? Requires distinguishing required vs optional/region-alternate depots at selection time."
    - "UNGATED 2026-08-19: the required-vs-optional depot selection-policy follow-up in deferred-items.md ('Skip-and-warn policy for a Blocked key on a non-essential owned depot (G-23-01)') is released by the Task 3b verdict above and ready to plan as its own gap cycle. Its scope now also covers the 1771306 divergence. NOT started in 23-10, which explicitly forbids implementing it."

- id: G-23-02
  truth: "A native macOS game installed via the StateFlags=4 full-ownership path is launchable (its Mach-O executables land with the execute bit)"
  status: resolved
  resolved_on: 2026-08-19
  resolved_by: "23-08 (Mach-O magic-byte fallback) + quick 260818-v81 (reconcile-heal reach) + quick 260819-b1q (fat-binary slice probe) — ALL THREE were required; 23-08 alone did not close it, and each of the first two looked sufficient in isolation."
  proven_by: "Gate 2 attempt 3, real macOS hardware 2026-08-19 (see Gate 2 above). HUMANKIND 1124300: 18,809 files at StateFlags=4, ZERO Mach-O EXECUTE/DYLIB files without +x, Humankind.app/Contents/MacOS/Humankind -rwxr-xr-x, fallback fired 42x (vs 7 on every prior run), Steam adopted with no verify/re-download, game LAUNCHED with no manual chmod. The +x bits were measured on disk at 09:22 while the Steam client had been running continuously since 23:14 the previous evening and had never rescanned — so the bits are provably GameLib-applied, not Steam-applied."
  severity: blocker  # was: any native macOS (and likely Linux) game unlaunchable via native install
  final_root_cause: "TWO stacked defects beyond 23-08's original scope, both found 2026-08-18/19. (1) reconcile-heal REACH: healReconciledFileModes's compound guard `jobFiles.has(file) || !file.flags` early-continued on every FLAGLESS manifest entry, so on the reconcile path — which nearly every real multi-session/resumed install takes — mode application never ran AT ALL, not merely the fallback. Fixed by quick 260818-v81. (2) FAT-BINARY BLINDNESS, the actual cause of the launch failure: applyMachOExecutableFallback read only MACHO_PROBE_BYTES=4096 bytes, then for a fat binary read fat_arch.offset and tried to inspect the contained slice's Mach-O header AT THAT FILE OFFSET out of the same 4096-byte buffer. detectMachOEndianness's `if (buf.length < offset + 4) return undefined` bailed, so isExecutableMachO returned false for EVERY universal binary. HUMANKIND's main binary begins `cafebabe 00000002 01000007 00000003 00004000` — first slice at 16384, 4x past the probe. Fixed by quick 260819-b1q via a second bounded 32-byte positional read at the slice offset (NOT a larger constant — a slice offset is arbitrary and file-dependent)."
  why_it_hid: "The count invited a wrong story. Exactly 7 files carried +x, which reads naturally as 'only the files freshly downloaded in the last pass got it' — a timing explanation that fits the number and is false. The thin-vs-fat split is visible ONLY by comparing the magic bytes of the files that SUCCEEDED against those that FAILED; the same 7-file list appeared on both a fully-completed install and a later 88% partial, i.e. deterministic, not timing. Compounding it, depot.test.ts's buildFatMachOHeader hardcoded `sliceOffset = 64` — inside the 4096 probe — so the existing fat-binary tests were GREEN AGAINST THE DEFECT, exercising a case that cannot occur in the wild. 260819-b1q's regression pin therefore places a slice at 1 MiB, making 'just raise the constant' behaviourally impossible to pass."
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

**Gate status (revised 2026-08-19): STILL NOT CLOSED, but the blocker is gone.** Gate 2 now holds a
clean **unconditional** PASS on both its adoption and launch halves (attempt 3, real hardware), and
blocker gap **G-23-02 is RESOLVED** — a GameLib-authored `StateFlags=4` native macOS install is
launchable with no manual `chmod`. That closes the single defect that had downgraded or conditioned
every launch result in this document.

**Updated later the same day (2026-08-19): Gate 1 has since CLOSED on both halves.** Its launch half was
re-confirmed deliberately in 23-10 Task 3 — HUMANKIND, Steam verified not running beforehand, `+x` count
and file list pinned before and after a cold Steam start (21/18,809, byte-identical, against Steam's own
18,002/18,809), and the launching client logged at the moment of launch. See the Gate 1 section.

---

## FINAL GATE STATUS (2026-08-19, end of 23-10) — ALL THREE GATES PASS. REQ-23-07 IS CLOSABLE.

Gate 3 was executed for the first time on 2026-08-19 and **PASSED on every sub-field** (see its section
above). With Gates 1 and 2 already holding unconditional hardware passes, **the D-07 real-hardware
validation gate is satisfied and REQ-23-07 — the last open requirement of Phase 23 — can close.** Phase
23 is ready for `/gsd-verify-work 23`.

What the three gates jointly establish: a GameLib-authored `StateFlags=4` native macOS install is
trusted by the real Steam client without a verify pass or re-download, across a multi-depot title
(Gate 1), a hard-DRM/Denuvo title (Gate 2), and an interrupted-then-reconciled install (Gate 3) — and in
all three cases the resulting install is **launchable with no manual `chmod`**, which is what blocker gap
G-23-02 had denied until three separate fixes closed it.

**Two items remain open, both deliberately and neither blocking REQ-23-07:**

1. **G-23-01 stays `open` BY DECISION, not by oversight.** Its decisive diagnostic is ANSWERED (23-10
   Task 3b, below) and it is now a confirmed GameLib **over-selection + hard-fail defect** at
   `severity: major`. 23-10's scope explicitly forbids implementing the fix, so the skip-and-warn
   selection-policy work is UNGATED and routes to its own gap cycle. REQ-23-07's contract is the three
   hardware gates, not G-23-01's remediation.
2. **A new defect filed by Gate 3:** a resumed install's progress reading starts at 0% and can never
   reach 100% (it topped out at 76% on this fully successful run). Reporting-only — it does not affect
   what lands on disk, the reconcile skip, mode application, or the `StateFlags` decision. Filed at
   `.planning/todos/pending/2026-08-19-resumed-install-progress-percent-starts-at-zero-and-never-reaches-100.md`.

**Method note carried forward from Gate 3, worth more than the gate itself:** the first
"no Steam-in-CrossOver auto-open" check was **vacuous** — it grepped process lists for the string
`crossover` while bottled processes present as `services.exe` / `winedevice.exe` / `wineserver`, and it
returned a clean "none" for 72 consecutive samples while 8 such processes had been running continuously
for four days. It was caught only by asking "can this check fail?" and testing it against a known-bad
input. Every negative result in this document should be read with that question applied.

**Superseded assessment (2026-08-19, earlier the same day, retained for history):**
**Gate status: STILL NOT CLOSED, but the blocker is gone.** Two items then stood between here and phase
closure, not three:
1. **Gate 3 (interrupt-resume) has never been executed.** G-23-02 no longer blocks its launch step.
   *(CLOSED later the same day — Gate 3 ran and PASSED; see the FINAL GATE STATUS block above.)*
2. **G-23-01 is still open, but its diagnostic is now ANSWERED (2026-08-19, 23-10 Task 3b).** The
   official Windows Steam client in the `GameLibSteam` bottle installed KCD2 in full — `StateFlags "4"`,
   ~90G, `InstalledDepots` 1771302/1771303/**1771306** — **without depot 1771304**, and its
   `content_log.txt` never mentions 1771304 at all across the whole install. So the depot is not
   required and GameLib's whole-install abort is a real **over-selection + hard-fail defect**
   (`severity: major`). 23-09 shipped only the observability half; the selection-policy follow-up in
   `deferred-items.md` is now **UNGATED** and routes to its own gap cycle. Since the fix is deliberately
   out of 23-10's scope, this gap stays `open` at phase close — REQ-23-07's contract is the three
   hardware gates, not G-23-01's remediation.

Also carried forward, NOT part of this gate's contract: the DecompressPool decode stall that killed two
earlier install attempts at 88% did not recur on 2026-08-19, but nothing was fixed — treat it as open
(it is a live recurrence of the hang Phase 23.1 closed as "unreproduced", which was itself the stated
criterion for reopening).

---

**Superseded assessment (2026-08-16, retained for history):** Revised after 23-07's hardware trace.
**No gate then had a clean unconditional PASS on its launch half.** Gate 1's *adoption* half is hardware-confirmed
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
*Prepared: 2026-07-17 by Plan 23-04 (autonomous prep). Executed on real macOS hardware across
2026-07-19 → 2026-08-19; completed by Plan 23-10 on 2026-08-19 with all three gates PASSED.*
