# Phase 85 deferred items

## From 85-01

- `pnpm backend-di-ceilings` fails on three steam bridge test files that plan 85-01 did not touch:
  `src/backend/storeManagers/steam/__tests__/games.test.ts` (47 > baseline 45, jestMock),
  `src/backend/storeManagers/steam/bridge/__tests__/otherSessionPlaying.test.ts` (2, no baseline entry) and
  `src/backend/storeManagers/steam/bridge/__tests__/steamOfflineMode.test.ts` (1, no baseline entry).
  They come from the `wip(debug)` work on the bridged-launch refusal (`fb7f9b243`), not from this phase. Out of scope; whoever owns that work
  should record the counts in a `meta/backendDiCeilings/*.json` shard or drop the `jest.mock` calls.

## From 85-18

- `src/backend/__tests__/tauriShellSource.test.ts` "Phase 85 plan 09: store boot wiring > the ownership file flips only the tracer store"
  fails: it still asserts every family in `storeOwnership.json` is `false` and `stores` is the one tracer override, but 85-12
  (`1d7c3c2aa`) flipped `families.cache` to `true` and removed the override. The assertion was not updated when the cache family
  flipped. Not touched by 85-18 (that plan only changed the arm count and added the two gate channels in the same file); each later
  family flip (85-13..) will move the same assertion, so the owner of the next flip should rewrite it to read the expected flips
  from one place instead of pinning "all false".
  **Resolved by the orchestrator after wave 8:** the pin now asserts the post-85-12 state (cache family on, no per-store
  override). 85-13 onward must move it with each flip.

## From 85-16

- `pnpm find-deadcode` fails on one finding 85-16 did not introduce:
  `new knip finding: exports | meta/harvestStoreCorpus.ts | PASTE_PLACEHOLDER_PREFIX`. It comes from
  `d029be2cf` (`fix(85-02): redact live paste links from the store corpus`, committed by another session
  while 85-16 ran). 85-16 never touched `meta/harvestStoreCorpus.ts`. The owner of that fix should drop the
  export or tag it `@public`.
  **Resolved:** the orchestrator dropped the export; `pnpm find-deadcode` passes.

## From 85-17

- **Load-time rev handshake for a late mirror cell (S1 rule 8, second half), not built.** 85-11 left it to 85-17; the plan's
  tasks and must-haves do not name it, and doing it properly is a protocol change of its own: a cell created after boot would
  send a new `load` frame (a new op in the shared `storeFrameVectors.json`, `validateStoreFrame` and `parse_store_frame`), Rust
  would answer `loaded {rev, valueJson?}` in the ordered event stream (the snapshot only when `rev > 0`), and the cell would drop
  `changed` events until it arrives. Every cell sending a frame at creation also moves the frame counts many store suites pin.
  What exists today: a late cell starts at rev 0 over the file and converges because every op assigns state (the 85-11
  property test runs late cells); between creation and the last in-flight event it can briefly read an older value the file
  already superseded. 85-17 made the event stream strictly ordered (one host queue), which closes the reorder cases, not this
  replay window. Candidate for 85-19 or a follow-up todo.
- `src/backend/sidecar/__tests__/outboundHttpRegistry.test.ts` "does not track or destroy WebSocket upgrade requests" failed
  once in the full `src/backend` run and passes alone (a 353 ms WebSocket upgrade under load). Not touched by 85-17.

## From 85-19

- Two load-only jest flakes in the Task 1 proof at P `d90e33bc8`, neither Phase 85 code (machine load average 13-15 from
  other sessions). Each passed alone and passed in the other full runs:
  - `src/backend/storeManagers/steam/bridge/drm/__tests__/runnerClone.test.ts` "aborts the clone through the abort controller
    and leaves no partial dir" hung to the 900 s test timeout in full run 1 (alone 5/5 green). A hang rather than a slow pass
    suggests the abort can be lost when it lands before the fake `cp` starts listening; worth a look by whoever owns 66.4's
    abort registry.
  - `src/frontend/screens/Login/components/SteamLogin/__tests__/steamLoginPollLifecycle.test.tsx`: 14 failed in full run 2,
    the QR reference markup rendered empty (alone 3/3 green).
- The `outboundHttpRegistry.test.ts` WebSocket flake 85-17 recorded did not recur in any of the three 85-19 full runs.
- `public/changelog.json` now carries the 0.11.0 identity but the 0.8.0 release prose; 0.11.0 notes are owed before a
  release is published.
- CI-only (Task 3): `meta/__tests__/storeCorpus.test.ts` account-name scan collided with the hosted runner's `runner`
  account; fixed in `c06a0c237` (scan off when `GITHUB_ACTIONS=true`). Not deferred, recorded for the trail.

## From 85-25

- Two more load-only jest failures in the D' re-proof full run (`6ef75501d`, load average about 10). Both suites passed alone
  twice, and the D proof's full run at `92495cd50` was fully green. Neither is Phase 85 code:
  - `src/backend/__tests__/diPhaseGates.test.ts` (66.3 specifier scan): ENOENT reading `meta/runTs.__probe__.cjs`, which
    `meta/__tests__/runTsSignals.test.ts` writes and unlinks while the scan walks `meta/`. This is a real cross-suite race: the
    scan should skip files that vanish (or `*.__probe__.*`), or the probe should live in a temp dir.
  - `meta/__tests__/shimAbiGate.test.ts`: `zig cc` killed (exit null), then a spawn failed with errno -88 (EBADMACHO) under load.
- None of the 85-19 flakes (`runnerClone`, `steamLoginPollLifecycle`, `outboundHttpRegistry`) failed in either 85-25 full run.
