# Phase 81: Unify the Steam restart hold into restart-on-Play - Research

**Researched:** 2026-11-17
**Domain:** Steam client adoption of GameLib-written appmanifests (macOS, Windows, Linux); Rust poll crate `gamelib-steampoll`; Node sidecar Play path; React game page
**Confidence:** HIGH on what exists in the repo and what the spikes measured; MEDIUM on the new helper subcommand (needs a live gate) and on the Windows/Linux generalisation (cannot be live-checked from this Mac)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Carried forward (roadmap and spikes, not re-asked)
- `steam://install` is not an option. Spikes 047/048 showed it needs a click in Steam's install
  dialog. Do not re-spike it.
- Signing in reloads every `appmanifest_*.acf`, and the app reaches state 4 within about 1 s
  (spike 083). Two signals show this:
  - helper `GetAppInstallState` goes 1026 → 4;
  - content_log logs `Loaded N apps from install folder`.
- When the experimental InstallApp setting is on (quick 261105-ord / 261105-sqe), it stays the
  preferred macOS path at install end. Restart-on-Play is its fallback.
- Phase 80's Rust poll architecture applies to any new background work:
  - `gamelib-steampoll`;
  - typed state events, with the TS handler as the only poll code left in TS;
  - tokio tasks hosted by the shell.
- The user gets an in-app action, not passive text.

#### What the game page shows (macOS, adoption pending)
- **D-01:** The badge says **Installed** and the main button says **Play**. A quiet note under
  the status reads: "Steam will restart once when you press Play."
  - There is no separate "waiting for restart" state on the Mac path.
  - The `steam-waiting-for-restart` status, and its "Restart Steam to finish" copy, leave the Mac
    path.
- **D-02:** A secondary action, **"Restart Steam now"**, runs the same graceful quit and relaunch
  as restart-on-Play without launching the game.
  - It reuses `restartMacSteamForAdoption`, relaunching Steam itself instead of
    `steam://rungameid`.
  - Success clears the pending record.
- **D-03:** When Steam is running but signed out, the note reads "Sign in to Steam to finish
  setup", with an **Open Steam** action that brings Steam forward.
  - Play stays available.
  - Pressing Play while Steam is signed out opens Steam rather than restarting it, because
    sign-in adopts the game by itself (083).

#### Quitting Steam on Play
- **D-04:** There is no confirmation prompt before Play restarts Steam. The page note (D-01) is the
  warning, and Play shows the existing `steam-starting` status while Steam restarts. This matches
  today's 261029-ji2 behaviour.
- **D-05:** In the refused cases, Play never falls back to a plain `steam://rungameid` launch,
  because that opens Steam's install dialog. The refused cases are:
  - a game is running in Steam;
  - a GameLib sign-in or go-offline wrap is owed;
  - Steam didn't quit within 30 s.

  Keep today's refuse-and-notify copy. Also offer **"Launch without Steam"** from that notice,
  which hands off to the launch-without-Steam feature (todo
  `2026-11-07-launch-steam-games-without-steam.md`).
  - The operator plans to work that todo next.
  - If it has landed when Phase 81 is planned, wire the action in, only for games that feature
    marks eligible.
  - If it hasn't landed, ship refuse-and-notify with a clear hook. The launch-without-Steam work
    then adds the action.
- **D-06:** When the future launch-without-Steam setting is on, Play skips the adoption restart
  entirely. The game runs without Steam, so Steam's adoption doesn't block launching. Leave a
  single decision point in the Play path for that setting to short-circuit.

#### Watching for adoption
- **D-07:** While any pending-adoption record exists on macOS, a light background poll in Rust
  (`gamelib-steampoll`, Phase 80 pattern) watches for adoption.
  - It asks the bridge helper for `BLoggedOn` and `GetAppInstallState` on a slow cadence.
  - State 4 clears the record and the note, through a typed state event to the TS handler.
  - A change of Steam pid compared with the record also counts as evidence, so it is re-checked
    against the ACF and helper state.
  - The poll runs only while records exist and stops when none remain.
- **D-08:** The helper needs a new `GetAppInstallState` / `BLoggedOn` call. Spike 083's
  `probe.c` is the reference, and it re-attaches on every poll so no handle has to survive a
  sign-in.
  - The signed-in versus signed-out reading also drives the D-03 note.
  - The 261105-ord gate found that `ConnectToGlobalUser` doesn't detect Steam's sign-in screen.
    Use `BLoggedOn`, as in 083 and 084, instead.
- **D-09:** When InstallApp is on and fails at install end because Steam is signed out, there is
  **no automatic InstallApp retry** at sign-in. Detection (D-07) observes the adoption that sign-in
  does on its own. 083's fallback still applies: fire InstallApp once only if the state is not 4 a
  few seconds after `BLoggedOn` turns 1.
