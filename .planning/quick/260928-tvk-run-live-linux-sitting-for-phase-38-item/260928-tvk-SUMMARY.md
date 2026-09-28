---
phase: quick-260928-tvk
plan: 01
subsystem: testing
tags: [uat, phase-38, steam, linux, x11, tauri, live-gate, mss, xdotool]

requires:
  - phase: 34.13-steam-install-time-wine-bottle-form-gog-parity
    provides: "G-QUICK-LINUX origin item, relocated to 38-S04 at gate close-out"
  - phase: 38-deferred-hardware-and-environment-uat-gates-windows-linux-ma
    provides: "the human_verification ledger item 38-S04 and its platform_gate"
provides:
  - "First live Linux UAT sitting for Phase 38 (Sitting 6), and a reusable X11 capture instrument"
  - "38-S04 scored PASS: Steam quick install on Linux, native installs OFF, no GameLib dialog opens on the primary-half click"
affects: [38-S10, 38-S12, "38-S16 Linux half"]

actuals:
  tokens: 14500
  tasks: 3
  commits: 2

tech-stack:
  added: []
  patterns:
    - "linux_sitting_capture.py: X11 window-region burst capture via mss/Xlib/xdotool, client-window attribution via _NET_CLIENT_LIST, frame-diff absence instrument, reusable for 38-S10/38-S12/38-S16's Linux half"
    - "Positive-control-before-scored-click pattern: prove the absence instrument can see a real dialog (P >= 0.10) before trusting a 'nothing opened' result"

key-files:
  created:
    - .planning/quick/260928-tvk-run-live-linux-sitting-for-phase-38-item/linux_sitting_capture.py
    - .planning/quick/260928-tvk-run-live-linux-sitting-for-phase-38-item/evidence/ (5 PNGs, clients-new-windows.txt, log-excerpt.txt)
  modified:
    - .planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-VERIFICATION.md
    - .planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-HUMAN-UAT.md
    - .planning/phases/34.13-steam-install-time-wine-bottle-form-gog-parity/34.13-UAT.md
    - .planning/ROADMAP.md

key-decisions:
  - "Target game: WazHack (appId 264160), per operator's explicit follow-up request, after independently validating it was owned, visible in the Library, and NOT installed (absent from all four libraryfolders.vdf library paths and from steam_library.json's own cache)"
  - "Recorded HEAD 54a931199 as this sitting's build sha, not the planning-time 7d7a460ba, because two docs-only commits landed on the branch between Task 1's original session and this resume — the tree was still clean at launch, so identity remained provable"
  - "Did not re-commit Task 1's linux_sitting_capture.py: the file on disk was byte-identical to the prior session's committed version, so only the live-process re-verification was redone, with no new commit for Task 1"

requirements-completed: [QUICK-260928-TVK]

coverage: []

duration: "~35min active (across two sessions with two operator-checkpoint waits; commit-to-commit span from Task 1 to Task 3 was ~9h38m including operator idle/away time)"
completed: 2026-09-28
status: complete
---

# Quick Task 260928-tvk: Phase 38 Sitting 6 (first Linux sitting) — 38-S04 PASS Summary

**Ran the HEAD `pnpm tauri:dev` build live on this Linux host (Pop!_OS 22.04, X11) and scored `38-S04` PASS: the Steam quick-install primary-half click, with native installs OFF, opens NO GameLib dialog, confirmed by a positive-control-calibrated absence instrument and the backend's own arming log line.**

## Performance

- **Duration:** ~35 minutes of active execution, split across two sessions separated by two operator-checkpoint waits (Steam sign-in, then confirming the desktop Steam client was actually running). Commit-to-commit span (Task 1's original commit to Task 3's commit) was ~9h38m, almost entirely idle/away time, not active work.
- **Started:** 2026-09-28T21:59:19+13:00 (Task 1, prior session)
- **Completed:** 2026-09-29T07:37:35+13:00 (Task 3 commit, this session)
- **Tasks:** 3/3 (Task 1 re-verified with no new commit; Task 2 checkpoint cleared after independent re-verification; Task 3 fully executed)
- **Files modified:** 11 (in Task 3's commit) + 1 created in Task 1's prior commit (unchanged this session)

## Accomplishments

- Built and proved a reusable Linux X11 capture instrument (`linux_sitting_capture.py`): window-region burst capture via `mss`, client-window attribution via `_NET_CLIENT_LIST`/`xprop`, frame-diff absence detection, and a `selftest` subcommand — all self-tested at 205-215 fps idle / 16.8-18.6 fps under burst-with-client-polling.
- Ran Phase 38's FIRST LIVE LINUX SITTING (Sitting 6). Scored `38-S04`: Steam quick install on Linux, tauri runtime, native installs OFF, primary-half Install click — **PASS**. No GameLib dialog, modal, overlay or picker opened at any point from pre-click through +20s+.
- Proved the absence instrument with a positive control BEFORE the scored click: opened the real "Install with options…" dialog via the caret menu, measured max changed-pixel fraction P=0.1090 (>= the 0.10 threshold), viewed the frame to confirm the dialog rendered, then closed it and confirmed it was gone.
- Confirmed the arming condition (native installs OFF) both from config (`~/.config/GameLib/config.json`, `defaultSettings.enableSteamNativeInstall: false`) and from the backend's own log line, `SteamGame: delegating install for appId 264160 via steam://install/264160`, timestamped to the same second as the click.
- Discharged `38-S04` in `38-VERIFICATION.md` (`human_verification` → `human_verification_discharged`), updated its `score:` field counts (10→9 open, 16→17 discharged), added a `## Sitting 6` narrative section and `sessions:` entry to `38-HUMAN-UAT.md`, walked back the origin receipt and body-table row in `34.13-UAT.md`, and updated `ROADMAP.md`'s item-count paragraph — all verified against `gsd-core audit-uat` (`by_phase["38"]` moved 10→9, `total_items` 429→428, `parse_gap_files` stayed 0) and `pnpm planning-gates` (12/12 green).
- Cleaned up every process this task started: killed the dev-build process group and, separately, the sidecar's own process group (a deviation from the plan's single-process-group assumption — see below), confirmed via bracketed-pattern `pgrep` and an empty `:5173` that nothing survived, and left the Steam client and the dev secret vault untouched.

