---
phase: quick-261014-rso
plan: 01
subsystem: ui
tags: [wkwebview, tauri, rust, jest, epic-embed, nav-state]

requires:
  - phase: 50-epic-store-in-app-on-macos-a-rust-managed-raw-wkwebview-subv
    provides: "The raw-WKWebView Epic embed, its GAP-D nav-event drain, the load-timeout monitor, and G-50-16's diagnosis in 50-UAT.md"
provides:
  - "A sticky intra-batch loadTimedOut merge in the renderer's GAP-D drain (useStoreEmbedHost.ts)"
  - "A cfg-free Rust lifecycle table (epic_embed_state.rs) stating which WKNavigationDelegate hooks may clear a load_timed_out raise"
  - "A navigation failure no longer clears load_timed_out in macos_epic_embed.rs (the other three lifecycle hooks still do)"
  - "G-50-16 annotated in 50-UAT.md with the fix applied, still status: failed pending a live-gate re-run"
  - "A pending/ todo filing the owed macOS live-gate re-run of UAT Item 16"
affects: [epic-embed, webview, macos-live-gate]

actuals:
  tokens: 5156
  tasks: 3
  commits: 3
  plan_head_before: a9fdf76ae8cbe9613c4c66287dbbc09759a16faf
  plan_head_after: 6299e7be0b84295f65375846a613e0eda0d1c1f9

tech-stack:
  added: []
  patterns:
    - "A one-shot raise flag drained from a coalescing batch poll must be merged stickily (any-true-wins) across the whole batch, not applied from only the last event -- the same shape blockedLauncherSchemeCount already used a monotonic counter to solve."
    - "A cfg-free Rust module stating a cross-platform decision table (here: which lifecycle event may clear a flag) runs on every CI leg, unlike a target_os-gated test that runs on only one."

key-files:
  created:
    - .planning/todos/pending/2026-10-14-epic-timeout-banner-fix-needs-a-live-gate-re-run.md
  modified:
    - src/frontend/screens/WebView/useStoreEmbedHost.ts
    - src/frontend/screens/WebView/__tests__/useStoreEmbedHost.test.tsx
    - src-tauri/src/epic_embed_state.rs
    - src-tauri/src/macos_epic_embed.rs
    - .planning/phases/50-epic-store-in-app-on-macos-a-rust-managed-raw-wkwebview-subv/50-UAT.md

key-decisions:
  - "Renderer fix (sticky intra-batch merge) is the necessary-and-sufficient half; the Rust lifecycle table is a real but secondary durability improvement for the case where the failure lands in a LATER drain batch than the raise. Both were built, in that order, per the plan's own re-verified diagnosis."
  - "G-50-16 stays status: failed in 50-UAT.md -- a code fix is not a live observation. The gap gained a fix_applied: key; the owed live-gate re-run is tracked as a pending/ todo with severity: major, platform: macos, ready: live-gate."
  - "The toolbar Reload button's lack of a disabled prop during a hung load is resolved as intentional, not a defect: clicking through a hang is an accepted operator action the banner must survive. Recorded by striking the open missing: question in 50-UAT.md with its resolution."

requirements-completed: [G-50-16]

coverage:
  - id: D1
    description: "A single 250ms drain batch containing a loadTimedOut:true event followed by one or more loadTimedOut:false events in the SAME batch surfaces loadTimedOut===true from the hook (the observed-red race, G-50-16's live sequence)."
    requirement: "G-50-16"
    verification:
      - kind: unit
        ref: "src/frontend/screens/WebView/__tests__/useStoreEmbedHost.test.tsx#46. a loadTimedOut raise survives later false events in the same drain batch"
        status: pass
    human_judgment: false
  - id: D2
    description: "A LATER drain batch carrying only loadTimedOut:false still clears the flag -- the latch is per-batch, not permanent (D-07's genuine-finish-clears-banner survives)."
    requirement: "G-50-16"
    verification:
      - kind: unit
        ref: "src/frontend/screens/WebView/__tests__/useStoreEmbedHost.test.tsx#47. a later all-false drain batch still clears a previously-surfaced loadTimedOut flag"
        status: pass
    human_judgment: false
  - id: D3
    description: "A WKNavigationDelegate navigation failure no longer clears load_timed_out; the other three lifecycle hooks (provisional start, finish, content-process termination) still do, encoded once in a cfg-free module with a test per arm."
    requirement: "G-50-16"
    verification:
      - kind: unit
        ref: "src-tauri/src/epic_embed_state.rs#epic_embed_state::tests::a_navigation_failure_does_not_clear_a_timeout_raise"
        status: pass
      - kind: unit
        ref: "src-tauri/src/epic_embed_state.rs#epic_embed_state::tests::a_provisional_navigation_start_clears_a_timeout_raise"
        status: pass
      - kind: unit
        ref: "src-tauri/src/epic_embed_state.rs#epic_embed_state::tests::a_navigation_finish_clears_a_timeout_raise"
        status: pass
      - kind: unit
        ref: "src-tauri/src/epic_embed_state.rs#epic_embed_state::tests::a_content_process_termination_clears_a_timeout_raise"
        status: pass
    human_judgment: false
  - id: D4
    description: "G-50-16 stays status: failed in 50-UAT.md, annotated with the code fix (fix_applied: key), and a pending/ todo exists carrying the owed live-gate re-run with the three CI-enforced triage keys (severity: major, platform: macos, ready: live-gate)."
    requirement: "G-50-16"
    verification:
      - kind: other
        ref: "pnpm planning-gates (12/12 passed, including .planning/todos/todo-frontmatter-gate.py)"
        status: pass
    human_judgment: false
  - id: D5
    description: "StoreEmbedTimeoutBanner actually appears on a real hung Epic store, with Reload and Open in browser on one row at minimum window width -- the live behavior this whole fix is for."
    verification: []
    human_judgment: true
    rationale: "Jest exercises the drain at the storeEmbedTakeNavEvents mock seam, not a real IPC round trip; the Rust tests exercise a pure function, not a live WKNavigationDelegate callback sequence. Only the macOS live gate (filed as the pending/ todo) can observe the banner actually painting."

