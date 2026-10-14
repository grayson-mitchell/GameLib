---
phase: quick-261015-7tt
plan: 01
subsystem: ui-styling
tags: [contrast, themeTokens, is-link, is-text, hover, todos, nord-light]

provides:
  - "Game-menu, MainButton-dropdown, and pure .is-text hover .is-link/.is-text pairs censused across all 10 themes (50 ratios), 3 genuine misses fixed with theme-scoped overrides, 0 sibling regressions"
  - "Two-arm reachability proof for .settingsWrapper > .button.is-text: UNREACHABLE, rule deleted"
affects: [themeTokens.test.ts, GamePage-index.css, _buttons.scss, Settings-index.css, todos]

actuals:
  tokens: 10506
  tasks: 3
  commits: 3
  plan_head_before: b85578578414e5f765e691df7a9250c2ef5e1b7a
  plan_head_after: 88e18329ad06999af1b4945769191f97ea2c270d

tech-stack:
  added: []
  patterns:
    - "Theme-scoped CSS override (body.<theme> &:not(...):not(:disabled) { color: ... }) remains the repo's no-regression-safe fix idiom for a < 4.5:1 miss; reused identically for all 3 fixes in this task"
    - "Two-arm reachability proof (direct-child DOM-root walk + transitive import-graph trace) as the standard method for a dead-CSS deletion decision, both arms must complete and agree before deleting"

key-files:
  created: []
  modified:
    - src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts
    - src/frontend/screens/Game/GamePage/index.css
    - src/frontend/styles/_buttons.scss
    - src/frontend/screens/Settings/index.css
    - .planning/todos/completed/2026-10-11-button-is-text-hover-and-is-link-pairs-miss-4-5-to-1.md

key-decisions:
  - "Pure .is-text hover fix is HOVER-scoped only (not block-level like the gruvbox_dark precedent) because nord-light's base and hover states impose mutually exclusive luminance constraints against --accent vs --primary-hover — proved mathematically, not assumed"
  - ".settingsWrapper > .button.is-text deleted after both reachability arms agreed it is dead CSS; replacement comment carries the specificity note forward (deleted rule (0,3,0) vs sibling fallback (0,2,0), layout-only) so a future reconnection does not assume stale declarations still apply"

requirements-completed:
  - "TODO-7tt-1"
  - "TODO-7tt-2"
  - "TODO-7tt-3"

coverage:
  - id: D1
    description: "All 5 pair-families measured in all 10 themes as ratio numbers (50 values), recorded in this SUMMARY and in the todo's Resolution"
    requirement: "TODO-7tt-1"
    verification:
      - kind: unit
        ref: "src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts (261015-7tt describe blocks, game-menu + MainButton + pure is-text census/winner/fix/no-regression tests)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Winning text-colour declaration for each family resolved from the authored stylesheets by specificity + source order, not assumed; IACVT (--navbar-inactive) confirmed live"
    requirement: "TODO-7tt-1"
    verification:
      - kind: unit
        ref: "themeTokens.test.ts winning-rule resolution tests (game-menu, MainButton dropdown) and the IACVT declaring-themes test"
        status: pass
    human_judgment: false
  - id: D3
    description: "3 genuine misses (dracula game-menu hover, gruvbox_dark MainButton hover, nord-light+nord-dark pure is-text hover) fixed and pinned by floor assertions that red if the fix is removed; base+hover re-measured for every touched selector, 0 sibling regressions"
    requirement: "TODO-7tt-2"
    verification:
      - kind: unit
        ref: "themeTokens.test.ts fix + no-regression tests, full suite 270/270"
        status: pass
    human_judgment: false
  - id: D4
    description: ".settingsWrapper > .button.is-text reachability carries a recorded verdict backed by a complete two-arm proof; rule deleted since both arms agree unreachable"
    requirement: "TODO-7tt-3"
    verification:
      - kind: other
        ref: "Manual two-arm proof (direct-child DOM-root walk + transitive import-graph trace), documented in this SUMMARY and the todo's Resolution"
        status: pass
    human_judgment: true
    rationale: "No automated tool traces JSX render-root chains or import graphs end-to-end; the proof was read and walked file-by-file, cross-checked for false positives (declaredUnavailable.ts edge direction)."
  - id: D5
    description: "Todo lives in .planning/todos/completed/ with a closure block carrying the measured tables; triage frontmatter preserved byte-unchanged; pnpm planning-gates passes"
    verification:
      - kind: other
        ref: "pnpm planning-gates (12/12)"
        status: pass
    human_judgment: false

