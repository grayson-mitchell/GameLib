---
phase: 42-humble-key-platform-identity-evidenced-key-type-table-drivin
plan: 04
subsystem: ui
tags: [react, jest, i18n, humble, svg, moduleNameMapper]

requires:
  - phase: 42-humble-key-platform-identity-evidenced-key-type-table-drivin
    plan: 01
    provides: "the pure common/humble/keyTypePresentation.ts lookup table (getKeyTypePresentation, HumbleKeyTypePresentation, HumbleStoreLogoId)"
provides:
  - "Frontend jest project can resolve vite's *.svg?react imports via moduleNameMapper + a stub component"
  - "HumbleKeyRow renders a table-driven store indicator (logo + proper display name) instead of the raw lowercase key_type token"
  - "First-ever HumbleKeyRow test suite: 26 tests pinning all platform branches, the origin field-name collision trap, the GameLib-icon negative pin, and the D-22 zero-buttons structural pin"
affects: [humble-keys-ui, humble-claim-wizard]

tech-stack:
  added: []
  patterns:
    - "jest moduleNameMapper + hand-written stub component to resolve a vite-only import suffix (*.svg?react) without adding an npm dependency"
    - "exhaustiveness-guard pattern (const _exhaustive: never) applied twice more in HumbleKeyRow (resolvePlatformDisplay, resolveStoreLogo), mirroring DialogHandler/index.tsx's resolveButtonAction"
    - "no-DOM element-graph test harness reused a third time (HumbleClaimWizard, Waiting, now HumbleKeyRow) for a component with no useState/useEffect: invoke the component as a plain function, inspect the returned element graph directly"

key-files:
  created:
    - src/frontend/__mocks__/svgReactStub.tsx
    - src/frontend/__tests__/svgReactResolution.test.tsx
    - src/frontend/screens/Humble/Keys/components/HumbleKeyRow/__tests__/index.test.tsx
    - .planning/todos/pending/2026-09-08-humble-key-row-store-logo-fill-currentcolor-unverified-live.md
  modified:
    - src/frontend/jest.config.js
    - src/frontend/screens/Humble/Keys/components/HumbleKeyRow/index.tsx
    - src/frontend/screens/Humble/Keys/index.css
    - public/locales/en/gamelib.json (+ all 48 other locale gamelib.json files)

key-decisions:
  - "Logo mapping never routes through StoreLogos (its default branch fabricates the GameLib icon) and never extends Runner — a dedicated three-case resolveStoreLogo lookup over HumbleStoreLogoId is used instead"
  - "fill: currentColor (not color: currentColor) is the CSS property needed to theme the logo SVGs, since none of the three source SVGs declare their own fill attribute — verified by grep, not by a live render (see Known Stubs / filed todo below)"
  - "All 49 locales received the new humbleKeys.platformOther key by reusing each locale's pre-existing library.storeOther value (same semantic 'Other' concept, already vetted per-locale) rather than inventing new translations"

patterns-established:
  - "*.svg?react resolution for Jest: moduleNameMapper regex '\\.svg\\?react$' -> a single stub file, reusable by any future component that imports a vite-svgr asset under this jest project"

requirements-completed: [REQ-42-02]

duration: ~15min (measured from first commit 19:10:55 to last commit 19:25:44, 2026-09-08; continued across a context-compaction boundary mid-session)
completed: 2026-09-08
---

# Phase 42 Plan 04: HumbleKeyRow Store Indicator Summary

**Replaced HumbleKeyRow's raw lowercase `key_type` caption token ("steam · Humble RPG Bundle") with a table-driven store indicator (logo + proper display name "Steam · Humble RPG Bundle"), consuming the pure `keyTypePresentation.ts` table from plan 42-01, backed by the component's first-ever test suite (26 tests).**

## Performance

