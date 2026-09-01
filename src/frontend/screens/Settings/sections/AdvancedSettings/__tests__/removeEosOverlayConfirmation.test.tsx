/**
 * Phase 35 gap closure, plan 35-26 (REQ-35-17, closes D-35-11-01), Task 2.
 *
 * Proves the EOS overlay Remove flow is gated by an app-styled `showDialogModal` confirmation,
 * not a bare `onClick={removeEosOverlay}` that calls the destructive channel directly:
 *   (a) clicking Remove raises `showDialogModal` and calls window.api.removeEosOverlay ZERO
 *       times;
 *   (b) the confirmation dialog's AFFIRMATIVE button calls window.api.removeEosOverlay exactly
 *       once, with the literal `true` the backend's fail-closed gate (plan 35-26 Task 1)
 *       requires;
 *   (c) the confirmation dialog's NEGATIVE button carries no `onClick` handler at all -- asserted
 *       on the constructed dialog options object captured from the `showDialogModal` mock, not by
 *       reading source text (that's `EosDeclineCallSiteGuard.test.ts`'s job);
 *   (d) a `callOrDeclare` decline (the sidecar channel rejecting) still resolves to
 *       `setEosOverlayUnavailable(true)`, and does NOT flip `eosOverlayInstalled` to claim the
 *       overlay was removed when it wasn't.
 *
 * `AdvancedSettings/index.tsx` cannot be imported UNMODIFIED-BARREL under this project's
 * `node`-environment Frontend jest project: its `'../../components'` barrel import transitively
 * pulls in `.scss` files (no jsdom/react-test-renderer, no scss moduleNameMapper -- see
 * `src/frontend/jest.config.js`'s header, and `EosDeclineCallSiteGuard.test.ts`'s docstring, which
 * works around this by never importing the component at all). This file takes the OTHER
 * documented workaround instead: mock the two component-barrel imports (`../../../components`,
 * `../../../components/DisableGOGPresence`) with inert stand-ins, so none of their real,
 * scss-laden subtrees are ever resolved -- the component under test never renders them (they are
 * unrelated settings rows), so a stand-in changes nothing this file asserts on.
 *
 * `useState` is mocked with a slot/cursor harness (mirrors `logoutFailureSurface.test.tsx`), with
 * one addition this component needs that Runner did not: `__seedSlots()`, to force
 * `eosOverlayInstalled = true` (slot index 1) before mounting, since the Remove button only
 * renders when the overlay is reported installed and this component's own probing `useEffect`s
 * are mocked to no-ops (nothing real reaches `window.api.getEosOverlayStatus()` here).
 */
import type { ReactElement, ReactNode } from 'react'

const mockShowDialogModal = jest.fn()
const mockRemoveEosOverlay = jest.fn()
const mockLogError = jest.fn()

// `window.api` stubbed at `globalThis` -- this project's `testEnvironment: 'node'` jest config
// provides no `window` global otherwise (mirrors `logoutFailureSurface.test.tsx`'s convention).
// Only channels this file's assertions actually reach need a real mock; every `useEffect` below
// is a no-op, so the two "unconditional EOS probe" fetches never run.
;(
  globalThis as unknown as {
    window: {
      api: {
        removeEosOverlay: typeof mockRemoveEosOverlay
        logError: typeof mockLogError
      }
    }
  }
).window = {
  api: { removeEosOverlay: mockRemoveEosOverlay, logError: mockLogError }
}

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, defaultValue?: string): string => defaultValue ?? _key
  })
}))

jest.mock('../../../SettingsContext', () => ({
  __esModule: true,
  default: { __name: 'SettingsContext' }
}))

jest.mock('frontend/state/ContextProvider', () => ({
  __esModule: true,
  default: { __name: 'ContextProvider' }
}))

// Inert stand-ins -- see the module header. None of these render in this test (they are
// unrelated settings rows the component just happens to also mount), so a stub component
// changes nothing this file asserts on; it exists purely to stop their real, scss-laden
// subtrees from ever being resolved.
jest.mock('../../../components', () => ({
  AllowInstallationBrokenAnticheat: () => null,
  ShowValveProton: () => null,
  AltGOGdlBin: () => null,
  AltLegendaryBin: () => null,
  AltNileBin: () => null,
  ClearCache: () => null,
  CustomCSS: () => null,
  DisableLogs: () => null,
  DownloadNoHTTPS: () => null,
  ExperimentalFeatures: () => null,
  HideWindowOnProtocolLaunch: () => null,
  ResetHeroic: () => null,
  GamePadDelayRepeat: () => null,
  SteamGridDbApiKey: () => null
}))

