---
status: complete
quick_id: 261109-vw2
---

# Quick 261109-vw2: Version mac-steam-offline-owed.json

Put the owed-goonline marker on the Phase 68 store engine at v1 (identity adopt of the legacy `{since, by, pid}` shape), wired into `macSteamOffline.ts`.

## Commits
- 66da27b35: codec/adopter, chain registration, codec tests
- Task 2 commit: wiring, wrap-level legacy/newer tests, inventory row, todo moved to completed

## Deviations
- [Rule 3] The wrap test mocks `fs`; the engine's `graceful-fs` patched the jest.fn passthroughs. Added `jest.mock('graceful-fs', () => jest.requireActual('fs'))` to that test.
- RED step not committed separately; tests and implementation were written together.

## Verification
jest (wrap, storeVersioning, bootstrap, auth policy): 102 passed; codecheck, prettier, planning-gates all green.

## Orchestrator follow-up

- The executor's verify set missed `macSteamOnlineDebt.test.ts`, which pinned the marker keys to
  `since/by/pid`. Updated to expect `version` (= 1) in `de634d3fb`.
- `macArchKnownFixRouting.test.ts` (Intel: never seeds…) fails on this branch and also at the
  pre-task commit `14528f0a5` — pre-existing, unrelated to this task.
