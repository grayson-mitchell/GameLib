/**
 * Container-level proof for `WinetricksBrowse/index.tsx` (Phase 44, plan 04):
 * browse/search composition, D-14 parser order, D-02 curated duplication,
 * D-03 silent skip, D-13's installed-in-search reversal, the zero-result
 * recovery path, D-04's reset-on-open, UI-SPEC Interaction Contract §2's
 * expand-state survival across a search round-trip, C-2 / REQ-44-26 (no
 * selection/highlight state; every action bound to the row's own verb), and
 * Interaction Contract §1 (no `suggestionsListItems`).
 *
 * No jsdom / react-test-renderer is installed in this project (see
 * `src/frontend/jest.config.js`); harness copied from
 * `WinetricksSearch/__tests__/winetricksInstallMouseRace.test.tsx` and
 * `WinetricksBrowse/__tests__/rowStates.test.tsx` (plan 44-03), extended
 * with a `useMemo` mock -- the container uses `useMemo` three times and
 * neither existing harness mocks it, so falling through to the real
 * `actualReact.useMemo` here would throw React's "invalid hook call"
 * invariant (no dispatcher outside an actual render).
 *
 * `SearchBar` and `Dropdown` are mocked entirely (not just their `.scss`
 * imports): both are real components invoked as plain functions elsewhere
 * in the app, and this file never invokes either -- JSX only ever
 * *constructs* an element object (`{type, props}`) for a function-component
 * type, it does not call the function. `Dropdown` additionally owns real
 * internal state (`useState(false)` for `isExpanded`) and a `window.api`
 * side effect on expand that has no stand-in under `testEnvironment:
 * 'node'`, so its mock below models JUST the one behaviour these tests
 * need -- expand/collapse survives while an instance stays "mounted"
 * (present in the tree) and is lost when it is not -- via a
 * reconcile-by-presence bookkeeping map the tests drive explicitly. `Row`
 * (plan 44-03) is NOT mocked: it is invoked directly (mirroring
 * `rowStates.test.tsx`) wherever a test needs to reach its actual button
 * handlers (C-2).
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import type { WinetricksComponent } from 'common/types'
import type { VerbErrorMap } from 'common/winetricks/deriveRowState'

jest.mock('../index.scss', () => ({}))
jest.mock('../Row/index.scss', () => ({}))

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    // Unlike the plain pass-through mocks elsewhere in this codebase, this
    // one actually interpolates `{{token}}` -- the zero-result test below
    // asserts the query round-trips, not merely that a key was looked up.
    // Also supports the i18next v4 plural-group call shape
    // `t(key, { count, defaultValue, defaultValue_one, ...interp })` that
    // `resultsHeading` now uses (260925-88h): picks `defaultValue_one` when
    // `count === 1`, else `defaultValue`, before interpolating.
    t: (
      _key: string,
      defaultValueOrOptions?: string | Record<string, unknown>,
      maybeOptions?: Record<string, unknown>
    ): string => {
      const usingOptionsForm = typeof defaultValueOrOptions !== 'string'
      const options = usingOptionsForm ? defaultValueOrOptions : maybeOptions

      const defaultValue = usingOptionsForm
        ? String(
            (options?.count === 1 ? options?.defaultValue_one : undefined) ??
              options?.defaultValue
          )
        : defaultValueOrOptions

      if (!options) return defaultValue
      let result = defaultValue
      for (const optKey of Object.keys(options)) {
        result = result.split(`{{${optKey}}}`).join(String(options[optKey]))
      }
      return result
    }
  })
}))

// Entire-component mock (see file header). JSX only ever *constructs* an
// element (`{type: SearchBar, props}`) for a function-component type -- it
// never calls the function -- so the props the container passes are already
// sitting on the element via `props`, unmodified, whether or not the type
// is mocked. This stub exists only to (a) give `type` a stable, importable
// reference to match on below, and (b) stand in for the real module so its
// own `./index.scss` import (and `searchProbe.ts` side effects) never load.
jest.mock('../../../SearchBar', () => ({
  __esModule: true,
  default: () => null
}))

// Entire-component mock (see file header, and the SearchBar mock's comment
// above on why JSX-constructed elements never invoke their type). `title`
// and `children` are already sitting unmodified on the element's `props` --
// this stub's own body is never called by anything below, it exists only
// as a stable `type` reference to match on and to stand in for the real
// module's `useState`/`window.api` side effects and `./index.scss` import.
// Expand/collapse is tracked externally via `__mockDropdown`, keyed by the
// category's own title text (the first text leaf under the `title` prop --
// the `WinetricksBrowse__groupTitle` span's content, ahead of the sibling
// count span). `reconcile(presentKeys)` prunes any key not present in the
// most recent render pass, modelling what real React does to a component's
// internal state when it is unmounted (rather than kept mounted with a
// `display: none` ancestor) -- see the "expand-state survival" and
// "pane-mounting" tests below, and `44-04-PLAN.md`'s negative control C.
jest.mock('../../../Dropdown', () => {
  let expandedByKey = new Map<string, boolean>()
  let mountedKeys = new Set<string>()

  function firstTextLeaf(node: unknown): string {
    if (node === null || node === undefined || typeof node === 'boolean') {
      return ''
    }
    if (typeof node === 'string' || typeof node === 'number') {
      return String(node)
    }
    if (Array.isArray(node)) {
      for (const child of node) {
        const text = firstTextLeaf(child)
        if (text !== '') return text
      }
      return ''
    }
    if (
      typeof node === 'object' &&
      'props' in (node as Record<string, unknown>)
    ) {
      const children = (node as { props?: { children?: unknown } }).props
        ?.children
      return firstTextLeaf(children)
    }
    return ''
  }

  return {
    __esModule: true,
    default: () => null,
    __mockDropdown: {
      textOf: firstTextLeaf,
      reconcile(presentKeys: string[]) {
        for (const key of Array.from(mountedKeys)) {
          if (!presentKeys.includes(key)) {
            expandedByKey.delete(key)
          }
        }
        mountedKeys = new Set(presentKeys)
      },
      toggle(key: string) {
        expandedByKey.set(key, !(expandedByKey.get(key) ?? false))
      },
      isExpanded(key: string) {
        return expandedByKey.get(key) ?? false
      },
      resetAll() {
        expandedByKey = new Map()
        mountedKeys = new Set()
      }
    }
  }
})

jest.mock('react', () => {
  const actualReact = jest.requireActual<typeof import('react')>('react')
  let stateSlots: unknown[] = []
  let stateCursor = 0
  let memoSlots: unknown[] = []
  let memoDeps: (unknown[] | undefined)[] = []
  let memoCursor = 0
  let refSlots: { current: unknown }[] = []
  let refCursor = 0

  const depsChanged = (
    prev: unknown[] | undefined,
    next: unknown[] | undefined
  ): boolean => {
    if (!prev || !next) return true
    if (prev.length !== next.length) return true
    return prev.some((d, i) => !Object.is(d, next[i]))
  }

  return {
    ...actualReact,
    useState: (initial: unknown) => {
      const idx = stateCursor++
      if (idx >= stateSlots.length) {
        stateSlots[idx] =
          typeof initial === 'function' ? (initial as () => unknown)() : initial
      }
      const setState = (updater: unknown) => {
        stateSlots[idx] =
          typeof updater === 'function'
            ? (updater as (prev: unknown) => unknown)(stateSlots[idx])
            : updater
      }
      return [stateSlots[idx], setState]
    },
    // Added for this task -- neither `rowStates.test.tsx` nor
    // `winetricksInstallMouseRace.test.tsx` mocks `useMemo` (the container
    // is the first component in this phase to use it). Same deps-array
    // comparison as the existing `useEffect` mock elsewhere in this repo's
    // harnesses, cached-value instead of a cleanup-returning effect.
    useMemo: (factory: () => unknown, deps?: unknown[]) => {
      const idx = memoCursor++
      if (idx >= memoSlots.length || depsChanged(memoDeps[idx], deps)) {
        memoDeps[idx] = deps
        memoSlots[idx] = factory()
      }
      return memoSlots[idx]
    },
    useRef: (initial: unknown) => {
      const idx = refCursor++
      if (idx >= refSlots.length) {
        refSlots[idx] = { current: initial }
      }
      return refSlots[idx]
    },
    __beginRender: () => {
      stateCursor = 0
      memoCursor = 0
      refCursor = 0
    },
    __resetMount: () => {
      stateSlots = []
      stateCursor = 0
      memoSlots = []
      memoDeps = []
      memoCursor = 0
      refSlots = []
      refCursor = 0
    }
  }
})

import WinetricksBrowse from '../index'
import Row from '../Row'
import SearchBar from '../../../SearchBar'
import Dropdown from '../../../Dropdown'

type HookHarness = { __beginRender: () => void; __resetMount: () => void }

function harness(): HookHarness {
  return jest.requireMock('react') as unknown as HookHarness
}

type MockDropdown = {
  textOf: (node: unknown) => string
  reconcile: (presentKeys: string[]) => void
  toggle: (key: string) => void
  isExpanded: (key: string) => boolean
  resetAll: () => void
}

function mockDropdown(): MockDropdown {
  return (
    jest.requireMock('../../../Dropdown') as unknown as {
      __mockDropdown: MockDropdown
    }
  ).__mockDropdown
}

interface ElementLike {
  type: unknown
  props: Record<string, unknown> & { children?: unknown }
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

function hasClass(el: ElementLike, token: string): boolean {
  const cn = el.props.className
  return typeof cn === 'string' && cn.split(/\s+/).includes(token)
}

function findByClass(
  tree: ElementLike,
  token: string
): ElementLike | undefined {
  let found: ElementLike | undefined
  walk(tree, (el) => {
    if (!found && hasClass(el, token)) found = el
  })
  return found
}

function findAllByType(tree: ElementLike, type: unknown): ElementLike[] {
  const found: ElementLike[] = []
  walk(tree, (el) => {
    if (el.type === type) found.push(el)
  })
  return found
}

function findMockSearchBar(tree: ElementLike): ElementLike {
  const [el] = findAllByType(tree, SearchBar)
  if (!el) {
    throw new Error(
      'no mock-searchbar element found -- this test proves nothing'
    )
  }
  return el
}

// ---------------------------------------------------------------------------
// Fixture: 12 components across 4 categories in a deliberately
// non-alphabetical emission order (zeta, alpha, mid, omega -- alphabetical
// would be alpha, mid, omega, zeta), spanning: 7 of the 8 curated verbs
// (vcrun2010 is deliberately ABSENT -- the D-03 silent-skip case), one
// Needs-GUI verb (3dmark03), one cached:true entry (corefonts), and one
// entry ('grommet') whose title matches a query its verb does not.
// ---------------------------------------------------------------------------
const FIXTURE: WinetricksComponent[] = [
  {
    verb: 'vcrun2019',
    title: 'Visual C++ 2019 libraries',
    category: 'zeta',
    cached: false
  },
  {
    verb: 'vcrun2013',
    title: 'Visual C++ 2013 libraries',
    category: 'zeta',
    cached: false
  },
  {
    verb: 'dotnet48',
    title: '.NET Framework 4.8',
    category: 'zeta',
    cached: false
  },
  {
    verb: 'corefonts',
    title: 'MS Core Fonts',
    category: 'alpha',
    cached: true
  },
  {
    verb: 'physx',
    title: 'PhysX runtime libraries',
    category: 'alpha',
    cached: false
  },
  { verb: 'xact', title: 'XACT audio engine', category: 'mid', cached: false },
  {
    verb: '3dmark03',
    title: '3DMark03 benchmark suite',
    category: 'mid',
    cached: false
  },
  {
    verb: 'grommet',
    title: 'Special Zonk Item',
    category: 'mid',
    cached: false
  },
  {
    verb: 'd3dx9',
    title: 'DirectX 9 libraries',
    category: 'zeta',
    cached: false
  },
  {
    verb: 'notacurated1',
    title: 'Random Tool One',
    category: 'alpha',
    cached: false
  },
  {
    verb: 'notacurated2',
    title: 'Random Tool Two',
    category: 'zeta',
    cached: false
  },
  { verb: 'zzzlast', title: 'ZZZ Last Tool', category: 'omega', cached: false }
]

type ContainerProps = {
  allComponents: WinetricksComponent[]
  installed: readonly string[]
  installing: boolean
  installingComponent: string
  erroredVerbs: VerbErrorMap
  loadingAvailable: boolean
  isRevalidatingInstalled: boolean
  onInstall: (verb: string) => void
  onOpenGui: () => void
}

function baseProps(overrides: Partial<ContainerProps> = {}): ContainerProps {
  return {
    allComponents: FIXTURE,
    installed: [],
    installing: false,
    installingComponent: '',
    erroredVerbs: {},
    loadingAvailable: false,
    isRevalidatingInstalled: false,
    onInstall: () => undefined,
    onOpenGui: () => undefined,
    ...overrides
  }
}

function reconcileDropdowns(tree: ElementLike): void {
  const keys = findAllByType(tree, Dropdown).map((el) =>
    mockDropdown().textOf(el.props.title)
  )
  mockDropdown().reconcile(keys)
}

function mountContainer(props: ContainerProps): ElementLike {
  harness().__resetMount()
  harness().__beginRender()
  const tree = WinetricksBrowse(props) as unknown as ElementLike
  reconcileDropdowns(tree)
  return tree
}

function reinvokeContainer(props: ContainerProps): ElementLike {
  harness().__beginRender()
  const tree = WinetricksBrowse(props) as unknown as ElementLike
  reconcileDropdowns(tree)
  return tree
}

type RowProps = {
  component: WinetricksComponent
  installed: readonly string[]
  installing: boolean
  installingComponent: string
  erroredVerbs: VerbErrorMap
  onInstall: (verb: string) => void
  onOpenGui: () => void
}

// Isolated from the container's own hook state -- `Row` is a logically
// independent component in real React; a full `__resetMount()` before
// invoking it sidesteps any risk of the container's and Row's hook slots
// colliding under this single shared-cursor harness.
function renderRow(props: RowProps): ElementLike {
  harness().__resetMount()
  harness().__beginRender()
  return Row(props) as unknown as ElementLike
}

beforeEach(() => {
  mockDropdown().resetAll()
})

describe('default/browse', () => {
  it('grouped pane visible, flat pane hidden, curated group renders, one Dropdown per distinct category', () => {
    const tree = mountContainer(baseProps())

    const groupedPane = findByClass(tree, 'WinetricksBrowse__pane--grouped')
    expect(groupedPane).toBeDefined()
    expect(hasClass(groupedPane!, 'WinetricksBrowse__pane--hidden')).toBe(false)

    const flatPane = findByClass(tree, 'WinetricksBrowse__pane--flat')
    expect(flatPane).toBeDefined()
    expect(hasClass(flatPane!, 'WinetricksBrowse__pane--hidden')).toBe(true)

    expect(findByClass(tree, 'WinetricksBrowse__group--curated')).toBeDefined()
    expect(findAllByType(tree, Dropdown)).toHaveLength(4)
  })

  it('every fixture component renders a row (D-07: no windowing, no slicing)', () => {
    const tree = mountContainer(baseProps())
    // Curated duplicates (D-02) mean total row count > fixture length --
    // count distinct verbs instead.
    const verbs = new Set(
      findAllByType(tree, Row).map(
        (el) => (el.props as { component: WinetricksComponent }).component.verb
      )
    )
    expect(verbs.size).toBe(FIXTURE.length)
  })
})

describe('D-14: parser emission order, never alphabetical', () => {
  it('category groups appear in first-occurrence order', () => {
    const tree = mountContainer(baseProps())
    const dropdownEls = findAllByType(tree, Dropdown)
    const categoryOrder = dropdownEls.map((el) =>
      mockDropdown().textOf(el.props.title)
    )

    expect(categoryOrder).toEqual(['zeta', 'alpha', 'mid', 'omega'])
    // Sanity: alphabetical order would visibly differ -- proves this
    // fixture can actually distinguish "parser order" from "sorted".
    expect(categoryOrder).not.toEqual([...categoryOrder].sort())
  })

  it('rows within a group appear in fixture order', () => {
    const tree = mountContainer(baseProps())
    const zetaEl = findAllByType(tree, Dropdown).find(
      (el) => mockDropdown().textOf(el.props.title) === 'zeta'
    )
    expect(zetaEl).toBeDefined()

    const zetaVerbs = findAllByType(zetaEl!, Row).map(
      (el) => (el.props as { component: WinetricksComponent }).component.verb
    )
    expect(zetaVerbs).toEqual([
      'vcrun2019',
      'vcrun2013',
      'dotnet48',
      'd3dx9',
      'notacurated2'
    ])
    // Sanity: alphabetical order would visibly differ.
    expect(zetaVerbs).not.toEqual([...zetaVerbs].sort())
  })
})

describe('D-02: curated duplication (curated is a shortcut, not a partition)', () => {
  it('a curated verb present in the fixture appears BOTH in the curated group and in its own category group', () => {
    const tree = mountContainer(baseProps())
    const vcrunRows = findAllByType(tree, Row).filter(
      (el) =>
        (el.props as { component: WinetricksComponent }).component.verb ===
        'vcrun2019'
    )
    expect(vcrunRows).toHaveLength(2)
  })
})

describe('D-03: a curated verb absent from the parsed set is skipped silently', () => {
  it('the curated group resolves the remaining 7 verbs, in curated order, with no placeholder for the missing vcrun2010', () => {
    const tree = mountContainer(baseProps())
    const curatedGroup = findByClass(tree, 'WinetricksBrowse__group--curated')
    expect(curatedGroup).toBeDefined()

    const curatedVerbs = findAllByType(curatedGroup!, Row).map(
      (el) => (el.props as { component: WinetricksComponent }).component.verb
    )
    expect(curatedVerbs).toEqual([
      'vcrun2019',
      'vcrun2013',
      'dotnet48',
      'd3dx9',
      'xact',
      'corefonts',
      'physx'
    ])

    const allVerbsAnywhere = findAllByType(tree, Row).map(
      (el) => (el.props as { component: WinetricksComponent }).component.verb
    )
    expect(allVerbsAnywhere).not.toContain('vcrun2010')
  })
})

describe('search -> flat list', () => {
  it('a 2+ character query hides the grouped pane, shows the flat pane, and renders one row per match', () => {
    let tree = mountContainer(baseProps())
    const onInputChanged = findMockSearchBar(tree).props.onInputChanged as (
      text: string
    ) => void
    onInputChanged('vcrun')
    tree = reinvokeContainer(baseProps())

    const groupedPane = findByClass(tree, 'WinetricksBrowse__pane--grouped')!
    expect(hasClass(groupedPane, 'WinetricksBrowse__pane--hidden')).toBe(true)
    const flatPane = findByClass(tree, 'WinetricksBrowse__pane--flat')!
    expect(hasClass(flatPane, 'WinetricksBrowse__pane--hidden')).toBe(false)

    const flatVerbs = findAllByType(flatPane, Row)
      .map(
        (el) => (el.props as { component: WinetricksComponent }).component.verb
      )
      .sort()
    expect(flatVerbs).toEqual(['vcrun2013', 'vcrun2019'])
  })

  it('matches a query that appears only in the title, never in the verb', () => {
    let tree = mountContainer(baseProps())
    const onInputChanged = findMockSearchBar(tree).props.onInputChanged as (
      text: string
    ) => void
    onInputChanged('zonk')
    tree = reinvokeContainer(baseProps())

    const flatPane = findByClass(tree, 'WinetricksBrowse__pane--flat')!
    const flatVerbs = findAllByType(flatPane, Row).map(
      (el) => (el.props as { component: WinetricksComponent }).component.verb
    )
    expect(flatVerbs).toEqual(['grommet'])
  })
})

describe('search threshold', () => {
  it('a 1-character query leaves the grouped pane visible', () => {
    let tree = mountContainer(baseProps())
    const onInputChanged = findMockSearchBar(tree).props.onInputChanged as (
      text: string
    ) => void
    onInputChanged('v')
    tree = reinvokeContainer(baseProps())

    const groupedPane = findByClass(tree, 'WinetricksBrowse__pane--grouped')!
    expect(hasClass(groupedPane, 'WinetricksBrowse__pane--hidden')).toBe(false)
    const flatPane = findByClass(tree, 'WinetricksBrowse__pane--flat')!
    expect(hasClass(flatPane, 'WinetricksBrowse__pane--hidden')).toBe(true)
  })
})

describe('D-13 (reversal): installed components appear in search results', () => {
  it('a query matching an INSTALLED verb returns a row for it -- the old installed-filter returned nothing here', () => {
    const props = baseProps({ installed: ['physx'] })
    let tree = mountContainer(props)
    const onInputChanged = findMockSearchBar(tree).props.onInputChanged as (
      text: string
    ) => void
    onInputChanged('physx')
    tree = reinvokeContainer(props)

    const flatPane = findByClass(tree, 'WinetricksBrowse__pane--flat')!
    const flatVerbs = findAllByType(flatPane, Row).map(
      (el) => (el.props as { component: WinetricksComponent }).component.verb
    )
    expect(flatVerbs).toEqual(['physx'])
  })
})

describe('zero-result', () => {
  it('shows the heading with the interpolated query and a Clear search button; invoking it returns to the grouped view', () => {
    let tree = mountContainer(baseProps())
    const onInputChanged = findMockSearchBar(tree).props.onInputChanged as (
      text: string
    ) => void
    onInputChanged('zzznotfound')
    tree = reinvokeContainer(baseProps())

    const heading = findByClass(tree, 'WinetricksBrowse__zeroResultHeading')
    expect(heading).toBeDefined()
    expect(heading!.props.children as string).toContain('zzznotfound')

    const clearButton = findByClass(tree, 'WinetricksBrowse__clearSearchButton')
    expect(clearButton).toBeDefined()
    const onClick = clearButton!.props.onClick as (() => void) | undefined
    expect(typeof onClick).toBe('function')
    onClick!()

    tree = reinvokeContainer(baseProps())
    const groupedPane = findByClass(tree, 'WinetricksBrowse__pane--grouped')!
    expect(hasClass(groupedPane, 'WinetricksBrowse__pane--hidden')).toBe(false)
  })
})

describe('D-04: expand/collapse resets to Default on every fresh mount', () => {
  it('an expanded category does not survive a genuinely fresh mount (dialog re-open)', () => {
    let tree = mountContainer(baseProps())
    expect(mockDropdown().isExpanded('zeta')).toBe(false)
    mockDropdown().toggle('zeta')
    expect(mockDropdown().isExpanded('zeta')).toBe(true)

    // A dialog re-open recreates the WHOLE React tree from scratch -- every
    // `Dropdown` instance mounts fresh, per the container's own header
    // comment ("no persistence surface to build or forget to clear").
    // `resetAll()` models that reset trigger; `__resetMount()` (inside
    // `mountContainer`) models the container's own hook state doing the
    // same.
    mockDropdown().resetAll()
    tree = mountContainer(baseProps())
    expect(mockDropdown().isExpanded('zeta')).toBe(false)

    // Structural half of D-04: the container never passes any prop capable
    // of overriding Dropdown's own collapse-by-default, so the reset above
    // is guaranteed by what the container passes, not a coincidence of this
    // test's own bookkeeping.
    for (const el of findAllByType(tree, Dropdown)) {
      for (const forbidden of [
        'isExpanded',
        'expanded',
        'defaultExpanded',
        'open'
      ]) {
        expect((el.props as Record<string, unknown>)[forbidden]).toBeUndefined()
      }
    }
  })
})

describe('UI-SPEC Interaction Contract §2: expand-state survives a search round-trip', () => {
  it('a category expanded before searching is still expanded after clearing the search', () => {
    let tree = mountContainer(baseProps())
    mockDropdown().toggle('zeta')
    expect(mockDropdown().isExpanded('zeta')).toBe(true)

    const onInputChanged = findMockSearchBar(tree).props.onInputChanged as (
      text: string
    ) => void
    onInputChanged('vcrun')
    tree = reinvokeContainer(baseProps())
    // Both panes stay mounted (planner decision §1) -- all 4 category
    // Dropdowns must still be present in the tree while the grouped pane is
    // merely hidden via CSS.
    expect(findAllByType(tree, Dropdown)).toHaveLength(4)

    const clearOnInputChanged = findMockSearchBar(tree).props
      .onInputChanged as (text: string) => void
    clearOnInputChanged('')
    tree = reinvokeContainer(baseProps())

    expect(mockDropdown().isExpanded('zeta')).toBe(true)
  })
})

describe("C-2 / REQ-44-26: no selection state; every action bound to the row's own verb", () => {
  it('holds exactly one useState call in source', () => {
    const source = readFileSync(join(__dirname, '..', 'index.tsx'), 'utf8')
    // Anchored on the assignment (`= useState(`), not bare `useState(` --
    // the container's own header comment at line 53 names the pattern in
    // prose ("it lives inside each `Dropdown` instance (`useState(false)`)")
    // to explain why expand state is NOT lifted here, and a bare-keyword
    // regex would count that prose as a second call (see this repo's own
    // recorded gotcha: a raw-source gate can be satisfied by the prose that
    // names it).
    const matches = source.match(/=\s*useState\s*\(/g) ?? []
    expect(matches).toHaveLength(1)
  })

  it("an available row's Install button invokes onInstall with that row's own verb", () => {
    const onInstall = jest.fn()
    const tree = mountContainer(baseProps({ onInstall }))
    const rowEl = findAllByType(tree, Row).find(
      (el) =>
        (el.props as { component: WinetricksComponent }).component.verb ===
        'notacurated1'
    )
    expect(rowEl).toBeDefined()

    const rowTree = renderRow(rowEl!.props as unknown as RowProps)
    const button = findByClass(rowTree, 'WinetricksBrowse__installButton')
    expect(button).toBeDefined()
    const onMouseDown = button!.props.onMouseDown as
      | ((e: { preventDefault: () => void }) => void)
      | undefined
    expect(typeof onMouseDown).toBe('function')
    onMouseDown!({ preventDefault: () => undefined })

    expect(onInstall).toHaveBeenCalledWith('notacurated1')
  })

  it("an errored row's Retry button invokes onInstall with that row's own verb", () => {
    const onInstall = jest.fn()
    const tree = mountContainer(
      baseProps({ onInstall, erroredVerbs: { grommet: true } })
    )
    const rowEl = findAllByType(tree, Row).find(
      (el) =>
        (el.props as { component: WinetricksComponent }).component.verb ===
        'grommet'
    )
    expect(rowEl).toBeDefined()

    const rowTree = renderRow(rowEl!.props as unknown as RowProps)
    const button = findByClass(rowTree, 'WinetricksBrowse__retryButton')
    expect(button).toBeDefined()
    const onMouseDown = button!.props.onMouseDown as
      | ((e: { preventDefault: () => void }) => void)
      | undefined
    expect(typeof onMouseDown).toBe('function')
    onMouseDown!({ preventDefault: () => undefined })

    expect(onInstall).toHaveBeenCalledWith('grommet')
  })
})

describe('Interaction Contract §1: SearchBar never receives a suggestions overlay', () => {
  it('the rendered SearchBar element does not carry a suggestionsListItems prop', () => {
    const tree = mountContainer(baseProps())
    const searchBarEl = findMockSearchBar(tree)
    expect(searchBarEl.props.suggestionsListItems).toBeUndefined()
    // Sanity: the mock captured a real props object, so the assertion above
    // is not vacuously true from a missing element.
    expect(typeof searchBarEl.props.onInputChanged).toBe('function')
  })
})
