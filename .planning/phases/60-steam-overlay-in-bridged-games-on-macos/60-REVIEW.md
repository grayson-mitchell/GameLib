---
phase: 60-steam-overlay-in-bridged-games-on-macos
reviewed: 2026-11-04T07:55:59Z
depth: standard
files_reviewed: 15
files_reviewed_list:
  - native/steam-bridge/overlay-input/overlay_input.m
  - native/steam-bridge/overlay-input/overlay_input_probe.m
  - native/steam-bridge/helper/gamelib_overlay_signal.h
  - native/steam-bridge/helper/bridge_helper.c
  - meta/buildSteamBridgeShims.ts
  - meta/__tests__/buildSteamBridgeShims.test.ts
  - meta/__tests__/overlayInputProbeSmoke.test.ts
  - meta/__tests__/overlayInputSmoke.test.ts
  - meta/__tests__/overlaySignal.test.ts
  - src/backend/constants/paths.ts
  - src/backend/storeManagers/steam/bridge/overlay/overlayLaunch.ts
  - src/backend/storeManagers/steam/bridge/overlay/__tests__/overlayLaunch.test.ts
  - src/backend/storeManagers/steam/games.ts
  - src/backend/storeManagers/steam/__tests__/games.test.ts
  - src/frontend/components/UI/SteamEngineLaunchNotice/index.tsx
findings:
  critical: 0
  warning: 6
  info: 7
  total: 13
status: issues_found
---

# Phase 60: Code Review Report (gap closure 60-15 / 60-17 / 60-19 / 60-20)

**Reviewed:** 2026-11-04T07:55:59Z
**Depth:** standard
**Files Reviewed:** 15
**Status:** issues_found

## Summary

Scope is `git diff 3ac3da9db..HEAD` for the listed files, limited to the 60-15, 60-17, 60-19 and 60-20 commits
(`42f2223cc`, `7b9b838c6`, `8eb3a7c55`, `fe4d045c7`, `1b4d6ec9f`, `60477e990`, `df913db2b`). The `quick-261104-rvy`
hunks are excluded: `titleSettings` / `pickTitleSettings` / `getSettings()` in games.ts and the
`readStoredOverlayOverride` refactor in overlayPolicy.ts. The SteamEngineLaunchNotice comment is
**not in the commit range**. It exists only as an uncommitted working-tree change (see IN-07).

The core state machine in `overlay_input.m` holds up. The design is state-based: listeners read
`notify_get_state` rather than counting posts, so coalesced or reordered notifications are safe. Open and
close are idempotent under the lock, and the hide-depth bookkeeping stays balanced across
open → hide/unhide → close. The helper-side name derivation (`--report-appid` else `--appid`) matches the
game-side `SteamAppId` (always `this.appId`), including the identity-only (480) route.

No blockers were found. The main defects are:

- A missed close leaves the game's **input blocked**, not just the cursor free.
- When the fix module and the diagnostic probe load together, the fix's caller check stops working.
- The global 64-line stderr cap gets used up by per-call "deferred" lines.
- The `applied=true` log line is printed before the outcome is known.
- The smoke tests that are supposed to prove release-on-open never assert the release. Without a window
  server they pass without exercising anything.

## Warnings

### WR-01: A missed close leaves game input blocked for the session, not just the cursor free

**File:** `native/steam-bridge/overlay-input/overlay_input.m:19-20, 302, 326`
**Issue:** The header says "A missed close leaves the cursor free until the next close or game exit
(T-60-19-03)". With `OVERLAY_INPUT_BLOCK 1`, `overlay_open` also calls `np_overlay_shim_set_active(1)`. In
`overlay_shim.m:1015-1030` that call makes `hook_send_event` swallow every event in `overlay_input_mask` before
it reaches `WineApplication`.

