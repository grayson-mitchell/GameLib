/**
 * 87-67 Task 1: the uninstall dialog offers a non-Steam game's OWN bottle.
 *
 * The rule the dialog applies is the same two-fact rule as the Rust op (87-66): the name comes from
 * `window.api.getPerGameBottleName({ runner, appName })` and it must equal the game's stored
 * `wineCrossoverBottle`. When it holds, the toggle is enabled even though the stored `winePrefix` is the
 * default prefix (every bottle-backed non-Steam game has that), is labelled with the bottle name, and
 * turning it on shows one amber risk warning. Confirming sends only the existing boolean (T-87-123).
 *
 * No jsdom here (see src/frontend/jest.config.js): the component is called as a plain function over a
 * useState/useEffect slot harness and its returned element graph is inspected, as AboutDialog.test.tsx does.
 */
import type { ReactElement, ReactNode } from 'react'

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

// Handles both call shapes the component uses: `t(key, 'default')` and `t(key, { defaultValue, ...vars })`.
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, second?: string | Record<string, unknown>) => {
      if (typeof second === 'string') return second
      const { defaultValue, ...vars } = second ?? {}
      return String(defaultValue ?? _key).replace(
        /\{\{(\w+)\}\}/g,
        (_m, name: string) => String(vars[name])
      )
    }
  })
}))

jest.mock('react-router-dom', () => ({
  useNavigate: () => jest.fn(),
  useLocation: () => ({ pathname: '/' })
}))

jest.mock('frontend/state/libraryState', () => ({
  __esModule: true,
  default: (selector: (s: unknown) => unknown) =>
    selector({ libraryStatus: [] }),
  selectInstallingEpicGame: () => false
}))

jest.mock('frontend/components/UI/Dialog', () => ({
  Dialog: function Dialog() {
    return null
  },
  DialogContent: function DialogContent() {
    return null
  },
  DialogFooter: function DialogFooter() {
    return null
  },
  DialogHeader: function DialogHeader() {
    return null
  }
}))

jest.mock('../../ToggleSwitch', () => ({
  __esModule: true,
  default: function ToggleSwitch() {
    return null
  }
}))

const api = {
  getGameInfo: jest.fn(),
  isNative: jest.fn(),
  getGameSettings: jest.fn(),
  requestGameSettings: jest.fn(),
  getPerGameBottleName: jest.fn(),
  getSteamDeleteRoute: jest.fn(),
  uninstall: jest.fn(),
  logError: jest.fn()
}
;(globalThis as unknown as { window: Record<string, unknown> }).window = {
  api,
  localStorage: { removeItem: jest.fn() }
}

import UninstallModal from '../index'

type AnyProps = Record<string, unknown> & { children?: ReactNode }
type AnyElement = ReactElement<AnyProps> & { props: AnyProps }

const DEFAULT_PREFIX = '/Users/me/Games/GameLib/Default'
const BOTTLE = 'GameLib-sideload-hades'

function collect(node: ReactNode, out: AnyElement[] = []): AnyElement[] {
  if (node === null || node === undefined || typeof node === 'boolean')
    return out
  if (Array.isArray(node)) {
    node.forEach((c) => collect(c as ReactNode, out))
    return out
  }
  if (typeof node === 'object' && 'type' in node) {
    const el = node as AnyElement
    out.push(el)
    if (el.props?.children !== undefined) collect(el.props.children, out)
  }
  return out
}

function render(props: { runner?: string; isDlc?: boolean } = {}): AnyElement {
  stateCursor = 0
  pendingEffects = []
  return UninstallModal({
    appName: 'hades',
    runner: (props.runner ?? 'sideload') as never,
    isDlc: props.isDlc ?? false,
    onClose: jest.fn()
  }) as unknown as AnyElement
}

async function mount(props: { runner?: string } = {}): Promise<AnyElement> {
  render(props)
  const effects = pendingEffects
  effects.forEach((effect) => effect())
  await new Promise((resolve) => setImmediate(resolve))
  return render(props)
}

const bottleToggle = (tree: AnyElement) =>
  collect(tree).find((el) => el.props.htmlId === 'uninstallCheckbox')
const withClass = (tree: AnyElement, cls: string) =>
  collect(tree).filter((el) => el.props.className === cls)

function givenGame(settings: {
  winePrefix: string
  wineCrossoverBottle?: string
}): void {
  api.getGameInfo.mockResolvedValue({
    title: 'Hades',
    install: { platform: 'windows' }
  })
  api.isNative.mockResolvedValue(false)
  api.getGameSettings.mockResolvedValue(settings)
  api.requestGameSettings.mockResolvedValue({ winePrefix: DEFAULT_PREFIX })
  api.getSteamDeleteRoute.mockResolvedValue({
    gamelibDelete: false,
    delegated: false
  })
  api.uninstall.mockResolvedValue(undefined)
}

