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
  // main.rs / single_instance.rs: [Value::String(url)]
  handleProtocolUrl: {
    valid: [['gamelib://launch/steam/220']],
    invalid: [[], [''], [1], ['gamelib://x'.padEnd(9000, 'x')]]
  },
  // 73-11: gamelib-depot callbacks, one strict object each
  depotCdnToken: {
    valid: [
      [{ jobId: 'j1', appId: '480', depotId: '481', host: 'a.b', force: false }]
    ],
    invalid: [
      [],
      [
        { jobId: 'j1', appId: '48x', depotId: '481', host: 'a.b', force: false }
      ],
      [{ jobId: 'j1', appId: '480', depotId: '481', host: 'a.b' }],
      [
        {
          jobId: 'j1',
          appId: '480',
          depotId: '481',
          host: 'x'.repeat(254),
          force: true
        }
      ],
      [
        {
          jobId: 'j1',
          appId: '480',
          depotId: '481',
          host: 'a',
          force: true,
          x: 1
        }
      ]
    ]
  },
  depotManifestRequestCode: {
    valid: [[{ jobId: 'j1', appId: '480', depotId: '481', manifestId: '123' }]],
    invalid: [
      [],
      [{ jobId: 'j1', appId: '480', depotId: '481', manifestId: 'abc' }],
      [{ jobId: '', appId: '480', depotId: '481', manifestId: '1' }]
    ]
  },
  steamPollStateEvent: {
    valid: [
      [
        {
          kind: 'installed',
          appId: '480',
          seq: 1,
          source: 'native',
          installPath: '/g/480',
          sizeOnDisk: '1024',
          buildid: null
        }
      ],
      [{ kind: 'macArchVerdict', appId: '480', seq: 3, verdict: '64' }]
    ],
    invalid: [
      [],
      [{ kind: 'bogus', appId: '480', seq: 1 }],
      // Phase 81 D-11: the boot re-arm is gone, so its event is no longer a kind.
      [{ kind: 'rearmSettled', seq: 2, needsReconcile: true }],
      [{ kind: 'installIncomplete', appId: 'abc', seq: 1 }],
      [{ kind: 'installIncomplete', appId: '480', seq: 1, extra: 1 }],
      [{ kind: 'macArchVerdict', appId: '480', seq: 3, verdict: '16' }]
    ]
  }
}

