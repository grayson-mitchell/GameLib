/**
 * Suggested group and the five task-group disclosures (Phase 45 Plan 07, Task
 * 2; UI-SPEC E3 and E4; D-05, D-06, D-07, D-09, D-10, D-12, D-18).
 *
 * Whole-tab tests on the hand-rolled harness: the real `WinetricksSettings`
 * tree is expanded through the real `Row`, `GroupHeader`, `SuggestedGroup` and
 * `TaskGroup`, with only `window.api` mocked. Re-asserts the invariants of the
 * Phase 44 `WinetricksBrowse.test.tsx` that still apply (curated verbs are a
 * shortcut view that also stay in their own group, an absent member is skipped
 * silently, no selection state is global) -- see 45-02-SUMMARY.md.
 */
import {
  collectText,
  findAll,
  findByClass,
  flush,
  walk,
  type ElementLike
} from './treeHarness'
import {
  buildCatalog,
  capturedQueueChangedListener,
  installApi,
  makeApi,
  mountTab,
  queueStateWith,
  rerender,
  type MockApi
} from './tabFixtures'
import { TASK_GROUP_IDS, TASK_GROUP_MEMBERS } from 'common/winetricks/verbs'

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

const CURATED_ORDER = [
  'vcrun2019',
  'vcrun2013',
  'vcrun2010',
  'dotnet48',
  'd3dx9',
  'xact',
  'corefonts',
  'physx'
]

let api: MockApi

beforeEach(() => {
  api = makeApi()
  installApi(api)
})

const mount = () => mountTab(WinetricksSettings)
const again = () => rerender(WinetricksSettings)

function rowVerbs(node: unknown): string[] {
  return findByClass(node, 'WinetricksRow').map(
    (el) => el.props['data-verb'] as string
  )
}

function suggested(tree: ElementLike): ElementLike {
  const found = findByClass(tree, 'WinetricksSuggested')
  if (found.length !== 1) {
    throw new Error(`expected one Suggested group, saw ${found.length}`)
  }
  return found[0]
}

function taskGroups(tree: ElementLike): ElementLike[] {
  return findByClass(tree, 'WinetricksTaskGroup')
}

