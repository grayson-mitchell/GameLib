---
id: 260810-tr4
slug: remove-dead-use-steam-runtime-feature
description: Remove dead Use Steam Runtime feature
date: 2026-08-10
mode: quick
status: complete
commits:
  - d0525a687
  - 56b1edc46
---

# Quick Task 260810-tr4 — Summary

Removed the "Use Steam Runtime" launch-wrapper feature: the Steam Linux Runtime
(scout / soldier / sniper) container that could optionally wrap Epic, GOG, Amazon
and Zoom game launches on Linux. This ports the deletion half of Heroic upstream
commit `0a18fef2b` (branch `rm/use-steam-runtime`, authored May 2025, still
unmerged upstream).

**Net: −149 / +18 lines across 11 files, plus one file deleted.**

## Commits

| Commit | Scope |
|---|---|
| `d0525a687` | Frontend settings toggle |
| `56b1edc46` | Backend implementation + type surface + call sites |

Ordered deliberately: `SteamRuntime.tsx` called `useSetting('useSteamRuntime', …)`,
which is typed against `GameSettings`, so removing the backend field first would
have broken it. Each commit compiles on its own.

## What was removed

**Frontend** (`d0525a687`)
- `src/frontend/screens/Settings/components/SteamRuntime.tsx` — deleted
- barrel export in `components/index.ts`; import + `<SteamRuntime />` render in
  `sections/GamesSettings/index.tsx`

**Backend** (`56b1edc46`)
- `common/types.ts` — `GameSettings.useSteamRuntime`, the `SteamRuntime`
  interface, `LaunchPreperationResult.steamRuntime`
- `backend/utils.ts` — `getSteamRuntime()` and its export.
  `getSteamLibraries()` **kept** — the Steam store manager and
  `compatibility_layers.ts` are heavy consumers.
- `backend/launcher.ts` — the runtime-resolution block in `prepareLaunch`
  (incl. the `toolmanifest.vdf` sniper/soldier detection), the three
  `delete gameSettings.useSteamRuntime` log-sanitisation lines, the now-unused
  `@node-steam/vdf` import, and the `steamRuntime` parameter of `setupWrappers`
- `backend/game_config.ts` — both `useSteamRuntime` references
- five store-manager call sites: `storeManagerCommon`, `zoom`, `legendary`,
  `gog`, `nile`

`setupWrappers` still applies gamescope, `wrapperOptions`, mangohud and gamemode.

## Decisions

**D-01 — `public/locales/` deliberately untouched.** The task brief asked to
delete the `setting.steamruntime` / `help.steamruntime` keys. Rejected on three
measured grounds:
1. `meta/i18nCatalogChurnGuard.ts` classifies any changed path under
   `public/locales/` that is not a `gamelib.json`/`gamelib.mt.json` leaf as
   `upstream` and throws `UpstreamChurnError`; its `live tree` test asserts this
   against the real working tree under `pnpm test:ci`.
2. `meta/lintTranslations.ts` sets `printExtraTransations = false`, commenting
   that orphaned keys are "not really a problem".
3. Upstream's own `0a18fef2b` touched no catalog — Weblate reaps orphans.

Both keys are now inert across all 49 locale catalogs. Same call quick task
`260805-rwy` made for `login.message`.

**D-02 — `prepareLaunch`'s `isNative` parameter removed as well.** The runtime
block was its only reader; ESLint's `no-unused-vars` flagged it as the single
hard error after the deletion. Removed outright rather than `_`-prefixed — a
parameter no implementation reads is misleading in a signature. All five callers
updated. This is the one change beyond a strict deletion.

**D-03 — no settings migration.** `useSteamRuntime` is absent from
`GlobalConfig.getFactoryDefaults()`; it was only ever read out of persisted user
JSON. Once the field leaves `GameSettings`, a stored `"useSteamRuntime": true`
is an ignored extra key — nothing reads it, nothing throws. Upstream shipped no
migration either.

**D-04 — upstream's umu replacement NOT ported.** `0a18fef2b` also routes
Linux-native games through umu (`UMU_NO_PROTON=1`,
`RUNTIMEPATH=scout-on-soldier`) and widens the `DisableUMU` toggle to
linux-native. Explicitly out of scope — this task is a deletion. The
`setupWrappers` refactor from `9a41a7d79` / `70d46cf37` was likewise not ported.

## Verification

| Check | Result |
|---|---|
| `pnpm codecheck` (`tsc --noEmit`) | clean |
| `eslint` on all 11 touched files | 0 errors (168 warnings, unchanged from pre-change baseline) |
| `pnpm test:ci` | **233 suites / 4577 tests, 0 failures** |
| `grep -rn "useSteamRuntime\|SteamRuntime\|steamRuntime" src/` | no matches |

Re-verified after an interleaved concurrent commit (see below).

## Notes

- **GameLib's Steam store manager is unaffected by construction.**
  `src/backend/storeManagers/steam/` never calls `prepareLaunch` — `SteamGame.launch()`
  routes to the bridge bottle, the bottled Steam client, or
  `steam://rungameid/…`. Not one file under `storeManagers/steam/` was touched.
  The upstream branch's name is misleading: it concerns the Steam *Linux Runtime*,
  not Steam-as-a-store.
- **A concurrent session was committing to `fix/steam-native-install-stability`
  during this task.** Commit `a8f9c7bb8` (`test(34.9-06)`) landed between this
  task's two commits. No file overlap; the tree was re-typechecked afterwards and
  is clean. A `.planning/phases/34.9-…/34.9-06-SUMMARY.md` belonging to that
  session was left staged and deliberately not committed here.
- Linux-only user-visible change: the Settings → Games → Other toggle is gone.
  No macOS or Windows surface is affected.
