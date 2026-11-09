# Steam DRM (CEG, SteamStub) through the macOS Steam bridge

What happens when a DRM-wrapped Windows title runs through GameLib's native Steam bridge, which
walls are real, and the one route that clears a wall without bottled Windows Steam. Covers the
two Valve DRM families seen in the operator's library:

- **CEG** (Custom Executable Generation): a start stub in the game exe, which runs before
  `SteamAPI_Init` and sends a DIPC "start request" to a Windows Steam client. XCOM 200510.
- **SteamStub** (Steamworks DRM, the `.bind` PE section): a wrapper that loads the client DLL
  named in `ActiveProcess\SteamClientDll(64)` and checks it before the game's code runs. Grim
  Dawn 219990, Raft 648800, Ranch Simulator 1119730.

Companion to `macos-steam-bridge.md`, which covers the ordinary `steam_api` TCP bridge. This file
is the DRM layer underneath it.

**Bottom line.** SteamStub is solved by Valve's own Proton design: the genuine signed
`steamclient(64).dll` in the slot, its exports trampolined in memory to `lsteamclient`, and
`lsteamclient` calling the running Mac `steamclient.dylib` (043, 044). GameLib built this as
Phase 56's steamclient-layer DRM mode. CEG is not solved on the Mac side. It is rare (3 of 389
owned games reach it on Apple silicon, 045), so `drm-wrapped` → bottled Steam is its permanent
answer.

## Requirements

### The DRM boundary (operator rulings; binding on every plan)

- **Every answer the DRM receives comes from a genuine Valve client.** Ownership is decided by
  the signed-in native Mac Steam client, or by genuine Windows Steam in the bottled fallback.
  GameLib never answers a DRM check itself. *(Phase 52 boundary; 037, 040)*
- **Inside the boundary (ruled 2026-10-27, after 043):**
  - fetching Valve's genuine `steamclient(64).dll`, `tier0_s64.dll` and `vstdlib_s64.dll` from
    **Valve's own CDN onto the user's machine**. GameLib never ships or redistributes them. This
    supersedes 040's "ship-genuine-DLL is out of bounds" only for this fetch-don't-ship form;
  - rewriting that genuine client's exports **in memory** so they jump to `lsteamclient` (Proton's
    `steamclient_setup_trampolines`).
- **Out of the boundary, always:** patching or editing game exes (including flipping SteamStub
  flags), decrypting DRM payloads or the embedded `SteamDrmp.dll`, and any GameLib stand-in that
  answers Steam's private protocols on its own (a logging or fake `ISteamClient` that answers on
  its own, a re-implemented `Steam3Master` IPC, a hand-built CEG `STEAMSTART` answer).
  *(037, 038, 040, 041)*
- **CEG `STEAMSTART` capture and replay:** the operator ruled it in bounds **for spike research
  only**. Shipping such a responder has not been ruled on (ask first). Claude cannot build the
  capture tool: the safety classifier stopped it during 045 scoping. **Do not plan any work that
  depends on it.** *(045; memory `drm-boundary-fetch-and-trampoline-ok`)*

### Routing

- **Bottled Windows Steam is a narrow fallback being shrunk to zero.** Only DRM justifies a route
  there. `does-not-run`, `win64-only` and `p2p-required` launch through the bridge with their
  one-time notice, not through bottled Steam. Treat any new route into bottled Steam as needing
  explicit justification. *(memory `bottled-steam-is-narrow-fallback`)*
- **CEG (`drm-wrapped`) → bottled Steam is the justified, permanent exception.** Only a genuine
  Windows Steam client services the CEG start request (036 oracle). The Mac client has no runtime
  handler (036). It affects 3 titles. *(037, 044, 045)*
- **SteamStub (`.bind`) → steamclient-layer DRM mode, not bottled Steam.** A non-bottled route is
  demonstrated (044), so "DRM may justify bottled Steam" no longer holds for SteamStub.
  *(043, 044)*
- **SteamStub through the plain TCP bridge stays unsupported, with an honest notice.** That notice
  covers both failure variants: *Application load error 3* (Grim Dawn, Raft) and a silent exit
  53 before `steam_api64.dll` loads (Ranch Simulator). *(040)*

