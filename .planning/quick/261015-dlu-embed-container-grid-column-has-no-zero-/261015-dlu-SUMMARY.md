---
phase: quick-261015-dlu
plan: 01
subsystem: webview/store-embed
tags: [store-embed, notice-row, css-grid, minmax, min-content, webkit, chromium, evidence, ui-spec, todos]

requires:
  - phase: quick-261015-9qy
    provides: "900px minimum window width floor, per-selector notice-row pin, UI-SPEC E3 test point, and the open (unmeasured) App.css shell-column hypothesis this plan refutes"
provides:
  - "A zero-floor grid-template-columns: minmax(0, 1fr) on .WebView__embedContainer, closing the degrade gap between 420px and the 900px floor"
  - "A per-selector jest pin (comment-blind extraction, cross-selector control, sabotage arm) on that declaration"
  - "A 15-file evidence bundle (harness + README) documenting the WebKit/Chromium measurement that found and refuted the App.css hypothesis"
  - "A corrected Resolution record on the closed 261015-9qy todo"
affects: [webview, store-embed-notice-row, ui-spec-e3]

actuals:
  tokens: 25255
  tasks: 3
  commits: 4
plan_head_before: 9e312ff5db28619911207815fc54885bc0358d34
plan_head_after: 6a720918f3656cfbd8925f87a12ed164eb5d9ad2

tech-stack:
  added: []
  patterns:
    - "Comment-blind, region-scoped CSS-rule-body extraction in jest (stripCssComments + anchor-on-selector-plus-brace), reused from embedContainerGridRows.test.ts into StoreEmbedTimeoutBanner.test.tsx's readSelectorBody"

key-files:
  created:
    - .planning/quick/261015-dlu-embed-container-grid-column-has-no-zero-/evidence/README.md
    - .planning/quick/261015-dlu-embed-container-grid-column-has-no-zero-/evidence/build-page.mjs
    - .planning/quick/261015-dlu-embed-container-grid-column-has-no-zero-/evidence/wkprobe.swift
    - .planning/quick/261015-dlu-embed-container-grid-column-has-no-zero-/evidence/wk-{1280,900,800,700,600,500}.json
    - .planning/quick/261015-dlu-embed-container-grid-column-has-no-zero-/evidence/cr-{1280,900,800,700,600,500}.json
    - .planning/todos/pending/2026-10-15-embed-container-column-fix-unverified-on-hardware.md
  modified:
    - src/frontend/screens/WebView/index.css
    - src/frontend/screens/WebView/components/__tests__/StoreEmbedTimeoutBanner.test.tsx
    - .planning/todos/completed/2026-10-14-store-embed-banner-actions-clip-and-the-app-declares-no-minimum-window-width.md

key-decisions:
  - "Shipped F1 (container-level minmax(0, 1fr)) only, not F2 (notice-row min-width:0) or F3 (notice-row overflow:hidden) -- all three measured equivalent at 600px, but F1 is the only one that covers every row in the grid, not just the banner."
  - "UI-SPEC E3's overflow row was read first and left byte-unchanged -- it states a behaviour at a declared 900px test point and names no mechanism, so the new CSS mechanism did not warrant an edit."

requirements-completed: [TODO-dlu-1, TODO-dlu-2, TODO-dlu-3]

duration: ~4min (commit-to-commit; longer including reading and verification)
completed: 2026-10-15
status: complete
---

# Quick Task 261015-dlu: Zero-floor the embed container's implicit grid column, with evidence and a corrected record

**`.WebView__embedContainer` had no `grid-template-columns`, so its implicit `auto` column floored at the notice row's ~420px min-content and overflowed the container below that width; added `grid-template-columns: minmax(0, 1fr)`, pinned it per selector with an observed RED, shipped the measuring harness as a 15-file evidence bundle, and corrected `261015-9qy`'s Open observation from an unmeasured hypothesis to a measured-and-refuted one.**

## Performance

- **Duration:** ~4 min between first and last task commit
- **Tasks:** 3/3 completed
- **Files modified/created:** 19 (2 source/test, 15 evidence, 1 completed-todo record, 1 pending-todo record)

## Accomplishments

