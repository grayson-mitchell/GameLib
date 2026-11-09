---
spike: 037
name: ceg-steamclient-probe
type: standard
validates: "Given 036's accepted DIPC ACK, when ActiveProcess\\SteamClientDll names a (probe) steamclient.dll as Proton's lsteamclient does, then XComEW.exe loads it after the ACK and we see which client interfaces CEG requests"
verdict: INVALIDATED
related: [035, 036]
tags: [steam, macos, bridge, ceg, drm, xcom, proton, steamclient, boundary]
---

# Spike 037: CEG steamclient probe

## What This Validates

036's oracle showed that, under genuine Windows Steam, XComEW.exe loads
`ActiveProcess\SteamClientDll`'s `steamclient.dll` right after Steam ACKs the DIPC start request.
Hypothesis: registering a client DLL there (Proton's `lsteamclient` slot) is the missing piece, and a
logging stand-in would reveal what CEG asks the client for, i.e. what a bridge-backed
`steamclient.dll` would have to forward to the native Mac client.

## How to Run

```bash
python3 -I gen.py && ./build.sh     # probe steamclient.dll from the real DLL's 41 exports (exports.txt)
WATCH=60 ./run.sh p1                # responder + DIPC_CLIENTDLL registration + genuine Steam launch env
                                    # + the launcher's own args (-FROMLAUNCHER -LANGUAGE=INT)
```

The probe exports the real DLL's full surface (`CreateInterface`, 34 `Steam_*`, 6 `Breakpad_*`).
Every call logs to `C:\steamclient037.log` and returns 0/NULL. The responder (036) gained
`DIPC_CLIENTDLL`, which writes `HKCU\…\ActiveProcess\SteamClientDll`/`SteamClientDll64`/`Universe`.
`HKLM\Software\Valve\Steam` is deliberately left absent: per 036/o1 its presence diverts the game
into `steam.exe -applaunch`.

## Investigation Trail

1. **p1**: registry written (`SteamClientDll=… -> 0`), launch env and args identical to the genuine
   launcher's, ACK found and set. The game **still exits with code 0 two milliseconds after the ACK**,
   and **never loads the probe DLL** (no `steamclient037.log` at all).
2. So the post-ACK "continue vs exit" decision isn't "is a client registered". In o5, genuine
   Steam's ~1 ms servicing of the request evidently leaves state the stub checks (nothing in its
   traced syscalls distinguishes it from our ACK, so it would be in memory: the request sections
   `STEAM_DRM_IPC` / `STEAM_DATA.<pid>`).
3. **Stopped here, at the DRM boundary.** The next step would have been capturing what Steam writes
   back into those sections and reproducing it from our responder. That is reconstructing CEG's own
   answer rather than letting a genuine client provide it, i.e. DRM circumvention, which this spike
   line excluded from the outset (035 Research table). Not pursued; no capture tool was kept.

## Results

**INVALIDATED** (for the bridge-only path, within the interoperability boundary). A registered
client DLL does not get XCOM past CEG. The game's continuation depends on Steam's DIPC servicing
itself, and:

- the **native Mac Steam client has no runtime DIPC/STEAMSTART handler** to forward the request to
  (036, string survey); it only carries install-time CEG code;
- reproducing the Windows client's answer by hand would mean replicating DRM behavior, which is out of
  scope by policy.

**Implication for the product:** for CEG titles (XCOM 200510 and any `drm-wrapped` title), only a
genuine **Windows** Steam client can service the start request. The `knownBad` `drm-wrapped` →
bottled-Steam route (memory: *bottled Steam is a narrow fallback; only DRM may justify it*) is
**confirmed as the justified exception**, now with a mechanism rather than an inference. A
bridge-only route for CEG would need Valve-side support (as Linux Steam got in 2021 for Proton) on
macOS, which doesn't exist today.
