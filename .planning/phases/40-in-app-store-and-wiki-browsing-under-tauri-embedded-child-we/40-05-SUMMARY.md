---
phase: 40-in-app-store-and-wiki-browsing-under-tauri-embedded-child-we
plan: 05
subsystem: ipc
tags: [tauri, sidecar, ipc, store-embed, preload, jest]

requires:
  - phase: 40-02
    provides: "The Rust-side store_embed_* channel arms behind requestRustInvoke (open/setBounds/hide/show/close)"
provides:
  - "StoreEmbedSeam TypeScript interface with one setter/getter pair (src/backend/store/storeEmbedSeam.ts)"
  - "10 curated sidecar channels (9 invoke, 1 send) for the in-app store embed, registered via registerStoreEmbedFlows()"
  - "Preload bindings for all 10 channels, including a two-layer finite-bounds validator on storeEmbedSetBounds"
  - "5 mutation-proven test properties covering kind correctness, malformed-response throws, fail-safe no-reject behavior, declared-unimplemented navigation, and the bounds courier's pass-through/throw discipline"
affects: ["40-07 (native back/forward/history stack, owns the 5 declared-unimplemented navigation methods)"]

tech-stack:
  added: []
  patterns:
    - "console.warn (not logWarning) in ipcMain.handle catch bodies; logWarning/logSendFailure reserved for ipcMain.on send-kind catch bodies (heroicLogWriter is undefined until bootstrap.ts's initLogger() runs)"
    - "Declared-unimplemented-throw: methods with no backing Rust arm throw an Error naming the owning future plan, never a plausible default"
    - "Two-layer bounds validation: preload wrapper throws before send, backend seam's setBounds also throws synchronously before its async IIFE"

key-files:
  created:
    - src/backend/store/storeEmbedSeam.ts
    - src/backend/sidecar/storeEmbedFlowRegistration.ts
    - src/backend/sidecar/__tests__/storeEmbedFlows.test.ts
    - src/preload/api/storeEmbed.ts
  modified:
    - src/common/types/sidecarTransport.ts
    - src/common/types/ipc.ts
    - src/preload/api/index.ts
    - src/backend/sidecar/handlers.ts
    - src/backend/sidecar/__tests__/flowRegistrationCensus.test.ts
    - src/backend/sidecar/__tests__/testContainment.test.ts
    - .planning/IPC-PORT-INVENTORY.md

key-decisions:
  - "ipcMain.handle catch bodies use console.warn, not logWarning, mirroring humbleLoginFlowRegistration.ts's actual registered handler bodies (logWarning/logSendFailure is send-arm-only, since send arms have no return-value channel to report failure through)"
  - "Only the 5 RUST_STORE_EMBED_* constants with a live Rust arm (open/setBounds/hide/show/close) are imported; the 4 navigation constants stay declared in sidecarTransport.ts for plan 40-07"
  - "The 10 new storeEmbed* channels have no Electron leg (Tauri-only feature), so they raise both Unique channels and Ported to sidecar in IPC-PORT-INVENTORY.md's Totals, matching the getLoginBackground precedent"

requirements-completed: [REQ-40-02, REQ-40-05]

duration: 27min
completed: 2026-09-04
---

# Phase 40 Plan 05: In-App Store Embed IPC Seam Summary

**TypeScript seam between the renderer and the Rust store embed: 10 curated sidecar channels (9 invoke, 1 send), a `StoreEmbedSeam` interface, preload bindings with two-layer bounds validation, and 5 mutation-proven test properties — zero Rust changes, zero renderer-component changes.**

## Performance

- **Duration:** 27 min
- **Started:** 2026-09-04T06:34:40Z (Task 1 commit)
- **Completed:** 2026-09-04T07:01:26Z (Task 3 commit)
- **Tasks:** 3
- **Files modified:** 11 (4 created, 7 modified)

## Accomplishments

- Channel-name constants, the `StoreEmbedSeam` interface, and IPC type declarations (Task 1)
- Rust-backed seam implementation, IPC registration, and preload bindings, wired into sidecar bootstrap (Task 2)
- A 37-test suite proving 5 mutation-provable properties against the real `sidecarRpc` transport, plus the `.planning/IPC-PORT-INVENTORY.md` update (Task 3)

## Task Commits

1. **Task 1: Channel constants + StoreEmbedSeam interface + IPC type declarations** - `ed85a4885` (feat)
2. **Task 2: Rust-backed seam implementation + IPC registration + preload bindings** - `9df239a38` (feat)
3. **Task 3: storeEmbedFlows.test.ts, logger-crash fix, IPC-PORT-INVENTORY.md update** - `6188f7e4f` (test)

