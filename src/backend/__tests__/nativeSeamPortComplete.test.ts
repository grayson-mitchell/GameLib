/**
 * Phase 83 D-05 deletion gate for the Rust native seam: the `*PortComplete` template, derived from
 * `nativeChannels.json` so every later slice is covered without editing this file.
 *
 * For every native channel in the manifest:
 *   - no TypeScript registration survives (`ipcMain`/`ipc` handle/on/once, `addHandler`,
 *     `addListener`, `handleTyped(deps.ipc, ...)` with the channel as a string literal), and
 *   - no zod key survives in a `src/common/types/ipc/*.ts` domain file (the typing-only
 *     `native.ts` declares the channels on purpose and is the one exclusion).
 * For every slice:
 *   - no `GAMELIB_<SLICE>` text survives in src/, meta/ or src-tauri/src, matched as a whole word.
 *     D-05: no rollback flag exists for these channels, and none is built. A later slice that
 *     needs one records a named window in its plan and adds an explicit exemption here
 *     (`FLAG_EXEMPTIONS`; today only the store slice, Phase 85 D-01, until plan 85-21).
 * The intended survivors still exist, the walk reads at least a floor of files, and self-tests
 * prove the scan can fail.
 *
 * Limit: a registration through a constant (`addHandler(NAME, ...)`) is not matched here; the
 * ownership census (`sidecar/__tests__/nativeChannelOwnership.test.ts`) resolves constants.
 */
import { assertAtOrAboveFloor } from 'backend/testUtils/censusFloor'
import {
  domainSources,
  parseDomainFile
} from 'backend/testUtils/ipcDomainParse'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, relative } from 'path'

const ROOT = join(__dirname, '..', '..', '..')

interface Manifest {
  channels: Record<string, { slice: string }>
}

const manifest = JSON.parse(
  readFileSync(
    join(ROOT, 'src', 'common', 'types', 'ipc', 'nativeChannels.json'),
    'utf8'
  )
) as Manifest

const channelSlice = Object.entries(manifest.channels).map(
  ([name, spec]) => [name, spec.slice] as const
)
const slices = [...new Set(channelSlice.map(([, slice]) => slice))].sort()

/** `app-shell` -> `GAMELIB_APP_SHELL`, the flag name a rollback switch for the slice would take. */
const flagFor = (slice: string): string =>
  `GAMELIB_${slice.toUpperCase().replace(/-/g, '_')}`

/**
 * Slices whose rollback flag may survive, each with its named window. EXACT: a self-test below
 * fails on any other entry. Phase 85 D-01 keeps `GAMELIB_STORE=rust|ts` until the phase's live
 * gate passes; plan 85-21 deletes the flag and this entry with it.
 */
const FLAG_EXEMPTIONS: Record<string, string> = {
  store: 'Phase 85 D-01 rollback window; deleted by plan 85-21'
}

/**
 * True when `src` names `flag` as a whole word. `GAMELIB_STORE` is a prefix of two names that
 * legitimately stay (`GAMELIB_STORE_BOOT`, 85-09, and the `[GAMELIB_STORE_LAZY_MISS]` marker), so
 * a substring match would report them; `_` is a word character, so `\b` does not split them.
 */
const namesFlag = (src: string, flag: string): boolean =>
  new RegExp(`\\b${flag}\\b`).test(src)

// Modules the TS side keeps after the first slice (D-05): the sidecar's own URL policy, the
// version helper the other sidecar consumers still read, and the host seams.
const KEPT = [
  'src/backend/sidecar/openPolicy.ts',
  'src/backend/utils/systeminfo/heroicVersion.ts',
  'src/backend/host/appInfo.ts',
  'src/backend/host/openExternal.ts'
]

// This file builds every forbidden pattern by design; native.ts declares the channels on purpose.
const SELF = join(__dirname, 'nativeSeamPortComplete.test.ts')
const NATIVE_TYPES = join(ROOT, 'src', 'common', 'types', 'ipc', 'native.ts')

/**
 * Floor on files scanned (D-05). Measured 2026-11-20 (83-05) over src/, meta/ and src-tauri/src:
 * 1381 files (1322 TS, 59 Rust, excluding this file and native.ts); the floor is that minus a
 * margin of 100. Never lower it to make a red run green.
 */
const SCANNED_FILES_FLOOR = 1281

function walk(dir: string, out: string[], ext: RegExp): void {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '__tests__') continue
    const full = join(dir, e.name)
    if (e.isDirectory()) walk(full, out, ext)
    else if (ext.test(e.name)) out.push(full)
  }
}

const stripComments = (src: string): string =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !/^\s*\/\//.test(l))
    .join('\n')

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** True when `src` (comments already stripped) registers `name` as a literal channel. */
function registersChannel(src: string, name: string): boolean {
  const n = escapeRe(name)
  return [
    new RegExp(`(ipcMain|ipc)\\.(handle|on|once)\\(\\s*['"]${n}['"]`),
    new RegExp(`add(Handler|Listener)\\(\\s*['"]${n}['"]`),
    new RegExp(`handleTyped\\(\\s*[\\w.]+\\s*,\\s*['"]${n}['"]`)
  ].some((re) => re.test(src))
}

/** `file: channel` for every surviving registration of one of `names` in `files`. */
function survivingRegistrations(
  files: readonly { path: string; src: string }[],
  names: readonly string[]
): string[] {
  const hits: string[] = []
  for (const f of files) {
    const code = stripComments(f.src)
    for (const name of names) {
      if (registersChannel(code, name)) hits.push(`${f.path}: ${name}`)
    }
  }
  return hits
}

