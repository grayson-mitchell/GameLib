/**
 * Structural tests for `SettingsPanel`, the tier-2 Settings nav list
 * (34.10-05 Task 2, REQ-34.10-11/14) -- carries every Settings-related
 * destination the retired left navigation held, including the three
 * destinations reparented off top-level sibling items (Wine Manager,
 * Accessibility, Console Mode) and the relocated `QuitButton`.
 *
 * No jsdom / react-test-renderer is installed in this project (see
 * `src/frontend/jest.config.js` docstring) -- `SettingsPanel` is invoked
 * directly as a plain function and its returned React-element object graph
 * is inspected without a DOM, following the "mock react (useContext) +
 * react-i18next (useTranslation) + child component modules" pattern
 * established by `NavItem.test.tsx` / `StoresPanel.test.tsx`.
 */
import type { ReactElement, ReactNode } from 'react'

type MockContextValue = {
  platform: string
  handleExternalLinkDialog: jest.Mock
}

function makeContextValue(
  overrides: Partial<MockContextValue> = {}
): MockContextValue {
  return {
    platform: 'linux',
    handleExternalLinkDialog: jest.fn(),
    ...overrides
  }
}

let contextValue: MockContextValue = makeContextValue()
let storedPreference: string | null = null

const startTourMock = jest.fn()
const resetTourMock = jest.fn()
const hasTourCompletedMock = jest.fn()

jest.mock('react', () => ({
  ...jest.requireActual<typeof import('react')>('react'),
  useContext: () => contextValue
}))

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, defaultValue: string): string => defaultValue
  })
}))

jest.mock('frontend/components/UI/ExternalLinkDialog', () => ({
  SHOW_EXTERNAL_LINK_DIALOG_STORAGE_KEY: 'show_external_link_dialog'
}))

// `useTour()` is mocked directly rather than relying on the `react` mock's
// `useContext` override above -- that override answers every `useContext`
// call with the Settings/ExternalLinkDialog-shaped `contextValue`
// regardless of which context object is passed, which would make
// `startTour`/`resetTour`/`hasTourCompleted` silently `undefined`.
jest.mock('frontend/state/TourContext', () => ({
  useTour: () => ({
    startTour: startTourMock,
    resetTour: resetTourMock,
    hasTourCompleted: hasTourCompletedMock
  })
}))

jest.mock('../components/NavShellTour', () => ({
  __esModule: true,
  NAV_TOUR_ID: 'nav-tour',
  default: (props: Record<string, unknown>) => ({
    type: 'mock-navshelltour',
    props
  })
}))

jest.mock('../components/NavItem', () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => ({
    type: 'mock-navitem',
    props
  })
}))

jest.mock('../components/QuitButton', () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => ({
    type: 'mock-quitbutton',
    props
  })
}))
;(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: jest.fn(() => storedPreference),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
  key: jest.fn(),
  length: 0
}
;(
  globalThis as unknown as { window: { api: { openKofiPage: jest.Mock } } }
).window = {
  api: { openKofiPage: jest.fn() }
}

// Imported after the mocks above (textual order -- this project's ts-jest
// setup does not hoist jest.mock like babel-jest). `element.type` from
// `React.createElement(NavItem, ...)` / `React.createElement(QuitButton,
// ...)` is a REFERENCE to whatever those imports resolve to at import time
// -- not the mock factory's return value. Importing the same mocked
// bindings here lets tests assert type identity (see NavItem.test.tsx /
// 34.10-02 SUMMARY Deviation 1).
import NavItem from '../components/NavItem'
import QuitButton from '../components/QuitButton'
import SettingsPanel from '../components/SettingsPanel'

type AnyProps = Record<string, unknown> & { children?: ReactNode }
type AnyElement = ReactElement<AnyProps> & { props: AnyProps }

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
  if (typeof node === 'object' && 'type' in node) {
    const element = node as AnyElement
    out.push(element)
    if (element.props?.children !== undefined) {
      collectElements(element.props.children, out)
    }
    return out
  }
  return out
}

