/**
 * Phase 51 Plan 11: one-shot authoring tool -- Proton's pinned
 * `lsteamclient/winI<Family>.c` per-version thunks -> GameLib-authored
 * schema v2 manifests (D-09 -- a factual inventory of names, slot order,
 * C signatures and stack sizes; NEVER vendored Valve Steamworks SDK header
 * text, and the generator build path (meta/gen_vtables.ts) never fetches
 * anything over the network -- only THIS file does, and only against a
 * pinned commit SHA).
 *
 * Proton's wine thunks carry exactly three shapes for a given
 * `winI<Family>_<Version>_<Method>` symbol, all three read directly from
 * the real `proton_9.0` branch this session (2026-10-21):
 *
 *   1. `DEFINE_THISCALL_WRAPPER(winISteamUser_SteamUser016_GetSteamID, 8)`
 *      -- the i386 wrapper's total stack-argument byte width (including the
 *      hidden sret pointer when present). `stackBytes = wrapperSize - 4`
 *      (the `- 4` accounts for the implicit `this` slot the wrapper size
 *      itself already counts).
 *   2. `CSteamID * __thiscall winISteamUser_SteamUser016_GetSteamID(struct
 *      w_steam_iface *_this, CSteamID *_ret)` -- the real C signature:
 *      return type, and the full param list (the leading `_this` and a
 *      trailing sret `_ret` are both synthetic and stripped here).
 *   3. The `VTABLE_ADD_FUNC(winISteamUser_SteamUser016_...)` sequence
 *      inside that version's `__ASM_VTABLE(winISteamUser_SteamUser016, ...)`
 *      block -- the AUTHORITATIVE slot order (0..n-1); wrapper size and
 *      signature are looked up per name from shapes 1/2 once the order is
 *      known from shape 3.
 *
 * Run with `pnpm extract-proton-inventory [--versions A,B,C]`. Writes one
 * `meta/sdk/*.manifest.json` per requested version, assigns an ordinal from
 * `meta/sdk/ordinals.json` (append-only -- an already-assigned ordinal is
 * never reassigned), applies `meta/sdk/wire-policy.json`'s per-(family,
 * method) wire/stub overlay, and runs `npx prettier --write` on every file
 * it touched (manifests + ordinals.json).
 */

import { spawn } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

import type {
  ArchToken,
  InterfaceManifestV2,
  MethodSignature,
  ParamKind,
  ParamSignature,
  ReturnKind
} from './gen_vtables'

// Pinned `proton_9.0` branch head, resolved once this session via
// `git ls-remote https://github.com/ValveSoftware/Proton refs/heads/proton_9.0`
// (the plan names this a "tag" -- it is actually a long-lived BRANCH ref in
// the real repo, confirmed directly; the branch head is what gets pinned,
// exactly as a tag would be, and never re-resolved at generation time).
export const PINNED_PROTON_SHA = '2c620c0fd7c2c424f6bd91898602bdc4d4260468'

const SDK_DIR = join('meta', 'sdk')
const ORDINALS_PATH = join(SDK_DIR, 'ordinals.json')
const WIRE_POLICY_PATH = join(SDK_DIR, 'wire-policy.json')
const ACCEPTANCE_VERSIONS_PATH = join(
  SDK_DIR,
  'acceptance-interface-versions.json'
)

// ---------------------------------------------------------------------------
// Types (file-local -- wire-policy.json / acceptance-interface-versions.json
// shapes, never vendored SDK content)
// ---------------------------------------------------------------------------

export interface WirePolicyParamOverride {
  kind: ParamKind
  valueType?: 'int32' | 'uint32' | 'float' | 'bool' | 'uint64'
  sizeParam?: string
  lenParam?: string
}

export interface WirePolicyMethodEntry {
  helperFlat?: string
  /** 53-14: arity (excluding self) of the Mac Steam's native flat function.
   * A version whose game-side signature has fewer params gets the difference
   * as `helperTrailingNullArgs` (NULL-filled helper-side, never sent). */
  helperNativeArgs?: number
  params?: Record<string, WirePolicyParamOverride>
  helperFallback?: number | boolean
}

export type WirePolicy = Record<string, Record<string, WirePolicyMethodEntry>>

export interface AcceptanceVersionEntry {
  family: string
  arches: ArchToken[]
  titles: string[]
}

export type AcceptanceVersions = Record<string, AcceptanceVersionEntry>

