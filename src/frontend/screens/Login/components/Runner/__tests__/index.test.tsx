/**
 * Unit tests for Runner's `primaryLoginAction` prop (F-34.5-G6-01, 2026-08-03).
 *
 * No jsdom / react-test-renderer / jest-environment-jsdom is installed in this project (see
 * src/frontend/jest.config.js docstring) -- following this project's established pattern
 * (HumbleClaimWizard/index.test.tsx, StoreSearchRow.test.tsx), 'react'/'react-i18next'/
 * 'react-router-dom' are mocked at the module level so `Runner` can be invoked directly as a
 * plain function and its returned React-element object graph (and click handlers) inspected
 * without a DOM.
 *
 * Scope: this file proves that `primaryLoginAction`, when provided, makes the primary tile
 * invoke that action instead of `navigate(loginUrl)` (Epic under Tauri routes it to SIDLogin),
 * WITHOUT suppressing the secondary "Alternative Login Method" tile -- so the embedded WebKit
 * login stays reachable as the alternative for continued 403 experimentation. It also proves
 * every runner that OMITS the prop (the other 5 runners) is completely unaffected: the primary
 * tile navigates to `loginUrl` exactly as before.
 */
import type { ReactElement, ReactNode } from 'react'

jest.mock('../index.css', () => ({}))

const mockNavigate = jest.fn()

jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate
}))

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, defaultValue: string): string => defaultValue
  })
}))

