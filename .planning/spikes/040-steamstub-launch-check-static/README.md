---
spike: 040
name: steamstub-launch-check-static
type: standard
validates: "Given the three SteamStub titles that fail through the bridge (Grim Dawn 219990, Raft 648800, Ranch Simulator 1119730), when their .bind stub headers are decoded read-only to see which launch checks are armed and the 52-19 load-time trace is read against them, then determine whether the check that rejects GameLib's forwarding steamclient64.dll can be satisfied inside Phase 52's locked boundary"
verdict: INVALIDATED
related: [035, 036, 037, 038, 039]
tags: [steam, macos, bridge, steamstub, drm, grim-dawn, raft, ranch-simulator, steamclient, boundary]
---

# Spike 040: SteamStub launch-check static feasibility

## What This Validates

Given the three SteamStub titles observed failing through the native Steam bridge — Grim Dawn
(219990) and Raft (648800) with *Application load error 3*, Ranch Simulator (1119730) exiting
**53** before `steam_api64.dll` is even loaded — when their `.bind` stub headers are decoded
**read-only** to read which launch checks the DRM has armed, and that is read against the
already-captured 52-19 load-time relay trace, then decide: **SATISFIABLE-WITHIN-BOUNDARY** (→
propose a phase) or **UNSATISFIABLE** (→ close the todo won't-do, keep the honest notice).

The locked Phase 52 boundary: every answer the stub receives comes from the genuine signed-in Mac
Steam client. **No stand-in that answers on its own, no DRM reconstruction, no genuine Valve DLL
shipped, no game-exe edit, no bottled-Steam reroute.**

## Method & Boundary Discipline

Static and read-only. The only transform applied to any game file is Steamless's publicly
documented SteamStub-3.1 **header** XOR decode (`decode_bind.py`) — this reads the stub's metadata
(appid, flags, sizes), i.e. *which* checks are enabled. It is reconnaissance of the check surface,
not an attempt to defeat it.

**Deliberately NOT done:** decrypting the payload or the embedded `SteamDrmp.dll` to reverse the
check's internal logic. That crosses from "read which checks exist" into reconstructing Valve's DRM
— the same boundary spikes 035–037 stopped at for CEG. The feasibility question is answerable
without it, and the answer does not depend on it.

Inputs were sha256'd before and after (`inputs.before.sha256`); all five bytes-identical after the
run. No input path was written to.

## Research

- **SteamStub 3.1 x64 header** — layout, the `0xC0DEC0DF` signature, the chained `SteamXor`
  decode, and the DRM flags enum are public in Steamless (atom0s, `Steamless.Unpacker.Variant31.x64`).
  Flags: `0x02 NoModuleVerification`, `0x04 NoEncryption`, `0x10 NoOwnershipCheck`,
  `0x20 NoDebuggerCheck`, `0x40 NoErrorDialog`. A flag **set** means that check is **off**; a flag
  **clear** means the check is **on**.
- **"Application load error 3"** has no public write-up tying it to SteamStub specifically; it is
  the generic Steam "can't locate/verify/communicate with the client" failure. So the diagnosis
  rests on the local header + the 52-19 trace, not on a web source.

## How to Run

```bash
cd .planning/spikes/040-steamstub-launch-check-static
BOTTLES="$HOME/Library/Application Support/CrossOver/Bottles"
C="Program Files (x86)/Steam/steamapps/common"
python3 -I decode_bind.py \
  "$BOTTLES/GameLibSteamBridge-219990/drive_c/$C/Grim Dawn/x64/Grim Dawn.exe" \
  "$BOTTLES/GameLibSteamBridge-648800/drive_c/$C/Raft/Raft.exe" \
  "$BOTTLES/GameLibSteamBridge-1119730/drive_c/$C/Ranch Simulator/Ranch_Simulator/Binaries/Win64/Ranch_Simulator-Win64-Shipping.exe"
```

## Results

### Which checks each title has armed (decoded header, `decode.json`)

| title | appid | flags | module verification | ownership check | debugger check | code encrypted |
| --- | --- | --- | --- | --- | --- | --- |
| Grim Dawn | 219990 | `0x00` | **ON** | **ON** | **ON** | **ON** |
| Raft | 648800 | `0x00` | **ON** | **ON** | **ON** | **ON** |
| Ranch Simulator | 1119730 | `0x06` | off | **ON** | **ON** | off |

All three are genuine SteamStub 3.1 x64 (`0xC0DEC0DF` verified). Grim Dawn and Raft arm the full
set. Ranch Simulator ships with module verification *and* encryption disabled — yet **still** fails
through the bridge (exit 53, before `steam_api64.dll` loads, per the todo's 53-15 evidence).

### What the stub does to the forwarder (52-19 trace, already captured)

The stub loads the registered forwarder `steamclient64.dll`, calls `GetModuleFileNameW` to recover
its on-disk path, `CreateFileW` opens it, and `ReadFile` reads the **entire 186368-byte file**.
The *very next* stub action is the `MessageBoxA` / `"MSGBOX"` lookup — i.e. the whole-file read is
the last thing it does before raising the load error. Only `CreateInterface` is resolved on the
forwarder; the native client's interface *answers* are never reached because the file is rejected
at the load/verify stage first.

### Signature evidence (`decode.json` authenticode directory)

- Genuine Valve `steamclient64.dll`: **26.5 MB**, Authenticode security directory present
  (offset `26536448`, size `11416`).
- GameLib forwarder: **187 KB**, security directory **absent** (offset 0, size 0).

### Why this is UNSATISFIABLE within the boundary

The check that rejects the forwarder operates on **the client DLL file itself** — the stub reads
every byte of it and rejects it before any interface call matters. Satisfying that check would
require the loaded file to *be*, or be verified as, Valve's genuine signed client. Every route to
that is explicitly outside the locked boundary:

1. **Ship the genuine signed `steamclient64.dll`** → forbidden ("no genuine Valve DLL"), and it is
   a 26 MB Windows client that would then want a Windows Steam runtime — the bottled path the
   project is eliminating.
2. **Make the forwarder pass the verification** → requires reconstructing Valve's module-verify /
   ownership response = DRM reconstruction, forbidden, and the same wall spikes 035–037 hit for CEG.
3. **Edit the exe / flip the stub flags** (e.g. set `NoModuleVerification`) → "no game-exe edit",
   forbidden. And the Ranch Simulator datapoint shows it would not even be sufficient: that title
   already has module verification **off** and still fails (ownership + debugger checks remain, and
   it dies before `steam_api64` loads).
4. **Reroute to bottled Steam** → forbidden here, and is the `drm-wrapped` exception the project is
   trying to shrink, not grow ([[bottled-steam-is-narrow-fallback]]).

The native Mac Steam client exposes interface *answers* (the 33 `Steam_*`/`CreateInterface` names
in 52-19's table), which is what the bridge forwards successfully for non-DRM titles. It does not
expose a signed Windows `steamclient64.dll`, and the SteamStub launch check wants the latter. The
one surface the bridge can legitimately provide is on the wrong side of the check that fails.

**Verdict: INVALIDATED — the SteamStub launch check cannot be satisfied within Phase 52's locked
boundary.** This mirrors the CEG conclusion (035–037): DRM that validates the client binary itself,
not an interface answer, has no bridge-side answer that stays inside the boundary.

## Investigation Trail

1. Decoded the three stub headers read-only. Expected to find the arming differences; the surprise
   was Ranch Simulator shipping `NoModuleVerification` yet still failing — which turns a "maybe
   module verification is the blocker" hypothesis into evidence that flipping it is neither
   available (exe edit) nor sufficient.
2. Re-read the 52-19 trace for the exact failure point: whole-file read of the forwarder → immediate
   MessageBox. The rejection is at file-verify, upstream of any forwarded interface call.
3. Began extending the script to decrypt the embedded `SteamDrmp.dll` to name the exact check —
   **stopped and deleted it**: that is DRM reconstruction, outside the boundary, and the verdict
   does not need it. The arming flags + the whole-file-read-then-reject trace + the
   signed-vs-unsigned gap are sufficient and all stay on the read-only side of the line.

## Signal for the Build

- **Close the todo as won't-do.** Keep the honest "SteamStub launch check not supported through the
  bridge" notice (52-34/52-36) as the final behaviour. The revisit trigger (any SteamStub title ever
  seen reaching its menu through the bridge) stays recorded.
- Do **not** open a static-RE phase. The only answers to the failing check are the four forbidden
  routes above.
- The notice should cover the exit-53 variant (Ranch Simulator) too, not only Application-load-error-3
  — same class, different stub flags, same verdict.
