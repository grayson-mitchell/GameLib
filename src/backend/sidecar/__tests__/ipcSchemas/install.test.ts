import { installAsyncArgs } from 'common/types/ipc/install'
import {
  expectFixtureCoverage,
  runFixtureTable,
  type FixtureTable
} from 'backend/testUtils/ipcSchemaFixtures'
import {
  gogGameInfoFixture,
  legendaryGameInfoFixture,
  nileGameInfoFixture,
  sideloadGameInfoFixture,
  steamGameInfoFixture
} from 'backend/testUtils/gameInfoFixtures'

const gameInfo = steamGameInfoFixture()

const installedGameInfo = steamGameInfoFixture({
  is_installed: true,
  install: {
    platform: 'Windows',
    install_path: '/home/user/Games/hl2',
    executable: 'hl2.exe'
  }
})

const perRunner = [
  steamGameInfoFixture(),
  gogGameInfoFixture(),
  legendaryGameInfoFixture(),
  nileGameInfoFixture(),
  sideloadGameInfoFixture()
]

// An undeclared key at the top, inside `install`, and inside `extra`: each must be rejected.
function strictRejects(info: (typeof perRunner)[number]) {
  return [
    { ...info, smuggled: 1 },
    { ...info, install: { ...info.install, smuggled: 1 } },
    { ...info, extra: { reqs: [], smuggled: 1 } }
  ]
}

const installArg = (gameInfo: unknown) => ({
  appName: 'x',
  runner: 'steam',
  gameInfo,
  path: '/p',
  platformToInstall: 'Windows'
})
const updateArg = (gameInfo: unknown) => ({
  appName: 'x',
  runner: 'steam',
  gameInfo
})

// Real persisted legendary entries carry undeclared keys inside dlcList elements.
const legendaryWithDlc = legendaryGameInfoFixture({
  dlcList: [
    { id: 'd', mainGameItemList: [], esrbGameRatingValue: 'x' }
  ] as never
})

const table: FixtureTable<typeof installAsyncArgs> = {
  checkGameUpdates: { valid: [[]], invalid: [['extra']] },
  listSteamLibraryTargets: {
    valid: [['220'], [undefined], []],
    invalid: [[42], ['220', 'extra']]
  },
  getSteamDeleteRoute: {
    valid: [['220'], [undefined]],
    invalid: [[{}], ['220', 'extra']]
  },
  getSteamInstallAppTargets: {
    valid: [['220'], [undefined]],
    invalid: [[true], ['220', 'extra']]
  },
  getSteamUpdateInfo: {
    valid: [['1603180'], ['1603180', { computeSize: true }]],
    invalid: [[''], ['1', { computeSize: 'yes' }], ['1', { extra: 1 }]]
  },
  install: {
    valid: [
      ...perRunner.map((g) => [installArg(g)]),
      [installArg(legendaryWithDlc)],
      [
        {
          appName: '220',
          gameInfo,
          installDlcs: [],
          installLanguage: 'en-US',
          path: '/home/user/Games',
          platformToInstall: 'Windows',
          runner: 'steam',
          steamForceWindowsViaBottle: true
        }
      ],
      [
        {
          appName: 'abc',
          runner: 'legendary',
          gameInfo,
          path: 'C:\\Games',
          platformToInstall: 'Win32',
          sdlList: ['x'],
          branch: 'live',
          build: '1',
          size: '1 GB'
        }
      ]
    ],
    invalid: [
      ...perRunner.flatMap((g) =>
        strictRejects(g).map((bad) => [installArg(bad)])
      ),
      [
        {
          appName: '220',
          gameInfo,
          path: '/p',
          platformToInstall: 'Windows',
          runner: 'steam',
          smuggled: true
        }
      ],
      [{ appName: '220', runner: 'steam', gameInfo, path: '/p' }],
      [
        {
          appName: '220',
          runner: 'epic',
          gameInfo,
          path: '/p',
          platformToInstall: 'Windows'
        }
      ]
    ]
  },
  uninstall: {
    valid: [
      ['220', 'steam', false, false],
      ['abc', 'gog', true, true],
      ['1207658930', 'gog', true, true],
      ['Fortnite', 'legendary', true, true],
      ['9d2d0eb64d5c44529cece33fe2a46482', 'legendary', false, true],
      [
        'amzn1.adg.product.5ab3f3b2-1b2c-4d3e-8f90-123456789abc',
        'nile',
        false,
        false
      ],
      ['mJ5bK8qZr2Xn4Wd7Tf9Ys', 'sideload', true, false],
      ['__gamelib_steam_bottle__', 'steam', false, false]
    ],
    invalid: [
      ['220', 'steam', false],
      ['220', 'nope', false, false],
      // quick 261120-ux8: an appName is joined into delete paths, so it must name one entry
      ['../../x', 'gog', true, true],
      ['../config', 'legendary', false, true],
      ['a/b', 'steam', false, false],
      ['a\\b', 'steam', false, false],
      ['..', 'gog', false, false],
      ['.', 'gog', false, false],
      [`a${String.fromCharCode(0)}b`, 'steam', false, false]
    ]
  },
  moveInstall: {
    valid: [
      [{ appName: '220', path: '/Volumes/Games', runner: 'steam' }],
      // Relative paths reach the handler on purpose: assertPlausibleAbsolutePath owns that
      // rejection (dialog + terminal 'done').
      [{ appName: '220', path: 'relative/dir', runner: 'steam' }]
    ],
    invalid: [
      [{ appName: '220', path: 42, runner: 'steam' }],
      [{ appName: '220', path: '/x', runner: 'steam', extra: 1 }]
    ]
  },
  importGame: {
    valid: [
      [
        {
          appName: 'abc',
          path: '/home/user/Games/abc',
          runner: 'legendary',
          platform: 'Windows',
          winePrefix: '/home/user/prefix',
          wineVersion: {
            bin: '/usr/bin/wine',
            name: 'Wine - System',
            type: 'wine'
          },
          wineCrossoverBottle: 'Default'
        }
      ],
      [
        {
          appName: 'abc',
          path: '/g',
          runner: 'sideload',
          platform: 'Windows',
          engineOverride: 'crossover'
        }
      ]
    ],
    invalid: [
      [
        {
          appName: 'abc',
          path: '/g',
          runner: 'sideload',
          platform: 'Windows',
          extra: 1
        }
      ],
      [{ appName: 'abc', path: '/g', runner: 'sideload', platform: 'Dos' }]
    ]
  },
  updateGame: {
    valid: [
      ...perRunner.map((g) => [updateArg(g)]),
      [updateArg(legendaryWithDlc)],
      [
        {
          gameInfo: installedGameInfo,
          appName: '1441974651',
          runner: 'gog',
          installDlcs: ['dlc1'],
          installLanguage: 'en-US',
          branch: 'beta',
          build: '55'
        }
      ],
      [
        {
          gameInfo: installedGameInfo,
          appName: '1441974651',
          runner: 'gog',
          path: '/home/user/Games/hl2',
          platformToInstall: 'Windows'
        }
      ]
    ],
    invalid: [
      ...perRunner.flatMap((g) =>
        strictRejects(g).map((bad) => [updateArg(bad)])
      ),
      [
        {
          gameInfo: installedGameInfo,
          appName: '1',
          runner: 'gog',
          smuggled: 1
        }
      ],
      [{ appName: '1', runner: 'gog' }]
    ]
  }
}

describe('install IPC schemas', () => {
  it('has a fixture for every channel', () => {
    expectFixtureCoverage(installAsyncArgs, table)
  })
  runFixtureTable(installAsyncArgs, table)
})
