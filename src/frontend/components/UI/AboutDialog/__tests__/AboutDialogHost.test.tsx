/**
 * `AboutDialogHost` (quick `260905-d33`) — the app-level listener that turns
 * `SHOW_ABOUT_DIALOG_EVENT` into a mounted `AboutDialog`.
 *
 * No jsdom in this project (see `src/frontend/jest.config.js`), so the component
 * is invoked directly and its effect is run by hand, following the slot-harness
 * pattern in `HeroicVersion.test.tsx`.
 */
import type { ReactElement, ReactNode } from 'react'

type AnyProps = Record<string, unknown> & { children?: ReactNode }

let stateSlots: unknown[] = []
let stateCursor = 0
let pendingEffects: (() => void | (() => void))[] = []

jest.mock('react', () => ({
  ...jest.requireActual<typeof import('react')>('react'),
  useState: (initial: unknown) => {
    const idx = stateCursor++
    if (idx >= stateSlots.length) {
      stateSlots[idx] =
        typeof initial === 'function' ? (initial as () => unknown)() : initial
    }
    const setState = (updater: unknown) => {
      stateSlots[idx] =
        typeof updater === 'function'
          ? (updater as (prev: unknown) => unknown)(stateSlots[idx])
          : updater
    }
    return [stateSlots[idx], setState]
  },
  useEffect: (effect: () => void | (() => void)) => {
    pendingEffects.push(effect)
  }
}))

jest.mock('../index', () => ({
  __esModule: true,
  default: function AboutDialog() {
    return null
  }
}))

import { SHOW_ABOUT_DIALOG_EVENT } from 'common/aboutDialogEvent'
import AboutDialogHost from '../AboutDialogHost'
import AboutDialog from '../index'

// Minimal EventTarget stand-in: the 'node' testEnvironment has no `window`.
function installWindow(): void {
  const target = new EventTarget()
  ;(globalThis as unknown as { window: unknown }).window = {
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
    dispatchEvent: target.dispatchEvent.bind(target)
  }
}

function render(): ReactElement<AnyProps> | null {
  stateCursor = 0
  return AboutDialogHost() as unknown as ReactElement<AnyProps> | null
}

/** Runs the effects the last render queued, returning their cleanups. */
function runEffects(): (void | (() => void))[] {
  const effects = pendingEffects
  pendingEffects = []
  return effects.map((effect) => effect())
}

function fireShowAbout(): void {
  ;(window as unknown as EventTarget).dispatchEvent(
    new Event(SHOW_ABOUT_DIALOG_EVENT)
  )
}

describe('AboutDialogHost', () => {
  beforeEach(() => {
    stateSlots = []
    stateCursor = 0
    pendingEffects = []
    installWindow()
  })

  it('renders nothing until the event fires -- the dialog is unmounted, not hidden', () => {
    // Load-bearing: an always-mounted dialog would fire getHeroicVersion() on
    // every app start, and the Dialog primitive has no closed-but-mounted state.
    expect(render()).toBeNull()

    runEffects()

    expect(render()).toBeNull()
  })

  it('mounts AboutDialog when SHOW_ABOUT_DIALOG_EVENT fires', () => {
    // This is the TRAY path. The macOS tray item reaches About by evaluating
    // `window.api?.showAboutWindow?.()` from Rust, which dispatches this event.
    // That eval is optional-chained, so a break here is silent on both sides --
    // which is exactly how converting About to a modal broke the tray once
    // already, mid-task, before this test existed.
    render()
    runEffects()

    fireShowAbout()

    const tree = render()
    expect(tree).not.toBeNull()
    expect(tree?.type).toBe(AboutDialog)
  })

  it('unmounts again when the dialog calls onClose', () => {
    render()
    runEffects()
    fireShowAbout()

    const tree = render()
    ;(tree?.props.onClose as () => void)()

    expect(render()).toBeNull()
  })

  it('removes its listener on cleanup, so a later event cannot resurrect it', () => {
    render()
    const [cleanup] = runEffects()

    expect(typeof cleanup).toBe('function')
    ;(cleanup as () => void)()

    fireShowAbout()

    expect(render()).toBeNull()
  })
})
