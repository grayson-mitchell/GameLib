---
spike: 080
name: rust-steam-stack-win-linux
type: standard
validates: "Given steam-vent and gamelib-depot built for Windows x64 and Linux x64, when each logs on and fetches + decrypts a public manifest, then it builds and runs, or the blocking native dependency is named"
verdict: VALIDATED (builds and runs on macOS arm64, Windows x64 MSVC and GNU, Linux x64 on Ubuntu 22.04/24.04; no blocking native dependency; aws-lc-sys is new to src-tauri but needs no NASM)
related: [071a, 071c, 073, 077]
tags: [rust, steam, cm, steam-vent, gamelib-depot, windows, linux, msvc, aws-lc-sys, nasm, rustls, cross-compile, ci, sidecar-retirement, live]
---

# Spike 080: The Rust Steam stack on Windows and Linux

## What This Validates

Given steam-vent (the 071c CM-crate winner, codeberg `a9e8164`) and Phase 73's `gamelib-depot` built
for Windows x64 and Linux x64, when one binary logs on and fetches and decrypts a public manifest,
then it builds and runs off macOS, or the blocking native dependency is named.

071a/c built only on macOS and *inferred* Windows/Linux from shared dependencies. `gamelib-depot`
alone already builds and tests on all three OSes in CI (`rust-test.yml:117`). The new risk is
steam-vent's dependency tree, and the two crates combined in one binary.

## How to Run

```bash
./vendor.sh                     # steam-vent a9e8164 + one-line anonymous-logon fix -> vendor/ (gitignored)
cargo build --release
./target/release/spike-080-stack anon 232250 any out/cache            # anonymous: TF2 Dedicated Server
./target/release/spike-080-stack anon 1007 any out/cache              # anonymous: Steamworks SDK Redist
./target/release/spike-080-stack "$TMPDIR/gamelib-dev-secret-vault.json" 1062520 1062521 out/cache   # signed in
```

One binary: logon (anonymous or refresh token) → license list → PICS public manifest GID → depot key
(first depot granted, with `any`) → manifest request code → CDN hosts → `gamelib_depot::dispatch(
"depot_manifest_summary")`, which uses production's own fetch, decrypt and parse. It prints a JSON report
with a `verdict`, and never prints secrets.

- **Windows GNU, locally:** `cargo build --target x86_64-pc-windows-gnu` with
  `x86_64-w64-mingw32-gcc` as linker/CC, run under GameLib's pinned Wine-Staging 11.20
  (`.../steam-engines/wine-staging-11.20/Contents/Resources/wine/bin/wine`, **not** the `.app`'s
  `Contents/MacOS/wine` launcher stub) in a fresh `wineboot -i` prefix.
