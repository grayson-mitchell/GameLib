---
spike: 008
name: gating-game-hoard
type: standard
validates: "Given a game importing SteamAPI_RestartAppIfNecessary, when our bridge drives that gate (proceed if live session, exit if not), then the game runs iff the bridge validates the session"
verdict: PARTIAL
related: [007, 005b, 004c]
tags: [steam, macos, bridge, gate, drm, restartappifnecessary, hoard, phase-22]
---

# Spike 008: Gating-game demo (Hoard / Reuben.exe)

> Part of **Idea B — macOS native Steam bridge** (spike 004). 007 proved a real game *runs* on
> the bridge but ignored the Init return, so it didn't show the bridge *gating* a launch. 008
> targets a game that imports the hard-gate API `SteamAPI_RestartAppIfNecessary` to try to show
> "runs with the bridge, refuses without it." Run live 2026-07-18.

## What This Validates (attempted)

**Given** a game importing `SteamAPI_RestartAppIfNecessary` (Hoard's Reuben.exe), **when** our
drop-in shim drives that gate from the bridge (return 0/proceed if a live native-Steam session is
confirmed, 1/exit if not), **then** the game should run iff the bridge validates the session.

## Why Hoard

`objdump` on Reuben.exe → 7 steam_api imports: `Init`, **`RestartAppIfNecessary`**, `RunCallbacks`,
`Register/UnregisterCallback`, `Register/UnregisterCallResult`. No interface accessors, so a full
drop-in is small and safe. `RestartAppIfNecessary` is *the* API a game calls first to enforce
"launched via Steam."

## Investigation Trail

1. Built a drop-in exporting all 7 symbols; `RestartAppIfNecessary` returns bridge-derived value
   (live→0 proceed, down→1 exit), everything logged to `C:\hoard_gate.log`.
2. **POSITIVE (bridge up):** log → `RestartAppIfNecessary … live=1 -> 0 (proceed)`, `Init -> 1`;
   Reuben alive at t=10s → ran.
3. **NEGATIVE (bridge down):** log → `RestartAppIfNecessary … live=0 -> 1 (GATE FIRES: exit/relaunch)`,
   `Init -> 0`; **Reuben was STILL alive at t=10s** — it ignored the gate return and ran anyway.

## Results

**Verdict: PARTIAL ⚠.**

- ✓ **The bridge drives the gate correctly.** `RestartAppIfNecessary` and `Init` returned the
  right bridge-derived values in both directions, verified in the log. The bridge's actual
  responsibility — supplying valid Steamworks answers, including correct gate values — works.
- ✗ **No hard-refusal demonstrated.** Reuben calls the gate APIs but does **not** self-enforce on
  the return (it ran even when told to exit/relaunch). This is the **second** game (after Avernum
  4, 007) that invokes Steam gate APIs and ignores the result. For these titles, launch is not
  gated at the `steam_api.dll` level at all.

**The real finding:** for many (especially older/simpler) games, `steam_api.dll` return values are
**advisory, not enforcing**. True launch-enforcement for protected titles is **Steam CEG** (Custom
Executable Generation) / DRM wrappers that validate the Steam client below the flat API — a
separate, harder surface a `steam_api.dll` shim cannot exercise. So "refuses to run without the
bridge" can only be shown with a title that *self-enforces on the API return* (a known class exists
— games that print "Steam must be running" and exit — but none was present in this bottle's small
32-bit library), and CEG-wrapped games are out of scope for a flat-API bridge spike.

**Net for the build:** the bridge does not need to (and cannot) *gate* launches — its job is to
make Steamworks calls succeed so games that check get valid answers. 007+008 together show real
games run on the bridge and receive correct, bridge-backed values; CEG/DRM enforcement is an
independent workstream.

## Cleanup / safety

`run.sh` backs up Reuben's original `steam_api.dll` and restores it on exit (verified: only the
real DLL remains; native Steam untouched). Uses `bin/wine` + `wineserver -k` between runs (007 lesson).

Evidence: `run-evidence.txt`, transcripts above.
