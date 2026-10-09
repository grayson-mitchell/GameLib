---
phase: 48-library-rows-user-composed-filter-rows-replacing-the-single
plan: 13
subsystem: ui
tags: [focus-row-strip, scroll-extent, chromium, wkwebview, css, gap-closure]

requires:
  - phase: 48-library-rows-user-composed-filter-rows-replacing-the-single
    provides: 48-10 end-ring room (width max-content), 48-12 card width parity and flip-hold
provides:
  - a reproducible two-engine strip harness (Chromium run, WKWebView probe written) built from any git ref
  - results-before-fix.json recording that G-48-11b is NOT reproduced in Chromium 153 (108 variants x 5 overrides + a negative control)
  - G-48-11a and G-48-11b gap entries in 48-UAT.md (status failed, test 11)
affects: [48-14, 48-15, G-48-11b]

actuals:
  tokens: 110000
  tasks: 1
  commits: 1
plan_head_before: e6938fc1f338807729d92d74f93b7a280ac3d69a
plan_head_after: 291e872b0653632175803fd66ae9add2f29ff957

tech-stack:
  added: []
  patterns:
    - "git-ref harness: git show <ref>:<path> for the stylesheets and focusRowOverflow.ts, esbuild IIFE bundle, so the page runs the app's own functions"
    - "counterfactual overrides as appended stylesheets, never source edits, plus a negative control that proves the harness can see an inflated extent"

key-files:
  created:
    - .planning/phases/48-library-rows-user-composed-filter-rows-replacing-the-single/evidence/48-13/build-harness.mjs
    - .planning/phases/48-library-rows-user-composed-filter-rows-replacing-the-single/evidence/48-13/page-script.js
    - .planning/phases/48-library-rows-user-composed-filter-rows-replacing-the-single/evidence/48-13/run-chromium.sh
    - .planning/phases/48-library-rows-user-composed-filter-rows-replacing-the-single/evidence/48-13/run-webkit.sh
    - .planning/phases/48-library-rows-user-composed-filter-rows-replacing-the-single/evidence/48-13/wkprobe.swift
    - .planning/phases/48-library-rows-user-composed-filter-rows-replacing-the-single/evidence/48-13/merge-results.mjs
    - .planning/phases/48-library-rows-user-composed-filter-rows-replacing-the-single/evidence/48-13/results-before-fix.json
    - .planning/phases/48-library-rows-user-composed-filter-rows-replacing-the-single/evidence/48-13/arithmetic-walk-draft.test.ts.txt
  modified:
    - .planning/phases/48-library-rows-user-composed-filter-rows-replacing-the-single/48-UAT.md
    - .planning/phases/48-library-rows-user-composed-filter-rows-replacing-the-single/deferred-items.md

key-decisions:
  - "Stop rule fired: reproduced=false, so Task 2 (red gate, fix, after-fix re-run) was NOT started and no src/ file changed"
  - "The arithmetic walk failed in its floor-clientWidth pass, so per the plan it stays out of the tree; the draft is kept as evidence and the finding is deferred"
  - "The WebKit arm was written but not run: this Windows host has no swiftc and no WebKit; WebKit is the engine the live failure was measured in, so the cause stays open"

patterns-established:
  - "A desk harness gets a negative control: a variant known to be wrong must register as wrong before a clean result is trusted"

requirements-completed: []

coverage:
  - id: D1
    description: "Reproducible Chromium strip harness built from a git ref, with counterfactual overrides and a negative control"
    verification:
      - kind: other
        ref: "bash evidence/48-13/run-chromium.sh HEAD (108 variants, none malformed)"
        status: pass
    human_judgment: false
  - id: D2
    description: "G-48-11a and G-48-11b filed in 48-UAT.md in the existing gap shape"
    verification:
      - kind: other
        ref: "js-yaml parse of ## Gaps: 9 entries, both new entries status failed, test 11, severities medium and major"
        status: pass
    human_judgment: false
  - id: D3
    description: "G-48-11b root cause (the live blank-travel signature)"
    verification:
      - kind: other
        ref: "bash evidence/48-13/run-webkit.sh c747af0a6 (WK_WINDOW=1): 108 variants, 0 bad, scrollWidth within 0.6px of E, last-card inset 14.53..15.19; Chromium same; negative control 108 bad in both engines (results-after-fix.json)"
        status: pass
    human_judgment: false
    note: "Reproduced in WKWebView 2026-10-09 (cf-pin-item-width isolates it); the live item 11 re-run is still owed to 48-15."

duration: 75min
completed: 2026-10-09
status: complete
---

# Phase 48 Plan 13: G-48-11b desk reproduction Summary

**A two-engine strip harness (Chromium run, WKWebView probe written) shows the shipped strip ending 15px past its last card in all 108 Chromium variants, so G-48-11b did not reproduce and the plan stopped before any fix.**

