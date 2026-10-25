---
created: 2026-10-24
title: "Decide whether to pursue static RE of the SteamStub launch check (Grim Dawn main menu through the bridge)"
source: Phase 52 amended done-when (52-UAT items 29, 31-32)
area: steam-bridge
files:
  - src/backend/storeManagers/steam/games.ts
  - native/steam-bridge/helper/bridge_helper.c
severity: major
platform: any
ready: human
---

**Problem.** SteamStub titles (Grim Dawn 219990) reject the bridge's forwarding steamclient64.dll with Application load error 3 and never reach their main menu. Making the stub accept the forwarder would need static reverse engineering of the stub's launch check.

**Evidence.** 52-UAT items 24 and 27-29: the stub reads the whole forwarder file, a live pid removes the IsSteamRunning warning but the load error persists, so the file/forwarder check is the blocker.

**Boundary.** Static RE of the stub is outside the locked boundary of Phase 52, so the operator decides first. Nothing here proposes a stand-in, a genuine Valve DLL, an exe edit or a bottled-Steam reroute.

**GameLib today.** The forwarded path logs the trigger and shows an honest "Steam DRM check not supported" notice, as an OS notification and as an in-app dialog (52-34, 52-36; confirmed live in item 32).

**Revisit trigger.** re-scope the notice if any SteamStub title is ever observed reaching its menu through the bridge.

## 53-15 evidence (2026-10-25)

More SteamStub titles hit the same wall through the bridge, none reaching their menu:

- Raft 648800 and Grim Dawn 219990 (53-UAT item 11): census class `steamstub-forwarded:launch-check-unsatisfiable`, FWD CreateInterface only, operator "drm message shows, error message: Application load error." (Raft) and "DRM message in app, error: application failed error" (Grim Dawn).
- Ranch Simulator 1119730 (53-15 Task 1): the Shipping exe has a `.bind` section (0x39248 bytes, last section) and exits 53 (0x35) before steam_api64.dll is ever loaded. The result is identical with the game's original `steam_api64.dll.gamelib-orig`, so the shim is not involved. Operator re-test on the current build: "other two do not [run], think they have not changed". Not rerouted to bottled Steam; the decision stays with this todo.

## Resolution (2026-10-26): won't-do — static RE not pursued

Decided via feasibility spike **040** (`.planning/spikes/040-steamstub-launch-check-static/`),
read-only, no exe modified, DRM payload NOT decrypted (stopped at the boundary). Verdict:
**UNSATISFIABLE within Phase 52's locked boundary — INVALIDATED.**

- Decoded the three stub headers read-only. Grim Dawn (219990) and Raft (648800) arm the full
  check set (module verification + ownership + debugger + encryption, flags `0x00`). Ranch
  Simulator (1119730) ships `NoModuleVerification` + `NoEncryption` (flags `0x06`) yet still
  fails (exit 53 before `steam_api64.dll` loads) — so flipping module verification is neither
  available (exe edit) nor sufficient.
- 52-19 trace: the stub reads the **entire** 186368-byte forwarder file, then immediately raises
  the error (next action is the `MSGBOX` lookup). The rejection is at the client-DLL file-verify
  stage, upstream of any forwarded interface call. Genuine Valve `steamclient64.dll` is 26 MB and
  Authenticode-signed; the forwarder is 187 KB and unsigned.
- The one surface the bridge can legitimately provide (the native client's interface *answers*)
  is on the wrong side of the failing check. The only routes to satisfy it — ship the genuine
  signed Valve DLL, reconstruct Valve's module-verify/ownership response (DRM reconstruction),
  edit the exe/flip the flags, or reroute to bottled Steam — are each explicitly outside the
  locked boundary. Same wall as CEG (spikes 035-037).

**Outcome:** keep the honest "SteamStub launch check not supported through the bridge" notice
(52-34/52-36) as the final behaviour; it should also cover the exit-53 variant, not only
Application load error 3. The revisit trigger above stands unchanged. No static-RE phase opened.

## Addendum (2026-10-26): spike 041 confirms the verdict live

The operator authorized one live test of the genuine-DLL route (spike 041, scratch clone
`GameLibSpike041`, the user's own `steamclient64.dll` copied from GameLibSteam, nothing shipped).
Control: forwarder → `Application load error 3:0000065432`. Genuine client: the file check
**passes**, then the client opens `Steam3Master_SharedMemLock` → not found (Windows `steam.exe`
IPC, absent with only Mac Steam), the stub falls back to `steam://run/219990//` and exits silently.
So spike 040's two inferences are now observed: the check is about the client file, and the
genuine client needs a Windows Steam. Won't-do stands.