function topLevelChildren(tree: ReactNode): AnyElement[] {
  const root = tree as AnyElement
  const children = root.props?.children
  return (Array.isArray(children) ? children : [children]).filter(
    (c): c is AnyElement =>
      c !== null && c !== undefined && typeof c === 'object' && 'type' in c
  )
}

function labelsOf(tree: ReactNode): string[] {
  return collectElements(tree)
    .filter((el) => el.type === NavItem)
    .map((el) => el.props?.label)
    .filter((l): l is string => typeof l === 'string')
}

function findNavItem(tree: ReactNode, label: string): AnyElement | undefined {
  return collectElements(tree).find(
    (el) => el.type === NavItem && el.props?.label === label
  )
}

describe('SettingsPanel', () => {
  beforeEach(() => {
    // `resetMocks: true` (src/frontend/jest.config.js) clears every mock's
    // implementation before each test, including the module-level
    // `localStorage.getItem` factory below -- reassign it here so each
    // test's `storedPreference` value actually takes effect.
    storedPreference = null
    ;(localStorage.getItem as jest.Mock).mockImplementation(
      () => storedPreference
    )
  })

  it('renders all twelve entries in the settled order for a non-Windows context', () => {
    contextValue = makeContextValue({ platform: 'linux' })

    const tree = SettingsPanel() as unknown as ReactElement
    const labels = labelsOf(tree)

    expect(labels).toEqual([
      'General',
      'Game Defaults',
      'Advanced',
      'Wine Manager',
      'Accessibility',
      'Console Mode',
      'Log',
      'System Information',
      'Documentation',
      'Ko-fi',
      'App Tour'
    ])

    const children = topLevelChildren(tree)
    expect(children[children.length - 1].type).toBe(QuitButton)
  })

  it('omits Game Defaults and Wine Manager on win32 while keeping Advanced and Console Mode', () => {
    contextValue = makeContextValue({ platform: 'win32' })

    const tree = SettingsPanel() as unknown as ReactElement
    const labels = labelsOf(tree)

    expect(labels).not.toContain('Game Defaults')
    expect(labels).not.toContain('Wine Manager')
    expect(labels).toContain('Advanced')
    expect(labels).toContain('Console Mode')
  })

  it('places System Information immediately after Log', () => {
    contextValue = makeContextValue()

    const tree = SettingsPanel() as unknown as ReactElement
    const labels = labelsOf(tree)

    expect(labels.indexOf('System Information')).toBe(labels.indexOf('Log') + 1)
  })

  it('Ko-fi is a button whose onClick calls handleExternalLinkDialog when the stored preference is absent', () => {
    storedPreference = null
    const handleExternalLinkDialog = jest.fn()
    contextValue = makeContextValue({ handleExternalLinkDialog })

    const tree = SettingsPanel() as unknown as ReactElement
    const kofiItem = findNavItem(tree, 'Ko-fi')

    expect(kofiItem?.props.elementType).toBe('button')
    ;(kofiItem?.props.onClick as () => void)()

    expect(handleExternalLinkDialog).toHaveBeenCalledWith(
      expect.objectContaining({ showDialog: true })
    )
    expect(window.api.openKofiPage).not.toHaveBeenCalled()
  })

  it('Ko-fi calls handleExternalLinkDialog when the stored preference is true', () => {
    storedPreference = 'true'
    const handleExternalLinkDialog = jest.fn()
    contextValue = makeContextValue({ handleExternalLinkDialog })

    const tree = SettingsPanel() as unknown as ReactElement
    const kofiItem = findNavItem(tree, 'Ko-fi')
    ;(kofiItem?.props.onClick as () => void)()

    expect(handleExternalLinkDialog).toHaveBeenCalledWith(
      expect.objectContaining({ showDialog: true })
    )
    expect(window.api.openKofiPage).not.toHaveBeenCalled()
  })

  it('Ko-fi calls window.api.openKofiPage directly when the stored preference is false', () => {
    storedPreference = 'false'
    const handleExternalLinkDialog = jest.fn()
    contextValue = makeContextValue({ handleExternalLinkDialog })

    const tree = SettingsPanel() as unknown as ReactElement
    const kofiItem = findNavItem(tree, 'Ko-fi')
    ;(kofiItem?.props.onClick as () => void)()

    expect(handleExternalLinkDialog).not.toHaveBeenCalled()
    expect(window.api.openKofiPage).toHaveBeenCalled()
  })

  it('the QuitButton element is the last child of the panel', () => {
    contextValue = makeContextValue()

    const tree = SettingsPanel() as unknown as ReactElement
    const children = topLevelChildren(tree)

    expect(children[children.length - 1].type).toBe(QuitButton)
  })

  describe('D-05 tour anchors', () => {
    it('the Wine Manager row carries data-tour="nav-wine" on a non-Windows platform', () => {
      contextValue = makeContextValue({ platform: 'linux' })

      const tree = SettingsPanel() as unknown as ReactElement
      const row = findNavItem(tree, 'Wine Manager')

      expect(row?.props['data-tour']).toBe('nav-wine')
    })

    it('the Accessibility row carries data-tour="nav-accessibility"', () => {
      contextValue = makeContextValue()

      const tree = SettingsPanel() as unknown as ReactElement
      const row = findNavItem(tree, 'Accessibility')

      expect(row?.props['data-tour']).toBe('nav-accessibility')
    })

    it('the Documentation row carries data-tour="nav-docs"', () => {
      contextValue = makeContextValue()

      const tree = SettingsPanel() as unknown as ReactElement
      const row = findNavItem(tree, 'Documentation')

      expect(row?.props['data-tour']).toBe('nav-docs')
    })

    it('the Ko-fi row carries data-tour="nav-community"', () => {
      contextValue = makeContextValue()

      const tree = SettingsPanel() as unknown as ReactElement
      const row = findNavItem(tree, 'Ko-fi')

      expect(row?.props['data-tour']).toBe('nav-community')
    })

    it('on win32, no element carries data-tour="nav-wine" -- the row guard and the tour step guard agree', () => {
      contextValue = makeContextValue({ platform: 'win32' })

      const tree = SettingsPanel() as unknown as ReactElement
      const elements = collectElements(tree)

      expect(
        elements.some((el) => el.props?.['data-tour'] === 'nav-wine')
      ).toBe(false)
    })
  })

  describe('D-01 launcher row', () => {
    it('starts the tour without resetting when it has not been completed', () => {
      contextValue = makeContextValue()
      hasTourCompletedMock.mockReturnValue(false)

      const tree = SettingsPanel() as unknown as ReactElement
      const launcher = findNavItem(tree, 'App Tour')
      expect(launcher?.props['data-tour']).toBe('nav-launcher')
      ;(launcher?.props.onClick as () => void)()

      expect(startTourMock).toHaveBeenCalledTimes(1)
      expect(startTourMock).toHaveBeenCalledWith('nav-tour')
      expect(resetTourMock).not.toHaveBeenCalled()
    })

    it('resets then starts the tour, in that order, when it was already completed', () => {
      contextValue = makeContextValue()
      hasTourCompletedMock.mockReturnValue(true)

      const tree = SettingsPanel() as unknown as ReactElement
      const launcher = findNavItem(tree, 'App Tour')
      ;(launcher?.props.onClick as () => void)()

      expect(resetTourMock).toHaveBeenCalledTimes(1)
      expect(resetTourMock).toHaveBeenCalledWith('nav-tour')
      expect(startTourMock).toHaveBeenCalledTimes(1)
      expect(startTourMock).toHaveBeenCalledWith('nav-tour')

      const resetOrder = resetTourMock.mock.invocationCallOrder[0]
      const startOrder = startTourMock.mock.invocationCallOrder[0]
      expect(resetOrder).toBeLessThan(startOrder)
    })
  })
})
