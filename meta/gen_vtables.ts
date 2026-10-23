/**
 * R1 vtable + flat-export steam_api.dll shim SOURCE generator (D-10 --
 * TypeScript, build-time only, mirrors meta/buildCrossoverIndex.ts's
 * module-header + typed-export convention).
 *
 * Reads GameLib-authored interface manifests (D-09 -- factual method
 * inventories, NEVER vendored Valve Steamworks SDK header text) from
 * meta/sdk/*.manifest.json and emits:
 *   - native/steam-bridge/generated/steam_api_shim.c  (flat SteamAPI_*
 *     exports + per-interface __thiscall vtable stubs, D-07)
 *   - native/steam-bridge/generated/steam_api.def      (flat export table)
 *
 * Run with `pnpm gen-vtables`. Generated source is COMMITTED (D-07); the PE
 * binary is only ever built at packaging time (Plan 24-07, `zig cc -target
 * x86-windows-gnu`) and is NEVER committed.
 *
 * ABI ground truth (24-RESEARCH.md Pattern 2, cross-referenced against spike
 * 006's independently hand-built, live-validated vtable --
 * .claude/skills/spike-findings-gamelib/sources/006-cpp-vtable-abi/steam_api_vt.c):
 *   - MSVC __thiscall: `this` travels in ECX, the CALLEE cleans the stack.
 *   - ret N = total byte width of the non-`this` parameters (4B per
 *     int32/uint32/pointer/enum/bool/HSteamUser, 8B per
 *     uint64/CSteamID/CGameID/double).
 *   - Register-return for <=8-byte returns (EAX for 4B, EDX:EAX for 8B).
 *   - Struct returns > 8 bytes use a hidden return pointer, passed as the
 *     FIRST stack argument after `this` -- it counts toward ret N (Pitfall 2:
 *     a WRONG ret N on ANY slot, marshaled or stubbed, corrupts the caller's
 *     stack on the NEXT call).
 *
 * Wire frame (24-RESEARCH.md Pattern 3 -- Plan 24-02's native helper speaks
 * the IDENTICAL frame; this file is one of two sources of truth for it):
 *   Request:  [4B LE len][4B LE request_id][2B LE interface ordinal][2B LE method slot][N arg blob]
 *   Response: [4B LE len][4B LE request_id][1B status 0=ok/1=err][N return blob]
 *
 * R3 acknowledged divergence (review finding #9): the flat SteamAPI_* export
 * set is a single committed SUPERSET (union of the acceptance-set games'
 * imports -- Avernum 4 + Hoard, spikes 007/008), not a literal per-game
 * export list. A DLL exporting extra symbols is harmless; per-game import
 * coverage is validated downstream by Plan 24-05, not by this generator.
 */

import { createHash } from 'node:crypto'
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// ---------------------------------------------------------------------------
// Types (manifest input shape, schema v2)
// ---------------------------------------------------------------------------
//
// Schema v2 (51-06): a manifest pins ONE interface VERSION -- many versions
// of the same family (e.g. SteamUser016, SteamUser023, ...) are many
// manifests, never one manifest with a version list. `family` is the
// generator-stable grouping key a bare legacy accessor (`SteamUser()`)
// resolves through `gamelib_bridge.cfg`'s `iface.<Family>=<Version>` line
// (51-06 Task 2) -- `interface` is the literal, exact version string a
// game's vtable ABI actually matches.

export type ArchToken = 'x86' | 'x64'

/** How a method's wire-marshaling param is carried across the frame
 * (51-06 Task 3). Absent (or `'value'`) means "copy `paramWidth(type)` raw
 * bytes" -- the original, pre-Task-3 behavior, unchanged for every existing
 * method so this field is purely additive. */
export type ParamKind = 'value' | 'in-string' | 'out-value' | 'out-buffer'

export interface ParamSignature {
  name: string
  /** One of the recognized ABI type tokens -- see WIDTH_8_TYPES below. */
  type: string
  /** Wire-marshaling kind (51-06 Task 3). Omitted (or `'value'`) is the
   * original raw-byte-copy behavior. */
  kind?: ParamKind
  /** For `kind: 'out-value'` only -- the scalar type the out-value decodes
   * to on the response side. */
  valueType?: 'int32' | 'uint32' | 'float' | 'bool' | 'uint64'
  /** For `kind: 'out-buffer'` only -- the name of the sibling param that
   * carries this buffer's capacity. */
  sizeParam?: string
}

/** The generator-facing return-shape category (51-06): drives which
 * `emitVtableStub` branch a method takes, replacing the old
 * structSize/type-string inference. */
export type ReturnKind =
  | 'void'
  | 'int32'
  | 'int64'
  | 'float'
  | 'double'
  | 'pointer'
  | 'string'
  | 'class'

const KNOWN_RETURN_KINDS: ReadonlySet<string> = new Set([
  'void',
  'int32',
  'int64',
  'float',
  'double',
  'pointer',
  'string',
  'class'
])

/** 51-06 Task 3: by-value struct param types a wire method may never
 * declare (kind 'value' or absent) -- too large/non-scalar to marshal as
 * raw register-width bytes; a future method needing one of these as a
 * genuine wire param must use a different kind (none exists for this
 * yet) or stay a stub. */
const STRUCT_PARAM_TYPES: ReadonlySet<string> = new Set(['CSteamID', 'CGameID'])

export interface MethodSignature {
  slot: number
  name: string
  /** Per-method override of the manifest's `mode` (51-06 Task 2). */
  mode?: 'wire' | 'stub'
  /** Display/Steamworks type name -- feeds the header comment and `cType`.
   * NOT used to infer return shape anymore; see `returnKind`. */
  returns: string
  returnKind: ReturnKind
  /**
   * Only present for `returnKind: 'class'` -- byte size of the returned
   * struct, copied into/out of the hidden sret buffer.
   */
  structSize?: number
  /**
   * i386 non-`this` stack bytes the callee pops, INCLUDING a 4-byte hidden
   * sret pointer when `returnKind === 'class'`. Authoritative for a stub
   * method's dummy-param count (51-06 Task 2); cross-checked against
   * `computeRetN` for a wire method (`validateManifest`).
   */
  stackBytes: number
  params: ParamSignature[]
  /** 51-10: the helper-side flat dlsym name this method's wire dispatch
   * resolves. Unused by this plan's generator paths. */
  helperFlat?: string
  /** A method with this set never calls `bridge_transact` -- it returns the
   * constant immediately (51-06 Task 3). Unused by this plan's manifests. */
  helperFallback?: number | boolean
  /**
   * Free-form note. Used to flag a synthetic ABI-exercise slot that is NOT a
   * real Steamworks method (e.g. the sret-exercise slot) so a reviewer never
   * mistakes it for vendored SDK content (D-09/Pitfall 3).
   */
  note?: string
}

export interface ManifestSource {
  /** e.g. `'hand-verified'`, `'synthetic'`, `'proton-lsteamclient'` (51-11). */
  kind: string
  /** Factual provenance reference -- NEVER vendored Valve header text
   * (D-09): a doc/commit/file citation only. */
  ref: string
  file: string
}

export interface InterfaceManifestV2 {
  schemaVersion: 2
  /** Literal, exact interface VERSION string (e.g. `SteamUser023`). */
  interface: string
  /** Generator-stable family grouping key (e.g. `SteamUser`) -- the bare
   * legacy accessor name is derived from this (51-06 Task 2). */
  family: string
  /** Unique across every manifest, 1..0xFFFE (0 and 0xFFFF are reserved). */
  ordinal: number
  arches: ArchToken[]
  /** Method-level default wire/stub mode. */
  mode: 'wire' | 'stub'
  /** `false` means this manifest does not yet declare every real slot of
   * this interface version -- `validateManifest`'s slot-gap check is
   * skipped while this is `false`. */
  complete: boolean
  /** 51-10: the Mac dylib accessor this manifest's wire methods dispatch
   * through. Unused by this plan's generator paths. */
  helperInterface?: string
  /** Explicit flat SteamAPI_* export name for this interface version.
   * Falls back to `SteamAPI_${toVersionedAccessorSuffix(interface)}` when
   * absent. */
  flatAccessor?: string
  source: ManifestSource
  /** Free-form authoring note (e.g. "51-11 completes the remaining
   * slots..."). Never names a moved/synthetic method (the _TESTONLY gate
   * greps meta/sdk for that suffix). */
  note?: string
  methods: MethodSignature[]
}

/** Back-compat alias -- schema v2 IS the only manifest shape generated
 * against; kept as a type alias so call sites reading "the manifest type"
 * do not need to know the schema is versioned. */
export type InterfaceManifest = InterfaceManifestV2

// ---------------------------------------------------------------------------
// ABI width/marshaling rules (24-RESEARCH.md Pattern 2)
// ---------------------------------------------------------------------------

const WIDTH_8_TYPES = new Set([
  'uint64',
  'int64',
  'double',
  'CSteamID',
  'CGameID'
])

export function paramWidth(type: string): number {
  return WIDTH_8_TYPES.has(type) ? 8 : 4
}

/**
 * `returnKind === 'class'` is now the SOLE sret trigger (51-06) -- replacing
 * the old `structSize > 8` inference, which could never distinguish a
 * genuine 8-byte-or-less struct return (which MSVC member functions ALWAYS
 * sret, per the Proton-verified GetSteamID/CSteamID case below) from an
 * 8-byte register return (uint64/double).
 */
export function isSretReturn(method: MethodSignature): boolean {
  return method.returnKind === 'class'
}

export function is64BitRegisterReturn(method: MethodSignature): boolean {
  return (
    !isSretReturn(method) &&
    (method.returnKind === 'int64' || method.returnKind === 'double')
  )
}

/**
 * CR-01: a `const char*` return is fundamentally NOT a register-return
 * value -- a register-return only marshals up to 8 raw bytes across the
 * process boundary, and those 8 bytes cannot be a valid pointer into the
 * OTHER process's address space. `GetPersonaName` (and any future
 * string-returning method) must instead stage the received string bytes
 * in a shim-owned static buffer and return a pointer into THAT buffer --
 * matching how the real Steamworks `GetPersonaName` returns a pointer to
 * SDK-internally-owned memory. This predicate routes such methods, inside
 * `emitVtableStub`, to the string-owned-buffer branch instead of the
 * generic register-return path.
 */
export function isStringReturn(method: MethodSignature): boolean {
  return method.returnKind === 'string'
}

/**
 * Byte capacity of the shim-owned static buffer a string-returning stub
 * copies its wire-received bytes into (plus a NUL terminator written at
 * `retlen`, so the usable transact buffer is one byte smaller). 256 is
 * generous headroom over Steamworks' documented persona-name ceiling
 * (`k_cchPersonaNameMax` = 128 bytes including NUL) while staying far
 * under the frame-level `MAX_FRAME_BYTES` cap (protocol.ts / T-24-03).
 */
export const STRING_RETURN_BUF_BYTES = 256

/**
 * ret N -- total byte width of the non-`this` parameters PLUS 4 bytes for a
 * hidden sret pointer, if present. Computed for EVERY declared slot,
 * marshaled or stubbed (Pitfall 2). 51-06: driven purely by `returnKind`
 * (Sigma param widths + 4 iff `returnKind === 'class'`), per the schema v2
 * Artifacts spec -- `structSize` is no longer consulted here.
 */
export function computeRetN(method: MethodSignature): number {
  const paramBytes = method.params.reduce(
    (sum, p) => sum + paramWidth(p.type),
    0
  )
  const sretBytes = method.returnKind === 'class' ? 4 : 0
  return paramBytes + sretBytes
}

// ---------------------------------------------------------------------------
// Manifest validation (51-06 Task 1; Task 3 adds the wire-param-kind checks)
// ---------------------------------------------------------------------------

const MIN_ORDINAL = 1
const MAX_ORDINAL = 0xfffe

/**
 * Structural validation for a single manifest. `allManifests` (defaulting
 * to `[manifest]`, so a single-arg call is always safe) supplies the full
 * loaded set for the cross-manifest duplicate-ordinal check -- `main()`
 * passes the real loaded list; a unit test exercising only the
 * single-manifest checks can omit it entirely.
 *
 * `main()` refuses to generate (exit 1, listing every error) when this
 * returns a non-empty array for ANY loaded manifest (51-06 Task 1 action).
 */
