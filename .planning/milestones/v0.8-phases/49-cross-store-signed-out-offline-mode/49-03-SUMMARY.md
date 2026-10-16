---
phase: 49-cross-store-signed-out-offline-mode
plan: 03
subsystem: auth
tags: [electron-store, storePolicy, sidecar, callRunner, legendary, offline-mode]

requires: []
provides:
  - "legendaryConfigStore (backend + frontend, cwd legendary_store), registered and boot-hydrated"
  - "Allow-listed persisted `expired` keys on legendaryConfigStore, gogConfigStore and nileConfigStore"
  - "CallRunnerOptions.skipErrorHandler: probes can capture a failing runner's output with no modal"
  - "resolveEpicOfflineMode + a single prepareLaunch read: an expired Epic store launches --offline for canRunOffline games"
affects: [49-04, 49-05, 49-06, 49-07, 49-08, 49-09, 49-10, 49-11, 49-12]

actuals:
  tokens: 3700
  tasks: 3
  commits: 6

plan_head_before: 6cbbebcd0f94c9eaad7704339ba47ea9183d24e6
plan_head_after: 67dd883a0f5bf5a6d85adc22940135520eae4dfc

tech-stack:
  added: []
  patterns:
    - "Per-store persisted boolean verdict (`expired`) mirroring steamConfigStore.credentialsMissing; no single signInStateStore (D-05)"
    - "Pure launch-decision function (resolveEpicOfflineMode) with a comment-stripped source gate pinning where the flag may be read"

key-files:
  created:
    - src/backend/storeManagers/legendary/epicOfflineMode.ts
    - src/backend/storeManagers/legendary/__tests__/epicOfflineMode.test.ts
  modified:
    - src/common/types/electron_store.ts
    - src/backend/storeManagers/legendary/electronStores.ts
    - src/backend/sidecar/storeRegistration.ts
    - src/backend/sidecar/__tests__/storeLayer.test.ts
    - src/frontend/helpers/electronStores.ts
    - src/common/types/storePolicy.ts
    - src/common/types/__tests__/storePolicy.test.ts
    - src/common/types.ts
    - src/backend/launcher.ts
    - src/backend/__tests__/launcher_callRunner.test.ts

key-decisions:
  - "legendaryConfigStore is exported under that name, never `configStore`, because legendary/user.ts already imports the global configStore; its legendary_store dir is distinct from legendaryConfigPath so legendary can never see or delete it."
  - "`expired` is NOT added to WRITE_DENIED_FIELDS: it follows the humbleConfigStore.expired / steamConfigStore.credentialsMissing precedent (renderer-writable, UI-only impact; T-49-06 and T-49-08 accepted)."
  - "resolveEpicOfflineMode can only enable offline mode and never returns a blocking value; the launch-time credentials modal in backend/utils.ts stays the fallback for games that cannot run offline."

patterns-established:
  - "afterSpawn test helper: wait for callRunner's own stderr 'data' listener rather than process.nextTick before emitting on a faked child"

requirements-completed: [R1, R2, R8]

coverage:
  - id: D1
    description: "Three persisted `expired` keys plus legendaryConfigStore, allow-listed, registered on both sides and boot-hydrated"
    requirement: R1
    verification:
      - kind: unit
        ref: "src/common/types/__tests__/storePolicy.test.ts (legendaryConfigStore/gogConfigStore/nileConfigStore .expired cases, partition and totality tests)"
        status: pass
      - kind: integration
        ref: "src/backend/sidecar/__tests__/storeLayer.test.ts (legendaryConfigStore resolves via getRegisteredStore, boot-set snapshot)"
        status: pass
    human_judgment: false
  - id: D2
    description: "CallRunnerOptions.skipErrorHandler suppresses errorHandler at both call sites while onOutput still receives every chunk"
    requirement: R2
    verification:
      - kind: unit
        ref: "src/backend/__tests__/launcher_callRunner.test.ts (Tests 1-4 under 'callRunner skipErrorHandler')"
        status: pass
    human_judgment: false
  - id: D3
    description: "Epic launches --offline under an expired store for canRunOffline games, read once in prepareLaunch, no other store or launch gate touched"
    requirement: R8
    verification:
      - kind: unit
        ref: "src/backend/storeManagers/legendary/__tests__/epicOfflineMode.test.ts (Tests 1-6c)"
        status: pass
    human_judgment: false

