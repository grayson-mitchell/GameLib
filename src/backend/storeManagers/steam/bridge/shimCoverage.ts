/**
 * Phase 51 Plan 03 -- ROADMAP sub-decision 2 / D-51-07: the single module
 * that owns "what does the shim actually serve" as two coverage dimensions
 * -- exported symbols AND served interface VERSIONS per arch -- so neither
 * dimension lives as a second hand-synced list inside shimGenerate.ts or
 * anywhere else. Every later Phase 51 plan that needs a coverage verdict
 * (51-07's route resolver, 51-09's persistence, 51-16's UI) reads this
 * module instead of re-deriving the composition.
 *
 * Zero backend imports (node:crypto only): this module is pure data +
 * pure functions, so a future standalone census tool (51-18, meta/ tooling)
 * can bundle the exact coverage logic the live bridge uses without pulling
 * in the backend module graph -- the same zero-import-boundary discipline
 * `importParse.ts`/`interfaceVersions.ts` (51-02) already established.
 *
 * SHIM_EXPORTED_SYMBOLS moved here verbatim from shimGenerate.ts (24-CR-02,
 * quick 260930-vrb) -- shimGenerate.ts now IMPORTS it from here rather than
 * declaring it; see shimCoverage.test.ts for the pin against the committed
 * native/steam-bridge/generated/steam_api.def.
 */

import { createHash } from 'node:crypto'

import {
  BARE_ACCESSOR_FAMILY,
  usesRuntimeInterfaceLookup
} from './interfaceVersions'
import { SHIM64_GENERATED_EXPORTS } from './shimExports.generated'

