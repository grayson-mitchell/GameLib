import { runnerMiscAsyncArgs } from 'common/types/ipc/runnerMisc'
import {
  engineAsyncArgs,
  engineFrontendMessagesArgs
} from 'common/types/ipc/engine'
import {
  expectFixtureCoverage,
  runFixtureTable,
  type FixtureTable
} from 'backend/testUtils/ipcSchemaFixtures'

const loc = { name: 'Saves', location: '/home/u/saves' }

const runnerMiscTable: FixtureTable<typeof runnerMiscAsyncArgs> = {
  callTool: {
    valid: [
      [{ tool: 'winecfg', appName: 'abc', runner: 'gog' }],
      [{ tool: 'runExe', exe: '/x/game.exe', appName: 'abc', runner: 'steam' }],
      [{ tool: 'runExe', exe: null, appName: 'abc', runner: 'nile' }]
    ],
    invalid: [
      [{ tool: 'rm', appName: 'abc', runner: 'gog' }],
      [{ tool: 'winecfg', appName: 'abc', runner: 'epic' }],
      [{ tool: 'winecfg', appName: '', runner: 'gog' }],
      [{ tool: 'runExe', exe: '/x\0.exe', appName: 'abc', runner: 'gog' }],
      [{ tool: 'winecfg', appName: 'abc', runner: 'gog', extra: 1 }]
    ]
  },
  getLegendaryVersion: { valid: [[]], invalid: [['x']] },
  getGogdlVersion: { valid: [[]], invalid: [['x']] },
  getCometVersion: { valid: [[]], invalid: [['x']] },
  getNileVersion: { valid: [[]], invalid: [['x']] },
  getAchievements: {
    valid: [
      ['abc', 'gog'],
      ['abc', 'gog', 'en-US'],
      ['abc', 'gog', null]
    ],
    invalid: [['abc'], ['', 'gog'], ['abc', 'epic'], ['abc', 'gog', 5]]
  },
  getGOGLinuxInstallersLangs: {
    valid: [['abc']],
    invalid: [[''], [], [1]]
  },
  egsSync: { valid: [['/home/u/prefix'], ['']], invalid: [[1], [], ['a\0b']] },
  syncGOGSaves: {
    valid: [
      [[loc], 'abc', '--skip-upload'],
      [[], 'abc', '']
    ],
    invalid: [
      [[{ name: 'x' }], 'abc', ''],
      [[loc], '', ''],
      [[loc], 'abc'],
      ['nope', 'abc', '']
    ]
  },
  syncSaves: {
    valid: [
      [
        {
          arg: '--skip-upload',
          path: '/s',
          appName: 'abc',
          runner: 'legendary'
        }
      ],
      [{ path: '/s', appName: 'abc', runner: 'gog' }],
      [{ arg: undefined, path: '/s', appName: 'abc', runner: 'gog' }]
    ],
    invalid: [
      [{ path: '/s', appName: 'abc', runner: 'epic' }],
      [{ appName: 'abc', runner: 'gog' }],
      [{ path: '/s', appName: 'abc', runner: 'gog', extra: 1 }],
      [{ path: '/s\0', appName: 'abc', runner: 'gog' }]
    ]
  },
  downloadRuntime: {
    valid: [['eac_runtime'], ['battleye_runtime'], ['umu']],
    invalid: [['curl'], [''], [], [1]]
  },
  isRuntimeInstalled: {
    valid: [['eac_runtime'], ['umu']],
    invalid: [['../x'], []]
  },
  getDefaultSavePath: {
    valid: [
      ['abc', 'gog', [loc]],
      ['abc', 'legendary', []]
    ],
    invalid: [
      ['abc', 'legendary'],
      ['abc', 'epic', []],
      ['', 'gog', []]
    ]
  },
  getPlaytimeFromRunner: {
    valid: [['gog', 'abc']],
    invalid: [['abc', 'gog'], ['gog'], ['gog', '']]
  }
}

const engineTable: FixtureTable<typeof engineAsyncArgs> = {
  getEngineState: {
    valid: [[{ runner: 'steam', appName: '1234' }]],
    invalid: [
      [{ runner: 'steam' }],
      [{ runner: '', appName: '1' }],
      [{ runner: 'steam', appName: '1', x: 1 }],
      []
    ]
  },
  listEngineOptions: {
    valid: [[{ runner: 'steam', appName: '1234' }], [{ appName: 'default' }]],
    invalid: [[{ appName: 'other' }], [{ appName: 'default', extra: 1 }], [{}]]
  },
  getDefaultEngine: { valid: [[]], invalid: [['x']] },
  getPerGameBottleName: {
    valid: [[{ runner: 'gog', appName: 'abc' }]],
    invalid: [['abc'], [{ appName: 'abc' }]]
  },
  dismissEngineNotice: {
    valid: [
      [{ kind: 'no-crossover' }],
      [{ kind: 'untested-crossover', build: '25.0.1' }]
    ],
    invalid: [
      [{ kind: 'untested-crossover' }],
      [{ kind: 'other' }],
      [{ kind: 'no-crossover', build: 'x' }]
    ]
  }
}

// D-12: push schemas are typing only, never parsed at runtime; the fixture pins the shape the
// backend sender passes (an EngineState carrying runner + appName).
const enginePushTable: FixtureTable<typeof engineFrontendMessagesArgs> = {
  engineStateChanged: {
    valid: [
      [
        {
          runner: 'steam',
          appName: '1234',
          engine: 'crossover',
          reason: 'cx-healthy',
          engineLabel: 'CrossOver',
          trialDaysRemaining: null,
          showTrialNotice: false,
          crossoverInstalled: true,
          showNoCrossoverNote: false,
          untestedCrossoverBuild: null
        }
      ]
    ],
    invalid: [[null], [{ appName: '1' }], []]
  }
}

describe('runnerMisc and engine IPC schemas', () => {
  it('has a fixture for every channel', () => {
    expectFixtureCoverage(runnerMiscAsyncArgs, runnerMiscTable)
    expectFixtureCoverage(engineAsyncArgs, engineTable)
    expectFixtureCoverage(engineFrontendMessagesArgs, enginePushTable)
  })
  runFixtureTable(runnerMiscAsyncArgs, runnerMiscTable)
  runFixtureTable(engineAsyncArgs, engineTable)
  runFixtureTable(engineFrontendMessagesArgs, enginePushTable)
})
