/**
 * Structural tests for `LibraryTour`'s two re-anchored steps (34.12-02
 * Task 2, D-09) -- proves the two previously-dead steps
 * (`library-categories`, `library-filters`, which matched ZERO elements at
 * HEAD) now point at the live anchors Task 1 added to `Header`
 * (`library-views-collections`, `library-facets`), that the dead strings
 * do not survive anywhere in the steps array, and that the other steps
 * this plan does not touch are still present in the same order.
 *
 * No jsdom / react-test-renderer is installed in this project (see
 * `src/frontend/jest.config.js` docstring) -- `LibraryTour` is invoked
 * directly as a plain function and the `steps` prop passed to the mocked
 * `Tour` component is inspected without a DOM, following the "mock
 * useContext/useTranslation + a hand-mocked child component" pattern
 * established by `NavShell/__tests__/NavTabsComponent.test.tsx` and
 * `SettingsPanel.test.tsx`.
 */
import type { ReactElement } from 'react'

const emptyContext = () => ({
  epic: { library: [] as unknown[] },
  gog: { library: [] as unknown[] },
  amazon: { library: [] as unknown[] },
  steam: { library: [] as unknown[] },
  zoom: { library: [] as unknown[] },
  sideloadedLibrary: [] as unknown[]
})
let contextValue = emptyContext()

jest.mock('react', () => ({
  ...jest.requireActual<typeof import('react')>('react'),
  useContext: () => contextValue,
  // LibraryTour now memoizes its `steps` array (introjs-tooltip-not-rendering
  // fix -- intro.js-react's componentDidUpdate compares `steps` by reference,
  // so an unmemoized array re-triggered intro.js's show-step path on every
  // render). No dispatcher is installed here (component is invoked as a
  // plain function, not rendered), so the real `useMemo` would throw; this
  // test only cares about the STRUCTURAL content of the memoized value, not
  // memoization behaviour itself, so a passthrough that always recomputes is
  // sufficient and keeps the "invoke as a plain function" pattern working.
  useMemo: <T,>(factory: () => T) => factory()
}))

jest.mock('react-i18next', () => {
  // Resolves against the shipped en catalogues, not the inline default: the
  // tour-copy cases below are about what users actually SEE, and an existing
  // key's catalogue value wins over its t() default (phase 34.12 D-07).
  const { faithfulReactI18next } = jest.requireActual<
    typeof import('frontend/screens/Game/GamePage/components/__tests__/faithfulTranslate')
  >('frontend/screens/Game/GamePage/components/__tests__/faithfulTranslate')
  return faithfulReactI18next()
})

jest.mock('../../../state/TourContext', () => ({
  useTour: () => ({ isTourActive: () => false })
}))

jest.mock('frontend/state/ContextProvider', () => ({
  __esModule: true,
  default: {}
}))

jest.mock('../../../components/Tour/Tour', () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => ({
    type: 'mock-tour',
    props
  })
}))

// Imported after the mocks above (textual order -- this project's ts-jest
// setup does not hoist jest.mock like babel-jest).
import LibraryTour from '../components/LibraryTour'

type TourStepLike = { element?: string; intro?: string; title?: string }
type AnyElement = ReactElement<{ steps: TourStepLike[] }>

function renderedSteps(): TourStepLike[] {
  const tree = (LibraryTour as unknown as () => AnyElement)()
  return tree.props.steps
}

// This is the CONTRACT the untouched steps must keep, derived from
// LibraryTour.tsx as it stands after this plan's edit -- not a snapshot to
// blindly regenerate. `hasGames` is false in this test (empty libraries in
// contextValue above), so the conditional `library-game-card` step is
// absent; a future edit that silently drops or reorders a working step is
// caught by comparing the full ordered list against this exact array.
//
// 261003-i4t (D-11): `library-add-game` and `library-refresh` are swapped
// from their original order so the tour walks the panel footer
// left-to-right, matching D-04 (plus button at the left) and D-06 (refresh
// to the right of the count). No `element` selector, title, or body
// changed -- only the two step objects' positions, so the anchor manifest
// itself is unchanged (`navTourAnchorCensus.test.ts` stays green).
const EXPECTED_ELEMENTS = [
  undefined, // welcome.intro
  undefined, // welcome.intro2
  '[data-tour="library-search"]',
  '[data-tour="library-views-collections"]',
  '[data-tour="library-facets"]',
  '[data-tour="library-view-toggle"]',
  '[data-tour="library-sort-az"]',
  '[data-tour="library-sort-installed"]',
  '[data-tour="library-add-game"]',
  '[data-tour="library-refresh"]',
  undefined // end.intro
]

beforeEach(() => {
  contextValue = emptyContext()
})

describe('LibraryTour re-anchored steps (34.12-02, D-09)', () => {
  it('contains exactly one step whose element is [data-tour="library-views-collections"]', () => {
    const steps = renderedSteps()
    const matches = steps.filter(
      (step) => step.element === '[data-tour="library-views-collections"]'
    )
    expect(matches).toHaveLength(1)
  })

  it('contains exactly one step whose element is [data-tour="library-facets"]', () => {
    const steps = renderedSteps()
    const matches = steps.filter(
      (step) => step.element === '[data-tour="library-facets"]'
    )
    expect(matches).toHaveLength(1)
  })

  it('contains zero steps whose element matches the retired library-categories or library-filters selectors', () => {
    const steps = renderedSteps()
    const deadMatches = steps.filter(
      (step) =>
        typeof step.element === 'string' &&
        (step.element.includes('library-categories') ||
          step.element.includes('library-filters'))
    )
    expect(deadMatches).toHaveLength(0)
  })

  it('preserves the untouched steps in their original order', () => {
    const steps = renderedSteps()
    expect(steps.map((step) => step.element)).toEqual(EXPECTED_ELEMENTS)
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

describe('LibraryTour game-card step and copy', () => {
  it.each(['epic', 'gog', 'amazon', 'steam', 'zoom'] as const)(
    'offers the library-game-card step when only the %s library has games',
    (store) => {
      contextValue[store].library = [{}]
      const elements = renderedSteps().map((step) => step.element)
      expect(elements).toContain('[data-tour="library-game-card"]')
    }
  )

  it('offers the library-game-card step for a sideload-only library', () => {
    contextValue.sideloadedLibrary = [{}]
    const elements = renderedSteps().map((step) => step.element)
    expect(elements).toContain('[data-tour="library-game-card"]')
  })

  it('no rendered step names the retired sidebar or lists stores without Steam', () => {
    expect(staleCopyIn(renderedSteps())).toEqual([])
  })
})