// Mirrors meta/gen_vtables.ts's FLAT_EXPORTS_SUPERSET PLUS the two
// per-interface accessor exports `generateDefFile` appends
// (`...accessorExports`, meta/gen_vtables.ts) -- the single source of
// truth for what 24-01's generator (and 24-07's packaging build) emits
// into the compiled shim's export table (12 symbols total: 10 flat +
// SteamAPI_SteamUser_v023 + SteamAPI_SteamFriends_v018, matching
// native/steam-bridge/generated/steam_api.def exactly). `src/` cannot
// statically import `meta/` (tsconfig `include` is `["src"]` only, and the
// compiled `.dll` ships without its source `.def` at packaged runtime), so
// this is a reviewed, literal copy rather than a derived import. An SDK
// bump/export change in the generator (D-07: regenerate + review the
// source diff) -- including adding/renaming an interface accessor -- must
// update this list in the same review pass (CR-02: a stale copy here
// wrongly rejects every game that imports an interface accessor).
//
// Exported so __tests__/shimCoverage.test.ts can assert this set equals the
// committed native/steam-bridge/generated/steam_api.def export list in both
// directions (the 24-CR-02 pin), and so shimGenerate.ts can import it for
// its own coverage-rejection check.
export const SHIM_EXPORTED_SYMBOLS: ReadonlySet<string> = new Set([
  'SteamAPI_Init',
  'SteamAPI_InitFlat',
  'SteamAPI_Shutdown',
  'SteamAPI_RestartAppIfNecessary',
  'SteamAPI_IsSteamRunning',
  'SteamAPI_RunCallbacks',
  'SteamAPI_RegisterCallback',
  'SteamAPI_UnregisterCallback',
  'SteamAPI_RegisterCallResult',
  'SteamAPI_UnregisterCallResult',
  'SteamAPI_SteamUser_v023',
  'SteamAPI_SteamFriends_v018',
  // 51-11: the first locked interface group (ISteamUtils, ISteamApps,
  // ISteamUserStats) plus the older SteamUser016/SteamFriends011 bare
  // accessor versions XCOM (200510) needs -- each manifest's own
  // `flatAccessor`, mirrored here (meta/sdk/isteamuser016.manifest.json,
  // isteamfriends011.manifest.json, isteamutils005.manifest.json,
  // isteamapps004.manifest.json, isteamuserstats010.manifest.json).
  'SteamAPI_SteamUser_v016',
  'SteamAPI_SteamFriends_v011',
  'SteamAPI_SteamUtils_v005',
  'SteamAPI_SteamApps_v004',
  'SteamAPI_SteamUserStats_v010',
  // 261021-pgx: Hoard's (63000) own measured versions -- the 3 new flat
  // accessors (51-11's SteamUser016/SteamUtils005 already serve Hoard,
  // see SHIM_SERVED_INTERFACE_VERSIONS below). See
  // meta/sdk/isteamfriends013.manifest.json,
  // meta/sdk/isteamapps005.manifest.json,
  // meta/sdk/isteamuserstats011.manifest.json.
  'SteamAPI_SteamFriends_v013',
  'SteamAPI_SteamApps_v005',
  'SteamAPI_SteamUserStats_v011',
  // 51-06 Task 2: the bare legacy accessors meta/gen_vtables.ts's
  // `generateDefFile` now exports once per family that has an x86
  // manifest -- resolved per game at runtime via gamelib_bridge.cfg's
  // `iface.<Family>=<Version>` (bridgeConfig.ts). Importing the bare
  // symbol is necessary but not sufficient coverage: the game's required
  // interface VERSION (SteamUser016, say) still has to be a key in
  // SHIM_SERVED_INTERFACE_VERSIONS below for the bridge to actually serve
  // it. 51-11 added the SteamUtils/SteamApps/SteamUserStats bare
  // accessors; Hoard's (63000) own measured versions are now served too
  // (261021-pgx).
  'SteamUser',
  'SteamFriends',
  'SteamUtils',
  'SteamApps',
  'SteamUserStats',
  // 51-14 Task 1: the second/last-group families (ROADMAP sub-decision 1)
  // -- ISteamRemoteStorage (cloud-disabled), ISteamMatchmaking /
  // ISteamMatchmakingServers / ISteamNetworking (unavailable). Flat
  // accessors first (meta/sdk/isteamremotestorage005.manifest.json,
  // isteammatchmaking009.manifest.json,
  // isteammatchmakingservers002.manifest.json,
  // isteamnetworking005.manifest.json, plus Hoard's (63000) own measured
  // RemoteStorage version, isteamremotestorage010.manifest.json), then
  // the four bare legacy accessors meta/gen_vtables.ts's generateDefFile
  // now exports for these families.
  'SteamAPI_SteamRemoteStorage_v005',
  'SteamAPI_SteamMatchMaking_v009',
  'SteamAPI_SteamMatchMakingServers_v002',
  'SteamAPI_SteamNetworking_v005',
  'SteamAPI_SteamRemoteStorage_v010',
  'SteamRemoteStorage',
  'SteamMatchmaking',
  'SteamMatchmakingServers',
  'SteamNetworking',
  // 51-14 Task 2 / 51-RESEARCH Pitfall 2: XCOM's nine SteamGameServer*
  // bare imports (plus two accessors no acceptance-set title imports yet)
  // -- meta/gen_vtables.ts's GAMESERVER_FLAT_STUBS, cdecl flat exports,
  // never manifest-driven.
  'SteamGameServer_Init',
  'SteamGameServer_Shutdown',
  'SteamGameServer_RunCallbacks',
  'SteamGameServer_BSecure',
  'SteamGameServer_GetSteamID',
  'SteamGameServer_GetHSteamPipe',
  'SteamGameServer_GetHSteamUser',
  'SteamGameServer',
  'SteamGameServerStats',
  'SteamGameServerNetworking',
  'SteamGameServerUtils'
])

// 51-15: D-51-13 GO -- the Win64 shim ships. Mirrors
// native/steam-bridge/generated/steam_api64.def's EXPORTS list exactly. It
// used to be a hand-pinned list (49 symbols at 51-15: the flat superset, the
// GameServer flat stubs, the Win64-only modern-SDK lookup family, the
// versioned accessors and the bare accessors). Phase 53 (53-04) adds the
// generated flat C API (hundreds of `SteamAPI_I<Family>_<Method>` names) and
// the Steamworks.NET lifecycle no-ops, so the list is now GENERATED by
// `pnpm gen-vtables` into shimExports.generated.ts from the same manifests as
// the .def and committed; shimCoverage.test.ts still verifies it against the
// committed .def in both directions (RESEARCH Pitfall 5). The x86
// SHIM_EXPORTED_SYMBOLS above stays hand-pinned and unchanged.
export const SHIM64_EXPORTED_SYMBOLS: ReadonlySet<string> = new Set(
  SHIM64_GENERATED_EXPORTS
)

/** A single served interface version's coverage mode: `'wire'` means the
 * shim's helper dispatches real Steam calls for it; `'stub'` means the
 * version is recognized but answers as a stub (D-51-02's one-time notice
 * fires for a stubbed interface). */
interface ServedInterface {
  family: string
  mode: 'wire' | 'stub'
}

