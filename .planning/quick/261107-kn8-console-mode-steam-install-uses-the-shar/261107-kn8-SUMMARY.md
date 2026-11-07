---
phase: quick-261107-kn8
plan: 01
subsystem: console-mode
tags: [console-mode, steam, install-overlay, i18n]
key-files:
  modified:
    - src/frontend/screens/ConsoleMode/InstallOverlay/consoleSteamTarget.ts
    - src/frontend/screens/ConsoleMode/InstallOverlay/index.tsx
    - src/frontend/screens/ConsoleMode/InstallOverlay/__tests__/consoleSteamTarget.test.ts
    - public/locales/en/gamelib.json
    - meta/i18nCatalogPresenceBaseline.json
metrics:
  completed: 2026-11-07
---

# Quick 261107-kn8: Console Mode Steam install uses the shared overlay

The Steam install overlay now shows "Install game", the title, an "Install to" row and Cancel / Install chips like every other store. It installs only when Install is pressed. The mount-time auto-install and the 1.5s auto-dismiss are gone.

## Commits
- e53433b25: probe verdict carries `targetPath`; `resolveConsoleActionIntent` maps Steam install/cancel like other stores
- da9ec3eac: overlay layout and flow, catalog key `consoleMode.steamInstallTargetDefault`, new source gates, presence baseline

## What changed
- ok verdict is `{ ok: true, targetPath? }` and carries the primary library root only when a target resolved.
- Overlay has `steamReady` and `steamTargetPath` state. The probe effect only enables Install. `installGame` returns early until `steamReady`, then calls `installSteamGame(game.app_name, game)` with the `logSteamInstallDispatchFailure` catch and dismisses. The Install chip is disabled while the probe is pending.
- Platform and Wine rows are hidden for Steam. Rows for a blocked Steam card are `['cancel']`, or `['cancel','setupSteam']` with a hand-off. The focus fallback is now the last visible row.
- "Install to" shows the resolved library root, or "Your Steam library" when none is registered.
- Tests: A2/A4/A7/A13 updated, A14 added, B1/B2 rewritten, D3 reworded, D5 replaced (`assertNoAutoInstallOnMount` plus two REDs), D12 and D12-RED added, I2 added.
- `console.steam.installing` is no longer used in code; the key stays in the upstream `translation.json`.

## Deviations
**[Rule 3 - Blocking] Regenerated the i18n presence baseline.** `lint-translations:gamelib` reported 48 hard failures, one per non-en locale, for the new en-only key. I ran `LINT_TRANSLATIONS_WRITE_BASELINE=1 pnpm lint-translations:gamelib`. The diff adds only the new key; the lint then reports 0 hard failures. The file is `meta/i18nCatalogPresenceBaseline.json`, committed with Task 2.

## Verification
- InstallOverlay jest suite: 5118 passed (the path filter ran the whole Frontend project).
- `pnpm codecheck`, eslint on the three TS files, `pnpm i18n-churn-guard`, and `npx prettier --check` (`--file-info` showed not ignored) all pass. The grep for `console.steam.installing` in non-comment code returned 0.
- `pnpm lint-translations:gamelib` reported 0 hard failures after the baseline regeneration.
- Meta jest ran the full Meta project. `lintTranslations.test.ts` passes after the baseline fix; the hardcoded-string gate passes.

## Pre-existing failures, not fixed (out of scope)
- `meta/__tests__/genI18nGateScope.test.ts` A-17: the committed `i18nForkTouchedFiles.json` lacks the NoticeStack files, unrelated to this change.
- `meta/__tests__/x86CallbackWineHarness.test.ts`: crash code 0xc0000005 under the Wine harness.

## Not done
The optional live check (`pnpm tauri:dev`, press A on an uninstalled Steam game) was not run.

## Known Stubs
None.

## Self-Check: PASSED
Commits e53433b25 and da9ec3eac exist; all modified files present.