describe('native seam port complete (Phase 83 D-05)', () => {
  const tsFiles: string[] = []
  walk(join(ROOT, 'src'), tsFiles, /\.(ts|tsx|cjs|js)$/)
  walk(join(ROOT, 'meta'), tsFiles, /\.(ts|tsx|cjs|js)$/)
  const rsFiles: string[] = []
  walk(join(ROOT, 'src-tauri', 'src'), rsFiles, /\.rs$/)
  const scannedTs = tsFiles.filter((f) => f !== SELF && f !== NATIVE_TYPES)
  const scannedAll = [...scannedTs, ...rsFiles]
  const loaded = scannedTs.map((f) => ({
    path: relative(ROOT, f),
    src: readFileSync(f, 'utf8')
  }))

  it('the manifest names at least one channel and one slice (not vacuous)', () => {
    assertAtOrAboveFloor('native manifest channels', channelSlice.length, 1)
    assertAtOrAboveFloor('native manifest slices', slices.length, 1)
  })

  it.each(channelSlice)(
    'native channel %s (slice %s): no TS registration survives',
    (name) => {
      expect(survivingRegistrations(loaded, [name])).toEqual([])
    }
  )

  it.each(channelSlice)(
    'native channel %s (slice %s): no zod key survives in a domain file',
    (name) => {
      const hits: string[] = []
      for (const [file, source] of Object.entries(domainSources())) {
        if (file === 'native') continue
        for (const part of parseDomainFile(source)) {
          if (part.keys.includes(name)) hits.push(`${file}.ts: ${part.name}`)
        }
      }
      expect(hits).toEqual([])
    }
  )

  it.each(slices.filter((slice) => !(slice in FLAG_EXEMPTIONS)))(
    'slice %s: no rollback flag text survives',
    (slice) => {
      const flag = flagFor(slice)
      const hits: string[] = []
      for (const f of scannedAll) {
        const src = stripComments(readFileSync(f, 'utf8'))
        if (namesFlag(src, flag)) hits.push(relative(ROOT, f))
      }
      expect(hits).toEqual([])
    }
  )

  it('the flag exemptions name only the store slice, with its window, and that slice exists', () => {
    expect(Object.keys(FLAG_EXEMPTIONS)).toEqual(['store'])
    expect(FLAG_EXEMPTIONS['store']).toBe(
      'Phase 85 D-01 rollback window; deleted by plan 85-21'
    )
    expect(slices).toContain('store')
  })

  it('the flag scan matches the flag as a whole word only', () => {
    const flag = flagFor('store')
    expect(flag).toBe('GAMELIB_STORE')
    expect(namesFlag('std::env::var("GAMELIB_STORE_BOOT")', flag)).toBe(false)
    expect(
      namesFlag("export const M = '[GAMELIB_STORE_LAZY_MISS]' as const", flag)
    ).toBe(false)
    expect(namesFlag('GAMELIB_STORE=ts pnpm tauri:dev', flag)).toBe(true)
    expect(namesFlag('env::var("GAMELIB_STORE")', flag)).toBe(true)
    expect(namesFlag('MY_GAMELIB_STORE', flag)).toBe(false)
  })

  it.each(KEPT)('%s is kept', (p) => {
    expect(existsSync(join(ROOT, p))).toBe(true)
  })

  it('openPolicy.ts still exports assertOpenableExternalUrl', () => {
    expect(
      readFileSync(join(ROOT, 'src/backend/sidecar/openPolicy.ts'), 'utf8')
    ).toMatch(/export function assertOpenableExternalUrl\(/)
  })

  it('the scan can fail: a registration in code is caught, the same text in a comment is not', () => {
    const code = "deps.ipc.handle('getHeroicVersion', async () => 'x')"
    const comment =
      "// deps.ipc.handle('getHeroicVersion', ...) moved to Rust\n/* addListener('getHeroicVersion', f) */"
    expect(registersChannel(stripComments(code), 'getHeroicVersion')).toBe(true)
    expect(registersChannel(stripComments(comment), 'getHeroicVersion')).toBe(
      false
    )
    for (const reg of [
      "ipcMain.on('x:y', f)",
      "ipcMain.once('x:y', f)",
      "addHandler('x:y', f)",
      "addListener('x:y', f)",
      "handleTyped(deps.ipc, 'x:y', f)"
    ]) {
      expect(registersChannel(reg, 'x:y')).toBe(true)
    }
    expect(registersChannel("ipc.handle('x-y-z', f)", 'x:y')).toBe(false)
  })

  it('a manifest channel the walk does register would fail the gate (synthetic source)', () => {
    const hits = survivingRegistrations(
      [
        { path: 'synthetic/registers.ts', src: "ipc.handle('fakeChannel', f)" },
        { path: 'synthetic/quiet.ts', src: "ipc.handle('otherChannel', f)" }
      ],
      ['fakeChannel']
    )
    expect(hits).toEqual(['synthetic/registers.ts: fakeChannel'])
  })

  it('the flag name is derived from the slice', () => {
    expect(flagFor('app-shell')).toBe('GAMELIB_APP_SHELL')
    expect(flagFor('shell')).toBe('GAMELIB_SHELL')
  })

  it('anti-vacuity: the walk scanned a real tree', () => {
    assertAtOrAboveFloor(
      'nativeSeamPortComplete files',
      scannedAll.length,
      SCANNED_FILES_FLOOR
    )
  })

  it('empty-input (D-05): an empty directory walks no files and fails the scan floor', () => {
    const dir = mkdtempSync(join(tmpdir(), 'native-port-complete-'))
    try {
      const found: string[] = []
      walk(dir, found, /\.(ts|rs)$/)
      expect(found).toHaveLength(0)
      expect(() =>
        assertAtOrAboveFloor(
          'nativeSeamPortComplete files',
          found.length,
          SCANNED_FILES_FLOOR
        )
      ).toThrow(/nativeSeamPortComplete files/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