// Initial x86 coverage: the two interfaces 24-01/24-05 already wired
// end-to-end (ISteamUser, ISteamFriends), both fully wired (not stubs).
// Later Phase 51 plans add more entries here as they wire more interfaces --
// this module is the SOLE place that list grows, never a second copy.
export const SHIM_SERVED_INTERFACE_VERSIONS: ReadonlyMap<
  string,
  ServedInterface
> = new Map([
  ['SteamUser023', { family: 'SteamUser', mode: 'wire' }],
  ['SteamFriends018', { family: 'SteamFriends', mode: 'wire' }],
  // 51-11: XCOM's (200510) measured first-group + User/Friends versions.
  // 'wire' here follows the same precedent as SteamUser023/SteamFriends018
  // above -- the VERSION is served (its bare accessor resolves to a real
  // helper-backed instance) even though most of its individual methods
  // are mode 'stub' per meta/sdk/wire-policy.json; D-51-02's one-time
  // notice is what tells the user which parts are truthful vs. stubbed.
  ['SteamUser016', { family: 'SteamUser', mode: 'wire' }],
  ['SteamFriends011', { family: 'SteamFriends', mode: 'wire' }],
  ['SteamUtils005', { family: 'SteamUtils', mode: 'wire' }],
  ['STEAMAPPS_INTERFACE_VERSION004', { family: 'SteamApps', mode: 'wire' }],
  [
    'STEAMUSERSTATS_INTERFACE_VERSION010',
    { family: 'SteamUserStats', mode: 'wire' }
  ],
  // 261021-pgx: Hoard's (63000) measured versions -- SteamUser016/
  // SteamUtils005 above already match Hoard's own measured strings; these
  // 3 are the versions Hoard needs that XCOM didn't.
  ['SteamFriends013', { family: 'SteamFriends', mode: 'wire' }],
  ['STEAMAPPS_INTERFACE_VERSION005', { family: 'SteamApps', mode: 'wire' }],
  [
    'STEAMUSERSTATS_INTERFACE_VERSION011',
    { family: 'SteamUserStats', mode: 'wire' }
  ],
  // 51-14: the second/last-group families -- served, but 'stub' (not
  // 'wire'): ROADMAP sub-decision 1 answers ISteamRemoteStorage as
  // cloud-disabled and ISteamMatchmaking/ISteamMatchmakingServers/
  // ISteamNetworking as unavailable (P2P join stays out of scope per
  // 24-SPEC). D-51-02's one-time notice is what tells the user these
  // parts are stubbed.
  [
    'STEAMREMOTESTORAGE_INTERFACE_VERSION005',
    { family: 'SteamRemoteStorage', mode: 'stub' }
  ],
  ['SteamMatchMaking009', { family: 'SteamMatchMaking', mode: 'stub' }],
  [
    'SteamMatchMakingServers002',
    { family: 'SteamMatchMakingServers', mode: 'stub' }
  ],
  ['SteamNetworking005', { family: 'SteamNetworking', mode: 'stub' }],
  // Hoard's (63000) own measured RemoteStorage version.
  [
    'STEAMREMOTESTORAGE_INTERFACE_VERSION010',
    { family: 'SteamRemoteStorage', mode: 'stub' }
  ]
])

// 51-15: D-51-13 GO -- one entry per manifest whose `arches` includes
// x64. 261021-pgx's STEAMUSERSTATS_INTERFACE_VERSION011 is the one SHARED
// entry (the SAME generated dispatch code serves it on both arches --
// the wire protocol is a plain TCP byte frame, arch-neutral -- so it is
// genuinely 'wire', exactly like its x86 Hoard coverage above).
//
// 51-26: ELEX's (411300) four core interfaces -- SteamUser019,
// SteamFriends015, SteamUtils008, STEAMAPPS_INTERFACE_VERSION008 -- are
// now 'wire'. This is the live measurement D-09 required: a probe
// against the signed-in Mac Steam client with AppID 411300 exercised the
// helper accessors the x64 manifests reuse from their x86 siblings
// (BIsSubscribed, BIsSubscribedApp(411300), GetSteamID, GetAppID 411300
// and GetPersonaName all matched; BLoggedOn returned false through the
// Mac accessor, accepted by the operator as the existing x86 behaviour).
// Phase 52: SteamClient017 and SteamClient014 are 'wire' -- the shim
// forwards every non-callback ISteamClient method to the native client
// through the helper (SteamClient() + flat SteamAPI_ISteamClient_*), so the
// SteamStub check is answered by the genuine signed-in client. Only the
// callback-pointer setters and SetLocalIPBinding stay local stubs. The other
// x64-only families stay 'stub' -- never measured, never invented.
export const SHIM64_SERVED_INTERFACE_VERSIONS: ReadonlyMap<
  string,
  ServedInterface
