# Phase 65: Steam store manager decomposition, continued - Research

**Researched:** 2026-11-07
**Domain:** Pure-refactor decomposition of 10 oversized TypeScript files under `src/backend/storeManagers/steam/`, a shrink-only line gate, and SteamGame lift-stub removal
**Confidence:** HIGH on measurements, cluster maps, importer fan-out and gate design (all re-measured today with the TypeScript compiler API and grep). MEDIUM on proposed file sizes (estimates; Phase 62's own estimates ran 10-25% high). LOW on the `user.ts` cut (class with 14 shared private statics; needs a decision, see Open Questions).

<user_constraints>

## User Constraints (from CONTEXT.md, copied verbatim)

### Locked Decisions

### Scope and done-line

- **D-01: The scope is a line ceiling, not a fixed file list.** Every non-generated source file
  under `src/backend/storeManagers/steam/` must end the phase under **1,000 lines**. This pulls
  in `gameInstall.ts`, `user.ts`, `games.ts` and `gameBridgeLaunch.ts` alongside the roadmap's
  six. Generated files (`*.generated.ts`) are excluded.
- **D-02: Make the ceiling a lasting CI gate.** Add a meta script (or test) that fails when a
  non-generated `steam/` source file is over 1,000 lines. It starts with a per-file allowlist
  holding today's counts. The allowlist only shrinks (Phase 62 D-14 style, and like
  `meta/knipRatchet.cjs`), and the phase ends with it empty. Wire it into `lint.yml` next to
  `pnpm boundaries`.
- **D-03: Split tests together with their source.** When a module is extracted, its tests move to
  that module's own test file in the same pure-move commit, and the `jest.mock` paths are
  repointed to the owning module (Phase 62 D-05). Test files are exempt from the line gate.
- **D-04: Aim for about 800 lines per piece.** The gate stays at 1,000, but each split should
  leave roughly 20% headroom so normal feature work doesn't push a file straight back over.
  This is a target, not a hard rule.

### library.ts

- **D-05: `library.ts` becomes `steam/library/` with `steam/library/index.ts` as the public
  entry**, the same pattern as 62's `depot/` (62 D-08). Code outside the directory imports
  `steam/library`, and submodules import their siblings directly. Repoint any existing back-edge
  into the parent so it doesn't become an index cycle.
- **D-06: Extract all seven real clusters.** The roadmap guessed "owned-apps fetch / ACF-VDF scan
  / metadata-artwork enrichment". **Those guesses are wrong**: `library.ts` does no owned-apps
  fetch and no metadata work. The real clusters are:
  1. install-root resolution and resume breadcrumbs (~L116–780)
  2. the `SteamLibraryManager` class (~L780–1772)
  3. installed-map and ACF state, plus install-copy enumeration and removal (~L1772–2744, minus
     cluster 4)
  4. Mac architecture ground truth and i386 recovery (~L1908–2103)
  5. the restart-Steam hold and install polling (~L2744–3850). At about 1,100 lines this needs
     one more cut, between the restart-hold helpers and the poll and start/stop functions.
  6. uninstall polling (~L3853–4151)
  7. running-app polling (~L4170–4400)

  The planner confirms the cut lines with a cluster map before writing any plan.

- **D-07: Move `refresh()` out of the class into free functions, with no delegating stubs.**
  The ~470-line `refresh()` and its helpers become free functions in their own module. The
  class method calls them directly, and the class keeps no stub that exists only so tests can
  spy on it. This is a mechanical lift, not a pure move, so it gets its own commit separate from
  the pure moves (D-06 discipline). Tests that spy on the class prototype get restructured.

### Bridge and DRM files

- **D-08: Pieces go in sibling files in the same directory**, for example
  `bridge/shimFingerprint.ts` next to `bridge/shimGenerate.ts` and
  `bridge/drm/runnerEntitlements.ts` next to `runnerClone.ts`. No new subdirectories or
  `index.ts` files for these four. Importers are repointed per 62 D-05. The seams the scout
  saw:
  - **`shimGenerate.ts`:** fingerprint/backup/restore of originals; DRM wrapper detection;
    placement.
  - **`helperProcess.ts`:** spawn and readiness probing; connection registry and shutdown.
  - **`runnerClone.ts`:** CrossOver detection and version; entitlements and re-signing;
    verification; clone/build.
  - **`stageDrmBottle.ts`:** registry commands; restore and TCP-artifact cleanup; bottle process
    listing; staging.
- **D-09: Split `stageDrmBottle.ts` (1,005) on a real seam.** Move out its registry-command
  cluster or its process-listing cluster so it ends well under the ceiling. Don't trim it just
  enough to land at 995.
- **D-10: One module owns each piece of mutable module state.** Each state, its
  `__set…ForTests` / `__reset…ForTests` seams, and its `unref()` / exit-teardown hook stay
  together in one module. Other pieces call into that module and never keep their own copy.
  This covers `helperProcess.ts`'s helper registry and `installExitTeardownOnce`, and the
  library pollers' timers and in-flight state. It protects the sidecar exit contract
  (`Skill("gamelib-conventions")`).

### Sequencing and proof

- **D-11: Execution starts after Phase 61 closes**, including 61's live UAT. Planning can happen
  now. None of 61's 5 remaining plans (61-21..25) touch the files in scope, but both phases
  touch the area the smoke runs exercise. Waiting means a regression found in 65's smoke runs
  can only come from 65.
- **D-12: Order: gate → library → bottle → rest → bridge/DRM → stubs.**
  1. The ceiling gate (D-02) with today's allowlist, so each later plan shows its delta.
  2. `library.ts` (D-05..D-07).
  3. `bottle.ts`. The roadmap suggested doing it first to shrink 61's diff, but 61's extraction
     is already done (D-19), so it no longer needs to lead.
  4. `gameInstall.ts`, `user.ts`, `games.ts` and `gameBridgeLaunch.ts`.
  5. The bridge and DRM files (D-08..D-10).
  6. The lift-stub cluster conversions (folded todo, below).
- **D-13: A pure-move commit may lower or delete its own allowlist entry in the same commit**
  (62 D-14 style). The dependency-cruiser rules from Phase 62 stay at zero (`pnpm boundaries`).
  Never loosen the depcruise config or raise an allowlist entry to make a move pass.
- **D-14: Two live macOS smoke runs, as in 62 D-17.** One runs after steps 2–3 (library and
  bottle), one at the end. Both use `pnpm tauri:dev`, restarted so the sidecar is rebuilt.
  Each run:
  - launches one bridged Steam title and one DRM-mode title (Grim Dawn, 219990)
  - installs a small Steam game, to exercise install polling and the restart-Steam hold
  - uninstalls it, to exercise uninstall polling
  - confirms that Library refresh and the running indicator work.

  A green suite alone does not prove this phase.

### Carried forward from Phase 62 (still binding)

- No façade and no re-exports from the old path. Every importer and `jest.mock` targets the
  owning module (62 D-05).
- Pure moves go in their own commits: a move plus import-path edits only. Renames, dedupes and
  dead code go to todos or to a separate commit (62 D-06).

### Claude's Discretion

- The exact module names and cut lines inside each file, within D-04..D-10.
- How `bottle.ts`, `gameInstall.ts`, `user.ts`, `games.ts` and `gameBridgeLaunch.ts` are cut.
  These weren't discussed in detail: build a cluster map, and use sibling files or a directory
  following the D-05 vs D-08 reasoning (a directory only where there are about 4 or more
  pieces).
- Whether the line gate is a standalone `meta/*.cjs` script or a jest test, and how it counts
  lines (physical lines are fine), provided it meets D-02.
- Plan granularity and waves.

### Folded Todos

- **`2026-11-07-remove-steamgame-lift-stubs.md`: remove the SteamGame lift stubs and spy on the
  free functions.** `games.ts` has about 40 class stubs and about 30 non-test `game.x()` call
  sites to convert to `x(game)`. `games.test.ts` has 6 `SteamGame.prototype` spies to
  restructure; `fetchMetadataIfNeeded` is a real method, not a stub. Module-export spies do not
  intercept intra-module calls under ts-jest. Convert one cluster at a time (install, launch,
  eligibility, …) and keep the suite green after each. This is step 6 of D-12, and D-07
  applies the same no-stub stance to the library class.
- **`2026-11-07-games-ts-further-split-below-1400-lines.md`: close as met.** `games.ts` measures
  1,351 lines, under the 1,400 target. Move it to `completed/` with that measurement. Note that
  `games.ts` is still over D-01's 1,000 ceiling, so it gets split anyway in step 4.

### Deferred Ideas (OUT OF SCOPE)

- Rule out applying the line gate to all of `src/backend`. The ceiling covers
  `storeManagers/steam/` only. A backend-wide allowlist was offered and not chosen; it could be
  a later phase.
- Renames, dedupes and dead code found during the moves go to todos (62 D-06), not into this
  phase's move commits.

### Reviewed Todos (not folded)

These 16 matched by keyword only and don't overlap a decomposition phase: Cat Quest
shim-withheld init, the packaged-app blank render (already fixed), x86 shim modern-SDK parity,
optionaldlc depot selection, protonfixes import, the winebus PowerA wedge, the source-port
runtime route, native Steam delete, the restart-hold robustness discussion, Epic offline
launch, launch-notice theming, the unsigned Windows releases, the Amazon store-exit refresh,
the downloads history, the Humble toast overlap, and the noUncheckedIndexedAccess buckets.
The restart-hold discussion todo touches code that D-06 cluster 5 moves; it's a behaviour
change, so it stays out of this phase.

</user_constraints>

<phase_requirements>

## Phase Requirements

No requirement IDs exist for this phase (roadmap TBD). The requirement set is CONTEXT decisions D-01..D-14.

| ID             | Description                                                                 | Research Support                                                      |
| -------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| D-01/D-02/D-13 | 1,000-line ceiling + shrink-only gate in CI                                 | "Line gate design" section                                            |
| D-03           | Tests split with source, `jest.mock` repointed                              | "Test inventory" per file, "Spy behaviour changes"                    |
| D-04           | ~800 lines per piece                                                        | Proposed module tables (est. sizes include imports)                   |
| D-05/D-06/D-07 | `library/` directory, 7 clusters, `refresh()` lift                          | "library.ts" section                                                  |
| D-08/D-09/D-10 | Bridge/DRM sibling files, stageDrmBottle split, one owner per mutable state | "bridge/\*" sections, "State inventory"                               |
| D-11/D-12/D-14 | Sequencing and live smoke                                                   | "Sequencing", "Validation Architecture"                               |
| Folded todo    | Remove SteamGame lift stubs                                                 | "games.ts + lift stubs" section (**premise partly wrong**, see there) |

</phase_requirements>

## Summary

All ten files in CONTEXT's table were re-measured with `wc -l` (newline count, which is what CONTEXT used): the counts are unchanged (library 4,400, bottle 2,275, gameInstall 1,971, user 1,562, shimGenerate 1,479, games 1,351, runnerClone 1,228, gameBridgeLaunch 1,183, helperProcess 1,143, stageDrmBottle 1,005). **No other non-generated, non-test file under `steam/` is at or over 1,000.** Nearest neighbours: `depot/downloadFiles.ts` 996 (4 lines of headroom, not in scope but the gate will show it), `depot/download.ts` 939, `gameLaunch.ts` 935, `depot/decompress.ts` 934, `depot/decompressPool.ts` 922, `macSteamOffline.ts` 906. The only non-`.ts` code file is `depot/lzmaNativeResolvedPaths.generated.cjs` (generated, excluded by name).

Eight of the ten files are sequences of top-level functions with clean, mostly acyclic seams, so they are real pure moves. Two are not: **`user.ts` is one 1,417-line static class (`SteamUser`) with 14 shared `private static` fields**, and **`library.ts`'s three polling clusters share one `activePolls` Map plus a hold-state pair that make a naive cut cyclic**. Both need the state-leaf pattern below. CONTEXT D-06's seven cluster boundaries are confirmed, with corrections: the class is 885 lines (L877-1761), `refresh()` is only 94 lines and `syncOwnedLibrary()` 375 (together the "~470"), `rearmPersistedSteamRestartHolds` (L772-875) sits inside cluster 1 but belongs with cluster 5/resume, and cluster 5 needs _two_ cuts (hold helpers / poll-once / start-stop) not one.

