---
spike: 085
name: steam-vent-long-lived-session
type: standard
validates: "Given an authenticated steam-vent session held for hours, when the network drops, the Mac sleeps/wakes and the CM connection is lost, then the session is re-established and subscriptions resume — or the exact recovery GameLib must own is named"
verdict: VALIDATED
related: [071c, 077, 080, 081, 082]
tags: [rust, steam-vent, cm, reconnect, heartbeat, sleep, sidecar-retirement, frontier]
---

# Spike 085: A long-lived steam-vent session

## What This Validates

Given an authenticated steam-vent session held for hours, when the network drops, the Mac sleeps
and wakes, and the CM connection is lost, then either the session is re-established, or we can
name the exact recovery GameLib must own.

Retiring the Node sidecar means a Rust CM session that lives as long as the app. Every earlier
steam-vent spike (071c, 077, 080, 081, 082) held its session for 10 minutes or less on a steady
network.

## Research

steam-vent a9e8164 source:

- `connection/raw.rs` `setup_heartbeat`: sends `CMsgClientHeartBeat` every
  `heartbeat_seconds` from the logon response. A send failure is only
  `error!("Failed to send heartbeat message")`. The loop keeps going, and nothing reaches the
  caller.
- `connection/filter.rs`: the read task logs `Error while reading message` and moves on. When the
  socket stream ends, the task just returns. The filter's broadcast senders live inside the
  `Connection`, so `on::<CMsgClientLoggedOff>()` streams never end either.
- There is no reconnect API. `ServerList::pick_ws` rotates servers "for reconnects", but the caller
  has to build a new `Connection`.
- `transport/websocket.rs` installs `KeyLogFile`, which writes TLS secrets only if
  `SSLKEYLOGFILE` is set. The shell must never set it in production.

Hypothesis: a dead socket is invisible except as job failures, so GameLib must own liveness
detection and reconnection.

## How to Run

```sh
CARGO_TARGET_DIR=$PWD/../077-dual-cm-session-coexistence/target cargo build --release
B=../077-dual-cm-session-coexistence/target/release/spike-085-vent-long
$B "$TMPDIR/gamelib-dev-secret-vault.json" <hold_s> [period_s=30] [reconnect=1] > runs/<run>.log 2>&1
```

- Every `period_s` it runs one liveness job (PICS access token for app 480, 10 s timeout).
- `ClientLoggedOff` is subscribed.
- A wall-clock jump beyond the monotonic clock is logged as `GAP` (system sleep).
- With reconnect on, a failure triggers discover + connect + refresh-token logon with 5→60 s
  backoff, and `RECOVERED` reports the time.
- steam-vent's own `tracing` (warn and above) goes into the same log.
- Nothing secret is printed. Operator actions were network off and on (as in 074 and 075; the
  operator needs the network to talk to Claude) and Apple menu → Sleep.

## Investigation Trail

