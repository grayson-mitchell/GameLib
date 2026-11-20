---
phase: 64-ui-to-edit-themes
plan: 03
subsystem: store
tags: [ipc, config-store, sidecar, preload, tauri, allow-list, custom-themes]

requires: []
provides:
  - "sidecar:store-set-checked: invoke channel that resolves true only once a configStore write is persisted, false when any write guard refuses it"
  - "applyStoreWrite returns boolean (persisted or refused)"
  - "snapshotSetChecked / window.api.storeSetChecked / TypeCheckedStoreFrontend.setChecked(key, value): Promise<boolean>"
  - "CustomTheme { id, name, base, tokens } and configStore.customThemes (typed and allow-listed)"
affects: [64-04, 64-07, theme editor Save, custom theme persistence]

actuals:
  tokens: 4518
  tasks: 2
  commits: 2
plan_head_before: ae0e0f83fce529b19746de7f2bb6e3cf1f54cb13
plan_head_after: 267d1faaa43722473476ce3c4c18ce29d363a9dc

tech-stack:
  added: []
  patterns:
    - "Confirmed write = invoke-kind sibling of a send-kind channel, routed through the same single write choke point (applyStoreWrite)"
    - "Renderer snapshot is written only after the sidecar confirms, never optimistically (contrast snapshotSet)"
    - "A renderer-invoked internal channel is simply not listed in sidecarInternalCallers; pnpm gen:ipc-contract puts it in the Rust RENDERER_CHANNELS list"

key-files:
  created:
    - src/common/types/customTheme.ts
  modified:
    - src/common/types/sidecarTransport.ts
    - src/common/types/ipc/sidecarInternal.ts
    - src/backend/sidecar/storeWriteHandlers.ts
    - src-tauri/src/ipc_contract.rs
    - src/preload/tauriTransport.ts
    - src/preload/api/misc.ts
    - src/frontend/helpers/stores.ts
    - src/common/types/typed_store.ts
    - src/common/types/storePolicy.ts
    - src/backend/sidecar/__tests__/storeLayer.test.ts
    - src/backend/sidecar/__tests__/ipcSchemas/sidecarInternal.test.ts
    - src/preload/__tests__/tauriTransport.test.ts
    - src/preload/__tests__/storeApi.test.ts
    - src/common/types/__tests__/storePolicy.test.ts

key-decisions:
  - "A refused confirmed write is a resolved false, not a rejected promise: every guard already logs its own stderr line, and the renderer only needs the outcome"
  - "Only an exact boolean true from the sidecar counts as persisted; any other value (including a truthy string) is treated as a refusal"
  - "customThemes is one array under one fixed allow-listed key, never dotted per-id keys, so a theme id can never build a key path"

requirements-completed: [THEME-02]

duration: ~25 min
completed: 2026-11-18
status: complete
---

# Phase 64 Plan 03: Confirmed configStore write and customThemes key Summary

**`configStore.setChecked(key, value)` resolves true only after the sidecar persisted the write (via the new `sidecar:store-set-checked` invoke channel), and `configStore.customThemes` is a typed, allow-listed key holding `{ id, name, base, tokens }[]`.**

## Accomplishments

- Task 1 (tracer): `applyStoreWrite` now returns a boolean: false from each of its six guards (unrecognized store, Keychain-owned token, unsafe key path, not allow-listed, no resolvable store, read-only store) and from a throwing write, true after the write persisted and the change was pushed. The send-kind `storeSet`/`storeDelete` listeners ignore the result, so their behaviour is unchanged. A new handler for `STORE_SET_CHECKED_CHANNEL` (`'sidecar:store-set-checked'`) routes through the same choke point and returns that boolean; non-string name or key returns false. The channel is in `sidecarInternalInvokeArgs` (not `sidecarInternalCallers`), and `pnpm gen:ipc-contract` added it to the Rust `RENDERER_CHANNELS` allow-list (one generated line).
- Task 1 (preload and frontend): `snapshotSetChecked` refuses non-writable fields locally without invoking, awaits the invoke, treats a rejection or any non-`true` result as false, and writes the local snapshot only on an exact `true`. `window.api.storeSetChecked` and `TypeCheckedStoreFrontend.setChecked` expose it.
- Task 2: `CustomTheme` interface, `configStore.customThemes: CustomTheme[]` in `StoreStructure`, and `'customThemes'` appended to `STORE_ALLOWLIST.configStore` (nothing else widened). The `customThemes.__proto__.x` path is proven not writable, and a one-theme array round-trips through the checked channel.

## Task Commits