export function validateManifest(
  manifest: InterfaceManifestV2,
  allManifests: InterfaceManifestV2[] = [manifest]
): string[] {
  const errors: string[] = []
  const ctx = `${manifest.interface} (ordinal ${manifest.ordinal})`

  if (manifest.ordinal === 0 || manifest.ordinal > MAX_ORDINAL) {
    errors.push(
      `${ctx}: ordinal must be in ${MIN_ORDINAL}..0x${MAX_ORDINAL.toString(16)} (0 and 0xFFFF are reserved)`
    )
  }

  const duplicateOwners = allManifests.filter(
    (m) => m.ordinal === manifest.ordinal && m !== manifest
  )
  if (duplicateOwners.length > 0) {
    errors.push(
      `${ctx}: duplicate ordinal shared with ${duplicateOwners
        .map((m) => m.interface)
        .join(', ')}`
    )
  }

  const sortedSlots = [...manifest.methods]
    .map((m) => m.slot)
    .sort((a, b) => a - b)
  if (manifest.complete) {
    const expected = sortedSlots.map((_, i) => i)
    const hasGapOrDup = sortedSlots.some((slot, i) => slot !== expected[i])
    if (hasGapOrDup) {
      errors.push(
        `${ctx}: slot gap -- complete:true but slots are not a contiguous 0..n-1 range (got [${sortedSlots.join(', ')}])`
      )
    }
  }

  for (const method of manifest.methods) {
    const methodCtx = `${ctx} slot ${method.slot} (${method.name})`

    if (!KNOWN_RETURN_KINDS.has(method.returnKind)) {
      errors.push(`${methodCtx}: unknown returnKind "${method.returnKind}"`)
    }

    if (
      method.returnKind === 'class' &&
      typeof method.structSize !== 'number'
    ) {
      errors.push(
        `${methodCtx}: returnKind 'class' requires a numeric structSize`
      )
    }

    if (method.name.endsWith('_TESTONLY')) {
      errors.push(
        `${methodCtx}: production manifest must not contain a _TESTONLY method`
      )
    }

    const methodMode = method.mode ?? manifest.mode
    if (methodMode === 'wire') {
      const retN = computeRetN(method)
      if (retN !== method.stackBytes) {
        errors.push(
          `${methodCtx}: wire method's computeRetN (${retN}) does not match declared stackBytes (${method.stackBytes})`
        )
      }

      // 51-06 Task 3: wire methods marshal by-value scalars, in-strings,
      // out-values and bounded out-buffers -- anything else is rejected at
      // generation time (never a silently-wrong marshal).
      for (const p of method.params) {
        const kind = p.kind ?? 'value'
        const isPointerType = p.type.endsWith('*')
        if (kind === 'value') {
          if (isPointerType) {
            errors.push(
              `${methodCtx}: pointer param "${p.name}" (type "${p.type}") used as a wire param without an explicit kind (in-string/out-value/out-buffer)`
            )
          } else if (STRUCT_PARAM_TYPES.has(p.type)) {
            errors.push(
              `${methodCtx}: by-value struct param "${p.name}" (type "${p.type}") is not supported for wire params`
            )
          }
        } else if (kind === 'out-buffer' && !p.sizeParam) {
          errors.push(
            `${methodCtx}: out-buffer param "${p.name}" is missing sizeParam`
          )
        }
      }
    }
  }

  return errors
}

// ---------------------------------------------------------------------------
// C type mapping
// ---------------------------------------------------------------------------

function cType(type: string): string {
  switch (type) {
    case 'uint64':
    case 'CSteamID':
    case 'CGameID':
      return 'uint64_t'
    case 'int64':
      return 'int64_t'
    case 'double':
      return 'double'
    case 'bool':
      return 'int'
    case 'int32':
      return 'int32_t'
    case 'uint32':
    case 'HSteamUser':
    case 'HSteamPipe':
      return 'uint32_t'
    case 'const char*':
      return 'const char *'
    case 'void':
      return 'void'
    // 51-06 Task 3: pointer-to-scalar out-value param types -- exactly the
    // `valueType` enum's five members, each spelled with a trailing `*` in
    // the manifest's `type` field (the pointer the caller passes to
    // receive the decoded out-value).
    case 'int32*':
      return 'int32_t *'
    case 'uint32*':
      return 'uint32_t *'
    case 'float*':
      return 'float *'
    case 'bool*':
      return 'int *'
    case 'uint64*':
      return 'uint64_t *'
    default:
      // 51-14 Task 2: a pointer-returning method whose base type is an
      // opaque Proton/Steamworks struct the generated shim never defines
      // (e.g. `gameserveritem_t_105*` from
      // ISteamMatchmakingServers::GetServerDetails) must NOT echo that
      // unknown type name into the stub's C declaration -- the shim has
      // no struct definition for it and would fail to compile. A stub
      // never constructs or dereferences the real struct anyway, so any
      // pointer-sized return type is ABI-equivalent; fall back to a
      // generic `void *` for any trailing-`*` type not in the explicit
      // cases above (which already cover every pointer-to-scalar
      // `valueType` the wire path needs).
      return type.endsWith('*') ? 'void *' : 'uint32_t'
  }
}

// ---------------------------------------------------------------------------
// Wire marshaling constants (51-06 Task 3)
// ---------------------------------------------------------------------------

/** Max bytes an in-string request field may carry (beyond its own 4-byte
 * length prefix) -- keeps any single variable-length field, and therefore
 * the whole request frame, comfortably under protocol.ts's MAX_FRAME_BYTES
 * (65536) without needing a dynamic allocation in the generated stub. */
export const WIRE_IN_STRING_MAX_BYTES = 4096

/** Max bytes an out-buffer response field may carry (beyond its own 4-byte
 * length prefix) -- same rationale as WIRE_IN_STRING_MAX_BYTES, and the
 * same cap `validateManifest`/the generated decode both enforce on a
 * declared `sizeParam` capacity. */
export const WIRE_OUT_BUFFER_MAX_BYTES = 4096

function valueTypeWidth(valueType: string): number {
  return valueType === 'uint64' ? 8 : 4
}

function valueTypeCType(valueType: string): string {
  switch (valueType) {
    case 'uint64':
      return 'uint64_t'
    case 'float':
      return 'float'
    case 'bool':
      return 'int'
    case 'uint32':
      return 'uint32_t'
    default:
      return 'int32_t'
  }
}

/**
 * 51-06 Task 3: the SINGLE documented wire layout both halves of the bridge
 * must agree on -- this generator's shim-side encode/decode (emitVtableStub
 * below) AND 51-10's helper-side `generateDispatchHeader`, which decodes
 * the IDENTICAL request blob and encodes the IDENTICAL response blob from
 * its own manifest read. Embedded verbatim as a block comment in the
 * generated shim header so a reader never has to cross-reference this
 * source file to understand what is on the wire.
 */
export const WIRE_LAYOUT_DOC = `Wire marshaling layout (51-06 Task 3; 51-10 mirrors this exactly):

Request blob (per method, params in manifest declaration order):
  - no kind, or kind 'value': paramWidth(type) raw bytes, host byte order.
  - kind 'in-string': [u32 len][len bytes, NOT NUL-terminated]. A NULL
    pointer packs len = 0xFFFFFFFF and no bytes. len is the real string's
    byte length capped at WIRE_IN_STRING_MAX_BYTES.
  - kind 'out-value': nothing -- an out-value param is NEVER sent.
  - kind 'out-buffer': [u32 capacity] -- the sibling param named by
    sizeParam, read at call time and capped at WIRE_OUT_BUFFER_MAX_BYTES.

Response blob (per method):
  - the return value: 0 bytes (returnKind 'void'), 4 bytes (int32/pointer/
    float), 8 bytes (int64/double), [u32 len][bytes] (returnKind 'string',
    decoded by the dedicated string-return branch), or structSize bytes
    (returnKind 'class', the sret branch).
  - then, for every 'out-value' param in declaration order: valueType's
    width (int32/uint32/float/bool = 4 bytes, uint64 = 8 bytes).
  - then, for every 'out-buffer' param in declaration order: [u32 len][len
    bytes] -- len is what the helper actually has, which may exceed the
    caller's capacity; the shim copies min(len, capacity) and NUL-
    terminates only when the param's own type is a NUL-terminated string
    type (e.g. 'char*').
`

/** "SteamUser023" -> "SteamUser_v023"; "SteamFriends018" -> "SteamFriends_v018" */
export function toVersionedAccessorSuffix(interfaceName: string): string {
  const match = interfaceName.match(/^([A-Za-z]+)(\d+)$/)
  if (!match) return interfaceName
  return `${match[1]}_v${match[2]}`
}

/**
 * Three spellings of the two Matchmaking families (CR-02):
 *  - Proton / manifest / real steam_api.dll export: `SteamMatchmaking`,
 *    `SteamMatchmakingServers` (lowercase m). The manifest `family` is also
 *    the Proton fetch key (`winISteamMatchmaking_...`) and MUST stay as is.
 *  - cfg / backend / version-string: `SteamMatchMaking`,
 *    `SteamMatchMakingServers` (capital M). The backend writes
 *    `iface.SteamMatchMaking=...` and the shim strcmp()s case-sensitively.
 * `bareAccessorName` is the export spelling (= manifest spelling);
 * `cfgFamilyName` is what g_iface_table and resolve_bare_iface must use.
 */
export const CFG_FAMILY_OVERRIDES: Readonly<Record<string, string>> = {
  SteamMatchmaking: 'SteamMatchMaking',
  SteamMatchmakingServers: 'SteamMatchMakingServers'
}

export function cfgFamilyName(manifestFamily: string): string {
  return CFG_FAMILY_OVERRIDES[manifestFamily] ?? manifestFamily
}

export function bareAccessorName(family: string): string {
  return family
}

// ---------------------------------------------------------------------------
// Flat SteamAPI_* export superset (R3 finding #9 -- fixed, not manifest-driven)
// ---------------------------------------------------------------------------

export const FLAT_EXPORTS_SUPERSET = [
  'SteamAPI_Init',
  'SteamAPI_InitFlat',
  'SteamAPI_Shutdown',
  'SteamAPI_RestartAppIfNecessary',
  'SteamAPI_IsSteamRunning',
  'SteamAPI_RunCallbacks',
  'SteamAPI_RegisterCallback',
  'SteamAPI_UnregisterCallback',
  'SteamAPI_RegisterCallResult',
  'SteamAPI_UnregisterCallResult'
] as const

// 51-14 Task 2 / 51-RESEARCH Pitfall 2: XCOM's nine SteamGameServer* bare
// imports (plus two accessors no acceptance-set title imports yet,
// SteamGameServer_GetHSteamPipe/_GetHSteamUser, kept as a superset the
// same way FLAT_EXPORTS_SUPERSET already is) -- Windows PE import
// resolution is all-or-nothing per DLL, so EVERY imported symbol must
// resolve or the whole exe refuses to load, even though GameServer /
// dedicated-server support is out of scope (D-51-14, 24-SPEC). Plain
// cdecl functions (never THISCALL -- these are flat C exports, not
// vtable methods) declared with `(void)` parameter lists: cdecl is
// caller-cleans on i386, so a real arity this stub doesn't know about can
// never corrupt the stack the way a THISCALL callee-cleans mismatch
// would.
export const GAMESERVER_FLAT_STUBS = [
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
] as const

const GAMESERVER_FLAT_STUB_BODIES: Record<
  (typeof GAMESERVER_FLAT_STUBS)[number],
  string
> = {
  SteamGameServer_Init: 'int SteamGameServer_Init(void) { return 0; }',
  SteamGameServer_Shutdown: 'void SteamGameServer_Shutdown(void) { }',
  SteamGameServer_RunCallbacks: 'void SteamGameServer_RunCallbacks(void) { }',
  SteamGameServer_BSecure: 'int SteamGameServer_BSecure(void) { return 0; }',
  SteamGameServer_GetSteamID:
    'uint64_t SteamGameServer_GetSteamID(void) { return 0; }',
  SteamGameServer_GetHSteamPipe:
    'int SteamGameServer_GetHSteamPipe(void) { return 0; }',
  SteamGameServer_GetHSteamUser:
    'int SteamGameServer_GetHSteamUser(void) { return 0; }',
  SteamGameServer: 'void *SteamGameServer(void) { return NULL; }',
  SteamGameServerStats: 'void *SteamGameServerStats(void) { return NULL; }',
  SteamGameServerNetworking:
    'void *SteamGameServerNetworking(void) { return NULL; }',
  SteamGameServerUtils: 'void *SteamGameServerUtils(void) { return NULL; }'
}

const FLAT_EXPORT_BODIES: Record<
  (typeof FLAT_EXPORTS_SUPERSET)[number],
  string