function taskGroup(tree: ElementLike, id: string): ElementLike {
  const found = taskGroups(tree).find((el) => el.props['data-group'] === id)
  if (!found) throw new Error(`no task group ${id} -- this test proves nothing`)
  return found
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

function rowFor(scope: ElementLike, verb: string): ElementLike {
  const found = findByClass(scope, 'WinetricksRow').filter(
    (el) => el.props['data-verb'] === verb
  )
  if (found.length !== 1) {
    throw new Error(`expected one ${verb} row, saw ${found.length}`)
  }
  return found[0]
}

function checkboxIn(row: ElementLike): ElementLike | undefined {
  return findAll(row, (el) => el.props.role === 'checkbox')[0]
}

function tick(row: ElementLike): void {
  const box = checkboxIn(row)
  if (!box) throw new Error('row has no checkbox -- this test proves nothing')
  ;(box.props.onClick as () => void)()
}

function applyButton(tree: ElementLike): ElementLike {
  const found = findAll(
    tree,
    (el) =>
      el.type === 'button' &&
      el.props.onClick !== undefined &&
      collectText(el.props.children) === 'Apply'
  )
  if (found.length !== 1) throw new Error('expected one Apply button')
  return found[0]
}

describe('Suggested for this game (E3, D-06)', () => {
  it('non-vacuity: renders a static header and the curated 8 under the sub-heading when there is no per-game signal', async () => {
    const tree = await mount()
    const group = suggested(tree)

    expect(rowVerbs(group)).toEqual(CURATED_ORDER)
    expect(collectText(findByClass(group, 'WinetricksGroupHeader')[0])).toBe(
      'Suggested for this game'
    )
    expect(
      collectText(findByClass(group, 'WinetricksSuggested__sub')[0])
    ).toContain('Commonly needed')
    expect(
      collectText(findByClass(group, 'WinetricksSuggested__hint')[0])
    ).toContain("won't launch")
  })

  it('is always open: its header is a static heading, never a disclosure button', async () => {
    const group = suggested(await mount())
    expect(findAll(group, (el) => 'aria-expanded' in el.props)).toHaveLength(0)
    expect(findByClass(group, 'WinetricksGroupHeader--static')).toHaveLength(1)
  })

  it('renders game-specific rows first (known fixes, then Direct3D), then the curated 8 minus those', async () => {
    api.getKnownFixes.mockImplementation(() =>
      Promise.resolve({ title: 'Fake Game', winetricks: ['d3dx9'] })
    )
    api.getWikiGameInfo.mockImplementation(() =>
      Promise.resolve({ pcgamingwiki: { direct3DVersions: ['11'] } })
    )
    const tree = await mount()

    expect(rowVerbs(suggested(tree))).toEqual([
      'd3dx9',
      'd3dx11_43',
      'd3dcompiler_47',
      'vcrun2019',
      'vcrun2013',
      'vcrun2010',
      'dotnet48',
      'xact',
      'corefonts',
      'physx'
    ])
    expect(api.getKnownFixes).toHaveBeenCalledWith('fake-app', 'legendary')
    expect(api.getWikiGameInfo).toHaveBeenCalledWith(
      'Fake Game',
      'fake-app',
      'legendary'
    )
  })

  it('E3-error: both lookups rejecting falls back to the curated 8 and the tab still leaves loading', async () => {
    api.getKnownFixes.mockImplementation(() =>
      Promise.reject(new Error('down'))
    )
    api.getWikiGameInfo.mockImplementation(() =>
      Promise.reject(new Error('down'))
    )
    const tree = await mount()

    expect(rowVerbs(suggested(tree))).toEqual(CURATED_ORDER)
    expect(findByClass(tree, 'WinetricksSuggested__sub')).toHaveLength(1)
    expect(collectText(tree)).not.toContain('Loading available components')
  })

  it('E3-error: a lookup that returns nothing is the same as no signal', async () => {
    api.getKnownFixes.mockImplementation(() => Promise.resolve(null))
    api.getWikiGameInfo.mockImplementation(() => Promise.resolve(null))
    expect(rowVerbs(suggested(await mount()))).toEqual(CURATED_ORDER)
  })

  it('A-45-06: a lookup that never answers is abandoned after a bounded wait, not held in loading forever', async () => {
    jest.useFakeTimers()
    try {
      api.getWikiGameInfo.mockImplementation(() => new Promise(() => undefined))
      const tree = await mountTab(WinetricksSettings, () =>
        jest.advanceTimersByTime(10000)
      )
      expect(rowVerbs(suggested(tree))).toEqual(CURATED_ORDER)
    } finally {
      jest.useRealTimers()
    }
  })

  it('T-45-21: a verb named by a third-party source but absent from the visible catalog is skipped', async () => {
    api.getKnownFixes.mockImplementation(() =>
      Promise.resolve({
        title: 'Fake Game',
        winetricks: ['annihilate', 'vcrun2022']
      })
    )
    const tree = await mount()
    const verbs = rowVerbs(suggested(tree))

    expect(verbs[0]).toBe('vcrun2022')
    expect(verbs).not.toContain('annihilate')
    expect(rowVerbs(tree)).not.toContain('annihilate')
  })

  it('E3-partial: an installed suggested verb renders in place as Installed with no checkbox', async () => {
    api.winetricksListInstalled.mockImplementation(() =>
      Promise.resolve(['vcrun2019'])
    )
    const group = suggested(await mount())

    expect(rowVerbs(group)).toEqual(CURATED_ORDER)
    const row = rowFor(group, 'vcrun2019')
    expect(checkboxIn(row)).toBeUndefined()
    expect(collectText(row)).toContain('Installed')
  })
})

describe('task groups (E4, D-05, D-07)', () => {
  it('renders the five groups in TASK_GROUP_IDS order, collapsed, with a member-count badge and no rows', async () => {
    const tree = await mount()
    const groups = taskGroups(tree)

    expect(groups.map((g) => g.props['data-group'])).toEqual([
      ...TASK_GROUP_IDS
    ])
    for (const group of groups) {
      const header = disclosure(group)
      expect(header.type).toBe('button')
      expect(header.props['aria-expanded']).toBe(false)
      expect(rowVerbs(group)).toEqual([])
      const id = group.props['data-group'] as (typeof TASK_GROUP_IDS)[number]
      expect(
        collectText(findByClass(group, 'WinetricksGroupHeader__count')[0])
      ).toBe(String(TASK_GROUP_MEMBERS[id].length))
    }
  })

  it('names the groups in plain language', async () => {
    const labels = taskGroups(await mount()).map((g) =>
      collectText(findByClass(g, 'WinetricksGroupHeader__label')[0])
    )
    expect(labels).toEqual([
      'Runtimes & frameworks',
      'DirectX & graphics',
      'Fonts',
      'Media & codecs',
      'Wine settings'
    ])
  })

  it('activating a header expands the group into two-line rows in member order, and again collapses it', async () => {
    const tree = await mount()
    ;(disclosure(taskGroup(tree, 'runtimes')).props.onClick as () => void)()

    const open = taskGroup(again(), 'runtimes')
    expect(disclosure(open).props['aria-expanded']).toBe(true)
    expect(rowVerbs(open)).toEqual([...TASK_GROUP_MEMBERS.runtimes])
    for (const row of findByClass(open, 'WinetricksRow')) {
      expect(String(row.props.className)).toContain('WinetricksRow--twoLine')
    }

    ;(disclosure(open).props.onClick as () => void)()
    expect(rowVerbs(taskGroup(again(), 'runtimes'))).toEqual([])
  })

  it('wires aria-controls to a body element that exists in both states', async () => {
    const tree = await mount()
    const group = taskGroup(tree, 'fonts')
    const controls = disclosure(group).props['aria-controls'] as string
    expect(typeof controls).toBe('string')
    expect(findAll(group, (el) => el.props.id === controls)).toHaveLength(1)
  })

  it('A-45-01: a group with no members in the loaded catalog renders no header and no body', async () => {
    api.winetricksListAvailable.mockImplementation(() =>
      Promise.resolve(buildCatalog(TASK_GROUP_MEMBERS.media))
    )
    const tree = await mount()

    expect(taskGroups(tree).map((g) => g.props['data-group'])).toEqual([
      'runtimes',
      'directx',
      'fonts',
      'wineSettings'
    ])
    expect(collectText(tree)).not.toContain('Media & codecs')
  })

  it('a group skips an absent member silently and keeps the rest in order (Phase 44 D-03)', async () => {
    api.winetricksListAvailable.mockImplementation(() =>
      Promise.resolve(buildCatalog(['vcrun2013']))
    )
    const tree = await mount()
    ;(disclosure(taskGroup(tree, 'runtimes')).props.onClick as () => void)()

    expect(rowVerbs(taskGroup(again(), 'runtimes'))).toEqual(
      TASK_GROUP_MEMBERS.runtimes.filter((v) => v !== 'vcrun2013')
    )
  })

  it('a verb in a group also stays in Suggested (a shortcut view, not a partition)', async () => {
    const tree = await mount()
    ;(disclosure(taskGroup(tree, 'runtimes')).props.onClick as () => void)()
    const next = again()

    expect(rowVerbs(taskGroup(next, 'runtimes'))).toContain('vcrun2019')
    expect(rowVerbs(suggested(next))).toContain('vcrun2019')
  })
})

describe('one selection keyed by verb (D-07, E4-partial)', () => {
  async function openRuntimes(): Promise<ElementLike> {
    const tree = await mount()
    ;(disclosure(taskGroup(tree, 'runtimes')).props.onClick as () => void)()
    return again()
  }

  function ariaChecked(row: ElementLike): unknown {
    return checkboxIn(row)?.props['aria-checked']
  }

  it('ticking vcrun2019 in a task group marks the Suggested vcrun2019 row selected too, and unticking clears both', async () => {
    const open = await openRuntimes()
    tick(rowFor(taskGroup(open, 'runtimes'), 'vcrun2019'))

    const ticked = again()
    expect(
      ariaChecked(rowFor(taskGroup(ticked, 'runtimes'), 'vcrun2019'))
    ).toBe(true)
    expect(ariaChecked(rowFor(suggested(ticked), 'vcrun2019'))).toBe(true)
    expect(ariaChecked(rowFor(suggested(ticked), 'vcrun2013'))).toBe(false)

    tick(rowFor(suggested(ticked), 'vcrun2019'))
    const cleared = again()
    expect(
      ariaChecked(rowFor(taskGroup(cleared, 'runtimes'), 'vcrun2019'))
    ).toBe(false)
    expect(ariaChecked(rowFor(suggested(cleared), 'vcrun2019'))).toBe(false)
  })

  it('Apply sends the ticked verbs in selection order across tiers', async () => {
    const open = await openRuntimes()
    tick(rowFor(suggested(open), 'd3dx9'))
    tick(rowFor(taskGroup(again(), 'runtimes'), 'vcrun2022'))
    ;(applyButton(again()).props.onClick as () => void)()
    await flush()

    expect(api.winetricksApply).toHaveBeenCalledTimes(1)
    expect(api.winetricksApply).toHaveBeenCalledWith('legendary', 'fake-app', [
      'd3dx9',
      'vcrun2022'
    ])
  })
})

describe('run state on the rows (D-10, D-12, D-13, D-18)', () => {
  it('a running run locks the tab: the current verb installs, a pending verb is queued, the rest cannot be ticked', async () => {
    const tree = await mount()
    expect(tree).toBeDefined()
    capturedQueueChangedListener(api)(
      {},
      queueStateWith(
        {
          verbs: ['vcrun2019', 'd3dx9'],
          outcomes: { vcrun2019: 'installing', d3dx9: 'pending' },
          currentVerb: 'vcrun2019'
        },
        true
      )
    )
    const group = suggested(again())

    const installing = rowFor(group, 'vcrun2019')
    expect(String(installing.props.className)).toContain(
      'WinetricksRow--installing'
    )
    expect(checkboxIn(installing)).toBeUndefined()

    const queued = rowFor(group, 'd3dx9')
    expect(String(queued.props.className)).toContain('WinetricksRow--queued')
    expect(checkboxIn(queued)?.props.disabled).toBe(true)
    expect(checkboxIn(queued)?.props['aria-checked']).toBe(true)

    expect(checkboxIn(rowFor(group, 'xact'))?.props.disabled).toBe(true)
  })

  it('a finished verb shows the transient Done word while the run continues, then Installed when it ends', async () => {
    await mount()
    const listener = capturedQueueChangedListener(api)
    listener(
      {},
      queueStateWith({
        verbs: ['vcrun2019', 'd3dx9'],
        outcomes: { vcrun2019: 'installed', d3dx9: 'installing' },
        currentVerb: 'd3dx9'
      })
    )
    expect(collectText(rowFor(suggested(again()), 'vcrun2019'))).toContain(
      'Done'
    )

    listener(
      {},
      queueStateWith({
        verbs: ['vcrun2019', 'd3dx9'],
        outcomes: { vcrun2019: 'installed', d3dx9: 'installed' },
        status: 'done'
      })
    )
    const text = collectText(rowFor(suggested(again()), 'vcrun2019'))
    expect(text).toContain('Installed')
    expect(text).not.toContain('Done')
  })

  it('shows a live download percentage on the installing row, and the plain phase word once the tail is no longer a progress line', async () => {
    await mount()
    const listener = capturedQueueChangedListener(api)
    const base = {
      verbs: ['vcrun2019'],
      outcomes: { vcrun2019: 'installing' as const },
      currentVerb: 'vcrun2019'
    }
    listener(
      {},
      queueStateWith({
        ...base,
        log: [{ kind: 'progress', text: '42', percent: 42 }]
      })
    )
    expect(collectText(rowFor(suggested(again()), 'vcrun2019'))).toContain(
      'Downloading 42%'
    )

    listener(
      {},
      queueStateWith({
        ...base,
        log: [
          { kind: 'progress', text: '100', percent: 100 },
          { kind: 'noise', text: 'fixme:' },
          { kind: 'info', text: 'Executing w_try_cabextract' }
        ]
      })
    )
    const text = collectText(rowFor(suggested(again()), 'vcrun2019'))
    expect(text).toContain('Installing…')
    expect(text).not.toContain('Downloading')
  })

  it('E6-error: a failed outcome shows Retry, and Retry starts a fresh one-verb run that clears the failed state', async () => {
    await mount()
    capturedQueueChangedListener(api)(
      {},
      queueStateWith({
        verbs: ['vcrun2019'],
        outcomes: { vcrun2019: 'failed' },
        status: 'done'
      })
    )
    const failed = rowFor(suggested(again()), 'vcrun2019')
    expect(String(failed.props.className)).toContain('WinetricksRow--errored')
    expect(collectText(failed)).toContain('Install failed')

    const retry = findByClass(failed, 'WinetricksRow__retry')[0]
    ;(retry.props.onClick as () => void)()
    await flush()

    expect(api.winetricksApply).toHaveBeenCalledTimes(1)
    expect(api.winetricksApply).toHaveBeenCalledWith('legendary', 'fake-app', [
      'vcrun2019'
    ])
    expect(
      String(rowFor(suggested(again()), 'vcrun2019').props.className)
    ).not.toContain('WinetricksRow--errored')
  })

  it('a refused Retry leaves the row failed', async () => {
    api.winetricksApply.mockImplementation(() =>
      Promise.resolve({ accepted: false, reason: 'busy', detail: 'busy' })
    )
    await mount()
    capturedQueueChangedListener(api)(
      {},
      queueStateWith({
        verbs: ['vcrun2019'],
        outcomes: { vcrun2019: 'failed' },
        status: 'done'
      })
    )
    const retry = findByClass(
      rowFor(suggested(again()), 'vcrun2019'),
      'WinetricksRow__retry'
    )[0]
    ;(retry.props.onClick as () => void)()
    await flush()

    expect(
      String(rowFor(suggested(again()), 'vcrun2019').props.className)
    ).toContain('WinetricksRow--errored')
  })

  it('D-18: a remounted tab rebuilds failed rows from the queue state the backend still holds', async () => {
    api.winetricksQueueState.mockImplementation(() =>
      Promise.resolve(
        queueStateWith({
          verbs: ['d3dx9'],
          outcomes: { d3dx9: 'failed' },
          status: 'done'
        })
      )
    )
    const tree = await mount()
    expect(String(rowFor(suggested(tree), 'd3dx9').props.className)).toContain(
      'WinetricksRow--errored'
    )
  })

  it('re-reads the installed list when a run finishes (once per run)', async () => {
    await mount()
    expect(api.winetricksListInstalled).toHaveBeenCalledTimes(1)
    const listener = capturedQueueChangedListener(api)
    const done = queueStateWith({
      verbs: ['vcrun2019'],
      outcomes: { vcrun2019: 'installed' },
      status: 'done'
    })

    listener({}, done)
    listener({}, done)
    await flush()

    expect(api.winetricksListInstalled).toHaveBeenCalledTimes(2)
  })

  it('ignores a push for another game', async () => {
    await mount()
    capturedQueueChangedListener(api)(
      {},
      {
        ...queueStateWith({
          verbs: ['vcrun2019'],
          outcomes: { vcrun2019: 'installing' },
          currentVerb: 'vcrun2019'
        }),
        appName: 'someone-else'
      }
    )
    expect(
      String(rowFor(suggested(again()), 'vcrun2019').props.className)
    ).not.toContain('WinetricksRow--installing')
  })
})

describe('disclosure mouse race (D-04: every disclosure header)', () => {
  it('mousedown toggles once, the click that follows does not toggle it back, and a bare click (keyboard) still toggles', async () => {
    const tree = await mount()
    const header = disclosure(taskGroup(tree, 'fonts'))
    const preventDefault = jest.fn()

    ;(header.props.onMouseDown as (e: unknown) => void)({ preventDefault })
    expect(preventDefault).toHaveBeenCalledTimes(1)
    expect(disclosure(taskGroup(again(), 'fonts')).props['aria-expanded']).toBe(
      true
    )
    ;(disclosure(taskGroup(again(), 'fonts')).props.onClick as () => void)()
    expect(disclosure(taskGroup(again(), 'fonts')).props['aria-expanded']).toBe(
      true
    )
    ;(disclosure(taskGroup(again(), 'fonts')).props.onClick as () => void)()
    expect(disclosure(taskGroup(again(), 'fonts')).props['aria-expanded']).toBe(
      false
    )
  })
})

describe('prohibitions (ROADMAP Discard, D-09, D-10, T-45-20)', () => {
  it('renders no per-row Install button, no upstream category header and no raw HTML anywhere, even with every group open', async () => {
    let tree = await mount()
    for (const id of TASK_GROUP_IDS) {
      ;(disclosure(taskGroup(tree, id)).props.onClick as () => void)()
      tree = again()
    }

    const buttonLabels = findAll(tree, (el) => el.type === 'button').map((el) =>
      collectText(el.props.children).trim()
    )
    expect(buttonLabels).not.toContain('Install')
    expect(collectText(tree).toLowerCase()).not.toContain('dlls')

    let sawInnerHtml = false
    walk(tree, (el) => {
      if ('dangerouslySetInnerHTML' in el.props) sawInnerHtml = true
    })
    expect(sawInnerHtml).toBe(false)
  })

  it('renders only what the backend catalog returned: a hidden verb never appears in any tier', async () => {
    const tree = await mount()
    const everyVerb = new Set(rowVerbs(tree))
    for (const hidden of ['annihilate', 'winxpmode', '3dmark06']) {
      expect(everyVerb.has(hidden)).toBe(false)
    }
  })
})