Suppose the close notification never arrives. That happens if the helper crashes or is killed while the
overlay is open, if Steam quits with the overlay up, or if Steam simply does not emit 331 `m_bActive=0`. The
game then stops getting mouse (and any other masked) input. Recovering needs another open/close pair, and
that requires a live helper and Steam client. If those are what died, the game stays unusable until it
exits. The probe had a 300 s safety close (`overlay_input_probe.m`, `dispatch_after ... "timeout"`). The
production port dropped it with no replacement.
**Fix:** Do at least one of these:

- Have the helper publish state 0 on its shutdown paths (normal exit, `SIGTERM`/`SIGINT` handler, `atexit`).
  A relaunched helper should also publish 0 once at startup.
- Have overlay_input detect a dead publisher. For example, the helper posts a periodic heartbeat state such
  as `2`/`1`, or overlay_input checks the helper pid it was given via env. Force `overlay_close()` when the
  publisher is gone.

In either case, correct the header comment to say that input is blocked, not just that the cursor is free:

```c
/* bridge_helper.c, shutdown path */
if (g_ovl.publish && g_ovl.registered) (void)gl_ovl_publish(&g_ovl, 0);
```

### WR-02: The fix and the probe together break the fix's winemac caller check

**File:** `src/backend/storeManagers/steam/games.ts:4821-4829`, `src/backend/storeManagers/steam/bridge/overlay/overlayLaunch.ts:131-134`, `native/steam-bridge/overlay-input/overlay_input.m:137,175,193,210`
**Issue:** `overlayInputArg` applies the fix whenever the probe is armed without an experiment. The value
builder then emits `...:overlay_input.dylib:overlay_input_probe.dylib`, which the "tokens: input then probe"
test asserts. Both images hook the same entry points:

- `NSCursor +hide/+unhide` and `NSWindow -setMouseConfinementRect:` as ObjC swizzles.
- `CGAssociateMouseAndMouseCursorPosition` and `CGWarpMouseCursorPosition` as `__interpose` hooks.

The probe's constructor runs second, so its swizzle captures `ovl_cursor_hide` (and the others) as
"real" and calls them directly (`overlay_input_probe.m:288, 305, 324`). Inside `ovl_cursor_hide`,
`__builtin_return_address(0)` then points into `overlay_input_probe.dylib`, not `winemac.so`. As a result:

- `st_hide_real`, `st_rect` and `st_assoc` are never recorded.
- Nothing is deferred while the overlay is open.
- On close, nothing is replayed.

The C interposes have the same problem in reverse. Each image's tuple rebinds the other image's call, so
the return address seen by one hook is inside the other dylib. In other words, the dev diagnostic used to
verify the fix silently turns the fix into "set_active only". Any probe-assisted re-run of UAT items 10-17
would measure a different behaviour from production.
**Fix:** Pick one of these:

- (a) Do not apply the fix whenever the probe is armed:
  `if (armed) { logInfo(line(false, 'probe')); return {} }`.
- (b) Stop the probe from swizzling or interposing once `overlay_input.dylib` is loaded. It can check
  `dlsym(RTLD_DEFAULT, ...)` for an exported marker symbol from overlay_input and run observe-only
  without hooking.
- (c) Classify callers by walking past known GameLib images.

Option (a) is the smallest. Add a games.test.ts case for it.

### WR-03: The global 64-line stderr cap is used up by per-call "deferred" lines, so later open/close evidence is lost

**File:** `native/steam-bridge/overlay-input/overlay_input.m:42, 63-64, 143, 153, 184, 220`
**Issue:** `ovl_log` stops for good after 64 lines per process. Every deferred winemac call logs one line,
with no rate limit. The probe's `log_deferred` had a 20/s limit; the port dropped it. Games that recenter the
cursor every frame make winemac call `CGWarpMouseCursorPosition` every frame. So the cap is gone about a
second into the **first** overlay open. After that, no later `open`, `close`, `set_active 1/0`,
`set_active absent` or `register failed` line is ever written. These are the only in-process markers the
60-18 / UAT verification criteria read. The `--flood` smoke test only checks `<= 64`. It does not check that
`close` is still logged after the flood, so it would not catch this.
**Fix:** Give lifecycle lines (`open`, `close`, `set_active`, `register failed`, `inactive`) a separate,
always-available budget. Rate-limit `deferred` lines, or summarise them: log a count once per open, e.g.
`close deferred=N`.

