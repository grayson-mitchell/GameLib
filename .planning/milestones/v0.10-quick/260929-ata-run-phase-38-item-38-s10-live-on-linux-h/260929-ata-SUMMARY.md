---
phase: quick-260929-ata
plan: 01
subsystem: testing
tags: [linux, x11, atspi, steam, uat, verification, accessibility, playwright-alternative]

# Dependency graph
requires:
  - phase: 38-deferred-hardware-and-environment-uat-gates-windows-linux-ma
    provides: "the 38-S10 ledger item, the human-verification/discharge protocol, and ledger-check.cjs"
  - phase: quick-260928-tvk
    provides: "linux_sitting_capture.py (the visual capture instrument), the real-profile-arm precedent, and the persistent ~/.config/GameLib/ Steam-signed-in profile this sitting reused"
provides:
  - "38-S10 discharged PASS in 38-VERIFICATION.md's human_verification_discharged (Phase 38: 9->8 open, 17->18 discharged)"
  - "atspi_dialog_probe.py: a new, reusable AT-SPI text-tree instrument (dump/regions/smoke subcommands) for scoring dialog region facts independently of pixels"
  - "38-S12 readiness note: only 2 of 4 registered Steam library paths currently mount on this host"
affects: [38-S12, 38-S14, "38-S16 Linux half", 34.13-UAT.md]

# Actuals (#2632)
actuals:
  tokens: 20584
  tasks: 3
  commits: 1
  # MEASURED note: a second commit (65edd8cef, "spike-028") landed on this
  # branch during the operator's screen-unlock wait but was NOT made by this
  # plan -- it is unrelated concurrent activity on the shared branch. Only
  # e40379a63 is this plan's commit.

# Tech tracking
tech-stack:
  added: ["gi.repository.Atspi (AT-SPI2 Python bindings, already installed on this host)"]
  patterns:
    - "Two-instrument UAT scoring: a pixel-diff visual capture (linux_sitting_capture.py) plus an independent AT-SPI accessibility-tree probe, cross-validated with explicit positive/negative controls before trusting either"
    - "Declared real-profile arm (CLAUDE.md two-profile rule half 2), reusing a persistent signed-in Steam profile across sittings instead of a fresh fake HOME"

key-files:
  created:
    - .planning/quick/260929-ata-run-phase-38-item-38-s10-live-on-linux-h/atspi_dialog_probe.py
    - .planning/quick/260929-ata-run-phase-38-item-38-s10-live-on-linux-h/evidence/ (pre-open.png, dialog-settled.png, dialog-crop.png, region-checks.txt, atspi-dialog-subtree.txt, log-excerpt.txt, burst-summary.txt, baseline.env)
  modified:
    - .planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-VERIFICATION.md
    - .planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-HUMAN-UAT.md
    - .planning/phases/34.13-steam-install-time-wine-bottle-form-gog-parity/34.13-UAT.md
    - .planning/ROADMAP.md

key-decisions:
  - "Re-measured the ledger baseline live at execute time rather than trusting the plan's planning-time snapshot; it matched exactly (O=9, D=17, R=10), but OPEN_IDS did not match the planner's guessed order and had to be read from the live file instead"
  - "WazHack (sitting 6's target) was disqualified live: its own sitting-6 PASS click had, by execute time, completed a real Steam download, so its appmanifest now exists. Switched to 7 Days to Die (appId 251570), confirmed owned/not-installed on this host"
  - "Diagnosed an apparent WebKitGTK rendering freeze as an OS session-lock curtain (loginctl LockedHint=yes) via a full-desktop screenshot, rather than assuming a GameLib defect. Reported it as a human-action checkpoint, then re-verified unlock independently (LockedHint=no, fresh grab, same PID/exe) before resuming rather than trusting the operator's claim at face value"

patterns-established:
  - "AT-SPI dialog-region probe pattern: walk from the AT-SPI desktop child matching the target PID, tag every node with in_dialog/dialog_ordinal by tracking dialog-role ancestors during the walk, then count labelled substring signatures separately inside/outside dialog subtrees -- reusable for any future WebKitGTK dialog-region UAT item"

requirements-completed: [QUICK-260929-ATA]

# Metrics
duration: "~23min active work across two sessions, separated by a ~4h operator screen-unlock wait (Task 1 08:00-08:11 NZDT; checkpoint raised; resumed and Task 3 completed 12:13-12:25 NZDT)"
completed: 2026-09-29
status: complete
---

# Phase 38 Sitting 7 (Quick 260929-ata): `38-S10` PASS — Second Linux UAT Sitting, New AT-SPI Text-Tree Instrument

