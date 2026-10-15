---
phase: quick-261015-p3q
plan: 01
subsystem: frontend-state/accessibility
tags: [accessibility, zoom, tauri, boot-path, globalstate, preload, webview, todos]

requires: []
provides:
  - "savedZoomBoot.ts: a pure, injected-deps helper that resolves a persisted zoomPercent (60-200 admitted, else 100) and applies it exactly once, undebounced, through window.api.setZoomFactor"
  - "A single new call site in GlobalState.componentDidMount, first statement of the method, reading this.state.zoomPercent directly"
  - "A source-text wiring gate (GlobalStateSavedZoomWiring.test.ts) with a self-test arm proving its matchers can fail three independent ways"
  - "A corrected tauriWindowChrome.ts doc comment that no longer asserts the opposite of current behaviour"
  - "The source todo closed into completed/ with a ## Resolution; a live-gate follow-up todo filed for the un-deskable half"
affects: [accessibility, tauri-boot-path, library-tile-sizing]

actuals:
  tokens: 8896
  tasks: 3
  commits: 3
  plan_head_before: 92037fcc63522fc54a56e7622edf0606c1ed9db5
  plan_head_after: ca001283ff81ec249729785dc1d90217e79f17cc

tech-stack:
  added: []
  patterns:
    - "Injected-deps, never-throws boot helper (precedent: focusRowMigration.ts's hydrateFocusRowSelection) -- a guarded reporter so a throwing onError cannot escape either"
    - "Source-text wiring gate with a REQUIRED self-test arm (precedent: GlobalStateFocusRowHydration.test.ts) over a class that cannot be imported under node-environment jest"

key-files:
  created:
    - src/frontend/state/savedZoomBoot.ts
    - src/frontend/state/__tests__/savedZoomBoot.test.ts
    - src/frontend/state/__tests__/GlobalStateSavedZoomWiring.test.ts
    - .planning/todos/pending/2026-10-15-saved-zoom-boot-re-apply-unverified-on-a-real-relaunch.md
  modified:
    - src/frontend/state/GlobalState.tsx
    - src/preload/api/tauriWindowChrome.ts
    - .planning/todos/completed/2026-10-11-accessibility-zoom-is-not-reapplied-at-startup-under-tauri.md (moved from pending/, Resolution appended)

key-decisions:
  - "Fix landed in GlobalState's boot path (componentDidMount), not the Tauri shell/preload or the Accessibility screen's own mount -- the two declined options were considered in the source todo and are recorded again in its Resolution"
  - "The call is unconditional even when the resolved percent is 100, because applying 100 is what publishes --webview-zoom on boot; a conditional skip-at-100 would leave the property absent exactly when the user never changed the default"
  - "150.5-style non-integer percents are admitted rather than rejected -- the range check is the contract, integrality is the slider's own business"

patterns-established:
  - "A boot-time apply that must never abort mount: wrap in try/catch, report through an injected onError, and guard the reporter itself so a second failure cannot escape either"

requirements-completed: [TODO-p3q-1, TODO-p3q-2, TODO-p3q-3, TODO-p3q-4]

duration: 35min
completed: 2026-10-15
status: complete
---

# Quick 261015-p3q: Re-apply saved Accessibility zoom at startup under Tauri Summary

**A saved Accessibility zoom percent is now applied once, synchronously and undebounced, as the first statement of `GlobalState.componentDidMount`, through the same `window.api.setZoomFactor` chain the slider already uses -- closing the gap where the slider showed a saved value the webview never actually rendered at.**

## Performance

- **Duration:** 35 min
- **Tasks:** 3/3 completed
- **Files modified:** 2 created (+ 2 test files), 2 modified, 2 todo files (1 moved+amended, 1 new)

## Accomplishments

- New pure helper `savedZoomBoot.ts` (`resolveSavedZoomPercent`, `applySavedZoomAtBoot`) wired into `GlobalState.componentDidMount` as the earliest statement, before the CR-01 focusRow block and before the first `window.api.handle*` registration.
- A source-text wiring gate pins the call site's shape (imported, early, unconditional, undebounced, correct deps) with a self-test arm that independently proves the matchers reject three distinct wrong shapes (missing wiring, debounce-wrapped, wrong order) and accept a correctly-wired minimal shape.
- `tauriWindowChrome.ts`'s `setZoomFactor` doc comment corrected -- it previously told the reader `--webview-zoom` stays absent until the first apply "because boot re-applies no saved zoom"; that claim is now false and the comment now says so, citing `261015-p3q`.
- Source todo closed into `completed/` with a `## Resolution`; a `ready: live-gate` follow-up filed for the one claim no desk check can make.

## Task Commits

Each task was committed atomically:

1. **Task 1: Apply the saved zoom at boot -- one path, wired end to end** - `2aaaefc03` (feat)
2. **Task 2: Pin the wiring, and correct the comment that now says the opposite** - `e0021f4b8` (test)
3. **Task 3: Close the source todo; file the half that needs a real relaunch** - `ca001283f` (docs)

_Note: the plan's final metadata commit (SUMMARY.md, STATE.md, ROADMAP.md) is made separately by the orchestrator._

## Files Created/Modified

