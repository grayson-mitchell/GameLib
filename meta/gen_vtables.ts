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
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync
} from 'node:fs'
import { join } from 'node:path'

import {
  OLDER_VERSION_CHECKED_FAMILIES,
  normalizeParamType,
  paramListsEqual
} from './signatureEquality'

import {
  CALLBACK_LAYOUTS,
  MSVC_CCALLBACKBASE_OFFSETS,
  MSVC_CCALLBACKBASE_VSLOT_RUN_1ARG,
  MSVC_CCALLBACKBASE_VSLOT_RUN_3ARG,
  STEAM_CALLBACK_FLAG_GAMESERVER,
  STEAM_CALLBACK_FLAG_REGISTERED,
  USER_STATS_RECEIVED_LAYOUT
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
  | 'in-buffer'
  | 'in-struct'
  | 'out-struct'
  | 'out-messages'

export interface ParamSignature {
  name: string
  /** One of the recognized ABI type tokens -- see WIDTH_8_TYPES below. */
  type: string
  /** Wire-marshaling kind (51-06 Task 3). Omitted (or `'value'`) is the
   * original raw-byte-copy behavior. */
  kind?: ParamKind
  /** For `kind: 'out-value'` only -- the scalar type the out-value decodes
   * to on the response side. */
  valueType?: 'int32' | 'uint32' | 'uint16' | 'float' | 'bool' | 'uint64'
  /** For `kind: 'out-buffer'` only -- the name of the sibling param that
   * carries this buffer's capacity. */
  sizeParam?: string
  /** For `kind: 'out-buffer'` only (53-14) -- optional name of a sibling
   * `out-value` param that reports how many bytes the callee actually
   * produced (e.g. GetAuthSessionTicket's `pcbTicket`). The helper sends
   * min(that value, capacity) bytes instead of the whole capacity.
   * For `kind: 'in-buffer'` (58-06) -- the name of the sibling integer
   * by-value param that carries the buffer's byte length. */
  lenParam?: string
  /** For `kind: 'in-struct' | 'out-struct'` (58-06) -- the exact byte size of
   * the struct. Must equal the measured x64 size in CALLBACK_LAYOUTS, and the
   * struct's x64 and mac layouts must be byte-identical. */
  structSize?: number
  /** For `kind: 'out-buffer'` only (58-06) -- per-param cap override, up to
   * WIRE_LARGE_MAX_BYTES. Absent means WIRE_OUT_BUFFER_MAX_BYTES. */
  capBytes?: number
  /** For `kind: 'out-messages'` only (58-15) -- the name of the sibling
   * by-value integer param that carries the game's maximum message count. */
  countParam?: string
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

/** The four interface words of the helper's NET evidence grammar (58-05). */
export type NetEvidenceIface =
  | 'Matchmaking'
  | 'Networking'
  | 'Sockets'
  | 'Messages'

const NET_EVIDENCE_IFACES: ReadonlySet<string> = new Set([
  'Matchmaking',
  'Networking',
  'Sockets',
  'Messages'
])

/** Interface family -> NET iface used to log an in-buffer oversize refusal
 * (58-10). Families not listed emit no NET call. */
const FAMILY_NET_IFACE: Readonly<Record<string, NetEvidenceIface>> = {
  SteamMatchmaking: 'Matchmaking',
  SteamMatchmakingServers: 'Matchmaking',
  SteamNetworking: 'Networking',
  SteamNetworkingSockets: 'Sockets',
  SteamNetworkingUtils: 'Sockets',
  SteamNetworkingMessages: 'Messages'
}

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
 * declare (kind 'value' or absent).
 *
 * quick 261026-qvc: CSteamID is NO LONGER in this set. It is an 8-byte
 * trivially-copyable aggregate that both Win32 ABIs pass exactly like a
 * uint64_t (MSVC x64: one GPR; i386 __thiscall: 8 stack bytes, callee pops
 * 8), and Steam's macOS flat API takes it as a plain uint64 (same precedent
 * as GetSteamID's return at dispatchCType). First consumer is
 * GetFriendPersonaName (Overlooting 3410180).
 *
 * CGameID stays rejected: it is ABI-identical but has no consumer, and its
 * flat-API parameter shape has not been checked against a real caller, so
 * admitting it now would be an unexercised path. Re-evaluate when a CGameID
 * wire method is actually needed. */
const STRUCT_PARAM_TYPES: ReadonlySet<string> = new Set(['CGameID'])

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
  /** A method with this set never forwards its call (bar one STUBCALL first-call report) -- it returns the
   * constant immediately (51-06 Task 3). Unused by this plan's manifests. */
  helperFallback?: number | boolean
  /** 53-14: number of trailing NULL pointer arguments the helper appends to
   * the native flat call, AFTER every declared param. For a game-side
   * signature older than the Mac Steam's native one (SteamUser021's 3-arg
   * GetAuthSessionTicket vs the 1.59+ 5-arg flat function, whose last arg is
   * a SteamNetworkingIdentity*). Never sent on the wire. */
  helperTrailingNullArgs?: number
  /** 58-06: answered by a named shim-side body (SHIM_LOCAL_BODIES) and never
   * crosses the wire, so no Windows function pointer can reach the helper. */
  shimLocal?: boolean
  /** 58-06: name of a hand-written helper function (`^gl_[a-z0-9_]{1,48}$`)
   * that replaces the generic decode/encode for this one method. */
  helperCustom?: string
  /** 58-20: name of a by-value integer param holding an opaque handle. When it
   * is 0 the shim answers locally (false / 0 / no-op) and sends no wire frame. */
  zeroHandleParam?: string
  /** 58-21: on a wire method that also names `zeroHandleParam`, the shim drops
   * its server-browser response mapping for that handle (list handles key on the
   * low 32 bits, query handles on the int32) before the wire call. */
  unmapHandle?: 'list' | 'query'
  /** 58-10: the method returns a SteamAPICall_t (int64) that completes as this
   * callback id (a CALL_RESULT_TABLE id); the helper dispatch records the
   * handle with gl_helper_cr_track after a nonzero return. */
  callResult?: number
  /** 58-10: a successful call is NET evidence of a send or receive on one of
   * the four networking interfaces (closed enums, no payload ever logged). */
  evidence?: { kind: 'send' | 'recv'; iface: NetEvidenceIface }
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
  /** 58-03: extra flat export names that return the same instance as the
   * primary accessor (e.g. the SDK spelling vs a previously-shipped one).
   * Each must match ^SteamAPI_[A-Za-z0-9_]+$ and be unique across every
   * manifest's accessors and aliases. */
  flatAccessorAliases?: string[]
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
 * decodes its `[u32 len][bytes]` reply into (the NUL terminator is written
 * at the DECODED length, so a string must be < this). It must exceed
 * DISPATCH_STRING_RETURN_MAX_BYTES. 256 is
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

/** Integer by-value types an `in-buffer` lenParam may have. */
const WIRE_LENGTH_TYPES: ReadonlySet<string> = new Set([
  'int32',
  'uint32',
  'int64',
  'uint64'
])

/** 58-06 (Pitfall 2): an in-struct/out-struct is raw-copied between the
 * Windows game and the Mac helper, so it is allowed only for a struct whose
 * measured x64 and mac layouts are byte-identical in size and every field
 * offset (and x86 too, when the manifest also targets x86). Anything else
 * needs a deliberate repack and fails generation. */
function validateStructParam(
  manifest: InterfaceManifestV2,
  methodCtx: string,
  p: ParamSignature,
  kind: string
): string[] {
  const name = p.type
    .replace(/\bconst\b/g, '')
    .replace(/\*/g, '')
    .trim()
  const layouts = CALLBACK_LAYOUTS as Readonly<
    Record<
      string,
      {
        x64: { size: number; fields: Readonly<Record<string, number>> }
        x86: { size: number; fields: Readonly<Record<string, number>> }
        mac: { size: number; fields: Readonly<Record<string, number>> }
      }
    >
  >
  // 58-14: Proton spells some struct types with a trailing SDK version
  // (SteamNetworkingIdentity_144); the measured layout is the unversioned one.
  // 58-15: and sometimes a letter (SteamNetConnectionInfo_t_153a).
  const baseName = name.replace(/_\d+[a-z]?$/, '')
  const layoutName = Object.prototype.hasOwnProperty.call(layouts, name)
    ? name
    : baseName
  const entry = Object.prototype.hasOwnProperty.call(layouts, layoutName)
    ? layouts[layoutName]
    : undefined
  const where = `${methodCtx}: ${kind} param "${p.name}" (struct "${name}")`
  if (entry === undefined) {
    return [`${where} has no measured layout in CALLBACK_LAYOUTS`]
  }
  const errs: string[] = []
  if (!Number.isInteger(p.structSize) || (p.structSize ?? 0) <= 0) {
    errs.push(`${where} requires a positive integer structSize`)
  } else if (p.structSize !== entry.x64.size) {
    errs.push(
      `${where} structSize ${p.structSize} differs from the measured x64 size ${entry.x64.size}`
    )
  }
  const same = (
    a: { size: number; fields: Readonly<Record<string, number>> },
    b: { size: number; fields: Readonly<Record<string, number>> }
  ): boolean => {
    const ak = Object.keys(a.fields)
    const bk = Object.keys(b.fields)
    return (
      a.size === b.size &&
      ak.length === bk.length &&
      ak.every((k) => a.fields[k] === b.fields[k])
    )
  }
  if (!same(entry.x64, entry.mac)) {
    errs.push(
      `${where} needs repack: x64 and mac layouts differ (x64 ${entry.x64.size} bytes, mac ${entry.mac.size} bytes)`
    )
  }
  if (manifest.arches.includes('x86') && !same(entry.x64, entry.x86)) {
    errs.push(
      `${where} needs repack: x86 and x64 layouts differ (x86 ${entry.x86.size} bytes, x64 ${entry.x64.size} bytes)`
    )
  }
  return errs
}

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

  const aliases = flatAccessorAliasNames(manifest)
  const taken = new Map<string, string>()
  for (const other of allManifests) {
    if (other === manifest) continue
    for (const n of [flatAccessorName(other), ...flatAccessorAliasNames(other)])
      taken.set(n, other.interface)
  }
  const ownPrimary = flatAccessorName(manifest)
  aliases.forEach((alias, i) => {
    if (!/^SteamAPI_[A-Za-z0-9_]+$/.test(alias)) {
      errors.push(
        `${ctx}: flatAccessorAlias '${alias}' is not a valid SteamAPI_ name`
      )
    }
    if (alias === ownPrimary || aliases.indexOf(alias) !== i) {
      errors.push(
        `${ctx}: flatAccessorAlias '${alias}' duplicates this manifest's own export`
      )
    }
    const owner = taken.get(alias)
    if (owner !== undefined) {
      errors.push(
        `${ctx}: flatAccessorAlias '${alias}' duplicates an export of ${owner}`
      )
    }
  })

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

    if (method.helperCustom !== undefined) {
      if (!HELPER_CUSTOM_NAME.test(method.helperCustom)) {
        errors.push(
          `${methodCtx}: helperCustom "${method.helperCustom}" must match ${HELPER_CUSTOM_NAME}`
        )
      }
      if (!method.helperFlat) {
        errors.push(
          `${methodCtx}: helperCustom methods must still declare helperFlat (the custom function may use it)`
        )
      }
      // 58-14: shimLocal with helperCustom is allowed -- the shim emits its
      // own body (which may forward through gl_bridge_call_raw) and the helper
      // still emits the custom case for that (ordinal, slot).
    }
    if (method.shimLocal) {
      if (
        SHIM_LOCAL_BODIES[`${manifest.family}.${method.name}`] === undefined
      ) {
        errors.push(
          `${methodCtx}: shimLocal method has no SHIM_LOCAL_BODIES entry "${manifest.family}.${method.name}"`
        )
      }
    }

    if (
      manifest.family === STEAM_CLIENT_FAMILY &&
      (method.mode ?? manifest.mode) === 'wire' &&
      method.helperFallback === undefined &&
      !method.shimLocal
    ) {
      errors.push(
        `${methodCtx}: SteamClient has no wire path since Phase 56 (quick 261102-ht4): no x86 export hands out an ISteamClient and x64 answers locally -- use stub mode or helperFallback`
      )
    }

    if (method.zeroHandleParam !== undefined) {
      const zp = method.params.find((q) => q.name === method.zeroHandleParam)
      if ((method.mode ?? manifest.mode) !== 'wire') {
        errors.push(`${methodCtx}: zeroHandleParam requires a wire method`)
      } else if (
        !zp ||
        (zp.kind ?? 'value') !== 'value' ||
        zp.type.endsWith('*')
      ) {
        errors.push(
          `${methodCtx}: zeroHandleParam "${method.zeroHandleParam}" must name a by-value non-pointer param`
        )
      }
      if (method.returnKind === 'class' || method.returnKind === 'string') {
        errors.push(
          `${methodCtx}: zeroHandleParam cannot be combined with a ${method.returnKind} return`
        )
      }
    }

    if (method.unmapHandle !== undefined) {
      if (method.unmapHandle !== 'list' && method.unmapHandle !== 'query') {
        errors.push(`${methodCtx}: unmapHandle must be "list" or "query"`)
      }
      if (method.zeroHandleParam === undefined) {
        errors.push(`${methodCtx}: unmapHandle requires zeroHandleParam`)
      }
    }

    if (method.callResult !== undefined) {
      if (!CALL_RESULT_TABLE.some((r) => r.id === method.callResult)) {
        errors.push(
          `${methodCtx}: callResult ${String(method.callResult)} is not a CALL_RESULT_TABLE id`
        )
      }
      if (method.returnKind !== 'int64') {
        errors.push(
          `${methodCtx}: callResult requires returnKind 'int64' (a SteamAPICall_t), got '${method.returnKind}'`
        )
      }
    }
    if (method.evidence !== undefined) {
      const ev = method.evidence as { kind?: unknown; iface?: unknown }
      if (ev.kind !== 'send' && ev.kind !== 'recv') {
        errors.push(
          `${methodCtx}: evidence.kind must be 'send' or 'recv', got ${JSON.stringify(ev.kind)}`
        )
      }
      if (typeof ev.iface !== 'string' || !NET_EVIDENCE_IFACES.has(ev.iface)) {
        errors.push(
          `${methodCtx}: evidence.iface must be one of Matchmaking, Networking, Sockets, Messages, got ${JSON.stringify(ev.iface)}`
        )
      }
      if (method.returnKind !== 'int32') {
        errors.push(
          `${methodCtx}: evidence requires an int32 or bool return, got '${method.returnKind}'`
        )
      }
    }
    if (
      method.helperCustom !== undefined &&
      (method.callResult !== undefined || method.evidence !== undefined)
    ) {
      errors.push(
        `${methodCtx}: callResult/evidence cannot be combined with helperCustom (the custom function owns the whole reply)`
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
      // A shimLocal method never marshals its params (the shim answers it),
      // so the wire-kind rules do not apply to it (58-11).
      for (const p of method.shimLocal ? [] : method.params) {
        const kind = p.kind ?? 'value'
        const isPointerType = p.type.endsWith('*')
        // 58-14: a param named like a stub local would shadow it and emit C
        // that does not compile (or silently reads the wrong variable).
        if (STUB_RESERVED_LOCALS.has(p.name)) {
          errors.push(
            `${methodCtx}: wire param name "${p.name}" collides with a generated stub local; rename it in wire-policy.json`
          )
        }
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
        } else if (kind === 'in-buffer') {
          if (!isPointerType) {
            errors.push(
              `${methodCtx}: in-buffer param "${p.name}" (type "${p.type}") must be a pointer`
            )
          }
          const sib = method.params.find((q) => q.name === p.lenParam)
          if (
            !p.lenParam ||
            !sib ||
            (sib.kind ?? 'value') !== 'value' ||
            !WIRE_LENGTH_TYPES.has(sib.type)
          ) {
            errors.push(
              `${methodCtx}: in-buffer param "${p.name}" lenParam "${p.lenParam ?? ''}" must name a sibling by-value integer param (int32/uint32/int64/uint64)`
            )
          }
        } else if (kind === 'out-messages') {
          // 58-15: the response carries the message count as the method's own
          // int32 return, then the records; the game's array is the param.
          if (p.type !== 'SteamNetworkingMessage_t**') {
            errors.push(
              `${methodCtx}: out-messages param "${p.name}" (type "${p.type}") must be of type SteamNetworkingMessage_t**`
            )
          }
          const sib = method.params.find((q) => q.name === p.countParam)
          if (
            !p.countParam ||
            !sib ||
            (sib.kind ?? 'value') !== 'value' ||
            !WIRE_LENGTH_TYPES.has(sib.type)
          ) {
            errors.push(
              `${methodCtx}: out-messages param "${p.name}" countParam "${p.countParam ?? ''}" must name a sibling by-value integer param (int32/uint32/int64/uint64)`
            )
          }
          if (method.returnKind !== 'int32') {
            errors.push(
              `${methodCtx}: out-messages method must return int32 (the message count)`
            )
          }
          if (method.helperCustom === undefined) {
            errors.push(
              `${methodCtx}: out-messages needs a helperCustom function (the helper owns the Mac message copy, carry queue and release)`
            )
          }
          if (
            method.params.filter((q) => q.kind === 'out-messages').length > 1
          ) {
            errors.push(
              `${methodCtx}: at most one out-messages param per method`
            )
          }
        } else if (kind === 'in-struct' || kind === 'out-struct') {
          if (!isPointerType) {
            errors.push(
              `${methodCtx}: ${kind} param "${p.name}" (type "${p.type}") must be a pointer`
            )
          }
          errors.push(...validateStructParam(manifest, methodCtx, p, kind))
        }
        if (p.capBytes !== undefined) {
          if (
            kind !== 'out-buffer' ||
            !Number.isInteger(p.capBytes) ||
            p.capBytes < 1 ||
            p.capBytes > WIRE_LARGE_MAX_BYTES
          ) {
            errors.push(
              `${methodCtx}: capBytes on param "${p.name}" is only valid on an out-buffer as an integer 1..${WIRE_LARGE_MAX_BYTES} (got ${String(p.capBytes)}, kind ${kind})`
            )
          }
        }
      }
    }
  }

  errors.push(...validateOlderVersionSignatures(manifest, allManifests))

  return errors
}

function interfaceVersionNumber(name: string): number {
  const m = /(\d+)$/.exec(name)
  return m ? Number(m[1]) : -1
}

/**
 * 58-18 (T-58-56): an older interface version may wire a method onto the helper
 * flat function it shares with the newest version (same family, same
 * helperInterface) only when the method's parameter list -- count and types --
 * equals the newest version's method of the same name. A mismatch means the
 * ABI moved between versions and the shared flat call would be wrong. The error
 * names both versions.
 */
