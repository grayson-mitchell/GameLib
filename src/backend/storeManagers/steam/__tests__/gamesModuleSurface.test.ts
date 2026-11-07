/**
 * Pins the export surface of steam/games.ts (62-05, D-05).
 *
 * The module-state, requirements and DRM helpers that used to live above the
 * class moved to gameSessionState.ts / gameRequirements.ts / gameDrmLaunch.ts
 * (and gameProtocolUrl.ts / gameConstants.ts). Every importer and jest.mock
 * targets the owning module, so games.ts must not re-export any of them. A
 * re-export would hide a stale import path and fork jest.mock targets.
 *
 * It also pins the sibling import order of the lifted modules: forward only
 * (quick-261107-an2), so direct calls between them can never form a cycle.
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
const GAMES_TS_EXPORTS = ['SteamGame']

const MOVED_OWNERS = [
  'gameConstants.ts',
  'gameSessionState.ts',
  'gameRequirements.ts',
  'gameDrmLaunch.ts',
  'gameProtocolUrl.ts'
]

// Lifted method clusters (62-06..62-08): free functions taking `steamGame`.
// They may reference the class only via `import type SteamGame from './games'`.
const LIFTED_OWNERS = [
  'gameEligibility.ts',
  'gameInstall.ts',
  'bridgeInstallState.ts',
  'gameInstallDepot.ts',
  'gameInstallBridge.ts',
  'gameLaunchOverlay.ts',
  'gameBridgeLaunch.ts',
  'gameBridgeWineLaunch.ts',
  'gameLaunch.ts',
  'gameMaintenance.ts',
  'gameUninstall.ts',
  'gameMetadata.ts'
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

  it('lifted modules import games.ts type-only and re-export nothing', () => {
    for (const owner of LIFTED_OWNERS) {
      const text = readFileSync(join(__dirname, '..', owner), 'utf8')
      const imports = [...text.matchAll(/^import\b[^\n]*from\s+'\.\/games'/gm)]
      for (const m of imports) {
        expect(m[0]).toBe("import type SteamGame from './games'")
      }
      expect(text).not.toMatch(/^export\s*\{/m)
      expect(text).not.toMatch(/^export\b[^\n]*\bfrom\s+'/m)
    }
  })

  it('does not export any symbol owned by a lifted module', () => {
    const gamesExports = new Set(exportedNames('games.ts'))
    for (const owner of LIFTED_OWNERS) {
      const names = exportedNames(owner)
      expect(names.length).toBeGreaterThan(0)
      for (const name of names) {
        expect(gamesExports.has(name)).toBe(false)
      }
    }
  })

  it('lifted modules import siblings forward only (no cycle)', () => {
    // gameEligibility/gameLaunchOverlay -> gameInstall -> gameLaunch ->
    // gameBridgeLaunch; gameUninstall and gameMaintenance sit beside them
    // and nothing imports those two.
    // gameMetadata (65-13) is a leaf beneath gameEligibility, which calls it.
    const FORWARD: Record<string, number> = {
      gameMetadata: -1,
      gameEligibility: 0,
      gameLaunchOverlay: 0,
      bridgeInstallState: 0,
      gameInstallDepot: 0,
      gameInstall: 1,
      gameInstallBridge: 2,
      gameLaunch: 2,
      gameBridgeLaunch: 3,
      gameBridgeWineLaunch: 4,
      gameUninstall: 4,
      gameMaintenance: 4
    }
    for (const owner of LIFTED_OWNERS) {
      const ownerName = owner.replace(/\.ts$/, '')
      expect(FORWARD[ownerName]).toBeDefined()
      const text = readFileSync(join(__dirname, '..', owner), 'utf8')
      const targets = [...text.matchAll(/(?:from|import)\s+'\.\/(game\w+)'/g)]
        .map((m) => m[1])
        .filter((name) => `${name}.ts` !== owner && name in FORWARD)
      for (const target of targets) {
        expect(FORWARD[target]).toBeLessThan(FORWARD[ownerName])
      }
    }
  })
})
