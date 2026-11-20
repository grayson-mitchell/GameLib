---
quick_id: 261003-uu8
status: complete
completed: 2026-10-03
commit: 7904f87fd
---

# Summary — store logos on the four Stores nav rows

Done as specified. Amazon Luna, Epic, GOG and Steam now render their storefront
logo in the Stores tier-2 panel, in the row order quick `261003-b63` set.

## What shipped

| file | change |
| ---- | ------ |
| `NavItem/index.tsx` | new `iconElement?: ReactNode` prop; single resolved icon node feeding the existing `.NavItem__icon` wrapper |
| `NavItem/index.scss` | new `.NavItem__storeLogo` rule — `width/height: 1em` + `fill: currentColor` |
| `StoresPanel/index.tsx` | four rows pass `<StoreLogos runner=... className="NavItem__storeLogo" />` |
| `NavItem.test.tsx` | 3 new tests: `iconElement` renders in the wrapper, suppresses the FA branch, and no wrapper when neither prop is given |
| `StoresPanel.test.tsx` | `gamelib-icon.png` stub (see trap below) |

## The two decisions worth keeping

**`fill: currentColor` is the change, not a detail.** None of the four SVGs
declares a `fill`, and every rule in `NavItem/index.scss` sets `color` — which
does not drive SVG `fill`. Dropped in unstyled, the logos paint SVG-default
black and disappear on every dark theme. `currentColor` inherits the row colour
each theme already defines, so all 13 themes are covered by construction. This
is the same failure class as the `--border-color` 1.08:1 finding and the
gruvbox_dark/dracula focus-ring drop this stylesheet's own comments record.

**The rule is scoped to its own class deliberately.** The obvious spelling,
`.NavItem__icon > svg`, would have resized the FontAwesome glyph on every other
`NavItem` in the app, because `FontAwesomeIcon` renders an `svg` into that same
wrapper. A dedicated class passed from the call site touches nothing else.

## Trap worth recording

Importing `StoreLogos` into `StoresPanel` turned `StoresPanel.test.tsx` red:
no jest transform handles binary assets. Note the asymmetry — the `?react` SVG
imports **are** module-mapped and fine; only `gamelib-icon.png` needed a stub,
the same one `destinationCoverage.test.tsx` already carried at its line 93.
That file passed throughout for exactly that reason.

## Verification

- `npx jest src/frontend/components/UI/NavShell/__tests__/` — **30 suites, 421
  tests, all green**, including the `cssTokenSweep` gate (no new custom
  properties were introduced).
- `npx tsc --noEmit -p tsconfig.json` — exit 0.
- `npx prettier --check` over all five source/test paths — green, **after a
  real catch**: `tsc` and the full jest run were both green on a `StoresPanel`
  that prettier then rejected. `--file-info` was run first and reported all five
  paths `{ "ignored": false }`, so the check was genuine assurance rather than
  vacuous. This is the third-plus recurrence of the exact pattern CLAUDE.md
  documents.

## Not done, not claimed

**No live 13-theme visual pass was run.** Theme survival here is a structural
argument (`fill: currentColor` inherits each theme's existing row colour), not
a measurement. Given this repo's record on UI claims — "no layout shift" wrong
twice, a token correct for the wrong surface shipping at 1.15:1 — a screenshot
pass across the themes, and a check of how the 1em square sits against the
24px wrapper, is still owed before anyone calls this visually verified.

## Context note

Executed inline rather than via `gsd-planner`/`gsd-executor`. A second session
(`261003-u48`) was committing to this same working tree throughout — HEAD moved
twice mid-task (`3e5e6daaa` → `9b70e67e6` → `69ec6dd3a`) — and
`workflow.use_worktrees` is `false`, so spawned executors would have shared the
tree with its uncommitted work. Every `git add` here named explicit paths; no
`git add -A` was used.
