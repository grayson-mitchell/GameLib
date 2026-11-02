/**
 * D-UAT-18 (quick 261102-4tf): the Steam client-setup surface is ONE shared
 * Dialog end to end. After the user consents (D-10), and straight away in the
 * launch-once case (D-11), the waiting state used to drop to a non-modal
 * bottom-right toast whose only button read "Done" but called `close()` -- which
 * by the 34.13 C-17 design stops the readiness poll and abandons the pending
 * install. The operator clicked it as an acknowledgement and the install never
 * continued.
 *
 * What these specs pin (W0-W6 here, L1-L5 for the live copy):
 *   - the waiting and error states render in the SAME Dialog root, with the
 *     same `steamClientSetupDialog` className, as the consent prompt;
 *   - the waiting dialog has exactly ONE button, "Cancel install", and that
 *     button, the Dialog's `onClose` (X / Escape / backdrop) all call `close()`;
 *   - C-17: after Cancel install a later 'ready' never dispatches
 *     `installSteamGame`; left open, a 'ready' recheck still auto-continues;
 *   - a failed start renders in the same Dialog with Try again + Cancel install.
 *
 * No jsdom is installed in this project (`src/frontend/jest.config.js`), so the
 * component is invoked as a plain function against a hand-rolled, deps-aware
 * hook harness (copied from `humbleExpiryToastSuppression.test.tsx`). The shared
 * Dialog barrel is mocked with sentinel components, as `AboutDialog.test.tsx`
 * does, so the assertions are about type identity of the root.
 */
import type { ReactElement, ReactNode } from 'react'

jest.mock('react-i18next', () => {
  const { makeFaithfulT } = jest.requireActual<
    typeof import('./faithfulTranslate')
  >('./faithfulTranslate')
  const faithful = makeFaithfulT('gamepage')
  return {
    useTranslation: () => ({
      t: (
        key: string,
        second?: string | { defaultValue?: string; [k: string]: unknown }
      ): string => {
        if (second !== null && typeof second === 'object') {
          return faithful(key, second.defaultValue).replace(
            /\{\{(\w+)\}\}/g,
            (_m, name: string) => String(second[name])
          )
        }
        return faithful(key, second)
      }
    })
  }
})

jest.mock('frontend/components/UI/Dialog', () => ({
  Dialog: function Dialog() {
    return null
  },
  DialogHeader: function DialogHeader() {
    return null
  },
  DialogContent: function DialogContent() {
    return null
  },
  DialogFooter: function DialogFooter() {
    return null
  }
}))

const mockClose = jest.fn()
const mockStore: {
  isOpen: boolean
  appName: string
  reason: 'install' | 'launch-once'
  close: () => void
} = {
  isOpen: true,
  appName: '333300',
  reason: 'install',
  close: mockClose
}

jest.mock('frontend/state/SteamClientSetup', () => ({
  useSteamClientSetup: () => mockStore
}))

const mockInstallSteamGame = jest.fn<Promise<void>, unknown[]>()

jest.mock('frontend/state/InstallGameModal', () => ({
  installSteamGame: (...args: unknown[]) => mockInstallSteamGame(...args),
  logSteamInstallDispatchFailure: () => () => undefined
}))

jest.mock('react', () => {
  const actualReact = jest.requireActual<typeof import('react')>('react')
  let stateSlots: unknown[] = []
  let stateCursor = 0
  let refSlots: { current: unknown }[] = []
  let refCursor = 0
  let effectDeps: (unknown[] | undefined)[] = []
  let effectCleanups: (void | (() => void))[] = []
  let effectCursor = 0

  const depsChanged = (
    prev: unknown[] | undefined,
    next: unknown[] | undefined
  ): boolean => {
    if (!prev || !next) return true
    if (prev.length !== next.length) return true
    return prev.some((d, i) => !Object.is(d, next[i]))
  }

  return {
    ...actualReact,
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
    useRef: (initial: unknown) => {
      const idx = refCursor++
      if (idx >= refSlots.length) {
        refSlots[idx] = { current: initial }
      }
      return refSlots[idx]
    },
    useEffect: (effect: () => void | (() => void), deps?: unknown[]) => {
      const idx = effectCursor++
      if (depsChanged(effectDeps[idx], deps)) {
        const priorCleanup = effectCleanups[idx]
        if (typeof priorCleanup === 'function') priorCleanup()
        effectDeps[idx] = deps
        effectCleanups[idx] = effect()
      }
    },
    __beginRender: () => {
      stateCursor = 0
      refCursor = 0
      effectCursor = 0
    },
    __resetMount: () => {
      // Run any live cleanup so a prior test's interval never leaks.
      effectCleanups.forEach((c) => {
        if (typeof c === 'function') c()
      })
      stateSlots = []
      stateCursor = 0
      refSlots = []
      refCursor = 0
      effectDeps = []
      effectCleanups = []
      effectCursor = 0
    }
  }
})