duration: ~2h40min
completed: 2026-10-15
status: complete
---

# Quick Task 261015-7tt: `.is-link` / `.is-text` Hover Contrast Census Summary

**Censused 50 `.is-link`/`.is-text` base-and-hover contrast ratios across 5 render-site families and 10 themes, fixed the 3 genuine < 4.5:1 misses with theme-scoped overrides (0 regressions), and deleted a dead `.settingsWrapper > .button.is-text` CSS rule after a two-arm reachability proof found it unreachable from either settings host.**

## Performance

- **Duration:** ~2h40min
- **Completed:** 2026-10-15
- **Tasks:** 3/3 completed
- **Files modified:** 5 (1 test file, 2 stylesheets with new fix rules, 1 stylesheet with a deletion, 1 todo moved)

## Accomplishments

- **Task 1 (tracer, tdd):** Censused the game-menu `.is-link` pair's 20 render-site base+hover ratios across all 10 themes, resolved the winning rule (`.gameConfigContainer .game-actions .gameTools .link`, specificity (0,4,0), against `--navbar-background`), confirmed the IACVT finding on `--navbar-inactive` (declared in exactly `midnightMirage` + `nord-light`, inherits elsewhere), found and fixed one miss (dracula hover, 3.79:1), pinned with a floor assertion and a no-regression test (0 other themes touched).
- **Task 2 (auto, tdd):** Censused MainButton dropdown's `.is-link` pair (30 ratios: base+hover x 10 themes, surface `.mainInfo`'s `--body-background`) and the pure `.is-text` hover family (DownloadManager "Clear List", 10 ratios against `--primary-hover`), resolved both winning rules, found and fixed two misses: gruvbox_dark MainButton hover (3.91:1, theme-scoped override restoring the already-passing base colour on hover) and nord-light+nord-dark pure `.is-text` hover (3.36:1/4.41:1, HOVER-scoped override only — proved a block-level override is mathematically impossible here since base and hover states impose mutually exclusive luminance constraints).
- **Task 3 (auto):** Completed a two-arm reachability proof for `.settingsWrapper > .button.is-text` (Arm 1: walked every direct JSX child of both `.settingsWrapper` hosts to its own DOM root through every Fragment/wrapper component, none carries `is-text`; Arm 2: traced the import graph from both hosts, none of the 3 files carrying the `is-text` literal is reachable, explicitly ruling out a `declaredUnavailable.ts` false-positive). Both arms agree unreachable — deleted the rule, replacing it with an in-situ comment carrying the specificity note forward. Closed the todo with a full dated resolution section and moved it to `completed/`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Census and fix game-menu `.is-link` hover contrast** - `4128be9c6` (test, tdd=true)
2. **Task 2: Census and fix MainButton `.is-link` and pure `.is-text` hover contrast** - `f90c76cfd` (fix, tdd=true)
3. **Task 3: Two-arm reachability proof, delete dead CSS, close todo** - `88e18329a` (fix)

## Files Created/Modified

- `src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts` — all census, winning-rule resolution, IACVT, fix, and no-regression tests for the 5 families (270 tests total in the file)
- `src/frontend/screens/Game/GamePage/index.css` — dracula game-menu hover override; gruvbox_dark MainButton dropdown hover override (`.SteamInstallCaret .dropdown .link:hover` scope)
- `src/frontend/styles/_buttons.scss` — nord-light/nord-dark pure `.is-text:hover` overrides
- `src/frontend/screens/Settings/index.css` — `.settingsWrapper > .button.is-text` rule deleted, replaced with an explanatory comment
- `.planning/todos/completed/2026-10-11-button-is-text-hover-and-is-link-pairs-miss-4-5-to-1.md` — moved from `pending/`, dated `## Resolution (2026-10-15, quick 261015-7tt)` section appended with all tables below

## 1. Winning rule per family

