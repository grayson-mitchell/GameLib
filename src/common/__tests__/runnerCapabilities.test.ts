/**
 * Drift test for `src/common/runnerCapabilities.json` (Phase 86, 86-19, D-24).
 *
 * The Rust `gamelib-info` crate reads this one file (`runner_caps.rs`, `include_str!`) for what it
 * needs to know about a runner: whether its `app_name` is a Steam appId, whether it has a store
 * catalog, which store name the wiki lookups use, and which store name umu's API takes. The TS sources
 * of those facts stay where they are until their callers move, so this test proves the JSON equals
 * each of them: `common/storeCapabilities.ts`, `common/utils.ts` `storeMap` and the `storeMapping`
 * const in `wiki_game_info/umu/utils.ts` (private to that module, so it is read as source text).
 * A new runner, or a changed flag or name on either side, fails here before the two sides disagree.
 */
import { readFileSync } from 'fs'
import { join } from 'path'

import { storeMap } from '../utils'
import { storeCapabilities } from '../storeCapabilities'
import runnerCapabilities from '../runnerCapabilities.json'

const UMU_UTILS = join(
  __dirname,
  '..',
  '..',
  'backend',
  'wiki_game_info',
  'umu',
  'utils.ts'
)

/** The `storeMapping` object literal of umu/utils.ts, as `{ runner: store }`. */
function umuStoreMapping(): Record<string, string> {
  const source = readFileSync(UMU_UTILS, 'utf8')
  const block = /const storeMapping: Record<Runner, string> = \{([^}]*)\}/.exec(
    source
  )?.[1]
  if (block === undefined) throw new Error('umu storeMapping literal not found')
  const mapping: Record<string, string> = {}
  for (const line of block.split(/[\n,]/)) {
    const pair = /^\s*(\w+):\s*'([^']*)'\s*$/.exec(line)
    if (pair?.[1] !== undefined && pair[2] !== undefined) {
      mapping[pair[1]] = pair[2]
    } else if (line.trim() !== '') {
      throw new Error(`unparsed umu storeMapping line: ${line}`)
    }
  }
  return mapping
}

const runners = Object.keys(storeCapabilities).sort()

describe('runnerCapabilities.json', () => {
  it('names exactly the runners of the capability table, in every section', () => {
    expect(Object.keys(runnerCapabilities.runners).sort()).toEqual(runners)
    expect(Object.keys(runnerCapabilities.storeMap).sort()).toEqual(runners)
    expect(Object.keys(runnerCapabilities.umuStore).sort()).toEqual(runners)
  })

  it('anti-vacuity: the table has the five runners', () => {
    expect(runners).toEqual(['gog', 'legendary', 'nile', 'sideload', 'steam'])
  })

  it('appNameIsSteamAppId and hasStoreCatalog equal common/storeCapabilities.ts', () => {
    for (const runner of runners) {
      const caps = storeCapabilities[runner as keyof typeof storeCapabilities]
      expect({
        runner,
        row: runnerCapabilities.runners[
          runner as keyof typeof runnerCapabilities.runners
        ]
      }).toEqual({
        runner,
        row: {
          appNameIsSteamAppId: caps.appNameIsSteamAppId,
          hasStoreCatalog: caps.hasStoreCatalog
        }
      })
    }
  })

  it('storeMap equals common/utils.ts storeMap (undefined is null)', () => {
    for (const runner of runners) {
      expect({
        runner,
        store:
          runnerCapabilities.storeMap[
            runner as keyof typeof runnerCapabilities.storeMap
          ]
      }).toEqual({
        runner,
        store: storeMap[runner as keyof typeof storeMap] ?? null
      })
    }
  })

  it('umuStore equals the storeMapping const in wiki_game_info/umu/utils.ts', () => {
    expect(runnerCapabilities.umuStore).toEqual(umuStoreMapping())
  })
})