```c
static unsigned deferred_count;            /* reset in overlay_open, reported in overlay_close */
#define DEFER(api) do { __sync_fetch_and_add(&deferred_count, 1); } while (0)
...
ovl_log_lifecycle("close deferred=%u", deferred_count);
```

Add an assertion to the flood test that `overlay_input close` is present.

### WR-04: The `overlay input fix=... applied=true` line is logged before the launch outcome is known

**File:** `src/backend/storeManagers/steam/games.ts:4835-4836, 4931-4960`
**Issue:** `overlayInputArg` logs `applied=true` when the object spread is evaluated, before
`prepareOverlayEnv` / `prepareOverlayLaunch` runs. Several later steps can fail:

- `prepareOverlayLaunch` returns `status: 'error'` (clone, re-sign, register).
- `setOverlayBridgeRunner` refuses the registration.
- `overlayEnvValues` drops the path because `safePath` fails.

In each case the overlay, and so the fix, is not injected, but the log still says `applied=true`. The
docblock says it logs "exactly one `overlay input fix=` line per overlay launch". In practice it logs one per
*attempt*, and the line is used as UAT evidence. The `overlayLaunch.ts:83` comment says "Unsafe values are
dropped silently (the caller logs)", but the caller never checks `safePath`, so a drop is never logged.
**Fix:** Return the candidate path without logging, and emit the line after the builder result is known:
`applied=${result.status === 'ok' && result.vars[0].value.includes(builtOverlayInputPath)}`. Alternatively,
have `overlayEnvValues` report whether `inputModulePath` was honoured, e.g. `inputApplied: boolean` on the ok
result, and log from that.

### WR-05: The overlay_input smoke tests never assert the release, and pass without exercising anything when there is no window server

**File:** `meta/__tests__/overlayInputSmoke.test.ts:267-283, 251-257`
**Issue:**

- The headline test, "releases on open, defers winemac re-capture, forwards others, replays once, blocks",
  only checks log markers and `set_active` order. It never checks that the cursor was actually unhidden
  on open, that `CGAssociate(1)` was issued, or that hide/associate were replayed on close.
- The fake `winemac.so` never calls `setMouseConfinementRect:`. That leaves the confinement-clear and
  rect-replay paths, the core of G1, with no coverage.
- Every test `return`s green when `no-window-server` is printed, which is the case on headless CI. The whole
  suite then passes without exercising anything. The same pattern applies to the 60-17 additions in
  `overlayInputProbeSmoke.test.ts`.

**Fix:**

- Have the fake winemac also call `setMouseConfinementRect:` on a real `NSWindow`.
- Have the driver record what happened, e.g. via `CGCursorIsVisible()` / `CGSCursorIsVisible` sampled after
  open, or a fake `real_confine` observer.
- Assert those effects.
- When there is no window server, use a clearly reported skip (`test.skip` decided at collect time, or
  `it.todo`) rather than a passing test.

### WR-06: The DRM route's "log only, never inject" contract (D-04) has no test

**File:** `src/backend/storeManagers/steam/games.ts:4721, 4812-4815`; `src/backend/storeManagers/steam/__tests__/games.test.ts` (60-20 block)
**Issue:** The 60-20 tests cover tcp-clone, env, missing, `off`, experiment and overlay-off. No test
drives the DRM route and checks two things: that `prepareOverlayTokens` gets no `inputModulePath`, and that
`applied=false reason=route` is logged. The route gating is a module-level `Set`, so adding `'drm'` to it
(or reordering the checks) would ship the fix into the DRM clone and nothing would fail. D-04 names exactly
that regression.
**Fix:** Add a DRM-route case. Assert `__prepareOverlayTokensMock.mock.calls[0][0]` has no
`inputModulePath` key, and that `fixLines()` equals `[... 'applied=false reason=route']`.