### Verification

- **"Verified" is strict.** For the TCP bridge it means shim `HELLO` plus a clean game-side Steam
  init log. In steamclient-layer DRM mode there is no shim. There, the `HELLO` equivalent is
  GameLib's `lsteamclient` logging the game process's first `CreateInterface` (appId + pid), and
  init proof is a game-originated call beyond init (traced in `lsteamclient`) or a clean game-log
  init line. Reaching the menu, helper-originated calls and Mac Steam's "In-Game" status never
  count. Grim Dawn under NotProton reached its menu, but its Steam init is **unverified**. *(044;
  memory `bridge-verified-criterion-is-strict`)*

## How to Build It

### 1. Classify the title at install scan

- **CEG:** the PE resources `STEAM_SPLIT_GUID` / `STEAM_GUIDD` / `STEAM_MINSTANCE`
  (`peSteamDrm.ts`, quick 261024-br4). Behind the resources, the exe has `STEAMSTART` /
  `STEAM_DIPC` strings. *(035, 045)*
- **SteamStub:** a `.bind` PE section. That is one section name, so the check is cheap. 040's
  `decode_bind.py` reads the SteamStub 3.1 x64 **header** read-only (the Steamless-documented XOR
  decode, signature `0xC0DEC0DF`) to report which checks are armed. A set flag means that check
  is **off**:

  | flag | meaning when set                         |
  | ---- | ---------------------------------------- |
  | 0x02 | NoModuleVerification                     |
  | 0x04 | NoEncryption                             |
  | 0x10 | NoOwnershipCheck                         |
  | 0x20 | NoDebuggerCheck                          |
  | 0x40 | NoErrorDialog                            |

  Grim Dawn and Raft are `0x00` (everything armed). Ranch Simulator is `0x06` and **still**
  fails the TCP bridge. Use the header for diagnostics only. Never act on it by editing the exe.
  *(040)*
- **Scan DLL importers, not only the exe.** Grim Dawn's `steam_api64.dll` is a static import of
  `Engine.dll`, so an exe-only import scan mislabels it `runtime-loaded`. *(038)*
- **Library-wide CEG census** without downloading content: read each owned Windows depot's
  manifest and test `EDepotFileFlag.CustomExecutable` (128). Use spike 002's raw manifest parser,
  because steam-user's `getManifest()` truncates filenames. *(045)*

  ```js
  const FLAG_CUSTOM_EXECUTABLE = 128
  for (const f of manifest.files.filter((f) => !(f.flags & FLAG_DIRECTORY)))
    if (f.flags & FLAG_CUSTOM_EXECUTABLE) cegFiles.push(f.filename)
  ```

  A CEG title reaches the wall on Apple silicon **only when its Mac build is i386**, which makes
  GameLib install the Windows build. Read the Mac main binary's Mach-O header (045's
  `macarch.mjs`). The three titles that reach it are XCOM: Enemy Unknown 200510, Hitman:
  Absolution 203140 and Hitman: Sniper Challenge 205930. Each needs a `macArch: "32"` known-fix
  hint so the Windows build is installed and then routed to bottled Steam. Only XCOM has an
  allowlist entry today. *(045)*

### 2. SteamStub: the steamclient-layer route (proven live, 044)

The mechanism, as in Proton (`ValveSoftware/wine` `dlls/ntdll/loader.c:2390-2398`) and NotProton:

1. **Genuine signed client on disk.** Fetch `steamclient(64).dll` + `tier0_s64.dll` +
   `vstdlib_s64.dll` from Valve's CDN onto the user's machine. NotProton pins the Linux client
   package `bins_misc_ubuntu12.zip`, sha256-checked. That package simply contains the stock,
   Authenticode-signed **Windows** client (11,416-byte cert table, same `Steam3Master` strings as
   the bottle copy). No special build is involved. Point `HKCU\Software\Valve\Steam\ActiveProcess\SteamClientDll(64)`
   at it. *(043)*