// ---------------------------------------------------------------------------
// C type -> manifest token mapping (51-11 action text's explicit table,
// extended to cover every return/param shape the five target families'
// winI*.c files actually declare -- see 51-11-SUMMARY.md for the census)
// ---------------------------------------------------------------------------

const POINTER_TYPE_TOKENS: Readonly<Record<string, string>> = {
  'const char *': 'const char*',
  'char *': 'char*',
  'void *': 'void*',
  'const void *': 'const void*',
  'int32_t *': 'int32*',
  'uint32_t *': 'uint32*',
  'float *': 'float*',
  'int8_t *': 'bool*',
  'uint64_t *': 'uint64*'
}

const SCALAR_TYPE_TOKENS: Readonly<Record<string, string>> = {
  int32_t: 'int32',
  uint32_t: 'uint32',
  uint64_t: 'uint64',
  int64_t: 'int64',
  int8_t: 'bool',
  uint8_t: 'bool',
  int16_t: 'uint32',
  uint16_t: 'uint32',
  float: 'float',
  double: 'double',
  CSteamID: 'CSteamID',
  CGameID: 'CGameID'
}

/** Maps one raw Proton C param/field type (already separated from its
 * name) to a manifest `type` token. Pointer types not in the dedicated
 * table (struct pointers, function pointers already normalized to
 * `void*` by the caller) pass through with collapsed whitespace, ending
 * in `*` -- correctness-neutral for a stub (params[] never drives a
 * stub's generated C signature, see gen_vtables.ts `emitStubBody`'s doc
 * comment), purely documentary. */
export function mapProtonCType(rawType: string): string {
  const trimmed = rawType.trim()
  if (POINTER_TYPE_TOKENS[trimmed]) return POINTER_TYPE_TOKENS[trimmed]
  if (SCALAR_TYPE_TOKENS[trimmed]) return SCALAR_TYPE_TOKENS[trimmed]
  if (trimmed.includes('*')) {
    const collapsed = trimmed.replace(/\s*\*\s*/g, '*')
    return collapsed.endsWith('*') ? collapsed : `${collapsed}*`
  }
  return trimmed
}

/** Splits one raw param declaration (e.g. `"const char *pchName"`,
 * `"CSteamID steamIDGameServer"`, or the function-pointer form
 * `"void (*W_CDECL pFunction)(int32_t, const char *)"`) into its name and
 * mapped manifest type token. Function-pointer params normalize to a
 * generic `void*` -- their inner argument list is never marshaled
 * (always stub mode in this plan's scope: a callback registration method
 * has no sensible wire representation). */
export function splitProtonParam(raw: string): ParamSignature {
  const trimmed = raw.trim()
  const fnPtrMatch = trimmed.match(/\(\*(?:\s*\w+\s+)?(\w+)\)/)
  if (fnPtrMatch) {
    return { name: fnPtrMatch[1], type: 'void*' }
  }
  const match = trimmed.match(/^(.*[*\s])(\w+)$/)
  if (!match) {
    return { name: 'arg', type: mapProtonCType(trimmed) }
  }
  return { name: match[2], type: mapProtonCType(match[1]) }
}

interface ReturnClassification {
  returnKind: ReturnKind
  returns: string
  sret: boolean
  structBaseType?: string
}

const SRET_STRUCT_SIZE: Readonly<Record<string, number>> = {
  CSteamID: 8,
  CGameID: 8,
  // Measured Win64 sizes (53-10-SUMMARY), pinned Proton
  // 2c620c0fd7c2c424f6bd91898602bdc4d4260468 lsteamclient/:
  // unixlib_generated.cpp:7041 C_ASSERT( sizeof(InputDigitalActionData_t) >= 2 )
  InputDigitalActionData_t: 2,
  // unixlib_generated.cpp:7031 asserts >= 13 (last field bActive@12); the
  // 4-byte-aligned struct pads to 16.
  InputAnalogActionData_t: 16,
  // unixlib_generated.cpp:7085 C_ASSERT( sizeof(InputMotionData_t) >= 40 )
  InputMotionData_t: 40,
  // SteamController006 (53-12 pre-scan): unixlib_generated.cpp:6501
  // C_ASSERT( sizeof(ControllerDigitalActionData_t) >= 2 ), bState@0 bActive@1.
  ControllerDigitalActionData_t: 2,
  // unixlib_generated.cpp:6491 asserts >= 13 (bActive@12); 4-byte-aligned -> 16.
  ControllerAnalogActionData_t: 16,
  // unixlib_generated.cpp:6507 C_ASSERT( sizeof(ControllerMotionData_t) >= 40 )
  ControllerMotionData_t: 40,
  // steamclient_structs.h:54 typedef struct { uint8_t _[20]; } SteamIPAddress_t;
  SteamIPAddress_t: 20
}

