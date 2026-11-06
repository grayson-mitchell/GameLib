/**
 * Phase 63-03 (D-12): writes the committed tier-1 parity fixtures and their
 * golden JSON. Run manually (`pnpm gen-scan-fixtures`) with the output
 * committed; re-running produces no diff.
 *
 * Writes under src-tauri/crates/gamelib-scan/tests/fixtures/:
 *   pe/<case>.bin, pe/closure-*\/{game.exe,*.dll}   synthetic PEs
 *   macho/<case>/Contents/Resources/wine/lib/wine/x86_64-unix/winemac.so
 *   expected.json   { version, cases: [{ name, file|bundle, ops, objdumpCaptures }] }
 *
 * Every fixture is synthetic: built by the in-repo test builders. No game
 * bytes are used or checked in.
 *
 * D-07 override rule: a case may carry `rustOverride: { <op>: <result> }` plus
 * `divergenceNote: "<why objdump/TS and native differ, and which is right>"`.
 * This generator PRESERVES any existing rustOverride/divergenceNote on
 * regeneration and NEVER writes one itself; only a human-reviewed
 * investigation (63-05/63-11) adds one. The TS value is never edited to match
 * Rust.
 *
 * The objdump spawn is not profile-dependent, so it runs under a fresh
 * createFakeHomeProfile({ prefix: 'gamelib-scan-fixtures-' }) per invocation
 * (gamelib-conventions two-profile rule, isolated half).
 *
 * Must run on macOS: it needs Apple /usr/bin/objdump.
 */
import { spawn } from 'child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { dirname, join, relative, resolve } from 'path'

import { createFakeHomeProfile } from '../src/backend/testUtils/fakeHomeProfile'
import { buildPe } from '../src/backend/storeManagers/steam/bridge/__tests__/fixtures/drmPe'
import { buildDelayImportPe } from '../src/backend/storeManagers/steam/bridge/__tests__/fixtures/delayImportPe'
import { buildImportSymbolsPe } from '../src/backend/storeManagers/steam/bridge/__tests__/fixtures/importSymbolsPe'
import {
  buildFat,
  buildThin,
  EXT_DEF,
  type Sym
} from '../src/backend/tools/__tests__/fixtures/machoFixtures'
import { normalizeScanResult } from '../src/backend/scanners/scanNormalize'
import {
  OBJDUMP_BIN,
  runLegacyOp
} from '../src/backend/scanners/legacyTsScanners'
import type { ScanOp } from '../src/backend/scanners/scanTypes'

const FIXTURES = resolve(
  process.cwd(),
  'src-tauri/crates/gamelib-scan/tests/fixtures'
)

type PeCase = { name: string; file: string; bytes: Buffer | Uint8Array }
type MachoCase = { name: string; bundle: string }

const PE_OPS: ScanOp[] = [
  'scan_steamstub_section',
  'scan_steam_drm',
  'scan_pe_imported_dlls',
  'scan_pe_delay_imports',
  'scan_steam_api_imports'
]

const pe: PeCase[] = []
const extraFiles: { file: string; bytes: Buffer | Uint8Array }[] = []
const add = (name: string, bytes: Buffer | Uint8Array) =>
  pe.push({ name, file: `pe/${name}.bin`, bytes })

// ---- .bind section ----
add('bind-present', buildPe({ extraSections: ['.bind'] }))
add('bind-absent', buildPe({}))
add('bind-binder', buildPe({ extraSections: ['.binder'] }))
add('bind-upper', buildPe({ extraSections: ['.BIND'] }))

