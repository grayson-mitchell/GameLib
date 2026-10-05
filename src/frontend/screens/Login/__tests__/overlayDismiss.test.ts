/**
 * A login overlay may only dismiss ITSELF, never whichever overlay happens to
 * be open when its late callback finally runs (todo 2026-10-05,
 * stale-steam-login-overlay-can-dismiss-the-currently-open-overlay).
 *
 * The defect: SteamLogin calls `dismiss()` after `steamStartCredentials` /
 * the QR and credential polls resolve -- even after its dialog was closed and
 * it unmounted (unmount clears the intervals, not a callback already awaiting
 * IPC). `dismissLoginOverlay` was not bound to the overlay that called it, so
 * a Steam call returning `done` while a Humble sign-in was up cleared
 * `openOverlay` (the screen stopped being inert) and, 500ms later, unmounted
 * HumbleLogin -- whose cleanup calls `humbleStopLogin()` and cancels the
 * user's Humble sign-in.
 *
 * Behavioural cases exercise the pure binder; ONE source gate pins that both
 * overlay call sites in `Login/index.tsx` actually go through it with their
 * own mount key -- the binder's tests alone cannot see a call site that
 * reverts to passing `dismissLoginOverlay` unbound. Same split, and same
 * no-DOM reason, as `SteamLogin/__tests__/steamCreateAccountLink.test.tsx`.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'
import { bindOverlayDismiss } from '../overlayDismiss'

describe('bindOverlayDismiss', () => {
  it('dismisses when the caller is still the current overlay', () => {
    const currentKey = { current: 1 }
    const dismiss = jest.fn()
    bindOverlayDismiss(1, currentKey, dismiss)()
    expect(dismiss).toHaveBeenCalledTimes(1)
  })

  it('ignores a dismiss from an overlay that has since been replaced (Steam -> Humble)', () => {
    const currentKey = { current: 1 }
    const dismiss = jest.fn()
    const staleSteam = bindOverlayDismiss(1, currentKey, dismiss)
    // Steam dialog closed, Humble opened: the mount key moved on.
    currentKey.current = 2
    staleSteam()
    expect(dismiss).not.toHaveBeenCalled()
    // ...and the overlay that IS current can still dismiss itself.
    bindOverlayDismiss(2, currentKey, dismiss)()
    expect(dismiss).toHaveBeenCalledTimes(1)
  })

  it('reads the key at call time, not at bind time', () => {
    // A binder that snapshotted `currentKey.current` when it was created would
    // pass the first case and still let every stale overlay through.
    const currentKey = { current: 1 }
    const dismiss = jest.fn()
    const bound = bindOverlayDismiss(1, currentKey, dismiss)
    currentKey.current = 3
    bound()
    expect(dismiss).not.toHaveBeenCalled()
  })
})

describe('Login/index.tsx wires every overlay through the key-bound dismiss', () => {
  const source = stripSourceComments(
    readFileSync(join(__dirname, '..', 'index.tsx'), 'utf8')
  )

  it('SOURCE GATE -- SteamLogin and HumbleLogin each receive a dismiss bound to their own overlayMountKey, never the bare dismissLoginOverlay', () => {
    for (const overlay of ['SteamLogin', 'HumbleLogin']) {
      const tag = new RegExp(`<${overlay}\\b[^>]*>`).exec(source)?.[0]
      expect(tag).toBeDefined()
      expect(tag).toMatch(
        /dismiss=\{bindOverlayDismiss\(\s*overlayMountKey,\s*overlayMountKeyRef,\s*dismissLoginOverlay\s*\)\}/
      )
    }
    expect(source).not.toMatch(/dismiss=\{dismissLoginOverlay\}/)
  })

  it('SOURCE GATE -- openLoginOverlay advances the ref the binder compares against', () => {
    const at = source.indexOf('function openLoginOverlay(')
    expect(at).toBeGreaterThan(-1)
    const body = source.slice(at, source.indexOf('\n  }\n', at))
    expect(body).toMatch(/overlayMountKeyRef\.current\s*(\+=\s*1|\+\+)/)
  })
})