describe('UninstallModal bottle toggle (87-67, F5 UI)', () => {
  beforeEach(() => {
    stateSlots = []
    stateCursor = 0
    pendingEffects = []
  })

  it('offers an enabled toggle labelled with the bottle name when the stored bottle matches, even on the default prefix', async () => {
    givenGame({ winePrefix: DEFAULT_PREFIX, wineCrossoverBottle: BOTTLE })
    api.getPerGameBottleName.mockResolvedValue(BOTTLE)

    const tree = await mount()

    expect(api.getPerGameBottleName).toHaveBeenCalledWith({
      runner: 'sideload',
      appName: 'hades'
    })
    const toggle = bottleToggle(tree)
    expect(toggle).toBeDefined()
    expect(toggle?.props.disabled).toBeFalsy()
    expect(String(toggle?.props.title)).toContain(BOTTLE)
    expect(String(toggle?.props.title)).toContain("Remove this game's bottle")
    expect(withClass(tree, 'default-wine-warning')).toHaveLength(0)
  })

  it('shows one amber risk warning while the toggle is on, and none while it is off', async () => {
    givenGame({ winePrefix: DEFAULT_PREFIX, wineCrossoverBottle: BOTTLE })
    api.getPerGameBottleName.mockResolvedValue(BOTTLE)

    let tree = await mount()
    expect(withClass(tree, 'uninstallModal__riskWarning')).toHaveLength(0)
    ;(bottleToggle(tree)?.props.handleChange as () => void)()
    tree = render()
    const warnings = withClass(tree, 'uninstallModal__riskWarning')
    expect(warnings).toHaveLength(1)
    expect(String(warnings[0]?.props.children)).toBe(
      "This can't be undone. Saves kept inside the bottle are deleted."
    )
    ;(bottleToggle(tree)?.props.handleChange as () => void)()
    tree = render()
    expect(withClass(tree, 'uninstallModal__riskWarning')).toHaveLength(0)
  })

  it('confirms with the existing boolean only: uninstall(appName, runner, true, settingsFlag), no path or name', async () => {
    givenGame({ winePrefix: DEFAULT_PREFIX, wineCrossoverBottle: BOTTLE })
    api.getPerGameBottleName.mockResolvedValue(BOTTLE)

    let tree = await mount()
    expect(bottleToggle(tree)?.props.disabled).toBeFalsy()
    ;(bottleToggle(tree)?.props.handleChange as () => void)()
    tree = render()
    const confirm = collect(tree).find(
      (el) => el.type === 'button' && el.props.onClick !== undefined
    )
    await (confirm?.props.onClick as () => Promise<void>)()

    expect(api.uninstall).toHaveBeenCalledTimes(1)
    expect(api.uninstall.mock.calls[0]).toEqual([
      'hades',
      'sideload',
      true,
      true
    ])
  })

  it("keeps today's disabled prefix toggle and neutral note when no per-game name exists", async () => {
    givenGame({ winePrefix: DEFAULT_PREFIX, wineCrossoverBottle: BOTTLE })
    api.getPerGameBottleName.mockResolvedValue(null)

    const tree = await mount()

    const toggle = bottleToggle(tree)
    expect(toggle?.props.disabled).toBe(true)
    expect(String(toggle?.props.title)).toContain('Remove prefix:')
    expect(String(toggle?.props.title)).not.toContain(BOTTLE)
    expect(withClass(tree, 'default-wine-warning')).toHaveLength(1)
  })

  it("keeps today's prefix branch when the stored bottle differs from the per-game name", async () => {
    givenGame({
      winePrefix: DEFAULT_PREFIX,
      wineCrossoverBottle: 'SomeoneElsesBottle'
    })
    api.getPerGameBottleName.mockResolvedValue(BOTTLE)

    const tree = await mount()

    expect(bottleToggle(tree)?.props.disabled).toBe(true)
    expect(String(bottleToggle(tree)?.props.title)).toContain('Remove prefix:')
    expect(withClass(tree, 'default-wine-warning')).toHaveLength(1)
    expect(withClass(tree, 'uninstallModal__riskWarning')).toHaveLength(0)
  })

  it('leaves an own (non-default) prefix toggle enabled with the prefix label when there is no bottle', async () => {
    givenGame({ winePrefix: '/Users/me/Prefixes/hades' })
    api.getPerGameBottleName.mockResolvedValue(null)

    const tree = await mount()

    expect(bottleToggle(tree)?.props.disabled).toBe(false)
    expect(String(bottleToggle(tree)?.props.title)).toContain(
      '/Users/me/Prefixes/hades'
    )
    expect(withClass(tree, 'default-wine-warning')).toHaveLength(0)
  })

  it("falls back to today's behaviour and logs once when getPerGameBottleName rejects", async () => {
    givenGame({ winePrefix: DEFAULT_PREFIX, wineCrossoverBottle: BOTTLE })
    api.getPerGameBottleName.mockRejectedValue(new Error('invalid args'))

    const tree = await mount()

    expect(bottleToggle(tree)?.props.disabled).toBe(true)
    expect(String(bottleToggle(tree)?.props.title)).toContain('Remove prefix:')
    expect(api.logError).toHaveBeenCalledTimes(1)
  })

  it('never asks for a bottle name for a Steam game', async () => {
    givenGame({ winePrefix: DEFAULT_PREFIX, wineCrossoverBottle: BOTTLE })
    api.getPerGameBottleName.mockResolvedValue(BOTTLE)

    const tree = await mount({ runner: 'steam' })

    expect(api.getPerGameBottleName).not.toHaveBeenCalled()
    expect(bottleToggle(tree)).toBeUndefined()
  })
})
