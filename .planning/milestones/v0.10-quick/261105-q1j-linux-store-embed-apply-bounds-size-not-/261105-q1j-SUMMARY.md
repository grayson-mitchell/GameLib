---
phase: quick-261105-q1j
plan: 01
subsystem: tauri-shell
tags: [linux, store-embed, gtk, live-experiment, apply_bounds]
status: complete
verdict: KEEP-A
kept_arm: A
requires: []
provides:
  - "Linux store embed re-reads its size request after a rect applied while hidden (apply_bounds queue_resize)"
affects: [src-tauri/src/main.rs]
key-files:
  created:
    - .planning/quick/261105-q1j-linux-store-embed-apply-bounds-size-not-/score.py
    - .planning/quick/261105-q1j-linux-store-embed-apply-bounds-size-not-/drive.py
    - .planning/quick/261105-q1j-linux-store-embed-apply-bounds-size-not-/BASE.sha
    - .planning/quick/261105-q1j-linux-store-embed-apply-bounds-size-not-/evidence/
  modified:
    - src-tauri/src/main.rs
    - .planning/todos/completed/2026-10-29-store-embed-follow-ups-off-windows.md
decisions:
  - "KEEP-A: embed_w.queue_resize() after set_size_request in linux_store_embed_layout::apply_bounds; Arm B (fixed.queue_resize()) not needed and not built"
  - "R5-shaped resets at 100% are non-discriminating on the unmodified build (the request equals the stale size); do not use R5 alone to judge a stale-size defect"
metrics:
  duration: "about 20 min of live driving plus build and test"
  completed: 2026-11-05
actuals:
  tokens: 14000
  tasks: 3
  commits: 3
plan_head_before: 7dd88b23d19f3cae1312e86fd576c48eaef69b39
commits: 3
---

# Phase quick-261105-q1j Plan 01: Linux store embed stale size, measured experiment Summary

**Verdict: KEEP-A.** `embed_w.queue_resize()` after `set_size_request` in `apply_bounds` made every
experiment-arm line pass (R1-R7, all 11 zoom-reset returns), after the unmodified build reproduced
the stale-size defect in the same session. `score.py verdict` computed this, not a hand judgement.

## What was done

- Task 1 (tracer + baseline): wrote `score.py` (tabulate / verdict / check-source / selftest) and
  `drive.py`; launched the unmodified build (BASE `7dd88b23d`); tracer proved the log sink (R1-1
  scored) and an end-to-end R2 (R2-1 scored FAIL); baseline ran R2 x2, R6 x2, R7 x2.
- Task 2 (Arm A): RED structural test failed on its presence assertion, then GREEN with
  `embed_w.queue_resize();` after `embed_w.set_size_request(rect.2, rect.3);`.
- Task 3 (experiment): rebuilt by `pnpm tauri:dev`, ran R1, R2 x6, R3, R4 x2, R5 x11, R6 x5, R7 x6.
  No failing line, so Arm B was never built; no revert.

## Baseline vs experiment (files scored by score.py)

| scenario | baseline | arm A (kept) |
| -------- | -------- | ------------ |
| R1 | 1 PASS | 1 PASS |
| R2 (100 to 120 zoom, away) | 2 FAIL | 6 PASS |
| R3 | not run | 1 PASS (2 settled lines) |
| R4 | not run | 2 PASS |
| R5 (zoom reset returns) | 4 PASS | 11 PASS |
| R6 (100 to 80 zoom, away) | 2 FAIL | 5 PASS |
| R7 (window resize, away) | 1 FAIL, 1 PASS | 6 PASS |
| REC (recovery nudges) | none needed | none needed |
| NO-LINE files | 0 | 0 |

Baseline failures were all the same shape: correct position, stale size left at the 100% value
(`744x618`). R2 requested `693x602` and got `744x618`; R6 requested `787x632` and got `744x618`;
R7 grow requested `894x638` and got `744x618`. These match the orchestrator's morning numbers in
shape (their window was larger, so the sizes differ).

## Every attempt file

R2/R6/R7 zoom and resize attempts ran at 1000x700 (R7 alternated 1000x700 and 1150x720; the window
manager did not clamp, actual geometry equalled the request). The R2 and R6 notes in each
`evidence/<arm>/notes.txt` record `origin_matches_zoom=True` for every attempt, a mechanical check
that the settled line's origin matched the intended zoom level. Notes hold geometry and outcome
only.

