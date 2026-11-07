import {
  humbleAsyncArgs,
  humbleFrontendMessagesArgs,
  humbleSyncArgs
} from 'common/types/ipc/humble'
import { channelSchemas } from 'common/types/ipc/channelSchemas'
import {
  formatRejectionLog,
  validateInbound
} from 'backend/sidecar/ipcValidation'
import {
  expectFixtureCoverage,
  roundTrip,
  runFixtureTable,
  type FixtureTable
} from 'backend/testUtils/ipcSchemaFixtures'

const SENTINEL = 'SENTINEL-HUMBLE-KEY-5e2b'
const identity = { gamekey: 'GK123abc', machineName: 'game_machine' }

const syncTable: FixtureTable<typeof humbleSyncArgs> = {
  humbleDisconnect: { valid: [[]], invalid: [['x']] }
}

const noArgs = { valid: [[]], invalid: [['x']] }

const asyncTable: FixtureTable<typeof humbleAsyncArgs> = {
  humbleGetUserInfo: noArgs,
  humbleCheckHealth: noArgs,
  humbleRunValidation: noArgs,
  humbleSync: noArgs,
  humbleGetKeys: noArgs,
  humbleGetSyncState: noArgs,
  humbleSetOwnershipOverride: {
    valid: [['game_machine']],
    invalid: [[], [''], [1], ['x'.repeat(300)], ['a', 'b']]
  },
  humbleClearOwnershipOverride: {
    valid: [['game_machine']],
    invalid: [[], [''], [null]]
  },
  humbleGetOwnershipOverrides: noArgs,
  humbleRecordGiftLinkOpened: {
    valid: [['game_machine']],
    invalid: [[], [''], [{}]]
  },
  humbleGetGiftedAt: noArgs,
  humbleMarkRedeemed: {
    valid: [[identity]],
    invalid: [
      [],
      [{ gamekey: 'x' }],
      [{ ...identity, keyValue: 'ABCDE-12345' }],
      [{ gamekey: '', machineName: 'm' }],
      ['GK123abc']
    ]
  },
  humbleUndoRedeemed: {
    valid: [[identity]],
    invalid: [[], [{ machineName: 'm' }], [{ ...identity, extra: 1 }]]
  },
  humbleGetRevealedKeyValue: {
    valid: [[identity]],
    invalid: [
      [],
      [{ ...identity, value: 'x' }],
      [{ gamekey: 1, machineName: 'm' }]
    ]
  },
  humbleGetClaimAnnotations: noArgs
}

const pushTable: FixtureTable<typeof humbleFrontendMessagesArgs> = {
  openScreen: { valid: [['humble']], invalid: [[], [1]] },
  humbleAuthState: {
    valid: [[{ isLoggedIn: true, username: 'u' }]],
    invalid: [[], [null]]
  },
  humbleKeysUpdated: { valid: [[[]]], invalid: [[], [{}]] },
  humbleSyncProgress: {
    valid: [[{ done: 1, total: 4 }]],
    invalid: [[], [{ done: 1 }], [{ done: 1, total: 4, x: 1 }]]
  },
  humbleSyncStateChanged: {
    valid: [[{ syncedAt: null, syncError: 'none' }]],
    invalid: [[], ['x']]
  }
}

describe('humble channel schemas', () => {
  it('has a fixture for every key (21 total)', () => {
    expectFixtureCoverage(humbleSyncArgs, syncTable)
    expectFixtureCoverage(humbleAsyncArgs, asyncTable)
    expectFixtureCoverage(humbleFrontendMessagesArgs, pushTable)
    expect(
      Object.keys(humbleSyncArgs).length +
        Object.keys(humbleAsyncArgs).length +
        Object.keys(humbleFrontendMessagesArgs).length
    ).toBe(21)
  })
  runFixtureTable(humbleSyncArgs, syncTable)
  runFixtureTable(humbleAsyncArgs, asyncTable)
  runFixtureTable(humbleFrontendMessagesArgs, pushTable)

  it('registers every channel in channelSchemas', () => {
    for (const k of [
      ...Object.keys(humbleSyncArgs),
      ...Object.keys(humbleAsyncArgs),
      ...Object.keys(humbleFrontendMessagesArgs)
    ]) {
      expect(channelSchemas[k]).toBeDefined()
    }
  })

  // D-10 / T-67-48: a rejection never carries a key value, key id or stray key name.
  describe.each([
    ['humbleMarkRedeemed', [{ ...identity, keyValue: SENTINEL }]],
    ['humbleMarkRedeemed', [{ gamekey: SENTINEL, machineName: 1 }]],
    ['humbleGetRevealedKeyValue', [{ ...identity, [SENTINEL]: SENTINEL }]],
    ['humbleSetOwnershipOverride', [{ [SENTINEL]: SENTINEL }]]
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
