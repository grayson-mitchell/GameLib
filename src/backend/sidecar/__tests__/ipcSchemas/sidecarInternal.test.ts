import { defined } from 'backend/testUtils/indexed'
import { channelSchemas } from 'common/types/ipc/channelSchemas'
import {
  sidecarInternalInvokeArgs,
  sidecarInternalSendArgs
} from 'common/types/ipc/sidecarInternal'
import {
  expectFixtureCoverage,
  runFixtureTable,
  type FixtureTable
} from 'backend/testUtils/ipcSchemaFixtures'

const noArgs = { valid: [[]], invalid: [['x']] }

const invokeTable: FixtureTable<typeof sidecarInternalInvokeArgs> = {
  // terminate_veto.rs sends an empty arg list
  health: noArgs,
  devSweepEpicCookieDomain: {
    valid: [['fortnite.com']],
    invalid: [[], [''], [1], ['x'.repeat(254)]]
  },
  // tray.rs: vec![Value::String(app_name)]
  trayResolveRunner: {
    valid: [['Fortnite']],
    invalid: [[], [''], [1], ['a', 'b']]
  },
  // relay_commands.rs: vec![]
  'sidecar:store-snapshot': noArgs,
  'sidecar:store-fetch': {
    valid: [['gogLibraryStore'], ['timestampStore']],
    invalid: [[], [''], [1], ['x'.repeat(129)]]
  },
  // main.rs / single_instance.rs: [Value::String(url)]
  handleProtocolUrl: {
    valid: [['gamelib://launch/steam/220']],
    invalid: [[], [''], [1], ['gamelib://x'.padEnd(9000, 'x')]]
  }
}

const sendTable: FixtureTable<typeof sidecarInternalSendArgs> = {
  // main.rs SHELL_WINDOW_FOCUSED: empty args
  shellWindowFocused: noArgs,
  // tauriTransport.ts: send('storeSet', [storeName, key, value])
  storeSet: {
    valid: [
      ['configStore', 'defaultSettings.theme', 'dark'],
      ['configStore', 'a.b', { nested: [1, 2, null] }],
      // a positional undefined value arrives as null
      ['configStore', 'a', undefined]
    ],
    invalid: [
      [],
      ['configStore'],
      ['configStore', 'a'],
      [1, 'a', 1],
      ['s', '', 1]
    ]
  },
  storeDelete: {
    valid: [['configStore', 'defaultSettings.theme']],
    invalid: [[], ['configStore'], ['configStore', ''], ['configStore', 1]]
  },
  // tauriTransport.ts: send(STORE_NEW_CHANNEL, [storeName, options])
  storeNew: {
    valid: [
      ['timestampStore', { cwd: 'store_cache', name: 'x' }],
      ['timestampStore', undefined],
      ['timestampStore']
    ],
    invalid: [[], [''], [1, {}], ['s', 'not-an-object']]
  }
}

describe('sidecarInternal schemas', () => {
  expectFixtureCoverage(sidecarInternalInvokeArgs, invokeTable)
  expectFixtureCoverage(sidecarInternalSendArgs, sendTable)
  runFixtureTable(sidecarInternalInvokeArgs, invokeTable)
  runFixtureTable(sidecarInternalSendArgs, sendTable)

  it('registers the ten channels with the right kind and caller', () => {
    const shell = [
      'health',
      'trayResolveRunner',
      'sidecar:store-snapshot',
      'handleProtocolUrl',
      'shellWindowFocused'
    ]
    for (const k of Object.keys(sidecarInternalInvokeArgs)) {
      expect(defined(channelSchemas[k], k).kind).toBe('invoke')
      expect(defined(channelSchemas[k], k).caller).toBe(
        shell.includes(k) ? 'shell' : 'renderer'
      )
    }
    for (const k of Object.keys(sidecarInternalSendArgs)) {
      expect(defined(channelSchemas[k], k).kind).toBe('send')
      expect(defined(channelSchemas[k], k).caller).toBe(
        shell.includes(k) ? 'shell' : 'renderer'
      )
    }
    expect(
      Object.keys(sidecarInternalInvokeArgs).length +
        Object.keys(sidecarInternalSendArgs).length
    ).toBe(10)
  })
})
