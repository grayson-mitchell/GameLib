/**
 * Phase 45 Plan 08 (D-16, UI-SPEC E2): the persistent, non-red environment
 * banner. Part 1 renders `EnvironmentBanner` on its own; part 2 checks where the
 * tab puts it and when it withholds it.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import type { WinetricksEnvironmentReport } from 'common/types'
import {
  collectText,
  findAll,
  findByClass,
  harness,
  render,
  type ElementLike
} from './treeHarness'
import {
  capturedQueueChangedListener,
  idleStateWith,
  installApi,
  makeApi,
  mountTab,
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

import EnvironmentBanner from '../EnvironmentBanner'
import WinetricksSettings from '../index'

const GPTK =
  "Wine 7.7, used by GameLib's macOS compatibility layer, is unsupported upstream. This is expected here and can be ignored."

function env(
  overrides: Partial<WinetricksEnvironmentReport> = {}
): WinetricksEnvironmentReport {
  return { unsupportedWineVersion: null, missingDependencies: [], ...overrides }
}

describe('EnvironmentBanner (E2)', () => {
  beforeEach(() => {
    harness().__resetMount()
  })

  function banner(
    environment: WinetricksEnvironmentReport,
    platform: string
  ): ElementLike | null {
    return render(EnvironmentBanner, {
      environment,
      platform
    }) as ElementLike | null
  }

  function rows(tree: ElementLike | null): ElementLike[] {
    return tree ? findByClass(tree, 'WinetricksEnvironmentBanner__row') : []
  }

  it('E2-empty: no warning renders no element at all', () => {
    expect(banner(env(), 'darwin')).toBeNull()
    expect(banner(env(), 'linux')).toBeNull()
  })

  it('E2-populated, darwin: a GPTK row then a missing-dependencies row, stacked as separate rows', () => {
    const tree = banner(
      env({
        unsupportedWineVersion: '7.7',
        missingDependencies: ['cabextract', 'zenity']
      }),
      'darwin'
    )
    const found = rows(tree)
    expect(found).toHaveLength(2)
    expect(collectText(found[0])).toBe(GPTK)
    expect(collectText(found[1])).toBe(
      'Missing: cabextract, zenity. Install them to use every component below.'
    )
  })

  it('A-45-05: on linux an unsupported wine version has no row; the missing-dependencies row remains', () => {
    const tree = banner(
      env({
        unsupportedWineVersion: '7.7',
        missingDependencies: ['cabextract', 'zenity']
      }),
      'linux'
    )
    const found = rows(tree)
    expect(found).toHaveLength(1)
    expect(collectText(found[0])).toContain('Missing: cabextract, zenity.')
    expect(collectText(tree)).not.toContain('macOS compatibility layer')
  })

  it('A-45-05: on linux an unsupported wine version alone renders nothing', () => {
    expect(banner(env({ unsupportedWineVersion: '7.7' }), 'linux')).toBeNull()
  })

  it('one warning renders one row (E2-zero-one-many)', () => {
    expect(
      rows(banner(env({ unsupportedWineVersion: '9.1' }), 'darwin'))
    ).toHaveLength(1)
    expect(
      rows(banner(env({ missingDependencies: ['curl'] }), 'darwin'))
    ).toHaveLength(1)
  })

  it('E2-partial: names exactly the absent subset, up to all five, joined with ", "', () => {
    const five = ['7z', 'cabextract', 'curl', 'unzip', 'zenity']
    const tree = banner(env({ missingDependencies: five }), 'linux')
    expect(collectText(rows(tree)[0])).toBe(
      'Missing: 7z, cabextract, curl, unzip, zenity. Install them to use every component below.'
    )
    expect(
      collectText(
        rows(banner(env({ missingDependencies: ['unzip'] }), 'linux'))[0]
      )
    ).toContain('Missing: unzip.')
  })

  it('each row carries the informational circle icon and nothing cautionary', () => {
    const tree = banner(
      env({ unsupportedWineVersion: '7.7', missingDependencies: ['curl'] }),
      'darwin'
    )
    const icons = findAll(tree, (el) => el.type === 'svg')
    expect(icons.map((el) => el.props['data-icon'])).toEqual([
      'circle-info',
      'circle-info'
    ])
  })

  it('D-16: no row has a button, a dismiss control or an interactive handler', () => {
    const tree = banner(
      env({ unsupportedWineVersion: '7.7', missingDependencies: ['curl'] }),
      'darwin'
    )
    expect(findAll(tree, (el) => el.type === 'button')).toHaveLength(0)
    expect(findAll(tree, (el) => 'onClick' in el.props)).toHaveLength(0)
    expect(findAll(tree, (el) => 'onMouseDown' in el.props)).toHaveLength(0)
  })

  it('renders the version as a plain text node (T-45-23)', () => {
    const tree = banner(env({ unsupportedWineVersion: '7.7' }), 'darwin')
    expect(
      findAll(tree, (el) => 'dangerouslySetInnerHTML' in el.props)
    ).toHaveLength(0)
  })
})

describe('EnvironmentBanner stylesheet (D-16, E2-populated)', () => {
  const dir = join(__dirname, '..', 'EnvironmentBanner')
  const scss = readFileSync(join(dir, 'index.scss'), 'utf8')
  const tsx = readFileSync(join(dir, 'index.tsx'), 'utf8')

  it('uses the neutral input fill and secondary text colour', () => {
    expect(scss).toMatch(
      /background:\s*var\(--input-background,\s*#[0-9a-f]+\)/i
    )
    expect(scss).toMatch(/color:\s*var\(--text-secondary,\s*#[0-9a-f]+\)/i)
  })

  it('wraps and never truncates (E2-overflow)', () => {
    expect(scss).not.toMatch(/text-overflow/)
    expect(scss).not.toMatch(/white-space:\s*nowrap/)
    expect(scss).toMatch(/overflow-wrap:\s*anywhere/)
  })

  it('has no status, danger or cautionary icon', () => {
    for (const source of [scss, tsx]) {
      expect(source).not.toMatch(
        /faTriangleExclamation|faXmark|faCircleExclamation|--danger|--status/
      )
    }
    expect(tsx).toMatch(/faCircleInfo/)
  })
})

describe('the tab and the banner (E2-loading, E1-populated)', () => {
  let api: MockApi

  beforeEach(() => {
    api = makeApi()
    installApi(api)
  })

  const BOTH = {
    unsupportedWineVersion: '7.7',
    missingDependencies: ['cabextract', 'zenity']
  }

  function bannerRows(tree: ElementLike): ElementLike[] {
    return findByClass(tree, 'WinetricksEnvironmentBanner__row')
  }

  it('darwin: both warnings show above the groups', async () => {
    api.winetricksQueueState.mockImplementation(() =>
      Promise.resolve(idleStateWith(BOTH))
    )
    const tree = await mountTab(WinetricksSettings, undefined, 'darwin')
    expect(bannerRows(tree)).toHaveLength(2)

    const order = findAll(tree, (el) => {
      const cn =
        typeof el.props.className === 'string' ? el.props.className : ''
      return /(^|\s)(WinetricksEnvironmentBanner|WinetricksSuggested)(\s|$)/.test(
        cn
      )
    }).map((el) => String(el.props.className).split(' ')[0])
    expect(order).toEqual([
      'WinetricksEnvironmentBanner',
      'WinetricksSuggested'
    ])
  })

  it('linux: only the missing-dependencies warning shows (A-45-05)', async () => {
    api.winetricksQueueState.mockImplementation(() =>
      Promise.resolve(idleStateWith(BOTH))
    )
    const tree = await mountTab(WinetricksSettings, undefined, 'linux')
    expect(bannerRows(tree)).toHaveLength(1)
  })

  it('E2-empty: a clean environment renders no banner element', async () => {
    const tree = await mountTab(WinetricksSettings)
    expect(findByClass(tree, 'WinetricksEnvironmentBanner')).toHaveLength(0)
  })

  it('E2-loading: the banner is withheld while the tab is loading, then appears', async () => {
    let release: (value: never[]) => void = () => undefined
    api.winetricksListAvailable.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve as (value: never[]) => void
        })
    )
    api.winetricksQueueState.mockImplementation(() =>
      Promise.resolve(idleStateWith(BOTH))
    )
    const loading = await mountTab(WinetricksSettings, undefined, 'darwin')
    expect(bannerRows(loading)).toHaveLength(0)
    expect(collectText(loading)).toContain('Loading available components')
    release([])
  })

  it('a pushed environment change updates the banner and it persists across later pushes', async () => {
    await mountTab(WinetricksSettings, undefined, 'darwin')
    capturedQueueChangedListener(api)({}, idleStateWith(BOTH))
    expect(bannerRows(rerender(WinetricksSettings))).toHaveLength(2)

    capturedQueueChangedListener(api)(
      {},
      idleStateWith({ ...BOTH, missingDependencies: [] })
    )
    expect(bannerRows(rerender(WinetricksSettings))).toHaveLength(1)
  })
})