/** Classifies a raw Proton return-type token (e.g. `"CSteamID *"`,
 * `"const char *"`, `"int8_t"`, `"void"`) into the generator's
 * `ReturnKind` + a display `returns` token + whether this is the
 * hidden-return-pointer (sret) convention. */
export function classifyProtonReturn(
  rawReturnType: string
): ReturnClassification {
  const trimmed = rawReturnType.trim()
  if (trimmed === 'void')
    return { returnKind: 'void', returns: 'void', sret: false }
  if (trimmed === 'const char *') {
    return { returnKind: 'string', returns: 'const char*', sret: false }
  }
  if (trimmed.endsWith('*')) {
    const base = trimmed.slice(0, -1).trim()
    // Proton's thunk generator only uses the hidden-sret-pointer
    // convention (an extra, synthetic trailing `_ret` param) for a KNOWN
    // by-value struct return (CSteamID/CGameID, the only two
    // SRET_STRUCT_SIZE entries) -- any OTHER pointer return type (e.g.
    // `void *`, an opaque handle such as ISteamMatchmakingServers'
    // RequestInternetServerList) is a genuine register-returned pointer:
    // the visible trailing param in that signature is a REAL argument,
    // never a synthetic return slot, so it must not be stripped (fixed
    // this session -- the generic "any trailing '*' is sret" branch threw
    // "unrecognized struct type \"void\"" the moment a real `void *`
    // return was extracted, Plan 51-14).
    if (SRET_STRUCT_SIZE[base] !== undefined) {
      return {
        returnKind: 'class',
        returns: base,
        sret: true,
        structBaseType: base
      }
    }
    return {
      returnKind: 'pointer',
      returns: mapProtonCType(trimmed),
      sret: false
    }
  }
  const scalarReturnMap: Readonly<
    Record<string, { returnKind: ReturnKind; returns: string }>
  > = {
    int8_t: { returnKind: 'int32', returns: 'bool' },
    uint8_t: { returnKind: 'int32', returns: 'uint32' },
    int16_t: { returnKind: 'int32', returns: 'uint32' },
    uint16_t: { returnKind: 'int32', returns: 'uint32' },
    int32_t: { returnKind: 'int32', returns: 'int32' },
    uint32_t: { returnKind: 'int32', returns: 'uint32' },
    int64_t: { returnKind: 'int64', returns: 'int64' },
    uint64_t: { returnKind: 'int64', returns: 'uint64' },
    float: { returnKind: 'float', returns: 'float' },
    double: { returnKind: 'double', returns: 'double' }
  }
  const mapped = scalarReturnMap[trimmed]
  if (mapped) return { ...mapped, sret: false }
  // Unrecognized scalar -- cType()'s own default branch maps anything
  // non-pointer, unrecognized to uint32_t (4-byte register return), which
  // is ABI-safe for a stub regardless of the exact source type. Never hit
  // by this plan's five target families (see the full return-type census
  // in 51-11-SUMMARY.md), kept as a safety net rather than a throw so a
  // future family extracted by this same tool degrades gracefully instead
  // of halting generation entirely.
  return { returnKind: 'int32', returns: trimmed, sret: false }
}

// ---------------------------------------------------------------------------
// Balanced-paren scanning (Proton signatures nest exactly one level, in the
// function-pointer param form -- `void (*W_CDECL pFunction)(int32_t, ...)`)
// ---------------------------------------------------------------------------

function findMatchingClose(text: string, openIdx: number): number {
  let depth = 0
  for (let i = openIdx; i < text.length; i++) {
    if (text[i] === '(') depth++
    else if (text[i] === ')') {
      depth--
      if (depth === 0) return i
    }
  }
  throw new Error(`unbalanced parens starting at index ${openIdx}`)
}

