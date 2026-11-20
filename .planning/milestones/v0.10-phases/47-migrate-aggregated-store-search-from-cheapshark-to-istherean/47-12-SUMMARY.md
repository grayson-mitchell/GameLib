---
phase: 47-migrate-aggregated-store-search-from-cheapshark-to-istherean
plan: 12
subsystem: backend/storeSearch + sidecar IPC
tags: [itad, user-key, ipc, fallback, preload]
requires: [47-08, 47-11]
provides:
  - itad.ts key precedence (user > GAMELIB_ITAD_API_KEY > baked) via resolveKey/withKey
  - one-shot 401/403 fallback from a rejected user key to the built-in key (markRejected, session-only)
  - itad.getKeyStatus ({hasKey, rejected}) and itad.setApiKey (string max 256) channels end to end
  - window.api.itad.getKeyStatus / setApiKey (preload)
affects: [47-10, 47-13]
tech-stack:
  added: []
  patterns: [withKey wrapper that retries once with the built-in key, optional Pick<ItadSecrets> dep, booleans-only status channel, WR-01 non-string guard]
key-files:
  created: []
  modified:
    - src/backend/storeSearch/itad.ts
    - src/backend/storeSearch/__tests__/itad.test.ts
    - src/backend/sidecar/enrichmentFlowRegistration.ts
    - src/backend/sidecar/handlers.ts
    - src/common/types/ipc/enrichment.ts
    - src/preload/api/storeSearch.ts
    - src-tauri/src/ipc_contract.rs
    - meta/knip-baseline.txt
    - src/backend/sidecar/__tests__/ipcSchemas/enrichment.test.ts
    - src/backend/sidecar/__tests__/runnerSliceRegistration.test.ts
    - src/backend/sidecar/__tests__/enrichmentFlows.test.ts
    - src/backend/sidecar/__tests__/flowRegistrationCensus.test.ts
key-decisions:
  - 'The key is resolved once before the single-flight (so notConfigured fails early and unlogged), then reused only for the first request of a flow; the prices POST after a search resolves afresh, so a user key rejected by the search GET is never reused'
  - 'ITAD auth rejection is 401 or 403 (ITAD answers 403 "Invalid or expired api key"); only a request actually made with the USER key triggers markRejected, so a rejected built-in key is never retried and never marks anything'
  - 'itadSecrets stays an optional ItadDeps member (Pick of getApiKey/isRejected/markRejected): the Steam gid lookup and any caller without an owner keep running on the built-in key'
  - 'The enrichment suite boots with an in-memory itad owner by default: the real boot owner reads the OS keyring through a Rust peer the suite lacks, which would hang every search'
requirements-completed: [PRICE-01]
duration: 40min
completed: 2026-11-17
status: complete
actuals:
  tokens: 14000
  tasks: 2
  commits: 2
plan_head_before: db33e0370d7dc19963816e479aff5eff2758ef1a
plan_head_after: 3b46d023b0cb395013e14f57f81f806b05b7ca8f
---

# Phase 47 Plan 12: ITAD user-key IPC and adapter precedence Summary

Optional user key (D-05, D-06), IPC and adapter half: the adapter prefers a working user key, abandons it for the session when ITAD answers 401/403 and retries that request once with the built-in key, and two bounded channels (`itad.getKeyStatus`, `itad.setApiKey`) let the Settings field read `{hasKey, rejected}` and save or clear the key without the value ever leaving the sidecar.

## Commits

| Task | Commit | What |
| ---- | ------ | ---- |
| 1 | a1a20845d | `resolveKey` / `withKey` in itad.ts, optional `itadSecrets` dep, search GET and both prices POST routed through `withKey`; 10 new itad tests |
| 2 | 3b46d023b | `itad.*` handlers, deps wiring in handlers.ts, zod schemas + return types, preload `itad`, regenerated ipc_contract.rs, knip baseline line, schema/census/enrichment-boot pins and 4 invoke tests |

`commits: 2` counts this plan's own commits. A raw `rev-list` from `plan_head_before` reads higher because other sessions committed to main concurrently (a merge and several docs/spike commits).

## What was built

- `itad.ts`: `resolveKey(deps, endpoint)` returns `{key, source: 'user' | 'env' | 'baked'}`: user key if an owner exists, is not rejected and holds a non-empty key; else `resolveBuiltInItadKey(deps.env)`; else `notConfigured` (D-03). `withKey` runs a request with the resolved key; on a 401/403 for a `user` source it calls `markRejected()`, logs `[itad] user key rejected status=<n>; using the built-in key` (status only), re-resolves (now built-in or `notConfigured`) and runs the same request once more. `postPrices` wraps its whole country attempt plus the US-fallback retry. The keyless Steam lookup is untouched.
- Sidecar: `EnrichmentFlowDeps.itadSecrets: ItadSecrets`; `itad.getKeyStatus` returns two booleans; `itad.setApiKey` has the WR-01 `typeof key !== 'string'` guard (a second line of defence behind the zod schema) and delegates to the owner, which trims and clears on empty. The same `deps` already flows into the search handlers, so the adapter sees the owner with no further change.
- Contract: `'itad.getKeyStatus': noArgs`, `'itad.setApiKey': z.tuple([z.string().max(256)])`; `pnpm gen:ipc-contract` added the two allow-list lines, `pnpm check:ipc-contract` is clean.

