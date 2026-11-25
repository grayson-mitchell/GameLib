---
phase: quick-261125-r0j
plan: 01
subsystem: frontend/game-page
tags: [game-page, router-state, i18n, jsdom]
status: complete
requires: []
provides:
  - GamePageGate resolves the game page's GameInfo (router state, library store, getGameInfo)
affects:
  - src/frontend/screens/Game/GamePage
key-files:
  created:
    - src/frontend/screens/Game/GamePage/GamePageGate.tsx
    - src/frontend/screens/Game/GamePage/__tests__/gamePageGate.test.tsx
  modified:
    - src/frontend/screens/Game/GamePage/index.tsx
    - src/frontend/screens/Game/GamePage/index.css
    - public/locales/en/gamelib.json
    - meta/i18nCatalogPresenceBaseline.json
    - src/frontend/components/UI/NavShell/tabLocationMemory.ts
    - .planning/todos/completed/2026-11-25-game-page-throws-when-opened-without-router-state.md
decisions:
  - Gate lives in its own module so it renders under jsdom with a probe child
commits: 3
plan_head_before: c27956040704d7910f32d0c3a51784a4f427b447
plan_head_after: 831ee798f573e315c1ea88eb1a7f5e284d51f5bf
actuals:
  tasks: 3
  commits: 3
completed: 2026-11-25
---

# Quick 261125-r0j: Game page loads the game itself when opened without router state

A game page opened without router state now resolves its game (router state, then the runner's library store list, then
`getGameInfo`), shows the spinner meanwhile, and shows a "GameLib couldn't find this game." state with a Back to Library
link instead of throwing into the route error surface.

## Commits

- d73e62218 fix: GamePageGate, GamePage split, CSS, jsdom suite
- 8149fec20 fix: catalogue `gamepage.notFound` and presence baseline (48 locales)
- 831ee798f docs: tabLocationMemory comment, todo closed with Resolution

## Verification

- New jsdom suite: 15 tests (9 plus it.each expansion) passing; 7 neighbouring suites 564 tests passing.
- Mutations: removing the Fragment key turns Test 8 red; removing the cancelled check turns Test 7 red.
- Full Frontend jest: 392 suites / 6834 tests passed. tsc exit 0. eslint --quiet clean. prettier clean on every path
  it sees. i18n-churn-guard clean. lint-translations:gamelib exit 0. planning-gates 12/12.

## Deviations from Plan

**1. [Rule 3 - Blocking] Type imports in the new files.** `GameInfo` and `Runner` are not globals; added
`import type { GameInfo, Runner } from 'common/types'` to GamePageGate.tsx and the test. No behaviour change.

Otherwise the plan executed as written (the gate-in-its-own-module shape was the plan's own stated deviation).

## Known Stubs

None.

## Self-Check: PASSED

Commits d73e62218, 8149fec20, 831ee798f exist on quick/gamepage-stateless; GamePageGate.tsx and gamePageGate.test.tsx exist.
