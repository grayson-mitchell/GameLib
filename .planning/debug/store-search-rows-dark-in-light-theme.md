---
status: diagnosed
trigger: "store-search-rows-dark-in-light-theme: In a light theme the Store Search game rows use a light background with legible dark text (UAT 47 test 12, item 3)"
created: 2026-11-19T00:00:00Z
updated: 2026-11-19T00:00:00Z
---

## Current Focus

hypothesis: CONFIRMED. `.storeSearchRow` paints `background: var(--gradient-gamecard)`. That token is a card-art overlay gradient whose first stop is a hardcoded `rgba(0, 0, 0, 0.418)` that no theme can override; only the second stop (`--gamecard-title-color`) is themeable. The `background:` shorthand accepts a gradient, so it paints; the Deals card and Library tile use `background-color: var(--gradient-gamecard)`, which is invalid at computed-value time and paints nothing.
test: Headless Chrome render of the exact declarations with the real nord-light tokens (scratchpad repro, outside the repo).
expecting: shorthand row shows a dark band; `background-color` row is transparent; flat `--gamecard-title-color` row is light.
next_action: none (goal: find_root_cause_only). Hand back to caller for a fix plan.

reasoning (RCA branching, categories):
  - code: shorthand `background:` + non-themeable gradient token (CONFIRMED, the cause)
  - config/theme-token: nord-light sets `--gamecard-title-color` light (#ccdaf8cc) but there is no token for the gradient's first stop, so the theme cannot fix it; a custom light theme that omits `--gamecard-title-color` falls to the default #000000cc and is darker still (contributing, same cause family)
  - text token: `--text-default` in nord-light is #20242c, correct for a light surface (ELIMINATED as a cause)
  and_gate: two cooperating conditions, both needed: (a) the row uses the shorthand so the gradient actually paints, and (b) the gradient's first stop is hardcoded black alpha. Remove either and the dark band is gone. Treated as one root cause with two facets.

## Symptoms

expected: Stores > Store Search results rows are legible in both a dark and a light theme; in a light theme the row ("game bar") background is light.
actual: "light theme has dark grey game bars, with black text. would expect the game bars to be a light color"
errors: None reported
reproduction: Test 12 in UAT; Settings > theme set to a light theme, Stores > Store Search, search 'xcom'.
started: Discovered during UAT 2026-11-19 (the rule has been in place since Phase 20, commit db4921c02)

## Eliminated

- hypothesis: the row text colour token is wrong for light themes
  evidence: body.nord-light sets --text-default: var(--text-title) = #20242c (near black), the correct colour for a light surface. Text is dark because the surface under it is meant to be light; only the surface is wrong.
  timestamp: 2026-11-19

- hypothesis: nord-light fails to override the tile surface token
  evidence: body.nord-light does set --gamecard-title-color: #ccdaf8cc (themes.scss:465). That token is only the gradient's SECOND stop, so overriding it cannot remove the hardcoded dark first stop.
  timestamp: 2026-11-19

## Evidence

- timestamp: 2026-11-19
  checked: src/frontend/screens/StoreSearch/index.css:125-134 (.storeSearchRow)
  found: `background: var(--gradient-gamecard);` (shorthand). Title/price use `color: var(--text-default)`. No other background on the row; the breakdown panel and screen shell have none either.
  implication: The whole row surface is the gradient token.

- timestamp: 2026-11-19
  checked: src/frontend/themes.scss:249-254 and src/frontend/styles/_colors.scss:55-60
  found: `--gradient-gamecard: linear-gradient(180deg, rgba(0,0,0,0.418) 1.8%, var(--gamecard-title-color) 45%)`. Only `--gamecard-title-color` is themeable. Defined in :root defaults (80% black) and re-declared in the cyberSpaceOasis block; the only theme overriding --gamecard-title-color is nord-light (#ccdaf8cc, line 465). The gradient is a card-art overlay, designed for dark.
  implication: In any theme the top ~45% of the row blends toward black; fine on dark themes, a dark-grey band on light ones.

- timestamp: 2026-11-19
  checked: Headless Chrome render of the exact declarations on nord-light tokens (/private/tmp/claude-501/-Users-graysonmitchell-Projects-GameLib/2de676e6-a13c-4ee9-94fc-60a7cb60c94e/scratchpad/repro/repro.png, repro.html)
  found: Computed styles: A `background:` shorthand -> backgroundImage linear-gradient(rgba(0,0,0,0.42) 1.8%...), painted as a dark grey band (about #898b8e at the top) fading to light blue (#d2def7) by 45% of the row height; B `background-color: var(--gradient-gamecard)` -> backgroundImage none, backgroundColor rgba(0,0,0,0) (paints nothing); C `background: var(--gamecard-title-color)` -> flat rgba(204,218,248,0.8), light, legible.
  implication: Reproduces the operator's symptom; shows the Deals/Library declaration differs only in property name and silently degrades to transparent.

- timestamp: 2026-11-19
  checked: src/frontend/screens/Discounts/components/DiscountCard/index.css:8 and src/frontend/screens/Library/components/GameCard/index.css:2,268-270
  found: Both use `background-color: var(--gradient-gamecard)`. GameCard's own comment (lines 268-270) records "paints nothing: a gradient is not a color". The Library tile title bar uses the flat themeable token `background: var(--gamecard-title-color)` (GameCard/index.css:311). Library list rows (.gameListItem) have no background (transparent on body, border-bottom: gray).
  implication: Deals cards and Library tiles are transparent on the body colour in every theme, so they were never exposed to the dark stop. The existing correct-for-all-themes patterns are (1) transparent-on-body and (2) the flat `--gamecard-title-color` plate.

- timestamp: 2026-11-19
  checked: .planning/milestones/v0.6-phases/20-aggregated-store-search-cheapshark/20-UI-SPEC.md:100,164
  found: Spec says the row surface must match `.discountCard`'s `background-color: var(--gradient-gamecard)`, but the implemented rule (db4921c02, 20-05) wrote the `background:` shorthand, so it painted where the card it was meant to match does not.
  implication: A transcription divergence from the spec's stated reference, not a deliberate design choice; dark themes hid it because a dark-to-dark overlay looks like an intentional subtle bar.

- timestamp: 2026-11-19
  checked: grep for other `background: var(--gradient-gamecard` shorthand users
  found: Also src/frontend/screens/Discounts/components/DiscountFilters/index.css:7 (`.discountFilters`, `background: var(--gradient-gamecard, var(--background-darker))`). Same defect there; the Deals filter panel should show the same dark band in a light theme.
  implication: Sibling instance; fix both together.

- timestamp: 2026-11-19
  checked: Remaining dark-assumed hardcodes in StoreSearch/index.css
  found: `.storeSearchRow__breakdownItem:hover` uses `rgba(255,255,255,0.05)` (invisible on a light surface; same class as the pending Humble separator todo). `.storeSearchRow__breakdown` border-top uses `var(--divider, ...)` and `--divider` is defined (gray), so it is fine.
  implication: Secondary light-theme polish item, not the reported symptom.

## Resolution

root_cause: `.storeSearchRow` (src/frontend/screens/StoreSearch/index.css:128) uses `background: var(--gradient-gamecard)`. `--gradient-gamecard` is a dark card-art overlay with a hardcoded black-alpha first stop (`rgba(0,0,0,0.418) 1.8%`, themes.scss:250 / _colors.scss:56) that themes cannot override; only its second stop (`--gamecard-title-color`) is themeable. The shorthand paints the gradient, yielding a dark-grey band over the top of every row in a light theme (nord-light), under `--text-default` near-black text. Deals cards and Library tiles do not show this because they declare `background-color: var(--gradient-gamecard)`, which is invalid at computed-value time and paints nothing (transparent on the body colour).
fix: (not applied, diagnose-only)
verification: (not applicable)
files_changed: []