## Task Commits

1. **Task 1: Launch the HEAD dev build, prove every instrument end to end** — `8c7b1821b` (feat, prior session). Re-verified this session with no new commit: the file on disk was unchanged, so only the live process was relaunched and re-proven (identity, `selftest`, log sink, native-OFF setting).
2. **Task 2: Operator signs in to Steam and starts the Steam client** — checkpoint, no commit (no code changes). Cleared after two rounds of independent re-verification: the first "signed in" signal turned out to mean only the in-app GameLib login (`pgrep -x steam` still returned nothing), so I held and reported back rather than trusting the claim; the operator then started the desktop Steam client, and I re-verified `pgrep -x steam`, PID/exe identity, and a fresh Library grab (381 games including Steam titles) before proceeding.
3. **Task 3: Scored click, evidence, ledger/UAT/ROADMAP records, cleanup** — `a9820f01d` (docs). Single combined commit per the plan's step L: capture-script (unchanged, not restaged), evidence directory, the three phase files, and `ROADMAP.md`.

**Plan metadata:** Not committed separately — `ROADMAP.md` was already included in Task 3's own deliverable commit per the plan's explicit step-L file list; `STATE.md`/`SUMMARY.md` are left for the orchestrator's docs commit.

## Files Created/Modified

- `.planning/quick/260928-tvk-run-live-linux-sitting-for-phase-38-item/linux_sitting_capture.py` — the reusable X11 capture harness (created in Task 1's prior session, unchanged this session)
- `.planning/quick/260928-tvk-run-live-linux-sitting-for-phase-38-item/evidence/positive-control-max.png` — the "Install with options…" dialog, viewed to prove the instrument
- `.planning/quick/260928-tvk-run-live-linux-sitting-for-phase-38-item/evidence/scored-pre-click.png`, `scored-max-diff.png`, `scored-plus10s.png`, `scored-plus20s.png` — the scored-click evidence stills
- `.planning/quick/260928-tvk-run-live-linux-sitting-for-phase-38-item/evidence/clients-new-windows.txt` — window census and attribution, showing zero new top-level windows throughout
- `.planning/quick/260928-tvk-run-live-linux-sitting-for-phase-38-item/evidence/log-excerpt.txt` — the single arming log line
- `.planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-VERIFICATION.md` — `38-S04` moved to `human_verification_discharged` with its PASS result; `score:` counts updated
- `.planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-HUMAN-UAT.md` — `sessions:` entry, `## Current Test` bracket updated, new `## Sitting 6` narrative section
- `.planning/phases/34.13-steam-install-time-wine-bottle-form-gog-parity/34.13-UAT.md` — `38-S04` receipt `outcome:` and body-table row walked back to DISCHARGED PASS
- `.planning/ROADMAP.md` — new item-count paragraph (9 OPEN / 17 DISCHARGED / 10 RETIRED), prior paragraph marked historical

## Decisions Made

- **Target game: WazHack (appId 264160).** The operator named it explicitly in a follow-up message; I independently validated it against the plan's own criteria (owned, visible in the Library, NOT installed) before using it — `appmanifest_264160.acf` was absent from all four `libraryfolders.vdf` library paths, and the app's own `steam_library.json` cache agreed (`is_installed: false`). No discrepancy to record; the operator's choice checked out.
- **Recorded HEAD `54a931199`, not the planning-time `7d7a460ba`.** Two docs-only commits landed on the branch between Task 1's original session and this resume. The working tree was still clean at launch (`git status --porcelain -- src src-tauri package.json` empty), so build identity remained fully provable against the newer sha; per the plan's own "facts are mutable, re-confirm and record the executed value" instruction, I used the actual sha rather than the stale one.
- **Did not create a duplicate Task 1 commit.** The orchestrator's resume instructions anticipated this: `linux_sitting_capture.py` on disk was byte-identical to what commit `8c7b1821b` had already recorded, so only the live-process parts of Task 1 (relaunch, identity proof, `selftest`, log-sink check, native-install-setting check) were redone this session, with no new commit.
- **Held at the Task 2 checkpoint TWICE rather than trusting relayed operator claims.** The coordinator explicitly instructed independent verification, not trust, of "signed in" claims — this caught a real gap: the first signal only reflected GameLib's own in-app Steam login ("Connected"), not the desktop Steam client actually running, which `pgrep -x steam` disproved. Held and reported back rather than proceeding on the unverified claim; the second signal, after the operator started the client, verified clean.

## Deviations from Plan

### Auto-fixed / Recorded Issues

**1. [Procedural — cleanup] Sidecar process runs in its own process group, not the main dev-tree's**
- **Found during:** Task 1 re-verification (this session)
- **Issue:** The plan's Step 2 assumed `pnpm tauri:dev`'s whole tree (pnpm, tauri CLI, cargo, vite, `gamelib-shell`, sidecar node) shares ONE process group under `setsid`. Measured: the main tree shared PGID `23529` as expected, but the sidecar Node process (`build/main/sidecar.js`) ran in its OWN separate process group (PGID `24257`, i.e. its own PID). The Rust shell appears to spawn it via its own session, not as a child of the `setsid` group.
- **Fix:** Task 3 step H's cleanup explicitly killed both: `kill -TERM` the negative PGID `23529`, AND `kill -TERM` PID `24257` directly. Verified via bracketed-pattern `pgrep` that both were gone, along with an empty `:5173`.
- **Files modified:** None (process-tree-only, no source or planning-file change beyond what the plan already specified for cleanup verification).
- **Verification:** `pgrep -af '[g]amelib-shell|[b]uild/main/sidecar.js|[t]auri dev|[v]ite'` returned empty; `ss -Hltn '( sport = :5173 )'` returned empty.

**2. [Procedural — UI state] A stray docked-devtools panel was open in the GameLib window when I first re-checked Task 2's precondition**
- **Found during:** Task 2 re-verification (second round, after Steam client was confirmed running)
- **Issue:** The GameLib window's webview devtools were open and docked, occupying roughly the right/bottom half of the captured window region. F12 and Ctrl+Shift+I did not close it; a direct click on its own close (X) button did.
- **Fix:** Closed it via a coordinate click on its close button before taking any further coordinate-based screenshots or clicks, so all subsequent evidence captures show only the app UI.
- **Files modified:** None.
- **Verification:** Confirmed via a follow-up `grab` showing the clean login/Library UI with no devtools chrome.

---

**Total deviations:** 2 procedural/operational (0 source-code changes; no `src/` or `src-tauri/` file was touched, as the plan required).
**Impact on plan:** Neither affected the item's score or the evidence quality. Both are useful notes for the next Linux sitting (`38-S10`/`38-S12`/`38-S16`'s Linux half), which will reuse the same instrument and dev-build launch path.

