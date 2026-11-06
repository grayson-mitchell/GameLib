---
phase: 58-steam-bridge-multiplayer
reviewed: 2026-11-01T00:00:00Z
depth: standard
files_reviewed: 22
files_reviewed_list:
  - meta/bridgeCensus.ts
  - meta/buildSteamBridgeShims.ts
  - meta/gen_vtables.ts
  - meta/sdk/wire-policy.json
  - native/steam-bridge/generated/steam_api_shim.c
  - native/steam-bridge/helper/bridge_helper.c
  - src-tauri/src/main.rs
  - src/backend/sidecar/steamAuthFlowRegistration.ts
  - src/backend/storeManagers/steam/bridge/drm/drmTrace.ts
  - src/backend/storeManagers/steam/bridge/helperProcess.ts
  - src/backend/storeManagers/steam/bridge/inviteBridge.ts
  - src/backend/storeManagers/steam/bridge/protocol.ts
  - src/backend/storeManagers/steam/bridge/shimCoverage.ts
  - src/common/types/ipc.ts
  - src/common/types/sidecarTransport.ts
  - src/common/types/steam.ts
  - src/frontend/App.tsx
  - src/frontend/components/UI/SteamBridgeInviteDialog/index.tsx
  - src/frontend/state/GlobalState.tsx
  - src/frontend/state/SteamBridgeInvite.ts
  - src/preload/api/steam.ts
  - public/locales/en/gamelib.json
findings:
  critical: 0
  warning: 5
  info: 2
  total: 7
status: issues_found
---

# Phase 58: Code Review Report

**Reviewed:** 2026-11-01
**Depth:** standard
**Files Reviewed:** 22
**Status:** issues_found

## Summary

Focus was the Direction A invite path (helper INVITE handling, `inviteBridge.ts` control client, friend picker store and dialog), the 58-35 poll() loop in `bridge_helper.c`, and the 58-36 raise and display ack. No blocker was found. The poll loop's frame bounds hold: `recv` is never asked for more than the remaining buffer, because the oversize check runs as soon as 4 bytes are present. The control client unrefs its timer, destroys the socket on every settle path, and logs only fixed words and counts. SteamIDs stay in the helper. The sidecar IPC handlers validate appId and ordinal. I did not find any new spawn that skips the fake-HOME convention in the reviewed diff.

The weakest point is that the picker's trigger signal rides on a rate-limited, capped log line (WR-01). The poll loop also has availability gaps (WR-02, WR-03).

`main.rs` diff is almost entirely the `shell_eprintln!` sweep plus the `main_window_raise` attention fallback, and no defect was found there. The `meta/*`, `steam_api_shim.c`, `protocol.ts` and `drmTrace.ts` changes were skimmed and no defect was found. The prior review's fixed items were not re-verified individually.

## Warnings

### WR-01: Picker trigger is a log line that the helper caps at 16 per process

**File:** `native/steam-bridge/helper/bridge_helper.c:2269-2273` (consumer: `src/backend/storeManagers/steam/bridge/helperProcess.ts:105-112, 429-462`)
**Issue:** The only signal that opens the friend picker is the `INVITE dialog appid=` log line. The helper emits that line only while `g_invite_dialog_logged < GL_INVITE_DIALOG_LOG_MAX` (16) and at least 2 s after the previous one. The cap exists to bound log volume, but it also silences the backend. After 16 invite presses in one helper lifetime, the game's "+" button still calls Steam's unavailable overlay, the lobby is still recorded, and the picker never appears. Presses inside the 2 s window are also dropped, so a user who presses twice quickly gets no second raise. The failure is silent.
**Fix:** Separate the signal from the log cap. Emit the line on every call that passes a 2 s debounce, and apply the 16-line cap only to a separate "log volume" line:
```c
if (g_invite_dialog_logged == 0 || now - g_invite_last_log_ms >= GL_INVITE_DIALOG_LOG_GAP_MS) {
  g_invite_last_log_ms = now;
  logts_f("INVITE", "dialog appid=%s", g_appid);   // always the signal
}
```
Rely on the backend's `INVITE_REQUEST_DEBOUNCE_MS` plus the time gap for flood control. Alternatively, use a control reply or a slot the backend polls.

### WR-02: Unauthenticated or slow connections can exhaust the 16-slot table

