/**
 * Pins the export surface of steam/games.ts (62-05, D-05).
 *
 * The module-state, requirements and DRM helpers that used to live above the
 * class moved to gameSessionState.ts / gameRequirements.ts / gameDrmLaunch.ts
 * (and gameProtocolUrl.ts / gameConstants.ts). Every importer and jest.mock
 * targets the owning module, so games.ts must not re-export any of them. A
 * re-export would hide a stale import path and fork jest.mock targets.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const DECL =
  /^export\s+(?:default\s+)?(?:async\s+)?(?:function|const|let|class|type|interface)\s+(\w+)/gm

const exportedNames = (file: string): string[] => {
  const src = readFileSync(join(__dirname, '..', file), 'utf8')
  return [...src.matchAll(DECL)].map((m) => m[1])
}

// Changes only when a later phase-62 plan moves another symbol out of
// games.ts (the class method lifts in 62-06..62-08 leave this list alone).
const GAMES_TS_EXPORTS = ['SteamGame', 'getBridgeRouteVerdict']

const MOVED_OWNERS = [
  'gameConstants.ts',
  'gameSessionState.ts',
  'gameRequirements.ts',
  'gameDrmLaunch.ts',
  'gameProtocolUrl.ts'
]

describe('steam/games.ts module surface (D-05)', () => {
  const src = readFileSync(join(__dirname, '..', 'games.ts'), 'utf8')

  it('exports exactly the pinned names', () => {
    expect(exportedNames('games.ts').sort()).toEqual(
      [...GAMES_TS_EXPORTS].sort()
    )
  })

  it('re-exports nothing (no `export ... from`, no `export { ... }`)', () => {
    expect(src).not.toMatch(/^export\s*\{/m)
    expect(src).not.toMatch(/^export\s*\*/m)
    expect(src).not.toMatch(/^export\b[^\n]*\bfrom\s+'/m)
  })

  it('does not export any symbol owned by a moved module', () => {
    const gamesExports = new Set(exportedNames('games.ts'))
    for (const owner of MOVED_OWNERS) {
      const names = exportedNames(owner)
      expect(names.length).toBeGreaterThan(0)
      for (const name of names) {
        expect(gamesExports.has(name)).toBe(false)
      }
    }
  })

  it('no moved module imports games.ts (they stay leaves)', () => {
    for (const owner of MOVED_OWNERS) {
      const text = readFileSync(join(__dirname, '..', owner), 'utf8')
      expect(text).not.toMatch(/from\s+'\.\/games'/)
    }
  })
})