duration: ~25min (approximate; the start epoch does not persist across shells)
completed: 2026-10-09
status: complete
---

# Phase 49 Plan 03: Persisted sign-in state and runner plumbing Summary

**Per-store `expired` keys (Epic via a new `legendaryConfigStore`, GOG, Amazon) allow-listed and boot-hydrated, a `callRunner` `skipErrorHandler` option for modal-free probes, and an `--offline` Epic launch under an expired store via a pure `resolveEpicOfflineMode` read once in `prepareLaunch`.**

## Performance

- **Duration:** ~25 min (approximate)
- **Completed:** 2026-10-09T10:41Z
- **Tasks:** 3
- **Files modified:** 12 (2 created, 10 modified)

## Accomplishments

- `legendaryConfigStore` exists on both sides (`cwd: 'legendary_store'`), is in the sidecar `touched` registration and in `BOOT_SET_STORES`, and round-trips in `storeLayer.test.ts`.
- `expired` is allow-listed for legendary, gog and nile with one test case each. The secret neighbours (`gogConfigStore.credentials`) remain denied, and `WRITE_DENIED_FIELDS` is unchanged.
- `skipErrorHandler` guards both `errorHandler` call sites in `callRunner`. Logging, abort classification, the in-flight join and the `ExecResult` shape are untouched.
- `prepareLaunch` reads `legendaryConfigStore.get_nodefault('expired')` once and routes it through `resolveEpicOfflineMode`. A comment-stripped source gate pins that read to exactly one site inside `prepareLaunch`, proves it catches a second read outside it, and proves no per-store `games.ts` touches the sign-in state.

## Task Commits

1. **Task 1: legendaryConfigStore and the three `expired` keys** - `41b507c12` (feat)
2. **Task 2: callRunner `skipErrorHandler`** - RED `61592cdfc` (test), GREEN `184561c18` (feat), spy typing fix `125ada217` (test)
3. **Task 3: Epic offline under an expired store** - RED `51193bf8c` (test), GREEN `67dd883a0` (feat)

**Plan metadata:** committed with this SUMMARY (docs: complete plan).

## Files Created/Modified

- `src/common/types/electron_store.ts` - `expired?` on gog/nile, new `legendaryConfigStore` shape, with the 260822-vov "proven failure only" comment
- `src/backend/storeManagers/legendary/electronStores.ts` - exports `legendaryConfigStore`
- `src/backend/sidecar/storeRegistration.ts` - registers it (22 stores). No timer, watcher, socket or child handle, so the sidecar exit contract is unaffected.
- `src/frontend/helpers/electronStores.ts` - frontend `legendaryConfigStore`
- `src/common/types/storePolicy.ts` - allow-list entries, `BOOT_SET_STORES` membership, header count 22
- `src/common/types.ts`, `src/backend/launcher.ts` - `skipErrorHandler` option and guards, and the `prepareLaunch` wiring
- `src/backend/storeManagers/legendary/epicOfflineMode.ts` - the pure rule (its only import is the `Runner` type)
- Tests: `storePolicy.test.ts`, `storeLayer.test.ts`, `launcher_callRunner.test.ts`, `epicOfflineMode.test.ts`

## Decisions Made