> = {
  SteamAPI_Init:
    'int SteamAPI_Init(void) {\n' +
    '  const char *volatile gamelib_marker_keepalive = g_gamelib_shim_marker;\n' +
    '  (void)gamelib_marker_keepalive;\n' +
    '  uint8_t retbuf[1]; uint32_t retlen = 0;\n' +
    '  if (!bridge_transact(BRIDGE_CONTROL_ORDINAL, BRIDGE_CONTROL_SLOT_HELLO, NULL, 0, retbuf, sizeof(retbuf), &retlen)) return 0;\n' +
    '  return 1;\n' +
    '}',
  SteamAPI_InitFlat:
    'int SteamAPI_InitFlat(char *pErrMsg) { (void)pErrMsg; return 0; }',
  SteamAPI_Shutdown:
    'void SteamAPI_Shutdown(void) {\n' +
    '  if (g_bridge_sock != INVALID_SOCKET) {\n' +
    '    closesocket(g_bridge_sock);\n' +
    '    g_bridge_sock = INVALID_SOCKET;\n' +
    '    WSACleanup();\n' +
    '  }\n' +
    '}',
  SteamAPI_RestartAppIfNecessary:
    'int SteamAPI_RestartAppIfNecessary(uint32_t unOwnAppID) { (void)unOwnAppID; return 0; }',
  SteamAPI_IsSteamRunning: 'int SteamAPI_IsSteamRunning(void) { return 1; }',
  SteamAPI_RunCallbacks: 'void SteamAPI_RunCallbacks(void) { }',
  SteamAPI_RegisterCallback:
    'void SteamAPI_RegisterCallback(void *pCallback, int iCallback) { (void)pCallback; (void)iCallback; }',
  SteamAPI_UnregisterCallback:
    'void SteamAPI_UnregisterCallback(void *pCallback) { (void)pCallback; }',
  SteamAPI_RegisterCallResult:
    'void SteamAPI_RegisterCallResult(void *pCallback, uint64_t hAPICall) { (void)pCallback; (void)hAPICall; }',
  SteamAPI_UnregisterCallResult:
    'void SteamAPI_UnregisterCallResult(void *pCallback, uint64_t hAPICall) { (void)pCallback; (void)hAPICall; }'
}

// 51-15: the modern-SDK lookup family (D-51-13 GO) -- Win64-only (ROADMAP
// sub-decision 1: SteamInternal_CreateInterface, SteamAPI_GetHSteamUser,
// SteamAPI_GetHSteamPipe). A game built against a modern steam_api64.dll
// resolves EVERY interface through SteamInternal_CreateInterface(version),
// never a per-version flat accessor -- these three symbols are therefore
// emitted only into the x64 .def (generateDefFile's `arch === 'x64'`
// branch) and only compiled under `#if defined(__x86_64__)` in the shim C
// (generateShimC), never polluting the legacy x86 shim's export surface
// (SHIM_EXPORTED_SYMBOLS' CR-02 pin stays untouched by this plan).
export const MODERN_LOOKUP_FLAT_EXPORTS = [
  'SteamInternal_CreateInterface',
  'SteamAPI_GetHSteamUser',
  'SteamAPI_GetHSteamPipe'
] as const

const MODERN_LOOKUP_FLAT_EXPORT_BODIES: Record<
  (typeof MODERN_LOOKUP_FLAT_EXPORTS)[number],
  string
> = {
  // Resolves by the EXACT version string the game passes
  // (resolve_iface_by_exact_version, defined where g_iface_table is
  // complete -- see emitIfaceTableAndBareAccessors -- and forward-declared
  // in the preamble so the SteamClient-family GetISteamXxx lookup stubs in
  // vtableSections, emitted earlier in the file, can call it too). An
  // unknown version answers the x64 null-object fallback (ROADMAP
  // sub-decision 1: reported as stubbed, never missing) -- there is no x86
  // leg here at all, this symbol only ever compiles under __x86_64__.
  SteamInternal_CreateInterface:
    'void *SteamInternal_CreateInterface(const char *pszVersion) {\n' +
    '  void *resolved = resolve_iface_by_exact_version(pszVersion);\n' +
    '  if (resolved != NULL) return resolved;\n' +
    '  return (void *)&g_x64_null_object_instance;\n' +
    '}',
  // 51-15: the bridge speaks exactly one pipe/user pair per per-appId
  // helper (D-51-01) -- there is no real multi-pipe/multi-user concept to
  // report, so both always answer the single constant handle 1 (never 0,
  // which every real Steamworks game treats as "invalid handle").
  SteamAPI_GetHSteamUser: 'int SteamAPI_GetHSteamUser(void) { return 1; }',
  SteamAPI_GetHSteamPipe: 'int SteamAPI_GetHSteamPipe(void) { return 1; }'
}

// ---------------------------------------------------------------------------
// Vtable stub emission
// ---------------------------------------------------------------------------

/**
 * Max request-blob bytes a single param can contribute, per
 * WIRE_LAYOUT_DOC: `'value'` (or absent) is the real ABI width;
 * `'in-string'` is a 4-byte length prefix plus up to WIRE_IN_STRING_MAX_BYTES
 * bytes; `'out-value'` sends nothing; `'out-buffer'` sends exactly a 4-byte
 * capacity field.
 */
function wireParamMaxWidth(p: ParamSignature): number {
  const kind = p.kind ?? 'value'
  if (kind === 'in-string') return 4 + WIRE_IN_STRING_MAX_BYTES
  if (kind === 'out-value') return 0
  if (kind === 'out-buffer') return 4
  return paramWidth(p.type)
}

/**
 * 51-06 Task 3: request-blob encoding, driven by each param's `kind` per
 * WIRE_LAYOUT_DOC. `argbuf` is sized at the WORST-CASE total (every
 * in-string param at its max length) so it can be a plain stack array, but
 * the ACTUAL bytes sent (`argOff`, the returned `lenExpr`) is a runtime
 * value -- an in-string field's real length varies per call.
 */
function packArgsBlock(method: MethodSignature): {
  decl: string
  lenExpr: string
} {
  const sendableParams = method.params.filter(
    (p) => (p.kind ?? 'value') !== 'out-value'
  )
  if (sendableParams.length === 0) {
    return { decl: '  const uint8_t *argbuf = NULL;', lenExpr: '0' }
  }

  const maxTotal = sendableParams.reduce(
    (sum, p) => sum + wireParamMaxWidth(p),
    0
  )
  const lines: string[] = [
    `  uint8_t argbuf[${maxTotal}];`,
    `  uint32_t argOff = 0;`
  ]
  for (const p of sendableParams) {
    const kind = p.kind ?? 'value'
    if (kind === 'in-string') {
      lines.push(
        `  {`,
        `    uint32_t strLen;`,
        `    if (${p.name} == NULL) {`,
        `      strLen = 0xFFFFFFFFu;`,
        `      memcpy(argbuf + argOff, &strLen, 4); argOff += 4;`,
        `    } else {`,
        `      size_t rawLen = strlen(${p.name});`,
        `      strLen = (uint32_t)(rawLen > WIRE_IN_STRING_MAX_BYTES ? WIRE_IN_STRING_MAX_BYTES : rawLen);`,
        `      memcpy(argbuf + argOff, &strLen, 4); argOff += 4;`,
        `      memcpy(argbuf + argOff, ${p.name}, strLen); argOff += strLen;`,
        `    }`,
        `  }`
      )
    } else if (kind === 'out-buffer') {
      lines.push(
        `  {`,
        `    uint32_t cap = (uint32_t)${p.sizeParam};`,
        `    if (cap > WIRE_OUT_BUFFER_MAX_BYTES) cap = WIRE_OUT_BUFFER_MAX_BYTES;`,
        `    memcpy(argbuf + argOff, &cap, 4); argOff += 4;`,
        `  }`
      )
    } else {
      const width = paramWidth(p.type)
      lines.push(
        `  memcpy(argbuf + argOff, &${p.name}, ${width}); argOff += ${width};`
      )
    }
  }
  return { decl: lines.join('\n'), lenExpr: 'argOff' }
}

/**
 * 51-06 Task 2: a stub method never calls `bridge_transact` -- it answers a
 * canned zero/false/NULL/empty-string/zero-filled-sret value locally,
 * matching `shimCoverage.ts`'s `ServedInterface.mode === 'stub'` semantics
 * (D-51-02's one-time notice exists precisely because a stubbed interface
 * never talks to the real Mac Steam client). Its C signature is driven
 * ENTIRELY by `stackBytes` -- never by `method.params`, which for a stub
 * slot may be an incomplete/placeholder description -- so a stub can never
 * corrupt the caller's stack even if its declared params are wrong. A
 * class-returning stub still takes the REAL hidden `sretOut` pointer (the
 * caller's own buffer must be zero-filled and that same pointer returned,
 * exactly like a wire sret stub) -- only the bytes BEYOND that 4-byte
 * pointer become generic `uint32_t` dummies.
 */
function emitStubBody(
  manifest: InterfaceManifest,
  method: MethodSignature,
  header: string,
  funcName: string,
  sret: boolean,
  stringReturn: boolean
): string {
  const sretParam = sret ? 'void *sretOut' : ''
  const dummyBytes = method.stackBytes - (sret ? 4 : 0)
  const dummyCount = dummyBytes / 4
  const dummyParams = Array.from(
    { length: dummyCount },
    (_, i) => `uint32_t dummy${i}`
  ).join(', ')
  const paramParts = [sretParam, dummyParams].filter(Boolean).join(', ')
  const signatureParams = paramParts
    ? `void *self, ${paramParts}`
    : 'void *self'

  if (sret) {
    const structSize = method.structSize ?? 0
    return (
      header +
      `static void * THISCALL ${funcName}(${signatureParams}) {\n` +
      `  (void)self;\n` +
      `  memset(sretOut, 0, ${structSize});\n` +
      `  return sretOut;\n` +
      `}\n`
    )
  }

  if (stringReturn) {
    return (
      header +
      `static const char * THISCALL ${funcName}(${signatureParams}) {\n` +
      `  (void)self;\n` +
      `  return "";\n` +
      `}\n`
    )
  }

  if (method.returnKind === 'void') {
    return (
      header +
      `static void THISCALL ${funcName}(${signatureParams}) {\n` +
      `  (void)self;\n` +
      `}\n`
    )
  }

  const returnType = cType(method.returns)
  const zeroLiteral =
    method.returnKind === 'int64'
      ? '0LL'
      : method.returnKind === 'double'
        ? '0.0'
        : method.returnKind === 'float'
          ? '0.0f'
          : method.returnKind === 'pointer'
            ? 'NULL'
            : '0'
  return (
    header +
    `static ${returnType} THISCALL ${funcName}(${signatureParams}) {\n` +
    `  (void)self;\n` +
    `  return ${zeroLiteral};\n` +
    `}\n`
  )
}

// 51-15: Win64 unknown-interface-version fallback -- a real pointer to a
// do-nothing vtable, so a game probing for an interface this bridge does
// not serve gets a safely-callable null object (reported as stubbed, never
// a crash) rather than a NULL deref. Win64 is caller-cleans (unlike i386
// __thiscall, which is callee-cleans and therefore needs an arity-correct
// stub per slot, see emitStubBody's dummy-param mechanism above) -- ONE
// generic zero-returning function can safely serve every slot regardless
// of the real interface's arity.
export const X64_NULL_OBJECT_SLOTS = 256

/** Generator-stable family grouping key for ISteamClient (51-15) -- the
 * ONLY family whose GetISteamXxx accessor methods resolve by VERSION
 * STRING at call time (the modern-SDK lookup family: ROADMAP sub-decision
 * 1 / D-51-13) rather than returning a fixed per-manifest instance. */
const STEAM_CLIENT_FAMILY = 'SteamClient'

/** True for an ISteamClient `GetISteamXxx(..., const char *pchVersion)`
 * accessor (51-15) -- every one of them takes an `HSteamUser`/`HSteamPipe`
 * pair this bridge has no real multi-pipe/multi-user concept for (D-51-01:
 * one pipe/user per per-appId helper) PLUS the `const char *` version
 * string that is the only input the lookup actually needs. Every OTHER
 * SteamClient-family method (CreateSteamPipe, ConnectToGlobalUser, ...)
 * is unaffected and keeps following the ordinary stub/wire/helperFallback
 * rule (e.g. a manifest-declared `helperFallback: 1`). */
function isSteamClientVersionLookupMethod(
  manifest: InterfaceManifest,
  method: MethodSignature
): boolean {
  return (
    manifest.family === STEAM_CLIENT_FAMILY &&
    method.name.startsWith('GetISteam') &&
    method.params.some((p) => p.type === 'const char*')
  )
}

/**
 * Emits a GetISteamXxx version-lookup stub: looks up `pchVersion` in
 * `g_iface_table` via `resolve_iface_by_exact_version` (defined once,
 * where `g_iface_table` is complete -- see `emitIfaceTableAndBareAccessors`
 * -- and forward-declared in the preamble so this function, emitted
 * earlier in the file as part of `vtableSections`, can call it) and falls
 * back to the x64 null-object instance on a miss. The real HSteamUser/
 * HSteamPipe params are kept in the signature (so a caller's generated
 * code never corrupts its own stack/register expectations) but explicitly
 * ignored in the body -- there is no real multi-pipe/multi-user state to
 * validate them against (D-51-01).
 */
function emitSteamClientVersionLookupStub(
  method: MethodSignature,
  header: string,
  funcName: string
): string {
  const versionParam = method.params.find((p) => p.type === 'const char*')!
  const realParams = method.params
    .map((p) => `${cType(p.type)} ${p.name}`)
    .join(', ')
  const signatureParams = realParams
    ? `void *self, ${realParams}`
    : 'void *self'
  const ignoredParamLines = method.params
    .filter((p) => p.name !== versionParam.name)
    .map((p) => `  (void)${p.name};\n`)
    .join('')
  return (
    header +
    `static void * THISCALL ${funcName}(${signatureParams}) {\n` +
    `  (void)self;\n` +
    ignoredParamLines +
    `  void *resolved = resolve_iface_by_exact_version(${versionParam.name});\n` +
    `  if (resolved != NULL) return resolved;\n` +
    `#if defined(__x86_64__)\n` +
    `  return (void *)&g_x64_null_object_instance;\n` +
    `#else\n` +
    `  return NULL;\n` +
    `#endif\n` +
    `}\n`
  )
}

