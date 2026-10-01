/**
 * Structural tests for `Header`, the Games tier-2 filter panel's top-level
 * layout (34.12-02 Task 1, D-09; extended by quick 261002-b63) -- proves the
 * two `data-tour` wrapper divs (`library-views-collections`, `library-facets`)
 * carry the right children by IDENTITY, that `.Header` now returns FOUR direct
 * children (a leading `Header__utilities` row holding the Console Mode link,
 * ahead of the pre-existing `Header__search`, `library-views-collections` and
 * `library-facets` children), and that all of `.Header`'s CSS-gated wrappers
 * restate the `.Header` gap they intercepted -- without this CSS gate the
 * vertical spacing between Views and Collections, and between the three facet
 * groups, silently collapses to zero, because `gap` is a property of the flex
 * CONTAINER and the new wrappers just removed five elements from `.Header`'s
 * direct-child list.
 *
 * No jsdom / react-test-renderer is installed in this project (see
 * `src/frontend/jest.config.js` docstring) -- `Header` is invoked directly
 * as a plain function and its returned React-element object graph is
 * inspected without a DOM, following the "mock react-i18next / child
 * component modules + call the component directly" pattern established by
 * `NavShell/__tests__/SettingsPanel.test.tsx`. The CSS gate itself follows
 * the brace-counted `cssBlock` helper from `Login/__tests__/index.test.tsx`.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import type { ReactElement, ReactNode } from 'react'

jest.mock('../index.css', () => ({}))

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, defaultValue: string): string => defaultValue
  })
}))

jest.mock('react-router-dom', () => ({
  Link: (props: Record<string, unknown>) => ({
    type: 'mock-link',
    props
  })
}))

jest.mock('@fortawesome/react-fontawesome', () => ({
  FontAwesomeIcon: (props: Record<string, unknown>) => ({
    type: 'mock-fontawesome-icon',
    props
  })
}))

jest.mock('../../LibrarySearchBar', () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => ({
    type: 'mock-librarysearchbar',
    props
  })
}))

jest.mock('../../NavShell/components/FilterViewList', () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => ({
    type: 'mock-filterviewlist',
    props
  })
}))

jest.mock('../../NavShell/components/FilterCollectionList', () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => ({
    type: 'mock-filtercollectionlist',
    props
  })
}))

jest.mock('../../NavShell/components/FilterStoreFacet', () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => ({
    type: 'mock-filterstorefacet',
    props
  })
}))

jest.mock('../../NavShell/components/FilterRunnabilityFacet', () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => ({
    type: 'mock-filterrunnabilityfacet',
    props
  })
}))

jest.mock('../../NavShell/components/FilterMoreGroup', () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => ({
    type: 'mock-filtermoregroup',
    props
  })
}))

// Imported after the mocks above (textual order -- this project's ts-jest
// setup does not hoist jest.mock like babel-jest). Importing the same
// mocked bindings here lets tests assert type IDENTITY rather than string
// names -- a string-name comparison would pass even if the wrong component
// ended up under the wrong anchor (see `SettingsPanel.test.tsx` /
// 34.10-02 SUMMARY Deviation 1, and RESEARCH.md's note on
// `FilterStoreFacet` rendering `null` for zero connected stores, which is
// exactly why this plan wraps groups rather than picking one representative
// element).
import { Link } from 'react-router-dom'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import FilterViewList from '../../NavShell/components/FilterViewList'
import FilterCollectionList from '../../NavShell/components/FilterCollectionList'
import FilterStoreFacet from '../../NavShell/components/FilterStoreFacet'
import FilterRunnabilityFacet from '../../NavShell/components/FilterRunnabilityFacet'
import FilterMoreGroup from '../../NavShell/components/FilterMoreGroup'
import Header from '../index'

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

function findByDataTour(tree: ReactNode, value: string): AnyElement[] {
  return collectElements(tree).filter((el) => el.props?.['data-tour'] === value)
}

const HEADER_CSS_PATH = join(__dirname, '..', 'index.css')

function read(path: string): string {
  return readFileSync(path, 'utf8')
}

// Brace-counted block extractor, copied from
// `Login/__tests__/index.test.tsx` -- scopes an assertion to a single
// selector's declaration body so a whole-file grep cannot pass on
// `.Header`'s own `gap: var(--space-md)` declaration and prove nothing
// about the two new wrappers.
function cssBlock(source: string, selector: string): string {
  const start = source.indexOf(`${selector} {`)
  if (start === -1) {
    throw new Error(`selector ${selector} not found`)
  }
  let depth = 0
  for (let i = source.indexOf('{', start); i < source.length; i++) {
    if (source[i] === '{') depth++
    if (source[i] === '}') {
      depth--
      if (depth === 0) {
        return source.slice(source.indexOf('{', start) + 1, i)
      }
    }
  }
  throw new Error(`unterminated block for ${selector}`)
}

describe('Header tour anchors (34.12-02, D-09)', () => {
  it('exactly one element carries data-tour="library-views-collections", wrapping FilterViewList and FilterCollectionList by identity', () => {
    const tree = Header() as unknown as ReactElement
    const matches = findByDataTour(tree, 'library-views-collections')
    expect(matches).toHaveLength(1)

    const childTypes = collectElements(matches[0].props.children).map(
      (el) => el.type
    )
    expect(childTypes).toContain(FilterViewList)
    expect(childTypes).toContain(FilterCollectionList)
  })

  it('exactly one element carries data-tour="library-facets", wrapping FilterStoreFacet, FilterRunnabilityFacet and FilterMoreGroup by identity', () => {
    const tree = Header() as unknown as ReactElement
    const matches = findByDataTour(tree, 'library-facets')
    expect(matches).toHaveLength(1)

    const childTypes = collectElements(matches[0].props.children).map(
      (el) => el.type
    )
    expect(childTypes).toContain(FilterStoreFacet)
    expect(childTypes).toContain(FilterRunnabilityFacet)
    expect(childTypes).toContain(FilterMoreGroup)
  })

  it('.Header has exactly four direct children: a leading Header__utilities row, then Header__search', () => {
    const tree = Header() as unknown as ReactElement
    const children = topLevelChildren(tree)
    expect(children).toHaveLength(4)
    expect(children[0].props?.className).toBe('Header__utilities')
    expect(children[1].props?.className).toBe('Header__search')
  })

  it('Header__utilities holds exactly one Console Mode Link, by identity, with an accessible name and no visible text', () => {
    const tree = Header() as unknown as ReactElement
    const children = topLevelChildren(tree)
    const utilities = children[0]

    const linkEls = collectElements(utilities.props.children).filter(
      (el) => el.type === Link
    )
    expect(linkEls).toHaveLength(1)

    const link = linkEls[0]
    expect(link.props.to).toBe('/console')
    expect(link.props['aria-label']).toBe('Console Mode')
    expect(link.props.title).toBe('Console Mode')

    const iconEls = collectElements(link.props.children).filter(
      (el) => el.type === FontAwesomeIcon
    )
    expect(iconEls).toHaveLength(1)
  })

  it('the Console Mode Link carries no data-tour, so the two findByDataTour uniqueness assertions above stay meaningful', () => {
    const tree = Header() as unknown as ReactElement
    const children = topLevelChildren(tree)
    const utilities = children[0]

    const linkEls = collectElements(utilities.props.children).filter(
      (el) => el.type === Link
    )
    expect(linkEls[0].props['data-tour']).toBeUndefined()
  })

  it('both new wrappers restate the .Header gap they intercepted, scoped per wrapper block', () => {
    const source = read(HEADER_CSS_PATH)

    const categoriesBlock = cssBlock(source, '.Header__categoriesGroup')
    expect(categoriesBlock).toMatch(/display:\s*flex/)
    expect(categoriesBlock).toMatch(/flex-direction:\s*column/)
    expect(categoriesBlock).toMatch(/gap:\s*var\(--space-md\)/)

    const filtersBlock = cssBlock(source, '.Header__filtersGroup')
    expect(filtersBlock).toMatch(/display:\s*flex/)
    expect(filtersBlock).toMatch(/flex-direction:\s*column/)
    expect(filtersBlock).toMatch(/gap:\s*var\(--space-md\)/)
  })
})