> = new Map([
  [
    'STEAMUSERSTATS_INTERFACE_VERSION011',
    { family: 'SteamUserStats', mode: 'wire' }
  ],
  ['SteamClient017', { family: 'SteamClient', mode: 'wire' }],
  ['SteamClient014', { family: 'SteamClient', mode: 'wire' }],
  ['SteamUser019', { family: 'SteamUser', mode: 'wire' }],
  ['SteamFriends015', { family: 'SteamFriends', mode: 'wire' }],
  ['SteamUtils008', { family: 'SteamUtils', mode: 'wire' }],
  ['STEAMAPPS_INTERFACE_VERSION008', { family: 'SteamApps', mode: 'wire' }],
  [
    'STEAMREMOTESTORAGE_INTERFACE_VERSION013',
    { family: 'SteamRemoteStorage', mode: 'stub' }
  ],
  // The three shared stub manifests (51-14), arches widened to x64 this
  // plan -- same stub behavior, arch-neutral (P2P join stays out of
  // scope, 24-SPEC).
  ['SteamMatchMaking009', { family: 'SteamMatchMaking', mode: 'stub' }],
  [
    'SteamMatchMakingServers002',
    { family: 'SteamMatchMakingServers', mode: 'stub' }
  ],
  ['SteamNetworking005', { family: 'SteamNetworking', mode: 'stub' }],
  // Phase 52 gap closure 52-13: Grim Dawn (219990) x64/Engine.dll names these
  // three versions. SteamUser023 is wire: the exact native accessor
  // SteamAPI_SteamUser_v023 backs it with the same dispatch as the x86 entry.
  // The other two are stub (51-14 sub-decision 1: cloud disabled, P2P
  // unavailable).
  ['SteamUser023', { family: 'SteamUser', mode: 'wire' }],
  ['SteamNetworking006', { family: 'SteamNetworking', mode: 'stub' }],
  [
    'STEAMREMOTESTORAGE_INTERFACE_VERSION016',
    { family: 'SteamRemoteStorage', mode: 'stub' }
  ],
  // Phase 53 (53-01, D-53-03 / D-53-11): each version below is extracted from
  // its own Proton VTABLE block (never aliased from a neighbour version).
  // 'wire' where the manifest carries any wire method, else 'stub'.
  ['SteamClient020', { family: 'SteamClient', mode: 'wire' }],
  ['SteamClient021', { family: 'SteamClient', mode: 'wire' }],
  ['SteamUser021', { family: 'SteamUser', mode: 'wire' }],
  ['SteamFriends017', { family: 'SteamFriends', mode: 'wire' }],
  ['SteamFriends018', { family: 'SteamFriends', mode: 'wire' }],
  ['SteamUtils010', { family: 'SteamUtils', mode: 'wire' }],
  [
    'STEAMUSERSTATS_INTERFACE_VERSION012',
    { family: 'SteamUserStats', mode: 'wire' }
  ],
  [
    'STEAMUSERSTATS_INTERFACE_VERSION013',
    { family: 'SteamUserStats', mode: 'wire' }
  ],
  ['SteamInput006', { family: 'SteamInput', mode: 'stub' }],
  ['SteamGameServer014', { family: 'SteamGameServer', mode: 'stub' }],
  ['SteamGameServer015', { family: 'SteamGameServer', mode: 'stub' }],
  ['SteamGameServerStats001', { family: 'SteamGameServerStats', mode: 'stub' }],
  // Phase 53 gap closure (53-12, D-53-06 measured / D-53-03): Steamworks.NET
  // CSteamAPIContext.Init set + measured misses; each extracted from its own
  // Proton VTABLE block. 'wire' only where the manifest carries a wire method.
  [
    'STEAMSCREENSHOTS_INTERFACE_VERSION003',
    { family: 'SteamScreenshots', mode: 'stub' }
  ],
  ['SteamMatchGameSearch001', { family: 'SteamGameSearch', mode: 'stub' }],
  ['STEAMHTTP_INTERFACE_VERSION003', { family: 'SteamHTTP', mode: 'stub' }],
  ['STEAMUGC_INTERFACE_VERSION016', { family: 'SteamUGC', mode: 'stub' }],
  ['STEAMUGC_INTERFACE_VERSION017', { family: 'SteamUGC', mode: 'stub' }],
  ['STEAMUGC_INTERFACE_VERSION020', { family: 'SteamUGC', mode: 'stub' }],
  [
    'STEAMAPPLIST_INTERFACE_VERSION001',
    { family: 'SteamAppList', mode: 'stub' }
  ],
  ['STEAMMUSIC_INTERFACE_VERSION001', { family: 'SteamMusic', mode: 'stub' }],
  [
    'STEAMMUSICREMOTE_INTERFACE_VERSION001',
    { family: 'SteamMusicRemote', mode: 'stub' }
  ],
  [
    'STEAMHTMLSURFACE_INTERFACE_VERSION_005',
    { family: 'SteamHTMLSurface', mode: 'stub' }
  ],
  ['STEAMINVENTORY_INTERFACE_V003', { family: 'SteamInventory', mode: 'stub' }],
  ['STEAMVIDEO_INTERFACE_V002', { family: 'SteamVideo', mode: 'stub' }],
  ['STEAMVIDEO_INTERFACE_V007', { family: 'SteamVideo', mode: 'stub' }],
  ['STEAMTIMELINE_INTERFACE_V001', { family: 'SteamTimeline', mode: 'stub' }],
  [
    'STEAMPARENTALSETTINGS_INTERFACE_VERSION001',
    { family: 'SteamParentalSettings', mode: 'stub' }
  ],
  ['SteamParties002', { family: 'SteamParties', mode: 'stub' }],
  [
    'STEAMREMOTEPLAY_INTERFACE_VERSION001',
    { family: 'SteamRemotePlay', mode: 'stub' }
  ],
  [
    'STEAMREMOTEPLAY_INTERFACE_VERSION002',
    { family: 'SteamRemotePlay', mode: 'stub' }
  ],
  ['SteamUtils009', { family: 'SteamUtils', mode: 'wire' }],
  ['SteamController006', { family: 'SteamController', mode: 'stub' }],
  ['SteamGameServer012', { family: 'SteamGameServer', mode: 'stub' }],
  // Same family, other versions the sampled titles request (a half-served
  // family would defeat the x64 null-object answer, Pitfall 4): ELEX asks
  // STEAMUGC_INTERFACE_VERSION010, Ranch Simulator SteamController008.
  ['SteamController008', { family: 'SteamController', mode: 'stub' }],
  ['STEAMUGC_INTERFACE_VERSION010', { family: 'SteamUGC', mode: 'stub' }],
  // quick 261025-t7i (D-53-03): Unclaimed World (284100) x64 loads
  // CSteamworks64.dll (Steamworks.NET 7.0.0 / SDK 1.34), whose context init
  // requests these ten versions. Each is extracted from its own Proton VTABLE
  // block. Without the rows, findUnservableInterfaceVersions counts them as
  // half-served-family skew and the j4l guard withholds the shim once the
  // original DLL is restored. 'wire' only where the manifest carries a wire
  // method: User018, Utils007 and Apps007 do (Apps007 has 14, so it is wire
  // like Apps008).
  ['SteamUser018', { family: 'SteamUser', mode: 'wire' }],
  ['SteamUtils007', { family: 'SteamUtils', mode: 'wire' }],
  ['STEAMAPPS_INTERFACE_VERSION007', { family: 'SteamApps', mode: 'wire' }],
  [
    'STEAMREMOTESTORAGE_INTERFACE_VERSION012',
    { family: 'SteamRemoteStorage', mode: 'stub' }
  ],
  ['STEAMUGC_INTERFACE_VERSION007', { family: 'SteamUGC', mode: 'stub' }],
  ['STEAMHTTP_INTERFACE_VERSION002', { family: 'SteamHTTP', mode: 'stub' }],
  [
    'STEAMSCREENSHOTS_INTERFACE_VERSION002',
    { family: 'SteamScreenshots', mode: 'stub' }
  ],
  [
    'STEAMHTMLSURFACE_INTERFACE_VERSION_003',
    { family: 'SteamHTMLSurface', mode: 'stub' }
  ],
  ['STEAMINVENTORY_INTERFACE_V001', { family: 'SteamInventory', mode: 'stub' }],
  ['STEAMVIDEO_INTERFACE_V001', { family: 'SteamVideo', mode: 'stub' }]
])