function emitVtableStub(
  manifest: InterfaceManifest,
  method: MethodSignature
): string {
  const retN = computeRetN(method)
  const sret = isSretReturn(method)
  const stringReturn = isStringReturn(method)
  const funcName = `vt_${manifest.interface}_${method.name}`
  const methodMode = method.mode ?? manifest.mode

  const realParams = method.params
    .map((p) => `${cType(p.type)} ${p.name}`)
    .join(', ')
  const sretParam = sret ? 'void *sretOut' : ''
  const paramParts = [sretParam, realParams].filter(Boolean).join(', ')
  const signatureParams = paramParts
    ? `void *self, ${paramParts}`
    : 'void *self'

  const descParams = method.params.map((p) => `${p.type} ${p.name}`).join(', ')
  const sretDesc = sret ? ' (SRET -- hidden return pointer)' : ''
  const stringDesc = stringReturn
    ? ' (STRING RETURN -- shim-owned buffer, CR-01)'
    : ''
  const stubDesc = methodMode === 'stub' ? ' (STUB)' : ''
  const fallbackDesc =
    method.helperFallback !== undefined ? ' (HELPER FALLBACK)' : ''
  const noteLine = method.note ? `// NOTE: ${method.note}\n` : ''
  const header =
    `// slot ${method.slot}: ${method.name}(${descParams}) -> ${method.returns} ` +
    `| __thiscall ret ${retN}${sretDesc}${stringDesc}${stubDesc}${fallbackDesc}\n${noteLine}`

  // 51-15: the modern-SDK lookup family -- checked FIRST (ahead of
  // helperFallback/stub/wire) because an ISteamClient GetISteamXxx
  // accessor is never any of those; it always resolves by version string.
  if (isSteamClientVersionLookupMethod(manifest, method)) {
    return emitSteamClientVersionLookupStub(method, header, funcName)
  }

  // 51-06 Task 3: a method with `helperFallback` set never talks to the
  // helper at all -- it answers the declared constant immediately, using
  // the method's REAL params (unlike a stub, `helperFallback` methods have
  // a trustworthy params[] -- e.g. RequestCurrentStats, which 51-11 found
  // absent from the modern dylib and answers `true` shim-side).
  if (method.helperFallback !== undefined) {
    const fallbackLiteral =
      typeof method.helperFallback === 'boolean'
        ? method.helperFallback
          ? '1'
          : '0'
        : String(method.helperFallback)
    if (method.returnKind === 'void') {
      return (
        header +
        `static void THISCALL ${funcName}(${signatureParams}) {\n` +
        `  (void)self;\n` +
        `}\n`
      )
    }
    const returnType = cType(method.returns)
    return (
      header +
      `static ${returnType} THISCALL ${funcName}(${signatureParams}) {\n` +
      `  (void)self;\n` +
      `  return ${fallbackLiteral};\n` +
      `}\n`
    )
  }

  if (methodMode === 'stub') {
    return emitStubBody(manifest, method, header, funcName, sret, stringReturn)
  }

  const { decl: argBufDecl, lenExpr: argLenExpr } = packArgsBlock(method)

  if (stringReturn) {
    // CR-01: a register-return const char* cannot marshal a remote
    // pointer -- the helper sends the raw string bytes (length implied by
    // the response frame, protocol.ts), and this stub must copy those
    // bytes into memory IT owns, then return a pointer into that buffer
    // (matching the real Steamworks contract of returning a pointer to
    // SDK-internally-owned memory). A transact failure (including a
    // string longer than the buffer, which bridge_transact rejects by
    // returning 0) falls back to an empty string, never a garbage/NULL
    // dereference-on-return-that-happens-to-be-uninitialized-stack.
    return (
      header +
      `static char ${funcName}_buf[STRING_RETURN_BUF_BYTES];\n` +
      `static const char * THISCALL ${funcName}(${signatureParams}) {\n` +
      `  (void)self;\n` +
      `${argBufDecl}\n` +
      `  uint8_t retbuf[STRING_RETURN_BUF_BYTES - 1]; uint32_t retlen = 0;\n` +
      `  if (!bridge_transact(${manifest.ordinal}, ${method.slot}, argbuf, ${argLenExpr}, retbuf, sizeof(retbuf), &retlen)) {\n` +
      `    ${funcName}_buf[0] = '\\0';\n` +
      `    return ${funcName}_buf;\n` +
      `  }\n` +
      `  memcpy(${funcName}_buf, retbuf, retlen);\n` +
      `  ${funcName}_buf[retlen] = '\\0';\n` +
      `  return ${funcName}_buf;\n` +
      `}\n`
    )
  }

  if (sret) {
    // Planner finding (2026-10-17, VERIFIED against Proton proton_9.0
    // lsteamclient/winISteamUser.c): `CSteamID * __thiscall
    // winISteamUser_SteamUser016_GetSteamID(struct w_steam_iface *_this,
    // CSteamID *_ret)` -- the hidden return pointer is the FIRST stack
    // argument after `this`, and the callee RETURNS that SAME pointer (not
    // void). A stub that declares `void` here silently diverges from the
    // real MSVC member-function convention every caller's generated code
    // expects.
    const structSize = method.structSize ?? 0
    return (
      header +
      `static void * THISCALL ${funcName}(${signatureParams}) {\n` +
      `  (void)self;\n` +
      `${argBufDecl}\n` +
      `  uint8_t retbuf[${structSize}]; uint32_t retlen = 0;\n` +
      `  if (!bridge_transact(${manifest.ordinal}, ${method.slot}, argbuf, ${argLenExpr}, retbuf, sizeof(retbuf), &retlen) || retlen < ${structSize}) {\n` +
      `    memset(sretOut, 0, ${structSize});\n` +
      `    return sretOut;\n` +
      `  }\n` +
      `  memcpy(sretOut, retbuf, ${structSize});\n` +
      `  return sretOut;\n` +
      `}\n`
    )
  }

  if (method.returnKind === 'void') {
    return (
      header +
      `static void THISCALL ${funcName}(${signatureParams}) {\n` +
      `  (void)self;\n` +
      `${argBufDecl}\n` +
      `  uint8_t retbuf[1]; uint32_t retlen = 0;\n` +
      `  bridge_transact(${manifest.ordinal}, ${method.slot}, argbuf, ${argLenExpr}, retbuf, sizeof(retbuf), &retlen);\n` +
      `}\n`
    )
  }

  const returnType = cType(method.returns)
  const retWidth = is64BitRegisterReturn(method) ? 8 : 4

  // 51-06 Task 3: out-value/out-buffer response fields trail the base
  // return value, per WIRE_LAYOUT_DOC -- decoded here, after the register
  // return is already read, using a running `respOff` cursor.
  const outValueParams = method.params.filter((p) => p.kind === 'out-value')
  const outBufferParams = method.params.filter((p) => p.kind === 'out-buffer')

  if (outValueParams.length === 0 && outBufferParams.length === 0) {
    return (
      header +
      `static ${returnType} THISCALL ${funcName}(${signatureParams}) {\n` +
      `  (void)self;\n` +
      `${argBufDecl}\n` +
      `  uint8_t retbuf[${retWidth}]; uint32_t retlen = 0;\n` +
      `  if (!bridge_transact(${manifest.ordinal}, ${method.slot}, argbuf, ${argLenExpr}, retbuf, sizeof(retbuf), &retlen) || retlen < ${retWidth}) return 0;\n` +
      `  ${returnType} ret; memcpy(&ret, retbuf, ${retWidth});\n` +
      `  return ret;\n` +
      `}\n`
    )
  }

  const extraMax =
    outValueParams.reduce(
      (sum, p) => sum + valueTypeWidth(p.valueType ?? 'int32'),
      0
    ) +
    outBufferParams.length * (4 + WIRE_OUT_BUFFER_MAX_BYTES)
  const retBufSize = retWidth + extraMax

  const decodeLines: string[] = [`  uint32_t respOff = ${retWidth};`]
  for (const p of outValueParams) {
    const valueType = p.valueType ?? 'int32'
    const width = valueTypeWidth(valueType)
    const ct = valueTypeCType(valueType)
    decodeLines.push(
      `  if (${p.name} != NULL && retlen >= respOff + ${width}) {`,
      `    ${ct} outVal; memcpy(&outVal, retbuf + respOff, ${width});`,
      `    *${p.name} = outVal;`,
      `  }`,
      `  respOff += ${width};`
    )
  }
  for (const p of outBufferParams) {
    const nulTerminate = p.type === 'char*'
    decodeLines.push(
      `  if (retlen >= respOff + 4) {`,
      `    uint32_t declLen; memcpy(&declLen, retbuf + respOff, 4); respOff += 4;`,
      `    uint32_t copyLen = declLen;`,
      `    if (copyLen > WIRE_OUT_BUFFER_MAX_BYTES) copyLen = WIRE_OUT_BUFFER_MAX_BYTES;`,
      `    if (${p.name} != NULL && retlen >= respOff + copyLen) {`,
      `      memcpy(${p.name}, retbuf + respOff, copyLen);`,
      ...(nulTerminate ? [`      ${p.name}[copyLen] = '\\0';`] : []),
      `    }`,
      `    respOff += declLen;`,
      `  }`
    )
  }

  return (
    header +
    `static ${returnType} THISCALL ${funcName}(${signatureParams}) {\n` +
    `  (void)self;\n` +
    `${argBufDecl}\n` +
    `  uint8_t retbuf[${retBufSize}]; uint32_t retlen = 0;\n` +
    `  if (!bridge_transact(${manifest.ordinal}, ${method.slot}, argbuf, ${argLenExpr}, retbuf, sizeof(retbuf), &retlen) || retlen < ${retWidth}) return 0;\n` +
    `  ${returnType} ret; memcpy(&ret, retbuf, ${retWidth});\n` +
    `${decodeLines.join('\n')}\n` +
    `  return ret;\n` +
    `}\n`
  )
}

function emitVtableArray(manifest: InterfaceManifest): string {
  const varName = `g_${manifest.interface.toLowerCase()}_vtbl`
  const instanceName = `g_${manifest.interface.toLowerCase()}_instance`
  const structName = `Fake${manifest.interface}`
  const sortedMethods = [...manifest.methods].sort((a, b) => a.slot - b.slot)
  const entries = sortedMethods
    .map((m) => `  (vfn)vt_${manifest.interface}_${m.name}, // slot ${m.slot}`)
    .join('\n')
  return (
    `static vfn ${varName}[${sortedMethods.length}] = {\n${entries}\n};\n` +
    `struct ${structName} { vfn *vptr; };\n` +
    `static struct ${structName} ${instanceName} = { ${varName} };\n`
  )
}

/** The flat SteamAPI_* export name for this manifest -- its explicit
 * `flatAccessor` field when present, else the computed
 * `SteamAPI_${toVersionedAccessorSuffix(interface)}` default. */
function flatAccessorName(manifest: InterfaceManifestV2): string {
  return (
    manifest.flatAccessor ??
    `SteamAPI_${toVersionedAccessorSuffix(manifest.interface)}`
  )
}

function emitFlatAccessor(manifest: InterfaceManifest): string {
  const instanceName = `g_${manifest.interface.toLowerCase()}_instance`
  return `void *${flatAccessorName(manifest)}(void) { return &${instanceName}; }\n`
}

// ---------------------------------------------------------------------------
// Top-level emission
// ---------------------------------------------------------------------------

