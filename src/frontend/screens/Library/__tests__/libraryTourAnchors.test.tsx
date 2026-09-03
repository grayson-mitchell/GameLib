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

const contextValue = {
  epic: { library: [] as unknown[] },
  gog: { library: [] as unknown[] },
  amazon: { library: [] as unknown[] },
  sideloadedLibrary: [] as unknown[]
}

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

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, defaultValue: string): string => defaultValue
  })
}))

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

type TourStepLike = { element?: string }
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
const EXPECTED_ELEMENTS = [
  undefined, // welcome.intro
  undefined, // welcome.intro2
  '[data-tour="library-search"]',
  '[data-tour="library-views-collections"]',
  '[data-tour="library-facets"]',
  '[data-tour="library-view-toggle"]',
  '[data-tour="library-sort-az"]',
  '[data-tour="library-sort-installed"]',
  '[data-tour="library-refresh"]',
  '[data-tour="library-add-game"]',
  undefined // end.intro
]

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