Two findings change the folded lift-stub todo: (1) of SteamGame's 25 one-line delegating members, **9 are `Game` interface methods that must remain as thin methods** (`install, isNative, addShortcuts, removeShortcuts, launch, moveInstall, repair, syncSaves, uninstall`; `common/types/game_manager.ts:48`), leaving **16 removable internal stubs**; (2) only **~16 internal `x(game)` call sites** exist (not ~30), because the other ~14 `game.x()` sites are interface calls. Removing the 16 stubs saves ~329 lines; `games.ts` lands at ~1,022 without further cuts, so it still needs a real cut to clear the ceiling at D-12 step 4.

**Primary recommendation:** Build the gate first (D-12 step 1) as `meta/steamLineCeiling.cjs` with an equality-ceiling JSON allowlist modelled on `indexedAccessRatchet.cjs`. Then cut leaf-first, one module per commit, moving tests and knip-baseline lines in the same commit. Move state into leaf modules _before_ the code that reads it. Treat every `jest.mock`/`jest.spyOn(libraryModule, ...)` repoint as part of the move commit.

## Architectural Responsibility Map

| Capability                      | Primary Tier                                | Secondary Tier                             | Rationale                                                                                              |
| ------------------------------- | ------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| All ten files and the line gate | API / Backend (Node sidecar, `src/backend`) | CI (`meta/`, `.github/workflows/lint.yml`) | Nothing in this phase touches frontend, Rust shell or IPC contracts. Gate is a build-time meta script. |
| Live smoke (D-14)               | Rust/Tauri shell + sidecar                  | —                                          | Exercises sidecar rebuilt via `pnpm tauri:dev` (memory: dev does not rebuild the sidecar; restart it). |

## Standard Stack

No new runtime packages. Tooling already in the repo:

| Tool                                   | Version                    | Purpose                                                                      |
| -------------------------------------- | -------------------------- | ---------------------------------------------------------------------------- |
| `typescript`                           | repo-pinned (compiler API) | Cluster maps; the line gate itself needs only `node:fs`/`node:path`          |
| `jest` + `ts-jest`                     | 29.x / 29.3.x              | Backend suites (`projects`: Backend, Common, Frontend, Preload, Meta, relay) |
| `dependency-cruiser`                   | repo-pinned                | `pnpm boundaries` (1.7 s, green today: 1025 modules, 0 violations)           |
| `knip` 6.42.1 + `meta/knipRatchet.cjs` | —                          | `pnpm find-deadcode` identity ratchet                                        |

**Package Legitimacy Audit:** Not required. This phase installs no external packages. slopcheck not run. **Packages removed: none. Packages flagged: none.**

