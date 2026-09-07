---
created: 2026-09-01T04:55:00.000Z
title: "Helper processes orphan on app quit — comet survived 22h across two teardowns, and `shutdownBridgeHelper()` has no production call site under Tauri"
area: tauri-shell
status: RESOLVED
severity: major
files:
  - src/backend/storeManagers/gog/games.ts:728-731 (getCometBin + comet spawn)
  - src/backend/storeManagers/gog/games.ts:759 (child.kill(), game-exit-scoped only)
  - src/backend/storeManagers/steam/bridge/helperProcess.ts:306 (shutdownBridgeHelper, no prod caller)
  - src/backend/storeManagers/steam/bridge/helperProcess.ts:301 (the stale "wired to main.ts before-quit" comment)
  - src/backend/platform/index.ts:416 (comment referencing the deleted main.ts before-quit)
---

## Observed

While installing a new build on 2026-09-01, `/Applications/GameLib.app` could not be replaced
because a helper still held the bundle open:

```
PID   ELAPSED     COMMAND
58242 22:34:17    .../build/bin/arm64/darwin/comet --from-heroic --username <user> --quit
```

**It had outlived the app that spawned it by a full session.** Started 2026-08-31 17:54:55; the
current `gamelib-shell` had started 2026-09-01 11:36:22 — so comet survived the previous
teardown *and* was still alive 4h52m into an unrelated later session. `lsof` showed **1
ESTABLISHED network connection** still open after 22 hours, under the user's GOG account.

A graceful `osascript` quit exited `gamelib-shell` + `gamelib-sidecar` in **2 seconds** and left
comet running — so it is not attached to the app lifecycle in any way. It then exited **1 second
after a plain SIGTERM**: it is trivially reapable, it is simply never reaped.

## Cause — two independent defects

**1. comet's kill is game-exit-scoped, not quit-scoped.** `gog/games.ts:728-731` spawns comet, and
`:759` does `child.kill()` — but only *after* `runRunnerCommand(...)` resolves, i.e. only when the
game exits through the normal path. Quit the app (or lose the launch path any other way) while
comet is alive and that line never runs. There is no other teardown: grepping `comet` against
`kill|terminate|SIGTERM|before-quit|cleanup|unref|detach` across `src/backend` returns **nothing**
outside that one call.

**2. The Steam bridge already solved this, and the fix is now dead code.**
`steam/bridge/helperProcess.ts:301` documents `shutdownBridgeHelper()` as *"torn down from the
main-process app-quit lifecycle (Task 3, `main.ts` before-quit) so the long-lived shared helper
never orphans on quit."* That is **no longer true**:

- `grep -rn "shutdownBridgeHelper" src/` finds call sites **only in its own test file**. No
  production caller exists.
- `src/backend/main.ts` **does not exist** — deleted by the Phase 35 Electron cutover.
- `grep -rn "before-quit" src/` finds **no handler at all**, only two comments referring to the
  one that was deleted (`platform/index.ts:416`, `helperProcess.ts:301`).

So the Steam bridge helper can orphan for the same reason comet does, while its tests stay green
and its doc comment still asserts it is wired. Same shape as
`initstoremanagers-dead-under-tauri` — a function that quietly lost its call site in the
migration, with the tests unable to see it because they call it directly.

## Why it matters

- **Resource + network leak across restarts.** A day-old process holding an authenticated GOG
  connection is not benign; it accumulates per session.
- **Blocks app replacement.** It held the `.app` bundle open. Any installer or updater that
  replaces the bundle in place hits this — including the auto-updater path.
- **Silently growing.** Nothing surfaces an orphan, so instances accumulate until someone looks
  at `ps`.

## Fix sketch (not prescriptive — verify before implementing)

The real question is **what replaces `app.on('before-quit')` under Tauri**, since that hook is
gone and both helpers assumed it. Find the surviving quit/teardown seam in the Tauri shell or
sidecar bootstrap, then register both teardowns there. Track every long-lived child in one place
rather than adding a second ad-hoc kill.

**Do not fix comet alone** — that leaves the bridge helper orphaning for an identical reason and
leaves `helperProcess.ts:301`'s comment asserting a wiring that does not exist.