// 51-15: D-51-13 GO -- the Win64 shim answers an unserved required
// interface version with a null-object fallback (a real pointer to a
// do-nothing vtable, X64_NULL_OBJECT_SLOTS in meta/gen_vtables.ts) rather
// than reporting it missing outright. ELEX's eight interfaces with no
// GameLib manifest at all (SteamScreenshots, SteamHTTP, SteamUGC,
// SteamUnifiedMessages, SteamController, SteamAppList, SteamMusic,
// SteamMusicRemote) are answered this way. `evaluateShimCoverageWith`
// below takes this as an explicit parameter (not just reading the
// module-level constant) so tests can exercise either branch directly.
// CR-03: the fallback covers only families reached through runtime lookup
// (SteamInternal_CreateInterface / SteamClient); a bare accessor import of an
// unserved version is a recorded miss because resolve_bare_iface returns NULL.
export const SHIM_X64_NULL_OBJECT_FALLBACK = true

interface ExportSetVersionInputs {
  x86ExportedSymbols: ReadonlySet<string>
  x64ExportedSymbols: ReadonlySet<string>
  x86ServedVersions: ReadonlyMap<string, ServedInterface>
  x64ServedVersions: ReadonlyMap<string, ServedInterface>
  x64NullObjectFallback: boolean
}