- **Duration:** ~15 min across the 5 task commits (plus prior verification/investigation time)
- **Started:** 2026-09-08T19:10:55+12:00 (first commit)
- **Completed:** 2026-09-08T19:25:44+12:00 (last task commit)
- **Tasks:** 3
- **Files modified:** 56 (49 locale `gamelib.json` files + 7 source/test/config files)

## Accomplishments

- `*.svg?react` imports now resolve under the Frontend jest project (`moduleNameMapper` + `svgReactStub.tsx`), proven load-bearing by a captured RED before the fix existed.
- `HumbleKeyRow`'s caption renders the resolved display name from `getKeyTypePresentation` (imported from `common/humble/keyTypePresentation`, per the plan's `key_links` requirement) plus a decorative logo when one exists, instead of the raw `humbleKey.platform` token.
- One new i18n key (`humbleKeys.platformOther`) added to the fork-owned `gamelib` namespace, filled across all 49 locales (not just `en`) — `translation.json` (upstream-owned) untouched.
- First-ever `HumbleKeyRow` test suite: 26 tests table-driven over all 10 `key_type` inputs from the plan, plus the origin field-name collision trap, GameLib-icon negative pins, the lowercase-token-leak pin (the actual pre-fix defect), unknown-branch no-fabrication pins, the UNPICKED no-caption structural pin, and the D-22 zero-buttons structural pin.
- The pins were proven to bite: temporarily reverting the caption's `platform` argument to the raw token and re-running failed 14 of 26 tests, then the code was restored (confirmed via `git diff --quiet`).

## Task Commits

Each task was committed atomically:

1. **Task 1: Make `*.svg?react` imports resolvable under the Frontend jest project (RED first)**
   - `6eba6a230` (test) — RED: added the failing resolution test
   - `320efb2e0` (feat) — GREEN: `moduleNameMapper` + `svgReactStub.tsx`
   - `9537c6a17` (style) — prettier reformat of the new test file (follow-up commit, not an amend, per the never-amend rule)
2. **Task 2: Render the table-driven store indicator in the row caption** - `0acc2225d` (feat)
3. **Task 3: Pin all four indicator branches with the first HumbleKeyRow suite** - `a59a02092` (test)

No plan-metadata commit was made — per this executor's explicit instructions, STATE.md/ROADMAP.md/REQUIREMENTS.md are owned exclusively by the orchestrator and were not touched by this executor. This SUMMARY.md is committed separately below, by explicit path.

