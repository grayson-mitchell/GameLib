/**
 * The case list of the known-fix reader oracle (88-05, D-14). Not a test: `knownFixReader.oracle.test.ts`
 * builds `cases.json` from this module in write mode and compares the committed file against it in
 * compare mode, so the list the Rust replay (88-08) reads and the list that was recorded cannot drift.
 *
 * Case shape: an id and a list of steps run in order on one fresh fake HOME. A step first removes
 * paths, then seeds files, then does its `op`:
 *   read         calls `readKnownFixes`, `readKnownFixesWithLayer`, `readKnownFixProfile` and
 *                `readGamelibFixStatus` (the ones in `calls`) for `appName` and `runner`
 *   filter       `filterTier1KnownFixes(appName, layer, parsed)`
 *   exeShape     `isValidExeOverrideShape` over each value
 *   routingOnly  `isRoutingOnlyTier1Fix(fix)`
 *   tier1Keys    the `TIER1_KNOWN_FIX_KEYS` allow-list
 *   layerPaths   where the three layer directories are
 * Seed and remove paths start with a placeholder; the three layers are
 *   local    `<APPFOLDER>/fixes/local`   bundled `<HOME>/public/fixes`   remote `<APPFOLDER>/fixes`
 * and `appName` may carry a placeholder too (an absolute-path appName).
 *
 * Two groups of cases: the pairwise rows (`pairwise-NNN`, runner x local x bundled x remote layer
 * state) and the named cases, one per `it` / `test` title of the seven reader test files, id
 * `<file-stem>--<slug(title)>` (the census in the oracle test proves none is missing), plus a few
 * named incident cases that have no test of their own (traversal forms, a remote layer carrying
 * tier-2 keys, a sideload runner).
 */
import type { Runner } from 'common/types'
import type { SeedEntry } from 'backend/testUtils/engineWineOracle/harness'
import { allPairs, type Row } from 'backend/testUtils/launchOracle/pairwise'
import { slug } from 'backend/testUtils/launchOracle/census'

export const READ_CALLS = [
  'readKnownFixes',
  'readKnownFixesWithLayer',
  'readKnownFixProfile',
  'readGamelibFixStatus'
] as const
export type ReadCall = (typeof READ_CALLS)[number]

export type Step = (
  | {
      op: 'read'
      appName: string
      runner: Runner
      calls: readonly ReadCall[]
    }
  | { op: 'filter'; appName: string; layer: string; parsed: unknown }
  | { op: 'exeShape'; values: readonly unknown[] }
  | { op: 'routingOnly'; fix: Record<string, unknown> }
  | { op: 'tier1Keys' }
  | { op: 'layerPaths' }
) & { remove?: string[]; seed?: SeedEntry[] }

export interface ReaderCase {
  id: string
  /** The test title a named case stands for, verbatim. */
  title?: string
  /** The pairwise row a generated case stands for. */
  axes?: Row
  steps: Step[]
}

export type Layer = 'local' | 'bundled' | 'remote'
export const LAYER_DIR: Readonly<Record<Layer, string>> = {
  local: '<APPFOLDER>/fixes/local',
  bundled: '<HOME>/public/fixes',
  remote: '<APPFOLDER>/fixes'
}
const LAYERS: readonly Layer[] = ['local', 'bundled', 'remote']

/** The filename suffix `storeMap` gives each runner; `sideload` has none and so reads `-undefined`. */
const STORE: Readonly<Record<Runner, string>> = {
  legendary: 'epic',
  gog: 'gog',
  nile: 'amazon',
  sideload: 'undefined',
  steam: 'steam'
}

const REG = [
  { key: 'HKLM\\Software\\X', name: 'N', type: 'REG_DWORD', value: 1 }
]
const ALL4 = READ_CALLS

/** The seed-path of a fix file: tier 1 is `<id>-<store>.json`, tier 2 `<id>-<store>.profile.json`. */
export const fixPath = (
  layer: Layer,
  app: string,
  runner: Runner,
  tier: 1 | 2
): string =>
  `${LAYER_DIR[layer]}/${app}-${STORE[runner]}${tier === 2 ? '.profile.json' : '.json'}`