// ---- section count caps (96 / 97): .bind is the LAST section ----
function buildManySections(count: number): Buffer {
  const buf = Buffer.alloc(0x1400)
  buf.write('MZ', 0, 'latin1')
  buf.writeUInt32LE(0x80, 0x3c)
  buf.writeUInt32LE(0x00004550, 0x80)
  buf.writeUInt16LE(0x14c, 0x84)
  buf.writeUInt16LE(count, 0x86)
  buf.writeUInt16LE(224, 0x80 + 20)
  buf.writeUInt16LE(0x10b, 0x80 + 24)
  buf.writeUInt32LE(16, 0x80 + 24 + 92)
  const table = 0x80 + 24 + 224
  for (let i = 0; i < count; i++) {
    buf.write(i === count - 1 ? '.bind' : `.s${i}`, table + i * 40, 'latin1')
  }
  return buf
}
add('sections-96', buildManySections(96))
add('sections-97', buildManySections(97))

// ---- CEG names ----
const ceg = (rcdataNames?: string[], more = {}, top = {}) =>
  buildPe({ resources: { rcdataNames, ...more }, ...top })
add('ceg-split-guid', ceg(['STEAM_SPLIT_GUID']))
add('ceg-guidd', ceg(['STEAM_GUIDD']))
add('ceg-minstance', ceg(['STEAM_MINSTANCE']))
add('ceg-lowercase', ceg(['steam_guidd']))
add(
  'ceg-all-three',
  ceg(['STEAM_SPLIT_GUID', 'STEAM_GUIDD', 'STEAM_MINSTANCE'])
)
add('ceg-ids-not-names', ceg([], { rcdataIds: [101, 102], iconDir: true }))
add('ceg-self-reference', ceg(['STEAM_GUIDD'], { selfReference: true }))
add('ceg-rva-outside', ceg(['STEAM_GUIDD'], {}, { resourceRvaOutside: true }))
add('ceg-size-zero', ceg(['STEAM_GUIDD'], {}, { resourceSizeZero: true }))
add('ceg-pe32plus', ceg(['STEAM_GUIDD'], {}, { magic: 0x20b }))

// ---- 53-15 Godot overlay ----
add(
  'godot-overlay',
  buildPe({ pckOverlay: true, resources: { rcdataNames: ['STEAM_GUIDD'] } })
)

// ---- delay imports ----
add(
  'delay-x86',
  buildDelayImportPe({
    plus: false,
    dlls: [{ name: 'steam_api.dll', imports: ['SteamAPI_Init', 'SteamUser'] }]
  })
)
add(
  'delay-x64',
  buildDelayImportPe({
    plus: true,
    dlls: [{ name: 'steam_api64.dll', imports: ['SteamAPI_Init'] }]
  })
)
add(
  'delay-ordinal',
  buildDelayImportPe({
    plus: false,
    dlls: [{ name: 'STEAM_API.DLL', imports: ['SteamAPI_Init', 7] }]
  })
)
add(
  'delay-va-form',
  buildDelayImportPe({
    plus: false,
    vaForm: true,
    dlls: [{ name: 'steam_api.dll', imports: ['A', 'B'] }]
  })
)
add(
  'delay-arch-conflict',
  buildDelayImportPe({
    plus: true,
    dlls: [
      { name: 'steam_api.dll', imports: ['A'] },
      { name: 'steam_api64.dll', imports: ['B'] }
    ]
  })
)
{
  const longName = Buffer.from(
    buildDelayImportPe({
      plus: false,
      dlls: [{ name: 'steam_api.dll', imports: ['A'] }]
    })
  )
  longName.fill(0x41, 0x400 + 64, 0x400 + 64 + 400)
  add('delay-overlong-name', longName)
}

