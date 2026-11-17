---
spike: 084
name: owned-apps-from-running-steam
type: standard
validates: "Given a signed-in Mac Steam, when the bridge helper reads licenses / owned apps through steamclient.dylib interfaces (located and verified at runtime as 065/067 did), then the set matches 073's parity set with no GameLib CM logon"
verdict: VALIDATED
related: [065, 066, 067, 069, 073, 077]
tags: [steam, macos, steamclient, licenses, ownership, refresh, no-cm, frontier]
---

# Spike 084: Owned apps from the running Mac Steam

## What This Validates

Given a signed-in Mac Steam, when a helper reads the account's licensed apps through
`steamclient.dylib`'s internal interfaces (slots found and checked at runtime, as in 065 and 069),
then the set matches 073's owned and licensed sets, and GameLib makes no CM logon of its own.

If this holds, a Mac Refresh can skip the signed-in CM logon altogether. That means no go-offline
wrap, no logonID juggling (077) and no Friends drop.

## Research

- **Attach chain** (065/069): `CreateInterface("CLIENTENGINE_INTERFACE_VERSION005")` →
  `CreateSteamPipe` (slot 0) → `ConnectToGlobalUser` (slot 3) → `GetIClientUser` (engine slot 8,
  RTTI `14IClientUserMap`).
- **Where the licence list lives.** OpenSteamClient's `IClientBilling` has no enumeration
  (`HasActiveLicense`, `GetLicenseInfo`, `GetAppsInPackage`, `RequestFreeLicenseForApps` only).
  `IClientUser` has `GetSubscribedApps(AppId_t *, uint32 max, bool)` and
  `BIsSubscribedApp(AppId_t)`, plus `GetSteamID` and `BLoggedOn` for the account check.
- **No header slot numbers.** This build (`steamclient.dylib` dated 2026-10-22) has 259
  `IClientUser` slots. 247 of them match OpenSteamClient's dumped method order and 12 are new, so
  dumped indices would be wrong. Instead, each slot's proxy is decoded for its IPC function ID (a
  `movz wN,#lo` / `movk wN,#hi,lsl #16` pair in the first 64 instructions), and a method is
  called only when exactly one slot carries the expected high half. Overloads share a high half
  (slots 0 and 1 are both `LogOn`, `0x3e52`), which is why uniqueness is checked.

| Method | Slot (this build) | Function-ID high half |
|---|---|---|
| `BLoggedOn` | 4 | `0x6585` |
| `GetSteamID` | 10 | `0xd6fc` |
| `BIsSubscribedApp` | 181 | `0x8d36` |
| `GetSubscribedApps` | 182 | `0x8532` |

- **Production's library rule today:** `GetOwnedGames` (390 apps) ∪ licensed apps whose PICS
  `common.type == demo` (`licensedDemos.ts:94`).

## How to Run

```sh
clang -arch arm64 -O1 -Wall -o probe probe.c
./probe scan > scan.jsonl                  # every IClientUser slot + decoded function ID
./probe whoami                             # SteamID64 + BLoggedOn
./probe owned 0 out/sub-flag0.txt          # GetSubscribedApps, flag false
./probe owned 1 out/sub-flag1.txt          # flag true
./probe check 1149460 306130 3801710 4349200 220 440 1091500 10
node types.mjs out/types.json out/steam-sub.txt out/cm-license.txt   # anonymous PICS types
```

Mac Steam must be running and signed in. The probe is read-only and makes no network calls; the
types lookup is an anonymous steam-user logon. Compare against 073's `out/rust-owned.json` and
`rust-license-appids.json` with lexically sorted `comm` (a numeric sort gives false diffs).

## What to Expect

`GetSubscribedApps` returns an array close to 073's licensed set (1,144). It should contain every
one of the 390 owned games, and `GetSteamID` should match GameLib's stored `userData.steamId`.

## Investigation Trail

1. **Slot resolution.** `scan` decoded 259 slots. The four methods each resolved uniquely. The
   RTTI guard and the `dladdr` end-of-image stop keep the vtable walk inside steamclient.
