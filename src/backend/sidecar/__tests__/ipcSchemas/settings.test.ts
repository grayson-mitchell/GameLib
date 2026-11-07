import { settingsAsyncArgs, settingsSyncArgs } from 'common/types/ipc/settings'
import {
  expectFixtureCoverage,
  roundTrip,
  runFixtureTable,
  type FixtureTable
} from 'backend/testUtils/ipcSchemaFixtures'
import { formatRejectionLog, validateInbound } from '../../ipcValidation'

const SENTINEL = 'SENTINEL-BRANCH-PASSWORD-91ac'

const syncTable: FixtureTable<typeof settingsSyncArgs> = {
  setSetting: {
    valid: [
      [{ appName: 'default', key: 'focusRow', value: null }],
      [{ appName: 'default', key: 'darkTrayIcon', value: true }],
      [
        {
          appName: '1234',
          key: 'wineVersion',
          value: { bin: '/w', name: 'W', type: 'wine', legacyExtra: 1 }
        }
      ]
    ],
    invalid: [
      [{ appName: '', key: 'focusRow', value: 1 }],
      [{ appName: 'default', key: '', value: 1 }],
      [{ appName: 'default', key: 'focusRow', value: 1, extra: 1 }],
      [{ key: 'focusRow', value: 1 }],
      ['default', 'focusRow', 1]
    ]
  }
}

const asyncTable: FixtureTable<typeof settingsAsyncArgs> = {
  getMaxCpus: { valid: [[]], invalid: [['x']] },
  showUpdateSetting: { valid: [[]], invalid: [[1]] },
  requestAppSettings: { valid: [[]], invalid: [['x']] },
  requestGameSettings: {
    valid: [['default'], ['Fortnite']],
    invalid: [[''], [5], []]
  },
  writeConfig: {
    valid: [
      [{ appName: 'default', config: {} }],
      [
        {
          appName: 'abc',
          config: {
            autoUpdateGames: true,
            wineVersion: { bin: '/w', name: 'W', type: 'wine', legacy: 'x' },
            unknownFutureKey: [1, 2]
          }
        }
      ]
    ],
    invalid: [
      [{ appName: 'abc', config: {}, extra: 1 }],
      [{ appName: '', config: {} }],
      [{ appName: 'abc' }],
      [{ appName: 'abc', config: 'nope' }],
      [{ appName: 'abc', config: null }]
    ]
  },
  isNative: {
    valid: [[{ appName: 'abc', runner: 'gog' }]],
    invalid: [
      [{ appName: 'abc', runner: 'epic' }],
      [{ appName: 'abc' }],
      [{ appName: 'abc', runner: 'gog', extra: 1 }]
    ]
  },
  getLogContent: {
    valid: [
      [{}],
      [{ runner: 'comet' }],
      [{ appName: 'abc', runner: 'legendary' }],
      [{ appName: 'abc', runner: 'legendary', type: 'install' }]
    ],
    invalid: [
      [{ runner: 'epic' }],
      [{ appName: 'abc', runner: 'gog', type: 'bogus' }],
      [{ appName: '' }],
      ['abc'],
      [{ extra: 1 }]
    ]
  },
  getSystemInfo: {
    valid: [[], [true], [false]],
    invalid: [['yes'], [true, true]]
  },
  hasExecutable: {
    valid: [['/usr/bin/wine'], ['wine']],
    invalid: [[''], [5], []]
  },
  setPrivateBranchPassword: {
    valid: [
      ['abc', 'hunter2'],
      ['abc', '']
    ],
    invalid: [['abc'], ['', 'pw'], ['abc', 5], ['abc', 'x'.repeat(2000)]]
  },
  getPrivateBranchPassword: {
    valid: [['abc']],
    invalid: [[''], [], [5]]
  }
}

describe('settings IPC schemas', () => {
  it('has a fixture for every channel', () => {
    expectFixtureCoverage(settingsSyncArgs, syncTable)
    expectFixtureCoverage(settingsAsyncArgs, asyncTable)
  })
  runFixtureTable(settingsSyncArgs, syncTable)
  runFixtureTable(settingsAsyncArgs, asyncTable)

  // D-10 / T-67-42: a rejection never carries the private-branch password.
  describe.each([
    ['setPrivateBranchPassword', ['abc', SENTINEL.repeat(40)]],
    ['setPrivateBranchPassword', ['', SENTINEL]],
    ['setPrivateBranchPassword', [5, SENTINEL]],
    ['setPrivateBranchPassword', [{ password: SENTINEL }]]
  ])('%s rejection', (channel, badArgs) => {
    it('is value-free', () => {
      const verdict = validateInbound(
        channel,
        'invoke',
        roundTrip(badArgs) as unknown[]
      )
      expect(verdict.ok).toBe(false)
      if (verdict.ok) return
      expect(JSON.stringify(verdict)).not.toContain(SENTINEL)
      expect(formatRejectionLog('invoke', verdict)).not.toContain(SENTINEL)
    })
  })
})
