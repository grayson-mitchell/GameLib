---
phase: quick-261103-x0l
plan: 01
subsystem: dev-tooling
tags: [tauri-dev, preflight, secret-store, keychain]
key-files:
  modified:
    - meta/tauriDevPreflight.cjs
    - meta/__tests__/tauriDevPreflight.test.ts
    - package.json
    - README.md
metrics:
  completed: 2026-11-03
---

# Quick 261103-x0l: Preflight guard refuses bare tauri:dev:run

Pure `checkSecretStoreArm(env)` runs first in the preflight `main()`, so bare `pnpm tauri:dev:run` exits 1 unless `GAMELIB_DEV_SECRET_VAULT === '1'` or `GAMELIB_DEV_KEYRING === '1'` (exact match only). `pnpm tauri:dev:keyring` now sets `GAMELIB_DEV_KEYRING=1` and leaves the vault var unset.

## Commits
- 6245ac6cd: guard function, wiring, tests (TDD: 15 new tests failed first, then passed)
- d1ddc292b: `tauri:dev:keyring` script
- 6c17aa7f4: README note

## Verification
- `pnpm jest --selectProjects Meta --runTestsByPath meta/__tests__/tauriDevPreflight.test.ts`: 29/29 passed.
- prettier clean on all four files; tsc (tsconfig.meta.json) clean; eslint reports the .cjs as ignored by config (0 errors).
- Direct CLI runs of `node meta/tauriDevPreflight.cjs`:
  - both unset: exit 1, message names `pnpm tauri:dev` and `pnpm tauri:dev:keyring`
  - `GAMELIB_DEV_SECRET_VAULT=true`: exit 1
  - `GAMELIB_DEV_SECRET_VAULT=1`: `OK: secret-store arm: dev-vault`, exit 0
  - `GAMELIB_DEV_KEYRING=1` (vault unset): `OK: secret-store arm: keyring`, exit 0
- The running dev instance (pid 4882) only produced a stale-shell WARN (exe path unreadable) after the guard had passed; the guard runs first, so the asserted output was unaffected. Nothing was killed or launched.
- Package scripts check passed: `tauri:dev`, `tauri:dev:vault`, `tauri:dev:run` unchanged. bootstrap.ts and devSecretVault.ts untouched.

## Caller audit
- package.json `tauri:dev`: cross-env sets vault=1, passes. `tauri:dev:vault` delegates to it.
- package.json `tauri:dev:keyring`: now sets KEYRING=1, passes.
- meta/captureShellScrollback.ts spawns `pnpm tauri:dev` (comment at :701 only references keyring); the script's own cross-env sets vault=1 regardless of inherited env, so it passes. Unchanged.
- .github: only a comment in rust-test.yml:40 mentions `pnpm tauri:dev`; no invocation.
- No other callers of `tauri:dev:run` or the preflight.

## Deviations from Plan
None. (A first README/package.json edit attempt failed on a shell quoting error and was redone; no effect on results.)

## Known Stubs
None.
