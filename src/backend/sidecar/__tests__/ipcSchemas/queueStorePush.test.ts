import {
  downloadQueueAsyncArgs,
  downloadQueueFrontendMessagesArgs,
  downloadQueueSyncArgs
} from 'common/types/ipc/downloadQueue'
import {
  steamAsyncArgs,
  steamFrontendMessagesArgs
} from 'common/types/ipc/steam'
import { legendaryFrontendMessagesArgs } from 'common/types/ipc/legendary'
import { gogFrontendMessagesArgs } from 'common/types/ipc/gog'
import { channelSchemas } from 'common/types/ipc/channelSchemas'
import {
  expectFixtureCoverage,
  runFixtureTable,
  type FixtureTable
} from 'backend/testUtils/ipcSchemaFixtures'

const noArgs = { valid: [[]], invalid: [['x']] }

const queueSync: FixtureTable<typeof downloadQueueSyncArgs> = {
  removeFromDMQueue: { valid: [['abc']], invalid: [[], [''], [1]] },
  resumeCurrentDownload: noArgs,
  pauseCurrentDownload: noArgs,
  cancelDownload: { valid: [[true], [false]], invalid: [[], ['yes'], [null]] }
}
const queueAsync: FixtureTable<typeof downloadQueueAsyncArgs> = {
  getDMQueueInformation: noArgs
}
const queuePush: FixtureTable<typeof downloadQueueFrontendMessagesArgs> = {
  changedDMQueueInformation: {
    valid: [[[], 'idle']],
    invalid: [[], [{}, 'idle'], [[], 1]]
  }
}

const steamAsync: FixtureTable<typeof steamAsyncArgs> = {
  refreshLibrary: {
    valid: [[], ['steam'], ['all', 'startup'], [null, null]],
    invalid: [['bogus'], ['all', 1], ['all', 'o'.repeat(300)]]
  },
  launch: {
    valid: [
      [{ appName: '440', runner: 'steam' }],
      [
        {
          appName: '440',
          runner: 'steam',
          skipVersionCheck: true,
          args: ['-windowed'],
          launchArguments: { type: 'basic', name: 'n', parameters: 'p' }
        }
      ]
    ],
    invalid: [
      [],
      [{ appName: '', runner: 'steam' }],
      [{ appName: '440', runner: 'epic' }],
      [{ appName: '440' }],
      [{ appName: '440', runner: 'steam', args: [1] }]
    ]
  }
}

const steamPush: FixtureTable<typeof steamFrontendMessagesArgs> = {
  steamBottleSetupRequired: {
    valid: [[{ appName: '1' }]],
    invalid: [[], [null]]
  },
  steamSetupDownloadProgress: {
    valid: [[{ kind: 'client', state: 'running', bytes: 1, percent: 2 }]],
    invalid: [[], ['x']]
  },
  steamBridgeSetupRequired: { valid: [[{ appName: '1' }]], invalid: [[], [1]] },
  steamGoOfflineRequired: {
    valid: [[{ action: 'refresh' }]],
    invalid: [[], [1]]
  },
  steamRequestNotice: {
    valid: [[{ appId: '1', title: 't', kind: 'install-not-started' }]],
    invalid: [[], [1]]
  },
  steamBridgeRouteNotice: {
    valid: [
      [
        {
          appName: '1',
          reason: 'seed',
          knownBadReason: null,
          missingSymbols: [],
          route: 'bridge',
          userRoute: null
        }
      ]
    ],
    invalid: [[], [null]]
  },
  steamBottleLaunchWaiting: {
    valid: [[{ appName: '1', detectedCause: null }]],
    invalid: [[], [1]]
  },
  steamClientSetupRequired: {
    valid: [[{ appName: '1', reason: 'install' }]],
    invalid: [[], [1]]
  },
  steamMetadataSyncing: {
    valid: [[{ syncing: true }]],
    invalid: [[], [{ syncing: 'y' }], [{ syncing: true, x: 1 }]]
  },
  steamSyncStatus: { valid: [[{ status: 'idle' }]], invalid: [[], [1]] },
  progressUpdate: {
    valid: [[{ appName: '1', status: 'done' }]],
    invalid: [[], [null]]
  }
}

const legendaryPush: FixtureTable<typeof legendaryFrontendMessagesArgs> = {
  refreshLibrary: { valid: [[], ['legendary']], invalid: [['bogus']] }
}
const gogPush: FixtureTable<typeof gogFrontendMessagesArgs> = {
  pushGameToLibrary: {
    valid: [[{ app_name: 'a', runner: 'gog' }]],
    invalid: [[], [null]]
  }
}

describe('queue, steam, legendary and gog channel schemas', () => {
  it('has a fixture for every key', () => {
    expectFixtureCoverage(downloadQueueSyncArgs, queueSync)
    expectFixtureCoverage(downloadQueueAsyncArgs, queueAsync)
    expectFixtureCoverage(downloadQueueFrontendMessagesArgs, queuePush)
    expectFixtureCoverage(steamAsyncArgs, steamAsync)
    expectFixtureCoverage(steamFrontendMessagesArgs, steamPush)
    expectFixtureCoverage(legendaryFrontendMessagesArgs, legendaryPush)
    expectFixtureCoverage(gogFrontendMessagesArgs, gogPush)
  })
  runFixtureTable(downloadQueueSyncArgs, queueSync)
  runFixtureTable(downloadQueueAsyncArgs, queueAsync)
  runFixtureTable(downloadQueueFrontendMessagesArgs, queuePush)
  runFixtureTable(steamAsyncArgs, steamAsync)
  runFixtureTable(steamFrontendMessagesArgs, steamPush)
  runFixtureTable(legendaryFrontendMessagesArgs, legendaryPush)
  runFixtureTable(gogFrontendMessagesArgs, gogPush)

  it('registers every channel in channelSchemas', () => {
    for (const k of [
      ...Object.keys(downloadQueueSyncArgs),
      ...Object.keys(downloadQueueAsyncArgs),
      ...Object.keys(downloadQueueFrontendMessagesArgs),
      ...Object.keys(steamAsyncArgs),
      ...Object.keys(steamFrontendMessagesArgs),
      ...Object.keys(legendaryFrontendMessagesArgs),
      ...Object.keys(gogFrontendMessagesArgs)
    ]) {
      expect(channelSchemas[k]).toBeDefined()
    }
  })
})
