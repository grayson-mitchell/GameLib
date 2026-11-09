---
phase: quick-261110-9db
plan: 01
status: complete
commits: [9947c8360, 47e14e2c7, e4b0e5929]
---

# Quick 261110-9db: stale Steam queue head cancel no longer deletes a complete install

Three independent layers now each break the 73-18 Zomboid data-loss chain.

## Commits

- 9947c8360 Task 1, layer 2: `manifestFlags.ts` (`readAppManifestFlags`, `isCurrentFullInstall`), `steamResumeInstalledAtStart` breadcrumb captured in `runNativeDepotDownloadLeased`, cancel-delete refuses on it.
- 47e14e2c7 Task 2, layer 3: Rust `acf::read_existing_state_flags` + `preserve_installed_manifest`, used in `download.rs` keyed on `cancel.is_cancelled()`; TS `finalizeToSteam` skips on `outcome: 'cancelled'` over a bit-4 manifest.
- e4b0e5929 Task 3, layer 1: `queueHeadRevalidation.ts`, `initQueue` drops the head; composed regression test; todo moved to `completed/`.

## Verification

- jest: manifestFlags, resumeBreadcrumbs, cancelDelete, games (741), finalizeAcf.cancelPreserve, depot, rustInstall (98), queueHeadRevalidation, downloadqueue (27), staleQueueHeadCancel.regression (3) all pass. `npx tsc --noEmit` clean.
- cargo: `cargo test -p gamelib-depot --test acf --test job_install` 34 + 12 pass; `cargo fmt --check` and `cargo clippy --all-targets -D warnings` clean.
- prettier --check clean on every written TS path.
- `pnpm planning-gates`: 11/12. The failing gate (`planning-frontmatter-gate.py`) is on `73-VERIFICATION.md` ("bad indentation of a mapping entry (4:46)"), committed in 379890eac, not touched by this task. Out of scope; deferred.

## Layer-1 `params.path` finding

For Steam, `InstallArgs.path` is a library ROOT, not a steamapps dir. `installLocation.resolveOverride` matches it against `getSteamLibraries()`, and an empty or unregistered value silently falls back to the primary library. So `steamQueueHeadAlreadyInstalled` resolves the target in this order: breadcrumb `steamResumeTargetSteamappsDir`, else `join(path, 'steamapps')` only for a registered library root, else false. An empty path with no breadcrumb is not revalidated (conservative, exact-target-only). "Current" = bit 4 set, bit 2 clear, buildid present and not "0" (no offline source for live PICS buildid).

## Deviations

None of substance. Notes:
- Regression test mocks `findOtherManifestsWithInstalldir` / `withTimeout` with plain implementations set in `beforeEach` because jest `resetMocks` wipes factory `jest.fn` implementations.
- Regression test layer-1 assertion is a separate `it` (the helper clears the breadcrumb on true).
- Layer 2 captures bit 4 only (any installed state, update-required included), per the plan.

## Known Stubs

None.

## Self-Check: PASSED
