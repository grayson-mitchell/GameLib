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
    user: undefined,
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
    const tree = mount(makeProps({ primaryLoginAction, alternativeLoginAction }))

    expect(findAltTile(tree)).toBeDefined()
  })

  it('the alternative tile invokes alternativeLoginAction on click (the embedded navigation)', () => {
    const primaryLoginAction = jest.fn()
    const alternativeLoginAction = jest.fn()
    const tree = mount(makeProps({ primaryLoginAction, alternativeLoginAction }))
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
  return typeof className === 'string' && className.split(' ').includes('deprecated')
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
      makeProps({ deprecatedTile: 'primary', isLoggedIn: true, user: 'Someone' })
    )

    expect(anyDeprecated(tree)).toBe(false)
  })

  it('clicking a marked primary tile invokes exactly the same action as an unmarked one', () => {
    const primaryLoginAction = jest.fn()
    const tree = mount(makeProps({ primaryLoginAction, deprecatedTile: 'primary' }))
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

    expect(
      (primary.props as unknown as { title?: string }).title
    ).toBeFalsy()
    expect(
      (alternative.props as unknown as { title?: string }).title
    ).toBeTruthy()
  })
})