2. **Loader trampoline.** When Wine maps `steamclient(64).dll`, load `lsteamclient.dll` and
   rewrite every named export that both share, plus the entry point, into `movabs rax, <target>;
   jmp rax`. Set `LDR_DONT_CALL_DLLMAIN`. The genuine client's own code never runs, so it never
   looks for `Steam3Master_SharedMemLock`, the step where 041 died. NotProton does this with a
   binary detour on CrossOver's `ntdll` `build_module`, applied to a **cloned** CrossOver.
   *(043)*
3. **`lsteamclient` unix half** runs in-process as a winelib `.so` and `dlopen`s
   `$STEAM_COMPAT_CLIENT_INSTALL_PATH/steamclient.dylib`, using its x86_64 slice (the Mac client
   is universal) through the public `CreateInterface` / `Steam_BGetCallback` exports. Those
   exports are stable across Steam builds. *(043)*
4. **Proton `steam_helper` environment** for the game process (BSD-3, from Proton
   `steam_helper/steam.c`): the `Steam3Master_SharedMemLock` and `Global\Valve_SteamIPC_Class`
   events, `ActiveProcess\pid`, `SteamPath`, and the DIPC responder (step 4 below). *(036, 043)*

Result: Grim Dawn's `compat/grim dawn.exe` (SteamStub 3.1, flags `0x00`) reached its menu, played
and exited 0 after 69 s, with only native Mac Steam running and none of GameLib's code in the
path. *(044)* Through the TCP bridge the same check fails (040).

Why it works: the SteamStub check is **about the client file** (040 static, 041 live). It reads
the whole registered DLL and accepts the genuine signed one. The trampoline then gives that file
`lsteamclient`'s code, which reaches Mac Steam. It is one file on disk with a different DLL's code
behind it.

Coverage bonus: the game's own genuine `steam_api.dll` runs unmodified, and `lsteamclient` carries
Valve's thunks for every interface version. Nothing is generated per game. *(043)*

### 3. Licensing and packaging

- NotProton's own code is GPL-3, which is compatible with GameLib's `GPL-3.0-only`. Its
  `steam-shim` is BSD-3, also fine. **`lsteamclient` is under the Steamworks SDK licence**, so it
  ships only as a separately licensed component next to GameLib, never linked into GPL code.
  *(043)*
- Build `lsteamclient.so` against the configured CrossOver source drop for the exact runner it
  loads into. It must be unsigned on x86_64. It ships as an on-demand release asset, never inside
  the signed `.app`, because a codesigned Wine builtin does not load (see
  `macos-steam-bridge.md`, Phase 56). *(043)*

### 4. The DIPC responder (CEG start request; also part of the steam_helper env)

The protocol, byte-for-byte what Proton's `steam_drm_thread` answers (035):

- The game creates semaphores `STEAM_DIPC_CONSUME` (0/512) and `SREAM_DIPC_PRODUCE` (1/512).
  The `SREAM` typo is real; keep it.
- It creates `STEAM_START_ACK_EVENT_<pid>_<n>` and `STEAM_TERM_EVENT_<pid>_<n>`, writes
  `<exe>.<pid>.STEAMSTART`, releases CONSUME, and waits **30 s** on the ACK event.
- The responder waits on CONSUME, finds the ACK event in `\BaseNamedObjects\Session\1` (the same
  directory under CrossOver), signals it, and releases PRODUCE.

```c
HANDLE consume = CreateSemaphoreW(NULL, 0, 512, L"STEAM_DIPC_CONSUME");
HANDLE produce = CreateSemaphoreW(NULL, 1, 512, L"SREAM_DIPC_PRODUCE");
/* ... after WaitForSingleObject(consume): enumerate the directory, then: */
ret = OpenEventW(SYNCHRONIZE | EVENT_MODIFY_STATE, FALSE, di->ObjectName.Buffer);
SetEvent(ret);
ReleaseSemaphore(produce, 1, NULL);
```

**The access mask must include `EVENT_MODIFY_STATE` (0x2), giving `0x100002`.** NotProton 1.2.1
opens the event with `SYNCHRONIZE` only (`steam.cpp:1708` @ `b2f49e4`), so `SetEvent` fails with
`ERROR_ACCESS_DENIED` and the game times out at 30 s. Proton (`steam.c:848`) and genuine Windows
Steam use `0x100002`. The fix was submitted upstream as NotProtonNot/NotProton#260. Check
`SetEvent`'s return value; NotProton ignores it. *(044)*

