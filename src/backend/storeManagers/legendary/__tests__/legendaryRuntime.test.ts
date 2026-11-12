/**
 * 66.4-11: the Legendary runtime holds per-instance state. Two runtimes share no account games,
 * installed games, library entries or stubs; deriveLegendaryPaths is pure over its roots and keeps the
 * snap arm.
 */
import type { GameInfo } from 'common/types'
import type { InstalledJsonMetadata } from 'common/types/legendary'
import { join } from 'path'
import { createLegendaryRuntime } from '../legendaryRuntime'
import { deriveLegendaryPaths } from '../constants'
import type { LegendaryCommand } from '../commands'

describe('createLegendaryRuntime', () => {
  it('starts with empty collections', () => {
    const { libraryState } = createLegendaryRuntime()
    expect(libraryState.allGames.size).toBe(0)
    expect(libraryState.installedGames.size).toBe(0)
    expect(libraryState.library.size).toBe(0)
  })

  it('two runtimes share no games, installed list or library map', () => {
    const a = createLegendaryRuntime()
    const b = createLegendaryRuntime()
    a.libraryState.allGames.add('Iris')
    a.libraryState.installedGames.set('Iris', {
      app_name: 'Iris'
    } as InstalledJsonMetadata)
    a.libraryState.library.set('Iris', { app_name: 'Iris' } as GameInfo)

    expect(b.libraryState.allGames.has('Iris')).toBe(false)
    expect(b.libraryState.installedGames.has('Iris')).toBe(false)
    expect(b.libraryState.library.has('Iris')).toBe(false)
  })

  it('replacing the installed map on one runtime does not touch another', () => {
    const a = createLegendaryRuntime()
    const b = createLegendaryRuntime()
    b.libraryState.installedGames.set('Keep', {} as InstalledJsonMetadata)
    a.libraryState.installedGames = new Map()
    expect(b.libraryState.installedGames.has('Keep')).toBe(true)
  })

  it('stubs default to the --version answer, can be replaced and reset, and are per runtime', async () => {
    const a = createLegendaryRuntime()
    const b = createLegendaryRuntime()
    const version = { subcommand: '--version' } as unknown as LegendaryCommand
    // The default stub matches a command whose `--version` part is set.
    const versionCmd = { '--version': true } as unknown as LegendaryCommand
    expect((await a.stubs.run(versionCmd)).stdout).toContain(
      'legendary version'
    )
    expect(await a.stubs.run(version)).toEqual({ stdout: '', stderr: '' })

    a.stubs.set([{ commandParts: ['list'], stdout: 'listed' }])
    expect(
      (await a.stubs.run({ list: true } as unknown as LegendaryCommand)).stdout
    ).toBe('listed')
    expect((await b.stubs.run(versionCmd)).stdout).toContain(
      'legendary version'
    )

    a.stubs.reset()
    expect((await a.stubs.run(versionCmd)).stdout).toContain(
      'legendary version'
    )
  })
})

describe('deriveLegendaryPaths', () => {
  const roots = { appFolder: '/app/GameLib', toolsPath: '/app/GameLib/tools' }

  it('derives every location from the roots with today values', () => {
    const base = join('/app/GameLib', 'legendaryConfig', 'legendary')
    expect(deriveLegendaryPaths(roots)).toEqual({
      legendaryConfigPath: base,
      legendaryUserInfo: join(base, 'user.json'),
      legendaryInstalled: join(base, 'installed.json'),
      thirdPartyInstalled: join(base, 'third-party-installed.json'),
      legendaryMetadata: join(base, 'metadata'),
      epicRedistPath: join('/app/GameLib/tools', 'redist', 'legendary')
    })
  })

  it('is frozen', () => {
    expect(Object.isFrozen(deriveLegendaryPaths(roots))).toBe(true)
  })

  it('uses XDG_CONFIG_HOME/legendary under snap', () => {
    const prevSnap = process.env.SNAP
    const prevXdg = process.env.XDG_CONFIG_HOME
    process.env.SNAP = '/snap/gamelib/1'
    process.env.XDG_CONFIG_HOME = '/snap/xdg'
    try {
      jest.isolateModules(() => {
        /* eslint-disable @typescript-eslint/no-require-imports */
        const { deriveLegendaryPaths: snapDerive } =
          require('../constants') as typeof import('../constants')
        /* eslint-enable @typescript-eslint/no-require-imports */
        const derived = snapDerive(roots)
        expect(derived.legendaryConfigPath).toBe(join('/snap/xdg', 'legendary'))
        expect(derived.legendaryInstalled).toBe(
          join('/snap/xdg', 'legendary', 'installed.json')
        )
        expect(derived.epicRedistPath).toBe(
          join('/app/GameLib/tools', 'redist', 'legendary')
        )
      })
    } finally {
      if (prevSnap === undefined) delete process.env.SNAP
      else process.env.SNAP = prevSnap
      if (prevXdg === undefined) delete process.env.XDG_CONFIG_HOME
      else process.env.XDG_CONFIG_HOME = prevXdg
    }
  })
})
