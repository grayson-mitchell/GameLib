---
phase: 24-macos-native-steam-bridge-out-of-process-steam-api-proxy
plan: 06
subsystem: infra
tags: [steam, macos, bridge, native-helper, lifecycle, readiness, ipc, tcp, loopback]

# Dependency graph
requires:
  - phase: 24-01
    provides: "meta/gen_vtables.ts + native/steam-bridge/generated/steam_api_shim.c whose ordinal/slot layout protocol.ts's CONTROL frame matches"
  - phase: 24-02
    provides: "protocol.ts's encodeControl/decodeResponse + CONTROL HEALTH/WHOAMI two-state readiness contract, and bridge_helper.c's persistent loopback-only listener this plan spawns/probes"
provides:
  - "src/backend/storeManagers/steam/bridge/helperProcess.ts -- ensureBridgeHelperReady()/shutdownBridgeHelper(), the D-03 shared-helper lifecycle + D-06 observable readiness seam Plan 24-08's bridge routing branch calls"
  - "steamBridgeHelperPath in paths.ts -- the bundled arch-aware helper location Plan 24-07's packaging step writes into"
  - "steamBridgeSetupRequired registered on FrontendMessages (src/common/types/ipc.ts) -- the IPC event type Plan 24-08 fires/consumes for the D-05 fallback dialog"
  - "shutdownBridgeHelper() wired into main.ts's before-quit handler -- app-quit teardown for the long-lived helper"
affects: [24-08-routing-fallback-dialog, 24-10-hardware-uat]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "D-03 shared-helper lifecycle: ONE module-scoped ChildProcess handle, spawn-if-not-running/reuse-if-alive, nulled on exit/error for automatic respawn on the next call"
    - "D-06 observable readiness: bounded CONTROL HEALTH+WHOAMI poll over a single per-attempt loopback connection, returning a 3-state status union (ready/not-inited/unreachable) instead of a boolean"
    - "Since the helper's single InitFlat runs BEFORE its accept loop (D-04, 24-02), once HEALTH first answers ok the WHOAMI answer is already settled for that process's lifetime -- the poll loop only needs to keep retrying while HEALTH itself hasn't answered yet"

key-files:
  created:
    - src/backend/storeManagers/steam/bridge/helperProcess.ts
    - src/backend/storeManagers/steam/bridge/__tests__/helperProcess.test.ts
  modified:
    - src/backend/constants/paths.ts
    - src/common/types/ipc.ts
    - src/backend/main.ts

key-decisions:
  - "Status union is { status: 'ready'|'not-inited'|'unreachable' } rather than the plan interfaces comment's literal suggestion 'needs-spawn' -- 'not-inited' more accurately names the HEALTH-ok-but-WHOAMI-not-ok state (the helper IS already spawned in that state; 'needs-spawn' would misdescribe it). The invalid-appId guard reuses 'unreachable' rather than adding a 4th status, mirroring ensureSteamClientReady's precedent of reusing an existing status value for its guard-rejection branch."
  - "One combined loopback connection per poll attempt serves both CONTROL HEALTH and CONTROL WHOAMI sequentially (write HEALTH, read, then write WHOAMI, read, then close) rather than two separate connections -- reuses the helper's persistent-connection read loop (D-03/24-02) for what it's built for, and halves the Socket bookkeeping per attempt."
  - "The bounded-poll loop returns as soon as the FIRST successful HEALTH answer's WHOAMI check completes (ready or not-inited), rather than exhausting the full attempt budget on a not-inited result -- because D-04 guarantees InitFlat already ran once before the accept loop started, so WHOAMI's answer will not change during our poll window. Only the fully-unreachable path (HEALTH never answers) uses the whole POLL_ATTEMPTS budget. This kept the not-inited test fast without needing fake timers."
  - "POLL_ATTEMPTS=6 / POLL_INTERVAL_MS=250 / PROBE_TIMEOUT_MS=250 (~1.5-3s worst-case budget) chosen as Claude's-discretion tuning -- the poll is really only bounding 'give the freshly-spawned process time to bind its listen socket', not Steam login latency (Steam is already running/signed-in out-of-band before GameLib even starts). Not locked by SPEC/CONTEXT; revisit at 24-10 hardware UAT if real-machine timing needs more headroom."
  - "Tests mock node:child_process.spawn and node:net.Socket directly with small EventEmitter-based fakes (real timers, no fake-timer harness) -- no real process/TCP touched. A test-only __resetBridgeHelperStateForTests() export (mirrors bottle.ts's __stopBottledRaiseLoops convention) resets the D-03 module-scoped handle between tests."

patterns-established:
  - "ensureBridgeHelperReady()'s status-union + ready boolean shape mirrors EnsureSteamClientReadyResult (clientSetup.ts) exactly, so a future caller's `if (!result.ready)` check needs no special-casing"
  - "steamBridgeSetupRequired follows the exact steamBottleSetupRequired/steamClientSetupRequired payload convention ({ appName, reason? }) -- no new event-naming shape introduced"

requirements-completed: [R2, R7]

# Metrics
duration: ~35min
completed: 2026-07-20
---