- **D-10:** When the helper is unavailable or its state is unreadable, detection fails safe:
  - the record is kept;
  - the note stays;
  - Play behaves as today (`decidePlayAdoption`, including WR-01's "unknown → launch without
    restart, keep the record").

#### Deleting the hold (macOS)
- **D-11:** On the Mac native route, these are deleted:
  - the D-UAT-13 hold;
  - the persisted `steam_restart_hold` store;
  - the boot re-arm (`rearm.rs`).

  The Rust install poll reports Installed as soon as the ACF says so.
- **D-12:** Migration: at boot, each valid persisted hold record becomes a pending-adoption
  record. A record whose ACF is gone is dropped. The store file is then deleted, so no game is
  left stuck and none silently loses its restart.
- **D-13:** The open debug questions in the absorbed todo, "Also observed: GameLib restart while
  held", go away with the re-arm on macOS: the missing init logs, and a re-arm that reads as
  not installed. If any persisted hold survives anywhere, debug those questions first. D-15 has
  none, so they should not survive.

#### Windows/Linux arm
- **D-14:** Run the spike todo
  `2026-11-16-spike-steam-startup-and-sign-in-adoption-on-windows.md` and `2026-11-17-spike-steam-startup-and-sign-in-adoption-on-linux.md` **before**
  `/gsd-plan-phase 81`, on Windows first and then Linux. The planner then plans only the arm each
  OS gets. If the spike answers yes to its questions 1 and 5 on an OS, that OS gets restart-on-Play
  with the D-01–D-05 UX and the D-07 detection, using non-helper evidence from spike question 4.
  - **Windows: YES, so restart-on-Play** (spike 087, 2026-11-17, native Steam on Windows 11):
    - **Q1 startup:** StateFlags 4 adopted with no dialog and no verify. 1026 gets a zero-file
      commit.
    - **Q2:** a running, signed-in Steam ignores the ACF.
    - **Q3:** sign-in reloads and adopts, with no restart.
    - **Q5:** `steam://exit` → `steam://rungameid/<id>` relaunches with the game. Plain
      `steam.exe` restarts Steam alone with no dialog.
    - **Q4 evidence:** the primary signal is Steam rewriting the ACF (sha/mtime change, the
      `LauncherPath` key appears, 1026 → 4). Signed-in state comes from HKCU `ActiveProcess`
      `ActiveUser` (0 = signed out). The content_log `Loaded N apps …` line marks a rescan.
      **Do not use** HKCU `Apps\<id>\Installed`, which stays 1 regardless.
    - **Caution for D-07 on Windows:** a sign-out restarts `steam.exe`, so a PID change alone is
      not adoption evidence.
  - **Linux: YES, so restart-on-Play** (spike 088, 2026-11-17, native Debian Steam, tool app
    1628350):
    - **Q1 startup:** adopted after a restart (`Loaded 5 → 6 apps`), no update or verify line.
    - **Q2:** a running, signed-in Steam ignores the ACF.
    - **Q3:** sign-in rescans and adopts, same pid, no dialog (operator-confirmed).
    - **Q5:** `steam://exit` quits in ~4 s; any `steam://` URL or plain `steam` relaunches it.
    - **Q4 evidence:** Steam did **not** rewrite this ACF, so use the content_log
      `Loaded N apps` line and the `libraryfolders.vdf` `apps` map. `registry.vdf` has no
      `ActiveUser`/`Installed`; signed-in is `[Logged On` in `connection_log.txt`.
    - **Cautions:** Linux sign-out also restarts `steam`. `steam -silent` shows no window.
      Not tested: a real game launching after relaunch, 1026, Flatpak.
- **D-15:** If the spike says no for an OS, it gets a **simplified hold**:
  - **In memory only.** No persisted store and no boot re-arm, so after a GameLib restart the game
    reads as Installed.
  - **Released on evidence**, whichever comes first:
    - the recorded Steam pid exits;
    - Steam rewrites the ACF (it differs from the baseline);
    - a content_log rescan line appears after the hold time.
  - **A "Restart Steam now" action:** `steam://exit` → wait → relaunch Steam.

### Claude's Discretion
- The poll cadence and backoff for D-07 (a slow tick of several seconds; faster near sign-in is
  fine).
- Where the note and actions sit in `GameStatus.tsx` / `MainButton.tsx`, the exact i18n keys, and
  whether the `steam-waiting-for-restart` status survives only for the D-15 arm or is removed.
- The state-event shapes for "adoption observed" and "signed-in state", and whether D-07 shares
  a task with the running poll.
- How "Restart Steam now" relaunches Steam without a game (`open -b`, or a Steam URL that doesn't
  open a dialog). Verify it live.
- The live-gate shape. It must at least cover:
  - signed-in restart-on-Play;
  - signed-out → sign-in auto-clear (the 112100 case);
  - "Restart Steam now";
  - a refused restart;
  - migration of a persisted hold record.

### Deferred Ideas (OUT OF SCOPE)

- **Launch without Steam** (todo `2026-11-07-launch-steam-games-without-steam.md`): a separate
  setting, which the operator will work next. Phase 81 only leaves the D-05 action hook and the
  D-06 short-circuit point. That work also has to decide whether the "Restart Steam now" note
  stays visible when the setting is on, since Steam's own library still won't show the game as
  installed until Steam adopts it.

### Reviewed Todos (not folded)
The todo matcher returned these on shared keywords only. None is about adoption:
- `2026-11-13-pin-bridge-libsteam-api-dylib.md`: bridge helper dylib, unrelated
- `2026-11-14-steam-friends-cannot-log-back-in-after-go-offline-install.md`: the go-offline wrap,
  unrelated
- `2026-09-14-windows-releases-ship-unsigned-no-windows-cert-enrolled.md`: release signing,
  unrelated

</user_constraints>

<phase_requirements>
## Phase Requirements

No requirement IDs are mapped to this phase (roadmap says TBD). Scope comes from the CONTEXT.md decisions D-01 to D-15. The table maps each decision to the research finding that enables it.

| ID | Description | Research Support |
|----|-------------|------------------|
| D-01..D-03 | Game page: Installed + Play + note, "Restart Steam now", signed-out note + "Open Steam" | Sections "UI surface" and "Signed-in reading". New frontend push + sidecar query needed; the `steam-waiting-for-restart` status has a second producer (1026 wait) that must be decided (Open Question 1). |
| D-04..D-06 | No prompt; refused cases never fall back to rungameid; "Launch without Steam" hook; setting short-circuit | Launch-without-Steam has landed as a per-game toggle (q1t). D-06 is already satisfied structurally. D-05's action has no one-shot channel to call (Open Question 2). |
| D-07..D-10 | Rust background poll, new helper call, no InstallApp retry, fail-safe | Pattern 1 (adoption watch task), Pattern 2 (helper `--steam-appstate`), evidence table. |
| D-11..D-13 | Delete hold, store, re-arm on Mac; migrate persisted holds; absorb debug questions | "Deletion surface" and Pattern 3 (migration via drain + discard). |
| D-14, D-15 | Windows/Linux arm decided by spikes 087/088 | Both spikes answered YES: no D-15 arm exists. Restart-on-Play must be generalised off Mac (largest scope item). |

</phase_requirements>

## Summary

Phase 81 deletes the second of two mechanisms. The restart hold (Rust `hold.rs`, `rearm.rs`, the persisted `steam_restart_hold.json`, the `holding[]` status filter) holds a finished depot install in "Restart Steam to finish" until the recorded Steam pid exits. Restart-on-Play (`macSteamAdoption.ts`) already handles the same problem at Play time, but only on macOS: the record writer (`gameInstallDepot.ts` `else if (isMac)` branch), the Play gate (`gameLaunch.ts` `if (isMac) {`) and the pid probe (`probeMacSteamPid`) are all Mac-only. Spikes 087 (Windows) and 088 (Linux) both answered YES to D-14 questions 1 and 5, so **no OS gets the D-15 simplified hold**. The hold, its store and the re-arm are deleted on all three platforms, which means restart-on-Play has to be extended to Windows and Linux. That extension, not the Mac work, is the largest piece of this phase.

The Mac detection signal is cheaper than CONTEXT implies. Spike 083 shows Steam rewrites the ACF itself at sign-in adoption (StateFlags 4, `TargetBuildID`, its own field set), so the existing `isSteamAdoptedAcf` check already detects the 112100 case without the helper. The helper adds two things the ACF cannot give: `BLoggedOn` (drives the D-03 "Sign in to Steam" note) and `GetAppInstallState == 4` as confirmation. On Windows the ACF rewrite is also the primary signal (spike 087). On Linux Steam did not rewrite the ACF (spike 088), so Linux needs the `content_log.txt` rescan line and the `libraryfolders.vdf` `apps` map. A Steam pid change is evidence only on macOS-style restarts: on Windows and Linux a sign-out restarts Steam without adopting anything, so a pid change alone must not clear a record there.

Launch-without-Steam has landed (quick 261117-p38 then q1t), but as a per-game setting `launchWithoutSteam` rather than the one-off action the todo first described. `dispatchSteamLaunch` already routes to `game.launchWithoutSteam()` before `game.launch()` runs the adoption gate, so D-06 needs no new code; it needs a test and a comment. D-05's "Launch without Steam" offer from the refusal notice has no channel to call (q1t removed `steamLaunchWithoutSteam`), so the planner must either add a one-shot channel or ship refuse-and-notify with the hook (Open Question 2).

**Primary recommendation:** Sequence in three waves. (A) Mac end to end: new helper subcommand, Rust adoption-watch task + `adoptionState` state event, TS record/Play/"Restart Steam now"/UI, D-12 migration, and delete the hold on the Mac native route only. (B) Windows/Linux restart-on-Play: generalise the record (pid list + start tokens), Play gate, restart, and non-helper evidence, then delete the remaining hold, store and re-arm everywhere. (C) Live gate on all three machines. Do not delete the hold off-Mac before wave B lands, or Windows/Linux regress to the install-dialog bug the hold exists to prevent.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Adoption evidence polling (ACF rewrite, helper state, log rescan, signed-in reading) | Rust shell (`gamelib-steampoll`, tokio task) | Bridge helper child (Mac only) | Phase 80 D-01/D-02: poll code is Rust; TS handles typed state events only. |
| Pending-adoption record store (`steam_pending_adoption`) | Node sidecar (`CacheStore`) | none | Single writer today is TS; keep it, and feed Rust a watch list through ops. |
| Play-time decision and Steam restart (`steam://exit`, wait, relaunch) | Node sidecar (`macSteamAdoption.ts`, generalised) | Rust op for the running-game probe on Windows/Linux | Existing, tested code; bounded clock timers already unref'd. |
| "Is Steam signed in" reading | Bridge helper (Mac), HKCU `ActiveUser` (Windows), `connection_log.txt` (Linux) | Rust | No sidecar-side reader exists; Rust already has `real_hkcu_dword`. |
| Hold-record migration (D-12) | Rust (parse + liveness, `hold.rs` `parse_record`/`decide_rearm`) | Node sidecar (writes pending records) | Keeps one writer per store file. |
| Page note and actions (D-01..D-03) | Browser/React (`GameStatus.tsx`, `MainButton.tsx`) | Sidecar query + push | Frontend never derives adoption state; it renders a backend push. |
| Refusal notice with optional "Launch without Steam" | Node sidecar emits, React renders | none | Needs an in-app notice with an action; OS `notify()` carries no action. |

## Standard Stack

No new libraries. Every piece reuses what is in the repo.

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `gamelib-steampoll` (in-repo crate) | 0.1.0 | Adoption watch task, `adoptionState` event, hold deletion | Phase 80 home of all Steam poll code [VERIFIED: src-tauri/crates/gamelib-steampoll/Cargo.toml: `name = "gamelib-steampoll"`, `version = "0.1.0"`] |
| `gamelib-steamfiles` (in-repo crate) | path dep | ACF parse (`acf::`), `real_hkcu_dword`, `libraryfolders` reads | Already a dependency of the poll crate |
| tokio / tokio-util | 1 / 0.7 | Watch task, `CancellationToken` | Already used by `Registry` [VERIFIED: Cargo.toml `tokio = { version = "1", features = [...] }`, `tokio-util = "0.7"`] |
| bridge helper (`native/steam-bridge/helper`, C, arm64) | n/a | New `--steam-appstate` subcommand | Same pattern as `--steam-installapp` and `--steam-owned-apps` |
| Jest 29 | ^29.7.0 | Sidecar and frontend tests | Existing [VERIFIED: package.json `"jest": "^29.7.0"`] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| TS pushes a watch list to Rust via ops | Rust reads `steam_pending_adoption.json` directly | Direct read adds a second reader of a TS-owned CacheStore and a pid/baseline schema contract; ops keep one owner. Use ops. |
| Rust op for the Play-time helper read | A TS wrapper like `steamInstallApp.ts` | A TS wrapper duplicates the helper-output parser that the poll needs anyway. One Rust function, one op, reused by the poll and by Play/page. |
| `open -b com.valvesoftware.steam` to relaunch Steam alone | `steam://open/main` URL [ASSUMED] | Both unverified for "no dialog, window shown". Bundle id verified on this machine (see Environment). Verify live (CONTEXT discretion). |

**Installation:** none. **Package Legitimacy Audit:** no external packages are added by this phase, so the gate has nothing to check. If the planner adds a crate (it should not need one: do the `content_log.txt` line match with a plain string scan, and compare ACF content as strings), run `gsd_run query package-legitimacy check --ecosystem crates <name>` first.

## Architecture Patterns

### System Architecture Diagram

```
 GameLib depot install finishes (gameInstallDepot.ts)
   |
   |- InstallApp setting ON and ok -> Steam adopted, no record            (unchanged, D-09 preferred path)
   |- else Steam running -> write pending-adoption record (TS store) --- watch op ---> [Rust adoption-watch task]
   |- else Steam not running -> no record (next Steam start adopts)                          |
   v                                                                                         | every ~5 s while any watch exists
 Install poll (Rust) reports Installed as soon as the ACF says so  (hold deleted)           v
   |                                                                       evidence per watch:
   v                                                                        1 ACF rewritten by Steam (Mac, Win)
 Game page: Installed + Play + note                                         2 helper --steam-appstate -> {loggedOn, state} (Mac)
   ^                       ^                                                3 content_log "Loaded N apps" after record (all)
   |                       |                                                4 libraryfolders.vdf apps map (Linux)
   | push steamAdoption    | adoptionState state event (full state)         5 Steam pid changed (Mac only; re-check 1-3)
   | Status {pending,      |                                                          |
   |  signedIn}            +--- TS handler: clear record on `adopted`; cache signedIn <-+
   |
 User presses Play ----> gameLaunch.ts gate (all OSes now)
   |- no record / adopted -> launch via steam:// URL
   |- same Steam, not adopted, signed in -> steam://exit, wait <=30 s, relaunch via rungameid, clear record (D-04)
   |- Steam signed out -> open Steam only (D-03)
   |- refused (game running / wrap owed / quit timeout) -> in-app notice, never plain rungameid (D-05)
   '- launchWithoutSteam setting on -> dispatchSteamLaunch bypasses this gate entirely (D-06)

 "Restart Steam now" (page action) -> same restart helper, relaunches Steam alone, clears record on success (D-02)
 Boot: Rust drains persisted steam_restart_hold.json -> TS writes pending records + registers watches -> Rust discards the file (D-12)
```

### Recommended Project Structure
```
src-tauri/crates/gamelib-steampoll/src/
├── adoption.rs      # NEW: watch registry, evidence providers per platform, helper state reader, tick
├── hold.rs          # SHRINK: keep list_steam_client_pids, read_steam_process_start_tokens, parse_record, decide_rearm
│                    #   (drain op, D-12). Delete should_hold, HoldPoll, HoldStore write paths at the end.
├── rearm.rs         # DELETE at end of wave B (replaced by the drain op)
└── events.rs        # ADD adoptionState; REMOVE rearmSettled
native/steam-bridge/helper/gamelib_appstate.h   # NEW: --steam-appstate, includes gamelib_installapp.h
src/backend/storeManagers/steam/
├── macSteamAdoption.ts      # generalise (pids list, platform evidence), keep the pure decision functions
├── playAdoption.ts          # NEW: Play gate extracted from gameLaunch.ts (line ceiling, see Pitfall 6)
└── adoptionStatus.ts        # NEW: sidecar query + push for the page
```

### Pattern 1: One adoption-watch task, not one per app
**What:** A singleton `PollKind::Adoption` task keyed `"adoption"` (like `POLL_KEY` for running in `running.rs`), holding a map `appId -> WatchEntry`. It starts on the first `steampoll_adoption_watch` op, ticks every few seconds, and ends when the map is empty (D-07 "runs only while records exist"). TS owns the record store and calls `watch`/`unwatch` when it writes or clears a record, and re-registers every stored record once at sidecar boot.
**Why:** Matches the Phase 80 registry shape [VERIFIED: registry.rs:16-20 `pub enum PollKind { Install, Uninstall, Running, }`]. Cadence: a slow tick (5 s, matching `RUNNING_POLL_INTERVAL_MS`) is enough because sign-in adoption lands about 1 s after `BLoggedOn` (083). Each tick spawns at most one helper child (D-08 re-attach per poll), bounded by a helper timeout (the existing `HELPER_TIMEOUT_MS` is 30 s, `update.rs:31`; use a much shorter bound for a read-only probe).
**Event:** add `StateEvent::AdoptionState { app_id, seq, adopted: bool, signed_in: Option<bool> }`. Events carry full state, and the outbox keeps latest per `(appId, kind)` [VERIFIED: events.rs doc comment "Every event carries the FULL resulting state, never a delta"]. The TS handler (`steamPollEventRegistration.ts` `applyEvent`) clears the record when `adopted`, caches `signedIn`, and pushes the page message.
**Fail-safe (D-10):** helper missing, `unsupported-arch`, timeout or unparseable output yields `signed_in: None` and no adoption. The record and note stay; Play uses `decidePlayAdoption` as today.

### Pattern 2: Helper subcommand `--steam-appstate <appId>`
**What:** Port spike 083's `probe.c` `tick` mode into a new header beside `gamelib_installapp.h`, dispatched from `bridge_helper.c` next to the existing subcommands. Output: one JSON line, `{"result":"ok","loggedOn":0|1,"state":N,"installed":K}` or `{"result":"unavailable","reason":"..."}`, exit codes as the sibling subcommands (0 ok, 2 unavailable, 64 usage).
**Reuse, do not copy:** `gamelib_ownedapps.h` already resolves `BLoggedOn` on `IClientUser` through engine slot 8 with RTTI check and unique-function-ID slot lookup, and `gamelib_installapp.h` already resolves `IClientAppManager` (getter slot scan) and `gl_ia_find_method_slot`. The new header needs only `GetAppInstallState` (function-ID high half `0xeaf2`) added to that lookup.
**Trap:** `gl_ia_attach` returns the reason `"not-signed-in"` when `ConnectToGlobalUser <= 0` and `"steam-not-running"` when the pipe is `<= 0`. The 261105-ord gate found `ConnectToGlobalUser` does not detect Steam's sign-in screen (CONTEXT D-08). So the new subcommand must report signed-in from `BLoggedOn` only, and map attach reason `not-signed-in` to `loggedOn: 0` [ASSUMED: A1] and `steam-not-running` to a distinct "not running" result. Spike 083's probe attached fine while signed out and printed `"loggedOn":0`, so signed-out is a normal answer, not an error.
**Rust side:** model on `request_steam_install_app` in `update.rs` (helper path from `host.bridge_helper_path()`, argv array, `ProcessRunner::run` with timeout, last JSON line parsed, every failure maps to a typed `Unavailable`) [VERIFIED: update.rs:60-122].
**Platform:** arm64 macOS only (the function-ID decode reads AArch64). Intel Macs and other OSes get `unavailable`, which the ACF-rewrite and log evidence cover except for the signed-in note.

### Pattern 3: D-12 migration without a second writer
The hold store is written only by Rust and the pending store only by TS (single-writer rule R3 in `lib.rs`). A boot migration that has Rust write the pending store would add a second writer. Instead:
1. Rust op `steampoll_hold_drain` reads `steam_restart_hold.json` with `parse_record`, runs `decide_rearm` against live pids and start tokens, and returns `[{appId, pids, recordedAt}]` for records whose recorded Steam is still the live one. Records whose Steam has exited are dropped (Steam restarted since, so it adopted at startup). Invalid records are ignored (the file is untrusted disk content, T-80-19).
2. TS, at sidecar init, takes each returned record, finds its ACF (the poll roots resolver), snapshots it with `readAcfSnapshot`, writes a pending-adoption record, and registers a watch. A record whose ACF is gone is dropped.
3. TS then calls `steampoll_hold_discard`, which deletes the file. Idempotent: a crash between steps 2 and 3 re-runs safely.
**Baseline pitfall:** the migrated baseline is the ACF as it is now. If Steam already rewrote it, `isSteamAdoptedAcf` sees "no difference" and reads not-adopted, so Play would restart Steam needlessly. Mitigation: for a migrated record, run one helper/log evidence check before writing, and treat helper state 4 as adopted (drop the record).
**Records that exist today:** the shipped pending-adoption record has `steamPid`, `manifestPath`, `baseline {mtimeMs, content}`, `recordedAt` [VERIFIED: macSteamAdoption.ts:57-64]. Windows/Linux need a pid list with start tokens, because `pgrep -x steam` returns two pids on Linux and Windows reuses pids. Add an optional `pids?: {pid, startToken}[]` and keep reading the old `steamPid`.

### Pattern 4: Evidence per platform

| Signal | macOS | Windows | Linux | Source |
|--------|-------|---------|-------|--------|
| ACF rewritten by Steam (sha/mtime differs, StateFlags 4, real buildid) | yes (083: Steam rewrote the ACF at sign-in) | yes, primary (`LauncherPath` key appears, within ~1 s) | **no**: ACF unchanged 90 s after adoption | specs 083, 087, 088 |
| Helper `GetAppInstallState` 1026 -> 4 | yes | n/a | n/a | spike 083 |
| content_log `Loaded N apps from install folder` after the record time | yes | yes (marks every rescan) | yes (`5 -> 6` apps) | specs 083, 087, 088 |
| `libraryfolders.vdf` `apps` map lists the app | n/a | n/a | yes | spike 088 |
| Signed-in reading | helper `BLoggedOn` | HKCU `Software\Valve\Steam\ActiveProcess` `ActiveUser` (0 = signed out) | `[Logged On` line in `logs/connection_log.txt` | specs 083, 087, 088 |
| Steam pid changed | evidence, re-check against the ACF/helper | **not evidence** (sign-out restarts `steam.exe`) | **not evidence** (sign-out restarts `steam`) | specs 087, 088 |
| HKCU `Apps\<id>\Installed` | n/a | **do not use** (stays 1) | n/a | spike 087 |

The `Loaded N apps` line, verbatim from the spikes: `[2026-11-14 08:29:29] Loaded 14 apps from install folder "/Users/<user>/Library/Application Support/Steam/steamapps\appmanifest_*.acf".` (Mac) and `[2026-11-17 05:57:49] Loaded 11 apps from install folder "C:\Program Files (x86)\Steam\steamapps\appmanifest_*.acf".` (Windows). The line says a rescan happened and N includes the app once adopted; it does not name the app, so use it only as timing evidence together with a count increase or the ACF/helper signal. [VERIFIED: 083 runs/live-1/content_log.txt:5, 087 runs/r1-startup-flags4.ndjson line 10]

### Anti-Patterns to Avoid
- **Treating a pid change as adoption on Windows or Linux.** Spikes 087 r4 and 088 r4: sign-out restarts Steam and the ACF sat untouched.
- **Falling back to plain `steam://rungameid` on a refused restart.** It opens Steam's install dialog (D-05, spikes 047/048).
- **Calling InstallApp on sign-in.** D-09: detection observes the adoption; fire InstallApp once only if state is not 4 a few seconds after `BLoggedOn` turns 1 (083 fallback).
- **Adding a Rust reader for the TS-owned pending store.** Use watch ops.
- **Running `generate-claude-md` or editing CLAUDE.md regions.** Out of scope.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Steam pid listing and start-time tokens (Win/Linux/Mac) | New probes | `list_steam_client_pids`, `read_steam_process_start_tokens` in `hold.rs` (keep them when deleting the hold) | Already cross-platform, injection-guarded, tested (36 tests in `tests/hold.rs` pass) |
| Validating persisted hold records | New parser | `parse_record` | D-12 note in CONTEXT; handles untrusted disk content |
| Running-game probe on Windows/Linux | New registry readers | Rust op `steampoll_read_running_app_id` | Windows HKCU, Linux registry.vdf plus reaper scan already exist [VERIFIED: running.rs header doc] |
| Graceful Steam quit and bounded wait | New restart code | `restartMacSteamForAdoption` (generalise the injected deps, keep the logic) | Refuses on running game / owed wrap / 30 s timeout, never kills Steam |
| Pure Play-time decision | New decision function | `decidePlayAdoption` plus helper/log evidence as extra input | Shared by `gameUninstall.ts`; change it in one place |
| In-app notice with action | New toast system | `steamRequestNotice` push + `SteamEngineLaunchNotice` request slot (extend closed `kind` set) | Existing seq/validation/auto-hide machinery (T-pvk-01) |
| New rustInvoke op wiring | Ad hoc IPC | The Phase 80 op pattern (see Touchpoints) | Census tests enforce it |

**Key insight:** this phase is mostly deletion plus generalisation. Nearly every needed primitive exists; the new code is the helper subcommand, the watch task, the Windows/Linux evidence readers, and the UI.

## Runtime State Inventory

This phase deletes a persisted store and migrates records, so the five categories are answered explicitly.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `${userData}/store_cache/steam_restart_hold.json` (hold records: `pids[{pid,startToken}]`, `recordedAt`, `macNativeRoute`, `skippedDepots`) [VERIFIED: profile.rs:91-95 `&["store_cache", "steam_restart_hold.json"]`; hold.rs:34-47]. `store_cache/steam_pending_adoption.json` (TS CacheStore, indefinite lifespan) [VERIFIED: stores.ts:340-344 `'steam_pending_adoption'`] | Data migration for hold records (D-12: drain, convert, discard). Code edit for the pending store (record shape gains optional `pids`). |
| Live service config | None. Steam's own state is read, never written, by this phase. | None, verified by reading the install-end branch and the poll crate: nothing registers state in an external service. |
| OS-registered state | None. No launchd/Task Scheduler/systemd entry references the hold. | None, verified by grep for `steam_restart_hold` across `src` and `src-tauri` (only crate, shell dispatch, fixtures). |
| Secrets/env vars | `GAMELIB_STEAM_MAC_PATH` gates the Mac owned-apps path (CLAUDE.md); not touched. No new secret. | None. |
| Build artifacts | The bridge helper binary must be rebuilt (`pnpm build-steam-bridge`) after adding the subcommand, and the sidecar rebuilt (`pnpm build:sidecar`); `tauri dev` does not rebuild the sidecar (project memory). Fixtures under `gamelib-steampoll/tests/fixtures/` (`restart_hold/`, `timelines/*rearm*`, `expected-ts/*hold*`, `divergences.json`) reference the deleted behaviour. | Rebuild helper and sidecar before live tests; update or delete fixtures with the code. |

## Deletion surface

Verified by grep this session: files that mention the hold, re-arm or the `steam-waiting-for-restart` status.

- **Rust crate:** `hold.rs` (756 lines), `rearm.rs` (198), hold plumbing in `install_loop.rs` (82 matching lines: `HoldPoll`, `RestoredSteamHold`, `pending_rearm`, `reconcile_ran_during_rearm`, `holding_app_ids`, the Phase C hold handshake), `install_once.rs` (`hold_eligible` at line 198, hold block at ~490, `HoldProbeRequest`), `effects.rs` (`WriteHoldRecord`, `ClearHoldRecord`), `outbox.rs` (`HoldSink` use at line 26/340-343), `host.rs` (`HoldSink`), `profile.rs` (`restart_hold_store_path`), `dispatch.rs` facade (`hold: Arc<dyn HoldSink>`), `events.rs` (`RearmSettled`), constants (`STEAM_HOLD_PROBE_MIN_INTERVAL_MS`).
- **Shell:** `src-tauri/src/steampoll_dispatch.rs` (`steampoll_boot` calls `rearm_persisted_holds` at line 153; `HoldStore::new(profile.restart_hold_store_path.clone())` at line 461). **Naming trap:** `steampoll_running_hold` / `RunningPoll` "hold" is the running-app poll's launch-watch hold and is unrelated; do not delete it.
- **CLI:** `gamelib-steampoll-cli/src/replay.rs`.
- **TS:** `pollRust/rustSteamPoll.ts` `withoutSteamRestartHolds` and its callers in `library/refresh.ts` (line 188) and `library/rustRefresh.ts` (line 91); `PollStatus.holding` in `steamPollTypes.ts`; `steamClientProcess.ts` keeps only `listSteamClientPids` (used by `updateDetection.ts`) once the start-token half has no caller; `sidecar/steamPollEventRegistration.ts` `rearmSettled` case; `common/types/ipc/sidecarInternal.ts` event schema.
- **Frontend:** `GameStatus.tsx` (~line 207) and `MainButton.tsx` (~line 205) "Restart Steam to finish" branches; `hooks/constants.ts` (line 47) and `hooks/hasStatus.ts`; locale key `steam.waitingForSteam.notify` in `public/locales/en/translation.json`.
- **Tests and fixtures:** `tests/hold.rs`, `tests/rearm.rs`, `tests/install_once_*.rs`, timelines `install-restart-hold-*`, `install-max-ticks-holding-release`, `rearm-*`, `expected-ts/*`, `state-events.json`; Jest `MainButton.steamWaitingRestart.test.tsx`, `steamClientProcess.test.ts`, `pollsRustBranch.status.test.ts`, `hasStatus.reconcile.test.ts`, `steamIncompleteCard.test.ts`.
- **Deletion gate:** `src/backend/__tests__/steamPollsPortComplete.test.ts` asserts the replay fixture directories are kept [VERIFIED: lines 12 and 46-48 `${FIXTURES}/timelines`, `${FIXTURES}/expected-ts`, `${FIXTURES}/divergences.json`]. Deleting individual hold scenarios is fine; deleting the directories is not. Edit the gate only if a directory goes away.

Touchpoints to add one rustInvoke op (Phase 80 pattern) [VERIFIED: grep of `steampoll_install_cancel_delegated`]: `gamelib-steampoll/src/dispatch.rs` (OPS list, sorted) and `tests/dispatch.rs`; `src-tauri/src/steampoll_dispatch.rs` (`rpc_*` handler); `src-tauri/src/rust_dispatch.rs` (channel match arm); `src-tauri/src/ipc_contract.rs`; `src/common/types/sidecarTransport.ts` (`RUST_STEAMPOLL_*` const); `src/common/types/ipc/rustInvoke.ts` (args schema); `src/backend/__tests__/tauriShellSource.test.ts` (census); `src/backend/storeManagers/steam/pollRust/steamPollTypes.ts`. New sidecar channels (page query, "Restart Steam now") touch `common/types/ipc/steam.ts`, `preload/api/steam.ts`, `sidecar/steamFlowRegistration.ts`, `src-tauri/src/ipc_contract.rs`, and the census tests (`ipcDomainCensus`, `flowRegistrationCensus`), following `steamDirectLaunchVerdict`.

## UI surface and Play path (D-01 to D-06)

**Page state.** The frontend needs, per game: `pending` (a record exists) and `steamSignedIn` (`true | false | null`). Recommended shape, following `getSteamUpdateInfo` / `steamDirectLaunchVerdict`: a sidecar query `steamAdoptionStatus(appId)` for page open, plus a one-way push `steamAdoptionStatus` `{appName, pending, steamSignedIn, seq}` (validated like `handleSteamRequestNoticeSignal`: numeric appId regex, finite seq, newer-seq-wins). TS sends the push from three places: record write, record clear, and the `adoptionState` handler. A new async-label component beside `SteamUpdateInfo.tsx` renders the note under the status line (D-01 "Steam will restart once when you press Play", D-03 "Sign in to Steam to finish setup"). Placement inside `GameStatus.tsx` / `MainButton.tsx` is the planner's call (CONTEXT discretion).

**Actions.** "Restart Steam now" and "Open Steam" each need a sidecar channel (they run `restartMacSteamForAdoption` or open Steam). Both must be single-flight per app (reuse `launchFlights.singleFlightLaunch` or an equivalent), because Play, "Restart Steam now" and the poll can all race.

**Restart Steam alone (D-02).** `restartMacSteamForAdoption` takes an injected `launchRunGameId`; pass a "relaunch Steam" function instead. Candidates, all to be verified live: macOS `open -b com.valvesoftware.steam` (bundle id verified on this machine via `mdls`) or `steam://open/main` [ASSUMED: A2]; Windows `<SteamExe>\steam.exe` with no arguments (spike 087 ran this 5 times with no dialog and automatic sign-in); Linux plain `steam` (not `-silent`, which starts in the tray only, spike 088). Note `ProcessRunner.openDetached` is `open -g url` and returns `unsupported-platform` off macOS [VERIFIED: runner.ts:365-374], so Windows/Linux need another opener (`deps.openExternal.openExternal`, as Play already uses for the URL).

**Refused cases (D-05).** Keep the three `gamelib:steam.adoptRestart.*` strings (`gameRunning`, `busy`, `quitTimeout`). Today they go out through `notify()` (an OS notification, no action) [VERIFIED: gameLaunch.ts:228-275]. To offer "Launch without Steam" the refusal needs an in-app notice. Recommended: add `kind`s to the closed `REQUEST_KINDS` set in `frontend/state/SteamRequestNotice.ts` and render an optional action button in `SteamEngineLaunchNotice` only when the backend marks the game eligible (`getSteamDirectLaunchVerdict(...).applies`). The notice stack has no action button today, so this is real UI work.

**D-06 is already structural.** `runDispatch` in `launchDispatch.ts` reads `launchWithoutSteam` and calls `game.launchWithoutSteam()` instead of `game.launch()`, so the adoption gate (inside `launch()`) is skipped when the setting is on [VERIFIED: launchDispatch.ts `withoutSteam ? await game.launchWithoutSteam() : await game.launch(...)`]. When a game is not eligible (Steam DRM, no binary), `launchWithoutSteam` falls back to `steamGame.launch(...)`, which then runs the adoption gate: correct. Add a test that pins both routes, and a comment naming D-06 at that line.

**1026 wait (a second producer of `steam-waiting-for-restart`).** The status is also emitted by the install poll's `downloading` branch when the ACF is exactly 1026 on a native handoff (`is_waiting`, `context = "steam-waiting-for-restart"`) [VERIFIED: install_once.rs:301-304 `let is_waiting =` and :365-366 `Some("steam-waiting-for-restart")`], independent of the hold. Normal completed depot installs write StateFlags 4; GameLib writes 1026 only when `allowFullOwnership` is false or verification fails [VERIFIED: depotRust/install.ts:165 `allowFullOwnership: false`, :199 `allowFullOwnership: opts.signal?.aborted !== true`; gamelib-depot acf.rs `can_write_full_ownership`]. So it is an edge, but it survives hold deletion and its "Restart Steam to finish" copy and disabled button still appear. See Open Question 1.

## Common Pitfalls

### Pitfall 1: Deleting the hold off-Mac before Windows/Linux have restart-on-Play
**What goes wrong:** the game reads Installed immediately, Play opens Steam's install dialog (the original D-UAT-13 bug, spike 047/048).
**Why:** the Play gate and record writer are Mac-only today (`gameLaunch.ts:208 if (isMac) {`, `gameInstallDepot.ts:594 } else if (isMac) {`).
**Avoid:** gate the hold to non-Darwin until wave B ships (`hold_eligible` adds a platform check), then delete everything in wave B.
**Warning sign:** a Windows/Linux install that finishes while Steam is running and shows Play at once.

### Pitfall 2: Windows/Linux sign-out looks like adoption
**What goes wrong:** `decidePlayAdoption` returns `clear-and-launch` for any different pid. A sign-out restarts Steam (new pid) with the ACF untouched (087 r4, 088 r4), so the record is cleared and Play opens the install dialog.
**Avoid:** off-Mac, a pid change only triggers a re-check; the record clears on ACF rewrite, log rescan after `recordedAt`, or the `libraryfolders.vdf` entry. Pin this with a unit test per OS.

### Pitfall 3: Linux has no ACF rewrite
**What goes wrong:** copying the Mac/Windows "ACF differs" check to Linux never fires; the note never clears.
**Avoid:** Linux evidence is the `Loaded N apps` line (count increase) and the `libraryfolders.vdf` `apps` map. Spike 088 did not test a real game (a tool app has no launch option), 1026, or Flatpak, so keep these in the live gate.

### Pitfall 4: `ConnectToGlobalUser` as the sign-in test
`gl_ia_attach` fails with `not-signed-in` on `user <= 0`, but the 261105-ord gate showed that value does not track the sign-in screen. Use `BLoggedOn` (Pattern 2).

### Pitfall 5: Migrated baseline already equals Steam's rewrite
See Pattern 3. Without a helper or log check at migration time, a migrated record can make Play restart a Steam that already adopted.

### Pitfall 6: `gameLaunch.ts` line ceiling
`gameLaunch.ts` is 965 lines and a "1000-line steam ceiling" exists (commit a96dab654 "split gameLaunch.ts under the 1000-line steam ceiling"; the Phase 80 handoff lists `steam-line-ceiling on gameLaunch.ts` as already red). Put the generalised Play gate in a new module and leave `launch()` a short call.

### Pitfall 7: Single-writer and idempotence
The TS handler applies events idempotently and keeps a per-(appId, kind) seq guard (`steamPollEventRegistration.ts` header). `adoptionState` must be idempotent: clearing an absent record is a no-op, and a stale seq is answered `applied: true`.

### Pitfall 8: Phase 80 parity fixtures and the event schema
`steamPollStateEventParity.test.ts` and `tests/fixtures/state-events.json` pin the Rust event shapes against the TS zod schema (`sidecarInternal.ts`). Add `adoptionState` to both and remove `rearmSettled` in the same commit, or the parity test goes red.

### Pitfall 9: Spawn tests and the fake-HOME rule
Any new TS code that spawns a child from `src/` must use `createFakeHomeProfile()` unless it needs the real profile. The helper needs the real HOME to find the user's `steamclient.dylib` (`steamInstallApp.ts` header), so a TS helper spawn needs a named, justified real-profile arm. If the helper read lives only in Rust (recommended), no TS spawn is added. Rust tests use a fake helper script path through `ScriptedRunner`, not a real Steam.

### Pitfall 10: Sidecar exit contract
No TS timers or watchers are added if the watch lives in Rust. The restart wait in `restartMacSteamForAdoption` already uses unref'd clock timers bounded by `RESTART_QUIT_TIMEOUT_MS = 30_000` [VERIFIED: macSteamAdoption.ts:38]. Keep it so.

## Code Examples

### Existing pure decision to extend (macSteamAdoption.ts)
```typescript
// Source: src/backend/storeManagers/steam/macSteamAdoption.ts:205-217 [VERIFIED]
export function decidePlayAdoption(input: {
  record: PendingAdoptionRecord | undefined
  currentPid: number | null
  currentAcf: AcfSnapshot | null
}): PlayAdoptionDecision {
  const { record, currentPid, currentAcf } = input
  if (!record) return 'launch'
  if (currentPid === null) return 'clear-and-launch'
  if (currentPid !== record.steamPid) return 'clear-and-launch'
  if (currentAcf?.rustReadFailed) return 'unknown'
  if (isSteamAdoptedAcf(record.baseline, currentAcf)) return 'clear-and-launch'
  return 'restart'
}
```
Extension points: add a `platform` input (off-Mac the `currentPid !== record.steamPid` branch must not clear on its own), a `steamSignedIn: boolean | null` input (`false` -> a new `'open-steam'` outcome, D-03), and `helperState4` / `logRescanAfterRecord` evidence inputs. `gameUninstall.ts` calls this function too (`gameUninstall.ts:483`), so its tests must keep passing.

### Helper state read, Rust side (sketch, modelled on `request_steam_install_app`)
```rust
// Pattern source: gamelib-steampoll/src/update.rs:60-122 [VERIFIED]
pub struct AppStateReading { pub logged_on: Option<bool>, pub state: Option<u32> }

pub async fn read_app_state<H: PollHost + ?Sized, R: ProcessRunner + ?Sized>(
    host: &H, runner: &R, app_id: &str,
) -> AppStateReading {
    // valid appId (1..=10 digits), helper path from host.bridge_helper_path() (never from args),
    // argv = ["--steam-appstate", app_id], bounded timeout, last JSON line parsed,
    // any failure -> AppStateReading { logged_on: None, state: None } (D-10 fail-safe)
}
```

### Spike 083 reference (what the helper must reproduce)
```c
// Source: .planning/spikes/083-adoption-signal-without-restart/probe.c [VERIFIED]
// tick mode prints: {"loggedOn":%d,"steamId64":"%llu","app":%u,"state":%u,"installed":%u}
// HI_BLoggedOn 0x6585, HI_GetAppInstallState 0xeaf2 (function-ID high halves)
// Never print the SteamID in production: gamelib_ownedapps.h prints only a `match` boolean.
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hold releases when the recorded Steam pid exits | Evidence-based release (ACF rewrite, helper state 4, log rescan), plus restart-on-Play for the unadopted case | Phase 81 | Sign-in rescans no longer leave the note stuck (261105-ord gate item 6, appId 112100) |
| "A running Steam only adopts after a restart" | Sign-in also reloads every `appmanifest_*.acf` (083, 087 r4, 088 r4) | 2026-11-14 to 17 | Signed-out Steam needs no restart |
| `steam://install` for adoption | Rejected (needs a click in Steam's install dialog, 047/048) | 2026-10 | Do not re-spike |
| Windows/Linux get a simplified hold (D-15) | Both get restart-on-Play | 2026-11-17 (087, 088) | D-15 arm is not built |

**Deprecated/outdated:** the TS `steamRestartHold.ts`, `restartHold.ts` and the TS poll loops are already deleted (Phase 80, enforced by `steamPollsPortComplete.test.ts`). The todo text referring to `rearmPersistedSteamRestartHolds()` in `library.ts` is stale; the re-arm is `rearm.rs`.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | [ASSUMED] Helper attach reason `not-signed-in` (`ConnectToGlobalUser <= 0`) can be mapped to `loggedOn: 0` | Pattern 2 | A transient attach failure is shown as signed out; note flips wrongly. Verify live at Steam's sign-in screen and during Steam startup. |
| A2 | [ASSUMED] `steam://open/main` brings Steam forward without a dialog (the Valve wiki lists `main` only as a component name; no example found) | UI surface | "Open Steam" / "Restart Steam now" fall back to `open -b com.valvesoftware.steam`. CONTEXT already says verify live. |
| A3 | [ASSUMED] A Mac Steam sign-out does not restart `steam_osx` (083 does not state the pid before and after) | Pattern 4, Pitfall 2 | If it does restart, the Mac "pid changed" rule has the same sign-out hazard; the re-check design (pid change only triggers a re-check) already covers it. |
| A4 | [ASSUMED] Linux Flatpak Steam and Steam Deck gaming mode behave as native Debian Steam | Pitfall 3 | Not tested in 088. Treat as unsupported or gate with a live check. |
| A5 | [ASSUMED] On Windows, `steam://rungameid/<id>` (tested in 087 r3) is the right relaunch URL, not the `launch/<id>/Dialog` form Play normally uses there | UI surface | The `launch` form after a relaunch is untested; use `rungameid` for the restart relaunch unless a live check passes. |
| A6 | [ASSUMED] A 5 s tick is slow enough for the helper (one fork-scan plus attach per call) | Pattern 1 | If a call exceeds the tick, ticks overlap. Use `MissedTickBehavior::Delay` as the running poll does, and skip a tick while a helper child runs. |
| A7 | [ASSUMED] Steam startup rescans appmanifests before sign-in on every platform, so "Restart Steam now" adoption does not depend on sign-in | D-02 | On Windows it did (087 r1: `Loaded 11 apps` before auto sign-in at +23 s). Mac and Linux startup is covered by 001/003 and 088 r3; not re-measured for a signed-out startup. |

## Open Questions

1. **What happens to the 1026 wait (`steam-waiting-for-restart`)?**
   - What we know: it has its own producer (`downloading` branch, `is_waiting`), is independent of the hold, and the game is not installed by the ACF while it lasts (so Play is unavailable). It is rare (failure/unverified installs).
   - What's unclear: CONTEXT says the status "leaves the Mac path" (D-01) and lists removing it as discretion, but never mentions 1026.
   - Recommendation: keep the status only for the 1026 case, with the D-02/D-03 actions attached when a pending record exists (the user cannot press Play, so the actions are the only way forward). Everything else reports Installed. Ask the operator only if they prefer deleting the 1026 state too.

2. **What does D-05's "Launch without Steam" action call?**
   - What we know: launch-without-Steam landed as a per-game toggle; the one-shot channel `steamLaunchWithoutSteam` was removed in q1t. `launchWithoutSteam()` falls back to `launch()` for ineligible games, which would re-enter the refusal.
   - What's unclear: whether a one-shot action is still wanted now that a per-game toggle exists, and whether it should flip the toggle or launch once.
   - Recommendation: ship refuse-and-notify with a clear hook first (CONTEXT allows it); add the action as a notice button that launches once through a new channel guarded by `getSteamDirectLaunchVerdict(...).applies`. Surface this to the operator at plan review.

3. **Where does the "Loaded N apps" evidence get its baseline?**
   - What we know: the line has no app id. N includes the app once adopted.
   - Recommendation: record the content_log byte offset and the last `Loaded` count at record time; adoption evidence is a `Loaded` line after that offset whose count is higher (Linux, Windows) or any `Loaded` line followed by an ACF/helper/library confirmation. Specify the exact rule in the plan so the Rust tests can pin it.

4. **Should Play consult the helper state before restarting?**
   - Recommendation: yes on Mac. One bounded helper read at Play, `state == 4` means adopted (clear and launch). It removes the migrated-baseline hazard and a race where the watch has not ticked yet.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Rust toolchain | crate work, `cargo test -p gamelib-steampoll` | yes | cargo 1.99.1, rustc 1.99.1 | none needed |
| Node / pnpm | Jest, lint, codecheck | yes | Node v22.23.4, pnpm 10.28.0 | none needed |
| Apple clang (arm64) | build the helper (`clang -arch arm64`) | yes | Apple clang 21.0.0, arm64 | none needed |
| Mac Steam client | live gate | yes (a Steam process is running on this machine, pid observed via `pgrep -x steam_osx`; do not quit it from research) | bundle id `com.valvesoftware.steam` (via `mdls`) | n/a |
| Windows 11 with native Steam | live gate (Windows arm) | not on this machine; spike 087 ran on one | client 1794536281 | operator runs the gate there |
| Linux with native Debian Steam | live gate (Linux arm) | not on this machine; spike 088 ran on one | client 1794536281 | operator runs the gate there |

**Missing dependencies with no fallback:** none for code. The Windows and Linux halves of the live gate require the operator's other machines.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 29 (sidecar, frontend) and `cargo test` (Rust crates) [VERIFIED: both ran green this session: `macSteamAdoption.test.ts` 36 passed; `cargo test -p gamelib-steampoll --test hold` 36 passed] |
| Config file | `package.json` scripts (`"test": "jest"`); `src-tauri/crates/gamelib-steampoll/Cargo.toml` (feature `testing` for `RecordingHost`, `ScriptedRunner`, `FakeClock`) |
| Quick run command | `pnpm exec jest <path>` and `cargo test -p gamelib-steampoll --manifest-path src-tauri/Cargo.toml --test <name>` |
| Full suite command | `pnpm test:ci` and `cargo test -p gamelib-steampoll --manifest-path src-tauri/Cargo.toml` |

Gates to keep green (Phase 80 handoff list): `pnpm lint`, `pnpm find-deadcode`, `pnpm backend-di-ceilings`, `pnpm gameinfo-narrowing-ceiling`, `pnpm i18n --fail-on-update`, `pnpm codecheck`, `pnpm planning-gates`, prettier on edited paths. Known red and not Phase 81: see `80-HANDOFF.md` ("Known red, not phase 80").

### Decision to Test Map
| Decision | Behavior | Test Type | Automated Command | File Exists? |
|----------|----------|-----------|-------------------|-------------|
| D-01 | Pending record: badge Installed, Play enabled, note shown | Jest (RTL) | `pnpm exec jest src/frontend/screens/Game/GamePage/components/__tests__/` | Rewrite `MainButton.steamWaitingRestart.test.tsx`; new note test (Wave 0) |
| D-02 | "Restart Steam now" runs the shared restart, relaunches Steam alone, clears record on success only | Jest | `pnpm exec jest src/backend/storeManagers/steam/__tests__/macSteamAdoption.test.ts` | extend existing |
| D-03 | Signed out: "Sign in" note + Open Steam; Play opens Steam, no restart | Jest (decision) + live | same + live gate | extend; new `'open-steam'` case |
| D-04/D-05 | No prompt; refused cases never call plain rungameid; notice copy kept | Jest | `pnpm exec jest src/backend/storeManagers/steam/__tests__/games.test.ts` (Play gate) | extend |
| D-06 | `launchWithoutSteam` on bypasses the gate; ineligible falls back through it | Jest | `pnpm exec jest src/backend/storeManagers/steam/directLaunch/` and a `launchDispatch` test | new (Wave 0) |
| D-07 | Watch task starts with the first record, stops when none remain, emits `adoptionState` on ACF rewrite / state 4 / rescan | cargo (paused time) | `cargo test -p gamelib-steampoll --manifest-path src-tauri/Cargo.toml --test adoption` | new (Wave 0) |
| D-08 | Helper parse: ok / unavailable / garbage / timeout / signed-out reading | cargo (`ScriptedRunner`) | same `--test adoption` | new |
| D-08 | Helper subcommand builds and prints one JSON line | build + manual | `clang -arch arm64 ...` via `pnpm build-steam-bridge`; run `steam-bridge-helper --steam-appstate <id>` | new, live |
| D-09 | No automatic InstallApp retry at sign-in; one fire only if state is not 4 a few seconds after `BLoggedOn` turns 1 | cargo | `--test adoption` | new |
| D-10 | Helper missing or unreadable: record kept, note stays, Play = `decidePlayAdoption` incl. WR-01 | cargo + Jest | `--test adoption`; `macSteamAdoption.test.ts` | extend |
| D-11 | Hold, store, re-arm gone; Installed reported as soon as ACF says so | cargo + Jest | `cargo test -p gamelib-steampoll ...`; `pnpm exec jest src/backend/__tests__/steamPollsPortComplete.test.ts` (extend with absence asserts for `rearm.rs`, `steam_restart_hold`) | extend |
| D-12 | Drain returns live valid records, drops dead/invalid; TS writes pending records; discard deletes file; crash between is safe | cargo + Jest | `--test hold_migration`; Jest for the TS step | new (reuse `fixtures/restart_hold/ts-written.json`) |
| D-13 | No hold survives; debug questions closed | review | grep gate in `steamPollsPortComplete.test.ts` | extend |
| D-14 | Win/Linux: restart-on-Play, evidence per OS, pid change not evidence | cargo (per-`Platform` tests) + Jest (decision per platform) | `--test adoption`; `macSteamAdoption.test.ts` | new |
| D-15 | Not built (both spikes YES) | n/a | n/a | n/a |

### Sampling Rate
- **Per task commit:** the single test file the task touches.
- **Per wave merge:** `cargo test -p gamelib-steampoll --manifest-path src-tauri/Cargo.toml` plus `pnpm exec jest src/backend/storeManagers/steam src/backend/sidecar src/frontend/screens/Game` plus `pnpm codecheck`.
- **Phase gate:** full Jest and cargo green, plus the live gate below, before `/gsd-verify-work`.

### Live gate (operator; UAT item shape per `gamelib-conventions`: `### N.` heading at column 0, `expected:` inline, `result:` opening with a status word)
1. Signed-in Mac Steam: install a game with InstallApp off; Installed + Play + note; Play restarts Steam once and the game starts.
2. Appid 112100 case: Steam at its sign-in screen, install finishes, operator signs in; note clears on its own, same pid (main regression).
3. "Restart Steam now" without launching the game; record cleared; Steam adopts.
4. A refused restart (a game running in Steam): notice shown, no plain rungameid, record kept.
5. Migration: place a valid `steam_restart_hold.json` record, boot; it becomes a pending record, file deleted; a record whose ACF is gone is dropped.
6. InstallApp ON path unchanged (adopts, no record), and its fallback writes a record.
7. Windows 11 and Linux, same items 1 to 4 (operator's other machines). Include on Linux: a real game launching after the relaunch, which 088 did not test.
Offline UAT steps: network off only for the action (project memory). Restart `pnpm tauri:dev` after `pnpm build:sidecar` and `pnpm build-steam-bridge`.

### Wave 0 Gaps
- [ ] `src-tauri/crates/gamelib-steampoll/tests/adoption.rs`: watch lifecycle, evidence per platform, helper parse, fail-safe
- [ ] `src-tauri/crates/gamelib-steampoll/tests/hold_migration.rs`: drain/discard
- [ ] Jest: Play gate per platform, `'open-steam'` decision, D-06 bypass, note component, "Restart Steam now" channel
- [ ] Fixture edits: `state-events.json`, timelines/expected-ts for deleted hold scenarios, `divergences.json`
- [ ] A fake helper script for Rust tests (prints canned JSON lines); no real Steam in unit tests

## Security Domain

`security_enforcement` is not set to false in `.planning/config.json`, so this section applies.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Sign-in is Steam's; GameLib only reads the signed-in state |
| V3 Session Management | no | none |
| V4 Access Control | no | none |
| V5 Input Validation | yes | AppId `^\d{1,10}$` at every op and helper argv; zod args structs for new ops; `parse_record` for hold records; helper stdout and `content_log.txt` lines parsed leniently and never trusted |
| V6 Cryptography | no | none (compare ACF content as strings; no hashing needed) |
| V12 Files and Resources | yes | Log and ACF reads bounded (tail a capped window, not the whole file); paths from the poll roots resolver, never from op args |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Command injection via appId or path into helper/`steam.exe` argv | Tampering | argv arrays, no shell, integer pid interpolation only (as `hold.rs` does), helper path only from `host.bridge_helper_path()` (T-80-37) |
| Untrusted persisted record (hold file edited) drives a Steam quit | Tampering | `parse_record` + liveness + start-token check; migration never quits Steam; Play re-reads the ACF |
| PID reuse mistaken for the recorded Steam | Spoofing | start tokens (Windows/Linux/Mac probes exist); store `pids` with tokens |
| Quitting Steam under a running game or owed go-offline wrap | Denial of service | existing refusals in `restartMacSteamForAdoption`; keep them for all OSes; never kill Steam |
| Information leak in logs | Information disclosure | T-28-04: log appId, kind and counts only; never a SteamID, path or title; the helper must not print the SteamID (`gamelib_ownedapps.h` prints a `match` boolean) |

## Sources

### Primary (HIGH confidence)
- Repo files read this session: `81-CONTEXT.md`, `macSteamAdoption.ts`, `gameLaunch.ts` (lines 1-330), `gameInstallDepot.ts` (215-380, 540-640), `launchDispatch.ts`, `directLaunch/launchWithoutSteam.ts`, `steamInstallApp.ts`, `steamClientProcess.ts` (1-80), `macSteamClient.ts`, `process/runner.ts` (openDetached), `pollRust/rustSteamPoll.ts`, `library/installPolling.ts`, `sidecar/steamPollEventRegistration.ts`, `GameStatus.tsx`, `MainButton.tsx`, `hooks/constants.ts`, `hooks/hasStatus.ts`, `SteamUpdateInfo.tsx`, `SteamRequestNotice.ts`; Rust `hold.rs`, `rearm.rs`, `install_once.rs`, `install_loop.rs` (grep), `events.rs`, `host.rs`, `registry.rs`, `dispatch.rs`, `running.rs`, `update.rs`, `constants.rs`, `profile.rs`, `steampoll_dispatch.rs`; helper `gamelib_installapp.h`, `gamelib_ownedapps.h`.
- Spikes: `083-adoption-signal-without-restart/README.md` and `probe.c`, `087-windows-acf-adoption/README.md`, `088-linux-acf-adoption/README.md`.
- Absorbed todo `2026-11-05-steam-restart-hold-brittle-discuss.md`; completed todo `2026-11-07-launch-steam-games-without-steam.md` (q1t results and live notes).
- Commands run this session: `cargo test -p gamelib-steampoll --test hold` (36 passed), `jest macSteamAdoption.test.ts` (36 passed), `mdls` bundle id, tool versions.

### Secondary (MEDIUM confidence)
- [Steam browser protocol (Valve wiki)](https://developer.valvesoftware.com/wiki/Steam_browser_protocol) via search snippets only (the page returned 403 to a fetch): `steam://exit`, `steam://open/games`, `main` as a component. `steam://open/main` is not confirmed by an example (A2).

### Tertiary (LOW confidence)
- None used.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH, nothing new is added and every primitive was read in the repo.
- Architecture: HIGH for Mac and the Rust/TS split; MEDIUM for the Windows/Linux evidence readers, which no code reads yet and which cannot be live-checked from this machine.
- Pitfalls: HIGH, each traces to a read line or a spike result.

**Research date:** 2026-11-17
**Valid until:** 2026-12-01 (the helper depends on undocumented Steam internals; re-check after any Steam client update)
