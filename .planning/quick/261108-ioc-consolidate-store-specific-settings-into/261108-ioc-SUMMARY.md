---
phase: quick-261108-ioc
plan: 01
status: complete
completed: 2026-11-08
commits: [9356533f9, 35525e0ee]
---

# Quick 261108-ioc: Settings Stores page with per-store tabs

Settings now has a "Stores" row (faShop) opening `/settings/stores`, with URL-driven MUI tabs Amazon, Epic, GOG, Humble, Steam (`/settings/stores/:store`; unknown or absent store falls back to Amazon, and tab changes navigate with `replace`).

## What moved
- Amazon: AltNileBin (in a collapsed Advanced details)
- Epic: EgsSettings, EosOverlay, AltLegendaryBin (Advanced)
- GOG: PlaytimeSync, DisableGOGPresence, AltGOGdlBin (Advanced)
- Humble: NotifyHumbleExpirations
- Steam: DefaultSteamPath, EnableSteamNativeInstall, EnableSteamNativeDelete, SteamExperimentalInstallApp
- EOS Overlay block extracted verbatim from AdvancedSettings into `StoreSettings/EosOverlay.tsx`; its three guard tests moved with `git mv` and were repointed (11 callOrDeclare sites still enforced).
- SteamGridDbApiKey, SyncSaves, AllowInstallationBrokenAnticheat, ShareDetectedFixes etc. stayed put.

## Notes requested by the plan
- PlaytimeSync was verified GOG-only (per the plan's findings) and moved to the GOG tab.
- Both `navigate('/settings/advanced')` deep links (SideloadDialog, EditGameDialog) were left untouched; they target SteamGridDbApiKey, which stayed in Advanced.
- "Humble" WAS added to `meta/i18nGlossary.json` (the hardcoded-string gate flagged the bare tab label).

## Commits
- 9356533f9 Tasks 1 and 2 together (EOS extraction, StoreSettings page, route, section wiring)
- 35525e0ee Task 3 (nav row, nav tests, `gamelib:settings.navbar.stores` key, presence baseline, gate-scope artifacts, glossary)

## Verification results
- `npx jest src/frontend/screens/Settings src/frontend/screens/Game/GameSubMenu src/frontend/helpers/__tests__/DeferredChannelCallSiteGuard.test.ts`: 40 suites, 444 tests passed (includes the new StoreSettings test).
- NavShell suites, `hardcodedStringGate`, `i18nGlossary`: pass after the fixes below.
- `pnpm codecheck`: clean.
- `pnpm lint-translations:gamelib`: 0 hard failures (7008 pre-existing/baselined findings; baseline gained only `settings.navbar.stores` per locale).
- `npx prettier --check` over all touched non-ignored paths: clean. `public/locales/en/gamelib.json` is prettier-ignored, so omitted.
- `graphify update .`: ran (no tracked output changes).
- `meta/__tests__/genI18nGateScope.test.ts`: 25 passed, 1 FAILED, 1 skipped, both before and after the commit. The failure is A-17 ANTI-ROT: the live derivation lists 30 fork-touched files that the committed `i18nForkTouchedFiles.json` lacks (e.g. `UI/Anticheat/index.tsx`, `NoticeStack`, `SyncSaves/index.tsx`, `SteamRequestNotice.ts`). None are files this task touched, and my two new StoreSettings paths appear correctly in the committed artifact. This is pre-existing drift, not caused by this task; not fixed (out of scope). The hardcoded A0-A4 count assertions (271/323) were updated to 272/325.

## Deviations
- [Rule 1] hardcodedStringGate flagged the `aria-label="store settings tabs"` and `label="Humble"` literals in StoreSettings. Fixed by reusing the new `gamelib:settings.navbar.stores` key for the aria-label and adding "Humble" to the glossary.
- [Rule 1] `genI18nGateScope.test.ts` hardcodes scope/fork-touched counts (A0-A4); updated alongside the dated note.
- Tasks 1 and 2 were committed together, as instructed.

## Not done
- Optional live check (`pnpm tauri:dev`, click through tabs) was not performed.

## Self-Check: PASSED
Both commits exist; EosOverlay.tsx, StoreSettings/index.tsx/index.scss/test present; AdvancedSettings has no `eosOverlay` references and no `__tests__` directory.
