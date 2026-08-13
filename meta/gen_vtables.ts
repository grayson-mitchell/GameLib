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

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// ---------------------------------------------------------------------------
// Types (manifest input shape)
// ---------------------------------------------------------------------------

export interface ParamSignature {
  name: string
  /** One of the recognized ABI type tokens -- see WIDTH_8_TYPES below. */
  type: string
}

export interface MethodSignature {
  slot: number
  name: string
  params: ParamSignature[]
  returns: string
  /**
   * Only present for struct-by-value returns > 8 bytes -- triggers the
   * hidden-return-pointer (sret) marshaling path (Pattern 2). Byte size of
   * the returned struct.
   */
  structSize?: number
  /**
   * Free-form note. Used to flag a synthetic ABI-exercise slot that is NOT a
   * real Steamworks method (e.g. the sret-exercise slot) so a reviewer never
   * mistakes it for vendored SDK content (D-09/Pitfall 3).
   */
  note?: string
}

export interface InterfaceManifest {
  interface: string
  ordinal: number
  sdkVersion: string
  methods: MethodSignature[]
}

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

export function isSretReturn(method: MethodSignature): boolean {
  return typeof method.structSize === 'number' && method.structSize > 8
}

export function is64BitRegisterReturn(method: MethodSignature): boolean {
  return !isSretReturn(method) && WIDTH_8_TYPES.has(method.returns)
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
  return !isSretReturn(method) && method.returns === 'const char*'
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
 * marshaled or stubbed (Pitfall 2).
 */
export function computeRetN(method: MethodSignature): number {
  const paramBytes = method.params.reduce(
    (sum, p) => sum + paramWidth(p.type),
    0
  )
  const sretBytes = isSretReturn(method) ? 4 : 0
  return paramBytes + sretBytes
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
  SteamAPI_Init: 'int SteamAPI_Init(void) { return 1; }',
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
      `static const char * __attribute__((thiscall)) ${funcName}(${signatureParams}) {\n` +
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
    const structSize = method.structSize ?? 0
    return (
      header +
      `static void __attribute__((thiscall)) ${funcName}(${signatureParams}) {\n` +
      `  (void)self;\n` +
      `${argBufDecl}\n` +
      `  uint8_t retbuf[${structSize}]; uint32_t retlen = 0;\n` +
      `  if (!bridge_transact(${manifest.ordinal}, ${method.slot}, argbuf, ${argLenExpr}, retbuf, sizeof(retbuf), &retlen) || retlen < ${structSize}) {\n` +
      `    memset(sretOut, 0, ${structSize});\n` +
      `    return;\n` +
      `  }\n` +
      `  memcpy(sretOut, retbuf, ${structSize});\n` +
      `}\n`
    )
  }

  if (method.returns === 'void') {
    return (
      header +
      `static void __attribute__((thiscall)) ${funcName}(${signatureParams}) {\n` +
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
    `static ${returnType} __attribute__((thiscall)) ${funcName}(${signatureParams}) {\n` +
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

function emitFlatAccessor(manifest: InterfaceManifest): string {
  const suffix = toVersionedAccessorSuffix(manifest.interface)
  const instanceName = `g_${manifest.interface.toLowerCase()}_instance`
  return `void *SteamAPI_${suffix}(void) { return &${instanceName}; }\n`
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
#include <stdint.h>
#include <string.h>
#include <stdlib.h>

#define BRIDGE_PORT 54550

// CR-01: byte capacity of each string-returning stub's shim-owned static
// return buffer -- emitted directly from the generator's
// STRING_RETURN_BUF_BYTES constant, so this generated file and the value
// emitVtableStub() sizes each stub's transact buffer against can never
// drift apart.
#define STRING_RETURN_BUF_BYTES ${STRING_RETURN_BUF_BYTES}

static SOCKET g_bridge_sock = INVALID_SOCKET;
static uint32_t g_next_request_id = 1;

static int bridge_ensure_connected(void) {
  if (g_bridge_sock != INVALID_SOCKET) return 1;
  WSADATA w;
  if (WSAStartup(MAKEWORD(2, 2), &w) != 0) return 0;
  SOCKET s = socket(AF_INET, SOCK_STREAM, 0);
  struct sockaddr_in a; memset(&a, 0, sizeof a);
  a.sin_family = AF_INET;
  a.sin_port = htons(BRIDGE_PORT);
  a.sin_addr.s_addr = inet_addr("127.0.0.1"); // loopback-only, never a routable interface
  if (connect(s, (struct sockaddr *)&a, sizeof a) != 0) { closesocket(s); return 0; }
  g_bridge_sock = s;
  return 1;
}

/*
 * Marshal one interface-ordinal + method-slot call to the persistent bridge
 * connection and block for the response (Pattern 3). Returns 1 on ok, 0 on
 * transport/protocol error -- callers fall back to a safe zero/false value on
 * error (this shim is a compatibility layer, not a DRM gate, spike 008).
 */
static int bridge_transact(uint16_t ordinal, uint16_t slot,
                            const uint8_t *argBuf, uint32_t argLen,
                            uint8_t *retBuf, uint32_t retBufCap, uint32_t *retLenOut) {
  *retLenOut = 0;
  if (!bridge_ensure_connected()) return 0;

  uint32_t requestId = g_next_request_id++;
  uint32_t frameLen = 4 + 2 + 2 + argLen;
  uint8_t header[12];
  memcpy(header + 0, &frameLen, 4);
  memcpy(header + 4, &requestId, 4);
  memcpy(header + 8, &ordinal, 2);
  memcpy(header + 10, &slot, 2);

  if (send(g_bridge_sock, (const char *)header, sizeof(header), 0) != sizeof(header)) return 0;
  if (argLen > 0 && send(g_bridge_sock, (const char *)argBuf, argLen, 0) != (int)argLen) return 0;

  uint8_t respHeader[9];
  if (recv(g_bridge_sock, (char *)respHeader, sizeof(respHeader), MSG_WAITALL) != (int)sizeof(respHeader)) return 0;
  uint32_t respLen, respRequestId; uint8_t status;
  memcpy(&respLen, respHeader + 0, 4);
  memcpy(&respRequestId, respHeader + 4, 4);
  status = respHeader[8];
  if (respRequestId != requestId || status != 0) return 0;

  uint32_t retLen = respLen - 5; // subtract request_id(4) + status(1)
  if (retLen > retBufCap) return 0;
  if (retLen > 0 && recv(g_bridge_sock, (char *)retBuf, retLen, MSG_WAITALL) != (int)retLen) return 0;
  *retLenOut = retLen;
  return 1;
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
        `// === ${m.interface} (ordinal ${m.ordinal}, sdkVersion ${m.sdkVersion}) ===\n\n` +
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
  const accessorExports = sortedManifests.map(
    (m) => `SteamAPI_${toVersionedAccessorSuffix(m.interface)}`
  )
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

function loadManifest(filename: string): InterfaceManifest {
  const raw = readFileSync(join(SDK_DIR, filename), 'utf-8')
  return JSON.parse(raw) as InterfaceManifest
}

export function main(): void {
  const manifests = [
    loadManifest('isteamuser.manifest.json'),
    loadManifest('isteamfriends.manifest.json')
  ]

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

// NOTE: this script is bundled by esbuild to
// node_modules/.cache/gen-vtables.cjs and run as
// `node node_modules/.cache/gen-vtables.cjs` (the meta/ convention,
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
