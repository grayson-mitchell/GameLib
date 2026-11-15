# Phase 80: Steam install, uninstall and update polling state machines in Rust - Context

**Gathered:** 2026-11-16
**Status:** Ready for planning

<domain>
## Phase Boundary

The Steam install, uninstall, update and running-app poll loops run in Rust, inside the Tauri
shell, and their TypeScript implementations are deleted. That covers the state machines (grace /
max / no-activity / manifest-gone ticks, native-handoff upgrade, InstallApp retries, the Phase 74
D-11 update completion rules), the ACF readers, and the helpers the loops drive: the Mac download
monitor (nettop + content_log tail), the restart hold, the resume breadcrumbs and boot resume, and
the Mac arch ground-truth check.

Rust performs the effects it can own directly: frontend messages, notifications, files, child
processes. It hands changes to sidecar-owned in-memory state (libraryState and its siblings) to a
thin TypeScript handler as typed state events. Moving the Steam library state itself into Rust is
**not** in this phase.

</domain>

<decisions>
## Implementation Decisions

### Carried forward (not re-asked)
- **Phase 63/73/75/79 pattern:**
  - a Tauri-free crate or module in the `src-tauri/` workspace;
  - `rustInvoke`, with TypeScript call signatures unchanged (async where they were sync, 63 D-09);
  - a parity harness;
  - a dev-only fallback flag (75 D-08 shape);
  - the delete gate: zero unexplained diffs, a live macOS `pnpm tauri:dev` smoke, and `cargo test`
    green on all three CI legs. Then delete the TS loops inside this phase.
- **63 D-07:** the old TS code is not assumed correct. Each parity divergence is explained and
  recorded, not silently matched.
- **ACF / VDF / registry.vdf parsing** goes through the Phase 75 `gamelib-steamfiles` crate.
- **79 D-17** put these loops in this phase. They use no CM, so they have no dependency on the
  `gamelib-steamcm` session.
- **Phase 74 D-11 update-completion semantics are preserved exactly:**
  - StateFlags bit 4 never completes an update on its own;
  - a build change completes it;
  - no activity ends it quietly.

### Where the line falls
- **D-01: Rust does everything it can own directly.** Rust owns:
  - the loop, timers and per-appId poll registries (install polls, uninstall polls);
  - the restart hold;
  - all ACF and file work;
  - frontend messages;
  - notifications.

  The TS loops and per-tick logic are deleted, not wrapped.
- **D-02: Sidecar-owned in-memory state is updated through typed state events.**
  - It covers `libraryState`, `gameSession`, the update-detection cache
    (`invalidateSteamUpdateState`), `markManagedBySteam`, `clearForcedWindowsViaBottle` and
    `markBridgeGameUninstalled`.
  - Rust emits a small typed "state changed" event: installed / uninstalled / update done /
    managed-by-steam / bridge uninstalled / running-state, etc.
  - A thin TS handler applies each event by calling the existing functions.
  - That handler is the only poll code left in TS.
  - Moving the library state into Rust is deferred (see `<deferred>`).
- **D-03: Notification text is translated in Rust.**
  - Rust loads the shipped `public/locales/<lang>/*.json` for the user's current language, with en
    fallback and i18next-style `{{var}}` interpolation.
  - The locale dir has several namespaces (`translation.json`, `gamepage.json`, …). The loader
    must resolve keys the same way the TS `i18next.t` calls do today.
  - Notifications are delivered through the existing Rust host notifications service
    (`src-tauri/src/macos_notifications.rs` + tauri-plugin-notification), with no sidecar hop.
  - Build it as a reusable module, so later Rust slices can notify too.
- **D-04: Frontend messages go out on the same channels with the same payloads.**
  - Rust emits directly to the webview, using the channel names and payload shapes the frontend
    listens for today.
  - No frontend changes. Parity compares the emitted streams exactly.