_Note: Task 3's commit is typed `test` even though it also contains a Rule 1 bug fix (the logger crash) and a Rule 3 test-containment gate fix, because the test file is the primary deliverable and the fixes were both discovered while writing it._

## Final Channel-Name Table

| Channel | Kind | Rust arm | Notes |
|---|---|---|---|
| `storeEmbedOpen` | invoke | `RUST_STORE_EMBED_OPEN` | live |
| `storeEmbedSetBounds` | send | `RUST_STORE_EMBED_SET_BOUNDS` | live; fire-and-forget, D-18 pure courier |
| `storeEmbedHide` | invoke | `RUST_STORE_EMBED_HIDE` | live |
| `storeEmbedShow` | invoke | `RUST_STORE_EMBED_SHOW` | live |
| `storeEmbedClose` | invoke | `RUST_STORE_EMBED_CLOSE` | live |
| `storeEmbedTakeNavEvents` | invoke | none | declared-unimplemented, throws naming 40-07, caught by the handle arm and converted to `[]` |
| `storeEmbedBack` | invoke | none | declared-unimplemented, throws naming 40-07, surfaces as `{status:'error'}` |
| `storeEmbedForward` | invoke | none | declared-unimplemented, throws naming 40-07, surfaces as `{status:'error'}` |
| `storeEmbedReload` | invoke | none | declared-unimplemented, throws naming 40-07, surfaces as `{status:'error'}` |
| `storeEmbedNavigate` | invoke | none | declared-unimplemented, throws naming 40-07, surfaces as `{status:'error'}` |

9 invoke + 1 send = 10 total, matching `registerStoreEmbedFlows()`'s own docstring claim and the `flowRegistrationCensus.test.ts` `EXPECTED` table entry (`{ invoke: 9, send: 1 }`).

## Per-Method Malformed-Response Table

| Method | Expected result shape | Behavior on malformed response |
|---|---|---|
| `open` | `null` | Throws `store_embed_open: malformed response (expected null): ...` |
| `setBounds` | `null` | Throws `store_embed_set_bounds: malformed response (expected null): ...` |
| `hide` | `null` | Throws `store_embed_hide: malformed response (expected null): ...` |
| `show` | `null` | Throws `store_embed_show: malformed response (expected null): ...` |
| `close` | `null` | Throws `store_embed_close: malformed response (expected null): ...` |

Each was proven against 3 distinct malformed shapes (`{}`, `'ok'`, `0`) in place of `null` — 15 assertions total in the "malformed-response-throws" describe block.

## Bootstrap Wiring

`registerStoreEmbedFlows()` is called at `src/backend/sidecar/handlers.ts:227`, placed alongside the other `register*Flows()` calls (after `registerEosOverlayFlows()`, before `ensureStoresRegistered()`), per the file's own documented convention that placement doesn't matter for channels with no cross-module runtime dependency. `handlers.ts`'s module-level header docstring was updated at (originally) line ~37 to name this module.

## The 5 Mutation-Proven Tests

Each was proven capable of failing by a one-line change to `storeEmbedFlowRegistration.ts`, run, observed red, then reverted (confirmed via `diff` against a saved copy of the pre-mutation file — zero net change after revert):

1. **`kind correctness`** — mutated `ipcMain.on('storeEmbedSetBounds', ...)` to `ipcMain.handle('storeEmbedSetBounds', ...)`. Observed red: `T-40-05-02 storeEmbedSetBounds is registered as ipcMain.on, and NOT as ipcMain.handle` failed (`expected 1, received 0`).
2. **`malformed-response-throws`** — mutated `hide()`'s `if (result !== null) {` to `if (false) {`. Observed red: all 3 `store_embed_hide: throws on ...` cases failed (`Received promise resolved instead of rejected`).
3. **`no-handler-rejects`** — mutated `safeStatus`'s catch body to `throw error` instead of `return { status: 'error', error: message }`. Observed red: `storeEmbedOpen: the registered ipcMain.handle arm resolves { status: "error" } ... rather than rejecting` failed with an unhandled rejection (`store_embed_open:timeout`).
4. **`unimplemented-navigation-throws-naming-40-07`** — mutated `const NAV_OWNER_PLAN = '40-07'` to `'40-08'`. Observed red: all 5 `it.each` cases (takeNavEvents/back/forward/reload/navigate) failed (`Expected pattern: /40-07/`, `Received message: "... plan 40-08 owns it ..."`).
5. **`bounds-courier-passthrough-and-throw`** — mutated `assertFiniteBounds`'s `if (typeof value !== 'number' || !Number.isFinite(value))` to `if (false)`. Observed red: all 3 `BAD_COORDINATES` cases (missing `h`, `NaN` `w`, `Infinity` `x`) failed (`Expected pattern: /must be a finite number/`, `Received function did not throw`).