const text = (body: unknown): string =>
  typeof body === 'string' ? body : JSON.stringify(body)

/** A fix file in a layer. A string body is written verbatim (malformed JSON); anything else as JSON. */
export const fix = (
  layer: Layer,
  app: string,
  runner: Runner,
  tier: 1 | 2,
  body: unknown
): SeedEntry => ({
  path: fixPath(layer, app, runner, tier),
  text: text(body)
})

const read = (
  appName: string,
  runner: Runner,
  extra: Partial<Step> = {}
): Step => ({ op: 'read', appName, runner, calls: ALL4, ...extra }) as Step

// ---------------------------------------------------------------------------------------------
// Pairwise rows
// ---------------------------------------------------------------------------------------------

export const RUNNERS: readonly Runner[] = [
  'legendary',
  'gog',
  'nile',
  'sideload',
  'steam'
]
export const LAYER_STATES = [
  'absent',
  'valid',
  'malformed',
  'routing-only',
  'tier-2-only',
  'tier-2-in-tier-1'
] as const
export type LayerState = (typeof LAYER_STATES)[number]

/** The axes of D-14's reader slice: the runner and the state of each of the three layers. */
export const PAIR_AXES = {
  runner: RUNNERS,
  local: LAYER_STATES,
  bundled: LAYER_STATES,
  remote: LAYER_STATES
}
const PAIR_APP = 'app1'

/** The files one layer holds in one state, for one runner. */
export function stateSeed(
  layer: Layer,
  state: LayerState,
  runner: Runner
): SeedEntry[] {
  const dllOverrides = [{ exe: 'Game.exe', dlls: { d3d9: 'native' } }]
  switch (state) {
    case 'absent':
      return []
    case 'valid':
      return [
        fix(layer, PAIR_APP, runner, 1, {
          title: `${layer} fix`,
          winetricks: [`${layer}-vcrun`],
          launchNotice: `${layer} notice`
        })
      ]
    case 'malformed':
      return [
        fix(layer, PAIR_APP, runner, 1, '{ not json'),
        fix(layer, PAIR_APP, runner, 2, '{ not json')
      ]
    case 'routing-only':
      return [
        fix(layer, PAIR_APP, runner, 1, {
          title: `${layer} routing`,
          macArch: '32',
          drm: 'ceg'
        })
      ]
    case 'tier-2-only':
      return [
        fix(layer, PAIR_APP, runner, 2, {
          title: `${layer} profile`,
          evidence: 'todo.md',
          registry: REG,
          dllOverrides,
          steamSharedRedists: ['229007']
        })
      ]
    case 'tier-2-in-tier-1':
      return [
        fix(layer, PAIR_APP, runner, 1, {
          title: `${layer} mixed`,
          winetricks: [`${layer}-vcrun`],
          registry: REG,
          dllOverrides,
          overlays: [{ id: 'o1' }],
          shimFeatures: ['f1']
        })
      ]
  }
}

export const pairwiseRows = (): Row[] => allPairs(PAIR_AXES)

const pad = (n: number): string => String(n).padStart(3, '0')

export function pairwiseCases(): ReaderCase[] {
  return pairwiseRows().map((row, i) => {
    const runner = row.runner as Runner
    const seed = LAYERS.flatMap((layer) =>
      stateSeed(layer, row[layer] as LayerState, runner)
    )
    return {
      id: `pairwise-${pad(i + 1)}`,
      axes: row,
      steps: [read(PAIR_APP, runner, { seed })]
    }
  })
}

// ---------------------------------------------------------------------------------------------
// Named incident cases without a test of their own
// ---------------------------------------------------------------------------------------------

/** Where an `appName` of `<rel>` lands for each layer, so a traversal target can be planted there. */
const ESCAPE_ONE: Readonly<Record<Layer, string>> = {
  local: '<APPFOLDER>/fixes',
  bundled: '<HOME>/public',
  remote: '<APPFOLDER>'
}