_Note: Task 1 is a `tdd="true"` task and correctly shows the RED -> GREEN commit pair (`6eba6a230` -> `320efb2e0`), with an extra formatting-only follow-up commit. Task 3 is also `tdd="true"` but the plan itself states RED-first is not possible for the whole suite (Task 2's implementation had already landed) — see "Captured bite-proof failures" below for how the pins were proven to bite instead._

## Captured SVG-resolution RED (Task 1)

Before `moduleNameMapper` existed, running the new resolution test against the unmodified `jest.config.js` produced (from commit `6eba6a230`'s own message, reproducing the captured run):

```
Cannot find module 'frontend/assets/steam-logo.svg?react' from
'src/frontend/__tests__/svgReactResolution.test.tsx'
```

156 suites passed; this one suite failed to even run (a module-resolution error, not an assertion failure) — proof that without the mapper, `HumbleKeyRow`'s upcoming `*.svg?react` imports would break Jest resolution outright, and specifically would have broken `Waiting/__tests__/index.test.tsx:22` (which imports the real, unmocked `HumbleKeyRow` module). After adding `moduleNameMapper` (commit `320efb2e0`), the same test passed and the pre-existing Humble suites remained green with zero edits.

## Captured bite-proof failures (Task 3)

Task 3's plan explicitly acknowledges "RED FIRST is not possible for the whole suite" since Task 2's implementation had already landed by the time the test suite was written. Instead, the pins were proven to bite: the caption's `platform` interpolation argument was temporarily reverted from `platformDisplay.name` back to the raw `humbleKey.platform` token, the suite was re-run, the failures were captured, and the code was restored.

**Green (before revert):** `Tests: 26 passed, 26 total`

**Red (after reverting `platform: platformDisplay.name` -> `platform: humbleKey.platform`):** `Tests: 14 failed, 12 passed, 26 total`

The 14 failures were exactly the caption-text-dependent pins:
- All 10 `it.each` platform-name assertions (`steam`, `gog`, `epic`, `epic_keyless`, `uplay`, `battlenet`, `origin`, `nintendo_direct`, `generic`, `wibble`) — each failed with e.g. `Expected substring: "Steam · Humble RPG Bundle"` / `Received string: "steam · Humble RPG Bundle"`.
- The origin field-name collision-trap pin — failed with `Expected: "Origin · Humble Choice"` / `Received: "origin · Humble Choice"`.
- The lowercase-token-leak pin — failed with `Expected substring: not "steam ·"` / `Received string: "steam · Humble RPG Bundle"` (this is the literal pre-fix defect the whole plan exists to close).
- Both unknown-branch no-fabrication pins (`generic`, `wibble`) — each failed because the raw token itself leaked into the caption unchanged.

The 12 passes that correctly stayed green are structurally independent of the caption-text change: the 10 GameLib-icon negative pins (icon absence never depended on which text renders), the UNPICKED no-caption pin, and the D-22 zero-buttons pin. This asymmetry — text-dependent pins die, structural pins don't — is the expected shape of a bite-proof exercise: it demonstrates the suite's failures are attributable specifically to the reverted line, not to an unrelated harness fault.

After capturing this output, the file was restored (`git diff --quiet -- .../HumbleKeyRow/index.tsx` confirmed zero residual diff) and the suite was re-run green (26/26) before committing.

## `.humbleKeyRowCaption` CSS location and what was added

`.humbleKeyRowCaption` is defined in `src/frontend/screens/Humble/Keys/index.css:223-230` (this component has no colocated stylesheet — the parent screen's `index.css` is the single stylesheet for the whole `Keys` tree, confirmed by grep before editing). Its existing rule (`display: inline-flex; align-items: center; gap: var(--space-3xs); font-size: var(--text-xs); font-weight: var(--regular); color: var(--text-secondary);`) was left as-is — no properties were changed on it.

Two new sibling rules were added immediately below it, at `index.css:254-267`:

```css
.humbleKeyRowStoreLogo {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1em;
  height: 1em;
  flex-shrink: 0;
  fill: currentColor;
}

.humbleKeyRowStoreLogo svg {
  width: 100%;
  height: 100%;
}
```

`width`/`height: 1em` derive the logo's box from the caption's own `font-size: var(--text-xs)` (per the plan's instruction to derive any fixed dimension from the caption's existing metrics rather than inventing a magic number) so the row never reflows between logo/no-logo variants. `fill: currentColor` (deliberately not `color: currentColor`) is the mechanism that makes the logo theme-aware — see "Deviations" below for why this specific property was required and the caveat attached to it.

## Files Created/Modified

- `src/frontend/jest.config.js` — added `moduleNameMapper` routing `*.svg?react` to the new stub, with an explanatory comment naming Phase 42/D-42-03/HumbleKeyRow as the consumer.
- `src/frontend/__mocks__/svgReactStub.tsx` — new stub component (`{ className? }` -> `<span data-testid="svg-stub">`), documenting why it exists (no jsdom/SVG transformer installed in this jest project).
- `src/frontend/__tests__/svgReactResolution.test.tsx` — new RED-first proof that `*.svg?react` resolves under the Frontend jest project.
- `src/frontend/screens/Humble/Keys/components/HumbleKeyRow/index.tsx` — added `resolvePlatformDisplay`/`resolveStoreLogo` exhaustive helpers, imported the presentation table and the three logo SVGs, rewrote the caption to use `tGamelib`-resolved display name + optional inline logo.
- `src/frontend/screens/Humble/Keys/index.css` — added `.humbleKeyRowStoreLogo` and `.humbleKeyRowStoreLogo svg` sibling rules next to `.humbleKeyRowCaption`.
- `src/frontend/screens/Humble/Keys/components/HumbleKeyRow/__tests__/index.test.tsx` — new, 254 lines, 26 tests (this component's first-ever test file).
- `public/locales/en/gamelib.json` and all 48 other locale `gamelib.json` files — added `humbleKeys.platformOther`, sourced from each locale's existing `library.storeOther` value.
- `.planning/todos/pending/2026-09-08-humble-key-row-store-logo-fill-currentcolor-unverified-live.md` — new todo, documenting the unverified-against-a-live-render CSS claim (see Deviations).

## Decisions Made

- **`fill: currentColor` over `color: currentColor`:** initially wrote `color: currentColor` believing it would make the logo SVGs theme-aware; before finalizing, grepped all three SVG source files for `fill="..."` attributes and found none — meaning `color` alone would have no effect on the SVG's painted fill (the SVG UA default is solid black, independent of CSS `color` unless the SVG itself references `currentColor`). Corrected to `fill: currentColor`, which is the actual inherited-SVG-property mechanism, and rewrote the CSS comment accordingly.
- **Never route through `StoreLogos`:** per the plan's explicit "the trap" framing, `resolveStoreLogo` is a hand-written three-case switch over `HumbleStoreLogoId`, never importing or extending `StoreLogos`/`Runner`. Verified post-hoc: `grep -v` for `StoreLogos` inside the file shows only the explanatory comment, no import.
- **Locale fill strategy:** rather than fabricating 48 new translations for `platformOther`, reused each locale's own pre-existing `library.storeOther` string (same "Other" concept, already vetted per-locale) — avoids inventing unverified machine translations.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected `color: currentColor` to `fill: currentColor` before committing**
- **Found during:** Task 2 (store indicator CSS)
- **Issue:** The first-written CSS used `color: currentColor` on `.humbleKeyRowStoreLogo`, which has no effect on the child SVG's painted fill since none of the three logo SVGs declare `fill="currentColor"` themselves (verified via `grep -o 'fill="[^"]*"'` across all three files — zero matches). This was self-caught before commit, not a defect that reached the codebase.
- **Fix:** Changed the property to `fill: currentColor` (an inherited SVG/CSS-Painting property) and rewrote the accompanying comment to explain the real mechanism and its live-verification caveat.
- **Files modified:** `src/frontend/screens/Humble/Keys/index.css`
- **Verification:** Code-level only (grep confirming no `fill` attribute in any of the three SVGs, and that `fill` is a documented inherited SVG property) — this repo's Frontend jest project has no jsdom/browser automation to render and measure the actual pixel result. A todo was filed for the live-render verification (see below).
- **Committed in:** `0acc2225d` (Task 2 commit)

**2. [Rule 2 - Missing critical] Filled the new i18n key across all 48 non-en locales, not just `en`**
- **Found during:** Task 2 (adding `humbleKeys.platformOther`)
- **Issue:** The plan's own verification script only checks `public/locales/en/gamelib.json`, but this repo's standing l10n requirement (CLAUDE.md/memory: "lint-translations is blind to an absent key and its baseline is 0") means a new key left at `en`-only would silently ship with 48 locales missing it, undetected by any gate.
- **Fix:** Added `humbleKeys.platformOther` to all 49 locale `gamelib.json` files (sourced from each locale's own pre-existing `library.storeOther` value).
- **Files modified:** `public/locales/*/gamelib.json` (49 files total)
- **Verification:** `python3` script confirming `humbleKeys.platformOther` present in all 49 locale `gamelib.json` files (0 missing).
- **Committed in:** `0acc2225d` (Task 2 commit)

**3. [Not auto-fixed — filed instead] Store-logo `fill: currentColor` never verified against a live render**
- **Found during:** Task 2 (writing the CSS comment)
- **Issue:** This plan's environment has no jsdom/browser automation available (Frontend jest project deliberately has neither, per `jest.config.js`'s own docstring), so the `fill: currentColor` fix above is a sound code-level guarantee but has never been rendered and visually confirmed in either a light or a dark theme — CONTEXT.md's own UI note for this phase explicitly warns "Measure, do not eyeball" and "Verify each logo against a light AND a dark theme before claiming the indicator is done."
- **Action taken:** Rather than claiming unverified correctness, filed `.planning/todos/pending/2026-09-08-humble-key-row-store-logo-fill-currentcolor-unverified-live.md` (frontmatter: `severity: minor`, `platform: any`, `ready: live-gate`) documenting the known/unknown split and a suggested manual verification procedure (run the app, view Steam/GOG/a no-logo row in both themes, screenshot).
- **Not fixed here because:** it requires a live app render, which this task had no mechanism to produce.

**4. [Noted, not fixed — out of scope] Pre-existing GOG SVG asset attribute typo**
- **Found during:** Task 2 (reading `gog-logo.svg` while investigating the `fill` question)
- **Issue:** `gog-logo.svg`'s `<path>` element carries `className="cls-1"` (a JSX-style camelCase attribute name) instead of the valid SVG `class="cls-1"`. This predates this plan (confirmed: the same asset is used identically by the pre-existing `StoreLogos` component, which this plan does not touch), and appears functionally inert (no embedded `<style>` block in the source SVG defines `.cls-1` anyway, so nothing currently depends on the attribute resolving).
- **Not fixed because:** out of scope per the scope-boundary rule ("Only auto-fix issues DIRECTLY caused by the current task's changes") — this typo is in an asset this plan reads but does not author or modify, and predates it. Documented as an "unknown, appears inert" item inside the filed todo above rather than silently ignored or silently fixed.

---

**Total deviations:** 2 auto-fixed (1 bug, 1 missing-critical), 2 documented-not-fixed (1 filed as a live-gate todo, 1 noted as pre-existing/out-of-scope).
**Impact on plan:** Both auto-fixes were self-caught before commit and necessary for correctness (the CSS fix) and for meeting this repo's standing l10n requirement (the 48-locale fill). Neither introduced scope creep — both are direct consequences of Task 2's own change. The two documented-not-fixed items are explicitly NOT claimed as resolved; they are recorded honestly as unverified/out-of-scope rather than silently glossed over.

## D-22 read-only contract: not edited, and why none was needed

The D-22 contract comment block (enumerating the three sanctioned interactive exceptions — `undoOverride`, `giftAction`, `claimAction`) now lives at `HumbleKeyRow/index.tsx:108-121` (shifted from the plan's cited `:43-56` purely because of the new imports and the two new exhaustive helper functions added above it in the file — its own text is byte-for-byte unchanged, still reading "with THREE sanctioned exceptions"). This executor did not edit that block.

No edit was needed because the store indicator this plan adds is exhaustively presentational: it introduces no `onClick`/callback-bearing prop, no `<button>` or `<a>` element, and no `cursor: pointer` styling — it is a `<span aria-hidden="true">` wrapping a decorative SVG plus interpolated text. This is not just an assertion in the code comment above the new markup (`index.tsx:305-311`, "does NOT need a fourth D-22 sanctioned exception") — it is directly pinned by Task 3's test suite: `'renders zero button elements when no action props are supplied (D-22)'` asserts the rendered graph contains exactly zero `type === 'button'` elements when `claimAction`/`giftAction`/`undoOverride` are all omitted, which is exactly the row configuration every platform-branch test in this suite exercises.

## Issues Encountered

None beyond the two self-caught-and-corrected items already covered under Deviations. No authentication gates were encountered (none of this plan's tasks touch anything requiring credentials).

## Known Stubs

None. Every branch (`branded`/`named`/`unknown`) renders real, non-placeholder content — the `'unknown'` branch's "Other" label is an intentional, explicitly-designed neutral fallback (per D-42-03/T-42-13), not a stub standing in for missing functionality.

## Threat Flags

None. All new surface (the `tGamelib('gamelib:humbleKeys.platformOther', ...)` call, the two new pure helper functions, the CSS additions) is covered by this plan's own `<threat_model>` (T-42-13 through T-42-16, T-42-SC) — no new network endpoint, auth path, file-access pattern, or schema change was introduced.

## User Setup Required

None — no external service configuration required.

## Verification Summary

All plan-level `<verification>` items were run and passed:

- `npx jest --selectProjects Frontend src/frontend` — 158 suites / 2381 tests, all passing (up from the pre-plan baseline by 28 tests: 2 in `svgReactResolution.test.tsx`, 26 in `HumbleKeyRow/__tests__/index.test.tsx`). No previously-passing suite was edited.
- `npx tsc --noEmit` — clean, no errors.
- `npx prettier --check` on every file this plan touched — all pass ("All matched files use Prettier code style!").
- `git diff --quiet -- public/locales/en/translation.json` — passes; the upstream-owned catalog is untouched.
- `pnpm lint-translations:gamelib` — `0 findings, 0 hard failures`.
- `pnpm i18n-churn-guard` — `clean -- no upstream public/locales/ catalog changed.`
- `pnpm i18n --fail-on-update` (`npx i18next --silent --fail-on-update`) — exit 0; `gamelib` namespace reports `Added keys: 0, Restored keys: 0`; `git status --short public/locales` shows zero diff after running it. Confirms the new key was already correctly hand-authored/extracted with no drift.
- `meta/__tests__/hardcodedStringGate.test.ts` (the suite backing `meta/i18nGateScope.json`, which already lists `HumbleKeyRow/index.tsx:99`) — 150/150 passing, including "scans the whole committed scope and finds zero violations outside the allowlist" — confirms the new `tGamelib` call did not introduce a hardcoded-string gate violation.
- `pnpm lint` (`eslint --cache --max-warnings 4157 .`) — **fails** at 4236 warnings against the 4157 cap. This is confirmed **pre-existing and unrelated to this plan**: grepping the full lint output for any of this plan's touched files (`HumbleKeyRow`, `svgReactResolution.test.tsx`, `svgReactStub.tsx`, `jest.config.js`) returns zero matches — none of the reported warnings are in files this plan created or modified. Per the task brief, this is one of the three known pre-existing baseline failures (leaked 60s `test:ci` timer, `pnpm lint` warning ratchet, `electronUntouched.test.ts:306`) and is not attributable to plan 42-04.

## Next Phase Readiness

- `HumbleKeyRow`'s store indicator is complete and test-covered; `common/humble/keyTypePresentation.ts` (plan 42-01) now has a real frontend consumer beyond `HumbleClaimWizard`.
- The `*.svg?react` jest resolution pattern (`moduleNameMapper` + stub) established here is reusable by any future Frontend-jest-project component needing a vite-svgr asset.
- One open item carried forward: `.planning/todos/pending/2026-09-08-humble-key-row-store-logo-fill-currentcolor-unverified-live.md` — the `fill: currentColor` CSS fix needs a live, both-themes render check before being considered fully verified per CONTEXT.md's "Measure, do not eyeball" standard. Not a blocker for this plan (no live-DOM verification mechanism was available to it), but should be picked up at the next live-gate opportunity for this phase.
- No blockers for subsequent Phase 42 plans.

## Self-Check: PASSED

All 8 claimed created/modified files verified present on disk, and all 5 task commit hashes (`6eba6a230`, `320efb2e0`, `9537c6a17`, `0acc2225d`, `a59a02092`) verified present in `git log --oneline --all`.

---
*Phase: 42-humble-key-platform-identity-evidenced-key-type-table-drivin*
*Completed: 2026-09-08*