export function generateShimC(manifests: InterfaceManifest[]): string {
  const sortedManifests = [...manifests].sort((a, b) => a.ordinal - b.ordinal)

  const header = `/**
 * GENERATED FILE -- DO NOT EDIT BY HAND.
 * Produced by meta/gen_vtables.ts (\`pnpm gen-vtables\`) from the GameLib-authored
 * interface manifests in meta/sdk/*.manifest.json (D-09 -- never vendored Valve
 * Steamworks SDK header text; D-07 -- source is committed, the PE binary is
 * built only at packaging time, Plan 24-07).
 *
 * Implements:
 *   - The flat SteamAPI_* exports (acceptance-set superset, R3 finding #9).
 *   - Per-interface __thiscall C++ vtables (spike 006's proven ABI mechanism)
 *     for: ${sortedManifests.map((m) => m.interface).join(', ')}.
 *
 * ABI ground truth (24-RESEARCH.md Pattern 2): MSVC __thiscall -- \`this\` in
 * ECX, callee cleans the stack; ret N = summed non-\`this\` param widths (+4 for
 * a hidden sret pointer). Register-return for <=8-byte returns (EAX or
 * EDX:EAX); hidden-return-pointer (sret) for struct returns > 8 bytes.
 *
 * Wire frame (24-RESEARCH.md Pattern 3 -- Plan 24-02's helper speaks the
 * IDENTICAL frame):
 *   Request:  [4B LE len][4B LE request_id][2B LE ordinal][2B LE slot][N arg blob]
 *   Response: [4B LE len][4B LE request_id][1B status][N return blob]
 */

#include <winsock2.h>
#include <ws2tcpip.h>
#include <windows.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include <stdlib.h>

// D-51-01: there is NO fixed, shared port left in this file at all -- each
// per-appId native helper binds an OS-assigned ephemeral port and the
// backend hands it to THIS specific game process via a small text file,
// \`gamelib_bridge.cfg\`, written beside its own .exe
// (src/backend/storeManagers/steam/bridge/bridgeConfig.ts). The shim reads
// that file, once, lazily, from beside its OWN module path -- never from a
// hardcoded port, never from a second/divergent filename.
#define BRIDGE_CONFIG_FILENAME "gamelib_bridge.cfg"
#define BRIDGE_CFG_READ_MAX 4096

// Matches protocol.ts's CONTROL_ORDINAL / CONTROL_SLOT.hello exactly --
// the connect-time handshake bridge_helper.c answers unconditionally
// (independent of whether Steam itself is signed in), proving this really
// is a GameLib per-appId helper before any real interface call is issued.
#define BRIDGE_CONTROL_ORDINAL 0xffff
#define BRIDGE_CONTROL_SLOT_HELLO 2

// CR-01: byte capacity of each string-returning stub's shim-owned static
// return buffer -- emitted directly from the generator's
// STRING_RETURN_BUF_BYTES constant, so this generated file and the value
// emitVtableStub() sizes each stub's transact buffer against can never
// drift apart.
#define STRING_RETURN_BUF_BYTES ${STRING_RETURN_BUF_BYTES}

/*
${WIRE_LAYOUT_DOC}
*/
#define WIRE_IN_STRING_MAX_BYTES ${WIRE_IN_STRING_MAX_BYTES}
#define WIRE_OUT_BUFFER_MAX_BYTES ${WIRE_OUT_BUFFER_MAX_BYTES}

// 51-10: digest of the sorted (interface, ordinal, slot, layout) wire-method
// tuples this shim marshals -- computeWireTableHash(manifests), the SAME
// function 51-10's helper-side generateDispatchHeader() calls against the
// IDENTICAL manifest set. A reader (or a pin test) can diff this against
// BRIDGE_DISPATCH_TABLE_HASH in the generated bridge_dispatch.h to catch the
// shim and the helper's dispatch table drifting apart -- never a silent
// mismatch between the two generated artifacts.
#define BRIDGE_SHIM_TABLE_HASH "${computeWireTableHash(manifests)}"

// 51-06 Task 2: bounded storage for every \`iface.<Family>=<Version>\`
// pair \`gamelib_bridge.cfg\` carries -- the backend
// (bridgeConfig.ts's \`writeBridgeConfig\`) writes one such line per family
// the game needs pinned to a specific interface VERSION, so a bare legacy
// accessor (\`SteamUser()\`) knows which vtable instance to hand back. 64
// entries and 64-byte fields are generous headroom over any real game's
// handful of families; a longer line or a fuller table is silently
// ignored (never a buffer overrun, never a crash on a malformed cfg).
#define MAX_IFACE_CFG_ENTRIES 64
#define MAX_IFACE_CFG_LINE_BYTES 256
#define MAX_IFACE_CFG_FIELD_BYTES 64

typedef struct {
  char family[MAX_IFACE_CFG_FIELD_BYTES];
  char version[MAX_IFACE_CFG_FIELD_BYTES];
} GIfaceCfgEntry;

static GIfaceCfgEntry g_iface_cfg_entries[MAX_IFACE_CFG_ENTRIES];
static int g_iface_cfg_count = 0;

// 51-06: every generated vtable stub uses MSVC __thiscall -- but THAT
// attribute is only meaningful (and only accepted by clang/gcc) on an i386
// target; on every other target (including the x64 target 51-15 adds) a
// __thiscall function would be rejected at compile time, and the x64 MSVC
// member-function convention passes \`this\` in RCX by the platform's own
// ordinary calling convention with no attribute needed at all. Guarding on
// \`__i386__\` (not a generator-time flag) means ONE generated .c file
// compiles correctly for both targets -- the arch becomes a build-time
// parameter, never a forked generator.
#if defined(__i386__)
#define THISCALL __attribute__((thiscall))
#else
#define THISCALL
#endif

static SOCKET g_bridge_sock = INVALID_SOCKET;
static uint32_t g_next_request_id = 1;

// 0 until load_bridge_port_once() resolves a valid port out of
// gamelib_bridge.cfg -- bridge_ensure_connected() refuses to connect while
// it is 0 (D-51-01: fail closed, never a fixed-port fallback).
static int g_bridge_port = 0;
static int g_bridge_port_load_attempted = 0;

// 51-07: an identity marker the version-capture pass can grep the shipped
// DLL for, so it never mistakes a GameLib shim for a game's own original
// steam_api.dll. Referenced from SteamAPI_Init() through a store to a
// volatile pointer object below so neither the linker nor -O2 can drop it.
static const char g_gamelib_shim_marker[] = "GameLibSteamBridgeShim/2";

/*
 * Scans \`buf\` (the raw bytes read from gamelib_bridge.cfg) line-by-line
 * for a \`port=<digits>\` line and, if its value parses as a valid
 * ephemeral/registered port (1024-65535), assigns g_bridge_port. Any other
 * line (appid=, iface.*=, a trailing blank line) is silently skipped --
 * this parser only ever looks for the one field it needs.
 */
static void parse_bridge_port_from_buffer(const char *buf, uint32_t len) {
  uint32_t i = 0;
  while (i < len) {
    uint32_t lineStart = i;
    while (i < len && buf[i] != '\\n' && buf[i] != '\\r') i++;
    uint32_t lineLen = i - lineStart;
    if (lineLen > 5 && strncmp(buf + lineStart, "port=", 5) == 0) {
      char numBuf[16];
      uint32_t numLen = lineLen - 5;
      if (numLen >= sizeof(numBuf)) numLen = sizeof(numBuf) - 1;
      memcpy(numBuf, buf + lineStart + 5, numLen);
      numBuf[numLen] = '\\0';
      long parsed = strtol(numBuf, NULL, 10);
      if (parsed >= 1024 && parsed <= 65535) {
        g_bridge_port = (int)parsed;
      }
    } else if (
      lineLen > 6 &&
      lineLen <= MAX_IFACE_CFG_LINE_BYTES &&
      strncmp(buf + lineStart, "iface.", 6) == 0 &&
      g_iface_cfg_count < MAX_IFACE_CFG_ENTRIES
    ) {
      uint32_t lineEnd = lineStart + lineLen;
      uint32_t eq = lineStart + 6;
      while (eq < lineEnd && buf[eq] != '=') eq++;
      if (eq < lineEnd) {
        uint32_t familyLen = eq - (lineStart + 6);
        uint32_t versionLen = lineEnd - (eq + 1);
        if (
          familyLen > 0 && familyLen < MAX_IFACE_CFG_FIELD_BYTES &&
          versionLen > 0 && versionLen < MAX_IFACE_CFG_FIELD_BYTES
        ) {
          GIfaceCfgEntry *entry = &g_iface_cfg_entries[g_iface_cfg_count];
          memcpy(entry->family, buf + lineStart + 6, familyLen);
          entry->family[familyLen] = '\\0';
          memcpy(entry->version, buf + eq + 1, versionLen);
          entry->version[versionLen] = '\\0';
          g_iface_cfg_count++;
        }
      }
    }
    while (i < len && (buf[i] == '\\n' || buf[i] == '\\r')) i++;
  }
}

/*
 * Resolves gamelib_bridge.cfg's \`port=\` value into g_bridge_port -- ONCE,
 * lazily, on first use (g_bridge_port_load_attempted guards every repeat
 * call). The file is resolved beside THIS DLL's own on-disk path (never a
 * caller-supplied/relative path): GetModuleHandleExA with
 * GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS resolves the module that contains
 * this very function, then GetModuleFileNameA yields that module's full
 * path; the file name component is replaced with BRIDGE_CONFIG_FILENAME.
 * On ANY failure (module path unresolvable, file missing, file
 * unreadable, no valid \`port=\` line) g_bridge_port simply stays 0 --
 * there is no fixed-port fallback (D-51-01): a missing/malformed cfg means
 * bridge_ensure_connected() below refuses to connect at all, rather than
 * ever guessing the old shared port.
 */
static void load_bridge_port_once(void) {
  if (g_bridge_port_load_attempted) return;
  g_bridge_port_load_attempted = 1;

  HMODULE hModule = NULL;
  if (!GetModuleHandleExA(
        GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS | GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT,
        (LPCSTR)&load_bridge_port_once,
        &hModule)) {
    return;
  }

  char cfgPath[MAX_PATH];
  DWORD pathLen = GetModuleFileNameA(hModule, cfgPath, sizeof(cfgPath));
  if (pathLen == 0 || pathLen >= sizeof(cfgPath)) {
    return;
  }

  char *lastSlash = strrchr(cfgPath, '\\\\');
  char *fileNameStart = lastSlash ? lastSlash + 1 : cfgPath;
  size_t prefixLen = (size_t)(fileNameStart - cfgPath);
  if (prefixLen + strlen(BRIDGE_CONFIG_FILENAME) >= sizeof(cfgPath)) {
    return;
  }
  strcpy(fileNameStart, BRIDGE_CONFIG_FILENAME);

  FILE *f = fopen(cfgPath, "rb");
  if (!f) return;
  char buf[BRIDGE_CFG_READ_MAX];
  size_t readLen = fread(buf, 1, sizeof(buf), f);
  fclose(f);
  if (readLen == 0) return;

  parse_bridge_port_from_buffer(buf, (uint32_t)readLen);
}

static int bridge_ensure_connected(void) {
  if (g_bridge_sock != INVALID_SOCKET) return 1;
  load_bridge_port_once();
  // D-51-01: fail closed -- never falls back to a fixed/guessed port.
  if (g_bridge_port == 0) return 0;
  WSADATA w;
  if (WSAStartup(MAKEWORD(2, 2), &w) != 0) return 0;
  SOCKET s = socket(AF_INET, SOCK_STREAM, 0);
  struct sockaddr_in a; memset(&a, 0, sizeof a);
  a.sin_family = AF_INET;
  a.sin_port = htons((uint16_t)g_bridge_port);
  a.sin_addr.s_addr = inet_addr("127.0.0.1"); // loopback-only, never a routable interface
  if (connect(s, (struct sockaddr *)&a, sizeof a) != 0) { closesocket(s); return 0; }
  g_bridge_sock = s;
  return 1;
}

/*
 * One real attempt at marshaling an interface-ordinal + method-slot call
 * over the persistent bridge connection. \`*transportFailed\` distinguishes
 * a broken CONNECTION (worth retrying once on a fresh socket -- see
 * bridge_transact below) from a legitimate error RESPONSE (a live, healthy
 * connection that simply answered status != 0 -- never retried, since
 * retrying would just repeat the same answer).
 */
static int bridge_transact_once(uint16_t ordinal, uint16_t slot,
                                 const uint8_t *argBuf, uint32_t argLen,
                                 uint8_t *retBuf, uint32_t retBufCap, uint32_t *retLenOut,
                                 int *transportFailed) {
  *retLenOut = 0;
  *transportFailed = 0;
  if (!bridge_ensure_connected()) { *transportFailed = 1; return 0; }

  uint32_t requestId = g_next_request_id++;
  uint32_t frameLen = 4 + 2 + 2 + argLen;
  uint8_t header[12];
  memcpy(header + 0, &frameLen, 4);
  memcpy(header + 4, &requestId, 4);
  memcpy(header + 8, &ordinal, 2);
  memcpy(header + 10, &slot, 2);

  if (send(g_bridge_sock, (const char *)header, sizeof(header), 0) != sizeof(header)) { *transportFailed = 1; return 0; }
  if (argLen > 0 && send(g_bridge_sock, (const char *)argBuf, argLen, 0) != (int)argLen) { *transportFailed = 1; return 0; }

  uint8_t respHeader[9];
  if (recv(g_bridge_sock, (char *)respHeader, sizeof(respHeader), MSG_WAITALL) != (int)sizeof(respHeader)) { *transportFailed = 1; return 0; }
  uint32_t respLen, respRequestId; uint8_t status;
  memcpy(&respLen, respHeader + 0, 4);
  memcpy(&respRequestId, respHeader + 4, 4);
  status = respHeader[8];
  if (respRequestId != requestId) { *transportFailed = 1; return 0; }
  if (status != 0) return 0; // legitimate error response -- healthy connection, do not retry

  uint32_t retLen = respLen - 5; // subtract request_id(4) + status(1)
  if (retLen > retBufCap) return 0; // caller-buffer mismatch -- not a transport failure
  if (retLen > 0 && recv(g_bridge_sock, (char *)retBuf, retLen, MSG_WAITALL) != (int)retLen) { *transportFailed = 1; return 0; }
  *retLenOut = retLen;
  return 1;
}

/*
 * Marshal one interface-ordinal + method-slot call to the persistent bridge
 * connection and block for the response (Pattern 3). Returns 1 on ok, 0 on
 * transport/protocol error -- callers fall back to a safe zero/false value on
 * error (this shim is a compatibility layer, not a DRM gate, spike 008).
 *
 * Retries the WHOLE request exactly once, on a fresh connection, when the
 * first attempt fails at the TRANSPORT level -- the helper's own 5s
 * SO_RCVTIMEO closes an idle persistent connection, so a transport failure
 * on an otherwise-healthy link usually just means "reconnect and resend",
 * not a real protocol error.
 */
static int bridge_transact(uint16_t ordinal, uint16_t slot,
                            const uint8_t *argBuf, uint32_t argLen,
                            uint8_t *retBuf, uint32_t retBufCap, uint32_t *retLenOut) {
  int transportFailed = 0;
  int ok = bridge_transact_once(ordinal, slot, argBuf, argLen, retBuf, retBufCap, retLenOut, &transportFailed);
  if (ok || !transportFailed) return ok;

  if (g_bridge_sock != INVALID_SOCKET) {
    closesocket(g_bridge_sock);
    g_bridge_sock = INVALID_SOCKET;
  }
  return bridge_transact_once(ordinal, slot, argBuf, argLen, retBuf, retBufCap, retLenOut, &transportFailed);
}

typedef void *vfn;

// 51-15: Win64 unknown-interface-version fallback -- see X64_NULL_OBJECT_SLOTS'
// doc comment (meta/gen_vtables.ts) for why ONE generic zero-returning
// function safely serves every slot's arity on this target.
#if defined(__x86_64__)
static void *vt_x64_null_object(void *self) { (void)self; return 0; }
static vfn g_x64_null_object_vtbl[${X64_NULL_OBJECT_SLOTS}] = {
${Array.from({ length: X64_NULL_OBJECT_SLOTS }, () => '  (vfn)vt_x64_null_object,').join('\n')}
};
struct GLibX64NullObject { vfn *vptr; };
static struct GLibX64NullObject g_x64_null_object_instance = { g_x64_null_object_vtbl };
#endif

// 51-15: forward declaration only -- the full definition (and
// g_iface_table itself) lives in emitIfaceTableAndBareAccessors's output
// below, which also defines every per-interface instance struct
// vtableSections declares; this file's ISteamClient GetISteamXxx
// version-lookup stubs (vtableSections, emitted BEFORE that section) and
// SteamInternal_CreateInterface (emitted AFTER it) both call this SAME
// function, so a plain prototype here is all either call site needs.
static void *resolve_iface_by_exact_version(const char *version);

`

  // 51-15: every vtable/table row is gated on its OWN manifest's `arches`
  // -- archGuard(['x86']) wraps in `#if defined(__i386__)`,
  // archGuard(['x64']) in `#if defined(__x86_64__)`, and a dual-arch
  // manifest (both) gets no guard at all (compiles into both targets).
  // This is what makes "the x64 build must never include an x86-only
  // manifest's vtable, and the x86 build never an x64-only one" true.
  const vtableSections = sortedManifests
    .map((m) => {
      const { open, close } = archGuard(m.arches)
      const stubs = [...m.methods]
        .sort((a, b) => a.slot - b.slot)
        .map((method) => emitVtableStub(m, method))
        .join('\n')
      return (
        `${open}// === ${m.interface} (ordinal ${m.ordinal}, family ${m.family}) ===\n\n` +
        `${stubs}\n${emitVtableArray(m)}${close}`
      )
    })
    .join('\n')

  const flatExports = FLAT_EXPORTS_SUPERSET.map(
    (name) => FLAT_EXPORT_BODIES[name]
  ).join('\n')
  // 51-15: Win64-only (see MODERN_LOOKUP_FLAT_EXPORTS' doc comment).
  const modernLookupExports =
    `#if defined(__x86_64__)\n` +
    MODERN_LOOKUP_FLAT_EXPORTS.map(
      (name) => MODERN_LOOKUP_FLAT_EXPORT_BODIES[name]
    ).join('\n') +
    `\n#endif\n`
  const gameServerStubs = GAMESERVER_FLAT_STUBS.map(
    (name) => GAMESERVER_FLAT_STUB_BODIES[name]
  ).join('\n')
  const accessors = sortedManifests
    .map((m) => {
      const { open, close } = archGuard(m.arches)
      return `${open}${emitFlatAccessor(m)}${close}`
    })
    .join('')
  const ifaceTableAndBareAccessors =
    emitIfaceTableAndBareAccessors(sortedManifests)

  return (
    `${header}${vtableSections}\n` +
    `// === Legacy bare accessors (51-06 Task 2, selected per game via gamelib_bridge.cfg's iface.<Family>=<Version>) ===\n\n` +
    `${ifaceTableAndBareAccessors}\n` +
    `// === Flat SteamAPI_* exports (acceptance-set superset, R3 finding #9) ===\n\n` +
    `${flatExports}\n\n` +
    `// === Modern-SDK lookup family (51-15, Win64 only -- D-51-13) ===\n\n` +
    `${modernLookupExports}\n\n` +
    `// === SteamGameServer* flat stubs (51-14 Task 2, Pitfall 2 -- cdecl, caller-cleans, honest unavailable answers) ===\n\n` +
    `${gameServerStubs}\n\n` +
    `// === Per-interface flat accessors ===\n\n` +
    `${accessors}`
  )
}