function sortedServedEntries(
  servedVersions: ReadonlyMap<string, ServedInterface>
): string[] {
  return [...servedVersions.entries()]
    .map(([version, served]) => `${version}:${served.family}:${served.mode}`)
    .sort()
}

/**
 * D-51-07: computes the shim export-set version stamped onto every persisted
 * scan verdict (51-09's `SteamBridgeScanVerdict.shimExportSetVersion`) --
 * sha256 over sorted x86 exports + '|' + sorted x64 exports + '|' + sorted
 * served versions (with their modes) + '|' + the fallback flag, first 12 hex
 * chars. A later release whose shim covers a previously-missing symbol
 * changes this value. The stamp is persisted for diagnostics; it is NOT read
 * by `isScanVerdictNowCovered`, which does a per-arch membership test (IN-01).
 *
 * Exported (not just used to compute SHIM_EXPORT_SET_VERSION below) so
 * shimCoverage.test.ts can prove the hash actually changes when a symbol is
 * added to a COPY of the real inputs, without mutating the real constants.
 */
export function computeExportSetVersion(
  inputs: ExportSetVersionInputs
): string {
  const x86 = [...inputs.x86ExportedSymbols].sort().join(',')
  const x64 = [...inputs.x64ExportedSymbols].sort().join(',')
  const served = [
    ...sortedServedEntries(inputs.x86ServedVersions),
    ...sortedServedEntries(inputs.x64ServedVersions)
  ]
    .sort()
    .join(',')
  const payload = `${x86}|${x64}|${served}|${inputs.x64NullObjectFallback}`
  return createHash('sha256').update(payload).digest('hex').slice(0, 12)
}

/** The real, current shim export-set version -- what every live coverage
 * check and persisted scan verdict actually uses. See `computeExportSetVersion`
 * for the exact composition. */
export const SHIM_EXPORT_SET_VERSION = computeExportSetVersion({
  x86ExportedSymbols: SHIM_EXPORTED_SYMBOLS,
  x64ExportedSymbols: SHIM64_EXPORTED_SYMBOLS,
  x86ServedVersions: SHIM_SERVED_INTERFACE_VERSIONS,
  x64ServedVersions: SHIM64_SERVED_INTERFACE_VERSIONS,
  x64NullObjectFallback: SHIM_X64_NULL_OBJECT_FALLBACK
})

interface EvaluateShimCoverageInput {
  arch: 'x86' | 'x64'
  /** Every imported symbol (bare accessors included, per 51-02's widened
   * importScan.ts) a game's binary needs. */
  symbols: string[]
  /** family -> exact required interface version, from 51-02's
   * `resolveRequiredInterfaceVersions`. */
  requiredInterfaceVersions: Record<string, string>
  /** `unknown-version` / `ambiguous` problems from 51-02, appended verbatim
   * to the result's `missingSymbols` -- a named problem is never silently
   * dropped, and never magically "covered" by a future shim release either
   * (it is not a symbol or version string any export/served set can ever
   * contain). */
  versionProblems: string[]
}

interface ShimCoverageResult {
  missingSymbols: string[]
  stubbedInterfaces: string[]
}

interface ShimCoverageSets {
  x86ExportedSymbols: ReadonlySet<string>
  x64ExportedSymbols: ReadonlySet<string>
  x86ServedVersions: ReadonlyMap<string, ServedInterface>
  x64ServedVersions: ReadonlyMap<string, ServedInterface>
  x64NullObjectFallback: boolean
}

