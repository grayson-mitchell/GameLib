# Phase 86 deferred items

Out-of-scope discoveries logged by executors. Not fixed by the plan that found them.

## 86-22

- RESOLVED in 86-23 (fix(86-17): the test now reads the Rust `thumb_of` in `src-tauri/crates/gamelib-info/src/itad/mapping.rs`,
  where the asset order moved; both assertions pass). `src/frontend/screens/StoreSearch/__tests__/storeSearchThumbBox.test.ts` could not run: it `readFileSync`s
  `src/backend/storeSearch/itad.ts`, which 86-17 deleted (`43a95d91d`), so the suite fails with `ENOENT` at load.
  Found by a whole-repo `pnpm exec jest` (the Frontend project); 86-17 ran Backend and Meta only. The fix belongs
  with the 86-17 follow-up (the test reads the TS ITAD source to check a thumbnail-box constant; that constant
  now lives in Rust or in `src/common/itadCoverage.json`, so the assertion needs a new source or should be
  dropped).

## 86-23

- `pnpm lint` exits 1 on one production-scope error that this plan did not cause: `src/backend/sidecar/bootstrap.ts:2784`
  `'config' is assigned a value but never used` (the destructuring in `requireServices(state)`; the line dates from
  66.4-14). Not fixed here (out of scope, no file of this plan). Whoever next edits bootstrap.ts removes `config` there.
- OWED: `ClearCacheDeps.requestRustInvoke` is optional until `sidecar/handlers.ts` (foreign-dirty) passes it to
  `registerRunnerAuthFlows`; the GOG, Nile and Legendary sign-outs do not clear the Rust wiki cache until then. See
  86-23-SUMMARY.md.
