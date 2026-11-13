/**
 * Behavioural + source-gate proof for DotsMenu's click-toggled disclosure
 * (quick 261114-1fi, sketch 008 variant A-prime, D-05).
 *
 * No jsdom / react-test-renderer is installed (see `src/frontend/jest.config.js`),
 * so DotsMenu is invoked as a plain function against a hand-rolled hook
 * harness (the `Dropdown/__tests__/dropdownDisclosure.test.tsx` pattern) and
 * the returned element graph is inspected without a DOM. The `react-jsx`
 * runtime means an element's `ref` lives at `element.ref`, not in `props`.
 *
 * A fake global `document` records the listeners DotsMenu registers while the
 * menu is open, so Escape, outside-click and unmount cleanup can be driven and
 * asserted directly.
 *
 * MainButton is deliberately never imported or named here:
 * `labelSuiteI18nCensus.test.ts` enrols suites in this directory that render it.
 *
 * The CSS gate at the bottom proves only what the SOURCE says. That the popover
 * actually drops upward and is not clipped is an operator check (Task 3).
 */
import type { ReactElement, ReactNode } from 'react'
import { readFileSync } from 'fs'
import { join } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'

jest.mock('react', () => {
  const actualReact = jest.requireActual<typeof import('react')>('react')
  let stateSlots: unknown[] = []
  let stateCursor = 0
  let refSlots: { current: unknown }[] = []
  let refCursor = 0
  let effectDeps: (unknown[] | undefined)[] = []
  let effectCleanups: (void | (() => void))[] = []
  let effectCursor = 0
  let contextValue: unknown = {}

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
      if (idx >= refSlots.length) refSlots[idx] = { current: initial }
      return refSlots[idx]
    },
    useContext: () => contextValue,
    useEffect: (effect: () => void | (() => void), deps?: unknown[]) => {
      const idx = effectCursor++
      if (depsChanged(effectDeps[idx], deps)) {
        const priorCleanup = effectCleanups[idx]
        if (typeof priorCleanup === 'function') priorCleanup()
        effectDeps[idx] = deps
        effectCleanups[idx] = effect()
      }
    },
    __setContextValue: (value: unknown) => {
      contextValue = value
    },
    __beginRender: () => {
      stateCursor = 0
      refCursor = 0
      effectCursor = 0
    },
    __resetMount: () => {
      stateSlots = []
      stateCursor = 0
      refSlots = []
      refCursor = 0
      effectDeps = []
      effectCleanups = []
      effectCursor = 0
    },
    __unmount: () => {
      for (const cleanup of effectCleanups) {
        if (typeof cleanup === 'function') cleanup()
      }
      effectCleanups = []
    }
  }
})

// Plain functions, not jest.fn(): this project sets `resetMocks: true`, which
// would wipe a jest.fn implementation before each test.
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string): string => key })
}))
jest.mock('@fortawesome/react-fontawesome', () => ({
  FontAwesomeIcon: () => null
}))
jest.mock('../../../GameSubMenu', () => ({
  __esModule: true,
  default: function MockGameSubMenu() {
    return null
  }
}))
jest.mock('frontend/components/UI/Dialog', () => ({
  Dialog: () => null,
  DialogHeader: () => null,
  DialogContent: () => null
}))
jest.mock('../../../GameRequirements', () => ({
  __esModule: true,
  default: () => null
}))
jest.mock('../../../GameChangeLog', () => ({
  __esModule: true,
  default: () => null
}))
jest.mock('../../../ModifyInstallModal', () => ({
  __esModule: true,
  default: () => null
}))

// Imported after the mocks above (textual order -- this project's ts-jest
// setup does not hoist jest.mock like babel-jest).
import DotsMenu from '../DotsMenu'
import GameSubMenuMock from '../../../GameSubMenu'
import { at } from 'frontend/components/__tests__/fixtures/indexed'
import type { GameInfo } from 'common/types'

type HookHarness = {
  __beginRender: () => void
  __resetMount: () => void
  __setContextValue: (value: unknown) => void
  __unmount: () => void
}

function harness(): HookHarness {
  return jest.requireMock('react') as unknown as HookHarness
}

type AnyProps = Record<string, unknown> & { children?: ReactNode }
type AnyElement = ReactElement<AnyProps> & {
  props: AnyProps
  ref?: { current: unknown }
}

type Listener = (event: unknown) => void
let added: { type: string; fn: Listener }[] = []
let removed: { type: string; fn: Listener }[] = []