export function incidentCases(): ReaderCase[] {
  const traversalOne: Step = read('../x', 'gog', {
    seed: LAYERS.map((layer) => ({
      path: `${ESCAPE_ONE[layer]}/x-gog.json`,
      text: text({ title: `escaped from ${layer}`, winetricks: ['pwned'] })
    }))
  })
  const absolute: Step = read('<HOME>/outside/x', 'gog', {
    seed: [
      {
        path: '<HOME>/outside/x-gog.json',
        text: text({ title: 'absolute', winetricks: ['pwned'] })
      }
    ]
  })
  return [
    {
      id: 'traversal-dotdot',
      steps: [traversalOne]
    },
    {
      // On a POSIX host a backslash is an ordinary filename character, so `..\x` does not leave
      // the directory and nothing is warned; on Windows it is a separator and does. Recorded on
      // POSIX (see deltas.json). Nothing is seeded: a file name holding a backslash cannot be
      // created on Windows.
      id: 'traversal-backslash',
      steps: [read('..\\x', 'gog')]
    },
    {
      id: 'traversal-absolute',
      steps: [absolute]
    },
    {
      id: 'remote-tier-2-keys-yield-no-tier-2-data',
      steps: [
        read('app1', 'steam', {
          seed: [
            fix('remote', 'app1', 'steam', 1, {
              title: 'remote',
              winetricks: ['x'],
              registry: REG,
              dllOverrides: [{ exe: 'Game.exe', dlls: { d3d9: 'native' } }],
              overlays: [{ id: 'o1' }],
              shimFeatures: ['f1'],
              steamSharedRedists: ['229007'],
              evidence: 'todo.md'
            }),
            fix('remote', 'app1', 'steam', 2, {
              title: 'remote profile',
              registry: REG,
              shimFeatures: ['f1']
            })
          ]
        })
      ]
    },
    {
      id: 'remote-keys-outside-the-allow-list-are-dropped',
      steps: [
        read('app1', 'steam', {
          seed: [
            fix('remote', 'app1', 'steam', 1, {
              title: 'remote',
              notes: { a: 'b' },
              winetricks: ['x'],
              runInPrefix: ['setup.exe'],
              envVariables: { A: '1' },
              wikiLink: 'https://example.test',
              launchNotice: 'hello',
              macArch: '32',
              drm: 'ceg',
              launchArgs: ['-x'],
              exeOverride: 'bin/game.exe',
              steamGameOverlay: 'off',
              platforms: ['mac'],
              rating: 'gold',
              command: 'rm -rf /'
            })
          ]
        })
      ]
    },
    {
      id: 'sideload-reads-the-undefined-store-file',
      steps: [
        read('app1', 'sideload', {
          seed: [
            fix('bundled', 'app1', 'sideload', 1, {
              title: 'sideload fix',
              winetricks: ['x']
            })
          ]
        })
      ]
    }
  ]
}

/** Every case of the reader slice, in file order. */
export function readerCases(): ReaderCase[] {
  return [...pairwiseCases(), ...incidentCases(), ...namedCases()]
}

// ---------------------------------------------------------------------------------------------
// One case per `it` / `test` title of the seven reader test files (D-14)
// ---------------------------------------------------------------------------------------------

const named = (stem: string, title: string, steps: Step[]): ReaderCase => ({
  id: `${stem}--${slug(title)}`,
  title,
  steps
})

const flt = (appName: string, layer: string, parsed: unknown): Step => ({
  op: 'filter',
  appName,
  layer,
  parsed
})
const exeShape = (values: readonly unknown[]): Step => ({
  op: 'exeShape',
  values
})
const dirOf = (layer: Layer): string => LAYER_DIR[layer]