## Verification requirements

A unit test that calls the teardown directly **cannot see this defect** — that is precisely how
`shutdownBridgeHelper()` stayed green with no production caller. Required instead:

1. **Live gate:** launch a GOG game so comet spawns, quit the app, assert `pgrep -f comet` is
   empty. Same for the Steam bridge helper.
2. **A wiring assertion**, not just a behaviour assertion — prove the teardown is *reachable from
   the quit path*, so deleting the call site fails a test. This is the gap that let defect 2
   through.
3. Prove both directions: the gate must FAIL against current `HEAD`.

## Evidence captured 2026-09-01

```
graceful quit -> gamelib-shell + gamelib-sidecar gone in 2s; comet 58242 still alive
SIGTERM       -> comet exited in 1s
lsof +D /Applications/GameLib.app after kill -> empty (it was the only holder)
```

## Disposition 2026-09-07 (quick task 260907-juv) — DOES NOT CLOSE

Implemented the two-layer fix this todo's "Fix sketch" called for. Full detail, verbatim
RED/GREEN proof output, and deviations in
`.planning/quick/260907-juv-fix-helper-process-orphan-on-app-quit-wi/260907-juv-SUMMARY.md`.
Commits: `edb4db4e9` (Layer A), `60ec8cb89` (Layer B), `e12545484` (gates).

- **Layer A (graceful, in-app quit only):** new `src/backend/longLivedChildren.ts` registry.
  `handleExit()` (`backend/utils.ts`, the `ipcMain.on('quit', ...)`/Ctrl+Q path) calls
  `shutdownLongLivedChildren()` immediately before `app.exit()`. Both comet (`gog/games.ts`)
  and the Steam bridge helper (`helperProcess.ts`) register with it at spawn time.
- **Layer B (unconditional, every quit path):** `SidecarState::shutdown_child()`
  (`src-tauri/src/main.rs`) now signals the sidecar's whole unix process group
  (`libc::kill(-pgid, SIGTERM)` -> bounded grace via `try_wait()` -> `SIGKILL` -> `wait()`)
  instead of just the sidecar pid, so comet/the bridge helper are reaped even on red-X/Cmd+Q/
  `osascript` quit, which never reaches `handleExit()`. Windows keeps the pre-existing
  `child.kill()` (no process-group-signal equivalent available).
