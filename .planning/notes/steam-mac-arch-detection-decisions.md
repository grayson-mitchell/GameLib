---
title: Steam macOS 32/64-bit architecture detection — design & research
date: 2026-07-12
context: /gsd-explore session — how to detect 32-bit macOS Steam builds and route them to CrossOver/Wine instead of a native install that fails on modern macOS
related_phase: 17 (Steam on macOS via CrossOver/Wine)
---

# Steam macOS Architecture Detection — Decisions

## Problem

macOS dropped 32-bit support in Catalina (10.15, 2019). Effectively **every Mac
GameLib supports cannot run a 32-bit binary at all.** A 32-bit-only mac Steam game
therefore must not be native-installed — it should route to CrossOver/Wine
(running the game's **Windows** depot under CrossOver, not the mac binary).

GameLib already has the plumbing to act on this:
- `is_mac_native` / `is_linux_native` on `GameInfo` (`src/common/types.ts:220`),
  derived from Steam appdetails `platforms.mac` boolean (`steam/games.ts:274`).
- `isBottleEligible()` (`steam/games.ts:451`) already routes a confirmed
  not-mac-native game through the bottled Steam client (D-11). 32-bit just becomes
  another reason a mac game is bottle-eligible.

## The data-source problem

The **public Steam Web API** (`appdetails`) only returns `platforms:{windows,mac,linux}`
booleans — **no architecture.** That is why `is_mac_native` is only a boolean today.

Architecture DOES live in **PICS appinfo**, reachable via `steam-user`'s
`getProductInfo([appid])` (the CM protocol client already connected for
`getOwnedApps()` — NOT the Web API):

```
apps[appid].appinfo.config.launch[N].config = {
  oslist: "macos",   // also legacy "osx" on older entries — MATCH BOTH
  osarch: "32"       // or "64", or ABSENT
}
```

## Research finding that flips the naive design (2026-07-12)

**Steam treats any mac launch entry NOT explicitly flagged `osarch "64"` as
32-bit.** This causes documented mass FALSE-flagging — A Hat in Time, Metro: Last
Light, BattleBlock Theater all get flagged 32-bit despite running fine. Key facts:

- `osarch` is **manual, developer-set** metadata — Valve confirmed detection "is all
  manual on the part of the developer." Absence ≠ 32-bit truth.
- `osarch` is a **launch-config filter, not a binary probe** — a game can ship a
  64-bit mac binary with no `osarch` tag. It never inspects the actual Mach-O.
- The only **ground truth** is inspecting the installed Mach-O header
  (`file` / `lipo -archs` on the `.app` binary) — post-download only.

⇒ Do NOT assume "missing osarch = 32-bit" (that's the false-positive trap).

## Decided approach — HYBRID (osarch hint + Mach-O ground truth)

Pre-install routing decision (cheap, PICS only):
- `osarch == "32"` → badge "32", route to CrossOver, never native-install.
- `osarch == "64"` → native.
- `osarch` missing → native (tentative — do not over-route).

Post-install correction (ground truth, catches Steam's false-negatives):
- After a native install, inspect the installed Mach-O (`lipo -archs`).
  - i386-only → warn + re-route to CrossOver (Windows depot). Cache result.
  - x86_64/arm64 present → confirmed native, cache result.

## UI

- OS logo beside the game logo in the left panel; a "32" mark on 32-bit mac builds.
- The "32" warning is only *actionable* on a macOS host — on Windows/Linux it's
  trivia. Show OS-availability icons cross-platform if desired for consistency, but
  escalate the "32" treatment only when host is macOS.

## Build gotchas

- Match BOTH `"macos"` and legacy `"osx"` in `oslist`.
- Before locking the parser, do a one-off runtime `getProductInfo([knownMacAppId])`
  dump to confirm exact casing/nesting of `config.launch[N].config.osarch`
  (see todo: steam-getproductinfo-appinfo-dump). Research corroborated the path
  across community/tooling sources but not from a canonical Valve schema doc.
- Depots carry `depots[id].config.oslist` too, but usually without bitness.

## Scope

- **Steam-only for V1** — the arch signal is Steam-specific (PICS). The OS badge
  could later generalize to GOG/Epic mac builds; not in this cut.

## Sources

- node-steam-user (getProductInfo) — https://github.com/DoctorMcKay/node-steam-user
- steamtinkerlaunch Appinfo wiki — https://github.com/frostworx/steamtinkerlaunch/wiki/Appinfo
- Steam false 32-bit flagging thread — https://steamcommunity.com/discussions/forum/2/3115897635595043129/
- Steamworks depots — https://partner.steamgames.com/doc/store/application/depots
- natbro/kaon (mac Wine/CrossOver routing) — https://github.com/natbro/kaon
