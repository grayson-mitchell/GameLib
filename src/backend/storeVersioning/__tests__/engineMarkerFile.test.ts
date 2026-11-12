import {
  createVersioningHarness,
  type VersioningHarness
} from '../../testUtils/testStoreRoot'
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { listBackups } from '../backup'
import {
  ENGINE_MARKER_CHAIN,
  ensureEngineMarkerMigrated,
  engineMarkerCodec,
  engineMarkerVersion,
  isEngineMarkerReadOnly
} from '../engineMarkerFile'

let root: string
let file: string

const FILE_NAME = '.gamelib-engine.json'

const fixtures: Record<string, object> = {
  crossover: {
    kind: 'crossover',
    id: 'crossover',
    wineserverBin: '/cx/wineserver'
  },
  'pinned+dxvk': {
    kind: 'pinned',
    id: 'wine-staging-11.20',
    wineserverBin: '/p/wineserver',
    dxvk: { dir: '/tools/steam-engines/dxvk', version: 'v2.4' }
  },
  'pinned+failed': {
    kind: 'pinned',
    id: 'wine-staging-11.20',
    wineserverBin: '/p/wineserver',
    dxvk: 'failed'
  },
  'wine-manager': {
    kind: 'wine-manager',
    id: 'wine-ge',
    wineserverBin: '/w/wineserver'
  }
}

// One engine and tracker per test: nothing carries over between tests.
let h: VersioningHarness

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'gamelib-engine-marker-'))
  file = join(root, FILE_NAME)
  h = createVersioningHarness()
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('engineMarkerCodec', () => {
  let stderr: jest.SpyInstance
  beforeEach(() => {
    stderr = jest.spyOn(process.stderr, 'write').mockImplementation(() => true)
  })
  afterEach(() => stderr.mockRestore())

  it('reads integer versions, absent as 0, invalid as 0 with a data-free line', () => {
    expect(engineMarkerCodec.read({ version: 1 })).toBe(1)
    expect(engineMarkerCodec.read({})).toBe(0)
    expect(engineMarkerCodec.read({ version: '1' })).toBe(0)
    expect(engineMarkerCodec.read({ version: 1.5 })).toBe(0)
    expect(engineMarkerCodec.read({ version: -1 })).toBe(0)
    expect(stderr).toHaveBeenCalledTimes(3)
  })

  it('never mistakes the nested dxvk.version for the stamp', () => {
    expect(engineMarkerCodec.read(fixtures['pinned+dxvk'] as never)).toBe(0)
    expect(stderr).not.toHaveBeenCalled()
  })

  it('writes a top-level version without mutating its input', () => {
    const input = { kind: 'crossover' }
    expect(engineMarkerCodec.write(input, 1)).toEqual({
      kind: 'crossover',
      version: 1
    })
    expect(input).toEqual({ kind: 'crossover' })
  })
})

describe('ensureEngineMarkerMigrated', () => {
  it.each(Object.keys(fixtures))(
    'adopts a legacy %s marker byte-identically, no backup',
    (name) => {
      writeFileSync(file, JSON.stringify(fixtures[name]))
      const before = readFileSync(file)
      ensureEngineMarkerMigrated(h.versioning, file)
      expect(readFileSync(file).equals(before)).toBe(true)
      expect(listBackups(file)).toEqual([])
      expect(readdirSync(root)).toEqual([FILE_NAME])
      expect(isEngineMarkerReadOnly(h.versioning, file)).toBe(false)
    }
  )

  it('leaves a v1-stamped marker untouched and writable', () => {
    writeFileSync(
      file,
      JSON.stringify({ version: 1, ...fixtures['crossover'] })
    )
    const before = readFileSync(file)
    ensureEngineMarkerMigrated(h.versioning, file)
    expect(readFileSync(file).equals(before)).toBe(true)
    expect(isEngineMarkerReadOnly(h.versioning, file)).toBe(false)
  })

  it('treats a version-2 marker as newer: read-only, untouched', () => {
    writeFileSync(
      file,
      JSON.stringify({ version: 2, ...fixtures['crossover'] })
    )
    const before = readFileSync(file)
    ensureEngineMarkerMigrated(h.versioning, file)
    expect(isEngineMarkerReadOnly(h.versioning, file)).toBe(true)
    expect(h.versioning.readOnlyReasonOf(file)).toBe('newer')
    expect(readFileSync(file).equals(before)).toBe(true)
  })

  it('has no opinion on malformed JSON', () => {
    writeFileSync(file, '{nope')
    expect(() => ensureEngineMarkerMigrated(h.versioning, file)).not.toThrow()
    expect(readFileSync(file, 'utf8')).toBe('{nope')
    expect(isEngineMarkerReadOnly(h.versioning, file)).toBe(false)
  })

  it('creates nothing for a missing file', () => {
    ensureEngineMarkerMigrated(h.versioning, file)
    expect(existsSync(file)).toBe(false)
    expect(readdirSync(root)).toEqual([])
    expect(isEngineMarkerReadOnly(h.versioning, file)).toBe(false)
  })

  it('is at v1, and a v2 migration migrates a legacy marker with a backup', () => {
    expect(engineMarkerVersion(h.versioning)).toBe(1)
    writeFileSync(file, JSON.stringify(fixtures['crossover']))
    h.setMigrations(ENGINE_MARKER_CHAIN, [
      { id: 't', to: 2, run: (d) => ({ ...d, extra: true }) }
    ])
    ensureEngineMarkerMigrated(h.versioning, file)
    const live = JSON.parse(readFileSync(file, 'utf8'))
    expect(live.version).toBe(2)
    expect(live.extra).toBe(true)
    expect(live.kind).toBe('crossover')
    expect(listBackups(file)).toHaveLength(1)
  })
})
