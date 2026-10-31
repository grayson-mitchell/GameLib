---
phase: quick-261031-i0q
plan: 01
subsystem: steam-library
tags: [steam, pics, demos, refresh]
requirements: [QUICK-261031-i0q]
key-files:
  created:
    - src/backend/storeManagers/steam/licensedDemos.ts
    - src/backend/storeManagers/steam/__tests__/licensedDemos.test.ts
  modified:
    - src/backend/storeManagers/steam/library.ts
    - .planning/todos/pending/2026-10-30-store-exit-library-refresh-for-epic-gog-amazon.md
decisions:
  - "LICENSED_DEMOS_TIMEOUT_MS = 30000 as one overall budget for the licenses -> packages -> apps chain"
  - "Only PICS common.type Demo (case-insensitive) is added; all other types excluded by user decision"
metrics:
  completed: 2026-10-31
---

# Quick 261031-i0q: Licensed demos in Steam Refresh

Licensed Demo apps that `getUserOwnedApps` never returns (spike 052) are now unioned into
`syncOwnedLibrary` via `client.licenses` -> PICS packageinfo -> PICS appinfo, on the held client.

## Commits

- 2f8e2518f: licensedDemos module and 15 unit tests
- f31d35811: wiring in library.ts before Step 1.5, corrected todo note

## Results

- `licensedDemos.test.ts` 15/15 and `library.test.ts` pass (332 tests); `tsc --noEmit` clean; `pnpm planning-gates` 12/12.
- Fail-soft: null/empty licenses, PICS failure or the 30 s timeout all return [] with a warning (all-or-nothing, no partial set).
- No new lease or logon; the held client is reused.
- Step 3 hydration needed no change (img_icon_url optional, `rtime_last_played ?? 0`).

## Deviations from Plan

None. The todo file is prettier-ignored (`--file-info` reports ignored), so it was omitted from the prettier check as the plan directed.

## Live check (Task 3)

APPROVED by the operator 2026-10-31 13:08. After a dev restart and an explicit Steam Refresh, the game count rose by 12 and Schedule I: Free Sample is listed. Log: `Steam: fetched 389 owned games` (13:07:53), then `Steam licensed demos: licenses=485 licensedNotOwned=754 demos=12` (13:07:56), about 3 s, matching spike 052.

## Self-Check: PASSED
