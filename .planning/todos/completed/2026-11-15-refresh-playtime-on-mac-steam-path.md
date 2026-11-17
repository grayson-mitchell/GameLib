---
created: 2026-11-15T00:00:00Z
title: 'Refresh playtime and last-played on the Mac Steam owned-apps path'
area: steam-library
severity: medium
platform: macos
ready: live-gate
source: Phase 79 plan 79-36 (D-14 Mac Steam path, PARITY playtime DV row)
files: [src-tauri/crates/gamelib-steamcm/src/refresh/assemble.rs, src-tauri/crates/gamelib-steamcm/src/refresh/mod.rs]
---

## Problem

On the Mac Steam owned-apps path (the primary Refresh path on macOS when a logon grant exists and Mac Steam runs), the Rust assembly runs in carry-forward mode. Playtime and last-played are copied from the cached library and never refreshed while that path is primary, so they go stale. The CM path still updates them. This is the accepted divergence row in 79-PARITY.md (Mac Steam path section, DV-79-13).

## Candidate directions (none chosen)

- Read per-app playtime from Mac Steam's `localconfig.vdf` through gamelib-steamfiles, which needs no logon.
- An occasional bounded CM owned-games read when a lease is already open.

Each must keep D-14: no CM logon on the primary Mac path, so Friends cannot be signed out.

## Resolution

Resolved by quick-261117-q52: the Mac Steam Refresh path now reads per-app Playtime and LastPlayed from Mac Steam's localconfig.vdf (gamelib-steamfiles, no logon) and merges them with max(carried, local). Live check passed 2026-11-17 (WazHack 23509 -> 23524 min via the Mac Steam path, no CM logon, Friends stayed signed in).