const mockGetGameInfo = jest.fn<Promise<unknown>, unknown[]>()
const mockRecheck = jest.fn<Promise<unknown>, unknown[]>()
const mockStart = jest.fn<Promise<unknown>, unknown[]>()
;(globalThis as unknown as { window: unknown }).window = {
  api: {
    getGameInfo: (...args: unknown[]) => mockGetGameInfo(...args),
    steamClientSetupRecheck: (...args: unknown[]) => mockRecheck(...args),
    steamClientSetupStart: (...args: unknown[]) => mockStart(...args)
  }
}

// Imported after the mocks above (textual order -- this project's ts-jest
// setup does not hoist jest.mock like babel-jest).
import SteamClientSetup from '../SteamClientSetup'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader
} from 'frontend/components/UI/Dialog'
import gamepage from '../../../../../../../public/locales/en/gamepage.json'

type AnyProps = Record<string, unknown> & { children?: ReactNode }
type AnyElement = ReactElement<AnyProps>

const catalog = gamepage.clientSetup
const CONSENT_TITLE = catalog.consent.title
const INSTALL_STEAM = catalog.consent.confirm
const NOT_NOW = catalog.consent.cancel
const TRY_AGAIN = catalog.retry
const INSTALLING = catalog.installing.message
const LAUNCH_ONCE = catalog.launchOnce.message
const WAITING_TITLE = 'Waiting for Steam'
const CANCEL_INSTALL = 'Cancel install'
const DIALOG_CLASS = 'steamClientSetupDialog'

const GAME_INFO = { app_name: '333300', title: 'A Steam Game' }

function collectElements(
  node: ReactNode,
  out: AnyElement[] = []
): AnyElement[] {
  if (node === null || node === undefined || typeof node === 'boolean') {
    return out
  }
  if (Array.isArray(node)) {
    node.forEach((child) => collectElements(child as ReactNode, out))
    return out
  }
  if (typeof node === 'object' && 'props' in node) {
    const el = node as AnyElement
    out.push(el)
    collectElements(el.props.children, out)
  }
  return out
}

function textOf(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') {
    return ''
  }
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node))
    return node.map((c) => textOf(c as ReactNode)).join('')
  if (typeof node === 'object' && 'props' in node) {
    return textOf((node as AnyElement).props.children)
  }
  return ''
}

type Tree = ReactElement | null

function elementsOf(tree: Tree, type: unknown): AnyElement[] {
  return collectElements(tree as ReactNode).filter((el) => el.type === type)
}

function headerText(tree: Tree): string {
  return textOf(elementsOf(tree, DialogHeader)[0]?.props.children)
}

function bodyText(tree: Tree): string {
  return textOf(elementsOf(tree, DialogContent)[0]?.props.children)
}

function buttons(tree: Tree): AnyElement[] {
  return collectElements(tree as ReactNode).filter((el) => el.type === 'button')
}

function buttonLabels(tree: Tree): string[] {
  return buttons(tree).map((b) => textOf(b.props.children))
}

function buttonNamed(tree: Tree, label: string): AnyElement {
  const found = buttons(tree).find((b) => textOf(b.props.children) === label)
  if (!found) throw new Error(`no button labelled "${label}"`)
  return found
}

function click(tree: Tree, label: string): void {
  const onClick = buttonNamed(tree, label).props.onClick as () => void
  onClick()
}

type HookHarness = { __beginRender: () => void; __resetMount: () => void }

function harness(): HookHarness {
  return jest.requireMock('react') as unknown as HookHarness
}

function mount(): Tree {
  harness().__resetMount()
  harness().__beginRender()
  return SteamClientSetup() as unknown as Tree
}

function reinvoke(): Tree {
  harness().__beginRender()
  return SteamClientSetup() as unknown as Tree
}

async function flush(): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve()
  }
}

function expectSharedDialogRoot(tree: Tree): void {
  expect(tree).not.toBeNull()
  expect((tree as ReactElement).type).toBe(Dialog)
  expect((tree as AnyElement).props.className).toBe(DIALOG_CLASS)
  expect((tree as AnyElement).props.showCloseButton).toBe(true)
}

/** Opens a launch-once session and returns the waiting-phase tree. */
async function openLaunchOnceWaiting(): Promise<Tree> {
  mockStore.reason = 'launch-once'
  mount()
  await flush()
  return reinvoke()
}

