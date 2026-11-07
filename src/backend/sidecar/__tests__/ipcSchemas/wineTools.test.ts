import {
  wineToolsAsyncArgs,
  wineToolsFrontendMessagesArgs
} from 'common/types/ipc/wineTools'
import {
  expectFixtureCoverage,
  runFixtureTable,
  type FixtureTable
} from 'backend/testUtils/ipcSchemaFixtures'

const wineVersionInfo = {
  version: 'GE-Proton9-1',
  date: '2024-03-01',
  downsize: 400000000,
  disksize: 1200000000,
  download: 'https://example.com/GE-Proton9-1.tar.gz',
  checksum: 'abc123',
  isInstalled: false,
  hasUpdate: false,
  installDir: '/home/user/.config/heroic/tools/proton',
  type: 'GE-Proton',
  release_notes_link: 'https://example.com/notes'
}

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
      [{ commandParts: ['winecfg'] }]
    ],
    invalid: [
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
  getAlternativeWine: { valid: [[]], invalid: [['extra']] },
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
  installWineVersion: {
    valid: [
      [wineVersionInfo],
      // 67 review CR-01: fetchReleases never sets checksum for Wine-Staging-macOS, and sets
      // download/downsize only when a matching asset exists; JSON drops the undefined keys.
      [
        {
          ...wineVersionInfo,
          type: 'Wine-Staging-macOS',
          checksum: undefined,
          download: undefined,
          downsize: undefined
        }
      ],
      // The release cache is persisted on disk; older entries may carry extra keys.
      [{ ...wineVersionInfo, extra: 1 }]
    ],
    invalid: [[{ ...wineVersionInfo, type: 'Wine-Mystery' }]]
  },
  refreshWineVersionInfo: {
    valid: [[true], [false], [], [undefined]],
    invalid: [['yes'], [true, true]]
  },
  removeWineVersion: {
    valid: [
      [{ ...wineVersionInfo, isInstalled: true }],
      [{ ...wineVersionInfo, isInstalled: true, checksum: undefined }]
    ],
    invalid: [[{ version: 'x' }]]
  },
  'wine.isValidVersion': {
    valid: [
      [wineInstallation],
      [{ ...wineInstallation, lib: '/l', lib32: '/l32', wineserver: '/ws' }]
    ],
    invalid: [[{ ...wineInstallation, type: 'dosbox' }], [{ bin: '/x' }]]
  },
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
