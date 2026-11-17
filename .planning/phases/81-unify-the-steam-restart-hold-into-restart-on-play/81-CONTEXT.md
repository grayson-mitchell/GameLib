# Phase 81: Unify the Steam restart hold into restart-on-Play - Context

**Gathered:** 2026-11-17
**Status:** Ready for planning, after the Windows/Linux spike has run (D-14)

<domain>
## Phase Boundary

Today there are two mechanisms for a GameLib depot install that the running Steam client has not
adopted. This phase reduces them to one:

- **The D-UAT-13 poll hold.** It lives in `gamelib-steampoll` `hold.rs` and shows "Restart Steam to
  finish". It has a persisted `steam_restart_hold` store and a boot re-arm.
- **Restart-on-Play.** It lives in `macSteamAdoption.ts`. It keeps a pending-adoption record, and
  Play quits and relaunches Steam.

After this phase, the game reads as installed as soon as the ACF says so. On macOS, the
unadopted case is handled by restart-on-Play, by an in-app "Restart Steam now" action, and by
background detection of adoption (spike 083's sign-in rescan). The hold, its persisted store and
its boot re-arm are deleted wherever restart-on-Play applies.

Windows and Linux follow the result of the adoption spike, which runs before planning (D-14):

- If Steam adopts a GameLib-written ACF at startup with no dialog, they get restart-on-Play.
- Otherwise they get a simplified in-memory hold (D-15).

Not in scope:
- re-spiking `steam://install`;
- building launch-without-Steam (see `<deferred>`).

</domain>

<decisions>
## Implementation Decisions

### Carried forward (roadmap and spikes, not re-asked)
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

### What the game page shows (macOS, adoption pending)
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

### Quitting Steam on Play
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

### Watching for adoption
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

### Deleting the hold (macOS)
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

### Windows/Linux arm
- **D-14:** Run the spike todo
  `2026-11-16-spike-steam-startup-and-sign-in-adoption-on-windows-linux.md` **before**
  `/gsd-plan-phase 81`, on Windows first and then Linux. The planner then plans only the arm each
  OS gets. If the spike answers yes to its questions 1 and 5 on an OS, that OS gets restart-on-Play
  with the D-01–D-05 UX and the D-07 detection, using non-helper evidence from spike question 4.
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

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope
- `.planning/ROADMAP.md` §"Phase 81": goal and scope
- `.planning/todos/completed/2026-11-05-steam-restart-hold-brittle-discuss.md`: the absorbed
  todo. It holds the 261105-ord gate item 6 failure (appId 112100) and the boot re-arm
  observations.
- `.planning/todos/pending/2026-11-16-spike-steam-startup-and-sign-in-adoption-on-windows-linux.md`:
  must run before planning (D-14)
- `.planning/todos/pending/2026-11-07-launch-steam-games-without-steam.md`: the D-05/D-06
  interaction

### Spike evidence
- `.planning/spikes/083-adoption-signal-without-restart/README.md` and `probe.c`: the sign-in
  rescan, the `GetAppInstallState` / `BLoggedOn` polling, and the InstallApp fallback timing
- `.planning/spikes/001-acf-adoption/README.md`,
  `.planning/spikes/003-stateflags4-full-ownership/README.md`: Steam adopts at startup
- `.planning/spikes/047-running-steam-adoption/README.md`,
  `.planning/spikes/048-running-steam-adoption-large/README.md`: why `steam://install` is out
- `.planning/spikes/065-steamclient-installapp/`, `.planning/spikes/066-steamclient-register-install/`,
  `.planning/spikes/067-steamclient-uninstallapp/`: InstallApp behaviour, and a signed-out call
  returning 18
- `Skill("spike-findings-gamelib")`: (g) integrating with the running Mac Steam client

### Prior work this phase changes
- `.planning/quick/261029-ji2-replace-steam-install-sync-with-restart-/`: restart-on-Play
- `.planning/quick/261029-pkp-persist-the-steam-restart-hold-across-ga/`: the persisted hold and
  re-arm being deleted
- `.planning/quick/261105-ord-steam-experimental-installapp-setting-ma/`,
  `.planning/quick/261105-sqe-release-the-d-uat-13-restart-hold-when-s/`: the InstallApp setting
- `.planning/phases/80-steam-install-uninstall-and-update-polling-state-machines-in/80-CONTEXT.md`:
  the Rust poll architecture (D-01, D-02, D-05, D-07, D-08)

### Conventions
- `Skill("gamelib-conventions")`: fake-HOME rule for helper spawn tests, UAT item shape,
  `<verify>` prettier rule

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/backend/storeManagers/steam/macSteamAdoption.ts`:
  - the pending-adoption record and store;
  - `readAcfSnapshot`;
  - `decidePlayAdoption`;
  - `restartMacSteamForAdoption`, which refuses when a game is running, a wrap is owed, or the
    quit times out, and never kills Steam.
- `native/steam-bridge/helper/gamelib_installapp.h`: the helper pattern for IClientAppManager
  calls. Add `GetAppInstallState` / `BLoggedOn` beside it.
- `src-tauri/crates/gamelib-steampoll/src/hold.rs`:
  - `list_steam_client_pids` and the start-token probes, which are reusable for D-07 pid evidence
    and the D-15 hold;
  - `parse_record`, which D-12 migration needs.

### Established Patterns
- The Rust poll emits typed state events, and the TS handler applies them (Phase 80 D-02/D-05).
  Adoption-observed should follow this pattern.
- The fail-open / fail-safe split: an unreadable ACF never quits Steam (WR-01, 75 review).

### Integration Points
- `src/backend/storeManagers/steam/gameInstallDepot.ts` ~256–340: the install-end branch
  (InstallApp → record → `startInstallPolling` with `macNativeRoute: true`).
- `src/backend/storeManagers/steam/gameLaunch.ts` ~205–275: the Play adoption gate. This is where
  D-05's "Launch without Steam" and D-06's short-circuit go.
- `src-tauri/crates/gamelib-steampoll/src/install_once.rs`:
  - `hold_eligible` (~198) and the hold block (~490);
  - `notify_restart_steam` (~527).
- `src-tauri/crates/gamelib-steampoll/src/rearm.rs`: the boot re-arm being deleted or replaced by
  D-12 migration.
- `src/frontend/screens/Game/GamePage/components/GameStatus.tsx` ~207,
  `MainButton.tsx` ~205: the current "Restart Steam to finish" UI.

</code_context>

<specifics>
## Specific Ideas

- The 261105-ord gate item 6 case (appId 112100: Steam open at its sign-in screen, the operator
  signs in, and the same pid adopts) must end with the note clearing on its own. It is the main
  regression scenario.
- The note's wording should say what is happening and what the user can do. That was the
  absorbed todo's copy concern.

</specifics>

<deferred>
## Deferred Ideas

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

</deferred>

---

*Phase: 81-unify-the-steam-restart-hold-into-restart-on-play*
*Context gathered: 2026-11-17*
