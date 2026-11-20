# Phase 83: Native seam, gamelib-core and process/shutdown contract - Context

**Gathered:** 2026-11-20
**Status:** Ready for planning (blocked on Phase 82 completion; 82 is executing, plan 6 of 16)

<domain>
## Phase Boundary

Requirements FND-03, FND-04. After this phase:

1. `relay_commands.rs` consults a new native router before relaying to the sidecar. A Rust-owned channel runs in-process; every other channel still relays to the sidecar.
2. Each channel has exactly one owner (native or sidecar), and a test fails on zero or two owners. A native channel validates its renderer arguments in Rust, with a negative test per migrated channel. An IPC schema diff gate fails on an unreviewed channel change.
3. `gamelib-core` (paths, `FrontendEmitter`, `Clock`, `ProcessRunner`, `Shutdown` token) and `gamelib-proc` kill-tree exist.
4. Quitting GameLib, and SIGKILL of GameLib, leaves no orphaned helper process on macOS, Windows or Linux. Launched games are excepted.
5. Two real shell-only channels are native (D-01), and the TS shims they used are deleted in this phase.

No new user-facing capability. The proof channels behave exactly as they do today.

</domain>

<decisions>
## Implementation Decisions

### Proof channels (criteria 1, 2, 4)
- **D-01:** The router is proven with **two channels**: `openExternalUrl` (send-kind, renderer-controlled URL; Rust already holds the scheme allow-list `OPEN_EXTERNAL_ALLOWED_SCHEMES` and `open_external_scheme_check` in `src-tauri/src/relay_commands.rs`) and `getHeroicVersion` (invoke-kind, no args; `src/backend/sidecar/appShellFlowRegistration.ts:386`). Both router kinds get proven. The other four URL openers (`openLoginPage`, `openKofiPage`, `openWinePrefixFAQ`, `openSidInfoPage`) stay on the sidecar. Delete only what these two channels alone used, such as their registrations, their `channelSchemas.ts` entries and any shim with no remaining caller. Shared TS (`openPolicy.ts`'s `assertOpenableExternalUrl`, which `externalLinkClicks.ts` and other registrations also use) stays until its last caller goes.
- **D-02:** **Send ordering is FIFO per native slice.** Each slice's native sends go through one ordered queue (not a free thread pool, and never on the main thread; cf. the `SidecarSendQueue` freeze history). **No ordering is guaranteed across the native/sidecar boundary.** The research spike must check that no current renderer flow depends on cross-channel send order. Any flow it finds becomes a named constraint on the slice that moves those channels.
- **D-03:** **Rejections look the same as today.** An unknown channel, or malformed or extra args on a native channel, returns the same `[GAMELIB_IPC_INVALID_CHANNEL]` marker and the same error-string shape as `relay_channel_verdict`, so the renderer can't tell a native rejection from a relay rejection. Sends stay fire-and-forget and their rejections are logged (channel name only, never args, T-34.6-16-02).

### Fallback, ownership and the schema gate (criteria 1, 2)
- **D-04:** **The fallback is routing-only.** "Sidecar as fallback" means only that channels the native router doesn't own keep relaying. A native-owned channel **never** falls back to the sidecar: no flag-driven and no error-driven fallback. A native handler error goes to the renderer. Ownership is static and checked by the one-owner test. — **Reversibility:** costly — adding a runtime fallback later means keeping TS registrations alive per channel, which contradicts deleting each slice's TS in the same phase.
- **D-05:** Ship the **`*PortComplete` gate template** now and use it on the proof channels. It fails if a slice's TS registrations, schemas or flag survive. **Don't build a `GAMELIB_<SLICE>` flag helper yet.** The first slice that needs a rollback window builds it, and that slice's plan names the window.
- **D-06:** **The IPC schema diff gate checks a committed generated snapshot.** The snapshot lists every renderer channel with its kind (invoke/send), its owner (native/sidecar) and its argument schema. CI fails when the live tree drifts from the committed snapshot. Reviewing a change means regenerating and committing the snapshot, so it shows in the diff (same pattern as `pnpm check:ipc-contract`). The gate gets the Phase 82 D-05 vacuous-pass guards: a floor on the scanned count, plus a deliberate empty or truncated-input test.
- **D-07:** **For a native channel, the Rust serde struct is the schema authority.** `#[serde(deny_unknown_fields, rename_all = "camelCase")]` arg structs validate before use. The channel's zod entry in `src/common/types/ipc/channelSchemas.ts` is deleted along with its TS registration. The snapshot records the Rust shape. There's no TS-to-Rust schema generator.

### What counts as an orphan (criterion 3)
- **D-08:** **A launched game's whole tree survives** a GameLib quit or kill: the game process, its wine/wineserver, the bridge's steam_api helper serving it, and its launch wrapper. **Everything else GameLib spawned is a helper and must die.** That includes the sidecar, nettop, the mac-owned helper, legendary/gogdl/nile/comet, wine tools (winetricks etc.), and depot or download work.
- **D-09:** **Downloads and installs in progress are helpers.** They are killed on quit or kill. A graceful quit keeps today's bounded cancel and finalize (the depot finalize that writes the 1026 record) before the kill. Resume-after-quit stays Phase 93's job. No new quit prompt is added; the existing "pending operations" confirm (`RouteQuit` → sidecar `handleExit()`) is unchanged.
- **D-10:** **Sidecar-spawned helpers are covered now, not slice by slice.** Criterion 3 is unconditional, so the proof includes TS-spawned children. Research must confirm how launched games relate to the sidecar's process group today. `src/backend/process/runner.ts` says tracked children are deliberately **not** detached so the shell's process-group reap covers them, and `openDetached` (macOS `open -g`) is the only detached spawn. So D-08 may require game launches to be spawned outside the sidecar tree, or at least proven to be. Check whether the current group reap already kills running games on quit; if it does, that is a recorded behaviour change.
- **D-11:** **The bar for macOS after SIGKILL:** no helper survives a SIGKILL of the parent, launched games excepted, and an automated test proves it. **Research and the spike pick the mechanism.** Candidates are a reaper/watchdog process holding a pipe to the app (e.g. the GameLib binary re-exec'd in reaper mode), a per-child parent-watch wrapper, and a pidfile sweep at the next boot. A boot-time sweep alone doesn't meet the bar, because orphans would live until the next launch. Linux uses `PR_SET_PDEATHSIG` and/or a subreaper; Windows uses kill-on-close Job Objects (`create_kill_on_close_job` already exists for the sidecar in `main.rs`).

### Quit drain and proof (criterion 3)
- **D-12:** **One app-wide exit deadline of about 5 s total.** Every `Shutdown` registrant shares it: depot finalize, the steamcm owed-record restore and logoff, steampoll stop, and the child grace period. Past the deadline, the remaining children are kill-treed and the app exits. A log line names what was still running (counts and names only, no job detail). This replaces the per-subsystem waits in `handle_exit` (`src-tauri/src/main.rs:755`).
- **D-13:** **Proof is the CI harness plus one live macOS check.** An automated harness on the existing windows/macos/ubuntu CI matrix spawns a stand-in parent with real helper children and a stand-in "game" tree, then (a) quits it gracefully and (b) SIGKILLs it. It asserts that the helpers are gone and the game tree survives. One **live macOS gate** runs on the real app: Force Quit during a download while a game is running, then a `ps` check. The live gate is authored before coding (v0.11 rule). The 80 nettop orphan was found live, which is why the live leg exists.
- **D-14:** **The Rust Shutdown convention is added now.** Add a CLAUDE.md Conventions row plus `gamelib-conventions` skill text: every Rust task, timer and child registers with the `Shutdown` token and spawns through `gamelib-proc`, and boot work is bounded. The sidecar exit-contract row stays until Phase 99 retires it. CLAUDE.md regions are hand-maintained, so edit them directly; do not run `generate-claude-md`.

### Resolved at planning (2026-11-20, research Open Questions)
- **D-15 (OQ1, OQ2, OQ4; scopes D-08/D-10):** **Option B.** Phase 83 builds `gamelib-proc` `SpawnClass::Game`, with the reaper and Job exclusion, and proves it on all three OSes using a stand-in game tree. The TS runner's game spawns stay as they are. The launch port (Phase 88) and the Steam bridge slices (95–97) adopt `SpawnClass::Game`. Record the interim status quo. TS-launched games still die on quit, and the `box.quit.bridgeHosting` copy stays correct. On unix, a SIGKILL of GameLib now also kills TS-launched games through the reaper's sidecar-group kill, where before they survived by accident. Record this as a known behaviour change. Criterion 3's "launched games excepted" is met for Rust-spawned games. The live gate's "game survives" step uses a Rust-spawned stand-in or a game launched through `steam://`, not a Wine game launched by the TS runner.
- **D-16 (OQ3):** Keep `TOTAL = 5 s` and `CHILD_GRACE = 1.5 s`. Of the nine `gamelib*.log*` files in `~/Library/Logs/GameLib/`, none contains `still running at exit deadline`, so there is no evidence that depot finalize overruns the drain stage.
- **D-17 (OQ5):** **Delete the unused `open_external` Tauri command in this phase.** Remove it from `generate_handler!`, update the `capabilities/default.json` prose, and drop or rewrite the `main.rs` source-text test `open_external_command_body_calls_the_scheme_check_before_opening`. Keep the sidecar's `openExternal` frame arm, because the other four openers, `openWebviewPage` and Steam launches still use it.
- **D-18 (OQ6):** **Declare the `url` crate as a direct dependency.** The native `openExternalUrl` validation uses `url::Url::parse`, matching TS `URL.canParse`, plus the scheme allow-list and the 8192 length cap, and is checked against the shared manifest vectors.

### Claude's Discretion
- `gamelib-core`'s module layout and exact trait shapes, within the research ruling (core holds traits and composition-root types; `gamelib-proc` is the implementation crate; domain crates depend on core, never on each other except by trait).
- Whether `gamelib-safety` is re-homed into `gamelib-core` in this phase. Phase 82 D-07 built its API to allow that without changing it.
- Hoisting `Clock` and `ProcessRunner` from `gamelib-steampoll` (`crates/gamelib-steampoll/src/host.rs`) into core. Steampoll then depends on core.
- Where the native router's handler table and generated `NATIVE_*_CHANNELS` sets live, and how they extend `meta/genIpcContract.ts` / `ipc_contract.rs`.
- The snapshot file's format and location.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone scope and requirements
- `.planning/REQUIREMENTS-v0.11.md`: FND-03, FND-04
- `.planning/ROADMAP.md` §"Phase 83": goal, four success criteria, research flag (send-kind ordering through `SidecarSendQueue`, invoke/send interleave, `[GAMELIB_IPC_INVALID_CHANNEL]` behaviour); §"v0.11 Phase Details" preamble: every port phase deletes its own TS, live gates authored before coding

### Research
- `.planning/research/v0.11/SUMMARY.md`: ruling 2 (ProcessRunner/Shutdown/kill-tree land in 83), ruling 6 (crate naming), phase 83 scope, open decision 7 (extract core in 83 = yes)
- `.planning/research/v0.11/ARCHITECTURE.md`: §2 seam (line ~28), `native_router` component table (lines ~84–101), renderer-channel slice steps (line ~109), flag rule (line ~112), send-order detail (line ~114), `FrontendEmitter` (line ~141), sidecar deletion list (line ~191)
- `.planning/research/v0.11/PITFALLS.md`: Pitfall 9 (Rust spawn semantics, line ~74), Pitfall 10 (sidecar exit contract replaced by nothing, line ~79), Pitfall 8 (IPC schema drift)
- `.planning/research/v0.11/STACK.md`: `gamelib-proc` (tokio::process, process-group/Job Object, `kill_on_drop` for jobs but not game launches)

### Prior phase decisions
- `.planning/phases/82-guardrails-hygiene-and-shared-safety-primitives/82-CONTEXT.md`: D-05 (vacuous-pass guards), D-06/D-07 (tri-state rule; `gamelib-safety` API re-homeable into core), D-08 (`FakeHome` in `gamelib-testutil`), D-18 (three-OS proof via CI matrix)
- Phase 80 context (`.planning/milestones/v0.10-phases/80-*/80-CONTEXT.md`), D-07/D-08: Rust polls stop through an explicit shutdown hook; the nettop orphan after Force Quit (T-80-16)
- Phase 72 trust boundary (renderer args validated before use; `ipcValidation`/`rendererPathGuard`/`openPolicy`): see `.planning/milestones/v0.10-phases/72-*`

### Crate recipe and conventions
- `src-tauri/crates/README.md`: per-domain crate recipe, §2b destructive-path rules, §5 fallback flag, §7 verification and deletion, §8 CI
- `Skill("gamelib-conventions")`: the sidecar exit contract (the text D-14 complements), fake-HOME isolation (harness spawns), `<verify>` prettier check
- `.claude/skills/spike-findings-gamelib/references/rust-migration-steam.md`: steam-vent session shutdown history (`shutdown-mid-connect-logon-survives`)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `relay_channel_verdict` / `echo_channel` (`src-tauri/src/relay_commands.rs:26`): the allow-list check and rejection marker that native rejections must match (D-03)
- `SidecarSendQueue` + `spawn_send_writer` (`relay_commands.rs:162`): the single-writer FIFO pattern for per-slice native send queues (D-02); its `#[cfg(test)]`-friendly generic writer is the testing model
- `open_external` / `open_external_scheme_check` (`relay_commands.rs:211–243`): the Rust half `openExternalUrl` already reaches through rustInvoke
- `ipc_contract.rs` (generated by `meta/genIpcContract.ts`, checked by `pnpm check:ipc-contract`): the generator and staleness gate to extend for native channel sets and the snapshot (D-06)
- `create_kill_on_close_job` (`main.rs:~827`), `configure_sidecar_process_group` (`sidecar.rs:213`), `SidecarState::shutdown_child` (`shell_state.rs:120`): existing kill-tree pieces
- `gamelib-steampoll` `host.rs` (`Clock`, `ProcessRunner`) and `runtime.rs` (tokio::process spawns): the hoist source for core/proc
- `gamelib-testutil` (`FakeHome`): harness isolation for real-binary spawns
- TS `src/backend/process/runner.ts` + `registry.ts`: today's single spawn seam (argv-only, tracked registry, `openDetached` the only detached child)

### Established Patterns
- `handle_exit` (`main.rs:755`) order: depot `cancel_all_and_wait(5 s)` → `steamcm_exit_shutdown` → `steampoll_exit_shutdown` → `shutdown_child` → wake-lock release → socket cleanup. D-12 folds these into one Shutdown deadline without changing the order's intent (steamcm logoff before the sidecar dies).
- Non-async Tauri commands run on the main thread. Native send handlers must enqueue, never block (the 2026-10-05 freeze).
- Rust tests must pass on Windows: join path segments one at a time, never `join("a/b")`.
- A setup-time error must not panic out of `did_finish_launching` (SIGABRT history in `spawn_sidecar_state`).

### Integration Points
- `sidecar_invoke` / `sidecar_send` (`relay_commands.rs:39, 128`): insert the native router lookup after `relay_channel_verdict`
- `src/backend/sidecar/shellFilesFlowRegistration.ts:156` (`openExternalUrl`) and `appShellFlowRegistration.ts:386` (`getHeroicVersion`): registrations deleted by D-01
- `src/common/types/ipc/channelSchemas.ts`: zod entries deleted per D-07
- `src/backend/sidecar/__tests__/ipcDomainCensus.test.ts`, `flowRegistrationCensus.test.ts`: census gates that must learn about native owners
- `src/preload/` invokers: must keep working unchanged (same channel names, same rejection shape)
- `RunEvent::Exit` / `ExitRequested` arms (`main.rs:~1825–1838`) and `RouteQuit` → sidecar `handleExit()`: the quit path the Shutdown token wires into

</code_context>

<specifics>
## Specific Ideas

- The 80 nettop orphan after Force Quit is the canonical failure. The live macOS gate re-runs that shape (Force Quit, then `ps`) with a download and a running game.
- A user's running game must keep running after GameLib quits or crashes, including a bridged game whose steam_api helper serves it.
- A native rejection must look to the renderer exactly like a relay rejection does today.

</specifics>

<deferred>
## Deferred Ideas

- `GAMELIB_<SLICE>=rust|ts` flag helper: deferred to the first slice whose plan names a rollback window (D-05).
- "Download in progress, quit anyway?" prompt: not added (D-09). The existing pending-operations confirm stays.
- Moving the other four URL openers native: they go with a later app-shell slice.

### Reviewed Todos (not folded)
Ten pending todos matched on keywords only and are unrelated to the seam/shutdown work, so they stay pending: Windows releases unsigned; packaged app blank render (fixed); x86 shim flat API parity; bridged game launches while Mac Steam signed out; winebus IOHID PowerA wedge; Steam move install; protonfixes import tool; and the remaining keyword-only matches.

</deferred>

---

*Phase: 83-native-seam-gamelib-core-and-process-shutdown-contract*
*Context gathered: 2026-11-20*
