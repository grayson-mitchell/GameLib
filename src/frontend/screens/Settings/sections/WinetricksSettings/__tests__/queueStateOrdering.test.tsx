/**
 * Quick task 261011-nqe: whole-tab race tests for the Phase 45 live-gate
 * defect 45-12 G3 ("press Cancel remaining while the first verb is
 * Installing" could not be performed) and the G1/G7 run-frame observation
 * (first verb intermittently renders as Queued with no spinner, no phase
 * word).
 *
 * planning_findings F1: `winetricksQueue.ts` `apply()` takes its reply
 * snapshot (:172) BEFORE the loop's own first push (:93-95, :101), so the
 * backend send order is fixed (push A, push B, then the reply), but nothing
 * orders the reply's invoke-path arrival against the pushes' event-path
 * arrival at the renderer. planning_findings F2: `applyVerbs` (:384-393)
 * applied the reply unconditionally, so a late reply regressed the tab to
 * `currentVerb: ''` / every outcome `pending`, which `StickyBar` reads as
 * Cancel-disabled and `deriveRowState` reads as `queued` until the next push.
 */
import {
  collectText,
  findAll,
  findByClass,
  flush,
  type ElementLike
} from './treeHarness'
import {
  buildCatalog,
  capturedQueueChangedListener,
  idleStateWith,
  installApi,
  makeApi,
  mountTab,
  queueStateWith,
  rerender,
  type MockApi
} from './tabFixtures'
import type { WinetricksQueueState } from 'common/types'

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

// Single-component catalog, same anchor rationale as applyTracer: vcrun2019
// is both curated and a runtimes member, but the runtimes group is collapsed,
// so only the Suggested row renders -- "exactly one checkbox" stays meaningful.
const FIXTURE_VERBS = ['vcrun2019']

let api: MockApi

beforeEach(() => {
  api = makeApi({
    winetricksListAvailable: jest.fn(() =>
      Promise.resolve(
        buildCatalog().filter((c) => FIXTURE_VERBS.includes(c.verb))
      )
    )
  })
  installApi(api)
})

function checkboxFor(tree: ElementLike, verb: string): ElementLike {
  const found = findAll(tree, (el) => el.props['data-verb'] === verb).flatMap(
    (row) => findAll(row, (el) => el.props.role === 'checkbox')
  )
  if (found.length !== 1) {
    throw new Error(
      `expected exactly one checkbox row for ${verb}, saw ${found.length} -- this test proves nothing`
    )
  }
  return found[0]
}

function applyButton(tree: ElementLike): ElementLike {
  const buttons = findAll(
    tree,
    (el) => el.type === 'button' && el.props.onClick !== undefined
  )
  const found = buttons.find((el) => collectText(el.props.children) === 'Apply')
  if (!found) {
    throw new Error(
      'expected an Apply button in the bar -- this test proves nothing'
    )
  }
  return found
}

function cancelButton(tree: ElementLike): ElementLike {
  const found = findByClass(tree, 'WinetricksStickyBar__cancel')
  if (found.length !== 1) {
    throw new Error(
      `expected exactly one Cancel remaining button, saw ${found.length} -- this test proves nothing`
    )
  }
  return found[0]
}

// Lets a RED run (before `WinetricksQueueState` gains `revision`) and a GREEN
// run (after) compile against the same literal: it tags a state with a
// `revision` the current type may not declare yet.
function atRevision<T extends object>(
  revision: number,
  state: T
): T & { revision: number } {
  return Object.assign({}, state, { revision })
}

function deferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
} {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

describe('Winetricks queue state revision ordering (261011-nqe, 45-12 G3)', () => {
  it('a stale apply reply (sent before the run pushes) cannot regress the in-flight first verb', async () => {
    const { promise, resolve } = deferred<{
      accepted: true
      state: WinetricksQueueState
    }>()
    api.winetricksApply.mockImplementation(() => promise)

    const settled = await mountTab(WinetricksSettings)
    const checkbox = checkboxFor(settled, 'vcrun2019')
    ;(checkbox.props.onClick as () => void)()

    const afterToggle = rerender(WinetricksSettings)
    const apply = applyButton(afterToggle)
    ;(apply.props.onClick as () => void)()
    await flush()

    // Push A: the pre-run snapshot, as the loop's caller (`apply()`) would
    // see it before the loop's own first push.
    capturedQueueChangedListener(api)(
      {},
      atRevision(
        2,
        queueStateWith(
          { verbs: ['vcrun2019'], outcomes: { vcrun2019: 'pending' } },
          true
        )
      )
    )
    // Push B: the loop's own synchronous first push -- the verb is installing.
    capturedQueueChangedListener(api)(
      {},
      atRevision(
        3,
        queueStateWith(
          {
            verbs: ['vcrun2019'],
            outcomes: { vcrun2019: 'installing' },
            currentVerb: 'vcrun2019'
          },
          true
        )
      )
    )

    const beforeReply = rerender(WinetricksSettings)
    // Anchor: before the reply lands, the pushes alone already show the
    // correct state. A later failure is attributable to the reply, not to a
    // broken push path.
    expect(findByClass(beforeReply, 'WinetricksRow--installing')).toHaveLength(
      1
    )
    expect(cancelButton(beforeReply).props.disabled).toBe(false)

    // The reply, carrying the PRE-RUN snapshot exactly as `winetricksQueue.ts`
    // :172 produces it (pending, `currentVerb ''`, busy true), lands last.
    resolve({
      accepted: true,
      state: atRevision(
        1,
        queueStateWith(
          { verbs: ['vcrun2019'], outcomes: { vcrun2019: 'pending' } },
          true
        )
      )
    })
    await flush()

    const afterReply = rerender(WinetricksSettings)
    expect(findByClass(afterReply, 'WinetricksRow--installing')).toHaveLength(1)
    expect(cancelButton(afterReply).props.disabled).toBe(false)
    expect(
      findByClass(afterReply, 'WinetricksStickyBar--inFlight')
    ).toHaveLength(1)
  })

  it('control: a fresh apply reply (arriving before any push) IS applied', async () => {
    const { promise, resolve } = deferred<{
      accepted: true
      state: WinetricksQueueState
    }>()
    api.winetricksApply.mockImplementation(() => promise)

    const settled = await mountTab(WinetricksSettings)
    const checkbox = checkboxFor(settled, 'vcrun2019')
    ;(checkbox.props.onClick as () => void)()

    const afterToggle = rerender(WinetricksSettings)
    const apply = applyButton(afterToggle)
    ;(apply.props.onClick as () => void)()
    await flush()

    // The reply resolves FIRST, while the tab still holds the mount's
    // revision-0 state. A guard that swallows every reply fails this.
    resolve({
      accepted: true,
      state: atRevision(
        1,
        queueStateWith(
          { verbs: ['vcrun2019'], outcomes: { vcrun2019: 'pending' } },
          true
        )
      )
    })
    await flush()

    const afterReply = rerender(WinetricksSettings)
    expect(
      findByClass(afterReply, 'WinetricksStickyBar--inFlight')
    ).toHaveLength(1)
    expect(findByClass(afterReply, 'WinetricksRow--queued')).toHaveLength(1)

    // Then the run's own pushes arrive, same shapes as the race test above.
    capturedQueueChangedListener(api)(
      {},
      atRevision(
        2,
        queueStateWith(
          { verbs: ['vcrun2019'], outcomes: { vcrun2019: 'pending' } },
          true
        )
      )
    )
    capturedQueueChangedListener(api)(
      {},
      atRevision(
        3,
        queueStateWith(
          {
            verbs: ['vcrun2019'],
            outcomes: { vcrun2019: 'installing' },
            currentVerb: 'vcrun2019'
          },
          true
        )
      )
    )

    const afterPushes = rerender(WinetricksSettings)
    expect(findByClass(afterPushes, 'WinetricksRow--installing')).toHaveLength(
      1
    )
    expect(cancelButton(afterPushes).props.disabled).toBe(false)
  })

  it('a stale apply reply dropped after the run already finished does not erase the failure it reported (F5)', async () => {
    const { promise, resolve } = deferred<{
      accepted: true
      state: WinetricksQueueState
    }>()
    api.winetricksApply.mockImplementation(() => promise)

    const settled = await mountTab(WinetricksSettings)
    const checkbox = checkboxFor(settled, 'vcrun2019')
    ;(checkbox.props.onClick as () => void)()

    const afterToggle = rerender(WinetricksSettings)
    const apply = applyButton(afterToggle)
    ;(apply.props.onClick as () => void)()
    await flush()

    capturedQueueChangedListener(api)(
      {},
      atRevision(
        1,
        queueStateWith(
          { verbs: ['vcrun2019'], outcomes: { vcrun2019: 'pending' } },
          true
        )
      )
    )
    capturedQueueChangedListener(api)(
      {},
      atRevision(
        2,
        queueStateWith(
          {
            verbs: ['vcrun2019'],
            outcomes: { vcrun2019: 'installing' },
            currentVerb: 'vcrun2019'
          },
          true
        )
      )
    )
    capturedQueueChangedListener(api)(
      {},
      atRevision(
        4,
        queueStateWith(
          {
            verbs: ['vcrun2019'],
            outcomes: { vcrun2019: 'failed' },
            currentVerb: ''
          },
          true
        )
      )
    )
    capturedQueueChangedListener(api)(
      {},
      atRevision(
        5,
        queueStateWith(
          {
            verbs: ['vcrun2019'],
            outcomes: { vcrun2019: 'failed' },
            currentVerb: '',
            status: 'done'
          },
          false
        )
      )
    )

    // The reply, carrying the run's PRE-RUN snapshot, lands last and is
    // older than every push the run already sent -- including the done
    // push that reported the failure.
    resolve({
      accepted: true,
      state: atRevision(
        3,
        queueStateWith(
          {
            verbs: ['vcrun2019'],
            outcomes: { vcrun2019: 'installing' },
            currentVerb: 'vcrun2019'
          },
          true
        )
      )
    })
    await flush()

    const tree = rerender(WinetricksSettings)
    expect(findByClass(tree, 'WinetricksStickyBar--done')).toHaveLength(1)
    expect(collectText(tree)).toContain('1 failed')
    expect(findByClass(tree, 'WinetricksStickyBar--inFlight')).toHaveLength(0)
    expect(findByClass(tree, 'WinetricksRow--errored')).toHaveLength(1)
    expect(findByClass(tree, 'WinetricksRow__retry')).toHaveLength(1)
  })

  it('a stale cancel reply cannot regress a run a fresher push already finished (test 4)', async () => {
    api.winetricksListAvailable.mockImplementation(() =>
      Promise.resolve(
        buildCatalog().filter((c) => ['vcrun2019', 'xact'].includes(c.verb))
      )
    )
    const { promise, resolve } = deferred<WinetricksQueueState>()
    api.winetricksCancelRemaining.mockImplementation(() => promise)

    await mountTab(WinetricksSettings)

    // Held state by push only -- no Apply press needed for this race.
    capturedQueueChangedListener(api)(
      {},
      atRevision(
        3,
        queueStateWith(
          {
            verbs: ['vcrun2019', 'xact'],
            outcomes: { vcrun2019: 'installing', xact: 'pending' },
            currentVerb: 'vcrun2019'
          },
          true
        )
      )
    )

    const beforeCancel = rerender(WinetricksSettings)
    ;(cancelButton(beforeCancel).props.onClick as () => void)()
    await flush()

    capturedQueueChangedListener(api)(
      {},
      atRevision(
        4,
        queueStateWith(
          {
            verbs: ['vcrun2019', 'xact'],
            outcomes: { vcrun2019: 'installing', xact: 'cancelled' },
            currentVerb: 'vcrun2019',
            cancelRequested: true
          },
          true
        )
      )
    )
    capturedQueueChangedListener(api)(
      {},
      atRevision(
        6,
        queueStateWith(
          {
            verbs: ['vcrun2019', 'xact'],
            outcomes: { vcrun2019: 'installed', xact: 'cancelled' },
            currentVerb: '',
            cancelRequested: true
          },
          true
        )
      )
    )
    capturedQueueChangedListener(api)(
      {},
      atRevision(
        7,
        queueStateWith(
          {
            verbs: ['vcrun2019', 'xact'],
            outcomes: { vcrun2019: 'installed', xact: 'cancelled' },
            currentVerb: '',
            cancelRequested: true,
            status: 'done'
          },
          false
        )
      )
    )

    // The cancel reply resolves last, carrying the revision-4 content
    // (still installing, one revision number newer than that push).
    resolve(
      atRevision(
        5,
        queueStateWith(
          {
            verbs: ['vcrun2019', 'xact'],
            outcomes: { vcrun2019: 'installing', xact: 'cancelled' },
            currentVerb: 'vcrun2019',
            cancelRequested: true
          },
          true
        )
      )
    )
    await flush()

    const tree = rerender(WinetricksSettings)
    expect(findByClass(tree, 'WinetricksStickyBar--done')).toHaveLength(1)
    expect(collectText(tree)).toContain('1 installed')
    expect(findByClass(tree, 'WinetricksStickyBar--inFlight')).toHaveLength(0)
    expect(findByClass(tree, 'WinetricksRow--installed')).toHaveLength(1)
    expect(api.winetricksListInstalled).toHaveBeenCalledTimes(2)
  })

  it('a stale remount read cannot regress a run already advanced by a push (test 5)', async () => {
    const { promise, resolve } = deferred<WinetricksQueueState>()
    api.winetricksQueueState.mockImplementation(() => promise)

    await mountTab(WinetricksSettings)

    // Delivered while the mount read is still pending.
    capturedQueueChangedListener(api)(
      {},
      atRevision(
        7,
        queueStateWith(
          {
            verbs: ['vcrun2019'],
            outcomes: { vcrun2019: 'installing' },
            currentVerb: 'vcrun2019'
          },
          true
        )
      )
    )

    // The mount read resolves last but carries an OLDER revision -- it was
    // dispatched before the push above, and only its I/O was slow.
    resolve(atRevision(6, idleStateWith({})))
    await flush()

    const tree = rerender(WinetricksSettings)
    expect(findByClass(tree, 'WinetricksStickyBar--inFlight')).toHaveLength(1)
    expect(cancelButton(tree).props.disabled).toBe(false)
    expect(findByClass(tree, 'WinetricksRow--installing')).toHaveLength(1)
  })

  it('a dropped stale done push still triggers the one installed-list reload (test 6)', async () => {
    api.winetricksListAvailable.mockImplementation(() =>
      Promise.resolve(
        buildCatalog().filter((c) => ['vcrun2019', 'xact'].includes(c.verb))
      )
    )
    const { promise, resolve } = deferred<WinetricksQueueState>()
    api.winetricksCancelRemaining.mockImplementation(() => promise)

    await mountTab(WinetricksSettings)

    // Hold the revision-3 running state, same as test 4.
    capturedQueueChangedListener(api)(
      {},
      atRevision(
        3,
        queueStateWith(
          {
            verbs: ['vcrun2019', 'xact'],
            outcomes: { vcrun2019: 'installing', xact: 'pending' },
            currentVerb: 'vcrun2019'
          },
          true
        )
      )
    )

    const beforeCancel = rerender(WinetricksSettings)
    ;(cancelButton(beforeCancel).props.onClick as () => void)()
    await flush()

    // The cancel reply resolves FIRST, at revision 7, already done.
    resolve(
      atRevision(
        7,
        queueStateWith(
          {
            verbs: ['vcrun2019', 'xact'],
            outcomes: { vcrun2019: 'installed', xact: 'cancelled' },
            currentVerb: '',
            cancelRequested: true,
            status: 'done'
          },
          false
        )
      )
    )
    await flush()

    // Then the stale done push for the same run arrives, at the OLDER
    // revision 6 -- it is dropped, but the one reload it would have
    // triggered must still fire, off the newest run the reply already
    // applied.
    capturedQueueChangedListener(api)(
      {},
      atRevision(
        6,
        queueStateWith(
          {
            verbs: ['vcrun2019', 'xact'],
            outcomes: { vcrun2019: 'installed', xact: 'cancelled' },
            currentVerb: '',
            cancelRequested: true,
            status: 'done'
          },
          false
        )
      )
    )
    await flush()

    const tree = rerender(WinetricksSettings)
    expect(api.winetricksListInstalled).toHaveBeenCalledTimes(2)
    expect(findByClass(tree, 'WinetricksStickyBar--done')).toHaveLength(1)
  })
})