function validateOlderVersionSignatures(
  manifest: InterfaceManifestV2,
  allManifests: InterfaceManifestV2[]
): string[] {
  if (!manifest.helperInterface) return []
  if (!OLDER_VERSION_CHECKED_FAMILIES.has(manifest.family)) return []
  const peers = allManifests.filter(
    (m) =>
      m !== manifest &&
      m.family === manifest.family &&
      m.helperInterface === manifest.helperInterface
  )
  const own = interfaceVersionNumber(manifest.interface)
  const newest = [manifest, ...peers].reduce((a, b) =>
    interfaceVersionNumber(b.interface) > interfaceVersionNumber(a.interface)
      ? b
      : a
  )
  if (newest === manifest || interfaceVersionNumber(newest.interface) <= own) {
    return []
  }
  const errors: string[] = []
  for (const method of manifest.methods) {
    if (method.mode !== 'wire') continue
    const ref = newest.methods.find((m) => m.name === method.name)
    const where = `${manifest.interface} slot ${method.slot} (${method.name}) is wired but`
    if (!ref) {
      errors.push(
        `${where} ${newest.interface} has no method of that name to share a helper flat function with`
      )
      continue
    }
    if (!paramListsEqual(method.params, ref.params)) {
      const a = method.params.map((p) => normalizeParamType(p.type))
      const b = ref.params.map((p) => normalizeParamType(p.type))
      errors.push(
        `${where} its parameter list (${a.join(', ')}) differs from ${newest.interface} (${b.join(', ')}); older versions wire only an identical signature`
      )
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
    // 58-14: a float travels in an XMM register on Win64, so a float param or
    // return must be declared float (not the uint32_t fallback below).
    case 'float':
      return 'float'
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
    case 'char*':
      return 'char *'
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
    case 'uint16_t*':
      return 'uint16_t *'
    case 'CSteamID*':
      return 'uint64_t *'
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

/** Max bytes an `in-buffer` request field, or an `out-buffer` carrying a
 * `capBytes` override, may hold. Leaves headroom under protocol.ts's
 * MAX_FRAME_BYTES (65536) for the frame header and the method's other
 * params. */
export const WIRE_LARGE_MAX_BYTES = 61440

/** Max total record bytes an `out-messages` response may carry (58-15); the
 * helper never encodes more and the shim stub sizes its buffer from it. */
export const WIRE_OUT_MESSAGES_MAX_BYTES = WIRE_LARGE_MAX_BYTES

/** Max bytes an `in-buffer` request field may carry (58-06). */
export const WIRE_IN_BUFFER_MAX_BYTES = WIRE_LARGE_MAX_BYTES

/** A request or response above this many bytes goes through a static buffer
 * used only while g_bridge_lock is held (58-06, T-58-19); at or below it the
 * stub keeps a plain stack array. */
const WIRE_STACK_BUFFER_MAX_BYTES = 4096 + 64

/** 58-06: shim-local method bodies, keyed `<Family>.<Method>`. The value is
 * C statement text (the inside of the function braces) taking the method's own
 * C parameters after `self`. A `shimLocal` method with no entry here fails
 * generation. 58-11 adds the two ISteamUtils polling methods; wiring plans
 * 58-12..58-21 add more. Parameter names are the served manifests' own
 * (identical across SteamUtils005..010). */
export const SHIM_LOCAL_BODIES: Readonly<Record<string, string>> = {
  'SteamUtils.IsAPICallCompleted':
    '  return gl_md_is_api_call_completed(hSteamAPICall, (uint8_t *)pbFailed);',
  'SteamUtils.GetAPICallResult':
    '  return gl_md_get_api_call_result(hSteamAPICall, pCallback, cubCallback, iCallbackExpected, (uint8_t *)pbFailed);',
  // 58-14: ISteamNetworkingUtils004. Parameter names are the manifest's own.
  'SteamNetworkingUtils.AllocateMessage':
    '  return gl_msg_alloc((int32_t)cbAllocateBuffer);',
  'SteamNetworkingUtils.GetLocalPingLocation':
    '  return gl_net_get_local_ping_location(result);',
  'SteamNetworkingUtils.ConvertPingLocationToString':
    '  gl_net_convert_ping_location(location, pszBuf, (int32_t)cchBufSize);',
  'SteamNetworkingUtils.CheckPingDataUpToDate':
    '  return gl_net_check_ping_data(flMaxAgeSeconds);',
  'SteamNetworkingUtils.GetPOPList':
    '  return (uint32_t)gl_net_get_pop_list((uint32_t *)list, (int32_t)nListSz);',
  'SteamNetworkingUtils.SetDebugOutputFunction':
    '  gl_net_set_debug_output((int32_t)eDetailLevel, pfnFunc);',
  'SteamNetworkingUtils.SetConfigValue':
    '  return gl_net_set_config_value((int32_t)eValue, (int32_t)eScopeType, (int64_t)(uint32_t)scopeObj, (int32_t)eDataType, pArg);',
  'SteamNetworkingUtils.GetConfigValue':
    '  return (uint32_t)gl_net_get_config_value((int32_t)eValue, (int32_t)eScopeType, (int64_t)(uint32_t)scopeObj, (int32_t *)pOutDataType, pResult, (size_t *)cbResult);',
  'SteamNetworkingUtils.GetConfigValueInfo':
    '  return gl_net_get_config_value_info((int32_t)eValue, (int32_t *)pOutDataType, (int32_t *)pOutScope);',
  'SteamNetworkingUtils.SteamNetworkingIPAddr_ToString':
    '  if (addr != NULL) gl_ip_to_string((const gl_net_ip *)addr, buf, cbBuf, (bWithPort & 0xff) != 0);\n  else if (buf != NULL && cbBuf > 0) buf[0] = 0;',
  'SteamNetworkingUtils.SteamNetworkingIPAddr_ParseString':
    '  return pAddr != NULL && gl_ip_parse((gl_net_ip *)pAddr, pszStr);',
  'SteamNetworkingUtils.SteamNetworkingIPAddr_GetFakeIPType':
    '  return addr != NULL ? (uint32_t)gl_ip_fake_type((const gl_net_ip *)addr) : 0;',
  'SteamNetworkingUtils.SteamNetworkingIdentity_ToString':
    '  if (identity != NULL) gl_id_to_string((const gl_net_ident *)identity, buf, cbBuf);\n  else if (buf != NULL && cbBuf > 0) buf[0] = 0;',
  'SteamNetworkingUtils.SteamNetworkingIdentity_ParseString':
    '  return pIdentity != NULL && gl_id_parse((gl_net_ident *)pIdentity, pszStr);',
  // 58-15: ISteamNetworkingSockets013. Parameter names are the manifest's own
  // (set in wire-policy.json for the thunks Proton left anonymous).
  'SteamNetworkingSockets.CreateListenSocketIP':
    '  return gl_net_open(0, localAddress, 0, nOptions, pOptions, GL_NET_SCOPE_LISTEN);',
  'SteamNetworkingSockets.ConnectByIPAddress':
    '  return gl_net_open(1, address, 0, nOptions, pOptions, GL_NET_SCOPE_CONNECTION);',
  'SteamNetworkingSockets.CreateListenSocketP2P':
    '  return gl_net_open(2, NULL, nLocalVirtualPort, nOptions, pOptions, GL_NET_SCOPE_LISTEN);',
  'SteamNetworkingSockets.ConnectP2P':
    '  return gl_net_open(3, identityRemote, nRemoteVirtualPort, nOptions, pOptions, GL_NET_SCOPE_CONNECTION);',
  'SteamNetworkingSockets.GetConnectionRealTimeStatus':
    '  return gl_net_rt_status(hConn, pStatus, nLanes, pLanes);',
  'SteamNetworkingSockets.ConfigureConnectionLanes':
    '  return gl_net_configure_lanes(hConn, nNumLanes, pLanePriorities, pLaneWeights);',
  // Sends each message through the wired SendMessageToConnection. A sent
  // message is always released; a failed one only when the game asked for it.
  'SteamNetworkingSockets.SendMessages':
    '  int32_t i;\n' +
    '  int del = (bDeleteFailedMessages & 0xff) != 0;\n' +
    '  int64_t *res = (int64_t *)pOutMessageNumberOrResult;\n' +
    '  uint8_t **msgs = (uint8_t **)pMessages;\n' +
    '  if (nMessages <= 0 || msgs == NULL) return;\n' +
    '  for (i = 0; i < nMessages; i++) {\n' +
    '    uint8_t *m = msgs[i];\n' +
    '    uint64_t num = 0;\n' +
    '    uint32_t r, conn, cb;\n' +
    '    int32_t flags;\n' +
    '    void *data;\n' +
    '    if (m == NULL) { if (res != NULL) res[i] = -2; continue; }\n' +
    '    memcpy(&data, m, sizeof data);\n' +
    '    memcpy(&cb, m + 8, 4);\n' +
    '    memcpy(&conn, m + GL_NET_MSG_OFF_CONN, 4);\n' +
    '    memcpy(&flags, m + GL_NET_MSG_OFF_FLAGS, 4);\n' +
    '    r = vt_SteamNetworkingSockets013_SendMessageToConnection(self, conn, data, cb, flags, &num);\n' +
    '    if (r == 1) {\n' +
    '      if (res != NULL) res[i] = (int64_t)num;\n' +
    '      gl_msg_release_via_fn(m);\n' +
    '    } else {\n' +
    '      if (res != NULL) res[i] = r != 0 ? -(int64_t)r : -2;\n' +
    '      if (del) gl_msg_release_via_fn(m);\n' +
    '    }\n' +
    '  }',
  'SteamNetworkingSockets.RunCallbacks':
    '  gl_cb_run_callbacks();\n  gl_md_run_frame();',
  // 58-21: ISteamMatchmakingServers003 request methods. The response-object
  // pointer and the filter array never cross the wire; the registry keeps the
  // object keyed by the returned handle.
  'SteamMatchmakingServers.RequestInternetServerList':
    '  return (void *)(uintptr_t)gl_mms_request_list(0, iApp, ppchFilters, nFilters, pRequestServersResponse);',
  'SteamMatchmakingServers.RequestLANServerList':
    '  return (void *)(uintptr_t)gl_mms_request_list(1, iApp, NULL, 0, pRequestServersResponse);',
  'SteamMatchmakingServers.RequestFriendsServerList':
    '  return (void *)(uintptr_t)gl_mms_request_list(2, iApp, ppchFilters, nFilters, pRequestServersResponse);',
  'SteamMatchmakingServers.RequestFavoritesServerList':
    '  return (void *)(uintptr_t)gl_mms_request_list(3, iApp, ppchFilters, nFilters, pRequestServersResponse);',
  'SteamMatchmakingServers.RequestHistoryServerList':
    '  return (void *)(uintptr_t)gl_mms_request_list(4, iApp, ppchFilters, nFilters, pRequestServersResponse);',
  'SteamMatchmakingServers.RequestSpectatorServerList':
    '  return (void *)(uintptr_t)gl_mms_request_list(5, iApp, ppchFilters, nFilters, pRequestServersResponse);',
  'SteamMatchmakingServers.GetServerDetails':
    '  return gl_mms_get_server_details(hRequest, iServer);',
  'SteamMatchmakingServers.PingServer':
    '  return gl_mms_query(13, GL_MMS_Q_PING, unIP, usPort & 0xffffu, pRequestServersResponse);',
  'SteamMatchmakingServers.PlayerDetails':
    '  return gl_mms_query(14, GL_MMS_Q_PLAYERS, unIP, usPort & 0xffffu, pRequestServersResponse);',
  'SteamMatchmakingServers.ServerRules':
    '  return gl_mms_query(15, GL_MMS_Q_RULES, unIP, usPort & 0xffffu, pRequestServersResponse);',
  'SteamMatchmakingServers.ServerFriends':
    '  return gl_mms_query(16, GL_MMS_Q_FRIENDS, unIP, usPort & 0xffffu, pRequestServersResponse);'
}

/** Local variable names the generated wire stubs declare (58-14). */
const STUB_RESERVED_LOCALS: ReadonlySet<string> = new Set([
  'self',
  'ret',
  'result',
  'ok',
  'retbuf',
  'retlen',
  'argbuf',
  'argOff',
  'respOff',
  'rawLen',
  'strLen'
])

const HELPER_CUSTOM_NAME = /^gl_[a-z0-9_]{1,48}$/

function valueTypeWidth(valueType: string): number {
  if (valueType === 'uint64') return 8
  // 58-12: a uint16_t out-pointer (e.g. GetLobbyGameServer's port) is 2 bytes
  // on the wire so the decode never writes 4 bytes into a 2-byte game field.
  if (valueType === 'uint16') return 2
  return 4
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
    case 'uint16':
      return 'uint16_t'
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
const WIRE_LAYOUT_DOC_BASE = `Wire marshaling layout (51-06 Task 3; 51-10 mirrors this exactly):

Request blob (per method, params in manifest declaration order):
  - no kind, or kind 'value': paramWidth(type) raw bytes, host byte order.
  - kind 'in-string': [u32 len][len bytes, NOT NUL-terminated]. A NULL
    pointer packs len = 0xFFFFFFFF and no bytes. len is the real string's
    byte length. A string longer than WIRE_IN_STRING_MAX_BYTES is never
    truncated: it packs len = WIRE_IN_STRING_MAX_BYTES + 1 and no bytes,
    which the helper refuses (status != 0), so the call fails (55 WR-04).
  - kind 'out-value': nothing -- an out-value param is NEVER sent.
  - kind 'out-buffer': [u32 capacity] -- the sibling param named by
    sizeParam, read at call time and capped at WIRE_OUT_BUFFER_MAX_BYTES
    (a negative sizeParam sends capacity 0).
  - kind 'null-in' (53-14): nothing -- a const SteamNetworkingIdentity*
    param is NEVER sent; the helper passes NULL for it.

Response blob (per method):
  - the return value: 0 bytes (returnKind 'void'), 4 bytes (int32/pointer/
    float), 8 bytes (int64/double), [u32 len][bytes] (returnKind 'string',
    decoded by the dedicated string-return branch: accepted only when
    retlen >= 4, len <= retlen - 4 and len < STRING_RETURN_BUF_BYTES,
    otherwise the empty string), or structSize bytes
    (returnKind 'class', the sret branch).
  - then, for every 'out-value' param in declaration order: valueType's
    width (int32/uint32/float/bool = 4 bytes, uint64 = 8 bytes).
  - then, for every 'out-buffer' param in declaration order: [u32 len][len
    bytes] -- len is what the helper actually has (when the param names a
    lenParam, min(that out-value, capacity)); the shim copies
    min(len, capacity) and NUL-terminates only when the param's own type
    is a NUL-terminated string type (e.g. 'char*').
`

/**
 * 58-06: the request/response kinds added for the matchmaking and networking
 * families. Kept apart from the base text so a generated file only carries the
 * paragraphs when some manifest actually uses one of the new kinds or modes
 * (the committed shim and dispatch header stay byte-identical until then).
 */
const WIRE_LAYOUT_DOC_EXTENDED = `
Extended kinds and modes (58-06):

Request blob:
  - kind 'in-buffer': [u32 len][len bytes]. len is the sibling lenParam's
    value. A buffer longer than WIRE_IN_BUFFER_MAX_BYTES (= WIRE_LARGE_MAX_BYTES,
    61440) is never truncated: it packs [u32 WIRE_IN_BUFFER_MAX_BYTES + 1] and
    no bytes, which the helper refuses with STATUS_ERR before touching any
    byte, so the game call returns its failure value. The helper also checks
    len <= remaining request bytes before copying, and that len equals the
    lenParam value.
  - kind 'in-struct': [u8 present][structSize bytes if present]. present 0
    means the game passed NULL and the helper passes NULL. Allowed only for a
    struct whose x64 and mac layouts are byte-identical; any other struct fails
    generation with 'needs repack'.
  - kind 'out-struct': nothing is sent.
  - kind 'out-buffer' with capBytes: the same [u32 capacity], capped at the
    param's capBytes (up to WIRE_LARGE_MAX_BYTES) instead of
    WIRE_OUT_BUFFER_MAX_BYTES.

Response blob:
  - an 'out-value' with valueType 'uint16' (58-12) is 2 bytes on the wire and
    is written as a uint16_t into the game pointer.
  - then, for every 'out-struct' param in declaration order, after the
    out-buffers: [u8 present][structSize bytes]. The shim copies the bytes into
    the game pointer only when that pointer is non-NULL and present is 1.

Messages (58-15):
  - kind 'out-messages': nothing is sent (the sibling countParam is an
    ordinary by-value param). The method's int32 return is the message count
    n; the records follow it, n of them:
      {u32 cbSize, u32 conn, u8 identity[136], i64 connUserData,
       i64 usecTimeReceived, i64 messageNumber, i32 channel, i32 flags,
       u16 lane, u16 pad, cbSize payload bytes}
    (a 180-byte header, then the payload). The records total at most
    WIRE_OUT_MESSAGES_MAX_BYTES. The shim decodes with gl_net_decode_messages:
    every length is checked against the remaining frame bytes before
    allocation; a malformed record ends decoding (earlier, complete records
    stay valid); n greater than the game's count is rejected and nothing is
    allocated. Each message is allocated on the Windows side with gl_msg_alloc,
    so the game owns it and releases it through its own m_pfnRelease.

Method modes:
  - shimLocal: the shim answers the method from its own SHIM_LOCAL_BODIES
    entry. It never produces a frame, so no Windows function pointer can reach
    the helper, and it has no helper dispatch case.
  - helperCustom: the request uses the generic encoding above, but the
    helper's named function (int fn(void *self, const uint8_t *args,
    uint32_t argLen, uint8_t *resp, uint32_t respCap, uint32_t *respLen);
    returns 0 for ok) produces the whole response blob, which must follow the
    method's declared response layout.
`

/** The full wire layout text, including the 58-06 extended kinds. */
export const WIRE_LAYOUT_DOC = WIRE_LAYOUT_DOC_BASE + WIRE_LAYOUT_DOC_EXTENDED

const NEW_WIRE_KINDS: ReadonlySet<string> = new Set([
  'in-buffer',
  'in-struct',
  'out-struct',
  'out-messages'
])

/** True when a method uses any 58-06 kind, cap override or mode. */
function usesExtendedWire(method: MethodSignature): boolean {
  return (
    method.shimLocal === true ||
    method.helperCustom !== undefined ||
    method.params.some(
      (p) => NEW_WIRE_KINDS.has(p.kind ?? 'value') || p.capBytes !== undefined
    )
  )
}

/** The layout text embedded in the generated files: the extended paragraphs
 * appear only when some manifest uses them. */
function wireLayoutDocFor(manifests: InterfaceManifest[]): string {
  return manifests.some((m) => m.methods.some(usesExtendedWire))
    ? WIRE_LAYOUT_DOC
    : WIRE_LAYOUT_DOC_BASE
}

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
// out-length). The five SteamAPI_ManualDispatch_* names are not in this table:
// 58-11 gives them real bodies (MANUAL_DISPATCH_EXPORT_BODIES below).
export const LIFECYCLE_NOOP_SPECS: Readonly<Record<string, string>> = {
  SteamAPI_GetSteamInstallPath: 'S',
  SteamAPI_ReleaseCurrentThreadMemory: 'V',
  SteamAPI_SetBreakpadAppID: 'V',
  SteamAPI_SetMiniDumpComment: 'V',
  SteamAPI_SetTryCatchCallbacks: 'V',
  SteamAPI_UseBreakpadCrashHandler: 'V',
  SteamAPI_WriteMiniDump: 'V',
  SteamGameServerClient: 'P',
  SteamGameServer_ReleaseCurrentThreadMemory: 'V'
}

/**
 * 58-11: the manual-dispatch exports (Steamworks.NET / Facepunch pump these
 * instead of C++ callback objects). x64-only like the rest of this list. The
 * bodies call the generated registry's gl_md_* functions; the export names
 * are unchanged from the earlier no-ops, so the export set does not move.
 * `bool` returns are an int and `bool *` out-params a single byte (the SDK's
 * bool is one byte).
 */
export const MANUAL_DISPATCH_EXPORT_BODIES: Readonly<Record<string, string>> = {
  SteamAPI_ManualDispatch_FreeLastCallback:
    'void SteamAPI_ManualDispatch_FreeLastCallback(int hSteamPipe) {\n' +
    '  (void)hSteamPipe;\n' +
    '  gl_md_free_last();\n' +
    '}',
  SteamAPI_ManualDispatch_GetAPICallResult:
    'int SteamAPI_ManualDispatch_GetAPICallResult(int hSteamPipe, uint64_t hSteamAPICall, void *pCallback, int cubCallback, int iCallbackExpected, uint8_t *pbFailed) {\n' +
    '  (void)hSteamPipe;\n' +
    '  return gl_md_get_api_call_result(hSteamAPICall, pCallback, cubCallback, iCallbackExpected, pbFailed);\n' +
    '}',
  SteamAPI_ManualDispatch_GetNextCallback:
    'int SteamAPI_ManualDispatch_GetNextCallback(int hSteamPipe, void *pCallbackMsg) {\n' +
    '  (void)hSteamPipe;\n' +
    '  return gl_md_get_next(pCallbackMsg);\n' +
    '}',
  SteamAPI_ManualDispatch_Init:
    'void SteamAPI_ManualDispatch_Init(void) {\n' + '  gl_md_init();\n' + '}',
  SteamAPI_ManualDispatch_RunFrame:
    'void SteamAPI_ManualDispatch_RunFrame(int hSteamPipe) {\n' +
    '  (void)hSteamPipe;\n' +
    '  gl_md_run_frame();\n' +
    '}'
}

/**
 * 58-14: the shim-local networking C block (identity and address helpers,
 * message pool, config store). x64 only; emitted into the shim just before
 * the callback registry so the registry's delivery paths can call
 * gl_net_cb_intercept. Compiled on the host by networkingLocalHost.test.ts.
 */
export const NETWORKING_LOCAL_C = String.raw`/* ---- networking value types, message pool and config store (58-14, x64 only) ----
 * GameLib-authored C implementing the semantics of the Steamworks inline
 * networking structs on the Windows side, so the game never needs a Mac
 * pointer or a round trip for them (D-09: written from behaviour, no vendored
 * header text). Struct layouts are the measured ones (meta/msvcCallbackLayout.ts):
 * SteamNetworkingIPAddr 18 bytes, SteamNetworkingIdentity 136 bytes,
 * SteamNetworkingMessage_t 216 bytes with m_pfnFreeData at 176 and m_pfnRelease
 * at 184.
 *
 * Message ownership (Proton networking_message_pool precedent): a message is
 * allocated here, in Windows-process memory, with its own m_pfnRelease; no Mac
 * pointer is ever stored in one. Release frees the block exactly once.
 *
 * Config store: a Ptr-typed value or any Callback_* config id (201..207) is
 * kept here (bounded 256 entries) and NEVER sent to the helper, so a Windows
 * function pointer can not reach the Mac process (T-58-44). A stored callback
 * is invoked by the registry delivery path on the game's own thread, with no
 * lock held. Int32/Int64/Float/String values are forwarded to the helper. */
#if !defined(__i386__)
#define GL_NET_FN static __attribute__((unused))
#ifndef GL_NET_ALLOC
#define GL_NET_ALLOC(n) calloc(1, (n))
#define GL_NET_FREE(p) free(p)
#endif

#define GL_NET_UTILS_ORDINAL 71
#define GL_NET_SLOT_GETLOCALPING 2
#define GL_NET_SLOT_CONVERTPING 5
#define GL_NET_SLOT_CHECKPING 7
#define GL_NET_SLOT_GETPOPLIST 11
#define GL_NET_SLOT_SETCONFIG 16
#define GL_NET_SLOT_GETCONFIG 17
#define GL_NET_SLOT_GETCONFIGINFO 18
#define GL_NET_CFG_INT32 1
#define GL_NET_CFG_INT64 2
#define GL_NET_CFG_FLOAT 3
#define GL_NET_CFG_STRING 4
#define GL_NET_CFG_PTR 5
#define GL_NET_CFG_STRING_MAX 4096
#define GL_NET_CFG_GET_MAX 4096
#define GL_NET_CFG_STORE_MAX 256
#define GL_NET_CFG_CB_FIRST 201
#define GL_NET_CFG_CB_LAST 207
#define GL_NET_SCOPE_GLOBAL 1
#define GL_NET_SCOPE_LISTEN 3
#define GL_NET_SCOPE_CONNECTION 4
#define GL_NET_MSG_BYTES 216
#define GL_NET_MSG_OFF_FREEDATA 176
#define GL_NET_MSG_OFF_RELEASE 184
#define GL_NET_MSG_MAX_DATA (1u << 20)
#define GL_NET_PING_LOC_BYTES 512
#define GL_NET_POP_MAX 256
#define GL_NET_NAME_MAX 128

typedef struct {
  uint8_t b[16];
  uint16_t port;
} gl_net_ip;

typedef struct {
  int32_t type;
  int32_t cb;
  union {
    uint64_t u64;
    uint8_t raw[128];
    gl_net_ip ip;
  } d;
} gl_net_ident;

_Static_assert(sizeof(gl_net_ip) == 18, "SteamNetworkingIPAddr is 18 bytes");
_Static_assert(sizeof(gl_net_ident) == 136, "SteamNetworkingIdentity is 136 bytes");

/* ---- bounded string writer ---- */
typedef struct {
  char *buf;
  size_t cap;
  size_t len;
} gl_net_w;

GL_NET_FN void gl_net_w_init(gl_net_w *w, char *buf, size_t cap) {
  w->buf = buf;
  w->cap = buf != NULL ? cap : 0;
  w->len = 0;
}
GL_NET_FN void gl_net_w_ch(gl_net_w *w, char c) {
  if (w->len + 1 < w->cap) w->buf[w->len] = c;
  w->len++;
}
GL_NET_FN void gl_net_w_str(gl_net_w *w, const char *s) {
  while (*s) gl_net_w_ch(w, *s++);
}
GL_NET_FN void gl_net_w_u64(gl_net_w *w, uint64_t v) {
  char t[24];
  int n = 0;
  if (v == 0) t[n++] = '0';
  while (v) {
    t[n++] = (char)('0' + (int)(v % 10u));
    v /= 10u;
  }
  while (n) gl_net_w_ch(w, t[--n]);
}
GL_NET_FN void gl_net_w_hex(gl_net_w *w, uint64_t v, int pad2) {
  static const char dig[] = "0123456789abcdef";
  char t[20];
  int n = 0;
  if (v == 0) t[n++] = '0';
  while (v) {
    t[n++] = dig[v & 15u];
    v >>= 4;
  }
  if (pad2 && n < 2) t[n++] = '0';
  while (n) gl_net_w_ch(w, t[--n]);
}
GL_NET_FN void gl_net_w_fin(gl_net_w *w) {
  if (w->cap > 0) w->buf[w->len < w->cap ? w->len : w->cap - 1] = 0;
}

/* ---- IPv4 / IPv6 address ---- */
GL_NET_FN int gl_ip_is_v4(const gl_net_ip *a) {
  size_t i;
  for (i = 0; i < 10; i++)
    if (a->b[i]) return 0;
  return a->b[10] == 0xff && a->b[11] == 0xff;
}
GL_NET_FN uint32_t gl_ip_get_v4(const gl_net_ip *a) {
  if (!gl_ip_is_v4(a)) return 0;
  return ((uint32_t)a->b[12] << 24) | ((uint32_t)a->b[13] << 16) |
         ((uint32_t)a->b[14] << 8) | (uint32_t)a->b[15];
}
GL_NET_FN void gl_ip_set_v4(gl_net_ip *a, uint32_t ip, uint16_t port) {
  memset(a->b, 0, 10);
  a->b[10] = 0xff;
  a->b[11] = 0xff;
  a->b[12] = (uint8_t)(ip >> 24);
  a->b[13] = (uint8_t)(ip >> 16);
  a->b[14] = (uint8_t)(ip >> 8);
  a->b[15] = (uint8_t)ip;
  a->port = port;
}
GL_NET_FN void gl_ip_set_v6(gl_net_ip *a, const uint8_t *ipv6, uint16_t port) {
  if (ipv6 != NULL) memcpy(a->b, ipv6, 16);
  a->port = port;
}
GL_NET_FN void gl_ip_set_v6_localhost(gl_net_ip *a, uint16_t port) {
  memset(a->b, 0, 16);
  a->b[15] = 1;
  a->port = port;
}
GL_NET_FN int gl_ip_is_v6_allzeros(const gl_net_ip *a) {
  size_t i;
  for (i = 0; i < 16; i++)
    if (a->b[i]) return 0;
  return 1;
}
GL_NET_FN int gl_ip_is_localhost(const gl_net_ip *a) {
  size_t i;
  int v6 = a->b[15] == 1;
  for (i = 0; i < 15; i++)
    if (a->b[i]) v6 = 0;
  return v6 || gl_ip_get_v4(a) == 0x7f000001u;
}
GL_NET_FN int gl_ip_equal(const gl_net_ip *a, const gl_net_ip *b) {
  return memcmp(a->b, b->b, 16) == 0 && a->port == b->port;
}
/* 0 invalid, 1 not fake, 2 global fake, 3 local fake. Only the link-local
 * 169.254.0.0/16 block is treated as a Steam fake-IP range. */
GL_NET_FN int32_t gl_ip_fake_type(const gl_net_ip *a) {
  if (gl_ip_is_v4(a) && a->b[12] == 169 && a->b[13] == 254) return 2;
  return 1;
}

GL_NET_FN void gl_ip_write(const gl_net_ip *a, int withPort, gl_net_w *w) {
  if (gl_ip_is_v4(a)) {
    int i;
    for (i = 12; i < 16; i++) {
      gl_net_w_u64(w, a->b[i]);
      if (i < 15) gl_net_w_ch(w, '.');
    }
    if (withPort) {
      gl_net_w_ch(w, ':');
      gl_net_w_u64(w, a->port);
    }
    return;
  }
  {
    uint16_t g[8];
    int i, bestAt = -1, bestLen = 0, runAt = -1, runLen = 0;
    for (i = 0; i < 8; i++)
      g[i] = (uint16_t)(((uint16_t)a->b[2 * i] << 8) | a->b[2 * i + 1]);
    for (i = 0; i < 8; i++) {
      if (g[i] == 0) {
        if (runAt < 0) {
          runAt = i;
          runLen = 0;
        }
        runLen++;
        if (runLen > bestLen) {
          bestLen = runLen;
          bestAt = runAt;
        }
      } else {
        runAt = -1;
      }
    }
    if (bestLen < 2) {
      bestAt = -1;
      bestLen = 0;
    }
    if (withPort) gl_net_w_ch(w, '[');
    for (i = 0; i < 8; i++) {
      if (i == bestAt) {
        gl_net_w_str(w, "::");
        i += bestLen - 1;
        continue;
      }
      if (i > 0 && i != bestAt + bestLen) gl_net_w_ch(w, ':');
      gl_net_w_hex(w, g[i], 0);
    }
    if (withPort) {
      gl_net_w_str(w, "]:");
      gl_net_w_u64(w, a->port);
    }
  }
}
GL_NET_FN void gl_ip_to_string(const gl_net_ip *a, char *buf, size_t cap, int withPort) {
  gl_net_w w;
  gl_net_w_init(&w, buf, cap);
  gl_ip_write(a, withPort, &w);
  gl_net_w_fin(&w);
}

GL_NET_FN int gl_net_hexval(char c) {
  if (c >= '0' && c <= '9') return c - '0';
  if (c >= 'a' && c <= 'f') return c - 'a' + 10;
  if (c >= 'A' && c <= 'F') return c - 'A' + 10;
  return -1;
}
GL_NET_FN int gl_ip_parse_v4(const char *s, size_t n, uint8_t out[4]) {
  size_t i = 0;
  int part = 0;
  while (part < 4) {
    uint32_t v = 0;
    int digits = 0;
    while (i < n && s[i] >= '0' && s[i] <= '9' && digits < 4) {
      v = v * 10u + (uint32_t)(s[i] - '0');
      i++;
      digits++;
    }
    if (digits == 0 || digits > 3 || v > 255u) return 0;
    out[part++] = (uint8_t)v;
    if (part < 4) {
      if (i >= n || s[i] != '.') return 0;
      i++;
    }
  }
  return i == n;
}
GL_NET_FN int gl_ip_parse_port(const char *s, size_t n, uint16_t *out) {
  uint32_t v = 0;
  size_t i;
  if (n == 0 || n > 5) return 0;
  for (i = 0; i < n; i++) {
    if (s[i] < '0' || s[i] > '9') return 0;
    v = v * 10u + (uint32_t)(s[i] - '0');
  }
  if (v > 65535u) return 0;
  *out = (uint16_t)v;
  return 1;
}
GL_NET_FN int gl_ip_parse_v6(const char *s, size_t n, uint8_t out[16]) {
  uint16_t g[8];
  int ng = 0, gap = -1, k, tail;
  size_t i = 0;
  memset(g, 0, sizeof g);
  if (n >= 2 && s[0] == ':' && s[1] == ':') {
    gap = 0;
    i = 2;
    if (i == n) {
      memset(out, 0, 16);
      return 1;
    }
  } else if (n > 0 && s[0] == ':') {
    return 0;
  }
  while (i < n) {
    uint32_t v = 0;
    int d = 0, h;
    while (i < n && (h = gl_net_hexval(s[i])) >= 0 && d < 5) {
      v = v * 16u + (uint32_t)h;
      i++;
      d++;
    }
    if (d == 0 || d > 4 || ng >= 8) return 0;
    g[ng++] = (uint16_t)v;
    if (i == n) break;
    if (s[i] != ':') return 0;
    i++;
    if (i < n && s[i] == ':') {
      if (gap >= 0) return 0;
      gap = ng;
      i++;
      if (i == n) break;
    } else if (i == n) {
      return 0;
    }
  }
  if (gap < 0) {
    if (ng != 8) return 0;
    for (k = 0; k < 8; k++) {
      out[2 * k] = (uint8_t)(g[k] >> 8);
      out[2 * k + 1] = (uint8_t)g[k];
    }
    return 1;
  }
  if (ng > 7) return 0;
  {
    uint16_t full[8];
    memset(full, 0, sizeof full);
    for (k = 0; k < gap; k++) full[k] = g[k];
    tail = ng - gap;
    for (k = 0; k < tail; k++) full[8 - tail + k] = g[gap + k];
    for (k = 0; k < 8; k++) {
      out[2 * k] = (uint8_t)(full[k] >> 8);
      out[2 * k + 1] = (uint8_t)full[k];
    }
  }
  return 1;
}
/* "a.b.c.d", "a.b.c.d:port", "[v6]:port" or a bare IPv6. A missing port is 0.
 * The address is cleared first; false leaves it cleared. */
GL_NET_FN int gl_ip_parse(gl_net_ip *a, const char *s) {
  size_t n, colons = 0, i;
  uint8_t v4[4];
  uint16_t port = 0;
  memset(a, 0, sizeof *a);
  if (s == NULL) return 0;
  n = strlen(s);
  if (n == 0 || n > 64) return 0;
  for (i = 0; i < n; i++)
    if (s[i] == ':') colons++;
  if (s[0] == '[') {
    size_t close = 1;
    uint8_t v6[16];
    while (close < n && s[close] != ']') close++;
    if (close >= n) return 0;
    if (!gl_ip_parse_v6(s + 1, close - 1, v6)) return 0;
    if (close + 1 < n) {
      if (s[close + 1] != ':' || !gl_ip_parse_port(s + close + 2, n - close - 2, &port)) return 0;
    }
    gl_ip_set_v6(a, v6, port);
    return 1;
  }
  if (colons == 0 || (colons == 1 && strchr(s, '.') != NULL)) {
    size_t addrLen = n;
    if (colons == 1) {
      const char *c = strchr(s, ':');
      addrLen = (size_t)(c - s);
      if (!gl_ip_parse_port(c + 1, n - addrLen - 1, &port)) return 0;
    }
    if (!gl_ip_parse_v4(s, addrLen, v4)) return 0;
    gl_ip_set_v4(a, ((uint32_t)v4[0] << 24) | ((uint32_t)v4[1] << 16) | ((uint32_t)v4[2] << 8) | v4[3], port);
    return 1;
  }
  {
    uint8_t v6[16];
    if (!gl_ip_parse_v6(s, n, v6)) return 0;
    gl_ip_set_v6(a, v6, 0);
    return 1;
  }
}

/* ---- identity ---- */
GL_NET_FN void gl_id_clear(gl_net_ident *id) { memset(id, 0, sizeof *id); }
GL_NET_FN void gl_id_set_u64(gl_net_ident *id, int32_t type, uint64_t v) {
  gl_id_clear(id);
  id->type = type;
  id->cb = 8;
  id->d.u64 = v;
}
GL_NET_FN uint64_t gl_id_get_u64(const gl_net_ident *id, int32_t type) {
  return id->type == type ? id->d.u64 : 0;
}
GL_NET_FN int gl_id_set_string(gl_net_ident *id, int32_t type, const char *s, size_t maxLen, size_t minLen) {
  size_t l;
  if (s == NULL) return 0;
  l = strlen(s);
  if (l < minLen || l >= maxLen) return 0;
  gl_id_clear(id);
  id->type = type;
  id->cb = (int32_t)(l + 1);
  memcpy(id->d.raw, s, l + 1);
  return 1;
}
GL_NET_FN int gl_id_set_bytes(gl_net_ident *id, const void *data, uint32_t cbLen) {
  if (cbLen > 32 || (data == NULL && cbLen > 0)) return 0;
  gl_id_clear(id);
  id->type = 3;
  id->cb = (int32_t)cbLen;
  if (cbLen > 0) memcpy(id->d.raw, data, cbLen);
  return 1;
}
GL_NET_FN void gl_id_set_ip(gl_net_ident *id, const gl_net_ip *addr) {
  gl_net_ip copy;
  if (addr == NULL) {
    gl_id_clear(id);
    return;
  }
  copy = *addr;
  gl_id_clear(id);
  id->type = 1;
  id->cb = (int32_t)sizeof(gl_net_ip);
  id->d.ip = copy;
}
GL_NET_FN void gl_id_set_ipv4(gl_net_ident *id, uint32_t ip, uint16_t port) {
  gl_id_clear(id);
  id->type = 1;
  id->cb = (int32_t)sizeof(gl_net_ip);
  gl_ip_set_v4(&id->d.ip, ip, port);
}
GL_NET_FN void gl_id_set_localhost(gl_net_ident *id) {
  gl_id_clear(id);
  id->type = 1;
  id->cb = (int32_t)sizeof(gl_net_ip);
  gl_ip_set_v6_localhost(&id->d.ip, 0);
}
GL_NET_FN int gl_id_equal(const gl_net_ident *a, const gl_net_ident *b) {
  if (a->type != b->type || a->cb != b->cb) return 0;
  if (a->cb < 0 || a->cb > 128) return 0;
  return memcmp(&a->d, &b->d, (size_t)a->cb) == 0;
}
GL_NET_FN int32_t gl_id_fake_type(const gl_net_ident *id) {
  return id->type == 1 ? gl_ip_fake_type(&id->d.ip) : 0;
}

GL_NET_FN void gl_id_to_string(const gl_net_ident *id, char *buf, size_t cap) {
  gl_net_w w;
  int i;
  gl_net_w_init(&w, buf, cap);
  switch (id->type) {
    case 16:
      gl_net_w_str(&w, "steamid:");
      gl_net_w_u64(&w, id->d.u64);
      break;
    case 1:
      gl_net_w_str(&w, "ip:");
      gl_ip_write(&id->d.ip, 1, &w);
      break;
    case 2:
      gl_net_w_str(&w, "str:");
      for (i = 0; i < 32 && id->d.raw[i]; i++) gl_net_w_ch(&w, (char)id->d.raw[i]);
      break;
    case 3:
      gl_net_w_str(&w, "gen:");
      for (i = 0; i < id->cb && i < 32; i++) gl_net_w_hex(&w, id->d.raw[i], 1);
      break;
    case 17:
      gl_net_w_str(&w, "xboxpairwiseid:");
      for (i = 0; i < 33 && id->d.raw[i]; i++) gl_net_w_ch(&w, (char)id->d.raw[i]);
      break;
    case 18:
      gl_net_w_str(&w, "psn:");
      gl_net_w_hex(&w, id->d.u64, 0);
      break;
    case 19:
      gl_net_w_str(&w, "stadia:");
      gl_net_w_hex(&w, id->d.u64, 0);
      break;
    case 4:
      for (i = 0; i < 127 && id->d.raw[i]; i++) gl_net_w_ch(&w, (char)id->d.raw[i]);
      break;
    default:
      gl_net_w_str(&w, "invalid");
      break;
  }
  gl_net_w_fin(&w);
}

GL_NET_FN size_t gl_net_prefix(const char *s, const char *prefix) {
  size_t n = strlen(prefix);
  return strncmp(s, prefix, n) == 0 ? n : 0;
}
GL_NET_FN int gl_net_parse_dec(const char *s, uint64_t *out) {
  uint64_t v = 0;
  size_t i;
  if (s[0] == 0) return 0;
  for (i = 0; s[i]; i++) {
    uint64_t d;
    if (s[i] < '0' || s[i] > '9') return 0;
    d = (uint64_t)(s[i] - '0');
    if (v > (UINT64_MAX - d) / 10u) return 0;
    v = v * 10u + d;
  }
  *out = v;
  return 1;
}
GL_NET_FN int gl_net_parse_hex64(const char *s, uint64_t *out) {
  uint64_t v = 0;
  size_t i;
  if (s[0] == 0 || strlen(s) > 16) return 0;
  for (i = 0; s[i]; i++) {
    int h = gl_net_hexval(s[i]);
    if (h < 0) return 0;
    v = (v << 4) | (uint64_t)h;
  }
  *out = v;
  return 1;
}
/* Parses the ToString format. An unrecognised but well-formed "type:data"
 * becomes UnknownType (true); malformed text clears the identity (false). */
GL_NET_FN int gl_id_parse(gl_net_ident *id, const char *s) {
  size_t n, p, i;
  uint64_t v;
  gl_id_clear(id);
  if (s == NULL) return 0;
  n = strlen(s);
  if (n == 0 || n > 127) return 0;
  if ((p = gl_net_prefix(s, "steamid:")) != 0) {
    if (!gl_net_parse_dec(s + p, &v)) return 0;
    gl_id_set_u64(id, 16, v);
    return 1;
  }
  if ((p = gl_net_prefix(s, "ip:")) != 0) {
    gl_net_ip a;
    if (!gl_ip_parse(&a, s + p)) return 0;
    gl_id_set_ip(id, &a);
    return 1;
  }
  if ((p = gl_net_prefix(s, "str:")) != 0) return gl_id_set_string(id, 2, s + p, 32, 0);
  if ((p = gl_net_prefix(s, "xboxpairwiseid:")) != 0) return gl_id_set_string(id, 17, s + p, 33, 1);
  if ((p = gl_net_prefix(s, "gen:")) != 0) {
    uint8_t b[32];
    size_t hl = n - p, k;
    if (hl % 2 != 0 || hl / 2 > 32) return 0;
    for (k = 0; k < hl / 2; k++) {
      int hi = gl_net_hexval(s[p + 2 * k]);
      int lo = gl_net_hexval(s[p + 2 * k + 1]);
      if (hi < 0 || lo < 0) return 0;
      b[k] = (uint8_t)((hi << 4) | lo);
    }
    return gl_id_set_bytes(id, b, (uint32_t)(hl / 2));
  }
  if ((p = gl_net_prefix(s, "psn:")) != 0) {
    if (!gl_net_parse_hex64(s + p, &v)) return 0;
    gl_id_set_u64(id, 18, v);
    return 1;
  }
  if ((p = gl_net_prefix(s, "stadia:")) != 0) {
    if (!gl_net_parse_hex64(s + p, &v)) return 0;
    gl_id_set_u64(id, 19, v);
    return 1;
  }
  for (i = 0; i < n && s[i] != ':'; i++) {
    char c = s[i];
    if (!((c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '_')) return 0;
  }
  if (i == 0 || i >= n || i > 31) return 0;
  for (i = 0; i < n; i++)
    if ((unsigned char)s[i] < 0x20 || (unsigned char)s[i] > 0x7e) return 0;
  id->type = 4;
  id->cb = (int32_t)(n + 1);
  memcpy(id->d.raw, s, n + 1);
  return 1;
}

/* ---- message pool (AllocateMessage / Release) ---- */
GL_NET_FN void gl_msg_release(void *msg) {
  uint8_t *m = (uint8_t *)msg;
  void (*freeData)(void *);
  if (m == NULL) return;
  memcpy(&freeData, m + GL_NET_MSG_OFF_FREEDATA, sizeof freeData);
  if (freeData != NULL) freeData(m);
  GL_NET_FREE(m);
}
/* One block: the 216-byte message followed by cb data bytes. m_pData points
 * into the block and m_pfnFreeData stays NULL, so Release frees it all at
 * once. AllocateMessage(0) leaves m_pData NULL. NULL for a negative or
 * oversize request. */
GL_NET_FN void *gl_msg_alloc(int32_t cb) {
  uint8_t *m;
  void (*rel)(void *) = gl_msg_release;
  if (cb < 0 || (uint32_t)cb > GL_NET_MSG_MAX_DATA) return NULL;
  m = (uint8_t *)GL_NET_ALLOC((size_t)GL_NET_MSG_BYTES + (size_t)cb);
  if (m == NULL) return NULL;
  if (cb > 0) {
    void *data = m + GL_NET_MSG_BYTES;
    memcpy(m, &data, sizeof data);
  }
  memcpy(m + 8, &cb, 4);
  memcpy(m + GL_NET_MSG_OFF_RELEASE, &rel, sizeof rel);
  return m;
}
/* SteamAPI_SteamNetworkingMessage_t_Release: calls the message's own
 * m_pfnRelease, exactly as the SDK inline does. */
GL_NET_FN void gl_msg_release_via_fn(void *msg) {
  void (*rel)(void *);
  if (msg == NULL) return;
  memcpy(&rel, (uint8_t *)msg + GL_NET_MSG_OFF_RELEASE, sizeof rel);
  if (rel != NULL) rel(msg);
}

/* ---- transport ---- */
GL_NET_FN int gl_bridge_call_raw(uint16_t ordinal, uint16_t slot, const uint8_t *req,
                                 uint32_t reqLen, uint8_t *resp, uint32_t respCap,
                                 uint32_t *respLen) {
  uint32_t n = 0;
  int ok = bridge_transact(ordinal, slot, req, reqLen, resp, respCap, &n);
  if (respLen != NULL) *respLen = ok ? n : 0;
  return ok;
}

/* ---- config store ---- */
typedef struct {
  int32_t e;
  int32_t scope;
  int64_t obj;
  void *fn;
} gl_net_cfg_ent;

static gl_net_cfg_ent gl_net_cfg[GL_NET_CFG_STORE_MAX];
static uint32_t gl_net_cfg_n;
static volatile int32_t gl_net_cb_count; /* stored callback pointers; read lock-free */
static void *gl_net_dbg_fn;
static int32_t gl_net_dbg_level;
static char gl_net_name_buf[GL_NET_NAME_MAX];

GL_NET_FN int gl_net_is_cb_id(int32_t e) {
  return e >= GL_NET_CFG_CB_FIRST && e <= GL_NET_CFG_CB_LAST;
}
/* Caller holds the lock. */
GL_NET_FN int gl_net_cfg_find(int32_t e, int32_t scope, int64_t obj) {
  uint32_t i;
  for (i = 0; i < gl_net_cfg_n; i++)
    if (gl_net_cfg[i].e == e && gl_net_cfg[i].scope == scope && gl_net_cfg[i].obj == obj)
      return (int)i;
  return -1;
}
GL_NET_FN int gl_net_cfg_put(int32_t e, int32_t scope, int64_t obj, void *fn) {
  int idx;
  int ok = 1;
  GL_CB_LOCK();
  idx = gl_net_cfg_find(e, scope, obj);
  if (fn == NULL) {
    if (idx >= 0) {
      if (gl_net_is_cb_id(e)) gl_net_cb_count--;
      gl_net_cfg_n--;
      gl_net_cfg[idx] = gl_net_cfg[gl_net_cfg_n];
      memset(&gl_net_cfg[gl_net_cfg_n], 0, sizeof gl_net_cfg[0]);
    }
  } else if (idx >= 0) {
    gl_net_cfg[idx].fn = fn;
  } else if (gl_net_cfg_n >= GL_NET_CFG_STORE_MAX) {
    ok = 0;
  } else {
    gl_net_cfg[gl_net_cfg_n].e = e;
    gl_net_cfg[gl_net_cfg_n].scope = scope;
    gl_net_cfg[gl_net_cfg_n].obj = obj;
    gl_net_cfg[gl_net_cfg_n].fn = fn;
    gl_net_cfg_n++;
    if (gl_net_is_cb_id(e)) gl_net_cb_count++;
  }
  GL_CB_UNLOCK();
  return ok;
}
GL_NET_FN void *gl_net_cfg_get(int32_t e, int32_t scope, int64_t obj) {
  void *fn = NULL;
  int idx;
  GL_CB_LOCK();
  idx = gl_net_cfg_find(e, scope, obj);
  if (idx >= 0) fn = gl_net_cfg[idx].fn;
  GL_CB_UNLOCK();
  return fn;
}
/* Lock-free by design: the registry reads it while holding its own lock. */
GL_NET_FN int gl_net_cb_any(void) { return gl_net_cb_count > 0; }

GL_NET_FN void gl_net_set_debug_output(int32_t level, void *fn) {
  GL_CB_LOCK();
  gl_net_dbg_level = level;
  gl_net_dbg_fn = fn;
  GL_CB_UNLOCK();
}

/* ISteamNetworkingUtils::SetConfigValue. Ptr values and Callback_* ids stay
 * here; typed scalars and strings go to the helper as
 * [i32 eValue][i32 scope][i64 obj][i32 type][u32 len][len bytes]. A missing
 * value (pArg NULL) is sent with len 0 (reset to inherited). */
GL_NET_FN int gl_net_set_config_value(int32_t e, int32_t scope, int64_t obj, int32_t type,
                                      const void *pArg) {
  uint8_t req[24 + GL_NET_CFG_STRING_MAX];
  uint8_t resp[8];
  uint32_t rlen = 0, len = 0;
  int32_t ret = 0;
  if (scope < 1 || scope > 4) return 0;
  if (type == GL_NET_CFG_PTR || gl_net_is_cb_id(e)) {
    void *fn = NULL;
    if (type != GL_NET_CFG_PTR) return 0;
    if (pArg != NULL) memcpy(&fn, pArg, sizeof fn);
    return gl_net_cfg_put(e, scope, obj, fn);
  }
  if (type < GL_NET_CFG_INT32 || type > GL_NET_CFG_STRING) return 0;
  if (pArg != NULL) {
    if (type == GL_NET_CFG_INT32 || type == GL_NET_CFG_FLOAT) {
      len = 4;
    } else if (type == GL_NET_CFG_INT64) {
      len = 8;
    } else {
      size_t sl = strlen((const char *)pArg);
      if (sl + 1 > GL_NET_CFG_STRING_MAX) return 0;
      len = (uint32_t)(sl + 1);
    }
  }
  memcpy(req, &e, 4);
  memcpy(req + 4, &scope, 4);
  memcpy(req + 8, &obj, 8);
  memcpy(req + 16, &type, 4);
  memcpy(req + 20, &len, 4);
  if (len > 0) memcpy(req + 24, pArg, len);
  if (!gl_bridge_call_raw(GL_NET_UTILS_ORDINAL, GL_NET_SLOT_SETCONFIG, req, 24 + len, resp,
                          sizeof resp, &rlen) ||
      rlen < 4)
    return 0;
  memcpy(&ret, resp, 4);
  return ret != 0;
}

/* ISteamNetworkingUtils::GetConfigValue. Result codes: -1 bad value, -2 bad
 * scope object, -3 buffer too small, 1 ok, 2 ok inherited. A Ptr or callback
 * value is answered from the store only; a helper reply of type Ptr is
 * refused so a Mac pointer is never handed to the game. */
GL_NET_FN int32_t gl_net_get_config_value(int32_t e, int32_t scope, int64_t obj,
                                          int32_t *pOutType, void *pResult, size_t *cbResult) {
  if (scope < 1 || scope > 4) return -1;
  if (gl_net_is_cb_id(e)) {
    void *fn = gl_net_cfg_get(e, scope, obj);
    int32_t ret = 1;
    if (fn == NULL && scope != GL_NET_SCOPE_GLOBAL) {
      fn = gl_net_cfg_get(e, GL_NET_SCOPE_GLOBAL, 0);
      ret = 2;
    }
    if (pOutType != NULL) *pOutType = GL_NET_CFG_PTR;
    if (cbResult != NULL) {
      if (pResult != NULL && *cbResult < sizeof(void *)) {
        *cbResult = sizeof(void *);
        return -3;
      }
      *cbResult = sizeof(void *);
    }
    if (pResult != NULL && cbResult != NULL) memcpy(pResult, &fn, sizeof fn);
    return ret;
  }
  {
    uint8_t req[20];
    uint8_t resp[20 + GL_NET_CFG_GET_MAX];
    uint32_t rlen = 0, cap = 0, n = 0;
    int32_t ret = 0, type = 0;
    uint64_t needed = 0;
    if (pResult != NULL && cbResult != NULL) {
      cap = *cbResult > GL_NET_CFG_GET_MAX ? GL_NET_CFG_GET_MAX : (uint32_t)*cbResult;
    }
    memcpy(req, &e, 4);
    memcpy(req + 4, &scope, 4);
    memcpy(req + 8, &obj, 8);
    memcpy(req + 16, &cap, 4);
    if (!gl_bridge_call_raw(GL_NET_UTILS_ORDINAL, GL_NET_SLOT_GETCONFIG, req, sizeof req, resp,
                            sizeof resp, &rlen) ||
        rlen < 20)
      return -1;
    memcpy(&ret, resp, 4);
    memcpy(&type, resp + 4, 4);
    memcpy(&needed, resp + 8, 8);
    memcpy(&n, resp + 16, 4);
    if (type == GL_NET_CFG_PTR || n > cap || rlen != 20u + n) return -1;
    if (pOutType != NULL) *pOutType = type;
    if (cbResult != NULL) *cbResult = (size_t)needed;
    if (n > 0 && pResult != NULL) memcpy(pResult, resp + 20, n);
    return ret;
  }
}

/* GetPOPList: [i32 nListSz] -> [i32 ret][u32 n][n x u32]. Returns the total
 * POP count; fills at most min(nListSz, 256, n) entries. */
GL_NET_FN int32_t gl_net_get_pop_list(uint32_t *list, int32_t nListSz) {
  uint8_t resp[8 + 4 * GL_NET_POP_MAX];
  uint32_t rlen = 0, n = 0, i;
  int32_t ret = 0, want = nListSz;
  if (list == NULL || want < 0) want = 0;
  if (want > GL_NET_POP_MAX) want = GL_NET_POP_MAX;
  if (!gl_bridge_call_raw(GL_NET_UTILS_ORDINAL, GL_NET_SLOT_GETPOPLIST, (const uint8_t *)&want, 4,
                          resp, sizeof resp, &rlen) ||
      rlen < 8)
    return 0;
  memcpy(&ret, resp, 4);
  memcpy(&n, resp + 4, 4);
  if (n > (uint32_t)want || rlen != 8u + 4u * n) return 0;
  for (i = 0; i < n; i++) memcpy(&list[i], resp + 8 + 4 * i, 4);
  return ret;
}

/* GetLocalPingLocation: [] -> [f32 ret][u8 present][512 bytes]. -1 on failure. */
GL_NET_FN float gl_net_get_local_ping_location(void *result) {
  uint8_t resp[5 + GL_NET_PING_LOC_BYTES];
  uint32_t rlen = 0;
  float ret = -1.0f;
  if (!gl_bridge_call_raw(GL_NET_UTILS_ORDINAL, GL_NET_SLOT_GETLOCALPING, NULL, 0, resp,
                          sizeof resp, &rlen) ||
      rlen != sizeof resp)
    return -1.0f;
  memcpy(&ret, resp, 4);
  if (resp[4] == 1 && result != NULL) memcpy(result, resp + 5, GL_NET_PING_LOC_BYTES);
  return ret;
}

/* CheckPingDataUpToDate: [f32] -> [i32 ret]. */
GL_NET_FN int gl_net_check_ping_data(float flMaxAgeSeconds) {
  uint8_t resp[4];
  uint32_t rlen = 0;
  int32_t ret = 0;
  if (!gl_bridge_call_raw(GL_NET_UTILS_ORDINAL, GL_NET_SLOT_CHECKPING, (const uint8_t *)&flMaxAgeSeconds,
                          4, resp, sizeof resp, &rlen) ||
      rlen < 4)
    return 0;
  memcpy(&ret, resp, 4);
  return ret != 0;
}

/* ConvertPingLocationToString: [512 bytes][i32 cap] -> [u32 len][bytes]. */
GL_NET_FN void gl_net_convert_ping_location(const void *location, char *buf, int32_t cap) {
  uint8_t req[GL_NET_PING_LOC_BYTES + 4];
  uint8_t resp[4 + 1024];
  uint32_t rlen = 0, n = 0;
  int32_t want;
  if (buf == NULL || cap <= 0) return;
  buf[0] = 0;
  if (location == NULL) return;
  want = cap > 1024 ? 1024 : cap;
  memcpy(req, location, GL_NET_PING_LOC_BYTES);
  memcpy(req + GL_NET_PING_LOC_BYTES, &want, 4);
  if (!gl_bridge_call_raw(GL_NET_UTILS_ORDINAL, GL_NET_SLOT_CONVERTPING, req, sizeof req, resp,
                          sizeof resp, &rlen) ||
      rlen < 4)
    return;
  memcpy(&n, resp, 4);
  if (n >= (uint32_t)want || rlen != 4u + n) return;
  memcpy(buf, resp + 4, n);
  buf[n] = 0;
}

/* GetConfigValueInfo: [i32 eValue] -> [u32 nameLen][name][i32 type][i32 scope].
 * The name lives in a shim-owned static buffer; NULL for an unknown value. */
GL_NET_FN const char *gl_net_get_config_value_info(int32_t e, int32_t *pOutType, int32_t *pOutScope) {
  uint8_t resp[4 + GL_NET_NAME_MAX + 8];
  uint32_t rlen = 0, n = 0;
  int32_t type = 0, scope = 0;
  if (!gl_bridge_call_raw(GL_NET_UTILS_ORDINAL, GL_NET_SLOT_GETCONFIGINFO, (const uint8_t *)&e, 4,
                          resp, sizeof resp, &rlen) ||
      rlen < 12)
    return NULL;
  memcpy(&n, resp, 4);
  if (n == 0 || n >= GL_NET_NAME_MAX || rlen != 4u + n + 8u) return NULL;
  memcpy(&type, resp + 4 + n, 4);
  memcpy(&scope, resp + 8 + n, 4);
  memcpy(gl_net_name_buf, resp + 4, n);
  gl_net_name_buf[n] = 0;
  if (pOutType != NULL) *pOutType = type;
  if (pOutScope != NULL) *pOutScope = scope;
  return gl_net_name_buf;
}

/* Stored callback for a relayed networking callback id: per connection first
 * (1221 also tries the listen socket), then global. NULL when none. */
GL_NET_FN void *gl_net_cb_fn_for(int32_t id, const void *payload) {
  int32_t cfg;
  void *fn = NULL;
  switch (id) {
    case 1221: cfg = 201; break;
    case 1222: cfg = 202; break;
    case 1281: cfg = 203; break;
    case 1251: cfg = 204; break;
    case 1252: cfg = 205; break;
    default: return NULL;
  }
  if (id == 1221 && payload != NULL) {
    uint32_t hConn, hListen;
    memcpy(&hConn, payload, 4);
    memcpy(&hListen, (const uint8_t *)payload + 152, 4);
    if (hConn != 0) fn = gl_net_cfg_get(cfg, GL_NET_SCOPE_CONNECTION, (int64_t)hConn);
    if (fn == NULL && hListen != 0) fn = gl_net_cfg_get(cfg, GL_NET_SCOPE_LISTEN, (int64_t)hListen);
  }
  if (fn == NULL) fn = gl_net_cfg_get(cfg, GL_NET_SCOPE_GLOBAL, 0);
  return fn;
}
/* Called by the registry delivery paths with NO lock held. Returns 1 when a
 * stored Windows function consumed the callback. */
GL_NET_FN int gl_net_cb_intercept(int32_t id, void *param) {
  void *fn = gl_net_cb_fn_for(id, param);
  if (fn == NULL) return 0;
  ((void (*)(void *))fn)(param);
  return 1;
}
#define GL_NET_CB_INTERCEPT(id, param) gl_net_cb_intercept((id), (param))
#define GL_NET_CB_ANY() gl_net_cb_any()

/* ---- ISteamNetworkingSockets 013 (58-15, x64 only) ----
 * Received-message decode (out-messages), option filtering for the four
 * connect/listen calls, real-time status with lanes, and lane configuration.
 * Every length that arrives from the helper is checked against the bytes that
 * really arrived before it is used, and no Mac pointer is ever stored. */
#define GL_NET_SOCKETS_ORDINAL 70
#define GL_NET_SLOT_S_CLOSECONN 5
#define GL_NET_SLOT_S_CLOSELISTEN 6
#define GL_NET_SLOT_S_RTSTATUS 16
#define GL_NET_SLOT_S_LANES 20
#define GL_NET_REC_HEADER 180
#define GL_NET_OPEN_OPTIONS_MAX 32
#define GL_NET_OPEN_REQ_MAX 8192
#define GL_NET_OPEN_STRING_MAX 1024
#define GL_NET_LANES_MAX 255
#define GL_NET_RT_STATUS_BYTES 120
#define GL_NET_RT_LANE_BYTES 64
#define GL_NET_MSG_OFF_CONN 12
#define GL_NET_MSG_OFF_IDENT 16
#define GL_NET_MSG_OFF_CONNUD 152
#define GL_NET_MSG_OFF_USEC 160
#define GL_NET_MSG_OFF_MSGNUM 168
#define GL_NET_MSG_OFF_CHANNEL 192
#define GL_NET_MSG_OFF_FLAGS 196
#define GL_NET_MSG_OFF_LANE 208

/* Decodes the out-messages records. declared is the helper's count (the
 * method's int32 return), nMax the game's own maximum. Returns how many
 * messages were written to out; each is a game-owned pool message. A declared
 * count past nMax allocates nothing. A malformed or short record ends
 * decoding: the records before it stay valid, the failed one is freed. */
GL_NET_FN int32_t gl_net_decode_messages(const uint8_t *p, uint32_t len, int32_t declared,
                                         int32_t nMax, void **out) {
  int32_t built = 0;
  uint32_t off = 0;
  if (out == NULL || p == NULL || nMax <= 0 || declared <= 0 || declared > nMax) return 0;
  while (built < declared) {
    uint32_t cb, rem = len - off;
    uint8_t *m;
    if (rem < GL_NET_REC_HEADER) break;
    memcpy(&cb, p + off, 4);
    if (cb > GL_NET_MSG_MAX_DATA || cb > rem - GL_NET_REC_HEADER) break;
    m = (uint8_t *)gl_msg_alloc((int32_t)cb);
    if (m == NULL) break;
    memcpy(m + GL_NET_MSG_OFF_CONN, p + off + 4, 4);
    memcpy(m + GL_NET_MSG_OFF_IDENT, p + off + 8, 136);
    memcpy(m + GL_NET_MSG_OFF_CONNUD, p + off + 144, 8);
    memcpy(m + GL_NET_MSG_OFF_USEC, p + off + 152, 8);
    memcpy(m + GL_NET_MSG_OFF_MSGNUM, p + off + 160, 8);
    memcpy(m + GL_NET_MSG_OFF_CHANNEL, p + off + 168, 4);
    memcpy(m + GL_NET_MSG_OFF_FLAGS, p + off + 172, 4);
    memcpy(m + GL_NET_MSG_OFF_LANE, p + off + 176, 2);
    if (cb > 0) {
      void *data;
      memcpy(&data, m, sizeof data);
      memcpy(data, p + off + GL_NET_REC_HEADER, cb);
    }
    out[built++] = m;
    off += GL_NET_REC_HEADER + cb;
  }
  return built;
}

/* Closes a handle the shim could not finish binding (fail closed). */
GL_NET_FN void gl_net_close_unbound(int32_t scope, uint32_t h) {
  uint8_t req[16];
  uint8_t resp[8];
  uint32_t rlen = 0;
  if (scope == GL_NET_SCOPE_LISTEN) {
    gl_bridge_call_raw(GL_NET_SOCKETS_ORDINAL, GL_NET_SLOT_S_CLOSELISTEN, (const uint8_t *)&h, 4,
                       resp, sizeof resp, &rlen);
  } else {
    uint32_t nilStr = 0xFFFFFFFFu;
    int32_t reason = 1000, linger = 0;
    memcpy(req, &h, 4);
    memcpy(req + 4, &reason, 4);
    memcpy(req + 8, &nilStr, 4);
    memcpy(req + 12, &linger, 4);
    gl_bridge_call_raw(GL_NET_SOCKETS_ORDINAL, GL_NET_SLOT_S_CLOSECONN, req, sizeof req, resp,
                       sizeof resp, &rlen);
  }
}

/* CreateListenSocketIP / ConnectByIPAddress / CreateListenSocketP2P /
 * ConnectP2P. Request: [u8 op][struct bytes][i32 port][u32 nKept][kept
 * options], each kept option [i32 e][i32 type][u32 len][bytes]. Ptr-typed
 * options and Callback_* ids never cross: they are bound in the config store to
 * the returned handle (scope LISTEN or CONNECTION). A string option is read
 * here, in the game's own process, and sent as bytes. Anything not understood
 * fails the call (handle 0) rather than being dropped silently. */
GL_NET_FN uint32_t gl_net_open(uint8_t op, const void *st, int32_t port, int32_t nOptions,
                               const void *pOptions, int32_t scope) {
  static const uint32_t stLen[4] = {18, 18, 0, 136};
  uint8_t req[GL_NET_OPEN_REQ_MAX];
  uint8_t resp[8];
  int32_t bind_e[GL_NET_OPEN_OPTIONS_MAX];
  void *bind_fn[GL_NET_OPEN_OPTIONS_MAX];
  uint32_t nbind = 0, nKept = 0, off = 1, keptOff, rlen = 0, h = 0, i;
  if (op > 3 || nOptions < 0 || nOptions > GL_NET_OPEN_OPTIONS_MAX) return 0;
  if (nOptions > 0 && pOptions == NULL) return 0;
  if (stLen[op] > 0 && st == NULL) return 0;
  req[0] = op;
  if (stLen[op] > 0) {
    memcpy(req + off, st, stLen[op]);
    off += stLen[op];
  }
  memcpy(req + off, &port, 4);
  off += 4;
  keptOff = off;
  off += 4;
  for (i = 0; i < (uint32_t)nOptions; i++) {
    const uint8_t *o = (const uint8_t *)pOptions + 16u * i;
    int32_t e, type;
    uint32_t len = 0;
    const void *src = NULL;
    memcpy(&e, o, 4);
    memcpy(&type, o + 4, 4);
    if (type == GL_NET_CFG_PTR) {
      void *fn;
      memcpy(&fn, o + 8, sizeof fn);
      if (fn != NULL) {
        bind_e[nbind] = e;
        bind_fn[nbind] = fn;
        nbind++;
      }
      continue;
    }
    if (gl_net_is_cb_id(e)) return 0;
    if (type == GL_NET_CFG_INT32 || type == GL_NET_CFG_FLOAT) {
      len = 4;
      src = o + 8;
    } else if (type == GL_NET_CFG_INT64) {
      len = 8;
      src = o + 8;
    } else if (type == GL_NET_CFG_STRING) {
      const char *s;
      size_t sl;
      memcpy(&s, o + 8, sizeof s);
      if (s == NULL) return 0;
      sl = strlen(s);
      if (sl + 1 > GL_NET_OPEN_STRING_MAX) return 0;
      len = (uint32_t)(sl + 1);
      src = s;
    } else {
      return 0;
    }
    if (off + 12u + len > sizeof req) return 0;
    memcpy(req + off, &e, 4);
    memcpy(req + off + 4, &type, 4);
    memcpy(req + off + 8, &len, 4);
    memcpy(req + off + 12, src, len);
    off += 12u + len;
    nKept++;
  }
  memcpy(req + keptOff, &nKept, 4);
  {
    static const uint16_t slot[4] = {0, 1, 2, 3};
    if (!gl_bridge_call_raw(GL_NET_SOCKETS_ORDINAL, slot[op], req, off, resp, sizeof resp, &rlen) ||
        rlen != 4)
      return 0;
  }
  memcpy(&h, resp, 4);
  if (h == 0) return 0;
  for (i = 0; i < nbind; i++) {
    if (!gl_net_cfg_put(bind_e[i], scope, (int64_t)h, bind_fn[i])) {
      uint32_t k;
      for (k = 0; k < i; k++) gl_net_cfg_put(bind_e[k], scope, (int64_t)h, NULL);
      gl_net_close_unbound(scope, h);
      return 0;
    }
  }
  return h;
}

/* GetConnectionRealTimeStatus: [u32 hConn][i32 nLanes] -> [i32 ret][u8 present]
 * [120 bytes][u32 nl][nl x 64 bytes]. Lanes are asked for only when the game
 * gave a lane array. */
GL_NET_FN uint32_t gl_net_rt_status(uint32_t hConn, void *pStatus, int32_t nLanes, void *pLanes) {
  uint8_t req[8];
  uint8_t resp[5 + GL_NET_RT_STATUS_BYTES + 4 + GL_NET_LANES_MAX * GL_NET_RT_LANE_BYTES];
  uint32_t rlen = 0, nl = 0, want = 0;
  int32_t ret = 0;
  if (pLanes != NULL && nLanes > 0) want = nLanes > GL_NET_LANES_MAX ? GL_NET_LANES_MAX : (uint32_t)nLanes;
  memcpy(req, &hConn, 4);
  memcpy(req + 4, &want, 4);
  if (!gl_bridge_call_raw(GL_NET_SOCKETS_ORDINAL, GL_NET_SLOT_S_RTSTATUS, req, sizeof req, resp,
                          sizeof resp, &rlen) ||
      rlen < 5 + GL_NET_RT_STATUS_BYTES + 4)
    return 0;
  memcpy(&ret, resp, 4);
  memcpy(&nl, resp + 5 + GL_NET_RT_STATUS_BYTES, 4);
  if (nl > want || rlen != 5u + GL_NET_RT_STATUS_BYTES + 4u + nl * GL_NET_RT_LANE_BYTES) return 0;
  if (resp[4] == 1 && pStatus != NULL) memcpy(pStatus, resp + 5, GL_NET_RT_STATUS_BYTES);
  if (nl > 0) memcpy(pLanes, resp + 9 + GL_NET_RT_STATUS_BYTES, nl * GL_NET_RT_LANE_BYTES);
  return (uint32_t)ret;
}

/* ConfigureConnectionLanes: [u32 hConn][i32 n][u8 hasPrio][u8 hasWeights]
 * [n x i32][n x u16] -> [i32 EResult]. n is 1..255; anything else fails with
 * k_EResultInvalidParam (2). */
GL_NET_FN uint32_t gl_net_configure_lanes(uint32_t hConn, int32_t n, const void *prio,
                                          const void *weights) {
  uint8_t req[10 + GL_NET_LANES_MAX * 6];
  uint8_t resp[4];
  uint32_t rlen = 0, off = 10;
  int32_t ret = 0;
  if (n < 1 || n > GL_NET_LANES_MAX) return 2;
  memcpy(req, &hConn, 4);
  memcpy(req + 4, &n, 4);
  req[8] = prio != NULL;
  req[9] = weights != NULL;
  if (prio != NULL) {
    memcpy(req + off, prio, 4u * (uint32_t)n);
    off += 4u * (uint32_t)n;
  }
  if (weights != NULL) {
    memcpy(req + off, weights, 2u * (uint32_t)n);
    off += 2u * (uint32_t)n;
  }
  if (!gl_bridge_call_raw(GL_NET_SOCKETS_ORDINAL, GL_NET_SLOT_S_LANES, req, off, resp, sizeof resp,
                          &rlen) ||
      rlen != 4)
    return 2;
  memcpy(&ret, resp, 4);
  return (uint32_t)ret;
}
#endif
`

/**
 * 58-14: real bodies for the flat `SteamAPI_SteamNetworkingIdentity_*`,
 * `SteamAPI_SteamNetworkingIPAddr_*` and `SteamAPI_SteamNetworkingMessage_t_Release`
 * exports, replacing the earlier no-ops. Export names are unchanged. Each is a
 * thin wrapper over NETWORKING_LOCAL_C. `bool` returns are an int; `bool`
 * arguments are masked to their low byte because Win64 leaves the rest of the
 * register unspecified.
 */
export const NETWORKING_LOCAL_EXPORT_BODIES: Readonly<Record<string, string>> =
  {
    SteamAPI_SteamNetworkingIPAddr_Clear:
      'void SteamAPI_SteamNetworkingIPAddr_Clear(void *self) {\n' +
      '  if (self != NULL) memset(self, 0, sizeof(gl_net_ip));\n' +
      '}',
    SteamAPI_SteamNetworkingIPAddr_GetFakeIPType:
      'int SteamAPI_SteamNetworkingIPAddr_GetFakeIPType(void *self) {\n' +
      '  return self != NULL ? (int)gl_ip_fake_type((const gl_net_ip *)self) : 0;\n' +
      '}',
    SteamAPI_SteamNetworkingIPAddr_GetIPv4:
      'uint32_t SteamAPI_SteamNetworkingIPAddr_GetIPv4(void *self) {\n' +
      '  return self != NULL ? gl_ip_get_v4((const gl_net_ip *)self) : 0;\n' +
      '}',
    SteamAPI_SteamNetworkingIPAddr_IsEqualTo:
      'int SteamAPI_SteamNetworkingIPAddr_IsEqualTo(void *self, const void *x) {\n' +
      '  return self != NULL && x != NULL && gl_ip_equal((const gl_net_ip *)self, (const gl_net_ip *)x);\n' +
      '}',
    SteamAPI_SteamNetworkingIPAddr_IsFakeIP:
      'int SteamAPI_SteamNetworkingIPAddr_IsFakeIP(void *self) {\n' +
      '  return self != NULL && gl_ip_fake_type((const gl_net_ip *)self) > 1;\n' +
      '}',
    SteamAPI_SteamNetworkingIPAddr_IsIPv4:
      'int SteamAPI_SteamNetworkingIPAddr_IsIPv4(void *self) {\n' +
      '  return self != NULL && gl_ip_is_v4((const gl_net_ip *)self);\n' +
      '}',
    SteamAPI_SteamNetworkingIPAddr_IsIPv6AllZeros:
      'int SteamAPI_SteamNetworkingIPAddr_IsIPv6AllZeros(void *self) {\n' +
      '  return self != NULL && gl_ip_is_v6_allzeros((const gl_net_ip *)self);\n' +
      '}',
    SteamAPI_SteamNetworkingIPAddr_IsLocalHost:
      'int SteamAPI_SteamNetworkingIPAddr_IsLocalHost(void *self) {\n' +
      '  return self != NULL && gl_ip_is_localhost((const gl_net_ip *)self);\n' +
      '}',
    SteamAPI_SteamNetworkingIPAddr_ParseString:
      'int SteamAPI_SteamNetworkingIPAddr_ParseString(void *self, const char *pszStr) {\n' +
      '  return self != NULL && gl_ip_parse((gl_net_ip *)self, pszStr);\n' +
      '}',
    SteamAPI_SteamNetworkingIPAddr_SetIPv4:
      'void SteamAPI_SteamNetworkingIPAddr_SetIPv4(void *self, uint32_t nIP, uint16_t nPort) {\n' +
      '  if (self != NULL) gl_ip_set_v4((gl_net_ip *)self, nIP, nPort);\n' +
      '}',
    SteamAPI_SteamNetworkingIPAddr_SetIPv6:
      'void SteamAPI_SteamNetworkingIPAddr_SetIPv6(void *self, const uint8_t *ipv6, uint16_t nPort) {\n' +
      '  if (self != NULL) gl_ip_set_v6((gl_net_ip *)self, ipv6, nPort);\n' +
      '}',
    SteamAPI_SteamNetworkingIPAddr_SetIPv6LocalHost:
      'void SteamAPI_SteamNetworkingIPAddr_SetIPv6LocalHost(void *self, uint16_t nPort) {\n' +
      '  if (self != NULL) gl_ip_set_v6_localhost((gl_net_ip *)self, nPort);\n' +
      '}',
    SteamAPI_SteamNetworkingIPAddr_ToString:
      'void SteamAPI_SteamNetworkingIPAddr_ToString(void *self, char *buf, uint32_t cbBuf, int bWithPort) {\n' +
      '  if (self != NULL) gl_ip_to_string((const gl_net_ip *)self, buf, cbBuf, (bWithPort & 0xff) != 0);\n' +
      '  else if (buf != NULL && cbBuf > 0) buf[0] = 0;\n' +
      '}',
    SteamAPI_SteamNetworkingIdentity_Clear:
      'void SteamAPI_SteamNetworkingIdentity_Clear(void *self) {\n' +
      '  if (self != NULL) gl_id_clear((gl_net_ident *)self);\n' +
      '}',
    SteamAPI_SteamNetworkingIdentity_GetFakeIPType:
      'int SteamAPI_SteamNetworkingIdentity_GetFakeIPType(void *self) {\n' +
      '  return self != NULL ? (int)gl_id_fake_type((const gl_net_ident *)self) : 0;\n' +
      '}',
    SteamAPI_SteamNetworkingIdentity_GetGenericBytes:
      'const uint8_t *SteamAPI_SteamNetworkingIdentity_GetGenericBytes(void *self, int *cbLen) {\n' +
      '  const gl_net_ident *id = (const gl_net_ident *)self;\n' +
      '  if (id == NULL || id->type != 3) return NULL;\n' +
      '  if (cbLen != NULL) *cbLen = id->cb;\n' +
      '  return id->d.raw;\n' +
      '}',
    SteamAPI_SteamNetworkingIdentity_GetGenericString:
      'const char *SteamAPI_SteamNetworkingIdentity_GetGenericString(void *self) {\n' +
      '  const gl_net_ident *id = (const gl_net_ident *)self;\n' +
      '  return (id != NULL && id->type == 2) ? (const char *)id->d.raw : NULL;\n' +
      '}',
    SteamAPI_SteamNetworkingIdentity_GetIPAddr:
      'const void *SteamAPI_SteamNetworkingIdentity_GetIPAddr(void *self) {\n' +
      '  const gl_net_ident *id = (const gl_net_ident *)self;\n' +
      '  return (id != NULL && id->type == 1) ? (const void *)&id->d.ip : NULL;\n' +
      '}',
    SteamAPI_SteamNetworkingIdentity_GetIPv4:
      'uint32_t SteamAPI_SteamNetworkingIdentity_GetIPv4(void *self) {\n' +
      '  const gl_net_ident *id = (const gl_net_ident *)self;\n' +
      '  return (id != NULL && id->type == 1) ? gl_ip_get_v4(&id->d.ip) : 0;\n' +
      '}',
    SteamAPI_SteamNetworkingIdentity_GetPSNID:
      'uint64_t SteamAPI_SteamNetworkingIdentity_GetPSNID(void *self) {\n' +
      '  return self != NULL ? gl_id_get_u64((const gl_net_ident *)self, 18) : 0;\n' +
      '}',
    SteamAPI_SteamNetworkingIdentity_GetStadiaID:
      'uint64_t SteamAPI_SteamNetworkingIdentity_GetStadiaID(void *self) {\n' +
      '  return self != NULL ? gl_id_get_u64((const gl_net_ident *)self, 19) : 0;\n' +
      '}',
    SteamAPI_SteamNetworkingIdentity_GetSteamID:
      'uint64_t SteamAPI_SteamNetworkingIdentity_GetSteamID(void *self) {\n' +
      '  return self != NULL ? gl_id_get_u64((const gl_net_ident *)self, 16) : 0;\n' +
      '}',
    SteamAPI_SteamNetworkingIdentity_GetSteamID64:
      'uint64_t SteamAPI_SteamNetworkingIdentity_GetSteamID64(void *self) {\n' +
      '  return self != NULL ? gl_id_get_u64((const gl_net_ident *)self, 16) : 0;\n' +
      '}',
    SteamAPI_SteamNetworkingIdentity_GetXboxPairwiseID:
      'const char *SteamAPI_SteamNetworkingIdentity_GetXboxPairwiseID(void *self) {\n' +
      '  const gl_net_ident *id = (const gl_net_ident *)self;\n' +
      '  return (id != NULL && id->type == 17) ? (const char *)id->d.raw : NULL;\n' +
      '}',
    SteamAPI_SteamNetworkingIdentity_IsEqualTo:
      'int SteamAPI_SteamNetworkingIdentity_IsEqualTo(void *self, const void *x) {\n' +
      '  return self != NULL && x != NULL && gl_id_equal((const gl_net_ident *)self, (const gl_net_ident *)x);\n' +
      '}',
    SteamAPI_SteamNetworkingIdentity_IsFakeIP:
      'int SteamAPI_SteamNetworkingIdentity_IsFakeIP(void *self) {\n' +
      '  return self != NULL && gl_id_fake_type((const gl_net_ident *)self) > 1;\n' +
      '}',
    SteamAPI_SteamNetworkingIdentity_IsInvalid:
      'int SteamAPI_SteamNetworkingIdentity_IsInvalid(void *self) {\n' +
      '  return self == NULL || ((const gl_net_ident *)self)->type == 0;\n' +
      '}',
    SteamAPI_SteamNetworkingIdentity_IsLocalHost:
      'int SteamAPI_SteamNetworkingIdentity_IsLocalHost(void *self) {\n' +
      '  const gl_net_ident *id = (const gl_net_ident *)self;\n' +
      '  return id != NULL && id->type == 1 && gl_ip_is_localhost(&id->d.ip);\n' +
      '}',
    SteamAPI_SteamNetworkingIdentity_ParseString:
      'int SteamAPI_SteamNetworkingIdentity_ParseString(void *self, const char *pszStr) {\n' +
      '  return self != NULL && gl_id_parse((gl_net_ident *)self, pszStr);\n' +
      '}',
    SteamAPI_SteamNetworkingIdentity_SetGenericBytes:
      'int SteamAPI_SteamNetworkingIdentity_SetGenericBytes(void *self, const void *data, uint32_t cbLen) {\n' +
      '  return self != NULL && gl_id_set_bytes((gl_net_ident *)self, data, cbLen);\n' +
      '}',
    SteamAPI_SteamNetworkingIdentity_SetGenericString:
      'int SteamAPI_SteamNetworkingIdentity_SetGenericString(void *self, const char *pszString) {\n' +
      '  return self != NULL && gl_id_set_string((gl_net_ident *)self, 2, pszString, 32, 0);\n' +
      '}',
    SteamAPI_SteamNetworkingIdentity_SetIPAddr:
      'void SteamAPI_SteamNetworkingIdentity_SetIPAddr(void *self, const void *addr) {\n' +
      '  if (self != NULL) gl_id_set_ip((gl_net_ident *)self, (const gl_net_ip *)addr);\n' +
      '}',
    SteamAPI_SteamNetworkingIdentity_SetIPv4Addr:
      'void SteamAPI_SteamNetworkingIdentity_SetIPv4Addr(void *self, uint32_t nIPv4, uint16_t nPort) {\n' +
      '  if (self != NULL) gl_id_set_ipv4((gl_net_ident *)self, nIPv4, nPort);\n' +
      '}',
    SteamAPI_SteamNetworkingIdentity_SetLocalHost:
      'void SteamAPI_SteamNetworkingIdentity_SetLocalHost(void *self) {\n' +
      '  if (self != NULL) gl_id_set_localhost((gl_net_ident *)self);\n' +
      '}',
    SteamAPI_SteamNetworkingIdentity_SetPSNID:
      'void SteamAPI_SteamNetworkingIdentity_SetPSNID(void *self, uint64_t id) {\n' +
      '  if (self != NULL) gl_id_set_u64((gl_net_ident *)self, 18, id);\n' +
      '}',
    SteamAPI_SteamNetworkingIdentity_SetStadiaID:
      'void SteamAPI_SteamNetworkingIdentity_SetStadiaID(void *self, uint64_t id) {\n' +
      '  if (self != NULL) gl_id_set_u64((gl_net_ident *)self, 19, id);\n' +
      '}',
    SteamAPI_SteamNetworkingIdentity_SetSteamID:
      'void SteamAPI_SteamNetworkingIdentity_SetSteamID(void *self, uint64_t steamID) {\n' +
      '  if (self != NULL) gl_id_set_u64((gl_net_ident *)self, 16, steamID);\n' +
      '}',
    SteamAPI_SteamNetworkingIdentity_SetSteamID64:
      'void SteamAPI_SteamNetworkingIdentity_SetSteamID64(void *self, uint64_t steamID) {\n' +
      '  if (self != NULL) gl_id_set_u64((gl_net_ident *)self, 16, steamID);\n' +
      '}',
    SteamAPI_SteamNetworkingIdentity_SetXboxPairwiseID:
      'int SteamAPI_SteamNetworkingIdentity_SetXboxPairwiseID(void *self, const char *pszString) {\n' +
      '  return self != NULL && gl_id_set_string((gl_net_ident *)self, 17, pszString, 33, 1);\n' +
      '}',
    SteamAPI_SteamNetworkingIdentity_ToString:
      'void SteamAPI_SteamNetworkingIdentity_ToString(void *self, char *buf, uint32_t cbBuf) {\n' +
      '  if (self != NULL) gl_id_to_string((const gl_net_ident *)self, buf, cbBuf);\n' +
      '  else if (buf != NULL && cbBuf > 0) buf[0] = 0;\n' +
      '}',
    SteamAPI_SteamNetworkingMessage_t_Release:
      'void SteamAPI_SteamNetworkingMessage_t_Release(void *self) {\n' +
      '  gl_msg_release_via_fn(self);\n' +
      '}'
  }

/**
 * 58-14: the SDK's flat-only ISteamNetworkingUtils helpers (the inlines in the
 * SDK header, which have no virtual slot). Each is routed exactly as the
 * inline defines it: InitRelayNetworkAccess calls the wired
 * CheckPingDataUpToDate slot (7) with 1e10f, IsFakeIPv4 is
 * GetIPv4FakeIPType (slot 14) greater than NotFake (1), and every Set* helper
 * ends in the shim-local SetConfigValue. `self` is the game's utils object and
 * is only dereferenced for the two vtable calls.
 */
export const NETWORKING_UTILS_FLAT_INLINE: Readonly<Record<string, string>> = {
  SteamAPI_ISteamNetworkingUtils_InitRelayNetworkAccess:
    'void SteamAPI_ISteamNetworkingUtils_InitRelayNetworkAccess(void *self) {\n' +
    '  void **vt;\n' +
    '  if (self == NULL) return;\n' +
    '  vt = *(void ***)self;\n' +
    '  if (vt == NULL || vt[7] == NULL) return;\n' +
    '  (void)((int (*)(void *, float))vt[7])(self, 1e10f);\n' +
    '}',
  SteamAPI_ISteamNetworkingUtils_IsFakeIPv4:
    'int SteamAPI_ISteamNetworkingUtils_IsFakeIPv4(void *self, uint32_t nIPv4) {\n' +
    '  void **vt;\n' +
    '  if (self == NULL) return 0;\n' +
    '  vt = *(void ***)self;\n' +
    '  if (vt == NULL || vt[14] == NULL) return 0;\n' +
    '  return ((int (*)(void *, uint32_t))vt[14])(self, nIPv4) > 1;\n' +
    '}',
  SteamAPI_ISteamNetworkingUtils_SetGlobalConfigValueInt32:
    'int SteamAPI_ISteamNetworkingUtils_SetGlobalConfigValueInt32(void *self, int eValue, int32_t val) {\n' +
    '  (void)self;\n' +
    '  return gl_net_set_config_value(eValue, 1, 0, 1, &val);\n' +
    '}',
  SteamAPI_ISteamNetworkingUtils_SetGlobalConfigValueFloat:
    'int SteamAPI_ISteamNetworkingUtils_SetGlobalConfigValueFloat(void *self, int eValue, float val) {\n' +
    '  (void)self;\n' +
    '  return gl_net_set_config_value(eValue, 1, 0, 3, &val);\n' +
    '}',
  SteamAPI_ISteamNetworkingUtils_SetGlobalConfigValueString:
    'int SteamAPI_ISteamNetworkingUtils_SetGlobalConfigValueString(void *self, int eValue, const char *val) {\n' +
    '  (void)self;\n' +
    '  return gl_net_set_config_value(eValue, 1, 0, 4, val);\n' +
    '}',
  SteamAPI_ISteamNetworkingUtils_SetGlobalConfigValuePtr:
    'int SteamAPI_ISteamNetworkingUtils_SetGlobalConfigValuePtr(void *self, int eValue, void *val) {\n' +
    '  (void)self;\n' +
    '  return gl_net_set_config_value(eValue, 1, 0, 5, &val);\n' +
    '}',
  SteamAPI_ISteamNetworkingUtils_SetConnectionConfigValueInt32:
    'int SteamAPI_ISteamNetworkingUtils_SetConnectionConfigValueInt32(void *self, uint32_t hConn, int eValue, int32_t val) {\n' +
    '  (void)self;\n' +
    '  return gl_net_set_config_value(eValue, 4, (int64_t)hConn, 1, &val);\n' +
    '}',
  SteamAPI_ISteamNetworkingUtils_SetConnectionConfigValueFloat:
    'int SteamAPI_ISteamNetworkingUtils_SetConnectionConfigValueFloat(void *self, uint32_t hConn, int eValue, float val) {\n' +
    '  (void)self;\n' +
    '  return gl_net_set_config_value(eValue, 4, (int64_t)hConn, 3, &val);\n' +
    '}',
  SteamAPI_ISteamNetworkingUtils_SetConnectionConfigValueString:
    'int SteamAPI_ISteamNetworkingUtils_SetConnectionConfigValueString(void *self, uint32_t hConn, int eValue, const char *val) {\n' +
    '  (void)self;\n' +
    '  return gl_net_set_config_value(eValue, 4, (int64_t)hConn, 4, val);\n' +
    '}',
  SteamAPI_ISteamNetworkingUtils_SetConfigValueStruct:
    'int SteamAPI_ISteamNetworkingUtils_SetConfigValueStruct(void *self, const void *opt, int eScopeType, intptr_t scopeObj) {\n' +
    '  const uint8_t *o = (const uint8_t *)opt;\n' +
    '  int32_t e, type;\n' +
    '  (void)self;\n' +
    '  if (o == NULL) return 0;\n' +
    '  memcpy(&e, o, 4);\n' +
    '  memcpy(&type, o + 4, 4);\n' +
    '  if (type == 4) {\n' +
    '    const char *str;\n' +
    '    memcpy(&str, o + 8, sizeof str);\n' +
    '    return gl_net_set_config_value(e, eScopeType, (int64_t)scopeObj, type, str);\n' +
    '  }\n' +
    '  return gl_net_set_config_value(e, eScopeType, (int64_t)scopeObj, type, o + 8);\n' +
    '}',
  SteamAPI_ISteamNetworkingUtils_SetGlobalCallback_SteamNetConnectionStatusChanged:
    'int SteamAPI_ISteamNetworkingUtils_SetGlobalCallback_SteamNetConnectionStatusChanged(void *self, void *fnCallback) {\n' +
    '  (void)self;\n' +
    '  return gl_net_set_config_value(201, 1, 0, 5, &fnCallback);\n' +
    '}',
  SteamAPI_ISteamNetworkingUtils_SetGlobalCallback_SteamNetAuthenticationStatusChanged:
    'int SteamAPI_ISteamNetworkingUtils_SetGlobalCallback_SteamNetAuthenticationStatusChanged(void *self, void *fnCallback) {\n' +
    '  (void)self;\n' +
    '  return gl_net_set_config_value(202, 1, 0, 5, &fnCallback);\n' +
    '}',
  SteamAPI_ISteamNetworkingUtils_SetGlobalCallback_SteamRelayNetworkStatusChanged:
    'int SteamAPI_ISteamNetworkingUtils_SetGlobalCallback_SteamRelayNetworkStatusChanged(void *self, void *fnCallback) {\n' +
    '  (void)self;\n' +
    '  return gl_net_set_config_value(203, 1, 0, 5, &fnCallback);\n' +
    '}',
  SteamAPI_ISteamNetworkingUtils_SetGlobalCallback_MessagesSessionRequest:
    'int SteamAPI_ISteamNetworkingUtils_SetGlobalCallback_MessagesSessionRequest(void *self, void *fnCallback) {\n' +
    '  (void)self;\n' +
    '  return gl_net_set_config_value(204, 1, 0, 5, &fnCallback);\n' +
    '}',
  SteamAPI_ISteamNetworkingUtils_SetGlobalCallback_MessagesSessionFailed:
    'int SteamAPI_ISteamNetworkingUtils_SetGlobalCallback_MessagesSessionFailed(void *self, void *fnCallback) {\n' +
    '  (void)self;\n' +
    '  return gl_net_set_config_value(205, 1, 0, 5, &fnCallback);\n' +
    '}',
  SteamAPI_ISteamNetworkingUtils_SetGlobalCallback_FakeIPResult:
    'int SteamAPI_ISteamNetworkingUtils_SetGlobalCallback_FakeIPResult(void *self, void *fnCallback) {\n' +
    '  (void)self;\n' +
    '  return gl_net_set_config_value(207, 1, 0, 5, &fnCallback);\n' +
    '}'
}

export const NETWORKING_UTILS_FLAT_INLINE_NAMES: readonly string[] =
  Object.keys(NETWORKING_UTILS_FLAT_INLINE).sort()

export const LIFECYCLE_NOOP_EXPORTS: readonly string[] = [
  ...Object.keys(LIFECYCLE_NOOP_SPECS),
  ...Object.keys(MANUAL_DISPATCH_EXPORT_BODIES),
  ...Object.keys(NETWORKING_LOCAL_EXPORT_BODIES)
].sort()

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
      MANUAL_DISPATCH_EXPORT_BODIES[name] ??
        NETWORKING_LOCAL_EXPORT_BODIES[name] ??
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
/** One relay row serves both Windows DLLs, so their measured UserStatsReceived_t
 *  sizes must agree (they do: 24 bytes, 0/8/16). */
if (
  USER_STATS_RECEIVED_LAYOUT.x64.size !== USER_STATS_RECEIVED_LAYOUT.x86.size
) {
  throw new Error(
    'UserStatsReceived_t differs between x64 and x86; one relay row cannot serve both DLLs'
  )
}

export interface CallbackRelayRow {
  readonly id: number
  readonly size: number
  readonly hold: boolean
  /** 58-28 (WR-09): a held message older than this many ms is cleared instead
   *  of delivered. Absent or 0 = no expiry (1101 keeps its k51 hold). */
  readonly holdExpiryMs?: number
  /** Present only when the struct's x86 size differs from x64: the row is then
   *  emitted for steam_api64.dll only (58-10, the equality guard per row). */
  readonly arches?: 'x64'
}

function broadcastRelayRow(
  name: keyof typeof CALLBACK_LAYOUTS,
  hold: boolean
): CallbackRelayRow {
  const l = CALLBACK_LAYOUTS[name]
  if (l.id === null) throw new Error(`${name} has no callback id`)
  const row = { id: l.id as number, size: l.x64.size as number, hold }
  return l.x64.size === l.x86.size ? row : { ...row, arches: 'x64' }
}

/** Relayed callback ids and their exact (wire) param sizes; mirrors the helper
 *  allowlist rows in gamelib_cbqueue.h. `hold` keeps one latest message of that
 *  id when it arrives with no live listener, to be dispatched once one
 *  registers. 168 carries a web-API auth ticket and is NEVER held (Phase 55
 *  credential hygiene); 1101 (UserStatsReceived_t) carries no credential. The
 *  58-10 broadcast rows are never held. 513 (LobbyCreated_t) is BOTH a
 *  broadcast and a call result (quick 261031-ixa): a game with Callback<> and
 *  CallResult<> sees both, each path independent (broadcast: slot 6 into the
 *  relay/FIFO; call result: slot 11 into Run or GetAPICallResult). */
export const CALLBACK_RELAY_TABLE: readonly CallbackRelayRow[] = [
  { id: 168, size: 2572, hold: false },
  { id: 1101, size: USER_STATS_RECEIVED_LAYOUT.x64.size, hold: true },
  broadcastRelayRow('LobbyInvite_t', false),
  broadcastRelayRow('LobbyEnter_t', false),
  broadcastRelayRow('LobbyDataUpdate_t', false),
  broadcastRelayRow('LobbyChatUpdate_t', false),
  broadcastRelayRow('LobbyChatMsg_t', false),
  broadcastRelayRow('LobbyKicked_t', false),
  broadcastRelayRow('LobbyCreated_t', false),
  // 58-18 (D-09 measured): an invite can arrive before the game registers its
  // handler, so the latest one is held (16 bytes fits CALLBACK_HELD_MAX_BYTES).
  {
    ...broadcastRelayRow('GameLobbyJoinRequested_t', true),
    holdExpiryMs: 60000
  },
  broadcastRelayRow('P2PSessionRequest_t', false),
  broadcastRelayRow('P2PSessionConnectFail_t', false),
  broadcastRelayRow('SteamNetConnectionStatusChangedCallback_t', false),
  broadcastRelayRow('SteamNetAuthenticationStatus_t', false),
  broadcastRelayRow('SteamNetworkingMessagesSessionRequest_t', false),
  broadcastRelayRow('SteamNetworkingMessagesSessionFailed_t', false),
  broadcastRelayRow('SteamRelayNetworkStatus_t', false)
]

/** Call results the shim can complete through CCallResult::Run (58-10): the
 *  helper tracks these handles (gamelib_callresult.h). 168 is never here. */
export const CALL_RESULT_TABLE: readonly { id: number; size: number }[] = [
  { id: 513, size: CALLBACK_LAYOUTS.LobbyCreated_t.x64.size },
  { id: 510, size: CALLBACK_LAYOUTS.LobbyMatchList_t.x64.size },
  { id: 504, size: CALLBACK_LAYOUTS.LobbyEnter_t.x64.size }
]
for (const name of [
  'LobbyCreated_t',
  'LobbyMatchList_t',
  'LobbyEnter_t'
] as const) {
  if (CALLBACK_LAYOUTS[name].x64.size !== CALLBACK_LAYOUTS[name].x86.size) {
    throw new Error(`${name} differs between x64 and x86 call-result rows`)
  }
}
if (CALL_RESULT_TABLE.some((r) => r.id === 168)) {
  throw new Error('168 carries a ticket and can never be a call result row')
}
/** Registered CCallResult pairs; overflow is counted and ignored. */
export const CALL_RESULT_REGISTRY_CAPACITY = 64
/** Results that arrived before their CCallResult registered. */
export const CALL_RESULT_HELD_SLOTS = 16
export const CALL_RESULT_HELD_EXPIRY_MS = 10000
/** Slot-11 reply: u32 count + u64 h + i32 id + u32 failed + u32 cub + bytes.
 *  Mirrors helper GL_CR_DRAIN_RESP_MAX_BYTES (cross-pinned in gen_vtables.test.ts). */
export const CALL_RESULT_DRAIN_RESP_MAX_BYTES = 4 + 8 + 4 + 4 + 4 + 2572
const CALL_RESULT_HELD_MAX_BYTES = Math.max(
  ...CALL_RESULT_TABLE.map((r) => r.size)
)

/** Max bytes of one held message (every hold row must fit; checked at generation). */
export const CALLBACK_HELD_MAX_BYTES = 64

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
 * (returns 1 on a good reply, 0 on any failure), and
 * `void gl_cb_report_dispatch(int32_t id, uint32_t ndispatched, uint32_t held)`
 * (quick k51: told once per drained or held-retried relayed message, always
 * with no lock held; the embedder forwards it to the helper log), and
 * `void gl_cb_report_register(int32_t id, uint32_t path)`
 * (quick 261106-qvp: told with no lock held, from the Run paths and never
 * from gl_cb_register itself; path 0 = the game registered a listener for an
 * id that is not a relay row, path 1 = the game called
 * SteamAPI_ManualDispatch_Init (id 0). The result is ignored), and
 * `int gl_cb_transport_drain_cr(uint8_t *buf, uint32_t cap, uint32_t *lenOut)`
 * (58-10: CONTROL slot 11, one completed call result per reply; 0 on failure,
 * including an old helper that does not know the slot), and (x64 only, 58-21)
 * `int gl_cb_transport_drain_mms(uint8_t *buf, uint32_t cap, uint32_t *lenOut)`
 * (CONTROL slot 12, one server-browser event per reply) and
 * `int gl_mms_transport(uint16_t slot, const uint8_t *req, uint32_t reqLen,
 * uint8_t *resp, uint32_t cap, uint32_t *lenOut)` (a request frame to the
 * SteamMatchMakingServers003 ordinal).
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
 *
 * Known limit (55 WR-05): the drain is destructive -- the helper zeroes its
 * slot when it answers -- and targets are resolved only AFTER the pull. A
 * message whose id has no live non-gameserver handler at that instant (the
 * last one was unregistered after the relay gate, or only gameserver ones
 * remain) is dropped, as Steam drops an unhandled callback. Each drop bumps
 * gl_cb_no_target (a count only; the payload is never kept or logged).
 * Exception (quick k51): a row with `hold` set is retained instead, one slot
 * per id, latest wins, and dispatched on a later RunCallbacks once a listener
 * registers. Rows that carry a credential (168) are never held.
 *
 * Call results (58-10): SteamAPI_RegisterCallResult records (object, handle)
 * pairs (64). RunCallbacks pulls completed results from slot 11 and calls the
 * object's Run(pvParam, bIOFailure, hCall) (vtable slot 0) outside the lock,
 * then removes the pair. A result that arrives before its pair registers is
 * held (16 slots, 10 s, secure-zeroed on delivery or expiry) and retried on a
 * later RunCallbacks. Only ids in the call-result table are accepted, so a
 * ticket (168) can never be held.
 */
export function generateCallbackRegistryC(): string {
  const x86 = MSVC_CCALLBACKBASE_OFFSETS.x86
  const x64 = MSVC_CCALLBACKBASE_OFFSETS.x64
  for (const r of CALLBACK_RELAY_TABLE) {
    if (r.hold && r.size > CALLBACK_HELD_MAX_BYTES) {
      throw new Error(
        `relay row ${r.id} (${r.size} bytes) does not fit the held slot (${CALLBACK_HELD_MAX_BYTES})`
      )
    }
  }
  // A row whose x86 struct differs is emitted for the 64-bit DLL only.
  const relayRows = CALLBACK_RELAY_TABLE.map((r) =>
    r.arches === 'x64'
      ? `#if !defined(__i386__)\n  {${r.id}, ${r.size}u, ${r.hold ? 1 : 0}, ${r.holdExpiryMs ?? 0}u},\n#endif`
      : `  {${r.id}, ${r.size}u, ${r.hold ? 1 : 0}, ${r.holdExpiryMs ?? 0}u},`
  ).join('\n')
  const crRows = CALL_RESULT_TABLE.map((r) => `  {${r.id}, ${r.size}u},`).join(
    '\n'
  )
  return `/* ---- callback registry (generated by meta/gen_vtables.ts, P55-3) ---- */
/* 58-14: networking callbacks the game registered as plain function pointers
 * (SetGlobalCallback_*) are consumed here instead of being posted to a
 * CCallback. The 64-bit shim defines both macros before this text; every
 * other build keeps these inert defaults. GL_NET_CB_ANY must not take the
 * registry lock (it is read while the lock is held). */
#ifndef GL_NET_CB_INTERCEPT
#define GL_NET_CB_INTERCEPT(id, param) 0
#endif
#ifndef GL_NET_CB_ANY
#define GL_NET_CB_ANY() 0
#endif
#define GL_CB_REGISTRY_CAPACITY ${CALLBACK_REGISTRY_CAPACITY}
#define GL_CB_DRAIN_MIN_INTERVAL_MS ${CALLBACK_DRAIN_MIN_INTERVAL_MS}
#define GL_CB_DRAIN_MAX_PER_RUN ${CALLBACK_DRAIN_MAX_PER_RUN}
#define GL_CB_DRAIN_FAIL_BACKOFF_AFTER ${CALLBACK_DRAIN_FAIL_BACKOFF_AFTER}
#define GL_CB_DRAIN_BACKOFF_MS ${CALLBACK_DRAIN_BACKOFF_MS}
#define GL_CB_DRAIN_RESP_MAX_BYTES ${CALLBACK_DRAIN_RESP_MAX_BYTES}
#define GL_CB_HELD_MAX_BYTES ${CALLBACK_HELD_MAX_BYTES}
#define GL_CR_REGISTRY_CAPACITY ${CALL_RESULT_REGISTRY_CAPACITY}
#define GL_CR_HELD_SLOTS ${CALL_RESULT_HELD_SLOTS}
#define GL_CR_HELD_EXPIRY_MS ${CALL_RESULT_HELD_EXPIRY_MS}
#define GL_CR_HELD_MAX_BYTES ${CALL_RESULT_HELD_MAX_BYTES}
#define GL_CR_DRAIN_RESP_MAX_BYTES ${CALL_RESULT_DRAIN_RESP_MAX_BYTES}
#define GL_CB_FLAG_REGISTERED 0x${STEAM_CALLBACK_FLAG_REGISTERED.toString(16).padStart(2, '0')}
#define GL_CB_FLAG_GAMESERVER 0x${STEAM_CALLBACK_FLAG_GAMESERVER.toString(16).padStart(2, '0')}
/* MEASURED, not assumed: vtable slot of CCallbackBase::Run(void*). MSVC
 * reverses overloaded virtuals, so slot 0 is Run(void*, bool, SteamAPICall_t).
 * Source: meta/msvcCallbackLayout.ts, checked against the committed dump
 * meta/__tests__/fixtures/msvc_ccallbackbase.layout.txt. */
#define GL_CB_VSLOT_RUN_1ARG ${MSVC_CCALLBACKBASE_VSLOT_RUN_1ARG}
/* vtable slot of CCallbackBase::Run(void*, bool, SteamAPICall_t). */
#define GL_CB_VSLOT_RUN_3ARG ${MSVC_CCALLBACKBASE_VSLOT_RUN_3ARG}
#if defined(__i386__)
#define GL_CB_FLAGS_OFF ${x86.flags}
#define GL_CB_ICALLBACK_OFF ${x86.iCallback}
#else
#define GL_CB_FLAGS_OFF ${x64.flags}
#define GL_CB_ICALLBACK_OFF ${x64.iCallback}
#endif

typedef void (THISCALL *gl_cb_run1_fn)(void *self, void *pvParam);
/* bIOFailure is an int: MSVC passes a bool as a full word on x86 and in a
 * register on x64, and the callee reads only the low byte. */
typedef void (THISCALL *gl_cb_run3_fn)(void *self, void *pvParam, int bIOFailure, uint64_t hCall);

typedef struct {
  void *cb;
  int32_t iCallback;
} gl_cb_entry;

typedef struct {
  int32_t id;
  uint32_t size;
  int hold;
  uint32_t hold_expiry_ms; /* 58-28 (WR-09): 0 = a held message never expires */
} gl_cb_relay_row;

static const gl_cb_relay_row gl_cb_relay_table[] = {
${relayRows}
};
#define GL_CB_RELAY_ROWS ((uint32_t)(sizeof(gl_cb_relay_table) / sizeof(gl_cb_relay_table[0])))

/* One held message per relay row (only rows with hold set are ever used). */
typedef struct {
  int valid;
  uint32_t cub;
  uint32_t born_ms; /* 58-28: gl_cb_now_ms() when the message was held */
  uint8_t bytes[GL_CB_HELD_MAX_BYTES];
} gl_cb_held_entry;

static gl_cb_held_entry gl_cb_held[GL_CB_RELAY_ROWS];

/* ---- call results (58-10): CCallResult pairs and early arrivals ---- */
typedef struct {
  int32_t id;
  uint32_t size;
} gl_cr_row;

static const gl_cr_row gl_cr_table[] = {
${crRows}
};
#define GL_CR_ROWS ((uint32_t)(sizeof(gl_cr_table) / sizeof(gl_cr_table[0])))

typedef struct {
  void *cb;
  uint64_t h;
} gl_cr_entry;

/* A result that arrived before its CCallResult registered. Never 168: only
 * ids in gl_cr_table are accepted at all. */
typedef struct {
  int valid;
  uint64_t h;
  int32_t id;
  uint32_t failed;
  uint32_t cub;
  uint32_t born_ms;
  uint8_t bytes[GL_CR_HELD_MAX_BYTES];
} gl_cr_held_entry;

static gl_cr_entry gl_cr_entries[GL_CR_REGISTRY_CAPACITY];
static uint32_t gl_cr_count;
static gl_cr_held_entry gl_cr_held[GL_CR_HELD_SLOTS];
static uint32_t gl_cr_held_count;
static uint32_t gl_cr_overflow;
static uint32_t gl_cr_held_overflow;
static uint32_t gl_cr_held_expired;
static uint32_t gl_cr_fail_count;
static uint32_t gl_cr_last_fail_ms;

static gl_cb_entry gl_cb_entries[GL_CB_REGISTRY_CAPACITY];
static uint32_t gl_cb_count;
static uint32_t gl_cb_relay_count;
static uint32_t gl_cb_last_drain_ms;
static int gl_cb_have_drained;
static uint32_t gl_cb_fail_count;
static uint32_t gl_cb_overflow;
static uint32_t gl_cb_no_target;
/* quick 261106-qvp: game registrations of ids that are not relay rows,
 * recorded under the lock and reported later by gl_cbreg_flush (never from
 * inside gl_cb_register: the report is a socket round trip). */
#define GL_CBREG_MAX 32
static int32_t gl_cbreg_ids[GL_CBREG_MAX];
static uint32_t gl_cbreg_n;
static uint32_t gl_cbreg_flushed;
static int gl_cbreg_md_pending;
static int gl_cbreg_md_done;
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

/* Index of the relay row for id, or -1. */
static int gl_cb_relay_row_index(int32_t id) {
  uint32_t i;
  for (i = 0; i < GL_CB_RELAY_ROWS; i++) {
    if (gl_cb_relay_table[i].id == id) return (int)i;
  }
  return -1;
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
  if (id > 0 && gl_cb_relay_size(id) == 0 && gl_cbreg_n < GL_CBREG_MAX) {
    uint32_t k;
    for (k = 0; k < gl_cbreg_n; k++) if (gl_cbreg_ids[k] == id) break;
    if (k == gl_cbreg_n) gl_cbreg_ids[gl_cbreg_n++] = id;
  }
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

/* quick 261106-qvp: report the recorded registrations with no lock held. */
static void gl_cbreg_flush(void) {
  int32_t ids[GL_CBREG_MAX];
  uint32_t n = 0, i;
  int md = 0;
  GL_CB_LOCK();
  while (gl_cbreg_flushed < gl_cbreg_n) ids[n++] = gl_cbreg_ids[gl_cbreg_flushed++];
  if (gl_cbreg_md_pending && !gl_cbreg_md_done) {
    md = 1;
    gl_cbreg_md_done = 1;
  }
  gl_cbreg_md_pending = 0;
  GL_CB_UNLOCK();
  for (i = 0; i < n; i++) gl_cb_report_register(ids[i], 0);
  if (md) gl_cb_report_register(0, 1);
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

/* Secure zero: the compiler may not elide it. */
static void gl_cb_zero(void *p, uint32_t n) {
  volatile uint8_t *zp = (volatile uint8_t *)p;
  uint32_t zi;
  for (zi = 0; zi < n; zi++) zp[zi] = 0;
}

static uint32_t gl_cr_size(int32_t id) {
  uint32_t i;
  for (i = 0; i < GL_CR_ROWS; i++) {
    if (gl_cr_table[i].id == id) return gl_cr_table[i].size;
  }
  return 0;
}

/* Caller holds the lock. Returns index or -1. */
static int gl_cr_find(void *cb, uint64_t h) {
  uint32_t i;
  for (i = 0; i < gl_cr_count; i++) {
    if (gl_cr_entries[i].cb == cb && gl_cr_entries[i].h == h) return (int)i;
  }
  return -1;
}

/* Caller holds the lock. Returns the first entry for h, or -1. */
static int gl_cr_find_handle(uint64_t h) {
  uint32_t i;
  for (i = 0; i < gl_cr_count; i++) {
    if (gl_cr_entries[i].h == h) return (int)i;
  }
  return -1;
}

static void gl_cr_register(void *cb, uint64_t h) {
  if (!cb) return;
  GL_CB_LOCK();
  if (gl_cr_find(cb, h) >= 0) {
    /* the same pair again: nothing to add */
  } else if (gl_cr_count >= GL_CR_REGISTRY_CAPACITY) {
    gl_cr_overflow++;
  } else {
    gl_cr_entries[gl_cr_count].cb = cb;
    gl_cr_entries[gl_cr_count].h = h;
    gl_cr_count++;
  }
  GL_CB_UNLOCK();
}

static void gl_cr_unregister(void *cb, uint64_t h) {
  int idx;
  if (!cb) return;
  GL_CB_LOCK();
  /* same in-flight rule as gl_cb_unregister (55 WR-01) */
  while (gl_cb_dispatching == cb && gl_cb_run_tid != GL_CB_THREAD_ID()) {
    GL_CB_UNLOCK();
    GL_CB_YIELD();
    GL_CB_LOCK();
  }
  idx = gl_cr_find(cb, h);
  if (idx >= 0) {
    gl_cr_count--;
    gl_cr_entries[idx] = gl_cr_entries[gl_cr_count];
    gl_cb_zero(&gl_cr_entries[gl_cr_count], (uint32_t)sizeof(gl_cr_entries[0]));
  }
  GL_CB_UNLOCK();
}

/* Called with NO lock held. Finds the CCallResult registered for h and calls
 * Run(pvParam, bIOFailure, hCall) on it. Returns 1 when delivered (and the
 * pair removed), 0 when no pair is registered for h. */
static int gl_cr_deliver(uint64_t h, int32_t id, uint32_t failed, void *param) {
  void *cb;
  int idx;
  GL_CB_LOCK();
  idx = gl_cr_find_handle(h);
  if (idx < 0) {
    GL_CB_UNLOCK();
    return 0;
  }
  cb = gl_cr_entries[idx].cb;
  gl_cb_dispatching = cb;
  GL_CB_UNLOCK();

  {
    void **vtbl = *(void ***)cb;
    ((gl_cb_run3_fn)vtbl[GL_CB_VSLOT_RUN_3ARG])(cb, param, failed ? 1 : 0, h);
  }

  GL_CB_LOCK();
  gl_cb_dispatching = NULL;
  idx = gl_cr_find(cb, h);
  if (idx >= 0) {
    gl_cr_count--;
    gl_cr_entries[idx] = gl_cr_entries[gl_cr_count];
    gl_cb_zero(&gl_cr_entries[gl_cr_count], (uint32_t)sizeof(gl_cr_entries[0]));
  }
  GL_CB_UNLOCK();
  gl_cb_report_dispatch(id, 1, 2);
  return 1;
}

/* Keeps one early result. Called with NO lock held. A full table drops the
 * newest and counts it; the table never grows. */
static void gl_cr_hold(uint64_t h, int32_t id, uint32_t failed, uint32_t cub,
                       const uint8_t *bytes, uint32_t now) {
  uint32_t i;
  int slot = -1;
  GL_CB_LOCK();
  for (i = 0; i < GL_CR_HELD_SLOTS; i++) {
    if (gl_cr_held[i].valid && gl_cr_held[i].h == h) { slot = (int)i; break; }
  }
  if (slot < 0) {
    for (i = 0; i < GL_CR_HELD_SLOTS; i++) {
      if (!gl_cr_held[i].valid) { slot = (int)i; break; }
    }
  }
  if (slot < 0 || cub > GL_CR_HELD_MAX_BYTES) {
    gl_cr_held_overflow++;
    GL_CB_UNLOCK();
    return;
  }
  if (!gl_cr_held[slot].valid) gl_cr_held_count++;
  gl_cb_zero(&gl_cr_held[slot], (uint32_t)sizeof(gl_cr_held[slot]));
  gl_cr_held[slot].valid = 1;
  gl_cr_held[slot].h = h;
  gl_cr_held[slot].id = id;
  gl_cr_held[slot].failed = failed;
  gl_cr_held[slot].cub = cub;
  gl_cr_held[slot].born_ms = now;
  memcpy(gl_cr_held[slot].bytes, bytes, cub);
  GL_CB_UNLOCK();
  gl_cb_report_dispatch(id, 0, 1);
}

/* Expires old held results (zeroing them) and retries the rest against the
 * current registrations. Called with NO lock held. */
static void gl_cr_retry_held(uint32_t now) {
  uint32_t i;
  for (i = 0; i < GL_CR_HELD_SLOTS; i++) {
    gl_cr_held_entry h;
    GL_CB_LOCK();
    if (!gl_cr_held[i].valid) {
      GL_CB_UNLOCK();
      continue;
    }
    if ((uint32_t)(now - gl_cr_held[i].born_ms) >= GL_CR_HELD_EXPIRY_MS) {
      gl_cb_zero(&gl_cr_held[i], (uint32_t)sizeof(gl_cr_held[i]));
      gl_cr_held_count--;
      gl_cr_held_expired++;
      GL_CB_UNLOCK();
      continue;
    }
    if (gl_cr_find_handle(gl_cr_held[i].h) < 0) {
      GL_CB_UNLOCK();
      continue;
    }
    h = gl_cr_held[i];
    GL_CB_UNLOCK();
    if (gl_cr_deliver(h.h, h.id, h.failed, h.bytes)) {
      GL_CB_LOCK();
      if (gl_cr_held[i].valid && gl_cr_held[i].h == h.h) {
        gl_cb_zero(&gl_cr_held[i], (uint32_t)sizeof(gl_cr_held[i]));
        gl_cr_held_count--;
      }
      GL_CB_UNLOCK();
    }
    gl_cb_zero(&h, (uint32_t)sizeof(h));
  }
}

/* Reads and validates one slot-11 reply. Called with NO lock held. Returns 1
 * for a valid result (outputs set; the body is at buf + 24), 0 for an empty or
 * malformed reply, -1 for a transport failure (counted for backoff). */
static int gl_cr_read_reply(uint8_t *buf, uint32_t now, uint64_t *h,
                            int32_t *id, uint32_t *failed, uint32_t *cub) {
  uint32_t len = 0;
  uint32_t count, size;
  int ok = gl_cb_transport_drain_cr(buf, GL_CR_DRAIN_RESP_MAX_BYTES, &len);
  if (!ok) {
    GL_CB_LOCK();
    gl_cr_fail_count++;
    gl_cr_last_fail_ms = now;
    GL_CB_UNLOCK();
    return -1;
  }
  GL_CB_LOCK();
  gl_cr_fail_count = 0;
  GL_CB_UNLOCK();
  if (len > GL_CR_DRAIN_RESP_MAX_BYTES || len < 4) return 0;
  memcpy(&count, buf, 4);
  if (count != 1) return 0;
  if (len < 24) return 0;
  memcpy(h, buf + 4, 8);
  memcpy(id, buf + 12, 4);
  memcpy(failed, buf + 16, 4);
  memcpy(cub, buf + 20, 4);
  size = gl_cr_size(*id);
  if (!size || *cub != size || *failed > 1) return 0;
  if (len != 24u + *cub) return 0;
  return 1;
}

#if !defined(__i386__)
/* ---- server-browser response relay (58-21, x64 only) ----
 * Request methods record {returned handle -> game response object} in a
 * bounded table (64). RunCallbacks / RunFrame / Sockets RunCallbacks drain
 * CONTROL slot 12 and call the game object's vtable slot for the event kind
 * outside every lock. The game's object pointer never leaves the shim. Event
 * strings and gameserveritem_t are copied into shim-owned buffers that outlive
 * the call. Embedder contract: gl_cb_transport_drain_mms (slot 12) and
 * gl_mms_transport(slot, req, reqLen, resp, cap, lenOut) (a request to the
 * SteamMatchMakingServers003 ordinal; 1 on a good reply, 0 on any failure). */
#define GL_MMS_MAP_CAP 64
#define GL_MMS_FILTER_MAX 32
#define GL_MMS_FILTER_BYTES 256
#define GL_MMS_GSI_SIZE ${CALLBACK_LAYOUTS.gameserveritem_t.x64.size}
#define GL_MMS_EV_HEADER 21
#define GL_MMS_STR_MAX 255
#define GL_MMS_DRAIN_RESP_MAX_BYTES (GL_MMS_EV_HEADER + GL_MMS_GSI_SIZE + 132)
#define GL_MMS_SLOT_DETAILS 7
#ifndef GL_MMS_ALLOC
#define GL_MMS_ALLOC(n) calloc(1, (n))
#define GL_MMS_FREE(p) free(p)
#endif
/* At most this many details buffers per request (live plus superseded),
 * ~392 bytes each: ~400 KB per request, ~25 MB worst case across all 64
 * mapped requests. Never grows past it. */
#define GL_MMS_DETAILS_CAP 1024
#define GL_MMS_CLS_LIST 0
#define GL_MMS_CLS_QUERY 1
#define GL_MMS_Q_PING 1
#define GL_MMS_Q_PLAYERS 2
#define GL_MMS_Q_RULES 3
#define GL_MMS_Q_FRIENDS 4

typedef struct gl_mms_det {
  struct gl_mms_det *next;
  int32_t iServer;
  uint8_t gsi[GL_MMS_GSI_SIZE];
} gl_mms_det;

typedef struct {
  int state; /* 0 free, 1 reserved by an in-flight request, 2 live */
  int cls;
  int qkind;
  uint32_t key;
  uint64_t h64;
  void *obj;
  gl_mms_det *det; /* newest first */
  uint32_t det_n;
} gl_mms_ent;

static gl_mms_ent gl_mms_tab[GL_MMS_MAP_CAP];
static uint32_t gl_mms_count;
static int gl_mms_draining;
static uint32_t gl_mms_fail_count;
static uint32_t gl_mms_last_fail_ms;
static uint32_t gl_mms_dropped;
static gl_mms_ent *gl_mms_busy;
static uint32_t gl_mms_busy_tid;

/* Frees a detached details chain. NULL-safe; call with NO lock held. */
static void gl_mms_det_free_chain(gl_mms_det *d) {
  while (d != NULL) {
    gl_mms_det *n = d->next;
    GL_MMS_FREE(d);
    d = n;
  }
}

/* Returns a reserved slot index, or -1 when the table is full. Only state-0
 * slots are zeroed here; by the free-at-every-zero-site invariant they never
 * own a details chain. */
static int gl_mms_reserve(void) {
  uint32_t i;
  int r = -1;
  GL_CB_LOCK();
  for (i = 0; i < GL_MMS_MAP_CAP; i++) {
    if (gl_mms_tab[i].state == 0) {
      gl_cb_zero(&gl_mms_tab[i], (uint32_t)sizeof(gl_mms_tab[i]));
      gl_mms_tab[i].state = 1;
      r = (int)i;
      break;
    }
  }
  GL_CB_UNLOCK();
  return r;
}

static void gl_mms_abort(int idx) {
  gl_mms_det *chain;
  GL_CB_LOCK();
  chain = gl_mms_tab[idx].det;
  gl_cb_zero(&gl_mms_tab[idx], (uint32_t)sizeof(gl_mms_tab[idx]));
  GL_CB_UNLOCK();
  gl_mms_det_free_chain(chain);
}

/* Caller holds the lock. */
static int gl_mms_find_locked(int cls, uint32_t key) {
  uint32_t i;
  for (i = 0; i < GL_MMS_MAP_CAP; i++) {
    if (gl_mms_tab[i].state == 2 && gl_mms_tab[i].cls == cls && gl_mms_tab[i].key == key) return (int)i;
  }
  return -1;
}

static void gl_mms_commit(int idx, int cls, int qkind, uint32_t key, uint64_t h64, void *obj) {
  int dup;
  gl_mms_det *chain = NULL, *chain2;
  GL_CB_LOCK();
  dup = gl_mms_find_locked(cls, key);
  chain2 = gl_mms_tab[idx].det;
  if (dup >= 0) {
    /* the same handle issued again: the newest response object wins, and the
     * old request's server indices are stale so its buffers are dropped */
    chain = gl_mms_tab[dup].det;
    gl_mms_tab[dup].det = NULL;
    gl_mms_tab[dup].det_n = 0;
    gl_mms_tab[dup].obj = obj;
    gl_mms_tab[dup].h64 = h64;
    gl_mms_tab[dup].qkind = qkind;
    gl_cb_zero(&gl_mms_tab[idx], (uint32_t)sizeof(gl_mms_tab[idx]));
  } else {
    gl_mms_tab[idx].state = 2;
    gl_mms_tab[idx].cls = cls;
    gl_mms_tab[idx].qkind = qkind;
    gl_mms_tab[idx].key = key;
    gl_mms_tab[idx].h64 = h64;
    gl_mms_tab[idx].obj = obj;
    gl_mms_count++;
    chain2 = NULL;
  }
  GL_CB_UNLOCK();
  gl_mms_det_free_chain(chain);
  gl_mms_det_free_chain(chain2);
}

/* ReleaseRequest / CancelServerQuery: drops the mapping and frees every
 * details buffer it handed out. Waits while another thread is delivering to this very object; a
 * handler unmapping itself never waits. */
static void gl_mms_unmap(int cls, uint32_t key) {
  gl_mms_det *chain = NULL;
  GL_CB_LOCK();
  for (;;) {
    int f = gl_mms_find_locked(cls, key);
    if (f < 0) break;
    if (gl_mms_busy == &gl_mms_tab[f] && gl_mms_busy_tid != GL_CB_THREAD_ID()) {
      GL_CB_UNLOCK();
      GL_CB_YIELD();
      GL_CB_LOCK();
      continue;
    }
    chain = gl_mms_tab[f].det;
    gl_cb_zero(&gl_mms_tab[f], (uint32_t)sizeof(gl_mms_tab[f]));
    gl_mms_count--;
    break;
  }
  GL_CB_UNLOCK();
  gl_mms_det_free_chain(chain);
}

/* Request*ServerList. variant 0..5 = Internet, LAN, Friends, Favorites,
 * History, Spectator (also the helper slot). Returns the Mac handle, or 0 (a
 * failed request) when the arguments are bad, the table is full or the helper
 * refused. */
static uint64_t gl_mms_request_list(uint32_t variant, uint32_t appId, const void *ppchFilters,
                                    uint32_t nFilters, void *obj) {
  uint8_t req[12 + GL_MMS_FILTER_MAX * 2 * GL_MMS_FILTER_BYTES];
  uint8_t resp[16];
  const uint8_t *flt = NULL;
  uint32_t reqLen, rlen = 0, i, j;
  uint64_t h = 0;
  int idx, ok;
  if (obj == NULL || variant > 5 || nFilters > GL_MMS_FILTER_MAX) return 0;
  if (variant == 1) nFilters = 0;
  if (nFilters != 0) {
    if (ppchFilters == NULL) return 0;
    flt = *(const uint8_t *const *)ppchFilters;
    if (flt == NULL) return 0;
  }
  idx = gl_mms_reserve();
  if (idx < 0) return 0;
  reqLen = 12u + nFilters * 2u * GL_MMS_FILTER_BYTES;
  memset(req, 0, sizeof req);
  memcpy(req, &variant, 4);
  memcpy(req + 4, &appId, 4);
  memcpy(req + 8, &nFilters, 4);
  for (i = 0; i < nFilters * 2u; i++) {
    const uint8_t *src = flt + (size_t)i * GL_MMS_FILTER_BYTES;
    uint8_t *dst = req + 12 + (size_t)i * GL_MMS_FILTER_BYTES;
    for (j = 0; j < GL_MMS_FILTER_BYTES - 1 && src[j] != 0; j++) dst[j] = src[j];
  }
  ok = gl_mms_transport((uint16_t)variant, req, reqLen, resp, (uint32_t)sizeof resp, &rlen);
  gl_cb_zero(req, (uint32_t)sizeof req);
  if (ok && rlen == 8) memcpy(&h, resp, 8);
  if (!ok || rlen != 8 || h == 0) {
    gl_mms_abort(idx);
    return 0;
  }
  gl_mms_commit(idx, GL_MMS_CLS_LIST, 0, (uint32_t)h, h, obj);
  return h;
}

/* PingServer / PlayerDetails / ServerRules / ServerFriends. Returns the
 * HServerQuery, or -1 (invalid). */
static int32_t gl_mms_query(uint16_t slot, int qkind, uint32_t ip, uint32_t port, void *obj) {
  uint8_t req[8];
  uint8_t resp[8];
  uint32_t rlen = 0;
  int32_t q = -1;
  int idx, ok;
  if (obj == NULL || port > 65535u) return -1;
  idx = gl_mms_reserve();
  if (idx < 0) return -1;
  memcpy(req, &ip, 4);
  memcpy(req + 4, &port, 4);
  ok = gl_mms_transport(slot, req, 8, resp, (uint32_t)sizeof resp, &rlen);
  if (ok && rlen == 4) memcpy(&q, resp, 4);
  if (!ok || rlen != 4 || q == -1) {
    gl_mms_abort(idx);
    return -1;
  }
  gl_mms_commit(idx, GL_MMS_CLS_QUERY, qkind, (uint32_t)q, (uint64_t)(uint32_t)q, obj);
  return q;
}

/* GetServerDetails: a stable pointer per (request, iServer), never rewritten
 * after return, valid until ReleaseRequest (or the handle being reissued);
 * NULL when absent, the index is negative, the cap is reached for a new
 * index, or allocation fails.
 * Design: one singly linked list per request, newest node first; the first
 * node whose iServer matches is the current one. Each index gets its own node
 * (no aliasing) and a returned node is never written again. When a later
 * fetch of the same index brings different bytes (e.g. after RefreshServer) a
 * new node is prepended; the old one stays, shadowed, so a pointer the game
 * still holds stays valid and unchanged. */
static void *gl_mms_get_server_details(uint64_t hRequest, int32_t iServer) {
  uint8_t req[12];
  uint8_t resp[4 + GL_MMS_GSI_SIZE];
  uint32_t rlen = 0, present;
  void *out = NULL;
  int f, ok;
  if (iServer < 0) return NULL;
  GL_CB_LOCK();
  f = gl_mms_find_locked(GL_MMS_CLS_LIST, (uint32_t)hRequest);
  if (f >= 0 && gl_mms_tab[f].h64 != hRequest) f = -1;
  GL_CB_UNLOCK();
  if (f < 0) return NULL;
  memcpy(req, &hRequest, 8);
  memcpy(req + 8, &iServer, 4);
  ok = gl_mms_transport(GL_MMS_SLOT_DETAILS, req, 12, resp, (uint32_t)sizeof resp, &rlen);
  if (ok && rlen == sizeof resp) {
    memcpy(&present, resp, 4);
    if (present == 1) {
      gl_mms_det *cand = (gl_mms_det *)GL_MMS_ALLOC(sizeof(gl_mms_det));
      if (cand != NULL) {
        cand->iServer = iServer;
        memcpy(cand->gsi, resp + 4, GL_MMS_GSI_SIZE);
      }
      GL_CB_LOCK();
      f = gl_mms_find_locked(GL_MMS_CLS_LIST, (uint32_t)hRequest);
      if (f >= 0 && gl_mms_tab[f].h64 == hRequest) {
        gl_mms_det *cur = gl_mms_tab[f].det;
        while (cur != NULL && cur->iServer != iServer) cur = cur->next;
        if (cur != NULL && memcmp(cur->gsi, resp + 4, GL_MMS_GSI_SIZE) == 0) {
          out = cur->gsi;
        } else if (cand == NULL) {
          out = NULL;
        } else if (gl_mms_tab[f].det_n >= GL_MMS_DETAILS_CAP) {
          out = cur != NULL ? (void *)cur->gsi : NULL;
        } else {
          cand->next = gl_mms_tab[f].det;
          gl_mms_tab[f].det = cand;
          gl_mms_tab[f].det_n++;
          out = cand->gsi;
          cand = NULL;
        }
      }
      GL_CB_UNLOCK();
      if (cand != NULL) GL_MMS_FREE(cand);
    }
  }
  gl_cb_zero(resp, (uint32_t)sizeof resp);
  return out;
}

typedef void (THISCALL *gl_mms_fn_self)(void *);
typedef void (THISCALL *gl_mms_fn_hi)(void *, uint64_t, int32_t);
typedef void (THISCALL *gl_mms_fn_item)(void *, const void *);
typedef void (THISCALL *gl_mms_fn_player)(void *, const char *, int32_t, float);
typedef void (THISCALL *gl_mms_fn_rule)(void *, const char *, const char *);

/* Bounded length of a string inside a payload (stops at NUL or cub). */
static uint32_t gl_mms_strlen(const uint8_t *p, uint32_t cap) {
  uint32_t n = 0;
  while (n < cap && p[n] != 0) n++;
  return n;
}

/* Delivers one validated event. Called with NO lock held. Event kinds are in
 * the 58-20 table. Returns 1 when a game slot was called. */
static int gl_mms_deliver(uint8_t kind, uint32_t hreq, int32_t iServer, int32_t value,
                          const uint8_t *pay, uint32_t cub) {
  int cls = kind <= 3 ? GL_MMS_CLS_LIST : GL_MMS_CLS_QUERY;
  int want = kind <= 3 ? 0 : kind <= 5 ? GL_MMS_Q_PING : kind <= 8 ? GL_MMS_Q_PLAYERS
                                       : kind <= 11 ? GL_MMS_Q_RULES : GL_MMS_Q_FRIENDS;
  int terminal = kind == 4 || kind == 5 || kind == 7 || kind == 8 || kind == 10 || kind == 11 ||
                 kind == 12;
  void *obj;
  void **vt;
  uint64_t h64;
  gl_mms_ent *e;
  gl_mms_det *retire_chain = NULL;
  int f, called = 0;
  char s1[GL_MMS_STR_MAX + 1], s2[GL_MMS_STR_MAX + 1];
  uint8_t item[GL_MMS_GSI_SIZE];
  uint32_t l1 = 0, l2 = 0;

  /* Strings and items are copied to shim-owned buffers before any lookup. */
  if (kind == 4) memcpy(item, pay, GL_MMS_GSI_SIZE);
  if (kind == 6) {
    l1 = gl_mms_strlen(pay, cub);
    if (l1 > GL_MMS_STR_MAX) return 0;
    memcpy(s1, pay, l1);
    s1[l1] = 0;
  }
  if (kind == 9) {
    l1 = gl_mms_strlen(pay, cub);
    if (l1 >= cub || l1 > GL_MMS_STR_MAX) return 0;
    l2 = gl_mms_strlen(pay + l1 + 1, cub - l1 - 1);
    if (l2 > GL_MMS_STR_MAX) return 0;
    memcpy(s1, pay, l1);
    s1[l1] = 0;
    memcpy(s2, pay + l1 + 1, l2);
    s2[l2] = 0;
  }

  GL_CB_LOCK();
  f = gl_mms_find_locked(cls, hreq);
  if (f >= 0 && cls == GL_MMS_CLS_QUERY && gl_mms_tab[f].qkind != want) f = -1;
  if (f < 0) {
    gl_mms_dropped++;
    GL_CB_UNLOCK();
    gl_cb_zero(item, (uint32_t)sizeof item);
    return 0;
  }
  e = &gl_mms_tab[f];
  obj = e->obj;
  h64 = e->h64;
  gl_mms_busy = e;
  gl_mms_busy_tid = GL_CB_THREAD_ID();
  GL_CB_UNLOCK();

  vt = obj != NULL ? *(void ***)obj : NULL;
  if (vt != NULL) {
    switch (kind) {
      case 1: ((gl_mms_fn_hi)vt[0])(obj, h64, iServer); called = 1; break;
      case 2: ((gl_mms_fn_hi)vt[1])(obj, h64, iServer); called = 1; break;
      case 3: ((gl_mms_fn_hi)vt[2])(obj, h64, value); called = 1; break;
      case 4: ((gl_mms_fn_item)vt[0])(obj, item); called = 1; break;
      case 5: ((gl_mms_fn_self)vt[1])(obj); called = 1; break;
      case 6: {
        float t;
        memcpy(&t, &iServer, 4);
        ((gl_mms_fn_player)vt[0])(obj, s1, value, t);
        called = 1;
        break;
      }
      case 7: ((gl_mms_fn_self)vt[1])(obj); called = 1; break;
      case 8: ((gl_mms_fn_self)vt[2])(obj); called = 1; break;
      case 9: ((gl_mms_fn_rule)vt[0])(obj, s1, s2); called = 1; break;
      case 10: ((gl_mms_fn_self)vt[1])(obj); called = 1; break;
      case 11: ((gl_mms_fn_self)vt[2])(obj); called = 1; break;
      /* kind 12: the ServerFriends callback shape is unmeasured, so calling a
       * game slot with guessed arguments is unsafe; the event only retires the
       * query. */
      default: break;
    }
  }

  GL_CB_LOCK();
  gl_mms_busy = NULL;
  if (terminal && e->state == 2 && e->cls == cls && e->key == hreq && e->obj == obj) {
    retire_chain = e->det;
    gl_cb_zero(e, (uint32_t)sizeof(*e));
    gl_mms_count--;
  }
  GL_CB_UNLOCK();
  gl_mms_det_free_chain(retire_chain);
  gl_cb_zero(item, (uint32_t)sizeof item);
  gl_cb_zero(s1, (uint32_t)sizeof s1);
  gl_cb_zero(s2, (uint32_t)sizeof s2);
  return called;
}

/* Reads and validates one slot-12 reply. Called with NO lock held. Returns 1
 * for a valid event (outputs set; the payload is at buf + 21), 0 for an empty
 * or malformed reply, -1 for a transport failure (counted for backoff). */
static int gl_mms_read_reply(uint8_t *buf, uint32_t now, uint8_t *kind, uint32_t *hreq,
                             int32_t *iServer, int32_t *value, uint32_t *cub) {
  uint32_t len = 0, count;
  int ok = gl_cb_transport_drain_mms(buf, GL_MMS_DRAIN_RESP_MAX_BYTES, &len);
  if (!ok) {
    GL_CB_LOCK();
    gl_mms_fail_count++;
    gl_mms_last_fail_ms = now;
    GL_CB_UNLOCK();
    return -1;
  }
  GL_CB_LOCK();
  gl_mms_fail_count = 0;
  GL_CB_UNLOCK();
  if (len > GL_MMS_DRAIN_RESP_MAX_BYTES || len < 4) return 0;
  memcpy(&count, buf, 4);
  if (count != 1 || len < GL_MMS_EV_HEADER) return 0;
  *kind = buf[4];
  memcpy(hreq, buf + 5, 4);
  memcpy(iServer, buf + 9, 4);
  memcpy(value, buf + 13, 4);
  memcpy(cub, buf + 17, 4);
  if (*kind < 1 || *kind > 12) return 0;
  if (len != GL_MMS_EV_HEADER + *cub) return 0;
  switch (*kind) {
    case 4: if (*cub != GL_MMS_GSI_SIZE) return 0; break;
    case 6: if (*cub < 1 || *cub > GL_MMS_STR_MAX + 1) return 0; break;
    case 9: if (*cub < 2 || *cub > 2 * (GL_MMS_STR_MAX + 1)) return 0; break;
    default: if (*cub != 0) return 0; break;
  }
  return 1;
}

/* Drains slot 12 (at most GL_CB_DRAIN_MAX_PER_RUN events) and delivers them.
 * The caller has already applied the shared 30 ms floor; this adds the slot's
 * own failure backoff. Called with NO lock held. */
static void gl_mms_drain(uint32_t now) {
  uint8_t buf[GL_MMS_DRAIN_RESP_MAX_BYTES];
  uint32_t iter;
  int skip;
  GL_CB_LOCK();
  skip = gl_mms_draining || gl_mms_count == 0 ||
         (gl_mms_fail_count >= GL_CB_DRAIN_FAIL_BACKOFF_AFTER &&
          (uint32_t)(now - gl_mms_last_fail_ms) < GL_CB_DRAIN_BACKOFF_MS);
  if (!skip) gl_mms_draining = 1;
  GL_CB_UNLOCK();
  if (skip) return;
  for (iter = 0; iter < GL_CB_DRAIN_MAX_PER_RUN; iter++) {
    uint8_t kind = 0;
    uint32_t hreq = 0, cub = 0;
    int32_t iServer = 0, value = 0;
    int r = gl_mms_read_reply(buf, now, &kind, &hreq, &iServer, &value, &cub);
    if (r > 0) gl_mms_deliver(kind, hreq, iServer, value, buf + GL_MMS_EV_HEADER, cub);
    gl_cb_zero(buf, GL_MMS_DRAIN_RESP_MAX_BYTES);
    if (r <= 0) break;
  }
  GL_CB_LOCK();
  gl_mms_draining = 0;
  GL_CB_UNLOCK();
}
#define GL_MMS_ACTIVE() (gl_mms_count != 0)
#define GL_MMS_DRAIN(now) gl_mms_drain(now)
#else
#define GL_MMS_ACTIVE() 0
#define GL_MMS_DRAIN(now) ((void)(now))
#endif

/* ---- results table and manual dispatch (58-11) ----
 * The results table (16 entries, 10 s expiry, zeroed) serves GetAPICallResult
 * and ISteamUtils polling on both DLLs. The message FIFO (32) and every
 * ManualDispatch entry point exist for the 64-bit DLL only (D-11). All table
 * and FIFO mutation is under GL_CB_LOCK; the transport and the report hook
 * are never called with it held. */
#define GL_MD_RES_CAP 16
#define GL_MD_FIFO_CAP 32
#define GL_MD_PARAM_MAX (GL_CB_DRAIN_RESP_MAX_BYTES - 12)

typedef struct {
  int valid;
  uint64_t h;
  int32_t id;
  uint32_t failed;
  uint32_t cub;
  uint32_t t_ms;
  uint8_t bytes[GL_CR_HELD_MAX_BYTES];
} gl_md_res;

static gl_md_res gl_md_results[GL_MD_RES_CAP];
static int gl_md_enabled;
static uint32_t gl_md_res_dropped;
static int gl_md_poll_have;
static uint32_t gl_md_poll_last_ms;

#if !defined(__i386__)
typedef struct {
  int32_t id;
  uint32_t cub;
  uint8_t bytes[GL_MD_PARAM_MAX];
} gl_md_msg;

static gl_md_msg gl_md_fifo[GL_MD_FIFO_CAP];
static uint32_t gl_md_head;
static uint32_t gl_md_count;
static int gl_md_front_out;
static int gl_md_front_reported;
static uint32_t gl_md_dropped;
static int gl_md_running;
static int gl_md_have_run;
static uint32_t gl_md_last_run_ms;

/* Caller holds the lock. Returns 0 queued, 1 queued after evicting the oldest
 * (its id in *dropped_id), 2 the new message was dropped (the oldest is in the
 * game's hands and cannot move). */
static int gl_md_push_locked(int32_t id, const uint8_t *bytes, uint32_t cub,
                             int32_t *dropped_id) {
  int r = 0;
  uint32_t tail;
  if (cub > GL_MD_PARAM_MAX) return 2;
  if (gl_md_count >= GL_MD_FIFO_CAP) {
    gl_md_dropped++;
    if (gl_md_front_out) {
      *dropped_id = id;
      return 2;
    }
    *dropped_id = gl_md_fifo[gl_md_head].id;
    gl_cb_zero(&gl_md_fifo[gl_md_head], (uint32_t)sizeof(gl_md_fifo[0]));
    gl_md_head = (gl_md_head + 1) % GL_MD_FIFO_CAP;
    gl_md_count--;
    gl_md_front_reported = 0;
    r = 1;
  }
  tail = (gl_md_head + gl_md_count) % GL_MD_FIFO_CAP;
  gl_cb_zero(&gl_md_fifo[tail], (uint32_t)sizeof(gl_md_fifo[0]));
  gl_md_fifo[tail].id = id;
  gl_md_fifo[tail].cub = cub;
  memcpy(gl_md_fifo[tail].bytes, bytes, cub);
  gl_md_count++;
  return r;
}
#endif

/* Stores a completed result. In manual-dispatch mode it also queues the
 * synthesized SteamAPICallCompleted_t (703). Called with NO lock held. */
static void gl_md_store_result(uint64_t h, int32_t id, uint32_t failed,
                               uint32_t cub, const uint8_t *bytes,
                               uint32_t now) {
  uint32_t i;
  int slot = -1;
  int evicted = 0;
  int32_t evicted_id = 0;
  int dropped = 0;
  int32_t dropped_id = 0;
  if (cub > GL_CR_HELD_MAX_BYTES) return;
  GL_CB_LOCK();
  for (i = 0; i < GL_MD_RES_CAP; i++) {
    if (gl_md_results[i].valid && gl_md_results[i].h == h) { slot = (int)i; break; }
  }
  if (slot < 0) {
    for (i = 0; i < GL_MD_RES_CAP; i++) {
      if (!gl_md_results[i].valid) { slot = (int)i; break; }
    }
  }
  if (slot < 0) {
    uint32_t oldest = 0;
    slot = 0;
    for (i = 0; i < GL_MD_RES_CAP; i++) {
      uint32_t age = (uint32_t)(now - gl_md_results[i].t_ms);
      if (age >= oldest) { oldest = age; slot = (int)i; }
    }
    evicted = 1;
    evicted_id = gl_md_results[slot].id;
    gl_md_res_dropped++;
  }
  gl_cb_zero(&gl_md_results[slot], (uint32_t)sizeof(gl_md_results[slot]));
  gl_md_results[slot].valid = 1;
  gl_md_results[slot].h = h;
  gl_md_results[slot].id = id;
  gl_md_results[slot].failed = failed;
  gl_md_results[slot].cub = cub;
  gl_md_results[slot].t_ms = now;
  memcpy(gl_md_results[slot].bytes, bytes, cub);
#if !defined(__i386__)
  if (gl_md_enabled) {
    uint8_t ann[${CALLBACK_LAYOUTS.SteamAPICallCompleted_t.x64.size}];
    int pr;
    int32_t icb = id;
    uint32_t cp = cub;
    memset(ann, 0, sizeof(ann));
    memcpy(ann + ${CALLBACK_LAYOUTS.SteamAPICallCompleted_t.x64.fields.m_hAsyncCall}, &h, 8);
    memcpy(ann + ${CALLBACK_LAYOUTS.SteamAPICallCompleted_t.x64.fields.m_iCallback}, &icb, 4);
    memcpy(ann + ${CALLBACK_LAYOUTS.SteamAPICallCompleted_t.x64.fields.m_cubParam}, &cp, 4);
    pr = gl_md_push_locked(${CALLBACK_LAYOUTS.SteamAPICallCompleted_t.id}, ann, (uint32_t)sizeof(ann), &dropped_id);
    dropped = pr != 0;
  }
#endif
  GL_CB_UNLOCK();
  (void)dropped;
  (void)dropped_id;
  if (evicted) gl_cb_report_dispatch(evicted_id, 0, 0);
#if !defined(__i386__)
  if (dropped) gl_cb_report_dispatch(dropped_id, 0, 0);
#endif
}

/* Expires old results, zeroing them. In manual-dispatch mode each expiry is
 * reported (id, 0, 0). Called with NO lock held. */
static void gl_md_expire(uint32_t now) {
  int32_t ids[GL_MD_RES_CAP];
  uint32_t n = 0, i;
  int rep;
  GL_CB_LOCK();
  for (i = 0; i < GL_MD_RES_CAP; i++) {
    if (gl_md_results[i].valid &&
        (uint32_t)(now - gl_md_results[i].t_ms) >= GL_CR_HELD_EXPIRY_MS) {
      ids[n++] = gl_md_results[i].id;
      gl_cb_zero(&gl_md_results[i], (uint32_t)sizeof(gl_md_results[i]));
    }
  }
  rep = gl_md_enabled;
  GL_CB_UNLOCK();
  if (rep) {
    for (i = 0; i < n; i++) gl_cb_report_dispatch(ids[i], 0, 0);
  }
}

/* Routes one validated slot-11 result: a result whose CCallResult is already
 * registered goes to the held table (the next RunCallbacks delivers it on the
 * game's own thread); anything else lands in the results table. */
static void gl_md_route_result(uint64_t h, int32_t id, uint32_t failed,
                               uint32_t cub, const uint8_t *bytes,
                               uint32_t now) {
  int paired;
  GL_CB_LOCK();
  paired = gl_cr_find_handle(h) >= 0;
  GL_CB_UNLOCK();
  if (paired) gl_cr_hold(h, id, failed, cub, bytes, now);
  else gl_md_store_result(h, id, failed, cub, bytes, now);
}

/* Polling games (no manual dispatch, no CCallResult): pulls pending results
 * on demand, at most once per drain interval, honouring the slot-11 backoff.
 * Called with NO lock held. */
static void gl_md_poll(uint32_t now) {
  uint8_t buf[GL_CR_DRAIN_RESP_MAX_BYTES];
  uint32_t iter;
  int skip;
  GL_CB_LOCK();
  skip = (gl_md_poll_have &&
          (uint32_t)(now - gl_md_poll_last_ms) < GL_CB_DRAIN_MIN_INTERVAL_MS) ||
         (gl_cr_fail_count >= GL_CB_DRAIN_FAIL_BACKOFF_AFTER &&
          (uint32_t)(now - gl_cr_last_fail_ms) < GL_CB_DRAIN_BACKOFF_MS);
  if (!skip) {
    gl_md_poll_have = 1;
    gl_md_poll_last_ms = now;
  }
  GL_CB_UNLOCK();
  if (skip) return;
  for (iter = 0; iter < GL_CB_DRAIN_MAX_PER_RUN; iter++) {
    uint64_t h;
    int32_t id;
    uint32_t failed, cub;
    int r = gl_cr_read_reply(buf, now, &h, &id, &failed, &cub);
    if (r > 0) gl_md_route_result(h, id, failed, cub, buf + 24, now);
    gl_cb_zero(buf, GL_CR_DRAIN_RESP_MAX_BYTES);
    if (r <= 0) break;
  }
}

/* ISteamUtils::IsAPICallCompleted (shimLocal). */
static int gl_md_is_api_call_completed(uint64_t h, uint8_t *pbFailed) {
  uint32_t i;
  int found = 0;
  uint32_t now = gl_cb_now_ms();
  gl_md_expire(now);
  if (!gl_md_enabled) gl_md_poll(now);
  GL_CB_LOCK();
  for (i = 0; i < GL_MD_RES_CAP; i++) {
    if (gl_md_results[i].valid && gl_md_results[i].h == h) {
      found = 1;
      if (pbFailed) *pbFailed = gl_md_results[i].failed ? 1 : 0;
      break;
    }
  }
  GL_CB_UNLOCK();
  return found;
}

/* GetAPICallResult for the flat ManualDispatch export and ISteamUtils. Copies
 * only when the id and size match exactly; the entry is removed on success. */
static int gl_md_get_api_call_result(uint64_t h, void *out, int cub,
                                     int iExpected, uint8_t *pbFailed) {
  uint32_t i;
  int ok = 0;
  uint32_t now = gl_cb_now_ms();
  gl_md_expire(now);
  if (!gl_md_enabled) gl_md_poll(now);
  if (!out || cub < 0) return 0;
  GL_CB_LOCK();
  for (i = 0; i < GL_MD_RES_CAP; i++) {
    if (gl_md_results[i].valid && gl_md_results[i].h == h) {
      if (gl_md_results[i].id == (int32_t)iExpected &&
          gl_md_results[i].cub == (uint32_t)cub) {
        memcpy(out, gl_md_results[i].bytes, gl_md_results[i].cub);
        if (pbFailed) *pbFailed = gl_md_results[i].failed ? 1 : 0;
        gl_cb_zero(&gl_md_results[i], (uint32_t)sizeof(gl_md_results[i]));
        ok = 1;
      }
      break;
    }
  }
  GL_CB_UNLOCK();
  /* quick 261031-ixa: kind 2 = call result delivered; never under the lock. */
  if (ok) gl_cb_report_dispatch((int32_t)iExpected, 1, 2);
  return ok;
}

#if !defined(__i386__)
static void gl_md_init(void) {
  GL_CB_LOCK();
  gl_md_enabled = 1;
  if (!gl_cbreg_md_done) gl_cbreg_md_pending = 1;
  GL_CB_UNLOCK();
}

/* Pulls slot 6 and slot 11 into the FIFO / results table. At most one pull
 * pass per call, under the shared 30 ms floor and the slot backoffs. */
static void gl_md_run_frame(void) {
  uint8_t buf[GL_CR_DRAIN_RESP_MAX_BYTES];
  uint32_t now, iter, interval;
  int crskip;
  gl_cbreg_flush();
  GL_CB_LOCK();
  if (!gl_md_enabled || gl_md_running) {
    GL_CB_UNLOCK();
    return;
  }
  now = gl_cb_now_ms();
  interval = gl_cb_fail_count >= GL_CB_DRAIN_FAIL_BACKOFF_AFTER
                 ? GL_CB_DRAIN_BACKOFF_MS
                 : GL_CB_DRAIN_MIN_INTERVAL_MS;
  if (gl_md_have_run && (uint32_t)(now - gl_md_last_run_ms) < interval) {
    GL_CB_UNLOCK();
    return;
  }
  gl_md_have_run = 1;
  gl_md_last_run_ms = now;
  gl_md_running = 1;
  GL_CB_UNLOCK();

  gl_md_expire(now);

  for (iter = 0; iter < GL_CB_DRAIN_MAX_PER_RUN; iter++) {
    uint32_t len = 0;
    uint32_t count, cub, size;
    int32_t id;
    int pr;
    int32_t dropped_id = 0;
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
    if (len > GL_CB_DRAIN_RESP_MAX_BYTES || len < 12) break;
    memcpy(&count, buf, 4);
    if (count != 1) break;
    memcpy(&id, buf + 4, 4);
    memcpy(&cub, buf + 8, 4);
    size = gl_cb_relay_size(id);
    if (!size || cub != size) break;
    if (len != 12u + cub) break;
    /* 58-14: a stored function pointer consumes it instead of the FIFO. */
    if (GL_NET_CB_INTERCEPT(id, buf + 12)) {
      gl_cb_report_dispatch(id, 1, 0);
      continue;
    }
    GL_CB_LOCK();
    pr = gl_md_push_locked(id, buf + 12, cub, &dropped_id);
    GL_CB_UNLOCK();
    if (pr != 0) gl_cb_report_dispatch(dropped_id, 0, 0);
  }
  gl_cb_zero(buf, GL_CR_DRAIN_RESP_MAX_BYTES);

  GL_CB_LOCK();
  crskip = gl_cr_fail_count >= GL_CB_DRAIN_FAIL_BACKOFF_AFTER &&
           (uint32_t)(now - gl_cr_last_fail_ms) < GL_CB_DRAIN_BACKOFF_MS;
  GL_CB_UNLOCK();
  for (iter = 0; !crskip && iter < GL_CB_DRAIN_MAX_PER_RUN; iter++) {
    uint64_t h;
    int32_t id;
    uint32_t failed, cub;
    int r = gl_cr_read_reply(buf, now, &h, &id, &failed, &cub);
    if (r > 0) gl_md_store_result(h, id, failed, cub, buf + 24, now);
    gl_cb_zero(buf, GL_CR_DRAIN_RESP_MAX_BYTES);
    if (r <= 0) break;
  }

  /* 58-21: server-browser events (slot 12). */
  GL_MMS_DRAIN(now);

  GL_CB_LOCK();
  gl_md_running = 0;
  GL_CB_UNLOCK();
}

/* Fills a CallbackMsg_t for the front message (x64 layout, measured). The
 * parameter pointer is shim-owned and valid until gl_md_free_last. */
static int gl_md_get_next(void *out) {
  int32_t id = 0;
  int report = 0;
  int32_t user = 1;
  uint8_t *o = (uint8_t *)out;
  if (!o) return 0;
  GL_CB_LOCK();
  if (!gl_md_enabled || gl_md_count == 0) {
    GL_CB_UNLOCK();
    return 0;
  }
  {
    gl_md_msg *m = &gl_md_fifo[gl_md_head];
    void *pub = m->bytes;
    int32_t cubp = (int32_t)m->cub;
    memset(o, 0, ${CALLBACK_LAYOUTS.CallbackMsg_t.x64.size});
    memcpy(o + ${CALLBACK_LAYOUTS.CallbackMsg_t.x64.fields.m_hSteamUser}, &user, 4);
    memcpy(o + ${CALLBACK_LAYOUTS.CallbackMsg_t.x64.fields.m_iCallback}, &m->id, 4);
    memcpy(o + ${CALLBACK_LAYOUTS.CallbackMsg_t.x64.fields.m_pubParam}, &pub, sizeof(pub));
    memcpy(o + ${CALLBACK_LAYOUTS.CallbackMsg_t.x64.fields.m_cubParam}, &cubp, 4);
    id = m->id;
  }
  gl_md_front_out = 1;
  if (!gl_md_front_reported) {
    gl_md_front_reported = 1;
    report = 1;
  }
  GL_CB_UNLOCK();
  if (report) gl_cb_report_dispatch(id, 1, 0);
  return 1;
}

static void gl_md_free_last(void) {
  GL_CB_LOCK();
  if (gl_md_front_out && gl_md_count > 0) {
    gl_cb_zero(&gl_md_fifo[gl_md_head], (uint32_t)sizeof(gl_md_fifo[0]));
    gl_md_head = (gl_md_head + 1) % GL_MD_FIFO_CAP;
    gl_md_count--;
  }
  gl_md_front_out = 0;
  gl_md_front_reported = 0;
  GL_CB_UNLOCK();
}
#endif

/* One slot-11 pull for RunCallbacks. Called with NO lock held. Returns 1 to
 * keep draining. */
static int gl_cr_pull_one(uint8_t *buf, uint32_t now) {
  uint64_t h;
  int32_t id;
  uint32_t failed, cub;
  int r = gl_cr_read_reply(buf, now, &h, &id, &failed, &cub);
  if (r <= 0) return 0;
  if (!gl_cr_deliver(h, id, failed, buf + 24)) {
    gl_cr_hold(h, id, failed, cub, buf + 24, now);
    /* a polling game can still read it with GetAPICallResult */
    gl_md_store_result(h, id, failed, cub, buf + 24, now);
  }
  return 1;
}

/* Empties the table only; never touches game object memory. */
static void gl_cb_clear_all(void) {
  GL_CB_LOCK();
  gl_cb_count = 0;
  gl_cb_relay_count = 0;
  gl_cr_count = 0;
  gl_cb_zero(gl_cr_held, (uint32_t)sizeof(gl_cr_held));
  gl_cr_held_count = 0;
#if !defined(__i386__)
  gl_cb_zero(gl_mms_tab, (uint32_t)sizeof(gl_mms_tab));
  gl_mms_count = 0;
#endif
  GL_CB_UNLOCK();
}

/* Called with NO lock held. */
static void gl_cb_dispatch_one(void *cb, void *param) {
  void **vtbl = *(void ***)cb;
  ((gl_cb_run1_fn)vtbl[GL_CB_VSLOT_RUN_1ARG])(cb, param);
}

/* Resolves the live non-gameserver targets for id and dispatches param to each
 * (quick k51: shared by the drain loop and the held retry). Called with NO
 * lock held; the lock is never held across a Run call. Returns the number of
 * targets dispatched. */
static uint32_t gl_cb_deliver(int32_t id, void *param) {
  void *targets[GL_CB_REGISTRY_CAPACITY];
  uint32_t ntargets = 0;
  uint32_t ndispatched = 0;
  uint32_t i;

  /* 58-14: a stored function pointer (no lock held) consumes the callback. */
  if (GL_NET_CB_INTERCEPT(id, param)) return 1;

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
      ndispatched++;
      gl_cb_dispatch_one(targets[i], param);
      GL_CB_LOCK();
      gl_cb_dispatching = NULL;
      GL_CB_UNLOCK();
    }
  }
  return ndispatched;
}

static void gl_cb_run_callbacks(void) {
  uint8_t buf[GL_CB_DRAIN_RESP_MAX_BYTES];
  uint32_t interval;
  uint32_t now;
  uint32_t iter;
  uint32_t hi;
  int do_bcast, do_cr;

  gl_cbreg_flush();
  GL_CB_LOCK();
  if (gl_cb_running || gl_md_enabled ||
      (gl_cb_relay_count == 0 && gl_cr_count == 0 && gl_cr_held_count == 0 &&
       !GL_NET_CB_ANY() && !GL_MMS_ACTIVE())) {
    GL_CB_UNLOCK();
    return;
  }
  do_bcast = gl_cb_relay_count != 0 || GL_NET_CB_ANY();
  do_cr = gl_cr_count != 0 || gl_cr_held_count != 0;
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

  /* quick k51: a held message (arrived before its listener) is retried first,
   * before any new drain. Cleared only once it reached at least one target. */
  for (hi = 0; do_bcast && hi < GL_CB_RELAY_ROWS; hi++) {
    uint8_t hbuf[GL_CB_HELD_MAX_BYTES];
    int32_t hid;
    int hvalid;
    uint32_t hn;
    if (!gl_cb_relay_table[hi].hold) continue;
    GL_CB_LOCK();
    hvalid = gl_cb_held[hi].valid;
    hid = gl_cb_relay_table[hi].id;
    /* 58-28 (WR-09): a stale held message (e.g. a 333 invite) is cleared,
     * never delivered, and reports nothing. */
    if (hvalid && gl_cb_relay_table[hi].hold_expiry_ms != 0 &&
        (uint32_t)(now - gl_cb_held[hi].born_ms) >= gl_cb_relay_table[hi].hold_expiry_ms) {
      memset(&gl_cb_held[hi], 0, sizeof(gl_cb_held[hi]));
      hvalid = 0;
    }
    if (hvalid) memcpy(hbuf, gl_cb_held[hi].bytes, GL_CB_HELD_MAX_BYTES);
    GL_CB_UNLOCK();
    if (!hvalid) continue;
    hn = gl_cb_deliver(hid, hbuf);
    if (hn > 0) {
      GL_CB_LOCK();
      memset(&gl_cb_held[hi], 0, sizeof(gl_cb_held[hi]));
      GL_CB_UNLOCK();
      gl_cb_report_dispatch(hid, hn, 0);
    }
    memset(hbuf, 0, sizeof(hbuf));
  }

  for (iter = 0; do_bcast && iter < GL_CB_DRAIN_MAX_PER_RUN; iter++) {
    uint32_t len = 0;
    uint32_t count, cub, size, ndispatched;
    int32_t id;
    int row;
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

    ndispatched = gl_cb_deliver(id, buf + 12);
    row = gl_cb_relay_row_index(id);
    if (ndispatched == 0 && row >= 0 && gl_cb_relay_table[row].hold) {
      /* No live listener yet: keep the latest (one slot per id). */
      GL_CB_LOCK();
      memset(&gl_cb_held[row], 0, sizeof(gl_cb_held[row]));
      memcpy(gl_cb_held[row].bytes, buf + 12, cub);
      gl_cb_held[row].cub = cub;
      gl_cb_held[row].born_ms = now;
      gl_cb_held[row].valid = 1;
      GL_CB_UNLOCK();
      gl_cb_report_dispatch(id, 0, 1);
    } else {
      if (ndispatched == 0) {
        GL_CB_LOCK();
        gl_cb_no_target++;
        GL_CB_UNLOCK();
      }
      gl_cb_report_dispatch(id, ndispatched, 0);
    }
  }

  gl_cb_zero(buf, GL_CB_DRAIN_RESP_MAX_BYTES);

  /* 58-10: call results. Held early arrivals are expired and retried first,
   * then up to GL_CB_DRAIN_MAX_PER_RUN slot-11 pulls. A helper that does not
   * know slot 11 fails every pull; that backs off on its own counter. */
  if (do_cr) {
    int crskip;
    gl_cr_retry_held(now);
    GL_CB_LOCK();
    crskip = gl_cr_fail_count >= GL_CB_DRAIN_FAIL_BACKOFF_AFTER &&
             (uint32_t)(now - gl_cr_last_fail_ms) < GL_CB_DRAIN_BACKOFF_MS;
    GL_CB_UNLOCK();
    for (iter = 0; !crskip && iter < GL_CB_DRAIN_MAX_PER_RUN; iter++) {
      uint8_t crbuf[GL_CR_DRAIN_RESP_MAX_BYTES];
      int more = gl_cr_pull_one(crbuf, now);
      gl_cb_zero(crbuf, GL_CR_DRAIN_RESP_MAX_BYTES);
      if (!more) break;
    }
  }

  /* 58-21: server-browser events (slot 12), delivered on this thread. */
  GL_MMS_DRAIN(now);

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
    'void SteamAPI_RegisterCallResult(void *pCallback, uint64_t hAPICall) { gl_cr_register(pCallback, hAPICall); }',
  SteamAPI_UnregisterCallResult:
    'void SteamAPI_UnregisterCallResult(void *pCallback, uint64_t hAPICall) { gl_cr_unregister(pCallback, hAPICall); }'
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
// Phase 56 (56-14, D-20) removed the Phase 52 SteamStub-path export along with
// its forwarder; SteamStub titles now run in steamclient-layer DRM mode with no
// shim. x86 stays deferred (orchestrator decision 6).
export const MODERN_LOOKUP_FLAT_EXPORTS = [
  'SteamInternal_CreateInterface',
  'SteamAPI_GetHSteamUser',
  'SteamAPI_GetHSteamPipe',
  'SteamInternal_SteamAPI_Init',
  'SteamInternal_ContextInit',
  'SteamInternal_FindOrCreateUserInterface',
  'SteamInternal_FindOrCreateGameServerInterface',
  'SteamInternal_GameServer_Init_V2',
  'SteamInternal_GameServer_Init'
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
    '  return x64_null_object_for_version(pszVersion);\n' +
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
    '  return x64_null_object_for_version(pszVersion);\n' +
    '}',
  // SDK: void *SteamInternal_FindOrCreateGameServerInterface(HSteamUser, const
  // char *pszVersion). Same lookup as SteamInternal_CreateInterface.
  SteamInternal_FindOrCreateGameServerInterface:
    'void *SteamInternal_FindOrCreateGameServerInterface(int hSteamUser, const char *pszVersion) {\n' +
    '  (void)hSteamUser;\n' +
    '  void *resolved = resolve_iface_by_exact_version(pszVersion);\n' +
    '  if (resolved != NULL) return resolved;\n' +
    '  return x64_null_object_for_version(pszVersion);\n' +
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
  if (
    kind === 'out-value' ||
    kind === 'null-in' ||
    kind === 'out-struct' ||
    kind === 'out-messages'
  )
    return 0
  if (kind === 'out-buffer') return 4
  if (kind === 'in-buffer') return 4 + WIRE_IN_BUFFER_MAX_BYTES
  if (kind === 'in-struct') return 1 + (p.structSize ?? 0)
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
  const parts = packArgsParts(method)
  if (parts.maxTotal === 0) {
    return { decl: '  const uint8_t *argbuf = NULL;', lenExpr: '0' }
  }
  return {
    decl: [
      `  uint8_t argbuf[${parts.maxTotal}];`,
      `  uint32_t argOff = 0;`,
      ...parts.lines
    ].join('\n'),
    lenExpr: 'argOff'
  }
}

/** The pack statements alone (no `argbuf`/`argOff` declarations), so a caller
 * that needs the buffer static and the lock held can place them itself. */
function packArgsParts(method: MethodSignature): {
  maxTotal: number
  lines: string[]
} {
  const sendableParams = method.params.filter((p) => {
    const k = p.kind ?? 'value'
    return (
      k !== 'out-value' &&
      k !== 'null-in' &&
      k !== 'out-struct' &&
      k !== 'out-messages'
    )
  })
  if (sendableParams.length === 0) {
    return { maxTotal: 0, lines: [] }
  }

  const maxTotal = sendableParams.reduce(
    (sum, p) => sum + wireParamMaxWidth(p),
    0
  )
  const lines: string[] = []
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
        `      if (rawLen > WIRE_IN_STRING_MAX_BYTES) {`,
        `        // 55 WR-04: never truncate -- a cut string is a DIFFERENT string (for`,
        `        // GetAuthTicketForWebApi, a different audience identity). Send the`,
        `        // over-limit length with no bytes; the helper refuses it and this`,
        `        // method returns its failure value.`,
        `        strLen = WIRE_IN_STRING_MAX_BYTES + 1u;`,
        `        memcpy(argbuf + argOff, &strLen, 4); argOff += 4;`,
        `      } else {`,
        `        strLen = (uint32_t)rawLen;`,
        `        memcpy(argbuf + argOff, &strLen, 4); argOff += 4;`,
        `        memcpy(argbuf + argOff, ${p.name}, strLen); argOff += strLen;`,
        `      }`,
        `    }`,
        `  }`
      )
    } else if (kind === 'out-buffer') {
      const capLimit =
        p.capBytes !== undefined
          ? String(p.capBytes)
          : 'WIRE_OUT_BUFFER_MAX_BYTES'
      lines.push(
        `  uint32_t cap_${p.name} = (${p.sizeParam} < 0) ? 0u : (uint32_t)${p.sizeParam}; // negative size -> capacity 0 (53-14, T-53-56)`,
        `  if (cap_${p.name} > ${capLimit}) cap_${p.name} = ${capLimit};`,
        `  memcpy(argbuf + argOff, &cap_${p.name}, 4); argOff += 4;`
      )
    } else if (kind === 'in-buffer') {
      lines.push(
        `  {`,
        `    uint32_t bufLen;`,
        `    int64_t rawLen = (int64_t)${p.lenParam};`,
        `    if (rawLen < 0 || rawLen > ${WIRE_IN_BUFFER_MAX_BYTES} || (${p.name} == NULL && rawLen > 0)) {`,
        `      // 58-06 Pitfall 4: never truncate -- send the over-limit marker with no`,
        `      // bytes; the helper refuses it and this method returns its failure value.`,
        `      bufLen = ${WIRE_IN_BUFFER_MAX_BYTES} + 1u;`,
        `      memcpy(argbuf + argOff, &bufLen, 4); argOff += 4;`,
        `    } else {`,
        `      bufLen = (uint32_t)rawLen;`,
        `      memcpy(argbuf + argOff, &bufLen, 4); argOff += 4;`,
        `      if (bufLen > 0) { memcpy(argbuf + argOff, ${p.name}, bufLen); argOff += bufLen; }`,
        `    }`,
        `  }`
      )
    } else if (kind === 'in-struct') {
      lines.push(
        `  if (${p.name} == NULL) {`,
        `    argbuf[argOff] = 0; argOff += 1;`,
        `  } else {`,
        `    argbuf[argOff] = 1; argOff += 1;`,
        `    memcpy(argbuf + argOff, ${p.name}, ${p.structSize}); argOff += ${p.structSize};`,
        `  }`
      )
    } else {
      const width = paramWidth(p.type)
      lines.push(
        `  memcpy(argbuf + argOff, &${p.name}, ${width}); argOff += ${width};`
      )
    }
  }
  return { maxTotal, lines }
}

/**
 * quick 261027-jgs: the C lines that report the FIRST call of a locally
 * answered manifest method to the helper (logged as STUBCALL). `decl` is the
 * block-scope one-shot state (`[0]` reported flag, `[1]` attempts) and must
 * precede the first statement; `call` goes after any memset / text-out prelude
 * and before the return, so it never alters the returned value or out-params.
 * Interface and method names are generator-controlled identifiers, asserted
 * here before they become C string literals.
 */
function stubCallSite(
  manifest: InterfaceManifest,
  method: MethodSignature,
  kindDefine: 'STUB' | 'FALLBACK' | 'OFFPATH'
): { decl: string; call: string } {
  const ident = /^[A-Za-z0-9_]+$/
  if (!ident.test(manifest.interface) || !ident.test(method.name)) {
    throw new Error(
      `stubCallSite: ${manifest.interface}.${method.name} is not a plain identifier`
    )
  }
  return {
    decl: `  static volatile LONG gamelib_sc[2];\n`,
    call: `  gamelib_stubcall_note(gamelib_sc, "${manifest.interface}", "${method.name}", ${method.slot}, GAMELIB_STUBCALL_KIND_${kindDefine});\n`
  }
}

/**
 * quick 261027-k51: closed map of `helperFallback` methods that also notify
 * the helper on EVERY call, keyed by `${manifest.family}.${method.name}`. The
 * value is the name of an embedder function (declared before the vtable stubs)
 * called after the stub-call note and before the return, so the returned value
 * is unchanged. RequestCurrentStats stays a shim-local `true`, but the helper
 * learns the game wants UserStatsReceived_t (1101).
 */
const FALLBACK_HELPER_NOTIFY: Readonly<Record<string, string>> = {
  'SteamUserStats.RequestCurrentStats': 'gamelib_request_current_stats'
}

/**
 * 51-06 Task 2: a stub method never FORWARDS its call over the wire -- it
 * answers a canned zero/false/NULL/empty-string/zero-filled-sret value locally,
 * matching `shimCoverage.ts`'s `ServedInterface.mode === 'stub'` semantics
 * (D-51-02's one-time notice exists precisely because a stubbed interface
 * never talks to the real Mac Steam client). quick 261027-jgs: it does send
 * ONE diagnostic first-call report (gamelib_stubcall_note, logged STUBCALL),
 * once per method, never changing its answer. Its C signature is driven
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
  // A stub with a caller-owned `char*` text out-buffer (immediately followed
  // by its integer capacity) must NUL-terminate it: the buffer arrives
  // uninitialized (Steamworks.NET's GetLaunchCommandLine AllocHGlobal's it and
  // reads it back unless the return is -1), and an unwritten buffer reaches the
  // game as garbage text (Planet Crafter 1284190: SteamRichPresence.JoinFriend
  // parsed it as a connect string and threw). Declare the REAL param types for
  // such a stub -- a `uint32_t dummy` would truncate the pointer on Win64 --
  // which the i386 stackBytes already account for (pointer = 4 bytes there).
  const textOutIdx = method.params.findIndex(
    (p, i) =>
      p.type === 'char*' &&
      i + 1 < method.params.length &&
      (method.params[i + 1].type === 'int32' ||
        method.params[i + 1].type === 'uint32')
  )
  const useRealParams =
    !sret &&
    textOutIdx >= 0 &&
    method.params.every((p) => {
      try {
        cType(p.type)
        return true
      } catch {
        return false
      }
    })
  const dummyParams = useRealParams
    ? method.params.map((p) => `${cType(p.type)} ${p.name}`).join(', ')
    : Array.from({ length: dummyCount }, (_, i) => `uint32_t dummy${i}`).join(
        ', '
      )
  const textOutPrelude = useRealParams
    ? `  if (${method.params[textOutIdx].name} != NULL && ${method.params[textOutIdx + 1].name} > 0) ${method.params[textOutIdx].name}[0] = '\\0';\n`
    : ''
  const paramParts = [sretParam, dummyParams].filter(Boolean).join(', ')
  const signatureParams = paramParts
    ? `void *self, ${paramParts}`
    : 'void *self'
  const site = stubCallSite(manifest, method, 'STUB')

  if (sret) {
    const structSize = method.structSize ?? 0
    return (
      header +
      `static void * THISCALL ${funcName}(${signatureParams}) {\n` +
      site.decl +
      `  (void)self;\n` +
      `  memset(sretOut, 0, ${structSize});\n` +
      site.call +
      `  return sretOut;\n` +
      `}\n`
    )
  }

  if (stringReturn) {
    return (
      header +
      `static const char * THISCALL ${funcName}(${signatureParams}) {\n` +
      site.decl +
      `  (void)self;\n` +
      site.call +
      `  return "";\n` +
      `}\n`
    )
  }

  if (method.returnKind === 'void') {
    return (
      header +
      `static void THISCALL ${funcName}(${signatureParams}) {\n` +
      site.decl +
      `  (void)self;\n` +
      textOutPrelude +
      site.call +
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
    site.decl +
    `  (void)self;\n` +
    textOutPrelude +
    site.call +
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
// per-VERSION null objects whose sret slots zero-fill and return their second
// argument.
//
// quick-261027-i4x closes that for every version Proton ships with sret
// slots: meta/sdk/x64-null-sret-inventory.json (Proton pinned SHA, written by
// `pnpm extract-proton-inventory --null-sret-inventory`) feeds
// emitX64NullSretObjects, which emits a per-version vtable keyed by the EXACT
// version string. It is per version, never per family, because sret slot
// positions MOVE between versions (SteamController003 sret is at 9/12,
// SteamController006 at 13/16/25): a family-wide table would memset through
// RDX on a slot where RDX is an ordinary argument, a new crash. Sret slots
// zero-fill structSize bytes and return RDX in RAX (quick-261027-ijs: each
// (version, slot) has its own function that also reports its first call to the
// helper, logged as NULLSRET); every other slot is a per-slot thunk
// vt_x64_null_s<N> that reports its first call per (instance, slot) as STUBCALL
// (quick-261027-jgs) and returns 0. Unknown versions now get a distinct pooled
// instance (identification only; the behaviour is still all-zero). REMAINING
// GAP: a version unknown to the pinned Proton inventory (or one Proton ships
// without sret data) is still all-zero, so an sret call on such a version
// still reads through 0.
export const X64_NULL_OBJECT_SLOTS = 256

/** One sret slot of a Proton-shipped interface version. */
export interface NullSretSlot {
  slot: number
  name: string
  structSize: number
}

/** A Proton-shipped interface version that carries at least one sret slot. */
export interface NullSretVersionEntry {
  family: string
  slotCount: number
  sret: NullSretSlot[]
}

/** Shape of meta/sdk/x64-null-sret-inventory.json. */
export interface NullSretInventory {
  source: { kind: 'proton-lsteamclient'; ref: string }
  versions: Record<string, NullSretVersionEntry>
}

/**
 * Emits the per-version sret-aware x64 null objects and the exact-string
 * lookup `x64_null_object_for_version`. Versions an x64 manifest serves are
 * skipped (their real proxy wins). Output goes inside the preamble's
 * `#if defined(__x86_64__)` block, after g_x64_null_object_instance.
 */
function emitX64NullSretObjects(
  manifests: readonly InterfaceManifest[],
  inventory: NullSretInventory | undefined
): string {
  const kept: [string, NullSretVersionEntry][] = []
  for (const version of Object.keys(inventory?.versions ?? {}).sort()) {
    const entry = inventory!.versions[version]
    if (entry.slotCount > X64_NULL_OBJECT_SLOTS) {
      throw new Error(
        `x64 null sret inventory: ${version} slotCount ${entry.slotCount} exceeds ${X64_NULL_OBJECT_SLOTS}`
      )
    }
    const seen = new Set<number>()
    for (const s of entry.sret) {
      if (
        !Number.isInteger(s.slot) ||
        s.slot < 0 ||
        s.slot >= entry.slotCount
      ) {
        throw new Error(
          `x64 null sret inventory: ${version} sret slot ${s.slot} out of range (slotCount ${entry.slotCount})`
        )
      }
      if (seen.has(s.slot)) {
        throw new Error(
          `x64 null sret inventory: ${version} duplicate sret slot ${s.slot}`
        )
      }
      seen.add(s.slot)
      if (!Number.isInteger(s.structSize) || s.structSize <= 0) {
        throw new Error(
          `x64 null sret inventory: ${version} slot ${s.slot} invalid structSize ${s.structSize}`
        )
      }
    }
    if (
      manifests.some((m) => m.interface === version && m.arches.includes('x64'))
    )
      continue
    kept.push([version, entry])
  }

  // quick-261027-ijs: one function per (version, sret slot) so the first call
  // of each site can be reported to the helper (NULLSRET). K is the row index
  // in g_x64_null_sret_sites, in emission order (versions sorted, slots
  // ascending).
  const sites: { version: string; id: string; slot: number; size: number }[] =
    []
  for (const [version, entry] of kept) {
    const id = version.toLowerCase().replace(/[^a-z0-9_]/g, '_')
    for (const s of [...entry.sret].sort((a, b) => a.slot - b.slot)) {
      sites.push({ version, id, slot: s.slot, size: s.structSize })
    }
  }

  let out = ''
  if (sites.length > 0) {
    out +=
      `#define GLIB_X64_NULL_SRET_SITES ${sites.length}\n` +
      `static const struct { const char *version; uint32_t slot; uint32_t size; } g_x64_null_sret_sites[GLIB_X64_NULL_SRET_SITES] = {\n` +
      sites
        .map((s) => `  { "${s.version}", ${s.slot}, ${s.size} },`)
        .join('\n') +
      `\n};\n` +
      `static volatile LONG g_x64_null_sret_reported[GLIB_X64_NULL_SRET_SITES];\n` +
      `static volatile LONG g_x64_null_sret_attempts[GLIB_X64_NULL_SRET_SITES];\n` +
      `// quick-261027-ijs: report the first call of site k to the helper (NULLSRET). One-shot per site via\n` +
      `// the interlocked flag. The flag is reset when bridge_transact fails (e.g. before HELLO) so a later\n` +
      `// call retries, bounded at 3 attempts per site. Never alters the caller's memset or return value;\n` +
      `// holds no lock itself (bridge_transact takes g_bridge_lock).\n` +
      `static void x64_null_sret_note(uint32_t k) {\n` +
      `  uint8_t req[12 + 128];\n` +
      `  uint8_t retbuf[1]; uint32_t retlen = 0;\n` +
      `  uint32_t vlen, slot, size;\n` +
      `  if (k >= GLIB_X64_NULL_SRET_SITES) return;\n` +
      `  if (InterlockedCompareExchange(&g_x64_null_sret_reported[k], 1, 0) != 0) return;\n` +
      `  if (InterlockedIncrement(&g_x64_null_sret_attempts[k]) > 3) return;\n` +
      `  vlen = (uint32_t)strlen(g_x64_null_sret_sites[k].version);\n` +
      `  if (vlen > 128) vlen = 128;\n` +
      `  slot = g_x64_null_sret_sites[k].slot;\n` +
      `  size = g_x64_null_sret_sites[k].size;\n` +
      `  memcpy(req, &slot, 4);\n` +
      `  memcpy(req + 4, &size, 4);\n` +
      `  memcpy(req + 8, &vlen, 4);\n` +
      `  memcpy(req + 12, g_x64_null_sret_sites[k].version, vlen);\n` +
      `  if (!bridge_transact(BRIDGE_CONTROL_ORDINAL, BRIDGE_CONTROL_SLOT_REPORT_NULL_SRET, req, 12 + vlen, retbuf, sizeof(retbuf), &retlen)) {\n` +
      `    InterlockedExchange(&g_x64_null_sret_reported[k], 0);\n` +
      `  }\n` +
      `}\n`
    sites.forEach((s, k) => {
      out += `static void *vt_x64_null_sret_${s.id}_s${s.slot}(void *self, void *ret) { (void)self; if (ret != NULL) memset(ret, 0, ${s.size}); x64_null_sret_note(${k}); return ret; }\n`
    })
  }
  const table: string[] = []
  for (const [version, entry] of kept) {
    const id = version.toLowerCase().replace(/[^a-z0-9_]/g, '_')
    const bySlot = new Set(entry.sret.map((s) => s.slot))
    out +=
      `// ${version} (${entry.family}, ${entry.slotCount} slots, sret at ` +
      `${entry.sret.map((s) => `${s.slot}:${s.name}`).join(', ')})\n` +
      `static vfn g_x64_null_${id}_vtbl[${entry.slotCount}] = {\n` +
      Array.from({ length: entry.slotCount }, (_, i) =>
        bySlot.has(i)
          ? `  (vfn)vt_x64_null_sret_${id}_s${i},`
          : `  (vfn)vt_x64_null_s${i},`
      ).join('\n') +
      `\n};\n` +
      `static struct GLibX64NullObject g_x64_null_${id}_instance = { g_x64_null_${id}_vtbl };\n`
    table.push(`  { "${version}", &g_x64_null_${id}_instance },`)
  }
  if (table.length > 0) {
    out +=
      `static const struct { const char *version; void *instance; } g_x64_null_sret_objects[] = {\n` +
      table.join('\n') +
      `\n};\n`
  }

  // quick-261027-jgs: identification tables for the per-slot null thunks. The
  // named table lists every statically emitted instance (generic first); the
  // pool hands unknown versions a distinct instance so the STUBCALL line can
  // carry the exact version the game asked for.
  const named = [
    { ver: 'unknown', inst: '&g_x64_null_object_instance' },
    ...kept.map(([version]) => ({
      ver: version,
      inst: `&g_x64_null_${version.toLowerCase().replace(/[^a-z0-9_]/g, '_')}_instance`
    }))
  ]
  out +=
    `// quick-261027-jgs: lock rule -- g_x64_null_pool_lock is a leaf lock, held only for the pool search and\n` +
    `// insert, and never held across any call or bridge_transact.\n` +
    `#define GLIB_X64_NULL_NAMED ${named.length}\n` +
    `#define GLIB_X64_NULL_POOL 32\n` +
    `static void *const g_x64_null_named[GLIB_X64_NULL_NAMED] = {\n` +
    named.map((n) => `  ${n.inst},`).join('\n') +
    `\n};\n` +
    `static const char *const g_x64_null_named_ver[GLIB_X64_NULL_NAMED] = {\n` +
    named.map((n) => `  "${n.ver}",`).join('\n') +
    `\n};\n` +
    `static struct GLibX64NullObject g_x64_null_pool[GLIB_X64_NULL_POOL] = {\n` +
    Array.from({ length: 32 }, () => `  { g_x64_null_object_vtbl },`).join(
      '\n'
    ) +
    `\n};\n` +
    `static char g_x64_null_pool_ver[GLIB_X64_NULL_POOL][64];\n` +
    `static unsigned g_x64_null_pool_used = 0;\n` +
    `static SRWLOCK g_x64_null_pool_lock = SRWLOCK_INIT;\n` +
    `static volatile LONG g_x64_null_call_state[GLIB_X64_NULL_NAMED + GLIB_X64_NULL_POOL][${X64_NULL_OBJECT_SLOTS}][2];\n` +
    `// quick-261027-jgs: first call per (instance, slot) of a non-sret null slot -> STUBCALL kind=null. The\n` +
    `// instance is identified by ADDRESS only (pool range + alignment, then the named table); self is never\n` +
    `// dereferenced and an unrecognised self is not reported.\n` +
    `__attribute__((noinline)) static void x64_null_call_note(void *self, uint32_t slot) {\n` +
    `  size_t i;\n` +
    `  size_t idx = (size_t)-1;\n` +
    `  const char *ver = NULL;\n` +
    `  if (slot >= ${X64_NULL_OBJECT_SLOTS}) return;\n` +
    `  {\n` +
    `    uintptr_t a = (uintptr_t)self;\n` +
    `    uintptr_t b = (uintptr_t)g_x64_null_pool;\n` +
    `    if (a >= b && a < b + sizeof(g_x64_null_pool) && ((a - b) % sizeof(struct GLibX64NullObject)) == 0) {\n` +
    `      size_t k = (size_t)((a - b) / sizeof(struct GLibX64NullObject));\n` +
    `      idx = GLIB_X64_NULL_NAMED + k;\n` +
    `      ver = g_x64_null_pool_ver[k];\n` +
    `    }\n` +
    `  }\n` +
    `  if (idx == (size_t)-1) {\n` +
    `    for (i = 0; i < GLIB_X64_NULL_NAMED; i++) {\n` +
    `      if (self == g_x64_null_named[i]) { idx = i; ver = g_x64_null_named_ver[i]; break; }\n` +
    `    }\n` +
    `  }\n` +
    `  if (idx == (size_t)-1 || ver == NULL) return;\n` +
    `  gamelib_stubcall_note(g_x64_null_call_state[idx][slot], ver, NULL, slot, GAMELIB_STUBCALL_KIND_NULL);\n` +
    `}\n`
  out += `static void *x64_null_object_for_version(const char *version) {\n`
  out += `  size_t i;\n  size_t vlen = 0;\n  void *found = NULL;\n`
  out += `  if (version == NULL) return (void *)&g_x64_null_object_instance;\n`
  if (table.length > 0) {
    out +=
      `  for (i = 0; i < sizeof(g_x64_null_sret_objects) / sizeof(g_x64_null_sret_objects[0]); i++) {\n` +
      `    if (strcmp(version, g_x64_null_sret_objects[i].version) == 0) return g_x64_null_sret_objects[i].instance;\n` +
      `  }\n`
  }
  out +=
    `  while (vlen < 64 && version[vlen] != '\\0') vlen++;\n` +
    `  AcquireSRWLockExclusive(&g_x64_null_pool_lock);\n` +
    `  for (i = 0; i < g_x64_null_pool_used; i++) {\n` +
    `    if (strncmp(g_x64_null_pool_ver[i], version, 63) == 0 && (vlen > 63 || g_x64_null_pool_ver[i][vlen] == '\\0')) {\n` +
    `      found = (void *)&g_x64_null_pool[i];\n` +
    `      break;\n` +
    `    }\n` +
    `  }\n` +
    `  if (found == NULL && g_x64_null_pool_used < GLIB_X64_NULL_POOL) {\n` +
    `    size_t n = vlen > 63 ? 63 : vlen;\n` +
    `    memcpy(g_x64_null_pool_ver[g_x64_null_pool_used], version, n);\n` +
    `    g_x64_null_pool_ver[g_x64_null_pool_used][n] = '\\0';\n` +
    `    found = (void *)&g_x64_null_pool[g_x64_null_pool_used];\n` +
    `    g_x64_null_pool_used++;\n` +
    `  }\n` +
    `  ReleaseSRWLockExclusive(&g_x64_null_pool_lock);\n` +
    `  if (found != NULL) return found;\n` +
    `  return (void *)&g_x64_null_object_instance;\n}\n`
  return out
}

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
 * Emits a GetISteamXxx version-lookup stub: looks up `pchVersion` in
 * `g_iface_table` via `resolve_iface_by_exact_version` (defined once,
 * where `g_iface_table` is complete -- see `emitIfaceTableAndBareAccessors`
 * -- and forward-declared in the preamble so this function, emitted
 * earlier in the file as part of `vtableSections`, can call it) and falls
 * back to a per-version x64 null object (x64_null_object_for_version) on a miss. The real HSteamUser/
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
    `  return x64_null_object_for_version(${versionParam.name});\n` +
    `#else\n` +
    `  return NULL;\n` +
    `#endif\n` +
    `}\n`
  )
}

