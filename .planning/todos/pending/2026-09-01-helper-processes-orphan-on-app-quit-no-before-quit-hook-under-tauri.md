---
created: 2026-09-01T04:55:00.000Z
title: "Helper processes orphan on app quit — comet survived 22h across two teardowns, and `shutdownBridgeHelper()` has no production call site under Tauri"
area: tauri-shell
status: OPEN
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
