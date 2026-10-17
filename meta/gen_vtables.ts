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
    default:
      return type.endsWith('*') ? type : 'uint32_t'
  }
}

/** "SteamUser023" -> "SteamUser_v023"; "SteamFriends018" -> "SteamFriends_v018" */
export function toVersionedAccessorSuffix(interfaceName: string): string {
  const match = interfaceName.match(/^([A-Za-z]+)(\d+)$/)
  if (!match) return interfaceName
  return `${match[1]}_v${match[2]}`
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

const FLAT_EXPORT_BODIES: Record<
  (typeof FLAT_EXPORTS_SUPERSET)[number],
  string
> = {
  SteamAPI_Init:
    'int SteamAPI_Init(void) {\n' +
    '  volatile const char *gamelib_marker_keepalive = g_gamelib_shim_marker;\n' +
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

// ---------------------------------------------------------------------------
// Vtable stub emission
// ---------------------------------------------------------------------------

function packArgsBlock(method: MethodSignature): {
  decl: string
  lenExpr: string
} {
  if (method.params.length === 0) {
    return { decl: '  const uint8_t *argbuf = NULL;', lenExpr: '0' }
  }
  const totalLen = method.params.reduce((sum, p) => sum + paramWidth(p.type), 0)
  const lines: string[] = [`  uint8_t argbuf[${totalLen}];`]
  let offset = 0
  for (const p of method.params) {
    const width = paramWidth(p.type)
    lines.push(`  memcpy(argbuf + ${offset}, &${p.name}, ${width});`)
    offset += width
  }
  return { decl: lines.join('\n'), lenExpr: String(totalLen) }
}

function emitVtableStub(
  manifest: InterfaceManifest,
  method: MethodSignature
): string {
  const retN = computeRetN(method)
  const sret = isSretReturn(method)
  const stringReturn = isStringReturn(method)
  const funcName = `vt_${manifest.interface}_${method.name}`

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
  const noteLine = method.note ? `// NOTE: ${method.note}\n` : ''
  const header =
    `// slot ${method.slot}: ${method.name}(${descParams}) -> ${method.returns} ` +
    `| __thiscall ret ${retN}${sretDesc}${stringDesc}\n${noteLine}`

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
// steam_api.dll. Referenced from SteamAPI_Init() through a volatile read
// below so the linker cannot dead-strip it as unused.
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
      return;
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

`

  const vtableSections = sortedManifests
    .map((m) => {
      const stubs = [...m.methods]
        .sort((a, b) => a.slot - b.slot)
        .map((method) => emitVtableStub(m, method))
        .join('\n')
      return (
        `// === ${m.interface} (ordinal ${m.ordinal}, family ${m.family}) ===\n\n` +
        `${stubs}\n${emitVtableArray(m)}`
      )
    })
    .join('\n')

  const flatExports = FLAT_EXPORTS_SUPERSET.map(
    (name) => FLAT_EXPORT_BODIES[name]
  ).join('\n')
  const accessors = sortedManifests.map((m) => emitFlatAccessor(m)).join('')

  return (
    `${header}${vtableSections}\n` +
    `// === Flat SteamAPI_* exports (acceptance-set superset, R3 finding #9) ===\n\n` +
    `${flatExports}\n\n` +
    `// === Per-interface flat accessors ===\n\n` +
    `${accessors}`
  )
}

export function generateDefFile(manifests: InterfaceManifest[]): string {
  const sortedManifests = [...manifests].sort((a, b) => a.ordinal - b.ordinal)
  const accessorExports = sortedManifests.map((m) => flatAccessorName(m))
  const lines = [
    'LIBRARY steam_api',
    'EXPORTS',
    ...FLAT_EXPORTS_SUPERSET,
    ...accessorExports
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
  const defFile = generateDefFile(manifests)

  writeFileSync(join(OUT_DIR, 'steam_api_shim.c'), shimC)
  writeFileSync(join(OUT_DIR, 'steam_api.def'), defFile)

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
