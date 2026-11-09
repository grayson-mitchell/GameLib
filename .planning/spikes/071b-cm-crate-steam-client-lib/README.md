---
spike: 071b
name: cm-crate-steam-client-lib
type: comparison
validates: "Given a plain cargo binary on steam-client-lib (SteamHelper-rs), when it logs on anonymously and with GameLib's stored refresh token, then PICS appinfo, licenses, depot key, manifest request code and CDN hosts match steam-user"
verdict: VALIDATED (needs the account name; see Results)
related: [071a, 010]
tags: [rust, steam, cm, steam-user, steam-client-lib, sidecar-retirement, pics, depot]
---

# Spike 071b: CM crate — steam-client-lib (SteamHelper-rs)

## What This Validates

The same questions as 071a, on `steam-client-lib` 0.2.1 (crate `steam_client`, SteamHelper-rs git
`f77c946`, 2026-10-22). It is built the opposite way to steamroom: a long-lived, spawnable client
with a message pump, heartbeats, reconnects and events. It has no PICS, depot key or
content-server calls of its own, so the spike adds them through the crate's extension points.

## Research

From source, before running anything:

- **Architecture fits GameLib.** A sans-IO protocol state machine (`CmProtocol`) under a
  connection driver. `spawn()` gives a cloneable `SteamHandle` (concurrent calls), an `Events`
  stream and a `SteamTask`. Heartbeats, TCP keepalive, reconnect after `TryAnotherCM` /
  `ServiceUnavailable`, and `Event::LoggedOff` / `Disconnected` / `Reconnected` / `Lagged` are all
  built in. A message nobody waits for becomes an `Event`, including a response to a cancelled call.
- **Extension points:** a `JobMessage` marker (request EMsg, response EMsg, proto types) for
  single-answer job messages, and a `ServiceMethod` marker (`"Service.Method#1"` plus types) for
  unified service calls. The PICS product-info, PICS access-token, depot-key, request-code and
  CDN-server calls in this spike are about 50 lines of markers.
- **Documented limit:** the job model takes exactly one answer. PICS product info split over
  several messages (`response_pending`) does not fit. Large package or app batches would need
  their own handler (collect `Event::Message`s by job id) or small batches.
- **Logon is fixed by the crate:** `user_logon()` always sets `account_name`, `chat_mode = 2`, a
  `machine_id` derived from the account name, and the Windows OS type. `Account` / `Logon` is
  sealed (`pub trait Account: account::Logon {}` with a private module), so a caller can't
  change the logon message.
- Protobufs are rust-protobuf 3 (`protobuf` crate), not prost as in `src-tauri` and steamroom.
- Bot-oriented extras come along: `steam-totp`, `tappet` (Web API), which pull in **reqwest 0.11 +
  native-tls → openssl-sys** on Linux. `src-tauri/Cargo.lock` has no openssl-sys today.

## How to Run

```bash
cargo build --release
./target/release/spike-071b-steam-client-lib anon 480 8930 1145360 730   # -> out/anon.json
SPIKE_ACCOUNT=$(./account-name.sh) ../071a-cm-crate-steamroom/run-authed.sh \
  ./target/release/spike-071b-steam-client-lib authed "$TMPDIR/gamelib-dev-secret-vault.json" 1062520 1062521
```

`account-name.sh` reads the account name for the token's SteamID from Mac Steam's
`loginusers.vdf` and is only ever substituted into the environment, never logged. Secrets are
redacted as in 071a.

## Investigation Trail

1. **Anonymous PICS** on the same four apps: **ALL MATCH** with steam-user (071a's
   `out/anon-steam-user.json`), including all 86 Civ V and 15 CS2 public manifest gids.
2. **Latency:** each round trip is ~0.55 s against ~0.25 s on steamroom (PICS = 2 round trips =
   1.10 s, flat across apps). Logon takes 2.1–2.3 s (TCP + channel encryption) against 0.4–1.0 s for
   steamroom over WebSocket. The crate never calls `set_nodelay`, so Nagle plus delayed ACK is the
   likely cause. **Not verified**: it would be a one-line patch, and it is a latency cost, not a
   correctness one.
3. **Refresh-token logon with an empty account name: refused**, `InvalidPassword`.
   steamroom's hand-built logon left `account_name` *unset* and was accepted; this crate always
   sets it, here to `""`. The sealed `Account` trait means a caller can't omit it.
4. **With the real account name** (from `loginusers.vdf`): logon ok. The license list arrived as
   an ordinary `Event::Message(ClientLicenseList)` with **485 licenses**, with no workaround.
   Other events: ClientAccountInfo, ClientEmailAddrInfo, ClientFriendsList,
   ClientPlayerNicknameList, ClientServersAvailable ×3. Nothing dropped.
5. **Depot inputs, app 1062520 / depot 1062521:** PICS manifest gid `1849274456907275637` (same
   as 071a), depot key SHA-1 `641d4c98…` (**identical** to steamroom and steam-user), request code
   ok, 6 CDN servers.
6. **Platforms:** macOS arm64 built and run. Windows/Linux not built. On Linux the openssl-sys
   dependency needs system OpenSSL headers at build time and libssl at runtime, a new packaging
   dependency for GameLib.
7. **Maintenance:** SteamHelper-rs, created 2019-10, 69 stars, 82 commits since 2026-08-01,
   single main author (316 of ~328 commits). MIT.

## Results

**VALIDATED for capability, with one adoption blocker to solve.**

| Item | Result |
|---|---|
| (1) anonymous CM + PICS appinfo | ✓ 4/4 apps identical to steam-user |
| (3) logon with GameLib's existing refresh token | ⚠ only with the **account name**, which GameLib doesn't store |
| license list | ✓ 485, delivered as an event, no workaround |
| (5) depot key | ✓ SHA-1 identical to steamroom and steam-user |
| (5) request code / CDN servers | ✓ / ✓ 6 |
| long-lived client (pump, heartbeat, reconnect, concurrency) | ✓ built in; steamroom has none |

**Trade-off against 071a:** steam-client-lib has the client architecture GameLib needs and no
protocol layer for content. steamroom has the content protocol and no client architecture. Either
needs work: for steamroom a message pump; for steam-client-lib PICS/depot markers (done here,
~50 lines) plus a multi-part PICS handler.

**Blockers to solve if this crate is chosen:**

- **Account name.** Existing users' tokens have no stored name. Options: read `loginusers.vdf`
  (macOS/Windows/Linux Steam installs only, not every user has Steam), store `account_name` at
  sign-in from now on (steam-session's result carries it) and ask existing users to sign in
  again, or patch the crate to leave the field unset when empty. The patch is smallest; it
  diverges from upstream.
- **OpenSSL on Linux** via reqwest 0.11/native-tls from bot extras. Needs a feature gate upstream
  or a fork.
- Nagle latency (likely), rust-protobuf alongside prost (two protobuf runtimes in the shell).

Impact on 072/074: the crate's fixed `chat_mode = 2` and `machine_id` are logon-shape differences
from steam-user; the Friends-list behaviour (074) has to be tested per crate.
