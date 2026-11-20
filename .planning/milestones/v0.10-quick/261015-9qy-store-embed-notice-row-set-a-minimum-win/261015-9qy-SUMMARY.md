---
phase: quick-261015-9qy
plan: 01
subsystem: webview/store-embed
tags: [tauri-window, min-width, store-embed, notice-row, ellipsis, ui-spec, todos]

requires: []
provides:
  - "A single, pinned minimum inner window size (900x600) on the main Tauri window"
  - "A per-selector regression pin on the notice row's already-present ellipsise/no-shrink contract"
  - "UI-SPEC E3's overflow criterion now cites a concrete test point (900px, tauri.conf.json's minWidth)"
  - "The 2026-10-14 store-embed-notice-row todo closed with a Resolution block"
affects: [webview, store-embed, ui-spec-50, todos]

actuals:
  tokens: 4321  # 17284 chars / 4 over the 5 task-modified files
  tasks: 3
  commits: 3
plan_head_before: 3366c0d2d
plan_head_after: dfbb9d918

tech-stack:
  added: []
  patterns:
    - "Minimum window size declared in exactly one place (tauri.conf.json), never duplicated in Rust"
    - "Per-selector CSS-body extraction (open-brace to matching close-brace) for pins that must not be satisfied by a sibling selector in the same stylesheet region"
    - "String-copy sabotage arm: mutate an in-memory copy of a read file, assert occurrence count first, then assert the pin throws against the mutated copy -- never write the mutation to disk"

key-files:
  created: []
  modified:
    - src-tauri/tauri.conf.json
    - src/backend/__tests__/tauriWindowConfig.test.ts
    - src/frontend/screens/WebView/components/__tests__/StoreEmbedTimeoutBanner.test.tsx
    - .planning/phases/50-epic-store-in-app-on-macos-a-rust-managed-raw-wkwebview-subv/50-UI-SPEC.md
    - .planning/todos/completed/2026-10-14-store-embed-banner-actions-clip-and-the-app-declares-no-minimum-window-width.md

key-decisions:
  - "minWidth 900 is MEASURED (the todo's hardware photograph at item16-width900.png showed nothing clipped, while 600px clipped Open in browser); minHeight 600 is a JUDGMENT CALL with no measurement behind it"
  - "Task 2 added no CSS -- the ellipsise/no-shrink contract has been in index.css since 348e28057 (feat(50-03)), before the live gate that filed the todo; the deliverable is a per-selector regression pin, not a fix"
  - "The 600px clip was NOT reproduced at desk and is NOT root-caused here -- jsdom performs no layout, so no test in this plan observes a rendered ellipsis or a rendered clip. It is now stated as unreachable at any permitted window size, which is a weaker and more honest claim than 'fixed'"
  - "App.css's shell-column sizing (min-content 1fr, no inline min-width on .App .content) is carried into the SUMMARY and the todo's Resolution as an open, unmeasured hypothesis -- not investigated or touched in this task"

patterns-established:
  - "When a test file's lookup helper slices from a marker to end-of-file, a pin that must be scoped to ONE selector needs a narrower per-selector body extraction, not a broader substring match"

requirements-completed: [TODO-9qy-1, TODO-9qy-2, TODO-9qy-3]

coverage:
  - id: D1
    description: "The main window declares a minimum inner size (900x600) in exactly one place, and a test goes red if either value is removed, lowered, or raised above the declared default"
    requirement: "TODO-9qy-1"
    verification:
      - kind: unit
        ref: "src/backend/__tests__/tauriWindowConfig.test.ts#tauri.conf.json main window minimum inner size (quick 261015-9qy, TODO-9qy-1)"
        status: pass
    human_judgment: false
  - id: D2
    description: "The notice row's ellipsise/no-shrink contract is pinned PER SELECTOR, so a property on a different rule in the same block cannot satisfy it; both notices checked, EpicLauncherBlockedNotice confirmed to have no actions element"
    requirement: "TODO-9qy-2"
    verification:
      - kind: unit
        ref: "src/frontend/screens/WebView/components/__tests__/StoreEmbedTimeoutBanner.test.tsx#pins the message rule and the actions rule degrade contract PER SELECTOR, with a string-copy sabotage arm proving the pin can fail"
        status: pass
    human_judgment: false
  - id: D3
    description: "UI-SPEC E3's overflow row names a concrete pixel width and the file that declares it; the todo is closed under completed/ with a Resolution block"
    requirement: "TODO-9qy-3"
    verification:
      - kind: other
        ref: "grep -F 'E3 banner | overflow' 50-UI-SPEC.md | grep -F '900' | grep -cF 'the actions may not clip' -> 1; pnpm planning-gates -> 12/12"
        status: pass
    human_judgment: false
  - id: D4
    description: "AppKit actually refuses a resize below 900x600, and the banner row visibly renders an ellipsised message with both actions intact at the 900px floor"
    verification: []
    human_judgment: true
    rationale: "Hardware-only. jsdom performs no layout, so no automated check in this plan can observe either the clamp or a rendered ellipsis/clip. Needs a real pnpm tauri:dev run on the Mac; not run in this session."

