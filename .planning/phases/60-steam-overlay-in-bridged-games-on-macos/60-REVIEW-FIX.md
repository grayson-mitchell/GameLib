---
phase: 60-steam-overlay-in-bridged-games-on-macos
fixed_at: 2026-11-04T00:00:00Z
review_path: .planning/phases/60-steam-overlay-in-bridged-games-on-macos/60-REVIEW.md
iteration: 1
findings_in_scope: 6
fixed: 6
skipped: 0
status: all_fixed
---

# Phase 60: Code Review Fix Report

**Fixed at:** 2026-11-04
**Source review:** .planning/phases/60-steam-overlay-in-bridged-games-on-macos/60-REVIEW.md
**Iteration:** 1

**Summary:**

- Findings in scope: 6 (WR-01..WR-06; no criticals; Info out of scope, IN-07 already fixed in b83a8c1b2)
- Fixed: 6
- Skipped: 0

## Live-behaviour impact (what warrants a live spot-check)

| Fix   | Changes live overlay behaviour?                                                                 | Spot-check?                                  |
| ----- | ----------------------------------------------------------------------------------------------- | -------------------------------------------- |
| WR-01 | **Yes.** New open-state encoding, a 2 s publisher-pid watch while open, helper publishes 0 at startup/exit | **Yes**: one CrossOver + one Staging open/close; leave the overlay open > 10 s to confirm no self-close |
| WR-02 | Only when `GAMELIB_OVERLAY_INPUT_PROBE=1` (dev): the fix is now withheld beside the probe        | No (UAT 10-17 ran without the probe)         |
| WR-03 | Log lines only (`close` line now `close deferred=N ...`; deferred lines capped at 32)           | Covered by the WR-01 check (read the lines) |
| WR-04 | Log line only (`applied=` from the launch values; new `reason=not-injected`)                    | Covered by the WR-01 check                   |
| WR-05 | Log shape only: `open windows=N unhide=N assoc=1 err=N` (now logged after the release, still before `set_active 1`) and `close deferred=N assoc=A hide=H rect=replayed\|none\|no-window` | Covered by the WR-01 check |
| WR-06 | Test only                                                                                       | No                                           |

Happy path unchanged: open still clears confinement, associates 1, unhides to the recorded depth and calls
`set_active(1)`; while open winemac re-capture is deferred; close calls `set_active(0)` and replays once.
The Wine-service deny-list gate and its `overlay_input inactive` line are untouched. Marker lines keep their
`overlay_input open` / `overlay_input close` / `overlay_input set_active` prefixes; `open` and `close` now
carry trailing fields, so an exact-line grep (not a substring grep) would need updating.

Before the spot-check: `pnpm build-steam-bridge` (helper + overlay_input.dylib changed) and
`pnpm build:sidecar-sea`, then restart `pnpm tauri:dev` (it does not rebuild the sidecar).

## Fixed Issues

### WR-01: A missed close leaves game input blocked for the session, not just the cursor free

**Files modified:** `native/steam-bridge/helper/gamelib_overlay_signal.h`, `native/steam-bridge/helper/bridge_helper.c`, `native/steam-bridge/overlay-input/overlay_input.m`, `meta/__tests__/overlaySignal.test.ts`, `meta/__tests__/overlayInputSmoke.test.ts`
**Commit:** 2d3f1f5e8
**Applied fix:** The open state is now `(helper pid << 8) | 1` (closed stays 0; `state != 0` listeners like the
probe read it unchanged). While open, overlay_input polls `kill(pid, 0)` every 2 s on the main queue. It
closes by itself (logs `publisher gone pid=N`, then the normal close: `set_active 0` plus replay) **only on
ESRCH**, so a live helper never closes the overlay, however long it stays open. EPERM or any doubt means no
close. The helper publishes 0 at startup, which releases a game left open by a SIGKILLed predecessor, and
again from `atexit`. No signal handler was added, because notify calls are not async-signal-safe; SIGTERM
deaths are caught by the pid watch instead. The header comment now says input is blocked.
Trade-offs, recorded in the header: a live helper whose Steam never sends `m_bActive=0`, and pid reuse
within one poll interval, both still degrade to the old no-timeout behaviour. A bare state 1 (no pid) arms
no watch.
Tests: a live-publisher case (held open 4.5 s, no self-close) and a dead-publisher case (a reaped child's
pid gives one close and `set_active 0` without a close post).
**Status:** fixed: live spot-check passed 2026-11-04. Schedule I on CrossOver (launched 21:34:52,
`applied=true`) held the overlay open for 16 s (shim `blocking` at 21:35:24, `passing` at 21:35:40) and
it did not close itself. The Planet Crafter on Wine-Staging (launched 21:37:08, `reason=cx-missing`,
`applied=true`) passed the same check. On both runs the operator confirmed the cursor, clicks, and
mouse-look returning after close. Each overlay log shows exactly one
`overlay_input open windows=4 unhide=1 assoc=1 err=0`, `set_active 1`/`0`, and
`close deferred=0 assoc=1 hide=1 rect=replayed`, so the close came from the signal and not from the
publisher-gone path.

### WR-02: The fix and the probe together break the fix's winemac caller check

**Files modified:** `src/backend/storeManagers/steam/games.ts`, `src/backend/storeManagers/steam/bridge/overlay/overlayLaunch.ts`, `src/backend/storeManagers/steam/bridge/overlay/__tests__/overlayLaunch.test.ts`, `src/backend/storeManagers/steam/__tests__/games.test.ts`
**Commit:** b438440c5
**Applied fix:** Option (a). Any armed probe now withholds the fix: `applied=false reason=experiment` when
an experiment is set, otherwise the new `reason=probe`. The reason order is documented in the code: route,
disabled, experiment, probe, missing. As defence in depth, the value builder also drops `inputModulePath`
whenever a safe probe is present. The "tokens: input then probe" test became "a safe probe drops the input
module". Added games.test.ts cases for both routes.

