/**
 * Phase 84 deletion gate for the logger slice (TS half): the TS logger is only a fire-and-forget
 * forwarder, and the Rust shell owns every log file (D-08). Fails if a deleted TS file, a TS file
 * write in the logger, a deleted identifier, a TS registration of a logger-slice channel, or a
 * rollback flag comes back. 84-08 adds the Rust half (shell_diag, gamelib-shell.log, the steamcm
 * forwarder).
 *
 * Modelled on nativeSeamPortComplete (82 D-05): every scan runs over comment-stripped text, the
 * walk has a floor on the files it read, and self-tests prove each scan can fail.
 *
 * The golden fixtures stay after the TS oracle is deleted: the Rust golden
 * (`cargo test -p gamelib-log --test golden`) keeps asserting against them.
 */
import { assertAtOrAboveFloor } from 'backend/testUtils/censusFloor'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, relative } from 'path'

const ROOT = join(__dirname, '..', '..', '..')

const DELETED = [
  'src/backend/logger/log_writer.ts',
  'src/backend/logger/formatter.ts',
  'src/backend/logger/sanitizeRendererLogMessage.ts',
  'src/backend/logger/uploader.ts',
  'src/backend/logger/stores.ts',
  'src/backend/sidecar/loggerFlowRegistration.ts',
  'src/backend/logger/__tests__/logWriter.test.ts',
  'src/backend/logger/__tests__/sanitizeRendererLogMessage.test.ts',
  'src/backend/logger/__tests__/logGolden.test.ts',
  'src/backend/sidecar/__tests__/loggerFlows.test.ts',
  'src/backend/sidecar/__tests__/loggerCallSiteGuard.test.ts'
]

const GOLDEN = 'src-tauri/crates/gamelib-log/tests/fixtures/golden'

const KEPT = [
  'src/backend/logger/index.ts',
  'src/backend/logger/constants.ts',
  'src/backend/logger/types.ts',
  'src/backend/logger/forwarder.ts',
  'src/backend/logger/stringifyLogValue.ts',
  'src/backend/logger/targetWriter.ts',
  `${GOLDEN}/cases.json`,
  `${GOLDEN}/entries.json`,
  `${GOLDEN}/NOTES.md`,
  `${GOLDEN}/expected`
]

/** Identifiers that were deleted with the TS logger internals; none may be named in non-test code. */
const FORBIDDEN_IDENTIFIERS = [
  'createLoggerStores',
  'uploadedLogFileStore',
  'registerLoggerFlows',
  'sanitizeRendererLogMessage'
]

/** The five file-write calls the TS logger no longer makes (the Rust shell writes every log file). */
const FILE_WRITE_RE =
  /\b(appendFile|renameSync|writeFileSync|createWriteStream|mkdir)/

/** The rollback flag no fallback window was named for (v0.11 rule). */
const FLAG = 'GAMELIB_LOGGER'

/**
 * Floors (82 D-05). Measured 2026-11-21 (84-07) over non-test src/ and meta/: well above 500 files
 * (the 83 native-seam gate read 1281+ over the same trees plus src-tauri/src). The manifest names
 * 7 logger-slice channels. Never lower a floor to make a red run green.
 */
const SCANNED_FILES_FLOOR = 500
const LOGGER_CHANNELS_FLOOR = 7

interface Manifest {
  channels: Record<string, { slice: string }>
}

const manifest = JSON.parse(
  readFileSync(
    join(ROOT, 'src', 'common', 'types', 'ipc', 'nativeChannels.json'),
    'utf8'
  )
) as Manifest

const loggerChannels = Object.entries(manifest.channels)
  .filter(([, spec]) => spec.slice === 'logger')
  .map(([name]) => name)

function walk(dir: string, out: string[], ext: RegExp): void {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '__tests__') continue
    const full = join(dir, e.name)
    if (e.isDirectory()) walk(full, out, ext)
    else if (ext.test(e.name)) out.push(full)
  }
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** True when `code` (comments stripped) registers `name` as a literal sidecar channel. */
function registersChannel(code: string, name: string): boolean {
  return new RegExp(`ipc\\.(on|handle)\\(\\s*['"]${escapeRe(name)}['"]`).test(
    code
  )
}

function identifierHits(
  files: readonly { path: string; src: string }[],
  identifiers: readonly string[]
): string[] {
  const hits: string[] = []
  for (const f of files) {
    const code = stripSourceComments(f.src)
    for (const id of identifiers) {
      if (code.includes(id)) hits.push(`${f.path}: ${id}`)
    }
  }
  return hits
}

function fileWriteHits(
  files: readonly { path: string; src: string }[]
): string[] {
  return files
    .filter((f) => FILE_WRITE_RE.test(stripSourceComments(f.src)))
    .map((f) => f.path)
}

