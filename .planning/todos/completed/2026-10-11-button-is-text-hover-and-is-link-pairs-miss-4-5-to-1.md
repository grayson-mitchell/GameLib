---
created: 2026-10-11T00:00:00.000Z
title: "`.button.is-text`'s 22 `.is-link` render sites and its own `:hover` state are unexamined for contrast"
area: ui
severity: medium
platform: any
ready: code
found_by: "quick 261011-pjv, closing the gruvbox_dark Retry/Clear/.button.is-text todo, 2026-10-11"
files:
  - src/frontend/styles/_buttons.scss
  - src/frontend/screens/Game/GameSubMenu/index.tsx
  - src/frontend/screens/Game/GamePage/components/MainButton.tsx
---

Quick 261011-pjv fixed `.button.is-text`'s base-state gruvbox_dark collision (`--background` on
`--accent`, 4.35:1) with a `body.gruvbox_dark &:not(.is-link):not(:disabled)` override, deliberately
excluding `.is-link` consumers because they take their text colour from a different rule chain.
That exclusion was correct for the fix it made, but it leaves three things unexamined:

1. **The 22 `.is-link` render sites' own pair is unmeasured across all 10 themes.** 21 live in
   `Game/GameSubMenu/index.tsx` (the per-game menu's install/uninstall/etc. options), 1 in
   `Game/GamePage/components/MainButton.tsx` (the install-options split button). These take their
   text colour from `.button.is-link` (`_buttons.scss`) or, in the game menu specifically, from
   `.gameConfigContainer .game-actions .gameTools .link` at `(0,4,0)` — against
   `--navbar-background`, not `--accent`/`--background`. Neither pair has been run through
   `themeTokens.test.ts`'s all-10-theme census; nord-light in particular has not been modelled for
   this pair at all. 261011-pjv's census covered only the pure `.is-text` base state, not this one.

2. **`.button.is-text:hover` (`_buttons.scss`) is unexamined outside gruvbox_dark.** 261011-pjv's
   Test E confirmed the new override does not regress gruvbox_dark's hover state (7.38:1 against
   a 6.09:1 base, both passing), but no test has run `.button.is-text:hover`'s
   `var(--primary-hover)` fill against the DownloadManager "Clear List" button's text colour, or
   against the game menu's `.is-link` hover colour (`var(--accent)`, per `.button.is-link:hover`),
   across the other 9 themes. nord-light and nord-dark are flagged by prior census work
   (`2026-10-11-library-sign-in-row-glyphs-and-button-hover-miss-in-nord-light.md`) as themes
   where hover-state text contrast has already missed floors on unrelated controls, so they are
   the first themes to check here, not an exhaustive claim that only those two miss.

3. **`.settingsWrapper > .button.is-text` (`Settings/index.css:148`, `color:
   var(--text-quartenary)`) looks unreachable.** `settingsWrapper` is only ever rendered by
   `Settings/index.tsx:131` and `Accessibility/index.tsx:110`; neither file nor its grep for
   `is-text` turns up a match, and all 23 confirmed `.button.is-text` render sites live in
   `DownloadManager/index.tsx`, `Game/GameSubMenu/index.tsx` and `MainButton.tsx` instead — none
   of which mention `settingsWrapper`. Treat as dead CSS pending a reachability check (a
   descendant component rendered inside one of those two wrappers could still introduce a direct
   `.button.is-text` child later), not as a measured, live rule. Worth noting if it is ever
   reconnected: its selector specificity, `(0,3,0)`, is lower than 261011-pjv's gruvbox_dark
   override, `body.gruvbox_dark .button.is-text:not(.is-link):not(:disabled)` at `(0,5,0)` — so a
   future `.settingsWrapper > .button.is-text` render would lose its `--text-quartenary` colour to
   `--neutral-01` under gruvbox_dark, not blend with it.

No live capture backs any of this — same resolver chain as 261011-pjv and 261011-gpn
(`themeTokens.test.ts`), not pixel-sampled.

## Resolution (2026-10-15, quick 261015-7tt)

### a. Winning rule per family, resolved from the stylesheets (not assumed)

