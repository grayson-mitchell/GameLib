/**
 * Fixtures shared by the whole-tab tests (`applyTracer`, `groups`,
 * `everythingElse`): a catalog built from the real task-group membership, a
 * mocked `window.api`, and the mount helpers. Kept out of the test files so the
 * three suites cannot drift in what "a settled tab" means.
 *
 * Import this module only from a test file that has already registered the
 * `react`, `react-i18next` and `@fortawesome/react-fontawesome` mocks and the
 * four stylesheet mocks.
 */
import type {
  Runner,
  WinetricksComponent,
  WinetricksQueueRun,
  WinetricksQueueState
} from 'common/types'
import { TASK_GROUP_IDS, TASK_GROUP_MEMBERS } from 'common/winetricks/verbs'
import { flush, harness, render, type ElementLike } from './treeHarness'

const RUNNER = 'legendary' as Runner

// One catalog entry per verb that any task group names, plus two long-tail
// verbs that belong to no group (only Everything else shows them). Categories
// follow upstream's: fonts and settings have their own, the rest are dlls.
export function buildCatalog(
  omit: readonly string[] = []
): WinetricksComponent[] {
  const entries: WinetricksComponent[] = []
  for (const id of TASK_GROUP_IDS) {
    for (const verb of TASK_GROUP_MEMBERS[id]) {
      entries.push({
        verb,
        title: `Title of ${verb}`,
        category:
          id === 'fonts'
            ? 'fonts'
            : id === 'wineSettings'
              ? 'settings'
              : 'dlls',
        cached: false
      })
    }
  }
  entries.push(
    {
      verb: 'foobar2000',
      title: 'foobar2000 1.0',
      category: 'apps',
      cached: false
    },
    {
      verb: 'gdiplus_winxp',
      title: 'GDI+ for XP',
      category: 'dlls',
      cached: false
    }
  )
  return entries.filter((entry) => !omit.includes(entry.verb))
}

export function emptyQueueState(): WinetricksQueueState {
  return {
    runner: RUNNER,
    appName: 'fake-app',
    run: null,
    busy: false,
    environment: { unsupportedWineVersion: null, missingDependencies: [] }
  }
}

export function queueStateWith(
  run: Partial<WinetricksQueueRun> & Pick<WinetricksQueueRun, 'verbs'>,
  busy = false
): WinetricksQueueState {
  return {
    ...emptyQueueState(),
    busy,
    run: {
      runId: 1,
      runner: RUNNER,
      appName: 'fake-app',
      outcomes: {},
      currentVerb: '',
      status: 'running',
      cancelRequested: false,
      log: [],
      ...run
    }
  }
}

export type QueueChangedListener = (
  event: unknown,
  state: WinetricksQueueState
) => void

export interface MockApi {
  winetricksListAvailable: jest.Mock
  winetricksListInstalled: jest.Mock
  winetricksQueueState: jest.Mock
  winetricksApply: jest.Mock
  winetricksCancelRemaining: jest.Mock
  handleWinetricksQueueChanged: jest.Mock
  getKnownFixes: jest.Mock
  getWikiGameInfo: jest.Mock
  logError: jest.Mock
}

// Built inside `beforeEach`: this project's Frontend jest config sets
// `resetMocks: true`, which strips implementations off every `jest.fn()`
// created at module scope before each test.
export function makeApi(overrides: Partial<MockApi> = {}): MockApi {
  return {
    winetricksListAvailable: jest.fn(() => Promise.resolve(buildCatalog())),
    winetricksListInstalled: jest.fn(() => Promise.resolve([])),
    winetricksQueueState: jest.fn(() => Promise.resolve(emptyQueueState())),
    winetricksApply: jest.fn(() =>
      Promise.resolve({ accepted: true, state: emptyQueueState() })
    ),
    winetricksCancelRemaining: jest.fn(() =>
      Promise.resolve(emptyQueueState())
    ),
    handleWinetricksQueueChanged: jest.fn(() => () => undefined),
    getKnownFixes: jest.fn(() => Promise.resolve(null)),
    getWikiGameInfo: jest.fn(() => Promise.resolve(null)),
    logError: jest.fn(),
    ...overrides
  }
}

export function installApi(api: MockApi): void {
  ;(globalThis as unknown as { window: { api: MockApi } }).window = { api }
}

export function capturedQueueChangedListener(
  api: MockApi
): QueueChangedListener {
  const calls = api.handleWinetricksQueueChanged.mock
    .calls as unknown as QueueChangedListener[][]
  return calls[calls.length - 1][0]
}

type Tab = () => unknown

export function rerender(tab: Tab): ElementLike {
  return render(tab, {})
}

export async function mountTab(tab: Tab): Promise<ElementLike> {
  harness().__resetMount()
  harness().__setContext({
    appName: 'fake-app',
    runner: RUNNER,
    gameInfo: { title: 'Fake Game' }
  })
  rerender(tab)
  await flush()
  return rerender(tab)
}
