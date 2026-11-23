# Phase 90: Steam services and TypeScript depot path - Context

**Gathered:** 2026-11-24
**Status:** Ready for planning (Phase 90 first; 90.1 and 90.2 plan from this same file)

<domain>
## Phase Boundary

Every non-bridge Steam operation is served by Rust and its TypeScript is deleted (STM-02). That
covers sign-in (QR, credentials, SteamGuard), redeem, install, update, uninstall, launch
dispatch, `steamLaunchWatch`, Mac Steam adoption with the pending-adoption record and
restart-on-Play, `depot/` and `depotRust/`, and the Steam-services state rows that
`82-STATE-OWNERSHIP.md` flips in 90: `steam-session-state:signIn`, `steam-user`,
`steam-anonymous-client`, `steam-token-store`, `steamcm-config-gate`, `steam-install-runtime`,
and the store mirrors `steamConfigStore` (see its R2 note), `steam_pending_adoption`,
`steam_update_prompt_ack` and `steam_direct_launch_verdict`. The CM session and depot calls become
in-process Rust calls and `ShellJobHost` goes (SC3).

**This work is split into three sub-phases (D-01)** that run in order and share this CONTEXT:

- **90: Steam session, sign-in and redeem.** The CM session, anonymous client, token store and
  configure gate run in-process. Sign-in (QR, credentials, SteamGuard), sign-out, redeem and
  Refresh run on native channels.
- **90.1: Install, update, uninstall and the depot path.** `depot/`, `depotRust/`, the depot job
  registry and progress run in-process with no `ShellJobHost`. Install, update (with the badge and
  update prompt), uninstall, verify and the shared-redist download (D-09) move too.
- **90.2: Launch, adoption and the router.** The launch route, `gameLaunch`, `steamLaunchWatch`,
  `directLaunch`, Mac Steam adoption and restart-on-Play move. `games.ts` is deleted and replaced by
  the thin TS router (D-04). Runs the one live gate (D-12).

Out of scope: the bridge install, launch, bottle, DRM, overlay and known fixes (95–97). Their TS
stays and is reached through the D-04 router. Also out: the download manager queue (93, which
calls the router until then), Steam Move install (Phase 101, todo
`2026-11-20-implement-steam-move-install.md`), and Phase 89's library state (already Rust when 90
starts).

</domain>

<decisions>
## Implementation Decisions

### Phase shape
- **D-01:** **Three sub-phases: 90 (session, sign-in, redeem) → 90.1 (install, update, uninstall,
  depot) → 90.2 (launch, adoption, router, `games.ts` deletion).** The order is fixed: every
  install, depot-key and redeem call rides on the in-process session, and `games.ts` goes last,
  once nothing non-bridge needs it. Each sub-phase records its own goldens from the TS before
  porting and deletes its own TS and registrations. Non-bridge Steam TS is about 22k lines across
  these areas (install/depot about 8.2k, launch/watch/directLaunch about 4.6k, update/uninstall/verify
  about 3.4k, sign-in/redeem/CM/token about 3.1k, `games.ts`+metadata about 1.6k, adoption/Mac
  Steam about 1.5k), plus shared helpers.
- **D-02:** **The ROADMAP is amended in this discussion.** The Phase 90 entry is rewritten and 90.1
  and 90.2 are inserted, with SC1–SC4 divided between them and SC4's deletion list split by slice.
  Phases 91 and 95 now depend on 90.2. Each sub-phase goes straight to `/gsd-plan-phase`, with no
  separate discuss.
- **D-03:** **Gates: goldens only for 90 and 90.1; one live gate at the end of 90.2 (D-12).** 90
  and 90.1 close on goldens and three-OS CI with no signed build checkpoint and no operator
  session. A live failure in 90.2's gate may trace back to any of the three, so research should
  make the goldens of 90 and 90.1 dense enough to localise it.

### Bridge seam
- **D-04:** **`games.ts` is deleted and a thin TS router replaces it until 97.** For install,
  update, uninstall, launch and stop, the router asks Rust for the route (D-05). It sends bridge
  routes to the bridge TS and every other route to typed Rust shims. Its body is only that branch:
  no state, no orchestration. Bridge modules use `SteamGame` 28 times, almost all as a type
  parameter. They take a narrow `SteamGameHandle` interface (appId, the reads they need through
  the D-07 mirror, writes through shims) in place of `SteamGame`. Each bridge branch of the router
  is a schedule-test row deleted with its bridge slice: install in 95, launch and stop in 96, DRM
  in 97. TS calls Rust and Rust never calls TS, following 87 D-03 and 88 D-01 and ARCHITECTURE
  anti-pattern 2. — **Reversibility:** costly — every bridge module's signature moves from
  `SteamGame` to `SteamGameHandle`, and 95–97 each remove a branch.