/** A step per layer: the previous layer's file is removed, this layer's is seeded, then the read. */
function perLayer(
  app: string,
  runner: Runner,
  tier: 1 | 2,
  body: unknown,
  layers: readonly Layer[] = LAYERS
): Step[] {
  return layers.map((layer, i) => {
    const previous = layers[i - 1]
    return read(app, runner, {
      remove: previous ? [fixPath(previous, app, runner, tier)] : [],
      seed: [fix(layer, app, runner, tier, body)]
    })
  })
}

/** Where `../../etc/x-steam.json` lands from each layer directory, all inside the fake HOME. */
const ETC_TARGET: Readonly<Record<Layer, string>> = {
  local: '<APPFOLDER>/etc/x-steam.json',
  bundled: '<HOME>/etc/x-steam.json',
  remote: '<HOME>/.config/etc/x-steam.json'
}

const DLL = [{ exe: 'Game.exe', dlls: { nvapi64: 'disabled' } }]

function knownFixesCases(): ReaderCase[] {
  const K = (title: string, steps: Step[]): ReaderCase =>
    named('knownFixes', title, steps)
  const R = 'readKnownFixes > '
  const F = 'filterTier1KnownFixes launchArgs/exeOverride (quick 261029-mbl) > '
  const run = (extra: Record<string, unknown>): Step =>
    flt('app', 'remote', { title: 't', ...extra })
  const badExe = [
    '/abs/game.exe',
    'C:\\game.exe',
    'C:game.exe',
    '\\\\server\\share\\g.exe',
    '\\game.exe',
    '../game.exe',
    'bin/../../game.exe',
    'bin\\..\\..\\g.exe',
    '',
    'a\u0000b',
    5,
    ['x']
  ]
  return [
    K(
      `${R}REQ-34.2-05 returns null when no fix file exists for the appName/runner pair`,
      [read('no-such-app', 'gog')]
    ),
    K(
      `${R}REQ-34.2-05 returns the parsed object when a well-formed fix file exists`,
      [
        read('well-formed-app', 'gog', {
          seed: [
            fix('remote', 'well-formed-app', 'gog', 1, {
              winetricks: ['vcrun2019'],
              runInPrefix: ['setup.exe']
            })
          ]
        })
      ]
    ),
    K(
      `${R}REQ-34.2-05 returns null AND logs a warning when the file exists but is malformed JSON`,
      [
        read('malformed-app', 'gog', {
          seed: [fix('remote', 'malformed-app', 'gog', 1, '{ not valid json')]
        })
      ]
    ),
    K(
      `${R}REQ-34.2-05 resolves a different filename for two different runners with the same appName`,
      [
        read('shared-app', 'gog', {
          seed: [
            fix('remote', 'shared-app', 'gog', 1, {
              winetricks: ['gog-only-fix']
            }),
            fix('remote', 'shared-app', 'legendary', 1, {
              winetricks: ['epic-only-fix']
            })
          ]
        }),
        read('shared-app', 'legendary')
      ]
    ),
    K(
      `${R}quick 261024-tny reads <id>-steam.json for runner steam, never <id>-undefined.json`,
      [
        read('steamapp-1', 'steam', {
          seed: [
            fix('remote', 'steamapp-1', 'steam', 1, {
              winetricks: ['vcrun2019']
            }),
            {
              path: '<APPFOLDER>/fixes/steamapp-2-undefined.json',
              text: text({ winetricks: ['stale'] })
            }
          ]
        }),
        read('steamapp-2', 'steam')
      ]
    ),
    K(
      `${R}WR-06 returns null and does NOT read an out-of-tree file when appName traverses`,
      [
        read('../outside-the-fixes-dir', 'gog', {
          seed: [
            {
              path: '<APPFOLDER>/outside-the-fixes-dir-gog.json',
              text: text({ winetricks: ['pwned'] })
            }
          ]
        })
      ]
    ),
    K(
      `${R}WR-06 returns null for a deeper traversal even though the target EXISTS`,
      [
        read('../../deep-escape', 'gog', {
          seed: [
            {
              path: '<HOME>/.config/deep-escape-gog.json',
              text: text({ winetricks: ['pwned-deep'] })
            }
          ]
        })
      ]
    ),
    K(`${R}WR-06 guard does not reject a normal appName (anti-vacuity)`, [
      read('ordinary-app', 'gog', {
        seed: [
          fix('remote', 'ordinary-app', 'gog', 1, { winetricks: ['corefonts'] })
        ]
      })
    ]),
    K(
      `${R}REQ-34.2-05 resolves fixesPath under os.tmpdir(), never the real config directory`,
      [{ op: 'layerPaths' }]
    ),
    K(`${F}keeps a string-array launchArgs, including an empty one`, [
      run({ launchArgs: ['-dx11', '--windowed'] }),
      run({ launchArgs: [] })
    ]),
    K(
      `${F}drops launchArgs %j with a warning`,
      ['-dx11', [1], ['-a', null], {}].map((bad) => run({ launchArgs: bad }))
    ),
    K(`${F}keeps exeOverride %j`, [
      run({ exeOverride: 'bin/game.exe' }),
      run({ exeOverride: 'bin\\game.exe' }),
      exeShape(['bin/game.exe', 'bin\\game.exe'])
    ]),
    K(`${F}drops exeOverride %j with a warning`, [
      ...badExe.map((bad) => run({ exeOverride: bad })),
      exeShape(badExe)
    ]),
    K(`${F}lists both keys as tier 1 and does not treat them as routing`, [
      { op: 'tier1Keys' },
      { op: 'routingOnly', fix: { title: 't', launchArgs: ['-x'] } }
    ])
  ]
}

