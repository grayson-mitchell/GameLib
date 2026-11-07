import {
  gameDetailsAsyncArgs,
  gameDetailsSyncArgs
} from 'common/types/ipc/gameDetails'
import {
  expectFixtureCoverage,
  runFixtureTable,
  type FixtureTable
} from 'backend/testUtils/ipcSchemaFixtures'

const pair = ['Fortnite', 'legendary']

const syncTable: FixtureTable<typeof gameDetailsSyncArgs> = {
  addNewApp: {
    valid: [
      [{ app_name: 'sideapp', runner: 'sideload', title: 'X', extra: [1] }],
      [{ app_name: 'sideapp', runner: 'sideload', install: { a: 1 } }]
    ],
    invalid: [
      [{ runner: 'sideload' }],
      [{ app_name: '', runner: 'sideload' }],
      [{ app_name: 'x', runner: 'epic' }],
      ['sideapp'],
      []
    ]
  },
  changeGameVersionPinnedStatus: {
    valid: [['Fortnite', 'legendary', true]],
    invalid: [
      ['Fortnite', 'legendary'],
      ['', 'legendary', true],
      ['Fortnite', 'epic', true],
      ['Fortnite', 'legendary', 'yes']
    ]
  },
  setGameMetadataOverride: {
    valid: [
      [{ appName: 'a' }],
      [{ appName: 'a', title: '', art_cover: '', art_square: '' }],
      [{ appName: 'a', title: 'T', art_cover: 'https://x/y.png' }]
    ],
    invalid: [
      [{ title: 'T' }],
      [{ appName: '', title: 'T' }],
      [{ appName: 'a', title: 5 }],
      [{ appName: 'a', extra: 1 }]
    ]
  }
}

const asyncTable: FixtureTable<typeof gameDetailsAsyncArgs> = {
  kill: { valid: [pair], invalid: [['', 'gog'], ['x'], ['x', 'epic'], []] },
  getGameInfo: { valid: [pair], invalid: [['', 'gog'], ['x'], [5, 'gog']] },
  getExtraInfo: { valid: [pair], invalid: [['x', 'nope'], ['x']] },
  getGameSettings: { valid: [pair], invalid: [['x', 'nope'], []] },
  getInstallInfo: {
    valid: [
      ['Fortnite', 'legendary', 'Windows'],
      ['Fortnite', 'legendary', 'Windows', 'build1', 'branch1'],
      ['1207', 'gog', 'linux', null, null]
    ],
    invalid: [
      ['Fortnite', 'legendary'],
      ['Fortnite', 'legendary', 'Plan9'],
      ['Fortnite', 'legendary', 'Windows', 5],
      ['', 'gog', 'linux']
    ]
  },
  readConfig: {
    valid: [['library'], ['user']],
    invalid: [['other'], [], [5]]
  },
  repair: { valid: [pair], invalid: [['x'], ['', 'gog']] },
  changeInstallPath: {
    valid: [
      [{ appName: 'a', path: '/Games/a', runner: 'gog' }],
      [{ appName: 'a', path: 'C:\\Games\\a', runner: 'gog' }]
    ],
    invalid: [
      [{ appName: 'a', path: 'relative/p', runner: 'gog' }],
      [{ appName: 'a', path: '', runner: 'gog' }],
      [{ appName: 'a', path: '/p', runner: 'epic' }],
      [{ appName: 'a', path: '/p', runner: 'gog', extra: 1 }]
    ]
  },
  getGameMetadataOverride: {
    valid: [['a']],
    invalid: [[''], [], [5]]
  },
  getAllGameOverrides: { valid: [[]], invalid: [['x']] },
  isGameAvailable: {
    valid: [[{ appName: 'a', runner: 'steam' }]],
    invalid: [
      [{ appName: 'a' }],
      [{ appName: 'a', runner: 'steam', extra: 1 }],
      ['a', 'steam']
    ]
  },
  getLaunchOptions: { valid: [pair], invalid: [['x'], ['x', 'nope']] },
  getGameOverride: { valid: [[]], invalid: [['x']] },
  getGameSdl: { valid: [['Fortnite']], invalid: [[''], [], [5]] },
  getAvailableCyberpunkMods: { valid: [[]], invalid: [['x']] },
  setCyberpunkModConfig: {
    valid: [
      [{ enabled: true, modsToLoad: ['a', 'b'] }],
      [{ enabled: false, modsToLoad: [] }]
    ],
    invalid: [
      [{ enabled: true }],
      [{ enabled: 'yes', modsToLoad: [] }],
      [{ enabled: true, modsToLoad: [1] }],
      [{ enabled: true, modsToLoad: [], extra: 1 }]
    ]
  }
}

describe('gameDetails IPC schemas', () => {
  it('has a fixture for every channel', () => {
    expectFixtureCoverage(gameDetailsSyncArgs, syncTable)
    expectFixtureCoverage(gameDetailsAsyncArgs, asyncTable)
  })
  runFixtureTable(gameDetailsSyncArgs, syncTable)
  runFixtureTable(gameDetailsAsyncArgs, asyncTable)
})
