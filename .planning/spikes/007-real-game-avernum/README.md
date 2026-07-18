---
spike: 007
name: real-game-avernum
type: standard
validates: "Given a real commercial Steam game (Avernum 4) in the GameLibSteam bottle, when its steam_api.dll is replaced with our bridge-backed drop-in, then the game loads it, calls SteamAPI_Init, receives the real live-session identity via the bridge, and runs"
verdict: VALIDATED
related: [005a, 005b, 005c, 006]
tags: [steam, macos, bridge, steam_api, real-game, avernum, crossover, phase-22]
---

# Spike 007: Real commercial game on the bridge (Avernum 4)

> Part of **Idea B — macOS native Steam bridge** (spike 004). The ultimate proof: not a harness,
> but an **actual commercial Steam game** running in the GameLibSteam bottle against our
> bridge-backed replacement `steam_api.dll`. Run live 2026-07-18.

## What This Validates

**Given** a real Steam game (Avernum 4, Spiderweb Software — installed in the GameLibSteam bottle),
**when** its `steam_api.dll` is replaced with our bridge-backed drop-in, **then** the game loads
it, calls `SteamAPI_Init`, receives the real live-session SteamID via the host bridge, and runs —
with **no Windows Steam client in the bottle.**

## Why Avernum 4

`objdump` on `Avernum 4.exe` shows it imports **exactly two** symbols from `steam_api.dll`:
`SteamAPI_Init` and `SteamAPI_Shutdown`. A pure ownership/DRM gate — the minimal real-game surface,
fully satisfiable by a tiny drop-in. (A game won't even load if the shim is missing any imported
symbol, so a small import surface is what makes a first real-game run tractable.)

## How to Build/Run

```bash
ZIG=/path/to/zig bash build.sh   # -> steam_api.dll (bridge-backed drop-in)
bash run.sh                       # backs up Avernum's dll, swaps ours in, launches the game,
                                  #  observes, ALWAYS restores the original on exit
```
The shim's `SteamAPI_Init` returns true **only if** the host bridge (005b) confirms the real
signed-in native Mac Steam session — so a bridge-backed launch is genuine, not hardcoded. Every
call is logged to `C:\steam007.log`.

## Investigation Trail

1. Enumerated Avernum 4's import surface → only `SteamAPI_Init` + `SteamAPI_Shutdown`.
2. Built a drop-in `steam_api.dll` whose `SteamAPI_Init` does the bridge WHOAMI handshake and
   returns true iff a real SteamID comes back; logs every call.
3. **Tooling landmine:** first attempts produced no output and the game exited — a stray
   `cxstart`-launched CrossOver session had **wedged the bottle's `wineserver`**, silently routing
   later `wine` output away. Killing `wineserver -k` restored the known-good `bin/wine` capture
   (re-verified with the 006 harness). **Use `bin/wine`, not `cxstart`; reset `wineserver` between runs.**
4. **POSITIVE run (bridge up):** `steam007.log` → `SteamAPI_Init: bridge SteamID64=76561197995867096
   -> returning 1`; `Avernum 4.exe` stayed alive across t=2..12s. The real game ran on the bridge,
   with the live native-Steam identity marshaled into it.
5. **NEGATIVE run (bridge down):** `SteamAPI_Init: bridge SteamID64=0 -> returning 0` — but Avernum
   **also kept running**. So Avernum ignores the Init return (weak/legacy gate).

## Results

**Verdict: VALIDATED — a real commercial Steam game runs on the bridge.** Avernum 4 loaded our
drop-in bridge-backed `steam_api.dll`, invoked `SteamAPI_Init`, which validated the live signed-in
native Mac Steam session and returned the real result, and the game ran — no Windows Steam client
in the bottle. This is the end-to-end payoff of 005+006 against a genuine game binary.

**Honest scope (what the negative run revealed):**
- **Avernum ignores `SteamAPI_Init`'s return** → this proves **drop-in compatibility + real-session
  marshaling into a live game process**, but NOT that the bridge *gated* this title's launch (it
  runs either way). Demonstrating a load-bearing gate needs a game that actually checks Init /
  calls `SteamAPI_RestartAppIfNecessary` and bails on failure — the clear next test (e.g. AoW3 or
  another installed title with a larger, gating integration).
- **Minimal surface only.** Avernum touches just Init/Shutdown. A game that calls interfaces
  (`ISteamApps`, `ISteamUserStats`, overlay, …) needs the full generated shim (006's vtable pattern
  + a complete export set) and will otherwise crash past Init.

**Impact:** the bridge now has a real commercial game running against it on GameLib's exact stack.
Combined with 004–006, feasibility is proven at every layer; remaining work is breadth + a
gating-game demonstration, not viability.

## Cleanup / safety

`run.sh` backs up the original `steam_api.dll` and restores it on exit (verified: only the real
118368-byte DLL remains in the game dir; native Steam untouched).

Evidence: `run-evidence.txt`, the run transcripts above.
