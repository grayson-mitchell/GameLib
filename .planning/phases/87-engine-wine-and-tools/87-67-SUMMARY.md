---
phase: 87-engine-wine-and-tools
plan: 67
subsystem: uninstall-dialog
tags: [uninstall, bottle, toggleswitch, contrast, i18n, svc-02, gap-closure, f5]
status: complete

requires:
  - phase: 87-engine-wine-and-tools
    provides: "87-66 crate op engine_bottle_remove_per_game; 87-70 uninstaller removePrefix route reaching it; getPerGameBottleName (87-28)"
provides:
  - "UninstallModal bottleName state: set only when getPerGameBottleName({runner, appName}) equals the stored wineCrossoverBottle; enables the toggle on the default prefix, labels it with the bottle name, and shows one amber risk warning while it is on"
  - "Neutral accent-tinted default-prefix note and an amber theme-token risk warning (no hex) in UninstallModal/index.scss"
  - "A legible disabled ToggleSwitch in every theme: --border-color for the disabled label and box, hover recolouring scoped to enabled toggles"
  - "Catalogue keys gamelib:uninstall.removeBottle and gamelib:uninstall.removeBottleWarning, with the presence baseline regenerated"
affects: [87-69 re-run item 7 (operator eye on the dialog in the three themes), every screen that renders a disabled ToggleSwitch]

actuals:
  tokens: 21000
  tasks: 2
  commits: 4

plan_head_before: 6bf07ca031f91be716213dd4b97c4ce83f70e301
plan_head_after: 216df4c62bfdc71d6a3856d993bb95d0e298459a
commits: 4

tech-stack:
  added: []
  patterns:
    - "A renderer rule that mirrors a backend rule applies the same two facts (name from the engine layer, equality with the stored value) and falls back to the old branch when either fails or the query rejects"
    - "A disabled-state colour test reads the stylesheet and theme tokens as text, resolves them per theme through the existing tokenResolve/scssTokenSource helpers, and fails loudly on an unresolvable token"

key-files:
  created:
    - src/frontend/components/UI/UninstallModal/__tests__/bottleToggle.test.tsx
    - src/frontend/components/UI/ToggleSwitch/__tests__/disabledContrast.test.ts
  modified:
    - src/frontend/components/UI/UninstallModal/index.tsx
    - src/frontend/components/UI/UninstallModal/index.scss
    - src/frontend/components/UI/ToggleSwitch/index.css
    - public/locales/en/gamelib.json
    - meta/i18nCatalogPresenceBaseline.json

key-decisions:
  - "Catalogue keys live in the gamelib namespace (gamelib:uninstall.removeBottle, gamelib:uninstall.removeBottleWarning), not gamepage:box.uninstall.* as the plan named: pnpm i18n-churn-guard fails any change to an upstream-owned catalogue such as gamepage.json"
  - "The disabled toggle uses --border-color for label and box rather than a new --toggle-disabled token: it is an existing token that clears 3:1 in all three themes and that themeTokens.test.ts already holds to 3:1 against --modal-background in every theme"
  - "The dialog compares against wineCrossoverBottle from getGameSettings (the same field the Rust op reads) and only asks for the name when the runner is not a Steam hand-off runner"

requirements-completed: [SVC-02]

duration: about 30 min
completed: 2026-11-25
---

# Phase 87 Plan 67: The uninstall dialog offers a non-Steam game's own bottle, and a disabled toggle is legible Summary

**The uninstall dialog now shows an enabled "Remove this game's bottle: <name>" toggle (with one amber risk warning while on) for bottle-backed non-Steam games on the default prefix, and the shared disabled ToggleSwitch uses a token that clears 3:1 in Midnight Mirage, Gruvbox Dark and Dracula.**

## Accomplishments

