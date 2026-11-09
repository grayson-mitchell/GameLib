---
spike: 071a
name: cm-crate-steamroom
type: comparison
validates: "Given a plain cargo binary on steamroom, when it logs on anonymously and with GameLib's stored refresh token, then PICS appinfo, licenses, depot key, manifest request code and CDN hosts match steam-user and drive the Phase 73 Rust pipeline"
verdict: VALIDATED (with a workaround — see Results)
related: [010, 002, 046a, 052, 067b]
tags: [rust, steam, cm, steam-user, steamroom, sidecar-retirement, pics, depot]
---

# Spike 071a: CM crate — steamroom

## What This Validates

Given a plain `cargo` binary built on `steamroom` (git `e892bdf`, 2026-11-05), when it logs on to
the CM anonymously and with the refresh token GameLib already stores, then every CM-side input the
sidecar gets from `steam-user` today is available and **identical**, and the depot inputs drive the
Phase 73 `gamelib-depot-cli` to a decrypted manifest.

Part of the 071 comparison (071a steamroom, 071b steam-client-lib, 071c steam-vent + DIY), the gate
for moving CM traffic out of Node (Phase 73 CONTEXT, deferred ideas). Spike 010 (2026-07-20)
rejected Rust because `steam-vent` 0.5.0 was auth-only; steamroom did not exist then (first
release 2026-04-12, content layer later).

## Research

| Crate | Version / last commit | Licence | Auth | PICS | Depot key / request code / CDN | Notes |
|---|---|---|---|---|---|---|
| **steamroom** | crates.io 0.3.0; git workspace 0.4.0, `e892bdf` 2026-11-05 | MIT OR Apache-2.0 | anon, refresh token, password + Guard, QR | ✓ typed + raw KV | ✓ all typed methods | DepotDownloader port; single author (landaire); fuzzed parsers |
| steam-client-lib (SteamHelper-rs) | 0.2.1, 2026-10-22 | MIT | tokens | service calls | ? | 071b |
| steam-vent | 0.5.0, 2026-04-03 (unchanged since 010) | MIT | ✓ | DIY | DIY | 071c |
| steam-depot-downloader-mod | 0.1.3 | **GPL-2.0-only** | — | — | needs keys supplied | excluded on licence |

steamroom's design, read from source before running anything:

- **No message pump.** `SteamClient::connect*` returns an `async_channel::Receiver` whose sender is
  dropped at construction, so it never yields anything. Every call (`login`, `call_service_method`,
  PICS) loops on `recv_raw()` until it sees its own reply and **discards everything else**.