function layeredCases(): ReaderCase[] {
  const L = (title: string, steps: Step[]): ReaderCase =>
    named('knownFixesLayered', title, steps)
  const T1 = 'readKnownFixes (tier 1) > '
  const T2 = 'readKnownFixProfile (tier 2) > '
  const profile = (layer: Layer, body: unknown): SeedEntry =>
    fix(layer, '1', 'steam', 2, body)
  const tier1 = (layer: Layer, body: unknown): SeedEntry =>
    fix(layer, '1', 'steam', 1, body)
  return [
    L(`${T1}returns null when no layer has a file`, [read('1', 'steam')]),
    L(`${T1}returns the bundled object`, [
      read('1', 'steam', {
        seed: [tier1('bundled', { title: 'b', winetricks: ['x'] })]
      })
    ]),
    L(`${T1}local wins over bundled as a whole file (no per-key merge)`, [
      read('1', 'steam', {
        seed: [
          tier1('bundled', { title: 'b', winetricks: ['x'] }),
          tier1('local', { title: 'l' })
        ]
      })
    ]),
    L(`${T1}bundled wins over remote`, [
      read('1', 'steam', {
        seed: [
          tier1('remote', { title: 'r' }),
          tier1('bundled', { title: 'b' })
        ]
      })
    ]),
    L(`${T1}falls back to remote when local and bundled are absent`, [
      read('1', 'steam', { seed: [tier1('remote', { title: 'r' })] })
    ]),
    L(`${T1}malformed local warns and falls through to bundled`, [
      read('1', 'steam', {
        seed: [tier1('bundled', { title: 'b' }), tier1('local', '{nope')]
      })
    ]),
    L(`${T1}non-object JSON is treated as malformed and falls through`, [
      read('1', 'steam', {
        seed: [tier1('bundled', { title: 'b' }), tier1('local', [1, 2])]
      })
    ]),
    L(
      `${T1}returns every tier-1 key unchanged and drops the rest from a remote file`,
      [
        read('1', 'steam', {
          seed: [
            tier1('remote', {
              title: 't',
              envVariables: { A: '1' },
              winetricks: ['v'],
              runInPrefix: ['setup.exe'],
              notes: { a: 'b' },
              wikiLink: 'https://example.test',
              launchNotice: 'hello',
              registry: REG,
              foo: 1
            })
          ]
        })
      ]
    ),
    L(
      `${T1}drops tier-2 keys from the %s layer with a warning naming the .profile.json`,
      perLayer('1', 'steam', 1, {
        title: 't',
        registry: REG,
        steamSharedRedists: ['229007']
      })
    ),
    L(
      `${T1}drops dllOverrides from a tier-1 .json in the %s layer with a warning`,
      perLayer('1', 'steam', 1, {
        title: 't',
        dllOverrides: [{ exe: 'a.exe', dlls: { d3d9: 'native' } }]
      })
    ),
    L(`${T1}drops an unknown non-tier-2 key with a warning naming the layer`, [
      read('1', 'steam', {
        seed: [tier1('local', { title: 't', foo: 1 })]
      })
    ]),
    L(
      `${T1}rejects a traversing appName in the %s layer`,
      LAYERS.map((layer, i) => {
        const previous = LAYERS[i - 1]
        return read('../../etc/x', 'steam', {
          remove: previous ? [ETC_TARGET[previous]] : [],
          seed: [{ path: ETC_TARGET[layer], text: text({ title: 'evil' }) }]
        })
      })
    ),
    L('filterTier1KnownFixes > matches the reader output for a plain object', [
      flt('1', 'remote', {
        title: 't',
        envVariables: { A: '1' },
        registry: REG
      })
    ]),
    L(
      'filterTier1KnownFixes > returns null for %p',
      [null, [1], 3, 'x'].map((value) => flt('1', 'remote', value))
    ),
    L('filterTier1KnownFixes > exposes the allow-list without any tier-2 key', [
      { op: 'tier1Keys' }
    ]),
    L(`${T2}returns null when no layer has a profile`, [read('1', 'steam')]),
    L(`${T2}local wins over bundled`, [
      read('1', 'steam', {
        seed: [
          profile('bundled', { title: 'b', registry: REG }),
          profile('local', { title: 'l' })
        ]
      })
    ]),
    L(
      `${T2}never reads a .profile.json that sits only in the remote directory`,
      [
        read('1', 'steam', {
          seed: [profile('remote', { title: 'r', registry: REG })]
        })
      ]
    ),
    L(
      `${T2}returns title, notes, evidence, registry and steamSharedRedists unchanged`,
      [
        read('1', 'steam', {
          seed: [
            profile('bundled', {
              title: 't',
              notes: { a: 'b' },
              evidence: 'todo.md',
              registry: REG,
              steamSharedRedists: ['229007']
            })
          ]
        })
      ]
    ),
    L(
      `${T2}keeps dllOverrides from the %s layer without a warning`,
      perLayer('1', 'steam', 2, { dllOverrides: DLL }, ['bundled', 'local'])
    ),
    L(
      `${T2}ignores a dllOverrides profile that sits only in the remote directory`,
      [
        read('1', 'steam', {
          seed: [
            profile('remote', {
              dllOverrides: [{ exe: 'Game.exe', dlls: { a: 'native' } }]
            })
          ]
        })
      ]
    ),
    L(
      `${T2}drops tier-1 functional keys with a warning naming the tier-1 file`,
      [
        read('1', 'steam', {
          seed: [
            profile('local', {
              title: 't',
              envVariables: { A: '1' },
              winetricks: ['v'],
              runInPrefix: ['s.exe'],
              wikiLink: 'x',
              launchNotice: 'n',
              registry: REG
            })
          ]
        })
      ]
    ),
    L(`${T2}drops an unknown key with a warning`, [
      read('1', 'steam', {
        seed: [profile('local', { title: 't', foo: 1 })]
      })
    ]),
    L(
      `${T2}is store-agnostic: gog and legendary (epic) resolve their own filenames`,
      [
        read('x', 'gog', {
          seed: [
            fix('bundled', 'x', 'gog', 2, { title: 'g' }),
            fix('bundled', 'x', 'legendary', 2, { title: 'e' })
          ]
        }),
        read('x', 'legendary')
      ]
    ),
    L(`${T2}rejects a traversing appName`, [read('../../etc/x', 'steam')]),
    L(
      'tier independence > takes tier 1 from remote and tier 2 from bundled in the same launch',
      [
        read('1', 'steam', {
          seed: [
            tier1('remote', { title: 'remote', envVariables: { A: '1' } }),
            profile('bundled', { title: 'profile', registry: REG })
          ]
        })
      ]
    )
  ]
}

