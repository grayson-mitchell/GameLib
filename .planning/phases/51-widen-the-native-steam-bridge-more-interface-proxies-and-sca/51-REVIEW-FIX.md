---
phase: 51-widen-the-native-steam-bridge-more-interface-proxies-and-sca
fixed_at: 2026-10-25T00:00:00Z
updated_at: 2026-10-26T00:00:00Z
review_path: .planning/phases/51-widen-the-native-steam-bridge-more-interface-proxies-and-sca/51-REVIEW.md
iteration: 1
findings_in_scope: 15
fixed: 15
skipped: 0
status: partial
---

# Phase 51: Code Review Fix Report

**Fixed at:** 2026-10-25
**Source review:** .planning/phases/51-widen-the-native-steam-bridge-more-interface-proxies-and-sca/51-REVIEW.md
**Iteration:** 1

**Summary:**

- Findings in scope: 15 (CR-01..CR-04, WR-01..WR-11; IN-01..IN-05 out of scope)
- Fixed: 15 (13 in iteration 1, plus 2 afterwards by quick tasks: WR-02 by 261026-k6o, and WR-04 by 082ff80db, pinned and live-gated by 261026-kyv)
  - 5 by earlier gap plans: CR-01, CR-02, CR-03, CR-04, WR-05
  - 1 incidentally by Phase 53: WR-10
  - 7 in this pass: WR-01, WR-03 (doc-only, partial), WR-06, WR-07, WR-08, WR-09, WR-11
- Skipped: 0
- Status stays `partial`: WR-03 is fixed doc-only with its behavioural fix tracked as a todo, and WR-01, WR-08, WR-09 and WR-11 still await human verification (see Outstanding).

Updated 2026-10-26: WR-02 and WR-04, skipped in iteration 1, were resolved afterwards by the quick tasks named above.

The review is dated 2026-10-22. Every open finding was re-checked against the current code (after 51-20..51-30, Phase 52, Phase 53 and the quick tasks) before any fix. The cited line numbers were stale throughout.

## Fixed Issues

### CR-01: `isScanVerdictNowCovered` ignores arch

**Commit:** e56b66d7e (plan 51-20)
**Applied fix:** Fixed before this pass. A stored miss is now tested only against the scanned arch's exports and served versions.

### CR-02: Matchmaking bare accessors always return NULL (family casing)

**Commit:** a3e2cc099 (plan 51-21)
**Applied fix:** Fixed before this pass. The cfg family spelling is aligned in the generated shim.

### CR-03: x64 unserved bare-accessor version reported "stubbed" but the shim returns NULL

**Commit:** e56b66d7e (plan 51-20)
**Applied fix:** Fixed before this pass, by failing closed. The x64 null-object fallback now covers only runtime-lookup families. A bare-accessor import of an unserved version is recorded as a miss. `resolve_bare_iface` was deliberately not patched to return the null object, because of WR-03 (see 51-20-SUMMARY.md).

### CR-04: Exe-only import scan sends runtime-loaded `steam_api` titles to the bridge and erases prescreen evidence

**Commit:** 1df09a29d (plan 51-22)
**Applied fix:** Fixed before this pass. A runtime-loaded steam_api is a scan miss, and the prescreen is never downgraded.

### WR-05: The process monitor's give-up and never-matched paths never call `onStopped`

**Commits:** b6012f368, b8a020087 (plan 51-23)
**Applied fix:** Fixed before this pass. `fireStoppedOnce` runs on the gone branch, the ps give-up branch and `launcherExited`. The monitor now starts before the wine child is awaited.

### WR-10: LISTEN-line parsing splits each stderr chunk independently

**Commit:** eeafd0fa3 (`fix(53-18): reassemble helper output lines across chunks (WR-05)`)
**Applied fix:** Fixed incidentally by Phase 53. `helperProcess.ts`'s `relayLines` keeps a per-stream carry and flushes it once at stream end. LISTEN parsing sees only complete lines. Found via `git log -S 'carry = parts.pop()'`.

### WR-01: Auto-clearing a scan deletes the only copy of `interfaceVersions`

**Files modified:** `src/backend/storeManagers/steam/electronStores.ts`, `src/backend/storeManagers/steam/bridge/bridgeVerdict.ts`, `src/backend/storeManagers/steam/games.ts`, `src/backend/storeManagers/steam/bridge/__tests__/bridgeVerdict.test.ts`, `src/backend/storeManagers/steam/__tests__/games.test.ts`
**Commit:** f96369577
**Status:** fixed: requires human verification (state-handling change)
**Applied fix:**

