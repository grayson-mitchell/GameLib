---
phase: 47-migrate-aggregated-store-search-from-cheapshark-to-istherean
plan: 11
subsystem: backend/storeSearch + sidecar secrets
tags: [itad, keyring, secrets, boot-step, dev-vault]
requires: [47-08]
provides:
  - Rust keyring_account arm for the 'itad-api-key' slot (+ distinct-account/near-miss test)
  - KEYRING_SLOT_ITAD_API_KEY, SidecarItadKeyStore (keyring) and DevVaultItadKeyStore (dev vault)
  - createItadSecrets: total owner (getApiKey / setApiKey / isRejected / markRejected) with a session-only rejected flag
  - 'itad-secrets' boot step and BootServices.itadSecrets (in-memory default in createTestServices)
affects: [47-12, 47-13]
tech-stack:
  added: []
  patterns: [keyring slot store wrapped by a total owner, closure-state session flag (no module state), dev-vault slot arm]
key-files:
  created:
    - src/backend/storeSearch/itadSecrets.ts
    - src/backend/storeSearch/__tests__/itadSecrets.test.ts
    - src/backend/sidecar/itadSecretStore.ts
  modified:
    - src-tauri/src/main.rs
    - src/backend/sidecar/keyringTokenStore.ts
    - src/backend/sidecar/devSecretVault.ts
    - src/backend/sidecar/__tests__/devSecretVault.test.ts
    - src/backend/sidecar/bootstrap.ts
    - src/backend/services/types.ts
    - src/backend/testUtils/testServices.ts
    - src/backend/sidecar/__tests__/bootSourceShape.test.ts
    - src/backend/sidecar/__tests__/bootstrap.test.ts
    - meta/backendDiCeilings/storeSearch.json
key-decisions:
  - 'The owner trims and routes an empty value to clearApiKey; set and clear both reset the rejected flag BEFORE touching the store, so a failing store cannot leave a stale rejected flag (D-06)'
  - 'Warnings name only the operation (get/set/clear) and the error message; the stored value is never interpolated, and the identifiers used keep logSecretGate green'
  - 'The itad-secrets step takes the dev-vault store when a vault was installed, otherwise a SidecarItadKeyStore; it needs no start/migration hook in secret-stores (new secret, nothing to move)'
requirements-completed: [PRICE-01]
duration: 25min
completed: 2026-11-17
status: complete
actuals:
  tokens: 6000
  tasks: 2
  commits: 2
plan_head_before: d526135826b1b1d98d517432bb735a1d5d53c7ec
plan_head_after: d54343eb333fa5d23f6a2333ddd33714156a5659
---

# Phase 47 Plan 11: ITAD user-key storage Summary

Storage half of the optional user-supplied IsThereAnyDeal key (D-05, D-06): an OS-keyring slot `itad-api-key` (dev builds: a dev-vault slot), a total owner that never throws and never logs the value, a session-only "ITAD rejected the key" flag, and the boot step that builds the owner before handlers register. Nothing in PRICE-01..03 depends on it.

## Commits

| Task | Commit | What |
| ---- | ------ | ---- |
| 1 | 8746b24f9 | Rust allow-list arm + test, slot constant, `createItadSecrets` + test, `SidecarItadKeyStore`, `DevVaultItadKeyStore` (+ dev-vault test), storeSearch.json ceiling |
| 2 | d54343eb3 | `'itad-secrets'` boot step, `BootServices.itadSecrets`, in-memory test default, boot-order and service-key pins |

## What was built

- `src-tauri/src/main.rs`: `"itad-api-key" => Ok("itad-api-key")` in `keyring_account`; new test `keyring_account_maps_itad_api_key_to_its_own_distinct_account` (maps, differs from all four other accounts, rejects three near-misses). The exhaustive "no slot resolves to the probe account" test now includes the new slot.
- `itadSecrets.ts`: `ItadKeyStore`, `ItadSecrets`, `createItadSecrets({store})`. `rejected` is a closure variable (instance state, no module state). Every store call is wrapped; failures emit one `logWarning('[itad-secrets] <op> failed: <message>')`.
- `itadSecretStore.ts`: `SidecarItadKeyStore` over `SidecarKeyringSlotStore(KEYRING_SLOT_ITAD_API_KEY, ...)`; the slot literal is imported, never retyped.
- `devSecretVault.ts`: `'itadApiKey'` vault slot, `DevVaultItadKeyStore`, `itadKeyStore` on `DevSecretVault`.
- `bootstrap.ts`: `'itad-secrets'` after `'steamgrid-secrets'` in `BOOT_STEP_NAMES` and the step list; threaded through `requireServices` (destructure, presence check, missing-name list, return).

## Verification