| Family | Winning selector | Specificity | Source file | Surface measured against |
| --- | --- | --- | --- | --- |
| game-menu base | `.gameConfigContainer .game-actions .gameTools .link` | (0,4,0) | `GamePage/index.css` | `.gameTools`'s `var(--navbar-background)` |
| game-menu hover | same selector's `&:hover` | (0,4,0) | `GamePage/index.css` | same, `var(--navbar-background)` |
| MainButton dropdown base | `.button.is-link` | (0,2,0) | `_buttons.scss` | `.mainInfo`'s `var(--body-background)` (nearest ancestor with a depth-0 `background-color`; `.dropdown` itself is `transparent`, `.mainInfoWrapper`/`.buttons`/`.dropdownContainer` declare none) |
| MainButton dropdown hover | `.button.is-link:hover`, overridden for gruvbox_dark by the new `.SteamInstallCaret .dropdown .link:hover` (0,4,0) | (0,3,0) bare / (0,4,0) override | `_buttons.scss` / `GamePage/index.css` | same, `var(--body-background)` |
| pure `.is-text` hover | `.button.is-text` base colour (inherited — `.button.is-text:hover` declares no `color` of its own), overridden for nord-light/nord-dark | (0,2,0) bare / (0,4,0) override | `_buttons.scss` | `.button.is-text:hover`'s own `var(--primary-hover)` fill |

`Dropdown/index.scss` contributes zero colour candidates for the MainButton render site — its only
selectors carrying any class token at all (`.only`, `.toggleWithOnly`, `.dropdownContainer`, etc.)
name neither `.link`, `.is-link` nor `.is-text` anywhere in the nested tree (verified at every
depth, not just depth 0 — `.only` sits three levels deep).

IACVT (F3) confirmed exactly as stated: `--navbar-inactive` is declared in exactly 2 of 10 theme
blocks (`midnightMirage`, `nord-light`) and nowhere global; the winning declaration is the bare
`var(--navbar-inactive)` form with no fallback. In the 8 undeclared themes the property is Invalid
At Computed-Value Time, resolves to `unset`, and — because `color` is inherited — the element
inherits `body { color: var(--text-default) }`, not the losing `.button.is-link` declaration. Both
halves are asserted as live (not hardcoded) can-fail tests in `themeTokens.test.ts`.

### b. All 50 ratios, pre-fix, as numbers

**Game-menu `.is-link` (base, surface `--navbar-background`):**

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

**Game-menu `.is-link` (hover, surface `--navbar-background`) — PRE-FIX:**

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

**MainButton dropdown `.is-link` (base, surface `--body-background`):**

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

**MainButton dropdown `.is-link` (hover, surface `--body-background`) — PRE-FIX:**

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

Worst per family: game-menu hover 3.79:1 (dracula); MainButton dropdown hover 3.91:1 (gruvbox_dark);
pure `.is-text` hover 3.36:1/4.41:1 (nord-light/nord-dark). All other 46 cases cleared 4.5:1 with no
stylesheet change required.

### c. What was fixed, and how (post-fix ratios for every touched family, base AND hover)

**1. Game-menu `.is-link` hover, dracula** (`GamePage/index.css`, `&:hover`'s `body.dracula &`
override, same idiom already used by the other themes nested there): restores
`var(--navbar-active, var(--accent-overlay, var(--accent)))`'s fallback-chain shape but resolves to
a passing colour. Post-fix: dracula hover **9.151439148782794** (matches dracula's own base value —
coincidental, not an alias). All 9 other themes' hover ratios unchanged (no override touches them).
Base state (all 10 themes) was never touched and remains as recorded in (b).

