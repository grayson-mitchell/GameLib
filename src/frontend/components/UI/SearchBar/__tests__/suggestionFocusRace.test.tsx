/**
 * Regression proof for the SearchBar suggestion focus race (Phase 34.6 Plan 16),
 * the cause of live-gate Step 4's FAIL.
 *
 * `index.scss` mounts the suggestions list only under `:focus-within`. A mousedown
 * inside the list blurs the input, nothing takes focus in its place (an `<li>` is not
 * focusable in any engine; macOS/WebKit does not focus a `<button>` on click), so the
 * list unmounts BEFORE mouseup and the item's `onClick` never fires. Silent, and it
 * reads as a dead button -- `winetricksInstall` was recorded as a broken IPC channel
 * on exactly this evidence when the channel was fine and nothing was ever sending.
 *
 * No jsdom / react-test-renderer is installed in this project (see
 * `src/frontend/jest.config.js`), so this follows the established pattern
 * (`Dropdown/__tests__/dropdownDisclosure.test.tsx`,
 * `NavShell/__tests__/DownloadsRing.test.tsx`): invoke the component as a plain
 * function and inspect the returned React element graph.
 *
 * The assertion is BEHAVIOURAL at the layer this project can reach: it invokes the
 * handler and asserts `preventDefault()` was called. That is the actual contract --
 * the browser reads `defaultPrevented` to decide whether to move focus -- not a grep
 * for a prop name. What it cannot prove is the rendered outcome in a real engine;
 * that proof is the live gate's Step 4 re-drive (plan 34.6-17).
 */
import type { ReactElement } from 'react'

// Colocated SCSS side-effect import -- no CSS transform configured for this jest project.
jest.mock('../index.scss', () => ({}))

jest.mock('@fortawesome/react-fontawesome', () => ({
  FontAwesomeIcon: () => null
}))

// `SearchBar` is invoked as a plain function, outside any renderer, so React's hook
// dispatcher is null. Stub only the three hooks it calls; everything else -- notably
// `Fragment`, which this component imports from 'react' -- must stay real, and JSX
// element creation goes through `react/jsx-runtime` rather than this module anyway
// (`tsconfig.json` sets `jsx: "react-jsx"`).
jest.mock('react', () => {
  const actual = jest.requireActual<typeof import('react')>('react')
  return {
    ...actual,
    useRef: <T,>(initial: T) => ({ current: initial }),
    useEffect: () => undefined,
    useCallback: <T,>(fn: T) => fn
  }
})

import SearchBar from '../index'

interface ElementLike {
  type: unknown
  props: Record<string, unknown> & { children?: unknown; className?: unknown }
}

function walk(node: unknown, visit: (el: ElementLike) => void): void {
  if (Array.isArray(node)) {
    node.forEach((child) => walk(child, visit))
    return
  }
  if (!node || typeof node !== 'object') return
  const el = node as ElementLike
  if (!('props' in el) || !el.props) return
  visit(el)
  walk(el.props.children, visit)
}

function renderTree(): ReactElement {
  return SearchBar({
    suggestionsListItems: [<li key="corefonts">corefonts</li>],
    onInputChanged: () => undefined,
    // Non-empty: the suggestions list only renders when `value.length > 0`.
    value: 'corefonts',
    placeholder: 'Search fonts or components'
  }) as ReactElement
}

function findAutoComplete(): ElementLike {
  let found: ElementLike | undefined
  walk(renderTree(), (el) => {
    if (el.props.className === 'autoComplete') found = el
  })
  if (!found) {
    throw new Error(
      'no element with className="autoComplete" in the rendered tree -- the suggestions list was not rendered, so this test proves nothing'
    )
  }
  return found
}

describe('SearchBar suggestion focus race (Phase 34.6 Plan 16)', () => {
  it('renders the suggestions list at all when value is non-empty (non-vacuity anchor)', () => {
    // Guards the test itself: if the list stops rendering, `findAutoComplete()` throws
    // rather than the assertions below passing vacuously against an absent element.
    expect(findAutoComplete()).toBeDefined()
  })

  it('the suggestions list suppresses the focus change on mousedown, so the list survives to receive the click', () => {
    const ul = findAutoComplete()
    const onMouseDown = ul.props.onMouseDown as
      | ((e: { preventDefault: () => void }) => void)
      | undefined

    expect(typeof onMouseDown).toBe('function')

    const preventDefault = jest.fn()
    onMouseDown!({ preventDefault })

    // The contract: the browser consults `defaultPrevented` to decide whether to move
    // focus off the input. Without this call the input blurs, `:focus-within` drops,
    // the list unmounts mid-click, and the item's onClick never fires.
    expect(preventDefault).toHaveBeenCalledTimes(1)
  })
})
