import { join } from 'path'
import type { GameInfo, Runner } from 'common/types'
import {
  collectKnownInstalls,
  knownInstallKey,
  titleForKnownKey
} from '../knownInstalls'

type Entry = Partial<GameInfo> & { app_name: string }
type DepsArg = Parameters<typeof collectKnownInstalls>[0]

const RUNNERS: Runner[] = ['legendary', 'gog', 'nile', 'sideload', 'steam']

/** One fake manager per runner; a `Throws` entry makes that manager's list unreadable. */
function managers(
  lists: Partial<Record<Runner, Entry[] | 'Throws'>>,
  titles: Record<string, string> = {}
): DepsArg {
  const library = Object.fromEntries(
    RUNNERS.map((runner) => {
      const list = lists[runner] ?? []
      return [
        runner,
        {
          getListOfGames: () => {
            if (list === 'Throws') throw new Error('store unreadable')
            return list
          },
          getGame: (appName: string) => ({
            getGameInfo: () => ({ title: titles[`${runner}:${appName}`] })
          })
        }
      ]
    })
  )
  return { libraryManagers: library } as unknown as DepsArg
}

const installed = (app_name: string, install_path: string): Entry => ({
  app_name,
  is_installed: true,
  install: { install_path }
})

describe('knownInstallKey', () => {
  it('is runner:appName', () => {
    expect(knownInstallKey('gog', '123')).toBe('gog:123')
  })
})

describe('collectKnownInstalls', () => {
  it('returns one entry per installed game across every store', () => {
    const exe = join('/sideload', 'Game', 'game.exe')
    const out = collectKnownInstalls(
      managers({
        legendary: [installed('epicA', '/g/epicA')],
        gog: [installed('gogA', '/g/gogA')],
        nile: [installed('nileA', '/g/nileA')],
        sideload: [
          {
            app_name: 'sideA',
            is_installed: true,
            install: { executable: exe }
          }
        ],
        steam: [installed('730', '/g/steam/730')]
      })
    )
    expect(out).toEqual([
      { key: 'legendary:epicA', path: '/g/epicA' },
      { key: 'gog:gogA', path: '/g/gogA' },
      { key: 'nile:nileA', path: '/g/nileA' },
      { key: 'sideload:sideA', path: join('/sideload', 'Game') },
      { key: 'steam:730', path: '/g/steam/730' }
    ])
  })

  it('skips entries that are not installed or carry no usable path', () => {
    const out = collectKnownInstalls(
      managers({
        legendary: [
          { app_name: 'owned', is_installed: false, install: {} },
          {
            app_name: 'stale',
            is_installed: false,
            install: { install_path: '/g/stale' }
          },
          {
            app_name: 'blank',
            is_installed: true,
            install: { install_path: '' }
          }
        ],
        gog: [installed('ok', '/g/ok')]
      })
    )
    expect(out).toEqual([{ key: 'gog:ok', path: '/g/ok' }])
  })

  it('a non-sideload entry with only an executable carries no path and is skipped', () => {
    const out = collectKnownInstalls(
      managers({
        steam: [
          {
            app_name: '1',
            is_installed: true,
            install: { executable: '/x/game.exe' }
          }
        ]
      })
    )
    expect(out).toEqual([])
  })

  it('excludes the caller own key and keeps the same appName under another runner', () => {
    const out = collectKnownInstalls(
      managers({
        gog: [installed('42', '/g/gog42')],
        steam: [installed('42', '/g/steam42')]
      }),
      { runner: 'gog', appName: '42' }
    )
    expect(out).toEqual([{ key: 'steam:42', path: '/g/steam42' }])
  })

  it('returns null when any manager getListOfGames throws', () => {
    expect(
      collectKnownInstalls(
        managers({ legendary: [installed('a', '/g/a')], nile: 'Throws' })
      )
    ).toBeNull()
  })

  it('returns an empty list, not null, when nothing is installed', () => {
    expect(collectKnownInstalls(managers({}))).toEqual([])
  })
})

describe('titleForKnownKey', () => {
  const deps = managers({}, { 'steam:730': 'Counter-Strike 2' })

  it('maps a key back to the title', () => {
    expect(titleForKnownKey(deps, 'steam:730')).toBe('Counter-Strike 2')
  })

  it('falls back to the app name when the title is missing', () => {
    expect(titleForKnownKey(deps, 'gog:555')).toBe('555')
  })

  it('keeps colons inside the app name', () => {
    expect(titleForKnownKey(deps, 'sideload:a:b')).toBe('a:b')
  })

  it.each(['', 'nocolon', ':x', 'steam:', 'epic:1', 'constructor:1'])(
    'returns undefined for the unparseable or unknown key %p',
    (key) => {
      expect(titleForKnownKey(deps, key)).toBeUndefined()
    }
  )
})