- **D-05: On transitions, the state change goes first and the user-visible emit follows.**
  - Applies to install complete, uninstall complete, update complete and similar transitions.
  - Rust sends the state event and waits for the TS handler's ack before emitting the frontend
    message and the notification. That keeps today's order, so the frontend never refetches a
    stale library.
  - The wait is bounded (about 5 s). On timeout Rust logs and emits anyway.
  - Progress ticks never wait for an ack.
- **D-06: All the poll-driven helpers move with the loops:**
  - the download monitor (`steamDownloadMonitor.ts` + `steamDownloadProgress.ts`: the nettop
    watchdog child, the content_log tail and the `liveProgress` maths);
  - the restart hold (`library/restartHold.ts` + `steamRestartHold.ts`, persisted store included);
  - resume breadcrumbs (`resumeBreadcrumbs.ts`, `markSteamInstallIncomplete`);
  - the Mac arch check (`verifyMacArchGroundTruth`, `library/macArch.ts`).

  None of them is left behind a Rust→TS per-tick callback.

### Timers and lifecycle
- **D-07: Polls run as in-process tokio tasks in the Tauri shell,** one per appId.
  - The poll logic lives in a Tauri-free crate that the shell hosts.
  - They stop through an explicit shutdown hook at app quit. The sidecar exit contract (unref)
    doesn't apply to them.
  - Rust owns the nettop child's lifetime, including teardown at quit and on a hard kill. That
    replaces today's sidecar-pid watchdog anchor.
- **D-08: If the sidecar dies or restarts, polls keep running.**
  - The user still sees progress and notifications.
  - State events that can't be acked are queued per appId, latest wins, and replayed when the
    sidecar reconnects, so libraryState catches up.
  - While no sidecar is connected, the D-05 ack wait times out, is logged and does not block.
- **D-09: Boot resume runs in Rust at shell start.**
  - The shell reads the breadcrumbs and starts resumed polls without waiting for the sidecar.
  - State events queue (D-08) until the sidecar connects.
  - The poll-restart half of `resume.ts` is deleted.
- **D-10: The tick model is unchanged:**
  - a fixed 3 s interval;
  - the same tick-count constants (`GRACE_TICKS=20`, `MAX_TICKS=7200`,
    `STEAM_REQUEST_NO_ACTIVITY_TICKS=40`, `MANIFEST_GONE_TICKS=10`, the InstallApp retry cadence,
    `STEAM_UPDATE_ABANDONED_TICKS`, `STALLED_TICKS_THRESHOLD`, `STEAM_HOLD_PROBE_MIN_INTERVAL_MS`…);
  - no overlapping ticks per appId.

  No wall-clock conversion and no file-watching.

### Scope edges
- **D-11: `bridgeInstallState.ts` is out of scope, except for one function.**
  - Out: DRM signal / prescreen persistence and `resolveBridgeGameInstallRoot`. They are
    install-routing code and stay in TS.
  - In: the uninstall poll's `markBridgeGameUninstalled` call becomes a state event (D-02), which
    the TS handler applies with the existing function.
- **D-12: All of `acfState.ts` and `acfUpdateState.ts` moves**, onto `gamelib-steamfiles`.
  - That includes the parts the polls don't call: `removeSteamInstallCopy`,
    `enumerateSteamInstallCopies`, `findOtherManifestsWithInstalldir` and `scanDownloadingAppIds`.
  - The path-guard logic lives only in Rust.
  - The TS files become thin `rustInvoke` wrappers for any remaining TS callers, or are deleted.
- **D-13: `runningPoll` moves completely, using a native registry read on Windows.**
  - Rust reads `HKCU\Software\Valve\Steam\RunningAppID` directly (winreg / windows-sys), with no
    `reg.exe` spawn.
  - Same 0-on-missing / 0-on-error semantics.
  - The macOS `registry.vdf` read is already Rust.
  - The running-poll loop and its hold move as well. Playing/Done state changes go through D-02 /
    D-04.

