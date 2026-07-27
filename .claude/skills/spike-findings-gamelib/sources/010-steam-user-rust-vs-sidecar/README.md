---
spike: 010
name: steam-user-rust-vs-sidecar
type: comparison
validates: "Given Steam CM auth + owned-apps + depot download (today pure-JS steam-user), when tested Rust-native (steam-vent) vs kept as a Node sidecar, then determine if GameLib's Steam differentiator can go Rust or must stay Node"
verdict: WINNER — Node sidecar (keep steam-user)
related: [009, 002, 003]
tags: [tauri, rust, steam, steam-user, sidecar]
---

# Spike 010: Steam differentiator — Rust-native vs Node sidecar

> Part of **Idea C — Rust/Tauri rearchitecture**. The second idea-decider. GameLib exists to add
> Steam; its Steam stack (`steam-user` CM client + the depot download reverse-engineered in spikes
> 001/002/003) is the crown jewel. A Rust/Tauri rearchitecture either keeps that as a **Node
> sidecar** or **rewrites it in Rust**. This decides which. Run live 2026-07-20.

## What This Validates

**Given** Steam CM auth + PICS/owned-apps + depot manifest/chunk download (today pure-JS
`steam-user` + ~100 lines of GameLib's own AES/LZMA/CDN code), **when** we compare a Rust-native
path (the `steam-vent` crate) against keeping `steam-user` as a bundled Node sidecar, **then**
determine whether the differentiator can move to Rust or must stay Node.

## Research (2026-07-20)

| Approach | Library | Auth | PICS / owned apps | Depot download (manifest+chunk+decrypt+CDN) | Maturity | Status |
|----------|---------|------|-------------------|---------------------------------------------|----------|--------|
| Rust-native | **steam-vent** 0.5.0 (Apr 2026, codeberg) | ✓ password / QR / Steam Guard | ✗ not provided (proto exists; high-level DIY) | ✗ **none** — "intentionally does not include any high level apis"; no CDN/manifest/chunk/depot-key code | ~9.5k downloads; **"early development, apis might see large changes"** | experimental |
| Node sidecar | **steam-user** 5.3.0 (in project) | ✓ | ✓ `getOwnedApps` / `getProductInfo` | ✓ via `getRawManifest` + GameLib's own decrypt/LZMA/retry (spike 002); **byte-identical, shipped through Phase 26** | production, proven on real HW | ready |

**steam-vent covers only the protocol handshake + auth.** Its own README states it is a low-level
library that deliberately omits high-level APIs. There is **no depot content downloading, no CDN
client, no manifest/chunk handling, no depot decryption keys** — precisely the surface spike 002
had to reverse-engineer (and found even the mature `steam-user` got wrong: truncated filenames,
broken `downloadChunk`). Re-deriving that in Rust re-opens the hardest, already-solved problem in a
less-mature ecosystem, and re-requires the byte-identical validation 002/003 already passed.

**Chosen approach: keep `steam-user` as a Node sidecar.**

## How to Run

```bash
# Confirm the Steam stack is Electron-free and runs headless (sidecar-ready) TODAY:
node -e "const S=require('steam-user');const u=new S();console.log(!!u.getRawManifest,!!u.getOwnedApps)"
grep -rl "require('electron')" node_modules/steam-user/   # -> (none)
```

## Investigation Trail

1. **Researched steam-vent** (crates.io + codeberg README). Latest 0.5.0, Apr 2026. Workspace:
   `steam-vent`, `-core`, `-crypto`, `-proto`. README documents auth flows only; explicitly a
   low-level lib with no high-level APIs; self-labelled early-development/experimental.
2. **No Rust depot-download prior art suitable to adopt.** The Rust ecosystem's depot tooling
   (DepotDownloader) is C#/SteamKit2, not Rust; Tauri "manifest downloader" projects shell out to
   DepotDownloaderMod rather than implement the protocol. No mature Rust crate does chunk+decrypt.
3. **Counter-test — is the Node stack sidecar-ready as-is?** Under bare `node` (no Electron
   runtime): `steam-user` loads + instantiates in **341 ms**, exposes `getOwnedApps`,
   `getProductInfo`, `getRawManifest`; `@node-steam/vdf.parse` works; `process.versions.electron`
   is undefined. `steam-user` has **0 `require('electron')`**. The entire Steam differentiator is
   already Electron-free.
4. **The irreplaceable asset is preserved.** Spike 002's `steam-depot.mjs` / `decrypt-manual.mjs` /
   `chunk-manual.mjs` / `raw-crypto.mjs` (AES filename decrypt, LZMA, cross-CDN retry, sha1 gate)
   are the exact ~100 lines a Rust port would have to re-derive and re-validate byte-for-byte.

## Results

**Verdict: WINNER — Node sidecar (keep `steam-user`). Rust-native is INVALIDATED for now.**

- ✓ **Node sidecar preserves 100% of the differentiator at zero reimplementation cost.** Spikes
  001/002/003 (adoption, byte-identical depot download, StateFlags=4) — all shipped through Phase 26
  — come along unchanged. The stack already runs headless, so the *only* new cost is the sidecar
  plumbing that spike 009 shows the whole backend needs anyway.
- ✗ **Rust-native (steam-vent) is auth-only and experimental.** It would force a from-scratch Rust
  reimplementation of PICS logic + the entire depot content pipeline — reopening the hardest,
  already-solved, byte-identical-validated problems, in an "apis might see large changes" crate.
  High cost, high regression risk, no near-term benefit.
- ⚠ **Long-term option, not near-term.** If Idea C ever ships and steam-vent matures a content
  layer, a Rust port could shrink the Node payload. Until then it is strictly worse than the sidecar.

**Impact on Idea C:** *reinforces* 009's conclusion — the rearchitecture is "Tauri/Rust shell +
Rust platform seam + **bundled Node sidecar for business logic (incl. Steam)**," not a Rust rewrite.
The Steam value survives the port intact, so 009's "80% reusable" figure holds (does NOT collapse).
The cost of Idea C stays dominated by the platform-seam rewrite (electron-store, 220 IPC endpoints,
lifecycle), not by re-earning the Steam capability.
