---
phase: quick-261119-pdz
plan: 01
subsystem: tooling / test gates
tags: [find-deadcode, backend-di-ceilings, jestMock-ratchet, pre-push]
status: complete
requirements: [QUICK-261119-pdz]
key-files:
  modified:
    - src/common/nativePortCatalogue.ts
    - src/frontend/components/UI/RegionPicker/index.tsx
    - src/frontend/components/UI/NoticeStack/__tests__/NoticeStack.test.tsx
    - meta/backendDiCeilings/frontend-components-ui.json
    - src/backend/storeManagers/steam/__tests__/launchWithoutSteam.test.ts
    - src/frontend/screens/Game/GamePage/components/__tests__/NativePortInfo.test.tsx
    - src/frontend/screens/Settings/components/__tests__/LaunchWithoutSteam.test.tsx
actuals:
  tokens: 14000
  tasks: 3
  commits: 2
plan_head_before: 284d7186ed36808ef3f519a5623791cc64075243
plan_head_after: 6c4e83f22
---

# Quick 261119-pdz: clear pre-push find-deadcode and backend-di-ceilings

Both blocking pre-push gates are green with no baseline entry added, no ceiling raised and no `@public` tag. All nine pre-push checks exit 0 when run on their own.

## Commits

- `7ded57897` refactor: dropped the `export` keyword from `NativePortMac`, `NativePortDataStyle` and `RegionPickerOption` (all still used inside their own files). Took NoticeStack.test.tsx from 5 module mocks to 0 (jsdom plus the real notice components). Deleted its entry from `meta/backendDiCeilings/frontend-components-ui.json`.
- `6c4e83f22` test: rewrote the other three suites without module mocks.
  - Backend `launchWithoutSteam.test.ts` (1 to 0) uses the real logger through `initHeadless()` in `beforeAll`.
  - `NativePortInfo.test.tsx` (1 to 0) renders under jsdom through real i18next over the shipped en `gamelib.json`. The element-tree helpers became DOM queries and clicks.
  - Settings `LaunchWithoutSteam.test.tsx` (6 to 0) renders inside a real `SettingsContext.Provider`. The `describeLaunchWithoutSteamControl` block is unchanged (8 tests). The 7 component tests now assert on DOM.

## Coverage preserved

The suites have 2 + 4 + 15 + 13 = 34 tests, the same as at HEAD. All 34 pass. Every string and called-with argument asserted at HEAD is still asserted. The failed-verdict case is stronger: it first renders a resolved clean view for `570`, then rejects and rerenders for `440`. It asserts the toggle disappears, which tells a stored error view apart from a pending one. The DRM case opens the real popover and asserts the reason text.

## Pre-push sweep (each run on its own, after both commits)

| Check | Exit |
| --- | --- |
| pnpm codecheck | 0 |
| pnpm lint | 0 |
| pnpm prettier | 0 |
| pnpm i18n --fail-on-update | 0 |
| pnpm find-deadcode | 0 |
| pnpm boundaries | 0 |
| pnpm steam-line-ceiling | 0 |
| pnpm backend-di-ceilings | 0 |
| pnpm gameinfo-narrowing-ceiling | 0 |

## Deviations from Plan

**1. [Rule 1 - lint] import form for the i18next plugin call.** The plan's pattern (`i18next.use(initReactI18next)`) trips `import-x/no-named-as-default-member` (the existing NoticeStackTwoToast test carries the same warning). The new suites need `eslint --max-warnings 0`, so they use `import { use as registerI18nPlugin } from 'i18next'`. Renaming it avoids a `react-hooks/rules-of-hooks` warning on a bare `use`. The `act(async () => ...)` calls became `act(() => { ...; return Promise.resolve() })` to avoid `require-await` warnings. Behaviour is unchanged.

**2. `pnpm i18n --fail-on-update` rewrote `public/locales/en/gamelib.json`.** The file was clean before the sweep. The diff was a pure key reorder (verified by the sorted-key comparison against HEAD) and was restored with `git checkout -- public/locales/en/gamelib.json`. Nothing was committed there, and the file has no diff now.

**3. Commit ledger.** The `gsd-plan-head-before` ledger file was not written before the first commit. `plan_head_before` is the pre-task HEAD (`284d7186e`), and `commits: 2` was confirmed with `git rev-list --count 7ded57897~1..HEAD`.

## Notes

- `git diff --numstat d02b10267 -- meta/backendDiCeilings/` shows `0 1 meta/backendDiCeilings/frontend-components-ui.json`: one line deleted, none added. `meta/knip-baseline.txt` is untouched.
- Left alone: unrelated dirty `.planning` files and src/frontend/screens/Discounts/** (another session's work).
- No stubs and no new threat surface (test-only rewrites plus three removed type exports).
- Not pushed. `origin/main..HEAD` is 336 commits ahead.

## Self-Check: PASSED

Both commits are in HEAD's history (`7ded57897`, `6c4e83f22`). All seven `files_modified` paths exist and changed. The nine-check sweep is green.