See `key-decisions` above. All follow the plan as written.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] RED test helper replaced `process.nextTick` with a listener-gated emit**
- **Found during:** Task 2
- **Issue:** `callRunner` awaits async work (the PowerShell lookup) before it spawns. On this Windows box the first call in a process runs `searchForExecutableOnPath` through the mocked `spawn`, so a `nextTick` emit raced the listener attach and the test timed out.
- **Fix:** The new tests emit via an `afterSpawn` helper that waits for callRunner's own stderr `data` listener.
- **Files modified:** `src/backend/__tests__/launcher_callRunner.test.ts`
- **Verification:** RED evidence was re-taken over the whole file after the helper change (`RED_EVIDENCE_OK`, three assertion failures on `errorHandler` call counts).
- **Committed in:** `61592cdfc`

**2. [Rule 1 - Bug] `errorHandler` spy was mistyped**
- **Found during:** Task 2 (`pnpm codecheck`)
- **Issue:** `mockImplementation(() => undefined)` is not assignable to `errorHandler`'s `Promise<void>` return.
- **Fix:** `mockResolvedValue(undefined)`.
- **Committed in:** `125ada217`

---

**Total deviations:** 2 auto-fixed (1 Rule 3, 1 Rule 1)
**Impact on plan:** None on scope. Both are test-harness corrections.

## TDD Gate Compliance

- Task 2: `test(49-03)` `61592cdfc` precedes `feat(49-03)` `184561c18`. RED evidence verified with `gsd check tdd-red-evidence` (`RED_EVIDENCE_OK`). The jest run was converted to TAP because the classifier only parses TAP or Surefire output.
- Task 3: `test(49-03)` `51193bf8c` precedes `feat(49-03)` `67dd883a0`. The RED commit carries a deliberately incomplete stub of `resolveEpicOfflineMode`, so Test 1 and the launcher-read gate fail on assertions rather than on a missing module (`RED_EVIDENCE_OK`).

## Issues Encountered

- **Pre-existing Windows failure, out of scope:** `launcher_callRunner.test.ts` "resolves as success ... clean code=0 exit" times out (5s). Reproduced against an unmodified copy of the file from HEAD. It is the first `callRunner` call in the process and hangs on the faked `where powershell` child. This is the known Windows-local baseline, and CI is ubuntu-only.
- Run in isolation with `-t`, any of the new `callRunner` tests hits the same first-call hang on Windows. They pass when the whole file runs, which is how the plan's verify command runs them.
- `pnpm lint`: 0 errors, 638 warnings, both ceilings PASS.

## Known Stubs

None. The Task 3 RED stub was replaced in the GREEN commit.

## Threat Flags

None. No new network endpoint, auth path or trust boundary beyond the plan's threat model (T-49-05 to T-49-08).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plans that write the flags, spawn through `skipErrorHandler`, or read the Library notice's synchronous `legendaryConfigStore.expired` can now build on all of it. 49-05 and 49-08 owe the T-49-07 source gate (`skipErrorHandler: true` only inside `src/backend/signInProbe/**` and `GOGUser.getCredentialsWithVerdict`). `graphify update .` was run after the last task commit; `graphify-out` is untracked and nothing needed staging.

## Self-Check: PASSED

- Created files exist: `epicOfflineMode.ts`, `epicOfflineMode.test.ts`.
- Task commits exist: `41b507c12`, `61592cdfc`, `184561c18`, `125ada217`, `51193bf8c`, `67dd883a0`.
- Acceptance criteria re-checked: `legendaryConfigStore: ['expired']` appears once; `'legendaryConfigStore'` is in `BOOT_SET_STORES`; `export const configStore` count in legendary `electronStores.ts` is 0; `WRITE_DENIED_FIELDS` untouched; `skipErrorHandler` appears twice in `launcher.ts` code and `errorHandler(` twice; `utils.ts` untouched; `epicOfflineMode.ts` imports only the `Runner` type.
- Plan verification: `storePolicy` 55/55 pass; `storeLayer` and `epicOfflineMode` suites pass; `launcher_callRunner` 13/14 (the 1 failure is the pre-existing baseline above); `pnpm codecheck` clean; scoped prettier clean.
