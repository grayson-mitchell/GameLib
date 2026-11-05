---
phase: quick-261105-gx2
plan: 01
subsystem: lint gate
tags: [lint, pre-push, eslint, hygiene]
requires: []
provides:
  - "pnpm lint exits 0 (src 1123/1130, tests 655/661)"
affects: [.husky/pre-push]
tech-stack:
  added: []
  patterns:
    - "String(err) for unknown catch values in template literals"
    - "() => Promise.resolve(x) for non-throwing async test mocks"
key-files:
  created: []
  modified:
    - src/backend/storeManagers/steam/games.ts
    - src/backend/storeManagers/steam/engine/fallbackEngine.ts
    - src/backend/knownFixesFetcher.ts
    - src/backend/shortcuts/utils.ts
    - src/backend/storeManagers/steam/bridge/overlay/__tests__/overlayLaunch.test.ts
decisions:
  - "Ceilings stay at 1130/661. The overrun was fixed at source, with headroom of 7 (src) and 6 (tests)"
  - "find-deadcode's 6 new used-in-module findings are pre-existing and outside lint, so they are reported, not fixed"
metrics:
  completed: 2026-11-05
  tasks: 3
  files: 5
---

# Quick 261105-gx2: Bring pnpm lint back under both warning ceilings - Summary

`pnpm lint` exits 0 again. The src lane went from 1134 to 1123 against SRC_CEILING 1130. The tests lane went from 666 to 655 against TESTS_CEILING 661. Both lanes have 0 errors. All fixes are behaviour-preserving: duplicate-import merges, `String()` around `unknown` catch values in template literals, and `Promise.resolve` for non-throwing async test mocks. The ceilings, `eslint.config.mjs` and the eslint-disable count (298) are unchanged. Nothing was pushed.

**The pre-push chain is still red, but not on lint:** `pnpm find-deadcode` fails on 6 pre-existing findings (see Gate results).

## Before / after

| Lane  | Plan measurement (1962f8ee0) | Fresh at bb9f667b1 | After | Cap  | Target |
| ----- | ---------------------------- | ------------------ | ----- | ---- | ------ |
| src   | 1135                         | 1134               | 1123  | 1130 | ≤ 1125 |
| tests | 665                          | 666                | 655   | 661  | ≤ 656  |

src read 1134 rather than 1135 because 261105-lnt (96c1582aa) removed one unused disable. Tests read 666 rather than 665; the source of that +1 was not traced.

## Commits

- `4970fbbf1` fix(quick-261105-gx2): clear src-lane lint warnings at source
- `381d53482` test(quick-261105-gx2): clear tests-lane lint warnings at source

## Attribution since 3b09e3e26 (end of 261101-h8l: src 1121, tests 610)

Method: for each file that has warnings at HEAD and appears in `git diff --name-only 3b09e3e26 HEAD`, the 3b09e3e26 content was linted with `lintText` and the counts diffed. Files that are new since then count in full.

Coverage:
- **src:** the net from changed files is +9 of the +13 drift. The remaining +4 sits in files outside the diff, most likely type-aware rules reacting to changed types elsewhere. It was not traced.
- **tests:** the net from changed files is +61 against +56 total drift. The -5 difference comes from files that went clean or were deleted.

### src lane

| File                                                         | old→new | Rules                                     | Introducing commit(s)                                                                                       |
| ------------------------------------------------------------ | ------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| src/backend/storeManagers/steam/games.ts                     | 69→78   | +9 import-x/no-named-as-default-member    | `i18next.t` sites from 2f64c102d (59-20), 9d6f878b1 (59-26), 32a061a6c (59-38), 86118d41b (59-46), d195c4ea1 (60-08), 05b22464c (60-09), e56c7d81d (261105-ast) |
| src/frontend/components/UI/SteamEngineLaunchNotice/index.tsx | new→5   | +5 react-hooks/exhaustive-deps            | 3931a231d (59-19), then 30ccb0b5f (261104-vvz)                                                              |
| relay/src/githubFiles.ts                                     | new→2   | +2 no-base-to-string                      | d6ea95bae (57-07), e836d9315 (57 WR-08)                                                                     |
| src/backend/storeManagers/steam/engine/fallbackEngine.ts     | 1→3     | +2 restrict-template-expressions          | 2061b819e (59-16), 7ee7a771e (59-33)                                                                        |
| game_config.ts, nile/library.ts, GlobalState.tsx, WebView/index.tsx | −9 total | floating-promises, unsafe-* and require-await removed | various                                                                                  |

### tests lane (top contributors)

| File                                                   | old→new | Rules                           | Introducing commit(s)                  |
| ------------------------------------------------------ | ------- | ------------------------------- | -------------------------------------- |
| steam/bridge/overlay/__tests__/overlayLaunch.test.ts   | new→13  | 11 require-await, 2 no-duplicates | b98856f48 (60-07) and 5 later Phase 60 commits |
| steam/__tests__/bottle.test.ts                         | 14→23   | +9 require-await                | Phase 59/60 bottle commits (b6cc22ab8 60-07, 1e300375d 59-32, …) |
| steam/engine/__tests__/engineSwitch.test.ts            | 1→8     | +7 require-await                | 5a6f4f877 (59) and 59-51 follow-ups    |
| steam/engine/__tests__/engineState.test.ts             | 2→7     | +5 require-await                | 8ee7e6a9b (59-15) and follow-ups       |
| Game/GamePage/components/__tests__/SettingsButton.test.tsx | new→4 | unsafe-call/member-access      | 80b592b81 (261102-fvg)                 |
| relay/src/__tests__/helpers/d1Sqlite.ts                | new→3   | require-await                   | 5e59b20d3 (57-03)                      |
| launchSingleFlight / launcher_launchSingleFlight tests | new→4   | floating-promises, require-await | 9f13a302b, 9856a1f8e (261103-x6m)     |
| nile/__tests__/refreshAwaitsSync.test.ts               | new→2   | unbound-method                  | a8a707c51 (261102-s32)                 |
| 13 other files                                         | +14     | mixed                           | Phases 59/60, 261102-*, 261103-*        |

