---
phase: quick-260930-rph
plan: 01
subsystem: login-window
tags: [windows, tauri, webview2, live-gate, title-bar, instrument]
requires: []
provides:
  - live Windows confirmation that the login window's composed title survives PageLoadEvent::Finished (runtime half of ae5968b07)
  - a reusable, self-tested 5 ms title-bar instrument (title-watch.ps1) with an independent node re-scorer
key-files:
  created:
    - .planning/quick/260930-rph-close-the-login-window-title-todo-live-v/title-watch.ps1
    - .planning/quick/260930-rph-close-the-login-window-title-todo-live-v/rph-rescore.cjs
    - .planning/quick/260930-rph-close-the-login-window-title-todo-live-v/evidence/rph-prediction.md
    - .planning/quick/260930-rph-close-the-login-window-title-todo-live-v/evidence/rph-live.txt
    - .planning/quick/260930-rph-close-the-login-window-title-todo-live-v/evidence/rph-timeline.jsonl
    - .planning/quick/260930-rph-close-the-login-window-title-todo-live-v/evidence/rph-rescore.txt
  modified:
    - .planning/todos/completed/2026-09-27-login-window-title-bar-composed-title-survives-finished-needs-a-windows-linux-sitting.md (moved from pending/, R100)
decisions:
  - "Verdict PASS via FIN-B: the MSAA probe never saw busy SET, so FIN-A was unavailable by its pre-registered rule; FIN-B (controlled Humble origin, HOLD >= 60 s) was the path used"
  - "38-VERIFICATION.md left unedited: 38-W03's accepted FAIL is superseded in the todo's Result, and the item stays in human_verification_discharged as the historical record"
status: complete
completed: 2026-09-30
verdict: PASS
commits: 4
plan_head_before: 4da0f84ec3954843cdcd988d2f32b962ff49c76b
plan_head_after: 2afc4b251767548b32c6994f6fdc6edadeb0c8b7
actuals:
  tokens: 23700
  tasks: 3
  commits: 4
---

# Phase quick-260930-rph Plan 01: Close the login-window title todo live on Windows Summary

**VERDICT: PASS.** The installed CI release build showed the right title in its Humble sign-in window on this Windows 11 machine. The window opened with the bare origin, switched to the composed `<origin> — <document title>` form 619 ms later, and then kept that composed title unchanged for 90 s until the harness closed the window. It never reverted to the bare origin. The independent re-score agreed. The todo is closed to `completed/`.

## Observed titles

From `evidence/rph-timeline.jsonl` (5 ms `GetWindowTextW` sampler, hwnd `0x140CFC`, launched pid 30676):

| t (ms from launch) | event | title |
|---|---|---|
| 65989.4 | window visible (`t_open`) | `https://www.humblebundle.com` |
| 66608.2 | change (`t_comp`) | `https://www.humblebundle.com — Humble Bundle - Log In` |
| 156613.4 | WM_CLOSE posted | `https://www.humblebundle.com — Humble Bundle - Log In` (HOLD 90029 ms, `nav_reset_episodes: 0`) |

Finished status: no log channel marks `Finished` in this build. The MSAA load probe never saw busy SET (one sample, `busy: false`), so FIN-A was unavailable by its pre-registered rule, not bypassed. FIN-B carried C7: the final origin is the controlled Humble origin and HOLD 90029 ms is at least 60000 ms. That argument is anchored on 38-W03's pre-fix observation of the same page on this machine (sitting 4, build `5b6201e26`), where the title reverted to the bare origin.

## Checks

- **Instrument (`evidence/rph-live.txt`):**
  - P1–P3 PASS.
  - C0 PASS: p99 gap 6.59 ms, max gap near open 22.03 ms.
  - C1–C8 PASS, with `fin_path: B`.
  - C6: the applied line is `title change applied len=22`, and `Humble Bundle - Log In` is 22 bytes.
  - C9: 0 `humble_login_open` lines in the shell log, as predicted.
- **Independent (`evidence/rph-rescore.txt`):**
  - The node re-score reads C2–C5 all PASS and `FINAL_TITLE_COMPOSED: yes` (`RESCORE_AGREES: yes`).
  - A bash `tail -c +13684` over the shell log re-counts C9 at 0, matching the instrument.
  - Bash `tasklist` reports zero `gamelib-shell.exe` and zero `gamelib-sidecar.exe`.
- **Plan verify:** the full `<verify>` block printed `TASK3_OK`, and `PYTHONUTF8=1 pnpm planning-gates` reported 12/12.

## Tasks

| Task | What | Commit |
|---|---|---|
| 1 (tracer) | Built `title-watch.ps1` and `rph-rescore.cjs`, then self-tested the scorer: the bug shape scored FAIL, the fix shape PASS, no-title INCONCLUSIVE, and the re-score agreed on all three. Smoke launched the real app and tore it down to zero processes. Build identity was re-confirmed, and the prediction was pre-registered. | `26c6d1458` |
| 2 (checkpoint:human-action) | The operator quit GameLib and replied `go humble`. | none |
| 3 | Re-checked zero processes, then ran Live once in the foreground (exit 0, VERDICT PASS). Ran the independent post-checks and the privacy/ASCII/CR checks, then committed the evidence. | `60b1037fb` |
| 3 | Pure rename of the todo, pending/ to completed/ (R100). | `2b36623aa` |
| 3 | Added frontmatter `status: RESOLVED` and `resolved: 2026-09-30`, plus the Result and Resolution sections. | `2afc4b251` |

Commits are counted with `git log --grep=quick-260930-rph`, which finds 4. A plain `rev-list 4da0f84ec..HEAD` also counts a concurrent quick task (`260930-te5`, 4 commits) and a merge, both of which landed between Task 1 and Task 3.

## Deviations from Plan

**1. [Rule 1 - Bug] The re-score output contained a raw U+2014, which would fail the evidence pure-ASCII check.**
- **Found during:** Task 3, step 3.
- **Issue:** `rph-rescore.cjs` prints `FINAL_TITLE` with a literal em dash. SelfTest never wrote the re-score to disk, so it did not catch this.
- **Fix:** Re-derived `rph-rescore.txt` by piping the same re-score run through a mechanical escaper. It rewrites every non-ASCII code unit as `\uXXXX`, the convention `rph-live.txt` and the timeline already use. No count or title was hand-edited, and the instrument script is unchanged.
- **Commit:** `60b1037fb`.

**2. [Note] Commits went to `main`.** This matches `branching_strategy: none`, Task 1 and the project's quick-task practice.

## Known Stubs

None.

## Honest limits

- One host, one launch, one page (Humble).
- The observation is the caption string, not the drawn pixels.
- FIN-B is an anchored argument against a pre-fix control. It is not a timestamp, so it does not independently prove that `Finished` fired.
- The load probe enabled Chromium accessibility.
- The Linux half of the todo's "Windows or Linux" is not exercised.

## Self-Check: PASSED

- The files exist: `evidence/rph-live.txt`, `rph-timeline.jsonl`, `rph-rescore.txt`, `rph-shell-lines.txt`, `rph-loadprobe.jsonl`, and the completed todo. The pending todo is absent.
- The commits exist: `26c6d1458`, `60b1037fb`, `2b36623aa`, `2afc4b251`.
