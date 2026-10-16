---
phase: 48-library-rows-user-composed-filter-rows-replacing-the-single
plan: 16
subsystem: ui
tags: [focus-ring, keyboard-focus, gamecard, chromium-desk-harness, gap-closure, G-48-12a, WR-02]

requires:
  - phase: 48-library-rows-user-composed-filter-rows-replacing-the-single
    provides: 48-09 shared hover/focus ring and the .listing:hover stale-focus suppression; 48-15 live B11 numbers (0 of 40 against 40 of 40)
provides:
  - body.keyboardNav, a keyboard-mode body class set by a trusted Tab keydown and cleared by a real pointer move or press (helpers/inputModality.ts)
  - the .gameCard and .gameListItem stale-focus suppressions scoped off keyboard mode, plus a keyboard-mode parked-cursor rule
  - a Chromium-over-CDP desk rig with real pointer and Tab input, and a measured before/after matrix S0-S7
  - G-48-12a diagnosed in 48-UAT.md (still failed, live verdict owed to 48-18); WR-02 dispositioned fixed
affects: [48-18]

actuals:
  tokens: 60000
  tasks: 3
  commits: 9
plan_head_before: 61a7674372d5d0ff7556f3b687bc50eb1983dc9c
plan_head_after: cde6f30e692e5e15744fdec6a38e664870e9e538

key-files:
  created:
    - src/frontend/helpers/inputModality.ts
    - src/frontend/helpers/__tests__/inputModality.test.ts
    - .planning/phases/48-library-rows-user-composed-filter-rows-replacing-the-single/evidence/48-16/build-focus-page.mjs
    - .planning/phases/48-library-rows-user-composed-filter-rows-replacing-the-single/evidence/48-16/drive-cdp.mjs
    - .planning/phases/48-library-rows-user-composed-filter-rows-replacing-the-single/evidence/48-16/run-chromium.sh
    - .planning/phases/48-library-rows-user-composed-filter-rows-replacing-the-single/evidence/48-16/results-before-fix.json
    - .planning/phases/48-library-rows-user-composed-filter-rows-replacing-the-single/evidence/48-16/results-tracer.json
    - .planning/phases/48-library-rows-user-composed-filter-rows-replacing-the-single/evidence/48-16/results-after-fix.json
  modified:
    - src/frontend/index.tsx
    - src/frontend/screens/Library/components/GameCard/index.css
    - src/frontend/screens/Library/components/GameCard/__tests__/gameCardFocusRing.test.ts
    - meta/i18nGateScope.json
    - meta/i18nForkTouchedFiles.json
    - meta/__tests__/genI18nGateScope.test.ts
    - .planning/phases/48-library-rows-user-composed-filter-rows-replacing-the-single/48-UAT.md
    - .planning/phases/48-library-rows-user-composed-filter-rows-replacing-the-single/48-REVIEW-DISPOSITION.md

key-decisions:
  - "F2 adopted: an explicit keyboard-mode body class, not a :focus-visible scope. F1 was measured and leaves two rings (S2 and S5)."
  - "Pointer moves at unchanged screenX/screenY are ignored, so the synthetic move an engine dispatches after a scroll does not end keyboard mode."
  - "Untrusted Tab keydowns never enter keyboard mode; gamepad navigation stays on body.controllerLayout."
  - "List rows get no parked-cursor rule: their 2px hover outline already differs from the 3px focus ring."

requirements-completed: [R3]

coverage:
  - id: D1
    description: "A Tab-focused grid card wears the console ring with the pointer resting inside .listing, and exactly one tile rings in S0-S7"
    verification:
      - kind: other
        ref: "bash evidence/48-16/run-chromium.sh <ref> none (results-after-fix.json, runs[0], S0-S7 all pass)"
        status: pass
    human_judgment: false
    note: "Chromium 153 desk proof through the real module and the real stylesheet. The live WebKit re-run is owed to 48-18."
  - id: D2
    description: "The diagnosis was measured before any fix: S1 unringed at base with .listing hovered, ringed with the pointer in the sidebar, ringed again with only the two suppression rules deleted"
    verification:
      - kind: other
        ref: "evidence/48-16/results-before-fix.json (runs none and cf-no-stale-suppression, base 61a767437)"
        status: pass
    human_judgment: false
  - id: D3
    description: "keyboardNav entry and exit semantics: trusted Tab only, real pointer move or press only, same-coordinate move ignored, capture+passive, disposer total"
    verification:
      - kind: unit
        ref: "inputModality.test.ts K1-K11 (+K5b, K9b)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Stale-focus clearing for mouse sessions is not regressed (click focus S3, script focus S4)"
    verification:
      - kind: other
        ref: "results-after-fix.json S3 and S4 pass on the fixed build, and also pass at base"
        status: pass
    human_judgment: false
  - id: D5
    description: "A Tab that scrolls the page under a resting pointer does not end keyboard mode in the real app (WKWebView)"
    verification: []
    human_judgment: true
    note: "S6 proves it only for a same-coordinate CDP move in Chromium. 48-18 must exercise the scroll-induced synthetic move in WebKit."