jest.mock('../../../components/DisableGOGPresence', () => ({
  __esModule: true,
  default: () => null
}))

jest.mock('react', () => {
  const actualReact = jest.requireActual<typeof import('react')>('react')
  const UNSET = Symbol('unset')
  let slots: unknown[] = []
  let cursor = 0

  function ensureLength(n: number) {
    while (slots.length <= n) slots.push(UNSET)
  }

  return {
    ...actualReact,
    useState: (initial: unknown) => {
      const idx = cursor++
      ensureLength(idx)
      if (slots[idx] === UNSET) {
        slots[idx] =
          typeof initial === 'function' ? (initial as () => unknown)() : initial
      }
      const setState = (updater: unknown) => {
        slots[idx] =
          typeof updater === 'function'
            ? (updater as (prev: unknown) => unknown)(slots[idx])
            : updater
      }
      return [slots[idx], setState]
    },
    useContext: (ctx: { __name?: string }) => {
      if (ctx?.__name === 'SettingsContext') return { config: {} }
      if (ctx?.__name === 'ContextProvider') {
        return {
          libraryStatus: [],
          platform: 'linux',
          showDialogModal: mockShowDialogModal
        }
      }
      return undefined
    },
    // All 5 of this component's useEffects are no-ops here -- none of them are under test in
    // this file (they only populate state this file seeds directly via __seedSlots).
    useEffect: () => {},
    __resetMount: () => {
      slots = []
      cursor = 0
    },
    __seedSlots: (overrides: Record<number, unknown>) => {
      for (const [key, value] of Object.entries(overrides)) {
        const idx = Number(key)
        ensureLength(idx)
        slots[idx] = value
      }
    },
    __getSlots: () => slots
  }
})

// Imported after the mocks above (textual order, not hoisting -- ts-jest does not hoist
// jest.mock; see logoutFailureSurface.test.tsx / index.test.tsx for the same convention).
import AdvancedSetting from '../index'

type HookHarness = {
  __resetMount: () => void
  __seedSlots: (overrides: Record<number, unknown>) => void
  __getSlots: () => unknown[]
}

function harness(): HookHarness {
  return jest.requireMock('react') as unknown as HookHarness
}

// Slot 1 is `eosOverlayInstalled` -- forced true so the Remove button (only rendered when the
// overlay is reported installed) is reachable without needing the real (mocked-to-no-op)
// fetch-driven useEffects to run.
const EOS_OVERLAY_INSTALLED_SLOT = 1
const EOS_OVERLAY_UNAVAILABLE_SLOT = 7

function mount(slotOverrides: Record<number, unknown> = {}): ReactElement {
  const h = harness()
  h.__resetMount()
  h.__seedSlots(slotOverrides)
  return AdvancedSetting() as unknown as ReactElement
}

function collectElements(
  node: ReactNode,
  out: ReactElement<Record<string, unknown>>[] = []
): ReactElement<Record<string, unknown>>[] {
  if (node === null || node === undefined || typeof node === 'boolean') {
    return out
  }
  if (Array.isArray(node)) {
    node.forEach((child) => collectElements(child as ReactNode, out))
    return out
  }
  if (typeof node === 'object' && 'type' in node) {
    const element = node as ReactElement<Record<string, unknown>>
    out.push(element)
    if (element.props?.children !== undefined) {
      collectElements(element.props.children as ReactNode, out)
    }
    return out
  }
  return out
}

function flattenText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') {
    return ''
  }
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node)
  }
  if (Array.isArray(node)) {
    return node.map((child) => flattenText(child as ReactNode)).join('')
  }
  if (typeof node === 'object' && 'props' in node) {
    const element = node as ReactElement<{ children?: ReactNode }>
    return flattenText(element.props?.children)
  }
  return ''
}