- **D-05:** **Rust owns the route verdict from 90.2.** `bridgeRouteVerdict`, `isBridgeEligible`
  (`gameEligibility.ts`) and the launch-route choice in `launchDispatch.ts` are ported in 90.2 and
  pinned by goldens. The router only branches on the answer, so "which path" has one owner. The
  verdict reads the bridge's on-disk facts (for example `findBridgeInstallBottle`) in Rust, without
  calling the bridge TS. If research finds a verdict input that only the bridge TS can compute,
  it surfaces that before planning 90.2, with no reverse call.
- **D-06:** **Operations with no bridge branch go on native channels.** Sign-in, sign-out, redeem,
  Refresh, the Mac Steam adoption ops and any other Steam channel with no bridge route become
  native Rust handlers, with no sidecar fallback, the zod entry deleted and the IPC snapshot
  regenerated (83 D-04/D-06/D-07, 89 D-19). Only install, update, uninstall, launch and stop pass
  through the D-04 router. The TS download manager calls the router until 93.
- **D-07:** **The 89 D-01 mirror and write shims are re-scheduled per user.** Each mirror reader
  and write shim gets the phase that ports its last TS user. Rows used only by non-bridge code are
  deleted in 90, 90.1 or 90.2. Rows the bridge TS still uses move to 95, 96 or 97.
  `82-STATE-OWNERSHIP.md` and the schedule tests (`storeMirrorSchedule.test.ts` and the shim
  schedule test) are amended together, in the sub-phase that changes each row. 90.2's last plan
  leaves no mirror row or shim whose only callers are non-bridge. The same per-user rule applies to
  the 90-scheduled store mirrors: `steamConfigStore` stays until 96 per R2, and any of
  `steam_pending_adoption`, `steam_update_prompt_ack` and `steam_direct_launch_verdict` that bridge
  code reads moves likewise.
- **D-08:** **SC4 holds by name.** `games.ts`, `depot/`, `depotRust/`, `gameLaunch`,
  `steamLaunchWatch` and `macSteam*` are deleted with their registrations. The router is a new,
  scheduled file, not a renamed `games.ts`.

### Shared redistributables
- **D-09:** **The 228980 download is ported in 90.1, and the lock moves to `bridge/`.**
  `depot/sharedRedist.ts` (511 lines) downloads the Steamworks Common Redistributables with the same
  plan, depot-key and content-server code 90.1 ports. It becomes a Rust depot job, and its bridge
  callers (`bridge/sharedRedistInstall.ts`, `gameInstallBridge.ts`, `gameBridgeWineLaunch.ts`,
  `bridge/bridgeRuntime.ts`) reach it through a shim deleted in 95. `depot/sharedRedistLocks.ts`
  (44 lines) moves unchanged to `bridge/` and flips to Rust in 95, as the
  `steam-install-runtime:shared-redist-lock` row says. `depot/` is fully deleted in 90.1.

### Sign-in and redeem
- **D-10:** **Sign-in state, the token store and the anonymous client become Rust state in 90.**
  This is the `steam-session-state:signIn` half that 89 left in TS (82 R4). The token stays in the
  OS keyring through the existing Rust dispatch with no new Keychain prompt (85 SC3). The
  auth-unlock latch, sign-in UI events and their payloads are unchanged (89 D-18).
- **D-11:** **Redeem is proven live only on its error paths.** No key is spent. Success is pinned
  by goldens from the TS (D-14).

