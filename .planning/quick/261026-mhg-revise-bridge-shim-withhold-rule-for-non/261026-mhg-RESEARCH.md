# Quick 261026-mhg: revise the bridge shim withhold rule for non-core interfaces - Research

**Researched:** 2026-10-26
**Domain:** Steam bridge shim placement (`shimGenerate.ts` withhold guard, `shimCoverage.ts`)
**Confidence:** HIGH (code, generated C and the live log/metadata were all read directly)

## User Constraints

- The operator chose option a on 2026-10-26: when a fresh scan of the game-original steam_api finds only non-core unservable interfaces, place the shim anyway. Withhold only when the game cannot start without the missing interfaces.
- Bottled Steam is a narrow fallback (memory note). Do not reroute anything to it as a fix.
- The strict "bridge verified" rule applies to the UAT: HELLO plus a clean Steam-init log from the game. A game-originated call counts for non-Unity titles (D-53-13). In-Game never counts.
- CLAUDE.md applies: use `graphify query` (never GRAPH_REPORT.md or graph.json), run scoped `npx prettier --check <paths>` in every `<verify>`, rebuild the sidecar (`pnpm build:sidecar`) and restart dev before a live test, and run `graphify update .` after code edits.

## Summary

The withhold decision today uses two triggers. Neither knows which interface families a game needs at startup. A third quirk then made ELEX and Age of Decadence regress. The skew rule in `findUnservableInterfaceVersions` counts an unserved version as unservable whenever the shim serves **some other version of the same family**. Later work (53-12, 261025-t7i) added stub rows for SteamController006/008, SteamUGC007/010/016/017/020, SteamTimeline001 and SteamRemotePlay001/002. That turned the families ELEX was designed around (D-51-13 null object) into "half-served" families. So SteamController003 and STEAMUGC_INTERFACE_VERSION008 now count as skew. **The shim's runtime behaviour for those versions never changed.** The native resolver matches the exact version string only and returns the null object for any miss. It never looks at whether the family is half-served. ELEX ran 188 s on 2026-10-23 (HELLO 17:19:41, stopped 17:22:49) and Age of Decadence ran about 7 minutes (HELLO 21:21:21 and 21:28:55), both with these same versions answered by the null object.

All five evidence titles withhold only on non-core families: SteamController, SteamUGC, SteamTimeline and SteamRemotePlay. All five are on the x64 runtime-lookup (null-object) path; their persisted `stubbedInterfaces` lists are non-empty. A core-family split fixes every one of them and keeps the Manor Lords protection.

**Primary recommendation:** keep `findUnservableInterfaceVersions` as it is. Add a pure classifier in `shimCoverage.ts` that splits its output into `blocking` and `nonCore`. A version is blocking if (a) its family is one of the six core startup families, or (b) the shim would answer it with NULL (not null-object-eligible). Withhold only when there is a delay-imported miss or a `blocking` entry. Send `nonCore` entries to the existing `refreshGaps` / `combinedMissing` placed-miss path. Do this in both placement branches.

## 1. How the withhold decision is made today

| Step | Where | What |
|---|---|---|
| Scan | `placeShimForGameInner` (shimGenerate.ts L775+) | Reads interface versions from the game-original dll, or from `.gamelib-orig` when the target is already a shim with a restorable backup (261026-lif). Falls back to the persisted pins only when no original exists. |
| Coverage | `resolveRequiredInterfaceVersions` (interfaceVersions.ts L375) then `evaluateShimCoverage` | `@ambiguous` / `@unknown-version` become `versionProblems`. They go into `missingSymbols` and get **no** `required` entry, so they are never checked for servability. |
| Triggers | static branch L1333-1366; runtime-loaded branch L1036-1080 | `delayMissing` (missing symbols the importer PE delay-imports) **or** `findUnservableInterfaceVersions(...)` (shimCoverage.ts L575). |
| Unservable | shimCoverage.ts L575-608 | A version that is not served AND either answered NULL (x86, no runtime lookup, or reached through a bare accessor), or null-object-eligible while the family has another served version (skew). |
| Can-withhold | `withholdIfRestorable` L709 (Phase 52-15) | Withholds only if every GameLib-shim target has a restorable `.gamelib-orig`. Otherwise it logs "cannot withhold", refreshes the shim and returns placed-miss. The static branch also requires `targetExists` (WR-11). |
| Withhold | `withhold` L729 | Restores the originals, then returns `'withheld'` with a `miss` verdict. games.ts L3071 launches directly with no helper, and logs `steamstub-unforwarded:withheld` if `drmWrapper==='steamstub'`. |

