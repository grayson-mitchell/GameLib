---
created: 2026-09-11
title: "Humble Keys row separator is effectively invisible in light themes (RGB delta 2 vs 108 in dark)"
area: humble-keys-ui
status: RESOLVED
severity: medium
platform: any
ready: live-gate
source: "Phase 43 plan 43-10 Task 2 live gate, REQ-43-19 item 4, operator run 2026-09-11"
files:
  - src/frontend/screens/Humble/Keys/index.css (.humbleKeyRow border-bottom, :214-224)
resolves_phase: null
---

## Problem

The Humble Keys row separator renders at wildly different contrast depending on theme. Measured
from packaged-build screenshot pixels, same 1.0 CSS px full-width line in every case:

| Theme background | Seam colour | Max channel delta vs neighbours | REQ-43-19 threshold ≥3 |
|---|---|---|---|
| dark `[20,23,41]` | `[128,128,128]` | **108–109** | PASS |
| dark `[26,28,33]` | `[31,33,38]`..`[43,46,50]` | **11–19** | PASS |
| light `[237,239,244]` | `[238,240,245]` | **2** | **FAIL** |

In light themes the separator is one step above the background and is, for practical purposes,
not there. The geometry is correct — the line paints, full width, at exactly 1.0 CSS px — it is
purely a colour-contrast failure.

The declaration is `border-bottom: 1px solid var(--divider, rgba(255, 255, 255, 0.08))`. The
**fallback is white at 8% opacity**, which is a visible hairline over a dark background and
almost nothing over a light one. Either `--divider` is undefined in the light theme (so the
white fallback applies and washes out), or it is defined to a value with the same problem —
worth checking which before fixing, because the remedy differs.

This is exactly the multi-theme survival case GameLib's own styling rules call out: a colour
chosen against one background, shipped against all of them.

## Solution

Establish what `--divider` actually resolves to in the light themes (the measurement above says
the *rendered result* is delta 2; it does not by itself distinguish "token missing, fallback
applied" from "token defined badly").

- If the fallback is what is painting, the fix is to define `--divider` per theme rather than
  relying on a white-biased default.
- A theme-agnostic alternative is a `color-mix()` against the surface colour, or a token pair
  (`--divider-on-light` / `--divider-on-dark`).

Do not fix by darkening the single value — that just moves the failure to the dark themes.

Verification should re-measure the seam delta in at least one light and one dark theme and
require ≥3/255 in both, which is the threshold `43-LIVE-GATE.md` item 4 already defines.

## Related

- Found by the REQ-43-19 gate, which scored item 4 PASS in two dark themes and FAIL in light.
  The absence-after-last-row half PASSED and is unaffected.
- `43-LIVE-GATE.md` § Verdict carries the full measurement.

## Fix applied (2026-09-11, quick task 260911-p6s) — `ready` moved `code` → `live-gate`

Answer to the question this todo posed ("worth checking which before fixing, because the remedy
differs"): the token is **missing, not badly defined**. `--divider` is declared in only 2 of the
11 theme blocks in `themes.scss` (`:97` `var(--neutral-03)` and `:145` `gray`) — every other
theme, including all the light ones, fell through to the literal `rgba(255, 255, 255, 0.08)`
fallback, which is what actually painted the measured delta-2 seam.

Defining `--divider` per theme was **not available** as the remedy: two existing NavShell gates
actively forbid universalising the token —
`src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts:285` (census asserting
`--divider` is declared in strictly fewer theme blocks than the file defines) and
`src/frontend/components/UI/NavShell/__tests__/appShellLayout.test.ts:282` (SANITY asserting
`tokenResolvesInEveryTheme('divider') === false`). So the fix taken is the "theme-agnostic
alternative" this todo already named: the fallback at all **three** `--divider` sites in
`Keys/index.css` (not just the one measured — `.humbleKeyRow` border-bottom, `:224`;
`.humbleKeysColumnHeader` border-bottom, `:588`; `.humbleKeysSortPicker
.MuiOutlinedInput-notchedOutline` border-color, `:614`) is now
`color-mix(in srgb, currentColor 14%, transparent)`. `currentColor` is a CSS-wide keyword, not a
custom property, so it cannot be undefined in any theme regardless of whether `--divider` itself
is ever declared there.

What remains unproven: the colour deltas cannot be confirmed without a packaged rebuild and a
live operator run — the Frontend jest project has no jsdom and no CSS engine
(`testEnvironment: 'node'`), so `color-mix` resolution is a source-level guarantee only.

Closure condition: the next Phase 43 REQ-43-19 live gate run re-measures the seam delta in at
least one light and one dark theme and requires ≥3/255 in both, same as this todo's own
"Solution" section already specified.

Desk-level evidence: `src/frontend/screens/Humble/Keys/__tests__/humbleKeysStylesheet.test.ts`
asserts the `color-mix` fallback's source text at all three sites, that no white-biased fallback
survives, and that no bare `var(--divider)` was introduced.

## RESOLVED (2026-09-11, quick task 260911-qds) — REQ-43-19 run 2, item 4: PASS

Session `/tmp/gamelib-gate-20260911T062945Z`, preserved at `43-11-evidence/`. Build under test:
`gamelib-shell` sha256 `1cd1e843…3f5a`, HEAD `0d2ae9862` (carries the `c690a117a` fix above).

| Theme background | Seam colour | Max channel delta vs neighbours | Threshold ≥3 | Was (run 1) |
|---|---|---|---|---|
| light `[237,239,244]` | `[209,210,215]` | **29** | PASS | delta **2** (FAIL) |
| dark `[26,28,33]` | `[51,57,64]` | **31** | PASS | delta 11–19 |

This is exactly the closure condition this todo's own "Fix applied" section stated: the seam delta
is now ≥3/255 in at least one light AND one dark theme, same threshold `43-LIVE-GATE.md` item 4
already defines. 7 separators were sampled per capture, each full-width at 107/107 sampled columns.

**Predicted-value corroboration, proving the PASS is attributable to the fix and not a theme
change:** `color-mix(in srgb, currentColor 14%, transparent)` with `--text-default #20242c` over
the light background `[237,239,244]` computes `[208,211,216]`; the measured seam is
`[209,210,215]` — agreement within ±1. The `color-mix` declaration is confirmed to be the thing
actually painting, not an incidental change elsewhere.

Todo closed. No further live-gate work is owed to this finding.
