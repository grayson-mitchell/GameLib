/**
 * Phase 45 Plan 08 (D-13, UI-SPEC Interaction 6, threat T-45-24): while this
 * game's run is in flight nothing can be ticked or retried, Cancel remaining
 * goes through `winetricksCancelRemaining` exactly once, and it is disabled
 * in the gap between two verbs so a click can never race an empty queue.
 */
import {
  collectText,
  findAll,
  findByClass,
  flush,
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

beforeEach(() => {
  api = makeApi()
  installApi(api)
})

function push(state: ReturnType<typeof queueStateWith>): ElementLike {
  capturedQueueChangedListener(api)({}, state)
  return rerender(WinetricksSettings)
}

function rowFor(tree: ElementLike, verb: string): ElementLike {
  const rows = findAll(tree, (el) => el.props['data-verb'] === verb)
  if (rows.length === 0) throw new Error(`no row for ${verb}`)
  return rows[0]
}

function checkboxOf(row: ElementLike): ElementLike | undefined {
  return findAll(row, (el) => el.props.role === 'checkbox')[0]
}

function allCheckboxes(tree: ElementLike): ElementLike[] {
  return findAll(tree, (el) => el.props.role === 'checkbox')
}

function retryOf(row: ElementLike): ElementLike | undefined {
  return findByClass(row, 'WinetricksRow__retry')[0]
}

function cancelButton(tree: ElementLike): ElementLike {
  const found = findByClass(tree, 'WinetricksStickyBar__cancel')
  if (found.length !== 1) {
    throw new Error(`expected one Cancel remaining button, saw ${found.length}`)
  }
  return found[0]
}

const RUNNING = queueStateWith({
  verbs: ['vcrun2019', 'vcrun2013'],
  outcomes: { vcrun2019: 'installing', vcrun2013: 'pending' },
  currentVerb: 'vcrun2019'
})

describe('selection lock (D-13)', () => {
  it('non-vacuity: before a run, the available rows have enabled checkboxes', async () => {
    const tree = await mountTab(WinetricksSettings)
    const boxes = allCheckboxes(tree)
    expect(boxes.length).toBeGreaterThan(3)
    for (const box of boxes) expect(box.props.disabled).toBe(false)
  })

  it('while the run is running every checkbox is disabled', async () => {
    await mountTab(WinetricksSettings)
    const tree = push(RUNNING)
    const boxes = allCheckboxes(tree)
    expect(boxes.length).toBeGreaterThan(3)
    for (const box of boxes) expect(box.props.disabled).toBe(true)
  })

  it('a toggle attempt during the run leaves the selection unchanged, and the box is free again afterwards', async () => {
    await mountTab(WinetricksSettings)
    const during = push(RUNNING)
    const corefonts = checkboxOf(rowFor(during, 'corefonts'))
    ;(corefonts?.props.onClick as () => void)()

    const finished = push(
      queueStateWith({
        verbs: ['vcrun2019', 'vcrun2013'],
        outcomes: { vcrun2019: 'installed', vcrun2013: 'installed' },
        status: 'done'
      })
    )
    const box = checkboxOf(rowFor(finished, 'corefonts'))
    expect(box?.props['aria-checked']).toBe(false)
    expect(box?.props.disabled).toBe(false)
    // Nothing is selected, so the bar is still the done summary, not a count.
    expect(collectText(findByClass(finished, 'WinetricksStickyBar')[0])).toBe(
      '2 installed'
    )
  })

  it('every checkbox is enabled again once the run has ended', async () => {
    await mountTab(WinetricksSettings)
    push(RUNNING)
    const tree = push(
      queueStateWith({
        verbs: ['vcrun2019'],
        outcomes: { vcrun2019: 'installed' },
        status: 'done'
      })
    )
    for (const box of allCheckboxes(tree))
      expect(box.props.disabled).toBe(false)
  })

  it('Retry is disabled while a run is in flight and enabled again after', async () => {
    await mountTab(WinetricksSettings)
    const failed = push(
      queueStateWith({
        verbs: ['xact'],
        outcomes: { xact: 'failed' },
        status: 'done'
      })
    )
    expect(retryOf(rowFor(failed, 'xact'))?.props.disabled).toBe(false)

    const running = push(RUNNING)
    expect(retryOf(rowFor(running, 'xact'))?.props.disabled).toBe(true)

    const after = push(
      queueStateWith({
        verbs: ['vcrun2019'],
        outcomes: { vcrun2019: 'installed' },
        status: 'done'
      })
    )
    expect(retryOf(rowFor(after, 'xact'))?.props.disabled).toBe(false)
  })

  it('a foreign install (busy, no run of ours) also locks the checkboxes', async () => {
    await mountTab(WinetricksSettings)
    const tree = push(queueStateWith({ verbs: [], status: 'done' }, true))
    for (const box of allCheckboxes(tree)) expect(box.props.disabled).toBe(true)
  })
})

describe('Cancel remaining (D-13, T-45-24)', () => {
  it('calls winetricksCancelRemaining exactly once with (runner, appName)', async () => {
    await mountTab(WinetricksSettings)
    const tree = push(RUNNING)
    const cancel = cancelButton(tree)
    expect(cancel.props.disabled).toBe(false)
    ;(cancel.props.onMouseDown as (e: unknown) => void)({
      button: 0,
      preventDefault: () => undefined
    })
    ;(cancel.props.onClick as () => void)()
    await flush()

    expect(api.winetricksCancelRemaining).toHaveBeenCalledTimes(1)
    expect(api.winetricksCancelRemaining).toHaveBeenCalledWith(
      'legendary',
      'fake-app'
    )
  })

  it('is present and disabled between two verbs (currentVerb empty)', async () => {
    await mountTab(WinetricksSettings)
    const tree = push(
      queueStateWith({
        verbs: ['vcrun2019', 'vcrun2013'],
        outcomes: { vcrun2019: 'installed', vcrun2013: 'pending' },
        currentVerb: ''
      })
    )
    expect(cancelButton(tree).props.disabled).toBe(true)
  })

  it('applies the backend state it gets back (the run now reports cancelRequested)', async () => {
    api.winetricksCancelRemaining.mockImplementation(() =>
      Promise.resolve(
        queueStateWith({
          verbs: ['vcrun2019', 'vcrun2013'],
          outcomes: { vcrun2019: 'installing', vcrun2013: 'cancelled' },
          currentVerb: 'vcrun2019',
          cancelRequested: true
        })
      )
    )
    await mountTab(WinetricksSettings)
    const tree = push(RUNNING)
    ;(cancelButton(tree).props.onClick as () => void)()
    await flush()

    expect(cancelButton(rerender(WinetricksSettings)).props.disabled).toBe(true)
  })
})