- **Bottle toggle (Task 1, tracer).** `checkIfIsNative` asks `window.api.getPerGameBottleName({ runner, appName })` for a non-Steam runner and keeps `bottleName` only when the stored `wineCrossoverBottle` equals the returned name (the two-fact rule of the 87-66 Rust op). With `bottleName` set the toggle is enabled even though the stored `winePrefix` is the default, is titled `Remove this game's bottle: <name>`, and the neutral default-prefix note is hidden. Turning it on renders one `uninstallModal__riskWarning` paragraph ("This can't be undone. Saves kept inside the bottle are deleted."). Confirming calls `window.api.uninstall(appName, runner, true, <settings flag>)`: the same four arguments as today, no path and no name (T-87-123). When the name is null, differs from the stored bottle, or the query rejects (logged once through `window.api.logError`), the prefix branch is exactly as before. Steam hand-off runners never ask.
- **Dialog styles.** `.default-wine-warning` is now the neutral accent-tinted note (`color-mix` over `--accent`, muted text); `.uninstallModal__riskWarning` is amber over `--status-warning`. Theme tokens only, no hex.
- **Legible disabled toggle (Task 2).** The disabled label and box were painted with `--icon-disabled`, which is `--neutral-03` in Midnight Mirage and is declared by no rule in Dracula. They now use `--border-color`. The hover rule that turned a label into `--background` is scoped with `:not([disabled])`.

**Shared-component note:** `ToggleSwitch` is shared, so every disabled toggle in the app gains the new colour and loses the hover recolouring, not only this dialog.

## Task Commits

| Task | Phase | Commit | Message |
|------|-------|--------|---------|
| 1 | RED | 05bf90d28 | test(87-67): uninstall dialog offers the game's own bottle (red) |
| 1 | GREEN | efb1f4229 | feat(87-67): uninstall dialog offers a non-Steam game's own bottle |
| 2 | RED | ced9d922b | test(87-67): disabled toggle contrast in midnightMirage, gruvbox_dark and dracula (red) |
| 2 | GREEN | 216df4c62 | fix(87-67): a disabled toggle stays legible and does not change on hover |

## RED evidence

- **Task 1 (bottleToggle.test.tsx):** 4 of 8 tests failed on the planned assertions at HEAD: the enabled/labelled toggle (`getPerGameBottleName` never called, 0 calls), the single risk warning (0 found), the confirm test (toggle was disabled, so the `toBeFalsy` guard failed) and the rejected-query test (`logError` 0 calls). The 4 that passed at HEAD are the fallback and Steam guard cases, which pin today's behaviour on purpose. The suite is Jest, not a TAP/JUnit report, so the `gsd_run check tdd-red-evidence` classifier could not be fed it; this plan is `type: execute`, not `type: tdd`, so that gate is not mandatory. Semantic assessment: each failing test failed on the named behaviour, not on an import, syntax or fixture fault.
- **Task 2 (disabledContrast.test.ts), measured at HEAD:**

| Theme | Disabled label / border colour | Ratio against `--modal-background` | Floor |
|-------|-------------------------------|------------------------------------|-------|
| midnightMirage | #272f31 (`--icon-disabled`) on #161c1e | **1.26:1** (red) | 3:1 |
| gruvbox_dark | #928374 on #282828 | 4.02:1 (already passed) | 3:1 |
| dracula | `--icon-disabled` does not resolve (declared in no rule) | **unresolvable** (red) | 3:1 |

The hover-offender test was red too (`.toggleSwitchWrapper:hover span` set `--background`).

## GREEN measurements (`--border-color` = gray)

| Theme | Surface | Ratio | Enabled label (`--text-default`) |
|-------|---------|-------|----------------------------------|
| midnightMirage | #161c1e | 4.36:1 | #caf3fd (differs) |
| gruvbox_dark | #282828 | 3.73:1 | #eae8e5 (differs) |
| dracula | #282a35 | 3.61:1 | white (differs) |