- **Linux, locally (build only):** zig 0.17 as CC/linker via `zigwrap/` (strips cc-rs's
  `--target=<rust triple>`, which zig can't parse), `-target x86_64-linux-gnu.2.31`.
- **CI (MSVC + Linux, live):** `ci/spike-080-cross-platform.yml` ran once on a throwaway branch
  cut from `origin/main` (run 42667918251, 2026-11-09). The branch is deleted. Anonymous only;
  no secret was used.

## Investigation Trail

1. **macOS baseline (signed in):** 485 licenses, GID 1849274456907275637, depot key, request code, 6 CDN
   hosts; `gamelib-depot` decrypted the manifest: 198 files / 3.2 GB (same as 071a). 3.6 s.
2. **Windows x64 GNU cross-build:** compiled first time in 28 s, no source changes. 40 MB PE32+, imports
   only system DLLs (crypt32, bcrypt, ws2_32, …). **Ran live under Wine-Staging 11.20 (Rosetta),
   signed in:** identical results to macOS, 4.2 s. On the GNU target aws-lc-sys assembles with the
   mingw toolchain, so NASM is never consulted there.
3. **Integration surprise: two TLS crypto providers.** steam-vent's `reqwest` 0.13 default features
   and its `rustls` default features turn on **aws-lc-rs**. Cargo feature unification switches it on
   for `gamelib-depot`'s `rustls`, which was deliberately `ring`-only (`rustls-no-provider` + `ring`).
   And steam-vent **hard-codes** `rustls::crypto::aws_lc_rs::default_provider().install_default()` in
   `src/transport/websocket.rs:21` on every connect. Because the CM connects first, aws-lc becomes
   the process default and `gamelib-depot`'s `ring` install (`fetch.rs:91-94`) silently loses. It tolerates
   that by design ("another provider is already installed, which is fine"), so the CDN fetches simply
   run on aws-lc. Same websocket code also sets `KeyLogFile` (writes TLS keys only if `SSLKEYLOGFILE`
   is set). **`src-tauri/Cargo.lock` has no aws-lc-sys today**: adopting steam-vent adds it.
4. **Linux x64 cross-build (zig):** first try failed in *my* wrapper (cc-rs passes `--target=` zig
   can't parse). With the wrapper stripping it, it built in 28 s: ELF needs only libc/libm/libpthread/
   libdl, max symbol GLIBC_2.30. No Linux host here to run it.
5. **MSVC risk read from source:** aws-lc-sys 0.47's cc builder assembles with NASM on
   `x86_64-pc-windows-msvc`, and uses prebuilt objects only with the `prebuilt-nasm` feature or
   `AWS_LC_SYS_PREBUILT_NASM=1`. That looked like a likely CI break.
6. **steam-vent anonymous logon, fixed for CI:** main's `send_logon` demands a token (071c's `NoToken`).
   `vendor.sh` substitutes a placeholder JWT (it must pass steam-vent's own check: `iss` `steam`,
   a valid SteamID `sub`); it is never put on the wire. Anonymous then gets depot keys for TF2
   Dedicated Server (232250, 1,019 files) and Steamworks SDK Redist (1007 → depot 1004, 8 files).
7. **CI, 5 legs, all PASS:**

   | Leg | NASM | Build | Run 232250 / 1007 |
   |---|---|---|---|
   | windows-latest MSVC, default | on PATH (Strawberry) | 386 s* | PASS / PASS |
   | windows-latest MSVC, NASM hidden | absent ("NASM command not found") | 376 s* | PASS / PASS |
   | windows-latest MSVC, hidden + `AWS_LC_SYS_PREBUILT_NASM=1` | prebuilt | 351 s* | PASS / PASS |
   | ubuntu-24.04 | n/a | 126–161 s | PASS / PASS (needs GLIBC_2.38 as built) |
   | ubuntu-22.04 | n/a | 126–161 s | PASS / PASS (GLIBC_2.34) |

   \*cold, `-vv`, no cache. The NASM fear was unfounded: **aws-lc-rs enables aws-lc-sys's
   `prebuilt-nasm` feature by default** (`CARGO_CFG_FEATURE=aws-lc-sys,prebuilt-nasm` in every leg),
   so with no NASM it falls back to the shipped objects. The MSVC exe (10 MB) imports only system
   DLLs. Anonymous runs took 1.8–3.9 s end to end.

## Results

**VALIDATED.** steam-vent + `gamelib-depot` build and run, unchanged, on macOS arm64, Windows x64
(MSVC on windows-latest and GNU under Wine) and Linux x64 (Ubuntu 22.04 and 24.04). They log on,
read PICS, get depot keys, request codes and CDN hosts, and decrypt real manifests through
production's code. There is no blocking native dependency. NASM, cmake and OpenSSL are not
required, and every binary links only OS libraries.

**Signal for the build (CM-client slice):**

- **aws-lc-sys enters `src-tauri` with steam-vent.** It builds everywhere CI builds, but adds a
  large C/asm build (the cold MSVC build was ~6 min with it in). To keep the shell ring-only, steam-vent needs two
  patches: `default-features = false` on its `reqwest`/`rustls`, and `websocket.rs:21` switched to
  a provider passed in, or to `builder_with_provider(ring)`. Otherwise accept two providers. Either
  way, **install one process-level provider explicitly at shell start**, so which provider is
  active doesn't depend on whether a CM connect or a CDN fetch happens first.
- **Pin and patch steam-vent** (`a9e8164`, unreleased 0.6.0): the anonymous-logon fix is needed
  by any anonymous Rust session (`vendor.sh` shows the one-line change; upstream it).
- Linux binaries built on ubuntu-24.04 need glibc 2.38. `release-tauri.yml` already pins its
  Linux build host for this reason (comment at :88). The Rust CM code adds nothing new there.
- **Not tested:** Windows on ARM64, Linux aarch64, and a signed-in run on real Windows/Linux. The
  signed-in path differs only in the logon message, and ran signed in under Wine.
