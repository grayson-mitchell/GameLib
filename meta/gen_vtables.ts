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

import {
  MSVC_CCALLBACKBASE_OFFSETS,
  MSVC_CCALLBACKBASE_VSLOT_RUN_1ARG,
  STEAM_CALLBACK_FLAG_GAMESERVER,
  STEAM_CALLBACK_FLAG_REGISTERED
} from './msvcCallbackLayout'

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
export type ParamKind =
  | 'value'
  | 'in-string'
  | 'out-value'
  | 'out-buffer'
  | 'null-in'

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
  /** For `kind: 'out-buffer'` only (53-14) -- optional name of a sibling
   * `out-value` param that reports how many bytes the callee actually
   * produced (e.g. GetAuthSessionTicket's `pcbTicket`). The helper sends
   * min(that value, capacity) bytes instead of the whole capacity. */
  lenParam?: string
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
  /** 53-14: number of trailing NULL pointer arguments the helper appends to
   * the native flat call, AFTER every declared param. For a game-side
   * signature older than the Mac Steam's native one (SteamUser021's 3-arg
   * GetAuthSessionTicket vs the 1.59+ 5-arg flat function, whose last arg is
   * a SteamNetworkingIdentity*). Never sent on the wire. */
  helperTrailingNullArgs?: number
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

/**
 * Win64 C ABI (free functions, which the flat exports are): an aggregate of
 * exactly 1, 2, 4 or 8 bytes is returned in RAX; any other size is returned
 * through a caller-allocated hidden pointer passed in RCX, which shifts `self`
 * to RDX, and the callee returns that pointer in RAX (53-REVIEW CR-01).
 */
export function isRaxStructSize(n: number): boolean {
  return n === 1 || n === 2 || n === 4 || n === 8
}

/** True for a `class` return whose flat export must use the hidden-pointer
 * form `(void *ret, void *self, ...)`. */
