---
phase: 24-macos-native-steam-bridge-out-of-process-steam-api-proxy
reviewed: 2026-07-20T00:00:00Z
depth: standard
files_reviewed: 24
files_reviewed_list:
  - meta/buildSteamBridgeShims.ts
  - meta/downloadZig.ts
  - meta/gen_vtables.ts
  - meta/sdk/isteamfriends.manifest.json
  - meta/sdk/isteamuser.manifest.json
  - native/steam-bridge/generated/steam_api.def
  - native/steam-bridge/generated/steam_api_shim.c
  - native/steam-bridge/helper/bridge_helper.c
  - src/backend/constants/paths.ts
  - src/backend/main.ts
  - src/backend/storeManagers/steam/bottle.ts
  - src/backend/storeManagers/steam/bridge/allowlist.ts
  - src/backend/storeManagers/steam/bridge/bridge-allowlist.json
  - src/backend/storeManagers/steam/bridge/helperProcess.ts
  - src/backend/storeManagers/steam/bridge/importScan.ts
  - src/backend/storeManagers/steam/bridge/launchTarget.ts
  - src/backend/storeManagers/steam/bridge/protocol.ts
  - src/backend/storeManagers/steam/bridge/shimGenerate.ts
  - src/backend/storeManagers/steam/games.ts
  - src/common/types/ipc.ts
  - src/frontend/App.tsx
  - src/frontend/screens/Game/GamePage/components/SteamBridgeSetup.tsx
  - src/frontend/state/GlobalState.tsx
  - src/frontend/state/SteamBridgeSetup.ts
  - src/preload/api/steam.ts
findings:
  critical: 2
  warning: 5
  info: 2
  total: 9
status: issues_found
---

# Phase 24: Code Review Report

**Reviewed:** 2026-07-20
**Depth:** standard
**Files Reviewed:** 24
**Status:** issues_found

## Summary

Reviewed the macOS out-of-process Steam-API bridge: the native arm64 host helper
(`bridge_helper.c`), the generated cross-compiled shim (`steam_api_shim.c` +
`.def` + `gen_vtables.ts`), the TS wire protocol (`protocol.ts`), the child-process
lifecycle (`helperProcess.ts`), the routing branches (`games.ts`), and the
supporting build/frontend glue.

The wire framing (length-prefix, bounds checks, LE field agreement, request/response
header sizes) is consistent between `protocol.ts`, the shim's `bridge_transact()`,
and the helper's read loop, and the loopback-only bind + pre-read length cap
(T-24-01/T-24-03) are correctly implemented. The path-containment guards
(`isContainedWithin`, `resolveBridgeGameInstallRoot`) and numeric-appId chokepoints
are solid and reused consistently.

However, two correctness defects break the bridge's own interface path, and several
robustness gaps in the single-threaded native helper can crash or wedge the shared
long-lived process on ordinary events. Details below.

No structural-findings substrate was provided with this review.

## Critical Issues

### CR-01: `GetPersonaName` wire contract disagrees between helper and shim (returns garbage pointer or NULL)

**File:** `native/steam-bridge/generated/steam_api_shim.c:192-199` and `native/steam-bridge/helper/bridge_helper.c:354-364`
**Issue:** `GetPersonaName` is declared as a real (non-`TESTONLY`) served method
returning `const char*` (`meta/sdk/isteamfriends.manifest.json:6-11`). The helper
answers it by sending the **raw persona string bytes** (`strlen(persona)` bytes) as
the return blob:

```c
uint32_t len = (uint32_t)strlen(persona);
send_response(fd, requestId, STATUS_OK, (const uint8_t *)persona, len);
```

But the generated shim stub treats the return blob as a **4-byte pointer**:

```c
uint8_t retbuf[4]; uint32_t retlen = 0;
if (!bridge_transact(2, 0, argbuf, 0, retbuf, sizeof(retbuf), &retlen) || retlen < 4) return 0;
const char * ret; memcpy(&ret, retbuf, 4);
return ret;
```

Two failure modes, both wrong:
- Persona name > 4 bytes: `retLen > retBufCap (4)` in `bridge_transact` (shim line 81),
  so it returns 0 and the stub returns `NULL`. The game gets a null persona name.
- Persona name ≤ 4 bytes: the string bytes (plus one uninitialized byte) are
  reinterpreted as a `const char*` and returned. The game dereferences an invalid
  address → crash.

