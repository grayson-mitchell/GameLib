/**
 * Phase 45 Plan 08 (UI-SPEC E10 whole-tab list states, E1 shell): loading,
 * empty, fail-open and populated. The banner, the log disclosure and the action
 * bar exist only in the populated layout.
 */
import {
  collectText,
  findAll,
  findByClass,
  type ElementLike
} from './treeHarness'
import {
  buildCatalog,
  idleStateWith,
  installApi,
  makeApi,
  mountTab,
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

const WARNINGS = {
  unsupportedWineVersion: '7.7',
  missingDependencies: ['cabextract']
}

function has(tree: ElementLike, token: string): boolean {
  return findByClass(tree, token).length > 0
}

describe('populated (E1-populated, E10-populated)', () => {
  it('non-vacuity: banner, Suggested, the five groups, Everything else, log disclosure and bar all render', async () => {
    api.winetricksQueueState.mockImplementation(() =>
      Promise.resolve(idleStateWith(WARNINGS))
    )
    const tree = await mountTab(WinetricksSettings, undefined, 'darwin')
    expect(has(tree, 'WinetricksEnvironmentBanner')).toBe(true)
    expect(has(tree, 'WinetricksSuggested')).toBe(true)
    expect(findByClass(tree, 'WinetricksTaskGroup')).toHaveLength(5)
    expect(has(tree, 'WinetricksEverythingElse')).toBe(true)
    expect(has(tree, 'WinetricksLogPanel')).toBe(true)
    expect(has(tree, 'WinetricksStickyBar')).toBe(true)
  })

  it('E10-zero-one-many: a catalog of one verb still renders the full layout', async () => {
    api.winetricksListAvailable.mockImplementation(() =>
      Promise.resolve(buildCatalog().filter((c) => c.verb === 'vcrun2019'))
    )
    const tree = await mountTab(WinetricksSettings)
    expect(has(tree, 'WinetricksSuggested')).toBe(true)
    expect(has(tree, 'WinetricksStickyBar')).toBe(true)
    expect(has(tree, 'WinetricksEmptyState')).toBe(false)
  })

  it('E1-long-text: the tab body adds no heading element of its own around the groups', async () => {
    const tree = await mountTab(WinetricksSettings)
    const directChildren = (tree.props.children as unknown[]).flat(Infinity)
    const shellHeadings = directChildren.filter(
      (child) =>
        child &&
        typeof child === 'object' &&
        /^h[1-6]$/.test(String((child as ElementLike).type))
    )
    expect(shellHeadings).toHaveLength(0)
  })
})

describe('loading (E1-loading, E10-loading)', () => {
  it('shows only the centered loading text: no banner, no groups, no log, no bar', async () => {
    api.winetricksListAvailable.mockImplementation(
      () => new Promise(() => undefined)
    )
    api.winetricksQueueState.mockImplementation(() =>
      Promise.resolve(idleStateWith(WARNINGS))
    )
    const tree = await mountTab(WinetricksSettings, undefined, 'darwin')

    expect(collectText(tree)).toBe('Loading available components ...')
    expect(findByClass(tree, 'WinetricksSettings__loading')).toHaveLength(1)
    for (const token of [
      'WinetricksEnvironmentBanner',
      'WinetricksSuggested',
      'WinetricksTaskGroup',
      'WinetricksEverythingElse',
      'WinetricksLogPanel',
      'WinetricksStickyBar',
      'WinetricksEmptyState'
    ]) {
      expect(has(tree, token)).toBe(false)
    }
  })
})

describe('empty catalog (E10-empty, E10-error, E10-long-text)', () => {
  async function emptyTab(): Promise<ElementLike> {
    api.winetricksListAvailable.mockImplementation(() => Promise.resolve([]))
    api.winetricksQueueState.mockImplementation(() =>
      Promise.resolve(idleStateWith(WARNINGS))
    )
    return mountTab(WinetricksSettings, undefined, 'darwin')
  }

  it('shows a centered icon, the heading and the body, with no recovery action', async () => {
    const tree = await emptyTab()
    const empty = findByClass(tree, 'WinetricksEmptyState')
    expect(empty).toHaveLength(1)
    expect(findAll(empty[0], (el) => el.type === 'svg')).toHaveLength(1)
    expect(
      collectText(findByClass(empty[0], 'WinetricksEmptyState__heading')[0])
    ).toBe('No components available')
    expect(
      collectText(findByClass(empty[0], 'WinetricksEmptyState__body')[0])
    ).toBe('Winetricks metadata could not be loaded for this bottle.')
    expect(findAll(empty[0], (el) => el.type === 'button')).toHaveLength(0)
  })

  it('withholds the banner, the groups, the log disclosure and the bar', async () => {
    const tree = await emptyTab()
    for (const token of [
      'WinetricksEnvironmentBanner',
      'WinetricksSuggested',
      'WinetricksTaskGroup',
      'WinetricksEverythingElse',
      'WinetricksLogPanel',
      'WinetricksStickyBar'
    ]) {
      expect(has(tree, token)).toBe(false)
    }
  })

  it('is not the loading text and not the declined notice', async () => {
    const text = collectText(await emptyTab())
    expect(text).not.toContain('Loading available components')
    expect(text).not.toContain('unavailable on this build')
  })
})

describe('installed-list read fails (E10-partial, A-45-04)', () => {
  it('renders the catalog rows as Available with no Installed badge, fail-open', async () => {
    api.winetricksListInstalled.mockImplementation(() =>
      Promise.reject(new Error('read failed'))
    )
    const tree = await mountTab(WinetricksSettings)

    expect(has(tree, 'WinetricksEmptyState')).toBe(false)
    expect(has(tree, 'WinetricksSettings__declined')).toBe(false)
    const rows = findByClass(tree, 'WinetricksRow')
    expect(rows.length).toBeGreaterThan(3)
    expect(has(tree, 'WinetricksRow__tag--installed')).toBe(false)
    expect(has(tree, 'WinetricksStickyBar')).toBe(true)
  })
})

describe('catalog call declines (D-03, unchanged)', () => {
  it('a rejecting catalog call still shows the declined notice, not the empty state', async () => {
    api.winetricksListAvailable.mockImplementation(() =>
      Promise.reject(new Error('not on this build'))
    )
    const tree = await mountTab(WinetricksSettings)
    expect(has(tree, 'WinetricksSettings__declined')).toBe(true)
    expect(has(tree, 'WinetricksEmptyState')).toBe(false)
    expect(has(tree, 'WinetricksStickyBar')).toBe(false)
  })
})