duration: not measured (no start timestamp was captured before execution began)
completed: 2026-10-14
status: complete
---

# Quick Task 261014-rso: Latch the Epic embed's load-timed-out raise Summary

**Fixed G-50-16 by making the renderer's GAP-D drain merge `loadTimedOut` stickily across each 250ms poll batch instead of applying only the last event, plus a cfg-free Rust table that stops a navigation failure from clearing the same flag.**

## Performance

- **Tasks:** 3/3 completed
- **Files modified:** 6 (2 renderer, 2 Rust, 1 UAT doc, 1 new todo)
- **Commits:** 3 (measured: `git rev-list --count a9fdf76ae..6299e7be0` = 3)

## Accomplishments

- The GAP-D drain in `useStoreEmbedHost.ts` now merges `loadTimedOut` stickily: if any event in a drained batch has it strictly `=== true`, the hook surfaces `true` even when a later event in the same batch carries `false`. Superseded fields (url/host/canGoBack/canGoForward) still take only the last event.
- Added jest property 46 (the observed-red regression test reproducing G-50-16's exact live sequence: raise, `-999` failure, next provisional start, all in one batch) and property 47 (boundary guard: a later all-false batch still clears, preserving D-07).
- Added a cfg-free `EpicEmbedNavLifecycle` enum and `epic_embed_clears_load_timeout` function in `epic_embed_state.rs`, with one unit test per of its four variants. All four `load_timed_out = false` call sites in `macos_epic_embed.rs` now consult it; only the navigation-failure site's behavior actually changed.
- `50-UAT.md`'s `G-50-16` gap block gained a `fix_applied:` key and kept `status: failed`; the previously-open toolbar-Reload question was resolved as intentional (Reload stays enabled during a hang) rather than left as an open decision.
- Filed `.planning/todos/pending/2026-10-14-epic-timeout-banner-fix-needs-a-live-gate-re-run.md` carrying the owed macOS live-gate re-run of UAT Item 16, with `severity: major`, `platform: macos`, `ready: live-gate`.

## RED proof (Task 1, step 2 — captured before any production code was touched)

Ran `npx jest src/frontend/screens/WebView/__tests__/useStoreEmbedHost.test.tsx` with only the two
new test properties added (no production change yet):

```
Test Suites: 1 failed, 1 total
Tests:       1 failed, 57 passed, 58 total
```

The one failure, verbatim:

```
● useStoreEmbedHost (Phase 40 Plan 08, D-18/D-19/D-20/D-21) › 46. a loadTimedOut raise survives later false events in the same drain batch

    expect(received).toBe(expected) // Object.is equality

    Expected: true
    Received: false

      1345 |     const after = reinvoke(options)
      1346 |
    > 1347 |     expect(after.loadTimedOut).toBe(true)
           |                                ^
      1348 |   })
```

Property 47 passed in this same RED run (57 of 57 non-46 tests passed), exactly as the plan
predicted: it is a boundary guard, not an observed-red property, and does not require the
production fix to be green.

## Measured before/after counts

| command | before (plan's recorded baseline) | after this fix |
|---|---|---|
| `npx jest .../useStoreEmbedHost.test.tsx` | 56 passed / 56 total | **58 passed / 58 total, 0 failed** |
| `cargo test --manifest-path src-tauri/Cargo.toml --bin gamelib-shell` | 390 passed; 0 failed; 2 ignored | **394 passed; 0 failed; 2 ignored** |
| `pnpm codecheck` | exit 0 | exit 0 |
| `cargo fmt -- --check` | exit 0, no output | exit 0, no output |
| `npx prettier --check` (the two TS paths) | "All matched files use Prettier code style!" | same, after one `--write` pass on `useStoreEmbedHost.ts` (see Issues Encountered) |
| `pnpm planning-gates` | 12/12 passed | 12/12 passed |

The scoped jest and cargo runs above are SCOPED, not suite-wide passes; the plan's own
`<verification>` section states the full tree's baseline separately (547 suites / 11894 tests,
measured on a different commit) and this task did not re-run that full suite.

## Task Commits

Each task was committed atomically, code changes only:

1. **Task 1: Sticky intra-batch loadTimedOut merge + regression test** - `5ba1dd645` (fix)
2. **Task 2: Stop a navigation failure from clearing a timeout raise** - `f32f4757b` (fix)
3. **Task 3: Record the fix against G-50-16 and file the owed live-gate re-run** - `6299e7be0` (docs)

No separate plan-metadata commit was made by this executor — per this execution's constraints,
the orchestrator handles the SUMMARY.md/STATE.md docs commit.

## Files Created/Modified

- `src/frontend/screens/WebView/useStoreEmbedHost.ts` - GAP-D drain now merges `loadTimedOut` stickily across a batch; rewrote the "Apply the LAST event only" comment to state both halves (superseded fields vs. the one-shot raise).
- `src/frontend/screens/WebView/__tests__/useStoreEmbedHost.test.tsx` - added properties 46 and 47, placed directly after property 27.
- `src-tauri/src/epic_embed_state.rs` - added `EpicEmbedNavLifecycle` and `epic_embed_clears_load_timeout`, plus four unit tests.
- `src-tauri/src/macos_epic_embed.rs` - extended the `epic_embed_state` import; all four `load_timed_out = false` sites now gated on `epic_embed_clears_load_timeout`; updated the field doc comment and the shared failure-handler doc comment.
- `.planning/phases/50-epic-store-in-app-on-macos-a-rust-managed-raw-wkwebview-subv/50-UAT.md` - `G-50-16` gained `fix_applied:`; its last `missing:` bullet was replaced with the toolbar-Reload resolution. No `### N.` heading, `expected:` line, or `result:` line was touched.
- `.planning/todos/pending/2026-10-14-epic-timeout-banner-fix-needs-a-live-gate-re-run.md` - new, carries the owed macOS live-gate re-run.

## Decisions Made

See `key-decisions` in the frontmatter above.

## Deviations from Plan

None - plan executed exactly as written. Every claim in the plan's `## Diagnosis` section was
re-confirmed true at the point this task touched the relevant code:

- The drain at `useStoreEmbedHost.ts` applied only `events[events.length - 1]`, confirmed before editing.
- `loadTimedOut` was confirmed optional (`navState.loadTimedOut ?? false`).
- All four Rust call sites (`did_finish_navigation`, `did_start_provisional_navigation`, `epic_embed_handle_navigation_failure`, content-process termination) were found at exactly the line numbers the plan cited, each with an unconditional `load_timed_out = false`.
- Property 46 was confirmed RED before the production edit (see RED proof above), and property 47 was confirmed green before the edit too, exactly as the plan predicted for a boundary guard.

## Issues Encountered

One minor, auto-fixed issue (Rule 3 - blocking, formatting): after writing the production merge
in `useStoreEmbedHost.ts`, `npx prettier --check` on that file failed with a formatting warning
(the object-spread/ternary expression did not match the repo's prettier config). Ran
`npx prettier --write` on that single file and re-ran `--check`, which then reported "All matched
files use Prettier code style!" for both TS paths. No other issues.

## Known Stubs

None.

## Threat Flags

None — this change adds no new attack surface. See the plan's own `<threat_model>` (T-261014-rso-01/02/SC), which still accurately describes the landed diff: no new IPC channel, field, network call, or dependency; the renderer edit is a pure expression over an array the drain already held, and the Rust edit is a pure total function over a four-variant enum with no I/O.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

The code fix is complete and verified by the full battery of automated checks (jest, cargo test,
codecheck, prettier, cargo fmt, planning-gates). What remains, and is explicitly NOT closed by
this task, is the macOS live-gate re-run of UAT Item 16 to confirm `StoreEmbedTimeoutBanner`
actually paints on a real hung Epic store — tracked in
`.planning/todos/pending/2026-10-14-epic-timeout-banner-fix-needs-a-live-gate-re-run.md`.
`G-50-16` in `50-UAT.md` must stay `status: failed` until that re-run lands a result.

---
*Phase: quick-261014-rso*
*Completed: 2026-10-14*

## Self-Check: PASSED

All 7 claimed files found on disk; all 3 claimed commit hashes (`5ba1dd645`, `f32f4757b`,
`6299e7be0`) found in `git log --oneline --all`.