1. **Smoke run** (40 s): logon, 4/4 liveness ok.
2. **Run A: network drop with no reconnect** (`runs/a-drop-noreconnect.log`, liveness every 15 s):
   - Logon at 20:21:02. Liveness ok until the drop. From 20:22:15, jobs fail with `Timeout`.
   - Steam-vent logged nothing, there was no `KICKED`, and the `LoggedOff` stream stayed silent.
   - At 20:25:14, after the network was back, the read loop logged `AddrNotAvailable` ("Can't
     assign requested address"): the socket was tied to the interface address that had gone.
   - From then on, every job and every 9 s heartbeat failed with `BrokenPipe`, until the hold
     ended with `dead_at_end=true`.
   - **The session never heals.**
   - One check gap is unexplained: 20:23:00 → 20:24:32 (92 s instead of 15 s) with no `GAP`
     line. The loop was blocked somewhere outside the 10 s job timeout while the network was down.
3. **Run B: reconnect on** (`runs/b-drop-sleep-reconnect.log`, liveness every 30 s). It was planned as a 3 h hold, but was stopped at 20:51 so the operator could keep using GameLib's Steam features (production logonID 0 would kick it, 077):
   - **Sleep attempt 1** did not happen: `pmset -g log` shows only the display turning off for
     3 s (09:33:52–55 local), woken by the "USB Receiver" HID dongle. There was no system sleep,
     and liveness stayed ok.
   - **Network drop.** The first failure was `Timeout` at 20:40:32. While offline, every
     reconnect failed at once with `Failed send discovery request`, retried at 5/10/20/40 s
     backoff. At 20:41:36 the old socket's read loop logged `ConnectionReset` (network back). The
     next retry at 20:41:49 gave **`RECOVERED`: session 2, 76 s dead, logon 1.4 s.**
   - **Sleep attempt 2** happened: `GAP` of 365 s at 20:48:49. The first liveness call after wake
     timed out after 10 s. A reconnect then gave **session 3 in 0.8 s**. The old socket logged
     `ConnectionReset` only after the new session was up.
4. **Run C: long hold** (`runs/c-long-hold.log`, 3 h from 23:00 NZDT under `caffeinate -i`, reconnect on). The Mac stayed awake and nobody used Steam features:
   - Session 3 came up at 10:01:20Z (after the duplicate-run kicks below) and **held to the end at
     13:00:12Z: 2 h 59 m, every liveness check ok** (`liveness ok=358 sessions=3 dead_at_end=false`).
   - No `GAP`, no `KICKED`, no steam-vent errors from this process after 10:01:20Z. The CM never
     dropped an idle-but-heartbeating session.
   - The log's last line (`Failed to send heartbeat … AlreadyClosed`, timestamped 10:01:35Z) is
     the duplicate's write landing at its own file offset, not an event in this run.
   - **Incidental: a duplicate run (10:00:10–10:02Z, not part of the design).** Another GameLib
     Claude session started an identical Run C at the operator's request 13 minutes before this
     one was scheduled. The two used the same vault and logon identity and wrote through
     separate truncating descriptors into `runs/c-long-hold.log`, so its first ~2.2 KB is
     interleaved and must not be counted. What it showed:
     - A kick **is** signalled: `ClientLoggedOff eresult 34`, then `InvalidHeader` on the read
       loop and `Ws(AlreadyClosed)` on the next job.
     - The two auto-reconnecting sessions kicked each other in turn (sessions 2 and 3 on each
       side, each reconnecting in about 2 s) until the duplicate was killed at about 10:02Z.
     - **A reconnect loop without a guard on repeated 34s ping-pongs forever.**

## Results

**VALIDATED** — in its second form: steam-vent does not recover by itself, and the recovery
GameLib must own is now named and measured.

- **A steady session lasts.** One session held 2 h 59 m with 358/358 checks ok. Heartbeats alone
  keep it alive; nothing expires on a 3 h scale.
- **A dead socket is silent.** After a network drop, steam-vent only logs; jobs time out, then
  `BrokenPipe` forever (Run A). Nothing reaches the caller, and the `LoggedOff` stream stays quiet.
- **Rebuilding the `Connection` works fast.** A network drop recovered 76 s after the first failure
  (logon 1.4 s, gated by the network coming back). A 365 s sleep recovered in about 11 s (one 10 s
  job timeout, then logon 0.8 s). The refresh token was reused each time.
- **A kick is the one signalled failure.** `ClientLoggedOff` 34 arrives; reconnecting at once
  ping-pongs with the other session.
- **Requirements for the Rust session (retiring the sidecar):**
  - Own liveness: a cheap job (PICS access token) with a 10 s timeout every 30 s; any failure means
    dead.
  - Detect sleep by comparing wall and monotonic clocks, and check at once on wake.
  - Reconnect by building a new `Connection` (discover + connect + refresh-token logon) with 5→60 s
    backoff; re-subscribe every `on::<>` stream on the new connection.
  - On `ClientLoggedOff` 34, back off and give up after repeated kicks. Keep a distinct logonID
    (077) so production steam-user does not cause them.
  - Never set `SSLKEYLOGFILE`.
- **Not measured:** the 92 s loop stall in Run A is unexplained (outside the 10 s job timeout, while
  the network was down). The production watchdog should time the whole check, not just the job.