### Live gate (90.2 only)
- **D-12:** **The one operator gate is a signed 90.2 build installed over a signed Phase 88
  build**, because 89, 90 and 90.1 produce no gated signed build (D-03, D-13). It is authored as
  `90.2-HUMAN-UAT.md` before 90.2's coding, in the UAT item shape (gamelib-conventions), and any
  offline step follows the offline-UAT memory. Six items:
  1. **Refresh mid-install, launch, uninstall.** Start a native depot install of a Steam game and
     run an explicit Refresh mid-download. The install state survives, the install finishes and
     shows as installed with its size, and one launch moves launching → playing → done with
     playtime recorded and no stale status. Then uninstall: the files are gone and the entry
     returns to not installed. This is the live uninstall proof 89 deferred.
  2. **Update badge.** A game with a pending update shows the badge. Updating clears it, and the
     badge stays cleared after a Refresh and after a restart.
  3. **Upgrade and crash survival.** The 88 → 90.2 upgrade keeps the library, installed state,
     badges, the sign-in (no Keychain prompt), update-prompt acks and pending-adoption records. A
     `kill -9` of GameLib mid-install followed by reopening shows the game incomplete and
     resumable. A game removed outside GameLib disappears after the boot reconcile.
  4. **Mac Steam adoption and restart-on-Play.** With Mac Steam running, a GameLib install leaves a
     pending-adoption record. Play restarts Steam, Steam adopts the install and the game launches
     through `steam://`. One Mac Steam-managed title also moves through the poll path in item 1 or
     2 (carried from 89 D-15).
  5. **Sign-in.** Sign out, then sign in with QR. Sign out again, then sign in with credentials
     plus a SteamGuard code. Neither raises a Keychain prompt, and the token survives a restart.
  6. **Redeem errors.** An already-owned key and an invalid key each give the right message
     (D-11).
- **D-13:** **Phase 89's live gate moves here.** At the user's direction, 89 closes on goldens and
  three-OS CI only. Its three gate items (89 D-14) are merged into items 1–3 above, and 89 D-15's
  Mac Steam-managed title is merged into item 4. `89-CONTEXT.md` D-14/D-15 are amended in the same
  commit as this file, and no `89-HUMAN-UAT.md` is authored. Bridge-bottle library-state live
  proof still waits for 95–97.

### Carried forward (already decided, not re-asked)
- **D-14:** Goldens are recorded from the TS before porting, in the 88 D-11 shape with the Phase 82
  D-05 vacuous-pass guards. They assert entries and emits, not `applied` flags (89 D-17). Each
  sub-phase deletes a sub-slice's TS once its goldens pass. There is no flag, and a failure is
  fixed in Rust, never revived (87 D-06, 88 D-18, 89 D-16).
- **D-15:** Event names and payloads stay the same, so the renderer is untouched (86 D-08, 89 D-18).
- **D-16:** The launch single-flight has one Rust owner (88 D-04). The ported Steam dispatch joins
  it in-process. The router's launch branch for the bridge joins it through the existing shim.
- **D-17:** Rust writes library and session state only through the 89 actor's field-group write API
  (89 D-10) and run tokens (89 D-11). The ported services are callers of that API, not new writers.
- **D-18:** Quirks are copied for parity and each is filed as a todo with the three triage keys. A
  golden diff never mixes a port with a fix (86 D-03, 88 D-20).
- **D-19:** The Rust shutdown contract applies: spawns go through `gamelib-proc` (Steam relaunch and
  helpers as `SpawnClass::Helper`), in-flight work (depot jobs, the CM session, adoption watches)
  holds a Shutdown Registrant, exit work fits `ExitBudget::DEFAULT`, and boot work is bounded.
  Load `Skill("gamelib-conventions")` before planning.
- **D-20:** Two-profile rule: the TS golden harness is isolated with `createFakeHomeProfile()`, and
  any real-profile arm (a real Steam root or a real Mac Steam install) is named and justified.
- **D-21:** Windows and Linux are proven by golden replay on the three-OS CI matrix, and any
  real-title live check moves to Phase 99 (86 D-16, 88 D-16).
- **D-22:** v0.11 rules: the gate is authored before coding, and each sub-phase's last plan leaves
  no TS or registration for the modules it ported, except the D-04 router and the D-07 rows that
  are scheduled past it.

### Claude's Discretion
- The crate layout: a Steam services crate as `82-STATE-OWNERSHIP.md` names it, or modules in
  `gamelib-steamcm`/`gamelib-depot`/`gamelib-steampoll`, keeping dependencies one-way (services
  call the 89 actor, never the reverse).
- How `ShellJobHost` is replaced in-process: a `JobHost` that emits to the frontend directly and
  answers CDN-token asks in Rust.
