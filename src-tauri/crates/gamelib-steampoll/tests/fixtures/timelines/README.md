# Steam poll parity timelines (Phase 80, D-14)

One JSON file per poll scenario. Two drivers consume the same file:

- the TS driver (`src/backend/testUtils/steamPollReplay/tsDriver.ts`) runs the real TS loops
  and writes the frozen stream to `../expected-ts/<name>.json`;
- the Rust replay (`gamelib-steampoll`, plan 17) runs the same file under paused time with a
  recording `PollHost` and is diffed against that frozen stream (plan 19).

Regenerate the frozen streams only on purpose, then review the diff:
`UPDATE_STEAMPOLL_GOLDENS=1 pnpm exec jest src/backend/__tests__/steamPollTsDriver.test.ts`.
A plain run compares and never writes.

All data is synthetic: appId `1000`, title `Test Game`, `/fake/...` paths. No real profile data.

## Timeline

| Field                | Meaning                                                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `name`               | Equals the file name without `.json`.                                                                                     |
| `description`        | One sentence: the branch the scenario proves.                                                                             |
| `machine`            | `install` (also the update poll, via `awaitingUpdate`), `uninstall`, `running`.                                           |
| `platform`           | `darwin`, `win32` or `linux`: the host the code believes it runs on (`isMac` and friends; the `running` machine's probe). |
| `start`              | The exact option object the TS start function takes (below) plus `appId`, `title`, `roots`.                               |
| `store`              | Optional fixtures for the sidecar stores: `metadata` (steamMetadataStore entry), `bridgeAllowlisted`.                     |
| `sidecarReadyAtTick` | Rust replay only: the sidecar becomes READY at this tick. The TS baseline has no outbox, so the TS stream ignores it.     |
| `expectEmptyStream`  | The scenario's point is that nothing is emitted; the TS stream is `[]`.                                                   |
| `ticks`              | The script (below).                                                                                                       |

### `start`

`appId`, `title` (the library entry title), `roots` (`native`: library paths, steamapps dir is
`<lib>/steamapps`; `bottle`: the CrossOver bottle's steamapps dir; `bridge`: the bridge bottle's steamapps dir),
and the `startInstallPolling` / `startUninstallPolling` options: `source` (`native`|`bottle`|`bridge`),
`isNativeHandoff`, `macNativeRoute`, `skippedDepots`, `delegatedToSteamClient`, `adoptedBySteamClient`,
`restoredSteamHold` (`{pids, startTicks}`), `awaitingUpdate` (`{fromBuild, targetBuild?, installAppRetry?}`).
The interval is fixed: 3000 ms per tick (5000 ms for `running`).

### Ticks

A tick is one poll interval. State is cumulative: a field absent from a tick keeps its value from the previous tick.
The first tick's state is applied before the machine starts; every tick then advances the clock by one interval.
Within a tick, the actions (`startAgain`, `cancelDelegated`, `runningHold`, `runningRelease`) run first,
then the clock advances.

| Tick field        | Meaning                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `acf`             | `{[steamappsDir]: record \| null}`. A record is ACF-shaped JSON (`appid`, `installdir`, `stateFlags` number, `sizeOnDisk`, `buildid`, `bytesDownloaded`, `bytesToDownload`, `bytesStaged`, `bytesToStage`, `targetBuildId`, `scheduledAutoUpdate`, `betaKey`); `null` = no manifest. The TS fake answers `find_acf` / `read_acf` from it; the Rust replay writes a real `appmanifest_<appid>.acf` into that dir. |
| `monitor`         | The live download monitor reading `{bytesDone, bytesTotal, speedBytesPerSec?}`, or `null` for none. (The monitor's raw nettop rows and content-log lines are covered by the monitor's own ported tests, plan 06; the poll only sees this reading.)                                                                                                                                                               |
| `running`         | The Steam RunningAppID: a number, or `null` for a missing value (Windows `reg query` fails). Served through the real registry / `reg` / `ps` probes.                                                                                                                                                                                                                                                             |
| `steamPids`       | Result of `listSteamClientPids`: a pid array, or `null` for an inconclusive probe.                                                                                                                                                                                                                                                                                                                               |
| `startTokens`     | Result of `readSteamProcessStartTokens`: `{[pid]: token}`, or `null` for inconclusive.                                                                                                                                                                                                                                                                                                                           |
| `helper`          | The steam-bridge-helper reply `{stdout, code}` (the InstallApp retry). Persists until replaced.                                                                                                                                                                                                                                                                                                                  |
| `lipo`            | The `lipo -archs` reply `{stdout, code}` read by the post-install Mac arch probe.                                                                                                                                                                                                                                                                                                                                |
| `nativeInFlight`  | `gameSession.isNativeInstallInFlight(appId)`, read per tick (suppresses the grace window).                                                                                                                                                                                                                                                                                                                       |
| `ack`             | Rust replay only: `ack` (default) or `timeout` for the state events emitted this tick. The TS baseline has no ack.                                                                                                                                                                                                                                                                                               |
| `bridgeFinalized` | `isBridgeInstallFinalized(appId)`.                                                                                                                                                                                                                                                                                                                                                                               |
| `startAgain`      | A second `startInstallPolling` call (same option object as `start`) before the tick fires: native-handoff upgrade, `adoptedBySteamClient`.                                                                                                                                                                                                                                                                       |
| `cancelDelegated` | `cancelDelegatedInstall(appId)` before the tick fires.                                                                                                                                                                                                                                                                                                                                                           |
| `runningHold`     | `running` machine: take `runningPoll.hold(appId)` before the tick fires.                                                                                                                                                                                                                                                                                                                                         |
| `runningRelease`  | `running` machine: `{appId, terminalSent}`, release the hold taken earlier.                                                                                                                                                                                                                                                                                                                                      |
| `repeat`          | Run-length: this tick is followed by `repeat` identical empty ticks (max-tick scenarios). Both drivers expand it the same way (`expandTicks` in `timeline.ts`).                                                                                                                                                                                                                                                  |

Time is fixed: the clock starts at epoch `1700000000000` ms and only moves by the tick interval, so `Date.now()`-derived values
(probe spacing) are deterministic.

## Stream

The output of a run is a JSON array of records, in emission order. `seq` is process-local and is dropped on both sides.

| Record                                             | Meaning                                                                                                                                                                                                                                                                                                           |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `{frontend: {channel, args}}`                      | A webview message (`gameStatusUpdate`, `progressUpdate`, `steamRequestNotice`). The running poll's playing/done is a `gameStatusUpdate` with `{appName: String(appId), runner:'steam', status}`. `pushGameToLibrary` is not recorded: it is the sidecar's own push, covered by the state record that precedes it. |
| `{notify: {title, body, key?, default?, params?}}` | A system notification. `body` is rendered by a real i18next over `public/locales/en` (ns `translation` + `gamelib`, `defaultNS` translation, `fallbackLng` en); `key`/`default`/`params` come from a spy on `i18next.t`, so the Rust side can compare the key and parameters as well as the English text.         |
| `{state: {kind, appId, ...}}`                      | A sidecar-state event, field names as in `events.rs` (`StateEvent`).                                                                                                                                                                                                                                              |
| `{file: {op, appId, record}}`                      | A restart-hold record write (`op: "record"`, `record` set) or removal (`op: "clear"`, `record: null`); the same shape as `RecordingHost`'s `HoldSink` output. Relative identifiers only, no paths.                                                                                                                |

### Normalisation of TS sidecar-state touches into `state` records

| TS call                                                                 | Record                                                                                                                                                                              |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `libraryState.library.set` with `is_installed: true` (install machine)  | `installed` `{appId, source, installPath, sizeOnDisk, buildid}`. `source` is the poll's current source; `sizeOnDisk` and `buildid` are the ACF's (`buildid` is `null` when absent). |
| `markSteamInstallIncomplete`                                            | `installIncomplete` `{appId}`                                                                                                                                                       |
| `invalidateSteamUpdateState`                                            | `updateDone` `{appId, completed}`; `completed` is true when the poll goes on to report `updating` then `done` (the pushing completion), false for the quiet end.                    |
| `libraryState.library.set` (uninstall machine)                          | `uninstalled` `{appId, source, survivor}`; `source` is the removed copy's root, `survivor` is `{source, installPath, sizeOnDisk, buildid}` or `null`.                               |
| `clearForcedWindowsViaBottle` (bottle / bridge source confirmed absent) | `forcedWindowsViaBottleCleared` `{appId}`                                                                                                                                           |
| `verifyMacArchGroundTruth` (macOS native install completed)             | `macArchVerdict` `{appId, verdict}` (`"32"` or `"64"`), from the tick's `lipo` reply; nothing when the probe is inconclusive.                                                       |
| restart-hold store `set` / `delete`                                     | `file` record `record` / `clear`                                                                                                                                                    |
| `markBridgeGameUninstalled`                                             | Not produced by any poll in TS (it is called from the bridge uninstall, outside the poll); `bridgeUninstalled` has no timeline.                                                     |
| `rearmSettled`                                                          | Rust-only event; no timeline produces it since Phase 81 D-11 removed the boot re-arm.                                                                                               |

### Known TS baseline limits

The TS loops have no outbox, ack or sidecar-readiness gate, so the `sidecar-not-ready-latest-wins` and
`ack-timeout-emits-anyway` timelines freeze the transport-free behaviour (a plain install completion); the
Rust side's queueing and 5 s ack wait are explained differences (DV-80-nn in `80-PARITY.md`), not diffs to eliminate.
`clearForcedWindowsViaBottle` in TS only writes when the stored verdict is set; the baseline records the call
unconditionally (the Rust event is emitted unconditionally on a confirmed-absent bottle or bridge tick).
