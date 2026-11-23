# Phase 89: Steam library state - Context

**Gathered:** 2026-11-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Steam library state, game-session state and update detection move into one Rust owner (STM-01),
the `gamelib-steamlib` actor that `82-STATE-OWNERSHIP.md` names for the `libraryState`,
`gameSession` and `update-detection cache` rows (all scheduled to flip in 89). The Phase 80 TS
state-event handler (`src/backend/sidecar/steamPollEventRegistration.ts`), the outbox/ack/seq
protocol in `gamelib-steampoll` and the shell, any surviving `polls=ts` remnant (the
`GAMELIB_STEAM_POLLS` flag itself was already deleted in Phase 80; research confirms nothing is
left) and the TS poll remnants (`library/uninstallPolling.ts`, `library/installPolling.ts`,
`library/runningPoll.ts`, `pollRust/*` as far as they only serve the event path) are deleted, with
their sidecar registrations, in this phase.

In scope (the state that moves, D-03): the in-memory library Map and `steamLibraryStore`,
installedMap and refresh, the game-session maps (`gameSessionState.ts`: `nativeInstallsInFlight`,
the bridge pre-flight joins, `forcedWindowsViaBottle` and the rest), the update-state cache
(`updateDetection.ts` `updateStates` plus estimates), resume breadcrumbs
(`library/resumeBreadcrumbs.ts`, `library/resume.ts`), and applying the Mac arch verdict
(`library/macArch.ts`; `macArchStore`). The TS store mirrors scheduled for 89 in
`82-STATE-OWNERSHIP.md` (`macArchStore`, `steam_library`, `steam_metadata`, `steam_sync`) are
deleted here unless D-06 moves a row.

Out of scope: the Steam services and every remaining TS Steam operation — `games.ts`, install,
uninstall, update, launch dispatch, `steamLaunchWatch`, sign-in, redeem, Mac Steam adoption,
`steam-install-runtime` (depot job registry, restart-hold bookkeeping) — all Phase 90; the store
metadata fetch path and its limiter (D-05, Phase 90); the bridge (95–97).

</domain>

<decisions>
## Implementation Decisions

### Ownership boundary and the TS left for Phase 90
- **D-01:** **Rust is the only writer. The TS that stays until 90 reads a read-only mirror.** The
  sidecar keeps a read-only copy of the Steam library and session state that Rust pushes on every
  change, on the same ordered frame path as `pushGameToLibrary`. Sync readers such as
  `SteamGame.getGameInfo()` stay sync. Every TS write (about 20 Steam modules today, among them
  `resumeBreadcrumbs`, `bridgeInstallState`, `gameUninstall`, `gameInstall`, `macArchKnownFix`,
  `playAdoption`, `queueHeadRevalidation`) becomes a typed async `rustInvoke` shim. The mirror and
  each shim are schedule-test rows with deleting phase 90 (86 D-05/D-06 pattern; the 85
  `storeMirrorSchedule.test.ts` shape). Research lists each sync write site and its async ripple.
  — **Reversibility:** costly — every Steam TS module that 90 deletes reads through the mirror and
  writes through the shims until then.
- **D-02:** **A write shim gives read-your-writes.** It resolves only after Rust has applied the
  change and the mirror holds it (the Rust reply carries the resulting entry, and the shim updates
  the mirror before it resolves). A caller that awaits its write always reads that write back,
  which is the same guarantee the current sync Map gives.
- **D-03:** **The owner holds four groups:** (1) the library Map + `steamLibraryStore`, installedMap
  and refresh; (2) the game-session maps. The Phase 80 R7 direction reverses here: Rust owns
  `nativeInstallsInFlight`, and the TS push `steampoll_native_in_flight` is deleted. (3) The
  update-state cache and estimates; the anonymous PICS read is already Rust. (4) Resume
  breadcrumbs and applying the Mac arch verdict (Phase 80 R5/R6 deferred both to here).
- **D-04:** **Mac arch: Rust owns the state and TS owns the prompt.** Rust writes the verdict into
  the library entry, `macArchStore`/`steamMetadataStore` and the known-fix report, then emits an
  event. The i386 recovery prompt and its reinstall through `SteamGame` stay in TS, triggered by
  that event, until 90 deletes them.