function withLayerCases(): ReaderCase[] {
  const W = (title: string, steps: Step[]): ReaderCase =>
    named(
      'knownFixesWithLayer',
      `readKnownFixesWithLayer (D-12) > ${title}`,
      steps
    )
  const put = (layer: Layer): SeedEntry =>
    fix(layer, '77', 'steam', 1, { title: 'T', macArch: '32' })
  return [
    W('returns null when no layer has a file', [read('77', 'steam')]),
    W('walks local > bundled > remote and matches readKnownFixes', [
      read('77', 'steam', { seed: LAYERS.map(put) }),
      read('77', 'steam', { remove: [dirOf('local')] }),
      read('77', 'steam', { remove: [dirOf('bundled')] }),
      read('77', 'steam', { remove: [dirOf('remote')] })
    ])
  ]
}

function gamelibStatusCases(): ReaderCase[] {
  const G = (title: string, steps: Step[]): ReaderCase =>
    named('knownFixesGamelibStatus', `readGamelibFixStatus > ${title}`, steps)
  const GT = 'quick 261027-gtd: routing-only tier-1 files are not a fix > '
  const MB =
    'quick 261029-mbl: launchArgs/exeOverride are fixes, not routing > '
  const t1 = (layer: Layer, body: unknown): SeedEntry =>
    fix(layer, 'app', 'steam', 1, body)
  const t2 = (layer: Layer, body: unknown): SeedEntry =>
    fix(layer, 'app', 'steam', 2, body)
  const one = (title: string, seed: SeedEntry[], app = 'app'): ReaderCase =>
    G(title, [read(app, 'steam', { seed })])
  return [
    one('bundled tier-1 only -> bundled, no notice', [
      t1('bundled', { title: 't' })
    ]),
    one('local tier-1 only -> local', [t1('local', { title: 't' })]),
    one('bundled tier-2 only -> bundled', [t2('bundled', { title: 't' })]),
    G('remote tier-1 only -> null, with or without launchNotice', [
      read('app', 'steam', { seed: [t1('remote', { title: 't' })] }),
      read('app', 'steam', {
        seed: [t1('remote', { title: 't', launchNotice: 'hi' })]
      })
    ]),
    G('nothing anywhere -> null', [read('app', 'steam')]),
    one("local's launchNotice wins over bundled's", [
      t1('local', { title: 'l', launchNotice: 'L' }),
      t1('bundled', { title: 'b', launchNotice: 'B' })
    ]),
    one('bundled tier-2 + remote tier-1 notice -> remote text never surfaces', [
      t2('bundled', { title: 't' }),
      t1('remote', { title: 't', launchNotice: 'remote' })
    ]),
    G(
      'launchNotice %p -> undefined',
      ['', 5, '   '].map((n) =>
        read('app', 'steam', {
          seed: [t1('bundled', { title: 't', launchNotice: n })]
        })
      )
    ),
    G('rating is not a tier-1 key', [{ op: 'tier1Keys' }]),
    G('sideload -> null', [
      read('app', 'sideload', { seed: [t1('bundled', { title: 't' })] })
    ]),
    G('traversal appName -> null', [read('../../etc/passwd', 'steam')]),
    G('malformed bundled tier-1 falls through to tier-2, else null', [
      read('app', 'steam', { seed: [t1('bundled', '{not json')] }),
      read('app', 'steam', { seed: [t2('bundled', { title: 't' })] })
    ]),
    one(`${GT}macArch-only -> null`, [
      t1('bundled', { title: 't', macArch: '32' })
    ]),
    one(`${GT}macArch + drm + notes -> null`, [
      t1('bundled', {
        title: 't',
        notes: { drm: 'x' },
        macArch: '32',
        drm: 'ceg'
      })
    ]),
    one(`${GT}drm + envVariables -> bundled`, [
      t1('bundled', { title: 't', drm: 'ceg', envVariables: { A: 'b' } })
    ]),
    one(`${GT}drm + launchNotice -> bundled with the notice`, [
      t1('bundled', { title: 't', drm: 'ceg', launchNotice: 'hi' })
    ]),
    one(
      `${GT}routing-only tier-1 + tier-2 profile -> the profile still counts`,
      [t1('bundled', { title: 't', drm: 'ceg' }), t2('bundled', { title: 't' })]
    ),
    one(`${GT}local routing-only shadows a bundled real fix -> null`, [
      t1('local', { title: 'l', macArch: '32' }),
      t1('bundled', { title: 'b', envVariables: { A: 'b' } })
    ]),
    one(`${GT}a rejected drm value filters to title-only -> bundled`, [
      t1('bundled', { title: 't', drm: 'steamstub' })
    ]),
    one(`${MB}launchArgs-only bundled file -> bundled`, [
      t1('bundled', { launchArgs: ['-x'] })
    ]),
    one(`${MB}macArch + exeOverride is not routing-only -> bundled`, [
      t1('bundled', { macArch: '32', exeOverride: 'g.exe' })
    ])
  ]
}