function findButtonByText(
  tree: ReactNode,
  text: string
): ReactElement<Record<string, unknown>> | undefined {
  return collectElements(tree).find(
    (el) =>
      el.type === 'button' &&
      flattenText(el.props.children as ReactNode).includes(text)
  )
}

interface CapturedDialogOptions {
  title: string
  message: string
  buttons: { text: string; onClick?: () => void | Promise<void> }[]
  type: string
}

describe('AdvancedSettings: EOS overlay Remove confirmation (Phase 35 plan 26, REQ-35-17)', () => {
  beforeEach(() => {
    mockShowDialogModal.mockClear()
    mockRemoveEosOverlay.mockClear()
    mockLogError.mockClear()
    mockRemoveEosOverlay.mockResolvedValue(true)
  })

  it('(a) clicking Remove raises showDialogModal and does NOT call window.api.removeEosOverlay', () => {
    const tree = mount({ [EOS_OVERLAY_INSTALLED_SLOT]: true })
    const removeButton = findButtonByText(tree, 'Uninstall')
    expect(removeButton).toBeDefined()
    ;(removeButton!.props as unknown as { onClick: () => void }).onClick()

    expect(mockShowDialogModal).toHaveBeenCalledTimes(1)
    expect(mockRemoveEosOverlay).not.toHaveBeenCalled()
  })

  it('the raised dialog uses the same removeConfirm keys the backend used to own, with type MESSAGE', () => {
    const tree = mount({ [EOS_OVERLAY_INSTALLED_SLOT]: true })
    const removeButton = findButtonByText(tree, 'Uninstall')!

    ;(removeButton.props as unknown as { onClick: () => void }).onClick()

    const options = mockShowDialogModal.mock
      .calls[0][0] as CapturedDialogOptions
    expect(options.type).toBe('MESSAGE')
    expect(options.title).toBe('Confirm overlay removal')
    expect(options.message).toBe(
      'Are you sure you want to uninstall the EOS Overlay?'
    )
    expect(options.buttons).toHaveLength(2)
  })

  it('(b) the affirmative button calls window.api.removeEosOverlay exactly once, with the literal true', async () => {
    const tree = mount({ [EOS_OVERLAY_INSTALLED_SLOT]: true })
    const removeButton = findButtonByText(tree, 'Uninstall')!
    ;(removeButton.props as unknown as { onClick: () => void }).onClick()

    const options = mockShowDialogModal.mock
      .calls[0][0] as CapturedDialogOptions
    await options.buttons[0].onClick!()

    expect(mockRemoveEosOverlay).toHaveBeenCalledTimes(1)
    expect(mockRemoveEosOverlay).toHaveBeenCalledWith(true)
  })

  it('(c) the negative button carries NO onClick handler at all', () => {
    const tree = mount({ [EOS_OVERLAY_INSTALLED_SLOT]: true })
    const removeButton = findButtonByText(tree, 'Uninstall')!
    ;(removeButton.props as unknown as { onClick: () => void }).onClick()

    const options = mockShowDialogModal.mock
      .calls[0][0] as CapturedDialogOptions
    // `t('box.no')` passes no default value in the real component, so this file's `t` mock
    // (`defaultValue ?? key`) resolves it to the raw key -- not asserting a display string here
    // on purpose, only that a SECOND, distinct button exists with no handler.
    expect(options.buttons[1].text).toBe('box.no')
    expect(options.buttons[1].onClick).toBeUndefined()
  })

  it('(d) a callOrDeclare decline resolves setEosOverlayUnavailable(true) and does not claim the overlay was removed', async () => {
    mockRemoveEosOverlay.mockRejectedValue(
      new Error('sidecar channel declined')
    )
    const tree = mount({ [EOS_OVERLAY_INSTALLED_SLOT]: true })
    const removeButton = findButtonByText(tree, 'Uninstall')!
    ;(removeButton.props as unknown as { onClick: () => void }).onClick()

    const options = mockShowDialogModal.mock
      .calls[0][0] as CapturedDialogOptions
    await options.buttons[0].onClick!()

    const slots = harness().__getSlots()
    expect(slots[EOS_OVERLAY_UNAVAILABLE_SLOT]).toBe(true)
    // Still reported installed -- a decline must never look like a successful removal.
    expect(slots[EOS_OVERLAY_INSTALLED_SLOT]).toBe(true)
  })
})
