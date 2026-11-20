---
phase: 67-schema-validation-at-the-sidecar-ipc-boundary
plan: 18
subsystem: ipc
tags: [ipc, zod, fail-closed, coverage]
requires: [67-17]
provides: [sidecarInternal schemas, mainProcess/window/testStubs schemas, collidingPushSchemas, exemption-free coverage test, fail-closed validateInbound]
key-files:
  created:
    - src/common/types/ipc/sidecarInternal.ts
    - src/backend/sidecar/__tests__/ipcSchemas/sidecarInternal.test.ts
    - src/backend/sidecar/__tests__/ipcSchemas/mainWindowTestStubs.test.ts
  modified:
    - src/common/types/ipc/mainProcess.ts
    - src/common/types/ipc/window.ts
    - src/common/types/ipc/testStubs.ts
    - src/common/types/ipc/legendary.ts
    - src/common/types/ipc/channelSchemas.ts
    - src/backend/sidecar/ipcValidation.ts
    - src/backend/sidecar/__tests__/ipcValidation.test.ts
    - src/backend/sidecar/__tests__/ipcSchemaCoverage.test.ts
    - src/backend/sidecar/__tests__/sidecarRpcFraming.test.ts
decisions:
  - "Direction-aware keying: channelSchemas stays one map keyed by name for invoke/send, and the two pushes that share a name with an inbound channel (legendary refreshLibrary vs steam invoke; appShell connectivity-changed vs the renderer send) live in collidingPushSchemas, reached through pushSchemaFor(). No exemption list."
  - "validateInbound fails closed with code no_schema; ipcSchemaCoverage guarantees no registered channel can hit it"
  - "storeSet value is z.json() (it crosses the wire as JSON); field policy stays in storePolicy.ts and storeWriteHandlers.ts"
  - "Runner command stubs accept only the serialisable RunnerCommandStub fields (commandParts, stdout, stderr); the Promise-valued response cannot cross JSON"
  - "gamepadAction is z.custom<GamepadActionArgs> (typing-only): it is preload-served and the sidecar registers nothing for it"
metrics:
  completed: 2026-11-08
requirements: [V67-B, V67-D]
---

# Phase 67 Plan 18: Last channels, zero-exemption coverage, fail-closed validator

The ten channels no domain file declared (health, devSweepEpicCookieDomain, trayResolveRunner, sidecar:store-snapshot, sidecar:store-fetch, handleProtocolUrl, shellWindowFocused, storeSet, storeDelete, storeNew) now have schemas in `ipc/sidecarInternal.ts`, and mainProcess, window and testStubs are converted to schema-derived types. The coverage test asserts `toEqual([])` for every bucket with no CEILING table, and `validateInbound` rejects a channel with no schema.

## Commits
- e34e9a0ab sidecarInternal.ts (10 channels)
- 383ff3979 mainProcess, window, testStubs; collidingPushSchemas
- 199c68081 CEILING deleted, fail-closed validator

## Ceiling movement (equality ceiling, until deleted in Task 3)
| Bucket | Before | After Task 1 | After Task 2 | Task 3 |
|--------|--------|--------------|--------------|--------|
| invoke | 8 | 2 (-6) | 0 (-2) | toEqual([]) |
| send | 6 | 2 (-4) | 0 (-2) | toEqual([]) |
| testOnly | 6 | 6 | 0 (-6) | toEqual([]) |
| local | 14 | 14 | 0 (-14) | toEqual([]) |
| push | 1 | 1 | 0 (-1) | toEqual([]) |

## Caller tags and evidence
- shell: health (terminate_veto.rs), trayResolveRunner (tray.rs:1065), sidecar:store-snapshot (relay_commands.rs:209), handleProtocolUrl (main.rs, single_instance.rs), shellWindowFocused (main.rs:1409).
- renderer: devSweepEpicCookieDomain (DevTools via sidecar_invoke), sidecar:store-fetch / storeSet / storeDelete / storeNew (preload tauriTransport.ts), set-connectivity-online, get-connectivity-status, getSignInProbeOutcomes, connectivity-changed (send).
- local: all 10 window channels (preload/api/misc.ts and tauriWindowChrome.ts serve them through Tauri window APIs); createNewWindow (preload/api/helpers.ts opens a WebviewWindow); gamepadAction (tauriGamepadInput.ts, sidecar registers nothing); clearDMFinished and updateAll (no call site anywhere outside tests, so nothing routes them to the sidecar).
- TestSync (6 runner command stubs): testOnly.

## Push name collision (resolved)
`refreshLibrary` and `connectivity-changed` each name both a push and an inbound channel. The inbound map must stay unique by name because the runtime validates by name, so those two pushes are held in `collidingPushSchemas`, with `pushSchemaFor()` as the lookup and a coverage guard that the map holds only genuine collisions (currently exactly those two). Pushes remain typing-only (D-12).

## Mutation proof
Removed `defineChannelEntries('send', mainProcessSyncArgs)` from channelSchemas: ipcSchemaCoverage went red (`bucket send` lists `set-connectivity-online`, and the kind-match test fails). Reverted.

## Deviations from Plan
**1. [Rule 1 - Bug] connectivity-changed duplicate key.** Registering the testStubs send collided with appShell's push of the same name and threw at module load. Resolved with the direction-aware keying above rather than an exemption.

**2. [Rule 1 - Bug] sidecarRpcFraming broke under fail-closed.** Its synthetic `echo` channel had no schema; the suite now mocks channelSchemas with a variadic `echo` entry (it tests framing, not argument shapes).

**3. Coverage-test assertion adjusted.** The plan's "every renderer or shell entry is invoke or send" cannot hold literally because push entries carry the default `renderer` tag; the assertion is on `shell` and `local` entries, with a comment.

## Verification
Full Backend: only known failures (games channel-constants, bottle DRM_LAUNCH_FORM, macArchKnownFixRouting Intel, tauriShellSource `.title(`). Meta minus Wine harness: only genI18nGateScope and logSecretGate (known). Preload 203 and Frontend 5231 green. `pnpm codecheck`, prettier and `pnpm check:ipc-contract` green. No Rust touched.

## Known Stubs
None.

## Threat Flags
None.

## Self-Check: PASSED
