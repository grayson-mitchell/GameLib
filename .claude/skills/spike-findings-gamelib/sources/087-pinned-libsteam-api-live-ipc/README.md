---
spike: 087
name: pinned-libsteam-api-live-ipc
type: standard
validates: "Given the live signed-in Mac Steam client, when a native process dlopens a pinned libsteam_api.dylib from outside the Steam tree (an older SDK build, not the client's own copy), then InitFlat, identity, manual-dispatch callbacks and a call result all work exactly as with the client copy"
verdict: VALIDATED
related: [005a, 005b, 089, 088]
tags: [steam, macos, bridge, libsteam_api, pinning, ipc, manual-dispatch, codesign, sdk-version]
---

# Spike 087: Pinned libsteam_api.dylib against the live Mac Steam client

## What This Validates

Given the live, signed-in Mac Steam client, when a native arm64 process (not launched by Steam)
dlopens a **pinned** `libsteam_api.dylib` copied out of the Steam tree, then `SteamAPI_InitFlat`,
the identity reads, manual-dispatch callbacks and an async call result
(`RequestUserStats` → 703 → `GetAPICallResult` 1101) all behave as they do with the client copy.

Origin: todo `2026-11-13-pin-bridge-libsteam-api-dylib` (option 3 deferred from quick 261113-n39,
after the Nov 10 client update dropped `SteamAPI_SteamUser_v023`).

## Research

No external docs needed: the question is about the behaviour of the running client. The prior art is
spike 005a, which proved a native helper can init against the live client using the client's own
copy. Local inventory of genuine copies on this Mac (`mdfind` misses them; `find` under
`~/Library/Application Support/Steam`):

| Copy | Arch | SteamUser | Friends | InitFlat | ManualDispatch | Signed by |
|------|------|-----------|---------|----------|----------------|-----------|
| Steam client (`Steam Helper.app`, 2026-11-13) | x86_64 arm64 | v024 | v018 | ✓ | ✓ | Valve, `MXGJJ98X76` |
| Baldur's Gate II EE | x86_64 arm64 | v023 | v018 | ✓ | ✓ | developer, `N4GL926464` |
| World of Goo | x86_64 arm64 | v023 | v017 | ✓ | ✓ | developer, `SFWNMWJGQC` |
| DREDGE (`steam_api.bundle`) | x86_64 arm64 | v021 | v017 | ✗ (legacy `SteamAPI_Init`) | ✓ | developer, `ZB66966UZP`, runtime flag |
| ADOM | i386 x86_64 | — (pre-flat) | — | ✗ | ✗ | Valve, `MXGJJ98X76` |
| Avadon ×2, Civ V, Outlast, Metro LL, BioShock Inf., Californium | i386/x86_64 | — (pre-flat) | — | ✗ | ✗ | mixed / unsigned |

Every arm64, flat-API game copy was **re-signed by the game's developer**. The only Valve-signed,
arm64, InitFlat-era copy on this machine is the Steam client's own. ADOM shows that Valve signs the
SDK redistributable as shipped (team `MXGJJ98X76`), and that unmodified redist copies survive in some
games.

## How to Run

```bash
clang -arch arm64 -O2 -Wall -o harness harness.c
# stage copies (gitignored) into pinned/  — see Investigation Trail for the cp lines
open -a Steam         # must be running AND signed in
./run.sh              # APPID=480 default; APPID=257350 ./run.sh for a real owned app
```

## What to Expect

One JSON line per dylib in `results-app*.jsonl`, `"ok":true` for every InitFlat-era pin, and the same
real SteamID64 / AppID / 1101 result for each.

## Investigation Trail

1. **First run: every copy failed, the client copy included**, with
   `ipcserver GetSteamPath failed … Could not determine Steam client install directory`. Cause: only
   a stale `ipcserver` was alive, and `steam_osx` was not running. Because the client copy failed the
   same way, that run served as the negative control: a pinned dylib does not find Steam by any
   other route. It needs a running client exactly as the client copy does.
