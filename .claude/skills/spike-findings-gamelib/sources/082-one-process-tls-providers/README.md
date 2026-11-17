---
spike: 082
name: one-process-tls-providers
type: standard
validates: "Given steam-vent (aws-lc-rs) and gamelib-depot (ring) linked into one binary, when a CM connect runs before, during and after a depot CDN fetch in the same process, then both stay working with no provider panic, and we know which provider each connection used"
verdict: VALIDATED
related: [080, 071c, 073, 072]
tags: [rust, tls, rustls, aws-lc, ring, steam-vent, gamelib-depot, reqwest, integration]
---

# Spike 082: One process, two rustls providers

## What This Validates

Given steam-vent (aws-lc-rs) and `gamelib-depot` (ring) linked into one binary, when a CM connect
runs before, during and after a depot CDN fetch in the same process, then both keep working with
no provider panic, and we know which provider each connection used.

080 found the conflict by reading source and ran one order only: CM first, then the depot, with the
CM runtime dropped before the depot started. Production will run them the other way round (the
shell runs depot jobs today, and steam-vent arrives later) and at the same time.

## Research

- steam-vent `src/transport/websocket.rs:21`:
  `aws_lc_rs::default_provider().install_default().ok()` on every connect. It tolerates an
  already-installed provider.
- `gamelib-depot` `fetch.rs:89-95`: `let _ = ring::default_provider().install_default()` once,
  before its one reqwest client. It also tolerates an already-installed provider.
- `src-tauri` today: rustls has **only** the `ring` feature (`cargo tree -e features -i rustls`).
  Every reqwest in the shell is `rustls-no-provider`: tauri core, `tauri-plugin-updater` and
  `gamelib-depot`.
- `tauri-plugin-updater` 2.10.1 `updater.rs:446`: if `get_default()` is none, it installs ring
  itself. Tauri core's reqwest (`protocol/tauri.rs:41`) is compiled only for mobile dev, so it
  never runs on desktop.

Hypothesis: with steam-vent in the build, rustls has both `ring` and `aws_lc_rs`. A reqwest
client built before any install would then have no implicit choice and would panic.

## How to Run

```sh
# build (reuses 080's target dir and its vendored, anon-patched steam-vent)
CARGO_TARGET_DIR=../080-rust-steam-stack-win-linux/target cargo build --release
CARGO_TARGET_DIR=target-control cargo build --release --no-default-features   # ring-only control
B=../080-rust-steam-stack-win-linux/target/release/spike-082-tls
$B <arm> out/cache > runs/<arm>.json 2> runs/<arm>.log
#   arms: bare | vent-then-depot | depot-then-vent | concurrent | explicit-ring | explicit-aws
target-control/release/spike-082-tls bare out/cache
```

Anonymous logon only (app 1007, depot 1004). There are no secrets, so there is no go-offline wrap.
Each arm is its own process because the default provider is process-global.

## What to Expect

One JSON report per arm. Each step reports ok, error or panic text, plus the process default
provider after the step: `aws-lc-rs` when the post-quantum `X25519MLKEM768` group is present,
otherwise `ring`.

## Investigation Trail

1. **Bare client, no install.** In the ring-only control: HTTP 200, and the provider is still
   `none` afterwards (rustls uses the only compiled provider without installing it). With
   steam-vent in the build: **panic** at reqwest `async_impl/client.rs:2501`: "No rustls crypto
   provider is configured. When using the `rustls-no-provider` feature you must install a crypto
   provider before building a Client". Hypothesis confirmed.
2. **Orderings.** `vent-then-depot` ends on aws-lc for everything; `depot-then-vent` ends on ring
   for everything. That includes steam-vent's websocket TLS to the CM, a fresh CM connect, and
   the bare client. The first install wins for the life of the process, and both stacks work on
   either provider.
3. **Surprise: the depot path really does use TLS.** I expected `gamelib-depot`'s plain `http://`
   default to keep CDN fetches off TLS. In fact 5 of 6 CDN hosts the CM returned were
   `httpsSupport: mandatory` (one `unavailable`) on every run. So the provider choice does reach
   the depot download. The `https` sub-step also forces all six hosts to mandatory.
4. **Concurrent.** The first version overlapped only about 50 ms of depot work, which proved
   little. In the second version the CM loops 40 PICS jobs on tokio workers while the main thread
   runs real `depot_manifest_summary` calls back to back over HTTPS: 2,227 summaries in 34.9 s
   with 40/40 PICS jobs ok, and the CM job and fresh connect afterwards were also ok. No
   interference.
5. **Explicit installs.** `explicit-ring` and `explicit-aws` each pin their provider for every
   later step. All steps pass.

## Results

**VALIDATED, with one real hazard.**

| Arm | Provider at end | All steps |
|---|---|---|
| control `bare` (ring-only build) | none (implicit ring) | ✓ |
| `bare` (steam-vent build) | none | ✗ **panic**: no provider configured |
| `vent-then-depot` | aws-lc-rs | ✓ |
| `depot-then-vent` | ring | ✓ |
| `concurrent` | aws-lc-rs | ✓ (2,227 HTTPS summaries during 40 PICS jobs) |
| `explicit-ring` | ring | ✓ |
| `explicit-aws` | aws-lc-rs | ✓ |

- **Adding steam-vent to `src-tauri` removes rustls's implicit provider.** Any
  `rustls-no-provider` reqwest client built before something installs a provider panics. Today
  no shell path does that: the updater guards itself, `gamelib-depot` installs ring, and tauri
  core's client is mobile-only. The exposure is the next piece of Rust networking code, for
  example a Rust Steam Web API sign-in (072) running before any depot job or CM connect.
- **Whichever provider is installed first serves the whole process.** steam-vent's
  `install_default().ok()` and `gamelib-depot`'s `let _ =` both lose quietly. Both stacks run
  correctly on either provider, so the order changes only which crypto is used, never whether it
  works.
- **Fix: one explicit install at shell start (`main()`, before `tauri::Builder`).** It removes
  the panic class and makes the provider deterministic. Ring keeps today's runtime crypto. aws-lc
  adds post-quantum key exchange. Either works. aws-lc-sys still compiles in (080's build cost)
  unless steam-vent is patched to stop enabling it.
- CDN fetches really do use TLS: 5 of 6 hosts are `httpsSupport: mandatory`.