- `clearBridgeScanVerdict` keeps a non-empty cleared pool as a new top-level `bridge.interfaceVersions`. It sits outside `scan`, for the same reason `drm` does. It is declared in the Zod schema, so it survives a read.
- An empty pool never overwrites a pool that was retained earlier.
- `launchBridgeGame` uses the scan's own pool when it is non-empty, and falls back to the retained one otherwise. The fallback applies in two places:
  - `placeShimForGame`'s `persistedInterfaceVersions`.
  - The cfg's iface lines on an `'already-placed'` launch. That case carries no fresh verdict, and the review did not name it.
- Tests: two in bridgeVerdict (pool retained and readable; an empty pool does not clobber a retained one), and one in games (no scan, retained pool reaches both `placeShimForGame` and `writeBridgeConfig`).

### WR-03: The x64 null object returns 0 for sret slots

**Files modified:** `meta/gen_vtables.ts`
**Commit:** 006e5f8f1
**Status:** fixed: partial. This is the review's "at minimum" option only.
**Applied fix:**

- The `X64_NULL_OBJECT_SLOTS` doc comment no longer claims "never a crash". It now says:
  - the generic function is arity-safe but returns 0 in RAX, which crashes a caller of an MSVC x64 sret slot (for example `ISteamController::GetDigitalActionData`);
  - CR-03 (51-20) narrowed the hazard to runtime-lookup families;
  - a real fix needs per-family, sret-aware null objects generated from the Proton inventory.
- This is a comment change in the generator only. `pnpm gen-vtables` regenerates byte-identical output, so the generated shim and its binaries are untouched.

**Tracked:** `.planning/todos/pending/2026-10-26-x64-null-object-sret-aware-per-family.md`
**Decision:** On 2026-10-26 the user accepted the doc-only fix for Phase 51; the behavioural fix is tracked by the todo above.

**Not done:** the behavioural fix. Either option (per-family null objects in the generated C, or counting sret-bearing unserved families as missing, which would re-route titles such as ELEX) needs a design decision and a live Wine/hardware gate. The review's other minimum, adding the risk to the D-51-02 notice text, was also not done. It is a user-facing copy decision.

### WR-06: Helper child handles are not `unref()`'d (sidecar exit contract)

**Files modified:** `src/backend/storeManagers/steam/bridge/helperProcess.ts`, `src/backend/storeManagers/steam/bridge/__tests__/helperProcess.test.ts`
**Commit:** 3cff7b75b
**Applied fix:**

- After `spawn`, the helper `ChildProcess` and both piped streams are `unref()`'d. The calls are optional, since test fakes may lack `unref`.
- A one-time, synchronous `process.on('exit')` listener calls `shutdownAllBridgeHelpers()`. It is installed on the first spawn. It is not a handle, and it is deliberately not a stdin `'end'` handler, which the exit contract rules out. It kills any helper still running when the sidecar drains at stdin EOF.
- On unix, the Rust shell's process-group reap (`shutdown_child`, `kill(-pgid)`) remains the backstop. The helper is not detached, so it is in the sidecar's group. On Windows there is no group reap, so the exit listener is the only teardown on the drain path.
- New test: asserts all three `unref` calls, that the LISTEN line is still read, and that the exit listener kills a live helper. A mutation check (removing the unref and the listener install) makes it fail.
- Closes the `## 51-23: review WR-06 deferred` entry in deferred-items.md.

### WR-07: A Win64 "shim-not-built" at install time is not persisted

**Files modified:** `src/backend/storeManagers/steam/games.ts`, `src/backend/storeManagers/steam/__tests__/games.test.ts`
**Commit:** ba1b69afd
**Applied fix:**

- The `isWin64NoShim` branch of `installBridgeGame` now calls `setBridgeSteamApiPrescreen(appId, 'x64')`, so the resolver's win64-no-shim row short-circuits the next session's install.
- That row is gated on `win64ShimPresent`, so a build that bundles `steam_api64.dll` is not held back by it.
- Overwriting a prior `'both'` is safe: no routing row reads `'both'`.
- The existing install-time win64-no-shim test now also asserts the persisted `steamApi: 'x64'`.

### WR-08: Widened `pending-scan` routing ignores an existing GameLibSteam location on install/resume

**Files modified:** `src/backend/storeManagers/steam/games.ts`, `src/backend/storeManagers/steam/__tests__/games.test.ts`
**Commit:** b0af49559
**Status:** fixed: requires human verification (routing condition)
**Applied fix:**