duration: 25min
completed: 2026-10-14
status: complete
---

# Quick Task 261015-9qy: Store-embed notice row -- set a minimum win Summary

**Pinned a minimum inner window size (900x600, tauri.conf.json only) and a per-selector regression test on the notice row's already-present ellipsise contract; closed the todo that found both gaps, with the actual clip left honestly unverified at desk.**

## Performance

- **Duration:** ~25 min
- **Completed:** 2026-10-14T18:20:20Z
- **Tasks:** 3/3 completed
- **Files modified:** 5

## Accomplishments

- `src-tauri/tauri.conf.json`'s `main` window now declares `minWidth: 900` / `minHeight: 600` -- the only place a minimum is declared anywhere in the codebase.
- `src/backend/__tests__/tauriWindowConfig.test.ts` gained a new `describe` pinning both values, the minima-below-default relation, and a SANITY arm that fails against the exact pre-fix no-min fixture.
- `StoreEmbedTimeoutBanner.test.tsx` gained a per-selector pin proving `.WebView__embedNoticeRow-message` carries all four ellipsise properties and `.WebView__embedNoticeRow-actions` carries the no-shrink declaration, in each selector's OWN body (not satisfiable by the icon rule's sibling `flex-shrink: 0`), with a string-copy sabotage arm.
- `50-UI-SPEC.md`'s E3 overflow row now cites the concrete 900px width and `src-tauri/tauri.conf.json`'s `minWidth` key as its test point, rather than the undefined "the app's minimum window width."
- The todo moved to `.planning/todos/completed/` with a Resolution block naming the quick id, both chosen values (900 measured, 600 judgment), the no-CSS finding for half (2), the `EpicLauncherBlockedNotice` scoping note, and the honest "not reproduced, now unreachable" statement about the 600px clip.
- `src/frontend/screens/WebView/index.css` is untouched (`git diff --stat` across all three commits lists no CSS file).

## Task Commits

1. **Task 1: declare a minimum inner size for the main window, in exactly one place, and pin it** - `428aa56e1` (fix)
2. **Task 2: pin the notice row's already-present ellipsise contract, per selector, and check both notices** - `de0113dbf` (test)
3. **Task 3: give UI-SPEC E3 a concrete test point and close the todo** - `dfbb9d918` (docs)