// ---------------------------------------------------------------------------
// 51-10: helper-side dispatch table (generateDispatchHeader) + the shared
// shim/helper table-hash (computeWireTableHash)
// ---------------------------------------------------------------------------

/**
 * True for exactly the methods that travel the wire -- `mode === 'wire'`
 * (per-method override, else the manifest default) AND NOT a
 * `helperFallback` method (51-06 Task 3: a fallback method never calls
 * `bridge_transact`, so it never reaches the helper and must never appear in
 * the helper's own dispatch table or the shared table hash either).
 */
function isWireDispatchMethod(
  manifest: InterfaceManifest,
  method: MethodSignature
): boolean {
  const mode = method.mode ?? manifest.mode
  return mode === 'wire' && method.helperFallback === undefined
}

/**
 * A stable string capturing every field of a method's signature that
 * affects wire marshaling -- returnKind/structSize (response shape) plus
 * each param's type/kind/valueType/sizeParam (request shape). Two methods
 * with the same name but a different layout produce a different key, so the
 * hash below changes the moment either side's marshaling would actually
 * change, never just when a slot number moves.
 */
function wireMethodLayoutKey(method: MethodSignature): string {
  const paramsDesc = method.params
    .map(
      (p) =>
        `${p.name}:${p.type}:${p.kind ?? 'value'}:${p.valueType ?? ''}:${p.sizeParam ?? ''}`
    )
    .join(',')
  return `${method.returnKind}:${method.structSize ?? ''}:${paramsDesc}`
}

/**
 * 51-10: the digest `computeRetN`'s sibling -- a single, order-independent
 * fingerprint of every wire method's (interface, ordinal, slot, layout)
 * tuple, embedded verbatim as `BRIDGE_SHIM_TABLE_HASH` in the generated
 * shim (generateShimC above) and as `BRIDGE_DISPATCH_TABLE_HASH` in the
 * generated helper dispatch header (generateDispatchHeader below). Both
 * call this SAME function against the SAME loaded manifest set, so the two
 * generated artifacts can never drift apart silently: a pin test (or a
 * reviewer) diffing the two `#define`s catches it immediately.
 *
 * Sorted by (ordinal, slot) before hashing -- the result does not depend on
 * manifest array order or method declaration order, only on the actual set
 * of wire methods and their layouts.
 */
export function computeWireTableHash(manifests: InterfaceManifest[]): string {
  const entries: { ordinal: number; slot: number; line: string }[] = []
  for (const manifest of manifests) {
    for (const method of manifest.methods) {
      if (!isWireDispatchMethod(manifest, method)) continue
      entries.push({
        ordinal: manifest.ordinal,
        slot: method.slot,
        line: `${manifest.interface}|${manifest.ordinal}|${method.slot}|${wireMethodLayoutKey(method)}`
      })
    }
  }
  entries.sort((a, b) => a.ordinal - b.ordinal || a.slot - b.slot)
  const canonical = entries.map((e) => e.line).join('\n')
  return createHash('sha256').update(canonical).digest('hex').slice(0, 12)
}

/** Byte capacity of the single static scratch buffer `bridge_dispatch()`
 * encodes every response into -- generous headroom over the largest real
 * response this plan serves (GetPersonaName: 4-byte length prefix + up to
 * 255 string bytes = 259) while staying far under `MAX_FRAME_BYTES`
 * (protocol.ts). Exported so a test can pin the emitted `#define` against
 * this single source of truth rather than a repeated literal. */
export const BRIDGE_DISPATCH_RESP_SCRATCH_BYTES = 4096

/** Max bytes `GetPersonaName`'s (and any future string-returning dispatch
 * method's) helper-side encode will copy out of the native flat accessor's
 * returned `const char *` -- CR-01's own reasoning applied to the OTHER
 * direction of the wire: the helper owns a bounded local copy, never trusts
 * an unbounded `strlen()` off a pointer it does not control the lifetime
 * of. 255 (not 256) leaves room for the `\0` protocol.ts's own decode never
 * needs on the wire (the length-prefixed blob has no terminator), matching
 * `k_cchPersonaNameMax` - 1. */
export const DISPATCH_STRING_RETURN_MAX_BYTES = 255

/**
 * Per-manifest, de-duplicated accessor var names -- `g_bd_self_<interface
 * lowercased>` holds the resolved interface-instance pointer,
 * `g_bd_accessor_<interface lowercased>` the dlsym'd accessor function
 * pointer that produced it. Named after the INTERFACE (not the family):
 * two manifests never share an `interface` string (ordinal-uniqueness,
 * `validateManifest`), so these names can never collide.
 */
function dispatchSelfVarName(manifest: InterfaceManifestV2): string {
  return `g_bd_self_${manifest.interface.toLowerCase()}`
}

function dispatchAccessorVarName(manifest: InterfaceManifestV2): string {
  return `g_bd_accessor_${manifest.interface.toLowerCase()}`
}

/** `g_bd_flat_<Interface>_<Method>` -- the dlsym'd flat function pointer a
 * single dispatch-table case calls through. Interface + method name is
 * already globally unique (manifest ordinals are unique, and a manifest's
 * own method names are unique within it), so no further qualification is
 * needed. */
function dispatchFlatVarName(
  manifest: InterfaceManifestV2,
  method: MethodSignature
): string {
  return `g_bd_flat_${manifest.interface}_${method.name}`
}

/**
 * The helper-side (native arm64 flat ABI) C type for a wire param/return
 * type token. Reuses the SAME `cType` the shim side uses -- deliberately:
 * `CSteamID`/`CGameID` map to `uint64_t` on both sides because Steam's real
 * flat macOS exports return/take these as plain 8-byte values (verified by
 * the pre-51-10 hand-written `GetSteamID_t = uint64_t (*)(void *)` typedef
 * this plan's generator now reproduces), never the hidden-sret-pointer
 * shape the Windows MSVC VTABLE ABI requires on the shim side.
 */
function dispatchCType(type: string): string {
  return cType(type)
}

/** Byte width `bridge_dispatch()` encodes a method's base return value as,
 * on the wire response -- mirrors the shim's own `is64BitRegisterReturn` /
 * `isSretReturn` byte-width reasoning, but for the helper-side ABI (no sret
 * on this side at all, see `dispatchCType` above): `class` is a plain
 * register-width return exactly like `int64`/`double`, never a hidden
 * pointer. Returns `null` for `'void'` (no return bytes at all) and for any
 * returnKind this generator does not (yet) know how to encode
 * helper-side -- `'pointer'`/`'float'` have no current production use and
 * are refused at generation time (see `assertDispatchable` below) rather
 * than silently mis-encoded. */
function dispatchReturnWidth(method: MethodSignature): number | null {
  switch (method.returnKind) {
    case 'void':
      return 0
    case 'int32':
      return 4
    case 'int64':
    case 'double':
      return 8
    case 'class':
      // 51-10: CSteamID (the only 'class' shape any manifest declares) is
      // an 8-byte flat-ABI register return on this side -- see
      // `dispatchCType`'s doc comment. A structSize other than 8 would mean
      // some OTHER class shape this generator has never verified against a
      // real flat export; refused at generation time instead (see
      // `assertDispatchable`).
      return method.structSize === 8 ? 8 : null
    default:
      return null
  }
}

/**
 * Generation-time refusal (never a silently-wrong dispatch case) for a
 * dispatch-eligible wire method this generator cannot yet marshal
 * helper-side: a 'class' return whose structSize isn't 8, a 'pointer'/
 * 'float' return (no production manifest needs either yet), an
 * 'out-buffer' param (deferred -- no production manifest uses it on a
 * dispatch-eligible method yet; a future plan extending
 * generateDispatchHeader to support it is expected to replace this
 * throw, not work around it), or an 'out-value' param paired with a
 * 'void'/'string' return (51-11 adds 'out-value' response encoding for
 * every OTHER return shape -- see emitDispatchCase -- but neither the
 * void branch nor the string branch appends extra response bytes after
 * the base return, and no production manifest needs that combination
 * yet).
 */
