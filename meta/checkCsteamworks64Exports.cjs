'use strict'
/**
 * quick 261025-t7i (W5): export-diff gate for the built shims.
 *
 *  - x64: every one of the 29 names CSteamworks64.dll (Steamworks.NET 7.0.0 /
 *    SDK 1.34, Unclaimed World 284100) imports from steam_api64.dll must be
 *    exported by the built public/bin/arm64/darwin/steam_api64.dll. The list
 *    was measured with `objdump -p` on that DLL's import table.
 *  - x86: the built steam_api.dll exports exactly the names in the committed
 *    steam_api.def, and none of the six x64-only legacy names (x86 is
 *    deferred under D-53-09).
 *
 * Exits non-zero on any miss. Needs `objdump` (Apple LLVM on macOS) and a
 * prior `pnpm build-steam-bridge`.
 */
const { execFileSync } = require('node:child_process')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')

const ROOT = join(__dirname, '..')
const BIN = join(ROOT, 'public', 'bin', 'arm64', 'darwin')

const CSTEAMWORKS64_IMPORTS = [
  'Steam_GetHSteamUserCurrent',
  'SteamAPI_GetSteamInstallPath',
  'SteamAPI_InitSafe',
  'SteamAPI_WriteMiniDump',
  'Steam_RegisterInterfaceFuncs',
  'SteamAPI_UnregisterCallback',
  'SteamAPI_IsSteamRunning',
  'SteamAPI_RunCallbacks',
  'SteamAPI_SetTryCatchCallbacks',
  'SteamGameServer_GetHSteamPipe',
  'SteamAPI_RestartAppIfNecessary',
  'SteamAPI_Shutdown',
  'g_pSteamClientGameServer',
  'SteamAPI_GetHSteamUser',
  'Steam_RunCallbacks',
  'SteamGameServer_RunCallbacks',
  'SteamAPI_SetMiniDumpComment',
  'SteamAPI_RegisterCallback',
  'SteamAPI_SetBreakpadAppID',
  'SteamGameServer_InitSafe',
  'SteamGameServer_GetHSteamUser',
  'SteamGameServer_Shutdown',
  'SteamGameServer_GetSteamID',
  'SteamAPI_GetHSteamPipe',
  'SteamGameServer_BSecure',
  'SteamAPI_UnregisterCallResult',
  'SteamClient',
  'SteamAPI_UseBreakpadCrashHandler',
  'SteamAPI_RegisterCallResult'
]

const X64_ONLY_LEGACY = [
  'SteamAPI_InitSafe',
  'SteamGameServer_InitSafe',
  'Steam_RunCallbacks',
  'Steam_RegisterInterfaceFuncs',
  'Steam_GetHSteamUserCurrent',
  'g_pSteamClientGameServer'
]

function exportsOf(dll) {
  const out = execFileSync('/usr/bin/objdump', ['-p', join(BIN, dll)], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024
  })
  const start = out.indexOf('Export Table:')
  if (start < 0) throw new Error(`${dll}: no export table in objdump output`)
  const names = new Set()
  for (const line of out.slice(start).split('\n')) {
    const m = line.match(/^\s+\d+\s+0x[0-9a-f]+\s+(\S+)\s*$/)
    if (m) names.add(m[1])
  }
  return names
}

function defNames(file) {
  const lines = readFileSync(file, 'utf8').split('\n')
  const at = lines.findIndex((l) => l.trim() === 'EXPORTS')
  return new Set(
    lines
      .slice(at + 1)
      .map((l) => l.trim())
      .filter(Boolean)
  )
}

let failed = false
const fail = (msg) => {
  console.error(`FAIL: ${msg}`)
  failed = true
}

const x64 = exportsOf('steam_api64.dll')
const missing = CSTEAMWORKS64_IMPORTS.filter((n) => !x64.has(n))
console.log(
  `x64: ${CSTEAMWORKS64_IMPORTS.length - missing.length}/${CSTEAMWORKS64_IMPORTS.length} CSteamworks64 imports exported (${x64.size} total exports)`
)
if (missing.length > 0) fail(`x64 shim is missing: ${missing.join(', ')}`)

const x86 = exportsOf('steam_api.dll')
const x86Def = defNames(
  join(ROOT, 'native', 'steam-bridge', 'generated', 'steam_api.def')
)
const x86Missing = [...x86Def].filter((n) => !x86.has(n))
const x86Extra = [...x86].filter((n) => !x86Def.has(n))
console.log(`x86: ${x86.size} exports, ${x86Def.size} in steam_api.def`)
if (x86Missing.length > 0) fail(`x86 def names not exported: ${x86Missing}`)
if (x86Extra.length > 0) fail(`x86 exports not in the def: ${x86Extra}`)
// SteamAPI_Shutdown etc. are shared; only the names that exist solely for
// the x64 legacy set are checked here.
const x86Leak = X64_ONLY_LEGACY.filter((n) => x86.has(n) || x86Def.has(n))
if (x86Leak.length > 0)
  fail(`x64-only legacy names leaked into x86: ${x86Leak}`)

process.exit(failed ? 1 : 0)