// ---- static import table ----
const sym = (...s: string[]) => s
add(
  'import-steam-api-x86',
  buildImportSymbolsPe({
    plus: false,
    imports: [
      { dll: 'KERNEL32.dll', symbols: sym('Sleep') },
      { dll: 'steam_api.dll', symbols: sym('SteamAPI_Init', 'SteamUser') }
    ]
  })
)
add(
  'import-steam-api64-x64',
  buildImportSymbolsPe({
    plus: true,
    imports: [
      { dll: 'steam_api64.dll', symbols: sym('SteamAPI_Init', 'SteamFriends') }
    ]
  })
)
add(
  'import-arch-conflict',
  buildImportSymbolsPe({
    plus: false,
    imports: [
      { dll: 'steam_api.dll', symbols: sym('SteamAPI_Init') },
      { dll: 'steam_api64.dll', symbols: sym('SteamAPI_Init') }
    ]
  })
)
add(
  'import-ordinal-only',
  buildImportSymbolsPe({
    plus: false,
    imports: [
      { dll: 'steam_api.dll', symbols: [{ ordinal: 5 }] },
      { dll: 'KERNEL32.dll', symbols: sym('Sleep') }
    ]
  })
)
add(
  'import-ordinal-mixed',
  buildImportSymbolsPe({
    plus: true,
    imports: [
      {
        dll: 'steam_api64.dll',
        symbols: ['SteamAPI_Init', { ordinal: 9 }, 'SteamUser']
      }
    ]
  })
)
add(
  'import-steam-api-repeated',
  buildImportSymbolsPe({
    plus: false,
    imports: [
      { dll: 'steam_api.dll', symbols: sym('SteamAPI_Init') },
      { dll: 'steam_api.dll', symbols: sym('SteamAPI_Init', 'SteamUser') }
    ]
  })
)
add(
  'import-missing-sibling-dll',
  buildImportSymbolsPe({
    plus: false,
    imports: [{ dll: 'Engine.dll', symbols: sym('EngineInit') }]
  })
)
add(
  'import-no-steam',
  buildImportSymbolsPe({
    plus: true,
    imports: [{ dll: 'KERNEL32.dll', symbols: sym('Sleep') }]
  })
)

// ---- truncation and malformed headers ----
const base = buildImportSymbolsPe({
  plus: false,
  imports: [{ dll: 'steam_api.dll', symbols: sym('SteamAPI_Init') }]
})
const OPT = 0x80 + 24
add('trunc-mz', base.subarray(0, 1))
add('trunc-e-lfanew', base.subarray(0, 0x3e))
add('trunc-pe-signature', base.subarray(0, 0x82))
add('trunc-coff', base.subarray(0, 0x80 + 12))
add('trunc-optional-header', base.subarray(0, OPT + 50))
add('trunc-section-table', base.subarray(0, OPT + 224 + 20))
add('empty-file', Buffer.alloc(0))
{
  const notMz = Buffer.from(base)
  notMz[0] = 0x00
  add('not-mz', notMz)
  const badSig = Buffer.from(base)
  badSig[0x80] = 0x00
  add('bad-pe-signature', badSig)
  const unknownMagic = Buffer.from(base)
  unknownMagic.writeUInt16LE(0x0107, OPT)
  add('unknown-optional-magic', unknownMagic)
}

