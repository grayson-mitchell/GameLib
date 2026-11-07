import { appShellAsyncArgs, appShellSyncArgs } from 'common/types/ipc/appShell'
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

describe('appShell schemas', () => {
  expectFixtureCoverage(appShellSyncArgs, syncTable)
  expectFixtureCoverage(appShellAsyncArgs, asyncTable)
  runFixtureTable(appShellSyncArgs, syncTable)
  runFixtureTable(appShellAsyncArgs, asyncTable)

  it('registers every channel in channelSchemas', () => {
    for (const k of [
      ...Object.keys(appShellSyncArgs),
      ...Object.keys(appShellAsyncArgs)
    ]) {
      expect(channelSchemas[k]).toBeDefined()
    }
  })
})