**History.** 261023-oq7 set "place anyway" for every coverage miss. 261024-j4l (Manor Lords 1363080, STATE row: "crashed at 0x0 once the shim was live") added the guard. Its UE Shipping exe delay-imported `SteamInternal_GameServer_Init` (not exported at the time) and asked for SteamFriends017 (x64 served only 015/018 then). The PLAN (§B) gives the reasons: a delay-imported miss loads fine and faults on first call, and skew hands back "a do-nothing object where a real one exists". Both gaps were present together, so the crash was never pinned to just one of them. **SteamFriends is a core family under the proposal below**, so a Manor Lords-shaped title is still withheld either way. j4l already excluded "the x64 null object for a family with no served version at all... the designed D-51-13 answer ELEX relies on". The ELEX regression is that exclusion being eroded by later served-map growth, not a deliberate choice. 261025-t7i's comment (shimCoverage.ts L351-357) documents the same trap for Unclaimed World.

## 2. What the shim does with an unservable version

From `native/steam-bridge/generated/steam_api_shim.c`:
- **x64 runtime lookup** (`SteamInternal_CreateInterface` L23949, `FindOrCreateUserInterface` L23977, `ISteamClient::GetISteam*` off the SteamStub path L6058): `resolve_iface_by_exact_version(v)`, else `&g_x64_null_object_instance`. Every one of its 256 slots is `return 0`. The answer is the same whether or not the family is half-served.
- **Bare accessor / x86:** returns NULL (CR-03). A NULL makes the old-SDK and Steamworks.NET `CSteamAPIContext::Init` fail (comment at shimCoverage.test.ts L1135), which then usually leads to an init failure or a NULL dereference.
- **Known hazard (meta/gen_vtables.ts L1508-1527, WR-03):** on MSVC x64, member functions that return a class type do so through a hidden pointer and expect RAX to hold it. The null object returns 0, so **any call to an sret slot crashes** (named examples: `ISteamController::GetDigitalActionData` / `GetAnalogActionData`). `ISteamUser::GetSteamID` returns `CSteamID`, so it is an sret slot as well `[ASSUMED: MSVC member-function UDT-return rule; not checked against the SDK headers in this session]`. That is the main reason identity families must stay core.

"Place anyway" is therefore safe exactly where a game does not call into a non-core interface at startup, or calls only scalar-returning slots. ELEX and AoD show this holds for SteamController003 and UGC008. A residual crash risk remains for titles that poll controller actions (sret). Record it, do not block on it. The persisted verdict will still name the gap (placed-miss), which keeps it visible for shim widening and the scan-miss notice.

## 3. Proposed classification

**Core startup families (blocking when unservable):** `SteamClient`, `SteamUser`, `SteamFriends`, `SteamUtils`, `SteamApps`, `SteamUserStats`.
Grounds: they are exactly the families the shim wires (`mode: 'wire'` in both served maps). The 51-26 ELEX live probe exercised them (GetSteamID, BIsSubscribedApp, GetAppID, GetPersonaName). The strict-verified criterion's identity calls live in them (Overlooting's 53-20 evidence: `SteamUser023.GetSteamID`). A null object there returns false for BIsSubscribed and AppID 0, returns NULL for persona names, and returns sret for SteamID, so the game is likely to quit or crash at startup.

**Everything else is non-core:** RemoteStorage (already a served stub: "cloud disabled"), UGC, Controller, Input, Timeline, RemotePlay, HTTP, Screenshots, MatchMaking*, Networking, GameServer*, HTMLSurface, Inventory, Video, Music*, AppList, ParentalSettings, Parties, GameSearch, UnifiedMessages, plus any unknown family.

**The NULL-answered branch stays blocking for every family** (x86, no runtime lookup, or bare accessor). A NULL from any interface fails context init, so the game cannot start. This matches option a, and no evidence title depends on it (all five are null-object-eligible).