describe('logger port complete (Phase 84, TS half)', () => {
  const tsFiles: string[] = []
  walk(join(ROOT, 'src'), tsFiles, /\.(ts|tsx|cjs|js)$/)
  walk(join(ROOT, 'meta'), tsFiles, /\.(ts|tsx|cjs|js)$/)
  const rsFiles: string[] = []
  walk(join(ROOT, 'src-tauri', 'src'), rsFiles, /\.rs$/)
  const load = (f: string) => ({
    path: relative(ROOT, f),
    src: readFileSync(f, 'utf8')
  })
  const loaded = tsFiles.map(load)
  const loggerSources = loaded.filter((f) =>
    f.path.startsWith('src/backend/logger/')
  )

  it.each(DELETED)('%s is deleted', (p) => {
    expect(existsSync(join(ROOT, p))).toBe(false)
  })

  it.each(KEPT)('%s is kept', (p) => {
    expect(existsSync(join(ROOT, p))).toBe(true)
  })

  it('the TS logger writes no file (no appendFile, renameSync, writeFileSync, createWriteStream or mkdir)', () => {
    expect(fileWriteHits(loggerSources)).toEqual([])
  })

  it.each(FORBIDDEN_IDENTIFIERS)(
    'non-test src/ and meta/ never name %s',
    (id) => {
      expect(identifierHits(loaded, [id])).toEqual([])
    }
  )

  it.each(loggerChannels)(
    'logger-slice channel %s has no sidecar ipc.on or ipc.handle',
    (name) => {
      const hits = loaded
        .filter((f) => registersChannel(stripSourceComments(f.src), name))
        .map((f) => f.path)
      expect(hits).toEqual([])
    }
  )

  it(`no ${FLAG} rollback flag text survives in src/, meta/ or src-tauri/src`, () => {
    const hits: string[] = []
    for (const f of [...tsFiles, ...rsFiles]) {
      if (readFileSync(f, 'utf8').includes(FLAG)) hits.push(relative(ROOT, f))
    }
    // This file names the flag to forbid it, and lives under __tests__ (not walked).
    expect(hits).toEqual([])
  })

  it('anti-vacuity: the walk scanned a real tree and the manifest has the logger slice', () => {
    assertAtOrAboveFloor(
      'loggerPortComplete files',
      tsFiles.length,
      SCANNED_FILES_FLOOR
    )
    assertAtOrAboveFloor(
      'logger-slice channels',
      loggerChannels.length,
      LOGGER_CHANNELS_FLOOR
    )
    assertAtOrAboveFloor('logger sources', loggerSources.length, 5)
  })

  it('self-test: a file write in code is caught, the same text in a comment is not', () => {
    const code = "import { appendFile } from 'fs'\nappendFile(p, line, cb)"
    const comment = '// appendFile(p, line) moved to Rust\n/* mkdir(dir) */'
    expect(fileWriteHits([{ path: 'a.ts', src: code }])).toEqual(['a.ts'])
    expect(fileWriteHits([{ path: 'b.ts', src: comment }])).toEqual([])
    for (const call of [
      'renameSync(a, b)',
      'writeFileSync(a, b)',
      'createWriteStream(a)',
      'fs.mkdir(a)'
    ]) {
      expect(fileWriteHits([{ path: 'c.ts', src: call }])).toEqual(['c.ts'])
    }
  })

  it('self-test: a deleted identifier in code is caught, the same text in a comment is not', () => {
    const hits = identifierHits(
      [
        { path: 'x.ts', src: 'const s = createLoggerStores()' },
        {
          path: 'y.ts',
          src: '// createLoggerStores moved to Rust\nconst q = 1'
        }
      ],
      FORBIDDEN_IDENTIFIERS
    )
    expect(hits).toEqual(['x.ts: createLoggerStores'])
  })

  it('self-test: a logger-channel registration in code is caught, in a comment or another channel it is not', () => {
    expect(registersChannel("deps.ipc.handle('logError', f)", 'logError')).toBe(
      true
    )
    expect(registersChannel("ipc.on('logInfo', f)", 'logInfo')).toBe(true)
    expect(
      registersChannel(
        stripSourceComments("// ipc.on('logError', f)"),
        'logError'
      )
    ).toBe(false)
    expect(registersChannel("ipc.on('logErrors', f)", 'logError')).toBe(false)
  })

  it('self-test: an empty directory walks no files and fails the scan floor', () => {
    const dir = mkdtempSync(join(tmpdir(), 'logger-port-complete-'))
    try {
      const found: string[] = []
      walk(dir, found, /\.(ts|rs)$/)
      expect(found).toHaveLength(0)
      expect(() =>
        assertAtOrAboveFloor(
          'loggerPortComplete files',
          found.length,
          SCANNED_FILES_FLOOR
        )
      ).toThrow(/loggerPortComplete files/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
