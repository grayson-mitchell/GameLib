import {
  wineToolsAsyncArgs,
  wineToolsFrontendMessagesArgs
} from 'common/types/ipc/wineTools'
import {
  expectFixtureCoverage,
  runFixtureTable,
  type FixtureTable
} from 'backend/testUtils/ipcSchemaFixtures'

const wineInstallation = {
  bin: '/usr/bin/wine',
  name: 'Wine - System',
  type: 'wine'
}

const toolArgs = { appName: 'abc', action: 'backup' }

const asyncTable: FixtureTable<typeof wineToolsAsyncArgs> = {
  runWineCommand: {
    valid: [
      [
        {
          commandParts: ['/home/user/Games/setup.exe'],
          wait: true,
          protonVerb: 'runinprefix',
          gameSettings: { winePrefix: '/p', wineVersion: wineInstallation }
        }
      ],
      [{ commandParts: ['winecfg'] }],
      // Partial: a game-less caller may omit wineVersion/winePrefix (the handler fills them).
      [{ commandParts: ['winecfg'], gameSettings: { enableEsync: true } }]
    ],
    invalid: [
      [{ commandParts: ['x'], gameSettings: { undeclaredKey: 1 } }],
      [{ commandParts: ['x'], gameSettings: { enableEsync: 'yes' } }],
      [{ commandParts: [] }],
      [{ commandParts: ['x', 7] }],
      [{ commandParts: ['x'], onSpawn: 'fn' }],
      [{ commandParts: ['x'.repeat(4097)] }]
    ]
  },
  winetricksInstalled: {
    valid: [['legendary', 'abc']],
    invalid: [['epic', 'abc'], ['legendary']]
  },
  winetricksAvailable: {
    valid: [['gog', '1441974651']],
    invalid: [['gog', ''], []]
  },
  winetricksApply: {
    valid: [['sideload', 'abc', ['vcrun2019', 'corefonts']]],
    invalid: [
      ['sideload', 'abc', []],
      ['sideload', 'abc', ['']],
      ['sideload', 'abc', 'vcrun2019']
    ]
  },
  winetricksQueueState: {
    valid: [['legendary', 'abc']],
    invalid: [['legendary', 5]]
  },
  winetricksCancelRemaining: {
    valid: [['legendary', 'abc']],
    invalid: [['nope', 'abc']]
  },
  runWineCommandForGame: {
    valid: [
      [
        {
          appName: 'abc',
          runner: 'sideload',
          commandParts: ['/home/user/setup.exe'],
          wait: true,
          pendingInstall: true
        }
      ],
      [{ appName: 'abc', runner: 'legendary', commandParts: ['winecfg'] }]
    ],
    invalid: [
      [{ appName: 'abc', runner: 'legendary', commandParts: [] }],
      [
        {
          appName: 'abc',
          runner: 'legendary',
          commandParts: ['x'],
          protonVerb: 'run'
        }
      ],
      [{ appName: 'abc', runner: 'legendary', commandParts: 'winecfg' }]
    ]
  },
  // Phase 87 (87-20, D-14): `installWineVersion`, `refreshWineVersionInfo` and `removeWineVersion` are
  // native `wine` channels; their vectors are in `nativeChannels.json`.
  // Phase 87 (87-24, D-14): `wine.isValidVersion` is a native `wine` channel; its vectors are in
  // `nativeChannels.json`.
  toggleDXVK: {
    valid: [[toolArgs], [{ ...toolArgs, action: 'restore' }]],
    invalid: [[{ ...toolArgs, action: 'delete' }], [{ ...toolArgs, x: 1 }]]
  },
  toggleVKD3D: { valid: [[toolArgs]], invalid: [[{ appName: 'abc' }]] },
  toggleDXVKNVAPI: { valid: [[toolArgs]], invalid: [[]] }
}

// D-12: push schemas are typing only, never parsed at runtime; these fixtures just pin the
// declared shapes against the backend senders' real arguments.
const pushTable: FixtureTable<typeof wineToolsFrontendMessagesArgs> = {
  wineVersionsUpdated: { valid: [[]], invalid: [['x']] },
  progressOfWinetricks: {
    valid: [
      [
        {
          messages: ['Executing w_do_call'],
          installingComponent: 'vcrun2019',
          lines: [{ kind: 'info', text: 'x' }],
          percent: 40
        }
      ],
      [{ messages: ['Done'], installingComponent: 'vcrun2019', failed: false }]
    ],
    invalid: [[{ messages: 'Done', installingComponent: 'x' }]]
  },
  'installing-winetricks-component': {
    valid: [['vcrun2019'], ['']],
    invalid: [[7]]
  },
  winetricksQueueChanged: { valid: [[{ runner: 'legendary' }]], invalid: [[]] }
}

describe('wineTools IPC schemas', () => {
  it('has a fixture for every channel', () => {
    expectFixtureCoverage(wineToolsAsyncArgs, asyncTable)
    expectFixtureCoverage(wineToolsFrontendMessagesArgs, pushTable)
  })
  runFixtureTable(wineToolsAsyncArgs, asyncTable)
  runFixtureTable(wineToolsFrontendMessagesArgs, pushTable)
})
