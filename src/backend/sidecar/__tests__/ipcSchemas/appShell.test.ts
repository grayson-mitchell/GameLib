import {
  appShellAsyncArgs,
  appShellFrontendMessagesArgs,
  appShellSyncArgs
} from 'common/types/ipc/appShell'
import { channelSchemas } from 'common/types/ipc/channelSchemas'
import {
  expectFixtureCoverage,
  runFixtureTable,
  type FixtureTable
} from 'backend/testUtils/ipcSchemaFixtures'

const noArgs = { valid: [[]], invalid: [['x']] }

const syncTable: FixtureTable<typeof appShellSyncArgs> = {
  changeLanguage: {
    valid: [['en'], ['pt_BR']],
    invalid: [[], [''], [1], ['x'.repeat(36)]]
  },
  notify: {
    valid: [[{ title: 't', body: 'b' }], [{ title: '', body: '' }]],
    invalid: [
      [],
      ['x'],
      [{ title: 't' }],
      [{ title: 't', body: 'b', extra: 1 }],
      [{ title: 't', body: 'b'.repeat(9000) }]
    ]
  },
  dialogDisplayed: { valid: [['ack-1']], invalid: [[], [''], [1]] },
  frontendReady: noArgs,
  lock: { valid: [[true], [false]], invalid: [[], ['yes']] },
  unlock: noArgs,
  quit: noArgs,
  openReleases: noArgs,
  openWebviewPage: {
    valid: [['https://example.com/a'], ['file:///tmp/x']],
    invalid: [[], [''], ['not a url'], [1]]
  },
  openAppManagementSettings: noArgs,
  relaunchApp: noArgs,
  abort: { valid: [['game-1']], invalid: [[], [''], [1]] },
  changeTrayColor: noArgs,
  setTitleBarOverlay: {
    valid: [
      [{}],
      [{ color: '#fff', symbolColor: '#000', height: '32px' }],
      [{ height: 32 }]
    ],
    invalid: [[], [{ bogus: 1 }], [{ color: 1 }], ['x']]
  }
}

const asyncTable: FixtureTable<typeof appShellAsyncArgs> = {
  getHeroicVersion: noArgs,
  getAppManagementStatus: noArgs,
  getLatestReleases: noArgs,
  getCurrentChangelog: noArgs,
  getWebviewPreloadPath: noArgs,
  getLoginBackground: noArgs
}

// `message` is variadic and accepts any argument list, so it has no invalid fixture; it is
// covered by its own case below.
const { message: messageSchema, ...pushArgs } = appShellFrontendMessagesArgs
const pushTable: FixtureTable<typeof pushArgs> = {
  gameStatusUpdate: {
    valid: [[{ appName: 'a', status: 'done' }]],
    invalid: [[]]
  },
  showDialog: {
    valid: [
      ['t', 'm', 'ERROR'],
      ['t', 'm', 'MESSAGE', [{ text: 'ok' }], 'ack-1']
    ],
    invalid: [[], ['t']]
  },
  maximized: noArgs,
  unmaximized: noArgs,
  fullscreen: { valid: [[true]], invalid: [[], ['x']] },
  'connectivity-changed': {
    valid: [[{ status: 'online', retryIn: 0 }]],
    invalid: [[]]
  },
  launchGame: {
    valid: [['a', 'gog', ['-x']]],
    invalid: [[], ['a', 'epic', []]]
  },
  installGame: { valid: [['a', 'steam']], invalid: [[], ['a']] },
  recentGamesChanged: {
    valid: [[[{ appName: 'a', title: 't' }]]],
    invalid: [[]]
  },
  gameSettingWriteFailed: {
    valid: [[{ appName: 'a', key: 'k' }]],
    invalid: [[], [{ appName: 'a' }]]
  },
  progressOfWineManager: {
    valid: [['Wine-1', { state: 'downloading' }]],
    invalid: [[], ['v']]
  },
  metadataChanged: {
    valid: [[{ a: { title: 'T' } }]],
    invalid: [[]]
  },
  crossoverIndexChanged: { valid: [[{ a: 1, b: null }]], invalid: [[]] },
  runsForMeChanged: { valid: [[{ 'gog:a': { on: true } }]], invalid: [[]] },
  signInProbeOutcomes: {
    valid: [[{ outcomes: { gog: 'connected' } }]],
    invalid: [[], [{}]]
  }
}

describe('appShell schemas', () => {
  expectFixtureCoverage(appShellSyncArgs, syncTable)
  expectFixtureCoverage(appShellAsyncArgs, asyncTable)
  expectFixtureCoverage(pushArgs, pushTable)
  runFixtureTable(appShellSyncArgs, syncTable)
  runFixtureTable(appShellAsyncArgs, asyncTable)
  runFixtureTable(pushArgs, pushTable)

  it('message accepts any argument list', () => {
    expect(messageSchema.safeParse([]).success).toBe(true)
    expect(messageSchema.safeParse(['a', 1, null]).success).toBe(true)
  })

  it('registers every channel in channelSchemas', () => {
    for (const k of [
      ...Object.keys(appShellSyncArgs),
      ...Object.keys(appShellAsyncArgs),
      ...Object.keys(appShellFrontendMessagesArgs)
    ]) {
      expect(channelSchemas[k]).toBeDefined()
    }
  })
})