- The `SteamGameHandle` shape and the router's file name and location.
- Plan and wave breakdown inside each sub-phase.
- How SC1–SC4 are worded in the inserted 90.1/90.2 roadmap entries, within D-01/D-02.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone scope and requirements
- `.planning/ROADMAP.md` § "Phase 90", "Phase 90.1", "Phase 90.2" (amended per D-02)
- `.planning/REQUIREMENTS-v0.11.md`: STM-02 (and STM-03..05 for the bridge boundary)
- `.planning/research/v0.11/SUMMARY.md`: item 90 ("`games.ts` surface … `ShellJobHost` in-process; Steam shims deleted") and ruling 4 (bridge last)
- `.planning/research/v0.11/PITFALLS.md`: the stale-snapshot write-back list and the concurrency-model requirement

### Ownership and prior contracts
- `.planning/phases/82-guardrails-hygiene-and-shared-safety-primitives/82-STATE-OWNERSHIP.md`: the 90 rows (persisted mirrors, in-memory `steam-session-state:signIn`, `steam-user`, `steam-anonymous-client`, `steam-token-store`, `steamcm-config-gate`, `steam-install-runtime`, `steam-install-runtime:shared-redist-lock` at 95), risks R2 and R4; amend per D-07
- `.planning/phases/89-steam-library-state/89-CONTEXT.md`: D-01/D-02 (mirror and shims re-scheduled by D-07), D-10/D-11 (the write API the services call), D-14/D-15 (amended by D-13)
- `.planning/phases/88-launch-pipeline/88-CONTEXT.md`: D-01 (managers stay TS and call Rust), D-03 (bridge reaches Rust through shims), D-04 (single-flight), D-11 (golden shape), D-17 (the signed 88 build this gate installs over)
- `.planning/phases/87-engine-wine-and-tools/87-CONTEXT.md`: D-03/D-24 (bridge shims and the sync pure twin), D-06 (no flag)
- `.planning/phases/86-pure-leaf-services/86-CONTEXT.md`: shim/resolver pattern and schedule test (D-05, D-06), TS golden harness (D-11)
- `.planning/phases/85-store-host-config-and-versioned-migrations/85-CONTEXT.md`: StoreHost, mirror deletion schedule, no new Keychain prompt (SC3)
- `.planning/phases/83-native-seam-gamelib-core-and-process-shutdown-contract/83-CONTEXT.md`: router, no-fallback, schema authority
- `.planning/research/STEAM-STACK.md`: the Rust CM stack, Web-API sign-in and the Mac Steam path (read for sign-in, depot or launch plumbing)
- Phase 79 / 80 / 81 records under `.planning/milestones/v0.10-phases/`: the CM client, the install/uninstall/update state machines, and restart-on-Play (81)

### Patterns to copy
- `src/backend/__tests__/storeMirrorSchedule.test.ts`, `engineWineShimSchedule.test.ts`, `*PortComplete.test.ts`: schedule rows and delete gates
- `src-tauri/crates/README.md`: per-domain crate recipe, §7 verification and deletion, §8 CI
- `CLAUDE.md` Conventions table + `Skill("gamelib-conventions")`; `Skill("spike-findings-gamelib")` for Mac Steam integration, depot pipeline and Web-API sign-in

</canonical_refs>

<code_context>
## Existing Code Insights

### TS that is deleted (under `src/backend/storeManagers/steam/`)
- 90: `user*.ts` (`userSignIn`, `userSignInState`, `userRedeem`, `userTypes`, `user`), `authTrigger`, `tokenStore`, `rustSession`, `logonVerdict`, `anonymousClient`, `clientSetup`, `cm/`
- 90.1: `depot/` (2.4k lines), `depotRust/` (2.1k: `jobRegistry`, `progressBridge`, `updateEstimate`, …), `gameInstall`, `gameInstallDepot`, `installFormIpc`, `installLocation`, `steamInstallRuntime`, `steamInstallApp`, `depot*.ts`, `acfInstalldir`/`acfInstalledDepots`, `queueHeadRevalidation`, `update*.ts` except `updateBridge`, `autoUpdateAttempts`, `gameUninstall`, `nativeDelete`, `safeSteamRemove`, `removeAllCopies`, `cancelDelete`, `validateNative`, `optInDlc`, `setupDownloads`
- 90.2: `games.ts` (753), `gameLaunch` (923), `gameLaunchOverlay` (433), `launchDispatch`, `steamLaunchWatch` (462), `steamLaunchRuntime`, `steamLaunchedDeps`, `stopSteamLaunchedGame`, `steamProcesses`, `steamClientProcess`, `gameProtocolUrl`, `runningFromFolder`, `directLaunch/` (1.1k), `gameEligibility`, `bridgeRouteVerdict` (D-05), `macSteamAdoption` (496), `macSteamClient`, `adoptionStatus`, `adoptionWatch`, `playAdoption`, `gameMetadata`, `metadataCapture`, `state.ts` remnants
- The planner assigns stragglers (`gameMaintenance`, `moveNative` stub, `titleSettings`, `gameConstants`, …) by their last caller.

