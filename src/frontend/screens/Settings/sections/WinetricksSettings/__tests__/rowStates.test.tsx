/**
 * Per-state proof for `WinetricksRow` (Phase 45 Plan 07, Task 1; UI-SPEC E6 and
 * E7). Re-asserts the invariants of the Phase 44 `rowStates.test.tsx` that
 * still apply (read from git: `git show e297ec0df^:src/frontend/components/UI/
 * Winetricks/WinetricksBrowse/__tests__/rowStates.test.tsx`), retargeted at the
 * checkbox model:
 *
 *  - one derived state renders exactly one slot treatment, and the installed
 *    state NEVER renders a checkbox (D-10: a tick means only "will be
 *    installed", so an installed row cannot be selected);
 *  - `cached` is an orthogonal modifier, not a separate state;
 *  - every state pairs its colour with an icon and a text label (non-colour
 *    signal rule);
 *  - the row's compiled stylesheet is non-empty, scoped under the tab, and
 *    declares the fixed 56px / 44px heights that stop a state swap from
 *    shifting the rows below it;
 *  - upstream strings reach the DOM as text nodes only (T-45-20).
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import type { TFunction } from 'i18next'
import * as sass from 'sass'
import type { WinetricksComponent } from 'common/types'
import type { WinetricksRowState } from 'common/winetricks/deriveRowState'
import { FAMILY_KEYS, TASK_GROUP_IDS } from 'common/winetricks/verbs'
import {
  collectText,
  findAll,
  findByClass,
  harness,
  render,
  walk,
  type ElementLike
} from './treeHarness'

jest.mock('../Row/index.scss', () => ({}), { virtual: true })
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

import WinetricksRow from '../Row/index'
import { familySentence, taskGroupName } from '../labels'

type RowProps = Parameters<typeof WinetricksRow>[0]

const VCRUN: WinetricksComponent = {
  verb: 'vcrun2019',
  title: 'Visual C++ 2019 libraries (Microsoft, 2019)',
  category: 'dlls',
  cached: false,
  publisher: 'Microsoft',
  year: '2019'
}

// No family matches `foobar2000`, so a two-line request must fall back.
const NO_FAMILY: WinetricksComponent = {
  verb: 'foobar2000',
  title: 'foobar2000 1.0 (various, 2009)',
  category: 'apps',
  cached: false
}

function baseProps(
  rowState: WinetricksRowState,
  overrides: Partial<RowProps> = {}
): RowProps {
  return {
    component: VCRUN,
    rowState,
    template: 'twoLine',
    locked: false,
    showDone: false,
    showCategory: false,
    onToggle: () => undefined,
    onRetry: () => undefined,
    ...overrides
  }
}

function mount(props: RowProps): ElementLike {
  harness().__resetMount()
  return render(WinetricksRow, props)
}

function checkboxes(tree: ElementLike): ElementLike[] {
  return findAll(tree, (el) => el.props.role === 'checkbox')
}

function icons(tree: ElementLike): string[] {
  return findAll(tree, (el) => el.type === 'svg').map(
    (el) => el.props['data-icon'] as string
  )
}

const ALL_STATES: WinetricksRowState[] = [
  'available',
  'selected',
  'queued',
  'installing',
  'installed',
  'errored'
]

describe('each derived state renders its slot (D-10)', () => {
  it('available: an unchecked, enabled checkbox and nothing else in the slot', () => {
    const tree = mount(baseProps('available'))
    const boxes = checkboxes(tree)
    expect(boxes).toHaveLength(1)
    expect(boxes[0].props['aria-checked']).toBe(false)
    expect(boxes[0].props.disabled).toBeFalsy()
    expect(icons(tree)).toEqual([])
    expect(collectText(tree)).not.toContain('Installed')
  })

  it('selected: a checked, enabled checkbox', () => {
    const boxes = checkboxes(mount(baseProps('selected')))
    expect(boxes).toHaveLength(1)
    expect(boxes[0].props['aria-checked']).toBe(true)
    expect(boxes[0].props.disabled).toBeFalsy()
  })

  it('queued: a checked, DISABLED checkbox that is not spinning', () => {
    const tree = mount(baseProps('queued'))
    const boxes = checkboxes(tree)
    expect(boxes).toHaveLength(1)
    expect(boxes[0].props['aria-checked']).toBe(true)
    expect(boxes[0].props.disabled).toBe(true)
    expect(icons(tree)).not.toContain('spinner')
  })

  it('installing: a spinner and the installing phase word, no checkbox', () => {
    const tree = mount(baseProps('installing'))
    expect(checkboxes(tree)).toHaveLength(0)
    expect(icons(tree)).toContain('spinner')
    expect(collectText(tree)).toContain('Installing…')
    expect(collectText(tree)).not.toContain('Downloading')
  })

  it('installing with a known percentage: the downloading phase word interpolates it', () => {
    const tree = mount(baseProps('installing', { percent: 42 }))
    expect(collectText(tree)).toContain('Downloading 42%')
    expect(collectText(tree)).not.toContain('Installing…')
  })

  it('installed: a success icon and the Installed tag, and NO checkbox element at all (D-10)', () => {
    const tree = mount(baseProps('installed'))
    expect(checkboxes(tree)).toHaveLength(0)
    // No `<input type=checkbox>` either: the check is on the element shape,
    // not just on the ARIA role.
    expect(
      findAll(tree, (el) => el.type === 'input' && el.props.type === 'checkbox')
    ).toHaveLength(0)
    expect(icons(tree)).toContain('circle-check')
    expect(collectText(tree)).toContain('Installed')
  })

  it('installed with showDone: the transient Done word replaces the Installed tag', () => {
    const tree = mount(baseProps('installed', { showDone: true }))
    expect(collectText(tree)).toContain('Done')
    expect(checkboxes(tree)).toHaveLength(0)
  })

  it('errored: a danger icon, the Install failed tag and a Retry button, no checkbox', () => {
    const tree = mount(baseProps('errored'))
    expect(checkboxes(tree)).toHaveLength(0)
    expect(icons(tree)).toContain('circle-exclamation')
    expect(collectText(tree)).toContain('Install failed')
    expect(findByClass(tree, 'WinetricksRow__retry')).toHaveLength(1)
    expect(collectText(findByClass(tree, 'WinetricksRow__retry')[0])).toBe(
      'Retry'
    )
  })

  it('every state pairs an icon with a text label, or is a real checkbox (non-colour signal rule)', () => {
    for (const state of ALL_STATES) {
      const tree = mount(baseProps(state))
      const hasCheckbox = checkboxes(tree).length === 1
      const hasIconAndText =
        icons(tree).length > 0 && collectText(tree).trim().length > 0
      expect(hasCheckbox || hasIconAndText).toBe(true)
    }
  })

  it('only the installed state has no checkbox among the five that could show one', () => {
    // Sanity: the generator produced the states it claims to, so the D-10
    // assertion above is not vacuous.
    expect(ALL_STATES).toHaveLength(6)
    const withBox = ALL_STATES.filter(
      (state) => checkboxes(mount(baseProps(state))).length === 1
    )
    expect(withBox).toEqual(['available', 'selected', 'queued'])
  })
})

describe('locked (a run is in flight or the backend is busy)', () => {
  it('disables an available row checkbox', () => {
    const boxes = checkboxes(mount(baseProps('available', { locked: true })))
    expect(boxes[0].props.disabled).toBe(true)
  })

  it('disables the Retry button', () => {
    const tree = mount(baseProps('errored', { locked: true }))
    expect(findByClass(tree, 'WinetricksRow__retry')[0].props.disabled).toBe(
      true
    )
  })

  it('leaves Retry enabled when not locked', () => {
    const tree = mount(baseProps('errored'))
    expect(
      findByClass(tree, 'WinetricksRow__retry')[0].props.disabled
    ).toBeFalsy()
  })
})

describe('templates (E6 / E7)', () => {
  it('the two-line template shows the family sentence under the title', () => {
    const tree = mount(baseProps('available'))
    expect(tree.props.className).toContain('WinetricksRow--twoLine')
    const caption = findByClass(tree, 'WinetricksRow__caption')
    expect(caption).toHaveLength(1)
    expect(collectText(caption[0])).toContain('Visual C++ runtime')
  })

  it('E6-partial: a component with no family renders the one-line template even when asked for two-line', () => {
    const tree = mount(baseProps('available', { component: NO_FAMILY }))
    expect(tree.props.className).toContain('WinetricksRow--oneLine')
    expect(tree.props.className).not.toContain('WinetricksRow--twoLine')
    expect(findByClass(tree, 'WinetricksRow__caption')).toHaveLength(0)
  })

  it('the one-line template never shows a caption, even for a verb with a family', () => {
    const tree = mount(baseProps('available', { template: 'oneLine' }))
    expect(tree.props.className).toContain('WinetricksRow--oneLine')
    expect(findByClass(tree, 'WinetricksRow__caption')).toHaveLength(0)
  })

  it('shows the cleaned title and keeps the full upstream title as the native tooltip', () => {
    const tree = mount(baseProps('available'))
    const title = findByClass(tree, 'WinetricksRow__title')[0]
    expect(collectText(title)).toBe('Visual C++ 2019 libraries')
    expect(title.props.title).toBe(VCRUN.title)
  })

  it('E7: the category tag appears only while showCategory is set', () => {
    expect(
      findByClass(
        mount(baseProps('available', { template: 'oneLine' })),
        'WinetricksRow__category'
      )
    ).toHaveLength(0)
    const tagged = findByClass(
      mount(
        baseProps('available', { template: 'oneLine', showCategory: true })
      ),
      'WinetricksRow__category'
    )
    expect(tagged).toHaveLength(1)
    expect(collectText(tagged[0])).toBe('dlls')
  })

  it('exposes the verb on the row root so a selection is identifiable by verb (D-07)', () => {
    expect(mount(baseProps('available')).props['data-verb']).toBe('vcrun2019')
  })
})

describe('metadata line (E6-empty)', () => {
  function meta(component: WinetricksComponent): ElementLike[] {
    return findByClass(
      mount(baseProps('available', { component })),
      'WinetricksRow__meta'
    )
  }

  it('publisher and year both present: the publisherYear string', () => {
    const found = meta(VCRUN)
    expect(found).toHaveLength(1)
    expect(collectText(found[0])).toBe('Microsoft · 2019')
  })

  it('only the publisher present: that value alone, no dangling separator', () => {
    const found = meta({ ...VCRUN, year: undefined })
    expect(collectText(found[0])).toBe('Microsoft')
  })

  it('only the year present: that value alone', () => {
    const found = meta({ ...VCRUN, publisher: undefined })
    expect(collectText(found[0])).toBe('2019')
  })

  it('neither present: no metadata element at all', () => {
    expect(meta({ ...VCRUN, publisher: undefined, year: undefined })).toEqual(
      []
    )
  })
})

describe('cached is an orthogonal badge', () => {
  const cached: WinetricksComponent = { ...VCRUN, cached: true }

  it('shows the cached tag in every non-installed state', () => {
    for (const state of ALL_STATES.filter((s) => s !== 'installed')) {
      const tree = mount(baseProps(state, { component: cached }))
      expect(collectText(tree)).toContain('Cached (installs offline)')
    }
  })

  it('does not show it on an installed row, and not when the verb is not cached', () => {
    expect(
      collectText(mount(baseProps('installed', { component: cached })))
    ).not.toContain('Cached')
    expect(collectText(mount(baseProps('available')))).not.toContain('Cached')
  })
})

describe('T-45-20: upstream strings are text nodes only', () => {
  it('renders markup-looking metadata as a string child with no dangerouslySetInnerHTML anywhere', () => {
    const hostile: WinetricksComponent = {
      ...VCRUN,
      title: '<img src=x onerror=alert(1)> (<b>evil</b>, 2020)',
      publisher: '<script>alert(1)</script>',
      year: '2020'
    }
    const tree = mount(
      baseProps('available', { component: hostile, showCategory: true })
    )
    expect(collectText(tree)).toContain('<script>alert(1)</script>')
    let sawInnerHtml = false
    walk(tree, (el) => {
      if ('dangerouslySetInnerHTML' in el.props) sawInnerHtml = true
    })
    expect(sawInnerHtml).toBe(false)
  })
})

describe('compiled stylesheet (fixed metrics, scope)', () => {
  const compiled = sass.compile(join(__dirname, '..', 'Row', 'index.scss')).css

  it('is non-empty', () => {
    expect(compiled.trim().length).toBeGreaterThan(0)
  })

  it('declares the fixed 56px two-line and 44px one-line heights', () => {
    expect(compiled).toMatch(
      /\.WinetricksRow--twoLine\s*\{[^}]*\bheight:\s*56px/
    )
    expect(compiled).toMatch(
      /\.WinetricksRow--oneLine\s*\{[^}]*\bheight:\s*44px/
    )
  })

  it('scopes every rule under the tab root so nothing leaks app-wide', () => {
    const selectors = [...compiled.matchAll(/(^|\})\s*([^{}@]+)\{/g)].map((m) =>
      m[2].trim()
    )
    expect(selectors.length).toBeGreaterThan(5)
    for (const selector of selectors) {
      expect(selector).toMatch(/^\.WinetricksSettings\b/)
    }
  })

  it('declares a visible keyboard focus ring', () => {
    expect(compiled).toMatch(/:focus-visible/)
  })
})

// The label helpers carry the English defaults as string literals so
// i18next-parser can extract them. A typo in one would ship as a visible
// copy defect in the locale-fallback path, so each default is pinned against
// the frozen English catalog (45-03).
describe('label helpers (D-08, D-07)', () => {
  const catalog = JSON.parse(
    readFileSync(
      join(
        __dirname,
        '..',
        '..',
        '..',
        '..',
        '..',
        '..',
        '..',
        'public',
        'locales',
        'en',
        'gamelib.json'
      ),
      'utf8'
    )
  ) as {
    winetricksBrowse: {
      family: Record<string, string>
      taskGroup: Record<string, string>
    }
  }

  // Echoes the supplied English default, exactly what an absent translation does.
  const echo = ((_key: string, defaultValue: string) =>
    defaultValue) as unknown as TFunction

  it('familySentence returns the catalog sentence for each of the 13 families', () => {
    expect(FAMILY_KEYS).toHaveLength(13)
    for (const family of FAMILY_KEYS) {
      expect(familySentence(echo, family)).toBe(
        catalog.winetricksBrowse.family[family]
      )
    }
  })

  it('taskGroupName returns the catalog name for each of the 5 groups', () => {
    expect(TASK_GROUP_IDS).toHaveLength(5)
    for (const id of TASK_GROUP_IDS) {
      expect(taskGroupName(echo, id)).toBe(
        catalog.winetricksBrowse.taskGroup[id]
      )
    }
  })

  it('every literal key names the gamelib namespace so the parser files it there', () => {
    const calls: string[] = []
    const spy = ((key: string, defaultValue: string) => {
      calls.push(key)
      return defaultValue
    }) as unknown as TFunction
    for (const family of FAMILY_KEYS) familySentence(spy, family)
    for (const id of TASK_GROUP_IDS) taskGroupName(spy, id)
    expect(calls).toHaveLength(18)
    for (const key of calls) {
      expect(key.startsWith('gamelib:winetricksBrowse.')).toBe(true)
    }
  })
})
