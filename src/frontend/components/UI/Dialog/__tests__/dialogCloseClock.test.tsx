/**
 * @jest-environment jsdom
 */
import 'frontend/testUtils/jsdomNoticeEnv'

import { act, cleanup, render } from '@testing-library/react'
import { Dialog } from '../components/Dialog'
import {
  STALE_CLICK_WINDOW_MS,
  msSinceDialogClose,
  resetDialogCloseClock
} from '../dialogCloseClock'
import { StoreEmbedSuppressionProvider } from 'frontend/components/UI/NavShell/StoreEmbedSuppressionContext'
import { resetAllStores } from 'frontend/state/storeKit'

/**
 * RF3 (debug session rf3-cancel-removes-shortcut): `Dialog` stamps the moment it
 * closes, so a switch row can ignore the stale second click of a double click on
 * the dialog's button. The stamp has to cover both ways a dialog goes: the
 * unmount (every `{show && <Dialog />}` consumer, which plays no exit
 * transition) and `open` turning false (the exit transition plays first).
 */

beforeEach(() => {
  resetDialogCloseClock()
  Object.assign(window, {
    api: {
      storeNew: () => undefined,
      storeGet: (_name: string, _key: string, dflt?: unknown) => dflt,
      storeSet: () => undefined,
      storeSetChecked: () => Promise.resolve(true),
      gamepadAction: () => Promise.resolve()
    }
  })
})

afterEach(() => {
  cleanup()
  resetAllStores()
})

const dialog = (open?: boolean) => (
  <StoreEmbedSuppressionProvider>
    <Dialog showCloseButton onClose={jest.fn()} open={open}>
      <p>body</p>
    </Dialog>
  </StoreEmbedSuppressionProvider>
)

describe('dialogCloseClock (RF3)', () => {
  it('has no close on record before any dialog has closed', () => {
    expect(msSinceDialogClose()).toBeNull()
  })

  it('an open dialog leaves no close on record', () => {
    render(dialog())
    expect(msSinceDialogClose()).toBeNull()
  })

  it('unmounting the dialog (the consumer closes it with `{show && <Dialog />}`) stamps the close', () => {
    const { unmount } = render(dialog())
    unmount()
    const since = msSinceDialogClose()
    expect(since).not.toBeNull()
    expect(since).toBeLessThan(STALE_CLICK_WINDOW_MS)
  })

  it('`open` turning false stamps the close while the dialog is still mounted (exit transition)', () => {
    const { rerender } = render(dialog(true))
    expect(msSinceDialogClose()).toBeNull()
    act(() => {
      rerender(dialog(false))
    })
    const since = msSinceDialogClose()
    expect(since).not.toBeNull()
    expect(since).toBeLessThan(STALE_CLICK_WINDOW_MS)
  })

  it('the later close wins: the window runs from the last stamp', async () => {
    const { rerender, unmount } = render(dialog(true))
    act(() => {
      rerender(dialog(false))
    })
    await act(() => new Promise((resolve) => setTimeout(resolve, 80)))
    const afterOpenFalse = msSinceDialogClose()
    expect(afterOpenFalse).toBeGreaterThanOrEqual(80)
    unmount()
    expect(msSinceDialogClose()).toBeLessThan(afterOpenFalse as number)
  })
})
