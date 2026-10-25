# Quick 261025-t7i: Legacy CSteamworks exports + old interface versions (Unclaimed World 284100) - Research

**Researched:** 2026-10-25
**Domain:** steam-bridge x64 shim (meta/gen_vtables.ts), coverage gate, depot restore, live evidence
**Confidence:** HIGH for the measurements, MEDIUM for the restore route and runtime behaviour after init

## Summary

The todo is stale in two ways that matter. (1) 53-04's `LIFECYCLE_NOOP_SPECS` already ships 6 of
the 12 legacy names on x64, so the **x64 gap is 6 exports, not 12**. (2) The 14-version list in the
todo was read from the **x86** `CSteamworks.dll`, which is an older SDK build. The x64
`CSteamworks64.dll` that actually loads is Steamworks.NET 7.0.0 / **SDK 1.34**, and it requests a
different set of versions. Ten of them must be added.

There are two hidden blockers the todo does not mention. First, `SteamClient()` only returns an
object when `gamelib_bridge.cfg` pins `iface.SteamClient=…`. That pin can only come from the
**original** `steam_api64.dll`: the importer has no `SteamClient0NN` string, the persisted verdict
has `interfaceVersions: {}`, and the bottle cfg has no `iface.` lines. So without step 5 (restore),
the exports alone make init return false (offline, no crash) but never verify the title. Second,
once the original is restored, the j4l guard **withholds** the shim. Ten requested versions sit in
families the x64 shim half-serves, so they count as "unservable". All three parts (exports,
versions, restore) are needed for the bridge to engage.

Third, under the census rule from 53-11 (CALL-only evidence needs 2 or more game CALLs, at least one
of them an identity call), **284100 cannot reach `verified` even when everything works**. The game
uses only `SteamUserStats` and `SteamUtils`, and never calls `GetSteamID`, `BLoggedOn` or
`GetPersonaName`. This needs a user decision. It is the same kind of call as D-53-15.

**Primary recommendation:** do it as one quick task with 3 tasks. Task 1 is generator work: the 6
x64 exports plus the 10 manifests, regenerated and rebuilt. Task 2 restores the originals by an
operator step from the depot. Task 3 is the live check plus the census-rule question. x86 is
deferred.

## Project Constraints (from CLAUDE.md / skills)

- D-09: manifests are GameLib-authored factual inventories, never vendored Valve header text. The
  accepted source is `proton-lsteamclient` at pinned SHA `2c620c0fd7c2c424f6bd91898602bdc4d4260468`
  (meta/extractProtonInventory.ts:1-8, :54). D-53-03: each version is extracted from its own Proton
  VTABLE block and never aliased from a neighbour.
- `<verify>` blocks: `npx prettier --check <exact paths>`, scoped. Check `--file-info` first. The
  `native/steam-bridge/generated/*` files are probably prettier-ignored; if so, say that.
- New todo files carry `severity:`, `platform:`, `ready:` (bare, lowercase, in that order).
- UAT items: `### N.` at col 0, `expected:` inline, `result:` opens with a status word.
- Memory: `tauri dev` does not rebuild the sidecar. Restart dev and check the `sidecar.js` mtime
  before live-testing. "Verified" is strict: HELLO plus game evidence. In-Game never counts.
- Bottled Steam is a narrow fallback. Do not reroute 284100 to bottled Steam.

## Q1. Current gap, measured on the built shims (public/bin/arm64/darwin/, 2026-10-25 15:57)

Method: `/usr/bin/objdump -p` (Apple LLVM 21 reads PE). I diffed the shim export tables against the
`steam_api*.dll` import descriptors of the game's wrappers. x64 shim: 1012 exports. x86 shim: 45.

