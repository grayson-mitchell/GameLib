---
spike: 005b
name: bottle-to-host-tcp
type: standard
validates: "Given a GameLib CrossOver bottle, when a Windows PE inside it TCP-connects to a host-loopback bridge, then it round-trips the real signed-in identity the host read from native Mac Steam"
verdict: VALIDATED
related: [005a, 005c]
tags: [steam, macos, bridge, crossover, bottle, tcp, winsock, phase-22]
---

# Spike 005b: Bottle → host TCP bridge

> Part of **Idea B — macOS native Steam bridge** (spike 004). Proves the *bottle side* can
> reach the *host helper* (005a) over TCP, closing the loop begun in 005a. Built + run live in
> the real **GameLibSteam** CrossOver bottle, 2026-07-18.

## What This Validates

**Given** the GameLib-managed `GameLibSteam` CrossOver bottle, **when** a Windows PE32 process
inside it TCP-connects to the host bridge on `127.0.0.1:54550` and sends `WHOAMI`, **then** it
receives the **real** signed-in identity that the host read from native Mac Steam — proving Wine
shares the host loopback and the whole chain works from inside a bottle.

## Toolchain note

No mingw-w64 was installable here (Homebrew only dry-runs in this environment). Unblocked with
**`zig cc -target x86-windows-gnu`** (zig bundles a mingw sysroot) — a self-contained tarball, no
brew/root. The committed `build.sh` accepts `ZIG=/path/to/zig`; an `i686-w64-mingw32-gcc` build
line is documented as the alternative.

## Architecture

```
[ GameLibSteam bottle ]                    [ macOS host ]
  bottle_client.exe (PE32 i386)             bridge_server (native arm64)
     winsock connect 127.0.0.1:54550  ─────► accept
     send "WHOAMI\n"                   ─────► dlopen libsteam_api.dylib (005a) → live Mac Steam
     recv identity  ◄───────────────────────  {"steamID64":..,"persona":..,"loggedOn":1}
```

## How to Run

```bash
ZIG=/path/to/zig bash build.sh    # -> bridge_server (arm64) + bottle_client.exe (PE32 i386)
bash run.sh                        # needs Steam signed in + GameLibSteam bottle
```

## Investigation Trail

1. `zig cc -target x86-windows-gnu` compiled a winsock PE cleanly (verified with a throwaway
   `WSAStartup` exe → `PE32 executable (console) Intel 80386`).
2. Built `bridge_server.c` (native) — loads the dylib once, inits (appID 480), serves
   `127.0.0.1:54550`. Bound to `INADDR_LOOPBACK` only (never a routable interface).
3. Host self-test (python): `WHOAMI` → `{"steamID64":"76561197995867096","persona":"Grayson","loggedOn":1}`.
4. Ran `bottle_client.exe` in the bottle via `CX_BOTTLE=GameLibSteam wine "C:\bottle_client.exe"`.
   Both stdout and `C:\bridge_out.txt` (host: `<bottle>/drive_c/bridge_out.txt`) showed:
   `BRIDGE_REPLY {"steamID64":"76561197995867096","persona":"Grayson","loggedOn":1}`.

## Results

**Verdict: VALIDATED.** A Windows PE inside the real GameLib bottle reached the host bridge over
loopback and pulled the live identity — no port forwarding, no config. **Wine on macOS shares the
host network namespace**, so `127.0.0.1` inside the bottle *is* the host's loopback. The full
chain (bottle → TCP → host → `libsteam_api.dylib` → live Mac Steam → back) is proven end to end.

- **Working bottle-run invocation:** `CX_BOTTLE=<bottle> <CrossOver>/bin/wine "C:\prog.exe"`.
- **Loopback-only bind** keeps the bridge off the network — appropriate for the real build too.

**Not proven here (→ 005c):** that the bottle side can be a *drop-in `steam_api.dll`* a game
loads, rather than a bespoke client exe. (005c does exactly that.)

Evidence: `bridge_out.txt`, `server.log`, and the transcript above (Steam `steam_osx` confirmed
signed in during the run).