### Parity and delete gate
- **D-14: Parity is proven by scenario replay plus Rust tests.**
  - A harness feeds the same scripted timelines through the TS loop and the Rust loop:
    - ACF snapshots per tick;
    - files present or absent;
    - download-monitor samples;
    - running-app values;
    - sidecar connect and disconnect.
  - It diffs the full output streams: frontend messages, notifications (key + params + rendered
    text), state events, and files written or removed.
  - Each divergence is explained and recorded (63 D-07).
  - The 18 existing TS test files over this code are ported as cargo tests, so their coverage
    survives the TS deletion.
- **D-15: The delete gate's live smokes, all on the `pnpm tauri:dev` build, real Steam:**
  1. **Mac Steam handoff install:** a `steam://install` install through the restart hold and live
     nettop progress, to completion and the notification.
  2. **Depot install + update:** a Rust depot install finishing through the poll, then an update
     completing by the D-11 build-change rule.
  3. **Uninstall + quit-resume:** an uninstall to completion. Then quit mid-install, relaunch, and
     check that the Rust boot resume (D-09) picks the poll up.
  4. **Running poll:** on Windows, a launch gets exactly one Playing and one Done through the
     native registry read. The macOS half folds in the WazHack todo (see Folded Todos).
- **D-16: There is one dev-only `polls` fallback flag (rust | ts).**
  - It covers install, uninstall, update, running and the moved helpers.
  - It is hidden from the normal UI.
  - It defaults to `rust` once parity passes and is deleted at the delete gate.
  - While it exists, the persisted restart-hold and resume-breadcrumb formats stay readable and
    writable by both sides (79 D-10 precedent).
  - With `polls=ts`, the TS loops still follow the sidecar exit contract.

### Claude's Discretion
- Crate placement: a new crate (e.g. `gamelib-steampoll`) or a module inside an existing crate.
- Channel names, the state-event schema, and how the ack is carried. Reuse the Phase 73
  `RustJobEvent` → TS path where it fits.
- How Rust reaches the webview and notification service from a Tauri-free crate (trait or
  callback injected by the shell).
- How the TS-facing query surface (`isDelegatedInstallPolling`, `cancelDelegatedInstall`,
  `stopInstallPolling`, `stopUninstallPolling`) maps onto `rustInvoke`.
- Where the harness lives, its timeline format, and whether TS-side Jest tests for callers mock the
  async boundary.
- How to read the user's current language in Rust (config read vs passed in at start).

### Folded Todos
- **`.planning/todos/pending/2026-11-14-macos-wazhack-single-playing-done-check.md`**: "macOS:
  confirm a Steam rungameid launch gets exactly one Playing and one Done (poller + launch watch)".
  - The Mac half of the RunningAppID poller live gate was never run.
  - It folds into D-15 item 4, against the Rust running poll plus `steamLaunchWatch`.
  - Close the todo when the gate passes.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope and migration pattern
- `.planning/ROADMAP.md` §"Phase 80": scope list and the open questions resolved here
- `.planning/phases/63-rust-migration-pattern-and-executable-scanners/63-CONTEXT.md`: the
  migration pattern (Tauri-free crate, rustInvoke, parity, D-07, D-09)
- `.planning/phases/75-steam-local-file-formats-in-rust/75-CONTEXT.md`: `gamelib-steamfiles`, the
  D-08 fallback-flag shape
- `.planning/phases/79-rust-cm-client-replacing-steam-user-and-steam-session/79-CONTEXT.md`: D-17
  (why these loops were deferred), D-10 (dual-readable persisted formats during the fallback window)

### Behaviour to preserve
- `.planning/phases/74-steam-game-updates/74-CONTEXT.md`: D-11 update-completion rules
- `.planning/phases/73-steam-depot-download-pipeline-in-rust/73-CONTEXT.md`: the Rust job-event
  channel and progress model the polls sit beside