2. **`GetSubscribedApps`.** It returned 1,140 app IDs. The bool flag made no difference (both
   files are identical). With `max = 4` it still returned 1,140: the return value is the total
   count, so callers size the buffer with a first call and then fill it.
3. **Against 073** (CM, measured 2026-11-09):
   - All 390 `GetOwnedGames` apps are in Steam's set.
   - Steam's set is a strict subset of the CM-licensed set (1,144). Four apps are CM-only:

     | App | Name | Type | `BIsSubscribedApp` |
     |---|---|---|---|
     | 1149460 | ICARUS | game | 0 |
     | 306130 | The Elder Scrolls Online | game | 0 |
     | 3801710 | Wonderia Demo | demo | 0 |
     | 4349200 | Probably Stolen Demo | demo | 0 |

     The controls behaved as expected: 220, 440 and 1091500 returned 1, and the unowned 10
     returned 0.
4. **Types** (anonymous PICS) across Steam's 1,140 apps: dlc 441, game 393, tool 190, config 65,
   none 25, demo 11, music 9, application 4, beta 2. The 390 owned apps are game 385, demo 2,
   beta 2 and application 1. Steam's eight type-`game` apps that are not in `GetOwnedGames` are
   all free-to-play: 440 TF2, 570 Dota 2, 230410 Warframe, 238960 Path of Exile, 1222670 The
   Sims 4, 1467450 Archolos, 976620 Enderal and 480 Spacewar.
5. **Whose library?** `whoami` returned SteamID64 `76561197995867096` with `loggedOn 1`. That
   ID is the only entry in `loginusers.vdf` and the account GameLib reads with
   `getPersistedSteamId64()` (`user.ts:334-338`).
6. **Operator check on the two demos.** Wonderia Demo and Probably Stolen Demo **appear in
   GameLib's library but not in Steam's.** So the difference is not stale data. The CM licence
   list still carries licences that Steam itself no longer treats as subscribed (expired, revoked
   or removed). ICARUS and ESO fit the same pattern, probably as ended free-weekend licences.
   GameLib's demo rule (`licensedDemos.ts`) shows them only because it reads the raw licence
   list.

Not tested, at the operator's choice: whether a newly added licence shows up live without a Steam
restart, and Steam in Offline Mode. Signed-out and not-running behaviour was also not measured.
The probe's guards return `pipe` / `user` failures for those cases, but the actual values Steam
returns were not observed.

## Results

**VALIDATED.** A running, signed-in Mac Steam answers "which apps does this account have" with no
GameLib CM logon, and its answer is at least as correct as the CM licence list.

- `GetSubscribedApps` covers all 390 owned games. It is the CM-licensed set minus licences Steam
  no longer honours (4 of 1,144 here).
- **Steam's set is the better oracle for demos.** Two demos GameLib shows today are hidden in
  Steam's own library. Intersecting the demo rule with Steam's set (or `BIsSubscribedApp`) would
  fix that.
- **This is a superset, not `GetOwnedGames`.** It includes free-to-play games, DLC, tools, config
  and music. Filter by PICS `common.type`: `game` minus free-to-play has no local signal, so a
  Mac-only Refresh would list F2P titles the account holds free licences for. Either accept that (Steam's own
  library shows them) or keep the CM `GetOwnedGames` call for the exact owned list.
- **Names and types still need PICS.** An anonymous logon is enough; it needs no account and has
  no Friends impact.
- **Requirements for a production path:**
  - Check the account first. Call `GetSteamID` and `BLoggedOn`, and use the set only when it
    equals GameLib's stored `userData.steamId`. Otherwise fall back to the CM path.
  - Resolve slots by function ID with a uniqueness check, never by a hard-coded index (12 new
    slots on this build). Any guard failure falls back to the CM path.
  - Call twice: once to get the count, then with a buffer of that size.
  - This works on macOS only, and only while Steam is running. Windows and Linux keep the CM
    path.
