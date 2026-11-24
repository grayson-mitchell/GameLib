/**
 * Quick task 260905-mv5 (site 3) -- the premise re-verification behind the `shortcutsExists` fallback.
 *
 * Phase 94 Plan 11 moved the `shortcutsExists` handler out of TypeScript: it is the scheduled resolver
 * `resolveShortcutsExists` (`sidecar/shortcutsResolvers.ts`), answered by Rust. The handler's own cases (no
 * title resolves `false` without a lookup, a populated title reads the disk, a dangling Desktop link counts as
 * present on macOS) moved with it: `gamelib-shortcuts`' `golden_paths.rs` replays them against the TypeScript's
 * recorded answers (`golden/exists`, the `no-title` and `empty-title` cases among them), and
 * `sidecar/__tests__/shortcutsResolvers.test.ts` pins that a title-less game reaches Rust with no title.
 *
 * What stays here is the evidence the 260905-mv5 D-03 design rests on, about code that is still TypeScript
 * (`shortcutFiles`, `addShortcuts`): an undefined title throws in `sanitize-filename`, an empty one returns a
 * real path pair, and `addShortcuts` rejects on the `{}` sentinel before it reaches `shortcutFiles`.
 */

jest.mock('backend/dialog/dialog', () => ({
  notify: jest
    .requireActual('backend/testUtils/propsOnlyMock')
    .propsOnly(jest.fn())
}))
jest.mock('backend/constants/environment', () => ({
  ...jest.requireActual('backend/constants/environment'),
  isMac: false
}))
jest.mock('../nonesteamgame/nonesteamgame', () => ({
  addNonSteamGame: jest.fn(),
  isAddedToSteam: jest.fn(),
  removeNonSteamGame: jest.fn()
}))
jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  logError: jest.fn(),
  LogPrefix: { Backend: 'Backend' }
}))
jest.mock('graceful-fs', () => ({
  ...jest.requireActual('graceful-fs'),
  existsSync: jest.fn()
}))

import { shortcutFiles, addShortcuts } from '../shortcuts/shortcuts'
import { createContainedHomeAppPaths } from 'backend/testUtils/testAppPaths'
import type { GameInfo } from 'common/types'
import type { Game } from 'common/types/game_manager'

const deps = {
  libraryManagers: { gog: {} },
  paths: createContainedHomeAppPaths()
} as unknown as Parameters<typeof addShortcuts>[0]

/** Pins `process.platform` for one case. These cases assert the host-platform (linux) arm CI runs;
 * on a win32 host `shortcutFiles`/`getPath` no longer guess a Desktop/Documents folder (quick
 * 261111-aq4). Restore the returned value in `finally`. */
function overrideProcessPlatform(os: string): string {
  const original = process.platform
  Object.defineProperty(process, 'platform', { value: os, configurable: true })
  return original
}

function makeStubGame(gameInfo: GameInfo): Game {
  return {
    getGameInfo: () => gameInfo
  } as unknown as Game
}

/**
 * Re-verification of the plan's evidence item 5 (the corrected premises
 * D-03 rests on). Task 1's action step requires re-measuring these three
 * facts before trusting D-03's design; if any of these disagrees with the
 * plan's recorded measurement, execution must STOP and report rather than
 * silently picking a different fallback. All three are confirmed below to
 * match the plan's recorded values exactly.
 */
describe('260905-mv5 Task 1: premise re-verification (plan evidence item 5)', () => {
  it('shortcutFiles(undefined) THROWS (matches plan measurement)', () => {
    expect(() => shortcutFiles(deps, undefined as unknown as string)).toThrow(
      'Input must be string'
    )
  })

  it("shortcutFiles('') RETURNS a real non-empty path pair, it does not throw (matches plan measurement)", () => {
    // Pinned to linux, CI's own arm: on a win32 host the Desktop path needs a registry folder
    // (261111-aq4).
    const originalPlatform = overrideProcessPlatform('linux')
    let desktopFile, menuFile
    try {
      ;[desktopFile, menuFile] = shortcutFiles(deps, '')
    } finally {
      overrideProcessPlatform(originalPlatform)
    }
    expect(desktopFile).toBeTruthy()
    expect(menuFile).toBeTruthy()
    // shortcutFiles switches on process.platform (not the isMac mock above, which is irrelevant
    // here). Every platform returns a distinct pair: linux <desktop>/<name>.desktop vs
    // ~/.local/share/applications/<name>.desktop (the pair the 2026-09-15 Linux CI log's diff
    // printed, quick-260921-o95), and since 261026-clh darwin returns ~/Desktop/<name>.app vs
    // ~/Applications/<name>.app.
    expect(desktopFile).not.toEqual(menuFile)
  })

  it('addShortcuts({} as GameInfo) THROWS (rejects) at is_dlc, before ever reaching shortcutFiles (matches plan measurement)', async () => {
    // addShortcuts is async — the is_dlc property-access throw inside its
    // body surfaces as a promise rejection, not a synchronous throw.
    const game = makeStubGame({} as GameInfo)
    await expect(addShortcuts(deps, game)).rejects.toThrow()
  })
})