export function isHiddenPointerFlatReturn(method: MethodSignature): boolean {
  return (
    method.returnKind === 'class' &&
    typeof method.structSize === 'number' &&
    !isRaxStructSize(method.structSize)
  )
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

    if (manifest.arches.includes('x64') && method.params[0]?.name === '_ret') {
      errors.push(
        `${methodCtx}: x64 manifest models a struct return as a leading "_ret" parameter (Proton __thiscall shape); model as returnKind 'class' with structSize instead (53-10 CR-01/WR-08)`
      )
    }

    if (method.name.endsWith('_TESTONLY')) {
      errors.push(
        `${methodCtx}: production manifest must not contain a _TESTONLY method`
      )
    }

    if (
      method.helperTrailingNullArgs !== undefined &&
      (!Number.isInteger(method.helperTrailingNullArgs) ||
        method.helperTrailingNullArgs < 0 ||
        method.helperTrailingNullArgs > 4)
    ) {
      errors.push(
        `${methodCtx}: helperTrailingNullArgs must be an integer 0..4`
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
        } else if (kind === 'out-buffer' && p.lenParam) {
          const sib = method.params.find((q) => q.name === p.lenParam)
          if (!sib || sib.kind !== 'out-value') {
            errors.push(
              `${methodCtx}: out-buffer param "${p.name}" lenParam "${p.lenParam}" must name a sibling out-value param`
            )
          }
        } else if (kind === 'null-in') {
          // 53-14: never sent; the helper passes NULL. Only a
          // SteamNetworkingIdentity-family const pointer may be dropped
          // this way -- any other pointer would be a silently-wrong zero.
          if (!/^const SteamNetworkingIdentity\w*\*$/.test(p.type)) {
            errors.push(
              `${methodCtx}: null-in param "${p.name}" (type "${p.type}") is only allowed for const SteamNetworkingIdentity-family pointers`
            )
          }
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
    sizeParam, read at call time and capped at WIRE_OUT_BUFFER_MAX_BYTES
    (a negative sizeParam sends capacity 0).
  - kind 'null-in' (53-14): nothing -- a const SteamNetworkingIdentity*
    param is NEVER sent; the helper passes NULL for it.

Response blob (per method):
  - the return value: 0 bytes (returnKind 'void'), 4 bytes (int32/pointer/
    float), 8 bytes (int64/double), [u32 len][bytes] (returnKind 'string',
    decoded by the dedicated string-return branch), or structSize bytes
    (returnKind 'class', the sret branch).
  - then, for every 'out-value' param in declaration order: valueType's
    width (int32/uint32/float/bool = 4 bytes, uint64 = 8 bytes).
  - then, for every 'out-buffer' param in declaration order: [u32 len][len
    bytes] -- len is what the helper actually has (when the param names a
    lenParam, min(that out-value, capacity)); the shim copies
    min(len, capacity) and NUL-terminates only when the param's own type
    is a NUL-terminated string type (e.g. 'char*').
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

/** True when `name` is already one of the fixed GAMESERVER flat stubs. */
export function hasGameServerFlatStub(name: string): boolean {
  return (GAMESERVER_FLAT_STUBS as readonly string[]).includes(name)
}

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

// Phase 53 (53-04, D-53-06 as amended 2026-10-25 by user decision): the
// non-interface names Steamworks.NET P/Invokes from steam_api64.dll
// (the measured fixture steamworksNetFlatNames.json) that no other export
// list carries. They ship up front as x64-ONLY safe no-ops rather than after
// a live `missing-symbols` fault. Prototypes are GameLib-authored from the
// public Steamworks.NET NativeMethods.cs DllImport declarations (never Valve
// header text, D-09). Win64 is caller-cleans, so a body may declare fewer
// parameters than the real function takes.
//
// Return codes: V void, B bool (false), I int32 (0), U uint32 (0),
// Q uint64 (0), P pointer (NULL), S const char* (static empty string).
// A spec may carry a parameter list when the body writes through it
// (`T` = a `char *buf, size_t cap` pair after `self`; `L` = an `int *cbLen`
// out-length). ManualDispatch_GetNextCallback / _GetAPICallResult answer
// false, so no callback is ever delivered through them -- the same outcome as
// the existing no-op SteamAPI_RunCallbacks.
const LIFECYCLE_NOOP_SPECS: Readonly<Record<string, string>> = {
  SteamAPI_GetSteamInstallPath: 'S',
  SteamAPI_ManualDispatch_FreeLastCallback: 'V',
  SteamAPI_ManualDispatch_GetAPICallResult: 'B',
  SteamAPI_ManualDispatch_GetNextCallback: 'B',
  SteamAPI_ManualDispatch_Init: 'V',
  SteamAPI_ManualDispatch_RunFrame: 'V',
  SteamAPI_ReleaseCurrentThreadMemory: 'V',
  SteamAPI_SetBreakpadAppID: 'V',
  SteamAPI_SetMiniDumpComment: 'V',
  SteamAPI_SetTryCatchCallbacks: 'V',
  SteamAPI_SteamNetworkingIPAddr_Clear: 'V',
  SteamAPI_SteamNetworkingIPAddr_GetFakeIPType: 'I',
  SteamAPI_SteamNetworkingIPAddr_GetIPv4: 'U',
  SteamAPI_SteamNetworkingIPAddr_IsEqualTo: 'B',
  SteamAPI_SteamNetworkingIPAddr_IsFakeIP: 'B',
  SteamAPI_SteamNetworkingIPAddr_IsIPv4: 'B',
  SteamAPI_SteamNetworkingIPAddr_IsIPv6AllZeros: 'B',
  SteamAPI_SteamNetworkingIPAddr_IsLocalHost: 'B',
  SteamAPI_SteamNetworkingIPAddr_ParseString: 'B',
  SteamAPI_SteamNetworkingIPAddr_SetIPv4: 'V',
  SteamAPI_SteamNetworkingIPAddr_SetIPv6: 'V',
  SteamAPI_SteamNetworkingIPAddr_SetIPv6LocalHost: 'V',
  SteamAPI_SteamNetworkingIPAddr_ToString: 'T',
  SteamAPI_SteamNetworkingIdentity_Clear: 'V',
  SteamAPI_SteamNetworkingIdentity_GetFakeIPType: 'I',
  SteamAPI_SteamNetworkingIdentity_GetGenericBytes: 'L',
  SteamAPI_SteamNetworkingIdentity_GetGenericString: 'S',
  SteamAPI_SteamNetworkingIdentity_GetIPAddr: 'P',
  SteamAPI_SteamNetworkingIdentity_GetIPv4: 'U',
  SteamAPI_SteamNetworkingIdentity_GetPSNID: 'Q',
  SteamAPI_SteamNetworkingIdentity_GetStadiaID: 'Q',
  SteamAPI_SteamNetworkingIdentity_GetSteamID: 'Q',
  SteamAPI_SteamNetworkingIdentity_GetSteamID64: 'Q',
  SteamAPI_SteamNetworkingIdentity_GetXboxPairwiseID: 'S',
  SteamAPI_SteamNetworkingIdentity_IsEqualTo: 'B',
  SteamAPI_SteamNetworkingIdentity_IsFakeIP: 'B',
  SteamAPI_SteamNetworkingIdentity_IsInvalid: 'B',
  SteamAPI_SteamNetworkingIdentity_IsLocalHost: 'B',
  SteamAPI_SteamNetworkingIdentity_ParseString: 'B',
  SteamAPI_SteamNetworkingIdentity_SetGenericBytes: 'B',
  SteamAPI_SteamNetworkingIdentity_SetGenericString: 'B',
  SteamAPI_SteamNetworkingIdentity_SetIPAddr: 'V',
  SteamAPI_SteamNetworkingIdentity_SetIPv4Addr: 'V',
  SteamAPI_SteamNetworkingIdentity_SetLocalHost: 'V',
  SteamAPI_SteamNetworkingIdentity_SetPSNID: 'V',
  SteamAPI_SteamNetworkingIdentity_SetStadiaID: 'V',
  SteamAPI_SteamNetworkingIdentity_SetSteamID: 'V',
  SteamAPI_SteamNetworkingIdentity_SetSteamID64: 'V',
  SteamAPI_SteamNetworkingIdentity_SetXboxPairwiseID: 'B',
  SteamAPI_SteamNetworkingIdentity_ToString: 'T',
  SteamAPI_SteamNetworkingMessage_t_Release: 'V',
  SteamAPI_UseBreakpadCrashHandler: 'V',
  SteamAPI_WriteMiniDump: 'V',
  SteamGameServerClient: 'P',
  SteamGameServer_ReleaseCurrentThreadMemory: 'V'
}

export const LIFECYCLE_NOOP_EXPORTS: readonly string[] =
  Object.keys(LIFECYCLE_NOOP_SPECS).sort()

// quick 261025-t7i: Unclaimed World (284100) loads CSteamworks64.dll
// (Steamworks.NET 7.0.0 / Steamworks SDK 1.34), which imports six names from
// steam_api64.dll that no other list carried. Measured with objdump -p: of
// its 29 imports, exactly these were missing, and Wine crashed on
// `unimplemented function steam_api64.dll.SteamAPI_InitSafe` before HELLO.
// x64-ONLY: the x86 wrapper (CSteamworks.dll) would additionally need
// SteamClient, GetHSteamUser/Pipe, VR_* and an x86 SteamClient015 object, and
// no installed title launches x86, so x86 stays deferred (D-53-09).
//
// SteamAPI_InitSafe shares SteamAPI_Init's hello helper but reports init
// code 2 exactly once; it never calls SteamAPI_Init() (that would report
// twice). Win64 is caller-cleans, so the `(void)` lists are arity-safe.
// g_pSteamClientGameServer is a data export: CSteamworks reads it only after
// a successful SteamGameServer_InitSafe, which always answers 0.
export const LEGACY_CSTEAMWORKS_X64_EXPORT_BODIES: Readonly<
  Record<string, string>
> = {
  SteamAPI_InitSafe:
    'int SteamAPI_InitSafe(void) {\n' +
    '  const char *volatile gamelib_marker_keepalive = g_gamelib_shim_marker;\n' +
    '  (void)gamelib_marker_keepalive;\n' +
    '  int ok = gamelib_bridge_hello();\n' +
    '  if (ok) gamelib_report_init(GAMELIB_INIT_FN_STEAMAPI_INITSAFE, 1);\n' +
    '  return ok;\n' +
    '}',
  SteamGameServer_InitSafe: 'int SteamGameServer_InitSafe(void) { return 0; }',
  Steam_RunCallbacks: 'void Steam_RunCallbacks(void) { }',
  Steam_RegisterInterfaceFuncs: 'void Steam_RegisterInterfaceFuncs(void) { }',
  Steam_GetHSteamUserCurrent:
    'int Steam_GetHSteamUserCurrent(void) { return 1; }',
  g_pSteamClientGameServer: 'void *g_pSteamClientGameServer = NULL;'
}

export const LEGACY_CSTEAMWORKS_X64_EXPORTS: readonly string[] = Object.keys(
  LEGACY_CSTEAMWORKS_X64_EXPORT_BODIES
).sort()

function lifecycleNoopBody(name: string, spec: string): string {
  switch (spec) {
    case 'V':
      return `void ${name}(void) { }`
    case 'B':
      return `int ${name}(void) { return 0; }`
    case 'I':
      return `int ${name}(void) { return 0; }`
    case 'U':
      return `uint32_t ${name}(void) { return 0; }`
    case 'Q':
      return `uint64_t ${name}(void) { return 0; }`
    case 'P':
      return `void *${name}(void) { return NULL; }`
    case 'S':
      return `const char *${name}(void) { return g_gamelib_empty_string; }`
    case 'T':
      // (self, char *buf, size_t cbBuf[, bool]) -- NUL-terminate the buffer.
      return (
        `void ${name}(void *self, char *buf, size_t cbBuf) {\n` +
        `  (void)self;\n` +
        `  if (buf != NULL && cbBuf > 0) buf[0] = 0;\n` +
        `}`
      )
    case 'L':
      // (self, int *cbLen) -> const uint8_t * : no bytes, zero length.
      return (
        `void *${name}(void *self, int *cbLen) {\n` +
        `  (void)self;\n` +
        `  if (cbLen != NULL) *cbLen = 0;\n` +
        `  return NULL;\n` +
        `}`
      )
    default:
      throw new Error(`unknown lifecycle no-op spec '${spec}' for ${name}`)
  }
}

export const LIFECYCLE_NOOP_EXPORT_BODIES: Readonly<Record<string, string>> =
  Object.fromEntries(
    LIFECYCLE_NOOP_EXPORTS.map((name) => [
      name,
      lifecycleNoopBody(name, LIFECYCLE_NOOP_SPECS[name])
    ])
  )

/** Registry table capacity; overflow is counted and ignored (T-55-17). */
export const CALLBACK_REGISTRY_CAPACITY = 512
/** Minimum spacing between drain round trips (ms). */
export const CALLBACK_DRAIN_MIN_INTERVAL_MS = 30
/** Max messages pulled per RunCallbacks call. */
export const CALLBACK_DRAIN_MAX_PER_RUN = 4
/** Drain buffer: u32 count + i32 id + u32 cub + 2572 param bytes. Mirrors
 *  helper GL_CBQ_DRAIN_RESP_MAX_BYTES (cross-pinned in gen_vtables.test.ts). */
export const CALLBACK_DRAIN_RESP_MAX_BYTES = 4 + 4 + 4 + 2572
/** Relayed callback ids and their exact param sizes; mirrors the helper
 *  allowlist row in gamelib_cbqueue.h. */
export const CALLBACK_RELAY_TABLE = [{ id: 168, size: 2572 }] as const

const CALLBACK_DRAIN_FAIL_BACKOFF_AFTER = 8
const CALLBACK_DRAIN_BACKOFF_MS = 1000

/**
 * Portable C callback registry + out-of-lock dispatcher (55-04, P55-3).
 *
 * Embedder contract (all must be defined BEFORE this text; the embedder also
 * includes stdint.h/string.h): GL_CB_LOCK(), GL_CB_UNLOCK(), THISCALL,
 * GL_CB_THREAD_ID() (a uint32_t id of the calling thread), GL_CB_YIELD()
 * (give up the CPU briefly; called with no lock held),
 * `uint32_t gl_cb_now_ms(void)`, and
 * `int gl_cb_transport_drain(uint8_t *buf, uint32_t cap, uint32_t *lenOut)`
 * (returns 1 on a good reply, 0 on any failure).
 *
 * Lock rule: the registry lock is NEVER held across the transport or a Run
 * call, so a handler may unregister, register or make a bridge call.
 *
 * In-flight rule (55 WR-01): only one RunCallbacks dispatch is active at a
 * time (a concurrent or re-entrant RunCallbacks returns at once), and while a
 * game object's Run is in flight, an UnregisterCallback for that SAME object
 * from ANOTHER thread waits until Run returns. Without this the object could
 * be unregistered and destroyed between the "still registered" check and the
 * Run call. Unregister from the dispatching thread itself (a handler
 * unregistering itself) never waits.
 */
export function generateCallbackRegistryC(): string {
  const x86 = MSVC_CCALLBACKBASE_OFFSETS.x86
  const x64 = MSVC_CCALLBACKBASE_OFFSETS.x64
  const relayRows = CALLBACK_RELAY_TABLE.map(
    (r) => `  {${r.id}, ${r.size}u}`
  ).join(',\n')
  return `/* ---- callback registry (generated by meta/gen_vtables.ts, P55-3) ---- */
#define GL_CB_REGISTRY_CAPACITY ${CALLBACK_REGISTRY_CAPACITY}
#define GL_CB_DRAIN_MIN_INTERVAL_MS ${CALLBACK_DRAIN_MIN_INTERVAL_MS}
#define GL_CB_DRAIN_MAX_PER_RUN ${CALLBACK_DRAIN_MAX_PER_RUN}
#define GL_CB_DRAIN_FAIL_BACKOFF_AFTER ${CALLBACK_DRAIN_FAIL_BACKOFF_AFTER}
#define GL_CB_DRAIN_BACKOFF_MS ${CALLBACK_DRAIN_BACKOFF_MS}
#define GL_CB_DRAIN_RESP_MAX_BYTES ${CALLBACK_DRAIN_RESP_MAX_BYTES}
#define GL_CB_FLAG_REGISTERED 0x${STEAM_CALLBACK_FLAG_REGISTERED.toString(16).padStart(2, '0')}
#define GL_CB_FLAG_GAMESERVER 0x${STEAM_CALLBACK_FLAG_GAMESERVER.toString(16).padStart(2, '0')}
/* MEASURED, not assumed: vtable slot of CCallbackBase::Run(void*). MSVC
 * reverses overloaded virtuals, so slot 0 is Run(void*, bool, SteamAPICall_t).
 * Source: meta/msvcCallbackLayout.ts, checked against the committed dump
 * meta/__tests__/fixtures/msvc_ccallbackbase.layout.txt. */
#define GL_CB_VSLOT_RUN_1ARG ${MSVC_CCALLBACKBASE_VSLOT_RUN_1ARG}
#if defined(__i386__)
#define GL_CB_FLAGS_OFF ${x86.flags}
#define GL_CB_ICALLBACK_OFF ${x86.iCallback}
#else
#define GL_CB_FLAGS_OFF ${x64.flags}
#define GL_CB_ICALLBACK_OFF ${x64.iCallback}
#endif

typedef void (THISCALL *gl_cb_run1_fn)(void *self, void *pvParam);

typedef struct {
  void *cb;
  int32_t iCallback;
} gl_cb_entry;

typedef struct {
  int32_t id;
  uint32_t size;
} gl_cb_relay_row;

static const gl_cb_relay_row gl_cb_relay_table[] = {
${relayRows}
};

static gl_cb_entry gl_cb_entries[GL_CB_REGISTRY_CAPACITY];
static uint32_t gl_cb_count;
static uint32_t gl_cb_relay_count;
static uint32_t gl_cb_last_drain_ms;
static int gl_cb_have_drained;
static uint32_t gl_cb_fail_count;
static uint32_t gl_cb_overflow;
/* In-flight state (55 WR-01), all guarded by the registry lock. */
static int gl_cb_running;
static uint32_t gl_cb_run_tid;
static void *gl_cb_dispatching;

static uint32_t gl_cb_relay_size(int32_t id) {
  uint32_t i;
  for (i = 0; i < sizeof(gl_cb_relay_table) / sizeof(gl_cb_relay_table[0]); i++) {
    if (gl_cb_relay_table[i].id == id) return gl_cb_relay_table[i].size;
  }
  return 0;
}

/* Caller holds the lock. Returns index or -1. */
static int gl_cb_find(void *cb) {
  uint32_t i;
  for (i = 0; i < gl_cb_count; i++) {
    if (gl_cb_entries[i].cb == cb) return (int)i;
  }
  return -1;
}

static void gl_cb_register(void *cb, int iCallback) {
  uint8_t *flags;
  int32_t id = (int32_t)iCallback;
  int idx;
  if (!cb) return;
  GL_CB_LOCK();
  idx = gl_cb_find(cb);
  if (idx >= 0) {
    if (gl_cb_relay_size(gl_cb_entries[idx].iCallback)) gl_cb_relay_count--;
    gl_cb_entries[idx].iCallback = id;
  } else if (gl_cb_count >= GL_CB_REGISTRY_CAPACITY) {
    gl_cb_overflow++;
    GL_CB_UNLOCK();
    return;
  } else {
    gl_cb_entries[gl_cb_count].cb = cb;
    gl_cb_entries[gl_cb_count].iCallback = id;
    gl_cb_count++;
  }
  if (gl_cb_relay_size(id)) gl_cb_relay_count++;
  /* OR, never assign: preserve the gameserver bit. The SDK destructor
   * unregisters only when the registered bit is set. */
  flags = (uint8_t *)cb + GL_CB_FLAGS_OFF;
  *flags = (uint8_t)(*flags | GL_CB_FLAG_REGISTERED);
  memcpy((uint8_t *)cb + GL_CB_ICALLBACK_OFF, &id, sizeof(id));
  GL_CB_UNLOCK();
}

static void gl_cb_unregister(void *cb) {
  uint8_t *flags;
  int idx;
  if (!cb) return;
  GL_CB_LOCK();
  /* WR-01: another thread is inside this object's Run -- wait for it to
   * return before the caller may destroy the object. */
  while (gl_cb_dispatching == cb && gl_cb_run_tid != GL_CB_THREAD_ID()) {
    GL_CB_UNLOCK();
    GL_CB_YIELD();
    GL_CB_LOCK();
  }
  idx = gl_cb_find(cb);
  if (idx >= 0) {
    if (gl_cb_relay_size(gl_cb_entries[idx].iCallback)) gl_cb_relay_count--;
    gl_cb_count--;
    gl_cb_entries[idx] = gl_cb_entries[gl_cb_count];
  }
  /* the game passes a live object: always clear its registered bit */
  flags = (uint8_t *)cb + GL_CB_FLAGS_OFF;
  *flags = (uint8_t)(*flags & ~GL_CB_FLAG_REGISTERED);
  GL_CB_UNLOCK();
}

/* Empties the table only; never touches game object memory. */
static void gl_cb_clear_all(void) {
  GL_CB_LOCK();
  gl_cb_count = 0;
  gl_cb_relay_count = 0;
  GL_CB_UNLOCK();
}

/* Called with NO lock held. */
static void gl_cb_dispatch_one(void *cb, void *param) {
  void **vtbl = *(void ***)cb;
  ((gl_cb_run1_fn)vtbl[GL_CB_VSLOT_RUN_1ARG])(cb, param);
}

static void gl_cb_run_callbacks(void) {
  uint8_t buf[GL_CB_DRAIN_RESP_MAX_BYTES];
  void *targets[GL_CB_REGISTRY_CAPACITY];
  uint32_t interval;
  uint32_t now;
  uint32_t iter;
  volatile uint8_t *zp;
  uint32_t zi;

  GL_CB_LOCK();
  if (gl_cb_running || gl_cb_relay_count == 0) {
    GL_CB_UNLOCK();
    return;
  }
  now = gl_cb_now_ms();
  interval = gl_cb_fail_count >= GL_CB_DRAIN_FAIL_BACKOFF_AFTER
                 ? GL_CB_DRAIN_BACKOFF_MS
                 : GL_CB_DRAIN_MIN_INTERVAL_MS;
  if (gl_cb_have_drained && (uint32_t)(now - gl_cb_last_drain_ms) < interval) {
    GL_CB_UNLOCK();
    return;
  }
  gl_cb_have_drained = 1;
  gl_cb_last_drain_ms = now;
  gl_cb_running = 1;
  gl_cb_run_tid = GL_CB_THREAD_ID();
  GL_CB_UNLOCK();

  for (iter = 0; iter < GL_CB_DRAIN_MAX_PER_RUN; iter++) {
    uint32_t len = 0;
    uint32_t count, cub, size, ntargets, i;
    int32_t id;
    int ok = gl_cb_transport_drain(buf, GL_CB_DRAIN_RESP_MAX_BYTES, &len);
    if (!ok) {
      GL_CB_LOCK();
      gl_cb_fail_count++;
      GL_CB_UNLOCK();
      break;
    }
    GL_CB_LOCK();
    gl_cb_fail_count = 0;
    GL_CB_UNLOCK();
    if (len > GL_CB_DRAIN_RESP_MAX_BYTES || len < 4) break;
    memcpy(&count, buf, 4);
    if (count == 0 || count != 1) break;
    if (len < 12) break;
    memcpy(&id, buf + 4, 4);
    memcpy(&cub, buf + 8, 4);
    size = gl_cb_relay_size(id);
    if (!size || cub != size) break;
    if (len != 12u + cub) break;

    ntargets = 0;
    GL_CB_LOCK();
    for (i = 0; i < gl_cb_count; i++) {
      if (gl_cb_entries[i].iCallback == id &&
          !(*((uint8_t *)gl_cb_entries[i].cb + GL_CB_FLAGS_OFF) &
            GL_CB_FLAG_GAMESERVER)) {
        targets[ntargets++] = gl_cb_entries[i].cb;
      }
    }
    GL_CB_UNLOCK();

    for (i = 0; i < ntargets; i++) {
      int idx, still;
      GL_CB_LOCK();
      idx = gl_cb_find(targets[i]);
      still = idx >= 0 && gl_cb_entries[idx].iCallback == id;
      if (still) gl_cb_dispatching = targets[i];
      GL_CB_UNLOCK();
      if (still) {
        gl_cb_dispatch_one(targets[i], buf + 12);
        GL_CB_LOCK();
        gl_cb_dispatching = NULL;
        GL_CB_UNLOCK();
      }
    }
  }

  zp = buf;
  for (zi = 0; zi < GL_CB_DRAIN_RESP_MAX_BYTES; zi++) zp[zi] = 0;
  GL_CB_LOCK();
  gl_cb_running = 0;
  GL_CB_UNLOCK();
}
`
}

const FLAT_EXPORT_BODIES: Record<
  (typeof FLAT_EXPORTS_SUPERSET)[number],
  string
> = {
  SteamAPI_Init:
    'int SteamAPI_Init(void) {\n' +
    '  const char *volatile gamelib_marker_keepalive = g_gamelib_shim_marker;\n' +
    '  (void)gamelib_marker_keepalive;\n' +
    '  int ok = gamelib_bridge_hello();\n' +
    '  if (ok) gamelib_report_init(GAMELIB_INIT_FN_STEAMAPI_INIT, 1);\n' +
    '  return ok;\n' +
    '}',
  SteamAPI_InitFlat:
    'int SteamAPI_InitFlat(char *pErrMsg) { (void)pErrMsg; return 0; }',
  SteamAPI_Shutdown:
    'void SteamAPI_Shutdown(void) {\n' +
    '  AcquireSRWLockExclusive(&g_bridge_lock);\n' +
    '  if (g_bridge_sock != INVALID_SOCKET) {\n' +
    '    closesocket(g_bridge_sock);\n' +
    '    g_bridge_sock = INVALID_SOCKET;\n' +
    '    WSACleanup();\n' +
    '  }\n' +
    '  ReleaseSRWLockExclusive(&g_bridge_lock);\n' +
    '  gl_cb_clear_all();\n' +
    '}',
  SteamAPI_RestartAppIfNecessary:
    'int SteamAPI_RestartAppIfNecessary(uint32_t unOwnAppID) { (void)unOwnAppID; return 0; }',
  SteamAPI_IsSteamRunning: 'int SteamAPI_IsSteamRunning(void) { return 1; }',
  SteamAPI_RunCallbacks:
    'void SteamAPI_RunCallbacks(void) { gl_cb_run_callbacks(); }',
  SteamAPI_RegisterCallback:
    'void SteamAPI_RegisterCallback(void *pCallback, int iCallback) { gl_cb_register(pCallback, iCallback); }',
  SteamAPI_UnregisterCallback:
    'void SteamAPI_UnregisterCallback(void *pCallback) { gl_cb_unregister(pCallback); }',
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
//
// quick 261024-i94 added the SDK 1.58+ init family (SteamInternal_SteamAPI_Init,
// _ContextInit, _FindOrCreateUserInterface, _FindOrCreateGameServerInterface,
// _GameServer_Init_V2). They stay x64-only: x86 has no
// SteamInternal_CreateInterface, no SteamAPI_GetHSteamUser/GetHSteamPipe and no
// null-object fallback, and a modern-SDK x86 context init also calls
// SteamAPI_GetHSteamUser -- exporting these five on x86 would mean widening the
// whole family to x86 (a separate decision against D-51-13).
//
// Phase 52 (52-07) adds GameLibBridge_CreateInterface, the SteamStub-path entry
// the 52-03 steamclient64 forwarder resolves via GetProcAddress. The five
// SteamInternal_* exports above already shipped in i94; they are unchanged.
// x86 stays deferred (orchestrator decision 6).
export const MODERN_LOOKUP_FLAT_EXPORTS = [
  'SteamInternal_CreateInterface',
  'SteamAPI_GetHSteamUser',
  'SteamAPI_GetHSteamPipe',
  'SteamInternal_SteamAPI_Init',
  'SteamInternal_ContextInit',
  'SteamInternal_FindOrCreateUserInterface',
  'SteamInternal_FindOrCreateGameServerInterface',
  'SteamInternal_GameServer_Init_V2',
  'SteamInternal_GameServer_Init',
  'GameLibBridge_CreateInterface'
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
  SteamAPI_GetHSteamPipe: 'int SteamAPI_GetHSteamPipe(void) { return 1; }',
  // quick 261024-i94. SDK: int SteamInternal_SteamAPI_Init(const char
  // *pszInternalCheckInterfaceVersions, SteamErrMsg *pOutErrMsg) returning
  // ESteamAPIInitResult (0 = k_ESteamAPIInitResult_OK, 2 = NoSteamClient).
  // SteamErrMsg is char[1024]. D-53-15: says HELLO through the shared helper
  // (NOT SteamAPI_Init(), so there is exactly one report) and reports code 1.
  SteamInternal_SteamAPI_Init:
    'int SteamInternal_SteamAPI_Init(const char *pszInternalCheckInterfaceVersions, char *pOutErrMsg) {\n' +
    '  (void)pszInternalCheckInterfaceVersions;\n' +
    '  if (gamelib_bridge_hello()) {\n' +
    '    gamelib_report_init(GAMELIB_INIT_FN_STEAMINTERNAL_INIT, 0);\n' +
    '    g_gamelib_context_counter++;\n' +
    '    if (pOutErrMsg != NULL) pOutErrMsg[0] = 0;\n' +
    '    return 0;\n' +
    '  }\n' +
    '  if (pOutErrMsg != NULL) snprintf(pOutErrMsg, 1024, "GameLib bridge: helper HELLO failed");\n' +
    '  return 2;\n' +
    '}',
  // SDK callback-and-counter protocol: void *SteamInternal_ContextInit(void
  // *pContextInitData), data = { void (*pFn)(void *pCtx); uintptr_t counter;
  // <context> }. The context lives right after the counter. pFn re-populates it
  // whenever the global counter moved. Starts at 1 so a pre-init call (game
  // static init) populates the context.
  SteamInternal_ContextInit:
    'void *SteamInternal_ContextInit(void *pContextInitData) {\n' +
    '  struct gamelib_ctx_init { void (*pFn)(void *pCtx); uintptr_t counter; } *d = (struct gamelib_ctx_init *)pContextInitData;\n' +
    '  if (d == NULL) return NULL;\n' +
    '  void *ctx = (void *)(d + 1);\n' +
    '  if (d->counter != g_gamelib_context_counter) {\n' +
    '    d->counter = g_gamelib_context_counter;\n' +
    '    if (d->pFn != NULL) d->pFn(ctx);\n' +
    '  }\n' +
    '  return ctx;\n' +
    '}',
  // SDK: void *SteamInternal_FindOrCreateUserInterface(HSteamUser, const char
  // *pszVersion). Same lookup as SteamInternal_CreateInterface.
  SteamInternal_FindOrCreateUserInterface:
    'void *SteamInternal_FindOrCreateUserInterface(int hSteamUser, const char *pszVersion) {\n' +
    '  (void)hSteamUser;\n' +
    '  void *resolved = resolve_iface_by_exact_version(pszVersion);\n' +
    '  if (resolved != NULL) return resolved;\n' +
    '  return (void *)&g_x64_null_object_instance;\n' +
    '}',
  // SDK: void *SteamInternal_FindOrCreateGameServerInterface(HSteamUser, const
  // char *pszVersion). Same lookup as SteamInternal_CreateInterface.
  SteamInternal_FindOrCreateGameServerInterface:
    'void *SteamInternal_FindOrCreateGameServerInterface(int hSteamUser, const char *pszVersion) {\n' +
    '  (void)hSteamUser;\n' +
    '  void *resolved = resolve_iface_by_exact_version(pszVersion);\n' +
    '  if (resolved != NULL) return resolved;\n' +
    '  return (void *)&g_x64_null_object_instance;\n' +
    '}',
  // SDK: ESteamAPIInitResult SteamInternal_GameServer_Init_V2(uint32 unIP,
  // uint16 usGamePort, uint16 usQueryPort, EServerMode, const char
  // *pchVersionString, const char *pszInternalCheckInterfaceVersions,
  // SteamErrMsg *pOutErrMsg). Game-server mode is unsupported: always fail with
  // 1 (k_ESteamAPIInitResult_FailedGeneric) -- 0 would mean OK here.
  SteamInternal_GameServer_Init_V2:
    'int SteamInternal_GameServer_Init_V2(uint32_t unIP, uint16_t usGamePort, uint16_t usQueryPort, int eServerMode, const char *pchVersionString, const char *pszInternalCheckInterfaceVersions, char *pOutErrMsg) {\n' +
    '  (void)unIP; (void)usGamePort; (void)usQueryPort; (void)eServerMode; (void)pchVersionString; (void)pszInternalCheckInterfaceVersions;\n' +
    '  if (pOutErrMsg != NULL) snprintf(pOutErrMsg, 1024, "GameLib bridge: game server mode is not supported");\n' +
    '  return 1;\n' +
    '}',
  // Phase 53 (53-01, D-53-11): the pre-V2 SDK 1.50-1.57 game-server init
  // that UE titles (Manor Lords 1363080) delay-import. SDK shape: bool
  // SteamInternal_GameServer_Init(uint32 unIP, uint16 usLegacySteamPort,
  // uint16 usGamePort, uint16 usQueryPort, EServerMode, const char
  // *pchVersionString). Game-server mode is unsupported: it fails the same
  // way _V2 does, in ITS return type -- bool false (0) here, where _V2's
  // ESteamAPIInitResult failure is 1. The pre-V2 signature has no error-message
  // out-param, so nothing is written, and bridge_transact is never called.
  // Every argument is ignored (Win64 is caller-cleans, so arity is harmless).
  SteamInternal_GameServer_Init:
    'int SteamInternal_GameServer_Init(uint32_t unIP, uint16_t usLegacySteamPort, uint16_t usGamePort, uint16_t usQueryPort, int eServerMode, const char *pchVersionString) {\n' +
    '  (void)unIP; (void)usLegacySteamPort; (void)usGamePort; (void)usQueryPort; (void)eServerMode; (void)pchVersionString;\n' +
    '  return 0;\n' +
    '}',
  // Phase 52 (52-07): called by the steamclient64 forwarder on the SteamStub
  // check path. Returns the shim proxy for the EXACT version only when the
  // native client confirmed it (CONTROL slot 3); otherwise NULL with rc=1.
  // NEVER the x64 null object: a fake answer here would let SteamStub believe
  // a client exists that does not.
  GameLibBridge_CreateInterface:
    'void *GameLibBridge_CreateInterface(const char *pszName, int *pRc) {\n' +
    '  static int s_hello_sent = 0;\n' +
    '  static uint8_t s_req[4 + 4096];\n' +
    '  uint8_t retbuf[4]; uint32_t retlen = 0;\n' +
    '  if (pRc != NULL) *pRc = 1;\n' +
    '  if (pszName == NULL) return NULL;\n' +
    '#if defined(__x86_64__)\n' +
    '  g_bridge_steamstub_path_active = 1;\n' +
    '#endif\n' +
    '  size_t n = strlen(pszName);\n' +
    '  if (n > 4096) return NULL;\n' +
    '  if (!s_hello_sent) {\n' +
    '    uint8_t hb[1]; uint32_t hl = 0;\n' +
    '    if (bridge_transact(BRIDGE_CONTROL_ORDINAL, BRIDGE_CONTROL_SLOT_HELLO, NULL, 0, hb, sizeof(hb), &hl)) s_hello_sent = 1;\n' +
    '  }\n' +
    '  s_req[0] = (uint8_t)(n & 0xff); s_req[1] = (uint8_t)((n >> 8) & 0xff); s_req[2] = (uint8_t)((n >> 16) & 0xff); s_req[3] = (uint8_t)((n >> 24) & 0xff);\n' +
    '  memcpy(s_req + 4, pszName, n);\n' +
    '  if (!bridge_transact(BRIDGE_CONTROL_ORDINAL, BRIDGE_CONTROL_SLOT_CREATE_INTERFACE, s_req, (uint32_t)(4 + n), retbuf, sizeof(retbuf), &retlen)) return NULL;\n' +
    '  if (retlen != 4) return NULL;\n' +
    '  uint32_t present = (uint32_t)retbuf[0] | ((uint32_t)retbuf[1] << 8) | ((uint32_t)retbuf[2] << 16) | ((uint32_t)retbuf[3] << 24);\n' +
    '  if (present == 0) return NULL;\n' +
    '  void *p = resolve_iface_by_exact_version(pszName);\n' +
    '  if (pRc != NULL) *pRc = p != NULL ? 0 : 1;\n' +
    '  return p;\n' +
    '}'
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
  if (kind === 'out-value' || kind === 'null-in') return 0
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
  const sendableParams = method.params.filter((p) => {
    const k = p.kind ?? 'value'
    return k !== 'out-value' && k !== 'null-in'
  })
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
        `  uint32_t cap_${p.name} = (${p.sizeParam} < 0) ? 0u : (uint32_t)${p.sizeParam}; // negative size -> capacity 0 (53-14, T-53-56)`,
        `  if (cap_${p.name} > WIRE_OUT_BUFFER_MAX_BYTES) cap_${p.name} = WIRE_OUT_BUFFER_MAX_BYTES;`,
        `  memcpy(argbuf + argOff, &cap_${p.name}, 4); argOff += 4;`
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
// not serve gets a callable null object (reported as stubbed) rather than a
// NULL deref. Win64 is caller-cleans (unlike i386 __thiscall, which is
// callee-cleans and therefore needs an arity-correct stub per slot, see
// emitStubBody's dummy-param mechanism above) -- so ONE generic
// zero-returning function is arity-safe for every slot.
//
// 51-REVIEW WR-03: arity-safe is NOT crash-free. MSVC x64 returns a
// user-defined type from a member function through a hidden pointer (RDX)
// and expects RAX to hold that same pointer on return. This function returns
// 0 in RAX for every slot, so a caller of an sret slot on an unserved
// interface (e.g. ISteamController::GetDigitalActionData /
// GetAnalogActionData) reads through address 0 and crashes. Since 51-20
// (CR-03) the fallback is reached only via runtime interface lookup
// (SteamInternal_CreateInterface / ISteamClient::GetISteamXxx), never a bare
// accessor, which narrows but does not close this. A correct fix needs
// per-family null objects whose sret slots zero-fill and return their second
// argument, generated from the Proton inventory; it is not built yet.
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
    method.name.replace(/^DEPRECATED_/, '').startsWith('GetISteam') &&
    method.params.some((p) => p.type === 'const char*')
  )
}

/**
 * WR-09 (52-20): the value each ISteamClient non-lookup wire method answers
 * LOCALLY for an ordinary x64 title (one not on the SteamStub path). These
 * are the pre-phase answers at 7ed535984 -- CreateSteamPipe and
 * ConnectToGlobalUser were `helperFallback: 1` there. Every other
 * non-lookup method answers '0' (int32 return) or nothing (void).
 */
export const STEAM_CLIENT_OFF_PATH_VALUES: Readonly<Record<string, string>> = {
  CreateSteamPipe: '1',
  ConnectToGlobalUser: '1'
}

/**
 * The `g_bridge_steamstub_path_active` gate for a SteamClient-family
 * non-lookup wire method (WR-09): off the SteamStub path it returns its
 * pre-phase local value ahead of bridge_transact, so an ordinary title can
 * never reach the helper's live native ISteamClient. Returns '' for every
 * other method. Throws for a shape with no safe off-path value.
 */
function steamClientOffPathGate(
  manifest: InterfaceManifest,
  method: MethodSignature
): string {
  const methodMode = method.mode ?? manifest.mode
  if (
    manifest.family !== STEAM_CLIENT_FAMILY ||
    methodMode !== 'wire' ||
    isSteamClientVersionLookupMethod(manifest, method)
  ) {
    return ''
  }
  // out-value params (CreateLocalUser's phSteamPipe) are left untouched
  // off-path, exactly as the pre-phase stub did; out-buffer has no such
  // precedent and needs a deliberate answer.
  const hasOut = method.params.some((p) => p.kind === 'out-buffer')
  if (
    isSretReturn(method) ||
    isStringReturn(method) ||
    method.returnKind === 'pointer' ||
    hasOut
  ) {
    throw new Error(
      `SteamClient wire method ${manifest.interface}.${method.name} has no off-SteamStub-path value: ` +
        `sret, string, pointer returns and out-buffer params need a deliberate local answer`
    )
  }
  let value = ''
  if (method.returnKind !== 'void') {
    const entry = STEAM_CLIENT_OFF_PATH_VALUES[method.name]
    value = ` ${entry ?? (method.returnKind === 'int64' ? '0LL' : '0')}`
  }
  return (
    `#if defined(__x86_64__)\n` +
    `  if (!g_bridge_steamstub_path_active) { return${value}; }\n` +
    `#endif\n`
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

/**
 * Phase 52: the FORWARDED GetISteamXxx lookup. Asks the native client (over
 * the wire, helper-side flat SteamAPI_ISteamClient_GetISteamXxx on
 * SteamClient()) whether it serves `pchVersion`; the helper answers a 4-byte
 * presence int (never the native pointer -- it is meaningless in the Wine
 * process). The shim hands back its existing proxy for that EXACT version
 * only when native answered non-NULL, otherwise NULL. It never fabricates an
 * answer locally on this path (T-52-02).
 *
 * CR-01: that forwarded path runs only AFTER the SteamStub entry point
 * (GameLibBridge_CreateInterface) has set g_bridge_steamstub_path_active.
 * Ordinary x64 titles take the pre-phase local path: proxy or null object.
 */
function emitSteamClientForwardedLookup(
  manifest: InterfaceManifest,
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
  const { decl: argBufDecl, lenExpr: argLenExpr } = packArgsBlock(method)
  return (
    header +
    `static void * THISCALL ${funcName}(${signatureParams}) {\n` +
    `  (void)self;\n` +
    `#if defined(__x86_64__)\n` +
    `  if (!g_bridge_steamstub_path_active) {\n` +
    `    void *local = resolve_iface_by_exact_version(${versionParam.name});\n` +
    `    return local != NULL ? local : (void *)&g_x64_null_object_instance;\n` +
    `  }\n` +
    `#endif\n` +
    `${argBufDecl}\n` +
    `  uint8_t retbuf[4]; uint32_t retlen = 0; int32_t present = 0;\n` +
    `  if (!bridge_transact(${manifest.ordinal}, ${method.slot}, argbuf, ${argLenExpr}, retbuf, sizeof(retbuf), &retlen) || retlen < 4) return NULL;\n` +
    `  memcpy(&present, retbuf, 4);\n` +
    `  if (present == 0) return NULL;\n` +
    `  return resolve_iface_by_exact_version(${versionParam.name});\n` +
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
    // Phase 52: a wire-mode lookup forwards to the native client; a
    // stub-mode one keeps the old local lookup (unchanged for stub manifests).
    if (methodMode === 'wire') {
      return emitSteamClientForwardedLookup(manifest, method, header, funcName)
    }
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
  const offPathGate = steamClientOffPathGate(manifest, method)

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
      offPathGate +
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
      offPathGate +
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

  // 53-14: on a transport failure every out-value the caller handed us is
  // zeroed (a stale/garbage length must never be read as a real one).
  const failZeroLines = outValueParams.map(
    (p) => `    if (${p.name} != NULL) *${p.name} = 0;`
  )
  const decodeLines: string[] = [`  uint32_t respOff = ${retWidth};`]
  // 53-17 WR-02: an out-value that is some out-buffer's lenParam is stored only
  // after the buffer decode, as min(declared, bytes actually copied).
  const lenOwner = new Map<string, string>()
  for (const p of outBufferParams) {
    if (p.lenParam !== undefined) lenOwner.set(p.lenParam, p.name)
  }
  for (const p of outBufferParams) {
    decodeLines.push(`  uint32_t copied_${p.name} = 0;`)
  }
  for (const p of outValueParams) {
    const valueType = p.valueType ?? 'int32'
    const width = valueTypeWidth(valueType)
    const ct = valueTypeCType(valueType)
    if (lenOwner.has(p.name)) {
      decodeLines.push(
        `  ${ct} lenVal_${p.name} = 0;`,
        `  if (retlen >= respOff + ${width}) memcpy(&lenVal_${p.name}, retbuf + respOff, ${width});`,
        `  respOff += ${width};`
      )
      continue
    }
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
      `    if (copyLen > cap_${p.name}) copyLen = cap_${p.name}; // never write past the caller's own capacity (53-14, T-53-56)`,
      ...(nulTerminate
        ? [
            `    if (copyLen >= cap_${p.name}) copyLen = cap_${p.name} ? cap_${p.name} - 1 : 0; // room for the NUL (53-17 WR-03)`
          ]
        : []),
      `    if (${p.name} != NULL && retlen >= respOff + copyLen) {`,
      `      memcpy(${p.name}, retbuf + respOff, copyLen);`,
      `      copied_${p.name} = copyLen;`,
      ...(nulTerminate
        ? [`      if (cap_${p.name} > 0) ${p.name}[copyLen] = '\\0';`]
        : []),
      `    }`,
      `    respOff += declLen;`,
      `  }`
    )
  }
  for (const p of outValueParams) {
    const owner = lenOwner.get(p.name)
    if (owner === undefined) continue
    decodeLines.push(
      `  if (${p.name} != NULL) *${p.name} = (lenVal_${p.name} < copied_${owner}) ? lenVal_${p.name} : copied_${owner};`
    )
  }

  return (
    header +
    `static ${returnType} THISCALL ${funcName}(${signatureParams}) {\n` +
    `  (void)self;\n` +
    offPathGate +
    `${argBufDecl}\n` +
    `  uint8_t retbuf[${retBufSize}]; uint32_t retlen = 0;\n` +
    `  if (!bridge_transact(${manifest.ordinal}, ${method.slot}, argbuf, ${argLenExpr}, retbuf, sizeof(retbuf), &retlen) || retlen < ${retWidth}) {\n` +
    `${failZeroLines.join('\n')}\n` +
    `    return 0;\n` +
    `  }\n` +
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
// Phase 53 (53-04): the Steamworks flat C API (x64 only), generated from the
// SAME manifests as the vtable proxies
// ---------------------------------------------------------------------------
//
// A flat export `SteamAPI_I<Family>_<Method>(self, args...)` identifies which
// served interface version `self` is (by comparing it with the static
// `g_<iface>_instance` addresses), then calls THAT proxy's own vtable slot
// with that version's own manifest C parameter types (D-53-05). Flat and
// vtable behaviour are therefore identical: wire-forwarded where wire-policy
// says so, the slot stub otherwise. There is no flat-only stub table.
//
// ABI: on Win64 a flat cdecl function and an MSVC member function both take
// `self` in RCX, so a typed call through the slot is exact for a non-class
// return. MSVC returns EVERY class type through a hidden pointer (RDX) even at
// 8 bytes (isSretReturn), while the flat function returns the 8-byte value in
// RAX: an sret method's flat body passes a zeroed local as the hidden pointer
// and returns it.
//
// 53-10 (53-REVIEW CR-01): that RAX form is only right for a 1/2/4/8-byte
// struct. A Win64 C free function returns any other size through a
// caller-allocated hidden pointer in RCX, so the first real argument (`self`)
// moves to RDX and the function returns the pointer: `void *f(void *ret,
// void *self, ...)`. isHiddenPointerFlatReturn selects that form, and the
// vtable slot is still called as the member function `(self, ret, ...)`.

/** Explicit flat-name overrides keyed `Family.ManifestName`, for any case the
 * overload derivation in flatMethodName cannot reach. Each entry must say which
 * fixture name it serves. Empty: the derivation covers every measured name. */
export const FLAT_NAME_OVERRIDES: Readonly<Record<string, string>> = {
  // 53-12: overload pairs whose disambiguating parameter is not a
  // numeric int32/float/int64/double, so the type-suffix rule cannot name
  // them. Names are the Steamworks flat API's own (steam_api_flat.h).
  'SteamUGC.CreateQueryAllUGCRequest': 'CreateQueryAllUGCRequestPage',
  'SteamUGC.CreateQueryAllUGCRequest_2': 'CreateQueryAllUGCRequestCursor',
  'SteamUGC.GetQueryUGCKeyValueTag': 'GetQueryUGCKeyValueTag',
  'SteamUGC.GetQueryUGCKeyValueTag_2': 'GetQueryFirstUGCKeyValueTag',
  'SteamInventory.SetProperty': 'SetPropertyString',
  'SteamInventory.SetProperty_2': 'SetPropertyBool'
}

/** `Family.FlatName.Version` triples the generator cannot represent in C: a
 * parameter/return position where one version uses an XMM register (float or
 * double) and another a GPR, or float vs double. A listed version is not
 * dispatched by its flat export. Every entry needs a comment with the reason,
 * and is a deviation in the plan SUMMARY. Starts empty (measured 2026-10-25). */
export const FLAT_UNREPRESENTABLE_CASES: readonly string[] = [
  // 53-12: GameServer012's GetPublicIP returns a plain uint32 (RAX), whereas
  // 013-015 return the 20-byte SteamIPAddress_t through a Win64 hidden
  // pointer; one flat C prototype cannot be both. 012's vtable proxy is still
  // served; the shared flat export dispatches 012's RAX form from the
  // `ret`-is-012-instance branch of the hidden-pointer fallback (53-17 CR-01).
  'SteamGameServer.GetPublicIP.SteamGameServer012'
]

const OVERLOAD_SUFFIX_BY_TYPE: Readonly<Record<string, string>> = {
  int32: 'Int32',
  'int32*': 'Int32',
  float: 'Float',
  'float*': 'Float',
  int64: 'Int64',
  'int64_t*': 'Int64',
  'int64*': 'Int64',
  double: 'Double',
  'double*': 'Double'
}

/**
 * The Steamworks flat method name for a manifest method. `Foo_2` siblings of
 * `Foo` are the C++ overload pair; the flat API disambiguates them by the
 * numeric type of the first int32/float/int64/double parameter (GetStatInt32,
 * SetStatFloat, GetGlobalStatHistoryDouble, ...). A `DEPRECATED_` prefix is
 * dropped so every version of a method shares one flat name.
 */
export function flatMethodName(
  family: string,
  method: MethodSignature,
  siblings: readonly MethodSignature[]
): string {
  const override = FLAT_NAME_OVERRIDES[`${family}.${method.name}`]
  if (override !== undefined) return override
  let base = method.name.replace(/^DEPRECATED_/, '')
  const suffixed = base.match(/^(.*)_(\d+)$/)
  let overloaded = false
  if (suffixed && siblings.some((s) => s.name === suffixed[1])) {
    base = suffixed[1]
    overloaded = true
  } else if (siblings.some((s) => s.name === `${method.name}_2`)) {
    overloaded = true
  }
  if (!overloaded) return base
  for (const p of method.params) {
    const suffix = OVERLOAD_SUFFIX_BY_TYPE[p.type]
    if (suffix !== undefined) return `${base}${suffix}`
  }
  throw new Error(
    `flat export: ${family}.${method.name} is an overload but has no int32/float/int64/double parameter to name it; add FLAT_NAME_OVERRIDES['${family}.${method.name}']`
  )
}

type FlatRegClass = 'gpr' | 'float' | 'double'

interface FlatArgType {
  /** C spelling used in the export prototype, the slot cast and the arg cast. */
  c: string
  cls: FlatRegClass
  /** Unsigned integer of the type's own width when it is narrower than 8
   * bytes (Win64 leaves the upper register bits undefined), else null. */
  narrow: string | null
}

function flatArgType(type: string): FlatArgType {
  switch (type) {
    case 'bool':
      return { c: 'bool', cls: 'gpr', narrow: 'uint8_t' }
    case 'char':
      return { c: 'char', cls: 'gpr', narrow: 'uint8_t' }
    case 'uint16':
    case 'uint16_t':
      return { c: 'uint16_t', cls: 'gpr', narrow: 'uint16_t' }
    case 'int32':
      return { c: 'int32_t', cls: 'gpr', narrow: 'uint32_t' }
    case 'uint32':
    case 'HSteamUser':
    case 'HSteamPipe':
      return { c: 'uint32_t', cls: 'gpr', narrow: 'uint32_t' }
    case 'int64':
      return { c: 'int64_t', cls: 'gpr', narrow: null }
    case 'uint64':
    case 'CSteamID':
    case 'CGameID':
      return { c: 'uint64_t', cls: 'gpr', narrow: null }
    case 'float':
      return { c: 'float', cls: 'float', narrow: null }
    case 'double':
      return { c: 'double', cls: 'double', narrow: null }
    default:
      if (type.endsWith('*')) {
        return { c: cType(type), cls: 'gpr', narrow: null }
      }
      // A by-value struct (SteamIPAddress_t, ...): Win64 passes it in one GPR
      // either as the value (1/2/4/8 bytes) or as a pointer to a copy.
      return { c: 'uint64_t', cls: 'gpr', narrow: null }
  }
}

interface FlatRetType {
  /** C spelling of the flat export's value; 'void' for none. */
  c: string
  cls: FlatRegClass | 'void'
  /** C spelling the slot is cast to return (differs from `c` for bool). */
  slotC: string
}

function flatRetType(method: MethodSignature): FlatRetType {
  switch (method.returnKind) {
    case 'void':
      return { c: 'void', cls: 'void', slotC: 'void' }
    case 'class':
      return { c: 'uint64_t', cls: 'gpr', slotC: 'void *' }
    case 'pointer':
      return { c: 'void *', cls: 'gpr', slotC: 'void *' }
    case 'string':
      return { c: 'const char *', cls: 'gpr', slotC: 'const char *' }
    case 'float':
      return { c: 'float', cls: 'float', slotC: 'float' }
    case 'double':
      return { c: 'double', cls: 'double', slotC: 'double' }
    case 'int64': {
      const c = method.returns === 'uint64' ? 'uint64_t' : 'int64_t'
      return { c, cls: 'gpr', slotC: c }
    }
    case 'int32': {
      if (method.returns === 'bool') {
        return { c: 'bool', cls: 'gpr', slotC: 'int' }
      }
      const c = method.returns === 'uint32' ? 'uint32_t' : 'int32_t'
      return { c, cls: 'gpr', slotC: c }
    }
  }
}

interface FlatCase {
  manifest: InterfaceManifestV2
  method: MethodSignature
  triple: string
}

/** Prototype shape of one flat name after reconciling its versions. */
function reconcileFlatPrototype(
  family: string,
  flatName: string,
  cases: readonly FlatCase[]
): {
  params: string[]
  ret: string
  problems: string[]
  /** Byte size of the Win64 hidden-pointer struct return, else null. */
  hiddenSize: number | null
} {
  const problems: string[] = []
  const params: string[] = []
  const hiddenSizes = [
    ...new Set(
      cases.map((c) =>
        isHiddenPointerFlatReturn(c.method) ? c.method.structSize! : null
      )
    )
  ]
  if (hiddenSizes.length > 1) {
    problems.push(
      `${family}.${flatName} mixes struct-return conventions/sizes across versions (${hiddenSizes.map((h) => (h === null ? 'RAX/scalar' : `hidden pointer ${h}B`)).join(' / ')})`
    )
  }
  const hiddenSize = hiddenSizes.length === 1 ? hiddenSizes[0] : null
  const arity = Math.max(...cases.map((c) => c.method.params.length))
  for (let i = 0; i < arity; i++) {
    const types = cases
      .filter((c) => i < c.method.params.length)
      .map((c) => flatArgType(c.method.params[i].type))
    const distinct = [...new Set(types.map((t) => t.c))]
    if (distinct.length === 1) {
      params.push(distinct[0])
    } else if (types.every((t) => t.cls === 'gpr')) {
      params.push('uint64_t')
    } else {
      problems.push(
        `${family}.${flatName} parameter ${i + 1} mixes ${distinct.join(' / ')} (XMM and GPR registers)`
      )
      params.push('uint64_t')
    }
  }
  const rets = cases
    .map((c) => flatRetType(c.method))
    .filter((r) => r.cls !== 'void')
  const distinctRets = [...new Set(rets.map((r) => r.c))]
  let ret: string
  if (distinctRets.length === 0) {
    ret = 'void'
  } else if (distinctRets.length === 1) {
    ret = distinctRets[0]
  } else if (rets.every((r) => r.cls === 'gpr')) {
    ret = 'uint64_t'
  } else {
    problems.push(
      `${family}.${flatName} return mixes ${distinctRets.join(' / ')} (XMM and GPR registers)`
    )
    ret = 'uint64_t'
  }
  if (hiddenSize !== null) ret = 'void *'
  return { params, ret, problems, hiddenSize }
}

function argExpr(
  protoType: string,
  method: MethodSignature,
  i: number
): string {
  const t = flatArgType(method.params[i].type)
  const a = `a${i + 1}`
  if (protoType === 'uint64_t' && t.c !== 'uint64_t' && t.narrow !== null) {
    return `(${t.c})(${t.narrow})${a}`
  }
  return `(${t.c})${a}`
}

function emitFlatCase(
  fc: FlatCase,
  protoParams: readonly string[],
  protoRet: string
): string {
  const { manifest, method } = fc
  const instance = `g_${manifest.interface.toLowerCase()}_instance`
  const ret = flatRetType(method)
  const hidden = isHiddenPointerFlatReturn(method)
  if (hidden) {
    const hiddenSig = [
      'void *',
      'void *',
      ...method.params.map((p) => flatArgType(p.type).c)
    ].join(', ')
    const hiddenArgs = [
      'self',
      'ret',
      ...method.params.map((_, i) => argExpr(protoParams[i], method, i))
    ].join(', ')
    return (
      `  if (self == (void *)&${instance}) {\n    vfn *vt = *(vfn **)self;\n` +
      `    ((void * (*)(${hiddenSig}))vt[${method.slot}])(${hiddenArgs});\n` +
      `    return ret;\n` +
      `  }\n`
    )
  }
  const sret = isSretReturn(method)
  const sigTypes = method.params.map((p) => flatArgType(p.type).c)
  const args = method.params.map((_, i) => argExpr(protoParams[i], method, i))
  const sigParams = ['void *', ...(sret ? ['void *'] : []), ...sigTypes].join(
    ', '
  )
  const callArgs = ['self', ...(sret ? ['&out'] : []), ...args].join(', ')
  const slotCall = `((${sret ? 'void *' : ret.slotC} (*)(${sigParams}))vt[${method.slot}])(${callArgs})`
  const head = `  if (self == (void *)&${instance}) {\n    vfn *vt = *(vfn **)self;\n`
  if (sret) {
    return (
      head +
      `    uint64_t out = 0;\n` +
      `    ${slotCall};\n` +
      `    return ${protoRet === 'uint64_t' ? 'out' : `(${protoRet})out`};\n` +
      `  }\n`
    )
  }
  if (ret.cls === 'void') {
    return (
      head +
      `    ${slotCall};\n` +
      `    return${protoRet === 'void' ? '' : ' 0'};\n` +
      `  }\n`
    )
  }
  return head + `    return (${protoRet})${slotCall};\n  }\n`
}

/** Flat ISteamClient::GetISteamXxx(hUser, hPipe, pszVersion): D-53-07 -- an
 * exact-version lookup that answers NULL (never the null object) for a version
 * the shim does not serve, and reports it to the helper (CONTROL slot 4). */
function emitFlatClientLookup(
  funcSig: string,
  cases: readonly FlatCase[]
): string {
  const idx = new Set(
    cases.map((c) => c.method.params.findIndex((p) => p.type === 'const char*'))
  )
  if (idx.size !== 1) {
    throw new Error(
      `flat export: ${cases[0].triple} client lookup version parameter moves between versions`
    )
  }
  const versionIdx = [...idx][0]
  const versionArg = `a${versionIdx + 1}`
  const ignored = cases[0].method.params
    .map((_, i) => i)
    .filter((i) => i !== versionIdx)
    .map((i) => `  (void)a${i + 1};\n`)
    .join('')
  const known = [...new Set(cases.map((c) => c.manifest.interface))]
    .map((v) => `self == (void *)&g_${v.toLowerCase()}_instance`)
    .join(' ||\n      ')
  return (
    `${funcSig} {\n` +
    ignored +
    `  if (${known}) {\n` +
    `    void *p = resolve_iface_by_exact_version(${versionArg});\n` +
    `    if (p != NULL) return p;\n` +
    `    flat_report_unknown_version(${versionArg});\n` +
    `    return NULL;\n` +
    `  }\n` +
    `  return NULL;\n` +
    `}\n`
  )
}

function isFlatClientLookup(cases: readonly FlatCase[]): boolean {
  return cases.every((c) =>
    isSteamClientVersionLookupMethod(c.manifest, c.method)
  )
}

/** True when emitHiddenFallback dispatches this dropped version (IN-01). */
function isHiddenFallbackDispatched(
  method: InterfaceManifest['methods'][number]
): boolean {
  return (
    !isHiddenPointerFlatReturn(method) &&
    method.params.length === 0 &&
    (method.returnKind === 'int32' ||
      method.returnKind === 'int64' ||
      method.returnKind === 'pointer' ||
      method.returnKind === 'string')
  )
}

/**
 * 53-17 CR-01: fallback of a hidden-pointer flat export. The game may pass a
 * shim instance (self in RCX, read here as `ret`) for a version whose return
 * is a plain RAX scalar, so `ret` is never trusted as a caller buffer:
 * (a) NULL guard, (b) dispatch each dropped RAX-form version (only integer/pointer scalars;
 * a class, float, double or void return throws at generation), (c) refuse any
 * other served instance, (d) only then zero the caller buffer.
 */
function emitHiddenFallback(
  hiddenSize: number,
  dropped: readonly FlatCase[],
  served: readonly InterfaceManifest[]
): string {
  let out = '  if (ret == NULL) return NULL;\n'
  const dispatched = new Set<string>()
  for (const d of dropped) {
    if (isHiddenPointerFlatReturn(d.method)) continue
    if (d.method.params.length > 0) {
      throw new Error(
        `flat export ${d.triple}: the dropped RAX-form version takes parameters and is not representable; model it or remove it from FLAT_UNREPRESENTABLE_CASES (fail closed, 53-17)`
      )
    }
    const kind = d.method.returnKind
    if (
      kind !== 'int32' &&
      kind !== 'int64' &&
      kind !== 'pointer' &&
      kind !== 'string'
    ) {
      throw new Error(
        `flat export ${d.triple}: dropped RAX-form version ${d.manifest.interface}.${d.method.name} returns ${kind}; only integer/pointer scalars are dispatched from the hidden-pointer fallback (fail closed, 53-17 WR-01)`
      )
    }
    const instance = `g_${d.manifest.interface.toLowerCase()}_instance`
    const r = flatRetType(d.method)
    out +=
      `  if (ret == (void *)&${instance}) {\n    vfn *vt = *(vfn **)ret;\n` +
      `    return (void *)(uintptr_t)((${r.slotC} (*)(void *))vt[${d.method.slot}])(ret);\n` +
      `  }\n`
    dispatched.add(d.manifest.interface)
  }
  for (const m of served) {
    if (dispatched.has(m.interface)) continue
    out += `  if (ret == (void *)&g_${m.interface.toLowerCase()}_instance) return NULL;\n`
  }
  return out + `  memset(ret, 0, ${hiddenSize});\n  return ret;\n`
}

/**
 * Emits the x64 flat export bodies (without the surrounding `#if`) and the
 * ordered list of exported names. `unrepresentable` defaults to
 * FLAT_UNREPRESENTABLE_CASES.
 */
export function emitFlatExports(
  manifests: InterfaceManifest[],
  unrepresentable: readonly string[] = FLAT_UNREPRESENTABLE_CASES
): { c: string; names: string[] } {
  const x64 = [...manifests]
    .filter((m) => m.arches.includes('x64'))
    .sort((a, b) => a.ordinal - b.ordinal)
  const groups = new Map<
    string,
    { family: string; flatName: string; cases: FlatCase[] }
  >()
  for (const m of x64) {
    const sorted = [...m.methods].sort((a, b) => a.slot - b.slot)
    sorted.forEach((method, i) => {
      if (method.slot !== i) {
        throw new Error(
          `flat export: ${m.interface} slots are not contiguous at ${method.name} (slot ${method.slot}, index ${i})`
        )
      }
    })
    const seen = new Set<string>()
    for (const method of sorted) {
      if (method.returnKind === 'class' && method.structSize === undefined) {
        throw new Error(
          `flat export: ${m.interface}.${method.name} is a class return with no structSize (fail closed, WR-07)`
        )
      }
      const flatName = flatMethodName(m.family, method, sorted)
      if (seen.has(flatName)) {
        throw new Error(
          `flat export: ${m.interface} derives the flat name ${flatName} twice`
        )
      }
      seen.add(flatName)
      const full = `SteamAPI_I${m.family}_${flatName}`
      if (method.helperFlat !== undefined && method.helperFlat !== full) {
        throw new Error(
          `flat export: ${m.interface}.${method.name} derives ${full} but its helperFlat is ${method.helperFlat}`
        )
      }
      const key = `${m.family}\0${flatName}`
      let g = groups.get(key)
      if (!g) {
        g = { family: m.family, flatName, cases: [] }
        groups.set(key, g)
      }
      g.cases.push({
        manifest: m,
        method,
        triple: `${m.family}.${flatName}.${m.interface}`
      })
    }
  }

  const ordered = [...groups.values()].sort((a, b) =>
    `SteamAPI_I${a.family}_${a.flatName}` <
    `SteamAPI_I${b.family}_${b.flatName}`
      ? -1
      : 1
  )
  const names: string[] = []
  const bodies: string[] = []
  for (const g of ordered) {
    const exportName = `SteamAPI_I${g.family}_${g.flatName}`
    let cases = g.cases
    let proto = reconcileFlatPrototype(g.family, g.flatName, cases)
    let excludedNote = ''
    let droppedCases: FlatCase[] = []
    if (proto.problems.length > 0) {
      const kept = cases.filter((c) => !unrepresentable.includes(c.triple))
      const dropped = cases.filter((c) => unrepresentable.includes(c.triple))
      if (kept.length > 0 && dropped.length > 0) {
        const again = reconcileFlatPrototype(g.family, g.flatName, kept)
        if (again.problems.length === 0) {
          cases = kept
          proto = again
          droppedCases = dropped
          excludedNote = dropped
            .map((c) =>
              proto.hiddenSize !== null && isHiddenFallbackDispatched(c.method)
                ? `/* dispatched via ret-is-instance fallback: ${c.triple} (RAX form) */\n`
                : `/* not dispatched: ${c.triple} (unrepresentable register class) */\n`
            )
            .join('')
        }
      }
      if (proto.problems.length > 0) {
        throw new Error(
          `flat export ${exportName} cannot be represented in C: ${proto.problems.join('; ')}. ` +
            `Versions: ${cases.map((c) => c.triple).join(', ')}. ` +
            `List the version(s) that need a separate calling convention in FLAT_UNREPRESENTABLE_CASES.`
        )
      }
    }
    names.push(exportName)
    const sigParams = [
      ...(proto.hiddenSize !== null ? ['void *ret'] : []),
      'void *self',
      ...proto.params.map((t, i) => `${t} a${i + 1}`)
    ]
    const funcSig = `${proto.ret} ${exportName}(${sigParams.join(', ')})`
    if (g.family === STEAM_CLIENT_FAMILY && isFlatClientLookup(cases)) {
      bodies.push(excludedNote + emitFlatClientLookup(funcSig, cases))
      continue
    }
    const zero =
      proto.hiddenSize !== null
        ? emitHiddenFallback(
            proto.hiddenSize,
            droppedCases,
            x64.filter((m) => m.family === g.family)
          )
        : proto.ret === 'void'
          ? '  return;\n'
          : '  return 0;\n'
    bodies.push(
      excludedNote +
        `${funcSig} {\n` +
        cases.map((c) => emitFlatCase(c, proto.params, proto.ret)).join('') +
        zero +
        `}\n`
    )
  }
  return { c: bodies.join('\n'), names }
}

/** Every name the x64 steam_api64.def exports, sorted: the committed source of
 * truth for shimCoverage's SHIM64_EXPORTED_SYMBOLS (RESEARCH Pitfall 5). */
export function generateShimExportsTs(manifests: InterfaceManifest[]): string {
  const names = [...x64DefExportNames(manifests)].sort()
  return (
    `// GENERATED FILE -- DO NOT EDIT BY HAND.\n` +
    `// Produced by meta/gen_vtables.ts (\`pnpm gen-vtables\`): the exact export table of\n` +
    `// native/steam-bridge/generated/steam_api64.def, sorted. It must not be edited;\n` +
    `// regenerate it instead.\n\n` +
    `export const SHIM64_GENERATED_EXPORTS: readonly string[] = [\n` +
    names.map((n) => `  '${n}'`).join(',\n') +
    `\n]\n`
  )
}

// ---------------------------------------------------------------------------
// Top-level emission
// ---------------------------------------------------------------------------

export function generateShimC(
  manifests: InterfaceManifest[],
  options: { unrepresentable?: readonly string[] } = {}
): string {
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
#include <stdbool.h>
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
// Phase 52 (52-02): protocol.ts CONTROL_SLOT.createInterface == helper
// CONTROL_SLOT_CREATE_INTERFACE. Asks the native client whether it accepts an
// interface version (reply: 4-byte LE int32 present).
#define BRIDGE_CONTROL_SLOT_CREATE_INTERFACE 3
// Phase 53 (53-04, D-53-07): the flat ISteamClient_GetISteam* lookup tells the
// helper which unserved interface version a game asked for (the helper handler
// lands in 53-06; an unhandled slot is a harmless error response).
#define BRIDGE_CONTROL_SLOT_REPORT_VERSION 4
// D-53-15 (quick 261025-kax): the game's own SteamAPI_Init /
// SteamInternal_SteamAPI_Init tells the helper how it went ({u32 fn, i32 ret});
// the helper logs a GINIT line, the only evidence an init-only title can give.
#define BRIDGE_CONTROL_SLOT_REPORT_INIT 5
// Phase 55: SteamAPI_RunCallbacks drains queued Steam callbacks (168 only) from the helper; an old helper answers STATUS_ERR, which bridge_transact reports as 0 and the registry treats as empty.
#define BRIDGE_CONTROL_SLOT_DRAIN_CALLBACKS 6
#define GAMELIB_INIT_FN_STEAMAPI_INIT 0
#define GAMELIB_INIT_FN_STEAMINTERNAL_INIT 1
#define GAMELIB_INIT_FN_STEAMAPI_INITSAFE 2

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

// Serializes every bridge round trip and every touch of g_bridge_sock. One
// shared socket with unguarded send/recv would let two threads interleave
// frames or consume each other's response, leaving the loser blocked in recv
// for good. UE titles call Steam from more than one thread. Not recursive:
// nothing that holds it may call bridge_transact again.
static SRWLOCK g_bridge_lock = SRWLOCK_INIT;

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
static int bridge_transact_locked(uint16_t ordinal, uint16_t slot,
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

static int bridge_transact(uint16_t ordinal, uint16_t slot,
                            const uint8_t *argBuf, uint32_t argLen,
                            uint8_t *retBuf, uint32_t retBufCap, uint32_t *retLenOut) {
  AcquireSRWLockExclusive(&g_bridge_lock);
  int ok = bridge_transact_locked(ordinal, slot, argBuf, argLen, retBuf, retBufCap, retLenOut);
  ReleaseSRWLockExclusive(&g_bridge_lock);
  return ok;
}

/* D-53-15: HELLO handshake, shared by SteamAPI_Init and
 * SteamInternal_SteamAPI_Init. Returns 1 on success, 0 on transport failure. */
static int gamelib_bridge_hello(void) {
  uint8_t retbuf[1]; uint32_t retlen = 0;
  if (!bridge_transact(BRIDGE_CONTROL_ORDINAL, BRIDGE_CONTROL_SLOT_HELLO, NULL, 0, retbuf, sizeof(retbuf), &retlen)) return 0;
  return 1;
}

/* D-53-15: fire-and-forget report of the game's own init result. Bounded at 8
 * per process, result ignored. Unguarded: the x86 shim needs it too. */
static int g_gamelib_init_reports = 0;
static void gamelib_report_init(uint32_t fn, int32_t ret) {
  uint8_t req[8];
  uint8_t retbuf[1]; uint32_t retlen = 0;
  if (g_gamelib_init_reports >= 8) return;
  g_gamelib_init_reports++;
  memcpy(req, &fn, 4);
  memcpy(req + 4, &ret, 4);
  (void)bridge_transact(BRIDGE_CONTROL_ORDINAL, BRIDGE_CONTROL_SLOT_REPORT_INIT, req, 8, retbuf, sizeof(retbuf), &retlen);
}

/* Phase 55: callback registry embedder. Lock rule: g_cb_registry_lock is never
 * held across bridge_transact or a game Run call, and g_bridge_lock is never
 * held while calling into the registry (SteamAPI_Shutdown clears after release). */
static SRWLOCK g_cb_registry_lock = SRWLOCK_INIT;
#define GL_CB_LOCK() AcquireSRWLockExclusive(&g_cb_registry_lock)
#define GL_CB_UNLOCK() ReleaseSRWLockExclusive(&g_cb_registry_lock)
#define GL_CB_THREAD_ID() ((uint32_t)GetCurrentThreadId())
#define GL_CB_YIELD() Sleep(1)
static uint32_t gl_cb_now_ms(void) { return (uint32_t)GetTickCount(); }
static int gl_cb_transport_drain(uint8_t *buf, uint32_t cap, uint32_t *lenOut) {
  return bridge_transact(BRIDGE_CONTROL_ORDINAL, BRIDGE_CONTROL_SLOT_DRAIN_CALLBACKS, NULL, 0, buf, cap, lenOut);
}
${generateCallbackRegistryC()}

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
// CR-01: set only by GameLibBridge_CreateInterface (the SteamStub entry point,
// reached only via steamclient64.dll). While clear, SteamClient GetISteam*
// lookups take the pre-phase local path (proxy or null object).
static volatile int g_bridge_steamstub_path_active = 0;
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
    // Own guard block (not folded into the one below) so the existing 51-15
    // pin "#if defined(__x86_64__)\nvoid *SteamInternal_CreateInterface" holds.
    `#if defined(__x86_64__)\nstatic uintptr_t g_gamelib_context_counter = 1;\n#endif\n` +
    `#if defined(__x86_64__)\n` +
    MODERN_LOOKUP_FLAT_EXPORTS.map(
      (name) => MODERN_LOOKUP_FLAT_EXPORT_BODIES[name]
    ).join('\n') +
    `\n#endif\n`
  // Phase 53 (53-04): the generated flat C API plus the lifecycle no-ops --
  // x64 only, in their own guard blocks so the x86 shim is untouched.
  const flatApi = emitFlatExports(
    sortedManifests,
    options.unrepresentable ?? FLAT_UNREPRESENTABLE_CASES
  )
  const flatApiBlock =
    `#if defined(__x86_64__)\n` +
    `static int g_flat_version_reports = 0;\n` +
    `// D-53-07: a flat ISteamClient_GetISteam* lookup of a version this shim does\n` +
    `// not serve answers NULL and tells the helper which version it was. The\n` +
    `// string is bounded, the result ignored, and at most 16 reports are sent per\n` +
    `// process (T-53-14, T-53-15).\n` +
    `static void flat_report_unknown_version(const char *v) {\n` +
    `  uint8_t req[4 + ${FWD_VERSION_LOG_MAX_BYTES}];\n` +
    `  uint8_t retbuf[1]; uint32_t retlen = 0;\n` +
    `  uint32_t n = 0;\n` +
    `  if (v == NULL || g_flat_version_reports >= 16) return;\n` +
    `  g_flat_version_reports++;\n` +
    `  while (n < ${FWD_VERSION_LOG_MAX_BYTES} && v[n] != 0) n++;\n` +
    `  req[0] = (uint8_t)(n & 0xff); req[1] = 0; req[2] = 0; req[3] = 0;\n` +
    `  memcpy(req + 4, v, n);\n` +
    `  (void)bridge_transact(BRIDGE_CONTROL_ORDINAL, BRIDGE_CONTROL_SLOT_REPORT_VERSION, req, 4 + n, retbuf, sizeof(retbuf), &retlen);\n` +
    `}\n\n` +
    `${flatApi.c}\n#endif\n`
  const lifecycleBlock =
    `#if defined(__x86_64__)\n` +
    `static const char g_gamelib_empty_string[] = "";\n` +
    LIFECYCLE_NOOP_EXPORTS.map(
      (name) => LIFECYCLE_NOOP_EXPORT_BODIES[name]
    ).join('\n') +
    `\n#endif\n` +
    // quick 261025-t7i: x64-only legacy CSteamworks64 exports.
    `#if defined(__x86_64__)\n` +
    LEGACY_CSTEAMWORKS_X64_EXPORTS.map(
      (name) => LEGACY_CSTEAMWORKS_X64_EXPORT_BODIES[name]
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
    `// === Steamworks flat C API (53-04, Win64 only -- D-53-01, generated from the manifests) ===\n\n` +
    `${flatApiBlock}\n` +
    `// === Steamworks.NET lifecycle no-ops (53-04, Win64 only -- D-53-06 as amended) ===\n\n` +
    `${lifecycleBlock}\n` +
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

/** Phase 52: a SteamClient GetISteamXxx lookup whose pointer return is
 * encoded on the wire as a 4-byte presence int (never the pointer). */
function isSteamClientPresenceReturn(
  manifest: InterfaceManifest,
  method: MethodSignature
): boolean {
  return (
    method.returnKind === 'pointer' &&
    isSteamClientVersionLookupMethod(manifest, method)
  )
}

/** Helper-side C type of a method's native return: `void *` for the
 * presence-encoded pointer, else the shared `cType`. */
function dispatchReturnCType(method: MethodSignature): string {
  return method.returnKind === 'pointer'
    ? 'void *'
    : dispatchCType(method.returns)
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
function dispatchReturnWidth(
  method: MethodSignature,
  manifest?: InterfaceManifest
): number | null {
  // Phase 52: an ISteamClient GetISteamXxx lookup returns a native pointer
  // that means nothing in the Wine process -- the wire carries a 4-byte
  // presence int instead. Every other pointer return stays refused.
  if (
    method.returnKind === 'pointer' &&
    manifest !== undefined &&
    isSteamClientPresenceReturn(manifest, method)
  ) {
    return 4
  }
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
  if (
    method.returnKind !== 'string' &&
    dispatchReturnWidth(method, manifest) === null
  ) {
    throw new Error(
      `generateDispatchHeader: ${ctx} has returnKind "${method.returnKind}"${
        method.returnKind === 'class'
          ? ` with structSize ${method.structSize} (only 8 is supported helper-side)`
          : ' -- unsupported helper-side return shape'
      }, never silently mis-encoded (51-10)`
    )
  }
  const hasOutValue = method.params.some((p) => {
    const k = p.kind ?? 'value'
    return k === 'out-value' || k === 'out-buffer'
  })
  if (
    hasOutValue &&
    (method.returnKind === 'void' || method.returnKind === 'string')
  ) {
    throw new Error(
      `generateDispatchHeader: ${ctx} has returnKind "${method.returnKind}" with an 'out-value' param -- appending out-value response bytes after a void/string base return is deferred to a future plan, never silently wrong (51-10/51-11)`
    )
  }
  // 53-14: out-buffer dispatch is supported for exactly ONE out-buffer per
  // method, whose sizeParam is a sibling by-value scalar -- the response
  // budget (BRIDGE_DISPATCH_RESP_SCRATCH_BYTES) is shared with nothing else.
  const outBuffers = method.params.filter(
    (p) => (p.kind ?? 'value') === 'out-buffer'
  )
  if (outBuffers.length > 1) {
    throw new Error(
      `generateDispatchHeader: ${ctx} declares ${outBuffers.length} out-buffer params -- helper-side dispatch supports at most one (53-14), never silently wrong`
    )
  }
  for (const p of outBuffers) {
    const size = method.params.find((q) => q.name === p.sizeParam)
    if (!size || (size.kind ?? 'value') !== 'value') {
      throw new Error(
        `generateDispatchHeader: ${ctx} out-buffer param "${p.name}" sizeParam "${p.sizeParam}" must name a sibling by-value scalar param (53-14)`
      )
    }
  }
}

/** Phase 52 (T-52-03): ISteamClient lookups for app-scoped families are
 * refused in --identity-only mode, exactly like the direct family gate. */
const STEAM_CLIENT_APP_SCOPED_LOOKUPS: ReadonlySet<string> = new Set([
  'GetISteamUserStats',
  'GetISteamRemoteStorage',
  'GetISteamGameServerStats'
])

/** Max bytes of a game-supplied version string a FWD log line carries. */
const FWD_VERSION_LOG_MAX_BYTES = 128

function fwdLogLine(fwdName: string, tail: string): string {
  return `      logts("FWD", "${fwdName} " ${tail});`
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
  const returnType = dispatchReturnCType(method)
  const isIdentityGatedFamily =
    manifest.family === 'SteamUserStats' ||
    manifest.family === 'SteamRemoteStorage'
  const isAppIdReport =
    manifest.family === 'SteamUtils' && method.name === 'GetAppID'

  const isForwardedClient = manifest.family === STEAM_CLIENT_FAMILY
  const fwdName = `${manifest.interface}.${method.name}`
  const presenceReturn = isSteamClientPresenceReturn(manifest, method)

  const lines: string[] = []
  lines.push(
    `    case (((uint32_t)${ordinal}) << 16 | ${slot}u): { // ${manifest.interface}.${method.name}`
  )

  if (isForwardedClient && STEAM_CLIENT_APP_SCOPED_LOOKUPS.has(method.name)) {
    lines.push(
      `      if (g_bd_identity_only) { *respLen = 0; return 1; } // T-52-03: app-scoped family refused via ISteamClient too`
    )
  }

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

  if (isForwardedClient) {
    lines.push(
      `      if (${flatVar} == NULL || ${selfVar} == NULL) { logts("FWD", "${fwdName} unresolved"); *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called`
    )
  } else {
    lines.push(
      `      if (${flatVar} == NULL || ${selfVar} == NULL) { *respLen = 0; return 1; } // T-51-23: unresolved symbol, never called`
    )
  }

  // --- request decode (value / in-string only -- assertDispatchable above
  // refuses out-value/out-buffer) ---
  const decls: string[] = []
  const callArgs: string[] = [selfVar]
  let offsetExpr = '0u'

  for (const p of method.params) {
    const kind = p.kind ?? 'value'
    const varName = `arg_${p.name}`
    if (kind === 'null-in') {
      // 53-14: never sent on the wire; the helper passes NULL so no game
      // address is ever dereferenced here (T-53-57).
      callArgs.push('NULL')
      continue
    }
    if (kind === 'out-buffer') {
      // 53-14: request carries [u32 capacity] (WIRE_LAYOUT_DOC). The data
      // lives in a helper-owned static buffer -- the game's pointer is never
      // sent. Capacity is clamped to BD_WIRE_OUT_BUFFER_MAX_BYTES and to what
      // the response scratch can still carry after the fixed fields.
      const bufName = `${flatVar}_${p.name}_buf`
      const capName = `cap_${p.name}`
      const outValueWidth = method.params
        .filter((q) => (q.kind ?? 'value') === 'out-value')
        .reduce((sum, q) => sum + valueTypeWidth(q.valueType ?? 'int32'), 0)
      const fixed =
        (dispatchReturnWidth(method, manifest) ?? 0) + outValueWidth + 4
      decls.push(
        `      static uint8_t ${bufName}[BD_WIRE_OUT_BUFFER_MAX_BYTES];`,
        `      uint32_t ${capName} = 0;`,
        `      if (argLen < ${offsetExpr} + 4) { *respLen = 0; return 1; }`,
        `      memcpy(&${capName}, arg + ${offsetExpr}, 4);`,
        `      if (${capName} > BD_WIRE_OUT_BUFFER_MAX_BYTES) ${capName} = BD_WIRE_OUT_BUFFER_MAX_BYTES;`,
        `      if (respCap < ${fixed}) { *respLen = 0; return 1; }`,
        `      if (${capName} > respCap - ${fixed}) ${capName} = (uint32_t)(respCap - ${fixed}); // response must fit the scratch`,
        `      memset(${bufName}, 0, ${capName}); // no earlier call's bytes cross into the game (53-17 WR-04)`
      )
      callArgs.push(bufName)
      offsetExpr = `(${offsetExpr} + 4)`
      continue
    }
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

  // 53-14: the native size argument can never exceed the clamped capacity of
  // the helper-owned buffer it describes (a hostile/negative wire value is
  // pulled back to the capacity, never trusted).
  for (const p of method.params) {
    if ((p.kind ?? 'value') !== 'out-buffer') continue
    const sizeP = method.params.find((q) => q.name === p.sizeParam)!
    lines.push(
      `      if ((int64_t)arg_${sizeP.name} < 0 || (int64_t)arg_${sizeP.name} > (int64_t)cap_${p.name}) arg_${sizeP.name} = (${dispatchCType(sizeP.type)})cap_${p.name};`
    )
  }
  for (let i = 0; i < (method.helperTrailingNullArgs ?? 0); i++) {
    callArgs.push('NULL')
  }

  // --- call + response encode ---
  const callExpr = `${flatVar}(${callArgs.join(', ')})`
  if (presenceReturn) {
    const versionParam = method.params.find((p) => p.type === 'const char*')!
    lines.push(
      `      void *result = ${callExpr};`,
      `      int32_t present = (result != NULL) ? 1 : 0;`,
      `      { char fwdv[BD_FWD_VERSION_CAP]; char fwdmsg[256]; bd_fwd_sanitize(arg_${versionParam.name}, fwdv, sizeof(fwdv));`,
      `        snprintf(fwdmsg, sizeof(fwdmsg), "${fwdName} ver=%s native=%s", fwdv, present ? "present" : "NULL"); logts("FWD", fwdmsg); }`,
      `      if (respCap < 4) { *respLen = 0; return 1; }`,
      `      memcpy(resp, &present, 4);`,
      `      *respLen = 4;`,
      `      return 0;`
    )
  } else if (method.returnKind === 'void') {
    lines.push(`      ${callExpr};`)
    if (isForwardedClient) lines.push(fwdLogLine(fwdName, '"called"'))
    lines.push(`      *respLen = 0; return 0;`)
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
    const width = dispatchReturnWidth(method, manifest)
    const fwdIntLog = isForwardedClient
      ? [
          `      { char fwdmsg[256]; snprintf(fwdmsg, sizeof(fwdmsg), "${fwdName} -> %d", (int)__ret); logts("FWD", fwdmsg); }`
        ]
      : []
    const outValueParams = method.params.filter(
      (p) => (p.kind ?? 'value') === 'out-value'
    )
    const outBufferParams = method.params.filter(
      (p) => (p.kind ?? 'value') === 'out-buffer'
    )
    if (outValueParams.length === 0 && outBufferParams.length === 0) {
      lines.push(
        `      ${returnType} __ret = ${callExpr};`,
        ...fwdIntLog,
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
      const totalWidth =
        extraWidths.reduce((sum, w) => sum + w, width!) +
        (outBufferParams.length > 0 ? 4 : 0)
      lines.push(
        `      ${returnType} __ret = ${callExpr};`,
        ...fwdIntLog,
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
      // 53-14: out-buffer trails the out-values -- [u32 len][len bytes],
      // len = min(lenParam's out-value if any, clamped capacity).
      for (const p of outBufferParams) {
        const bufName = `${flatVar}_${p.name}_buf`
        lines.push(`      uint32_t outLen_${p.name} = cap_${p.name};`)
        if (p.lenParam) {
          lines.push(
            `      if ((uint32_t)arg_${p.lenParam} < outLen_${p.name}) outLen_${p.name} = (uint32_t)arg_${p.lenParam};`
          )
        }
        lines.push(
          `      memcpy(resp + ${offset}, &outLen_${p.name}, 4);`,
          `      memcpy(resp + ${offset} + 4, ${bufName}, outLen_${p.name});`
        )
      }
      if (outBufferParams.length > 0) {
        const last = outBufferParams[0]
        lines.push(
          `      *respLen = ${offset} + 4 + outLen_${last.name};`,
          `      return 0;`
        )
      } else {
        lines.push(`      *respLen = ${offset};`, `      return 0;`)
      }
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
          // 53-14: a null-in param and every helperTrailingNullArgs slot
          // are `const void *` on the native 1.59+ flat signature.
          const realParams = [
            ...method.params.map((p) =>
              (p.kind ?? 'value') === 'null-in'
                ? 'const void *'
                : dispatchCType(p.type)
            ),
            ...Array.from(
              { length: method.helperTrailingNullArgs ?? 0 },
              () => 'const void *'
            )
          ].join(', ')
          const paramList = ['void *', realParams].filter(Boolean).join(', ')
          const slotDefine = `#define BD_SLOT_${m.interface}_${method.name} ${method.slot}`
          return (
            `${slotDefine}\n` +
            `typedef ${dispatchReturnCType(method)} (*${typedefName})(${paramList});\n` +
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

  // 53-06 (D-53-13): dense (ordinal, slot) -> `Interface.Method` call-name
  // table for the helper's once-per-method CALL trace. Mirrors the dispatch
  // switch's coverage exactly; names come only from manifest identifiers.
  const callEntries: { key: string; name: string }[] = []
  for (const m of dispatchManifests) {
    const wireMethods = [...m.methods]
      .filter((method) => isWireDispatchMethod(m, method))
      .sort((a, b) => a.slot - b.slot)
    for (const method of wireMethods) {
      const name = `${m.interface}.${method.name}`
      if (!/^[A-Za-z0-9_]+\.[A-Za-z0-9_]+$/.test(name)) {
        throw new Error(
          `generateDispatchHeader: call name "${name}" is not a plain identifier pair (53-06, log-injection guard)`
        )
      }
      callEntries.push({
        key: `BD_ORDINAL_${m.interface}, BD_SLOT_${m.interface}_${method.name}`,
        name
      })
    }
  }
  const callIndexCases = callEntries
    .map(
      (e, i) =>
        `    case (((uint32_t)${e.key.split(', ')[0]} << 16) | (uint32_t)${e.key.split(', ')[1]}): return ${i};\n`
    )
    .join('')
  const callNameCases = callEntries
    .map((e, i) => `    case ${i}: return "${e.name}";\n`)
    .join('')
  const callTables =
    `// 53-06 (D-53-13): game-originated call trace tables. Not a wire tuple,\n` +
    `// so BRIDGE_DISPATCH_TABLE_HASH is unaffected.\n` +
    `#define BD_CALL_COUNT ${callEntries.length}\n` +
    `static int bd_call_index(uint16_t ordinal, uint16_t slot) {\n` +
    `  switch (((uint32_t)ordinal << 16) | (uint32_t)slot) {\n` +
    callIndexCases +
    `    default: return -1;\n` +
    `  }\n` +
    `}\n` +
    `static const char *bd_call_name(int idx) {\n` +
    `  switch (idx) {\n` +
    callNameCases +
    `    default: return "";\n` +
    `  }\n` +
    `}\n\n`

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
    `#include <stdio.h>\n` +
    `#include <string.h>\n\n` +
    `// Phase 52: bridge_helper.c defines logts() after #including this header.\n` +
    `static void logts(const char *cat, const char *msg);\n\n` +
    `// Phase 52 (T-52-04): game-controlled strings reach the FWD log only\n` +
    `// through this sanitizer -- length-bounded, non-printables become '?'.\n` +
    `#define BD_FWD_VERSION_CAP ${FWD_VERSION_LOG_MAX_BYTES + 1}\n` +
    `static void bd_fwd_sanitize(const char *in, char *out, size_t cap) {\n` +
    `  size_t i = 0;\n` +
    `  if (cap == 0) return;\n` +
    `  if (in == NULL) { snprintf(out, cap, "(null)"); return; }\n` +
    `  for (; in[i] != '\\0' && i < ${FWD_VERSION_LOG_MAX_BYTES} && i + 1 < cap; i++) {\n` +
    `    unsigned char c = (unsigned char)in[i];\n` +
    `    out[i] = (c >= 0x20 && c <= 0x7e) ? (char)c : '?';\n` +
    `  }\n` +
    `  out[i] = '\\0';\n` +
    `}\n\n` +
    `/*\n${WIRE_LAYOUT_DOC}*/\n` +
    `#define BD_WIRE_IN_STRING_MAX_BYTES ${WIRE_IN_STRING_MAX_BYTES}\n` +
    `#define BD_WIRE_OUT_BUFFER_MAX_BYTES ${WIRE_OUT_BUFFER_MAX_BYTES}\n\n` +
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
    callTables +
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

  // Phase 53: a family whose bare accessor name is already a GAMESERVER flat
  // stub (SteamGameServer, SteamGameServerStats) keeps that stub -- emitting
  // a second definition would not compile and the stub's NULL answer is the
  // pre-existing behavior (the game-server surface is unsupported).
  const families = [...new Set(manifests.map((m) => m.family))]
    .filter((f) => !hasGameServerFlatStub(bareAccessorName(f)))
    .sort()
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
  const libraryName = arch === 'x64' ? 'steam_api64' : 'steam_api'
  const lines = [
    `LIBRARY ${libraryName}`,
    'EXPORTS',
    ...defExportNames(manifests, arch)
  ]
  return lines.join('\n') + '\n'
}

function defExportNames(
  manifests: InterfaceManifest[],
  arch: ArchToken
): string[] {
  const archManifests = manifests.filter((m) => m.arches.includes(arch))
  const sortedManifests = [...archManifests].sort(
    (a, b) => a.ordinal - b.ordinal
  )
  const accessorExports = sortedManifests.map((m) => flatAccessorName(m))
  const families = [...new Set(sortedManifests.map((m) => m.family))]
    .filter((f) => !hasGameServerFlatStub(bareAccessorName(f)))
    .sort()
  const bareAccessorExports = families.map((f) => bareAccessorName(f))
  // 51-15: the modern-SDK lookup family is Win64-only -- see
  // MODERN_LOOKUP_FLAT_EXPORTS' doc comment. Phase 53: so are the generated
  // flat C API and the Steamworks.NET lifecycle no-ops.
  const x64Only: string[] =
    arch === 'x64'
      ? [
          ...MODERN_LOOKUP_FLAT_EXPORTS,
          ...emitFlatExports(manifests).names,
          ...LIFECYCLE_NOOP_EXPORTS,
          ...LEGACY_CSTEAMWORKS_X64_EXPORTS
        ]
      : []
  return [
    ...FLAT_EXPORTS_SUPERSET,
    ...GAMESERVER_FLAT_STUBS,
    ...x64Only,
    ...accessorExports,
    ...bareAccessorExports
  ]
}

function x64DefExportNames(manifests: InterfaceManifest[]): string[] {
  const names = defExportNames(manifests, 'x64')
  const dup = names.find((n, i) => names.indexOf(n) !== i)
  if (dup !== undefined) {
    throw new Error(`steam_api64 export '${dup}' is emitted twice`)
  }
  return names
}

// ---------------------------------------------------------------------------
// Main (guarded -- never runs on a test import of this module)
// ---------------------------------------------------------------------------

const SDK_DIR = join('meta', 'sdk')
const OUT_DIR = join('native', 'steam-bridge', 'generated')
const SHIM_EXPORTS_TS_PATH = join(
  'src',
  'backend',
  'storeManagers',
  'steam',
  'bridge',
  'shimExports.generated.ts'
)

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
  writeFileSync(SHIM_EXPORTS_TS_PATH, generateShimExportsTs(manifests))

  const totalSlots = manifests.reduce((sum, m) => sum + m.methods.length, 0)
  const x64Exports = x64DefExportNames(manifests).length
  console.log(
    `Generated steam_api shim: ${manifests.length} interfaces, ` +
      `${totalSlots} vtable slots, ` +
      `${FLAT_EXPORTS_SUPERSET.length + manifests.length} flat exports, ` +
      `${x64Exports} steam_api64 exports.`
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