- `src/frontend/state/savedZoomBoot.ts` - pure helper: resolves an untrusted persisted `zoomPercent` to a safe value (60-200 admitted, else 100, never clamped to an endpoint) and applies it exactly once, undebounced, never throwing
- `src/frontend/state/__tests__/savedZoomBoot.test.ts` - 13 real behaviour tests over the helper, including an anti-drift arm reading `Accessibility/index.tsx`'s range input `min`/`max`
- `src/frontend/state/GlobalState.tsx` - new import + one call site at the top of `componentDidMount`, reading `this.state.zoomPercent` (not the destructured `zoom`, which is the unrelated Zoom Platform storefront)
- `src/frontend/state/__tests__/GlobalStateSavedZoomWiring.test.ts` - source-text gate (readFileSync + stripSourceComments + balanced-brace extractor) pinning the wiring, with a required self-test arm
- `src/preload/api/tauriWindowChrome.ts` - `setZoomFactor`'s doc comment's closing sentence rewritten to describe the boot apply; no code or export changed
- `.planning/todos/completed/2026-10-11-accessibility-zoom-is-not-reapplied-at-startup-under-tauri.md` - moved from `pending/`, `## Resolution` appended, frontmatter untouched
- `.planning/todos/pending/2026-10-15-saved-zoom-boot-re-apply-unverified-on-a-real-relaunch.md` - new live-gate follow-up, `severity: minor` / `platform: macos` / `ready: live-gate`

## Decisions Made

- The boot-path fix (Task 1's chosen layer) is the one recorded in the plan's `<objective>` and reaffirmed, with the two declined alternatives, in the closed todo's `## Resolution`.
- `applySavedZoomAtBoot`'s call to `setZoomFactor` is unconditional at 100%, matching the plan's `<behavior>` spec and the reasoning in `tauriSetZoomFactor`'s own doc comment (a sub-1200px screen's factor-1 is itself a screen-scaled zoom).
- Non-integer percents (e.g. 150.5) are admitted rather than rejected, per the plan's explicit "pick one and pin it" instruction.

## Deviations from Plan

None - plan executed exactly as written. All three tasks, their `<behavior>` specs, their `<verify>` blocks, and the threat-model mitigations were implemented and measured as specified.

## Issues Encountered

`npx prettier --check` initially flagged `GlobalState.tsx` (Task 1) and `GlobalStateSavedZoomWiring.test.ts` (Task 2) after hand-written edits; both were reformatted with `npx prettier --write` and re-verified clean before committing. Not a deviation from the plan -- the plan's own `<verify>` blocks caught this exactly as designed.

## Measured Verification Results

- `savedZoomBoot.test.ts`: **13/13 passed**.
- `GlobalStateSavedZoomWiring.test.ts`: **5/5 passed**. Self-test violation counts: **0 violations** over the real, post-fix `GlobalState.tsx` source; **2 violations** over the synthetic pre-fix source (missing import, call absent from `componentDidMount`). Two further self-test arms (debounce-wrapped call; call ordered after the first `window.api.handle*` registration) each independently confirmed to produce a violation.
- Both new suites together: **18/18 passed**.
- `src/preload/__tests__/windowChrome.test.ts`: **27/27 passed**, unchanged by the comment-only edit.
- `pnpm codecheck`: **exit 0** (both `tsc` invocations).
- `pnpm lint:src`: **1089/1124 problems** (`production: PASS`, ceiling unbumped, zero new warnings in `savedZoomBoot.ts`).
- `pnpm lint:tests`: **638/638 problems** (`tests: PASS`, ceiling unbumped, zero new warnings in either new test file).
- Prettier: `src/frontend/state/savedZoomBoot.ts`, `src/frontend/state/__tests__/savedZoomBoot.test.ts`, `src/frontend/state/__tests__/GlobalStateSavedZoomWiring.test.ts`, `src/frontend/state/GlobalState.tsx`, `src/preload/api/tauriWindowChrome.ts` -- all five report `{"ignored": false, ...}` under `--file-info` and all five pass `--check`. The three `.planning/` todo paths report `{"ignored": true, "inferredParser": null}` and were deliberately excluded from any prettier check (per the plan's `<human-check>` note) -- a check over them would prove nothing.
- `pnpm planning-gates`: **12/12 passed**.
- No i18n step was run: this task adds no user-facing string (the one new message goes through `window.api.logError`, not a translation catalogue).

**Not verified by any of the above, and reported as such per the plan's `<output>` instruction:** that a real quit-and-relaunch renders the UI at the saved zoom. Every number above is a desk check -- a unit-level call assertion over `applySavedZoomAtBoot`, plus the unchanged (and separately already-tested) `tauriSetZoomFactor` chain downstream of it. The user-visible claim in the plan's first `must_haves` truth rests on that chain, not on an observed relaunch, and is owed the live confirmation filed in `.planning/todos/pending/2026-10-15-saved-zoom-boot-re-apply-unverified-on-a-real-relaunch.md`.

## Known Stubs

None. No hardcoded empty value, placeholder text, or unwired data source was introduced.

## Threat Flags

None. All five threats in the plan's `<threat_model>` are `mitigate` or `accept` at `medium` or below (ASVS level 1, block on `high`), and no new network endpoint, auth path, or schema change at a trust boundary was introduced. `T-261015-P3Q-SC` (package installs) confirmed: no `package.json`, `Cargo.toml`, or lockfile changed, and no new dependency was added.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

The boot-time saved-zoom apply is desk-complete and gated. The one open item is the live-gate follow-up todo (`2026-10-15-saved-zoom-boot-re-apply-unverified-on-a-real-relaunch.md`, `severity: minor`, `ready: live-gate`), which needs an operator to set Accessibility Zoom to 150%, quit, relaunch `pnpm tauri:dev`, and confirm the UI renders at 150% (not 100%) and that `--webview-zoom` is published on boot before the slider is touched. No blockers for other work.

## Self-Check: PASSED

All 6 created/modified artifact paths confirmed present on disk (`savedZoomBoot.ts`, its test, the wiring gate test, both todo files, this SUMMARY) and all 3 task commit hashes (`2aaaefc03`, `e0021f4b8`, `ca001283f`) confirmed present in `git log --all`.

---
*Phase: quick-261015-p3q*
*Completed: 2026-10-15*