A pointer-returning method fundamentally cannot marshal a remote pointer across the
process boundary; the shim would need to receive the string bytes and stage them in
its own address space (e.g. a static/thread-local buffer) and return that pointer.
The current generator path (`gen_vtables.ts:280-292`, register-return for
`const char*`) is incompatible with what the helper actually sends.
**Fix:** Either (a) stop serving `const char*` returns over the register-return path
and add an explicit string-return marshaling case in `gen_vtables.ts` that copies the
received bytes into a shim-owned buffer and returns a pointer into it, or (b) remove
`GetPersonaName` from the served manifest until string returns are implemented, so no
game can call a stub that returns a garbage pointer. Note the two currently
allowlisted titles (Avernum 4, HOARD) may not exercise this slot, but it is live and
crash-prone for any game that calls it.

### CR-02: Shim coverage-validation set omits the interface accessor exports, so any interface-using game is wrongly rejected

**File:** `src/backend/storeManagers/steam/bridge/shimGenerate.ts:51-62`
**Issue:** `SHIM_EXPORTED_SYMBOLS` is the whitelist `placeShimForGame` validates a
game's imported symbols against (lines 165-177). It contains only the 10 flat
`SteamAPI_*` exports. But the shim the packaging step actually compiles exports
**12** symbols — the flat set **plus** the two interface accessors
`SteamAPI_SteamUser_v023` and `SteamAPI_SteamFriends_v018` (`steam_api.def:13-14`,
emitted by `gen_vtables.ts:440-452` `generateDefFile` via `...accessorExports`).

`importScan.ts`'s regex (`\b(SteamAPI_[A-Za-z0-9_]+)\b`, line 38) captures those
accessor names from a game's PE import table. Any game that calls **any** ISteamUser
or ISteamFriends method — the entire reason the vtables exist — must import
`SteamAPI_SteamUser_v023` / `SteamAPI_SteamFriends_v018`. `placeShimForGame` then
computes those as `uncoveredSymbols`, returns
`{ status: 'error', error: 'Shim does not export required symbol(s): SteamAPI_SteamUser_v023' }`,
`installBridgeGame` marks the appId bridge-failed-this-session and returns an error,
and the game is forced to the bottled fallback — **even though the shim genuinely
exports those symbols.**

The two current allowlist entries escape this only because they import flat-only
symbols; the vtable machinery that is the bulk of this phase is unusable for its
intended interface-using games, and the developer-curated allowlist is designed to
grow.
**Fix:** Add the accessor exports to the validation set so it matches the real
`.def` export table:

```ts
const SHIM_EXPORTED_SYMBOLS: ReadonlySet<string> = new Set([
  // ...existing flat exports...
  'SteamAPI_SteamUser_v023',
  'SteamAPI_SteamFriends_v018'
])
```

