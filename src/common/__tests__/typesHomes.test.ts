import { readFileSync } from 'fs'
import { join } from 'path'

// Phase 70 D-13: common/types.ts holds shared types only. Every store-specific
// type lives in its own src/common/types/<store>.ts home.

const COMMON = join(__dirname, '..')

// Drop comment lines so prose cannot satisfy or break a declaration check.
const read = (rel: string): string =>
  readFileSync(join(COMMON, rel), 'utf8')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\/?\*)/.test(l))
    .join('\n')

const declares = (src: string, name: string): boolean =>
  new RegExp(
    `(^|\\n)\\s*(export\\s+)?(declare\\s+)?(interface|type)\\s+${name}\\b`
  ).test(src)

const HOMES: Record<string, string[]> = {
  'types/steam.ts': ['SteamGameInfo', 'SteamExtraInfo', 'SteamInstalledInfo'],
  'types/gog.ts': [
    'GogGameInfo',
    'GogInstalledInfo',
    'GOGAchievement',
    'GameAchievement',
    'GOGLoginData',
    'GOGImportData',
    'GOGCloudSavesLocation'
  ],
  'types/legendary.ts': ['LegendaryGameInfo'],
  'types/nile.ts': ['NileGameInfo'],
  'types/sideload.ts': ['SideloadGameInfo']
}

describe('D-13: store-specific types live in their store homes', () => {
  const types = read('types.ts')

  for (const [file, names] of Object.entries(HOMES)) {
    const home = read(file)
    for (const name of names) {
      it(`${name} is declared in ${file} and not in types.ts`, () => {
        expect(declares(home, name)).toBe(true)
        expect(declares(types, name)).toBe(false)
      })
    }
  }

  it('types.ts has no `export ... from` a store type file', () => {
    expect(types).not.toMatch(
      /export\s[^;]*?from\s+['"]\.\/types\/(steam|gog|legendary|nile|sideload)['"]/
    )
  })

  it('types.ts still declares GameInfoCore and the GameInfo union', () => {
    expect(declares(types, 'GameInfoCore')).toBe(true)
    expect(types).toMatch(/export type GameInfo\s*=/)
  })
})