**Scored Phase 38 item `38-S10` (section-gating matrix row 7, native-OFF arm) live on Linux as PASS, using a new AT-SPI accessibility-tree probe alongside the existing pixel-diff visual instrument — all five region facts (platform row, library dropdown, wine section, free-space line, content-light notice) checked independently on both instruments with zero transient renders.**

## Performance

- **Duration:** ~23 min of active execution, split across two sessions by a ~4h operator screen-unlock wait (not GameLib-related — see Deviations)
- **Started:** 2026-09-29 ~08:00 NZDT
- **Completed:** 2026-09-29 12:25:33+13:00 (commit timestamp)
- **Tasks:** 3 (Task 1 tracer, Task 2 self-skipped checkpoint, Task 3 scoring + records + commit)
- **Files modified:** 13 (4 modified, 9 created)

## Accomplishments

- **`38-S10` scored PASS and discharged.** Section-gating matrix row 7 on a Linux host, tauri runtime, native Steam installs OFF: platform row, library dropdown, wine section (all three sub-signatures: WineSelector labels, `sharedBottleNotice`, and the `EligibilityLoadingRow` "Checking install options…" row) and free-space line were ALL confirmed ABSENT; the content-light notice was confirmed PRESENT, rendering the exact native-OFF arm string (`gamelib:steam.install.contentLightNotice`, not the single-library variant) — corroborating native-OFF a second, independent way beyond the `config.json` read.
- **Built and validated a new second instrument.** `atspi_dialog_probe.py` (dump/regions/smoke subcommands) reads the AT-SPI accessibility tree WebKitGTK exposes for the dialog — genuinely independent of pixels. It smoke-tested clean (app matched, 147 nodes visited, reached real web content beyond window chrome) and its region-count validity was proven with an explicit positive control (dialog open: ≥1 dialog-role node, `title` count 3, `content_light_off` count 1, a push button named "INSTALL" in the role histogram) and negative control (dialog closed: 0 dialog-role nodes anywhere).
- **Zero transient renders.** A 38-frame burst at 9.3fps (median interval 95.6ms) captured the dialog's entire open transition; `diff --flag 0.005` flagged only the 5 frames inside the expected ~505ms MUI Slide window, all individually viewed, none showing a scored region prematurely or unexpectedly.
- **Live target re-selection, not blind reuse.** WazHack (sitting 6's target) was checked and found now-installed (its own sitting-6 PASS click had since completed a real download) — disqualified live rather than assumed still valid. Switched to 7 Days to Die (appId 251570), independently confirmed owned and not installed on this host before use.
- **Ledger, narrative and origin records all updated and cross-validated.** `38-VERIFICATION.md` (9→8 open, 17→18 discharged, `audit-uat by_phase["38"]` 9→8, `total_items` 428→427, negative control on old counts fails, `--rev` check confirms the item was open at `PRE_SHA`), `38-HUMAN-UAT.md` (new `## Sitting 7` section, parser-safe), `34.13-UAT.md`'s origin receipt and body row walked back to DISCHARGED PASS (parses correctly in isolation; the pre-existing `(62:176)` census pin left untouched), and `ROADMAP.md`'s count paragraph updated with the prior paragraph marked historical.

## Task Commits

All work for this quick task landed in a single commit, as the plan's Step L specified (files created in Tasks 1–3 are all part of one deliverable set, not independently committable units):

1. **Tasks 1–3 combined** — `e40379a63` (docs)

_No separate per-task commits: the plan explicitly commits the probe script, evidence directory, and all four ledger/narrative/roadmap files together in one invocation._

## Files Created/Modified

- `.planning/quick/260929-ata-run-phase-38-item-38-s10-live-on-linux-h/atspi_dialog_probe.py` — new AT-SPI text-tree instrument (dump/regions/smoke)
- `.planning/quick/260929-ata-run-phase-38-item-38-s10-live-on-linux-h/evidence/` — baseline.env, pre-open.png, dialog-settled.png, dialog-crop.png, region-checks.txt, atspi-dialog-subtree.txt, log-excerpt.txt, burst-summary.txt
- `.planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-VERIFICATION.md` — `38-S10` moved to `human_verification_discharged`; `score:` counts and history updated
- `.planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-HUMAN-UAT.md` — `sessions:` entry, `## Current Test` pointer, new `## Sitting 7` section
- `.planning/phases/34.13-steam-install-time-wine-bottle-form-gog-parity/34.13-UAT.md` — origin receipt and `G-ROW-7 / tauri` body row walked back to DISCHARGED PASS
- `.planning/ROADMAP.md` — Phase 38 count paragraph updated, prior paragraph marked historical

## Decisions Made

- Re-measured every count live at execute time rather than trusting the plan's planning-time snapshot (which turned out accurate on counts, but wrong on `OPEN_IDS`'s exact array order — corrected from the live file before proceeding).
- Disqualified WazHack as the target live (it had become installed since sitting 6) and picked a new target (7 Days to Die, appId 251570), independently re-confirming owned/not-installed status before use rather than assuming the plan's suggested fallback would obviously work.
- Diagnosed the mid-Task-3 rendering freeze as an OS session lock (not a GameLib/WebKitGTK defect) using a full-desktop screenshot and `loginctl LockedHint`, avoiding an unnecessary "STOP, blank capture" abort per the plan's Step 4 language — the freeze looked identical to that failure mode but had a different, correctly-diagnosed cause.
- After the operator reported the screen unlocked, independently re-verified (`loginctl LockedHint=no`, re-run `find` for the same PID/exe, a fresh grab showing normal rendering) before clicking anything, rather than trusting the claim at face value — consistent with the sitting 6 precedent of not trusting an operator claim without independent confirmation.