- Gave `.WebView__embedContainer` a zero-floor column template (`minmax(0, 1fr)`), fixing the mechanism behind the 600px/500px actions clip without touching `App.css`, `NavShell`, or `tauri.conf.json`.
- Generalised `StoreEmbedTimeoutBanner.test.tsx`'s `readSelectorBody` helper (optional region-start parameter, comment-stripping) and used it to pin the new declaration per selector, with a cross-selector control against `.WebView__embedSlot` and a sabotage arm whose exactly-once count runs over comment-stripped CSS.
- Landed the orchestrator's measurement harness (WebKit + Chromium, 7 arms, 6 viewports) as a 15-file evidence bundle with a README stating what it is, how to re-run it, its results, its conclusion, and its limits.
- Corrected `261015-9qy`'s closed-todo Resolution: the `App.css` shell-column hypothesis it left as "unmeasured" is now recorded as measured and refuted, with the original paragraph preserved byte-for-byte beneath the new status sentence.
- Read UI-SPEC E3's overflow row first and determined no edit was warranted; left it byte-unchanged.

## Observed RED (TDD pin, Task 1 Step 3)

Against the unmodified `index.css` (before the CSS declaration was added), the new jest arm failed as follows.

**Test name:** `WebView/index.css new notice-row rules (D-07/D-14) › pins a zero-floor column template on the embed container, with a cross-selector control and a comment-stripped sabotage arm`

**Actual assertion message (verbatim):**
```
expect(received).toMatch(expected)

    Expected pattern: /grid-template-columns:\s*minmax\(\s*0\s*,\s*1fr\s*\)/
    Received string:  "
      display: grid;
      grid-template-rows: auto auto auto 1fr;
      height: 100%;
      width: 100%;
    "
```
Test run reported `1 failed, 15 passed, 16 total` at this point -- the pre-existing 15 tests stayed green and only the new arm failed, for the right reason (missing declaration, not a helper fault). The CSS declaration was then added, and the full suite was rerun green (see Verification below).

## Task Commits