function splitTopLevelCommas(text: string): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ''
  for (const ch of text) {
    if (ch === '(') {
      depth++
      current += ch
    } else if (ch === ')') {
      depth--
      current += ch
    } else if (ch === ',' && depth === 0) {
      parts.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  if (current.trim()) parts.push(current.trim())
  return parts
}

// ---------------------------------------------------------------------------
// The three-shape parser
// ---------------------------------------------------------------------------

/** `winISteamUser_SteamUser016` -- the vtable/signature prefix shared by
 * every one of a version's method symbols, minus the trailing method
 * name. */
function protonPrefix(family: string, version: string): string {
  return `winI${family}_${version}`
}

function extractVtableOrder(
  text: string,
  family: string,
  version: string
): string[] {
  const prefix = protonPrefix(family, version)
  const vtableHeader = `__ASM_VTABLE(${prefix},`
  const headerIdx = text.indexOf(vtableHeader)
  if (headerIdx === -1) {
    throw new Error(
      `parseProtonThunks: no __ASM_VTABLE(${prefix}, ...) block found for ${family} ${version}`
    )
  }
  const closeIdx = text.indexOf(');', headerIdx)
  if (closeIdx === -1) {
    throw new Error(
      `parseProtonThunks: unterminated __ASM_VTABLE block for ${family} ${version}`
    )
  }
  const body = text.slice(headerIdx + vtableHeader.length, closeIdx)
  const methodNames: string[] = []
  const addFuncRe = new RegExp(`VTABLE_ADD_FUNC\\(${prefix}_(\\w+)\\)`, 'g')
  let match: RegExpExecArray | null
  while ((match = addFuncRe.exec(body)) !== null) {
    methodNames.push(match[1])
  }
  if (methodNames.length === 0) {
    throw new Error(
      `parseProtonThunks: __ASM_VTABLE(${prefix}, ...) block had no VTABLE_ADD_FUNC entries`
    )
  }
  return methodNames
}

function extractWrapperSize(
  text: string,
  family: string,
  version: string,
  methodName: string
): number {
  const prefix = protonPrefix(family, version)
  const fn = `${prefix}_${methodName}`
  const re = new RegExp(`DEFINE_THISCALL_WRAPPER\\(${fn},\\s*(\\d+)\\)`)
  const match = text.match(re)
  if (!match) {
    throw new Error(
      `parseProtonThunks: no DEFINE_THISCALL_WRAPPER found for ${fn}`
    )
  }
  return Number(match[1])
}

interface RawSignature {
  returnType: string
  params: string[]
}

function extractSignature(
  text: string,
  family: string,
  version: string,
  methodName: string
): RawSignature {
  const prefix = protonPrefix(family, version)
  const fn = `${prefix}_${methodName}`
  const needle = `__thiscall ${fn}(`
  const idx = text.indexOf(needle)
  if (idx === -1) {
    throw new Error(
      `parseProtonThunks: no __thiscall signature found for ${fn}`
    )
  }
  const lineStart = text.lastIndexOf('\n', idx) + 1
  const returnType = text.slice(lineStart, idx).trim()
  const openParenIdx = idx + needle.length - 1
  const closeParenIdx = findMatchingClose(text, openParenIdx)
  const paramsText = text.slice(openParenIdx + 1, closeParenIdx)
  const params = paramsText.trim() === '' ? [] : splitTopLevelCommas(paramsText)
  return { returnType, params }
}

/**
 * Parses every method of one Proton interface VERSION out of its family's
 * `lsteamclient/winI<Family>.c` source text, in vtable slot order. Pure
 * (no fetch, no fs) -- `main()` below is the only network/fs caller.
 */
export function parseProtonThunks(
  text: string,
  family: string,
  version: string
): MethodSignature[] {
  const order = extractVtableOrder(text, family, version)

  return order.map((methodName, slot) => {
    const wrapperSize = extractWrapperSize(text, family, version, methodName)

    // Plan 51-14: `winISteamMatchmakingServers.c`'s real, pinned
    // SteamMatchMakingServers002 vtable lists `ReleaseRequest` (both in
    // `DEFINE_THISCALL_WRAPPER` and the `__ASM_VTABLE` slot order) but
    // never defines its `__thiscall` body anywhere in the file -- a
    // genuine, narrow gap in Proton's own checked-in source (confirmed by
    // direct inspection this session: the 7 request-list methods, then
    // GetServerDetails, then CancelQuery follow each other with no
    // ReleaseRequest text between them). D-09 forbids inventing a
    // signature from outside knowledge (e.g. the public Steamworks SDK),
    // so this falls back to the ONE fact Proton's source DOES give for
    // this slot -- the wrapper's total stack width, via
    // `DEFINE_THISCALL_WRAPPER` -- and assumes the minimal, safest shape
    // (`void`, no params) for the rest. Every family this tool ever
    // targets is manifest-level `mode: 'stub'` with no wire-policy entry
    // (D-51-14), so this slot is NEVER dispatched for real: the generated
    // stub only needs `stackBytes` right (so __thiscall callee-cleanup
    // doesn't corrupt the caller's stack) -- `emitStubBody` derives its
    // dummy param list from `stackBytes` alone, never from `params`-by-
    // name, so the exact fabricated param count/names here are cosmetic.
    let returnType: string
    let params: string[]
    try {
      ;({ returnType, params } = extractSignature(
        text,
        family,
        version,
        methodName
      ))
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !error.message.includes('no __thiscall signature found')
      ) {
        throw error
      }
      console.warn(
        `parseProtonThunks: ${family} ${version} ${methodName} has no ` +
          `__thiscall body in Proton's source (slot ${slot}) -- falling back ` +
          `to a stackBytes-only stub shape (D-09: never inventing beyond the ` +
          `wrapper's own factual stack width).`
      )
      returnType = 'void'
      // One synthetic `this`-shaped leading entry so the `.slice(1)` below
      // (which always strips the synthetic leading `_this` Proton's REAL
      // signatures carry) still yields the right param count for the
      // factual non-`this` stack width -- each named uniquely so
      // `splitProtonParam` never collides two dummy params onto one name.
      const dummyCount = (wrapperSize - 4) / 4
      params = [
        'struct w_steam_iface *_this',
        ...Array.from(
          { length: dummyCount },
          (_, i) => `uint32_t _unknownArg${i}`
        )
      ]
    }
    const { returnKind, returns, sret, structBaseType } =
      classifyProtonReturn(returnType)

    // 53-12: a pointer-shaped return whose first real param is the synthetic
    // `_ret` is a by-value struct return of a type missing from
    // SRET_STRUCT_SIZE. Emitting `pointer` + `_ret` (the pre-53-10 shape)
    // would be wrong on x64, so refuse instead.
    if (
      !sret &&
      returnKind === 'pointer' &&
      /(^|[\s*])_ret$/.test(params[1]?.trim() ?? '')
    ) {
      throw new Error(
        `parseProtonThunks: ${family} ${version} ${methodName} returns ` +
          `unrecognized struct type "${returnType.replace(/\*$/, '').trim()}" ` +
          `-- add its measured Win64 size to SRET_STRUCT_SIZE`
      )
    }

    // Strip the synthetic leading `this` (always `struct w_steam_iface
    // *_this`) and, when this is the sret convention, the synthetic
    // trailing hidden-return-pointer param (always named `_ret`).
    let realParams = params.slice(1)
    let structSize: number | undefined
    if (sret) {
      // MSVC thiscall-sret convention (confirmed directly against
      // Proton's real signatures this session): the hidden return
      // pointer is the FIRST stack param, right after `this` -- e.g.
      // `winISteamFriends_SteamFriends018_GetFriendByIndex(_this, _ret,
      // iFriend, iFriendFlags)`. Stripping the LAST element (the prior
      // logic) wrongly dropped a REAL trailing arg while leaving the
      // synthetic `_ret` in the output for any method with more than
      // zero real args -- only coincidentally correct for the
      // zero-real-arg case (GetSteamID), which is all 51-11 exercised.
      // Fixed this session (Plan 51-14) when SteamMatchMaking009's
      // GetLobbyOwner/GetLobbyByIndex/GetLobbyMemberByIndex exposed it;
      // the already-committed isteamfriends*.manifest.json files predate
      // this fix and are out of THIS plan's scope (stub-mode generation
      // never reads `params` for code emission -- a documentary-only
      // inaccuracy there, tracked as a deferred item, not regenerated
      // here).
      realParams = realParams.slice(1)
      structSize = structBaseType ? SRET_STRUCT_SIZE[structBaseType] : undefined
      if (structSize === undefined) {
        throw new Error(
          `parseProtonThunks: ${family} ${version} ${methodName} is an sret return of ` +
            `unrecognized struct type "${structBaseType}" -- no known size`
        )
      }
    }

    const method: MethodSignature = {
      slot,
      name: methodName,
      returns,
      returnKind,
      stackBytes: wrapperSize - 4,
      params: realParams.map(splitProtonParam)
    }
    if (structSize !== undefined) method.structSize = structSize
    return method
  })
}

