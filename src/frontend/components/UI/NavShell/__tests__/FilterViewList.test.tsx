/**
 * Structural tests for `FilterViewList`, the quick-filter chip row of the
 * Games tier-2 filter panel (34.11-06 Task 1; rewritten quick 261029-riq).
 *
 * No jsdom / react-test-renderer is installed in this project (see
 * `src/frontend/jest.config.js` docstring) -- `FilterViewList` is invoked
 * directly as a plain function and its returned React-element object graph
 * is inspected without a DOM, following the "mock react (useContext) +
 * react-i18next (useTranslation)" pattern established by
 * `StoresPanel.test.tsx`.
 */
import type { ReactElement, ReactNode } from 'react'
import { readFileSync } from 'fs'
import { join } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'

jest.mock('../components/FilterViewList/index.scss', () => ({}))

type MockContextValue = {
  installedOnly: boolean
  setInstalledOnly: jest.Mock
  nativeOnly: boolean
  setNativeOnly: jest.Mock
  nativeFilterAvailable: boolean
}

function makeContext(
  overrides: Partial<MockContextValue> = {}
): MockContextValue {
  return {
    installedOnly: false,
    setInstalledOnly: jest.fn(),
    nativeOnly: false,
    setNativeOnly: jest.fn(),
    nativeFilterAvailable: true,
    ...overrides
  }
}

let contextValue: MockContextValue = makeContext()

jest.mock('react', () => ({
  ...jest.requireActual<typeof import('react')>('react'),
  useContext: () => contextValue
}))

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, defaultValue: string): string => defaultValue
  })
}))

// Imported after the mocks above (textual order -- this project's ts-jest
// setup does not hoist jest.mock like babel-jest).
import FilterViewList from '../components/FilterViewList'

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

function chipsOf(tree: ReactNode): AnyElement[] {
  return collectElements(tree).filter((el) => el.type === 'button')
}

function labelOf(chip: AnyElement): unknown {
  return chip.props.children
}

const render = () => FilterViewList() as unknown as ReactElement

beforeEach(() => {
  contextValue = makeContext()
})

describe('FilterViewList (quick 261029-riq)', () => {
  it('renders, in order, the Installed chip, an aria-hidden divider, then the All and Native chips', () => {
    const tree = render()
    const kids = collectElements(tree).filter(
      (el) =>
        el.type === 'button' ||
        (el.type === 'span' && el.props.className === 'FilterViewList__divider')
    )

    expect(kids.map((el) => el.type)).toEqual([
      'button',
      'span',
      'button',
      'button'
    ])
    expect(kids[1].props['aria-hidden']).toBe('true')
    expect(chipsOf(tree).map(labelOf)).toEqual([
      'Installed',
      'All games',
      'Native'
    ])
    expect(
      chipsOf(tree).every(
        (el) =>
          el.props.type === 'button' &&
          String(el.props.className).includes('FilterViewList__chip')
      )
    ).toBe(true)
  })

  it('Installed follows installedOnly and toggles it without touching nativeOnly', () => {
    const setInstalledOnly = jest.fn()
    const setNativeOnly = jest.fn()
    contextValue = makeContext({
      installedOnly: true,
      setInstalledOnly,
      setNativeOnly
    })
    const [installed] = chipsOf(render())

    expect(installed.props['aria-pressed']).toBe(true)
    expect(String(installed.props.className)).toContain('active')
    ;(installed.props.onClick as () => void)()
    expect(setInstalledOnly).toHaveBeenCalledWith(false)
    expect(setNativeOnly).not.toHaveBeenCalled()
  })

  it('with nativeOnly false All is pressed and Native is not; with true the reverse', () => {
    let [, all, native] = chipsOf(render())
    expect(all.props['aria-pressed']).toBe(true)
    expect(native.props['aria-pressed']).toBe(false)

    contextValue = makeContext({ nativeOnly: true })
    ;[, all, native] = chipsOf(render())
    expect(all.props['aria-pressed']).toBe(false)
    expect(native.props['aria-pressed']).toBe(true)
    expect(String(native.props.className)).toContain('active')
  })

  it('All calls setNativeOnly(false), Native calls setNativeOnly(true), neither touches installedOnly; re-clicking the active one is idempotent', () => {
    const setNativeOnly = jest.fn()
    const setInstalledOnly = jest.fn()
    contextValue = makeContext({ setNativeOnly, setInstalledOnly })
    const [, all, native] = chipsOf(render())
    ;(all.props.onClick as () => void)()
    expect(setNativeOnly).toHaveBeenLastCalledWith(false)
    ;(native.props.onClick as () => void)()
    expect(setNativeOnly).toHaveBeenLastCalledWith(true)
    expect(setInstalledOnly).not.toHaveBeenCalled()
  })

  it('with nativeFilterAvailable false (win32) only the Installed chip renders: no divider, no All, no Native', () => {
    contextValue = makeContext({ nativeFilterAvailable: false })
    const tree = render()

    expect(chipsOf(tree).map(labelOf)).toEqual(['Installed'])
    expect(
      collectElements(tree).filter(
        (el) => el.props.className === 'FilterViewList__divider'
      )
    ).toHaveLength(0)
  })

  it('has no Recently played or Favourites chip', () => {
    const labels = chipsOf(render()).map(labelOf)
    expect(labels).not.toContain('Recently played')
    expect(labels).not.toContain('Favourites')
  })

  it('every label is routed through a literal tGamelib(key, default) call site', () => {
    const source = stripSourceComments(
      readFileSync(
        join(__dirname, '..', 'components', 'FilterViewList', 'index.tsx'),
        'utf8'
      )
    )
    expect(source.match(/tGamelib\(\s*'gamelib:/g)).toHaveLength(3)
    expect(source).toContain("'gamelib:library.filterPanel.native'")
    expect(source).toContain("'gamelib:library.filterPanel.viewAll'")
  })
})

describe('FilterViewList -- D-34 (search is inherited from Header, not rebuilt here)', () => {
  // D-34 is decided nowhere else in the phase. Search is ALREADY at the top
  // of the Games tier-2 panel because `Header` is portalled into the tier-2
  // slot at `Library/index.tsx:819` -- this plan neither moves it nor
  // reimplements it here, and plan 09's rewrite of `Header` must not drop
  // it while replacing everything around it (CategoryFilter, LibraryFilters).
  const headerSource = readFileSync(
    join(__dirname, '..', '..', 'Header', 'index.tsx'),
    'utf8'
  )

  it("Header still imports LibrarySearchBar from '../LibrarySearchBar'", () => {
    expect(headerSource).toMatch(
      /import LibrarySearchBar from '\.\.\/LibrarySearchBar'/
    )
  })

  it('Header still renders <LibrarySearchBar />', () => {
    expect(headerSource).toMatch(/<LibrarySearchBar \/>/)
  })

  it('the gate above is non-vacuous -- proven to fail against a known-bad literal', () => {
    const corrupted = headerSource.replace(
      '<LibrarySearchBar />',
      '<NotTheSearchBar />'
    )
    expect(corrupted).not.toMatch(/<LibrarySearchBar \/>/)
    // headerSource itself was never mutated -- the real gate above still
    // runs against the genuine file on every test run.
    expect(headerSource).toMatch(/<LibrarySearchBar \/>/)
  })
})