Candidates measured and rejected: `--text-secondary` passes 3:1 but is 13.23:1 in Midnight Mirage against 14.56:1 for enabled text, so a disabled label would read as enabled; `--text-quartenary` is 2.40:1 and undefined in two themes.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Catalogue keys moved to the gamelib namespace**
- **Found during:** Task 1 verify (`pnpm i18n-churn-guard`)
- **Issue:** The plan named `gamepage:box.uninstall.removeBottle` and `public/locales/en/gamepage.json`. `pnpm i18n` wrote the keys into `gamepage.json`, and the churn guard fails any change to an upstream-owned catalogue (D-04/D-05/D-06).
- **Fix:** Reverted `gamepage.json` and used `gamelib:uninstall.removeBottle` and `gamelib:uninstall.removeBottleWarning`, which land in `public/locales/en/gamelib.json`. `lint-translations` then required the new-key presence baseline to be regenerated (`LINT_TRANSLATIONS_WRITE_BASELINE=1 pnpm lint-translations:gamelib`), as earlier new-key commits did.
- **Files modified:** `src/frontend/components/UI/UninstallModal/index.tsx`, `public/locales/en/gamelib.json`, `meta/i18nCatalogPresenceBaseline.json`
- **Commit:** efb1f4229
- **Plan criteria affected:** task 1 acceptance `grep -c 'removeBottle' public/locales/en/gamepage.json >= 2` and the plan's `files_modified` entry for `gamepage.json` cannot hold as written; the same count is 2 in `gamelib.json` instead.

**Total deviations:** 1 auto-fixed (1 blocking). **Impact:** none on behaviour; two locations differ from the plan text.

## Acceptance criteria

- `grep -c getPerGameBottleName src/frontend/components/UI/UninstallModal/index.tsx` is 2 (PASS, >= 1)
- bottleToggle.test.tsx covers the five behaviours plus the own-prefix and Steam cases (PASS, 8 tests)
- `grep -c removeBottle public/locales/en/gamepage.json` is 0; `public/locales/en/gamelib.json` carries 2 (see deviation)
- `grep -c ':not(\[disabled\])' src/frontend/components/UI/ToggleSwitch/index.css` is 1 (PASS, >= 1)
- Contrast test passes for all three themes and was red at HEAD for two (midnightMirage 1.26:1, dracula unresolvable)

## Verification

- `pnpm exec jest` over bottleToggle, disabledContrast, themeTokens (351 tests), the InstallTab suites and the meta i18n suites: all pass.
- `pnpm codecheck`, `pnpm lint-translations` (0 hard failures) and `pnpm i18n-churn-guard` (clean): pass.
- `npx prettier --check` over the five code files: clean; none is prettier-ignored. `public/locales/en/gamelib.json` is prettier-ignored and is checked by lint-translations and the churn guard.
- Not run: a live look at the dialog in the three themes. That is re-run item 7 (87-69), by design.

## Notes for 87-69 and later

- **87-70 note on `in-use` and `unsafe-name`:** this dialog is not affected. It sends only the boolean and renders nothing from the removal result; a refusal of either kind reaches the user through the existing remove-bottle notice (`bad-reply` reason), which 87-70 already covers.
- ToggleSwitch's `.toggleSwitchWrapper:hover span` rule matches nothing today (the component renders its label text directly, with no `span`), so the hover fix is defensive and the visible gain in this dialog is the disabled colour.

## Known Stubs

None.

## Threat Flags

None. The renderer sends only the existing boolean, and the bottle name is display-only (T-87-123, T-87-124, T-87-125 mitigated as planned).

## Self-Check: PASSED

- Files exist: bottleToggle.test.tsx, disabledContrast.test.ts, UninstallModal/index.tsx, UninstallModal/index.scss, ToggleSwitch/index.css.
- Commits present on HEAD: 05bf90d28, efb1f4229, ced9d922b, 216df4c62 (`git rev-list --count 6bf07ca03..HEAD` is 4).