// ---------------------------------------------------------------------------
// Wire-policy application (GameLib-authored overlay, never Proton content)
// ---------------------------------------------------------------------------

/**
 * Returns a NEW methods array with every method named in
 * `policy[family]` marked `mode: 'wire'` (helperFlat/helperFallback
 * attached, named params' kind/valueType/sizeParam overridden); every
 * other method is left untouched (manifest-level default `mode: 'stub'`
 * applies). A policy entry whose method name does not appear in `methods`
 * (e.g. a newer-version-only method listed for forward compatibility) is
 * simply a no-op for this call -- never an error.
 */
export function applyWirePolicy(
  methods: MethodSignature[],
  family: string,
  policy: WirePolicy
): MethodSignature[] {
  const familyPolicy = policy[family]
  if (!familyPolicy) return methods

  return methods.map((method) => {
    const entry = familyPolicy[method.name]
    if (!entry) return method

    const params = method.params.map((p) => {
      const override = entry.params?.[p.name]
      if (!override) return p
      const merged: ParamSignature = { ...p, kind: override.kind }
      if (override.valueType !== undefined)
        merged.valueType = override.valueType
      if (override.sizeParam !== undefined)
        merged.sizeParam = override.sizeParam
      if (override.lenParam !== undefined) merged.lenParam = override.lenParam
      return merged
    })

    const wired: MethodSignature = { ...method, mode: 'wire', params }
    if (entry.helperFlat !== undefined) wired.helperFlat = entry.helperFlat
    if (entry.helperNativeArgs !== undefined) {
      const missing = entry.helperNativeArgs - params.length
      if (missing > 0) wired.helperTrailingNullArgs = missing
    }
    if (entry.helperFallback !== undefined)
      wired.helperFallback = entry.helperFallback
    return wired
  })
}

