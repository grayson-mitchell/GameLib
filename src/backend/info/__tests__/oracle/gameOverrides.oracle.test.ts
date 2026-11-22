/**
 * The TS oracle for game_overrides (86-04, SC3 and D-11). `game_overrides/index.ts` has no test of
 * its own. Each case starts from a synthetic profile (`store/game-overrides.json` and a
 * `game_overrides_images/` folder), drives the exported functions, and records what each call
 * returned plus every file the profile holds afterwards. The Rust slice (86-10) has to reproduce
 * both, including the image cleanup that spares `app1x-1.png` when `app1` is cleared.
 *
 * Write the goldens with `GAMELIB_WRITE_INFO_GOLDEN=1`; without it this is a compare.
 */
import { existsSync, readdirSync } from 'fs'
import { join } from 'path'
import type { GameInfo } from 'common/types'
import { createGameOverridesStores } from 'backend/game_overrides/stores'
import type { GameMetadataOverride } from 'backend/game_overrides/stores'
import {
  attachOverrides,
  getAllGameOverrides,
  getGameOverrides,
  setGameOverrides
} from 'backend/game_overrides'
import { createStoreRegistry } from 'backend/stores/storeRegistry'
import {
  assertManifest,
  expectEmptyCasesToFail,
  loadCases,
  pinClock,
  snapshotFiles,
  stateDir,
  syncManifest,
  withOracleProfile,
  writeOrCompareGolden
} from './harness'

const SLICE = 'overrides'
/** The floor this test carries; the committed MANIFEST must be at or above it. */
const FLOOR = 9

type Op =
  | { op: 'get'; appName: string }
  | { op: 'getAll' }
  | { op: 'set'; appName: string; override: GameMetadataOverride }
  | { op: 'attach'; game: GameInfo }

interface OverridesCase {
  id: string
  note?: string
  ops: Op[]
}

const cases = loadCases<OverridesCase>(SLICE)

let restoreClock: () => void
beforeAll(() => {
  restoreClock = pinClock(Date.UTC(2026, 10, 22, 12, 0, 0))
})
afterAll(() => {
  restoreClock()
  syncManifest(SLICE, cases, FLOOR)
})

describe('game_overrides oracle', () => {
  it('has at least the floor of cases, and the manifest agrees', () => {
    assertManifest(SLICE, cases, FLOOR)
  })

  it('an empty case list fails the manifest guard', () => {
    expectEmptyCasesToFail(SLICE, FLOOR)
  })

  it.each(cases.map((c) => [c.id, c] as const))('%s', async (_id, c) => {
    const results = await withOracleProfile(
      ({ root, userData }) => {
        const deps = {
          stores: {
            gameOverrides: createGameOverridesStores({
              registry: createStoreRegistry(),
              root
            })
          },
          paths: { userData }
        }
        const out: unknown[] = []
        for (const op of c.ops) {
          if (op.op === 'get') out.push(getGameOverrides(deps, op.appName))
          else if (op.op === 'getAll') out.push(getAllGameOverrides(deps))
          else if (op.op === 'set') {
            out.push(setGameOverrides(deps, op.appName, op.override))
          } else out.push(attachOverrides(deps, op.game))
        }
        const imagesDir = join(userData, 'game_overrides_images')
        return {
          ops: out,
          images: existsSync(imagesDir) ? readdirSync(imagesDir).sort() : null,
          files: snapshotFiles(userData)
        }
      },
      stateDir(SLICE, c.id)
    )

    writeOrCompareGolden(SLICE, c.id, {
      result: { ops: results.ops, images: results.images },
      files: results.files
    })
  })
})