**`@ambiguous` (including SteamClient017 vs 021): unchanged, never a trigger.** Evidence: Mining Mechs and Overlooting list `SteamClient@ambiguous(SteamClient017,SteamClient021)`, and both candidates are served `wire`. Grim Dawn lists `(017,020,023)`, but the helper logged the game's actual request as `FWD CreateInterface ver=SteamClient017` and `SteamClient014`, both served. The ambiguity comes from the Valve dll carrying several version strings, not from the game asking for an unserved one. Optional (not required for this task): drop an `@ambiguous(...)` entry from `missingSymbols` when every candidate is served. Leave it out here, because it changes notice text and verdict tests unrelated to the withhold rule.

**Outcome for the evidence:** 411300 and 230070 (Controller003, UGC008), 1603180 (Timeline004), 3410180 (RemotePlay003, Timeline004, UGC021) and 219990 (RemotePlay004, Timeline004, UGC021) all become placed-miss with the shim live. A SteamFriends016-style skew or a delay-imported miss is still withheld.

## 4. Grim Dawn route change: root cause

This is not a 261026-lif bug. It is the j4l rule running as designed, plus a timing overlap.
1. **15:54:09, launch 1:** no `.gamelib-orig` existed on any of the 3 dlls. The x64 target was a shim, so its versions came from the persisted pins. The unservable gaps were UGC021 and RemotePlay004. `withholdIfRestorable` found no backup, logged "cannot withhold", refreshed the shim and returned placed-miss, then the steamstub forwarder was placed. The game process started only at 15:57:39 because first-launch redists ran from 15:55 to 15:57. It showed HELLO and `FWD CreateInterface SteamClient017/014` and ran for 12 s.
2. **15:54:34:** the operator ran Verify and Repair *during* launch 1's redist install. That wrote 3 backups (`restored`) and left the live shims in place.
3. **15:58:00, launch 2:** "new .gamelib-orig -- discarding the persisted verdict and rescanning" (261026-lif, correct). The real original adds TIMELINE004. All targets are now restorable, so `withhold` ran and the game launched with its own steam_api. A SteamStub exe with no forwarder and no Windows Steam exits after 2 s (`steamstub-unforwarded:withheld`).

So the route changed because a backup appeared, not because of a fingerprint or persistence defect. **It belongs in this task:** all three of Grim Dawn's gaps are non-core, so the revised rule places it, and the forwarder route comes back. Separate observation, kept out of scope as a todo suggestion: withholding a `drmWrapper==='steamstub'` exe always fails in a bridge bottle with no Windows Steam. A follow-up could make steamstub titles never withhold. The DRM check is detected after placement (`withDrmWrapper`), so that needs its own small design.

## 5. Implementation notes for the planner

- **shimCoverage.ts:** add `export const CORE_STARTUP_FAMILIES: ReadonlySet<string>` and `export function classifyUnservableInterfaceVersions(input: {arch, symbols, requiredInterfaceVersions}): { blocking: string[]; nonCore: string[] }`. It calls `findUnservableInterfaceVersions` and maps each version back to its family through the `required` entries (keys are families). It marks an entry blocking when the family is core OR the entry is not null-object-eligible (reuse the exact eligibility expression from L593-597; factor it into a helper so the two cannot drift). Keep the module free of backend imports (docblock rule).
- **shimGenerate.ts static branch (L1340-1366):** trigger `delayMissing.length > 0 || blocking.length > 0`. Pass `unservable: blocking` (plus nonCore, for the warning text) to `withholdIfRestorable`. Always push `nonCore` into `refreshGaps` so placed-miss names it. Add one `logWarning` / `logInfo` saying the shim is placed despite non-core unservable versions answered by the null object (quick 261026-mhg).
- **Runtime-loaded branch (L1043-1080):** classify per `name` inside the loop (the arch and symbols are per-name). Collect `blockingAll` and `nonCoreAll`. Trigger on `delayMissingAll || blockingAll`, then append `nonCoreAll` to `combinedMissing`.
- Amend the module docblock (add a paragraph after the 2026-10-24 j4l amendment) and the `findUnservableInterfaceVersions` doc comment. Leave `withhold()`'s message format alone apart from the gap list.
- **No data migration:** the four withheld titles now have the game original in place (non-shim target), so the next launch runs the full scan. `backupOriginalBeforeOverwrite` copies over the existing `.gamelib-orig` with identical bytes, and the shim is placed. A persisted `miss` routes to the bridge (`bridgeRoute.ts` step 7, scan-miss notice), never to bottled Steam.

