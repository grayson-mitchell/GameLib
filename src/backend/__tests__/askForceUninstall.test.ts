/**
 * Quick task 260905-mv5 (site 1) — regression test for the force-uninstall
 * confirmation dialog (`backend/utils.ts`'s `askForceUninstall`).
 *
 * `askForceUninstall` re-reads `game.getGameInfo()` itself, exactly like the
 * install-failure surfaces 260905-luf already fixed. Steam's `getGameInfo()`
 * can return `{} as GameInfo` on a double cache miss (D-01, kept as the
 * cross-runner sentinel, not relitigated here) — this suite pins that the
 * DESTRUCTIVE-CONFIRMATION dialog this function shows never renders a
 * nameless subject in that case.
 *
 * Drives the REAL `askForceUninstall`, imported un-mocked from `backend/utils`
 * (confirmed importable this way by 260905-mv5-PLAN.md evidence item 9 and by
 * the existing `utils.test.ts`, which already imports the same module's
 * default export un-mocked with this identical mock set).
 */

jest.mock('backend/platform')
jest.mock('../logger')
jest.mock('../dialog/dialog')
jest.mock('../config')

import { dialog } from 'backend/platform'
import { askForceUninstall } from '../utils'
import type { Game } from 'common/types/game_manager'
import type { GameInfo } from 'common/types'

const mockedShowMessageBox = dialog.showMessageBox as jest.Mock

/** A minimal stub `Game` whose `getGameInfo()` is fully controllable, and
 * whose `forceUninstall()` is a no-op jest.fn() (never reached — every test
 * here resolves the dialog with `response: 0`, the "No" / decline branch,
 * per the D-07 fail-safe `cancelId: 0` this function sets). */
function makeStubGame(gameInfo: GameInfo): Game {
  return {
    getGameInfo: () => gameInfo,
    forceUninstall: jest.fn().mockResolvedValue(undefined)
  } as unknown as Game
}

describe('backend/utils.ts: askForceUninstall (260905-mv5, site 1)', () => {
  beforeEach(() => {
    mockedShowMessageBox.mockReset().mockResolvedValue({ response: 0 })
  })

  it('260905-mv5: never shows a nameless force-uninstall confirmation dialog, even when getGameInfo() returns {} (D-01 sentinel)', async () => {
    const game = makeStubGame({} as GameInfo)

    // 260905-mv5 (D-02/D-03, site 1): askForceUninstall was widened to take
    // appName as a second parameter -- resolveTitleForGame needs it as the
    // fallback when getGameInfo().title is absent.
    await askForceUninstall(game, 'Some Game AppName')

    expect(mockedShowMessageBox).toHaveBeenCalledTimes(1)
    const dialogOptions = mockedShowMessageBox.mock.calls[0][0]
    expect(dialogOptions.title).toBeTruthy()
  })

  // No-regression: the fallback must never shadow a real, present title.
  // `appName` below is deliberately a value that would never plausibly be
  // mistaken for the live title, so this assertion is defeated by a
  // PRECEDENCE-SWAP revert (`appName || live` instead of `live || appName`
  // inside gameTitle.ts's pickTitle) -- verified by hand: swapping that one
  // line's operand order turns this test RED (dialog title becomes
  // 'fallback-appname-must-not-win', not 'Real Live Title'), confirming the
  // assertion discriminates the axis under test rather than merely
  // reflecting "some string was passed as the title" (a bare-destructure/
  // removal revert would not distinguish the two, per 260905-luf's own
  // RED-proof ledger entries #7/#11).
  it('260905-mv5 (no regression): shows the LIVE title when getGameInfo() has one, never appName', async () => {
    const game = makeStubGame({ title: 'Real Live Title' } as GameInfo)

    await askForceUninstall(game, 'fallback-appname-must-not-win')

    expect(mockedShowMessageBox).toHaveBeenCalledTimes(1)
    const dialogOptions = mockedShowMessageBox.mock.calls[0][0]
    expect(dialogOptions.title).toBe('Real Live Title')
  })
})