| Family | Winning selector | Specificity | Source file | Surface measured against |
| --- | --- | --- | --- | --- |
| game-menu base | `.gameConfigContainer .game-actions .gameTools .link` | (0,4,0) | `GamePage/index.css` | `.gameTools`'s `var(--navbar-background)` |
| game-menu hover | same selector's `&:hover` | (0,4,0) | `GamePage/index.css` | same, `var(--navbar-background)` |
| MainButton dropdown base | `.button.is-link` | (0,2,0) | `_buttons.scss` | `.mainInfo`'s `var(--body-background)` (nearest ancestor with a depth-0 `background-color`) |
| MainButton dropdown hover | `.button.is-link:hover`, overridden for gruvbox_dark by `.SteamInstallCaret .dropdown .link:hover` | (0,3,0) bare / (0,4,0) override | `_buttons.scss` / `GamePage/index.css` | same, `var(--body-background)` |
| pure `.is-text` hover | `.button.is-text` base colour (inherited through `:hover`), overridden for nord-light/nord-dark | (0,2,0) bare / (0,4,0) override | `_buttons.scss` | `.button.is-text:hover`'s own `var(--primary-hover)` fill |

IACVT (F3) confirmed: `--navbar-inactive` is declared in exactly `midnightMirage` and `nord-light`, nowhere global; the bare `var(--navbar-inactive)` form has no fallback, so in the other 8 themes the property is Invalid At Computed-Value Time, resolves to `unset`, and (because `color` is inherited) the element inherits `body { color: var(--text-default) }` rather than the losing `.button.is-link` declaration.

## 2. All 50 ratios, pre-fix

**Game-menu `.is-link` base (surface `--navbar-background`):**

| Theme | Ratio |
| --- | --- |
| midnightMirage | 13.113648715245787 |
| cyberSpaceOasis | 13.257951449687171 |
| gruvbox_dark | 10.736539240877535 |
| high-contrast | 15.319282995022148 |
| dracula | 9.151439148782794 |
| nord-light | 7.377385674863534 |
| nord-dark | 10.55664191917608 |
| marine | 9.514519577311345 |
| zombie | 10.484365388643553 |
| sweet | 15.727359422802929 |

**Game-menu `.is-link` hover (surface `--navbar-background`) — PRE-FIX:**

| Theme | Ratio |
| --- | --- |
| midnightMirage | 13.234119636090266 |
| cyberSpaceOasis | 9.579456048890293 |
| gruvbox_dark | 11.922953966152933 |
| high-contrast | 11.546569133675732 |
| **dracula** | **3.7935597497017444 (MISS)** |
| nord-light | 5.434168203566393 |
| nord-dark | 10.184725556989086 |
| marine | 4.866917740503223 |
| zombie | 7.414697698833942 |
| sweet | 10.153669709738764 |

**MainButton dropdown `.is-link` base (surface `--body-background`):**

| Theme | Ratio |
| --- | --- |
| midnightMirage | 16.788236154438835 |
| cyberSpaceOasis | 14.507754846759754 |
| gruvbox_dark | 12.056162112962957 |
| high-contrast | 13.323661139757832 |
| dracula | 14.258387837018423 |
| nord-light | 13.494574458741706 |
| nord-dark | 14.424555621635646 |
| marine | 14.506991519180875 |
| zombie | 13.542786491381447 |
| sweet | 16.823306107258816 |

**MainButton dropdown `.is-link` hover (surface `--body-background`) — PRE-FIX:**

| Theme | Ratio |
| --- | --- |
| midnightMirage | 16.87891721800516 |
| cyberSpaceOasis | 8.5062216076322 |
| **gruvbox_dark** | **3.9078232730305023 (MISS)** |
| high-contrast | 9.920715347334701 |
| dracula | 5.910550823183299 |
| nord-light | 8.881467607169904 |
| nord-dark | 11.40705477550448 |
| marine | 7.420693584403017 |
| zombie | 7.516979439921614 |
| sweet | 10.824708780959572 |

**Pure `.is-text` hover (surface `--primary-hover`) — PRE-FIX:**

| Theme | Ratio |
| --- | --- |
| midnightMirage | 6.800167784258179 |
| cyberSpaceOasis | 9.817518593082472 |
| gruvbox_dark | 7.3778841179024095 |
| high-contrast | 5.660329586006159 |
| dracula | 6.703540995999987 |
| **nord-light** | **3.356770572062584 (MISS)** |
| **nord-dark** | **4.41083696523498 (MISS)** |
| marine | 7.0024938877367475 |
| zombie | 6.5370741758162305 |
| sweet | 5.23771668718921 |

