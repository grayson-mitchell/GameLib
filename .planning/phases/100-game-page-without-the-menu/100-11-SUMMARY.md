---
phase: 100-game-page-without-the-menu
plan: 11
subsystem: shell
tags: [tauri, rust, invoke-timeout, gap-closure, cr-02]
status: complete

requires:
  - phase: 100-game-page-without-the-menu
    provides: "plan 10 and the Location row / danger zone that catch a rejected moveInstall, changeInstallPath or steamRemoveAllCopies invoke"
provides:
  - "timeout_for returns None for moveInstall, changeInstallPath and steamRemoveAllCopies, so a Move, Set install folder or Remove all copies settles only when the sidecar's handler has finished"
  - "A Rust pin test and a TS mirror (exact-set plus three member tests) that go red if any of the three entries is removed or only one side is edited"
affects: [100-12, 100-13, 100-14, verify-work]

plan_head_before: b65ca20a900c2c3a139c7908b99f1680fc51d2b1
plan_head_after: 221105d61454b03429b3b9f09aea8b49f89a59dc

actuals:
  tokens: 1325
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "LONG_RUNNING_CHANNELS entries added on a handler's shape carry a comment that says so and names the live check that will time them"

key-files:
  created: []
  modified:
    - src-tauri/src/main.rs
    - src/backend/__tests__/longRunningChannels.test.ts

key-decisions:
  - "The three channels were added on the handler's shape (like uninstall and the 2026-10-05 entries), not on a live timing; each comment says so and points at 100-HUMAN-UAT item 20, which times a Move over 60 s"
  - "The global INVOKE_TIMEOUT stays 60 s; the exemption is per channel (Duration::from_secs(60) count is unchanged at 3 and the getUserInfo, getGameSettings and getGameInfo bounded pins are untouched)"
  - "The existing iterating test every_long_running_channel_is_exempt_and_a_non_member_is_bounded was left alone, so there is still one list in Rust and one TS mirror, not a third"

requirements-completed: [D-10, D-12, D-18]

coverage:
  - id: D1
    description: "timeout_for(\"moveInstall\") is None, so the renderer's moveInstall invoke is not cut off at 60 s"
    verification:
      - kind: test
        ref: "cargo test --bin gamelib-shell exempt (8 passed), tests::install_location_and_remove_all_copies_channels_are_exempt and the iterating every_long_running_channel_is_exempt_and_a_non_member_is_bounded"
        status: pass
    human_judgment: true
    rationale: "Timed on handler shape only; a real Move over 60 s under Tauri is timed live by 100-HUMAN-UAT item 20 (plan 100-14)"
  - id: D2
    description: "timeout_for is None for changeInstallPath and steamRemoveAllCopies"
    verification:
      - kind: test
        ref: "cargo test --bin gamelib-shell exempt (8 passed): the same pin test asserts both"
        status: pass
    human_judgment: true
    rationale: "Added on shape, not timed live"
  - id: D3
    description: "Every channel off the list keeps the 60 s bound, and INVOKE_TIMEOUT is still 60 s"
    verification:
      - kind: test
        ref: "cargo test --bin gamelib-shell bounded (9 passed); longRunningChannels.test.ts INVOKE_TIMEOUT test"
        status: pass
    human_judgment: false
  - id: D4
    description: "The TS mirror list equals the Rust LONG_RUNNING_CHANNELS exactly"
    verification:
      - kind: test
        ref: "src/backend/__tests__/longRunningChannels.test.ts (53 passed) including the exact-set test and the three Phase 100 CR-02 member tests"
        status: pass
    human_judgment: false

duration: 15 min
completed: 2026-11-22
---

# Phase 100 Plan 11: Shell list: Move, Set install folder and Remove all copies wait on the backend Summary

**`moveInstall`, `changeInstallPath` and `steamRemoveAllCopies` join the Rust shell's `LONG_RUNNING_CHANNELS`, each with its own rationale, a `timeout_for(...) == None` pin and a TS mirror entry, so a long Move no longer shows a false "Move failed" at 60 s while the sidecar keeps copying (CR-02).**

