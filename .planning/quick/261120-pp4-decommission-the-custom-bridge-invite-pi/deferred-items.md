# Deferred items (quick 261120-pp4)

Pre-existing failures found while running this plan's gates. None is caused by this plan's changes
(files untouched by it; each traces to a commit made earlier on 2026-11-20). Not fixed, per the
scope boundary.

1. **clippy ratchet: `deprecated` has no ceiling.** `std::sync::atomic::Atomic::<usize>::fetch_update`
   is deprecated (renamed `try_update`) at `src-tauri/crates/gamelib-steampoll/tests/adoption.rs:1528`,
   added by `01ea1d788` / `11e3c4308`. `node meta/clippyRatchet.cjs` therefore exits 1 on the darwin
   leg regardless of this plan. Every other lint matches its ceiling after this plan's
   `match_like_matches_macro` 1 -> 0 lowering.
2. **`pnpm backend-di-ceilings` fails** on `steam/__tests__/validateNative.test.ts`,
   `steam/__tests__/verifyBridge.test.ts`, `steam/depotRust/__tests__/rustVerify.test.ts` (new
   jestMock violations with no baseline entry) and `steam/__tests__/games.test.ts` (shrank 46 -> 45).
   All from the Steam Verify quick (261120-p2j).
3. **`tauriShellSource.test.ts` census NARROWNESS (2 tests)** fail because `ec530001e` ("rustfmt
   src-tauri") collapsed the census guard in `humble_cookies.rs` to one line, so the test's
   multi-line `CENSUS_GUARD` replace no-ops.
4. **`steamAuthSessionPolicy.test.ts` Rule E**: `depotRust/verify.ts` calls `acquireAuthenticated(`
   outside the allow-list (Steam Verify quick).
5. **store kind declarations (D-01)**: `steam_direct_launch_verdict` is declared but missing from
   `EXPECTED_KINDS`.
6. **`meta/__tests__/x86CallbackWineHarness.test.ts`**: the test allows only slots 2/6/10 from the
   shim, but the shim also sends slot 15 (`reportCbRegister`, quick 261106-qvp).
7. **`pnpm planning-gates`**: `state-sdk-field-anchor-gate.py` fails (documented in the plan as
   existing).
8. **`themeTokens.test.ts` is-link render-site census**: the live count is 39, the pin says 34. The
   deleted invite dialog had no `is-text` site, so this is drift from other work (ThemeEditor etc.).
9. **`acfUpdateReplay.test.ts`**: no oracle case `acfUpdate/readLocalConfigBetaKey/playtime/10`.
10. **`createStores` fixture cache stores** test, same root cause as the D-01 store-kind failure
    (item 5: `steam_direct_launch_verdict`).

Full `pnpm test:ci` result after this plan: 8 failed tests in 7 suites, 22931 passed. All 8 are in
items 3-6 and 8-10 above; none touches a file this plan changed.