// ---------------------------------------------------------------------------
// CLI (fetch + ordinal/filename resolution + manifest emission)
// ---------------------------------------------------------------------------

function parseArgvVersions(argv: string[]): string[] | null {
  const idx = argv.indexOf('--versions')
  if (idx === -1) return null
  const value = argv[idx + 1]
  if (!value) throw new Error('--versions requires a comma-separated value')
  return value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)
}

function loadJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf-8')) as T
}

function loadAcceptanceVersions(): AcceptanceVersions {
  if (!existsSync(ACCEPTANCE_VERSIONS_PATH)) return {}
  return loadJson<AcceptanceVersions>(ACCEPTANCE_VERSIONS_PATH)
}

function loadWirePolicy(): WirePolicy {
  if (!existsSync(WIRE_POLICY_PATH)) return {}
  return loadJson<WirePolicy>(WIRE_POLICY_PATH)
}

/** Append-only ordinal resolution: returns the existing ordinal for
 * `version` if present, else assigns `max(existing) + 1`, PERSISTS the
 * updated table to disk immediately, and returns the new value. Existing
 * entries are never rewritten. */
export function resolveOrdinal(version: string, ordinalsPath: string): number {
  const ordinals: Record<string, number> = existsSync(ordinalsPath)
    ? loadJson<Record<string, number>>(ordinalsPath)
    : {}
  if (ordinals[version] !== undefined) return ordinals[version]

  const existingValues = Object.values(ordinals)
  const next = existingValues.length > 0 ? Math.max(...existingValues) + 1 : 1
  ordinals[version] = next
  writeFileSync(ordinalsPath, JSON.stringify(ordinals, null, 2) + '\n')
  return next
}

/** Modern version strings (`SteamUser023`) resolve via
 * `toVersionedAccessorSuffix`-equivalent logic; old-style
 * `<WHATEVER>_INTERFACE_VERSION0NN` strings (no letters-then-digits
 * shape) get an explicit, GameLib-synthesized flat accessor name instead
 * of the generator's own `SteamAPI_${interface}` fallback (which would
 * otherwise literally embed the old-style string, e.g.
 * `SteamAPI_STEAMAPPS_INTERFACE_VERSION004` -- syntactically valid, never
 * imported by any real game, but needlessly ugly next to the versioned
 * convention every other manifest uses). */
