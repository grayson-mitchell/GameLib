/**
 * Everything else: the collapsed long tail with a sticky search that filters
 * only itself (Phase 45 Plan 07, Task 3; UI-SPEC E5; D-05, D-07; Interaction
 * Contract 3 and 4).
 *
 * Re-asserts the Phase 44 `WinetricksBrowse.test.tsx` search invariants that
 * still apply (read from git: `git show e297ec0df^:src/frontend/components/UI/
 * Winetricks/WinetricksBrowse/__tests__/WinetricksBrowse.test.tsx`; see
 * 45-02-SUMMARY.md): a 2-or-more character query filters on verb OR title,
 * case-insensitively; a 1-character query leaves the full list; an installed
 * verb is still searchable; a zero-result query shows a heading interpolating
 * the query plus a Clear search button; there is no SearchBar suggestions
 * overlay; no windowing or slicing (every catalog verb renders).
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  collectText,
  findAll,
  findByClass,
  flush,
  type ElementLike
} from './treeHarness'
import {
  buildCatalog,
  installApi,
  makeApi,
  mountTab,
  rerender,
  type MockApi
} from './tabFixtures'
import { TASK_GROUP_IDS } from 'common/winetricks/verbs'

jest.mock('../index.scss', () => ({}), { virtual: true })
jest.mock('../Row/index.scss', () => ({}), { virtual: true })
jest.mock('../GroupHeader/index.scss', () => ({}), { virtual: true })
jest.mock('../EverythingElseGroup/index.scss', () => ({}), { virtual: true })
jest.mock('react', () =>
  jest
    .requireActual<typeof import('./treeHarness')>('./treeHarness')
    .createReactMock()
)
jest.mock('react-i18next', () =>
  jest
    .requireActual<typeof import('./treeHarness')>('./treeHarness')
    .createI18nMock()
)
jest.mock('@fortawesome/react-fontawesome', () =>
  jest
    .requireActual<typeof import('./treeHarness')>('./treeHarness')
    .createFontAwesomeMock()
)

import WinetricksSettings from '../index'

const CATALOG = buildCatalog()

let api: MockApi

beforeEach(() => {
  api = makeApi()
  installApi(api)
})

const mount = () => mountTab(WinetricksSettings)
const again = () => rerender(WinetricksSettings)

function everything(tree: ElementLike): ElementLike {
  const found = findByClass(tree, 'WinetricksEverythingElse')
  if (found.length !== 1) {
    throw new Error(`expected one Everything else group, saw ${found.length}`)
  }
  return found[0]
}

function disclosure(group: ElementLike): ElementLike {
  const found = findAll(
    group,
    (el) => el.type === 'button' && 'aria-expanded' in el.props
  )
  if (found.length !== 1) {
    throw new Error(`expected one disclosure button, saw ${found.length}`)
  }
  return found[0]
}

function rowVerbs(node: unknown): string[] {
  return findByClass(node, 'WinetricksRow').map(
    (el) => el.props['data-verb'] as string
  )
}

function searchInput(tree: ElementLike): ElementLike {
  const found = findAll(everything(tree), (el) => el.type === 'input')
  if (found.length !== 1) {
    throw new Error(`expected one search input, saw ${found.length}`)
  }
  return found[0]
}

async function openEverything(): Promise<ElementLike> {
  const tree = await mount()
  ;(disclosure(everything(tree)).props.onClick as () => void)()
  return again()
}

function type(query: string): ElementLike {
  const input = searchInput(again())
  ;(input.props.onChange as (e: unknown) => void)({ target: { value: query } })
  return again()
}

function matches(query: string): string[] {
  const q = query.toLowerCase()
  return CATALOG.filter(
    (c) => c.verb.toLowerCase().includes(q) || c.title.toLowerCase().includes(q)
  ).map((c) => c.verb)
}

function row(scope: ElementLike, verb: string): ElementLike {
  const found = findByClass(scope, 'WinetricksRow').filter(
    (el) => el.props['data-verb'] === verb
  )
  if (found.length !== 1) {
    throw new Error(`expected one ${verb} row, saw ${found.length}`)
  }
  return found[0]
}

function checkbox(scope: ElementLike, verb: string): ElementLike | undefined {
  return findAll(row(scope, verb), (el) => el.props.role === 'checkbox')[0]
}

function tick(scope: ElementLike, verb: string): void {
  const box = checkbox(scope, verb)
  if (!box) throw new Error('row has no checkbox -- this test proves nothing')
  ;(box.props.onClick as () => void)()
}

function taskGroup(tree: ElementLike, id: string): ElementLike {
  const found = findByClass(tree, 'WinetricksTaskGroup').find(
    (g) => g.props['data-group'] === id
  )
  if (!found) throw new Error(`no task group ${id}`)
  return found
}

describe('Everything else, collapsed (E5, D-05)', () => {
  it('is the last of the three tiers, after Suggested and the five task groups', async () => {
    const tree = await mount()
    const tiers = [
      'WinetricksSuggested',
      'WinetricksTaskGroup',
      'WinetricksEverythingElse'
    ]
    const order = findAll(tree, (el) =>
      tiers.includes(String(el.props.className))
    ).map((el) => String(el.props.className))

    expect(order).toEqual([
      'WinetricksSuggested',
      ...TASK_GROUP_IDS.map(() => 'WinetricksTaskGroup'),
      'WinetricksEverythingElse'
    ])
  })

  it('is collapsed by default with the catalog count as its badge and no rows or search box', async () => {
    const group = everything(await mount())
    const header = disclosure(group)

    expect(header.type).toBe('button')
    expect(header.props['aria-expanded']).toBe(false)
    expect(
      collectText(findByClass(group, 'WinetricksGroupHeader__label')[0])
    ).toBe('Everything else')
    expect(
      collectText(findByClass(group, 'WinetricksGroupHeader__count')[0])
    ).toBe(String(CATALOG.length))
    expect(rowVerbs(group)).toEqual([])
    expect(findAll(group, (el) => el.type === 'input')).toHaveLength(0)
  })
})

describe('Everything else, expanded', () => {
  it('shows every catalog verb as a one-line row in parser order with no category tags and no results heading', async () => {
    const group = everything(await openEverything())

    expect(disclosure(group).props['aria-expanded']).toBe(true)
    expect(rowVerbs(group)).toEqual(CATALOG.map((c) => c.verb))
    for (const el of findByClass(group, 'WinetricksRow')) {
      expect(String(el.props.className)).toContain('WinetricksRow--oneLine')
    }
    expect(findByClass(group, 'WinetricksRow__category')).toHaveLength(0)
    expect(
      findByClass(group, 'WinetricksEverythingElse__results')
    ).toHaveLength(0)
  })

  it('renders a plain search input in a sticky wrapper, with the placeholder as its accessible name', async () => {
    const group = everything(await openEverything())
    const wrapper = findByClass(group, 'WinetricksEverythingElse__search')
    expect(wrapper).toHaveLength(1)

    const input = searchInput(again())
    expect(input.props.type).toBe('search')
    expect(input.props.placeholder).toBe('Search components…')
    expect(input.props['aria-label']).toBe('Search components…')
    expect(findAll(wrapper[0], (el) => el.type === 'input')).toHaveLength(1)
  })

  it('never renders a SearchBar suggestions overlay', async () => {
    const tree = await openEverything()
    expect(findByClass(tree, 'autoComplete')).toHaveLength(0)
    expect(
      findAll(tree, (el) => 'suggestionsListItems' in el.props)
    ).toHaveLength(0)
  })

  it('a one-character query leaves the full list untouched (threshold)', async () => {
    await openEverything()
    const group = everything(type('v'))
    expect(rowVerbs(group)).toEqual(CATALOG.map((c) => c.verb))
    expect(
      findByClass(group, 'WinetricksEverythingElse__results')
    ).toHaveLength(0)
  })

  it('a two-character query filters on verb OR title, case-insensitively, with a counted heading and category tags', async () => {
    await openEverything()
    const group = everything(type('VC'))

    expect(matches('vc').length).toBeGreaterThan(1)
    expect(rowVerbs(group)).toEqual(matches('vc'))
    expect(
      collectText(findByClass(group, 'WinetricksEverythingElse__results')[0])
    ).toBe(`${matches('vc').length} results`)
    expect(findByClass(group, 'WinetricksRow__category')).toHaveLength(
      matches('vc').length
    )
  })

  it('matches on title text too, and a single match reads as one result', async () => {
    await openEverything()
    const group = everything(type('gdi+'))

    expect(rowVerbs(group)).toEqual(['gdiplus_winxp'])
    expect(
      collectText(findByClass(group, 'WinetricksEverythingElse__results')[0])
    ).toBe('1 result')
  })

  it('E5-empty: zero matches shows the heading with the query and a Clear search button that empties it', async () => {
    await openEverything()
    const group = everything(type('zzqq'))

    expect(rowVerbs(group)).toEqual([])
    expect(
      collectText(findByClass(group, 'WinetricksEverythingElse__zero')[0])
    ).toContain('No components match “zzqq”.')
    const clear = findAll(
      group,
      (el) =>
        el.type === 'button' &&
        collectText(el.props.children) === 'Clear search'
    )
    expect(clear).toHaveLength(1)
    ;(clear[0].props.onClick as () => void)()
    const cleared = everything(again())
    expect(rowVerbs(cleared)).toEqual(CATALOG.map((c) => c.verb))
    expect(searchInput(again()).props.value).toBe('')
    expect(findByClass(cleared, 'WinetricksEverythingElse__zero')).toHaveLength(
      0
    )
  })

  it('an installed verb is still searchable and shows as Installed (Phase 44 D-13 reversal)', async () => {
    api.winetricksListInstalled.mockImplementation(() =>
      Promise.resolve(['foobar2000'])
    )
    await openEverything()
    const group = everything(type('foobar'))

    expect(collectText(row(group, 'foobar2000'))).toContain('Installed')
    expect(checkbox(group, 'foobar2000')).toBeUndefined()
  })
})

describe('the search filters only Everything else (E5-partial, Interaction 3)', () => {
  it('leaves the Suggested and expanded task-group rows unchanged', async () => {
    const first = await mount()
    const runtimesHeader = findAll(
      taskGroup(first, 'runtimes'),
      (el) => el.type === 'button'
    )[0]
    ;(runtimesHeader.props.onClick as () => void)()
    ;(disclosure(everything(again())).props.onClick as () => void)()

    const open = again()
    const before = {
      suggested: rowVerbs(findByClass(open, 'WinetricksSuggested')[0]),
      runtimes: rowVerbs(taskGroup(open, 'runtimes'))
    }
    const tree = type('zzqq')

    expect(rowVerbs(findByClass(tree, 'WinetricksSuggested')[0])).toEqual(
      before.suggested
    )
    expect(rowVerbs(taskGroup(tree, 'runtimes'))).toEqual(before.runtimes)
    expect(before.suggested.length).toBeGreaterThan(0)
    expect(before.runtimes.length).toBeGreaterThan(0)
  })

  it('a verb ticked while filtered stays selected after the search is cleared and after the group is collapsed', async () => {
    await openEverything()
    tick(everything(type('foobar')), 'foobar2000')

    const afterClear = everything(type(''))
    expect(checkbox(afterClear, 'foobar2000')?.props['aria-checked']).toBe(true)
    ;(disclosure(afterClear).props.onClick as () => void)()
    ;(disclosure(everything(again())).props.onClick as () => void)()
    expect(
      checkbox(everything(again()), 'foobar2000')?.props['aria-checked']
    ).toBe(true)
  })

  it('shares one selection with the other tiers: ticking a curated verb here marks it in Suggested, and Apply sends it', async () => {
    await openEverything()
    tick(everything(type('vcrun2019')), 'vcrun2019')

    const tree = again()
    expect(
      checkbox(findByClass(tree, 'WinetricksSuggested')[0], 'vcrun2019')?.props[
        'aria-checked'
      ]
    ).toBe(true)

    const apply = findAll(
      tree,
      (el) =>
        el.type === 'button' &&
        el.props.onClick !== undefined &&
        collectText(el.props.children) === 'Apply'
    )[0]
    ;(apply.props.onClick as () => void)()
    await flush()
    expect(api.winetricksApply).toHaveBeenCalledWith('legendary', 'fake-app', [
      'vcrun2019'
    ])
  })
})

describe('Everything else disclosure and stylesheet', () => {
  it('the header guards against the mouse race: mousedown toggles once, the following click does not toggle it back', async () => {
    const tree = await mount()
    const preventDefault = jest.fn()
    ;(disclosure(everything(tree)).props.onMouseDown as (e: unknown) => void)({
      preventDefault
    })
    expect(disclosure(everything(again())).props['aria-expanded']).toBe(true)
    ;(disclosure(everything(again())).props.onClick as () => void)()
    expect(disclosure(everything(again())).props['aria-expanded']).toBe(true)
    expect(preventDefault).toHaveBeenCalledTimes(1)
  })

  it('pins the search input with position: sticky; top: 0 on the tab background token', () => {
    const scss = readFileSync(
      join(__dirname, '..', 'EverythingElseGroup', 'index.scss'),
      'utf8'
    )
    expect(scss).toMatch(/position:\s*sticky/)
    expect(scss).toMatch(/top:\s*0/)
    expect(scss).toMatch(/var\(--input-background,\s*#272f31\)/)
  })

  it('sets no height cap and opens no scroll region of its own (D-02)', () => {
    const scss = readFileSync(
      join(__dirname, '..', 'EverythingElseGroup', 'index.scss'),
      'utf8'
    )
    expect(scss).not.toMatch(/max-height/)
    expect(scss).not.toMatch(/overflow-y|overflow:\s*(auto|scroll)/)
  })
})