## Performance

- **Duration:** about 75 min
- **Started:** 2026-10-09T03:35Z (approx)
- **Completed:** 2026-10-09T03:52Z
- **Tasks:** 1 of 2 (Task 1 done; Task 2 not started by the plan's own stop rule)
- **Files modified:** 10 (8 created, 2 edited, all under `.planning`; no `src/` file)

## Task 2 outcome (2026-10-09, supersedes the stop-rule outcome below)

The stop rule below fired at the time because the Windows host could not run WebKit. On 2026-10-09 the WKWebView arm ran on macOS (`run-webkit.sh`, `WK_WINDOW=1`, HEAD 01534f7ad) and **reproduced G-48-11b**: all 108 variants had a wrong extent (placeholder cards collapse the list to scrollWidth 2740 against E 2755.6; rendered and lazy cards inflate it, 3030 at n=14 content 958 and up to 12486 at n=20, so the third forward click is blank and forward stays enabled). Only `cf-pin-item-width` fixed every variant; `cf-no-max-content`, `cf-contain-items` and `cf-art-no-intrinsic` fixed none. Recorded in `results-before-fix.json` (`reproduced: true`, 12 runs) and commit `c83a94eb7`.

Task 2 then ran as quick task 261009-o30:

- **RED:** `focusRowStripSource.test.ts` gained a case asserting `width: var(--focus-row-card-width, Npx)` on `.focusRowTrack .gameList > *` with N equal to the flex-basis fallback. It failed (1 failed, 48 passed) before the fix.
- **GREEN:** `width: var(--focus-row-card-width, 156px)` added to that rule in `FocusRowStrip/index.css` (`c747af0a6`). FocusRowStrip jest plus `cssTokenSweep`: 141 passed.
- **After-fix measurement** (`results-after-fix.json`, ref `c747af0a6`): WKWebView and Chromium, 108 variants each, 0 bad; scrollWidth within 0.6px of E, last-card inset 14.53..15.19, no empty slot, forward disabled at the end. The content-sized negative control still registers 108 bad in both engines.
- **Not done:** the live item 11 FAIL 2 re-run in the app stays with 48-15. A desk harness passing is not the live gate.

## Stop-rule outcome (historical, written before the WebKit run)

`results-before-fix.json` has `reproduced: false`. The plan's stop rule applies: Task 2 was not started, no `src/` file was changed, and the gap stays `failed`. **A live diagnostic is needed**, and it has to be in WebKit.

Why this is the honest result and not a harness failure:

- The live failure was measured in macOS WKWebView. This host is Windows with no `swiftc` and no WebKit, so the WKWebView arm could not run. Chromium 153 (chrome-headless-shell, the stand-in for WebView2) cleanly satisfies the target in every variant.
- The harness can see the failure class when it exists. The negative control (items content-sized: `flex: 0 0 auto; width: auto`) reaches `scrollWidth` 8742 against an expected 2755.6 (n=14, content 958, 600x900 art), and 4542 with a viewBox-only svg.

The plan's acceptance wording for a WebKit gap ("Chromium satisfying (a) and (b) is accepted with that caveat") does not apply: Chromium satisfies neither (a) nor (b), because there is nothing to reproduce there.

## Accomplishments

- Harness: `build-harness.mjs --ref <ref> --out <dir> [--override <name>]` reads the three stylesheets and `focusRowOverflow.ts` through `git show`, bundles the TS with the repo's esbuild, and writes one page that runs the app's own `createStripCardWidthSync`, `measureCardPitch`, `pageScrollDelta` and `canScrollForward` over the real shipped CSS. Drivers: `run-chromium.sh` (fresh `mktemp -d` profile at mode 700, HOME/XDG/Windows profile variables inside it) and `run-webkit.sh` plus `wkprobe.swift` (`WKWebsiteDataStore.nonPersistent()`).
- Measurements: Chromium, override `none`, ref `e6938fc1f`, 108 variants (n 14 and 20; content box 958, 462, 198; shells, rendered cards, lazy walk; art 1x1, 600x900, viewBox-only svg; short and 37-character titles): `scrollWidth` minus E between -0.60 and 0.00, card width within 0.009px of derived, first-card inset 15, last-card inset 14.531 to 15.188, 0 walk failures.
- Gaps: G-48-11a (medium) and G-48-11b (major) appended to `48-UAT.md` `## Gaps` in the existing shape; `## Gaps` parses with 9 entries; only the `updated:` line and the appended entries differ from HEAD.

## Hypothesis table

| # | Hypothesis | Discriminator run | Measured | Verdict |
|---|------------|-------------------|----------|---------|
| H1 | 48-10 `width: max-content` takes the list width from the items' intrinsic contribution | Chromium harness, 108 variants x 5 overrides + negative control | none: dSW -0.60..0.00 in all 108. `cf-pin-item-width`, `cf-contain-items`, `cf-art-no-intrinsic`: identical to none. `cf-no-max-content`: dSW -15.60..0.00, last-card inset -0.469..0.188 (loses the 15px end padding, 48-10's stated reason). Negative control: 8742 vs 2755.6 | Chromium: cleared. WebKit: **not reproduced, untested** |
| H2 | a non-card child in `.gameList` | desk read | `GamesList` defaults `layout = 'grid'` (`GamesList/index.tsx:83`); `FocusRowStrip` passes no layout (`index.tsx:265-270`); grid renders only `GameCard` or `null` (`:132-172`); `gameListHeader` is list layout only | cleared |
| H3 | page-delta / disable arithmetic | jest-shaped walk over the true geometry, n 14 and 20, content 156..1600 step 0.37 | passes with rounded `clientWidth`; fails only in the floor pass: n=14 content 161.92 (14 clicks, want 13), n=20 content 164.88 (20, want 19), a 1.28px sub-epsilon residual | cleared for blank travel (cannot scroll into empty space); the floor-pass residual is logged as a deferred item |
| H4 | stale `measure` after a smooth `scrollBy` | desk read | passive `scroll` listener re-reads every scroll (`index.tsx:120`); `page()` reads live track values (`index.tsx:166-170`) | cleared: a stale measure moves the chevron, never the browser's clamped `scrollLeft` |
| H5 | `measureCardPitch` reads a transformed rect | desk read | measures the card wrapper (`focusRowOverflow.ts:119`); the visible-branch wrapper is an untransformed outer div; only a hovered placeholder first card is scaled 1.05 (+0.05w on the pitch) | cleared for blank travel |