const handleUpdate = () => undefined
const gameInfo = {
  app_name: 'app1',
  runner: 'legendary',
  title: 'Game',
  is_installed: true
} as unknown as GameInfo

function root(tree: AnyElement): AnyElement {
  return at(
    (Array.isArray(tree.props.children)
      ? tree.props.children
      : [tree.props.children]) as AnyElement[],
    0
  )
}

function toggle(tree: AnyElement): AnyElement {
  return at(root(tree).props.children as AnyElement[], 0)
}

function subMenu(tree: AnyElement): AnyElement {
  return at(root(tree).props.children as AnyElement[], 1)
}

function render(): AnyElement {
  harness().__beginRender()
  return DotsMenu({ gameInfo, handleUpdate }) as unknown as AnyElement
}

/**
 * Mounts, renders, and wires fake DOM nodes into the refs the way React would.
 * Returns the fakes so a test can assert on them.
 */
function mountWithRefs(): {
  tree: AnyElement
  focus: jest.Mock
  contains: jest.Mock
} {
  harness().__resetMount()
  const tree = render()
  const focus = jest.fn()
  const contains = jest.fn(() => false)
  const toggleRef = toggle(tree).ref
  const rootRef = root(tree).ref
  if (!toggleRef || !rootRef) throw new Error('toggle/root carry no ref')
  toggleRef.current = { focus }
  rootRef.current = { contains }
  return { tree, focus, contains }
}

function clickToggle(tree: AnyElement): void {
  ;(toggle(tree).props.onClick as () => void)()
}

function openMenu(): ReturnType<typeof mountWithRefs> & { open: AnyElement } {
  const mounted = mountWithRefs()
  clickToggle(mounted.tree)
  const open = render()
  return { ...mounted, open }
}

function lastAdded(type: string): Listener {
  const hit = [...added].reverse().find((l) => l.type === type)
  if (!hit) throw new Error(`no ${type} listener registered`)
  return hit.fn
}

beforeEach(() => {
  added = []
  removed = []
  ;(globalThis as unknown as { document: unknown }).document = {
    addEventListener: (type: string, fn: Listener) => added.push({ type, fn }),
    removeEventListener: (type: string, fn: Listener) =>
      removed.push({ type, fn })
  }
  harness().__setContextValue({
    appName: 'app1',
    gameExtraInfo: null,
    gameInstallInfo: null,
    is: { installing: false, updating: false }
  })
})

afterAll(() => {
  delete (globalThis as unknown as { document?: unknown }).document
})

