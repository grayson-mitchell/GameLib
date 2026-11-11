/**
 * quick 261112-90h: the pure decision behind the game-page Steam Uninstall.
 * No jsdom (see repairFailure.test.ts): a plain function call, no rendering.
 */
import {
  CLOSED_STEAM_DELETE_ROUTE,
  steamUninstallNeedsConfirm
} from '../steamUninstallConfirm'

describe('steamUninstallNeedsConfirm', () => {
  it('a delegated route skips the modal (Steam confirms, D-05)', () => {
    expect(
      steamUninstallNeedsConfirm({ gamelibDelete: false, delegated: true })
    ).toBe(false)
  })

  it('a GameLib-delete route confirms', () => {
    expect(
      steamUninstallNeedsConfirm({ gamelibDelete: true, delegated: false })
    ).toBe(true)
  })

  it('bridge/bottle/unadopted routes (neither flag) confirm', () => {
    expect(
      steamUninstallNeedsConfirm({ gamelibDelete: false, delegated: false })
    ).toBe(true)
  })

  it.each([undefined, null, {}, { delegated: 'yes' }, 'delegated', 1])(
    'unsure input %j fails closed',
    (route) => {
      expect(steamUninstallNeedsConfirm(route)).toBe(true)
    }
  )

  it('a contradictory reply fails closed', () => {
    expect(
      steamUninstallNeedsConfirm({ gamelibDelete: true, delegated: true })
    ).toBe(true)
  })

  it('the closed fallback confirms', () => {
    expect(steamUninstallNeedsConfirm(CLOSED_STEAM_DELETE_ROUTE)).toBe(true)
  })
})