function assertDispatchable(
  manifest: InterfaceManifestV2,
  method: MethodSignature
): void {
  const ctx = `${manifest.interface} slot ${method.slot} (${method.name})`

  if (!method.helperFlat) {
    throw new Error(
      `generateDispatchHeader: ${ctx} is a dispatch-eligible wire method with no helperFlat -- every non-fallback wire method must declare the helper-side flat dlsym name it dispatches to (51-10)`
    )
  }
  if (!manifest.helperInterface) {
    throw new Error(
      `generateDispatchHeader: ${manifest.interface} has a dispatch-eligible wire method (${method.name}) but no manifest-level helperInterface -- every manifest with at least one dispatch-eligible wire method must declare the Mac dylib accessor it resolves through (51-10)`
    )
  }
  if (method.returnKind !== 'string' && dispatchReturnWidth(method) === null) {
    throw new Error(
      `generateDispatchHeader: ${ctx} has returnKind "${method.returnKind}"${
        method.returnKind === 'class'
          ? ` with structSize ${method.structSize} (only 8 is supported helper-side)`
          : ' -- unsupported helper-side return shape'
      }, never silently mis-encoded (51-10)`
    )
  }
  const hasOutValue = method.params.some(
    (p) => (p.kind ?? 'value') === 'out-value'
  )
  if (
    hasOutValue &&
    (method.returnKind === 'void' || method.returnKind === 'string')
  ) {
    throw new Error(
      `generateDispatchHeader: ${ctx} has returnKind "${method.returnKind}" with an 'out-value' param -- appending out-value response bytes after a void/string base return is deferred to a future plan, never silently wrong (51-10/51-11)`
    )
  }
  for (const p of method.params) {
    const kind: ParamKind = p.kind ?? 'value'
    if (kind === 'out-buffer') {
      throw new Error(
        `generateDispatchHeader: ${ctx} param "${p.name}" has kind "out-buffer" -- out-buffer dispatch decoding is deferred to a future plan, never silently wrong (51-10)`
      )
    }
  }
}

/**
 * Emits ONE dispatch-table case: the identity-only app-scoped-family gate
 * (T-51-25), the SteamUtils.GetAppID identity-only special case (D-51-04),
 * the NULL-resolved-pointer guard (T-51-23), the request decode (per
 * WIRE_LAYOUT_DOC -- 'value' and 'in-string' kinds only, see
 * `assertDispatchable`), the flat call, and the response encode.
 */
function emitDispatchCase(
  manifest: InterfaceManifestV2,
  method: MethodSignature
): string {
  assertDispatchable(manifest, method)

  const ordinal = manifest.ordinal
  const slot = method.slot
  const selfVar = dispatchSelfVarName(manifest)
  const flatVar = dispatchFlatVarName(manifest, method)
  const returnType = dispatchCType(method.returns)
  const isIdentityGatedFamily =
    manifest.family === 'SteamUserStats' ||
    manifest.family === 'SteamRemoteStorage'
  const isAppIdReport =
    manifest.family === 'SteamUtils' && method.name === 'GetAppID'

  const lines: string[] = []
  lines.push(
    `    case (((uint32_t)${ordinal}) << 16 | ${slot}u): { // ${manifest.interface}.${method.name}`
  )

  if (isIdentityGatedFamily) {
    lines.push(
      `      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-51-25: ${manifest.family} is app-scoped -- refused in identity-only mode`
    )
  }
  if (isAppIdReport) {
    lines.push(
      `      if (g_bd_identity_only) { // D-51-04: identity-only reports the launching game's real AppID, never 480`
    )
    lines.push(`        uint32_t v = g_bd_report_appid;`)
    lines.push(`        if (respCap < 4) { *respLen = 0; return 1; }`)
    lines.push(`        memcpy(resp, &v, 4); *respLen = 4; return 0;`)
    lines.push(`      }`)
  }

  lines.push(
    `      if (${flatVar} == NULL || ${selfVar} == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called`
  )

  // --- request decode (value / in-string only -- assertDispatchable above
  // refuses out-value/out-buffer) ---
  const decls: string[] = []
  const callArgs: string[] = [selfVar]
  let offsetExpr = '0u'

  for (const p of method.params) {
    const kind = p.kind ?? 'value'
    const varName = `arg_${p.name}`
    if (kind === 'out-value') {
      // 51-11: nothing is read from the request for an out-value param
      // (WIRE_LAYOUT_DOC) -- declare a zero-initialized local of the
      // decoded scalar type and pass its address to the real flat call;
      // the call site below passes `&${varName}` instead of `${varName}`.
      // offsetExpr is deliberately NOT advanced -- no request bytes were
      // consumed.
      const valueType = p.valueType ?? 'int32'
      const ct = valueTypeCType(valueType)
      decls.push(`      ${ct} ${varName} = 0;`)
      callArgs.push(`&${varName}`)
      continue
    }
    if (kind === 'in-string') {
      const bufName = `${flatVar}_${p.name}_buf`
      // The decoded length is kept in its own named local (`${varName}_len`)
      // -- never recomputed via strlen() on the copied buffer afterwards,
      // since an embedded NUL byte inside a legitimately-sent string would
      // make strlen() report a SHORTER length than what was actually
      // decoded/copied, under-advancing every subsequent param's offset.
      decls.push(
        `      static char ${bufName}[${WIRE_IN_STRING_MAX_BYTES} + 1];`,
        `      const char *${varName} = NULL;`,
        `      uint32_t ${varName}_len = 0;`,
        `      if (argLen < ${offsetExpr} + 4) { *respLen = 0; return 1; }`,
        `      memcpy(&${varName}_len, arg + ${offsetExpr}, 4);`,
        `      if (${varName}_len != 0xFFFFFFFFu) {`,
        `        if (${varName}_len > ${WIRE_IN_STRING_MAX_BYTES} || argLen < ${offsetExpr} + 4 + ${varName}_len) { *respLen = 0; return 1; } // in-string length past argLen -- T-51-24`,
        `        memcpy(${bufName}, arg + ${offsetExpr} + 4, ${varName}_len);`,
        `        ${bufName}[${varName}_len] = '\\0';`,
        `        ${varName} = ${bufName};`,
        `      } else {`,
        `        ${varName}_len = 0;`,
        `      }`
      )
      callArgs.push(varName)
      offsetExpr = `(${offsetExpr} + 4 + ${varName}_len)`
    } else {
      const width = paramWidth(p.type)
      const ct = dispatchCType(p.type)
      decls.push(
        `      if (argLen < ${offsetExpr} + ${width}) { *respLen = 0; return 1; } // argLen shorter than this method's fixed part -- T-51-23`,
        `      ${ct} ${varName}; memcpy(&${varName}, arg + ${offsetExpr}, ${width});`
      )
      callArgs.push(varName)
      offsetExpr = `(${offsetExpr} + ${width})`
    }
  }
  lines.push(...decls)

  // --- call + response encode ---
  const callExpr = `${flatVar}(${callArgs.join(', ')})`
  if (method.returnKind === 'void') {
    lines.push(`      ${callExpr};`, `      *respLen = 0; return 0;`)
  } else if (method.returnKind === 'string') {
    lines.push(
      `      const char *result = ${callExpr};`,
      `      if (result == NULL) { *respLen = 0; return 1; }`,
      `      uint32_t strLen = (uint32_t)strlen(result);`,
      `      if (strLen > ${DISPATCH_STRING_RETURN_MAX_BYTES}) strLen = ${DISPATCH_STRING_RETURN_MAX_BYTES};`,
      `      if (respCap < 4 + strLen) { *respLen = 0; return 1; }`,
      `      memcpy(resp, &strLen, 4);`,
      `      memcpy(resp + 4, result, strLen);`,
      `      *respLen = 4 + strLen;`,
      `      return 0;`
    )
  } else {
    const width = dispatchReturnWidth(method)
    const outValueParams = method.params.filter(
      (p) => (p.kind ?? 'value') === 'out-value'
    )
    if (outValueParams.length === 0) {
      lines.push(
        `      ${returnType} __ret = ${callExpr};`,
        `      if (respCap < ${width}) { *respLen = 0; return 1; }`,
        `      memcpy(resp, &__ret, ${width});`,
        `      *respLen = ${width};`,
        `      return 0;`
      )
    } else {
      // 51-11: WIRE_LAYOUT_DOC's response shape -- the base return value
      // first, then every out-value param's valueType width, in
      // declaration order. assertDispatchable above already refused this
      // combination for a void/string base return, so `width` here is
      // always a real register-return byte count.
      const extraWidths = outValueParams.map((p) =>
        valueTypeWidth(p.valueType ?? 'int32')
      )
      const totalWidth = extraWidths.reduce((sum, w) => sum + w, width!)
      lines.push(
        `      ${returnType} __ret = ${callExpr};`,
        `      if (respCap < ${totalWidth}) { *respLen = 0; return 1; }`,
        `      memcpy(resp, &__ret, ${width});`
      )
      let offset = width!
      for (const p of outValueParams) {
        const w = valueTypeWidth(p.valueType ?? 'int32')
        const varName = `arg_${p.name}`
        lines.push(`      memcpy(resp + ${offset}, &${varName}, ${w});`)
        offset += w
      }
      lines.push(`      *respLen = ${offset};`, `      return 0;`)
    }
  }

  lines.push(`    }`)
  return lines.join('\n')
}

/**
 * 51-10: generates `native/steam-bridge/generated/bridge_dispatch.h` --
 * the helper's half of the SAME wire this file's `generateShimC` already
 * generates the shim's half of. `main()` writes this alongside
 * `steam_api_shim.c`/`steam_api.def`, from the SAME loaded manifest set.
 *
 * Only manifests/methods with `isWireDispatchMethod` true are considered --
 * every one of them MUST declare `helperFlat` (method) and `helperInterface`
 * (manifest), enforced by `assertDispatchable` (never a silent shim/helper
 * drift: a wire method the shim marshals that the helper cannot serve is a
 * generation-time error, not a runtime STATUS_ERR surprise).
 */
