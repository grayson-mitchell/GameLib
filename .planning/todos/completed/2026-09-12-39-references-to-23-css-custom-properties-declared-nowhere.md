---
created: 2026-09-12
title: "39 references to 23 CSS custom properties that are declared nowhere — including two typos in shipped components"
area: shared-ui-tokens
status: CLOSED 2026-09-12 (quick 260912-it4)
severity: medium
platform: any
ready: code
source: "quick 260912-7o4, measured while closing the --font-secondary-bold todo; that todo fixed 3 of the then-42 references and explicitly scoped the rest out"
files:
  - src/frontend/components/UI/SearchBar/index.scss
  - src/frontend/screens/Library/components/GameCard/index.css
  - src/frontend/themes.scss
  - src/frontend/styles/_buttons.scss
  - src/frontend/screens/Settings/index.css
  - src/frontend/screens/WineManager/index.css
  - src/frontend/screens/Login/index.scss
  - src/frontend/screens/DownloadManager/components/DownloadManagerItem/index.css
  - src/frontend/components/UI/SteamGridDBPicker/index.scss
  - src/frontend/components/UI/EditGameDialog/index.css
  - src/frontend/components/UI/PopoverComponent/index.scss
  - src/frontend/components/UI/Dropdown/index.scss
  - src/frontend/components/UI/PathSelectionBox/index.css
resolves_phase: null
---

# 39 references to 23 CSS custom properties that are declared nowhere

## How this was measured

Quick `260912-7o4` closed `2026-09-11-font-secondary-bold-is-used-but-defined-nowhere.md`, which
reported one undefined token at three call sites. Generalising that check found the todo had
named 3 of 42.

Collect every `--x:` declaration across `src/**` and `public/**` (`.css`, `.scss`, `.ts`, `.tsx`,
`.js`, `.html`), plus the two names `GlobalState.tsx:528-542` sets at runtime via
`setProperty` (`--primary-font-family`, `--secondary-font-family`). Collect every `var(--x)`
reference in `.css`/`.scss`. Subtract. At commit `3a170ab9a` the difference is **39 references
across 23 names**. No in-repo theme file supplies any of them:
`git ls-files '*.css' '*.scss'` outside `src/` returns only `.planning/sketches/themes/*` and the
`sketch-findings-gamelib` skill's copies of them, and none declares any of these.

## Why it matters, and why it is not uniform

Two distinct failure modes, which want different fixes:

**Shorthands silently reset everything they cover.** `font: var(--undefined)` is invalid at
computed-value time, so *every* font longhand computes to `unset` — for inherited properties,
`inherit`. The rule contributes nothing. This is the mechanism the parent todo documented.

**Longhands just fall back.** `color: var(--undefined)` likewise computes to `unset`, inheriting
rather than applying. Less destructive, equally silent.

Neither produces a console warning, a build error or a visual crash, so nothing in the repo
catches any of it. `pnpm lint` is eslint on `.ts`/`.tsx` only — there is no stylelint.

## The 23 names

### Typos (fix is unambiguous — correct the spelling)

- `--input-backgroundd` — `SearchBar/index.scss:25`. The real token `--input-background` exists
  and is used elsewhere in the same file. One line above the region quick `260911-umj` and
  `260912-7o4` both edited, and missed by both.
- `--status-sucess` — `GameCard/index.css:385`. Real token is `--status-success`.
- `--status-denied` — `themes.scss:16`. Note the location: a *theme* references a status token
  that no theme declares. Candidate real name is `--status-danger`; confirm against the
  `--status-*` set before assuming.

### Retired type vocabulary (13 refs) — same defect as the parent todo