status: complete
---

# Phase 48 Plan 16: Focus ring on keyboard focus with the pointer in the library Summary

A Tab-focused card keeps its console ring while the pointer rests anywhere over the library, via a `body.keyboardNav` class that the stale-focus suppression is scoped off; the cause was measured in Chromium before any code changed.

## Result

G-48-12a (live 2026-10-09, 48-15 B11: 0 of 40 captures ringed with the pointer in the listing, 40 of 40 with it in the sidebar) is reproduced, isolated and fixed at the desk. The gap stays `failed` in `48-UAT.md` with a `root_cause`; the live WebKit verdict is owed to 48-18. WR-02 is `fixed` in `48-REVIEW-DISPOSITION.md` (`open:` 8 to 7).

BASE `61a7674372d5d0ff7556f3b687bc50eb1983dc9c`. Green fix commits `0c3d2ad23` (grid cards) and `a0a3211f1` (parked cursor, list rows). HEAD at SUMMARY write `cde6f30e692e5e15744fdec6a38e664870e9e538`.

## Commits

| Commit | Message |
|--------|---------|
| f4fca0876 | docs: reproduce G-48-12a at the desk; .listing:hover suppression isolated |
| b09e047e4 | test: failing gates for keyboard-mode focus ring (RED) |
| 0c3d2ad23 | fix: keyboard focus keeps its ring while the pointer rests over the library |
| 4f8c420c1 | fix: drop unused exports on the inputModality interfaces |
| 7b13071cb | docs: tracer run, keyboard focus ringed with the pointer in the listing |
| 2009c068d | test: failing gates for keyboard-mode parked cursor and list rows (RED) |
| a0a3211f1 | fix: keyboard mode returns a parked cursor's card to rest; list rows keep keyboard focus |
| 42b40ba14 | docs: desk matrix S0-S7 after the fix; :focus-visible counterfactual recorded |
| cde6f30e6 | docs: G-48-12a diagnosed and desk-fixed; WR-02 dispositioned fixed |

## Diagnosis (Task 1, base 61a767437, Chromium 153 headless shell over CDP)

| Run | S0 instrument | S1 (pointer in the gap, `.listing` hovered) | S1c (pointer on sidebar) |
|-----|---------------|---------------------------------------------|--------------------------|
| base, `none` | pass | focused card UNRINGED, ringed count 0 | ringed, count 1 |
| base, `cf-no-stale-suppression` (2 rules deleted from the harness copy) | pass | ringed, count 1 | ringed, count 1 |

The WR-02 mechanism is confirmed: `body:not(.controllerLayout)` is also the keyboard user's state, and `.listing:hover` is satisfied by a pointer merely resting in the library. The stop rule did not fire.

## Scenario matrix S0-S7 (before = base, after = fixed build)

Ringed count is the number of cards with a solid outline of at least 3px and a non-transparent colour.

| Scenario | Before (base) | After (fixed) |
|----------|---------------|---------------|
| S0 instrument (hover z-index 2 + ring; Tab-focused card rings) | pass | pass |
| S1 pointer in the gap, Tab into the grid | FAIL (focused card unringed, count 0) | pass (ringed, count 1, `keyboardNav` set) |
| S1c pointer on the sidebar, control | pass | pass |
| S2 pointer on card 2, Tab to another card | FAIL (focused card unringed; card 2 is the only ring) | pass (focused card only, count 1) |
| S3 click-focused card, real move onto card 4 | pass | pass (card 4 only) |
| S4 script-focused card (gamepad stand-in), real move onto card 4 | pass | pass (card 4 only) |
| S5 keyboard then real move onto card 6 | FAIL (inherits S1; no `keyboardNav` at base) | pass (card 6 only, `keyboardNav` cleared) |
| S6 same-coordinate move after S1 | FAIL (inherits S1) | pass (`keyboardNav` kept, focused card still ringed) |
| S7 list rows, pointer in `.listing`, Tab into a row | FAIL (row unringed) | pass (row ringed, count 1) |