export function generateDispatchHeader(
  manifests: InterfaceManifestV2[]
): string {
  const sortedManifests = [...manifests].sort((a, b) => a.ordinal - b.ordinal)
  const dispatchManifests = sortedManifests.filter((m) =>
    m.methods.some((method) => isWireDispatchMethod(m, method))
  )

  // Validate every dispatch-eligible method up front (clear, grouped error
  // reporting -- never a half-generated header on the first bad method).
  for (const manifest of dispatchManifests) {
    for (const method of manifest.methods) {
      if (isWireDispatchMethod(manifest, method)) {
        assertDispatchable(manifest, method)
      }
    }
  }

  const accessorTypedefs = `typedef void *(*BDAccessorFn_t)(void);\n`

  const selfDecls = dispatchManifests
    .map((m) => {
      const ordinalDefine = `#define BD_ORDINAL_${m.interface} ${m.ordinal}`
      return (
        `${ordinalDefine}\n` +
        `static BDAccessorFn_t ${dispatchAccessorVarName(m)};\n` +
        `static void *${dispatchSelfVarName(m)};\n`
      )
    })
    .join('')

  const flatTypedefsAndDecls = dispatchManifests
    .map((m) => {
      const wireMethods = [...m.methods]
        .filter((method) => isWireDispatchMethod(m, method))
        .sort((a, b) => a.slot - b.slot)
      return wireMethods
        .map((method) => {
          const typedefName = `BDFlatFn_${m.interface}_${method.name}_t`
          const realParams = method.params
            .map((p) => dispatchCType(p.type))
            .join(', ')
          const paramList = ['void *', realParams].filter(Boolean).join(', ')
          const slotDefine = `#define BD_SLOT_${m.interface}_${method.name} ${method.slot}`
          return (
            `${slotDefine}\n` +
            `typedef ${dispatchCType(method.returns)} (*${typedefName})(${paramList});\n` +
            `static ${typedefName} ${dispatchFlatVarName(m, method)};\n`
          )
        })
        .join('')
    })
    .join('')

  const initBody = dispatchManifests
    .map((m) => {
      const accessorVar = dispatchAccessorVarName(m)
      const selfVar = dispatchSelfVarName(m)
      const accessorResolve =
        `  ${accessorVar} = (BDAccessorFn_t)dlsym(dylibHandle, "${m.helperInterface}");\n` +
        `  ${selfVar} = ${accessorVar} ? ${accessorVar}() : NULL;\n`
      const wireMethods = [...m.methods]
        .filter((method) => isWireDispatchMethod(m, method))
        .sort((a, b) => a.slot - b.slot)
      const flatResolves = wireMethods
        .map((method) => {
          const typedefName = `BDFlatFn_${m.interface}_${method.name}_t`
          return `  ${dispatchFlatVarName(m, method)} = (${typedefName})dlsym(dylibHandle, "${method.helperFlat}");\n`
        })
        .join('')
      return accessorResolve + flatResolves
    })
    .join('')

  const dispatchCases = dispatchManifests
    .map((m) => {
      const wireMethods = [...m.methods]
        .filter((method) => isWireDispatchMethod(m, method))
        .sort((a, b) => a.slot - b.slot)
      return wireMethods.map((method) => emitDispatchCase(m, method)).join('\n')
    })
    .join('\n')

  return (
    `/**\n` +
    ` * GENERATED FILE -- DO NOT EDIT BY HAND.\n` +
    ` * Produced by meta/gen_vtables.ts (\`pnpm gen-vtables\`), 51-10 -- the\n` +
    ` * helper-side (native arm64, macOS) half of the SAME wire\n` +
    ` * native/steam-bridge/generated/steam_api_shim.c marshals the shim side\n` +
    ` * of. #include'd from native/steam-bridge/helper/bridge_helper.c.\n` +
    ` *\n` +
    ` * Interfaces covered: ${dispatchManifests.map((m) => m.interface).join(', ')}.\n` +
    ` */\n` +
    `#ifndef GAMELIB_BRIDGE_DISPATCH_H\n` +
    `#define GAMELIB_BRIDGE_DISPATCH_H\n\n` +
    `#include <dlfcn.h>\n` +
    `#include <stdint.h>\n` +
    `#include <string.h>\n\n` +
    `/*\n${WIRE_LAYOUT_DOC}*/\n` +
    `#define BD_WIRE_IN_STRING_MAX_BYTES ${WIRE_IN_STRING_MAX_BYTES}\n\n` +
    `// Digest of the SAME sorted (interface, ordinal, slot, layout) wire-method\n` +
    `// tuples BRIDGE_SHIM_TABLE_HASH (steam_api_shim.c) embeds -- a drift\n` +
    `// between the two means the shim and this dispatch table disagree about\n` +
    `// what is on the wire.\n` +
    `#define BRIDGE_DISPATCH_TABLE_HASH "${computeWireTableHash(manifests)}"\n\n` +
    `// Response scratch -- bridge_dispatch() never writes past respCap, which\n` +
    `// the caller (bridge_helper.c) sizes to this constant.\n` +
    `#define BRIDGE_DISPATCH_RESP_SCRATCH_BYTES ${BRIDGE_DISPATCH_RESP_SCRATCH_BYTES}\n\n` +
    `${accessorTypedefs}\n` +
    `${selfDecls}\n` +
    `${flatTypedefsAndDecls}\n` +
    `// D-51-04: identity-only mode -- set once by bridge_helper.c's argv\n` +
    `// parsing (--identity-only/--report-appid), read by every dispatch case\n` +
    `// above that gates an app-scoped family or special-cases SteamUtils\n` +
    `// GetAppID.\n` +
    `static int g_bd_identity_only = 0;\n` +
    `static uint32_t g_bd_report_appid = 0;\n\n` +
    `void bridge_dispatch_set_identity_only(int on, uint32_t reportAppId) {\n` +
    `  g_bd_identity_only = on ? 1 : 0;\n` +
    `  g_bd_report_appid = reportAppId;\n` +
    `}\n\n` +
    `// NULL-tolerant: a dlsym failure here leaves the affected self/flat\n` +
    `// pointer NULL, and every dispatch case above checks for NULL before\n` +
    `// calling through (T-51-23) -- never fatal to the whole helper.\n` +
    `int bridge_dispatch_init(void *dylibHandle) {\n` +
    `  if (!dylibHandle) return 0;\n` +
    `${initBody}` +
    `  return 1;\n` +
    `}\n\n` +
    `uint8_t bridge_dispatch(uint16_t ordinal, uint16_t slot, const uint8_t *arg, uint32_t argLen,\n` +
    `                         uint8_t *resp, uint32_t respCap, uint32_t *respLen) {\n` +
    `  (void)arg; (void)argLen;\n` +
    `  *respLen = 0;\n` +
    `  switch (((uint32_t)ordinal << 16) | (uint32_t)slot) {\n` +
    `${dispatchCases}\n` +
    `    default:\n` +
    `      return 1; // T-51-23: unknown (ordinal, slot) pair -- never read\n` +
    `  }\n` +
    `}\n\n` +
    `#endif /* GAMELIB_BRIDGE_DISPATCH_H */\n`
  )
}

/**
 * `arches`-guarded row open/close for a single manifest -- `#if
 * defined(__i386__)` for an x86-only manifest, `#if defined(__x86_64__)`
 * for an x64-only one, no guard at all for a manifest that targets both
 * (every manifest this plan generates is x86-only; 51-15 adds the first
 * x64/dual-arch manifests).
 */
function archGuard(arches: ArchToken[]): { open: string; close: string } {
  const hasX86 = arches.includes('x86')
  const hasX64 = arches.includes('x64')
  if (hasX86 && !hasX64)
    return { open: '#if defined(__i386__)\n', close: '#endif\n' }
  if (hasX64 && !hasX86)
    return { open: '#if defined(__x86_64__)\n', close: '#endif\n' }
  return { open: '', close: '' }
}

/**
 * `g_iface_table[]` -- one row per manifest (`version`, `family`,
 * `instance`), each guarded on that manifest's own `arches` -- plus
 * `resolve_bare_iface()` and one exported bare accessor per distinct
 * family, matching 51-06 Task 2's artifact spec. The bare accessor reads
 * `gamelib_bridge.cfg`'s `iface.<Family>=<Version>` pairs (parsed into
 * `g_iface_cfg_entries` above) and returns the table instance whose
 * (family, version) matches -- NULL when the cfg key is absent or names a
 * version this shim does not serve.
 */
function emitIfaceTableAndBareAccessors(
  manifests: InterfaceManifestV2[]
): string {
  const rows = manifests
    .map((m) => {
      const { open, close } = archGuard(m.arches)
      const instanceName = `g_${m.interface.toLowerCase()}_instance`
      return `${open}  { "${m.interface}", "${cfgFamilyName(m.family)}", &${instanceName} },\n${close}`
    })
    .join('')

  const families = [...new Set(manifests.map((m) => m.family))].sort()
  const bareAccessors = families
    .map(
      (family) =>
        `void *${bareAccessorName(family)}(void) {\n` +
        `  return resolve_bare_iface("${cfgFamilyName(family)}");\n` +
        `}\n`
    )
    .join('\n')

  return (
    `typedef struct { const char *version; const char *family; void *instance; } GIfaceTableEntry;\n` +
    `static const GIfaceTableEntry g_iface_table[] = {\n${rows}};\n` +
    `#define G_IFACE_TABLE_LEN (sizeof(g_iface_table) / sizeof(g_iface_table[0]))\n\n` +
    `static void *resolve_bare_iface(const char *family) {\n` +
    `  load_bridge_port_once();\n` +
    `  const char *version = NULL;\n` +
    `  int i;\n` +
    `  for (i = 0; i < g_iface_cfg_count; i++) {\n` +
    `    if (strcmp(g_iface_cfg_entries[i].family, family) == 0) {\n` +
    `      version = g_iface_cfg_entries[i].version;\n` +
    `      break;\n` +
    `    }\n` +
    `  }\n` +
    `  if (!version) return NULL;\n` +
    `  for (i = 0; i < (int)G_IFACE_TABLE_LEN; i++) {\n` +
    `    if (strcmp(g_iface_table[i].family, family) == 0 && strcmp(g_iface_table[i].version, version) == 0) {\n` +
    `      return (void *)g_iface_table[i].instance;\n` +
    `    }\n` +
    `  }\n` +
    `  return NULL;\n` +
    `}\n\n` +
    // 51-15: the single EXACT version-string lookup both
    // SteamInternal_CreateInterface (emitted after this section) and the
    // ISteamClient GetISteamXxx version-lookup stubs (vtableSections,
    // emitted BEFORE this section via the preamble's forward declaration)
    // share -- unlike resolve_bare_iface above, this never consults
    // gamelib_bridge.cfg at all, it matches the literal string the game
    // passed.
    `static void *resolve_iface_by_exact_version(const char *version) {\n` +
    `  int i;\n` +
    `  if (version == NULL) return NULL;\n` +
    `  for (i = 0; i < (int)G_IFACE_TABLE_LEN; i++) {\n` +
    `    if (strcmp(g_iface_table[i].version, version) == 0) {\n` +
    `      return (void *)g_iface_table[i].instance;\n` +
    `    }\n` +
    `  }\n` +
    `  return NULL;\n` +
    `}\n\n` +
    `${bareAccessors}`
  )
}

/**
 * 51-06 Task 2: `arch` selects which manifests this .def covers (default
 * `'x86'`, the only target this plan builds) -- a manifest whose `arches`
 * does not include the requested arch contributes neither its flat
 * accessor nor its family's bare accessor. 51-15 calls this with `'x64'`
 * to emit `steam_api64.def`'s own export list from the SAME manifest set.
 */
export function generateDefFile(
  manifests: InterfaceManifest[],
  arch: ArchToken = 'x86'
): string {
  const archManifests = manifests.filter((m) => m.arches.includes(arch))
  const sortedManifests = [...archManifests].sort(
    (a, b) => a.ordinal - b.ordinal
  )
  const accessorExports = sortedManifests.map((m) => flatAccessorName(m))
  const families = [...new Set(sortedManifests.map((m) => m.family))].sort()
  const bareAccessorExports = families.map((f) => bareAccessorName(f))
  const libraryName = arch === 'x64' ? 'steam_api64' : 'steam_api'
  // 51-15: the modern-SDK lookup family is Win64-only -- see
  // MODERN_LOOKUP_FLAT_EXPORTS' doc comment.
  const modernLookupExports = arch === 'x64' ? MODERN_LOOKUP_FLAT_EXPORTS : []
  const lines = [
    `LIBRARY ${libraryName}`,
    'EXPORTS',
    ...FLAT_EXPORTS_SUPERSET,
    ...GAMESERVER_FLAT_STUBS,
    ...modernLookupExports,
    ...accessorExports,
    ...bareAccessorExports
  ]
  return lines.join('\n') + '\n'
}

// ---------------------------------------------------------------------------
// Main (guarded -- never runs on a test import of this module)
// ---------------------------------------------------------------------------

const SDK_DIR = join('meta', 'sdk')
const OUT_DIR = join('native', 'steam-bridge', 'generated')

/**
 * Loads every `*.manifest.json` in `meta/sdk`, sorted by ordinal -- 51-06:
 * a directory listing, not a fixed, literal pair of `loadManifest()` calls,
 * so adding the next manifest (51-11 onward) is "drop a file in meta/sdk",
 * never a generator source edit.
 */
function loadAllManifests(): InterfaceManifestV2[] {
  const files = readdirSync(SDK_DIR).filter((f) => f.endsWith('.manifest.json'))
  const manifests = files.map(
    (f) =>
      JSON.parse(readFileSync(join(SDK_DIR, f), 'utf-8')) as InterfaceManifestV2
  )
  return manifests.sort((a, b) => a.ordinal - b.ordinal)
}

export function main(): void {
  const manifests = loadAllManifests()

  const allErrors = manifests.flatMap((m) => validateManifest(m, manifests))
  if (allErrors.length > 0) {
    console.error('gen_vtables: manifest validation failed:')
    for (const error of allErrors) {
      console.error(`  - ${error}`)
    }
    process.exit(1)
  }

  mkdirSync(OUT_DIR, { recursive: true })

  const shimC = generateShimC(manifests)
  const defFile = generateDefFile(manifests, 'x86')
  const defFile64 = generateDefFile(manifests, 'x64')
  const dispatchHeader = generateDispatchHeader(manifests)

  writeFileSync(join(OUT_DIR, 'steam_api_shim.c'), shimC)
  writeFileSync(join(OUT_DIR, 'steam_api.def'), defFile)
  writeFileSync(join(OUT_DIR, 'steam_api64.def'), defFile64)
  writeFileSync(join(OUT_DIR, 'bridge_dispatch.h'), dispatchHeader)

  const totalSlots = manifests.reduce((sum, m) => sum + m.methods.length, 0)
  console.log(
    `Generated steam_api shim: ${manifests.length} interfaces, ` +
      `${totalSlots} vtable slots, ` +
      `${FLAT_EXPORTS_SUPERSET.length + manifests.length} flat exports.`
  )
}

// NOTE: this script is run via `node meta/runTs.cjs` (the meta/ convention,
// package.json `gen-vtables`), which DOES set `require.main` -- but this
// module is also imported directly by its jest suite, so the usual
// `require.main === module` idiom would run this at import time under test
// too. `JEST_WORKER_ID` is set by Jest for every worker, so this reliably
// distinguishes "imported under test" from "run as a CLI" (same guard as
// meta/buildCrossoverIndex.ts).
if (!process.env.JEST_WORKER_ID) {
  try {
    main()
  } catch (error: unknown) {
    console.error(error)
    process.exit(1)
  }
}