Deleted upstream by `b6f3da757` ("[Tech/Refactor] Frontend/design system", #1851, Oct 2022),
which introduced `src/frontend/styles/_typography.scss` and migrated most, not all, call sites.

- `--actions-font-family` x4 — `Login/index.scss:157,165`,
  `DownloadManagerItem/index.css:117,140`. Live name: `--primary-font-family`.
- `--content-font-family` x1 — `styles/_buttons.scss:157`. Live name: `--secondary-font-family`.
- `--font-size-sm` x3 — `EditGameDialog/index.css:23,98`,
  `SideloadDialog/index.scss:109`. Live name: `--text-sm`.
- `--font-secondary-regular` x2 — `Settings/index.css:27`, `WineManager/index.css:186`.
- `--font-secondary-regular-italic` x2 — `Settings/index.css:82,94`.
- `--font-primary-bold` x1 — `Login/index.scss:118`.

The three `--font-*` names are shorthand values and carry the parent todo's two traps: the old
weights were 400/500 (`--regular`/`--medium`, **not** `--bold`/700 — "bold" was a slot label),
and `var(--content-font-family) normal 400` was never a legal `font` shorthand in the first
place, so these rules have never applied. Migrating them is therefore a *rendering change*, not
a restoration, and each needs its delta stated the way `260912-7o4` stated its weight 400 → 500.

### Colour and surface tokens (needs a decision, not just a rename)

- `--border-color` x7 — `PopoverComponent/index.scss:6,8`, `SteamGridDBPicker/index.scss:12`,
  `WineManager/index.css:30,112,206`, `WineItem/index.css:113`
- `--background-hover` x2 — `SteamGridDBPicker/index.scss:58`, `DownloadManagerItem/index.css:63`
- `--warning-hover` x2 — `GameCard/index.css:492,501`
- `--stop-button` x2 — `styles/_buttons.scss:79`, `Settings/index.css:160`
- `--background-gradient`, `--bg-primary`, `--cancel-button-hover`, `--danger-rgb`, `--error`,
  `--install-button-hover`, `--installing-effect`, `--text`, `--text-muted`, `--token` — 1 each

`--border-color` at 7 sites across 4 components is the one worth looking at first: it is used
like a real shared token, so either it should be declared in `themes.scss` for every theme or
all 7 sites should move to whichever declared token they actually want.

## Open question before any bulk fix

Heroic ships user-supplied custom CSS (`screens/Settings/components/CustomCSS.tsx`) and custom
themes. Some of these names may be deliberate extension points a user theme is expected to
supply, in which case the fix is to declare a default in `themes.scss` rather than to rewrite the
call site. Decide per name; do not assume the whole list is dead. The three typos are exempt from
this question — nothing supplies a misspelling.

## Suggested approach

1. Fix the three typos first. Zero ambiguity, and `--input-backgroundd` sits in a component
   that has been edited twice in two days without anyone noticing it.
2. Migrate the 13 retired-vocabulary refs, stating the rendering delta per site.
3. Triage the colour/surface tokens against the custom-theme question above.
4. Consider a gate. This class is invisible to every gate the repo has; the used-vs-declared
   sweep above is ~25 lines of Python and would hold the line at 0 once the list is drained.

## Verification when fixed

Re-run the sweep and expect 0 undefined references, or an explicit allowlist naming each
survivor and why it is a legitimate theme extension point. Re-measure any element whose rendered
font or colour changes — per this project's measure-do-not-eyeball rule, the current
silent-inherit fallback looks plausible in some themes.

---

## CLOSED 2026-09-12 by quick task `260912-it4`

39 references / 23 names -> **1 reference / 1 name**, the one survivor being
`--installing-effect`, explicitly allowlisted in the new gate and spun out as
`.planning/todos/pending/2026-09-12-installing-effect-grayscale-amount-is-unrecoverable-needs-a-design-decision.md`
(`ready: human` -- it is a number with no recoverable value, so it needs a design
decision, not a code fix).

Gate installed: `src/frontend/components/UI/NavShell/__tests__/cssTokenSweep.test.ts`.
Both negative controls were run and both turned it RED before being reverted.

### Three corrections to this todo's premises

1. **`--status-sucess` must NOT be spelling-corrected.** `GameCard/index.css:385` read
   `color: var(--status-sucess, var(--success));` -- the fallback arm is declared, so the
   site rendered correctly already. `--status-success` is a RAW Figma constant that
   `body.nord-light` does not override, so "fixing the typo" would have made installed-game
   labels near-invisible on that theme. Collapsed to `var(--success)` instead. Zero delta.
2. **`--token` was never a reference.** `PathSelectionBox/index.css:9` is prose inside that
   file's opening block comment ("every colour is a `var(--token, fallback)`"). The fix was
   in the sweep, not the stylesheet.
3. **This todo's `files:` list omitted `SideloadDialog/index.scss`**, which carries the
   third `--font-size-sm` reference (`:109`).

### Two names this todo never saw

- **`--text-primary` x5** (PopoverComponent, WineItem, WineManager x3). Hidden because
  `SteamLogin/index.scss:86` carries a `//` comment whose text is literally
  `grep -rn -- "--text-primary:" src/frontend` -- the census matched that prose as a
  DECLARATION and concluded the token was declared. The comment documenting the token as
  dead is what hid its five live references.
- **`--primary-button-hover` x1** (`themes.scss:596`). Hidden because prettier wraps the
  declaration, and a line-by-line ref scan cannot see `var(\n  --primary-button-hover,`.

### One premise that turned out to be a non-defect

The execution plan predicted that `WineManager/index.css:206` and `WineItem/index.css:113`
were bare `border-bottom: var(--border-color);` and would remain visually inert for want of
a `border-style`, and directed a follow-up todo. Measured: all seven `--border-color` sites
carry an explicit `1px solid` (or `0 0 0 1px` for the box-shadow). No such gap exists, so no
todo was filed for it.