- So requests are effectively serial (two in flight would steal each other's replies), there is no
  heartbeat task, and no unsolicited message (license list, persona, kicks, `LoggedOff`) reaches the
  caller unless the caller happens to be in `recv_msg()` when it arrives.
- `ClientOs` defaults to Windows 11 (20). `TokenLogin` wants an account name; steam-user does not.

## How to Run

```bash
cargo build --release
./target/release/spike-071a-steamroom anon 480 8930 1145360 730      # -> out/anon.json
node steam-user-anon.mjs 480 8930 1145360 730                        # -> out/anon-steam-user.json
# Signed-in: inside the macOS go-offline wrap (refuses if Mac Steam's LogOff isn't seen in 5 s)
V="$TMPDIR/gamelib-dev-secret-vault.json"                            # dev vault slot steam-refresh-token
./run-authed.sh zsh -c "./target/release/spike-071a-steamroom authed '$V' 1062520 --emit-summarize \
  | ../../../src-tauri/target/debug/gamelib-depot-cli --cache-dir out/cache summarize > out/summarize-result.json"
./run-authed.sh node steam-user-authed.mjs "$V" 1062520 1062521      # -> out/authed-steam-user.json
```

`out/` is gitignored. The harness never prints the token, depot key, request code or CDN token;
the depot key is compared by SHA-1 fingerprint. The `--emit-summarize` request (which contains the
key) only ever travels over the pipe into `gamelib-depot-cli`.

## What to Expect

`anon`: four apps' name, public buildid and per-depot public manifest gids, ~0.4–0.5 s per app.
`authed`: logon ok, 485 licenses, depot key ok, request code ok, 6 CDN servers, and a summarize
result with file count and bytes for depot 1062521.

## Investigation Trail

1. **Read the source first.** Found the dead receiver and the discard-everything recv loops (above).
   That predicted the license list would be lost.
2. **Anonymous PICS** (480 Spacewar, 8930 Civ V, 1145360 Hades, 730 CS2): logon 0.42 s after
   connect, 0.40–0.51 s per app. Diffed against steam-user's `getProductInfo` on the same apps:
   **ALL MATCH** — name, public buildid and every public manifest gid (1, 86, 4, 15 depots).
3. **Refresh-token logon with GameLib's stored token**, built by hand as a `CMsgClientLogon` with
   `access_token` = refresh token, header SteamID from the JWT `sub`, **no account name**: logon ok.
   GameLib persists no account name, so this matters — the steamroom-client `TokenLogin` builder
   requires one, the raw `SteamClient::login` does not.
4. **First authed run: 0 licenses.** A 10 s `recv_msg()` drain after logon saw only emsgs 146,
   5430, 5553. As predicted: the license list had already been consumed.
5. **Recovered it** by wrapping the WebSocket transport in steamroom's own `RecordingTransport`
   (WebSocket frames are plaintext; TCP would need the session cipher) and scanning the frames
   `login()` read: 10 messages before `ClientLogOnResponse` returned, including
   **`ClientLicenseList` (780) with 485 licenses**. `pics_get_package_info` over all 485 → 939
   distinct appids in 0.37 s.
6. **Depot inputs for app 1062520 / depot 1062521:** depot key ok, manifest request code ok, 6 CDN
   servers (5 https). Piped into the Phase 73 `gamelib-depot-cli summarize`:
   `{"depotId":"1062521","fileCount":198,"totalBytes":3201437562}` — the Rust pipeline fetched and
   decrypted the real manifest from steamroom-supplied inputs with no Node in the path.
7. **CDN auth token failed** (`service method failed: Fail`). Checked steam-user on the same
   token, app, depot and host class: also fails (`Request timed out`). Steam no longer issues
   these for these hosts; the summarize ran with `tokens: {}`. Not a steamroom gap.
8. **steam-user reference run** on the same refresh token: 485 licenses (same), depot key SHA-1
   `641d4c98…` (**identical**), 6 CDN servers (same).
9. **Platforms:** built and run on macOS arm64 only. The heavy deps — `ring`, `rustls`, `prost`,
   `reqwest` — are already in `src-tauri/Cargo.lock` and build on the Windows/Linux CI legs; the
   only new transitive crate is `tokio-tungstenite` (pure Rust). Windows/Linux is therefore
   *inferred*, not built. Release binary 6.4 MB, 300 crates in the lock.
10. **macOS wrap:** every signed-in run went through `run-authed.sh`; Mac Steam's user-initiated
    LogOff was seen in 200–400 ms each time and `goonline` sent after. Whether Friends stays
    signed in after a *Rust* logon is spike 074's question, not checked here.

## Results

**VALIDATED, with one workaround.** For requirements (1) and (5), steamroom supplies everything,
byte-for-byte equal to steam-user where comparable:

| Item | Result |
|---|---|
| (1) anonymous CM + PICS appinfo | ✓ 4/4 apps identical to steam-user |
| (3) logon with GameLib's existing refresh token | ✓ no account name needed (raw `login`) |
| license list | ✓ 485 = steam-user's 485, **only via a recording-transport workaround** |
| (5) depot key | ✓ SHA-1 identical to steam-user |
| (5) manifest request code | ✓ and accepted by the CDN (manifest decrypted by Phase 73's CLI) |
| (5) CDN server list | ✓ 6 servers, same count as steam-user |
| (5) CDN auth token | ✗ for both clients — Steam returns Fail/timeout; not needed by the pipeline |

**The real finding is architectural, not functional.** steamroom is a request/response client for
a CLI. GameLib needs a long-lived client: unsolicited messages (licenses, `LoggedOff`, kicks),
heartbeats, and concurrent requests from different features. Adopting steamroom means one of:
(a) upstream a message pump (route replies by `jobid_target`, broadcast the rest on the channel
that already exists but is never fed) — the cleanest; (b) fork; (c) use only its proto, crypto,
KV and CDN layers and write GameLib's own ~300-line dispatcher on top. The protocol work —
which is what spike 010 judged too expensive to redo — is done and correct.

Surprises: the dead `_rx` channel is plainly intended for this and never wired; refresh-token
logon without account name works; CDN auth tokens are dead on both clients.

Impact: 071a alone answers "can Rust supply the depot inputs" with **yes**. 071b/071c now compare
on the dispatcher question and maintenance risk, not on capability.