## Issues Encountered

- An inline multi-line `&&`-chained shell one-liner for Task 3's full `<verify>` block intermittently returned a bare "Exit code 1" with no output when run directly via the Bash tool, even though every individual sub-check passed when run in isolation or via a `.sh` script file. Resolved by writing the verify chain to a temporary script and running `bash script.sh` instead — all checks passed cleanly and repeatably that way. Recorded here as a tooling quirk, not a defect in the plan or the ledger.
- None of the plan's STOP conditions (foreign process running, blank capture, identity mismatch, positive control failing) were triggered — the sitting proceeded cleanly once both checkpoint preconditions were genuinely satisfied.

## User Setup Required

None — no external service configuration required. The operator's own actions (Steam sign-in, starting the Steam client) were the checkpoint itself, already completed and independently verified before Task 3 ran.

## Next Phase Readiness

- `38-VERIFICATION.md` now holds 9 open items in `human_verification`: `38-W04`, `38-W05`, `38-S10`, `38-S12`, `38-S14`, `38-S16`, `38-E01`, `38-E03`, `38-E04`.
- **Cheap next candidates, since the Linux capture instrument now exists and is proven:** `38-S10` (section-gating matrix row 7 on Linux) and `38-S16`'s Linux half are strong candidates — the positive control run in this sitting already incidentally exercised the same "Install with options…" dialog surface those items cover, though nothing was scored against them here. `38-S12` also targets this same Linux host. All three can reuse `linux_sitting_capture.py` as-is.
- `38-W04`/`38-W05` remain blocked on a Windows CI artifact that has never been produced (no `v*` tag has been pushed).
- `38-E01`/`38-E03`/`38-E04` remain blocked on implementation/design-decision work, not a hardware switch.

---
*Phase: quick-260928-tvk*
*Completed: 2026-09-28*

## Self-Check: PASSED

All 13 claimed files found on disk (capture script, 6 evidence files, 4 modified phase/ledger
files, this SUMMARY.md itself); both claimed commits (`8c7b1821b`, `a9820f01d`) found in git log.
