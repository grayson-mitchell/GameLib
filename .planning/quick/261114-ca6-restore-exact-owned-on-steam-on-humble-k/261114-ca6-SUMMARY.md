---
phase: quick-261114-ca6
plan: 01
subsystem: humble
tags: [humble, steam, ownership, store-search]
key-files:
  created:
    - src/backend/humble/steamAppIdResolver.ts
    - src/backend/humble/__tests__/steamAppIdResolver.test.ts
  modified:
    - src/backend/humble/stores.ts
    - src/backend/humble/dedup.ts
    - src/backend/humble/library.ts
    - src/backend/humble/index.ts
    - src/backend/testUtils/testHumble.ts
    - src/common/types/humble.ts
    - src/backend/humble/__tests__/dedup.test.ts
    - src/backend/humble/__tests__/library.test.ts
    - src/backend/humble/__tests__/library.realstore.test.ts
    - src/backend/__tests__/storeKinds.test.ts
    - src/backend/stores/__tests__/fixtures/registeredStores.json
    - PRIVACY.md
completed: 2026-11-14
---

# Quick 261114-ca6: Restore exact "Owned on Steam" on Humble keys

Humble Steam keys get their app id resolved from the title via Steam's public store search (strict unique normalized match, persistent cache), feeding the existing exact tier in dedup.ts.

## Commits

- a1af3a755 test: failing resolver tests
- 8e0be6d64 feat: resolver + humble_steam_appid cache store (kind cache), store-parity registrations
- eb3266ff4 test: failing dedup tests
- 46a715c10 feat: dedup resolved-id exact tier with fuzzy fallback (`steamAppIdResolved`)
- 36089008a test: library wiring tests (+ realstore test dep)
- f930f0547 feat: library wiring (commit-time cache fill, post-sync single-flight pass), index/testHumble, PRIVACY row

## Summary log line

`Humble: resolved ${N}/${M} Steam app ids (${H} cached, ${X} misses, ${E} errors, ${D} deferred)` (grep token `Humble: resolved`).
Example from the test: `Humble: resolved 2/4 Steam app ids (1 cached, 2 misses, 0 errors, 0 deferred)`.

## Deviations

- [Rule 3] `library.realstore.test.ts` also constructs `createHumbleLibrary` and needed the new required `steamAppIdResolver` dep (inert stub); not in the plan's file list.
- [Rule 1] `normalizeForAppIdMatch` strips `™ ® ©` before NFKD, because NFKD turns `™` into the letters "TM".
- Resolver cache dependency typed as a small structural interface (`get`/`set`) rather than `Pick<CacheStore,...>` so a Map-backed fake type-checks.
- `npx prettier --write PRIVACY.md` (no pre-existing changes) re-aligned the table columns, so the PRIVACY.md diff is 8+/7- lines rather than one row.
- The "Summary" test fixture uses cached hit + fresh hit + 2 fresh misses to produce the plan's exact `2/4 ... 1 cached, 2 misses` text.
- No existing test asserted a logInfo call count that changed.

## Gates

- jest: `src/backend/humble src/backend/stores src/backend/__tests__/storeKinds.test.ts src/frontend/screens/Humble` 28 suites / 979 tests pass; resolver + storeKinds + createStores pass in Task 1; dedup + frontend Humble 251 pass in Task 2.
- tsc: no new errors outside bridge/drm (baseline empty).
- eslint: 0 errors (only `require-await` warnings in test files).
- prettier: `--file-info` not ignored for new files; `--check` clean on every touched path.
- `pnpm build:sidecar`: OK each task. `graphify update .`: OK each task.
- Resolver source has no key/cookie/csrf field references outside comments.

## Known Stubs

None.

## Self-Check: PASSED
