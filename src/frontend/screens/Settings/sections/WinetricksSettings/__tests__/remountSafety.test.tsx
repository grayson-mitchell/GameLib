/**
 * Phase 45 Plan 08 (D-04, D-18, Interaction Contract 5): the tab body mounts on
 * `!declined` alone -- a run starting, a run finishing and the post-run
 * installed-list re-read each leave the same rows and groups on screen -- and a
 * run outlives navigation: a remounted tab rebuilds itself from
 * `winetricksQueueState` plus a fresh installed-list read.
 *
 * Ported from the Phase 44 `WinetricksBrowse/__tests__/remountSafety.test.tsx`
 * (git `e297ec0df^`, the parent of the 45-02 deletion commit). Phase 44 proved
 * that mounting `WinetricksBrowse` was never re-gated on `installing` or on the
 * installed-list revalidation flag -- the exact shape Phase 35 Plan 25
 * (`366e719bb`) only half-closed. That fix covered one trigger and left the
 * other unguarded, so the proof here is INDEPENDENT per trigger: each of the
 * three is reverted to red on its own (see 45-08-SUMMARY.md for the recorded
 * failures), not merely asserted green today.
 *
 * The Phase 44 file hand-mocked its nested component because its harness could
 * not expand children. 45-07's `treeHarness` expands the real tree (rows,
 * groups, bar, panel), so nothing below is a stand-in.
 *
 * What the harness cannot do: it keeps a component instance's state even if a
 * pass does not render it, so "survived a real unmount" cannot be observed. The
 * observable that DOES break when the body is gated off is that the row
 * elements are absent from the pass that renders during the trigger window --
 * which is what the gates this file was reverted against produce.
 */