The one candidate left standing is a WebKit-only reading of H1, stated as an unproven lead (also in the G-48-11b `root_cause`): `width: max-content` (`78cd69511`, 48-10) makes the list width depend on the items' intrinsic contribution, and a WebKit that does not clamp that contribution to the `flex: 0 0` basis would inflate the extent by the art's natural width. That fits the live "click 3 and 4 are blank" extent but nothing here proves it.

## Engines and counterfactuals

| Engine | Override | Variants | scrollWidth - E (min..max) | Last-card inset | Walk failures |
|--------|----------|----------|----------------------------|-----------------|---------------|
| chromium 153 | none | 108 | -0.60..0.00 | 14.531..15.188 | 0 |
| chromium 153 | cf-no-max-content | 108 | -15.60..0.00 | -0.469..0.188 | 0 |
| chromium 153 | cf-pin-item-width | 108 | -0.60..0.00 | 14.531..15.188 | 0 |
| chromium 153 | cf-contain-items | 108 | -0.60..0.00 | 14.531..15.188 | 0 |
| chromium 153 | cf-art-no-intrinsic | 108 | -0.60..0.00 | 14.531..15.188 | 0 |
| chromium 153 | neg-control-content-sized (not a fix candidate) | 108 | -4374.00..8552.00 | 15..661 | 100 |
| webkit | none | not run | - | - | - |

n=14, content 958, lazy, 600x900, short title (5 per page): `scrollWidth` 2755, `clientWidth` 988, E 2755.6; walk scrollLeft 0, 982, 1767, cards 0-4, 5-9, 9-13, forward disabled after 2 clicks.

Custom properties the page defines (all from the repo, listed again in the generated page header): `:root` font-size 16px (`_typography.scss:30`), `--text-scale-ratio` 1.2 (`:29`), `--text-sm` (`:34`), `--text-md` (`:35`), `--semibold` 600 (`:24`), `--bold` 700 (`:25`), `--space-3xs` 0.25em (`_spacing.scss:3`), `--space-2xs` 0.375em (`:4`), `--space-md` 1em (`:7`), `--space-3xl` 8.5em (`:11`), `--space-unit-fixed` 16px (`:13`), `--space-xs-fixed` (`:15`), `--space-md-fixed` (`:17`), `--focus-ring-width` 3px (`themes.scss:91`), `* { box-sizing: border-box }` (`App.css:14-16`), `body { margin: 0 }` (`_spacing.scss:34-36`). Fonts are the platform default stack, not the app's webfonts.

## RED / GREEN evidence

None. No test was written or committed: the arithmetic walk failed in its floor pass and is therefore out of the tree (plan step 1), the CSS red gate belongs to Task 2, and Task 2 did not start. `git diff e6938fc1f HEAD -- src` is empty. The shared-file check (`git diff --exit-code d7bcc6e1d -- <the five shared files>`) is unaffected because nothing under `src/` changed.

## Task Commits