| Importer → shim | Imports | Missing now |
|---|---|---|
| `CSteamworks64.dll` → `steam_api64.dll` | 29 | **6**: `SteamAPI_InitSafe`, `SteamGameServer_InitSafe`, `Steam_RunCallbacks`, `Steam_RegisterInterfaceFuncs`, `Steam_GetHSteamUserCurrent`, `g_pSteamClientGameServer` |
| `CSteamworks.dll` → `steam_api.dll` | 31 | **17** (unchanged from the todo): the 6 above + `GetSteamInstallPath`, `SetBreakpadAppID`, `SetMiniDumpComment`, `SetTryCatchCallbacks`, `UseBreakpadCrashHandler`, `WriteMiniDump`, `SteamAPI_GetHSteamUser/Pipe`, `SteamClient`, `VR_Init`, `VR_Shutdown` |

The breakpad, minidump, `GetSteamInstallPath` and `SetTryCatchCallbacks` names are already x64
no-ops in `LIFECYCLE_NOOP_SPECS` (meta/gen_vtables.ts:695-750). `SteamClient`,
`SteamAPI_GetHSteamUser` and `SteamAPI_GetHSteamPipe` are already exported on x64
(MODERN_LOOKUP_FLAT_EXPORTS :860-871; bare accessor `SteamClient()` → `resolve_bare_iface`, see
generated `steam_api_shim.c:20093`).

## Q2. Requested versions vs served (x64 is the arch that matters)

The x64 set comes from the `CSteamworks64.dll` context-init routine (RVA 0x1000). That routine
calls `SteamClient()->GetISteamXxx(...)` for **22 versions** and **NULL-checks every one**: any
NULL makes init false. I resolved the strings at .rdata 0x15d78–0x16018 and checked them against
`SHIM64_SERVED_INTERFACE_VERSIONS` (shimCoverage.ts:233-339).

| Requested (x64) | Served on x64? | Nearest served | Proton pinned block | Delta vs nearest (method names) |
|---|---|---|---|---|
| SteamUser018 | no | 019 | yes, 25 slots | 019 appends 4 (BIsPhoneVerified, BIsTwoFactorEnabled, BIsPhoneIdentifying, BIsPhoneRequiringVerification) |
| SteamUtils007 | no | 008 | yes, 26 | 008 appends IsSteamInBigPictureMode, StartVRDashboard |
| STEAMAPPS…007 | no | 008 | yes, 24 | 008 adds 9 |
| STEAMREMOTESTORAGE…012 | no | 013 | yes, 52 | 013 adds FileWriteAsync/FileReadAsync/FileReadAsyncComplete |
| STEAMUGC…007 | no | 010 | yes, 58 | 010 adds 16 |
| STEAMHTTP…002 | no | 003 | yes, 25 | same names; signatures must still come from 002's own block |
| STEAMSCREENSHOTS…002 | no | 003 | yes, 7 | 003 adds 2 |
| STEAMHTMLSURFACE…_003 | no | _005 | yes, 36 | 005 adds 2 |
| STEAMINVENTORY_INTERFACE_V001 | no | V003 | yes, 24 | V003 adds 14 |
| STEAMVIDEO_INTERFACE_V001 | no | V002 | yes, 2 | V002 adds 2 |
| STEAMUNIFIEDMESSAGES…001 | no | none in family | yes, 5 | family unserved, so the null object applies; not needed |
| STEAMCONTROLLER_INTERFACE_VERSION | no | — | yes, 6 | no digits, so `VERSION_STRING_PATTERN` (interfaceVersions.ts:28) never requires it; the null object applies |
| SteamFriends015, UserStats011, MatchMaking009, MatchMakingServers002, Networking005, AppList001, Music001, MusicRemote001, GameServer012, GameServerStats001 | **yes** | — | — | — |

So **10 manifests are required** (the first 10 rows). This is not because the runtime needs them:
`emitSteamClientVersionLookupStub` (gen_vtables.ts:1286-1313) hands the x64 null object to any
unknown version on the vtable path, so init would succeed anyway. They are needed because
`findUnservableInterfaceVersions` (shimCoverage.ts:548-583) treats a version in a **half-served
family** as unservable (Pitfall 4). With importer evidence and a restored original on disk, j4l
then **withholds** the shim (shimGenerate.ts:1198-1221).

