/**
 * Phase 45 Plan 01 (D-01/D-11): end-to-end tracer for the Winetricks Settings
 * tab. Proves the renderer half of the slice the plan's objective names: tick
 * one curated row, press Apply, see `window.api.winetricksApply` called with
 * exactly `(runner, appName, [verb])`; then a `winetricksQueueChanged` push
 * reporting that verb `installed` and the run `done` renders the row's
 * trailing tag as `Installed` and the sticky bar as `1 installed`.
 *
 * Plan 45-07 reshaped the tab into real child components (Row, groups), so the
 * tree is now expanded through the shared `treeHarness` instead of read flat;
 * the three assertions below are unchanged in what they prove.
 *
 * No jsdom / react-test-renderer is installed in this project (see
 * `src/frontend/jest.config.js`'s own docstring), so the component is invoked
 * as a plain function against the hand-rolled hook harness -- never `render()`,
 * `fireEvent`, or `screen.*`.
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

// A single-component catalog keeps the tracer's "exactly one checkbox" anchor
// meaningful: vcrun2019 is both curated (Suggested) and a runtimes member, but
// the runtimes group is collapsed, so only the Suggested row renders.
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

describe('Winetricks Settings tab tracer (D-01/D-11)', () => {
  it('non-vacuity anchor: the curated vcrun2019 row and an Apply button are present once settled', async () => {
    const tree = await mountTab(WinetricksSettings)
    expect(findByClass(tree, 'WinetricksRow')).toHaveLength(1)
    expect(() => applyButton(tree)).not.toThrow()
  })

  it('ticking the row then pressing Apply calls winetricksApply(runner, appName, [verb]) exactly once', async () => {
    const settled = await mountTab(WinetricksSettings)

    const checkbox = checkboxFor(settled, 'vcrun2019')
    ;(checkbox.props.onClick as () => void)()

    // Re-render to pick up the updated `selection` state -- the Apply
    // button's `onClick` closes over whichever `selection` array was live
    // at the render that produced it.
    const afterToggle = rerender(WinetricksSettings)
    const apply = applyButton(afterToggle)
    ;(apply.props.onClick as () => void)()
    await flush()

    expect(api.winetricksApply).toHaveBeenCalledTimes(1)
    expect(api.winetricksApply).toHaveBeenCalledWith('legendary', 'fake-app', [
      'vcrun2019'
    ])
  })

  it('a winetricksQueueChanged push reporting the verb installed and the run done renders "Installed" and "1 installed"', async () => {
    await mountTab(WinetricksSettings)

    capturedQueueChangedListener(api)(
      {},
      queueStateWith({
        verbs: ['vcrun2019'],
        outcomes: { vcrun2019: 'installed' },
        status: 'done'
      })
    )

    const tree = rerender(WinetricksSettings)
    const installedTag = findByClass(tree, 'WinetricksRow__tag--installed')
    expect(installedTag).toHaveLength(1)
    expect(collectText(installedTag[0])).toBe('Installed')

    const bar = findByClass(tree, 'WinetricksStickyBar')
    expect(bar).toHaveLength(1)
    expect(collectText(bar[0])).toContain('1 installed')
  })
})