After each mutation was confirmed red, the file was restored from a pre-mutation copy and `diff` confirmed a byte-identical revert before the next mutation was applied.

## IPC Inventory Before/After

| | Before | After |
|---|---:|---:|
| Unique channels | 208 | 218 |
| Ported to sidecar | 53 | 63 |
| Unported | 159 | 159 |

Added a new `## Phase 40 — Plan 05 — in-app store-embed seam (10 channels) — **PORTED**` section listing all 10 `storeEmbed*` channels. All 10 are brand-new (no late-discovered pre-existing channels) and have no Electron leg, so both `Unique channels` and `Ported to sidecar` rise by 10 — matching the `getLoginBackground` precedent already established in this document (raise both together when a Tauri-only channel is born with no Electron equivalent). `Unported` is unchanged.

## Files Created/Modified

- `src/common/types/sidecarTransport.ts` - 9 `RUST_STORE_EMBED_*` channel-name constants (5 imported/used this plan, 4 reserved for plan 40-07)
- `src/common/types/ipc.ts` - IPC type declarations for the 10 renderer-facing channels
- `src/backend/store/storeEmbedSeam.ts` - `StoreEmbedSeam` interface, `setStoreEmbedSeam`/`getStoreEmbedSeam`
- `src/backend/sidecar/storeEmbedFlowRegistration.ts` - Rust-backed seam implementation (`createRustStoreEmbedSeam`) and `registerStoreEmbedFlows()`
- `src/backend/sidecar/__tests__/storeEmbedFlows.test.ts` - the 37-test, 5-property mutation-proven suite
- `src/preload/api/storeEmbed.ts` - preload bindings, with `storeEmbedSetBounds`'s finite-bounds validator
- `src/preload/api/index.ts` - barrel export wiring
- `src/backend/sidecar/handlers.ts` - bootstrap call site + header docstring update
- `src/backend/sidecar/__tests__/flowRegistrationCensus.test.ts` - `EXPECTED` table entry for the new registration module
- `src/backend/sidecar/__tests__/testContainment.test.ts` - `STRUCTURALLY_CONTAINED_SUITES` entry + justification paragraph for the new test file
- `.planning/IPC-PORT-INVENTORY.md` - new Phase 40 section, Totals update

## Decisions Made

- `console.warn`, not `logWarning`, in every `ipcMain.handle` catch body — discovered by directly comparing against `humbleLoginFlowRegistration.ts`'s actual registered handler bodies (not just its doc comments, which initially suggested `logSendFailure` was general-purpose). `logWarning` dereferences `heroicLogWriter`, which is `undefined` until `bootstrap.ts`'s `initLogger()` runs.
- Only 5 of the 9 declared `RUST_STORE_EMBED_*` constants are imported into `storeEmbedFlowRegistration.ts` (the ones with a live Rust arm); the 4 navigation constants stay declared-but-unimported to avoid an unused-import lint error, ready for plan 40-07 to import.
- Two-layer bounds validation: the preload wrapper (`src/preload/api/storeEmbed.ts`) throws before sending, and the backend seam's `setBounds` also throws synchronously via `assertFiniteBounds` before entering its async IIFE — satisfies both the preload-boundary throw requirement and the backend-testable requirement, since this plan's test file is backend-only.
- No `40-03-SUMMARY.md` exists yet in the phase directory, so the "reconcile against 40-03-SUMMARY.md if it removed a channel" instruction was a no-op.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed a `heroicLogWriter` undefined crash in two `ipcMain.handle` catch bodies**
- **Found during:** Task 3 (writing `storeEmbedFlows.test.ts`)
- **Issue:** `safeStatus()`'s catch block and `storeEmbedTakeNavEvents`'s handler catch block called `logWarning(...)`, which internally calls `heroicLogWriter.logWarning(...)`. `heroicLogWriter` is `undefined` until `bootstrap.ts`'s `initLogger()` runs, which never happens in this Jest suite (or any runtime path exercised before boot) — throwing `TypeError: Cannot read properties of undefined (reading 'logWarning')` and turning a benign handle-arm failure into a second, unrelated crash.
- **Fix:** Refactored `safeStatus()` to accept a `label: string` parameter and use `console.warn(...)` instead of `logWarning(...)`; updated all 8 call sites to pass a label string; fixed `storeEmbedTakeNavEvents`'s catch body the same way. This mirrors the established convention confirmed by reading `humbleLoginFlowRegistration.ts`'s actual `ipcMain.handle` bodies.
- **Files modified:** `src/backend/sidecar/storeEmbedFlowRegistration.ts`
- **Verification:** `pnpm exec jest src/backend/sidecar/__tests__/storeEmbedFlows.test.ts` — 37/37 passed (previously 2 failures with the `TypeError`)
- **Committed in:** `6188f7e4f` (Task 3 commit)