## Verification

| Check | Result |
| ----- | ------ |
| `jest --selectProjects Backend --runTestsByPath ...itad.test.ts` | exit 0, 35 passed |
| `jest --selectProjects Meta --runTestsByPath meta/__tests__/logSecretGate.test.ts` | exit 0, 60 passed |
| Backend: enrichmentFlows, runnerSliceRegistration, ipcSchemas/enrichment, rendererAllowList, flowRegistrationCensus | exit 0, 317 passed |
| `pnpm gen:ipc-contract` then `pnpm check:ipc-contract` | exit 0, "up to date" |
| `pnpm codecheck` | exit 0 |
| `pnpm lint` | exit 0, production PASS, tests PASS |
| `npx prettier --check` over every written .ts path (both tasks) | exit 0 |
| `cargo test ipc_contract` | exit 0, 4 passed |
| Acceptance greps | `markRejected` 2, `itadSecrets?:` 1, `jest.mock` in itad.test.ts 2, `"itad.*"` in ipc_contract.rs 2, `typeof key !== 'string'` 2 |

`src-tauri/src/ipc_contract.rs` is generated; no prettier parser for .rs, so no formatter check was run on it. `meta/knip-baseline.txt` and the .md files are not prettier targets worth carrying.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Existing storeSearch invoke tests hung once the handler awaited the owner**
- **Found during:** Task 2
- **Issue:** the enrichment suite boots the real sidecar; its default `itad-secrets` step builds a keyring-backed owner that waits on a Rust peer the suite does not have, so `searchStores` / `getStoreSearchDeals` never answered (8 failures).
- **Fix:** `boot(itadSecrets = inMemoryItadSecrets())` hands every boot a real `createItadSecrets` over an in-memory store via the `services` prebuilt seam.
- **Files modified:** src/backend/sidecar/__tests__/enrichmentFlows.test.ts
- **Commit:** 3b46d023b

**2. [Rule 3 - Blocking] Channel-count pins**
- **Found during:** Task 2
- **Issue:** `flowRegistrationCensus` (enrichment 17 to 19), `runnerSliceRegistration` (handle-kind 70 to 72, per-module total 69 to 71, enrichment 17 to 19) and the schema table (17 to 19) pin counts the two new channels change. `rendererAllowList.test.ts` needed no edit (it does not enumerate names).
- **Fix:** updated each pin with a dated comment; module docstring in enrichmentFlowRegistration.ts now says 19 and describes the `itad.*` pair.
- **Commit:** 3b46d023b

**3. [Rule 2 - Missing] meta/knip-baseline.txt line**
- `exports src/preload/api/storeSearch.ts StoreSearch.itad` added (knip ignores `window.api.*` callers), per the orchestrator note. Commit 3b46d023b.

**Total deviations:** 3 auto-fixed (2 blocking, 1 missing-critical). **Impact:** none on scope.

## Issues Encountered

- Unrelated, pre-existing, not touched: Meta `genI18nGateScope` (A-17 live git derivation of the fork-touched list) and `x86CallbackWineHarness` (wine crash 0xc0000005) fail; `pnpm find-deadcode` reports the three known `nativePortCatalogue` findings.

## Known Stubs

None.

## Threat Flags

None. The two new channels are the T-47-41..45 surface the plan already models; mitigations: booleans-only status (asserted: the response frame never contains the stored value), zod `max(256)` plus the runtime non-string guard, one-shot fallback with the session rejected flag, status-only log line (logSecretGate green), regenerated allow-list and `check:ipc-contract`.

## Notes for 47-10 / 47-13

- Renderer API: `window.api.itad.getKeyStatus(): Promise<{hasKey: boolean; rejected: boolean}>` and `window.api.itad.setApiKey(key: string): Promise<void>`. `setApiKey('')` clears and resets `rejected`; any non-empty save also resets it. The value is never returned. A schema-rejected call (non-string, over 256 chars) surfaces as a failed invoke and changes nothing.
- `rejected` is session-only (a restart forgets it) and is only set after a real search/price request with the user key got 401/403, so the Settings UI should poll or re-read `getKeyStatus` after a search to show the rejected state. Copy must claim no quota benefit (UI-SPEC section 7).
- The knip baseline entry `StoreSearch.itad` stays valid once 47-13 calls `window.api.itad.*` (knip does not see those callers either way).

## Self-Check: PASSED

- FOUND: src/backend/storeSearch/itad.ts (markRejected 2, itadSecrets?: 1)
- FOUND: src/preload/api/storeSearch.ts (`export const itad`)
- FOUND: commit a1a20845d, 3b46d023b (both ancestors of HEAD)
- FOUND: both `itad.*` lines in src-tauri/src/ipc_contract.rs