- **Wiring gate, not just a behavior gate** (this todo's verification requirement #2): a new
  `src/backend/__tests__/quitTeardownWiring.test.ts` pins the Rust call sites and structure
  directly (source-text assertions, comment-stripped), plus two new tests each in
  `appShellFlows.test.ts` and `helperProcess.test.ts` proving the registry is reachable from
  the sidecar's quit handler and from the bridge helper — not just callable in isolation.
- **Verification requirement #1 (live gate) is UNRUN.** Per this quick task's plan, the live
  gate was explicitly out of scope for the executor to perform:
  1. Launch a GOG game so comet spawns.
  2. Quit the app via the window's red-X close button (not Ctrl+Q — that exercises
     `handleExit()`/Layer A; red-X exercises the `RunEvent::Exit` path/Layer B, which is the
     path this todo's original evidence was captured against).
  3. `pgrep -f comet` should return no result.
  4. Repeat for the Steam bridge helper (start a Steam game session, quit via red-X, confirm
     the bridge helper process is gone).

  **This todo does not close until that live gate is run and passes.**
- **Separately, and explicitly out of scope for this fix:** `pnpm tauri:dev`'s own Ctrl-C
  dev-teardown still orphans the sidecar by a different mechanism (a PATH-based process sweep
  that the dev harness performs, not the packaged app's quit path) — see
  `tauri-dev-shell-does-not-reap-its-node-sidecar.md`. Layer B's process-group reap lives in
  `shutdown_child()`, which the dev harness's Ctrl-C teardown does not invoke. Not addressed
  by this fix; tracked as a pre-existing, distinct limitation.

## Live-gate attempt 2026-09-07 (orchestrator) — BLOCKED, NOT RUN, NOT FAILED

Attempted the Verification Requirement #1 live gate against a real `pnpm tauri:dev` build carrying
both layers. **The quit gesture could not be delivered: the machine's screen was LOCKED**, so the
app had no GUI session (`count of windows` = 0 via System Events, `frontmost` could not be set).
Two `osascript ... to quit` attempts changed nothing — shell, sidecar, comet, gogdl and the game
were all still running 16s later.

**This is BLOCKED, not a FAIL.** A SIGTERM to `gamelib-shell` was deliberately NOT used as a
substitute gesture: a bare signal terminates the process without running `RunEvent::Exit`, so it
cannot exercise `shutdown_child()` at all and would have manufactured a false FAIL.

### What WAS observed, and it is real evidence for Layer B's spawn half

The deep link was delivered to the running dev instance by writing to the single-instance socket
(`~/Library/Application Support/gamelib/gamelib-single-instance.sock`), bypassing LaunchServices —
necessary because `/Applications/GameLib.app` (v0.7, `com.gamelib.shell`) still claims the
`gamelib:` scheme and `open gamelib://...` would have launched the STALE PACKAGED app instead of
the dev build under test. Verbatim, with the game running:

```
  PID  PPID  PGID  COMMAND
25817 25676 25607  target/debug/gamelib-shell
25887 25817 25887  node .../build/main/sidecar.js
26083 25887 25887  .../bin/arm64/darwin/comet --from-heroic --username soreluel --quit
26084 25887 25887  ./gogdl ... launch .../Endless Sky.app 1829678475 --platform osx
26085 26084 25887  .../Endless Sky.app/Contents/MacOS/Endless Sky
```

The sidecar's PGID **equals its own PID (25887)** rather than inheriting the shell's group (25607),
and comet, gogdl and the game itself all sit in that same group 25887. That is
`configure_sidecar_process_group()` / `process_group(0)` working on a live build, and it is the
precondition Layer B's `libc::kill(-pgid, ...)` reap depends on. **It does not prove the reap
itself fires** — only `RunEvent::Exit` running `shutdown_child()` can, and that is what remains
unrun.

### Two findings that change how the gate must be run

1. **`exitToTray: true` (the current on-disk setting) intercepts the quit.** The close handler
   hides to tray instead of exiting, so `RunEvent::Exit` never fires. Whoever runs this gate must
   either use the **tray icon's Quit item** (`main.rs:643` menu id `quit` -> `app_handle.exit(0)`
   at `:9281`) or temporarily set `exitToTray: false`. The todo's original 2026-09-01 evidence was
   captured against a packaged build where the `osascript` quit did exit in 2s — do not assume the
   same gesture works under the current settings.
2. **`~/Library/Application Support/GameLib` and `.../gamelib` are the SAME DIRECTORY** — one
   inode (`16777231:47832404`), two case-variant paths on case-insensitive APFS. Anything that
   treats them as two stores is reading and writing one file twice.

### Remaining gesture (~2 minutes, needs an unlocked screen)

1. `pnpm tauri:dev`, wait for `sidecar signalled READY`.
2. `echo "gamelib://launch/gog/1829678475" | nc -U "$HOME/Library/Application Support/gamelib/gamelib-single-instance.sock"`
3. Confirm `pgrep -f comet` is non-empty and `ps -o pgid= -p $(pgrep -f comet)` matches the sidecar's PGID.
4. Quit via the **tray icon's Quit item** (or red-X with `exitToTray:false`).
5. Assert `pgrep -f comet` and `pgrep -f 'build/main/sidecar.js'` are both empty.
6. Repeat for the Steam bridge helper: launch a Steam game (Steam client must be running — it was,
   `steam_osx` pid 17365), confirm `pgrep -f steam-bridge-helper` non-empty, quit, assert empty.

**This todo still does not close.**

## LIVE GATE RUN 2026-09-07 — BOTH HALVES PASS, NON-VACUITY PROVEN. THIS TODO CLOSES.

Supersedes the "BLOCKED" record above: the screen was unlocked and the gate was run end to end
against a `pnpm tauri:dev` build carrying both layers. Quit gesture was the **tray icon's Quit
item** (`main.rs:643` -> `app_handle.exit(0)` at `:9281`), chosen because `exitToTray: true`
remained on disk and intercepts a window-close quit. No settings were modified.

### Half 1 — GOG / comet: PASS

Launched via the single-instance socket (NOT `open gamelib://`, which would have gated the stale
`/Applications/GameLib.app` v0.7). Pre-quit, everything in the sidecar's OWN group 28778:

```
28728 28583 28532  target/debug/gamelib-shell
28778 28728 28778  node .../build/main/sidecar.js
28850 28778 28778  comet --from-heroic --username soreluel --quit
28851 28778 28778  ./gogdl ... launch .../Endless Sky.app 1829678475 --platform osx
28852 28851 28778  .../Endless Sky.app/Contents/MacOS/Endless Sky
```

Quit clicked 16:30:53. At t+1s: **all gone.** `pgrep -f comet`, `pgrep -f build/main/sidecar.js`,
`pgrep -f gamelib-shell`, `pgrep -f "Endless Sky"` — all empty. Shell logged
`[shell] sidecar terminated on exit`.

### Half 2 — Steam bridge helper: PASS

The helper does NOT spawn for an ordinary macOS-native Steam title: Bastion (107100) correctly took
`shell.openExternal('steam://rungameid/...')` and never touched the bridge. The helper is reached
ONLY from `launchBridgeGame()` (`steam/games.ts:2163`), the allowlisted Windows-title path. The
allowlist (`bridge/bridge-allowlist.json`) holds exactly two entries — Avernum 5 (206040) and
Avernum 6 (206060) — and neither has an ACF under Steam's default `steamapps`. They ARE installed,
in the dedicated CrossOver bottle:
`~/Library/Application Support/CrossOver/Bottles/GameLibSteamBridge/drive_c/Program Files (x86)/Steam/steamapps/`.

Launching 206040 spawned the helper into the sidecar's group:

```
29539 29396 29344  target/debug/gamelib-shell
29571 29539 29571  node .../build/main/sidecar.js
29986 29571 29571  .../bin/arm64/darwin/steam-bridge-helper
```

Quit clicked 16:35:20. At t+1s: **all gone.** `pgrep -f steam-bridge-helper` empty.

### Negative control — the gate CAN fail, and it reproduces the original defect

A passing gate proves nothing unless it could have failed, so `main.rs` was reverted to
`32324f6ec` (`git show 32324f6ec:src-tauri/src/main.rs > src-tauri/src/main.rs`, never
`git checkout --`), rebuilt, and the IDENTICAL gesture re-run with the same game.

First, the spawn-side difference is visible before any quit — pre-fix the sidecar INHERITS the
shell's group (`30413` has pgid `30131`), where the fixed build gives it its own (`28778`/`28778`).

Then, after the same tray-Quit click, shell and sidecar died but:

```
30474     1 30131  comet --from-heroic --username soreluel --quit
30475     1 30131  ./gogdl ... launch .../Endless Sky.app 1829678475 --platform osx
30476 30475 30131  .../Endless Sky.app/Contents/MacOS/Endless Sky
```

**PPID 1 — reparented to launchd, still alive at t+6s.** That is this todo's original orphan,
reproduced on demand. `main.rs` was then restored from `HEAD` and verified byte-identical
(`git diff` empty). Control orphans were reaped.

### Verification requirements — final status

1. **Live gate — RUN AND PASSED**, both halves, with a negative control proving non-vacuity.
2. **Wiring assertion — DONE.** Gates A/B/C; call-site deletion reds with `Received number of
   calls: 0`, not a module-resolution error.
3. **Both directions — DONE.** Automated: RED at `32324f6ec`, GREEN at HEAD. Live: orphans at
   `32324f6ec`, clean at HEAD, same gesture.

**CLOSED.** Machine swept clean; `exitToTray`/`startInTray` unchanged (`true`/`true`).

Out of scope and still open, unchanged by this todo: `pnpm tauri:dev`'s own Ctrl-C dev-teardown
orphan (`tauri-dev-shell-does-not-reap-its-node-sidecar`) — a different mechanism, since killing
the dev shell never runs `RunEvent::Exit` at all.