| Task | Name | Commit |
| ---- | ---- | ------ |
| 1 | Tracer: renderer-to-disk checked write for one configStore key | aea132918 |
| 2 | Allow-list and type configStore.customThemes | 267d1faaa |

## Verification

- `pnpm exec jest` over storeLayer, sidecarInternal schema, ipcSchemaCoverage, tauriTransport, storeApi and genIpcContract: 213 passed. After Task 2, storePolicy and storeLayer: 100 passed.
- `pnpm check:ipc-contract` up to date; `"sidecar:store-set-checked"` appears exactly once in `src-tauri/src/ipc_contract.rs`.
- `pnpm codecheck` exit 0 after each task.
- `npx prettier --file-info` reported every written path not ignored, and `npx prettier --check` passes over them (a first check flagged `storeWriteHandlers.ts` and `storeLayer.test.ts`; both were formatted with `--write`).
- `eslint` over the touched files: no new warning (a `require-await` warning on the first draft of the handler was removed by returning `Promise.resolve(...)` from a non-async function).
- `pnpm find-deadcode`: only the two known pre-existing `NativePort*` findings remain (see Deviations 1).
- `pnpm planning-gates`: only the known pre-existing preload-surface-gate failure on the four phase-81 `steamAdoption*`/`steamLaunchWithoutSteamOnce` channels.
- Acceptance greps: `STORE_SET_CHECKED_CHANNEL` in storeWriteHandlers (present), `export async function snapshotSetChecked` (1), `setChecked` in stores.ts (present), `customThemes: CustomTheme[]` in typed_store.ts (1), `'customThemes'` in storePolicy.ts (1).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `src/preload/__tests__/storeApi.test.ts` added to the touched files**
- **Found during:** Task 1 verification (`pnpm find-deadcode`)
- **Issue:** knip flagged the new `Misc.storeSetChecked` export as dead: nothing in the repo imports it yet (its only consumer is `window.api`, assembled by spread, which knip cannot see). The existing `storeSet` is kept alive by an import in this same test file.
- **Fix:** added `snapshotSetChecked` to that file's `../tauriTransport` mock and a delegation test (`storeSetChecked` returns the confirmation `snapshotSetChecked` resolves). Plan 04 will add a real consumer.
- **Files modified:** src/preload/__tests__/storeApi.test.ts
- **Commit:** aea132918

**2. [Rule 1 - Bug] Stale channel count in the sidecarInternal schema test**
- **Found during:** Task 1
- **Issue:** the test pinned `14` channels (and its title said "thirteen"); adding the new channel makes it 15.
- **Fix:** updated the count to 15 and the title to "fifteen".
- **Files modified:** src/backend/sidecar/__tests__/ipcSchemas/sidecarInternal.test.ts
- **Commit:** aea132918

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug). **Impact:** none on scope; both are test-side.

**Ordering note:** the checked-write round trip for `customThemes` was written in Task 2 (it needs the allow-list entry), not in Task 1's storeLayer cases.

**Commit-count note:** `git rev-list --count plan_head_before..plan_head_after` reports 3 because a concurrent phase-81 session committed `1213e7937` (`docs(81-09)`) onto `main` in the same window; this plan's own commits are the two above, so `actuals.commits` is 2.

## Auth Gates

None.

## Known Stubs

None. `storeSetChecked` has no production consumer until Plan 04/07 (intentional: this plan provides the capability, those plans call it).

## Threat Flags

None. The only new surface is the renderer-invoked `sidecar:store-set-checked` channel, which is the plan's modelled T-64-05/06 surface: it goes through the same `applyStoreWrite` guards as `storeSet`, returns a bare boolean (T-64-08), and a refused write keeps its stderr line (T-64-09).

## Notes for later plans

- The Rust relay allow-list changed, so the shell recompiles on the next `pnpm tauri:dev` (Plan 10 live check).
- Changing the persisted `CustomTheme` shape later needs a Phase 68 `store/config` migration entry.
- Pre-existing failures observed and left alone (per dispatch): `pnpm planning-gates` preload-surface-gate (four phase-81 channels), `pnpm find-deadcode` on the `NativePort*` types, `meta/__tests__/x86CallbackWineHarness.test.ts` (Wine harness, unrelated).

## Next Phase Readiness

Ready for Plan 04: Save can `await configStore.setChecked('customThemes', ...)` and `setChecked('theme', 'custom:<id>')` and react to a false result.

## Self-Check: PASSED

- Created file present: `src/common/types/customTheme.ts`.
- Commits `aea132918` and `267d1faaa` are ancestors of HEAD.
