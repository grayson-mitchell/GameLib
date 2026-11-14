import { readFileSync } from 'fs'
import { join } from 'path'
import {
  downloadManagerChain,
  gogInstalledChain,
  gogLibraryChain,
  legendaryLibraryChain,
  nileLibraryChain,
  sideloadLibraryChain,
  steamLibraryChain
} from '../gameInfoLibraries'
import { createMigrations, STORE_MIGRATIONS } from '..'
import type { Migration } from '../../storeVersioning/types'

type Obj = Record<string, unknown>

const fixture = (name: string): Obj =>
  JSON.parse(readFileSync(join(__dirname, 'fixtures', name), 'utf8'))

const only = (chain: readonly Migration[]): Migration => chain.at(-1)!
const apply = (chain: readonly Migration[], file: Obj): Obj =>
  only(chain).run(structuredClone(file))

const CASES: Array<{
  name: string
  chain: readonly Migration[]
  keys: string[]
  fixtureName: string
  realKeys: string
}> = [
  {
    name: 'steam',
    chain: steamLibraryChain,
    keys: ['games'],
    fixtureName: 'steam-library-gameinfo-v1.json',
    realKeys: 'steam-library-real-keys.json'
  },
  {
    name: 'gog',
    chain: gogLibraryChain,
    keys: ['games'],
    fixtureName: 'gog-library-gameinfo-v1.json',
    realKeys: 'gog-library-real-keys.json'
  },
  {
    name: 'gog installed',
    chain: gogInstalledChain,
    keys: ['installed'],
    fixtureName: 'gog-installed-gameinfo-v1.json',
    realKeys: 'gog-installed-real-keys.json'
  },
  {
    name: 'legendary',
    chain: legendaryLibraryChain,
    keys: ['library'],
    fixtureName: 'legendary-library-gameinfo-v1.json',
    realKeys: 'legendary-library-real-keys.json'
  },
  {
    name: 'nile',
    chain: nileLibraryChain,
    keys: ['library'],
    fixtureName: 'nile-library-gameinfo-v1.json',
    realKeys: 'nile-library-real-keys.json'
  },
  {
    name: 'sideload',
    chain: sideloadLibraryChain,
    keys: ['games', 'installed'],
    fixtureName: 'sideload-library-gameinfo-v0.json',
    realKeys: 'sideload-library-real-keys.json'
  },
  {
    name: 'download-manager',
    chain: downloadManagerChain,
    keys: ['queue', 'finished'],
    fixtureName: 'download-manager-gameinfo-v1.json',
    realKeys: 'download-manager-real-keys.json'
  }
]

// download-manager nests the GameInfo; everything else is the item itself.
const gameInfoOf = (item: Obj): Obj =>
  ((item['params'] as Obj | undefined)?.['gameInfo'] as Obj | undefined) ?? item

describe.each(CASES)(
  '$name chain',
  ({ chain, keys, fixtureName, realKeys }) => {
    const file = fixture(fixtureName)

    test('targets v2 and is registered', () => {
      expect(only(chain).to).toBe(2)
    })

    test('removes every undeclared key and keeps the entry count', () => {
      const out = apply(chain, file)
      for (const key of keys) {
        const before = file[key] as unknown[]
        const after = out[key] as unknown[]
        expect(after).toHaveLength(before.length)
      }
      expect(JSON.stringify(out)).not.toMatch(/stale|junk/)
    })

    test('keeps declared keys with their values', () => {
      const out = apply(chain, file)
      const [first] = out[keys[0]!] as Obj[]
      const original = (file[keys[0]!] as Obj[])[0]!
      if (keys[0] === 'installed') {
        expect(first!['executable']).toBe(original['executable'])
        return
      }
      const gi = gameInfoOf(first!)
      const origGi = gameInfoOf(original)
      expect(gi['app_name']).toBe(origGi['app_name'])
      expect(gi['title']).toBe('T')
      expect((gi['install'] as Obj)['install_path']).toBe('/p')
      expect((gi['extra'] as Obj)['genres']).toEqual(['g'])
      expect((gi['overrides'] as Obj)['title']).toBe('o')
    })

    test('an already clean file is deep-equal after the strip', () => {
      const once = apply(chain, file)
      expect(only(chain).run(structuredClone(once))).toEqual(once)
    })

    test('real-key fixture survives unchanged (a failure means 70-13 forgot a key)', () => {
      const real = fixture(realKeys)
      expect(apply(chain, real)).toEqual(real)
    })

    test('is total on hostile input', () => {
      const items = [null, 1, 'a', [], { runner: 'unknown', x: 1 }]
      expect(() => only(chain).run({})).not.toThrow()
      expect(only(chain).run({})).toEqual({})
      const wrong: Obj = {}
      for (const k of keys) wrong[k] = 'x'
      expect(only(chain).run(structuredClone(wrong))).toEqual(wrong)
      // Installed-info items carry no runner, so a plain object there is stripped to its
      // declared keys by design; only the runner-keyed arrays keep an unknown-runner item.
      const hostile: Obj = {}
      for (const k of keys) {
        hostile[k] = k === 'installed' ? items.slice(0, 4) : items
      }
      expect(only(chain).run(structuredClone(hostile))).toEqual(hostile)
    })
  }
)

describe('specific shapes', () => {
  test('entries without a runner are stripped with the file store', () => {
    const out = apply(
      steamLibraryChain,
      fixture('steam-library-gameinfo-v1.json')
    )
    const second = (out['games'] as Obj[])[1]!
    expect('staleTopKey' in second).toBe(false)
    expect(second['title']).toBe('T')
  })

  test('legendary dlcList elements are preserved byte-for-byte', () => {
    const file = fixture('legendary-library-gameinfo-v1.json')
    const out = apply(legendaryLibraryChain, file)
    const dlc = (arr: unknown) => (arr as Obj[])[0]!['dlcList']
    expect(dlc(out['library'])).toEqual(dlc(file['library']))
    expect(JSON.stringify(dlc(out['library']))).toContain('mainGameItemList')
  })

  test('gog cyberpunk nested key is stripped, declared ones kept', () => {
    const out = apply(gogLibraryChain, fixture('gog-library-gameinfo-v1.json'))
    const install = (out['games'] as Obj[])[0]!['install'] as Obj
    expect(install['cyberpunk']).toEqual({ modsEnabled: true, modsToLoad: [] })
  })

  test('download-manager leaves other params keys and entries untouched', () => {
    const file = fixture('download-manager-gameinfo-v1.json')
    const out = apply(downloadManagerChain, file)
    const q = (out['queue'] as Obj[])[0]!
    expect(q['status']).toBe('done')
    expect((q['params'] as Obj)['path']).toBe('/p')
    expect((q['params'] as Obj)['appName']).toBe('a')
    // finished[1] has no gameInfo.runner: its params.runner is the fallback
    const f1 = (out['finished'] as Obj[])[1]!
    expect(JSON.stringify(f1)).not.toMatch(/stale/)
  })

  test('sideload unknown runner item is untouched', () => {
    const file = { games: [{ runner: 'unknown', x: 1 }], installed: [] }
    expect(apply(sideloadLibraryChain, file)).toEqual(file)
  })
})

describe('registration', () => {
  test.each([
    'store_cache/steam_library',
    'store_cache/gog_library',
    'gog_store/installed',
    'store_cache/legendary_library',
    'store_cache/nile_library',
    'sideload_apps/library',
    'store/download-manager'
  ])('%s is at version 2', (key) => {
    expect(STORE_MIGRATIONS[key]).toBeDefined()
    expect(createMigrations().currentVersionOf(key)).toBe(2)
  })
})