## Tests that pin current behaviour

Checked: **no existing test needs editing** if the classifier is additive.
- `shimCoverage.test.ts` L836-930 (`findUnservableInterfaceVersions`), L1069/L1086/L1120 (title samples, the "half-served family is still reported" skew pin), L1222 (CSteamworks64): the function is unchanged, so they stay green.
- `shimGenerate.test.ts` j4l block L1717+: every withhold case triggers on a **core** skew (`SteamFriends016`: L1798 Manor Lords, L1851 skew-only, L2055 placed-miss) or a delay miss (`SteamAPI_Bogus`: L1834, L1921, L1955, L1975, L1995, L2013, L2197, L2670, L2690). These stay withheld under the new rule. L1867 "ELEX shape ... still placed" stays green.
- `games.test.ts` L2805/L2825/L2954 mock `placeShimForGame` and do not depend on the rule.

**New tests (write first):** classifier unit tests (core skew is blocking; non-core skew is nonCore; NULL-answered non-core, i.e. a bare `SteamUGC` accessor or x86, is blocking; a mixed input splits correctly). shimGenerate: an ELEX-2026 shape (`SteamController003 STEAMUGC_INTERFACE_VERSION008` plus served core, original with backup on disk) gives `placed-miss`, the dll is the shim, and `missingSymbols` contains both. An Overlooting shape on the runtime-loaded branch gives `placed-miss`. Core + non-core mixed gives `withheld`, naming both.

## Validation

- Quick: `npx jest src/backend/storeManagers/steam/bridge/__tests__/shimCoverage.test.ts src/backend/storeManagers/steam/bridge/__tests__/shimGenerate.test.ts`
- Full: `npx jest src/backend/storeManagers/steam` and `pnpm codecheck`; scoped `npx prettier --check` on the written files.
- Live gate: `pnpm build:sidecar`, restart dev, then launch 411300, 230070, 1603180, 3410180 and 219990. Expect no "withheld the shim" line and a placed-miss line naming the non-core gaps. Expect HELLO for each, and for 219990 the forwarder line instead of `steamstub-unforwarded:withheld`. Record "verified" under the strict rule only (230070 has no game log, so at best unverified).

## Assumptions Log

| # | Claim | Risk if wrong |
|---|---|---|
| A1 | `ISteamUser::GetSteamID` is an sret slot on MSVC x64 | Low. SteamUser stays core either way. |
| A2 | Non-core null objects are not called through sret slots at startup by the evidence titles | Medium. A controller-polling title could crash after placement. That is visible in the log and the verdict names the gap. |

## Sources

- `src/backend/storeManagers/steam/bridge/shimGenerate.ts` L1-60, L160-220, L609-760, L775-1431
- `src/backend/storeManagers/steam/bridge/shimCoverage.ts` L160-383 (served maps), L480-608
- `src/backend/storeManagers/steam/bridge/interfaceVersions.ts` L90-153, L375-430
- `native/steam-bridge/generated/steam_api_shim.c` L645-660, L6040-6091, L23940-23990; `meta/gen_vtables.ts` L1508-1528
- `src/backend/storeManagers/steam/games.ts` L2790-2800, L3060-3085; `bridge/bridgeRoute.ts` step 7
- `.planning/quick/261024-j4l-*/261024-j4l-PLAN.md` §B, `-SUMMARY.md`; `.planning/STATE.md` L364
- `~/Library/Logs/GameLib/gamelib.log` (15:49-16:04 withhold lines; Grim Dawn L768-1128); `gamelib.log.pre-51-28-*` L140-159 (ELEX 188 s); `gamelib.log.pre-51-29-*` L923-993 (AoD)
- `~/Library/Application Support/gamelib/store_cache/steam_metadata.json` (`<appId>.bridge.scan` for the five titles)