- **D-05:** **The metadata-fetch limiter stays TS until 90.** `pendingFetches`, the 5-slot
  semaphore and the 15 s timeout in `state.ts` belong to the store-metadata fetch path in
  `games.ts`, not to library state. They are split off from `SteamLibraryState` and go with 90.
- **D-06:** **Research settles the `steam_metadata` mirror row.** `82-STATE-OWNERSHIP.md`
  deletes its TS mirror in 89, but the fetch path that writes it stays TS (D-05). Default: those
  writes go through D-01 shims and the mirror is deleted in 89 as scheduled. If research finds a
  sync consumer that cannot be shimmed, amend the row to 90 in `82-STATE-OWNERSHIP.md` and
  `storeMirrorSchedule.test.ts` together.

### Phase 80 open warnings
- **D-07:** **A-WR-01 and A-WR-02 are verified, then closed.** Both were fixed after the re-review
  was written: `c4a444479` (other manifests' installdir reduced to the top-level folder; test in
  `gamelib-steampoll/tests/acf_copies_security.rs`) and `4a4100057` (running poll registered
  inside `start()`'s state lock; 8-thread barrier test in `tests/install_loop.rs`). The TS bottle
  path is guarded by C/EXTRA-01 (`gameUninstall.ts` refuses a nested installdir). Research checks
  each fix against the review's full case list: `Studio/GameB`, `Studio/`, `.\Studio`, the
  Windows `Studio.`/`Studio ` forms, and the start/stop interleave. Any missing case is added as a
  test first. Then amend the ROADMAP Phase 89 research flag and record the closure against the
  Phase 80 review.
- **D-08:** **No retry loop survives; bad events are bounded and logged once.** With the handler
  and outbox gone, Rust applies poll results to state it owns, in-process. Bounded string fields
  (`SizeOnDisk`, `buildid` and the like) are truncated, not rejected, so a corrupt ACF still moves
  install state. A write that fails is logged once per (appId, kind) and dropped, because the next
  poll tick or reconcile re-derives it from disk. This retires C-IN-04/IN-04 (the poison-event
  cap) and A-IN-01 (unbounded outbox log growth) together with the outbox.
- **D-09:** **The surviving Phase 80 Info findings become todos, not 89 work:** A-IN-01's
  `let _ = remove_file` half, A-IN-02 (dead `canon_root.parent()` check), A-IN-04
  (`pending_outcome.take()` order), A-IN-05 (`testing` feature in `gamelib-steampoll-cli`) and
  IN-03 (a cancelled running-poll task emits after `stop()`). Each is filed with the three triage
  keys. 89 stays a port (88 D-20). If the D-10/D-11 design makes IN-03 impossible, research says
  so and the todo is closed with that evidence.

### Stale write-back (SC3)
- **D-10:** **Field ownership: each field group has one writer class.** Install and update fields
  (installed, path, size, buildid, update state, incomplete) come only from disk via the polls and
  reconcile. Ownership and metadata come only from Refresh/enrichment. Session status comes only
  from the session (D-11). Breadcrumb and Mac arch fields come from their own writers. Refresh
  merges its own fields into the *current* entry when it finishes, so a slow Refresh (up to about
  150 s) can never overwrite install state it snapshotted earlier (79-REVIEW WR-01, WR-04). Every
  D-01 TS write shim is assigned to exactly one group. Research produces that table, and the
  planner pins it with a test per group. — **Reversibility:** costly — the field-group split is
  the actor's write API, which 90's ported services call.
- **D-11:** **Run tokens order game status.** Each install or launch run gets a token. A status
  from a token that is no longer current is dropped, and within a run status only moves forward
  (launching → playing → done; installing → done). This closes the 80 C-WR-01 shape (a late
  `launching` overwriting `playing`) for the state the actor owns.
- **D-12:** **Persistence: coalesced atomic writes through the existing Rust StoreHost.**
  `steam_library` is already Rust-persisted since Phase 85 (RH). A change marks the store dirty,
  and a short coalescing window (around 250–500 ms; research picks) writes it once, atomically.
  Exit flushes inside `ExitBudget::DEFAULT` and holds a `gamelib_core::shutdown::global()`
  Registrant. A Refresh of a large library is one write. The file stays byte-compatible with what
  the TS writes today.
- **D-13:** **Boot shows the store first and reconciles after.** The persisted store is served
  immediately so the library renders fast. A bounded reconcile against the ACFs then runs
  (crash mid-install → incomplete/resumable; a game removed outside GameLib → removed) and pushes
  corrections through the same event path. This matches today's TS boot order and the
  bounded-boot rule.

### Live gate
- **D-14:** **No live gate in Phase 89 (amended 2026-11-24 by `90-CONTEXT.md` D-13).** At the
  operator's direction, 89 closes on goldens and three-OS CI only: no signed Phase 89 build
  checkpoint and no `89-HUMAN-UAT.md`. The three items first planned here (Refresh during install
  then launch; the update badge and update; upgrade and crash survival with the boot reconcile) are
  merged into the single Phase 90.2 gate (`90-CONTEXT.md` D-12 items 1–3), which installs a signed
  90.2 build over a signed Phase 88 build. Because a 90.2 gate failure may trace back to 89, the
  89 goldens (D-17) must be dense enough to localise it.
- **D-15:** **The Mac Steam-managed title moves with the gate (amended 2026-11-24).** The one Mac
  Steam-managed title that proves the shared poll → state path is now in `90-CONTEXT.md` D-12
  item 4. Bridge-bottle library-state rows are still pinned by goldens only, and their live proof
  waits for 95–97.

### Carried forward (already decided, not re-asked)
- **D-16:** No flag. Each sub-slice's TS is deleted once its goldens pass, and a gate failure is
  fixed in Rust and never revived (87 D-06, 88 D-18).
- **D-17:** Goldens are recorded from the TS before porting (88 D-11 shape). For a state owner they
  record the input event sequences (poll results, Refresh results, TS writes) and the resulting
  library entries, emits (`pushGameToLibrary`, `gameStatusUpdate`, notifications) and store
  writes, with the Phase 82 D-05 vacuous-pass guards. The existing
  `steamPollStateEventParity.test.ts` fixture is a starting point, but its handler assertion
  cannot detect a refusal (80 IN-05). Assert entries, not the `applied` flag.
- **D-18:** Event names and payloads stay the same (`pushGameToLibrary`, `gameStatusUpdate`, the
  install/update notifications), so the renderer is untouched (86 D-08, 88 D-23).
- **D-19:** A native channel never falls back to the sidecar. Its Rust serde struct is the schema,
  the zod entry is deleted with the TS registration, and the IPC snapshot is regenerated
  (83 D-04/D-06/D-07).
- **D-20:** Quirks are copied for parity and each is filed as a todo with the three triage keys. A
  golden diff never mixes a port with a fix (86 D-03, 88 D-20).
- **D-21:** Rust shutdown contract: any spawn goes through `gamelib-proc`, in-flight work holds a
  Shutdown Registrant, exit work fits `ExitBudget::DEFAULT`, and boot work is bounded (D-13).
  Load `Skill("gamelib-conventions")` before planning.
- **D-22:** Two-profile rule: the TS golden harness is isolated with `createFakeHomeProfile()`. Any
  real-profile arm (for example a real Steam library root) is named and justified.
- **D-23:** Windows and Linux are proven by golden replay on the three-OS CI matrix, and any
  real-title live check moves to Phase 99 (86 D-16, 88 D-16).
- **D-24:** Amend `82-STATE-OWNERSHIP.md` in one amendment: confirm the 89 rows (`libraryState`,
  `gameSession`, `update-detection cache`, and the four store mirrors with D-06's possible move),
  add the D-01 in-memory read mirror as a row deleted in 90, and record that the update-state
  cache splits from `steam-install-runtime` (still 90).
- **D-25:** v0.11 rules: the live gate is authored before coding, goldens are recorded from TS
  before porting, and the phase's last plan leaves no TS or registrations for any ported module
  except the D-01 mirror and its scheduled shims.

### Claude's Discretion
- The crate: a new `gamelib-steamlib` (+cli) as `82-STATE-OWNERSHIP.md` names it, or modules in
  `gamelib-steampoll`, keeping a one-way dependency (the polls feed the actor, never the reverse).
- The actor shape (a tokio task with a command channel, or a mutex-guarded owner) and op names.
- The mirror's push granularity (per entry or batched per change set) and its frame format.
- The coalescing window inside D-12's bounds, and the reconcile's bound and ordering inside D-13.
- The sub-slice order (research may suggest the owner and mirror first, then the polls feeding it
  in-process and the handler/outbox deletion, then the update cache, then breadcrumbs and Mac
  arch).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone scope and requirements
- `.planning/ROADMAP.md` § "Phase 89: Steam library state": the goal and 4 success criteria; amend the research flag per D-07
- `.planning/REQUIREMENTS-v0.11.md`: STM-01 (and STM-02 for the Phase 90 boundary)
- `.planning/research/v0.11/SUMMARY.md`: item 89 ("one actor"; deletes the handler, outbox/ack/seq, `polls=ts`)
- `.planning/research/v0.11/PITFALLS.md`: the Phase 80 scaffolding bugs, the stale-snapshot write-back list (79 WR-01/WR-04/WR-02/WR-06, 80 A-WR-02, C-WR-01) and the concurrency-model requirement

### Phase 80 (what is deleted and what is still open)
- `.planning/milestones/v0.10-phases/80-steam-install-uninstall-and-update-polling-state-machines-in/80-REVIEW.md`: re-review; Part A WR-01/WR-02 (D-07), IN-01..IN-04 (D-09), Part C IN-03/IN-04/IN-05 (D-08, D-17)
- `.planning/milestones/v0.10-phases/80-steam-install-uninstall-and-update-polling-state-machines-in/80-REVIEW-FIX-{A,B,C}.md`
- `.planning/milestones/v0.10-phases/80-steam-install-uninstall-and-update-polling-state-machines-in/80-CONTEXT.md`: D-02/D-05/D-08 (the handler, ack and outbox being deleted) and its `<deferred>` list (libraryState, gameSession → here)
- `src-tauri/crates/gamelib-steampoll/src/lib.rs`: the Phase 80 design record R1–R7 (R2 handler, R5 breadcrumbs, R6 Mac arch, R7 native-in-flight push)
- Commits `c4a444479` (A/WR-01) and `4a4100057` (A/WR-02)

### Ownership and prior contracts
- `.planning/phases/82-guardrails-hygiene-and-shared-safety-primitives/82-STATE-OWNERSHIP.md`: the persisted-store rows due in 89 and the in-memory rows `libraryState`, `gameSession`, `update-detection cache` (amend per D-24)
- `.planning/phases/85-store-host-config-and-versioned-migrations/85-CONTEXT.md`: StoreHost owns persistence; the TS write-through mirror and its deletion schedule (D-19)
- `src/backend/__tests__/storeMirrorSchedule.test.ts`: mirror deletion schedule (update with D-06/D-24)
- `.planning/phases/86-pure-leaf-services/86-CONTEXT.md`: shim/resolver pattern and schedule test (D-05, D-06), signed upgrade gate, CI-only Windows/Linux
- `.planning/phases/87-engine-wine-and-tools/87-CONTEXT.md`: no flag (D-06), signed gate (D-12), sync pure twin (D-24)
- `.planning/phases/88-launch-pipeline/88-CONTEXT.md`: golden oracle shape (D-11..D-15), the 88 gate this phase installs over (D-17), carried-forward rules (D-18..D-25)
- `.planning/phases/83-native-seam-gamelib-core-and-process-shutdown-contract/83-CONTEXT.md`: router, no-fallback, schema authority

### Patterns to copy
- `src/backend/__tests__/steamPollsPortComplete.test.ts`, `*PortComplete.test.ts`, `engineWineShimSchedule.test.ts`: delete gates and shim schedule rows
- `src-tauri/crates/README.md`: per-domain crate recipe, §7 verification and deletion, §8 CI
- `CLAUDE.md` Conventions table + `Skill("gamelib-conventions")`

</canonical_refs>

<code_context>
## Existing Code Insights

### Modules that move (TS lines)
- `src/backend/storeManagers/steam/library/`: `rustRefresh.ts` 513, `acfState.ts` 443, `index.ts` 375, `uninstallPolling.ts` 305, `refresh.ts` 299, `resume.ts` 265, `installRoot.ts` 244, `macArch.ts` 237, `installedMap.ts` 213, `resumeBreadcrumbs.ts` 200, `acfUpdateState.ts` 94, `manifestFlags.ts` 83, `installPolling.ts` 78, `runningPoll.ts` 66, `localLibrary.ts` 52
- `steam/updateDetection.ts` 369, `steam/gameSessionState.ts` 294, `steam/state.ts` (library Map; the fetch limiter splits off per D-05), `steam/pollRust/{rustSteamPoll,steamPollTypes}.ts`
- `src/backend/sidecar/steamPollEventRegistration.ts` 268: deleted (SC2/SC4)

### Rust already in place
- `src-tauri/crates/gamelib-steampoll`: install/uninstall/update/running polls, restart hold, download monitor, `outbox.rs` (deleted), `events.rs` `StateEvent` (becomes an in-process input to the owner), `acf_copies.rs`, `adoption.rs`, `app_state.rs`
- Shell side: `src-tauri/src/steampoll_dispatch.rs` (`ShellPollHost::state_event`, READY replay, `retry_pending`), all of it ack/outbox plumbing that goes
- `gamelib-steamfiles` (ACF/VDF readers), `gamelib-store` (StoreHost persistence), `gamelib-safety` (atomic writes)

### Readers and writers of the library Map (non-test, by file)
- Steam: `resumeBreadcrumbs` 10, `steamPollEventRegistration` 7, `rustRefresh` 6, `games.ts` 6, `bridgeInstallState` 6, `uninstallPolling` 5, `macArch` 4, `library/index` 4, `gameUninstall` 4, `macArchKnownFix` 3, `resume` 3, `refresh` 3, `gameMetadata` 2, `gameInstall` 2, and one each in `updateDetection`, `safeSteamRemove`, `queueHeadRevalidation`, `rustSteamPoll`, `playAdoption`, `localLibrary`, `acfState`, `directLaunchOutcome`
- `updateStates`/`nativeInstallsInFlight`: `verifyBridge` 6, `gameSessionState` 6, `gameInstallDepot` 6, `updateDetection` 5, `updateBridge` 5, `updateLaunchPrompt` 2, `steamInstallRuntime` 2, and one each in `library/index`, `games.ts`, `depotRust/updateEstimate`
- (gog/legendary/nile `library.ts` hits are their own stores' maps, not Steam.)

### Integration points
- Renderer: `src/frontend/state/libraryState.ts` consumes `pushGameToLibrary`/`gameStatusUpdate`, unchanged (D-18)
- `sidecar/bootstrap.ts` boot steps that build `steam-session-state` lose libraryState/gameSession; sign-in state in the same object stays TS until 90 (`82-STATE-OWNERSHIP.md` "owned item by item")

</code_context>

<specifics>
## Specific Ideas

- Gate titles: one Steam game with a pending update, one native depot install large enough to run
  a Refresh mid-download, and one Mac Steam-managed title. The operator picks the exact titles.
- The crash item uses `kill -9` on the GameLib app process mid-install, not on Steam.

</specifics>

<deferred>
## Deferred Ideas

- All live proof, including uninstall → Phase 90.2's gate (D-14, amended; `90-CONTEXT.md` D-12/D-13).
- Live bridge-bottle library-state proof → Phases 95–97 (D-15).
- Phase 80 Info findings → individual todos (D-09).
- Any quirk the port copies → individual todos (D-20).

### Reviewed Todos (not folded)
`todo.match-phase 89` matched 20 pending todos, all on generic keywords and none in this phase's
domain: packaged-app blank render, x86 flat API parity, GOG Windows elevation, Steam Move install
(Phase 101), the gamelib-log Windows path golden, the GOG offline library cache, the PCGW
cargoquery, "Play here on the other device", the runtime-cache allow-list, the Rust wiki title,
unsigned Windows releases, the protonfixes import tool, the winebus PowerA wedge, TS-launched games
dying on SIGKILL (88), the dead imagecache branch, the bottle port quirks, the RUSTSEC chrono audit,
the ITAD tie-break, recent games with an empty appName, and the umu cached-null refetch.

</deferred>

---

*Phase: 89-steam-library-state*
*Context gathered: 2026-11-24*