const sendTable: FixtureTable<typeof sidecarInternalSendArgs> = {
  // main.rs SHELL_WINDOW_FOCUSED: empty args
  shellWindowFocused: noArgs,
  // 87-42: Rust's engine registry changed by itself; `selection` null is a cleared key
  engineSelectionChanged: {
    valid: [
      [{ key: '620', selection: null }],
      [
        {
          key: '620',
          selection: {
            kind: 'crossover',
            reason: 'cx-healthy',
            crossoverBuild: null,
            binDir: '/cx/bin'
          }
        }
      ],
      [
        {
          key: 'gog:1',
          selection: {
            kind: 'pinned',
            pinId: 'p',
            reason: 'cx-missing',
            wineBin: '/w',
            wineserverBin: '/ws',
            label: 'Pinned',
            version: '11.20',
            dxvk: { dir: '/d', version: 'v1' }
          }
        }
      ]
    ],
    invalid: [
      [],
      [{ key: '', selection: null }],
      [{ key: '620' }],
      [{ key: '620', selection: { kind: 'other' } }],
      [{ key: '620', selection: null, extra: 1 }]
    ]
  },
  // 87-54: a Steam bridge launch's deadline fired in Rust with no game process seen
  engineDeadlineFired: {
    valid: [[{ key: '620', reason: 'no-game-process' }]],
    invalid: [
      [],
      [{ key: '', reason: 'no-game-process' }],
      [{ key: '620' }],
      [{ key: '620', reason: 'other' }],
      [{ key: '620', reason: 'no-game-process', extra: 1 }]
    ]
  },
  // 88.2-15: a runner call's output chunk and its child's spawn, sent by the shell ahead of the call's reply
  runnerOutput: {
    valid: [
      [{ streamId: 'runner-stream-1', seq: 0, pipe: 'stdout', chunk: 'hi\n' }],
      [{ streamId: 's', seq: 41, pipe: 'stderr', chunk: '' }]
    ],
    invalid: [
      [],
      [{ streamId: '', seq: 0, pipe: 'stdout', chunk: 'x' }],
      [{ streamId: 's', seq: -1, pipe: 'stdout', chunk: 'x' }],
      [{ streamId: 's', seq: 0.5, pipe: 'stdout', chunk: 'x' }],
      [{ streamId: 's', seq: 0, pipe: 'stdin', chunk: 'x' }],
      [{ streamId: 's', seq: 0, pipe: 'stdout' }],
      [{ streamId: 's', seq: 0, pipe: 'stdout', chunk: 'x', extra: 1 }]
    ]
  },
  runnerSpawned: {
    valid: [[{ streamId: 'runner-stream-1', pid: 4242 }]],
    invalid: [
      [],
      [{ streamId: '', pid: 4242 }],
      [{ streamId: 's', pid: 0 }],
      [{ streamId: 's', pid: -1 }],
      [{ streamId: 's', pid: 1.5 }],
      [{ streamId: 's' }],
      [{ streamId: 's', pid: 4242, extra: 1 }]
    ]
  },
  // 73-11: Rust depot job events (flattened kind tag)
  depotJobEvent: {
    valid: [
      [{ jobId: 'j', seq: 1, kind: 'warning', message: 'm', count: 2 }],
      [
        {
          jobId: 'j',
          seq: 2,
          kind: 'progress',
          doneBytes: 1,
          netBytes: 1,
          totalBytes: 2,
          filesDone: 0,
          filesTotal: 1,
          host: null,
          elapsedMs: 5
        }
      ],
      [{ jobId: 'j', seq: 3, kind: 'hostSummary', hosts: [] }],
      [{ jobId: 'j', seq: 3, kind: 'stage', stage: 'delta_planning' }],
      [{ jobId: 'j', seq: 4, kind: 'stage', stage: 'delta_committing' }],
      [
        {
          jobId: 'j',
          seq: 0,
          kind: 'planned',
          totalBytes: 1,
          totalFiles: 1,
          depots: [{ depotId: '1', gid: '2', size: 3 }]
        }
      ]
    ],
    invalid: [
      [],
      [{ jobId: 'j', seq: -1, kind: 'warning', message: 'm', count: 2 }],
      [{ jobId: 'j', seq: 1, kind: 'warning', message: '', count: 2 }],
      [{ jobId: 'j', seq: 1, kind: 'nope' }],
      [{ jobId: 'j', seq: 1, kind: 'stage', stage: 'something_else' }],
      [{ jobId: 'j', seq: 1, kind: 'stage' }],
      [{ jobId: 'j', seq: 1, kind: 'stage', stage: 'delta_planning', x: 1 }],
      [
        {
          jobId: 'j',
          seq: 1,
          kind: 'planned',
          totalBytes: 1,
          totalFiles: 1,
          depots: [{ depotId: 'x', gid: '2', size: 3 }]
        }
      ]
    ]
  },
  // 85-10 store_dispatch.rs send_mirror_event: one answer per sidecar store frame
  storeMirrorEvent: {
    valid: [
      [
        {
          store: 'store_cache/wikigameinfo',
          rev: 3,
          op: 'applied',
          originSeq: 7
        }
      ],
      [
        {
          store: 'store/config',
          rev: 0,
          op: 'flushed',
          originSeq: 9007199254740991
        }
      ],
      [
        {
          store: 'store_cache/wikigameinfo',
          rev: 0,
          op: 'refused',
          originSeq: 1,
          reason: 'not-owned'
        }
      ],
      // 85-17: a write from another origin, named the way a frame names one
      [
        {
          store: 'store/config',
          rev: 4,
          op: 'changed',
          key: 'theme',
          valueJson: '"dark"'
        }
      ],
      [{ store: 'store/config', rev: 5, op: 'changed', key: 'theme' }],
      [{ store: 'store/config', rev: 6, op: 'changed', valueJson: '{}' }],
      [{ store: 'store/config', rev: 7, op: 'changed' }]
    ],
    invalid: [
      [],
      [{ store: '', rev: 1, op: 'applied', originSeq: 1 }],
      [{ store: 's', rev: -1, op: 'applied', originSeq: 1 }],
      [{ store: 's', rev: 1.5, op: 'applied', originSeq: 1 }],
      [{ store: 's', rev: 1, op: 'applied', originSeq: 0 }],
      [{ store: 's', rev: 1, op: 'nack', originSeq: 1 }],
      [{ store: 's', rev: 1, op: 'refused', originSeq: 1, reason: 'why' }],
      [{ store: 's', rev: 1, op: 'applied', originSeq: 1, extra: 1 }],
      [{ store: 's', rev: 1, op: 'applied' }],
      [{ store: 's', rev: 0, op: 'changed' }],
      [{ store: 's', rev: 1, op: 'changed', originSeq: 1 }],
      [{ store: 's', rev: 1, op: 'changed', key: '' }],
      [{ store: 's', rev: 1, op: 'changed', valueJson: 1 }],
      [{ store: 's', rev: 1, op: 'applied', originSeq: 1, key: 'k' }]
    ]
  }
}

describe('sidecarInternal schemas', () => {
  expectFixtureCoverage(sidecarInternalInvokeArgs, invokeTable)
  expectFixtureCoverage(sidecarInternalSendArgs, sendTable)
  runFixtureTable(sidecarInternalInvokeArgs, invokeTable)
  runFixtureTable(sidecarInternalSendArgs, sendTable)

  it('registers the fourteen channels with the right kind and caller', () => {
    const shell = [
      'health',
      'trayResolveRunner',
      'handleProtocolUrl',
      'shellWindowFocused',
      'depotCdnToken',
      'depotManifestRequestCode',
      'depotJobEvent',
      'storeMirrorEvent',
      'steamPollStateEvent',
      'engineSelectionChanged',
      'engineDeadlineFired',
      'runnerOutput',
      'runnerSpawned'
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
    ).toBe(14)
  })
})