**Plan metadata:** not yet committed (orchestrator's docs commit, per constraints -- this quick task does not commit PLAN.md/SUMMARY.md/STATE.md itself)

## Files Created/Modified

- `src-tauri/tauri.conf.json` - Added `minWidth: 900` / `minHeight: 600` to the `main` window entry, between `height` and `resizable`. No other key touched (in particular not `app.security.csp`, which lives in the same object).
- `src/backend/__tests__/tauriWindowConfig.test.ts` - Widened `TauriWindowConfig` with `width`/`height`/`minWidth`/`minHeight` optional numeric fields; added a new `describe` with the pin, the minima-below-default relation test, and a SANITY no-min fixture arm.
- `src/frontend/screens/WebView/components/__tests__/StoreEmbedTimeoutBanner.test.tsx` - Added a `readSelectorBody` helper and one new `it` inside the existing `describe('WebView/index.css new notice-row rules (D-07/D-14)')` block, pinning the message and actions rules per selector plus the icon-rule negative check and the string-copy sabotage arm.
- `.planning/phases/50-epic-store-in-app-on-macos-a-rust-managed-raw-wkwebview-subv/50-UI-SPEC.md` - Rewrote only the opening clause of the E3 banner overflow row to name 900px and the declaring file/key; rest of the sentence, `verification: backstop`, and the trailing empty cell are byte-identical. Line 153 (long-text row) untouched.
- `.planning/todos/completed/2026-10-14-store-embed-banner-actions-clip-and-the-app-declares-no-minimum-window-width.md` - `git mv`'d from `pending/` with filename byte-identical; frontmatter untouched (the `todo-frontmatter-gate.py` scope is `pending/` only); appended a `## Resolution` section.

## Decisions Made

- **900 is measured, 600 is a judgment call.** Recorded this distinction explicitly in the test's docstring, the SUMMARY, and the todo's Resolution rather than letting both numbers read as equally grounded.
- **Task 2 added no CSS.** Confirmed both plan premises against the live files before writing anything: `index.css:150-164` already carries the full message/actions contract (unchanged since `348e28057`), and `EpicLauncherBlockedNotice.tsx:76-83` renders only an icon and a message span, no `-actions` element. Neither premise failed, so no STOP-and-report was triggered.
- **The 600px clip is reported as unreachable, not fixed.** jsdom performs no layout; nothing in this plan observed a rendered ellipsis or a rendered clip. Both the SUMMARY and the todo's Resolution say this plainly, per the plan's T-9qy-03 threat-register mitigation (the "shipped-claim-false" pattern this project has measured four times in one phase).
- **The App.css shell-column hypothesis is carried as an open question, not investigated.** `App.css:26`'s `min-content 1fr` grid, `.App .content`'s missing inline `min-width: 0`, and the navbar's cross-column grid area are recorded in the todo's Resolution and here as an unmeasured candidate explanation for the original 600px clip -- explicitly not acted on, since the blast radius is every route in the app and jest cannot observe layout.

## Deviations from Plan

None - plan executed exactly as written. Both Task 2 premises (CSS already correct; `EpicLauncherBlockedNotice` has no actions element) were verified true before any code was written, so the plan's STOP-and-report branch was never triggered.

## Issues Encountered

- `npx prettier --check` initially failed on the Task 2 test file edit (unformatted new code). Fixed with `npx prettier --write` on the exact path named in the plan's `<verify>` block, then re-ran both `--check` and the jest suite to confirm the reformat changed nothing behaviorally. Not a deviation from the plan's instructions -- the plan's own `<verify>` block names this exact command.

## Verification Results (actual output)

**Task 1:**
- `npx jest src/backend/__tests__/tauriWindowConfig.test.ts` -> `Tests: 11 passed, 11 total` (PASS)
- `pnpm codecheck` -> exit 0, no output (PASS)
- `npx prettier --check src-tauri/tauri.conf.json src/backend/__tests__/tauriWindowConfig.test.ts` -> "All matched files use Prettier code style!" (PASS)

**Task 2:**
- `npx jest src/frontend/screens/WebView/components/__tests__/StoreEmbedTimeoutBanner.test.tsx src/frontend/screens/WebView/components/__tests__/EpicLauncherBlockedNotice.test.tsx` -> `Test Suites: 2 passed, 2 total`, `Tests: 22 passed, 22 total` (PASS)
- `npx prettier --check src/frontend/screens/WebView/components/__tests__/StoreEmbedTimeoutBanner.test.tsx` -> initially FAILED ("Code style issues found"); fixed via `prettier --write` on the same path, re-ran jest (still 22/22 pass) and `--check` again -> "All matched files use Prettier code style!" (PASS after one write)
- `git diff --stat src/frontend/screens/WebView/index.css` -> empty output, confirming the CSS file is unchanged (PASS)

**Task 3:**
- `pnpm planning-gates` -> `12/12 planning gates passed` (PASS, matches the 2026-10-14 planning-time baseline)
- `grep -F 'E3 banner | overflow' 50-UI-SPEC.md | grep -F '900' | grep -cF 'the actions may not clip'` -> `1` (PASS)
- `test -f completed/... && test ! -f pending/... && grep -c '^## Resolution' completed/...` -> `1` (PASS, both file-existence checks also passed silently)
- `npx prettier --file-info` on both written `.planning/` paths -> `{"ignored":true,"inferredParser":null}` for both, confirming the plan's "PRETTIER: deliberately omitted" done-criterion rather than carrying a vacuous `--check` (PASS, by design)

**Full end-to-end re-run (plan's `<verification>` block, inherited verbatim):**
- `npx jest src/backend/__tests__/tauriWindowConfig.test.ts src/frontend/screens/WebView/components/__tests__/StoreEmbedTimeoutBanner.test.tsx src/frontend/screens/WebView/components/__tests__/EpicLauncherBlockedNotice.test.tsx` -> `Test Suites: 3 passed, 3 total`, `Tests: 33 passed, 33 total` (29 baseline + 4 new: 3 from Task 1's new describe, 1 from Task 2's new test) (PASS)

**Not verifiable at desk, and not claimed as verified** (per the plan's `<verification>` block and this plan's `<human-check>`): that AppKit actually refuses a resize below 900x600, and that the banner row visibly renders an ellipsised message with both actions intact at the 900px floor. Both need a real `pnpm tauri:dev` run on the Mac. Not run in this session; file a `ready: live-gate` todo if desired before the next phase.

## Known Stubs

None.

## Threat Flags

None -- this plan's own `<threat_model>` already covers the new surface (window-config tampering, DoS from an oversized minimum, repudiation risk on the clip claim, vacuous-assertion risk); no surface outside that register was introduced.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The todo `2026-10-14-store-embed-banner-actions-clip-and-the-app-declares-no-minimum-window-width` is fully closed.
- Open, unmeasured, and explicitly not acted on: the App.css shell-column hypothesis (`min-content 1fr`, no inline `min-width: 0` on `.App .content`, navbar spanning both columns) as a candidate explanation for the original 600px clip, better fitting "cut off by the window edge" than anything inside the notice row. Any future investigation of shell-level overflow across routes should start there.
- A live-gate verification of the 900x600 clamp and the rendered ellipsise/no-clip behavior at the 900px floor is still outstanding; no `ready: live-gate` todo was filed in this session (left to the user/orchestrator to decide whether one is wanted before shipping).

## Self-Check: PASSED

All 5 claimed files confirmed present on disk (`tauri.conf.json`, `tauriWindowConfig.test.ts`, `StoreEmbedTimeoutBanner.test.tsx`, `50-UI-SPEC.md`, the completed todo); the pending todo path confirmed absent; all 3 commit hashes (`428aa56e1`, `de0113dbf`, `dfbb9d918`) confirmed in `git log --all`.

---
*Phase: quick-261015-9qy*
*Completed: 2026-10-14*