| arm | scenario | attempt | requested | embed | result |
| --- | -------- | ------- | --------- | ----- | ------ |
| baseline | R1 | 1 | 256,82,744x618 | 256,82,744x618 | PASS |
| baseline | R2 | 1 | 307,98,693x602 | 307,98,744x618 | FAIL |
| baseline | R2 | 2 | 307,98,693x602 | 307,98,744x618 | FAIL |
| baseline | R5 | 1 | 256,82,744x618 | 256,82,744x618 | PASS |
| baseline | R5 | 2 | 256,82,744x618 | 256,82,744x618 | PASS |
| baseline | R5 | 3 | 256,82,744x618 | 256,82,744x618 | PASS |
| baseline | R5 | 4 | 256,82,744x618 | 256,82,744x618 | PASS |
| baseline | R6 | 1 | 213,68,787x632 | 213,68,744x618 | FAIL |
| baseline | R6 | 2 | 213,68,787x632 | 213,68,744x618 | FAIL |
| baseline | R7 | 1 | 256,82,894x638 | 256,82,744x618 | FAIL |
| baseline | R7 | 2 | 256,82,744x618 | 256,82,744x618 | PASS |
| expA | R1 | 1 | 256,82,744x618 | 256,82,744x618 | PASS |
| expA | R2 | 1 | 307,98,693x602 | 307,98,693x602 | PASS |
| expA | R2 | 2 | 307,98,693x602 | 307,98,693x602 | PASS |
| expA | R2 | 3 | 307,98,693x602 | 307,98,693x602 | PASS |
| expA | R2 | 4 | 307,98,693x602 | 307,98,693x602 | PASS |
| expA | R2 | 5 | 307,98,693x602 | 307,98,693x602 | PASS |
| expA | R2 | 6 | 307,98,693x602 | 307,98,693x602 | PASS |
| expA | R3 | 1 | 307,98,693x602 | 307,98,693x602 | PASS |
| expA | R4 | 1 | 307,98,693x602 | 307,98,693x602 | PASS |
| expA | R4 | 2 | 307,98,693x602 | 307,98,693x602 | PASS |
| expA | R5 | 1-11 | 256,82,744x618 | 256,82,744x618 | PASS (all 11) |
| expA | R6 | 1 | 213,68,787x632 | 213,68,787x632 | PASS |
| expA | R6 | 2 | 213,68,787x632 | 213,68,787x632 | PASS |
| expA | R6 | 3 | 213,68,787x632 | 213,68,787x632 | PASS |
| expA | R6 | 4 | 213,68,787x632 | 213,68,787x632 | PASS |
| expA | R6 | 5 | 213,68,787x632 | 213,68,787x632 | PASS |
| expA | R7 | 1 | 256,82,894x638 | 256,82,894x638 | PASS |
| expA | R7 | 2 | 256,82,744x618 | 256,82,744x618 | PASS |
| expA | R7 | 3 | 256,82,894x638 | 256,82,894x638 | PASS |
| expA | R7 | 4 | 256,82,744x618 | 256,82,744x618 | PASS |
| expA | R7 | 5 | 256,82,894x638 | 256,82,894x638 | PASS |
| expA | R7 | 6 | 256,82,744x618 | 256,82,744x618 | PASS |

Per-file detail, including R3-1's two settled lines (`843x622` at 1150x720, then `693x602` at
1000x700) is in `evidence/attempts.tsv` and the `evidence/*/R*.log` files. Experiment-arm extras:
R2-6 (entering the zoom-120 state for R3/R4) and R4-2 (the GOG, Epic, GOG leg, scored separately
from the plan's R4-1 final-return file); both PASS and both count in the verdict's "every file".

## GTK source reading: SUPPORTED, not proven

The planner's reading (GTK 3.24.33: `set_size_request` queues a resize only on a visible widget;
`gtk_fixed_size_allocate` allocates a child at its cached preferred size; D-21 hides the embed on
route leave and `store_embed_open` applies the rect before `show()`) predicts exactly the observed
baseline failures (new position, old size) and the change that targets it fixed all of them. The
measurements do not isolate the cache as the mechanism beyond that, and Arm B was never run to rule
the Fixed's own queue in or out. The reading's own prediction of "redundant" for `fixed.queue_resize()`
stays untested.

## R5 reset observations

- The R5-shaped zoom reset (120 or 80 back to 100) PASSED on the unmodified build in 4 of 4
  attempts. It is not a recovery: the request at 100% is `744x618`, which is exactly the stale size
  the failed R2 or R6 had left in the embed. The baseline R7 shrink back to 1000x700 passes for the
  same reason. This explains the morning's single R5 pass, which the plan flagged as unexplained
  (the plan guessed an internal WebKit resize; no evidence of one was needed).
- Consequence: R5, and any "return to the original size" step, cannot discriminate a stale-size
  defect at the original size. With the change all 11 returns passed, and now meaningfully.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] drive.py window lookup filters by WM_CLASS**
- **Found during:** Task 1
- **Issue:** `xdotool search --onlyvisible --name GameLib` also matches an editor window with the
  repo open (a VS Code window titled with GameLib), so the plan's "largest geometry" rule could pick
  the wrong window.