## Info

### IN-01: Stale comment says the 331 publish is behind the probe flag

**File:** `native/steam-bridge/helper/bridge_helper.c:188`
**Issue:** The comment reads `// 60-15: ... Darwin notification, probe flag only.` Since 60-19, publishing
always happens and only logging is gated by the flag (lines 3224-3228, header comment).
**Fix:** Change it to `publish always (60-19); log behind GAMELIB_OVERLAY_INPUT_PROBE=1`.

### IN-02: The release/defer/replay state machine exists twice

**File:** `native/steam-bridge/overlay-input/overlay_input.m:133-344` vs `overlay_input_probe.m:106-470`
**Issue:** The hooks, `st_*` state and the open/close replay are near-verbatim copies. A fix to one, such as
WR-01 or WR-03, will drift from the other. Because they share hook points, they also interact badly (WR-02).
**Fix:** Now that the experiment has a verdict, remove the experiment from the probe and keep the probe
observe-only. Alternatively, move the shared state machine into a header.

### IN-03: `compileOverlayInput` duplicates `compileOverlayInputProbe`

**File:** `meta/buildSteamBridgeShims.ts:880-930`
**Issue:** The compile, lipo, codesign and lipo-info sequence is copied line for line. The production module
also links `ApplicationServices` even though it uses only CG/AppKit/notify.
**Fix:** Use one `compileUniversalDylib({ name, argv })` helper, and drop the unused framework from the
production argv.

### IN-04: `game_gate` logs "inactive" even when the decision is only deferred

**File:** `native/steam-bridge/overlay-input/overlay_input.m:115-131`
**Issue:** If the first notification arrives before `NSApp` or `WineApplication` exists, `process_active`
stays `-1` and the code still logs `inactive` once. A later, successful `open` then follows an
`inactive` line, which misleads anyone reading the log.
**Fix:** Log `inactive` only when `process_active == 0` (decided), or log `undecided` separately.

### IN-05: Only the last confinement rect is replayed, although open clears every window

**File:** `native/steam-bridge/overlay-input/overlay_input.m:208-225, 288-292, 335-342`
**Issue:** Open zeroes `setMouseConfinementRect:` on every `NSApp` window, but `st_rect` / `st_rect_win`
keep only the most recent winemac call. Confinement set on any other window is not restored on close.
**Fix:** Record per-window rects, or record and restore only the windows that had non-zero confinement.

### IN-06: Any same-user process can spoof the overlay-state notification

**File:** `native/steam-bridge/helper/gamelib_overlay_signal.h:26, 66-75`; `overlay_input.m:363-372`
**Issue:** `com.gamelib.steambridge.overlay.<appid>` is a plain notifyd name, so any local process can set
its state and post it. That would block or unblock game input (`set_active`) and free the cursor. The impact
is limited to a same-user local process, which already has stronger options.
**Fix:** Record the impact in the threat register. If it matters, also check the posting helper's pid via a
state encoding, or use a `user.uid.<uid>.` prefixed name.

### IN-07: The SteamEngineLaunchNotice i18n exemption is uncommitted

**File:** `src/frontend/components/UI/SteamEngineLaunchNotice/index.tsx:35-37`
**Issue:** The `i18n-gate-exempt:` comment appears only in the working tree (`git status` shows `M`), not in
`3ac3da9db..HEAD`. The marker sits on a non-first top-level statement, so the gate makes it
declaration-scoped (`hardcodedStringGate.ts:1717-1727`). That is the intended narrow scope, and the reason is
accurate: the toast consumes the key/en pairs through `t(...)` at lines 173-174. But until it is committed,
the gate fix is not part of the phase.
**Fix:** Commit it with the gap-closure work, or record it in the relevant SUMMARY.

---

_Reviewed: 2026-11-04T07:55:59Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