### Conventions
- `Skill("gamelib-conventions")`: the fake-HOME rule (nettop spawn tests), the sidecar exit
  contract (still binding on the TS side while `polls=ts`), and the `<verify>` prettier rule
- `.planning/research/STEAM-STACK.md`: Steam stack record. Amend only if the stack changes.

</canonical_refs>

<code_context>
## Existing Code Insights

### Scope (TS to port, then delete)
- `src/backend/storeManagers/steam/library/`:
  - `installPolling.ts` (514), `installPollOnce.ts` (489), `uninstallPolling.ts` (410),
    `updatePollOnce.ts` (259), `pollState.ts` (235), `runningPoll.ts` (312), `acfState.ts` (454),
    `acfUpdateState.ts` (98);
  - plus `installStop.ts`, `restartHold.ts`, `resumeBreadcrumbs.ts`, `macArch.ts`, and the
    poll-restart half of `resume.ts`.
- `src/backend/storeManagers/steam/`:
  - `steamDownloadMonitor.ts` (285), `steamDownloadProgress.ts` (181), `steamRestartHold.ts` (157).

### Reusable Assets
- `src-tauri/gamelib-steamfiles`: ACF / registry.vdf parsing. `RUST_STEAMFILES_READ_ACF` and
  `RUST_STEAMFILES_READ_RUNNING_APP_ID` already exist.
- `src/backend/storeManagers/steam/depotRust/progressBridge.ts` + `rustDepot.ts` / `jobRegistry.ts`:
  the existing Rust job → TS event path (`RustJobEvent`), which already runs without timers.
- `src-tauri/src/macos_notifications.rs`: the Rust-side notification host that `notify()` already
  calls.
- `public/locales/<lang>/*.json`: 49 locales, several namespaces.

### Side-effect inventory (what crosses the boundary)
- `deps.sendFrontendMessage` ×27 → Rust emits directly (D-04).
- `notify` ×6, `notifyRestartSteamToFinish` ×2 → Rust notification + locale (D-03).
- `deps.steamSession.libraryState` ×12, `gameSession` ×3, `markManagedBySteam` ×3,
  `invalidateSteamUpdateState` ×2, `clearForcedWindowsViaBottle`, `markBridgeGameUninstalled` →
  state events (D-02).
- `deps.steamInstallRuntime.polls/uninstallPolls/restartHold` and
  `deps.steamProcesses.downloadMonitor` → move into Rust (D-01, D-06).

### Integration Points (poll start sites keep their signatures)
- `src/backend/storeManagers/steam/gameInstall.ts`
- `gameInstallDepot.ts`
- `updateNative.ts`
- `library/resume.ts`
- `gameUninstall.ts`
- `steamProcesses.ts` (`createRunningPoll`)

</code_context>

<specifics>
## Specific Ideas

- The user chose the most complete boundary ("Rust does everything"), limited only by state the
  sidecar still owns. Favour moving logic into Rust over leaving callbacks, wherever the state
  isn't sidecar-owned.
- The frontend must see no difference: same channels, same payloads, same ordering.

</specifics>

<deferred>
## Deferred Ideas

- **Move the Steam library state into Rust**: `libraryState`, `gameSession` and the
  update-detection cache. TS readers then call into Rust, and the D-02 state-event handler is
  deleted. This is a future sidecar-retirement slice; it touches every Steam module that reads the
  installed map.
- **Bridge install routing in Rust**: the rest of `bridgeInstallState.ts` (DRM signal / prescreen
  persistence, install-root resolution).

### Reviewed Todos (not folded)
- `todo.match-phase` returned keyword-only matches: Windows signing, blank-render, pinned
  libsteam_api, Friends after go-offline, x86 shim parity, optionaldlc. None of them concerns the
  poll loops, so none was folded.

</deferred>

---

*Phase: 80-steam-install-uninstall-and-update-polling-state-machines-in*
*Context gathered: 2026-11-16*