jest.mock('react', () => {
  const actualReact = jest.requireActual<typeof import('react')>('react')
  let slots: unknown[] = []
  let cursor = 0

  return {
    ...actualReact,
    useState: (initial: unknown) => {
      const idx = cursor++
      if (idx >= slots.length) {
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
    // Phase 35 gap closure, plan 35-22 (CR-04 renderer half): Runner now also calls
    // `useContext(ContextProvider)` for `showDialogModal`. This file's scope is the
    // login/logout navigation surface, not the failure-dialog path (that is
    // `logoutFailureSurface.test.tsx`), so a no-op stub is sufficient here -- it exists
    // only so calling the real dispatcher-less `useContext` outside a real render does
    // not throw.
    useContext: () => ({ showDialogModal: jest.fn() }),
    __resetMount: () => {
      slots = []
      cursor = 0
    }
  }
})

// Imported after the mocks above (textual order, not hoisting -- this project's ts-jest setup
// does not hoist jest.mock like babel-jest; see HumbleOriginInfo.test.tsx for the same
// convention) so the component transitively requires the mocked
// 'react'/'react-i18next'/'react-router-dom'.
import Runner from '../index'

type HookHarness = { __resetMount: () => void }

function harness(): HookHarness {
  return jest.requireMock('react') as unknown as HookHarness
}

type PropsWithChildren = { children?: ReactNode; className?: string }

function collectElements(
  node: ReactNode,
  out: ReactElement<PropsWithChildren>[] = []
): ReactElement<PropsWithChildren>[] {
  if (node === null || node === undefined || typeof node === 'boolean') {
    return out
  }
  if (Array.isArray(node)) {
    node.forEach((child) => collectElements(child as ReactNode, out))
    return out
  }
  if (typeof node === 'object' && 'type' in node) {
    const element = node as ReactElement<PropsWithChildren>
    out.push(element)
    if (element.props?.children !== undefined) {
      collectElements(element.props.children, out)
    }
    return out
  }
  return out
}

function findByClassNamePart(
  tree: ReactNode,
  part: string
): ReactElement<PropsWithChildren & Record<string, unknown>> | undefined {
  return collectElements(tree).find((el) => {
    const className = el.props?.className
    return typeof className === 'string' && className.split(' ').includes(part)
  }) as ReactElement<PropsWithChildren & Record<string, unknown>> | undefined
}

function findAltTile(tree: ReactNode) {
  return collectElements(tree).find((el) => {
    const className = el.props?.className
    return typeof className === 'string' && className.includes('alternative')
  })
}

function makeProps(overrides: Record<string, unknown> = {}) {
  return {
    class: 'epic',
    buttonText: 'Epic Games Login',
    loginUrl: '/loginweb/legendary',
    icon: () => 'icon',
    isLoggedIn: false,
    logoutAction: jest.fn(),
    disabled: false,
    ...overrides
  }
}

function mount(props: ReturnType<typeof makeProps>): ReactElement {
  harness().__resetMount()
  return Runner(props) as unknown as ReactElement
}

describe('Runner: default behavior (primaryLoginAction omitted -- the other 5 runners)', () => {
  afterEach(() => {
    mockNavigate.mockClear()
  })

  it('navigates to loginUrl on primary click when primaryLoginAction is not set', () => {
    const tree = mount(makeProps())
    const primary = findByClassNamePart(tree, 'runnerLogin')!
    ;(primary.props as unknown as { onClick: () => void }).onClick()

    expect(mockNavigate).toHaveBeenCalledWith('/loginweb/legendary')
  })

  it('renders the secondary "alternative" tile when alternativeLoginAction is set', () => {
    const alternativeLoginAction = jest.fn()
    const tree = mount(makeProps({ alternativeLoginAction }))

    expect(findAltTile(tree)).toBeDefined()
  })

  it('a runner with no alternativeLoginAction and no primaryLoginAction behaves exactly as before (GOG/Amazon/Zoom/Steam/Humble shape)', () => {
    const tree = mount(makeProps({ class: 'gog', buttonText: 'GOG Login' }))
    const primary = findByClassNamePart(tree, 'runnerLogin')!
    ;(primary.props as unknown as { onClick: () => void }).onClick()

    expect(mockNavigate).toHaveBeenCalledWith('/loginweb/legendary')
    expect(findAltTile(tree)).toBeUndefined()
  })
})

describe('Runner: primaryLoginAction set (Epic under Tauri, F-34.5-G6-01)', () => {
  afterEach(() => {
    mockNavigate.mockClear()
  })

  it('primary tile click invokes primaryLoginAction instead of navigating to loginUrl', () => {
    const primaryLoginAction = jest.fn()
    const tree = mount(makeProps({ primaryLoginAction }))
    const primary = findByClassNamePart(tree, 'runnerLogin')!
    ;(primary.props as unknown as { onClick: () => void }).onClick()

    expect(primaryLoginAction).toHaveBeenCalledTimes(1)
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('STILL renders the "Alternative Login Method" tile -- the embedded login stays reachable', () => {
    const primaryLoginAction = jest.fn()
    const alternativeLoginAction = jest.fn()
    const tree = mount(
      makeProps({ primaryLoginAction, alternativeLoginAction })
    )

    expect(findAltTile(tree)).toBeDefined()
  })

  it('the alternative tile invokes alternativeLoginAction on click (the embedded navigation)', () => {
    const primaryLoginAction = jest.fn()
    const alternativeLoginAction = jest.fn()
    const tree = mount(
      makeProps({ primaryLoginAction, alternativeLoginAction })
    )
    const altTile = findByClassNamePart(tree, 'alternative')!
    // The clickable alternative button is the descendant carrying the onClick handler.
    const clickable = collectElements(tree).find((el) => {
      const className = el.props?.className
      return (
        typeof className === 'string' &&
        className.split(' ').includes('alternative') &&
        typeof (el.props as Record<string, unknown>).onClick === 'function'
      )
    })!
    ;(clickable.props as unknown as { onClick: () => void }).onClick()

    expect(alternativeLoginAction).toHaveBeenCalledTimes(1)
    expect(altTile).toBeDefined()
  })

  it('disabled still short-circuits before primaryLoginAction is ever considered', () => {
    const primaryLoginAction = jest.fn()
    const tree = mount(makeProps({ primaryLoginAction, disabled: true }))
    const primary = findByClassNamePart(tree, 'runnerLogin')!
    ;(primary.props as unknown as { onClick: () => void }).onClick()

    expect(primaryLoginAction).not.toHaveBeenCalled()
    expect(mockNavigate).not.toHaveBeenCalled()
  })
})

function hasDeprecatedClass(el: ReactElement<PropsWithChildren>) {
  const className = el.props?.className
  return (
    typeof className === 'string' && className.split(' ').includes('deprecated')
  )
}

function anyDeprecated(tree: ReactNode) {
  return collectElements(tree).some(hasDeprecatedClass)
}

function findClickablePrimary(tree: ReactNode) {
  return collectElements(tree).find((el) => {
    const className = el.props?.className
    return (
      typeof className === 'string' &&
      className.split(' ').includes('runnerLogin') &&
      !className.split(' ').includes('alternative') &&
      !className.split(' ').includes('logged') &&
      typeof (el.props as Record<string, unknown>).onClick === 'function'
    )
  })
}

function findClickableAlternative(tree: ReactNode) {
  return collectElements(tree).find((el) => {
    const className = el.props?.className
    return (
      typeof className === 'string' &&
      className.split(' ').includes('alternative') &&
      typeof (el.props as Record<string, unknown>).onClick === 'function'
    )
  })
}

describe('Runner: deprecatedTile marker (quick task 260805-d62)', () => {
  afterEach(() => {
    mockNavigate.mockClear()
  })

  it("deprecatedTile: 'alternative' marks only the alternative tile's clickable div", () => {
    const alternativeLoginAction = jest.fn()
    const tree = mount(
      makeProps({ alternativeLoginAction, deprecatedTile: 'alternative' })
    )

    const primary = findClickablePrimary(tree)!
    const alternative = findClickableAlternative(tree)!

    expect(hasDeprecatedClass(primary)).toBe(false)
    expect(hasDeprecatedClass(alternative)).toBe(true)
  })

  it("deprecatedTile: 'primary' marks only the primary tile's clickable div", () => {
    const primaryLoginAction = jest.fn()
    const alternativeLoginAction = jest.fn()
    const tree = mount(
      makeProps({
        primaryLoginAction,
        alternativeLoginAction,
        deprecatedTile: 'primary'
      })
    )

    const primary = findClickablePrimary(tree)!
    const alternative = findClickableAlternative(tree)!

    expect(hasDeprecatedClass(primary)).toBe(true)
    expect(hasDeprecatedClass(alternative)).toBe(false)
  })

  it('deprecatedTile omitted (the GOG/Amazon/Zoom/Steam/Humble shape) renders zero deprecated classes', () => {
    const tree = mount(makeProps({ class: 'gog', buttonText: 'GOG Login' }))

    expect(anyDeprecated(tree)).toBe(false)
  })

  it('deprecatedTile: primary + isLoggedIn: true renders no deprecated class -- the logout tile is not a login entry point', () => {
    const tree = mount(
      makeProps({ deprecatedTile: 'primary', isLoggedIn: true })
    )

    expect(anyDeprecated(tree)).toBe(false)
  })

  it('clicking a marked primary tile invokes exactly the same action as an unmarked one', () => {
    const primaryLoginAction = jest.fn()
    const tree = mount(
      makeProps({ primaryLoginAction, deprecatedTile: 'primary' })
    )
    const primary = findClickablePrimary(tree)!
    ;(primary.props as unknown as { onClick: () => void }).onClick()

    expect(primaryLoginAction).toHaveBeenCalledTimes(1)
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('clicking a marked primary tile with no primaryLoginAction still navigates to loginUrl, unchanged', () => {
    const tree = mount(makeProps({ deprecatedTile: 'primary' }))
    const primary = findClickablePrimary(tree)!
    ;(primary.props as unknown as { onClick: () => void }).onClick()

    expect(mockNavigate).toHaveBeenCalledWith('/loginweb/legendary')
  })

  it('clicking a marked alternative tile invokes exactly the same action as an unmarked one', () => {
    const alternativeLoginAction = jest.fn()
    const tree = mount(
      makeProps({ alternativeLoginAction, deprecatedTile: 'alternative' })
    )
    const alternative = findClickableAlternative(tree)!
    ;(alternative.props as unknown as { onClick: () => void }).onClick()

    expect(alternativeLoginAction).toHaveBeenCalledTimes(1)
  })

  it('the marked tile carries a non-empty title attribute; the unmarked tile carries none', () => {
    const alternativeLoginAction = jest.fn()
    const tree = mount(
      makeProps({ alternativeLoginAction, deprecatedTile: 'alternative' })
    )

    const primary = findClickablePrimary(tree)!
    const alternative = findClickableAlternative(tree)!

    expect((primary.props as unknown as { title?: string }).title).toBeFalsy()
    expect(
      (alternative.props as unknown as { title?: string }).title
    ).toBeTruthy()
  })
})

function collectTextContent(node: ReactNode, out: string[] = []): string[] {
  if (node === null || node === undefined || typeof node === 'boolean') {
    return out
  }
  if (typeof node === 'string' || typeof node === 'number') {
    out.push(String(node))
    return out
  }
  if (Array.isArray(node)) {
    node.forEach((child) => collectTextContent(child as ReactNode, out))
    return out
  }
  if (typeof node === 'object' && 'type' in node) {
    const element = node as ReactElement<PropsWithChildren>
    if (element.props?.children !== undefined) {
      collectTextContent(element.props.children, out)
    }
    return out
  }
  return out
}

describe('Runner: connected-state label (quick 260815-kt0)', () => {
  it('logged in: an element with className including runnerConnected renders text "Connected"', () => {
    const tree = mount(makeProps({ isLoggedIn: true }))
    const connected = findByClassNamePart(tree, 'runnerConnected')!

    expect(connected).toBeDefined()
    expect(collectTextContent(connected.props.children).join('')).toBe(
      'Connected'
    )
  })

  it('logged in with an identity value passed through the soon-to-be-removed user slot: no element renders that identity anywhere in the tree', () => {
    const tree = mount(makeProps({ isLoggedIn: true, user: 'Someone' }))
    const allText = collectTextContent(tree).join('')

    expect(allText).not.toContain('Someone')
  })

  it('logged in: the runnerConnected element is a descendant of an element whose className includes userData', () => {
    const tree = mount(makeProps({ isLoggedIn: true }))
    const userDataContainer = findByClassNamePart(tree, 'userData')!
    const nestedConnected = collectElements(
      userDataContainer.props.children
    ).find((el) => {
      const className = el.props?.className
      return (
        typeof className === 'string' &&
        className.split(' ').includes('runnerConnected')
      )
    })

    expect(userDataContainer).toBeDefined()
    expect(nestedConnected).toBeDefined()
  })

  it('logged out: zero elements with className including runnerConnected or userData', () => {
    const tree = mount(makeProps({ isLoggedIn: false }))

    expect(findByClassNamePart(tree, 'runnerConnected')).toBeUndefined()
    expect(findByClassNamePart(tree, 'userData')).toBeUndefined()
  })

  it('source text (localisation gate): index.tsx contains the gamelib:login.connected key and no bare JSX text node ">Connected<"', () => {
    const fs = jest.requireActual<typeof import('fs')>('fs')
    const path = jest.requireActual<typeof import('path')>('path')
    const source = fs.readFileSync(
      path.join(__dirname, '../index.tsx'),
      'utf-8'
    )
    const stripped = source
      .split('\n')
      .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
      .join('\n')

    expect(stripped).toContain('gamelib:login.connected')
    expect(stripped).not.toMatch(/>Connected</)
  })
})

/**
 * Quick task 261003-u48: the `busy` prop (D-3/D-4). These are REAL element-tree
 * assertions against the object graph `Runner(props)` returns -- this file's
 * module-level mocks let it be invoked directly without a DOM -- not source
 * greps. What they still cannot see: no CSS cascade (the `busy`/`.runnerLogin`
 * modifier rule and the `@keyframes` are never applied here), no pixels, and no
 * animation clock -- whether the ring actually rotates is exactly what the
 * plan's macOS `<human-check>` live gate exists to answer; this suite cannot.
 */
function findBusySpinners(tree: ReactNode) {
  return collectElements(tree).filter((el) => {
    const className = (el.props as Record<string, unknown> | undefined)
      ?.className
    return (
      typeof className === 'string' &&
      className.split(' ').includes('runnerBusySpinner')
    )
  })
}

describe('Runner: busy prop (quick task 261003-u48, D-3/D-4)', () => {
  afterEach(() => {
    mockNavigate.mockClear()
  })

  it('busy: true, isLoggedIn: false -- exactly one element in the tree carries the spinner class as a whitespace-separated class part', () => {
    const tree = mount(makeProps({ busy: true }))

    expect(findBusySpinners(tree)).toHaveLength(1)
  })

  it('busy omitted entirely (the Zoom / status-quo shape) -- zero spinner elements, proving the prop is genuinely optional and additive', () => {
    const tree = mount(makeProps())

    expect(findBusySpinners(tree)).toHaveLength(0)
  })

  it('busy: false -- zero spinner elements', () => {
    const tree = mount(makeProps({ busy: false }))

    expect(findBusySpinners(tree)).toHaveLength(0)
  })

  it('busy: true -- the primary clickable tile still invokes primaryLoginAction exactly once on click, and still does not navigate', () => {
    const primaryLoginAction = jest.fn()
    const tree = mount(makeProps({ busy: true, primaryLoginAction }))
    const primary = findClickablePrimary(tree)!
    ;(primary.props as unknown as { onClick: () => void }).onClick()

    expect(primaryLoginAction).toHaveBeenCalledTimes(1)
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('busy: true, isLoggedIn: true -- zero spinner elements: a logout tile is not a sign-in in flight, the spinner belongs to the not-logged-in branch only', () => {
    const tree = mount(makeProps({ busy: true, isLoggedIn: true }))

    expect(findBusySpinners(tree)).toHaveLength(0)
  })

  it("busy: true -- the tile's own buttonText is still present in the rendered text content: D-5 keeps the label as the anchor, the spinner joins it rather than replacing it", () => {
    const tree = mount(makeProps({ busy: true, buttonText: 'GOG Login' }))

    expect(collectTextContent(tree).join('')).toContain('GOG Login')
  })

  it('busy: true -- the spinner element carries aria-hidden set true and carries no aria-label and no title (D-5: zero new strings)', () => {
    const tree = mount(makeProps({ busy: true }))
    const spinner = findBusySpinners(tree)[0]
    const spinnerProps = spinner.props as unknown as Record<string, unknown>

    expect(spinnerProps['aria-hidden']).toBe('true')
    expect(spinnerProps['aria-label']).toBeUndefined()
    expect(spinnerProps.title).toBeUndefined()
  })

  it('SOURCE GATE (ABSENCE, restated locally) -- the comment-stripped Runner/index.tsx still contains zero tabIndex, zero <button and zero <a -- the constraint loginInFlightUiReachability.test.tsx already pins, restated here so a spinner rebuilt as a button fails in the suite that owns the spinner', () => {
    const fs = jest.requireActual<typeof import('fs')>('fs')
    const path = jest.requireActual<typeof import('path')>('path')
    const source = fs.readFileSync(
      path.join(__dirname, '../index.tsx'),
      'utf-8'
    )
    const stripped = source
      .split('\n')
      .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
      .join('\n')

    expect((stripped.match(/\btabIndex\b/g) ?? []).length).toBe(0)
    expect((stripped.match(/<button/g) ?? []).length).toBe(0)
    expect((stripped.match(/<a\s/g) ?? []).length).toBe(0)
  })
})