// ---- multi-file import closure ----
const closure = (
  dir: string,
  files: Record<string, Buffer | Uint8Array>
): void => {
  for (const [n, bytes] of Object.entries(files)) {
    if (n !== 'game.exe') extraFiles.push({ file: `pe/${dir}/${n}`, bytes })
  }
  pe.push({
    name: dir,
    file: `pe/${dir}/game.exe`,
    bytes: files['game.exe']
  })
}
closure('closure-depth1', {
  'game.exe': buildImportSymbolsPe({
    plus: false,
    imports: [{ dll: 'Engine.dll', symbols: sym('EngineInit') }]
  }),
  'Engine.dll': buildImportSymbolsPe({
    plus: false,
    imports: [{ dll: 'steam_api.dll', symbols: sym('SteamAPI_Init') }]
  })
})
closure('closure-depth2', {
  'game.exe': buildImportSymbolsPe({
    plus: true,
    imports: [{ dll: 'A.dll', symbols: sym('AInit') }]
  }),
  'A.dll': buildImportSymbolsPe({
    plus: true,
    imports: [{ dll: 'B.dll', symbols: sym('BInit') }]
  }),
  'B.dll': buildImportSymbolsPe({
    plus: true,
    imports: [{ dll: 'steam_api64.dll', symbols: sym('SteamAPI_Init') }]
  })
})
closure('closure-merge', {
  'game.exe': buildImportSymbolsPe({
    plus: false,
    imports: [
      { dll: 'steam_api.dll', symbols: sym('SteamAPI_Init', 'SteamUser') },
      { dll: 'Engine.dll', symbols: sym('EngineInit') }
    ]
  }),
  'Engine.dll': buildImportSymbolsPe({
    plus: false,
    imports: [
      { dll: 'steam_api.dll', symbols: sym('SteamUser', 'SteamFriends') }
    ]
  })
})
closure('closure-arch-conflict', {
  'game.exe': buildImportSymbolsPe({
    plus: false,
    imports: [
      { dll: 'steam_api.dll', symbols: sym('SteamAPI_Init') },
      { dll: 'Engine.dll', symbols: sym('EngineInit') }
    ]
  }),
  'Engine.dll': buildImportSymbolsPe({
    plus: true,
    imports: [{ dll: 'steam_api64.dll', symbols: sym('SteamAPI_Init') }]
  })
})

// ---- Mach-O ----
const FOUR: Sym[] = [
  '_macdrv_functions',
  '_macdrv_view_create_metal_view',
  '_macdrv_view_get_metal_layer',
  '_macdrv_view_release_metal_view'
].map((name) => ({ name, type: EXT_DEF }))
const STAGING: Sym[] = [
  { name: '___wine_unix_call_funcs', type: EXT_DEF },
  { name: '___wine_unix_call_wow64_funcs', type: EXT_DEF }
]
const X86_64 = 0x01000007
const ARM64 = 0x0100000c
const macho: MachoCase[] = []
const machoBytes: { name: string; bytes: Buffer | null }[] = [
  { name: 'thin-all-exports', bytes: buildThin(FOUR) },
  { name: 'thin-macdrv-functions-only', bytes: buildThin(FOUR.slice(0, 1)) },
  { name: 'thin-three-view-symbols', bytes: buildThin(FOUR.slice(1)) },
  { name: 'thin-missing-all', bytes: buildThin(STAGING) },
  {
    name: 'fat-with-x86_64',
    bytes: buildFat([
      { cputype: ARM64, data: buildThin(STAGING) },
      { cputype: X86_64, data: buildThin(FOUR) }
    ])
  },
  {
    name: 'fat-without-x86_64',
    bytes: buildFat([{ cputype: ARM64, data: buildThin(FOUR) }])
  },
  {
    name: 'truncated-symtab',
    bytes: buildThin(FOUR, { breakStroff: true })
  },
  { name: 'no-dysymtab', bytes: buildThin(FOUR, { dysymtab: false }) },
  { name: 'not-macho', bytes: Buffer.from('not macho') },
  { name: 'winemac-missing', bytes: null }
]

const WINEMAC_REL = 'Contents/Resources/wine/lib/wine/x86_64-unix/winemac.so'

function writeFixture(rel: string, bytes: Buffer | Uint8Array): void {
  const abs = join(FIXTURES, rel)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, bytes)
}