Provenance: every version has its own `__ASM_VTABLE(winI<Family>_<Version>, …)` block at the
pinned Proton SHA. I verified this by fetching all 15 `lsteamclient/winI*.c` files this session.
The existing tool does the extraction:
`pnpm extract-proton-inventory --versions <list>`. It needs one
`meta/sdk/acceptance-interface-versions.json` entry per version
(`{family, arches:['x64'], titles:['284100']}`, extractProtonInventory.ts:711-716). It assigns
append-only ordinals, applies wire-policy.json (so `SteamUtils007.GetAppID` and
`SteamUser018.GetSteamID/BLoggedOn` come out `wire`, and GetAuthSessionTicket gets
`helperTrailingNullArgs` from `helperNativeArgs`), and runs prettier. After that, add the 10 rows to
`SHIM64_SERVED_INTERFACE_VERSIONS`. Mode is `wire` for User018 and Utils007 and `stub` for the
rest, following the 53-12 rule ("'wire' only where the manifest carries a wire method").

**SteamClient layout:** `CSteamworks64` calls slots 0x28 (GetISteamUser, 3 args), 0x48
(GetISteamUtils, 2 args), 0x68, 0x78 … 0x118 (GetISteamVideo). Those offsets match
**SteamClient017** slot for slot (Proton 017 block, slots 5…35), and 017 is already served `wire` on
x64. The only difference is 017's slot 36 (GetISteamParentalSettings), which comes after everything
the wrapper calls. **HIGH confidence.**

The x86 `CSteamworks.dll` is SDK ~1.30 (SteamUser017, Friends014, Apps006, UGC002). It also needs
SteamClient015 on x86, and no x86 SteamClient manifest exists. Defer it (Q4).

## Q3. Steamworks.NET.dll and what the game actually calls

- `Steamworks.NET.dll` is managed, AssemblyVersion **7.0.0**. Release 7.0.0 (2015-09-01) is
  "Updated to Steamworks SDK 1.34" (GitHub releases API). Its P/Invokes target `CSteamworks` /
  `CSteamworks64`, never `steam_api`, so the D-53-04 managed scan does not apply to it. It does
  not name versions. The versions are baked into CSteamworks64's context init (Q2).
- `UnclaimedWorld.exe` (PE32, CLR flags 0x1: ILONLY only, so x64 under D-53-10) references only
  these Steamworks types: `SteamAPI`, `SteamClient`, `SteamUtils`, `SteamUserStats`, `AppId_t`,
  `UserStatsReceived_t`, `UserStatsStored_t`, `UserAchievementStored_t`, `Callback\`1`, `DllCheck`,
  `Packsize`. Its member names: `Init`, `RunCallbacks`, `Shutdown`, `SetWarningMessageHook`,
  `GetAppID`, `RequestCurrentStats`, `GetAchievement`, `SetAchievement`, `StoreStats`. There is
  **no** `SteamUser`, `SteamFriends`, `GetSteamID` or `GetPersonaName`.
- A minimal runtime subset would be InitSafe + SteamClient017 + UserStats011 (served, wire) +
  Utils007. The coverage gate still forces all 10 (Q2).
- Callbacks: CSteamworks' `Steam_BGetCallback2` (RVA 0x19f0) does
  `GetModuleHandleA("steamclient64.dll")`. If that fails it prints `[CSteamworks] GetModuleHandleA
  failed…` and **returns false**: NULL-safe, no crash, but no `UserStatsReceived_t` is delivered.
  No steamclient64.dll is in the bottle. That is acceptable for single-player and matches the
  existing no-op `SteamAPI_RunCallbacks`. Expect stderr spam once per frame.

## Q4. Mapping the legacy exports (x64; Win64 is caller-cleans, so `(void)` bodies are arity-safe, per the comment at gen_vtables.ts:626-640)