function filterKeyCases(): ReaderCase[] {
  const base = { title: 'T' }
  const withEnv = { title: 'T', envVariables: { A: 'b' } }
  const M = (title: string, steps: Step[]): ReaderCase =>
    named(
      'knownFixesMacArch',
      `filterTier1KnownFixes macArch > ${title}`,
      steps
    )
  const D = (title: string, steps: Step[]): ReaderCase =>
    named('knownFixesDrm', `filterTier1KnownFixes drm > ${title}`, steps)
  const O = (title: string, steps: Step[]): ReaderCase =>
    named(
      'knownFixesOverlay',
      `filterTier1KnownFixes steamGameOverlay > ${title}`,
      steps
    )
  return [
    M('keeps "32" with no warning', [
      flt('1', 'bundled', { ...base, macArch: '32' })
    ]),
    M(
      'drops %p with a warning',
      ['64', 32, 'i386', null, ''].map((v) =>
        flt('1', 'remote', { ...withEnv, macArch: v })
      )
    ),
    M('key list contains macArch and not platforms', [{ op: 'tier1Keys' }]),
    D('keeps "ceg" with no warning', [
      flt('1', 'bundled', { ...base, drm: 'ceg' })
    ]),
    D('the remote layer admits it', [
      flt('1', 'remote', { ...base, macArch: '32', drm: 'ceg' })
    ]),
    D(
      'drops %p with exactly one warning',
      ['CEG', 'steamstub', true, null, '', 'drm-wrapped'].map((v) =>
        flt('1', 'remote', { ...withEnv, drm: v })
      )
    ),
    D('TIER1_KNOWN_FIX_KEYS contains drm', [{ op: 'tier1Keys' }]),
    O('keeps "off" with no warning', [
      flt('1', 'remote', { ...base, steamGameOverlay: 'off' })
    ]),
    O(
      'drops %p with a warning',
      ['on', true, false, 'OFF', 0].map((v) =>
        flt('1', 'remote', { ...base, steamGameOverlay: v })
      )
    ),
    O('is a fix, not a routing key', [
      { op: 'routingOnly', fix: { title: 'x', steamGameOverlay: 'off' } }
    ]),
    O('is a tier-1 key (and so rejected by the tier-2 allow-list)', [
      { op: 'tier1Keys' }
    ])
  ]
}

/** The 74 named cases: every title of the seven reader test files. */
export function namedCases(): ReaderCase[] {
  return [
    ...knownFixesCases(),
    ...layeredCases(),
    ...withLayerCases(),
    ...gamelibStatusCases(),
    ...filterKeyCases()
  ]
}
