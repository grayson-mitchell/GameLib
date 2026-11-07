import {
  steamAuthAsyncArgs,
  steamAuthSyncArgs
} from 'common/types/ipc/steamAuth'
import {
  expectFixtureCoverage,
  roundTrip,
  runFixtureTable,
  type FixtureTable
} from 'backend/testUtils/ipcSchemaFixtures'
import { formatRejectionLog, validateInbound } from '../../ipcValidation'

const SENTINEL = 'SENTINEL-CREDENTIAL-7f3a'

const engine = {
  bin: '/opt/crossover/bin/wine',
  name: 'CrossOver 24',
  type: 'crossover'
}

const syncTable: FixtureTable<typeof steamAuthSyncArgs> = {
  logoutSteam: { valid: [[]], invalid: [['extra']] }
}

const asyncTable: FixtureTable<typeof steamAuthAsyncArgs> = {
  steamStartQR: { valid: [[]], invalid: [['extra']] },
  steamPollQR: { valid: [[]], invalid: [[1]] },
  steamPollCredential: { valid: [[]], invalid: [[{}]] },
  steamStartCredentials: {
    valid: [[{ username: 'gabe', password: 'hunter2' }]],
    invalid: [
      [{ username: 'gabe' }],
      [{ username: '', password: 'x' }],
      [{ username: 'gabe', password: 'x'.repeat(2000) }],
      [{ username: 'gabe', password: 'x', extra: 1 }],
      ['gabe']
    ]
  },
  steamSubmitGuard: {
    valid: [['AB12C'], ['123456']],
    invalid: [[''], [12345], ['X'.repeat(40)], []]
  },
  redeemSteamKey: {
    valid: [[{ store: 'steam', key: 'AAAAA-BBBBB-CCCCC' }]],
    invalid: [
      [{ store: 'gog', key: 'AAAAA-BBBBB-CCCCC' }],
      [{ store: 'steam', key: 12345 }],
      [{ store: 'steam', key: '' }],
      [null],
      [{ store: 'steam', key: 'k', extra: 1 }]
    ]
  },
  getSteamUserInfo: { valid: [[]], invalid: [['x']] },
  checkSteamInstalled: { valid: [[]], invalid: [['x']] },
  getSteamSyncedAt: { valid: [[]], invalid: [['x']] },
  getSteamInstallSize: {
    valid: [['570']],
    invalid: [['abc'], [570], [''], ['12345678901']]
  },
  steamBottleProvision: {
    valid: [
      [],
      [{}],
      [{ bottleName: 'GameLibSteam', wineVersion: engine }],
      [{ bottleName: 'GameLibSteam' }]
    ],
    invalid: [
      [{ bottleName: '' }],
      [{ wineVersion: { bin: '/x' } }],
      [{ extra: 1 }],
      ['bottle']
    ]
  },
  isSteamBottleProvisioned: { valid: [[]], invalid: [['x']] },
  steamBottleStatus: { valid: [[]], invalid: [['x']] },
  isSteamBottleEligible: {
    valid: [['570']],
    invalid: [[''], [570], [], ['570', 'x']]
  },
  getSteamBridgeRoute: {
    valid: [['570'], ['570', true], ['570', false]],
    invalid: [['abc'], [570], ['570', 'yes'], []]
  },
  setSteamBridgeUserRoute: {
    valid: [
      [{ appId: '570', userRoute: 'bridge' }],
      [{ appId: '570', userRoute: null }],
      [{ appId: '570', userRoute: 'bottle', acknowledgeReason: 'known-bad' }]
    ],
    invalid: [
      [{ appId: 'x', userRoute: 'bridge' }],
      [{ appId: '570', userRoute: 'wine' }],
      [{ appId: '570', userRoute: 'bridge', acknowledgeReason: 'nope' }],
      [{ appId: '570' }],
      [{ appId: '570', userRoute: 'bridge', extra: 1 }]
    ]
  },
  steamRemoveAllCopies: {
    valid: [['570']],
    invalid: [[''], [570], []]
  },
  steamGoOfflineRetry: { valid: [[]], invalid: [['x']] },
  steamGoOfflineCancel: { valid: [[]], invalid: [['x']] },
  steamBridgeListFriends: {
    valid: [['570']],
    invalid: [['abc'], [570], []]
  },
  steamBridgeInviteFriend: {
    valid: [
      ['570', 0],
      ['570', 3]
    ],
    invalid: [['570', -1], ['570', 1.5], ['570', '1'], ['abc', 0], ['570']]
  },
  persistBottleWineVersion: {
    valid: [[engine]],
    invalid: [[{}], [{ bin: '/x', name: 'n', type: 'toolkit2' }], [], ['wine']]
  },
  steamClientSetupStart: { valid: [[]], invalid: [['x']] },
  steamClientSetupRecheck: {
    valid: [['570']],
    invalid: [[''], [570], []]
  }
}

describe('steamAuth IPC schemas', () => {
  it('has a fixture for every channel', () => {
    expectFixtureCoverage(steamAuthSyncArgs, syncTable)
    expectFixtureCoverage(steamAuthAsyncArgs, asyncTable)
  })
  runFixtureTable(steamAuthSyncArgs, syncTable)
  runFixtureTable(steamAuthAsyncArgs, asyncTable)

  // D-10 / T-67-37: a rejection never carries a password, guard code or product key.
  describe.each([
    [
      'steamStartCredentials',
      [{ username: 'gabe', password: SENTINEL, [SENTINEL]: 1 }]
    ],
    ['steamStartCredentials', [{ username: 1, password: SENTINEL }]],
    ['steamStartCredentials', [SENTINEL]],
    ['steamSubmitGuard', [SENTINEL]],
    ['steamSubmitGuard', [{ code: SENTINEL }]],
    ['redeemSteamKey', [{ store: 'steam', key: SENTINEL.repeat(4) }]],
    ['redeemSteamKey', [{ store: SENTINEL, key: SENTINEL }]]
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