A correct ACK does **not** clear CEG on the Mac side. The game exits 0 within milliseconds of it
(036, 044). The responder belongs in the `steam_helper` environment for completeness, but it is
not a CEG fix.

## What to Avoid

- **Don't keep spiking the CEG start handshake.** The line is closed (045). After 035–037 and 044
  it is known that a correct ACK, the complete genuine Steam launch env, `ValvePlatformMutex`,
  STEAMSTART relaunch, a registered `SteamClientDll`, the full Proton `steam_helper` environment
  and a genuine client in the slot **all** still end in exit 0. Under genuine Windows Steam the
  same request continues into `ActiveProcess\SteamClientDll`'s `steamclient.dll` and on to the
  menu (036 o5). Nothing on the Mac side provides that servicing. *(036, 037, 044)*
- **Don't build a forwarding `steamclient64.dll` for SteamStub.** 038 proposed it and 039 built
  one, a 30-line DLL returning the shim's `SteamInternal_CreateInterface`. 040/041 then showed the
  stub rejects **any** non-genuine file before an interface call matters ("Application load
  error 3:0000065432" after reading all 186,368 bytes). 039's "make the generated `SteamClient017`
  forward" idea is moot for SteamStub. **038/039 are reversed by 040/041; 044 is the route.**
- **Don't register the genuine Windows client without a trampoline.** It passes the file check
  but then looks for `Steam3Master_SharedMemLock` (Windows `steam.exe` shared-memory IPC), finds
  nothing, falls back to `steam://run/<appid>//` and exits about 0.7 s later. Answering
  `Steam3Master` from GameLib would be a forbidden stand-in. *(041)*
- **Don't create `HKLM\Software\Valve\Steam` in a bridge bottle.** With it present, CEG reads
  `InstallPath` and runs `steam.exe -applaunch <appid>` instead of DIPC. *(036 o1, 037)*
- **Don't route ordinary (non-`.bind`) titles through `lsteamclient`.** It ties every title to a
  per-CrossOver-build binary patch, the most fragile part of NotProton. The TCP bridge needs a
  stock runtime. *(043)*
- **Don't adopt NotProton's Steam-side half.** It inserts `DYLD_INSERT_LIBRARIES` into
  `Steam.app`'s Info.plist, ad-hoc re-signs Steam and hooks `steamclient.dylib` by per-build byte
  signatures, all to enable Steam Play UI. GameLib is already the launcher and needs only the
  game-side half. *(043)*
- **Never modify the user's CrossOver in place.** Patch a clone, as NotProton does under
  `~/Library/Application Support/notproton/runners/`. *(043)*
- **Never commit a `.STEAMSTART` file.** It holds the launching process's **entire environment
  block**. Gitignore it, and redact identity values from any committed env evidence. *(035, 036)*
- **Never commit a whole-library census.** `results.json` lists the operator's library and this
  is a public repo. Only the CEG-title subset (`macarch.json`) is committed. *(045)*

## Constraints

- **CrossOver `bin/wineserver` ignores `CX_BOTTLE`.** `CX_BOTTLE=<b> wineserver -k` kills nothing.
  Use `WINEPREFIX="$HOME/Library/Application Support/CrossOver/Bottles/<b>" wineserver -k`. A
  stale bottled Steam survived "cleanup" this way and swallowed later `-applaunch` runs. *(036)*
- **CrossOver's `bin/wine` ignores `WINEDEBUG`.** Use `--cx-log <file> --debugmsg <channels>`
  (`+sync,+reg,+file` named the CEG handshake). NotProton's runner does honour `WINEDEBUG` in
  Steam launch options. *(035, 044)*
- **Failure signatures:**

  | route                                      | what you see                                                  |
  | ------------------------------------------ | ------------------------------------------------------------- |
  | CEG, no responder                          | `STEAMSTART` written, 30 s idle, exit, no `HELLO`             |
  | CEG, ACK accepted                          | exit 0 a few ms after the ACK                                 |
  | CEG, ACK with `SYNCHRONIZE`-only handle    | `SetEvent` → error 5, `0x102` timeout at 30 s                 |
  | SteamStub, no client registered            | `ShellExecute("steam://run/<appid>//")`, silent exit at ~2 s  |
  | SteamStub, NULL interfaces / shim proxies  | exit 53 / exit 51                                             |
  | SteamStub, non-genuine client file         | `MessageBoxA("Application load error 3:0000065432")`          |
  | SteamStub, genuine client, no trampoline   | `Steam3Master_SharedMemLock` not found → `steam://run`, ~0.7 s |

- **The steamclient-layer route is per-build fragile in one place: the `ntdll` patch.** Patch
  sites are derived per CrossOver build (NotProton's `resolve.py`, mirroring `WINE_MODREF` offsets
  `0x30`/`0x60`/`0x68`). Every CrossOver release needs them re-derived. Record tested CrossOver
  versions and warn on untested ones. *(043)*
- **The census has blind spots.** DLC and extra depots (`dlcappid`, language depots) are skipped.
  XCOM: Enemy Within's CEG `XComEW.exe` is in one and was caught only through its base title. Only
  the public branch is read, and Icarus 1149460 is unread (AccessDenied depot key). *(045)*
- **Open, untested:** what exactly SteamStub's file check accepts (any Valve signature? would a
  Valve-built `lsteamclient` pass?). This only matters if Valve ships a signed macOS-bridge
  client. *(041)*