### Rust already in place
- `gamelib-steamcm` (+cli): CM session, sign-in, Refresh, enrichment, depot keys, redeem. Today these are reached through `rustInvoke` from TS.
- `gamelib-depot` plus `src-tauri/src/depot_dispatch.rs` `ShellJobHost` (streams progress to Node as `send` frames and asks Node for CDN tokens). This is the round trip SC3 removes.
- `gamelib-steampoll` (polls, restart hold, `adoption.rs`) and the 89 `gamelib-steamlib` actor
- `gamelib-steamfiles` (ACF/VDF), `gamelib-store`, `gamelib-safety`, `gamelib-proc`

### Bridge coupling (D-04)
- About 15 bridge modules import `SteamGame` (24 type-only and 4 value imports): `gameBridgeLaunch`, `gameBridgeLaunchGate`, `gameBridgeWineLaunch`, `gameInstallBridge`, `verifyBridge`, `updateBridge`, `bridgeInstallState`, `bridgeWaitNotice`, `gameEngineDialogs`, `noticeSeq`, …
- `games.ts` routes to the bridge: `updateBridgeGame` (opt-in DLC and update), `bridgeBottle.findBridgeInstallBottle`, `stopPerGameBridgeBottle`, `gameSession.bridgeLaunchBottles` in stop
- `storeManagers/index.ts` `steam:` entry and `ManagerDeps` (`steamSession`, `steamUser`, `steamInstallRuntime`, `steamLaunchRuntime`, `steamProcesses`, `steamBottle`) are wired to the router and shims

### Integration points
- Renderer Steam channels: native per D-06, or through the router for the five routed ops
- Download manager (TS until 93) calls the router for Steam installs and updates
- `sidecar/bootstrap.ts` boot steps `steam-user`, `steam-anonymous-client`, `steam-token-store`, `steam-install-runtime` and `host-services` (the configure gate) shrink or go

</code_context>

<specifics>
## Specific Ideas

- Gate titles: a small native depot install large enough to Refresh mid-download, a game with a
  pending update, and a Mac Steam-managed title. The operator picks the exact titles.
- The crash item uses `kill -9` on the GameLib app process mid-install, not on Steam.
- Redeem keys for the gate: one already-owned key and one syntactically invalid key.

</specifics>

<deferred>
## Deferred Ideas

- Redeem success live: never spends a key. Goldens only (D-11).
- Bridge branches of the router → 95/96/97 (D-04). Bridge-used mirror rows → 95–97 (D-07).
- The shared-redist lock and install → 95 (D-09).
- Any quirk the port copies → individual todos (D-18).

### Reviewed Todos (not folded)
`todo.match-phase 90` matched 20 pending todos, all on generic keywords. None is a Phase 90 port.
The closest were reviewed and left: `2026-11-20-implement-steam-move-install.md` (Phase 101),
`2026-11-22-play-here-on-the-other-device-prompt.md` (a new capability), and
`2026-11-21-ts-launched-games-die-on-gamelib-sigkill-unix.md` (88's; Steam launches go through
`steam://`). The rest were x86 flat API parity, the winebus PowerA wedge, the gamelib-log
Windows golden, the ITAD tie-break, recent games with an empty appName, the Rust wiki title, the
umu cached-null refetch, packaged-app blank render, GOG Windows elevation, the GOG offline library
cache, PCGW cargoquery, the runtime-cache allow-list, the bottle port quirks, unsigned Windows
releases, the protonfixes import tool and the dead imagecache branch.

</deferred>

---

*Phase: 90-steam-services-and-typescript-depot-path*
*Context gathered: 2026-11-24*