1. **Task 1: reproduce G-48-11b at the desk and record G-48-11a/11b** - `291e872b0` (docs)

**Plan metadata:** the final `docs(48-13)` SUMMARY commit that follows.

## Files Created/Modified

- `evidence/48-13/build-harness.mjs`, `page-script.js` - the git-ref harness generator and its in-page walk
- `evidence/48-13/run-chromium.sh`, `run-webkit.sh`, `wkprobe.swift` - the two drivers (WebKit one written, not compiled)
- `evidence/48-13/merge-results.mjs`, `results-before-fix.json` - merge helper and the recorded results (`reproduced: false`)
- `evidence/48-13/arithmetic-walk-draft.test.ts.txt` - the failing-in-floor-pass walk, kept for whoever decides the epsilon question
- `48-UAT.md` - G-48-11a and G-48-11b appended after G-48-8c; `updated:` set
- `deferred-items.md` - the floor-pass epsilon finding

## Decisions Made

- Stopped at the stop rule rather than guess a CSS fix against a cause that did not reproduce (T-48-41).
- Raised the harness's walk cap from the plan's 10 clicks to 30. At one column (content 198) a 14-card strip needs 13 clicks and a 20-card strip 19, so a cap of 10 mislabelled correct strips as failing.
- Kept the failing floor-pass walk out of `src/` and out of the commit, as the plan says, and saved it as evidence instead of discarding it.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The plan's UAT verify expects 12 parsed items; the correct figure is 14**
- **Found during:** Task 1 verify (UAT parse)
- **Issue:** `parseUatItemsWithStats` counts each `## Gaps` entry as an item (HEAD parses 12 = 5 test items + 7 gap entries). Adding the two gaps the plan requires gives 14, so the plan's `r.items.length===12` can never pass alongside `g.length===9`.
- **Fix:** Verified against the corrected expectation: 9 gaps, both new entries `failed`/`test: 11`/right severity, 14 items, 0 shortfall blocks.
- **Files modified:** none (a plan-text defect, not a repo defect)
- **Verification:** the same node check with `items.length===14` exits 0

**2. [Rule 3 - Blocking] Harness adjustments found while making it run**
- **Found during:** Task 1 step 3-5
- **Issue:** `img.decode()` blocks on real time and `--virtual-time-budget` expired after 4 variants; the `<pre id="out">` gained attributes.
- **Fix:** art is preloaded once and settling polls `complete`/`naturalWidth` with `setTimeout` only; the extractor regex tolerates `<pre>` attributes. Added a third art kind (viewBox-only svg) and the play/settings icon buttons to the rendered card, plus the negative control.
- **Files modified:** `page-script.js`, `build-harness.mjs`, `run-chromium.sh`
- **Verification:** 108 of 108 variants return in about 0.5 s; the negative control registers 100 walk failures

---

**Total deviations:** 2 auto-fixed (1 bug in the plan's verify, 1 blocking harness fix)
**Impact on plan:** none on scope. The stop rule, not a deviation, ended the plan.

## Issues Encountered

- WebKit could not be run (no `swiftc`, no WebKit on Windows). `run-webkit.sh` prints a `notRun` object with the reason on such a host, so the merged results record it.
- `python3` is absent, so `pnpm planning-gates` was not run; the todo frontmatter gate is irrelevant to this plan (no todo was created).
- A stray `python -` I started waiting on stdin was killed (PID 32796); nothing else was affected.
- `git checkout -- <test file>` (used to drop the failing walk from the tree) triggered the repo's post-checkout `pnpm install`; node_modules and the Frontend jest project still work.

## Known Stubs

None.

## Threat Flags

None. The harness loads only `file://` and `data:` content under a fresh disposable profile (T-48-40); nothing here adds endpoints or schema.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **Needs a Mac (or the 48-15 live gate) before any fix:** run `bash evidence/48-13/run-webkit.sh HEAD`, then again with `cf-no-max-content`, `cf-pin-item-width`, `cf-contain-items` and `cf-art-no-intrinsic`, and merge with `merge-results.mjs`. Or, in the live app with 14 cards, read the `.focusRowTrack` `scrollWidth`, the list's border-box width and one card wrapper's width and compare with E = 14 x w + 13 x 24 + 30. If WebKit reproduces, rerun plan 48-13 Task 2 against that `results-before-fix.json` (the Task 2 precondition is `reproduced: true`).
- 48-14 (G-48-11a, WR-01) is unaffected. 48-15 still owns the live reconciliation of both gaps.
- Open design question for the operator or a later plan: whether `SUBPIXEL_EPSILON` should absorb 1.5px (deferred-items.md).

---
*Phase: 48-library-rows-user-composed-filter-rows-replacing-the-single*
*Completed: 2026-10-09*

## Self-Check: PASSED