function runObjdump(
  path: string
): Promise<{ code: number | null; stdout: string }> {
  const profile = createFakeHomeProfile({ prefix: 'gamelib-scan-fixtures-' })
  return new Promise((res, rej) => {
    const child = spawn(OBJDUMP_BIN, ['--private-headers', path], {
      env: profile.childEnv(process.env),
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let stdout = ''
    child.stdout?.on('data', (d) => (stdout += d.toString()))
    const done = () => {
      try {
        profile.dispose()
      } catch {
        /* best effort */
      }
    }
    child.on('error', (e) => {
      done()
      rej(e)
    })
    child.on('close', (code) => {
      done()
      res({ code, stdout })
    })
  })
}

type Preserved = { rustOverride?: unknown; divergenceNote?: unknown }

async function main(): Promise<void> {
  const prior = new Map<string, Preserved>()
  const expectedPath = join(FIXTURES, 'expected.json')
  if (existsSync(expectedPath)) {
    const old = JSON.parse(readFileSync(expectedPath, 'utf8')) as {
      cases: ({ name: string } & Preserved)[]
    }
    for (const c of old.cases) {
      if (c.rustOverride !== undefined || c.divergenceNote !== undefined) {
        prior.set(c.name, {
          rustOverride: c.rustOverride,
          divergenceNote: c.divergenceNote
        })
      }
    }
  }

  // regenerate from scratch so removed cases do not linger
  for (const d of ['pe', 'macho']) {
    rmSync(join(FIXTURES, d), { recursive: true, force: true })
  }

  const tok = (s: string) => s.split(FIXTURES).join('${FIXTURES}')
  // Captures keep only the first line plus the "The Import Tables:" section on:
  // the parsers read nothing before it, and the full header dump would push
  // expected.json past the 64 KiB fixture cap. goldenParity replays the
  // trimmed text, which proves the trim is lossless.
  const trim = (s: string) => {
    const lines = s.split('\n')
    const at = lines.findIndex((l) => l.startsWith('The Import Tables:'))
    return (at < 0 ? lines.slice(0, 1) : [lines[0], ...lines.slice(at)]).join(
      '\n'
    )
  }
  const cases: Record<string, unknown>[] = []

  for (const c of pe) {
    writeFixture(c.file, c.bytes)
  }
  for (const f of extraFiles) writeFixture(f.file, f.bytes)

  for (const c of pe) {
    const abs = join(FIXTURES, c.file)
    const ops: Record<string, unknown> = {}
    const captures: Record<string, { code: number | null; stdout: string }> = {}
    for (const op of PE_OPS) {
      const args =
        op === 'scan_steam_api_imports'
          ? { exePath: abs, appId: '480' }
          : { exePath: abs }
      const r = await runLegacyOp(op, args as never, {
        runObjdump: async (p) => {
          const out = await runObjdump(p)
          const key = relative(FIXTURES, p).split('\\').join('/')
          captures[key] = { code: out.code, stdout: trim(tok(out.stdout)) }
          return out
        }
      })
      ops[op] = normalizeScanResult(op, r, FIXTURES)
    }
    cases.push({
      name: c.name,
      file: c.file,
      ops,
      objdumpCaptures: captures
    })
  }

  for (const m of machoBytes) {
    const bundle = `macho/${m.name}`
    if (m.bytes === null) {
      writeFixture(`${bundle}/.keep`, Buffer.alloc(0))
    } else {
      writeFixture(`${bundle}/${WINEMAC_REL}`, m.bytes)
    }
    macho.push({ name: m.name, bundle })
  }
  for (const m of macho) {
    const op: ScanOp = 'scan_winemac_metal_exports'
    const r = await runLegacyOp(op, {
      wineBundlePath: join(FIXTURES, m.bundle)
    })
    cases.push({
      name: m.name,
      bundle: m.bundle,
      ops: { [op]: normalizeScanResult(op, r, FIXTURES) }
    })
  }

  cases.sort((a, b) => (a.name as string).localeCompare(b.name as string))
  for (const c of cases) {
    const p = prior.get(c.name as string)
    if (p?.rustOverride !== undefined) c.rustOverride = p.rustOverride
    if (p?.divergenceNote !== undefined) c.divergenceNote = p.divergenceNote
  }
  writeFileSync(
    expectedPath,
    JSON.stringify({ version: 1, cases }, null, 2) + '\n'
  )
  console.log(`wrote ${cases.length} cases to ${expectedPath}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
