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
  return [...pairwiseCases(), ...incidentCases()]
}

export const caseId = (stem: string, title: string): string =>
  `${stem}--${slug(title)}`