| Check | Result |
| ----- | ------ |
| `cargo test ... keyring_account` | exit 0, 11 passed |
| `cargo fmt --check` (whole crate) | exit 1, PRE-EXISTING drift in 27 files; none of the 23 main.rs hunks touch lines this plan added (checked by line number) |
| jest Backend itadSecrets, moduleStateCensus, devSecretVault | exit 0 (27 passed) |
| jest Meta logSecretGate, backendDiCeilings | exit 0 (192 passed) |
| jest Backend `src/backend/sidecar/__tests__/*` + diPhaseGates + moduleStateCensus | exit 0 apart from one flaky suite (see below) |
| `pnpm codecheck` | exit 0 (after Task 1 and after Task 2) |
| `npx prettier --check` over every touched TS/JSON path | exit 0, both tasks |
| `pnpm find-deadcode` | only the 3 known unrelated findings (BoundedOutputCapture, NativePortDataStyle, NativePortMac); no new finding, so no knip-baseline line was needed |

Acceptance greps: `"itad-api-key" => Ok("itad-api-key")` in main.rs = 1; `KEYRING_SLOT_ITAD_API_KEY` in itadSecretStore.ts >= 1 and the retyped `'itad-api-key'` literal = 0; `itadKeyStore` in devSecretVault.ts >= 2; `'itad-secrets'` in bootstrap.ts >= 2; `itadSecrets: ItadSecrets` in types.ts = 1.

## Deviations from Plan

**1. [Rule 3 - Blocking] devSecretVault.test.ts fake vault**
- **Found during:** Task 1 (`pnpm codecheck`)
- **Issue:** the new required `itadKeyStore` member broke the hand-built `DevSecretVault` fake in `devSecretVault.test.ts` (TS2345).
- **Fix:** added `itadKeyStore` to the fake; also added a round-trip test (own slot, value-free wipe line) and an `itadKeyStore` assertion on the installed vault.
- **Files modified:** src/backend/sidecar/__tests__/devSecretVault.test.ts
- **Commit:** 8746b24f9

**2. [Rule 3 - Blocking] bootstrap.test.ts service-key pin**
- **Found during:** Task 2. The sorted `BootServices` key list in `bootstrap.test.ts` pins every service; added `'itadSecrets'` in order. No assertion loosened.
- **Commit:** d54343eb3

**3. `cargo fmt -- --check` in the plan's `<verify>` cannot pass crate-wide.** It fails on 27 files before this plan (rustfmt drift in unrelated Rust files, e.g. ipc_contract.rs, tray.rs). I did not reformat them (out of scope). The added Rust lines are fmt-clean. Logged here rather than fixed.

## Deferred / observed, not from this plan

- `outboundHttpRegistry.test.ts` failed once under the parallel multi-suite run and passed alone (9/9): load-sensitive socket test, unrelated. `dxvkInstallRemove.test.ts` showed an `ENOTEMPTY` tmpdir cleanup flake in a full-Backend run, also unrelated.
- Full-Backend run also shows the known failures `createStores.test.ts` (steam_direct_launch_verdict) and others listed by the orchestrator; not touched.
- ESLint: only `require-await` warnings on async in-memory store stubs (same pattern as existing test services); 0 errors.

## Known Stubs

None. (`createTestItadSecrets` is a deliberate in-memory test default, not a stub.)

## Threat Flags

None. Threat register T-47-37 (keyring slot, never config.json), T-47-38 (value-free warnings, logSecretGate green), T-47-39 (Rust allow-list arm + distinct-account test, TS imports the constant) are mitigated; T-47-40 (dev-vault plaintext) accepted as planned.

## Notes for 47-12 / 47-13

- `services.itadSecrets` is always present (every boot and `createTestServices`). Adapter precedence (47-12) should read `await services.itadSecrets.getApiKey()` per request or cache it per call; `markRejected()` must be called when ITAD answers the user key with an auth rejection, and the adapter should skip the user key while `isRejected()` is true.
- `setApiKey('')` and whitespace-only clear the key; both reset `isRejected()`. The rejected flag lives only in the owner instance and is lost on restart, so the Settings IPC (47-12) should expose `{hasKey, rejected}` and never the key value.
- No Rust command, IPC channel or knip-baseline line was added by this plan; 47-12's new IPC channels will each need their baseline line (knip does not count `window.api.*` callers).
- Dev builds with `GAMELIB_DEV_SECRET_VAULT=1` store the key in the dev vault file under `itadApiKey`.

## Self-Check: PASSED

- FOUND: src/backend/storeSearch/itadSecrets.ts, src/backend/storeSearch/__tests__/itadSecrets.test.ts, src/backend/sidecar/itadSecretStore.ts
- FOUND commits: 8746b24f9, d54343eb3 (both ancestors of HEAD)