# Phase 24 Plan 06: macOS Native Steam Bridge -- Shared Helper Lifecycle + Readiness Signal Summary

**`ensureBridgeHelperReady()` lazily spawns and reuses ONE shared, long-lived native bridge helper (D-03) and returns an observable ready/not-inited/unreachable signal by bounded-polling the protocol.ts CONTROL HEALTH+WHOAMI frames (D-06, review finding #7), with `steamBridgeSetupRequired` registered on `FrontendMessages` here (finding #1) and `shutdownBridgeHelper()` wired into `main.ts`'s app-quit path (finding #8) -- 9 new tests green, 787/787 steam-suite tests green, zero regressions.**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-07-20 (after 24-01/24-02 read-in)
- **Completed:** 2026-07-20
- **Tasks:** 3
- **Files modified:** 5 (2 created, 3 modified)

## Accomplishments

- **`paths.ts`** (Task 1): `steamBridgeHelperPath = fixAsarPath(join(publicDir, 'bin', process.arch, 'darwin', 'steam-bridge-helper'))` -- the bundled arch-aware location Plan 24-07's packaging step compiles `bridge_helper.c` into and this plan's `spawnHelperIfNeeded()` spawns from. No `electron-builder.yml` change needed (already covered by `mac.files`/`asarUnpack`).
- **`ipc.ts`** (Task 2, finding #1): `steamBridgeSetupRequired: (payload: { appName: string; reason?: string; fallbackAvailable?: boolean }) => void` added to `FrontendMessages`, alongside the existing `steamBottleSetupRequired`/`steamClientSetupRequired` precedents -- lands in THIS wave so `sendFrontendMessage('steamBridgeSetupRequired', ...)` typechecks here rather than waiting for Plan 24-08.
- **`helperProcess.ts`** (Task 2): the D-03 shared-helper lifecycle (`spawnHelperIfNeeded()` -- module-scoped `ChildProcess`, spawn-if-not-running/reuse-if-alive, nulled on `exit`/`error` for automatic respawn on the next call) and the D-06 readiness seam (`ensureBridgeHelperReady(appId)` -- numeric-appId guard, bounded CONTROL HEALTH+WHOAMI poll over a single per-attempt loopback socket, `shutdownBridgeHelper()` for app-quit teardown). Modeled on `ensureSteamClientReady()`'s status-union shape and `raiseFrontmostBottledProcess`'s bounded-poll/unref'd-timer mechanics.
- **`helperProcess.test.ts`** (Task 2): 9 tests -- non-numeric appId rejected with no spawn; spawn `cwd === dirname(steamBridgeHelperPath)` (finding #4); two calls in a row spawn exactly one helper (D-03); HEALTH ok + WHOAMI ok -> ready; HEALTH ok + WHOAMI not-inited -> `not-inited` (distinct from `unreachable`, finding #7) + `steamBridgeSetupRequired` fired; HEALTH never ok (both an explicit err response and a full timeout variant) -> `unreachable` + `steamBridgeSetupRequired` fired (D-06); `shutdownBridgeHelper()` no-op when never spawned, and kills+clears the handle when spawned.
- **`main.ts`** (Task 3, finding #8): `shutdownBridgeHelper` imported and called from the existing `before-quit` handler (alongside `stopRunningPoll()`) -- no new quit hook introduced.

## Task Commits

Each task was committed atomically:

1. **Task 1: paths.ts -- steamBridgeHelperPath** - `49ceb401` (feat)
2. **Task 2: FrontendMessages IPC type + helperProcess.ts -- shared lifecycle + ensureBridgeHelperReady()** - `dcb8bcc0` (feat)
3. **Task 3: wire shutdownBridgeHelper() into the app-quit lifecycle** - `318fe299` (feat)

## Files Created/Modified

- `src/backend/constants/paths.ts` -- added `steamBridgeHelperPath`.
- `src/common/types/ipc.ts` -- added `steamBridgeSetupRequired` to `FrontendMessages`.
- `src/backend/storeManagers/steam/bridge/helperProcess.ts` -- shared-helper lifecycle + readiness seam (new).
- `src/backend/storeManagers/steam/bridge/__tests__/helperProcess.test.ts` -- 9 tests (new).
- `src/backend/main.ts` -- `shutdownBridgeHelper()` wired into `before-quit`.

## Decisions Made

- **Status-union naming diverged from the plan's `<interfaces>` comment**: used `'ready' | 'not-inited' | 'unreachable'` instead of the suggested `'ready' | 'needs-spawn' | 'unreachable'` -- `'not-inited'` accurately names the HEALTH-ok-but-WHOAMI-not-ok state (the helper is already spawned and healthy in that state; `'needs-spawn'` would misdescribe it as not-yet-spawned). The invalid-appId guard reuses `'unreachable'` rather than adding a 4th status, mirroring `ensureSteamClientReady`'s own precedent of reusing an existing status for its guard-rejection branch. This is a naming refinement within the plan's stated discretion, not a locked-decision deviation -- flagged here for Plan 24-08 to consume the real literal values.
- **One combined connection per poll attempt** serves both CONTROL HEALTH and CONTROL WHOAMI sequentially over the helper's persistent-connection read loop, rather than opening two separate sockets.
- **Early-return once HEALTH first answers**: because `bridge_helper.c`'s single `InitFlat` runs before its accept loop starts (D-04), the WHOAMI answer cannot change during our poll window once HEALTH is up -- so the loop returns immediately on the first successful HEALTH (ready or not-inited) rather than retrying WHOAMI across the whole attempt budget. Only the "HEALTH never answers" path consumes the full `POLL_ATTEMPTS` budget.
- **Poll constants** (`POLL_ATTEMPTS=6`, `POLL_INTERVAL_MS=250`, `PROBE_TIMEOUT_MS=250`) are Claude's-discretion tuning, not locked by SPEC/CONTEXT -- documented as revisitable at 24-10 hardware UAT.

## Deviations from Plan

None (Rule 1-4) -- plan executed as written. The status-literal naming change noted above is a within-discretion refinement of an `<interfaces>` comment, not a functional deviation, and is called out above for downstream-plan traceability rather than filed as a Rule 1-4 fix.

## Issues Encountered

None. All three tasks' automated verify commands passed on the first attempt; `pnpm jest src/backend/storeManagers/steam` (full steam suite, 787 tests / 22 suites) shows zero regressions. The suite's known pre-existing `library.ts:1033` leaked-timer `TypeError` (tracked in project memory `steam-install-slow-start-outcome`) still appears during teardown -- unrelated to this plan's files, does not fail any test.

## Known Stubs

None. `ensureBridgeHelperReady()`/`shutdownBridgeHelper()` are fully functional against the real `bridge_helper.c` wire protocol (24-02) -- nothing in this plan's scope is a placeholder. The bridge routing branch that will actually CALL `ensureBridgeHelperReady()` from `games.ts` is Plan 24-08's scope, not this plan's -- this plan delivers the seam, not its caller.

## Threat Flags

None beyond the plan's own threat register. T-24-06 (spawn only the bundled `steamBridgeHelperPath`, argv-form, no attacker-supplied path), T-24-07 (`NUMERIC_APP_ID` guard before spawn/probe), T-24-10 (bounded poll budget + null-on-exit handle, observable not-ready rather than hanging), and T-24-15 (`shutdownBridgeHelper()` wired into `before-quit`, idempotent no-op) are all mitigated exactly as specified. T-24-02 (unauthenticated loopback probe) remains the accepted residual risk already recorded at 24-02's secure-phase disposition -- this plan's probe is a loopback-only client of that same accepted surface, not a new one.

## User Setup Required

None -- no external service configuration, no package installs (0 new npm dependencies).

## Next Phase Readiness

- **`ensureBridgeHelperReady(appId)` / `shutdownBridgeHelper()` are ready for Plan 24-08's bridge routing branch** to call exactly where `runNativeDepotDownload()` already calls `ensureSteamClientReady()` (24-RESEARCH.md Pattern 4) -- same status-union + `ready` boolean shape, `steamBridgeSetupRequired` already typechecks.
- **`steamBridgeHelperPath` is ready for Plan 24-07's packaging step** to compile `bridge_helper.c` into.
- **Explicitly NOT proven by this plan** (deferred to 24-10 human-HW UAT on the developer's Apple-Silicon Mac): that a REAL spawned `steam-bridge-helper` binary answers CONTROL HEALTH/WHOAMI over the actual loopback port with a live signed-in Mac Steam session. This plan's tests fully exercise the TS-side lifecycle/readiness state machine against mocked `spawn`/`Socket`; the wire itself was already structurally validated in 24-02 (21/21 protocol tests + syntax-clean C). REQ-24-02/REQ-24-06 stay structurally complete with the live end-to-end round-trip gated to 24-10, mirroring 24-01/24-02's runtime-deferral posture.

---
*Phase: 24-macos-native-steam-bridge-out-of-process-steam-api-proxy*
*Completed: 2026-07-20*

## Self-Check: PASSED

- Created/modified files verified present on disk: `src/backend/constants/paths.ts`, `src/common/types/ipc.ts`, `src/backend/storeManagers/steam/bridge/helperProcess.ts`, `src/backend/storeManagers/steam/bridge/__tests__/helperProcess.test.ts`, `src/backend/main.ts`, `.planning/phases/24-macos-native-steam-bridge-out-of-process-steam-api-proxy/24-06-SUMMARY.md` -- all FOUND.
- Commit hashes verified in `git log`: `49ceb401` (Task 1), `dcb8bcc0` (Task 2), `318fe299` (Task 3), `804b9608` (SUMMARY) -- all FOUND.
- Automated verify re-run: `pnpm jest .../helperProcess.test.ts` -> 9/9 pass; `pnpm codecheck` -> clean; `grep steamBridgeSetupRequired src/common/types/ipc.ts` and `grep shutdownBridgeHelper src/backend/main.ts` -> both FOUND; full steam suite (`pnpm jest src/backend/storeManagers/steam`) -> 787/787 pass, 22/22 suites, zero regressions.