## Origin

| spike | verdict     | finding                                                                                                                                                 |
| ----- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 035   | VALIDATED   | CEG's pre-init handshake named (DIPC semaphores, ACK/TERM events, `STEAMSTART`, 30 s wait). It is exactly Proton's `steam_drm_thread` protocol.          |
| 036   | PARTIAL     | A Proton-style responder's ACK is accepted, but the game exits 0. Under genuine Windows Steam it continues. Env, shim and relaunch are ruled out.          |
| 037   | INVALIDATED | A registered probe `SteamClientDll` is never loaded. Continuation needs Windows Steam's servicing, so CEG → bottled Steam is justified.                   |
| 038   | PARTIAL     | SteamStub loads `SteamClientDll64` and asks for `SteamClient017`/`014`. A forwarding client looked plausible. **Reversed by 040/041.**                    |
| 039   | PARTIAL     | The forwarder plumbing works, but the shim's `SteamClient017` doesn't forward (exit 51). **Moot after 040/041.**                                          |
| 040   | INVALIDATED | Static: the check reads and rejects the client _file_. Its "ship genuine DLL" exclusion was **later narrowed by the 2026-10-27 fetch ruling**.            |
| 041   | INVALIDATED | Live: the genuine client passes the file check, then needs `Steam3Master` (Windows Steam). **Superseded by 043/044's trampoline.**                       |
| 043   | PARTIAL     | NotProton is Proton's genuine client + loader trampoline + `lsteamclient` + Mac `steamclient.dylib`. It obsoletes 004a's "lsteamclient blocked".          |
| 044   | PARTIAL     | Live: SteamStub cleared (Grim Dawn menu, init unverified). CEG not cleared: NotProton ACK-mask bug, and the correct ACK still exits 0.                     |
| 045   | VALIDATED   | CEG is in 6 of 389 owned games; 3 reach it on Apple silicon (i386 Mac builds). The CEG line closes and bottled Steam is its permanent answer.            |

Sources: `sources/035-xcom-ceg-handshake-trace/` through `sources/045-ceg-census/` (ten spikes;
excluding 042). Key code: `036-proton-style-dipc-responder/dipc_responder.c` (Proton-style
responder + `ActiveProcess` registry), `044-notproton-drm-live/ack_watch.c` (ACK-mask
instrument), `040-steamstub-launch-check-static/decode_bind.py` (read-only header decode),
`045-ceg-census/census.mjs` + `macarch.mjs`, `039-steamstub-forwarding-client/steamclient_fwd.c`
(the forwarder, kept as a record of a reversed approach).