## Deviations from Plan

### Auto-fixed / Recorded Issues

**1. [Rule 3 — Blocking, self-resolved] Target game (WazHack) had become installed since sitting 6**
- **Found during:** Task 3, Step A (target selection)
- **Issue:** The plan's preferred target, WazHack (264160), was expected to still be "owned, not installed" per sitting 6's state. Live check found `appmanifest_264160.acf` now exists in `/mnt/PopGames/SteamLibrary/steamapps/` — sitting 6's own PASS click had, in the time since, actually completed a real Steam download.
- **Fix:** Selected a new target per the plan's own fallback instruction ("if it still qualifies… otherwise the executor picks one"): 7 Days to Die (appId 251570), independently confirmed owned, visible, and not installed (no appmanifest in either currently-mounted library path) before proceeding.
- **Files modified:** None (target selection only; recorded in evidence and the ledger `result:`).
- **Verification:** `appmanifest_251570.acf` absent check against both mounted `libraryfolders.vdf` paths; game page confirmed "This game is not installed" with an Install button.

**2. [Rule 1 — apparent bug, correctly diagnosed as environmental] Mid-task rendering freeze was an OS session lock, not a WebKitGTK defect**
- **Found during:** Task 3, Step A (first click on the target game's cover)
- **Issue:** The captured window region froze into a byte-identical blurred-gradient frame across repeated grabs, clicks, and even a full process relaunch (new PID, new window). This superficially matched the plan's documented "blank capture" failure mode.
- **Fix:** Took a full-desktop screenshot instead of the window-region-only grab, which revealed a GDM/GNOME lock-screen curtain covering the whole display. Confirmed via `loginctl … LockedHint=yes`. One relaunch under `WEBKIT_DISABLE_DMABUF_RENDERER=1` was performed before this was diagnosed (harmless but unnecessary in hindsight — identity was re-proven cleanly on the new PID). Raised a `checkpoint:human-action` back to the orchestrator asking the operator to unlock the machine, left the dev build running, and resumed only after independently re-confirming `LockedHint=no` plus a fresh grab showing normal Library rendering.
- **Files modified:** None (process/environment only).
- **Verification:** `loginctl … LockedHint` before/after; full-desktop screenshot; post-unlock `find` matched the same PID/exe; post-unlock grab showed normal Library rendering with no lock curtain.

---

**Total deviations:** 2 (1 Rule 3 blocking-issue auto-fix, 1 Rule 1 bug-shaped issue correctly diagnosed as environmental and resolved via checkpoint). No source-code changes; no `src/` or `src-tauri/` file was touched, as the plan required (observation-only task).
**Impact on plan:** Neither affected the item's score or evidence quality. Both are useful notes for the next Linux sitting (`38-S12`/`38-S14`/`38-S16`'s Linux half): re-verify a target's install state live rather than trusting a prior sitting's assumption, and check `loginctl LockedHint` before assuming a frozen capture is a WebKitGTK bug.

## Issues Encountered

- A background/concurrent commit (`65edd8cef`, "spike-028") landed on this branch during the operator's screen-unlock wait, unrelated to this plan. It is correctly excluded from this plan's `actuals.commits` (measured as 1, not the naive 2 that a blind `git rev-list --count PRE_SHA..HEAD` would report) — see the `actuals` frontmatter note.
- None of the plan's other STOP conditions (foreign process running, positive control failing, dialog not fully in view) were triggered.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- `38-S12` (row 8, native ON with >1 library) and `38-S14` (both sub-cases) are the next candidates on this host, but `38-S12` needs a native-ON toggle and this host currently mounts only 2 of 4 registered Steam library paths (readiness note recorded, not scored).
- `38-S16`'s Linux half is also a cheap next candidate — both instruments (`linux_sitting_capture.py` and the new `atspi_dialog_probe.py`) are reusable as-is.
- Phase 38 now holds 8 open / 18 discharged / 10 retired items.

---
*Phase: quick-260929-ata*
*Completed: 2026-09-29*
