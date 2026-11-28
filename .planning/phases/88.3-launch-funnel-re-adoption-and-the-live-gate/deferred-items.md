# Deferred items (88.3)

## 88.3-21 Task 1: `pnpm test:ci` red at P `e448f5a0a759ee349f934e4c36307fff406130d0` (2 suites, 6 tests), pre-existing, not 88.3's

Both suites are on the known-unrelated list 88.1 and 88.2 carried and neither touches a file 88.3 changed. Not fixed here (scope boundary).

- `src/backend/storeManagers/steam/bridge/drm/__tests__/valveClient.test.ts`, `ensureValveClient > rejects a symlink entry` (1 test).
  Todo: `.planning/todos/pending/2026-11-28-valve-client-symlink-test-gets-unzip-failure-not-regular-file.md`.
- `src/backend/testUtils/shortcutsIconGeometry/__tests__/iconGeometry.oracle.test.ts` (5 tests, the macOS `sips` geometry oracle: `golden is
  missing, record it with GAMELIB_WRITE_SHORTCUTS_GOLDEN=1`). Todo:
  `.planning/todos/pending/2026-11-24-record-macos-icon-geometry-goldens-on-a-mac.md`.
