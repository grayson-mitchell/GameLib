---
phase: 49-cross-store-signed-out-offline-mode
plan: 12
subsystem: live-gate
tags: [live-gate, macos, keychain, sidecar-exit, runner-strings, uat, findings]
requires:
  - phase: 49-11
    provides: the contract, the UAT items, and the ready: live-gate todo
provides:
  - "49-LIVE-GATE.md `## Run 1` and `## Verdict`: FAIL 8/11 with every item's verdict, redacted literals, six findings, restores and the closing inventory"
  - "49-UAT.md: all eleven results scored (8 pass, 2 issue, 1 skipped)"
  - "eight pending todos (7 ready: code, 1 ready: live-gate) carrying the findings"
affects: [49-13 or a debug session on the renderer persistence findings]
actuals:
  tokens: 0
  tasks: 2
  commits: 0
plan_head_before: b536ae876
plan_head_after: b536ae876
commits: 0
tech-stack:
  added: []
  patterns:
    - "operator drives the GUI, the assistant shell drives capture/archive/induction when the operator's interactive zsh eats multi-line pastes (interactive_comments, banghist)"
    - "assistant-side PID checks use pgrep -x: a bash -c carrying the -f pattern self-matches"
    - "screencapture -x sees only the active Space; operator Cmd+Shift+3 moved from ~/Desktop is the reliable capture"
key-files:
  created:
    - .planning/todos/pending/2026-10-10-epic-expiry-deletes-user-json-and-the-ui-never-rebuilds-user-info.md
    - .planning/todos/pending/2026-10-10-library-sign-in-rows-do-not-rederive-a-mid-session-clear.md
    - .planning/todos/pending/2026-10-10-dismissed-sign-in-notice-returns-after-relaunch.md
    - .planning/todos/pending/2026-10-10-amazon-probe-is-a-no-op-with-nothing-installed.md
    - .planning/todos/pending/2026-10-10-nile-classifier-flips-on-stdout-stderr-interleaving.md
    - .planning/todos/pending/2026-10-10-not-connected-row-illegible-in-nord-light.md
    - .planning/todos/pending/2026-10-10-amazon-expiry-strings-need-a-real-induction.md
    - .planning/todos/pending/2026-10-10-library-sign-in-rows-placement-and-banner-height.md
  modified:
    - .planning/phases/49-cross-store-signed-out-offline-mode/49-LIVE-GATE.md
    - .planning/phases/49-cross-store-signed-out-offline-mode/49-UAT.md
    - .planning/todos/pending/2026-10-09-phase-49-macos-sign-in-live-gate.md
key-decisions:
  - "Launch 5 was not run: the item 5 induction is impossible by file edit (nile v1.2.0 encrypts its session; current_user.json has no token keys) and the item 6 observation was already made seven times in launches 1-4, 6, 7, 9 (installed count was 0 as found). Item 5 NOT SCORED, item 6 FINDING A4."
  - "The live-gate todo stays pending: the verdict is FAIL 8/11, not PASS 11/11."
  - "A post-launch-3 'repair' of Epic userInfo was written to the wrong file (GameLib/config.json instead of store/config.json) and its launch-4 'deleted again' observation retracted in the record; the launch-2 finding stands."
patterns-established:
  - "The probe layer (classify, verdict, bound, Keychain degradation, drain) passed every scored item; every failure and major finding is in renderer persistence/re-derivation or in a runner's side effect (legendary deleting user.json)."
requirements-completed: [R2, R3, R4, R5, R6, R7]
duration: ~105 min of operator time (10 launches, 9 run)
completed: 2026-10-09T21:40:00Z
---

# Phase 49 Plan 12: Run the macOS live gate — Summary

**Run 1 scored FAIL 8/11.** Items 1, 2, 3, 4, 7, 8, 9 and 11 passed; item 10 failed on its
relaunch leg; item 5 was not scorable; item 6 is a recorded A4 finding. The full record, with
redacted literals per launch and the closing inventory, is in `49-LIVE-GATE.md` `## Run 1`.

## What the gate proved

- A1, A2 CONFIRMED against the real binaries: legendary 0.21.0 prints
  `Stored credentials are no longer valid` for a rejected refresh token and
  `HTTP request for login failed` for a blocked host; gogdl v1.3.0 prints bare `null` with no
  `Failed to refresh credentials` for a dead token, and that exact line for a blocked host.
- Keychain Deny degrades to `unknown` via `class=unavailable`; an ignored prompt degrades to
  `unknown` at **45.009 s** by the sidecar's own bound, milliseconds ahead of Rust's timeout.
- The warm-profile sidecar drains **2.4 s** after stdin EOF with the pass in flight.
- One overlay per Sign in; a completed sign-in removes the row in-session and across a relaunch.

## What it found

| # | Finding | Severity | Todo |
|---|---|---|---|
| F-49-R1-1 | legendary deletes `user.json` on expiry; UI never rebuilds `userInfo` | major | epic-expiry-deletes-user-json… |
| F-49-R1-2 | a mid-session `cleared` reaches the Library only on remount | medium | library-sign-in-rows-do-not-rederive… |
| F-49-R1-3 | **item 10d FAIL**: dismiss persisted, row returned on relaunch | major | dismissed-sign-in-notice-returns… |
| F-49-R1-4 | A4: Amazon probe is a no-op with nothing installed | medium | amazon-probe-is-a-no-op… |
| F-49-R1-5 | nile classification flips on stdout/stderr order | medium | nile-classifier-flips… |
| F-49-R1-6 | nord_light: black text on dark banner | minor | not-connected-row-illegible… |
| — | item 5 needs server-side deregistration to induce | — | amazon-expiry-strings-need-a-real-induction (`ready: live-gate`) |
| — | operator: rows at top, banner half height | minor | library-sign-in-rows-placement… |

## Deviations from the contract

- Launch 5 skipped (reason above). Launch 2 screenshots missed (capture loop saw the wrong
  Space); copy operator-attested. No dialog screenshot for item 7. Theme judgment for item 10b
  given as a blanket pass by the operator rather than per theme.
- Shell side driven from the assistant's shell after three swallowed pastes; the operator drove
  the window, the Keychain dialogs and `sudo`.
- No `npx prettier --check`: every written path is under `.planning/**`, prettier-ignored.

## Verification

- Task 1 verify: `RUN RECORD OK`. Task 2 verify: `UAT SCORED`. `pnpm planning-gates`: 12/12.