| Export | Body | Notes |
|---|---|---|
| `SteamAPI_InitSafe` | same as `SteamAPI_Init` (`gamelib_bridge_hello()`), but report **`GAMELIB_INIT_FN` code 2** | helper already names code 2 `SteamAPI_InitSafe` (bridge_helper.c:574-576). Census GINIT regex accepts it (bridgeCensus.ts:934). Add `#define GAMELIB_INIT_FN_STEAMAPI_INITSAFE 2` beside :2305. Do NOT call `SteamAPI_Init()`: that would double-report (the D-53-15 "exactly one report" note at :903) |
| `SteamGameServer_InitSafe` | `return 0` | same as `SteamGameServer_Init` (game-server mode is unsupported) |
| `Steam_RunCallbacks` | no-op | old `(HSteamPipe, bool)`; same as `SteamAPI_RunCallbacks` |
| `Steam_RegisterInterfaceFuncs` | no-op | `(void *hModule)` |
| `Steam_GetHSteamUserCurrent` | `return 1` | same constant as `SteamAPI_GetHSteamUser` (:895) |
| `g_pSteamClientGameServer` | `void *g_pSteamClientGameServer = NULL;` exported as data | it is read only after a successful `SteamGameServer_InitSafe`, which never happens. `defExportNames` has no DATA support today (:3622-3650). Emit the name in the export list. Optionally append ` DATA` only in the .def text. DATA affects the import library only, not the DLL export table [ASSUMED]. Verify with `objdump -p` on the built shim |

Disassembly confirms the call shape. CSteamworks64 `InitSafe` (RVA 0x17d0) does: call
`SteamAPI_InitSafe`; if false, return false. Then call `SteamClient()`; if NULL, return false.
Otherwise run the context init (Q2). The todo's backtrace `csteamworks64+0x17da` is the
instruction right after that first call.

Put these 6 names in an x64-only list (beside `LIFECYCLE_NOOP_SPECS` / `MODERN_LOOKUP`). They must
then appear in `shimExports.generated.ts` and in the export-set stamp (`shimExportSetVersion`
changes, so persisted verdicts re-judge).

**x86: defer, with the count attached.** 284100 launches x64 (CLR flags 0x1, no
32BITREQUIRED/32BITPREFERRED, D-53-10 as amended). The 2026-10-24 reach census found no other
installed CSteamworks title. That makes **0 titles whose launch arch is x86 and need these
exports**. Exporting the 6 on x86 alone would not make `CSteamworks.dll` loadable: it also needs
`SteamClient`, `GetHSteamUser/Pipe` and `VR_*`, plus an x86 SteamClient015 object. That is the
x86-parity decision D-53-09 / D-51-13 deferred (gen_vtables.ts:850-857).

## Q5. Restoring the originals (step 5)

- Today there is **no repair path**. `SteamGame.repair()` is a stub (games.ts:3357-3363). The
  "Verify integrity" hint at shimGenerate.ts:628 points at a feature that bridge bottles do not
  have.
- The building blocks exist. `buildDepotPlan(appId, {os:'windows', targetSteamappsDir,
  installdir})` (depot.ts:763) returns every depot file. `screenDepotPlanForSteamApi`
  (depot.ts:979-1000) already matches `steam_api(64).dll` by Windows basename.
  `downloadDepotFiles(plan, opts)` (depot.ts:2860) runs `reconcilePartialState` first: a file of
  the wrong size becomes a job and is re-downloaded with SHA1 verification (reconcile.ts:170-214).
  The shim is 497664 bytes, so the size never matches the original. `downloadSharedRedistDepots`
  (depot.ts:1273-1365) is the precedent for a filtered sub-plan through
  `downloadDepotFiles` without `finalizeToSteam`.
- Bottle facts: ACF `appmanifest_284100.acf` has installdir `Unclaimed World`, buildid 1644139,
  and a single depot **284101**, manifest **3159369609451446961**.