Worst per family: game-menu hover 3.79:1 (dracula); MainButton dropdown hover 3.91:1 (gruvbox_dark); pure `.is-text` hover 3.36:1/4.41:1 (nord-light/nord-dark). All other 46 cases cleared 4.5:1 with no stylesheet change required.

## 3. Post-fix ratios for every touched family (base AND hover)

**Game-menu `.is-link` hover, dracula** (`GamePage/index.css`, new `body.dracula &` override inside the existing `&:hover` block):

| State | Theme | Ratio |
| --- | --- | --- |
| hover | dracula | **9.151439148782794** (was 3.7935597497017444) |
| base | dracula | 9.151439148782794 (unchanged) |
| hover | all 9 other themes | unchanged (see table 2) |

**MainButton dropdown hover, gruvbox_dark** (`GamePage/index.css`, new standalone `.SteamInstallCaret .dropdown .link:hover { body.gruvbox_dark &:not(:disabled) {...} }` rule, specificity (0,4,0)):

| State | Theme | Ratio |
| --- | --- | --- |
| hover | gruvbox_dark | **12.056162112962957** (was 3.9078232730305023) |
| base | gruvbox_dark | 12.056162112962957 (unchanged) |
| hover | all 9 other themes | unchanged (see table 2) |

**Pure `.is-text` hover, nord-light and nord-dark** (`_buttons.scss`, two new rules nested inside `.button.is-text:hover`):

| State | Theme | Ratio |
| --- | --- | --- |
| hover | nord-light | **5.13361898650271** (was 3.356770572062584) |
| hover | nord-dark | **5.13361898650271** (was 4.41083696523498) |
| base | nord-light | 8.881467607169904 (unchanged) |
| base | nord-dark | 11.40705477550448 (unchanged) |
| hover | all 8 other themes | unchanged (see table 2) |

Nothing was found to miss 4.5:1 with no route satisfying the no-regression rule (fix-decision-rule step 4 never fired); every miss had a theme-scoped override available that did not regress a passing theme.

## 4. Reachability verdict: `.settingsWrapper > .button.is-text`

**UNREACHABLE — deleted.**

