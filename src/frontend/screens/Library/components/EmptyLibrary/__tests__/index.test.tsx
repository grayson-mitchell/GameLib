/**
 * 37-VERIFICATION G-01.
 *
 * D-10 promised the new `noStorePage` tri-state would inherit "the chip row,
 * the group badge and zero-result handling" from its `showHidden` /
 * `showNonAvailable` siblings. The first two were wired; zero-result handling
 * was not, so `noStorePage === 'only'` fell through to the generic "The
 * current filters produced no results."
 *
 * That made FOUR mirrors of the More-filters kind list in this phase
 * (`MORE_FILTER_KINDS`, `describeActiveFilters`, `clearAllFilters`, and this
 * one). Three were caught late -- one by a live human gate, one by the phase
 * verifier -- so this file pins the behaviour by RENDERING the component
 * rather than by scanning its source.
 *
 * No jsdom / react-test-renderer in this project (see FilterMoreGroup.test.tsx):
 * the component is invoked as a plain function and the returned React element
 * graph is inspected.
 */
import { createElement } from 'react'

type FilterMode = 'off' | 'show' | 'only'
type NoStorePageMode = 'off' | 'only' | 'hide'

const libraryContextValue = {
  showHidden: 'off' as FilterMode,
  showNonAvailable: 'off' as FilterMode,
  noStorePage: 'off' as NoStorePageMode
}

// A non-empty library, so the component reaches the 'only'-mode branches
// instead of the "your library is empty" first-run message.
const providerContextValue = {
  epic: { library: [{}] },
  gog: { library: [] },
  amazon: { library: [] },
  steam: { library: [] },
  zoom: { library: [] },
  sideloadedLibrary: []
}

jest.mock('frontend/state/ContextProvider', () => ({
  __esModule: true,
  default: { __name: 'ContextProvider' }
}))
jest.mock('frontend/screens/Library/LibraryContext', () => ({
  __esModule: true,
  default: { __name: 'LibraryContext' }
}))
jest.mock('../index.css', () => ({}), { virtual: true })
jest.mock('../../AddGameButton', () => ({
  __esModule: true,
  default: () => null
}))
jest.mock('react-router-dom', () => ({
  __esModule: true,
  NavLink: () => null
}))

// `t(key, default)` returns the DEFAULT so assertions read as user-visible
// copy. Namespaced calls are distinguished by the namespace argument.
jest.mock('react-i18next', () => ({
  __esModule: true,
  Trans: (props: Record<string, unknown>) => ({ type: 'Trans', props }),
  useTranslation: (ns?: string) => ({
    t: (_key: string, def?: string) => def ?? _key,
    i18n: {},
    ns
  })
}))

jest.mock('react', () => {
  const actual = jest.requireActual('react')
  return {
    ...actual,
    useContext: (ctx: { __name?: string }) =>
      ctx?.__name === 'LibraryContext'
        ? libraryContextValue
        : providerContextValue
  }
})

// Deliberately a lazy `require`, NOT a static import: it has to evaluate
// AFTER the `jest.mock('react', ...)` factory above, and a static import
// would be hoisted above it, so the component would close over the real
// `useContext` and the mocked contexts would never apply.
//
// The rule named below is `no-require-imports`. This line previously said
// `no-var-requires`, a rule that no longer exists -- and ESLint does not
// error on an unknown rule name in a disable comment, so the suppression
// looked effective while suppressing nothing.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const EmptyLibraryMessage = require('../index').default

/** Flattens the rendered element graph to its visible text. */
function renderedText(): string {
  const el = EmptyLibraryMessage({}) as {
    props: { children: unknown }
  }
  const out: string[] = []
  const walk = (node: unknown): void => {
    if (node === null || node === undefined || typeof node === 'boolean') return
    if (typeof node === 'string' || typeof node === 'number') {
      out.push(String(node))
      return
    }
    if (Array.isArray(node)) {
      node.forEach(walk)
      return
    }
    const asEl = node as { props?: { children?: unknown } }
    if (asEl.props && 'children' in asEl.props) walk(asEl.props.children)
  }
  walk(el.props.children)
  return out.join('')
}

function setModes(modes: {
  showHidden?: FilterMode
  showNonAvailable?: FilterMode
  noStorePage?: NoStorePageMode
}): void {
  libraryContextValue.showHidden = modes.showHidden ?? 'off'
  libraryContextValue.showNonAvailable = modes.showNonAvailable ?? 'off'
  libraryContextValue.noStorePage = modes.noStorePage ?? 'off'
}

describe('EmptyLibrary zero-result messages (LIB-09 / 37 G-01)', () => {
  afterEach(() => setModes({}))

  it('G-01: noStorePage="only" gets its OWN message, not the generic fallback', () => {
    setModes({ noStorePage: 'only' })
    const text = renderedText()
    expect(text).toBe('No games without a store page in your library')
    expect(text).not.toMatch(/produced no results/i)
  })

  it('the gate is non-vacuous: with noStorePage off, that message does NOT appear', () => {
    setModes({})
    expect(renderedText()).not.toMatch(/without a store page/i)
  })

  it('showHidden="only" keeps its existing message (regression guard)', () => {
    setModes({ showHidden: 'only' })
    expect(renderedText()).toBe('No hidden games in your library')
  })

  it('showNonAvailable="only" keeps its existing message (regression guard)', () => {
    setModes({ showNonAvailable: 'only' })
    expect(renderedText()).toBe('No non-available games in your library')
  })

  it('a UNION of two "only" modes falls through to the generic message — no single message can describe it', () => {
    setModes({ showHidden: 'only', noStorePage: 'only' })
    expect(renderedText()).not.toMatch(/No hidden games/i)
    expect(renderedText()).not.toMatch(/without a store page/i)
  })

  it('all three "only" at once also falls through', () => {
    setModes({
      showHidden: 'only',
      showNonAvailable: 'only',
      noStorePage: 'only'
    })
    const text = renderedText()
    expect(text).not.toMatch(/No hidden games/i)
    expect(text).not.toMatch(/No non-available games/i)
    expect(text).not.toMatch(/without a store page/i)
  })
})

// Keep `createElement` referenced so the react mock's actual passthrough is
// exercised rather than tree-shaken by ts-jest's transpile-only mode.
void createElement
