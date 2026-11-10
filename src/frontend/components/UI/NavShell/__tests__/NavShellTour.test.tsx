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
import 'frontend/testUtils/tauriWindow'
import { readFileSync } from 'fs'
import { join } from 'path'
import type { ReactElement } from 'react'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'

const startTourMock = jest.fn()
let isTourActiveReturn = false

jest.mock('react', () => {
  const { withStoreHooks } = jest.requireActual<
    typeof import('frontend/testUtils/storeHookReact')
  >('frontend/testUtils/storeHookReact')
  // NavShellTour memoizes `steps`; with no dispatcher installed (plain-function
  // invocation) withStoreHooks supplies a recomputing passthrough useMemo.
  return withStoreHooks(jest.requireActual<typeof import('react')>('react'))
})

jest.mock('react-i18next', () => {
  // Resolves against the shipped en catalogues, not the inline default: the
  // tour-copy cases below are about what users actually SEE, and an existing
  // key's catalogue value wins over its t() default (phase 34.12 D-07).
  const { faithfulReactI18next } = jest.requireActual<
    typeof import('frontend/screens/Game/GamePage/components/__tests__/faithfulTranslate')
  >('frontend/screens/Game/GamePage/components/__tests__/faithfulTranslate')
  return faithfulReactI18next()
})

jest.mock('frontend/state/TourContext', () => ({
  useTour: () => ({
    startTour: startTourMock,
    isTourActive: () => isTourActiveReturn
  })
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
import useUiState from 'frontend/state/uiState'
import useSettingsState from 'frontend/state/settingsState'
import { resetAllStores } from 'frontend/state/storeKit'

const seedStores = (platform: string, isRTL: boolean) => {
  useUiState.setState({ platform: platform as never })
  useSettingsState.setState({ language: isRTL ? 'ar' : 'en' })
}

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

afterEach(() => resetAllStores())

beforeEach(() => {
  seedStores('linux', false)
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
    seedStores('linux', false)
    const element = renderTour()
    expect(element.props.steps.map((step) => step.element)).toEqual(
      EXPECTED_NON_WINDOWS_ELEMENTS
    )
  })

  it('excludes nav-wine on win32, keeping the other eleven steps in the same relative order', () => {
    seedStores('win32', false)
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

// Tour copy must describe the tab layout (no sidebar exists since phase
// 34.10) and, wherever it lists stores, include Steam -- GameLib's reason to
// exist. Shared by both tour suites' copy cases.
function staleCopyIn(steps: { intro?: string; title?: string }[]): string[] {
  return steps
    .flatMap((step) => [step.intro ?? '', step.title ?? ''])
    .filter(
      (text) =>
        /sidebar/i.test(text) || (/\bGOG\b/.test(text) && !/Steam/.test(text))
    )
}

describe('NavShellTour copy', () => {
  it.each(['linux', 'win32'])(
    'no rendered step names the retired sidebar or lists stores without Steam (%s)',
    (platform) => {
      seedStores(platform, false)
      expect(staleCopyIn(renderTour().props.steps)).toEqual([])
    }
  )
})