/**
 * The pure core of `evaluateShimCoverage` below, taking every coverage set
 * (including the x64 null-object-fallback flag) as an explicit parameter
 * rather than reading the module-level constants -- lets
 * shimCoverage.test.ts exercise the x64 null-object-fallback `true` branch
 * and arbitrary served/exported sets without any module-level mutation.
 *
 * Order of `missingSymbols` (D-51-07, action text): symbols not exported for
 * the given arch, THEN unserved required interface versions, THEN
 * `versionProblems` verbatim.
 */
export function evaluateShimCoverageWith(
  sets: ShimCoverageSets,
  input: EvaluateShimCoverageInput
): ShimCoverageResult {
  const exportedSymbols =
    input.arch === 'x86' ? sets.x86ExportedSymbols : sets.x64ExportedSymbols
  const servedVersions =
    input.arch === 'x86' ? sets.x86ServedVersions : sets.x64ServedVersions

  const missingSymbols: string[] = []
  const stubbedInterfaces: string[] = []

  for (const symbol of input.symbols) {
    if (!exportedSymbols.has(symbol)) {
      missingSymbols.push(symbol)
    }
  }

  for (const [family, version] of Object.entries(
    input.requiredInterfaceVersions
  )) {
    const served = servedVersions.get(version)
    if (!served) {
      // D-51-13: on x64, a null-object fallback answers an unserved version
      // with a real (do-nothing) pointer rather than nothing at all -- that
      // is a stub, not a missing symbol. Arch-scoped: the fallback never
      // applies to x86 (there is no x86 null-object fallback concept).
      // CR-03: the shim's resolve_bare_iface returns NULL for an unserved
      // version, so the fallback only holds for a family reached purely
      // through runtime lookup (SteamInternal_CreateInterface/SteamClient);
      // a bare accessor import of that family is a genuine miss.
      const reachedBare = input.symbols.some(
        (s) => BARE_ACCESSOR_FAMILY[s] === family
      )
      if (
        input.arch === 'x64' &&
        sets.x64NullObjectFallback &&
        usesRuntimeInterfaceLookup(input.symbols) &&
        !reachedBare
      ) {
        stubbedInterfaces.push(family)
      } else {
        missingSymbols.push(version)
      }
    } else if (served.mode === 'stub') {
      stubbedInterfaces.push(served.family)
    }
  }

  missingSymbols.push(...input.versionProblems)

  return { missingSymbols, stubbedInterfaces }
}

/**
 * The real, live coverage check -- wraps `evaluateShimCoverageWith` with the
 * module's actual export/served sets and the actual
 * `SHIM_X64_NULL_OBJECT_FALLBACK` flag. This is what 51-07's route resolver
 * and shimGenerate.ts's placement check call; `evaluateShimCoverageWith` is
 * for tests that need to vary the sets themselves.
 */
export function evaluateShimCoverage(
  input: EvaluateShimCoverageInput
): ShimCoverageResult {
  return evaluateShimCoverageWith(
    {
      x86ExportedSymbols: SHIM_EXPORTED_SYMBOLS,
      x64ExportedSymbols: SHIM64_EXPORTED_SYMBOLS,
      x86ServedVersions: SHIM_SERVED_INTERFACE_VERSIONS,
      x64ServedVersions: SHIM64_SERVED_INTERFACE_VERSIONS,
      x64NullObjectFallback: SHIM_X64_NULL_OBJECT_FALLBACK
    },
    input
  )
}

/** Shared null-object eligibility (x64 runtime lookup, not a bare accessor). */
function isNullObjectEligible(
  arch: 'x86' | 'x64',
  symbols: string[],
  family: string
): boolean {
  const reachedBare = symbols.some((s) => BARE_ACCESSOR_FAMILY[s] === family)
  return (
    arch === 'x64' &&
    SHIM_X64_NULL_OBJECT_FALLBACK &&
    usesRuntimeInterfaceLookup(symbols) &&
    !reachedBare
  )
}

/**
 * quick 261024-j4l: required interface versions the shim cannot truthfully
 * serve. Used by shimGenerate's withhold guard (only with importer evidence).
 *
 * A required version counts when it is not in the arch's served map (any
 * mode) AND either
 *  - it would be answered NULL (x86, or x64 without runtime lookup, or the
 *    family is reached through a bare accessor: resolve_bare_iface returns
 *    NULL), or
 *  - it would be answered by the x64 null object while the shim serves a
 *    DIFFERENT version of the same family (version skew, e.g. SteamFriends017
 *    when 015 and 018 are served): the game gets a do-nothing object where a
 *    real one exists, and faults at the first call.
 * It does NOT count when the version is served (even as an intentional
 * 51-14 stub), or when it is null-object-eligible and the shim serves no
 * version of that family at all: that is the designed D-51-13 answer ELEX
 * relies on (SteamHTTP, SteamUGC, ...). Output is in input entry order,
 * de-duplicated.
 *
 * Quick 261026-mhg: this is the RAW gap list. Callers decide what to do with
 * it through classifyUnservableInterfaceVersions: skew in a non-core family is
 * placed (placed-miss), not withheld.
 */