- **Fix:** `drive.py` keeps only windows whose WM_CLASS is `gamelib-shell`, then takes the largest.
- **Files modified:** drive.py (this task's own file)

**2. [Rule 3 - Blocking] The plan's ps-based "no dev process left" check false-positives on a
command that itself names the binary**
- **Found during:** Task 3 verify
- **Issue:** `ps -eo args | grep -E '[g]amelib-shell|...'` matches the verifying shell's own command
  line whenever that command contains `cargo test --bin gamelib-shell`, as the plan's verify does.
- **Fix:** confirmed teardown with `pgrep -x gamelib-shell`, a sidecar-path pgrep and a vite pgrep
  (all 0), and separately with `ps` in commands that do not name the binary (0 remaining).

### Plan interpretations worth recording

- **Store shown:** the Stores route restored the GOG store view, not Steam. R1-R7 are about the
  embed geometry, not the store, so GOG was kept. Steam was not navigated to, to avoid signed-in
  account surface.
- **NO-LINE rule:** `score.py` treats NO-LINE as missing data (never a pass, never counted toward
  the 5), and "every expA file PASS" as "no expA FAIL". No NO-LINE file occurred, so it did not
  matter here. `--selftest` covers both cases.
- **Experiment arm start:** expA's first R1-1 attempt was a navigation mistake (zoom still 80, so a
  click landed on Downloads); that file held zero lines and was overwritten by the redone R1-1. It
  was never a scored attempt.
- **Baseline size:** 2 attempts each of R2/R6/R7, as the plan allows once any FAIL appears.
- **R7 baseline shrink** passed trivially (see R5 observations).

## Known Stubs

None.

## NOT VERIFIED

- Wayland, HiDPI or `GDK_SCALE` above 1, the packaged build, any other host or driver.
- macOS and Windows: code untouched there; `store_embed_open` and `store_embed_linux_settled_line`
  are byte-identical to BASE (diffed).
- Zoom steps other than 100 to 120 and 100 to 80; window sizes other than 1000x700 and 1150x720.
- Whether the open-time apply or the renderer's follow-up flush repaired the size; one debounced
  settled line cannot tell them apart.
- The settled line is GTK's allocation, not a pixel comparison.
- The baseline arm is small (2 each of R2/R6/R7). Together with the first orchestrator run that
  makes the defect reproducible, but this is not a frequency estimate.

## Real-profile arm declaration and cleanup

Both live arms inherited the operator's real HOME on purpose (CLAUDE.md two-profile rule): the
defect was measured under the signed-in profile and the Stores route state is part of the condition.

- Only `store_embed(linux)` geometry lines were copied out (`drive.py collect`); the raw dev logs
  stayed in the scratchpad and were deleted after each arm.
- Screenshots were cropped, kept in the scratchpad, never committed, and deleted after each arm.
- Redaction grep over `evidence/` for `userid|username|galaxy|token|cookie|password|/home/`:
  0 matches.
- POST_TEARDOWN_PROCS=0 after both arms: process group SIGTERM, then `pgrep` for the shell binary,
  the sidecar path and vite all 0 (the group kill reaped the sidecar; no orphan seen).
- Zoom restored to the recorded start value 80 and window to 1280x800 after each arm, each
  confirmed with a cropped screenshot and `drive.py win`. The window's screen position is not
  restored (the shell places it at launch; position was not recorded and the plan asks only for
  zoom and size).
- Build identity: baseline process started after the binary's mtime; for the experiment arm the
  binary was rebuilt by `tauri:dev` after the Task 2 commit (size changed) and the running image
  was `cmp`-identical to the file on disk.
- The two pre-existing untracked paths under `.planning/spikes/025-linux-add-child-compile/` were
  not staged or committed.

## Commits

- `e8b42f199` test(quick-261105-q1j): Linux embed stale-size baseline arm (real-profile arm)
- `72d632ac4` fix(store-embed): queue a GTK resize after the Linux embed's set_size_request
  (experiment arm A, quick 261105-q1j), kept by the verdict
- `35e5aa56b` test(quick-261105-q1j): Linux embed experiment arm and verdict KEEP-A

Verification at final HEAD: `score.py --selftest` PASS, `check-source` OK (queue_resize present,
no `fixed.queue_resize`), `cargo test --bin gamelib-shell store_embed` 71 passed 0 failed (new test
provably selected), `store_embed_open` byte-identical to BASE, `pnpm planning-gates` 12/12.

The store-embed follow-ups todo was moved to `.planning/todos/completed/` with a dated section.

## Self-Check: PASSED

- score.py, drive.py, BASE.sha, evidence/attempts.tsv, evidence/verdict.txt (KEEP-A): present.
- Commits e8b42f199, 72d632ac4 and 35e5aa56b: present in `git log`.