2. **Same run: DREDGE's copy is rejected by dyld** with `code signature invalid … (errno=1)` once it
   is copied out. `codesign -v` says `invalid Info.plist (plist or signature have been modified)`. Its
   signature was sealed as the main binary of `steam_api.bundle`, so it binds the bundle's
   Info.plist, and lifted out of the bundle it no longer validates. It is valid on disk in place.
   Lesson: **a pinned dylib must be a standalone-signed Mach-O, or be re-signed.**
3. **Launched Steam** (`open -a Steam`; connection log `Logged On` 21:01:04 local). Re-ran:
   **client v024, BG2EE v023 and World of Goo v023 all pass for AppID 480 and AppID 257350**:
   InitFlat 0, BLoggedOn 1, the same real SteamID64, persona present (length only; not logged, for
   privacy), `GetAppID` matches, `BIsSubscribed` 1, `english`, manual-dispatch pipe 1, and the
   `RequestUserStats` round trip delivers our 703, then `GetAPICallResult(1101)` with `eResult=1` and a
   matching user. Latency 270–530 ms on the pins and 310 ms on the client copy: no difference.
4. **Edge case, the oldest pin:** DREDGE v021 re-signed ad hoc (`codesign -fs -`) loads, inits through
   legacy `SteamAPI_Init` (it has no InitFlat), and passes the full suite too. The live client
   accepts IPC from an SDK build roughly three years old. This is the todo's premise ("the client
   must keep serving old SDKs because shipped games bundle them"), now observed.
5. **The cost: symbol coverage.** I extracted every flat symbol the real helper dlsym's (192 names from
   `bridge_dispatch.h` + `helper/*`; `needed-symbols.txt`) and diffed them against each copy's exports:

   | Copy | Missing from the helper's needs |
   |------|------|
   | client v024 | none (`SteamAPI_Init` is only a name in a log list) |
   | BG2EE / WoG v023 | `ISteamMatchmakingServers_ServerFriends`, **and the accessor is `SteamMatchmakingServers_v002`**, below the dispatch probe's floor (v019..**v003**), so the whole server-browser interface goes MISSING |
   | DREDGE v021 | the above + `GetAuthTicketForWebApi`, `ConfigureConnectionLanes`, `GetConnectionRealTimeStatus`, `InitFlat` |

   The other direction matters too. The Nov 13 client copy **dropped** exports the v023 build had:
   `ISteamUser_InitiateGameConnection_DEPRECATED`, `TerminateGameConnection_DEPRECATED`,
   `ISteamUtils_IsSteamRunningOnSteamDeck` and four GameServer methods. The bridge uses none of them
   today, but this is exactly the client-update breakage class the todo is about.

## Results

**VALIDATED.** The live Mac Steam client serves a pinned, older `libsteam_api.dylib`, loaded from
outside the Steam tree, identically to its own copy on every surface the helper uses: init, the
identity reads, manual dispatch, and a call result. Accessor versions differ (v023/v010/v008 vs
v024/v011/v009), and the helper's runtime probe (261113-n39) already absorbs that.

Signal for the build:

- **The pin must match the SDK the dispatch table is generated from, not "any old genuine build".**
  The generated dispatch covers `SteamMatchMakingServers003` (and v024-era methods). A v023 pin
  silently loses the server browser. So the right pin today is **the Nov 13 2026 client build itself**
  (sha256 `247fca03…b659`, SteamUser v024, MMS v003). Bump the pin and regenerate the dispatch together.
- **A pinned dylib must be standalone-signed.** A dylib lifted out of a `.bundle` fails dyld's
  signature check. Re-signing ad hoc works for an unhardened helper (089 covers shipping).
- The helper is ad-hoc, linker-signed and has **no hardened runtime**, so library validation does not
  apply today. Pinning does not change what the helper may load.
- Not covered here (088): the overlay and in-game callbacks with a real bridged game.