### WR-03: The global 64-line stderr cap is used up by per-call "deferred" lines

**Files modified:** `native/steam-bridge/overlay-input/overlay_input.m`, `meta/__tests__/overlayInputSmoke.test.ts`
**Commit:** 00d15b823
**Applied fix:** There are now two budgets. Lifecycle lines (open, close, set_active, inactive, register
failed, publisher gone) get 256. Deferred lines get their own 32 and are always counted, and the per-open
total is reported on the close line (`close deferred=N`). In the flood test the driver now runs a second
open/close after 500 deferred calls. The test asserts exactly 32 deferred lines, both opens and both
closes, and per-open totals 503 and 1.

### WR-04: The `overlay input fix=... applied=true` line is logged before the launch outcome is known

**Files modified:** `src/backend/storeManagers/steam/games.ts`, `src/backend/storeManagers/steam/bridge/overlay/overlayLaunch.ts`, `src/backend/storeManagers/steam/__tests__/games.test.ts`
**Commit:** 5153f91af
**Applied fix:** `overlayInputArg` logs only refusals and returns a candidate path without logging. Then
`prepareTcpOverlay` logs the one outcome line in `finally`, from the values the launch actually carries: the
returned CX_ENV tokens, or the env vars, as `KEY=value`. It logs `applied=true` only when
DYLD_INSERT_LIBRARIES names the module. A prepare error, a refused runner registration, a value-builder drop
or a throw logs `applied=false reason=not-injected` (new reason). `carried` is set only after the return
value is built, so a throw in `getBridgeBottleSettings` cannot log a false applied=true. The false "the
caller logs" comment in overlayLaunch.ts is corrected. Tests cover the clone error, refused registration,
builder drop and fallback error cases. The two applied=true tests now use mocks that echo the module into
DYLD_INSERT_LIBRARIES, as the real builder does.

### WR-05: The overlay_input smoke tests never assert the release, and pass without exercising anything when there is no window server

**Files modified:** `native/steam-bridge/overlay-input/overlay_input.m`, `meta/__tests__/overlayInputSmoke.test.ts`, `meta/__tests__/overlayInputProbeSmoke.test.ts`
**Commit:** 48b35ac8c
**Applied fix:**

- **Real-state check of confinement.** The fake winemac calls `setMouseConfinementRect:` on a real
  borderless NSWindow (never shown). The driver reads `mouseConfinementRect` back and the test asserts
  four states:
  - before open: rect in force
  - after open: cleared
  - after a deferred winemac rect: still clear
  - after close: the latest rect replayed
- **Caught regression.** A mutation that left confinement in place on open made the headline test fail,
  then the file was restored.
- **Log fields.** The open and close lines now report what was actually done, and the test asserts them:
  - open: windows cleared, unhide count, associate(1) and its CGError
  - close: deferred total, replayed assoc, hide count, and rect replayed/none/no-window
- **Cursor and associate stay log-asserted only.** Cursor visibility of a background process cannot be
  observed: `CGCursorIsVisible` stayed 1 across hide in a probe run. CGAssociate state cannot be queried.
- **Headless handling.** Whether a window server exists is decided at collect time (`launchctl managername`
  is `Aqua`, spawned with a fake-HOME profile). Without one, the cases are `it.skip` with a logged
  `SKIPPED` line. With one, a driver that prints `no-window-server` fails the case instead of passing it.
  The same gate covers the 60-17 experiment cases and the NSCursor sub-assertion in
  `overlayInputProbeSmoke.test.ts`.

### WR-06: The DRM route's "log only, never inject" contract (D-04) has no test

**Files modified:** `src/backend/storeManagers/steam/__tests__/games.test.ts`
**Commit:** fd1864a0d
**Applied fix:** The new DRM-route launch test sets up every other gate to pass: module present, no probe,
fix not off. It asserts three things:

- `prepareOverlayTokens` receives no `inputModulePath`.
- CX_ENV has no `overlay_input.dylib`.
- The fix lines are exactly `[... applied=false reason=route]`.

Mutation check: adding `'drm'` to `OVERLAY_INPUT_FIX_ROUTES` makes the test fail. The change was then
restored.

## Verification run (in the review-fix worktree)

- `pnpm build-steam-bridge`: helper, overlay_shim, overlay_input_probe and overlay_input all built (arm64 + x86_64).
- `npx jest --selectProjects Meta --runTestsByPath meta/__tests__/overlayInputProbeSmoke.test.ts meta/__tests__/overlayInputSmoke.test.ts meta/__tests__/overlaySignal.test.ts meta/__tests__/buildSteamBridgeShims.test.ts`: 72 passed. This ran on an Aqua session, so no case was skipped.
- `npx jest --runTestsByPath src/backend/storeManagers/steam/__tests__/games.test.ts src/backend/storeManagers/steam/bridge/overlay/__tests__/*.test.ts src/backend/__tests__/fakeHomeIsolation.test.ts`: 837 passed, 1 skipped (pre-existing).
- `pnpm codecheck`: exit 0. `pnpm smoke:sidecar`: PASS.
- `npx prettier --check` over each changed TS path: clean. eslint warning counts per changed file are equal to or below main.

## Not done / follow-ups

- IN-01 (stale `probe flag only` comment at bridge_helper.c:188) was left as is: it is out of scope.
- `graphify update .` was not run; the graph is not tracked in git.

---

_Fixed: 2026-11-04_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