- **Recommended for this task (operator, zero product code):** in the signed-in Mac Steam console
  (`steam://open/console`), run `download_depot 284100 284101 3159369609451446961` [ASSUMED: works
  for a Windows depot from the Mac client]. Copy `steam_api64.dll` and `steam_api.dll` from the
  `…/steamapps/content/app_284100/depot_284101/` output over the shims in the game folder. On the
  next launch, `placeShimForGame` reads the versions from the restored original
  (shimGenerate.ts:1160-1164) and `backupOriginalBeforeOverwrite` (:221-251) creates
  `.gamelib-orig` itself. Do not write `.gamelib-orig` by hand.
  Fallback, if the console route fails: a small `restoreDepotFilesByName(appId, {targetSteamappsDir,
  installdir, names})` in depot.ts = buildDepotPlan → keep only files whose basename is in
  `names` **and whose on-disk copy is a GameLib shim** (`isGameLibShimBytes`) → `downloadDepotFiles`.
  It is unit-testable with an injected `downloadFiles`, like the redist test.
- **Pre-launch check after the restore (cheap, decisive):** run `strings` on the restored
  `steam_api64.dll` and expect exactly one `SteamClient0NN`, namely **SteamClient017**. Valve's
  old DLLs carry one (Avernum 4 `SteamClient011`, XCOM `SteamClient012`, AoD 230070
  `SteamClient017`; measured this session). Also confirm that the version pool adds no other
  unserved, half-served version.
- **Follow-up todo (do not do it here):** 12 bridge bottles / 15 placed shims have **no
  `.gamelib-orig`** (1167950, 1284190, 1603180, 1691190, 1782460, 206060, 219990, 230070, 284100,
  3410180, 411300, 648800). Auto-restoring them changes the verdict source for already-verified
  titles. It needs its own decision.

## Q6. Live-check plan and what "verified" means for 284100

- Class: MonoGame, so `detectEngine` returns `'unknown'` (bridgeCensus.ts:762-786), and the import
  set is not init-only. That means the CALL rule applies (bridgeCensus.ts:1005-1024, tightened in
  53-11): **HELLO + ≥2 distinct game-originated CALLs, ≥1 of them an identity call
  (`SteamUser*.GetSteamID|BLoggedOn`, `SteamFriends*.GetPersonaName`) + no NOVER**.
- Expected evidence once all three parts land: HELLO; `GINIT fn=SteamAPI_InitSafe ok=1`;
  `CALL STEAMUSERSTATS_INTERFACE_VERSION011.RequestCurrentStats` (+ `GetAchievement`); and
  `SteamUtils007.GetAppID` if the game reads it. No NOVER is expected, because CSteamworks uses the
  vtable path. **No identity call**, because the game never makes one (Q3). The census will print
  `N game calls; needs 2 incl. identity` → `unverified`.
- **User decision needed:** extend the rule for titles whose measured managed surface has no
  identity method, as D-53-15 did for init-only titles. Otherwise 284100 stays `unverified`, kept
  in the denominator, and is reported honestly. Do not relax the rule inside this task without that
  decision.
- UAT item (shape rule): `expected:` HELLO + GINIT InitSafe ok=1 + game CALLs on
  UserStats011, no Wine `unimplemented function` crash, no NOVER; `result:` opens with a status
  word. In-Game never counts.

## Common Pitfalls

1. **Restoring the originals before the code lands.** Coverage is not clean yet, so j4l withholds
   and the game runs offline on its own DLL. Ship Task 1 first, then restore, then launch.
2. **Aliasing 018→019 or 002→003.** Forbidden by D-53-03. HTTP002/003 share names but must come
   from their own blocks.
3. **Making `InitSafe` call `SteamAPI_Init()`.** Two GINIT reports. Use the shared hello helper
   and report code 2.
4. **A stale sidecar or shim in the live test.** Restart `tauri dev` and check the shim
   size/mtime in the bottle. The bottle copy (497664 B, 14:21) is already older than the built
   copy (498176 B, 15:57).
5. **Reading the todo's 14-version list as the x64 target.** That list is the x86 wrapper's.

## Validation Architecture

