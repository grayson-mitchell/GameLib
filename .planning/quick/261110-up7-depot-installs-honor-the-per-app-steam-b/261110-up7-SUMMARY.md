# Quick 261110-up7: Depot installs honor the per-app Steam beta branch

Depot installs now resolve the user's Steam beta (ACF `UserConfig.BetaKey`, then the localconfig.vdf `UserAppConfig` binary-KV blob, else `public`) and use it for manifest selection, buildid, request codes, resume verify and the written ACF.

## Commits
- 437071a92: betaBranch.ts resolver + tests; select.ts per-depot beta-to-public manifest fallback
- 6e9d3d231: BetaKey in Rust (acf.rs, job.rs `beta_key` serde-default) and TS (appManifest.ts, finalizeAcf.ts) ACF writers
- f6218df7c: branch plumbing through plan.ts, install.ts, secondary.ts, types.ts, planModel.ts; todo moved to completed

## Deviations
- select.ts was committed with Task 1 (its tests live in Task 1's file) rather than Task 3.
- `BigInt` literals are unavailable at the repo's TS target; used `BigInt('...')` calls.
- The finalize spec omits `betaKey` (undefined) for public installs, keeping the wire shape and existing assertions unchanged.

## Verification
All listed jest suites (133 tests), `cargo test -p gamelib-depot` acf and golden, cargo fmt, prettier, codecheck, backend-di-ceilings and planning-gates passed. No literal `'public'` remains in the `getManifestRequestCode` call (only the parameter default). Live ADOM check not performed.

## Self-Check: PASSED
