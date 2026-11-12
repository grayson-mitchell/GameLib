/**
 * Instance state of the app-shell registration and the store-embed seam holder (66.4-16, D-05):
 * the tray colour timer runs on the injected clock, the wake-lock ids and one-shot guards belong
 * to one instance, and a second instance starts clean.
 */
import { createAppShellState } from '../appShellFlowRegistration'
import { createStoreEmbedSeam } from '../../store/storeEmbedSeam'
import { createFakeClock } from '../../testUtils/fakeClock'

describe('createAppShellState', () => {
  it('re-arming the tray colour timer keeps one clock timer; stop clears it', () => {
    const clock = createFakeClock()
    const state = createAppShellState({ clock })
    const fn = jest.fn()
    state.armTrayColorTimer(fn, 500)
    state.armTrayColorTimer(fn, 500)
    expect(clock.pendingCount()).toBe(1)
    clock.assertNoKeepAlive()
    clock.advance(500)
    expect(fn).toHaveBeenCalledTimes(1)

    state.armTrayColorTimer(fn, 500)
    state.stop()
    expect(clock.pendingCount()).toBe(0)
  })

  it('holds and releases the wake-lock ids per instance', () => {
    const a = createAppShellState({ clock: createFakeClock() })
    const b = createAppShellState({ clock: createFakeClock() })
    a.holdPower(7)
    a.holdDisplaySleep(9)
    expect(a.powerId).toBe(7)
    expect(a.displaySleepId).toBe(9)
    expect(b.powerId).toBeUndefined()
    expect(a.releasePower()).toBe(7)
    expect(a.releaseDisplaySleep()).toBe(9)
    expect(a.powerId).toBeUndefined()
    expect(a.displaySleepId).toBeUndefined()
  })

  it('claims the boot work and the preload warning once per instance', () => {
    const a = createAppShellState({ clock: createFakeClock() })
    expect(a.claimFrontendReadyBootWork()).toBe(true)
    expect(a.claimFrontendReadyBootWork()).toBe(false)
    expect(a.claimWebviewPreloadWarning()).toBe(true)
    expect(a.claimWebviewPreloadWarning()).toBe(false)
    const b = createAppShellState({ clock: createFakeClock() })
    expect(b.claimFrontendReadyBootWork()).toBe(true)
    expect(b.claimWebviewPreloadWarning()).toBe(true)
  })
})

describe('createStoreEmbedSeam', () => {
  it('is empty until set, and an instance never sees another instance seam', () => {
    const a = createStoreEmbedSeam()
    const b = createStoreEmbedSeam()
    const seam = {} as never
    expect(a.get()).toBeNull()
    a.set(seam)
    expect(a.get()).toBe(seam)
    expect(b.get()).toBeNull()
    a.set(null)
    expect(a.get()).toBeNull()
  })
})