/** Opens an install session, consents, and returns the waiting-phase tree. */
async function openInstallWaiting(): Promise<Tree> {
  mockStore.reason = 'install'
  const consent = mount()
  await flush()
  click(consent, INSTALL_STEAM)
  await flush()
  return reinvoke()
}

describe('SteamClientSetup waiting dialog (D-UAT-18)', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    mockStore.isOpen = true
    mockStore.appName = '333300'
    mockStore.reason = 'install'
    mockClose.mockImplementation(() => {
      mockStore.isOpen = false
    })
    mockInstallSteamGame.mockResolvedValue(undefined)
    mockGetGameInfo.mockResolvedValue(GAME_INFO)
    mockRecheck.mockResolvedValue({
      status: 'needs-launch',
      ready: false
    })
    mockStart.mockResolvedValue({ status: 'started' })
  })

  afterEach(() => {
    harness().__resetMount()
    jest.useRealTimers()
  })

  it('W0 consent (install): shared Dialog root, consent header, Install Steam / Not now', async () => {
    const tree = mount()
    await flush()

    expectSharedDialogRoot(tree)
    expect(headerText(tree)).toBe(CONSENT_TITLE)
    expect(buttonLabels(tree)).toEqual([INSTALL_STEAM, NOT_NOW])
  })

  it('W1 launch-once: still the shared Dialog, "Waiting for Steam", one Cancel install button, no status region or Done', async () => {
    const tree = await openLaunchOnceWaiting()

    expectSharedDialogRoot(tree)
    expect(elementsOf(tree, DialogFooter)).toHaveLength(1)
    expect(headerText(tree)).toBe(WAITING_TITLE)
    expect(bodyText(tree)).toBe(LAUNCH_ONCE)
    expect(buttonLabels(tree)).toEqual([CANCEL_INSTALL])
    const all = collectElements(tree as ReactNode)
    expect(all.some((el) => el.props.role === 'status')).toBe(false)
    expect(all.some((el) => textOf(el.props.children) === 'Done')).toBe(false)
  })

  it('W2 consent to waiting: the same Dialog instance type, "Waiting for Steam", installer copy, only Cancel install', async () => {
    const tree = await openInstallWaiting()

    expectSharedDialogRoot(tree)
    expect(headerText(tree)).toBe(WAITING_TITLE)
    expect(bodyText(tree)).toBe(INSTALLING)
    expect(buttonLabels(tree)).toEqual([CANCEL_INSTALL])
  })

  it('W3a Cancel install calls the store close once', async () => {
    const tree = await openLaunchOnceWaiting()

    click(tree, CANCEL_INSTALL)

    expect(mockClose).toHaveBeenCalledTimes(1)
  })

  it('W3b the Dialog onClose (X / Escape / backdrop) calls the store close once, in the waiting phase', async () => {
    const tree = await openLaunchOnceWaiting()

    ;((tree as AnyElement).props.onClose as () => void)()

    expect(mockClose).toHaveBeenCalledTimes(1)
  })

  it('W4 C-17: after Cancel install the poll stops, so a later ready never dispatches installSteamGame', async () => {
    const tree = await openLaunchOnceWaiting()
    await flush()

    click(tree, CANCEL_INSTALL)
    const afterCancel = reinvoke()
    expect(afterCancel).toBeNull()
    await flush()
    const callsAtCancel = mockRecheck.mock.calls.length

    mockRecheck.mockResolvedValue({ status: 'ready', ready: true })
    jest.advanceTimersByTime(30000)
    await flush()

    expect(mockRecheck.mock.calls.length).toBe(callsAtCancel)
    expect(mockInstallSteamGame).not.toHaveBeenCalled()
  })

  it('W5 auto-continue: left open, a ready recheck dispatches installSteamGame once and closes', async () => {
    mockRecheck.mockResolvedValue({ status: 'ready', ready: true })

    await openLaunchOnceWaiting()
    await flush()

    expect(mockInstallSteamGame).toHaveBeenCalledTimes(1)
    expect(mockInstallSteamGame).toHaveBeenCalledWith('333300', GAME_INFO)
    expect(mockClose).toHaveBeenCalledTimes(1)
  })

  it('W6 error: same Dialog root, error body, Try again returns to consent, Cancel install closes', async () => {
    mockStart.mockResolvedValue({
      status: 'error',
      error: 'The Steam installer did not open.'
    })
    mockStore.reason = 'install'
    const consent = mount()
    await flush()
    click(consent, INSTALL_STEAM)
    await flush()
    const errored = reinvoke()

    expectSharedDialogRoot(errored)
    expect(bodyText(errored)).toBe(
      'Steam setup could not start: The Steam installer did not open.'
    )
    expect(buttonLabels(errored)).toEqual([TRY_AGAIN, CANCEL_INSTALL])

    click(errored, TRY_AGAIN)
    const back = reinvoke()
    expectSharedDialogRoot(back)
    expect(buttonLabels(back)).toContain(INSTALL_STEAM)

    click(errored, CANCEL_INSTALL)
    expect(mockClose).toHaveBeenCalledTimes(1)
  })

  it('W6b a REJECTED steamClientSetupStart also lands in the error dialog (C-19(a))', async () => {
    mockStart.mockRejectedValue(new Error('sidecar is gone'))
    mockStore.reason = 'install'
    const consent = mount()
    await flush()
    click(consent, INSTALL_STEAM)
    await flush()
    const errored = reinvoke()

    expectSharedDialogRoot(errored)
    expect(bodyText(errored)).toBe(
      'Steam setup could not start: sidecar is gone'
    )
    expect(buttonLabels(errored)).toEqual([TRY_AGAIN, CANCEL_INSTALL])
  })
  // ---- LD-3: the waiting copy follows the live recheck status -------------

  it('L1 install session: needs-install keeps the installer copy; a later needs-launch switches to launch-once, title and single button unchanged', async () => {
    mockRecheck.mockResolvedValue({ status: 'needs-install', ready: false })
    await openInstallWaiting()
    await flush()
    const installing = reinvoke()
    expect(bodyText(installing)).toBe(INSTALLING)

    mockRecheck.mockResolvedValue({ status: 'needs-launch', ready: false })
    jest.advanceTimersByTime(3000)
    await flush()
    const launch = reinvoke()

    expect(bodyText(launch)).toBe(LAUNCH_ONCE)
    expect(headerText(launch)).toBe(WAITING_TITLE)
    expect(buttonLabels(launch)).toEqual([CANCEL_INSTALL])
  })

  it('L2 the poll result wins over the opening reason: launch-once session + needs-install shows the installer copy', async () => {
    mockRecheck.mockResolvedValue({ status: 'needs-install', ready: false })
    await openLaunchOnceWaiting()
    await flush()

    expect(bodyText(reinvoke())).toBe(INSTALLING)
  })

  it('L3 a REJECTED recheck keeps the last known copy and the next tick polls again (C-19(b))', async () => {
    mockRecheck.mockResolvedValue({ status: 'needs-launch', ready: false })
    await openInstallWaiting()
    await flush()
    expect(bodyText(reinvoke())).toBe(LAUNCH_ONCE)
    const callsBefore = mockRecheck.mock.calls.length

    mockRecheck.mockRejectedValue(new Error('transport timeout'))
    jest.advanceTimersByTime(3000)
    await flush()

    expect(mockRecheck.mock.calls.length).toBe(callsBefore + 1)
    expect(bodyText(reinvoke())).toBe(LAUNCH_ONCE)
  })

  it('L4 a new session never inherits a status from the last one', async () => {
    mockRecheck.mockResolvedValue({ status: 'needs-launch', ready: false })
    const waiting = await openInstallWaiting()
    await flush()
    expect(bodyText(reinvoke())).toBe(LAUNCH_ONCE)

    click(waiting, CANCEL_INSTALL)
    expect(reinvoke()).toBeNull()
    await flush()

    // Reopen the same app as a fresh install session (the reset effect runs
    // on the first render, the consent phase is read on the second).
    mockStore.isOpen = true
    mockStore.reason = 'install'
    reinvoke()
    const consent = reinvoke()
    await flush()
    expect(buttonLabels(consent)).toContain(INSTALL_STEAM)

    click(consent, INSTALL_STEAM)
    await flush()
    const again = reinvoke()

    expect(headerText(again)).toBe(WAITING_TITLE)
    expect(bodyText(again)).toBe(INSTALLING)
  })

  it('L5 the store reason flipping install -> launch-once mid-wait still renders the waiting Dialog with launch-once copy', async () => {
    mockRecheck.mockResolvedValue({ status: 'needs-launch', ready: false })
    await openInstallWaiting()
    await flush()

    mockStore.reason = 'launch-once'
    reinvoke()
    const tree = reinvoke()

    expectSharedDialogRoot(tree)
    expect(headerText(tree)).toBe(WAITING_TITLE)
    expect(bodyText(tree)).toBe(LAUNCH_ONCE)
    expect(buttonLabels(tree)).toEqual([CANCEL_INSTALL])
  })
})