- `install()` now keeps the bottled path when a bridge-route verdict meets both conditions:
  - its reason is not `user-forced-bridge`;
  - the native-download breadcrumb (`install.steamResumeTargetSteamappsDir`) points at the GameLibSteam bottle's steamapps dir.
- The check runs before the prescreen and notice blocks.
- The breadcrumb is the signal because `markSteamNativeInstallStarted` writes it before the download await and only success clears it. A hard kill leaves no ACF.
- An explicit "Try the bridge anyway" is still honoured.
- Tests:
  - a GameLibSteam breadcrumb reaches the bottled path, with no bridge download or shim placement;
  - a bridge-bottle breadcrumb still routes to the bridge.
  - A mutation check (guard disabled) makes the first test fail.

**Scope note:** An ACF-presence check was tried and dropped. Under this suite's mocks (`existsSync` true, one steamapps dir for every bottle) it fired on 35 unrelated tests. It would also only add coverage for an interrupted bottled-Steam-client dispatch, which is not the case the review names. That case is still not covered.

### WR-09: `findBridgeInstallBottle` and `resolveBridgeBottleName` can disagree

**Files modified:** `src/backend/storeManagers/steam/bottle.ts`, `src/backend/storeManagers/steam/__tests__/bottle.test.ts`
**Commit:** 853cab641
**Status:** fixed: requires human verification (resolver logic)
**Applied fix:**

- `resolveBridgeBottleName` is now `findBridgeInstallBottle(appId) ?? perGameName`. Steps 1-2 require the manifest, so the decision step and the execution steps can no longer disagree. Step 3, a fresh install target, is unchanged.
- This is the second option the review offered.
- `installBridgeGame`'s post-download `resolveBridgeLaunchExe` still lands on the per-game bottle. The depot path writes the ACF on completion (`depot.ts` `writeAppManifest`).
- Two new resolver tests cover the WR-09 state and the fresh-target case.

### WR-11: Route-override writes are fire-and-forget, ignore `{ ok: false }`, and persist before the user confirms

**Files modified:** `src/frontend/screens/Library/components/InstallModal/steamBridgeRouteLine.ts`, `src/frontend/screens/Library/components/InstallModal/__tests__/steamBridgeRouteLine.test.ts`, `src/frontend/screens/Library/components/InstallModal/SteamDialog/index.tsx`, `src/frontend/screens/Game/GamePage/components/SteamBridgeRouteNotice.tsx`
**Commit:** ca89ce4b5
**Status:** fixed: requires human verification (UI behaviour change)
**Applied fix:**