**Environment Availability:** Node, pnpm, jest and depcruise ran in this session (baselines below). Live smoke needs macOS + CrossOver + Steam (operator's machine; D-14). No other external dependency.

## Measured Cluster Maps

Line ranges are 1-based and include leading comments. "Est." = ranges + imports/header, rounded; add 10-25% (62's estimates ran high in 62-06/07/08). Call-edge claims come from a TypeScript-AST reference scan, not grep.

### 1. `steam/library.ts` (4,400) -> `steam/library/` (D-05..D-07)

Top-level layout: L1-97 imports (~96), L98-875 helpers, L877-1761 class, L1763-4400 functions.

**Mutable module state** (no `__set/__reset...ForTests` seams exist in this file; none needed):

| State                                                      | L         | Used by                                                                                                                                                                                                      | Timer / unref                                |
| ---------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------- |
| `bridgeInstallFinalized` Set + mark/clear/is (3 exports)   | 2105-2115 | pollInstallOnce; gameInstall (mark/clear)                                                                                                                                                                    | —                                            |
| `activePolls` Map (value holds `timer`)                    | 2117      | pollInstallOnce, startInstallPolling, stop/isDelegated/cancelDelegated, hold helpers (`isHoldingForSteamRestart`, `shouldHoldForSteamRestart`), `rearmPersisted...`, class (`activePolls.has` at ~1746, 805) | `setInterval` L3562, `timer.unref?.()` L3718 |
| `pendingSteamHoldRearm` Set, `let reconcileRanDuringRearm` | 2772-2776 | `isHoldingForSteamRestart` (reads+writes), `rearmPersistedSteamRestartHolds` (writes), class L906 (reads+resets)                                                                                             | —                                            |
| `let steamRequestNoticeSeq` + `nextSteamRequestNoticeSeq`  | 3770-3774 | install start, uninstall start, gameUninstall.ts                                                                                                                                                             | —                                            |
| `activeUninstallPolls` Map                                 | 3809      | uninstall pollers                                                                                                                                                                                            | `setInterval` L4071, `unref` L4139           |
| `let runningPollTimer`, `let lastKnownRunningAppId`        | 4216-4222 | running poll fns                                                                                                                                                                                             | `setInterval` L4376, `unref` L4382           |

**Proposed modules** (names are recommendations; planner may merge, never cross a back-edge):

| Module (`steam/library/`)       | Contents (current L)                                                                                                                                                                                                                                                                                                                                                     | Est. | Cycle-safe imports                                                                     |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- | -------------------------------------------------------------------------------------- |
| `installRoot.ts`                | `AcfSource`, `COPY_SOURCE_FALLBACK`, `copySourceLabel`, `PollOptions`, `getBottleSteamappsRoot`, `getBridgeBottleSteamappsRoot`, `hostInstallPlatform`, `installPlatformForSource`, `isPathContainedIn`, `resolveInstallRoot`, `isBridgeAuthoritativeForInstallState` (98-322)                                                                                           | ~250 | leaf (type `AcfSource` imported by nearly every other module)                          |
| `resumeBreadcrumbs.ts`          | `markSteamInstallIncomplete`, `markSteamNativeInstallStarted`, `clearSteamResumeBreadcrumb`, `getSteamResumeBreadcrumbAppIds`, `breadcrumbAppIsFullyInstalledOnDisk` (598-770)                                                                                                                                                                                           | ~210 | `installedMap`                                                                         |
| `installedMap.ts`               | `isFullyInstalledStateFlags`, `buildInstalledMap`, `buildIncompleteInstallSet`, `buildBottleInstalledMap`, `buildBridgeInstalledMap` (1763-1890, 2609-2736)                                                                                                                                                                                                              | ~290 | `installRoot`                                                                          |
| `acfState.ts`                   | `readAcfState`, `findOtherManifestsWithInstalldir`, `SteamInstallCopy`, `ALL_ACF_SOURCES`, `enumerateSteamInstallCopies`, `RemoveCopyResult`, `removeSteamInstallCopy`, `scanDownloadingAppIds` (2244-2607, 4162-4214)                                                                                                                                                   | ~430 | `installRoot`, `installedMap`                                                          |
| `macArch.ts` (cluster 4)        | `export { machOArchsOf, verdictFromArchs }` (L1901), `locateMachOBinary`, `verifyMacArchGroundTruth`, `promptI386Recovery` (1892-2085)                                                                                                                                                                                                                                   | ~230 | `installRoot` (type); `promptI386Recovery` runtime-imports `games.ts` (see cycle note) |
| `pollState.ts` (**state leaf**) | `activePolls` + its value type, `GRACE_TICKS`, `MAX_TICKS`, `STEAM_REQUEST_NO_ACTIVITY_TICKS`, `MANIFEST_GONE_TICKS`, `STALLED_TICKS_THRESHOLD`, `BYTES_PER_MIB`, `STEAM_HOLD_PROBE_MIN_INTERVAL_MS`, bridge-finalized trio, `STEAM_BRIDGE_FINISHING_CONTEXT`, `GAMELIB_HANDOFF_STATE_FLAGS`, `steamRequestNoticeSeq`/`nextSteamRequestNoticeSeq` (2087-2242, 3770-3774) | ~170 | `installRoot` (type)                                                                   |
| `restartHold.ts`                | `notifyRestartSteamToFinish`, `isHoldingForSteamRestart`, `pendingSteamHoldRearm`, `reconcileRanDuringRearm`, `releaseSteamHold`, `withoutSteamRestartHolds`, `shouldHoldForSteamRestart` (2738-2912)                                                                                                                                                                    | ~200 | `pollState`, `acfState`(?)                                                             |
| `installPollOnce.ts`            | `pollInstallOnce` (2914-3354)                                                                                                                                                                                                                                                                                                                                            | ~500 | `pollState`, `restartHold`, `acfState`, `macArch`, `resumeBreadcrumbs`                 |
| `installPolling.ts`             | `startInstallPolling` (3356-3724), `markManagedBySteam`, `isLiveMonitorEligible`, `stopInstallPolling`, `isDelegatedInstallPolling`, `cancelDelegatedInstall` (3726-3807)                                                                                                                                                                                                | ~480 | `pollState`, `restartHold`, `installPollOnce`, `acfState`                              |
| `resume.ts`                     | `hostSteamDepotOsForResume`, `locateDownloadingTarget`, `buildResumeFinalizeOpts`, `resumeInterruptedSteamInstall`, `rearmPersistedSteamRestartHolds` (324-596, 772-875)                                                                                                                                                                                                 | ~420 | `installPolling`, `restartHold`, `acfState`, `pollState`                               |
| `uninstallPolling.ts`           | `activeUninstallPolls`, `STATE_UNINSTALLING`, `pollUninstallOnce`, `startUninstallPolling`, `stopUninstallPolling` (3809-4160)                                                                                                                                                                                                                                           | ~410 | `pollState`, `acfState`, `installRoot`                                                 |
| `runningPoll.ts`                | `runningPollTimer`, `lastKnownRunningAppId`, per-platform fns, `readRunningAppId`, `pollRunningOnce`, `startRunningPoll`, `stopRunningPoll` (4216-4400)                                                                                                                                                                                                                  | ~210 | leaf                                                                                   |
| `refresh.ts` (D-07)             | free `refresh()` (1085-1192 incl. doc), `syncOwnedLibrary` (1193-1568), `refreshInstallState` (1670-1757; see below)                                                                                                                                                                                                                                                     | ~620 | `installedMap`, `restartHold`, `acfState`, `resumeBreadcrumbs`, `resume`, `macArch`... |
| `index.ts`                      | `SteamLibraryManager` default export: `init`, `getGame`, `migrateStaleArtUrls`, one-line `refresh()`/`refreshInstallState()`, `getGameInfo`, `getListOfGames`, `getInstallInfo`, `listUpdateableGames`, `changeGameInstallPath`, `changeVersionPinnedStatus`, `installState`, `getLaunchOptions`                                                                         | ~400 | everything; **nothing imports `index.ts` except `storeManagers/index.ts` and tests**   |

**Why `pollState.ts` exists.** `pollInstallOnce` -> hold helpers -> `activePolls` -> `startInstallPolling` -> `pollInstallOnce` is a 3-way cycle if `activePolls` lives with either side, and the single module containing all of them would be ~1,100 lines (CONTEXT's estimate). So `activePolls` and the shared tick constants live in a leaf; the timer is created and `unref()`'d in `installPolling.ts`. **D-10 literal reading is "state, seams and unref together"; this is the one place that cannot hold.** Record the deviation explicitly in the plan (the Map is the state; `setInterval(...).unref()` stays adjacent to `activePolls.set(...)` in the same function, L3562/L3718). Alternative that keeps D-10 literal: put the Map plus `startInstallPolling` in one ~600-line module and pass `activePolls` readers into the hold helpers as an argument (signature change, not a pure move; rejected).

**D-07 specifics.** `refresh()` calls `this.refreshInstallState()` (L~1113) and `this.syncOwnedLibrary(client)` (L~1187), and nothing else on `this`. So the free-function lift has no hidden `this` use. Move `refreshInstallState` into `refresh.ts` too: otherwise `refresh.ts` has a back-edge into the class. The class keeps one-line `refresh()` and `refreshInstallState()` because **they are `LibraryManager` interface members** (`common/types/game_manager.ts:90-125`) and sidecar tests spy on the _instance_ (`skeletonFlows.test.ts:681,698,725,742,771` spy `refresh`; `steamFocusRefreshWire.test.ts:228,246` spy `refreshInstallState`). These are not "stubs that exist only so tests can spy". Behaviour change to flag: inside `refresh()`, the call to `refreshInstallState` changes from `this.refreshInstallState()` (hits an instance spy) to a direct function call (does not). No test spies the instance method during a real `refresh()` (grep: zero hits in `library.test.ts`), so this is safe, but re-grep when planning.

**Intra-library call edges that become cross-module** (these change ts-jest spy reach; all currently local-binding calls that a module-namespace spy never saw):

| Caller (module) -> callee (module)                                                                                       | Spied anywhere today?                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pollInstallOnce`, `pollUninstallOnce`, `rearm...` -> `readAcfState`                                                     | `games.test.ts` spies `libraryModule.readAcfState` at L8806, 9824, 10342, 10828, 10862, 10899, 10945, 10973, 11003, 11270: **after the split a spy on `acfState.readAcfState` will start intercepting real pollers' calls**. Check each: those that also spy `pollUninstallOnce` are unaffected; those running a real poller change behaviour. |
| `resumeInterruptedSteamInstall`, `rearm...` -> `startInstallPolling`                                                     | `games.test.ts` spies `startInstallPolling` ~20 times (L4039, 4133, 4282, 4370, 4800, 5029, 5190, 5359, 5527, 8068, 9047, 11730, 15299, 15484) and `resumeInterruptedSteamInstall` (L4285). Same direction: the spy on `installPolling.startInstallPolling` will now also catch calls from `resume.ts`.                                        |
| `pollInstallOnce` -> `markSteamInstallIncomplete`, `verifyMacArchGroundTruth`                                            | not spied; `library.test.ts` imports both for direct tests                                                                                                                                                                                                                                                                                     |
| `startUninstallPolling` -> `nextSteamRequestNoticeSeq`                                                                   | not spied                                                                                                                                                                                                                                                                                                                                      |
| class `init()`/`refresh` -> `buildInstalledMap`, `verifyMacArchGroundTruth`, `startRunningPoll`, `scanDownloadingAppIds` | `library.test.ts` drives through mocks, not spies                                                                                                                                                                                                                                                                                              |

**Cycle risks.**

- `games.ts` <-> library is an existing cycle (`depcruise` comment: "games.ts <-> library.ts is an existing cycle the games.ts split cannot remove"; `no-circular-depot` is scoped to depot only). After the split: `games.ts` imports `cancelDelegatedInstall` from `installPolling.ts`; `macArch.ts` (`promptI386Recovery`) and `index.ts` (`getGame`) runtime-import `games.ts`. Cycle `games -> installPolling -> installPollOnce -> macArch -> games` exists. It is not a depcruise violation, but it is new routing; to avoid enlarging it, consider leaving `promptI386Recovery` in `index.ts`-adjacent module that nothing under `installPollOnce` imports (check who calls it: `verifyMacArchGroundTruth` does, so it cannot).
- `resumeInterruptedSteamInstall` -> `startInstallPolling` and `pollInstallOnce` -> `markSteamInstallIncomplete`: this is why breadcrumbs (leaf-ish) and resume are _separate_ modules.
- `rearm...` writes `reconcileRanDuringRearm` which `restartHold` owns: cross-module `let` mutation. Expose `armRestartHoldRearm(appIds)` / `finishRestartHoldRearm()` mutators from `restartHold.ts` in a **separate non-pure commit before** the move (or export the `let` and rely on live bindings: works under ts-jest CJS and esbuild, but ESLint `import-x` and readers find it fragile). Same for `class.init` L906 which resets it.
- `index.ts` must not be imported by siblings: no sibling references `SteamLibraryManager` (verified: zero edges from clusters 1,4-11 into the class).

**Importer fan-out for `library.ts`** (non-test: 10; all repoint to the owning module):

| Importer                                 | Symbols                                                                                                                                                                                                                                                                                                           | New target                                                                                             |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `storeManagers/index.ts:5`               | default `SteamLibraryManager`                                                                                                                                                                                                                                                                                     | `steam/library` (unchanged, resolves to `index.ts`)                                                    |
| `gamedetails/dispatch.ts:57`             | `isDelegatedInstallPolling`                                                                                                                                                                                                                                                                                       | `installPolling`                                                                                       |
| `sidecar/installFlowRegistration.ts:143` | `resolveInstallRoot`                                                                                                                                                                                                                                                                                              | `installRoot`                                                                                          |
| `steam/cancelDelete.ts:33`               | `clearSteamResumeBreadcrumb`, `findOtherManifestsWithInstalldir`, `getBridgeBottleSteamappsRoot`                                                                                                                                                                                                                  | `resumeBreadcrumbs`, `acfState`, `installRoot`                                                         |
| `steam/gameInstall.ts:29`                | `startInstallPolling, stopInstallPolling, resumeInterruptedSteamInstall, markSteamInstallIncomplete, markSteamNativeInstallStarted, clearSteamResumeBreadcrumb, readAcfState, pollUninstallOnce, removeSteamInstallCopy, STEAM_BRIDGE_FINISHING_CONTEXT, markBridgeInstallFinalized, clearBridgeInstallFinalized` | `installPolling, resume, resumeBreadcrumbs, acfState, uninstallPolling, pollState`                     |
| `steam/gameUninstall.ts:17`              | `startUninstallPolling, readAcfState, pollUninstallOnce, resolveInstallRoot, findOtherManifestsWithInstalldir, removeSteamInstallCopy, nextSteamRequestNoticeSeq`                                                                                                                                                 | `uninstallPolling, acfState, installRoot, pollState`                                                   |
| `steam/games.ts:34`                      | `cancelDelegatedInstall`                                                                                                                                                                                                                                                                                          | `installPolling`                                                                                       |
| `steam/nativeDelete.ts:11`               | `readRunningAppId`                                                                                                                                                                                                                                                                                                | `runningPoll`                                                                                          |
| `steam/removeAllCopies.ts:14`            | `enumerateSteamInstallCopies, removeSteamInstallCopy, pollUninstallOnce`                                                                                                                                                                                                                                          | `acfState`, `uninstallPolling`                                                                         |
| `steam/macSteamAdoption.ts:258`          | lazy `require('./library') as typeof import('./library')` for `readRunningAppId`                                                                                                                                                                                                                                  | `./library/runningPoll` (the comment at L161 says it avoids library's heavy graph; this improves that) |

**Test files that import or mock `library`** (D-03 repoint list): `steam/__tests__/library.test.ts` (9,299 lines, 27 `jest.mock`), `games.test.ts` (`import * as libraryModule` L69, SteamLibraryManager L68), `removeCopies.test.ts` (`libraryModule` spies on `removeSteamInstallCopy`, `enumerateSteamInstallCopies`, `pollUninstallOnce`), `cancelDelete.test.ts:35` (`jest.mock('../library', {clearSteamResumeBreadcrumb, findOtherManifestsWithInstalldir, getBridgeBottleSteamappsRoot})` -> three mocks), `nativeDelete.test.ts:10` (`{readRunningAppId}` -> `jest.mock('../library/runningPoll')`), `steamStartupKeyringDeferral.test.ts:284` (default class: unchanged), `sidecar/__tests__/installFlows.test.ts:176-178,250` (`jest.mock` with `...jest.requireActual`; `resolveInstallRoot` -> `installRoot`), `gamedetails/__tests__/gameDetailsModules.test.ts:127` (mocks `isDelegatedInstallPolling` -> `installPolling`), `sidecar/__tests__/bootstrap.test.ts:292` (headless `require` of `backend/storeManagers/steam/library`; keep, resolves to `index.ts`).

**Source-scan tests that read `library.ts` text and must be repointed** (62 had four of these per plan): `metadataCapture.test.ts:165` (`readStripped('../library.ts')`), `steamDepotSkipCopyCensus.test.ts:39`, `games.test.ts:9401` (file list including `'library.ts'`), `src/frontend/screens/Game/GamePage/components/__tests__/steamResumeCopyCensus.test.ts:150` (`endsWith(join('storeManagers','steam','library.ts'))`). Also doc references in `knip.jsonc:77` (comment only).

**`library.test.ts` -> per-module test files** (describe line ranges; shared 1-416 preamble must be copied per file, then pruned):

| Test file                   | Describes (L)                                                                                                                                                                 |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `refresh.test.ts`           | refresh sync status 927, ungranted 1099, anon capture 1153, fail-soft 1258, bottle/bridge reconciliation 1315-1884, `refreshInstallState` 2138-3135, hostInstallPlatform 8452 |
| `index.test.ts` (class)     | init 417-927 preamble, stale art 2069, startup resume reconciliation 3135-3459                                                                                                |
| `resumeBreadcrumbs.test.ts` | re-seeds resume 1884, breadcrumb 2009, `markSteamInstallIncomplete` 3997                                                                                                      |
| `acfState.test.ts`          | `readAcfState` 3459-3626, 3626, 3821; `findOtherManifests...` 4051; `scanDownloadingAppIds` 8094                                                                              |
| `installRoot.test.ts`       | `resolveInstallRoot` 3735                                                                                                                                                     |
| `installedMap.test.ts`      | `isFullyInstalledStateFlags` 3923, detector lock 3933, `buildBottleInstalledMap` 4149, `buildBridgeInstalledMap` 4209                                                         |
| `installPollOnce.test.ts`   | `pollInstallOnce` 4428-5871                                                                                                                                                   |
| `restartHold.test.ts`       | hold fast path 5871, persist/re-arm 6288-6617                                                                                                                                 |
| `installPolling.test.ts`    | idempotency/stop 6617-7375 (contains `setInterval` spies L6650, 6658, 6834: these are the unref contract tests; keep with the timer)                                          |
| `uninstallPolling.test.ts`  | `pollUninstallOnce` 7375, `startUninstallPolling` 7893                                                                                                                        |
| `runningPoll.test.ts`       | `readRunningAppId` 8175, `pollRunningOnce` 8318, start/stop 8416                                                                                                              |
| `macArch.test.ts`           | 8545-9299 incl. delegated install 9127                                                                                                                                        |

### 2. `steam/bottle.ts` (2,275)

Header L1-70 (imports). Edges verified acyclic after one adjustment: `resolveCrossoverWine` (L1320-1353) is called by `getSteamBottleSettings` (L282) AND `stockBridgeBottleSettings`; it must move up into the base `bottle.ts` (it reaches only `persistedWineBins`/`wineserverIn` from base). That is the one pure-move exception (a function relocates ahead of its natural cluster).

| Module                               | Contents (current L)                                                                                                                                                                                                                                  | Est. |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| `bottle.ts` (stays; highest fan-out) | 71-393 (consts, `persistedWineBins`, `isCrossoverInstalled`, root/exe paths, `isBottleReady`, `getSteamBottleSettings`, `persistBottleWineVersion`) + `resolveCrossoverWine`                                                                          | ~400 |
| `bottledSteam.ts`                    | 395-614 raise loops (state below), 1015-1184 `dispatchToBottledSteam`, `tellBottledSteamToLaunch/Uninstall`                                                                                                                                           | ~450 |
| `provisionBottle.ts`                 | 615-692 `ProvisionBottleResult`, `killBottleWineServer` (non-exported, used by 3 modules: export it), 693-1013 `provisionBottle`                                                                                                                      | ~440 |
| `bridgeBottle.ts`                    | 1186-1397 (names, readiness, `findBridgeInstallBottle`, `stockBridgeBottleSettings`), 1399-1612 DRM runner registry, 1614-1707 `getBridgeBottleSettings`, `listReadyBridgeBottleNames`                                                                | ~520 |
| `bridgeBottleLifecycle.ts`           | 1709-2275 (`guardPerGameBridgeBottleName`, `removePerGameBridgeBottle`, `killForRegisteredEngine`, `endPerGameBridgeBottleSession[With]`, `killBridgeBottleWineServer`, `stopPerGameBridgeBottle`, `discardNewBridgeBottle`, `provisionBridgeBottle`) | ~620 |

Five pieces triggers D-05's "~4 or more pieces => directory" heuristic. Recommendation: a `steam/bottle/` directory (`index.ts` = base) _only if_ the planner accepts `git mv bottle.ts bottle/index.ts`; `./bottle` imports then keep resolving for the base names, but 17 exported names, including the highest-fan-out ones (`getBridgeBottleSettings`, `isBridgeBottleReady`, `bridgeBottleNameFor`...) live in `bridgeBottle` and must be repointed regardless. Flat siblings avoid the rename; either is acceptable.

Dependency order (no cycles): `bottle` <- `bottledSteam` (raise state), `provisionBottle` (needs `raiseInstallerWindow` from `bottledSteam`, so `bottledSteam` must not import `provisionBottle`) <- ... `bridgeBottle` <- `bridgeBottleLifecycle` (needs `killBottleWineServer`, `drmBridgeRunners`, `bridgeBottleNameFor`).

**State and teardown:**

| State                                                     | L       | Owner             | Seam / unref                                                                                                                                                                                           |
| --------------------------------------------------------- | ------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `let bottledRaiseLoopsCancelled`, `activeRaiseTimers` Set | 434-445 | `bottledSteam.ts` | `export __stopBottledRaiseLoops` (L447); `handle.unref?.()` L493                                                                                                                                       |
| `drmBridgeRunners` Map                                    | 1547    | `bridgeBottle.ts` | accessors `setDrmBridgeRunner/setOverlayBridgeRunner/clearDrmBridgeRunner/getDrmBridgeRunner`; `killForRegisteredEngine` (lifecycle) reads it and `drmRunnerBinDir` -> export both from `bridgeBottle` |

Exemption pins: `// log-secret-gate-exempt` at L876 (inside `provisionBottle`) and L2231 (`provisionBridgeBottle`). `meta/__tests__/logSecretGate.test.ts:433-447` pins the exact set of exempting files (count 15 stays, file list changes: `bottle.ts` becomes `provisionBottle.ts` and `bridgeBottleLifecycle.ts`). Update that list in the same commit as each move.

**Importers (non-test 17 files, test 24 files; every `jest.mock('../bottle', factory)` must be split):**

| New module              | Non-test importers                                                                                                                                                                                                                             | Test files that import/mock it today                                                                                                                                                                                                                                            |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bottle`                | library.ts, steamEngineDeps.ts, gameInstall.ts, launchTarget.ts, cancelDelete.ts, gameUninstall.ts, gameLaunch.ts, games.ts, installFormIpc.ts, sidecar/steamAuthFlowRegistration.ts                                                           | bottle, macArchKnownFixRouting, removeCopies, originalRestore, shimGenerate, drmScanExe, stageDrmBottle, steamEngineDeps, games, cancelDelete, depot.finalize, library, steamStartupKeyringDeferral, launchTarget, steamAuthFlows, installFormIpc, `__tests__/storeLaunchHooks` |
| `bridgeBottle`          | steamEngineDeps, gameBridgeLaunch, gameInstall, gameMaintenance, sharedRedistInstall, gameUninstall, games, shimGenerate, library, sidecar/installFlowRegistration, gameLaunch, drmLaunchSetup, gameDrmLaunch, gameLaunchOverlay, launchTarget | bottle, games, macArch..., removeCopies, steamStartupKeyringDeferral, steamEngineDeps, sharedRedistInstall, library, originalRestore, shimGenerate, stageDrmBottle, installFlows, drmLaunchSetup, launchTarget                                                                  |
| `bridgeBottleLifecycle` | gameInstall, gameUninstall, library, gameLaunchOverlay, gameLaunch, games, stageDrmBottle, sharedRedistInstall                                                                                                                                 | bottle, games, macArch..., removeCopies, sharedRedistInstall, drmLaunchSetup, steamStartupKeyringDeferral                                                                                                                                                                       |
| `bottledSteam`          | gameLaunch                                                                                                                                                                                                                                     | bottle, games, macArch..., removeCopies, steamStartupKeyringDeferral                                                                                                                                                                                                            |
| `provisionBottle`       | sidecar/steamAuthFlowRegistration                                                                                                                                                                                                              | steamAuthFlows, bottle                                                                                                                                                                                                                                                          |

`games.test.ts` uses `jest.requireMock('../bottle')` at L6964, 8358, 14190, 14913 and `removeCopies.test.ts` at L525, 579, 849 and `shimGenerate.test.ts:2981`: each `requireMock` target must follow the mocked name's new owner. Source-scan tests: `bottle.test.ts:1546` and `:2673` read `../bottle.ts` text.

`bottle.test.ts` (3,558) -> by owner: base (255-688 + 1539 bridge settings subset), `provisionBottle` (688-1241), `bottledSteam` (1241-1539), `bridgeBottle`/`lifecycle` (1539-2930, nested in the outer describe at 213 with shared `beforeEach` 213-255, so carve nested describes), `Phase 59 engine registry` 2976-3558 (lifecycle). Pre-existing failing test: `DRM_LAUNCH_FORM equals launch_form in 56-01-SUMMARY.md` (L1972; the Phase 56 dir is absent).

### 3. `steam/gameInstall.ts` (1,971) - no state, no tests import it directly

All 19 exports are free functions taking `steamGame`. Non-test importers only: `games.ts` (`install, installNative, installBottleNative, ensureBuiltInEngineForInstall, installBridgeGame`), `gameBridgeLaunch.ts` (`persistBridgeDrmSignal, reconcileBridgePrescreen, resolveBridgeGameInstallRoot`), `gameLaunch.ts` (`ensureBuiltInEngineForInstall`), `gameMaintenance.ts` (`resolveBridgeGameInstallRoot`), `gameUninstall.ts` (`markBridgeGameUninstalled, resolveBridgeGameInstallRoot`). (A prior `markBridgeGameInstalled -> install` edge in the scan is a false positive: it is an object key `install:`.)

| Module                  | Contents (L)                                                                                                                                                                             | Est. (imports ~110 lines, shared) |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| `gameInstall.ts`        | 121-515 `install`, 517-584 `removeDemotedNativeOrphan`, 586-662 `installNative`, `hasBottledSteamCopy`, `installBottleNative`, `crossoverRequiredError`, `ensureBuiltInEngineForInstall` | ~650                              |
| `gameInstallBridge.ts`  | 664-1283 `installBridgeGame`, `provisionBridgeBottleForInstall`, `resolveInstallEngineSettings`, `installBridgeGameLeased`                                                               | ~690                              |
| `bridgeInstallState.ts` | 1285-1459 `persistBridgeDrmSignal`, `reconcileBridgePrescreen`, `resolveBridgeGameInstallRoot`, `markBridgeGameInstalled/Uninstalled`                                                    | ~230                              |
| `gameInstallDepot.ts`   | 1461-1971 `installDepotDownload`, `runNativeDepotDownload`, `installResultForRefusal`, `runNativeDepotDownloadLeased`                                                                    | ~600                              |

Edges: `gameInstall -> gameInstallDepot` (`install`->`installResultForRefusal`, `installNative`->`installDepotDownload`), `gameInstallBridge -> {gameInstall (ensureBuiltInEngineForInstall), bridgeInstallState, gameInstallDepot}`. `bridgeInstallState` and `gameInstallDepot` are leaves. Flat siblings match the existing `game*.ts` convention.

**Traps specific to this file:** (a) depcruise `games-split-modules-are-leaves` lists exact filenames `game(Constants|SessionState|...|Install|Launch|LaunchOverlay|BridgeLaunch|Maintenance|Uninstall)\.ts`; new names (`gameInstallBridge`, `gameInstallDepot`, `bridgeInstallState`, `gameBridgeWineLaunch`) are **not covered**. Extend the regex (tightening is allowed; D-13 forbids loosening) and add them to `gamesModuleSurface.test.ts` `LIFTED_OWNERS` (they may reference `SteamGame` only via `import type`). (b) The knip baseline carries 11 `exports gameInstall.ts <symbol>` lines (`crossoverRequiredError, hasBottledSteamCopy, installBridgeGameLeased, installDepotDownload, installResultForRefusal, markBridgeGameInstalled, provisionBridgeBottleForInstall, removeDemotedNativeOrphan, resolveInstallEngineSettings, runNativeDepotDownload, runNativeDepotDownloadLeased`); when these move, the `path` field of each identity changes, so the ratchet reports both "new finding" and "baseline line no longer found". Edit `meta/knip-baseline.txt` in the same commit. (c) Source-scan test `installLocation.test.ts:629` reads `gameInstall.ts`; `steamAuthSessionPolicy.test.ts` Rules E/F allow-lists name files containing `acquireAuthenticated(` / `allowLogon: true` (62-06 lesson): add the new files.

### 4. `steam/user.ts` (1,562) - **not a pure move** (see Open Question 1)

One `export class SteamUser` (L148-1562, 1,417 lines) with only static members. Top: L41-144 constants/types.

State (all `private static`, shared by many methods; tests poke them as `(SteamUser as any).client/leaseCount/idleTimer/...` at `user.test.ts:247-258,2044,2304,2433`): `client, session, connectingPromise, leaseCount, idleTimer, guidedInstallTargets, shuttingDown, sessionGeneration, abandonPendingLogon, wrapTail, logonFailure, qrSessionState, qrLastLoggedStatus, credSessionState, _credSettleCallbacks`. Timers: `idleTimer` `unref` L486; `bound` timeout `unref` L1013 in `connectSteamUserClient`.

Member clusters (AST member-reference scan):

| Cluster            | Members (L)                                                                                                                                                                                                                                                 | Lines | Couples to                                                                                                                                                                       |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sign-in flows      | `startQRLogin` 1159, `pollQRLogin` 1238, `completeQrProfile` 900, `startCredentialLogin` 1264, `submitSteamGuardCode` 1381, `pollCredentialLogin` 1143, `_settleCredSession` 1111, `_waitForCredSession` 1127, `finishAuth` 827, `resolveSignInProfile` 852 | ~390  | state `session, qrSessionState, qrLastLoggedStatus, credSessionState, _credSettleCallbacks`; calls `acquireAuthenticatedWithToken` (private); `logout()` resets all of the state |
| Redeem             | `redeemKey` 1425, `classifyPurchaseResult` 1517                                                                                                                                                                                                             | ~136  | calls `acquireAuthenticated` only                                                                                                                                                |
| Constants/types    | 41-144                                                                                                                                                                                                                                                      | ~105  | type-only `AuthSessionReason/Refusal` already imported from `./user` by `depot/planModel.ts`, `gameInstall.ts`                                                                   |
| Lease/connect core | `ensureConnected`, `acquire*`, `ensureAuthenticatedSession` 489-670, `wrappedConnect*`, `connectSteamUserClient` 947-1109, `endSession`, idle timer                                                                                                         | ~700  | stays                                                                                                                                                                            |

Consumers of the sign-in public methods: **one** non-test file (`sidecar/steamAuthFlowRegistration.ts:178,251` for `startQRLogin`/`redeemKey`, plus `pollQRLogin/startCredentialLogin/submitSteamGuardCode/pollCredentialLogin`) and tests `sidecar/__tests__/steamAuthFlows.test.ts`, `steam/__tests__/user.test.ts` (describes 558-1283 and 2080-2253 are the sign-in and redeem blocks), `steamStartupKeyringDeferral.test.ts`, `authSessionLifecycle.test.ts`, `credentialsMissing.test.ts`. Low fan-out makes repointing to free functions (no delegating statics) viable.

Recommended cut (acyclic, ~870 lines left, no stubs): `userTypes.ts` (leaf: constants + types, repoint the `type` importers), `userSignInState.ts` (**state leaf**: `session`, `qrSessionState`, `qrLastLoggedStatus`, `credSessionState`, `_credSettleCallbacks` + `resetSignInState()`; imported by both `user.ts` `logout()` and the flows), `userSignIn.ts` (flows as free functions; imports `SteamUser` for `acquireAuthenticatedWithToken`, which loses `private`), `userRedeem.ts` (`redeemKey` as free fn). `user.ts` never imports `userSignIn`/`userRedeem`, so no cycle. 38 test files `jest.mock('../user')`; those that exercise sign-in/redeem (list above) also need `jest.mock('../userSignIn')` / `('../userRedeem')`. `jest.mock('../user')` automock currently mocks the sign-in statics; after the move they are real unless also mocked.

### 5. `steam/games.ts` (1,351) + lift stubs

Layout: L1-93 imports, `STEAM_CDN_BASE` L94, `class SteamGame` L96-1272 (1,177 lines), `getBridgeRouteVerdict` L1274-1351.

Class members: 10 real (`getSettings 49, getGameInfo 107, fetchMetadataIfNeeded 282, getExtraInfo 19, importGame 7, onInstallOrUpdateOutput 10, update 13, forceUninstall 39, stop 88, isGameAvailable 23`) and 25 one-line delegations:

| Kind                                        | Members                                                                                                                                                                                                                                                                                                                                                                                                    | Lines (incl. JSDoc) |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| **`Game` interface (keep as thin methods)** | `install 39, isNative 17, addShortcuts 10, removeShortcuts 3, launch 25, moveInstall 3, repair 9, syncSaves 7, uninstall 55`                                                                                                                                                                                                                                                                               | ~168                |
| **Internal stubs (removable)**              | `installNative 24, installBottleNative 19, ensureBuiltInEngineForInstall 12, installBridgeGame 43, restorePinEngine 13 (property), isBottleEligible 12, checkBridgeRoute 13, isBridgeEligible 18, checkBottleEligibility 19, prefetchBridgeDrmDownloads 15, launchDrmModeGame 17, prepareTcpOverlay 17, launchBridgeGame 35, launchBridgeGameBody 8, fireBridgeWineLaunch 26, uninstallBridgeGame 39` (16) | ~329                |

**Call sites of internal stubs (non-test), re-scanned by AST:** `gameBridgeLaunch.ts` 144 (`launchBridgeGameBody`), 332 (`launchDrmModeGame`), 494, 612 (`fireBridgeWineLaunch`); `gameInstall.ts` 361 (`installBridgeGame`), 406 (`installBottleNative`), 425 (`installNative`), 1260 (`prefetchBridgeDrmDownloads`); `gameLaunch.ts` 144 (`launchBridgeGame`), 927 (`fireBridgeWineLaunch`); `gameUninstall.ts` 66 (`uninstallBridgeGame`); `games.ts` 116 (`this.isBottleEligible`), 735 (`this.ensureBuiltInEngineForInstall`), 1329 (`game.checkBridgeRoute`), 1345 (`game.checkBottleEligibility`); `installFormIpc.ts` 116 (`new SteamGame(appName).checkBottleEligibility`) = **15 sites**. Two more `game.x()` sites call _interface_ methods and stay: `launchDispatch.ts:90` (`game.launch`), `library.ts:2084` (`game.install`).

**SteamGame.prototype spies (6):** `games.test.ts` L1081 `fetchMetadataIfNeeded` (real method, 13 mentions in file; also called from `gameEligibility.ts:239` and `games.ts:247`), L11757 `installBottleNative`, L13763/13791/13811 `launchDrmModeGame` (called at `gameBridgeLaunch.ts:332`), L16239 `launchBridgeGameBody` (called at `gameBridgeLaunch.ts:144`). After conversion, each becomes a spy on the owning free function's module: `installBottleNative` -> `gameInstall`, `launchDrmModeGame` -> wherever it lives (`gameLaunch.ts` per 62-07 note), `launchBridgeGameBody` -> `gameBridgeLaunch`. Because `launchBridgeGameBody` and `launchDrmModeGame` are called _from other modules_ (`gameBridgeLaunch.ts`), a module-export spy will intercept them; the two that are called intra-module will not (check at conversion time).

**Getting under 1,000 at D-12 step 4.** Removing the 16 stubs gives ~1,022. Add two real cuts in step 4: (a) `getBridgeRouteVerdict` (78 lines) -> new `bridgeRouteVerdict.ts`. It does `new SteamGame(appId)` so it **cannot** go into `gameEligibility.ts` (a listed leaf; the depcruise rule forbids a runtime `games.ts` import). `bridgeRouteVerdict.ts` is not in the leaf regex, so it is legal; repoint `sidecar/steamAuthFlowRegistration.ts:148`, `installFormIpc.ts:24`, `games.test.ts:37`, `installFormIpc.test.ts:42,85` (mock) and update `gamesModuleSurface.test.ts` `GAMES_TS_EXPORTS` (pins `['SteamGame','getBridgeRouteVerdict']`). (b) lift `fetchMetadataIfNeeded` (282 lines, uses only `this.appId`) to a free function in `gameMetadata.ts`. Leaving a one-line method is the 62 pattern; removing it means converting 2 call sites and the `games.test.ts:1081` spy. With (a)+(b) the pre-stub-removal file is ~995 (too tight: do the stub clusters in the same plan, not "last"). Reorder suggestion: convert stub clusters launch/bridge first (D-12 step 6 pulled into step 4), so the allowlist entry drops straight to ~660.

**Folded todo 2 (`games-ts-further-split-below-1400`)**: close as met (1,351 < 1,400); also see the corrected premise above for todo 1.

### 6. `steam/gameBridgeLaunch.ts` (1,183)

Two huge functions: `launchBridgeGameBody` (L155-618, 464) and `fireBridgeWineLaunch` (L620-1183, 564), plus `launchBridgeGame` (30), `runBridgeLaunch` (13, knip-baselined export), `OVERLAY_EXIT_GRACE_MS` (5). Only edge: `fireBridgeWineLaunch -> OVERLAY_EXIT_GRACE_MS`. No state.

Cut: `gameBridgeWineLaunch.ts` <- `fireBridgeWineLaunch` + `OVERLAY_EXIT_GRACE_MS` (move the constant with its only user), ~620; `gameBridgeLaunch.ts` keeps the rest, ~560. Importers: `games.ts:81` (`launchBridgeGame, launchBridgeGameBody, fireBridgeWineLaunch`), `gameLaunch.ts:927` (calls `steamGame.fireBridgeWineLaunch`), no tests import it. Add the new file to the depcruise leaf regex and `LIFTED_OWNERS`. Knip baseline line: `exports gameBridgeLaunch.ts runBridgeLaunch` stays (symbol does not move).

### 7. `steam/bridge/shimGenerate.ts` (1,479)

`placeShimForGameInner` is one 674-line function (L806-1479); header imports L1-131.

| Module (sibling, D-08) | Contents (L)                                                                                                                                                                          | Est. |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| `shimOriginals.ts`     | 132-401 + 627-711: shim filenames/markers, `isGameLibShimBytes`, `PlaceShimResult*`, `ORIGINAL_BACKUP_SUFFIX`, fingerprint/backup, `restoreOriginalIfBackedUp`, `probeOriginalBackup` | ~400 |
| `shimDrmWrapper.ts`    | 508-625 `detectDrmWrapper`, `withDrmWrapper`, `detectExeSteamDrm`                                                                                                                     | ~170 |
| `shimPlacement.ts`     | 713-1479 withhold helpers, `scanDeps`, `placeShimForGameInner`                                                                                                                        | ~830 |
| `shimGenerate.ts`      | 403-506 `placeShimForGame` (+ imports)                                                                                                                                                | ~200 |

The fingerprint/backup group (217-401) and the restore/probe group (627-711) are mutually dependent (`originalFingerprintFor -> probeOriginalBackup`; `restoreOriginalIfBackedUp -> ORIGINAL_BACKUP_SUFFIX`), so they must be one module: do not follow the CONTEXT bullet literally ("fingerprint/backup/restore" is one piece, correct). Shared constants and types (L132-215) are depended on by everything: put them in `shimOriginals.ts` (or a tiny leaf). Several non-exported helpers need `export` (62-10 precedent). `shimPlacement.ts` at ~830 is over D-04's 800; if the planner wants more headroom, split the withhold helpers (88 lines) off. No mutable state. Importers: `drmScanExe.ts` (`detectDrmWrapper` -> `shimDrmWrapper`), `stageDrmBottle.ts` & `originalRestore.ts` (`isGameLibShimBytes, probeOriginalBackup` -> `shimOriginals`), `gameBridgeLaunch.ts:47`, `gameInstall.ts:88` (`placeShimForGame`, unchanged). Tests: `shimGenerate.test.ts` (3,064; `isGameLibShimBytes` describe L213, main L231; source scan at L968 `readFileSync(.../shimGenerate.ts)`), `shimCoverage.test.ts`, mocks of `bridge/shimGenerate` in `games.test.ts:483` (+`require` L500), `macArchKnownFixRouting.test.ts:158`, `removeCopies.test.ts:191`, `steamStartupKeyringDeferral.test.ts:171` (all mock `placeShimForGame`, unchanged), `drmScanExe` test mocks.

### 8. `steam/bridge/helperProcess.ts` (1,143)

State (one owner, D-10): `helpers` Map (L241), `let bridgeHelperPathOverride` (247), `let bridgeHelperSpawnEnvOverride` (257), `let exitTeardownInstalled` + `installExitTeardownOnce` (289-302, `process.on('exit', shutdownAllBridgeHelpers)`), `let steamWaitScheduleOverride` (146). Seams: `__setSteamWaitScheduleForTests` (149), `__setBridgeHelperPathForTests` (253), `__setBridgeHelperSpawnEnvForTests` (279), `__resetBridgeHelperStateForTests` (1134; resets `helpers`, path override, **and** `steamWaitScheduleOverride`). `unrefHandle` L285, `handle.unref?.()` L308, timers `unref` L655/735/753.

Edges: registry functions (`getBridgeHelperConnection, stopBridgeHelper, hasLiveBridgeHelper, shutdownAllBridgeHelpers, reset`) read only the state; `ensureHelperSpawned` (302 lines) reads state + `stopBridgeHelper`; `ensureBridgeHelperReady` (217) reads `helpers`, `steamWaitScheduleOverride`, and calls spawn, probe and `stopBridgeHelper`. Because the single `__reset` touches both registry and wait-schedule state, **all five state items live in the registry module**; consumers use accessor functions (a small non-pure commit before the move), or the `let` exports with live bindings.

| Module (sibling)           | Contents                                                                                                                                                                                                                | Est. |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| `helperRegistry.ts`        | `BridgeHelperEntry`, `helpers`, the 4 overrides + 3 setters, `unrefHandle`, `installExitTeardownOnce`, `getBridgeHelperConnection`, `stopBridgeHelper`, `hasLiveBridgeHelper`, `shutdownAllBridgeHelpers`, `__reset...` | ~230 |
| `helperSpawn.ts`           | log-line consts, `classifyInitFlatError`, port consts, `ensureHelperSpawned`                                                                                                                                            | ~420 |
| `helperProcess.ts` (stays) | readiness: probes, `waitForPort/Init`, `probeHelperReadiness`, `startSteamDefault`, `ensureBridgeHelperReady`, `sleep`, readiness consts/types                                                                          | ~560 |

Order: registry (leaf) <- spawn <- readiness. Importers: `gameBridgeLaunch.ts:58` (`ensureBridgeHelperReady` stays, `stopBridgeHelper` -> registry), `gameLaunch.ts:59` and `games.ts:52` (`stopBridgeHelper` -> registry), `inviteBridge.ts:19` (`getBridgeHelperConnection` -> registry), `utils.ts:48` (`hasLiveBridgeHelper` -> registry; `utils.ts` is a heavy import point, check it stays headless-safe). Tests: `helperProcess.test.ts` (1,411; **source-scan at L1099 pins "no module-level `let` of a ChildProcess in this file"**, retarget to all three files with non-vacuity), `helperIntegration.test.ts`, `inviteBridge.test.ts:27` (mocks), and mocks of `bridge/helperProcess` in `games.test.ts:629`, `macArchKnownFixRouting.test.ts:163`, `removeCopies.test.ts:196`, `steamStartupKeyringDeferral.test.ts:178` (factories mock `stopBridgeHelper`; move to `helperRegistry`).

### 9. `steam/bridge/drm/runnerClone.ts` (1,228)

State: `inFlight` Map (L646, with `ensureRunnerClone`), `let resignCounter` (L946, with `resignLoader`). No test seams, no timers (comment-only `unref'd` L23).

The AST reference scan gives a clean layering (`prims <- detect, proc <- entitlements <- verify <- clone`) with one back-edge to fix: `verifyRunnerClone -> MTIME_PINNED_PATHS` (L277, a constant): move it into the verify module.

| Module (sibling)         | Contents (L)                                                                                                                                                                                                                                                                                       | Est. |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| `runnerCrossover.ts`     | 60-265 consts, `sha256File`, `statRegular`, `isContained`, `errText`, `StepError`, `stepFail`, `CrossoverAllowed`, `CX_ROOT_SUFFIX`, `defaultResolveBinDir`, `readCrossoverBundleVersion`, `detectAllowedCrossover`, + `psListing`, `isPathInUse`, `safeRemove`, `removeInside` (356-385, 621-644) | ~330 |
| `runnerEntitlements.ts`  | `DYLD_ENTITLEMENT`, `STOCK_LOADER_ENTITLEMENTS`, `parseEntitlementKeys`, `dumpLoaderEntitlements`, `entitlementsPlist*`, `resignLoader`, `resignCounter`, `scrubCloneXattrs`                                                                                                                       | ~210 |
| `runnerVerify.ts`        | `RunnerVerifyExpect`, `RUNNER_MARKER_FILE`, `Marker`, `readyFor`, `verifyRunnerClone`, `MTIME_PINNED_PATHS`, `RunnerReady/ComponentInput` types                                                                                                                                                    | ~270 |
| `runnerClone.ts` (stays) | `CLONE_ARGV_*`, `RunnerCloneDeps`, `inFlight`, `ensureRunnerClone`, `runFront`, `pruneStale`, `cloneCrossoverTree`, `buildRunner`                                                                                                                                                                  | ~560 |

Importers: `bridge/drm/drmLaunchSetup.ts:39` (`detectAllowedCrossover, ensureRunnerClone, CrossoverAllowed, RunnerReady`), and `bridge/overlay/overlayRunnerClone.ts:30`, which imports **22 names** in one statement (split into 4 import lines). The knip baseline has `exports runnerClone.ts MTIME_PINNED_PATHS`, `parseEntitlementKeys`, `removeInside` and `types runnerClone.ts RunnerTool`: path changes for the first three (and `RunnerTool` if moved). Tests: `runnerClone.test.ts` (1,289; source scan L489), `overlayRunnerClone.test.ts`, `overlayRunnerClone.realCrossover.test.ts` (imports; the real-CrossOver test is host-gated).

### 10. `steam/bridge/drm/stageDrmBottle.ts` (1,005)

No module state. One unref'd timer inside `runRegArgv` (L694-697) must be moved verbatim with its function.

| Module (sibling)            | Contents (L)                                                                                                                                                                                                    | Est. |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| `drmRegistry.ts`            | consts 66-83, 85-98, `buildDrmRegistryCommands`, `regEscape`, `sameSteamPath`, `drmRegistryMismatches`, `drmRegistryStagedInUserReg`, `isPhase52ForwarderBytes`, `forcedFirstTimeoutMs`, `runRegArgv` (672-714) | ~190 |
| `drmRestore.ts`             | `bottleHostToWinPath`, `readHeadCapped`, `walkRuntimeDlls`, `restoreDrmOriginals`, `removeTcpBridgeArtifacts` (255-481)                                                                                         | ~270 |
| `bottleProcesses.ts`        | 506-670 `defaultListBottleProcesses`, `pidsOfBottleSession`, `pidsWithCwdInBottle`, `listingOutput`, `defaultEndStageSession`                                                                                   | ~200 |
| `stageDrmBottle.ts` (stays) | types, `stageDrmBottle` (290), small helpers                                                                                                                                                                    | ~470 |

`restoreDrmOriginals -> isPhase52ForwarderBytes` means `drmRestore` imports `drmRegistry`, so registry must move first (or together). `drmRegistry` and `drmRestore` both use the type `StageDrmBottleDeps` defined in the stays-behind module: move the three `StageDrmBottle{Input,Deps,Ok}` types to a leaf `stageDrmTypes.ts` first (D-05: no back-edge), or accept `import type` back-edges (not depcruise-forbidden). D-09 minimum is one cluster; moving all three is the "real seam" reading and leaves ~470. Importers: only `drmLaunchSetup.ts:50`; tests `stageDrmBottle.test.ts` (947; describes 126-439 registry/restore, 897-947 process listing). **Six knip baseline lines name this file** (`DRM_COMPONENT_FILES, DRM_REG_ADD_RETRIES, DRM_REG_ADD_TIMEOUT_MS, DRM_STEAM_DIR_SEGMENTS, DRM_STEAM_DIR_WIN, DRM_VALVE_FILES`): retarget their path in the move commit.

## State Inventory (D-10 owner table)

| Module (proposed owner)                               | State                                                                        | Seams                             | `unref`/teardown                                                    |
| ----------------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------- |
| `library/pollState.ts`                                | `activePolls`, `bridgeInstallFinalized`, `steamRequestNoticeSeq`             | none                              | timer created+unref'd in `installPolling.ts` (documented deviation) |
| `library/restartHold.ts`                              | `pendingSteamHoldRearm`, `reconcileRanDuringRearm`                           | none                              | —                                                                   |
| `library/uninstallPolling.ts`                         | `activeUninstallPolls`                                                       | none                              | `setInterval`+`unref` together                                      |
| `library/runningPoll.ts`                              | `runningPollTimer`, `lastKnownRunningAppId`                                  | none                              | `unref` together                                                    |
| `bottledSteam.ts`                                     | `bottledRaiseLoopsCancelled`, `activeRaiseTimers`                            | `__stopBottledRaiseLoops`         | `unref` L493 together                                               |
| `bridgeBottle.ts`                                     | `drmBridgeRunners`                                                           | accessor fns                      | —                                                                   |
| `bridge/helperRegistry.ts`                            | `helpers`, 3 overrides, `exitTeardownInstalled`, `steamWaitScheduleOverride` | 3 setters + reset                 | `process.on('exit')` teardown + `unrefHandle`                       |
| `bridge/drm/runnerClone.ts` / `runnerEntitlements.ts` | `inFlight` / `resignCounter`                                                 | none                              | —                                                                   |
| `user.ts` (+ `userSignInState.ts` for sign-in fields) | 15 static fields                                                             | tests mutate `(SteamUser as any)` | `idleTimer.unref` L486, `bound.unref` L1013 stay in `user.ts`       |

Validate the exit contract after the library, bottle and helper moves: `pnpm smoke:sidecar` (the conventions note says it misses slow exit, so also run the unref-assertion tests: `setInterval` spies at old `library.test.ts` L2830, 3077, 6650, 6658, 6834).

## Line Gate Design (D-02)

**Recommend a standalone CommonJS meta script**, not a jest test: `meta/steamLineCeiling.cjs` + `meta/steamLineCeilingBaseline.json` (`{ "<repo-relative posix path>": <wc -l count> }`), wired as `"steam-line-ceiling": "node meta/steamLineCeiling.cjs"` in `package.json`, a step `Steam file line ceiling` in `.github/workflows/lint.yml` immediately after `Module boundaries`, and appended to `.husky/pre-push` line 2 (`... && pnpm boundaries && pnpm steam-line-ceiling`; `boundaryWiring.test.ts` only asserts line 1 is a shebang and line 2 _contains_ `pnpm boundaries`; `tsconfigMeta.test.ts:94` cites `pre-push:2`, so keep the chain on line 2). A script needs no child process, so the fake-HOME rule (`createFakeHomeProfile`) does not apply (like `knipRatchet.cjs`).

Model: `indexedAccessRatchet.cjs` (equality ceiling) rather than `knipRatchet.cjs` (identity text), because the ratchet value is a number per file:

| Rule                                              | Failure message                                                                       |
| ------------------------------------------------- | ------------------------------------------------------------------------------------- |
| file over 1,000 and not in baseline               | `over ceiling: <path> has N lines (max 1000)`                                         |
| file in baseline and count > baseline             | `grew: <path> N > baseline M`                                                         |
| file in baseline and count < baseline and > 1,000 | `lower <path> to N in this commit` (forces D-13: the move commit edits its own entry) |
| file in baseline with count <= 1,000              | `remove <path> from the baseline in this commit`                                      |
| baseline path missing on disk                     | `stale baseline entry` (a moved/deleted file must drop its line)                      |
| fewer than a floor of files scanned (~150)        | fail (zero files must never read as a pass; `lintScoped.cjs` uses file-count floors)  |

Counting: `content.split('\n').length - (content.endsWith('\n') ? 1 : 0)`, which equals `wc -l` and matches CONTEXT's numbers (a naive `split('\n').length` reads 1 higher; TS AST line reads 1 higher). Scope: recurse `src/backend/storeManagers/steam/`; include `.ts .tsx .cjs .mjs .js`; **exclude** path segment `__tests__` or `__mocks__`, `*.test.*`, `*.spec.*`, and any basename containing `.generated.` (covers `shimExports.generated.ts` 1,140 and `lzmaNativeResolvedPaths.generated.cjs`). JSON fixtures and `bridge-allowlist.json` are excluded by extension. Exports `{ countLines, evaluate, collectFiles }` for a unit test `meta/__tests__/steamLineCeiling.test.ts` modelled on `knipRatchet.test.ts`, with seeded specimens (over limit, grew, stale, below-limit entry, generated file excluded, zero-files guard); also add a wiring test like `boundaryWiring.test.ts` (script, lint.yml step, pre-push). Initial baseline = the 10 counts listed in the Summary. Meta jest project is `meta/jest.config.js` (`roots: ['<rootDir>/meta']`, `testMatch **/__tests__/**/*.test.ts`).

Do not extend the ceiling to `src/backend` (CONTEXT: deferred).

## Other Gates a Split Can Trip

| Gate                                                                                  | Behaviour                                                                                                                                               | Action                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm boundaries` (`.dependency-cruiser.cjs`, 5 rules, severity error, zero baseline) | `games-split-modules-are-leaves` lists 12 `game*.ts` names; `no-circular-depot` scoped to depot; `no-cross-store-manager`; `engine-is-store-agnostic`   | New `game*`/`bridge*` files are uncovered: **extend** the regex (do not loosen). New steam files must not import other store managers. Never move bottle primitives from `src/backend/engine/` back (61 D-19: `bottlePrimitives.ts`, `crossoverLocation.ts` and the rest already live there; `bottle.ts` imports them). |
| `pnpm find-deadcode` (knip identity ratchet)                                          | Identity = `type<TAB>path<TAB>symbol`; fails on both new findings and vanished lines. 24 steam lines in `meta/knip-baseline.txt` (lines 40-79, 391-396) | Lines naming moved symbols (gameInstall 11, stageDrmBottle 6, runnerClone 4, gameBridgeLaunch 1) must have their path edited in the same commit. Making a previously private helper `export` for cross-module use will create a new `exports` finding only if nothing imports it (cross-module use satisfies knip).     |
| `pnpm typecheck:indexed-access` (`indexedAccessRatchet.cjs`)                          | `src/backend/storeManagers/steam` is an ADOPTED bucket held at 0                                                                                        | Moves keep code unchanged so stays 0; new files in `library/` (subdirectory) must also bucket there; verify with `node meta/indexedAccessRatchet.cjs`.                                                                                                                                                                  |
| `pnpm lint` (`lintScoped.cjs`, `SRC_CEILING` 1130 / `TESTS_CEILING`)                  | Total warning ceilings, not per file                                                                                                                    | Moves must not add warnings (the 62-06 lift left unused-parameter warnings: `_steamGame` rename). Test-file moves must not change the tests warning total.                                                                                                                                                              |
| `logSecretGate.test.ts`                                                               | Pins which files hold the 15 exemptions (bottle.ts is listed)                                                                                           | Update file list when `provisionBottle` / `provisionBridgeBottle` move. Gate is **already red at baseline** (1 unrelated violation in `utils/uninstaller.ts:131`; 2 failing tests); compare against that, not green.                                                                                                    |
| `i18n` (`pnpm i18n --fail-on-update`) and `hardcodedStringGate`                       | `t()` default strings extracted by key from source                                                                                                      | Moves carry the `t()` calls; run `pnpm i18n --fail-on-update` once at each wave end (62-05 precedent: i18n key source-scan tests read specific file lists).                                                                                                                                                             |
| `gamesModuleSurface.test.ts`                                                          | Pins `games.ts` exports and the "may only `import type` games.ts" list                                                                                  | Update when `getBridgeRouteVerdict` and new `game*` modules appear.                                                                                                                                                                                                                                                     |
| `husky pre-commit`                                                                    | `tsc` type check, prettier                                                                                                                              | `<verify>` blocks: `npx prettier --check` over exact paths written (scoped, never `.`); check `--file-info` first.                                                                                                                                                                                                      |
| `graphify update .`                                                                   | Project rule after code changes                                                                                                                         | One line per wave.                                                                                                                                                                                                                                                                                                      |

## Phase 62 Method: What Went Wrong (use as pitfalls)

| 62 plan        | Problem                                                                                                                                                                                                         | Prevention here                                                                                                                   |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 62-05/06/07/08 | Source-text tests read moved bodies and went vacuous or red (`metadataCapture`, `steamAuthSessionPolicy`, `installLocation`, `games.test` i18n key scan). `finalize.ts` test "silently become vacuous" (62-10). | Grep for tests that `readFileSync` the target file _before_ planning each move (list above) and add non-vacuity assertions.       |
| 62-06          | Lifted `async` stubs dropped `async`, adding microtask hops and breaking an "exactly ONCE" test.                                                                                                                | Not a risk for D-07/stub removal (no stubs); but keep thin interface methods returning the free function's promise unwrapped.     |
| 62-07/08/09    | Plan line estimates ran high; acceptance criteria "under N lines" were missed (2,617 vs 2,000; 2,043 vs 1,400; depot 2,410).                                                                                    | Gate on measured counts per commit; plan ~10-25% headroom over estimates. The line gate makes this explicit.                      |
| 62-09          | Extracting a module before its dependency created a back-edge/cycle the baseline could not absorb; module deferred to next plan.                                                                                | Leaf-first order; move state leaf and back-edge repoints in earlier commits (62-09 item 4: "repoints committed before plan.ts").  |
| 62-10          | Non-exported helpers needed `export`; swap commit showed delete+add rather than rename.                                                                                                                         | Budget for `export` additions; `git mv` + rewrite in separate commits where history matters (`library.ts` -> `library/index.ts`). |
| 62-06          | A mechanical lift script (not committed) enforced no-`this`/free-symbol checks and sometimes imported shadowed names.                                                                                           | If scripting, review the generated imports; always run prettier + `codecheck` + `lint` after.                                     |

62 also sequenced as: shared leaves first, then clusters one commit each, repoints and test moves in the same commit as the move, and a live smoke at the end (62 D-17).

## Common Pitfalls

1. **ts-jest spy direction flips.** Under ts-jest (CJS), `jest.spyOn(mod, 'f')` replaces the property `exports.f`. Importers calling `mod_1.f()` see the spy; intra-module calls use a local binding and do not. A move converts intra-module calls to cross-module, so spies that used to miss start to hit (readAcfState and startInstallPolling spies in `games.test.ts`; see table). Re-run the whole `games.test.ts` after every library move and diff pass/fail by test name.
2. **Auto-mocks and partial factories.** `jest.mock('../bottle', () => ({...}))` factories list only names the code under test used. After a split, code under test imports from a different module that is now _real_ (hits `fs`, spawn, stores). Each new owning module needs its own `jest.mock`.
3. **File shadows directory.** `library.ts` and `library/` cannot coexist; `git mv` + delete. Same for an optional `bottle/` directory.
4. **Cross-module `let`.** `reconcileRanDuringRearm` (and any `let` state) cannot be reassigned from an importing module without an exported mutator or reliance on live bindings. Make it a pre-move commit.
5. **Knip baseline path drift** (see gates).
6. **`require`/dynamic import users.** `macSteamAdoption.ts:258` (`require('./library')`) and `storeManagers/index.ts:106` (`await import('.../steam/bottle')` for `persistBottleWineVersion`, stays in base `bottle.ts`) are invisible to a `from '...'` grep. The importer scan in this research covers them; re-run `node fan.cjs`-style AST scan (static import, `require`, dynamic `import()`, `jest.mock/requireActual/requireMock/doMock`).
7. **Sidecar exit contract.** Do not leave a timer without its `unref()` when it is moved; do not add module-load-time work (new modules should have no top-level side effects).
8. **Comment-scan tests reading JSDoc.** Many docstrings cite `library.ts`/`games.ts` line numbers (`games.ts:272` cites "test spy: games.test.ts:1062"). Pure moves do not need comment edits (62 D-06), but tests that regex source text may.

## Don't Hand-Roll

| Problem                                      | Don't build     | Use instead                                                                                                                                                                                                                                       |
| -------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Per-file line ratchet                        | a new framework | copy the shape of `meta/indexedAccessRatchet.cjs` (equality ceiling, no `--update`, hand-edited baseline)                                                                                                                                         |
| Cluster/edge discovery                       | grep heuristics | TypeScript compiler API (`typescript` is installed): top-level statements + identifier references; same for importer scans                                                                                                                        |
| Dependency-direction enforcement             | ad hoc test     | extend `.dependency-cruiser.cjs` (and its seeded-violation tests in `meta/__tests__/boundaryGates.test.ts`)                                                                                                                                       |
| Splitting `library.test.ts`/`bottle.test.ts` | rewriting tests | cut whole `describe` blocks by line range; keep bodies byte-identical (62 pattern; `depot.finalize.test.ts`, `depotLeaseMocks.ts` are the precedent for per-module test files with a copied `jest.mock` preamble and a shared non-hoisted helper) |

## Sequencing (refines D-12)

| Wave        | Content                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Gate delta                   |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------- |
| 0           | Close todo `games-ts-further-split-below-1400` as met; add `steam-line-ceiling` gate, baseline = today's 10 counts; wiring test; extend depcruise leaf regex with the planned `game*` filenames                                                                                                                                                                                                                                                                                            | gate green                   |
| 1           | `library`: (a) pure-move state leaf + constants (`pollState`, `installRoot`); (b) leaf-first clusters (`installedMap`, `acfState`, `macArch`, `resumeBreadcrumbs`, `restartHold` after the `reconcileRanDuringRearm` mutator commit, `installPollOnce`, `installPolling`, `resume`, `uninstallPolling`, `runningPoll`); (c) `git mv library.ts library/index.ts`; (d) **separate non-pure commit**: D-07 `refresh.ts` lift. Each commit moves its tests + repoints mocks + edits baseline. | library entry removed        |
| 2           | `bottle` (leaf-first: `bottledSteam`, `provisionBottle`, `bridgeBottle`, `bridgeBottleLifecycle`)                                                                                                                                                                                                                                                                                                                                                                                          | bottle entry removed         |
| **smoke 1** | D-14 run #1                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | —                            |
| 3           | `gameInstall` (4), `user` (types, sign-in state leaf, sign-in, redeem), `games` (`bridgeRouteVerdict`, `gameMetadata`), `gameBridgeLaunch`                                                                                                                                                                                                                                                                                                                                                 | four entries                 |
| 4           | bridge/DRM: `helperRegistry`/`helperSpawn`, `shim*`, `runner*`, `drm*`/`bottleProcesses`                                                                                                                                                                                                                                                                                                                                                                                                   | four entries; baseline empty |
| 5           | SteamGame stub-cluster conversions (16 stubs, 15 sites, 6 prototype spies); close todo 1                                                                                                                                                                                                                                                                                                                                                                                                   | —                            |
| **smoke 2** | D-14 run #2                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | gate empty                   |

D-11: Phase 61 now shows 20/20 plans executed, verification `gaps_found` (ROADMAP line 150), 61-21..25 all have SUMMARY files and their `files_modified` touch only `src/backend/engine/*`, `game_config.ts`, `tools/index.ts`, `common/types.ts`, `sidecar/wineToolsFlowRegistration.ts`, frontend settings/install-dialog files: **none** of the ten in-scope files. 61's pending live UAT is what D-11 waits on.

## Code Examples

Count lines the way CONTEXT did (matches `wc -l`):

```js
// Source: this research (verified against wc -l on all 10 files)
function countLines(text) {
  return text.split('\n').length - (text.endsWith('\n') ? 1 : 0)
}
```

Equality-ceiling evaluation shape (adapted from `meta/indexedAccessRatchet.cjs` / `meta/knipRatchet.cjs`):

```js
// Source: pattern from meta/knipRatchet.cjs evaluate()
function evaluate(
  baseline /* {path: n} */,
  current /* {path: n} */,
  ceiling = 1000
) {
  const failures = []
  for (const [p, n] of Object.entries(current)) {
    const b = baseline[p]
    if (n > ceiling && b === undefined)
      failures.push(`over ceiling: ${p} has ${n} lines (max ${ceiling})`)
    else if (b !== undefined && n > b)
      failures.push(`grew: ${p} ${n} > baseline ${b}`)
    else if (b !== undefined && n < b && n > ceiling)
      failures.push(`lower ${p} to ${n} in this commit`)
    else if (b !== undefined && n <= ceiling)
      failures.push(`remove ${p} from the baseline in this commit`)
  }
  for (const p of Object.keys(baseline))
    if (!(p in current)) failures.push(`stale baseline entry: ${p}`)
  return failures
}
```

Spy repoint (typical, `games.test.ts`):

```ts
// before
import * as libraryModule from '../library'
jest.spyOn(libraryModule, 'startInstallPolling')
// after (the module that now OWNS the function, which the importer reads at call time)
import * as installPolling from '../library/installPolling'
jest.spyOn(installPolling, 'startInstallPolling')
```

## State of the Art

| Old                                                              | Current                                                                  | Impact                                                                       |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| 62: methods lifted to free functions with delegating class stubs | 65: stubs removed except interface members; library class gets no stubs  | Only 16 of 25 SteamGame delegations are removable (interface methods stay)   |
| `ts-prune` two-ledger ratchet                                    | `knip` identity ratchet (quick 261107-brs)                               | Moves must edit `meta/knip-baseline.txt`, not `meta/deadcode-baseline-*.txt` |
| "bottle first to shrink 61's diff" (roadmap)                     | 61 already extracted engine primitives (D-19); bottle goes after library | no change needed                                                             |

## Assumptions Log

| #   | Claim                                                                                                                                                                                        | Section        | Risk if Wrong                                                                                                       |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------- |
| A1  | Estimated module sizes (imports ~20-60 lines each; 62 over-estimated 10-25%)                                                                                                                 | Cluster maps   | A piece lands >800 or, rarely, a mover stays >1,000. The gate shows it per commit.                                  |
| A2  | `games.test.ts` describe-blocks need not move when `gameInstall` etc. split, because they drive `SteamGame` not the free functions (62 left it unsplit: 16.6k lines, 45 top-level describes) | Test inventory | If D-03 is read to require moving them, the cost is a very large carve of `games.test.ts`. Confirm in discuss/plan. |
| A3  | Live bindings of exported `let` work under ts-jest CJS and the esbuild sidecar bundle                                                                                                        | Pitfalls       | If wrong, accessor functions are mandatory (recommended anyway).                                                    |
| A4  | `pnpm smoke:sidecar` and `build:sidecar-sea` are the right sidecar-level checks (names from package.json scripts; not run here)                                                              | Validation     | Planner should run once at baseline.                                                                                |
| A5  | The 3 steam-suite baseline failures and 5 adjacent-suite failures are pre-existing and unrelated (run on current `main` working tree, which has uncommitted changes in `.planning/spikes`)   | Validation     | A "new" failure may be misattributed. Re-run baseline on the clean commit before wave 1.                            |
| A6  | `user.ts` sign-in methods are called only from `sidecar/steamAuthFlowRegistration.ts` and tests (AST/grep for `SteamUser.<method>`; dynamic property access not checked)                     | user.ts        | An unseen caller would need repointing.                                                                             |

## Open Questions (RESOLVED)

1. **`user.ts`: how far do we go, and may public static methods become free functions?**
   - Known: it is one static class with shared private state; sign-in flows (~390 lines) and `redeemKey` (~136) have a single non-test caller each. A no-stub extraction leaves ~870 lines.
   - Unclear: user may prefer keeping `SteamUser.startQRLogin` etc. as the public API (delegating statics, ~40 lines, still under the ceiling at ~910).
   - Recommendation: free functions, single-importer repoint, no stubs (consistent with D-07's stance). Confirm during planning because it changes ~5 test files' calls.
   - RESOLVED: D-15 (free functions, no delegating statics; executed in 65-12).
2. **D-10 exception for `activePolls`.** The Map has to live in a leaf for acyclicity while the timer is created/unref'd in `installPolling.ts`. Confirm this is acceptable (the exit-contract text remains satisfied: unref is adjacent to the `setInterval`).
   - RESOLVED: D-16 (documented D-10 exception for `library/pollState.ts`; 65-02).
3. **Lift-stub todo premise.** 9 stubs are interface methods; 15 (not ~30) call sites. Confirm the todo is closed on "16 internal stubs removed; interface methods stay".
   - RESOLVED: corrected lift-stub scope in CONTEXT (16 non-interface stubs removed, 9 `Game` interface methods stay thin; 65-13 and 65-19).
4. **Order of games.ts.** Stub removal (D-12 step 6) alone leaves games.ts at ~1,022; either pull one stub cluster into step 4 or add the `getBridgeRouteVerdict` + `fetchMetadataIfNeeded` cuts (this research recommends the latter plus a pulled-forward stub cluster).
   - RESOLVED: 65-13 plus D-18 (eligibility + uninstall stubs pulled forward; install-cluster fallback if still >= 1,000).
5. **`bottle/` directory vs flat siblings** (five pieces). Either works; flat avoids a rename of the file with the highest test fan-out.
   - RESOLVED: flat siblings (65-07/65-08/65-09).

- D-03 question (Assumption A2, `games.test.ts` describes under splits): RESOLVED: D-17 (describes that test through `SteamGame` stay; only mocks/spies repointed; direct free-function tests move).

## Validation Architecture

(`workflow.nyquist_validation` not set to false; enabled.)

### Test Framework

| Property           | Value                                                                            |
| ------------------ | -------------------------------------------------------------------------------- |
| Framework          | jest 29.7 + ts-jest, `projects`: Backend, Common, Frontend, Preload, Meta, relay |
| Config file        | `jest.config.js` (root), `src/backend/jest.config.*`, `meta/jest.config.js`      |
| Quick run command  | `npx jest src/backend/storeManagers/steam --silent --maxWorkers=8`               |
| Full suite command | `pnpm test:ci` (workers; `workerIdleMemoryLimit: 1GB`, do not use `--runInBand`) |

Measured today (2026-11-07, 30-core macOS): **Steam backend suites: 114 suites, 4,384 tests, 23.4 s wall.** Baseline failures (3, all pre-existing): `bottle.test.ts` "DRM*LAUNCH_FORM equals launch_form in 56-01-SUMMARY.md" and `games.test.ts` "channel constants equal the 56-01 SUMMARY values" (both ENOENT on `.planning/phases/56-.../56-01-SUMMARY.md`), and `macArchKnownFixRouting.test.ts` "Intel: never seeds and does not take the bottle-branch result". **Adjacent run** `npx jest src/backend/sidecar src/backend/gamedetails src/backend/__tests__ meta --silent --maxWorkers=8`: 231 suites, 5,598 tests, ~170 s, 5 failing tests in 4 suites, all pre-existing and unrelated: `tauriShellSource`, `genI18nGateScope`, `logSecretGate` (2 tests; `utils/uninstaller.ts:131`), `x86CallbackWineHarness` (needs the Wine harness). Treat a \_new* failing test name as a regression; a failing baseline name is not.

### Phase Requirements -> Test Map

| Req          | Behavior                                                                                                       | Test Type                                        | Automated Command                                                                                                                                            | File Exists?             |
| ------------ | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------ |
| D-01/02/13   | Gate fails on over-ceiling, growth, stale and below-limit entries; excludes tests/generated; guards zero-files | unit (meta)                                      | `npx jest --selectProjects Meta meta/__tests__/steamLineCeiling.test.ts`                                                                                     | Wave 0                   |
| D-02         | Gate wired in script, lint.yml, pre-push                                                                       | unit (meta)                                      | `npx jest meta/__tests__/boundaryWiring.test.ts meta/__tests__/steamLineCeilingWiring.test.ts`                                                               | extend existing / Wave 0 |
| D-02         | Real tree is within the baseline                                                                               | CLI                                              | `pnpm steam-line-ceiling`                                                                                                                                    | Wave 0                   |
| D-03/05      | Moves are behaviour-neutral: per-module + importer suites                                                      | integration                                      | `npx jest src/backend/storeManagers/steam --silent --maxWorkers=8`                                                                                           | exists                   |
| D-05/13      | Dependency rules at zero                                                                                       | CLI                                              | `pnpm boundaries` (1.7 s)                                                                                                                                    | exists                   |
| D-07         | refresh/refreshInstallState via class still reachable                                                          | integration                                      | `npx jest src/backend/sidecar/__tests__/skeletonFlows.test.ts src/backend/sidecar/__tests__/steamFocusRefreshWire.test.ts` + library `refresh.test.ts`       | exists / Wave 1          |
| D-10         | Exit contract: unref assertions, exit by drain                                                                 | unit + smoke                                     | `npx jest -t "unref" src/backend/storeManagers/steam` ; `pnpm smoke:sidecar`                                                                                 | exists                   |
| Gates        | knip, indexed access, typecheck, lint, i18n                                                                    | CLI                                              | `pnpm find-deadcode`, `node meta/indexedAccessRatchet.cjs`, `pnpm codecheck`, `pnpm lint`, `pnpm i18n --fail-on-update`                                      | exists                   |
| Stub removal | Free-function spies replace `SteamGame.prototype` spies                                                        | integration                                      | `npx jest src/backend/storeManagers/steam/__tests__/games.test.ts`                                                                                           | exists                   |
| D-14         | Live macOS smoke                                                                                               | manual-only (needs CrossOver + Steam + operator) | `pnpm tauri:dev` (restart so the sidecar is rebuilt); bridged title, Grim Dawn 219990 DRM mode, small install/uninstall, Library refresh + running indicator | n/a                      |

### Sampling Rate

- **Per task commit:** the owning module's test file plus its importers (`npx jest <path>`), `pnpm boundaries`, `pnpm steam-line-ceiling`, `npx prettier --check <exact paths>`.
- **Per wave merge:** `npx jest src/backend/storeManagers/steam --silent --maxWorkers=8`, `pnpm codecheck`, `pnpm lint`, `pnpm find-deadcode`, `pnpm boundaries`, `node meta/indexedAccessRatchet.cjs`.
- **Phase gate:** adjacent run above (compare to the 5-failure baseline), `pnpm test:ci`, `pnpm smoke:sidecar`, both D-14 live smokes, then `graphify update .`.

### Wave 0 Gaps

- [ ] `meta/steamLineCeiling.cjs`, `meta/steamLineCeilingBaseline.json`, `package.json` script, `lint.yml` step, `.husky/pre-push` line 2
- [ ] `meta/__tests__/steamLineCeiling.test.ts` (+ wiring test)
- [ ] `.dependency-cruiser.cjs` leaf regex extended + seeded-violation test in `meta/__tests__/boundaryGates.test.ts`
- [ ] Re-run baselines on the clean commit once (A5)

## Security Domain

Refactor with no behaviour change, no new inputs, endpoints, secrets handling or dependencies. ASVS V2-V6 do not apply to the moves themselves. Standing controls that a move can accidentally disturb:

| Control                                                                                                             | Where                                                                                                                       | Risk                                                                      | Check                                                                                     |
| ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Log-secret gate (no unreduced `stderr`/token in logs)                                                               | `meta/__tests__/logSecretGate.test.ts`, `// log-secret-gate-exempt` comments in `provisionBottle` / `provisionBridgeBottle` | Moved exemption not re-pinned, or a comment dropped                       | update pinned file list; keep comments verbatim                                           |
| Steam credentials / token handling                                                                                  | `user.ts` (`password storage safety` tests, `tokenStore`, `keyringTokenStore.test.ts:1619` reads `user.ts` text)            | The source-scan reads `user.ts`; moved sign-in code must still be scanned | retarget scan to `userSignIn.ts`, `userSignInState.ts`, `userRedeem.ts`; keep non-vacuity |
| Path containment (`isPathContainedIn`, `isContained`, `safeRemove`, `removeInside`, `guardPerGameBridgeBottleName`) | library, runnerClone, bottle                                                                                                | Behaviour must be byte-identical                                          | pure-move diffs only; review with `git diff --color-moved`                                |
| Redeem-key payload never logged                                                                                     | `redeemKey`                                                                                                                 | moved with comments                                                       | source-scan test `steamAuthFlows`                                                         |

## Sources

### Primary (HIGH confidence, measured this session)

- Repo files read: `65-CONTEXT.md`, `.dependency-cruiser.cjs`, `meta/knipRatchet.cjs`, `meta/indexedAccessRatchet.cjs`, `meta/lintScoped.cjs`, `meta/knip-baseline.txt`, `.github/workflows/lint.yml`, `.husky/pre-push`, `meta/__tests__/boundaryWiring.test.ts`, `boundaryGates.test.ts`, `package.json`, `jest.config.js`, `.claude/skills/gamelib-conventions/SKILL.md` (exit contract), `62-*-SUMMARY.md`, `61-2{1..5}-PLAN.md` front matter, `ROADMAP.md`, todos.
- TypeScript compiler API scans (this session's scripts in the session scratchpad: `map.cjs`, `assign.cjs`, `fan.cjs`, `usage.cjs`, `members.cjs`, `memedges.cjs`): top-level statement maps, cross-cluster reference edges, importer fan-out including `require`, dynamic `import()` and `jest.mock/requireActual/requireMock`.
- Test runs: Steam backend suite and adjacent suites (timings and baseline failures above); `pnpm boundaries` (green).

### Secondary / Tertiary

- None. No library documentation was needed (no external libraries involved), so Context7/WebSearch were not used.

## Metadata

**Confidence breakdown:**

- Standard stack / gate design: HIGH - mirrors two existing ratchets read in full.
- Cluster maps and edges: HIGH for line ranges and reference edges (compiler API); MEDIUM for estimated sizes.
- Spy-behaviour predictions: MEDIUM - identified from spy lists and edge direction; each spy still needs a per-test check at execution.
- `user.ts` approach: LOW-MEDIUM - requires a user decision.

**Research date:** 2026-11-07
**Valid until:** line numbers drift with any commit touching these files; re-measure with `wc -l` at plan time (7 days).