export function findUnservableInterfaceVersions(input: {
  arch: 'x86' | 'x64'
  symbols: string[]
  requiredInterfaceVersions: Record<string, string>
}): string[] {
  const served =
    input.arch === 'x86'
      ? SHIM_SERVED_INTERFACE_VERSIONS
      : SHIM64_SERVED_INTERFACE_VERSIONS
  const out: string[] = []
  for (const [family, version] of Object.entries(
    input.requiredInterfaceVersions
  )) {
    if (served.has(version)) continue
    const nullObjectEligible = isNullObjectEligible(
      input.arch,
      input.symbols,
      family
    )
    if (nullObjectEligible) {
      let familyServed = false
      for (const entry of served.values()) {
        if (entry.family === family) {
          familyServed = true
          break
        }
      }
      if (!familyServed) continue
    }
    if (!out.includes(version)) out.push(version)
  }
  return out
}

/**
 * Families whose interfaces a game needs at startup (identity, app/ownership,
 * stats, utils). These are exactly the families the served maps mark
 * `mode: 'wire'`. A null object here makes the game quit or fault.
 */
export const CORE_STARTUP_FAMILIES: ReadonlySet<string> = new Set([
  'SteamClient',
  'SteamUser',
  'SteamFriends',
  'SteamUtils',
  'SteamApps',
  'SteamUserStats'
])

/**
 * Quick 261026-mhg (operator option a, 2026-10-26): splits the raw
 * unservable list into gaps that BLOCK placement and gaps that are merely
 * non-core. A gap is blocking when its family is a core startup family OR the
 * shim would answer it with NULL (x86, no runtime lookup, bare accessor): a
 * NULL fails context init. Everything else is answered by the x64 null object,
 * which ELEX and Age of Decadence ran on; callers place the shim and still
 * name those gaps in the verdict. An unknown family counts as non-core.
 * Output lists keep entry order, de-duplicated.
 */
export function classifyUnservableInterfaceVersions(input: {
  arch: 'x86' | 'x64'
  symbols: string[]
  requiredInterfaceVersions: Record<string, string>
}): { blocking: string[]; nonCore: string[] } {
  const unservable = new Set(findUnservableInterfaceVersions(input))
  const blocking: string[] = []
  const nonCore: string[] = []
  for (const [family, version] of Object.entries(
    input.requiredInterfaceVersions
  )) {
    if (!unservable.has(version)) continue
    const isBlocking =
      CORE_STARTUP_FAMILIES.has(family) ||
      !isNullObjectEligible(input.arch, input.symbols, family)
    const list = isBlocking ? blocking : nonCore
    if (
      !list.includes(version) &&
      !(isBlocking ? false : blocking.includes(version))
    )
      list.push(version)
  }
  return { blocking, nonCore }
}

/**
 * D-51-07: re-runs the "is this now covered" membership test on a PERSISTED
 * scan verdict's stored `missingSymbols` list ONLY (never a full re-scan).
 * Arch-scoped (CR-01): an entry is covered iff the export set or the
 * served-versions map of the SCANNED arch contains it -- an x86 miss of an
 * x64-only symbol must never auto-clear. A differently-shaped entry (e.g.
 * `SteamUser@unknown-version`) matches neither lookup and is never covered.
 *
 * Takes a minimal structural shape to preserve this module's
 * zero-backend-import boundary.
 */
export function isScanVerdictNowCovered(scan: {
  arch: 'x86' | 'x64'
  missingSymbols: string[]
}): boolean {
  const exported =
    scan.arch === 'x86' ? SHIM_EXPORTED_SYMBOLS : SHIM64_EXPORTED_SYMBOLS
  const served =
    scan.arch === 'x86'
      ? SHIM_SERVED_INTERFACE_VERSIONS
      : SHIM64_SERVED_INTERFACE_VERSIONS
  return scan.missingSymbols.every(
    (entry) => exported.has(entry) || served.has(entry)
  )
}