- **Arm 1 (direct children):** Walked every direct JSX child of both `.settingsWrapper` hosts (`Settings/index.tsx`, `Accessibility/index.tsx`) to its own rendered DOM root, recursing transparently through React Fragments and pass-through wrapper components (`SelectField`, `PathSelectionBox`, `TextInputWithIconField`, `TextInputField`, `ProgressDialog`, `TextWithProgress`, `TabPanel`, `StyledEngineProvider`/`Box`). No root in the entire walk carries the `is-text` class token.
- **Arm 2 (transitive import reachability):** Only 3 files in `src/frontend` carry the `is-text` className literal (`GameSubMenu/index.tsx`, `MainButton.tsx`, `DownloadManager/index.tsx`). Traced the import graph forward from both hosts: none is reachable. Explicitly ruled out a false-positive: `declaredUnavailable.ts` is imported by several Settings files, but it only mentions `GameSubMenu` in prose comments — the edge runs consumer → helper, not helper → `GameSubMenu`.
- **Both arms completed and agree.** The rule was deleted from `src/frontend/screens/Settings/index.css`, replaced with a comment carrying forward the specificity note: if a direct-child `.button.is-text` is ever reconnected, it falls through to the lower-specificity sibling `.settingsWrapper .button` rule ((0,2,0) vs the deleted rule's (0,3,0)) — layout-only, no colour/margin/padding — so a replacement rule would need to be authored, not assumed.

## 5. Not-live-verified disclaimer

Every ratio in this summary is token-resolved through `themeTokens.test.ts`'s resolver chain (`themeTokens` + `globalTokens` + `resolveValue` + `contrastRatio`) — the same chain 261011-pjv and 261011-gpn used. No live capture (pixel sampling, screenshot, or browser render) backs any of this census or its fixes.

## Decisions Made

- Pure `.is-text` hover fix is HOVER-scoped only, not block-level like the gruvbox_dark precedent in the same stylesheet — proved mathematically impossible to satisfy both base and hover luminance constraints with one static colour (nord-light needs a light foreground against its dark `--accent` at base, but a very dark foreground against `--primary-hover` at hover).
- `.settingsWrapper > .button.is-text` deleted rather than left in place, since both reachability arms completed and agreed it is dead CSS — the plan's explicit "delete" branch, not a half-measure.

## Deviations from Plan

None — plan executed exactly as written across all 3 tasks. No Rule 1-4 auto-fixes were needed; the plan's own fix-decision-rule step 4 (escalate, do not half-fix) never fired since every miss had a non-regressing theme-scoped override available.

## Issues Encountered

None.

## Verification output

1. **Full `themeTokens.test.ts` suite, post all fixes:**
   ```
   Test Suites: 1 passed, 1 total
   Tests:       270 passed, 270 total
   Time:        0.495 s
   ```

2. **Winetricks suite (shares `GUARDED_OVERRIDE_TAIL`/`applyTextColourDecl`), unaffected:**
   ```
   Test Suites: 14 passed, 14 total
   Tests:       243 passed, 243 total
   ```

3. **`npx prettier --check` on every stylesheet touched** (`src/frontend/screens/Game/GamePage/index.css`, `src/frontend/styles/_buttons.scss`, `src/frontend/screens/Settings/index.css`) and on `themeTokens.test.ts`: `All matched files use Prettier code style!` for each.

4. **Duplication guard on the deleted rule:**
   ```
   grep -cE '^[[:space:]]*\.settingsWrapper > \.button\.is-text[[:space:]]*\{' src/frontend/screens/Settings/index.css
   0
   ```
   (0 ≤ 1, satisfies the guard — a valid outcome for a deleted rule.)

5. **Conflict-marker grep on staged Task 3 files:** 0 matches.

6. **`pnpm planning-gates`:**
   ```
   [PASS] .planning/phases/34.2-.../currency-gate.py
   [PASS] .planning/phases/34.3-.../ported-channels-gate.py
   [PASS] .planning/phases/34.4-.../ported-channels-gate.py
   [PASS] .planning/phases/34.4.1-.../ported-channels-gate.py
   [PASS] .planning/phases/34.4.1-.../seam-parity-sweep-gate.py
   [PASS] .planning/phases/34.5-.../ported-channels-gate.py
   [PASS] .planning/phases/34.5-.../preload-surface-gate.py
   [PASS] .planning/phases/40-.../model-a-retirement-gate.py
   [PASS] .planning/planning-envelope-tag-gate.py
   [PASS] .planning/planning-frontmatter-gate.py
   [PASS] .planning/state-sdk-field-anchor-gate.py
   [PASS] .planning/todos/todo-frontmatter-gate.py

   12/12 planning gates passed.
   ```

7. **Todo frontmatter byte-check:** `severity: medium`, `platform: any`, `ready: code` confirmed present, bare, lowercase, in order, unchanged across the `git mv`.

8. **`graphify update .`:** ran after the Task 3 CSS deletion — `57709 nodes, 66629 edges, 5022 communities` rebuilt.

## Open observations

None — all 50 measured cases now clear 4.5:1, and the reachability question was fully resolved (both arms, no residual ambiguity). No out-of-remit finding was discovered during this task that required a new pending todo.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

All 3 tasks complete, todo closed and moved to `completed/`, no regressions in either affected test suite, `pnpm planning-gates` green. Nothing here blocks other work.

## Self-Check: PASSED

- `src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts` — FOUND
- `src/frontend/screens/Game/GamePage/index.css` — FOUND
- `src/frontend/styles/_buttons.scss` — FOUND
- `src/frontend/screens/Settings/index.css` — FOUND
- `.planning/todos/completed/2026-10-11-button-is-text-hover-and-is-link-pairs-miss-4-5-to-1.md` — FOUND
- `.planning/todos/pending/2026-10-11-button-is-text-hover-and-is-link-pairs-miss-4-5-to-1.md` — ABSENT (correct, moved)
- commit `4128be9c6` — FOUND in `git log --oneline --all`
- commit `f90c76cfd` — FOUND in `git log --oneline --all`
- commit `88e18329a` — FOUND in `git log --oneline --all`

---
*Phase: quick-261015-7tt*
*Completed: 2026-10-15*