1. **Task 1: give the embed container's column a zero floor, pinned per selector with an observed red** - `b86503723` (fix)
2. **Task 2: land the harness in the repo as an evidence bundle with a README that states its limits** - `1c266b3b0` (docs)
3. **Task 3: correct the 261015-9qy record, and make a read-first determination on UI-SPEC E3** - `404cbf5f7` (docs)
4. **Follow-up: file the live-gate todo required by `<verification>`** - `6a720918f` (docs; not a numbered plan task, but required by the plan's own verification note — see "What this plan did NOT verify" below)

PLAN.md stays staged, not committed (orchestrator's docs commit will cover it).

## Verification (run as written, real output)

- `npx jest src/frontend/screens/WebView/components/__tests__/StoreEmbedTimeoutBanner.test.tsx src/frontend/screens/WebView/__tests__/embedContainerGridRows.test.ts`
  ```
  PASS Frontend src/frontend/screens/WebView/__tests__/embedContainerGridRows.test.ts
  PASS Frontend src/frontend/screens/WebView/components/__tests__/StoreEmbedTimeoutBanner.test.tsx

  Test Suites: 2 passed, 2 total
  Tests:       16 passed, 16 total
  ```
  (Planning-time baseline was 2 suites, 15 tests; 16 confirms the new arm landed.)

- `pnpm codecheck` → exit 0 (`tsc --noEmit && tsc -p tsconfig.meta.json --noEmit`, no output = clean).

- `npx prettier --check src/frontend/screens/WebView/index.css src/frontend/screens/WebView/components/__tests__/StoreEmbedTimeoutBanner.test.tsx` →
  ```
  Checking formatting...
  All matched files use Prettier code style!
  ```
  Both paths measured `{ "ignored": false }` at planning time, so this check is real, not vacuous.

- Task 1's node verify script (container column present, notice row did NOT also gain `min-width: 0`) → `ok`.

- Task 2's four automated checks: bundle-shape (`15` entries, no `page.html`) → `ok`; all 12 JSON files parse → `ok`; README content checklist (all required strings present) → `ok`; operator-profile-data scan → `no operator profile data in the bundle`.

- Task 3's automated checks: record-integrity script → `ok`; E3 overflow-invariant grep → `1`; E3 row count → `E3 row count intact` (4 rows, unchanged).

- `pnpm planning-gates` → `12/12 planning gates passed.` (run three times, once per task, each time 12/12).

- `graphify update .` run after the code changes (CLAUDE.md requirement) → rebuilt the graph; no tracked files changed as a result (`graphify-out/` is untracked).

## UI-SPEC E3 determination (Task 3, Part B)

**Left byte-unchanged.** Read `50-UI-SPEC.md:152` (the `E3 banner | overflow` row) before deciding. At planning time and after re-reading, the row's statement is:

> "At the app's minimum window width — 900px, declared as the `minWidth` key on the `main`-labelled entry of `app.windows` in `src-tauri/tauri.conf.json`, set by quick task 261015-9qy — the single 40px banner row shows the message plus both actions (Reload, Open in browser) on one row; the message may ellipsise, the actions may not clip."

This names the 900px test point, the config path, and the behavioural criterion, and does **not** name `.WebView__embedNoticeRow`'s own CSS or any other mechanism as the cause of the degrade. A UI-spec row stating a behaviour at a declared test point, with no mechanism named, is already correct under Task 3's stated criterion — so no edit was warranted, and the file is unchanged. The grep invariant (`grep -F 'E3 banner | overflow' ... | grep -F '900px' | grep -F 'src-tauri/tauri.conf.json' | grep -cF 'the actions may not clip'`) returns `1`, and the `^| E3 banner` row count is `4`, both unchanged from planning time.

## Deviations from Plan

None — plan executed exactly as written, including the ordering constraint in Task 1 (pin written and observed red before the CSS existed).

One self-correction during execution, not a plan deviation: the first `git commit` for Task 1 was run without a pathspec and swept in the already-staged `261015-dlu-PLAN.md` (which the orchestrator owns). Caught immediately via `git show --stat HEAD`; fixed with `git reset HEAD~1 -- <PLAN.md path>` followed by `git commit --amend --no-edit` to drop it from the commit, then `git add`-ed back to restore the original staged-only state. All three task commits that follow used an explicit pathspec to prevent recurrence. No commit was pushed or shared before the correction.

## Known Stubs

None. This plan adds no new UI surface, no new data flow, and no placeholder content.

## Threat Flags

None beyond what the plan's own `<threat_model>` already covers (the scratchpad-to-repo evidence copy, scanned clean for operator-profile data by both the source-side and landed-bundle greps above).

## What this plan did NOT verify

Per the plan's `<verification>` section: jest performs no layout in this project, so nothing in this task observed the fixed row actually rendering. The fix is measured in two engines (WebKit, Chromium) against the shipped stylesheets in a **static harness** — not the running app. Whether `.WebView__embedContainer` paints the shrunken message correctly in the running app on macOS is owed to a live gate. No live gate ran this session, so per the plan's instruction a pending todo was filed: `.planning/todos/pending/2026-10-15-embed-container-column-fix-unverified-on-hardware.md` (`severity: minor`, `platform: macos`, `ready: live-gate`, in that key order).

## Self-Check: PASSED

Files verified present on disk:
- FOUND: src/frontend/screens/WebView/index.css (contains `grid-template-columns: minmax(0, 1fr);`)
- FOUND: src/frontend/screens/WebView/components/__tests__/StoreEmbedTimeoutBanner.test.tsx (contains the new `it(...)` and generalised `readSelectorBody`)
- FOUND: .planning/quick/261015-dlu-embed-container-grid-column-has-no-zero-/evidence/README.md (+ 14 harness files, 15 total)
- FOUND: .planning/todos/completed/2026-10-14-store-embed-banner-actions-clip-and-the-app-declares-no-minimum-window-width.md (contains the new status sentence above the preserved Open observation paragraph)

Commits verified in git log:
- FOUND: b86503723 (Task 1)
- FOUND: 1c266b3b0 (Task 2)
- FOUND: 404cbf5f7 (Task 3)
- FOUND: 6a720918f (live-gate todo follow-up)

Measured commit count from the plan ledger: `git rev-list --count 9e312ff5db28619911207815fc54885bc0358d34..6a720918f3656cfbd8925f87a12ed164eb5d9ad2` = 4, matching the 3 task commits plus the follow-up todo commit above (PLAN.md excluded, correctly staged-only).