## Accomplishments

- Task 1 (tracer): added `"moveInstall"` after `"launch"` with a comment block (the handler sends status 'moving' and awaits the whole copy; the Location row's catch made the 60 s rejection a false "Move failed" plus a Retry that could start a second move; added on shape, timed by UAT item 20). Added `install_location_and_remove_all_copies_channels_are_exempt` beside the oauth/humble pin, the `'moveInstall'` mirror entry and a member test. The `exempt` filter went from 7 to 8 tests, all green; the exact-set TS test stayed green only because both sides moved together.
- Task 2: added `"changeInstallPath"` (Legendary spawns `move --skip-move`; GOG and Nile do not spawn, they rewrite the installed record; comment says so accurately) and `"steamRemoveAllCopies"` (one delete per recorded root, then one poll: the `uninstall` shape times the number of roots). Extended the same pin test with both asserts, added both mirror entries and two member tests.
- Final tree: `cargo test --bin gamelib-shell exempt` 8 passed, `bounded` 9 passed, rustfmt reports 0 diffs in `src/main.rs`, `longRunningChannels.test.ts` 53 passed, `npx prettier --check` clean on the TS test (`--file-info` reported not ignored). `main.rs` has no prettier parser, so rustfmt is its formatter check, as the plan says.

## Task Commits

1. **Task 1: moveInstall tracer** - `7ae67d73e` (feat)
2. **Task 2: changeInstallPath and steamRemoveAllCopies** - `221105d61` (feat)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fresh worktree needed build prep before cargo test could compile**
- **Found during:** Task 1 verify
- **Issue:** `cargo test` in the new worktree failed in the tauri build script: `binaries/gamelib-sidecar-aarch64-apple-darwin` and `../build/webviewPreload.js` were missing (gitignored inputs).
- **Fix:** ran `pnpm build:sidecar-sea` and `pnpm exec vite build` (the documented prep for a fresh worktree). Both outputs are gitignored; `git status` stayed clean.
- **Files modified:** none tracked
- **Commit:** none

**2. [Verify wording] Task 1 criterion `grep -c "^ *'moveInstall',$"` printed 0 at the Task 1 commit**
- At Task 1 `'moveInstall'` was the last element of the mirror array, and prettier writes no trailing comma there, so the comma-suffixed pattern only matches once Task 2 appends the next entry. After Task 2 it prints 1, and every other Task 1 criterion held at the Task 1 commit (`"moveInstall",` count 1, pin count 1, exempt fns 8, tests green). No code change.

**Total deviations:** 1 auto-fixed (Rule 3, environment only), 1 criterion-wording note. **Impact:** none on the delivered code.

## Authentication Gates

None.

## Known Stubs

None.

## Threat Flags

None. No new endpoint, auth path, file access or schema change; the plan only changes how long the shell waits (T-100-29 accepted, T-100-30 untouched).

## Execution notes

- Sequential run in the linked phase worktree on `phase/100-gap-closure`. Per the dispatch instructions, STATE.md, state.json and ROADMAP.md were not touched, and no `state.*`, `roadmap.*` or `requirements.*` verbs were run (orchestrator owns tracking). Skipped those steps of execute-plan.
- Each task committed with `git commit -- <two paths>` only.
- Rust shutdown convention: no spawn, task, timer, socket or exit work added; only strings in a const `timeout_for` reads.
- `actuals.tokens` is chars/4 over `git diff b65ca20a9..HEAD` (5301 bytes), on the estimate's scale.

## Self-Check: PASSED

- FOUND: src-tauri/src/main.rs, src/backend/__tests__/longRunningChannels.test.ts
- FOUND commits: 7ae67d73e, 221105d61 (both ancestors of HEAD)
- `git rev-list --count` from the ledger base: 2 commits, matching `commits: 2`