export function computeFlatAccessor(version: string, family: string): string {
  const modern = version.match(/^([A-Za-z]+)(\d+)$/)
  if (modern) return `SteamAPI_${modern[1]}_v${modern[2]}`
  const oldStyle = version.match(/VERSION(\d+)$/)
  if (oldStyle) return `SteamAPI_${family}_v${oldStyle[1]}`
  return `SteamAPI_${version}`
}

const EXISTING_MANIFEST_FILENAME_OVERRIDES: Readonly<Record<string, string>> = {
  SteamUser023: 'isteamuser.manifest.json',
  SteamFriends018: 'isteamfriends.manifest.json'
}

/** `SteamUser016` -> `isteamuser016.manifest.json`;
 * `STEAMAPPS_INTERFACE_VERSION004` -> `isteamapps004.manifest.json`. The
 * two pre-51-11 manifests keep their original bare-family filenames
 * (`isteamuser.manifest.json`/`isteamfriends.manifest.json`) rather than
 * gaining a `023`/`018` suffix -- renaming a committed, already-referenced
 * file is out of scope for a generation run. */
export function manifestFilenameFor(version: string, family: string): string {
  const override = EXISTING_MANIFEST_FILENAME_OVERRIDES[version]
  if (override) return override
  const digits = version.match(/(\d+)$/)?.[1] ?? ''
  return `i${family.toLowerCase()}${digits}.manifest.json`
}

function protonFileFor(family: string): string {
  return `lsteamclient/winI${family}.c`
}

async function fetchProtonSource(family: string): Promise<string> {
  const url = `https://raw.githubusercontent.com/ValveSoftware/Proton/${PINNED_PROTON_SHA}/${protonFileFor(family)}`
  const response = await fetch(url, {
    headers: { 'User-Agent': 'GameLibProtonInventoryExtractor/1.0' }
  })
  if (response.status !== 200) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`)
  }
  return response.text()
}

function runPrettierWrite(paths: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('npx', ['prettier', '--write', ...paths], {
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let stderr = ''
    child.stderr?.on('data', (d) => {
      stderr += d.toString()
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve()
      else
        reject(
          new Error(`npx prettier --write failed (exit ${code}): ${stderr}`)
        )
    })
  })
}

export async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  const acceptanceVersions = loadAcceptanceVersions()
  const requestedVersions =
    parseArgvVersions(argv) ?? Object.keys(acceptanceVersions)
  if (requestedVersions.length === 0) {
    throw new Error(
      'extract-proton-inventory: no versions requested and meta/sdk/acceptance-interface-versions.json has none either'
    )
  }

  const wirePolicy = loadWirePolicy()
  const sourceCache = new Map<string, Promise<string>>()
  const writtenPaths: string[] = []

  for (const version of requestedVersions) {
    const entry = acceptanceVersions[version]
    if (!entry) {
      throw new Error(
        `extract-proton-inventory: "${version}" has no entry in meta/sdk/acceptance-interface-versions.json (family/arches unknown)`
      )
    }
    const { family, arches } = entry

    if (!sourceCache.has(family)) {
      sourceCache.set(family, fetchProtonSource(family))
    }
    const text = await sourceCache.get(family)!

    const rawMethods = parseProtonThunks(text, family, version)
    const methods = applyWirePolicy(rawMethods, family, wirePolicy)
    const ordinal = resolveOrdinal(version, ORDINALS_PATH)

    const manifest: InterfaceManifestV2 = {
      schemaVersion: 2,
      interface: version,
      family,
      ordinal,
      arches,
      mode: 'stub',
      complete: true,
      flatAccessor: computeFlatAccessor(version, family),
      source: {
        kind: 'proton-lsteamclient',
        ref: PINNED_PROTON_SHA,
        file: protonFileFor(family)
      },
      methods
    }

    const filename = manifestFilenameFor(version, family)
    const outPath = join(SDK_DIR, filename)
    writeFileSync(outPath, JSON.stringify(manifest, null, 2) + '\n')
    writtenPaths.push(outPath)
    console.log(
      `Wrote ${outPath}: ${version} (ordinal ${ordinal}), ${methods.length} methods, ` +
        `${methods.filter((m) => m.mode === 'wire').length} wired`
    )
  }

  await runPrettierWrite([...writtenPaths, ORDINALS_PATH])
}

// See meta/gen_vtables.ts for why this can't use the usual
// `require.main === module` idiom.
if (!process.env.JEST_WORKER_ID) {
  main().catch((error: unknown) => {
    console.error(error)
    process.exit(1)
  })
}
