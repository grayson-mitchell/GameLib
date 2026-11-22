---
phase: quick-261123-bbi
plan: 01
subsystem: frontend-ui
tags: [refresh-button, click-feedback, hook, react]
requires: []
provides:
  - "useMinimumSpin hook: spin = max(1 s from click, end of refresh)"
affects:
  - src/frontend/screens/Humble/Keys/index.tsx
  - src/frontend/components/UI/Header/index.tsx
  - src/frontend/screens/WineManager/index.tsx
  - src/frontend/components/UI/ErrorComponent/index.tsx
  - src/frontend/screens/Game/GamePage/components/AppleWikiInfo.tsx
  - src/frontend/screens/Game/GamePage/components/WikiInfoEmptyState.tsx
tech-stack:
  added: []
  patterns: ["two-counter click window with useState + useEffect only (no useRef/useCallback)"]
key-files:
  created:
    - src/frontend/hooks/useMinimumSpin.ts
    - src/frontend/hooks/__tests__/useMinimumSpin.test.ts
    - src/frontend/hooks/__tests__/minimumSpinCallSites.test.ts
  modified:
    - src/frontend/screens/Humble/Keys/index.tsx
    - src/frontend/screens/Humble/Keys/__tests__/index.test.tsx
    - src/frontend/components/UI/Header/index.tsx
    - src/frontend/screens/WineManager/index.tsx
    - src/frontend/components/UI/ErrorComponent/index.tsx
    - src/frontend/screens/Game/GamePage/components/AppleWikiInfo.tsx
    - src/frontend/screens/Game/GamePage/components/WikiInfoEmptyState.tsx
decisions:
  - "Window starts on a click only; busy periods nobody clicked for get no tail (D-2)"
  - "disabled keeps following the real busy flag; the window blocks no click (D-3)"
  - "MUI Refresh icons spin with the same fa-spin class (D-4)"
  - "Humble humbleSync stays fire-and-forget (D-5)"
metrics:
  duration: ~25 min
  completed: 2026-11-23
status: complete
commits: 4
plan_head_before: 6e44d4e647861a5ca46bd877ac5d91e1427e005e
plan_head_after: 17cf992c2
actuals:
  tokens: 40000
  tasks: 3
  commits: 4
---

# Phase quick-261123-bbi Plan 01: Refresh buttons spin at least 1 s per click Summary

One shared `useMinimumSpin` hook now drives all six refresh buttons: each click spins the icon for max(1 s from the click, end of the refresh), and Humble Keys (the acceptance case) is proven by a component test with `humble.syncing` never true.

## Commits

| Task | Commit | Files |
| ---- | ------ | ----- |
| 1 (tracer) hook + Humble Keys | 6dc952fb3 | useMinimumSpin.ts, its test, Humble Keys index.tsx + test |
| 2 Header, Wine Manager, ErrorComponent + census | 8ba2c64c8 | the three components, minimumSpinCallSites.test.ts |
| 3 AppleWikiInfo, WikiInfoEmptyState + census | bec84fb6f | the two components, census |
| 3 close todo | 17cf992c2 | todo moved pending -> completed, with Resolution |

`commits: 4` counts this plan's commits only. `git rev-list --count 6e44d4e64..HEAD` reads 7 because another session committed on main between them.

## Wired sites (6)

Humble Keys; Library header (`refreshButtonSpinning` is the hook value, so the hidden duplicate spinner's gate also stays hidden in the click window); Wine Manager toolbar (list loading state still reads the real flag); Apple wiki rating refresh (hook above the early returns); wiki-info Retry; error screen Refresh Library.

## Out of scope (with reasons)

- SteamSyncNotice failed-mode "Try again": text-only button, no refresh glyph.
- EOS overlay "Check for updates": an update check, and its label already changes while it runs.
- Winetricks row "Retry": retries a component install, not a refresh.
- GameCard, EAC/BattlEye runtime, StoreSearch, SearchBar, EligibilityLoadingRow spinners: status spinners with no click.
- ConsoleMode, DownloadManager, LogSettings, WineVersionSelector `refreshing` flags: load states with no refresh button.

## Measured suite counts

Before (HEAD 6e44d4e64): 6 suites, 126 tests (Humble Keys 47, headerTourAnchors 25, uiState 9, tier2Portal 28, gamelibFixDisplay 9, gamePageTabs 8).
After: 8 suites, 172 tests, 0 failed (adds useMinimumSpin 9 tests, the census, 3 Humble `261123-bbi` tests).
`pnpm -s codecheck` exit 0; `pnpm -s find-deadcode` PASS (310 baselined); `pnpm -s planning-gates` 12/12; eslint shows only the 3 pre-existing warnings (Humble Keys exhaustive-deps, 2 Header no-floating-promises); prettier check clean on every written path.

## Deviations from Plan

**1. [Process] Hook written before the Humble RED run.** The hook file and its jsdom test were written together before the Humble Keys test was run red; the Humble Keys acceptance test was confirmed failing (button never spun with syncing false) before the component was wired. The census test's first run also failed 4 ways, on the Header, Wine Manager and ErrorComponent entries, before the wiring.

**2. [Rule 1 - Bug] Census harness fixes.** `it.each` over an empty table fails a jest suite, so the per-site forbidden/required checks use plain loops; the `fa-spin` key regex was widened to match bracketed keys (`['fa-spin']:`).

**3. [Process] Todo-move commit amended.** The first docs commit captured only the staged rename (content edits sit unstaged after `git mv`, and the old-path `git add` was rejected as the path no longer exists); amended it once to include the edited completed file. HEAD was still this plan's own commit.

Otherwise none; the plan executed as written.

## Known Stubs

None.

## Threat Flags

None. Renderer-local presentational state only.

## Self-Check: PASSED

- FOUND: useMinimumSpin.ts, useMinimumSpin.test.ts, minimumSpinCallSites.test.ts
- FOUND commits 6dc952fb3, 8ba2c64c8, bec84fb6f, 17cf992c2 (ancestors of HEAD)
- Todo present in completed/ with `resolution: quick 261123-bbi`; absent from pending/
- No pre-existing dirty file staged or committed