**File:** `native/steam-bridge/helper/bridge_helper.c:2965-2975, 3003-3021, 2926`
**Issue:** The table holds `GL_MAX_CONNS = 16` connections. Any local process can connect and hold slots without a HELLO. `lastRxSec` is refreshed on every received byte (line 2926), so a client trickling one byte per under 5 s keeps its slot indefinitely and is never reaped by the inactivity check. With the table full, the shim and the invite probe are refused ("connection table full"). The previous blocking model had an equivalent one-connection problem, but the new table makes this a cheap denial of service against the multiplayer and invite path. The threat model already admits same-user processes in some places, but the secret is meant to gate access, and this path is pre-auth.
**Fix:** Bound time-to-authenticate separately from inactivity, for example record `acceptedSec` and close any non-authenticated connection older than a few seconds. Also reap the oldest unauthenticated slot, rather than refusing, when the table is full and a new connection arrives.

### WR-03: A blocking send in the single-threaded loop stalls every connection and the Steam pump

**File:** `native/steam-bridge/helper/bridge_helper.c:1783-1795, 2999-3003`
**Issue:** Accepted sockets are returned to blocking mode with `SO_SNDTIMEO` of `RECV_TIMEOUT_SECONDS` (5 s). `send_all` runs on the single serving thread inside `dispatch_and_respond`. A peer that issues requests with large replies (server events, friend list up to about 13 KB) and never reads fills its socket buffer. The helper then blocks up to 5 s per response, during which no other connection is serviced and no Steam callbacks are pumped. The timeout bounds this, but a malicious or wedged client can repeat it.
**Fix:** Keep sends non-blocking and buffer the unsent tail per connection with `POLLOUT`. Or, as a smaller step, close the connection on the first `EAGAIN` and drop the timeout to the sub-second range.

### WR-04: Friend ordinals are re-assigned on every list call, so a stale picker can invite the wrong friend

**File:** `native/steam-bridge/helper/bridge_helper.c:2321-2366, 2374-2390`
**Issue:** `gl_invite_list_friends` overwrites `g_friend_snapshot` and `g_friend_snapshot_n` on each call, and `gl_invite_send` indexes the latest snapshot by bare ordinal. If the list is requested again while an earlier rendered list is still on screen (the picker is re-opened by a second "+" press, and `open()` re-lists), the friend set or order can differ, and the older UI's ordinal now points at a different person. Friends that go online or offline change `GetFriendByIndex` ordering. The picker resets its own state on each `open()`, which narrows the window, but an `invite()` call already in flight from the previous instance is still accepted, because `invite` only checks `appId`. The result is an invite to an unintended account.
**Fix:** Add a snapshot generation: the list reply carries a `u32 generation`, the invite request carries it back, and the helper rejects a mismatch with `badOrdinal`. Or key the invite by a stable, non-sensitive per-snapshot token rather than a positional index.

### WR-05: `INVITE dialog` regex is unanchored, so any log line containing the text triggers the picker

**File:** `src/backend/storeManagers/steam/bridge/helperProcess.ts:105-112, 429-440`
**Issue:** `/INVITE dialog appid=(\d+)/` is applied with `exec` anywhere in a line. Helper log lines that interpolate a game-controlled string, if any exist in the helper's stdout/stderr stream, could embed that text with the game's own appid and force a window raise, a picker open and a Dock bounce. The comment cites the same "own stream" rule as LISTEN and READY, but this line has a user-visible side effect (raising the window over a game), so a spoof is worse than for those lines. The 2 s debounce limits the rate but not the occurrence. I did not confirm that a game-controlled string is currently logged raw, so this is a hardening gap rather than a demonstrated exploit.
**Fix:** Anchor to the helper's fixed log shape, for example `/^\[[^\]]*\]\s+INVITE\s+dialog appid=(\d+)$/`, matching the format used in `NET_DIRECTION_CALL_RE` in `meta/bridgeCensus.ts`. Pair it with WR-01's move to a non-log channel if feasible.

## Info

### IN-01: `socket.once('error')` leaves later errors unhandled

**File:** `src/backend/storeManagers/steam/bridge/inviteBridge.ts:63`
**Issue:** `once` removes the listener after the first error. A second `error` event on the same socket would have no listener and would throw as an uncaught exception in the sidecar. `destroy()` runs on that path, which makes a second emission unlikely, but the failure mode is a process crash.
**Fix:** Use `socket.on('error', () => finish(null))`.

### IN-02: Stale comments describe the pre-58-35 serving model

**File:** `native/steam-bridge/helper/bridge_helper.c:2231, 2882`
**Issue:** The invite section header still says "one accept loop, see main" for the threading model. The reasoning that state needs no mutex still holds, but the pointer to "accept loop" now points at `gl_serve_forever`.
**Fix:** Reword the comment to reference `gl_serve_forever` and the single-thread poll loop.

---

_Reviewed: 2026-11-01_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
