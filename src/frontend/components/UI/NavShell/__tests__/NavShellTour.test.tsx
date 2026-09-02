/**
 * Structural tests for `NavShellTour` (34.12-04 Task 3), the twelve-step
 * `nav-*`-anchored onboarding tour rebuilt against the two-tier `NavShell`
 * (34.12-04 Task 1). Pins the whole step contract in one place: D-04's
 * `disableInteraction: true` option, the settled step order (and its
 * platform-conditional `nav-wine` exclusion on Windows), and D-02's
 * no-auto-start invariant.
 *
 * No jsdom / react-test-renderer is installed in this project (see
 * `src/frontend/jest.config.js` docstring) -- `NavShellTour` is invoked
 * directly as a plain function and the element it returns is inspected
 * without a DOM, following the "mock useContext/useTranslation + a
 * hand-mocked `Tour/Tour` child" pattern established by
 * `Library/__tests__/libraryTourAnchors.test.tsx` and
 * `NavShell/__tests__/NavTabsComponent.test.tsx`.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import type { ReactElement } from 'react'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'

type MockContextValue = { platform: string; isRTL: boolean }

let contextValue: MockContextValue = { platform: 'linux', isRTL: false }
const startTourMock = jest.fn()
let isTourActiveReturn = false

jest.mock('react', () => ({
  ...jest.requireActual<typeof import('react')>('react'),
  useContext: () => contextValue
}))

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, defaultValue: string): string => defaultValue
  })
}))

jest.mock('frontend/state/TourContext', () => ({
  useTour: () => ({
    startTour: startTourMock,
    isTourActive: () => isTourActiveReturn
  })
}))

jest.mock('frontend/state/ContextProvider', () => ({
  __esModule: true,
  default: {}
}))

jest.mock('frontend/components/Tour/Tour', () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => ({
    type: 'mock-tour',
    props
  })
}))

// Imported after the mocks above (textual order -- this project's ts-jest
// setup does not hoist jest.mock like babel-jest). `NavShellTour/index.tsx`
// itself imports `Tour`/`useTour` via the `frontend/...` alias (its
// nesting depth broke relative-path imports after the Task 1 move), so the
// mocks above must be keyed on the same alias to intercept the same module.
import Tour from 'frontend/components/Tour/Tour'
import NavShellTour from '../components/NavShellTour'

type TourStepLike = { element?: string; intro?: string; title?: string }
type TourElement = ReactElement<{
  tourId: string
  steps: TourStepLike[]
  options?: Record<string, unknown>
  enabled: boolean
}>

function renderTour(): TourElement {
  return (NavShellTour as unknown as () => TourElement)()
}

// The settled twelve-step order (34.12-04 Task 1), written as a literal --
// NOT derived from the component, which would make this gate self-sealing
// (a step silently dropped from the component would silently shrink this
// expectation too, and the assertion below would still pass).
const EXPECTED_NON_WINDOWS_ELEMENTS = [
  '[data-tour="nav-menu"]',
  '[data-tour="nav-library"]',
  '[data-tour="nav-stores"]',
  '[data-tour="nav-settings"]',
  '[data-tour="nav-downloads"]',
  '[data-tour="nav-wine"]',
  '[data-tour="nav-manage-accounts"]',
  '[data-tour="nav-accessibility"]',
  '[data-tour="nav-docs"]',
  '[data-tour="nav-community"]',
  '[data-tour="nav-quit"]',
  '[data-tour="nav-version"]'
]

const EXPECTED_WINDOWS_ELEMENTS = EXPECTED_NON_WINDOWS_ELEMENTS.filter(
  (element) => element !== '[data-tour="nav-wine"]'
)

const NAVSHELLTOUR_SOURCE_PATH = join(
  __dirname,
  '..',
  'components',
  'NavShellTour',
  'index.tsx'
)

beforeEach(() => {
  contextValue = { platform: 'linux', isRTL: false }
  startTourMock.mockClear()
  isTourActiveReturn = false
})

describe('NavShellTour (34.12-04 Task 3)', () => {
  it('renders the mocked Tour component with tourId "nav-tour"', () => {
    const element = renderTour()
    expect(element.type).toBe(Tour)
    expect(element.props.tourId).toBe('nav-tour')
  })

  it('sets options to exactly { disableInteraction: true } (D-04)', () => {
    const element = renderTour()
    expect(element.props.options).toEqual({ disableInteraction: true })
  })

  it('has twelve steps in the settled order on a non-Windows platform', () => {
    contextValue = { platform: 'linux', isRTL: false }
    const element = renderTour()
    expect(element.props.steps.map((step) => step.element)).toEqual(
      EXPECTED_NON_WINDOWS_ELEMENTS
    )
  })

  it('excludes nav-wine on win32, keeping the other eleven steps in the same relative order', () => {
    contextValue = { platform: 'win32', isRTL: false }
    const element = renderTour()
    const elements = element.props.steps.map((step) => step.element)

    expect(elements).toHaveLength(11)
    expect(elements).not.toContain('[data-tour="nav-wine"]')
    expect(elements).toEqual(EXPECTED_WINDOWS_ELEMENTS)
  })

  it('never calls startTour (D-02: manual-start only) -- neither at the mock call site nor as a source token', () => {
    renderTour()
    expect(startTourMock).not.toHaveBeenCalled()

    const source = stripSourceComments(
      readFileSync(NAVSHELLTOUR_SOURCE_PATH, 'utf8')
    )
    expect(source).not.toMatch(/startTour/)
  })

  it('drives enabled from isTourActive(NAV_TOUR_ID)', () => {
    isTourActiveReturn = true
    expect(renderTour().props.enabled).toBe(true)

    isTourActiveReturn = false
    expect(renderTour().props.enabled).toBe(false)
  })
})