**2. [Rule 3 - Blocking] Registered the new test file in `testContainment.test.ts`'s structural-containment census**
- **Found during:** Task 3, running the full `pnpm exec jest src/backend/sidecar src/preload` suite
- **Issue:** `testContainment.test.ts`'s Block C derived `readdirSync` tripwire failed with `unclassified: ['storeEmbedFlows.test.ts']`, because the new test file wasn't declared in either `IN_SCOPE_SUITES` or `STRUCTURALLY_CONTAINED_SUITES`.
- **Fix:** Added `'storeEmbedFlows.test.ts'` to `STRUCTURALLY_CONTAINED_SUITES` at its correct alphabetical position, plus a descriptive justification paragraph in the file's header docstring (mirroring the `humbleLoginFlows.test.ts` paragraph's style), noting it never mocks `electron`/`electron-store` (its import graph never touches them) and drives the real `sidecarRpc` transport via `startRpcServer()`.
- **Files modified:** `src/backend/sidecar/__tests__/testContainment.test.ts`
- **Verification:** `pnpm exec jest src/backend/sidecar/__tests__/testContainment.test.ts` — 55/55 passed; full `pnpm exec jest src/backend/sidecar src/preload` — 67 suites / 1497 tests passed
- **Committed in:** `6188f7e4f` (Task 3 commit)

**3. [Rule 1 - Bug] Two new lint warnings pushed the repo-wide `max-warnings` ratchet over budget**
- **Found during:** Task 3, running `pnpm lint` (part of the required verification set)
- **Issue:** `storeEmbedFlows.test.ts` had 2 `@typescript-eslint` warnings (`no-unsafe-argument` on a `JSON.parse(line)` push, `no-unsafe-assignment` on an `expect.stringContaining(...)` value inside a `toEqual` object literal) — the same warning class already present elsewhere in the codebase (e.g. `humbleLoginFlows.test.ts`), but adding 2 more pushed the total from 4156 to 4158, exceeding the `eslint --max-warnings 4157` budget in `package.json`'s `lint` script.
- **Fix:** Cast `JSON.parse(line)` as `Frame`; replaced the `resolves.toEqual({status, error: expect.stringContaining(...)})` assertion with a destructured `result.status`/`result.error` check using `toBe`/`toMatch`, eliminating both warnings.
- **Files modified:** `src/backend/sidecar/__tests__/storeEmbedFlows.test.ts`
- **Verification:** `pnpm lint` exits 0 with 4156 warnings (within the 4157 budget); `pnpm exec jest src/backend/sidecar/__tests__/storeEmbedFlows.test.ts` — 37/37 still passing
- **Committed in:** `6188f7e4f` (Task 3 commit)

---

**Total deviations:** 3 auto-fixed (1 bug, 1 blocking, 1 bug). **Impact on plan:** All three were necessary to keep the test suite runnable and the lint/gate budget green. No scope creep — no Rust or renderer-component files were touched.

## Issues Encountered

None beyond the deviations documented above. The `ported-channels-gate.py` for phase 34.4.1 failed once, transiently, while `.planning/IPC-PORT-INVENTORY.md` had uncommitted changes (its `check_inventory_unmodified` assertion checks `git diff --stat` against `HEAD`, which is agnostic to which plan caused the diff) — this resolved itself once Task 3 was committed, and `python3 meta/runPlanningGates.py` returned 7/7 afterward.

## Known Stubs

None. The 5 declared-unimplemented navigation methods (`takeNavEvents`/`back`/`forward`/`reload`/`navigate`) are not stubs in the silent-placeholder sense — each throws a descriptive Error naming plan `40-07` as owner (D-25), is proven by its own mutation-tested describe block, and is documented in this plan's own scope as intentionally out-of-scope pending the Rust-side navigation history stack.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The `StoreEmbedSeam` interface, its 10-channel IPC surface, and the preload bindings are complete and fully tested against the real sidecar transport — ready for a renderer component to consume via `window.api.storeEmbed*` in a later plan.
- Plan `40-07` has a clear, already-tested integration point: it only needs to replace the 5 `unimplementedError(...)` throws in `createRustStoreEmbedSeam()` with real `requestRustInvoke` calls against a Rust-side navigation history stack, and can reuse this plan's `storeEmbedFlows.test.ts` malformed-response and kind-correctness patterns directly.

---
*Phase: 40-in-app-store-and-wiki-browsing-under-tauri-embedded-child-we*
*Completed: 2026-09-04*

## Self-Check: PASSED

All 5 created files confirmed present on disk; all 4 commits (`ed85a4885`, `9df239a38`,
`6188f7e4f`, `1a4e72095`) confirmed present in `git log --oneline --all`.