Better: derive the set from the same source `generateDefFile` uses (the flat superset
plus the manifests' `toVersionedAccessorSuffix` accessors) rather than maintaining a
second hand-copied list that can drift from the `.def` again.

## Warnings

### WR-01: Single-threaded helper serializes connections — a second bridge game (and its readiness probe) is starved and refused

**File:** `native/steam-bridge/helper/bridge_helper.c:384-421, 451-455`
**Issue:** The shim opens a **persistent** connection (`g_bridge_sock`) held for the
game's entire lifetime (only closed by `SteamAPI_Shutdown`, `steam_api_shim.c:237-243`).
`serve_connection()` blocks in that one connection's read loop until the peer
disconnects, and `main()` only `accept()`s the next connection **after**
`serve_connection` returns. D-03 spawns ONE shared helper reused for every bridge
game, but with one bridge game running and holding its connection open, a second
game's `ensureBridgeHelperReady()` probe connects into the listen backlog and is
never serviced → it times out for all `POLL_ATTEMPTS` → returns `'unreachable'` →
the second game is refused and marked `bridgeFailedThisSession`, forced to the bottle
fallback. Two concurrent bridge games cannot coexist, and the failure is silent
(looks like a dead helper). The module doc acknowledges "one client at a time," but
the observable effect goes beyond "sequential requests" — it breaks the shared-helper
reuse the whole design is built on.
**Fix:** Accept and service connections concurrently (thread/`select`/`poll` per
connection), or at minimum document and enforce that only one bridge game may run at a
time and surface a clear "another bridge game is active" reason instead of a generic
`'unreachable'` timeout.

### WR-02: No recv/idle timeout — a partial or stalled frame wedges the entire shared helper

**File:** `native/steam-bridge/helper/bridge_helper.c:256-265, 384-421`
**Issue:** `recv_all()` loops on blocking `recv()` with no `SO_RCVTIMEO` /
`select` timeout. A client that connects and sends fewer bytes than a frame's
declared length (a crashed bottle mid-send, a buggy shim, or a stalled TCP peer)
leaves `serve_connection` blocked in `recv_all` indefinitely. Because the accept
loop is serial (WR-01), the whole shared helper is frozen for every other client and
every readiness probe until GameLib quits. Loopback-only limits the surface but does
not remove it (any local process on 127.0.0.1:54550, or a legitimate-but-crashed
bottle).
**Fix:** Set `SO_RCVTIMEO` on the accepted socket (or use `poll`/`select` with a
bounded timeout) and abort the connection on timeout, mirroring the client-side
`PROBE_TIMEOUT_MS` discipline in `helperProcess.ts`.

### WR-03: `send()` without SIGPIPE suppression — a peer disconnect can kill the shared helper process

**File:** `native/steam-bridge/helper/bridge_helper.c:267-276, 281-290`
**Issue:** `send_all()` calls `send(fd, ..., 0)` with no `MSG_NOSIGNAL` flag, and the
process never `signal(SIGPIPE, SIG_IGN)`s nor sets `SO_NOSIGPIPE` on the socket
(confirmed: the only `setsockopt` is `SO_REUSEADDR` at line 433). On macOS, writing
to a socket whose peer has closed raises `SIGPIPE`, whose default disposition
**terminates the process**. If a bridge game (bottle) disconnects in the window
between sending a request and reading the response — e.g. the game exits — the helper
is killed by SIGPIPE, tearing down the long-lived shared helper for every other
in-flight bridge game. `helperProcess.ts` will respawn it on the next
`ensureBridgeHelperReady`, but any game currently relying on it loses its bridge
mid-session.
**Fix:** Ignore SIGPIPE at startup (`signal(SIGPIPE, SIG_IGN)`), or set
`SO_NOSIGPIPE` on the accepted socket, or pass `MSG_NOSIGNAL` to every `send()`.

### WR-04: Interface accessors are called before `InitFlat` success is confirmed

**File:** `native/steam-bridge/helper/bridge_helper.c:230-234`
**Issue:** `init_steam_api_once()` calls `GetUser()` and `GetFriends()`
unconditionally, then folds their non-NULL-ness into `g_inited`:

```c
int r = InitFlat(err);
g_user = GetUser();
g_friends = GetFriends();
g_inited = (r == 0 && g_user != NULL && g_friends != NULL);
```

Invoking the flat interface accessors when `InitFlat` failed (`r != 0`, e.g. Steam
not running/signed in) is outside the documented Steamworks contract. The design goal
is that init failure degrades gracefully to serving HEALTH — but if the real dylib
dereferences not-yet-initialized internal global state inside these accessors, it can
crash the helper instead of returning NULL, defeating the "process up, no session"
posture the whole finding-#7 HEALTH/WHOAMI split depends on.
**Fix:** Only call the accessors when `r == 0`:
`if (r == 0) { g_user = GetUser(); g_friends = GetFriends(); }` and derive `g_inited`
from that, leaving the pointers NULL on init failure.

### WR-05: `recv_all`/`send_all` treat `EINTR` as a fatal connection close

**File:** `native/steam-bridge/helper/bridge_helper.c:256-276`
**Issue:** Both loops treat any `recv`/`send` return `<= 0` as "close the
connection." A signal-interrupted syscall returns `-1` with `errno == EINTR`, which is
recoverable and should be retried, not treated as EOF. In a long-lived daemon that
receives signals (e.g. `SIGCHLD` from any spawned tooling, timers), this can drop a
live connection mid-frame.
**Fix:** On `k < 0 && errno == EINTR`, continue the loop and retry; only treat
`k == 0` (real EOF) or a non-EINTR error as terminal.

## Info

### IN-01: Leftover temporary `[Timing]` debug instrumentation in production install path

**File:** `src/backend/storeManagers/steam/games.ts:1132-1178`
**Issue:** `runNativeDepotDownload` contains several `[Timing]` `logInfo` calls
explicitly annotated "Temporary instrumentation, remove once root cause is confirmed"
(line 1134). These are debug artifacts shipping in the install hot path.
**Fix:** Remove the timing logs, or gate them behind a debug-log level, now that the
slow-start investigation is resolved (per project memory).

### IN-02: `markBridgeGameInstalled` persists an empty `install_size`

**File:** `src/backend/storeManagers/steam/games.ts:988-1009`
**Issue:** The completed bridge install writes `install_size: ''`. Because
`getSteamInstallSize`'s fast path requires a truthy `install.install_size`
(line 350), an installed bridge game will fall through to a network size estimate (or
`'?? MB'`) instead of showing the real on-disk size the depot download already knows.
Cosmetic, not a correctness bug.
**Fix:** Pass the actual downloaded size through from `installDepotDownload`'s outcome
(or compute it from the install root) and store the `getFileSize`-formatted string,
matching the ACF-poller install path.

---

_Reviewed: 2026-07-20_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