**2. MainButton dropdown hover, gruvbox_dark** (`GamePage/index.css`, new standalone rule
`.SteamInstallCaret .dropdown .link:hover { body.gruvbox_dark &:not(:disabled) { color:
var(--text-default); } }`, specificity (0,4,0), scoped to MainButton's sole render site — distinct
selector chain from the 21 GameSubMenu `.is-link` sites, so it cannot regress fix #1): restores the
same button's own already-passing BASE colour (`var(--text-default)`, `#eae8e5` in gruvbox_dark)
during hover rather than introducing a new hue. Post-fix: gruvbox_dark hover **12.056162112962957**
(identical to its own base ratio — same colour now used for both states). All 9 other themes'
hover ratios unchanged. Base state (all 10 themes) unchanged.

**3. Pure `.is-text` hover, nord-light and nord-dark** (`_buttons.scss`, two new hover-scoped rules
nested inside `.button.is-text:hover`: `body.nord-light &:not(.is-link):not(:disabled) { color:
var(--neutral-01, #070a0b); }` and the nord-dark twin): proved mathematically that a block-level
(always-on) override — the gruvbox_dark precedent's shape — is impossible here, because nord-light's
BASE state needs a light foreground against its dark `--accent` (#30444a) while its HOVER state
needs a very dark foreground against `--primary-hover` (#a17399); the two luminance constraints are
mutually exclusive (light side needs Lf≥1.17, impossible; dark side needs Lf≤0.0103, which then
fails the base constraint). The fix is therefore HOVER-scoped only, leaving the passing BASE state
untouched. Post-fix: nord-light hover **5.13361898650271**, nord-dark hover **5.13361898650271**
(same global constant `--neutral-01` against the same theme-independent `--primary-hover` hex, so
both themes land on the identical ratio). All 8 other themes' hover ratios unchanged. Base state
(all 10 themes, 8.88:1 nord-light / 11.41:1 nord-dark and better) unchanged.

Nothing was found to miss 4.5:1 with no route satisfying the no-regression rule (decision-rule step
4 never fired) — every miss had a theme-scoped override available that did not regress a passing
theme.

### d. Gate description

Pre-fix: the census was run before any stylesheet edit landed, observing the three predicted RED
misses above (dracula game-menu hover 3.7935597497017444, gruvbox_dark MainButton hover
3.9078232730305023, nord-light/nord-dark pure-is-text hover 3.356770572062584/4.41083696523498),
plus the full non-vacuity/can-fail scaffold passing. Post-fix: `npx jest
src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts --selectProjects Frontend` —
**270 passed, 270 total**. The pre-existing Winetricks suites that share `GUARDED_OVERRIDE_TAIL`
and `applyTextColourDecl` — `npx jest
src/frontend/screens/Settings/sections/WinetricksSettings/__tests__ --selectProjects Frontend` —
**243 passed, 14 suites, 14 total**, unaffected. `npx prettier --check` passed on
`themeTokens.test.ts`, `_buttons.scss`, `GamePage/index.css` and `Settings/index.css`. Commits:
`4128be9c6` (Task 1: game-menu census + dracula hover fix), `f90c76cfd` (Task 2: MainButton dropdown
+ pure `.is-text` hover census + gruvbox_dark/nord-light/nord-dark fixes + guard proofs), and this
commit (Task 3: `.settingsWrapper > .button.is-text` reachability proof + deletion + todo closure).

### e. Reachability verdict: `.settingsWrapper > .button.is-text` is DEAD CSS — deleted

**Arm 1 (direct children).** Walked every direct JSX child of both `.settingsWrapper` hosts
(`Settings/index.tsx`, `Accessibility/index.tsx`) to its own rendered ROOT element, through every
Fragment and prop-forwarding wrapper component in the chain (a Fragment's top-level children flatten
to become direct DOM children of `.settingsWrapper`; a component's root further down the chain is
what matters, not what it renders below that root):

- `Settings/index.tsx`: `NavLink`→`<a>`, `<h1>`, `GeneralSettings`→`<div>`, `GamesSettings`→Fragment
  flattening to `<p className="defaults-hint">` + MUI `<Tabs>` (root `<div>`) + seven
  `<TabPanel>` (root `<div role="tabpanel">`, no `className` ever passed), `SyncSaves`→(branches:
  `LegendarySyncSaves`/`GOGSyncSaves`, each Fragment-flattening through `<div className="defaults-hint">`,
  `ProgressDialog` (`<div className="progressDialog...">`), `TextWithProgress` (`<div
  className="textWithProgress">`), `PathSelectionBox`→`TextInputWithIconField`→`TextInputField`
  (`<div className="textInputFieldWrapper...">`), `SelectField` (`<div
  className="selectFieldWrapper...">`), or an empty fragment), `AdvancedSettings`→`<div>`,
  `LogSettings`→Fragment flattening to `<h3>` + `<p className="report-problem-instructions">` +
  `<div className="logs-wrapper...">`, `SystemInfo`→`StyledEngineProvider` (no DOM wrapper)→`Box`
  (`<div className="systeminfo">`) or `CircularProgress` (`<svg>`), `FooterInfo`→`<div>`.
- `Accessibility/index.tsx`: `<h1>`, `<span className="rangeWrapper...">`, two `<span
  className="setting">` wrapping `SelectField` (root `<div>`, as above) and `ThemeSelector`
  (Fragment flattening to `SelectField` + `PathSelectionBox`, both roots as above), four more
  `<span className="setting">` wrapping `ToggleSwitch` (grandchild, irrelevant).

No root in this entire walk carries the `is-text` class token. A component whose root cannot carry
`is-text` cannot satisfy the `>` combinator no matter what it renders below that root, so every
button nested deeper (e.g. the `afterSelect`/`afterInput` buttons passed into `SelectField` and
`PathSelectionBox`) is a grandchild, not a direct child, and is structurally irrelevant here.

**Arm 2 (transitive file reachability).** Only 3 files in `src/frontend` contain the `is-text`
className literal at all (Task 1's re-derived F1 census): `Game/GameSubMenu/index.tsx`,
`Game/GamePage/components/MainButton.tsx`, `DownloadManager/index.tsx`. None is reachable via the
import graph from either host:

- `MainButton.tsx`'s only importers (`SteamBottleSetup.ts`, `EligibilityLoadingRow.tsx`,
  `steamEligibilityProbe.ts`, `GameSubMenu/index.tsx`, `GamePage/index.tsx`,
  `GamePage/components/index.tsx`, `Dropdown/index.tsx`, `helpers/steamInstallOptionsEntry.ts`) are
  all Game-screen or Library-InstallModal files; none is imported, directly or transitively, by
  `Settings/index.tsx` or `Accessibility/index.tsx`.
- `GameSubMenu/index.tsx`'s importers add `DotsMenu.tsx` and `helpers/declaredUnavailable.ts`.
  `declaredUnavailable.ts` IS imported by several Settings files (`WinetricksSettings/index.tsx`,
  `AdvancedSettings/index.tsx`, `components/SteamGridDbApiKey.tsx`) — but the edge runs the other
  way: `declaredUnavailable.ts` only *mentions* `GameSubMenu` in prose comments, it does not import
  it. No forward path exists.
- `DownloadManager/index.tsx`'s only real import edge is `App.tsx`'s lazy route
  (`import('./screens/DownloadManager')`); `state/InstallProgress.ts`'s and `types.ts`'s hits on
  the string are a comment and a type-only import (`DownloadManagerState`) respectively, not
  component imports. Neither `Settings/index.tsx` nor `Accessibility/index.tsx` imports `App.tsx`
  (confirmed against both files' full import lists).
- The `frontend/components/UI` barrel (imported by both hosts) re-exports none of `Dropdown`,
  `MainButton`, `GameSubMenu` or `DownloadManager` (confirmed empty grep). `ContextMenu` (imported
  by `Settings/index.tsx`) imports nothing beyond React/MUI/i18n and its own CSS.

**Both arms completed and agree: unreachable.** The rule was deleted from
`src/frontend/screens/Settings/index.css`. If a direct-child `.button.is-text` under
`.settingsWrapper` is ever reconnected, it will fall through to the sibling `.settingsWrapper
.button` rule instead (lower specificity, (0,2,0) vs the deleted rule's (0,3,0)) — `display:
inline-flex; align-items: center; justify-content: center;` only, no colour/margin/padding — so a
replacement rule would need to be authored, not assumed; this note is carried into the deleted
rule's own in-situ replacement comment in `Settings/index.css` as well.

### f. NOT LIVE-VERIFIED

Every ratio above is token-resolved through `themeTokens.test.ts`'s resolver chain (`themeTokens` +
`globalTokens` + `resolveValue` + `contrastRatio`), the same one 261011-pjv and 261011-gpn used —
not pixel-sampled. No live capture backs any of this census or its fixes.