- Framework: Jest. Generator tests: `meta/__tests__/gen_vtables.test.ts` and
  `meta/__tests__/extractProtonInventory.test.ts`. Coverage tests:
  `src/backend/storeManagers/steam/bridge/__tests__/`.
- Per task: `pnpm gen-vtables && pnpm build-steam-bridge`. Then run `objdump -p` on
  `public/bin/arm64/darwin/steam_api64.dll` and re-run the Q1 diff against CSteamworks64.dll
  imports (expect 0 missing). Run the jest suites for gen_vtables, shimCoverage and
  extractProtonInventory.
- Test to add: a `findUnservableInterfaceVersions` case where x64, a CSteamworks64-style import
  set and the 22-version required map return `[]` once the 10 rows are present.
- Gate: run `pnpm bridge-census` (read-only, declared real-profile arm) after the restore and
  before launching, to see the scan's required map for 284100.

## Environment Availability

| Dependency | Available | Version |
|---|---|---|
| zig (shim build) | ✓ | 0.17.0 |
| objdump (PE dump) | ✓ | Apple LLVM 21 |
| CrossOver bottle GameLibSteamBridge-284100 | ✓ | game files are present; the steam_api*.dll are shims with no `.gamelib-orig` |
| Network to raw.githubusercontent.com (extractor) | ✓ | fetched the pinned files this session |
| Mac Steam signed in (helper, console restore) | not probed | operator |

## Assumptions Log

| # | Claim | Risk if wrong |
|---|---|---|
| A1 | The Mac Steam console `download_depot` fetches a Windows depot | Fall back to the `restoreDepotFilesByName` helper (adds code to Task 2) |
| A2 | The restored SDK-1.34 steam_api64.dll carries only `SteamClient017` and no extra unserved, half-served versions | Another manifest would be needed, or the version is ambiguous; the strings check before launch catches it |
| A3 | ` DATA` in the .def is optional for a data export from an lld-built DLL | Build error or a missing export; caught by `objdump -p` |
| A4 | No other path in CSteamworks64 dereferences `g_pSteamClientGameServer` before GameServer init | A null read; only gameserver paths reference it |

## Scope verdict

**It fits one quick task of 3 tasks**, if the restore is the operator console step:
- T1 (auto): 6 x64 exports + 10 manifests (acceptance entries → extractor → served map) → gen →
  build → the Q1 diff shows 0 missing → jest.
- T2 (checkpoint:human-action): restore the 2 originals from depot 284101; the strings check
  expects SteamClient017; run the census scan.
- T3 (checkpoint:human-verify): live launch + UAT item, plus the census-rule decision for the
  missing identity call, plus filing the "15 shims with no `.gamelib-orig`" follow-up todo.

If A1 fails, split it: this task becomes T1 + the live check that the crash is gone (HELLO,
offline, no crash), and the depot-restore helper plus verification move to a second quick task.

## Sources

- Measured this session: objdump -p / -d of the built shims, CSteamworks.dll, CSteamworks64.dll;
  strings of UnclaimedWorld.exe and Steamworks.NET.dll; CLR header flags; the bottle ACF, cfg and
  persisted verdict (`steam_metadata.json` → `284100.bridge.scan`); a survey of `.gamelib-orig`
  presence across bridge bottles.
- Proton `lsteamclient/winI*.c` @ 2c620c0fd7c2c424f6bd91898602bdc4d4260468 (VTABLE blocks, slot
  counts and orders).
- Steamworks.NET releases API: 7.0.0, 2015-09-01, "Updated to Steamworks SDK 1.34".
- Code: meta/gen_vtables.ts, meta/extractProtonInventory.ts, meta/bridgeCensus.ts,
  bridge/{shimCoverage,shimGenerate,interfaceVersions,bridgeConfig}.ts, steam/depot.ts,
  depot/reconcile.ts, helper/bridge_helper.c, 53-CONTEXT.md D-53-03/07/08/10/13/15, 53-11-PLAN.md.