**In short,** the overrun is Phase 59 (fallback engine), Phase 60 (Steam overlay) and Phase 57 (relay) landing new code and tests, plus small additions from the 2611xx quicks. No single commit caused it.

## Fixes

| File                                        | Rule                                  | Count | Change                                                                 |
| ------------------------------------------- | ------------------------------------- | ----- | ---------------------------------------------------------------------- |
| steam/games.ts                              | import-x/no-duplicates                | 2     | merged the two `import type … from './engine/engineTypes'` lines       |
| steam/engine/fallbackEngine.ts              | restrict-template-expressions         | 3     | `${err}` → `${String(err)}` in three logWarning calls                  |
| knownFixesFetcher.ts                        | restrict-template-expressions         | 3     | `${error}` → `${String(error)}`                                        |
| shortcuts/utils.ts                          | restrict-template-expressions         | 3     | `` `${error}` `` → `String(error)`; the two messages wrap with `String(error)` |
| overlayLaunch.test.ts                       | import-x/no-duplicates                | 2     | merged the two `fs` imports                                            |
| overlayLaunch.test.ts                       | require-await                         | 9     | `async () => x` → `() => Promise.resolve(x)` on non-throwing mocks. The two throwing mocks (detect at 230, checkInputs at 303) were left `async` |

For any non-Symbol value, `String(x)` is the same ToString conversion a template literal performs.

## Gate results

- `pnpm lint`: exit 0, `production: PASS | tests: PASS`.
- `npx tsc --noEmit`: exit 0. The tsconfig includes `src`, so test files are typechecked.
- **Jest before and after each edit.** Each "before" run used `git show HEAD:<path>` content.
  - src: suites for knownFixesFetcher, `shortcuts/__tests__` (6), fallbackEngine and steam games ran 9 suites, 797 → 797 passing.
  - tests: overlayLaunch.test.ts ran 63 → 63 passing.
- **Prettier:** `npx prettier --file-info` reports `{ "ignored": false, "inferredParser": "typescript" }` for all 5 touched paths. A scoped `npx prettier --check` over the 5 paths is clean.
- **Config untouched:** `git diff 3376fd5af -- meta/lintScoped.cjs eslint.config.mjs` is empty, and so is the same diff against bb9f667b1.
- **No disables added:** added lines contain 0 `eslint-disable`. `git grep -c eslint-disable` over src, relay and meta reads 298 at bb9f667b1 and 298 at HEAD.

### Pre-push chain (`.husky/pre-push:2`), each step run separately

| Step                         | Exit | Status                                                                                                     |
| ---------------------------- | ---- | ---------------------------------------------------------------------------------------------------------- |
| `pnpm codecheck`             | 0    | PASS                                                                                                       |
| `pnpm lint`                  | 0    | PASS (src 1123, tests 655)                                                                                 |
| `pnpm prettier`              | 0    | PASS                                                                                                       |
| `pnpm i18n --fail-on-update` | 0    | PASS, but it re-sorts `steamExperimentalInstallApp` (from 261105-ord) in two places in `public/locales/en/translation.json`. This is a key-order-only change. The file was restored and is not committed (see below) |
| `pnpm find-deadcode`         | 1    | **FAIL**, because of the 6 pre-existing findings below                                                     |

find-deadcode error:

```
used-in-module: 6 NEW finding(s) not in meta/deadcode-baseline-used-in-module.txt:
  + src/backend/storeManagers/steam/steamInstallApp.ts - SteamInstallAppDeps
  + src/backend/storeManagers/steam/steamInstallApp.ts - SteamInstallAppOutcome
  + src/backend/storeManagers/steam/steamInstallApp.ts - SteamInstallAppRunResult
  + src/frontend/screens/WebView/storeExitRefresh.ts - StoreExitRefreshAllDeps
  + src/frontend/screens/WebView/storeExitRefresh.ts - StoreExitRefreshOutcome
  + src/frontend/screens/WebView/storeExitRefresh.ts - StoreExitTarget
unreachable: 45 OK | used-in-module: 6 FAIL
```

These come from 17ab5af22 (261105-ord) and c2666b23a (261105-pnh). This plan touched neither file. Under the plan's "do not fix failures outside lint" rule they are left for a follow-up. The likely fix is (b): drop `export` on types used only inside their own module.

## Deviations from Plan

None. The plan's re-measurement clause covered the fresh baselines (1134/666 instead of 1135/665), and the targets (≤ 1125, ≤ 656) were met.

The i18n step re-sorted keys in `public/locales/en/translation.json` as a side effect. The file was restored from HEAD with `git show HEAD:… >` and was not staged, because the plan scopes non-lint fixes out. That re-sort will reappear on every pre-push run until it is committed.

## Self-Check: PASSED

- FOUND: all 5 modified paths exist, and the changes are in 4970fbbf1 and 381d53482
- FOUND: 4970fbbf1, 381d53482 in `git log`