describe('DotsMenu disclosure behaviour', () => {
  it('B1: the toggle is a closed, labelled menu button with no hover or focus-reveal handlers', () => {
    const { tree } = mountWithRefs()
    const t = toggle(tree)

    expect(t.props.type).toBe('button')
    expect(t.props['aria-haspopup']).toBe('menu')
    expect(t.props['aria-expanded']).toBe(false)
    expect(t.props['aria-label']).toBe('gamelib:gamepage.moreActions')
    expect(String(root(tree).props.className)).not.toContain('is-open')
    for (const el of [root(tree), t]) {
      expect(el.props.onMouseEnter).toBeUndefined()
      expect(el.props.onMouseLeave).toBeUndefined()
      expect(el.props.onFocus).toBeUndefined()
    }
  })

  it('B2: a click opens it -- aria-expanded, the is-open class, and document click + keydown listeners', () => {
    const { open } = openMenu()

    expect(toggle(open).props['aria-expanded']).toBe(true)
    expect(String(root(open).props.className)).toContain('is-open')
    expect(added.map((l) => l.type).sort()).toEqual(['click', 'keydown'])
  })

  it('B3: Escape closes it and refocuses the toggle; any other key does nothing', () => {
    const { focus } = openMenu()

    lastAdded('keydown')({ key: 'ArrowDown' })
    expect(toggle(render()).props['aria-expanded']).toBe(true)
    expect(focus).not.toHaveBeenCalled()

    lastAdded('keydown')({ key: 'Escape' })
    expect(toggle(render()).props['aria-expanded']).toBe(false)
    expect(focus).toHaveBeenCalledTimes(1)
  })

  it('B4: a document click closes it only when it lands outside the root', () => {
    const { contains } = openMenu()

    contains.mockReturnValue(true)
    lastAdded('click')({ target: {} })
    expect(toggle(render()).props['aria-expanded']).toBe(true)

    contains.mockReturnValue(false)
    lastAdded('click')({ target: {} })
    expect(toggle(render()).props['aria-expanded']).toBe(false)
  })

  it('B5: a second toggle click closes it', () => {
    const { open } = openMenu()

    clickToggle(open)

    expect(toggle(render()).props['aria-expanded']).toBe(false)
  })

  describe('B6: item activation', () => {
    const itemClick = (contained: boolean, inItem = true) => ({
      currentTarget: { contains: () => contained },
      target: {
        closest: (selector: string) =>
          selector === '.gameTools' || inItem ? {} : null
      }
    })

    it('a click on a menu item closes it and refocuses the toggle', () => {
      const { open, focus } = openMenu()

      ;(root(open).props.onClick as (e: unknown) => void)(itemClick(true))

      expect(toggle(render()).props['aria-expanded']).toBe(false)
      expect(focus).toHaveBeenCalledTimes(1)
    })

    it('a click on non-interactive space inside the popover leaves it open', () => {
      const { open, focus } = openMenu()

      ;(root(open).props.onClick as (e: unknown) => void)({
        currentTarget: { contains: () => true },
        target: { closest: (s: string) => (s === '.gameTools' ? {} : null) }
      })

      expect(toggle(render()).props['aria-expanded']).toBe(true)
      expect(focus).not.toHaveBeenCalled()
    })

    it('a click React bubbled up from the portaled UninstallModal (not contained in the DOM) leaves it open and steals no focus', () => {
      const { open, focus } = openMenu()

      ;(root(open).props.onClick as (e: unknown) => void)(itemClick(false))

      expect(toggle(render()).props['aria-expanded']).toBe(true)
      expect(focus).not.toHaveBeenCalled()
    })
  })

  it('B7: every listener added on open is removed, with the same function references, on close and on unmount', () => {
    const { open } = openMenu()
    const registered = [...added]

    clickToggle(open)
    render()

    expect(removed).toHaveLength(2)
    for (const l of registered) {
      expect(removed).toContainEqual({ type: l.type, fn: l.fn })
    }

    added = []
    removed = []
    const reopened = mountWithRefs()
    clickToggle(reopened.tree)
    render()
    const second = [...added]
    harness().__unmount()

    expect(removed).toHaveLength(2)
    for (const l of second) {
      expect(removed).toContainEqual({ type: l.type, fn: l.fn })
    }
  })

  it('B8: GameSubMenu stays mounted with the same handleUpdate while closed and open', () => {
    const { tree, open } = openMenu()

    for (const t of [tree, open]) {
      expect(subMenu(t).type).toBe(GameSubMenuMock)
      expect(subMenu(t).props.handleUpdate).toBe(handleUpdate)
    }
  })
})

describe('en catalog (B9)', () => {
  it('gamepage.moreActions is "More actions"', () => {
    const raw = readFileSync(
      join(__dirname, '../../../../../../../public/locales/en/gamelib.json'),
      'utf8'
    )
    const catalog = JSON.parse(raw) as {
      gamepage: Record<string, unknown>
    }

    expect(catalog.gamepage.moreActions).toBe('More actions')
  })
})

describe('GamePage/index.css menu rules (source gate)', () => {
  function readCss(): string {
    return stripSourceComments(
      readFileSync(join(__dirname, '../../index.css'), 'utf8')
    )
  }

  // Brace-counted body of the first rule whose selector text matches exactly.
  function block(source: string, selector: string): string {
    const start = source.indexOf(`${selector} {`)
    if (start === -1) throw new Error(`selector ${selector} not found`)
    const open = source.indexOf('{', start)
    let depth = 0
    for (let i = open; i < source.length; i++) {
      if (source[i] === '{') depth++
      if (source[i] === '}') {
        depth--
        if (depth === 0) return source.slice(open + 1, i)
      }
    }
    throw new Error(`unterminated block for ${selector}`)
  }

  it('no selector reveals .gameTools from :hover or :focus-within on .game-actions', () => {
    const css = readCss()

    expect(css).not.toMatch(/&:(hover|focus-within)\s+\.gameTools/)
    expect(css).not.toMatch(
      /\.game-actions[^{}]*:(hover|focus-within)[^{}]*\.gameTools/
    )
  })

  it('an .is-open .gameTools rule exists and sets display', () => {
    expect(block(readCss(), '&.is-open .gameTools')).toMatch(/display:\s*block/)
  })

  it('the base .gameTools block is hidden by default, anchored with bottom:, and still has exactly one background-color', () => {
    const body = block(readCss(), '.gameTools')

    expect(body).toMatch(/display:\s*none/)
    expect(body).toMatch(/bottom:\s*calc\(100%/)
    expect(body.match(/background-color:/g) ?? []).toHaveLength(1)
  })
})
