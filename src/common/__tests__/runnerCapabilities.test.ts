/**
 * Drift test for `src/common/runnerCapabilities.json` (Phase 86, 86-19, D-24).
 *
 * The Rust `gamelib-info` crate reads this one file (`runner_caps.rs`, `include_str!`) for what it
 * needs to know about a runner: whether its `app_name` is a Steam appId, whether it has a store
 * catalog, which store name the wiki lookups use, and which store name umu's API takes. The TS sources
 * of those facts stay where they are until their callers move, so this test proves the JSON equals
 * each of them: `common/storeCapabilities.ts` and `common/utils.ts` `storeMap`. The umu store names had
 * a third TS source, the `storeMapping` const in `wiki_game_info/umu/utils.ts`, deleted in 86-24 with the
 * TS wiki: the JSON is now their only source and the Rust golden umu cases pin the names it yields.
 * A new runner, or a changed flag or name on either side, fails here before the two sides disagree.
 */
import { storeMap } from '../utils'
import { storeCapabilities } from '../storeCapabilities'
import runnerCapabilities from '../runnerCapabilities.json'

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
})
