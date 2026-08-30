/**
 * Phase 35 gap closure, plan 35-22 (CR-04, renderer half).
 *
 * `Runner/index.tsx`'s `handleLogout` catch used to be a bare `console.error`, which under
 * Tauri reaches neither `gamelib.log` nor `gamelib-shell.log` -- the exact failure this test
 * proves is now visible: a rejected `logoutAction` must (a) reach the backend log via
 * `window.api.logError`, (b) raise a user-visible `showDialogModal` ERROR dialog using the two
 * `gamelib.json` keys added in Task 2 (asserted by KEY, not rendered English, so a later copy
 * edit does not break this test), and (c) still release the "Logging out..." button on every
 * path (the pre-existing G-30-01 guarantee). A resolving `logoutAction` must trigger neither.
 *
 * No jsdom / react-test-renderer in this project (see src/frontend/jest.config.js's docstring)
 * -- Runner is invoked directly as a plain function and its returned React-element object graph
 * inspected, following this file's sibling `index.test.tsx` and
 * `EmptyLibrary/__tests__/index.test.tsx`'s `useContext` mocking convention.
 */
import type { ReactElement, ReactNode } from 'react'

jest.mock('../index.css', () => ({}))

const mockLogError = jest.fn()
const mockShowDialogModal = jest.fn()

// `window.api` is stubbed at the `globalThis` level (mirrors
// WebviewUnavailablePanel.test.tsx's convention) because this project's `testEnvironment:
// 'node'` jest config provides no `window` global otherwise.
;(
  globalThis as unknown as { window: { api: { logError: typeof mockLogError } } }
).window = {
  api: { logError: mockLogError }
}

jest.mock('react-router-dom', () => ({
  useNavigate: () => jest.fn()
}))

jest.mock('react-i18next', () => ({
  useTranslation: (ns?: string) => ({
    t: (_key: string, defaultValue: string): string => defaultValue,
    ns
  })
}))

jest.mock('frontend/state/ContextProvider', () => ({
  __esModule: true,
  default: { __name: 'ContextProvider' }
}))

// `isLoggingOutHistory` records every value `setIsLoggingOut` is called with, across the
// whole test (cleared by `__resetMount`) -- this file's `Runner(props)` is invoked exactly
// once per test (no re-render simulation, matching this project's DOM-less pattern), so the
// only way to observe the G-30-01 button-release guarantee post-await is to record the
// state-setter's call history rather than inspect a second, non-existent render.
let isLoggingOutHistory: unknown[] = []

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
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        isLoggingOutHistory.push(slots[idx])
      }
      return [slots[idx], setState]
    },
    useContext: (ctx: { __name?: string }) =>
      ctx?.__name === 'ContextProvider'
        ? { showDialogModal: mockShowDialogModal }
        : undefined,
    __resetMount: () => {
      slots = []
      cursor = 0
      isLoggingOutHistory = []
    }
  }
})

// Imported after the mocks above (textual order, not hoisting -- ts-jest does not hoist
// jest.mock like babel-jest; see HumbleOriginInfo.test.tsx / index.test.tsx for the same
// convention).
import Runner from '../index'

type HookHarness = { __resetMount: () => void }

function harness(): HookHarness {
  return jest.requireMock('react') as unknown as HookHarness
}

function makeProps(overrides: Record<string, unknown> = {}) {
  return {
    class: 'epic',
    buttonText: 'Epic Games Login',
    loginUrl: '/loginweb/legendary',
    icon: () => 'icon',
    isLoggedIn: true,
    logoutAction: jest.fn(),
    disabled: false,
    ...overrides
  }
}

function mount(props: ReturnType<typeof makeProps>): ReactElement {
  harness().__resetMount()
  return Runner(props) as unknown as ReactElement
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

function findLogoutTile(tree: ReactNode) {
  return collectElements(tree).find((el) => {
    const className = el.props?.className
    return (
      typeof className === 'string' &&
      className.split(' ').includes('runnerLogin') &&
      typeof el.props.onClick === 'function'
    )
  })
}

async function clickLogout(tree: ReactNode) {
  const tile = findLogoutTile(tree)!
  ;(tile.props as unknown as { onClick: () => void }).onClick()
  // handleLogout is async; flush its microtask queue.
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

describe('Runner: logout failure surface (Phase 35 gap closure, plan 35-22, CR-04)', () => {
  beforeEach(() => {
    mockLogError.mockClear()
    mockShowDialogModal.mockClear()
  })

  it('a rejecting logoutAction calls window.api.logError exactly once, with the runner identifier in the message', async () => {
    const logoutAction = jest.fn().mockRejectedValue(new Error('cookie clear failed'))
    const tree = mount(makeProps({ class: 'epic', logoutAction }))

    await clickLogout(tree)

    expect(mockLogError).toHaveBeenCalledTimes(1)
    const [message] = mockLogError.mock.calls[0]
    expect(String(message)).toContain('epic')
  })

  it('a rejecting logoutAction calls showDialogModal exactly once with type ERROR and both new gamelib keys requested from the translator', async () => {
    const logoutAction = jest.fn().mockRejectedValue(new Error('cookie clear failed'))
    const tree = mount(makeProps({ logoutAction }))

    await clickLogout(tree)

    expect(mockShowDialogModal).toHaveBeenCalledTimes(1)
    const options = mockShowDialogModal.mock.calls[0][0]
    expect(options.type).toBe('ERROR')
    // Asserting the KEYS requested, not the rendered English, so a later copy edit to the
    // gamelib.json values does not break this test.
    expect(options.title).toBe('Sign-out incomplete')
    expect(options.message).toBe(
      "Your account was signed out on this device, but the browser session could not be fully cleared. On a shared computer, sign out again or clear your browser data for this site to make sure your session doesn't stay accessible."
    )
  })

  it('a rejecting logoutAction still releases the "Logging out..." button (the G-30-01 guarantee)', async () => {
    const logoutAction = jest.fn().mockRejectedValue(new Error('cookie clear failed'))
    const tree = mount(makeProps({ logoutAction }))

    await clickLogout(tree)

    // `Runner(props)` is invoked exactly once per test here (no re-render simulation), so
    // the button-release guarantee is observed via the setIsLoggingOut call history rather
    // than a second render: it must have been set to true (entering the logout) and then
    // back to false in `finally`, even though the try block rejected.
    expect(isLoggingOutHistory).toEqual([true, false])
    expect(findLogoutTile(tree)).toBeDefined()
  })

  it('a resolving logoutAction calls NEITHER window.api.logError NOR showDialogModal', async () => {
    const logoutAction = jest.fn().mockResolvedValue(undefined)
    const tree = mount(makeProps({ logoutAction }))

    await clickLogout(tree)

    expect(mockLogError).not.toHaveBeenCalled()
    expect(mockShowDialogModal).not.toHaveBeenCalled()
  })

  it('source gate: no console.error remains in the logout failure path', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = jest.requireActual<typeof import('fs')>('fs')
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = jest.requireActual<typeof import('path')>('path')
    const source = fs.readFileSync(path.join(__dirname, '../index.tsx'), 'utf-8')

    expect(source).not.toContain('console.error')
  })
})
