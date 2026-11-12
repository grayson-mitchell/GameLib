import { installAsyncArgs } from 'common/types/ipc/install'
import {
  expectFixtureCoverage,
  runFixtureTable,
  type FixtureTable
} from 'backend/testUtils/ipcSchemaFixtures'

const gameInfo = {
  runner: 'steam',
  app_name: '220',
  art_cover: 'https://cdn.example/cover.jpg',
  art_square: 'https://cdn.example/square.jpg',
  install: {},
  is_installed: false,
  title: 'Half-Life 2',
  canRunOffline: true
}

const installedGameInfo = {
  ...gameInfo,
  is_installed: true,
  install: {
    platform: 'Windows',
    install_path: '/home/user/Games/hl2',
    executable: 'hl2.exe'
  }
}

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
      ['abc', 'gog', true, true]
    ],
    invalid: [
      ['220', 'steam', false],
      ['220', 'nope', false, false]
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