- **Install dialog:**
  - The toggle now only sets local `forceBottlePending`.
  - `proceedInstall` persists it just before the dispatch, through a module-level `persistForceBottleRoute` helper. Keeping the `try` out of the handler preserves `steamDialogSource.test.ts`'s B-WR-04 gate shape.
  - Two new pure functions in `steamBridgeRouteLine.ts`, `resolveForceBottleDisplayed` and `resolveForceBottleWrite`, interpret the pending state (that module's rule (e)).
  - `resolveForceBottleWrite` returns `'unchanged'` for an untouched, flipped-back or hidden toggle. So a stored `'bridge'` override is never deleted, and a cancelled dialog writes nothing.
  - If the write is not recorded (`{ ok: false }` or a throw), the install is not started. The error appears inline, reusing the existing `steam.bridge.routeNotice.error` key, and the submit latch is released.
- **Route notice:** the result of `setSteamBridgeUserRoute` is checked. On `{ ok: false }` the error is shown and the install is not started.
- **New strings:** none. The fallback error token is the kebab-case `route-not-recorded`, which satisfies `hardcodedStringGate`.

**Behaviour change to confirm:** the route line ("Native Steam bridge" / "Bottled Steam client") used to re-probe and update the moment the toggle flipped. It now reflects the persisted verdict until Install, and only the toggle shows the pending choice.

### WR-02: Helper runs `SteamAPI_InitFlat` before entering its accept loop

**Files modified:** `native/steam-bridge/helper/bridge_helper.c`, `src/backend/storeManagers/steam/bridge/helperProcess.ts`, `src/backend/storeManagers/steam/bridge/__tests__/helperProcess.test.ts`, `src/backend/storeManagers/steam/bridge/__tests__/helperIntegration.test.ts`
**Commits:** 977f6d2db, 18a9d0bc3 (quick 261026-k6o). Live gate recorded in ab3e3b264.
**Status:** fixed
**Original issue:** If dlopen plus InitFlat takes longer than about 3 s (cold Steam IPC, Steam mid-update), the per-launch helper is reported `unreachable` and the launch fails with a bridge-setup dialog.
**Applied fix:**

- The helper emits a READY line before `accept()`, and the backend does a bounded 20 s, unref'd wait for it before the HEALTH/WHOAMI poll.
- The false "HEALTH before InitFlat" docs in `bridge_helper.c` and `helperProcess.ts` were corrected, and a READY-after-LISTEN integration assertion was added.
- Live-gate finding (2026-10-26): `SteamAPI_InitFlat` never blocked (under 1 s in every Steam state tested), so the slow path was not observed. The wait stays as a safeguard.
- Todo moved to `.planning/todos/completed/2026-10-25-bridge-helper-inits-steam-before-accept-loop.md`.

### WR-04: The shim's single socket and request id are shared across game threads without a lock

**Files modified:** `meta/gen_vtables.ts`, `native/steam-bridge/generated/steam_api_shim.c`, `meta/__tests__/gen_vtables.test.ts`
**Commits:** 082ff80db introduced the SRWLOCK serializing bridge round trips. e88486bf4 (quick 261026-kyv) pins it with four regression tests. The live multi-threaded gate is recorded in 4d9999c53.
**Status:** fixed
**Original issue:** Concurrent `bridge_transact` calls interleave frames on one stream. A request-id mismatch then closes the socket under another thread. Phase 51's wider served surface makes cross-thread calls more likely.
**Applied fix:**

- Bridge round trips are serialized with an SRWLOCK in the generated shim (082ff80db). The iteration-1 entry proposed a `CRITICAL_SECTION`; the shipped lock is an SRWLOCK.
- Quick 261026-kyv did not add the lock. It added four regression tests in `meta/__tests__/gen_vtables.test.ts`, with mutation proofs.
- Live gate on Abiotic Factor 427410: two bridge threads, 6 real lock waits, 0 failures, 0 request-id mismatches, clean shutdown.
- Todo moved to `.planning/todos/completed/2026-10-25-bridge-shim-socket-shared-across-threads-without-lock.md`.

## Skipped Issues

None (WR-02 and WR-04 were resolved after iteration 1; see Fixed Issues).

## Outstanding

- WR-01, WR-08, WR-09 and WR-11 remain "fixed: requires human verification". No human check has been recorded for any of them. Each now has a pending live check in 51-UAT.md (added 2026-10-26, quick 261026-rb4):
  - WR-01 → 51-UAT item 21: pass 2026-10-26 on the store half (retained top-level `interfaceVersions`, 22 entries, no `@unknown-version`). The already-placed cfg half could not be produced live and stays desk-covered.
  - WR-08 → 51-UAT item 22: pass 2026-10-26 (Legends of Eisenwald 246760: the interrupted GameLibSteam download resumed and completed in GameLibSteam; no bridge bottle was provisioned). The "Try the bridge anyway" exception stays desk-covered.
  - WR-09 → 51-UAT item 23
  - WR-11 → 51-UAT item 24
- The WR-03 behavioural fix: `.planning/todos/pending/2026-10-26-x64-null-object-sret-aware-per-family.md`. It needs a decision (`ready: human`) and then a live Wine gate.

## Out of Scope (Info)

IN-01, IN-02, IN-03, IN-04 and IN-05 are Info findings, outside `fix_scope: critical_warning`. None was touched.

## Verification Run

- `npx prettier --check` on exactly the TS/TSX paths of each commit: clean every time.
- `pnpm codecheck`: exit 0 after every commit.
- jest, steam scope: all 63 `src/backend/storeManagers/steam` suites pass at final HEAD (2433 tests).
- jest, final combined run (steam, `src/backend/sidecar`, `fakeHomeIsolation`, `gen_vtables`, `bridgeCensus`, `shimAbiGate`): 139 of 140 suites pass. The one failure is pre-existing and unrelated: `testContainment.test.ts` Block C lists `steamNativeInstallDefault.test.ts` as unclassified. That test file came from quick-261024-exo (934ae58b8), and no commit in this pass touches either file.
- jest, frontend: `src/frontend` + `src/preload` + `hardcodedStringGate` pass (the gate after the kebab-token change), including `steamDialogSource.test.ts`.
- ESLint on the four WR-11 files: clean.
- Mutation checks: WR-06 (unref and exit hook removed) and WR-08 (guard disabled) each make their new test fail.
- `pnpm gen-vtables` after WR-03: byte-identical generated output.
- `graphify update .` run after the code changes.

---

_Fixed: 2026-10-25_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
_Updated: 2026-10-26_
