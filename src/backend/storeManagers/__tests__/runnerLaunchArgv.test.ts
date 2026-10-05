/**
 * Passthrough game args must never be parsed as runner options (todo
 * `2026-10-05-gamelib-deep-link-launch-args-reach-runner-cli-options.md`).
 *
 * A `gamelib://launch?arg=--wrapper%20calc` deep link's args reach the legendary/nile
 * `launch` argv. Both runners are argparse CLIs that call `parse_known_args()`, so an
 * unseparated `--wrapper calc` is accepted as THEIR option, not handed to the game. The fix
 * puts the passthrough args after a `--` end-of-options marker. Measured against the
 * runners' own parsers (legendary 0.21.0 `cli.py`, nile v1.2.0 `arguments.py`) under
 * Python 3.10-3.13: both drop the `--` and hand everything after it to the game unparsed.
 *
 * gogdl is deliberately NOT covered here: measured the same way (heroic-gogdl v1.3.0
 * `args.py`), gogdl forwards the literal `--` to the game's argv, so its builder is unchanged
 * and the deep-link handler strips `-`-prefixed URL args for it instead (protocol.test.ts).
 *
 * Only `library.ts`'s module graph is mocked (it is imported for `commandToArgsArray`, which
 * touches no filesystem or network).
 */

jest.mock('../legendary/constants', () => ({
  legendaryConfigPath: '/nonexistent/legendary',
  legendaryUserInfo: '/nonexistent/legendary/user.json',
  legendaryInstalled: '/nonexistent/legendary/installed.json',
  thirdPartyInstalled: '/nonexistent/legendary/third-party-installed.json',
  legendaryMetadata: '/nonexistent/legendary/metadata',
  epicRedistPath: '/nonexistent/legendary/epicRedist'
}))
jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn(),
  logDebug: jest.fn(),
  LogPrefix: { Legendary: 'Legendary', Backend: 'Backend' }
}))
jest.mock('../../utils', () => ({
  formatEpicStoreUrl: jest.fn(),
  getLegendaryBin: jest.fn(() => ({ dir: '/fake', bin: 'legendary' })),
  isEpicServiceOffline: jest.fn(),
  getFileSize: jest.fn(),
  axiosClient: { get: jest.fn() }
}))
jest.mock('../../launcher', () => ({ callRunner: jest.fn() }))
jest.mock('backend/online_monitor', () => ({
  isOnline: jest.fn(() => true),
  runOnceWhenOnline: jest.fn()
}))
jest.mock('../legendary/electronStores', () => ({
  libraryStore: { get: jest.fn(() => []), set: jest.fn() },
  installStore: {
    get: jest.fn(),
    set: jest.fn(),
    has: jest.fn(),
    delete: jest.fn()
  },
  gamesOverrideStore: {
    get: jest.fn(),
    set: jest.fn(),
    has: jest.fn(),
    delete: jest.fn()
  },
  gameInfoStore: { get: jest.fn(), set: jest.fn() }
}))
jest.mock('../legendary/user', () => ({
  LegendaryUser: { isLoggedIn: jest.fn(() => true) }
}))
jest.mock('../legendary/games', () => ({
  __esModule: true,
  default: class LegendaryGame {}
}))

import LegendaryLibraryManager from '../legendary/library'
import { LegendaryAppName } from '../legendary/commands/base'
import { Path } from 'backend/schemas'
import {
  legendaryLaunchArgumentFields,
  nileLaunchCommandParts
} from '../runnerLaunchArgv'

const URL_ARGS = ['--wrapper "cmd /c calc"', '--override-exe', '/evil.exe']

function legendaryArgv(args: string[], launcherArgs?: string): string[] {
  const manager = new LegendaryLibraryManager()
  return manager.commandToArgsArray({
    subcommand: 'launch',
    appName: LegendaryAppName.parse('Fortnite'),
    ...legendaryLaunchArgumentFields({
      args,
      launchArgumentArgs: undefined,
      launcherArgs
    }),
    '--skip-version-check': true,
    '--override-exe': Path.parse('/games/Fortnite/real.exe')
  })
}

describe('legendary launch argv: passthrough args sit after `--`', () => {
  test('a URL-supplied `--wrapper`/`--override-exe` lands after the end-of-options marker', () => {
    const argv = legendaryArgv(URL_ARGS)
    const separator = argv.indexOf('--')

    expect(separator).toBeGreaterThan(-1)
    // Every legendary option the app itself set precedes the separator...
    expect(argv.indexOf('--skip-version-check')).toBeLessThan(separator)
    expect(argv.indexOf('--override-exe')).toBeLessThan(separator)
    // ...and every URL-supplied argument follows it unchanged, one argv entry each, as the
    // game's own args -- the same shape nile passes them in.
    expect(argv.slice(separator + 1)).toEqual(URL_ARGS)
    expect(argv.slice(0, separator)).not.toContain('--wrapper')
  })

  test('an argument containing a space reaches the game as ONE argument, as the confirm showed it', () => {
    const argv = legendaryArgv(['foo bar'])
    expect(argv.slice(argv.indexOf('--'))).toEqual(['--', 'foo bar'])
  })

  test('an argument with an unmatched quote does not throw after the user confirmed', () => {
    expect(() => legendaryArgv(['say "hi'])).not.toThrow()
    const argv = legendaryArgv(['say "hi'])
    expect(argv.slice(argv.indexOf('--'))).toEqual(['--', 'say "hi'])
  })

  test('no passthrough args: argv is unchanged, no `--` is added', () => {
    expect(legendaryArgv([], '-dx11 -windowed')).toEqual([
      'launch',
      'Fortnite',
      '-dx11',
      '-windowed',
      '--skip-version-check',
      '--override-exe',
      '/games/Fortnite/real.exe'
    ])
  })

  test("the user's game-settings launcher args keep their position before the options", () => {
    const argv = legendaryArgv(['-foo'], '-dx11')
    expect(argv.slice(0, 3)).toEqual(['launch', 'Fortnite', '-dx11'])
    expect(argv.slice(argv.indexOf('--'))).toEqual(['--', '-foo'])
  })
})

describe('nile launch argv: passthrough args sit after `--`', () => {
  const base = {
    exeOverrideFlag: [],
    wineFlag: ['--wrapper', 'gamemoderun'],
    launchArgumentArgs: '',
    launcherArgs: '-userarg',
    id: 'amzn1.game'
  }

  test('a URL-supplied `--wrapper` lands after the end-of-options marker', () => {
    const argv = nileLaunchCommandParts({
      ...base,
      args: ['--wrapper', 'calc']
    })
    expect(argv).toEqual([
      'launch',
      '--wrapper',
      'gamemoderun',
      '-userarg',
      'amzn1.game',
      '--',
      '--wrapper',
      'calc'
    ])
  })

  test('no passthrough args: argv is unchanged, no `--` is added', () => {
    expect(nileLaunchCommandParts({ ...base, args: [] })).toEqual([
      'launch',
      '--wrapper',
      'gamemoderun',
      '-userarg',
      'amzn1.game'
    ])
  })
})