/**
 * The response-side decode shared by the generic stub path and the 58-06
 * extended path: out-values, then out-buffers, then out-structs, per
 * WIRE_LAYOUT_DOC. `respOff` starts after the base return value.
 */
function buildOutDecode(
  method: MethodSignature,
  retWidth: number
): { retBufSize: number; failZeroLines: string[]; decodeLines: string[] } {
  const outValueParams = method.params.filter((p) => p.kind === 'out-value')
  const outBufferParams = method.params.filter((p) => p.kind === 'out-buffer')
  const outStructParams = method.params.filter((p) => p.kind === 'out-struct')
  const outMessagesParams = method.params.filter(
    (p) => p.kind === 'out-messages'
  )
  const extraMax =
    outMessagesParams.length * WIRE_OUT_MESSAGES_MAX_BYTES +
    outValueParams.reduce(
      (sum, p) => sum + valueTypeWidth(p.valueType ?? 'int32'),
      0
    ) +
    outBufferParams.reduce(
      (sum, p) => sum + 4 + (p.capBytes ?? WIRE_OUT_BUFFER_MAX_BYTES),
      0
    ) +
    outStructParams.reduce((sum, p) => sum + 1 + (p.structSize ?? 0), 0)
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
    const capLimit =
      p.capBytes !== undefined
        ? String(p.capBytes)
        : 'WIRE_OUT_BUFFER_MAX_BYTES'
    decodeLines.push(
      `  if (retlen >= respOff + 4) {`,
      `    uint32_t declLen; memcpy(&declLen, retbuf + respOff, 4); respOff += 4;`,
      `    uint32_t copyLen = declLen;`,
      `    if (copyLen > ${capLimit}) copyLen = ${capLimit};`,
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
  // 58-06: out-struct trails the out-buffers -- [u8 present][structSize
  // bytes]; copied only into a non-NULL game pointer when present is 1.
  for (const p of outStructParams) {
    decodeLines.push(
      `  if (retlen >= respOff + 1) {`,
      `    uint8_t present_${p.name} = retbuf[respOff]; respOff += 1;`,
      `    if (present_${p.name} == 1 && retlen >= respOff + ${p.structSize}) {`,
      `      if (${p.name} != NULL) memcpy(${p.name}, retbuf + respOff, ${p.structSize});`,
      `      respOff += ${p.structSize};`,
      `    }`,
      `  }`
    )
  }
  // 58-15: out-messages trails everything -- the int32 return is the count,
  // the records follow. gl_net_decode_messages allocates each message with the
  // Windows-side pool and never over-reads the frame.
  for (const p of outMessagesParams) {
    decodeLines.push(
      `  result = gl_net_decode_messages(retbuf + respOff, retlen >= respOff ? retlen - respOff : 0, (int32_t)ret, (int32_t)${p.countParam}, (void **)${p.name});`
    )
  }
  for (const p of outValueParams) {
    const owner = lenOwner.get(p.name)
    if (owner === undefined) continue
    decodeLines.push(
      `  if (${p.name} != NULL) *${p.name} = (lenVal_${p.name} < copied_${owner}) ? lenVal_${p.name} : copied_${owner};`
    )
  }

  return { retBufSize, failZeroLines, decodeLines }
}

/** True when a wire method's params need the 58-06 stub emitter. */
function needsExtendedStub(method: MethodSignature): boolean {
  return method.params.some(
    (p) => NEW_WIRE_KINDS.has(p.kind ?? 'value') || p.capBytes !== undefined
  )
}

/**
 * 58-06: shim stub for a wire method that uses in-buffer, in-struct,
 * out-struct or an out-buffer capBytes override. A request or response over
 * WIRE_STACK_BUFFER_MAX_BYTES uses static buffers and holds g_bridge_lock
 * across pack, transact and decode, so there is exactly one in-flight large
 * buffer and no per-call allocation of a game-chosen size (T-58-19). Smaller
 * ones keep plain stack arrays and the normal bridge_transact.
 */
function emitExtendedWireStub(
  manifest: InterfaceManifest,
  method: MethodSignature,
  header: string,
  funcName: string,
  signatureParams: string,
  sretOrString: boolean
): string {
  const ctx = `${manifest.interface}.${method.name}`
  if (sretOrString) {
    throw new Error(
      `emitVtableStub: ${ctx} uses in-buffer/in-struct/out-struct/capBytes with a sret or string return -- unsupported (58-06)`
    )
  }
  if (manifest.family === STEAM_CLIENT_FAMILY) {
    throw new Error(
      `emitVtableStub: ${ctx} -- the 58-06 kinds are not supported on the SteamClient family`
    )
  }
  const isVoid = method.returnKind === 'void'
  const returnType = isVoid ? 'void' : cType(method.returns)
  const retWidth = isVoid ? 0 : is64BitRegisterReturn(method) ? 8 : 4
  const pack = packArgsParts(method)
  const { retBufSize, failZeroLines, decodeLines } = buildOutDecode(
    method,
    retWidth
  )
  const large =
    pack.maxTotal > WIRE_STACK_BUFFER_MAX_BYTES ||
    retBufSize > WIRE_STACK_BUFFER_MAX_BYTES
  const storage = large ? 'static ' : ''
  const call = large
    ? `bridge_transact_locked(${manifest.ordinal}, ${method.slot}, argbuf, argOff, retbuf, sizeof(retbuf), &retlen)`
    : `bridge_transact(${manifest.ordinal}, ${method.slot}, argbuf, argOff, retbuf, sizeof(retbuf), &retlen)`
  const lines: string[] = [
    header + `static ${returnType} THISCALL ${funcName}(${signatureParams}) {`,
    `  (void)self;`
  ]
  if (!isVoid) lines.push(`  ${returnType} result = 0;`)
  lines.push(
    `  ${storage}uint8_t argbuf[${Math.max(pack.maxTotal, 1)}];`,
    `  ${storage}uint8_t retbuf[${Math.max(retBufSize, 1)}];`,
    `  uint32_t argOff = 0; uint32_t retlen = 0;`
  )
  if (large) lines.push(`  AcquireSRWLockExclusive(&g_bridge_lock);`)
  lines.push(...pack.lines)
  lines.push(`  int ok = ${call};`)
  lines.push(isVoid ? `  if (ok) {` : `  if (ok && retlen >= ${retWidth}) {`)
  if (!isVoid) {
    lines.push(
      `    ${returnType} ret; memcpy(&ret, retbuf, ${retWidth});`,
      `    result = ret;`
    )
  }
  lines.push(...decodeLines.map((l) => `  ${l}`))
  lines.push(`  } else {`, ...failZeroLines.map((l) => l.slice(0)), `  }`)
  if (large) lines.push(`  ReleaseSRWLockExclusive(&g_bridge_lock);`)
  lines.push(isVoid ? `  return;` : `  return result;`, `}`)
  return lines.join('\n') + '\n'
}

/**
 * 58-20: a wire method naming `zeroHandleParam` answers a 0 handle locally. The
 * guard is inserted as the first statement of the generated function, before
 * any argument packing or bridge_transact, so no wire frame is sent.
 */
function emitVtableStub(
  manifest: InterfaceManifest,
  method: MethodSignature
): string {
  const text = emitVtableStubBody(manifest, method)
  if (method.zeroHandleParam === undefined) return text
  const open = text.indexOf(
    ') {\n',
    text.indexOf(`${'vt_' + manifest.interface}_${method.name}(`)
  )
  if (open < 0) {
    throw new Error(
      `emitVtableStub: ${manifest.interface}.${method.name} zeroHandleParam: function opening not found`
    )
  }
  const at = open + ') {\n'.length
  const ret = method.returnKind === 'void' ? 'return;' : 'return 0;'
  const unmap =
    method.unmapHandle === undefined
      ? ''
      : `  gl_mms_unmap(${method.unmapHandle === 'list' ? 'GL_MMS_CLS_LIST' : 'GL_MMS_CLS_QUERY'}, (uint32_t)${method.zeroHandleParam}); // 58-21: drop the response mapping\n`
  return (
    text.slice(0, at) +
    unmap +
    `  if (${method.zeroHandleParam} == 0) { ${ret} } // 58-20: zero handle, no wire call\n` +
    text.slice(at)
  )
}

function emitVtableStubBody(
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

  // 58-06: a shimLocal method is answered by its named SHIM_LOCAL_BODIES
  // entry and never crosses the wire.
  if (method.shimLocal) {
    const key = `${manifest.family}.${method.name}`
    const body = SHIM_LOCAL_BODIES[key]
    if (body === undefined) {
      throw new Error(
        `emitVtableStub: shimLocal method ${manifest.interface}.${method.name} has no SHIM_LOCAL_BODIES entry "${key}"`
      )
    }
    const localReturn = sret
      ? 'void *'
      : stringReturn
        ? 'const char *'
        : method.returnKind === 'void'
          ? 'void'
          : cType(method.returns)
    return (
      header +
      `static ${localReturn} THISCALL ${funcName}(${signatureParams}) {\n` +
      `  (void)self;\n` +
      `${body}\n` +
      `}\n`
    )
  }

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
    const fbSite = stubCallSite(manifest, method, 'FALLBACK')
    if (method.returnKind === 'void') {
      return (
        header +
        `static void THISCALL ${funcName}(${signatureParams}) {\n` +
        fbSite.decl +
        `  (void)self;\n` +
        fbSite.call +
        `}\n`
      )
    }
    const returnType = cType(method.returns)
    const notifyFn = FALLBACK_HELPER_NOTIFY[`${manifest.family}.${method.name}`]
    return (
      header +
      `static ${returnType} THISCALL ${funcName}(${signatureParams}) {\n` +
      fbSite.decl +
      `  (void)self;\n` +
      fbSite.call +
      (notifyFn !== undefined ? `  ${notifyFn}();\n` : '') +
      `  return ${fallbackLiteral};\n` +
      `}\n`
    )
  }

  if (methodMode === 'stub') {
    return emitStubBody(manifest, method, header, funcName, sret, stringReturn)
  }

  if (needsExtendedStub(method)) {
    return emitExtendedWireStub(
      manifest,
      method,
      header,
      funcName,
      signatureParams,
      sret || stringReturn
    )
  }

  const { decl: argBufDecl, lenExpr: argLenExpr } = packArgsBlock(method)

  if (stringReturn) {
    // CR-01: a register-return const char* cannot marshal a remote
    // pointer -- the helper encodes [u32 len][bytes] (WIRE_LAYOUT_DOC,
    // emitStringReturnEncodeLines) and this stub decodes through the
    // same-module emitStringReturnDecode so both sides share one definition
    // (quick 261026-rqb: the raw copy leaked the length prefix, e.g. 0x07 in
    // Overlooting's godot.log). It must copy the bytes into memory IT owns, then return a pointer into that buffer
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
      `  uint8_t retbuf[STRING_RETURN_WIRE_BYTES]; uint32_t retlen = 0;\n` +
      `  if (!bridge_transact(${manifest.ordinal}, ${method.slot}, argbuf, ${argLenExpr}, retbuf, sizeof(retbuf), &retlen)) {\n` +
      `    ${funcName}_buf[0] = '\\0';\n` +
      `    return ${funcName}_buf;\n` +
      `  }\n` +
      emitStringReturnDecode(`${funcName}_buf`) +
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

  const { retBufSize, failZeroLines, decodeLines } = buildOutDecode(
    method,
    retWidth
  )

  return (
    header +
    `static ${returnType} THISCALL ${funcName}(${signatureParams}) {\n` +
    `  (void)self;\n` +
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

function flatAccessorAliasNames(manifest: InterfaceManifestV2): string[] {
  return manifest.flatAccessorAliases ?? []
}

function emitFlatAccessor(manifest: InterfaceManifest): string {
  const instanceName = `g_${manifest.interface.toLowerCase()}_instance`
  return [flatAccessorName(manifest), ...flatAccessorAliasNames(manifest)]
    .map((name) => `void *${name}(void) { return &${instanceName}; }\n`)
    .join('')
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

/** quick 261031-ixa: ids the shim may report to the helper (slot 10): the
 *  deduplicated union of the relay and call-result tables. 703 is absent on
 *  purpose (the helper refuses it). */
const REPORT_IDS: readonly number[] = [
  ...new Set([
    ...CALLBACK_RELAY_TABLE.map((r) => r.id),
    ...CALL_RESULT_TABLE.map((r) => r.id)
  ])
]
const REPORT_IDS_C = REPORT_IDS.join(', ')

/** 58-21: ordinal of SteamMatchMakingServers003 (meta/sdk/ordinals.json,
 * append-only); the shim's server-browser requests are sent to it. */
const MMS_ORDINAL = 69
const REPORT_IDS_N = REPORT_IDS.length

export function generateShimC(
  manifests: InterfaceManifest[],
  options: {
    unrepresentable?: readonly string[]
    x64NullSretInventory?: NullSretInventory
  } = {}
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

// WR-03: length in ASCII hex chars of the per-launch secret the backend
// writes as a \`secret=\` line in gamelib_bridge.cfg. Matches protocol.ts's
// BRIDGE_SECRET_HEX_LEN and bridge_helper.c's define byte-for-byte.
#define BRIDGE_SECRET_HEX_LEN 64

// Matches protocol.ts's CONTROL_ORDINAL / CONTROL_SLOT.hello exactly --
// the connect-time handshake bridge_helper.c answers unconditionally
// (independent of whether Steam itself is signed in), proving this really
// is a GameLib per-appId helper before any real interface call is issued.
#define BRIDGE_CONTROL_ORDINAL 0xffff
#define BRIDGE_CONTROL_SLOT_HELLO 2
// Slot 3 was retired in Phase 56 (56-14, D-20); never reuse it.
// Phase 53 (53-04, D-53-07): the flat ISteamClient_GetISteam* lookup tells the
// helper which unserved interface version a game asked for (the helper handler
// lands in 53-06; an unhandled slot is a harmless error response).
#define BRIDGE_CONTROL_SLOT_REPORT_VERSION 4
// D-53-15 (quick 261025-kax): the game's own SteamAPI_Init /
// SteamInternal_SteamAPI_Init tells the helper how it went ({u32 fn, i32 ret});
// the helper logs a GINIT line, the only evidence an init-only title can give.
#define BRIDGE_CONTROL_SLOT_REPORT_INIT 5
// Phase 55: SteamAPI_RunCallbacks drains queued Steam callbacks (168 and 1101) from the helper; an old helper answers STATUS_ERR, which bridge_transact reports as 0 and the registry treats as empty.
#define BRIDGE_CONTROL_SLOT_DRAIN_CALLBACKS 6
// quick 261027-ijs: the first game call of each per-version x64 sret null-object slot is reported (the helper logs NULLSRET); an old helper answers STATUS_ERR, which is harmless.
#define BRIDGE_CONTROL_SLOT_REPORT_NULL_SRET 7
// quick 261027-jgs: the first game call of each locally-answered method or x64 null-object slot is reported (the helper logs STUBCALL); an old helper answers STATUS_ERR, which re-arms the site at most 3 times and is otherwise harmless.
#define BRIDGE_CONTROL_SLOT_REPORT_STUB_CALL 8
// quick 261027-k51: every game call to ISteamUserStats::RequestCurrentStats tells the helper the game wants UserStatsReceived_t (1101); an old helper answers STATUS_ERR, which is harmless.
#define BRIDGE_CONTROL_SLOT_REQUEST_CURRENT_STATS 9
// quick 261027-k51: each relayed callback the registry dispatched or held is reported (the helper logs CBDISP); an old helper answers STATUS_ERR, which is harmless.
#define BRIDGE_CONTROL_SLOT_REPORT_CB_DISPATCH 10
// quick 261106-qvp: game registrations of unlisted callback ids (and ManualDispatch_Init) are reported from the Run paths and logged by the helper as CBREG; an old helper answers STATUS_ERR, which is harmless.
#define BRIDGE_CONTROL_SLOT_REPORT_CB_REGISTER 15
// Phase 58 (58-10): SteamAPI_RunCallbacks drains one completed call result at a time ([u32 count][u64 h][i32 id][u32 failed][u32 cub][bytes]); an old helper answers STATUS_ERR, which bridge_transact reports as 0 and the registry treats as empty.
#define BRIDGE_CONTROL_SLOT_DRAIN_CALL_RESULTS 11
// Phase 58 (58-21): SteamAPI_RunCallbacks, ManualDispatch RunFrame and ISteamNetworkingSockets::RunCallbacks drain one server-browser event at a time ([u32 count][u8 kind][u32 hRequest][i32 iServer][i32 value][u32 cub][bytes]); an old helper answers STATUS_ERR, which bridge_transact reports as 0 and the registry backs off.
#define BRIDGE_CONTROL_SLOT_DRAIN_SERVER_EVENTS 12
#define GAMELIB_STUBCALL_KIND_STUB 0
#define GAMELIB_STUBCALL_KIND_FALLBACK 1
#define GAMELIB_STUBCALL_KIND_OFFPATH 2
#define GAMELIB_STUBCALL_KIND_NULL 3
#define GAMELIB_INIT_FN_STEAMAPI_INIT 0
#define GAMELIB_INIT_FN_STEAMINTERNAL_INIT 1
#define GAMELIB_INIT_FN_STEAMAPI_INITSAFE 2

// CR-01: byte capacity of each string-returning stub's shim-owned static
// return buffer -- emitted directly from the generator's
// STRING_RETURN_BUF_BYTES constant, so this generated file and the value
// emitVtableStub() sizes each stub's transact buffer against can never
// drift apart.
#define STRING_RETURN_BUF_BYTES ${STRING_RETURN_BUF_BYTES}
// quick 261026-rqb: transact buffer for a string reply, 4 + the helper's max encode.
#define STRING_RETURN_WIRE_BYTES ${STRING_RETURN_WIRE_BYTES}

/*
${wireLayoutDocFor(manifests)}
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

// WR-03: the per-launch secret from gamelib_bridge.cfg's \`secret=\` line.
// The helper's loopback listener is reachable by any local user and its
// callback ring can hold a web-API auth ticket, so every new socket
// authenticates with HELLO(secret) before it is used. Threat model: other OS
// users / processes that cannot read this user's files; a same-user attacker
// can read the cfg and is out of scope. 0 until a valid line is parsed --
// bridge_ensure_connected() refuses to connect while it is 0 (fail closed).
static char g_bridge_secret[BRIDGE_SECRET_HEX_LEN];
static int g_bridge_secret_loaded = 0;

// 51-07: an identity marker the version-capture pass can grep the shipped
// DLL for, so it never mistakes a GameLib shim for a game's own original
// steam_api.dll. Referenced from SteamAPI_Init() through a store to a
// volatile pointer object below so neither the linker nor -O2 can drop it.
static const char g_gamelib_shim_marker[] = "GameLibSteamBridgeShim/2";

/*
 * Scans \`buf\` (the raw bytes read from gamelib_bridge.cfg) line-by-line
 * for a \`port=<digits>\` line and, if its value parses as a valid
 * ephemeral/registered port (1024-65535), assigns g_bridge_port; and for a
 * \`secret=<64 lowercase hex>\` line (WR-03), which is accepted only when its
 * value is exactly BRIDGE_SECRET_HEX_LEN chars of [0-9a-f]. iface.* lines are
 * collected for the interface-version pool. Any other line (appid=, a
 * trailing blank line) is silently skipped.
 */
static void parse_bridge_port_from_buffer(const char *buf, uint32_t len) {
  uint32_t i = 0;
  while (i < len) {
    uint32_t lineStart = i;
    while (i < len && buf[i] != '\\n' && buf[i] != '\\r') i++;
    uint32_t lineLen = i - lineStart;
    if (lineLen == 7 + BRIDGE_SECRET_HEX_LEN && strncmp(buf + lineStart, "secret=", 7) == 0) {
      int hexOk = 1;
      for (uint32_t k = 0; k < BRIDGE_SECRET_HEX_LEN; k++) {
        char ch = buf[lineStart + 7 + k];
        if (!((ch >= '0' && ch <= '9') || (ch >= 'a' && ch <= 'f'))) { hexOk = 0; break; }
      }
      if (hexOk) {
        memcpy(g_bridge_secret, buf + lineStart + 7, BRIDGE_SECRET_HEX_LEN);
        g_bridge_secret_loaded = 1;
      }
    } else if (lineLen > 5 && strncmp(buf + lineStart, "port=", 5) == 0) {
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

/*
 * WR-03: authenticates a freshly connected socket -- one HELLO carrying the
 * launch secret, success only on an OK reply with an empty return blob.
 * Written directly against \`s\` (never through bridge_transact*, which would
 * recurse into bridge_ensure_connected); callers already hold g_bridge_lock.
 */
static int bridge_handshake(SOCKET s) {
  uint32_t requestId = g_next_request_id++;
  uint16_t ordinal = BRIDGE_CONTROL_ORDINAL;
  uint16_t slot = BRIDGE_CONTROL_SLOT_HELLO;
  uint32_t frameLen = 4 + 2 + 2 + BRIDGE_SECRET_HEX_LEN;
  uint8_t header[12];
  memcpy(header + 0, &frameLen, 4);
  memcpy(header + 4, &requestId, 4);
  memcpy(header + 8, &ordinal, 2);
  memcpy(header + 10, &slot, 2);
  if (send(s, (const char *)header, sizeof(header), 0) != (int)sizeof(header)) return 0;
  if (send(s, g_bridge_secret, BRIDGE_SECRET_HEX_LEN, 0) != (int)BRIDGE_SECRET_HEX_LEN) return 0;
  uint8_t respHeader[9];
  if (recv(s, (char *)respHeader, sizeof(respHeader), MSG_WAITALL) != (int)sizeof(respHeader)) return 0;
  uint32_t respLen, respRequestId;
  memcpy(&respLen, respHeader + 0, 4);
  memcpy(&respRequestId, respHeader + 4, 4);
  return respRequestId == requestId && respLen == 5 && respHeader[8] == 0;
}

static int bridge_ensure_connected(void) {
  if (g_bridge_sock != INVALID_SOCKET) return 1;
  load_bridge_port_once();
  // D-51-01: fail closed -- never falls back to a fixed/guessed port.
  if (g_bridge_port == 0) return 0;
  // WR-03: fail closed on a missing/invalid secret= line too -- the helper
  // would refuse every authenticated slot anyway.
  if (!g_bridge_secret_loaded) return 0;
  WSADATA w;
  if (WSAStartup(MAKEWORD(2, 2), &w) != 0) return 0;
  SOCKET s = socket(AF_INET, SOCK_STREAM, 0);
  struct sockaddr_in a; memset(&a, 0, sizeof a);
  a.sin_family = AF_INET;
  a.sin_port = htons((uint16_t)g_bridge_port);
  a.sin_addr.s_addr = inet_addr("127.0.0.1"); // loopback-only, never a routable interface
  if (connect(s, (struct sockaddr *)&a, sizeof a) != 0) { closesocket(s); return 0; }
  // WR-03: EVERY new socket authenticates before it is published as
  // g_bridge_sock. This is what keeps the helper's 5 s SO_RCVTIMEO idle close
  // and the WR-02 oversize-reply drop harmless: the reconnect re-authenticates
  // and still reaches the ring. The ring is bound to the launch secret, not
  // to a socket, so the helper never clears it on accept or close.
  if (!bridge_handshake(s)) { closesocket(s); return 0; }
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
  if (respLen < 5) { *transportFailed = 1; return 0; } // malformed frame -- respLen must cover request_id(4) + status(1)
  if (status != 0) return 0; // legitimate error response -- healthy connection, do not retry

  uint32_t retLen = respLen - 5; // subtract request_id(4) + status(1)
  if (retLen > retBufCap) {
    // 55 WR-02: caller-buffer mismatch. The retLen payload bytes (possibly an
    // auth ticket) are still unread on the socket and would be parsed as the
    // next response header, so drop the connection -- the next call
    // reconnects. Deliberately NOT *transportFailed: the helper already
    // answered (and, for DRAIN, already popped the message), so a resend
    // would repeat a non-idempotent request.
    closesocket(g_bridge_sock);
    g_bridge_sock = INVALID_SOCKET;
    return 0;
  }
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
  if (!bridge_transact(BRIDGE_CONTROL_ORDINAL, BRIDGE_CONTROL_SLOT_HELLO, (const uint8_t *)g_bridge_secret, BRIDGE_SECRET_HEX_LEN, retbuf, sizeof(retbuf), &retlen)) return 0;
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

/* quick 261027-k51: the game called ISteamUserStats::RequestCurrentStats (a
 * shim-local fallback; the Mac libsteam_api has no such export). Tell the
 * helper so it can forward a UserStatsReceived_t (1101). Result ignored, never
 * touches the caller's return value, NO one-shot latch: every call must reach
 * the helper, which bounds the work with its one-fetch-in-flight rule and log
 * cap. An old helper answers STATUS_ERR, which is harmless. Holds no lock
 * itself (bridge_transact takes g_bridge_lock). */
__attribute__((noinline)) static void gamelib_request_current_stats(void) {
  uint8_t retbuf[1]; uint32_t retlen = 0;
  (void)bridge_transact(BRIDGE_CONTROL_ORDINAL, BRIDGE_CONTROL_SLOT_REQUEST_CURRENT_STATS, NULL, 0, retbuf, sizeof(retbuf), &retlen);
}

/* quick 261027-jgs: report the first call of a locally-answered site (STUBCALL
 * in the helper log). st[0] = reported flag, st[1] = attempts. One-shot per
 * site; the flag is re-armed when bridge_transact fails (no helper, before
 * HELLO, old helper), bounded at 3 attempts per site. Holds no lock itself
 * (bridge_transact takes g_bridge_lock), never touches the caller's return
 * value or out-params, and is noinline because it is a cold path and to keep
 * the ABI-gate shapes of every stub a simple "call, then set the return".
 * A NULL method means mlen 0 (x64 null objects). Unguarded: x86 needs it too. */
__attribute__((noinline)) static void gamelib_stubcall_note(volatile LONG *st, const char *ver, const char *method, uint32_t slot, uint32_t kind) {
  uint8_t req[16 + 128 + 128];
  uint8_t retbuf[1]; uint32_t retlen = 0;
  uint32_t vlen = 0, mlen = 0;
  if (InterlockedCompareExchange(&st[0], 1, 0) != 0) return;
  if (InterlockedIncrement(&st[1]) > 3) return;
  while (vlen < 128 && ver[vlen] != '\0') vlen++;
  if (method != NULL) { while (mlen < 128 && method[mlen] != '\0') mlen++; }
  memcpy(req, &kind, 4);
  memcpy(req + 4, &slot, 4);
  memcpy(req + 8, &vlen, 4);
  memcpy(req + 12, &mlen, 4);
  memcpy(req + 16, ver, vlen);
  if (mlen > 0) memcpy(req + 16 + vlen, method, mlen);
  if (!bridge_transact(BRIDGE_CONTROL_ORDINAL, BRIDGE_CONTROL_SLOT_REPORT_STUB_CALL, req, 16 + vlen + mlen, retbuf, sizeof(retbuf), &retlen)) {
    InterlockedExchange(&st[0], 0);
  }
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
static int gl_cb_transport_drain_cr(uint8_t *buf, uint32_t cap, uint32_t *lenOut) {
  return bridge_transact(BRIDGE_CONTROL_ORDINAL, BRIDGE_CONTROL_SLOT_DRAIN_CALL_RESULTS, NULL, 0, buf, cap, lenOut);
}
#if !defined(__i386__)
static int gl_cb_transport_drain_mms(uint8_t *buf, uint32_t cap, uint32_t *lenOut) {
  return bridge_transact(BRIDGE_CONTROL_ORDINAL, BRIDGE_CONTROL_SLOT_DRAIN_SERVER_EVENTS, NULL, 0, buf, cap, lenOut);
}
static int gl_mms_transport(uint16_t slot, const uint8_t *req, uint32_t reqLen, uint8_t *resp, uint32_t cap, uint32_t *lenOut) {
  return bridge_transact(${MMS_ORDINAL}, slot, req, reqLen, resp, cap, lenOut);
}
#endif
/* quick 261027-k51: report one relayed callback the registry dispatched or held
 * (the helper logs CBDISP). Third word = kind: 0 dispatched/dropped, 1 held,
 * 2 call result delivered (quick 261031-ixa). Per-id budget of 4: one
 * process-wide cap of 16 was spent by early 1281/1222 traffic and by refused
 * 703 reports. Ids outside gl_cb_report_ids[] (703, which the helper refuses)
 * spend nothing. quick-261101-ip5: 1202 (P2PSessionRequest_t) is exempt from
 * the budget, because the helper's legacy-P2P fallback pops one served remote
 * per 1202 report (WR-07, quick-261101-iah) and a capped report would stop
 * pairing after four; the helper's per-id CBDISP log budget still bounds the
 * log, and a 1202 report is one round trip per 1202, bounded by the drain's
 * per-run cap. The registry calls this with no lock held. The result is
 * ignored. */
static const int32_t gl_cb_report_ids[] = { ${REPORT_IDS_C} };
static volatile LONG g_gl_cb_report_n[${REPORT_IDS_N}];
static void gl_cb_report_dispatch(int32_t id, uint32_t ndispatched, uint32_t held) {
  uint8_t req[12];
  uint8_t retbuf[1]; uint32_t retlen = 0;
  uint32_t i;
  for (i = 0; i < ${REPORT_IDS_N}u; i++) if (gl_cb_report_ids[i] == id) break;
  if (i == ${REPORT_IDS_N}u) return;
  if (id != ${CALLBACK_LAYOUTS.P2PSessionRequest_t.id} && InterlockedIncrement(&g_gl_cb_report_n[i]) > 4) return;
  memcpy(req, &id, 4);
  memcpy(req + 4, &ndispatched, 4);
  memcpy(req + 8, &held, 4);
  (void)bridge_transact(BRIDGE_CONTROL_ORDINAL, BRIDGE_CONTROL_SLOT_REPORT_CB_DISPATCH, req, 12, retbuf, sizeof(retbuf), &retlen);
}
/* quick 261106-qvp: {i32 iCallback, u32 path}; the registry calls this with no lock held. The result is ignored. */
static void gl_cb_report_register(int32_t id, uint32_t path) {
  uint8_t req[8];
  uint8_t retbuf[1]; uint32_t retlen = 0;
  memcpy(req, &id, 4);
  memcpy(req + 4, &path, 4);
  (void)bridge_transact(BRIDGE_CONTROL_ORDINAL, BRIDGE_CONTROL_SLOT_REPORT_CB_REGISTER, req, 8, retbuf, sizeof(retbuf), &retlen);
}
${NETWORKING_LOCAL_C}
${generateCallbackRegistryC()}

typedef void *vfn;

// 51-15: Win64 unknown-interface-version fallback -- see X64_NULL_OBJECT_SLOTS'
// doc comment (meta/gen_vtables.ts) for why a zero-returning function safely
// serves every slot's arity on this target (Win64 is caller-cleans, so a
// per-slot thunk is arity-safe). quick-261027-i4x: versions Proton ships with
// sret slots get a per-EXACT-version null object (sret slots zero-fill and
// return RDX, and report their first call as NULLSRET); x64_null_object_for_version
// picks it, and any other version gets a pooled instance (or the generic one
// for NULL / a full pool). quick-261027-jgs: every non-sret slot is a per-slot
// thunk that reports its first call per (instance, slot) as STUBCALL kind=null
// and still returns 0 in RAX. XMM0 for a float-returning null slot was never
// set and is still unspecified.
#if defined(__x86_64__)
__attribute__((noinline)) static void x64_null_call_note(void *self, uint32_t slot);
${Array.from({ length: X64_NULL_OBJECT_SLOTS }, (_, i) => `static void *vt_x64_null_s${i}(void *self) { x64_null_call_note(self, ${i}); return 0; }`).join('\n')}
static vfn g_x64_null_object_vtbl[${X64_NULL_OBJECT_SLOTS}] = {
${Array.from({ length: X64_NULL_OBJECT_SLOTS }, (_, i) => `  (vfn)vt_x64_null_s${i},`).join('\n')}
};
struct GLibX64NullObject { vfn *vptr; };
static struct GLibX64NullObject g_x64_null_object_instance = { g_x64_null_object_vtbl };
${emitX64NullSretObjects(manifests, options.x64NullSretInventory)}#endif

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
    `\n// 58-14: the SDK's flat-only ISteamNetworkingUtils inline helpers.\n` +
    NETWORKING_UTILS_FLAT_INLINE_NAMES.map(
      (name) => NETWORKING_UTILS_FLAT_INLINE[name]
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
  return (
    mode === 'wire' &&
    method.helperFallback === undefined &&
    // 58-06: a shimLocal method never produces a generic frame, so it has no
    // helper case -- unless (58-14) it also names a helperCustom function,
    // which the shim body reaches through gl_bridge_call_raw.
    (method.shimLocal !== true || method.helperCustom !== undefined)
  )
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
    .map((p) => {
      const base = `${p.name}:${p.type}:${p.kind ?? 'value'}:${p.valueType ?? ''}:${p.sizeParam ?? ''}`
      // 58-06: the extra layout fields join the key only when present, so a
      // method that uses none of them hashes exactly as it did before.
      const extra = [
        NEW_WIRE_KINDS.has(p.kind ?? 'value') && p.lenParam !== undefined
          ? `len=${p.lenParam}`
          : '',
        p.structSize !== undefined ? `struct=${p.structSize}` : '',
        p.capBytes !== undefined ? `cap=${p.capBytes}` : '',
        p.countParam !== undefined ? `count=${p.countParam}` : ''
      ].filter(Boolean)
      return extra.length > 0 ? `${base}:${extra.join(':')}` : base
    })
    .join(',')
  const custom =
    method.helperCustom !== undefined ? `:custom=${method.helperCustom}` : ''
  return `${method.returnKind}:${method.structSize ?? ''}:${paramsDesc}${custom}`
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

/**
 * 58-06: the helper's response scratch size for a manifest set -- at least
 * BRIDGE_DISPATCH_RESP_SCRATCH_BYTES, and large enough for the biggest
 * response a method with an out-struct or an out-buffer `capBytes` override
 * can produce. Methods without either clamp to the scratch (53-14) and do not
 * raise it, so today's manifests keep the minimum.
 */
export function computeDispatchRespScratchBytes(
  manifests: InterfaceManifestV2[]
): number {
  let max = BRIDGE_DISPATCH_RESP_SCRATCH_BYTES
  for (const manifest of manifests) {
    for (const method of manifest.methods) {
      if (!isWireDispatchMethod(manifest, method)) continue
      if (method.helperCustom !== undefined) continue
      const big = method.params.some(
        (p) => p.kind === 'out-struct' || p.capBytes !== undefined
      )
      if (!big) continue
      let need = dispatchReturnWidth(method) ?? 0
      for (const p of method.params) {
        const k = p.kind ?? 'value'
        if (k === 'out-value') need += valueTypeWidth(p.valueType ?? 'int32')
        else if (k === 'out-buffer') need += 4 + (p.capBytes ?? 0)
        else if (k === 'out-struct') need += 1 + (p.structSize ?? 0)
      }
      max = Math.max(max, need)
    }
  }
  return max
}

/** Max bytes `GetPersonaName`'s (and any future string-returning dispatch
 * method's) helper-side encode will copy out of the native flat accessor's
 * returned `const char *` -- CR-01's own reasoning applied to the OTHER
 * direction of the wire: the helper owns a bounded local copy, never trusts
 * an unbounded `strlen()` off a pointer it does not control the lifetime
 * of. 255 (not 256) leaves room for the `\0` protocol.ts's own decode never
 * needs on the wire (the length-prefixed blob has no terminator), matching
 * `k_cchPersonaNameMax` - 1. */
export const DISPATCH_STRING_RETURN_MAX_BYTES = 255

/** Bytes of the shim's string-return transact buffer: the helper's largest
 * encode, `[u32 len]` + DISPATCH_STRING_RETURN_MAX_BYTES. Sized so a
 * maximal string never trips bridge_transact's oversize-response drop. */
export const STRING_RETURN_WIRE_BYTES = 4 + DISPATCH_STRING_RETURN_MAX_BYTES

/**
 * Helper-side string-return encode (`[u32 len][bytes]`), from the NULL check
 * through `return 0;`. Single source: the dispatch generator emits it and the
 * round-trip harness compiles it (quick 261026-rqb).
 */
export function emitStringReturnEncodeLines(resultVar: string): string[] {
  return [
    `      if (${resultVar} == NULL) { *respLen = 0; return 1; }`,
    `      uint32_t strLen = (uint32_t)strlen(${resultVar});`,
    `      if (strLen > ${DISPATCH_STRING_RETURN_MAX_BYTES}) strLen = ${DISPATCH_STRING_RETURN_MAX_BYTES};`,
    `      if (respCap < 4 + strLen) { *respLen = 0; return 1; }`,
    `      memcpy(resp, &strLen, 4);`,
    `      memcpy(resp + 4, ${resultVar}, strLen);`,
    `      *respLen = 4 + strLen;`,
    `      return 0;`
  ]
}

/**
 * Shim-side string-return decode, run after a successful bridge_transact.
 * Reads `[u32 len][bytes]` from retbuf/retlen. The declared length is
 * untrusted: accepted only when retlen >= 4, len <= retlen - 4 and
 * len < STRING_RETURN_BUF_BYTES; anything else yields "".
 */
export function emitStringReturnDecode(bufName: string): string {
  return (
    `  uint32_t declLen = 0;\n` +
    `  if (retlen < 4) { ${bufName}[0] = '\\0'; return ${bufName}; }\n` +
    `  memcpy(&declLen, retbuf, 4);\n` +
    `  if (declLen > retlen - 4 || declLen >= STRING_RETURN_BUF_BYTES) { ${bufName}[0] = '\\0'; return ${bufName}; }\n` +
    `  memcpy(${bufName}, retbuf + 4, declLen);\n` +
    `  ${bufName}[declLen] = '\\0';\n` +
    `  return ${bufName};\n`
  )
}

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
  // 58-06: a helperCustom function produces the whole response blob itself,
  // so the generic return-shape and out-param limits below do not apply.
  if (method.helperCustom !== undefined) return
  if (method.returnKind !== 'string' && dispatchReturnWidth(method) === null) {
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
    return k === 'out-value' || k === 'out-buffer' || k === 'out-struct'
  })
  if (
    hasOutValue &&
    (method.returnKind === 'void' || method.returnKind === 'string')
  ) {
    throw new Error(
      `generateDispatchHeader: ${ctx} has returnKind "${method.returnKind}" with an 'out-value' param -- appending out-value response bytes after a void/string base return is deferred to a future plan, never silently wrong (51-10/51-11)`
    )
  }
  // 53-14: out-buffer dispatch is supported for one out-buffer per method,
  // whose sizeParam is a sibling by-value scalar. 58-12: several out-buffers
  // are allowed only when each declares its own capBytes, so the response
  // scratch (computeDispatchRespScratchBytes) is sized from explicit caps and
  // never from an unbounded default.
  const outBuffers = method.params.filter(
    (p) => (p.kind ?? 'value') === 'out-buffer'
  )
  if (
    outBuffers.length > 1 &&
    outBuffers.some((p) => p.capBytes === undefined)
  ) {
    throw new Error(
      `generateDispatchHeader: ${ctx} declares ${outBuffers.length} out-buffer params -- helper-side dispatch needs a capBytes on each when there is more than one (58-12), never silently wrong`
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

/** Max bytes of a game-supplied version string a FWD log line carries. */
const FWD_VERSION_LOG_MAX_BYTES = 128

/** GameLib-authored helper header declaring gl_helper_cr_track and
 * gl_net_evidence (never a vendored Valve header; D-09). */
const HELPER_CALLRESULT_HEADER = 'gamelib_callresult.h'

function netIfaceEnum(iface: NetEvidenceIface): string {
  return `GL_NET_IFACE_${iface.toUpperCase()}`
}

/** Helper hook calls that follow `__ret = <native call>` (58-10): record a
 * returned SteamAPICall_t, and log send/recv NET evidence for a successful
 * networking call. Empty for a method that declares neither. */
function emitPolicyHooks(method: MethodSignature): string[] {
  const out: string[] = []
  if (method.callResult !== undefined) {
    out.push(
      `      if (__ret != 0) gl_helper_cr_track((uint64_t)__ret, ${method.callResult});`
    )
  }
  if (method.evidence !== undefined) {
    const inBuf = method.params.find((p) => p.kind === 'in-buffer')
    const kind = `GL_NET_KIND_${method.evidence.kind.toUpperCase()}`
    const iface = netIfaceEnum(method.evidence.iface)
    if (method.returns === 'bool') {
      const n = inBuf ? `arg_${inBuf.name}_len` : '1u'
      out.push(
        `      if (__ret) gl_net_evidence(1, ${kind}, ${iface}, 0, ${n}, GL_NET_PATH_UNKNOWN);`
      )
    } else {
      out.push(
        `      if (__ret > 0) gl_net_evidence(1, ${kind}, ${iface}, 0, (uint32_t)__ret, GL_NET_PATH_UNKNOWN);`
      )
    }
  }
  return out
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

  // 58-06: a helperCustom method hands the raw request blob to its named
  // helper function, which produces the whole response blob. It returns 0 for
  // ok; anything else (or a length past respCap) is a STATUS_ERR.
  if (method.helperCustom !== undefined) {
    lines.push(
      `      { uint32_t customLen = 0; // helperCustom ${method.helperCustom}`,
      `        if (${method.helperCustom}(${selfVar}, arg, argLen, resp, respCap, &customLen) != 0 || customLen > respCap) { *respLen = 0; return 1; }`,
      `        *respLen = customLen; return 0; }`,
      `    }`
    )
    return lines.join('\n')
  }

  // --- request decode (value / in-string only -- assertDispatchable above
  // refuses out-value/out-buffer) ---
  const oversizeIface = FAMILY_NET_IFACE[manifest.family]
  const decls: string[] = []
  const lenChecks: string[] = []
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
    if (kind === 'in-buffer') {
      // 58-06 (T-58-16): the declared length is checked against the cap and
      // against the bytes actually remaining BEFORE any copy; an oversize
      // length (the shim's cap+1 marker) is refused, never truncated.
      const bufName = `${flatVar}_${p.name}_buf`
      decls.push(
        `      static uint8_t ${bufName}[${WIRE_IN_BUFFER_MAX_BYTES}];`,
        `      uint32_t ${varName}_len = 0;`,
        `      if (argLen < ${offsetExpr} + 4) { *respLen = 0; return 1; }`,
        `      memcpy(&${varName}_len, arg + ${offsetExpr}, 4);`,
        ...(oversizeIface !== undefined
          ? [
              `      if (${varName}_len > ${WIRE_IN_BUFFER_MAX_BYTES}) { gl_net_evidence(1, GL_NET_KIND_OVERSIZE, ${netIfaceEnum(oversizeIface)}, 0, ${varName}_len, GL_NET_PATH_UNKNOWN); *respLen = 0; return 1; } // oversize refusal is NET evidence -- 58-10`
            ]
          : []),
        `      if (${varName}_len > ${WIRE_IN_BUFFER_MAX_BYTES} || (uint64_t)argLen < (uint64_t)(${offsetExpr}) + 4u + ${varName}_len) { *respLen = 0; return 1; } // in-buffer past cap or argLen -- T-58-16`,
        `      memcpy(${bufName}, arg + ${offsetExpr} + 4, ${varName}_len);`,
        `      const void *${varName} = ${bufName};`
      )
      lenChecks.push(
        `      if ((int64_t)arg_${p.lenParam} != (int64_t)${varName}_len) { *respLen = 0; return 1; } // lenParam must equal the bytes sent -- T-58-16`
      )
      callArgs.push(varName)
      offsetExpr = `(${offsetExpr} + 4 + ${varName}_len)`
      continue
    }
    if (kind === 'in-struct') {
      const size = p.structSize ?? 0
      decls.push(
        `      uint8_t ${varName}_buf[${size}];`,
        `      const void *${varName} = NULL;`,
        `      uint32_t ${varName}_present = 0;`,
        `      if (argLen < ${offsetExpr} + 1) { *respLen = 0; return 1; }`,
        `      ${varName}_present = arg[${offsetExpr}];`,
        `      if (${varName}_present > 1) { *respLen = 0; return 1; }`,
        `      if (${varName}_present == 1) {`,
        `        if ((uint64_t)argLen < (uint64_t)(${offsetExpr}) + 1u + ${size}u) { *respLen = 0; return 1; }`,
        `        memcpy(${varName}_buf, arg + ${offsetExpr} + 1, ${size});`,
        `        ${varName} = ${varName}_buf;`,
        `      }`
      )
      callArgs.push(varName)
      offsetExpr = `(${offsetExpr} + 1 + ${varName}_present * ${size}u)`
      continue
    }
    if (kind === 'out-struct') {
      // 58-06: nothing is read from the request; the native call fills a
      // zeroed helper-owned buffer and the response carries [u8 1][bytes].
      const size = p.structSize ?? 0
      decls.push(
        `      uint8_t ${varName}_buf[${size}];`,
        `      memset(${varName}_buf, 0, ${size});`
      )
      callArgs.push(`${varName}_buf`)
      continue
    }
    if (kind === 'out-buffer') {
      // 53-14: request carries [u32 capacity] (WIRE_LAYOUT_DOC). The data
      // lives in a helper-owned static buffer -- the game's pointer is never
      // sent. Capacity is clamped to BD_WIRE_OUT_BUFFER_MAX_BYTES and to what
      // the response scratch can still carry after the fixed fields.
      const bufName = `${flatVar}_${p.name}_buf`
      const capName = `cap_${p.name}`
      // 58-06: a capBytes override sizes this one buffer; otherwise the
      // shared macro, so existing output is unchanged.
      const capLimit =
        p.capBytes !== undefined
          ? String(p.capBytes)
          : 'BD_WIRE_OUT_BUFFER_MAX_BYTES'
      const outValueWidth = method.params
        .filter((q) => (q.kind ?? 'value') === 'out-value')
        .reduce((sum, q) => sum + valueTypeWidth(q.valueType ?? 'int32'), 0)
      const outStructWidth = method.params
        .filter((q) => (q.kind ?? 'value') === 'out-struct')
        .reduce((sum, q) => sum + 1 + (q.structSize ?? 0), 0)
      const outBufferCount = method.params.filter(
        (q) => (q.kind ?? 'value') === 'out-buffer'
      ).length
      const fixed =
        (dispatchReturnWidth(method) ?? 0) +
        outValueWidth +
        outStructWidth +
        4 * outBufferCount
      decls.push(
        `      static uint8_t ${bufName}[${capLimit}];`,
        `      uint32_t ${capName} = 0;`,
        `      if (argLen < ${offsetExpr} + 4) { *respLen = 0; return 1; }`,
        `      memcpy(&${capName}, arg + ${offsetExpr}, 4);`,
        `      if (${capName} > ${capLimit}) ${capName} = ${capLimit};`,
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
  lines.push(...lenChecks)

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
  if (method.returnKind === 'void') {
    lines.push(`      ${callExpr};`)
    lines.push(`      *respLen = 0; return 0;`)
  } else if (method.returnKind === 'string') {
    lines.push(
      `      const char *result = ${callExpr};`,
      ...emitStringReturnEncodeLines('result')
    )
  } else {
    const width = dispatchReturnWidth(method)
    const outValueParams = method.params.filter(
      (p) => (p.kind ?? 'value') === 'out-value'
    )
    const outBufferParams = method.params.filter(
      (p) => (p.kind ?? 'value') === 'out-buffer'
    )
    const outStructParams = method.params.filter(
      (p) => (p.kind ?? 'value') === 'out-struct'
    )
    if (
      outValueParams.length === 0 &&
      outBufferParams.length === 0 &&
      outStructParams.length === 0
    ) {
      lines.push(
        `      ${returnType} __ret = ${callExpr};`,
        ...emitPolicyHooks(method),
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
        outBufferParams.length * 4 +
        outStructParams.reduce((sum, p) => sum + 1 + (p.structSize ?? 0), 0)
      lines.push(
        `      ${returnType} __ret = ${callExpr};`,
        ...emitPolicyHooks(method),
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
      const multiBuf = outBufferParams.length > 1
      if (multiBuf) lines.push(`      uint32_t bufOff = ${offset};`)
      for (const p of outBufferParams) {
        const bufName = `${flatVar}_${p.name}_buf`
        lines.push(`      uint32_t outLen_${p.name} = cap_${p.name};`)
        if (p.lenParam) {
          lines.push(
            `      if ((uint32_t)arg_${p.lenParam} < outLen_${p.name}) outLen_${p.name} = (uint32_t)arg_${p.lenParam};`
          )
        }
        if (multiBuf) {
          // 58-12: out-buffers follow each other, each [u32 len][bytes]; the
          // running offset is checked against respCap before every copy.
          lines.push(
            `      if (respCap < bufOff + 4 + outLen_${p.name}) { *respLen = 0; return 1; }`,
            `      memcpy(resp + bufOff, &outLen_${p.name}, 4);`,
            `      memcpy(resp + bufOff + 4, ${bufName}, outLen_${p.name});`,
            `      bufOff += 4 + outLen_${p.name};`
          )
        } else {
          lines.push(
            `      memcpy(resp + ${offset}, &outLen_${p.name}, 4);`,
            `      memcpy(resp + ${offset} + 4, ${bufName}, outLen_${p.name});`
          )
        }
      }
      if (outStructParams.length > 0) {
        // 58-06: out-structs trail the out-buffers -- [u8 1][structSize bytes].
        const last = outBufferParams[0]
        lines.push(
          outBufferParams.length > 1
            ? `      uint32_t respEnd = bufOff;`
            : `      uint32_t respEnd = ${offset}${last ? ` + 4 + outLen_${last.name}` : ''};`
        )
        for (const p of outStructParams) {
          lines.push(
            `      resp[respEnd] = 1; memcpy(resp + respEnd + 1, arg_${p.name}_buf, ${p.structSize}); respEnd += 1 + ${p.structSize};`
          )
        }
        lines.push(`      *respLen = respEnd;`, `      return 0;`)
      } else if (outBufferParams.length > 0) {
        const last = outBufferParams[0]
        lines.push(
          outBufferParams.length > 1
            ? `      *respLen = bufOff;`
            : `      *respLen = ${offset} + 4 + outLen_${last.name};`,
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

  // 58-06: one prototype per distinct helperCustom function, emitted only
  // when some manifest uses one so the helper compiles without any defined.
  const customNames = [
    ...new Set(
      dispatchManifests.flatMap((m) =>
        m.methods
          .filter((method) => isWireDispatchMethod(m, method))
          .flatMap((method) =>
            method.helperCustom !== undefined ? [method.helperCustom] : []
          )
      )
    )
  ].sort()
  const customPrototypes = customNames
    .map(
      (name) =>
        `// 58-06: hand-written in bridge_helper.c; returns 0 for ok.\n` +
        `int ${name}(void *self, const uint8_t *args, uint32_t argLen, uint8_t *resp, uint32_t respCap, uint32_t *respLen);\n\n`
    )
    .join('')

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
            ...method.params.map((p) => {
              const k = p.kind ?? 'value'
              if (k === 'null-in' || k === 'in-buffer' || k === 'in-struct')
                return 'const void *'
              if (k === 'out-struct') return 'void *'
              return dispatchCType(p.type)
            }),
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
    `#include <string.h>\n` +
    `#include "${HELPER_CALLRESULT_HEADER}"\n\n` +
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
    `/*\n${wireLayoutDocFor(manifests)}*/\n` +
    `#define BD_WIRE_IN_STRING_MAX_BYTES ${WIRE_IN_STRING_MAX_BYTES}\n` +
    `#define BD_WIRE_OUT_BUFFER_MAX_BYTES ${WIRE_OUT_BUFFER_MAX_BYTES}\n\n` +
    `// Digest of the SAME sorted (interface, ordinal, slot, layout) wire-method\n` +
    `// tuples BRIDGE_SHIM_TABLE_HASH (steam_api_shim.c) embeds -- a drift\n` +
    `// between the two means the shim and this dispatch table disagree about\n` +
    `// what is on the wire.\n` +
    `#define BRIDGE_DISPATCH_TABLE_HASH "${computeWireTableHash(manifests)}"\n\n` +
    `// Response scratch -- bridge_dispatch() never writes past respCap, which\n` +
    `// the caller (bridge_helper.c) sizes to this constant.\n` +
    `#define BRIDGE_DISPATCH_RESP_SCRATCH_BYTES ${computeDispatchRespScratchBytes(manifests)}\n\n` +
    `${accessorTypedefs}\n` +
    customPrototypes +
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
  const accessorExports = sortedManifests.flatMap((m) => [
    flatAccessorName(m),
    ...flatAccessorAliasNames(m)
  ])
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
          ...NETWORKING_UTILS_FLAT_INLINE_NAMES,
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

  const nullSretPath = join(SDK_DIR, 'x64-null-sret-inventory.json')
  if (!existsSync(nullSretPath)) {
    throw new Error(
      `gen_vtables: ${nullSretPath} is missing -- regenerate it with ` +
        '`pnpm extract-proton-inventory --null-sret-inventory`'
    )
  }
  const x64NullSretInventory = JSON.parse(
    readFileSync(nullSretPath, 'utf-8')
  ) as NullSretInventory

  const shimC = generateShimC(manifests, { x64NullSretInventory })
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