import {
  collectText,
  findAll,
  findByClass,
  flush,
  harness,
  type ElementLike
} from './treeHarness'
import {
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
jest.mock('../StickyBar/index.scss', () => ({}), { virtual: true })
jest.mock('../LogPanel/index.scss', () => ({}), { virtual: true })
jest.mock('../EnvironmentBanner/index.scss', () => ({}), { virtual: true })
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

let api: MockApi

// Every `window.api` property read that is not part of the tab's own surface:
// a dialog, toast or confirmation API would land here (D-18, Interaction 5).
let strayApiReads: string[]
let confirmCalls: number

beforeEach(() => {
  api = makeApi()
  strayApiReads = []
  confirmCalls = 0
  const guarded = new Proxy(api, {
    get(target, prop) {
      if (!(prop in target) && typeof prop === 'string') {
        strayApiReads.push(prop)
      }
      return (target as unknown as Record<string, unknown>)[prop as string]
    }
  })
  installApi(guarded)
  const win = (globalThis as unknown as { window: Record<string, unknown> })
    .window
  win.confirm = () => {
    confirmCalls++
    return true
  }
  win.alert = () => {
    confirmCalls++
  }
})

function rowVerbs(tree: ElementLike): string[] {
  return findByClass(tree, 'WinetricksRow')
    .map((row) => String(row.props['data-verb']))
    .sort()
}

// What "the tab body is mounted" means for this tab: every tier is present and
// the same rows are on screen.
function bodyOf(tree: ElementLike) {
  return {
    suggested: findByClass(tree, 'WinetricksSuggested').length,
    taskGroups: findByClass(tree, 'WinetricksTaskGroup').length,
    everythingElse: findByClass(tree, 'WinetricksEverythingElse').length,
    dock: findByClass(tree, 'WinetricksSettings__dock').length,
    rows: rowVerbs(tree)
  }
}

function openRuntimes(tree: ElementLike): ElementLike {
  const group = findAll(tree, (el) => el.props['data-group'] === 'runtimes')[0]
  const header = findAll(
    group,
    (el) => el.type === 'button' && 'aria-expanded' in el.props
  )[0]
  ;(header.props.onClick as () => void)()
  return rerender(WinetricksSettings)
}

async function settledWithOpenGroup(): Promise<ElementLike> {
  return openRuntimes(await mountTab(WinetricksSettings))
}

const VERBS = ['vcrun2019', 'vcrun2013']

const RUNNING = () =>
  queueStateWith({
    verbs: VERBS,
    outcomes: { vcrun2019: 'installing', vcrun2013: 'pending' },
    currentVerb: 'vcrun2019',
    log: [
      { kind: 'info', text: 'Executing w_do_call vcrun2019' },
      { kind: 'error', text: 'oops' }
    ]
  })

const DONE = () =>
  queueStateWith({
    verbs: VERBS,
    outcomes: { vcrun2019: 'installed', vcrun2013: 'installed' },
    status: 'done'
  })

describe('the tab body mounts on !declined alone (D-04, C-1)', () => {
  it('non-vacuity: the settled tab has every tier and many rows to compare', async () => {
    const before = bodyOf(await settledWithOpenGroup())
    expect(before.suggested).toBe(1)
    expect(before.taskGroups).toBe(TASK_GROUP_IDS.length)
    expect(before.everythingElse).toBe(1)
    expect(before.dock).toBe(1)
    // 8 curated + the runtimes group body (its members that are not curated).
    expect(before.rows.length).toBeGreaterThanOrEqual(
      TASK_GROUP_MEMBERS.runtimes.length
    )
  })

  it('trigger 1, a run starts: a winetricksQueueChanged push with status running leaves the same body mounted', async () => {
    const before = bodyOf(await settledWithOpenGroup())

    capturedQueueChangedListener(api)({}, RUNNING())
    const during = rerender(WinetricksSettings)

    expect(bodyOf(during)).toEqual(before)
  })

  it('trigger 2, a run finishes: the done state (status done) leaves the same body mounted', async () => {
    const before = bodyOf(await settledWithOpenGroup())

    capturedQueueChangedListener(api)({}, RUNNING())
    rerender(WinetricksSettings)
    capturedQueueChangedListener(api)({}, DONE())
    // Let the one-off post-run installed re-read settle, so this case observes
    // the done STATE alone. The re-read window is trigger 3's case below.
    await flush()
    // The backend pushes the same finished run again (same run id): no re-read.
    capturedQueueChangedListener(api)({}, DONE())
    const after = rerender(WinetricksSettings)

    expect(api.winetricksListInstalled).toHaveBeenCalledTimes(2)
    expect(bodyOf(after)).toEqual(before)
  })

  it('trigger 3, the post-run installed-list re-read is in flight: the body stays mounted for the whole window', async () => {
    const before = bodyOf(await settledWithOpenGroup())

    // Hold the NEXT installed-list read open so the window is observable.
    let finishRead: (installed: string[]) => void = () => undefined
    api.winetricksListInstalled.mockImplementation(
      () =>
        new Promise<string[]>((resolve) => {
          finishRead = resolve
        })
    )

    capturedQueueChangedListener(api)({}, RUNNING())
    rerender(WinetricksSettings)
    capturedQueueChangedListener(api)({}, DONE())
    await flush()

    // Non-vacuity: the re-read really started and has not returned.
    expect(api.winetricksListInstalled).toHaveBeenCalledTimes(2)
    const during = rerender(WinetricksSettings)
    expect(bodyOf(during)).toEqual(before)

    finishRead(['vcrun2019'])
    await flush()
    const after = rerender(WinetricksSettings)
    expect(bodyOf(after)).toEqual(before)
    // ... and the new data landed on the same rows.
    expect(
      collectText(
        findAll(after, (el) => el.props['data-verb'] === 'vcrun2019')[0]
      )
    ).toContain('Installed')
  })

  it('a run that ends in failure does not unmount the body either', async () => {
    const before = bodyOf(await settledWithOpenGroup())
    capturedQueueChangedListener(api)({}, RUNNING())
    rerender(WinetricksSettings)
    capturedQueueChangedListener(api)(
      {},
      queueStateWith({
        verbs: VERBS,
        outcomes: { vcrun2019: 'failed', vcrun2013: 'cancelled' },
        status: 'done'
      })
    )
    await flush()
    expect(bodyOf(rerender(WinetricksSettings))).toEqual(before)
  })
})

describe('a run outlives navigation (D-18, Interaction Contract 5)', () => {
  it('leaving the tab mid-run warns, cancels and confirms nothing', async () => {
    await mountTab(WinetricksSettings)
    capturedQueueChangedListener(api)({}, RUNNING())
    rerender(WinetricksSettings)

    // The harness has no unmount; changing the effect's deps runs the cleanup,
    // which is what leaving the Settings screen does.
    harness().__setContext({
      appName: 'other-app',
      runner: 'legendary',
      platform: 'linux',
      gameInfo: { title: 'Other Game' }
    })
    rerender(WinetricksSettings)
    await flush()

    expect(api.winetricksCancelRemaining).not.toHaveBeenCalled()
    expect(api.winetricksApply).not.toHaveBeenCalled()
    expect(strayApiReads).toEqual([])
    expect(confirmCalls).toBe(0)
  })

  it('remounting mid-run rebuilds rows, bar and log from winetricksQueueState', async () => {
    api.winetricksListInstalled.mockImplementation(() =>
      Promise.resolve(['corefonts'])
    )
    api.winetricksQueueState.mockImplementation(() =>
      Promise.resolve(RUNNING())
    )
    const tree = await mountTab(WinetricksSettings)

    // Fresh installed-list read happened on this mount.
    expect(api.winetricksListInstalled).toHaveBeenCalledTimes(1)
    expect(api.winetricksQueueState).toHaveBeenCalledWith(
      'legendary',
      'fake-app'
    )

    const rowFor = (verb: string) =>
      findAll(tree, (el) => el.props['data-verb'] === verb)[0]
    expect(String(rowFor('vcrun2019').props.className)).toContain(
      'WinetricksRow--installing'
    )
    expect(String(rowFor('vcrun2013').props.className)).toContain(
      'WinetricksRow--queued'
    )
    expect(String(rowFor('corefonts').props.className)).toContain(
      'WinetricksRow--installed'
    )

    const bar = findByClass(tree, 'WinetricksStickyBar')[0]
    expect(String(bar.props.className)).toContain(
      'WinetricksStickyBar--inFlight'
    )
    expect(collectText(bar)).toContain('Installing 1 of 2')
    expect(findByClass(bar, 'WinetricksStickyBar__cancel')).toHaveLength(1)

    // The log was seeded from run.log.
    const panel = findByClass(tree, 'WinetricksLogPanel')[0]
    const toggle = findAll(
      panel,
      (el) => el.type === 'button' && 'aria-expanded' in el.props
    )[0]
    ;(toggle.props.onClick as () => void)()
    const opened = findByClass(
      findByClass(rerender(WinetricksSettings), 'WinetricksLogPanel')[0],
      'WinetricksLogPanel__line'
    ).map((el) => collectText(el))
    expect(opened).toEqual(['Executing w_do_call vcrun2019', 'oops'])
  })

  it('mounting and remounting mid-run never cancels, applies, confirms or reaches for a dialog or toast', async () => {
    api.winetricksQueueState.mockImplementation(() =>
      Promise.resolve(RUNNING())
    )
    await mountTab(WinetricksSettings)
    await mountTab(WinetricksSettings)

    expect(api.winetricksCancelRemaining).not.toHaveBeenCalled()
    expect(api.winetricksApply).not.toHaveBeenCalled()
    expect(strayApiReads).toEqual([])
    expect(confirmCalls).toBe(0)
  })
})
