import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { listBackups } from '../backup'
import { storeVersionCodec } from '../../storeMigrations'
import {
  sideloadLibraryChain,
  steamLibraryChain
} from '../../storeMigrations/gameInfoLibraries'
import {
  createVersioningHarness,
  type VersioningHarness
} from '../../testUtils/testStoreRoot'

const STEAM_KEY = 'store_cache/steam_library'
const SIDELOAD_KEY = 'sideload_apps/library'

let h: VersioningHarness
let root: string
let stderr: jest.SpyInstance

const game = (extra: Record<string, unknown> = {}) => ({
  runner: 'steam',
  app_name: 'a',
  title: 'T',
  art_cover: 'c',
  art_square: 's',
  canRunOffline: true,
  is_installed: false,
  install: {},
  ...extra
})

const stamped = (data: Record<string, unknown>, v: number) =>
  JSON.stringify({ ...data, __internal__: { gamelib: { schemaVersion: v } } })

const run = (file: string, chainKey: string) =>
  h.versioning.runFileMigration(file, {
    chainKey,
    declaration: { kind: 'user-state' },
    codec: storeVersionCodec
  })

const read = (file: string) => JSON.parse(readFileSync(file, 'utf8'))

beforeEach(() => {
  h = createVersioningHarness()
  h.setMigrations(STEAM_KEY, steamLibraryChain)
  h.setMigrations(SIDELOAD_KEY, sideloadLibraryChain)
  root = mkdtempSync(join(tmpdir(), 'gi-libs-'))
  mkdirSync(join(root, 'store_cache'))
  mkdirSync(join(root, 'sideload_apps'))
  stderr = jest.spyOn(process.stderr, 'write').mockImplementation(() => true)
})

afterEach(() => {
  stderr.mockRestore()
  rmSync(root, { recursive: true, force: true })
})

describe('GameInfo library chains through the engine', () => {
  test('v1 steam_library is backed up, stripped and stamped v3', () => {
    const file = join(root, 'store_cache', 'steam_library.json')
    const original = stamped({ games: [game({ staleKey: 1 }), game()] }, 1)
    writeFileSync(file, original)
    expect(run(file, STEAM_KEY).status).toBe('ok')
    const out = read(file)
    expect(out.__internal__.gamelib.schemaVersion).toBe(3)
    expect(out.games).toHaveLength(2)
    expect('staleKey' in out.games[0]).toBe(false)
    const backups = listBackups(file)
    expect(backups).toHaveLength(1)
    expect(readFileSync(backups[0]!, 'utf8')).toBe(original)
    expect(statSync(backups[0]!).mode & 0o777).toBe(0o600)
  })

  test('unstamped sideload library is adopted and stripped in one load', () => {
    const file = join(root, 'sideload_apps', 'library.json')
    writeFileSync(
      file,
      JSON.stringify({ games: [game({ runner: 'sideload', staleKey: 1 })] })
    )
    expect(run(file, SIDELOAD_KEY).status).toBe('ok')
    const out = read(file)
    expect(out.__internal__.gamelib.schemaVersion).toBe(3)
    expect('staleKey' in out.games[0]).toBe(false)
  })

  test('a newer file is left untouched and read-only', () => {
    const file = join(root, 'store_cache', 'steam_library.json')
    const body = stamped({ games: [game({ staleKey: 1 })] }, 4)
    writeFileSync(file, body)
    expect(run(file, STEAM_KEY)).toMatchObject({
      status: 'readOnly',
      reason: 'newer'
    })
    expect(readFileSync(file, 'utf8')).toBe(body)
    expect(listBackups(file)).toEqual([])
  })

  test('a v2 steam_library carrying null optionals is re-stripped once to v3', () => {
    const file = join(root, 'store_cache', 'steam_library.json')
    const original = stamped({ games: [game({ art_logo: null })] }, 2)
    writeFileSync(file, original)
    expect(run(file, STEAM_KEY).status).toBe('ok')
    const out = read(file)
    expect(out.__internal__.gamelib.schemaVersion).toBe(3)
    expect(out.games).toHaveLength(1)
    expect('art_logo' in out.games[0]).toBe(false)
    const backups = listBackups(file)
    expect(backups).toHaveLength(1)
    expect(readFileSync(backups[0]!, 'utf8')).toBe(original)
  })

  test('a second load of a v2 file rewrites nothing and adds no backup', () => {
    const file = join(root, 'store_cache', 'steam_library.json')
    writeFileSync(file, stamped({ games: [game({ staleKey: 1 })] }, 1))
    run(file, STEAM_KEY)
    const after = readFileSync(file, 'utf8')
    expect(run(file, STEAM_KEY).status).toBe('ok')
    expect(readFileSync(file, 'utf8')).toBe(after)
    expect(listBackups(file)).toHaveLength(1)
  })
})
