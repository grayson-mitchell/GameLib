# Phase 86 deferred items

Out-of-scope discoveries logged by executors. Not fixed by the plan that found them.

## 86-22

- `src/frontend/screens/StoreSearch/__tests__/storeSearchThumbBox.test.ts` cannot run: it `readFileSync`s
  `src/backend/storeSearch/itad.ts`, which 86-17 deleted (`43a95d91d`), so the suite fails with `ENOENT` at load.
  Found by a whole-repo `pnpm exec jest` (the Frontend project); 86-17 ran Backend and Meta only. The fix belongs
  with the 86-17 follow-up (the test reads the TS ITAD source to check a thumbnail-box constant; that constant
  now lives in Rust or in `src/common/itadCoverage.json`, so the assertion needs a new source or should be
  dropped).