Deviation from the plan's expectation: the plan expected S5 to pass its "previously focused card is not ringed" part vacuously and S6 not to be listed as failing at base. In the rig S5 and S6 both open with S1's end state, so they fail at base because that state has no ring. They are recorded as measured.

## F1 counterfactual (`:not(:has(:focus-visible))` on the 3 selectors, no tracker)

| Scenario | Result |
|----------|--------|
| S1 | pass (1 ring) |
| S2 | FAIL: 2 rings (the Tab-focused card and the hovered card 2) |
| S5 | FAIL: 2 rings (focus stays on the Tab-focused card after the pointer lands on card 6) |

This is the expected outcome and the plan's reason 1 for rejecting F1. Reason 2 (Tauri gamepad focus is a bare `.focus()` after untrusted events, so `:focus-visible` is an engine heuristic) was not measured here and still rests on the `themes.scss` note.

## Meta registration diff

`helpers/inputModality.ts` added to `meta/i18nGateScope.json` (193 to 194, one sentence appended to `generatedBy`) and to `meta/i18nForkTouchedFiles.json` (237 to 238), both by hand in sorted position. `pnpm gen-i18n-gate-scope` was not run. `genI18nGateScope.test.ts` pins repinned 193/237 to 194/238 (A0, A2, A3, A4). No `hardcodedStringGate` literal was flagged and no allowlist entry was added.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `findDeadcode` flagged two exported interfaces**
- **Found during:** Task 1, Meta run after the green commit (`meta/findDeadcode.cjs` exits non-zero)
- **Issue:** `ModalityTarget` and `ModalityBody` in `inputModality.ts` were exported but only used in-module.
- **Fix:** Dropped `export` on both (option (b) of the gate's own guidance). No baseline entry added.
- **Files modified:** `src/frontend/helpers/inputModality.ts`
- **Commit:** 4f8c420c1 (the tracer run was re-recorded at the new HEAD, 7b13071cb)

**2. [Rule 3 - Blocking] Test double typing broke `pnpm codecheck`**
- **Found during:** Task 1 verification
- **Issue:** the K-test stub target typed handlers as `(event: Record<string, unknown>) => void`, not assignable to `ModalityTarget`.
- **Fix:** typed the stub handler as `(event: Event) => void` and cast at the `fire` call site. Folded into 0c3d2ad23 before commit.

**3. [Plan tolerance] Task 2 S7 pointer position**
- The plan said "the pointer in the gap between two rows inside `.listing`". Rows are full-width with no gap between them, so the rig parks the pointer 8px left of the list layout's left edge at the row's height, which is inside `.listing`, hovers no row, and asserts that precondition (`preconditionOk`).

None of the above changed a requirement or an acceptance criterion.

## Known Stubs

None.

## Threat Flags

None. The tracker reads only `event.key` (equality with Tab), `event.isTrusted` and pointer screen coordinates; it stores no key, logs nothing, sends nothing over IPC, and uses passive capture listeners (T-48-52). No new network, auth or file surface.

## For the live gate (48-18)

- Re-run item 12's keyboard clause in WebKit: pointer in the gap between grid cards, 40 Tab presses, count ringed captures (was 0 of 40), then the sidebar control (was 40 of 40).
- Exercise the synthetic move: a Tab that scrolls the page under a resting pointer must keep `keyboardNav` set. S6 only proves it for a same-coordinate CDP `mouseMoved` in Chromium. WebKit's post-scroll hover update may carry different `screenX`/`screenY` or fire `pointermove` rather than `mousemove`; 48-15 B11 saw the page scroll during the Tab run.
- Check exactly one ring with the pointer parked on a card and Tab pressed (S2), and that a real mouse move afterwards moves the ring to the hovered card (S5).
- `body.keyboardNav` is observable in the devtools console as `document.body.className`.
- Item 12's mouse/controller handoff clause (G-48-8a) is unaffected by this plan and still owed (no controller).

## Verification run

- `npx jest --selectProjects Frontend` over `src/frontend/(helpers|screens/Library)`: 51 suites, 1180 tests, green.
- `npx jest --selectProjects Meta`: 46 suites, 1357 passed, 1 skipped.
- `pnpm codecheck`, `pnpm lint` (production and tests ceilings PASS), `pnpm planning-gates` (12/12): green.
- Scoped `npx prettier --check` over the eight source and meta paths: clean, each confirmed not ignored via `--file-info`. The `.planning` evidence and records are prettier-ignored by design and hand-matched.
- `graphify update .`: ran.

## Self-Check: PASSED

All created files exist on disk and all nine plan commits are present in git history.
