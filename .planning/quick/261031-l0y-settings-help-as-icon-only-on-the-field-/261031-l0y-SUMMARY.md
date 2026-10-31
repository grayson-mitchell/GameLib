---
phase: quick-261031-l0y
plan: 01
status: complete
commits: [4abdedab7, d427e56eb, 752fa5d23]
---

# Quick 261031-l0y: Settings help as icon-only on the field label

Appearance order is now theme, zoom, fonts, Manage Accounts background, toggles. Settings help moved from a "Help" text link under the input to an icon-only (i) button on the label line, via an `InfoBox iconOnly` variant, a new `FieldLabel` component and `labelHelp` props on TextInputField, TextInputWithIconField, PathSelectionBox, SelectField and TwoColTableInput.

## Converted sites (11)
LoginBackground, DefaultSteamPath, LauncherArgs, PreferedLanguage, EgsSettings, WrappersTable, EnvVariablesTable, WineVersionSelector (search-paths help only), WinePrefix, SteamGridDbApiKey, and NvidiaPrime (sibling icon in `.toggleWithInfo`, flex layout in GamesSettings/index.scss).

## Intentionally untouched
- ClearCache.tsx, ResetHeroic.tsx ("Details"): action blocks (h3, help, button), outside this task's scope.
- SyncSaves/legendary.tsx, SyncSaves/gog.tsx: section-level help, not attached to one labelled field.
- WineVersionSelector "Valve Proton versions ignored" (a state notice whose text is the message) and "Wine Path" (shows data, not help).
- SideloadDialog (call-to-action trigger, no field label) and GOG ModifyInstallModal (non-settings modal).
- `hasHelp(...)` calls left alone everywhere.

## Deviations
- [Rule 3] The existing PathSelectionBox test needed `jest.mock('../../FieldLabel/index.css')` because FieldLabel is now imported transitively through TextInputField. Added.
- EgsSettings: fragment removed since it wrapped a single child after the sibling InfoBox moved to labelHelp.
- jest path filters were ignored by `--selectProjects Frontend <path>` in this setup, so the whole Frontend project ran each time.

## Verification
- tsc --noEmit: pass. eslint on touched files: 0 errors (pre-existing warnings only). prettier --check: pass.
- Frontend jest: 4696 pass, 1 fail. The failure is `steamInstallOptionsEntry.test.ts` C3, a GameCard source-gate check on files this task did not touch (pre-existing; not verified against a clean tree).
- New FieldLabel tests (4 behaviours): pass.
- Live check (tauri dev, themes): not performed.
