/**
 * Phase 45 Plan 08 (D-14/D-15/D-18, UI-SPEC E9): the classified log disclosure,
 * and the live progress plumbing in the tab that feeds it.
 *
 * Part 1 renders `LogPanel` on its own through the shared `treeHarness`. Part 2
 * mounts the whole tab and drives `handleProgressOfWinetricks` /
 * `winetricksQueueChanged` the way the backend does.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import type { WinetricksLogLine } from 'common/types'
import {
  collectText,
  findAll,
  findByClass,
  flush,
  harness,
  render,
  type ElementLike
} from './treeHarness'
import {
  capturedProgressListener,
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

import LogPanel from '../LogPanel'
import WinetricksSettings from '../index'

const PRIMARY = { button: 0, preventDefault: () => undefined }

function line(
  kind: WinetricksLogLine['kind'],
  text: string,
  percent?: number
): WinetricksLogLine {
  return percent === undefined ? { kind, text } : { kind, text, percent }
}

// -- Part 1: the panel on its own ------------------------------------------

describe('LogPanel (E9)', () => {
  beforeEach(() => {
    harness().__resetMount()
  })

  function panel(lines: WinetricksLogLine[]): ElementLike {
    return render(LogPanel, { lines })
  }

  function toggle(tree: ElementLike): ElementLike {
    const found = findAll(
      tree,
      (el) => el.type === 'button' && 'aria-expanded' in el.props
    )
    if (found.length !== 1) {
      throw new Error(`expected one disclosure button, saw ${found.length}`)
    }
    return found[0]
  }

  function open(lines: WinetricksLogLine[]): ElementLike {
    ;(toggle(panel(lines)).props.onClick as () => void)()
    return panel(lines)
  }

  function logLines(tree: ElementLike): ElementLike[] {
    return findByClass(tree, 'WinetricksLogPanel__line')
  }

  it('non-vacuity: the panel root renders with its class', () => {
    expect(String(panel([]).props.className)).toContain('WinetricksLogPanel')
  })

  it('is collapsed by default behind a real button reading "Show details"', () => {
    const tree = panel([line('info', 'hello')])
    const button = toggle(tree)
    expect(button.props.type).toBe('button')
    expect(button.props['aria-expanded']).toBe(false)
    expect(collectText(button)).toBe('Show details')
    expect(logLines(tree)).toHaveLength(0)
  })

  it('aria-controls points at a log region that exists in both states', () => {
    for (const tree of [
      panel([line('info', 'a')]),
      open([line('info', 'a')])
    ]) {
      const controls = toggle(tree).props['aria-controls'] as string
      expect(typeof controls).toBe('string')
      const region = findAll(tree, (el) => el.props.id === controls)
      expect(region).toHaveLength(1)
      expect(region[0].props.role).toBe('log')
    }
  })

  it('activating the button expands it and flips the label to "Hide details"', () => {
    const tree = open([line('info', 'a')])
    expect(toggle(tree).props['aria-expanded']).toBe(true)
    expect(collectText(toggle(tree))).toBe('Hide details')
    expect(logLines(tree)).toHaveLength(1)
  })

  it('the disclosure goes through the mousedown guard: one activation, then a suppressed click', () => {
    const tree = panel([line('info', 'a')])
    ;(toggle(tree).props.onMouseDown as (e: unknown) => void)(PRIMARY)
    ;(toggle(tree).props.onClick as () => void)()
    expect(toggle(panel([line('info', 'a')])).props['aria-expanded']).toBe(true)
  })

  it('E9-empty (A-45-02): an expanded panel with no lines shows the single "No output yet." line', () => {
    const tree = open([])
    expect(logLines(tree)).toHaveLength(0)
    const empty = findByClass(tree, 'WinetricksLogPanel__empty')
    expect(empty).toHaveLength(1)
    expect(collectText(empty[0])).toBe('No output yet.')
  })

  it('a collapsed empty panel does not show the empty line', () => {
    expect(findByClass(panel([]), 'WinetricksLogPanel__empty')).toHaveLength(0)
  })

  it('classifies each kind into its own class, and only error is red', () => {
    const tree = open([
      line('error', 'boom'),
      line('environment', 'env'),
      line('info', 'fyi'),
      line('noise', 'fixme:'),
      line('progress', 'raw curl row', 10)
    ])
    const classes = logLines(tree).map((el) => String(el.props.className))
    expect(classes[0]).toContain('log-error')
    expect(classes[1]).toContain('log-warning')
    expect(classes[2]).toContain('log-info')
    expect(classes[3]).toContain('log-noise')
    expect(classes[4]).toContain('log-progress')
    for (const cn of classes.slice(1)) expect(cn).not.toContain('log-error')
  })

  it('E9-loading: a curl progress line renders as a percentage, never the raw meter row', () => {
    const raw = '  42  100M   42 42.0M    0     0  1234k      0  0:00:42'
    const tree = open([line('progress', raw, 42)])
    const text = collectText(logLines(tree)[0])
    expect(text).toBe('Downloading 42%')
    expect(text).not.toContain('100M')
  })

  it('a progress line with no percent yet (the meter header) reads as 0%, not as the raw header', () => {
    const tree = open([line('progress', '  % Total    % Received % Xferd')])
    expect(collectText(logLines(tree)[0])).toBe('Downloading 0%')
  })

  it('line text reaches the DOM as a plain text node (T-45-23)', () => {
    const tree = open([line('info', '<img src=x onerror=alert(1)>')])
    const row = logLines(tree)[0]
    expect(row.props.children).toBe('<img src=x onerror=alert(1)>')
    expect(
      findAll(tree, (el) => 'dangerouslySetInnerHTML' in el.props)
    ).toHaveLength(0)
  })
})

describe('LogPanel stylesheet (E9-populated, E9-overflow, D-14)', () => {
  const scss = readFileSync(
    join(__dirname, '..', 'LogPanel', 'index.scss'),
    'utf8'
  )

  it('is a fixed 160px, independently scrolling, wrapping region', () => {
    expect(scss).toMatch(/height:\s*160px/)
    expect(scss).toMatch(/overflow-y:\s*auto/)
    expect(scss).toMatch(/white-space:\s*pre-wrap/)
    expect(scss).toMatch(/overflow-wrap:\s*anywhere/)
  })

  it('red is reserved for error lines: --danger appears once, inside the log-error rule', () => {
    expect(scss.match(/--danger/g)).toHaveLength(1)
    expect(scss).toMatch(/log-error[^}]*--danger/)
  })

  it('noise is muted, never red', () => {
    expect(scss).toMatch(/log-noise[^}]*--text-secondary/)
  })
})

// -- Part 2: the tab feeding the panel -------------------------------------

describe('the tab and the live log (D-14, D-18, A-45-03)', () => {
  let api: MockApi

  beforeEach(() => {
    api = makeApi()
    installApi(api)
  })

  const RUNNING = (log: WinetricksLogLine[] = [], runId = 1) =>
    queueStateWith({
      runId,
      verbs: ['vcrun2019', 'vcrun2013'],
      outcomes: { vcrun2019: 'installing', vcrun2013: 'pending' },
      currentVerb: 'vcrun2019',
      log
    })

  function progress(
    installingComponent: string,
    extra: {
      lines?: WinetricksLogLine[]
      percent?: number
      messages?: string[]
    } = {}
  ): ElementLike {
    capturedProgressListener(api)(
      {},
      { messages: extra.messages ?? [], installingComponent, ...extra }
    )
    return rerender(WinetricksSettings)
  }

  function rowText(tree: ElementLike, verb: string): string {
    const rows = findAll(tree, (el) => el.props['data-verb'] === verb)
    return rows.length ? collectText(rows[0]) : ''
  }

  function panelLines(tree: ElementLike): string[] {
    const panelEl = findByClass(tree, 'WinetricksLogPanel')[0]
    return findByClass(panelEl, 'WinetricksLogPanel__line').map((el) =>
      collectText(el)
    )
  }

  function expandPanel(tree: ElementLike): ElementLike {
    const panelEl = findByClass(tree, 'WinetricksLogPanel')[0]
    const button = findAll(
      panelEl,
      (el) => el.type === 'button' && 'aria-expanded' in el.props
    )[0]
    ;(button.props.onClick as () => void)()
    return rerender(WinetricksSettings)
  }

  it('subscribes to handleProgressOfWinetricks once and removes the listener when the game changes', async () => {
    const remove = jest.fn()
    api.handleProgressOfWinetricks.mockImplementation(() => remove)
    await mountTab(WinetricksSettings)
    expect(api.handleProgressOfWinetricks).toHaveBeenCalledTimes(1)
    expect(remove).not.toHaveBeenCalled()

    // The harness has no unmount; changing the effect's deps runs the cleanup.
    harness().__setContext({
      appName: 'other-app',
      runner: 'legendary',
      platform: 'linux',
      gameInfo: { title: 'Other Game' }
    })
    rerender(WinetricksSettings)
    expect(remove).toHaveBeenCalledTimes(1)
  })

  it('a progress event for the running verb with percent 42 puts "Downloading 42%" on that row', async () => {
    await mountTab(WinetricksSettings)
    capturedQueueChangedListener(api)({}, RUNNING())
    rerender(WinetricksSettings)
    const tree = progress('vcrun2019', { percent: 42 })
    expect(rowText(tree, 'vcrun2019')).toContain('Downloading 42%')
  })

  it('an event for a different component never sets the running row percent', async () => {
    await mountTab(WinetricksSettings)
    capturedQueueChangedListener(api)({}, RUNNING())
    rerender(WinetricksSettings)
    const tree = progress('dotnet48', { percent: 77 })
    expect(rowText(tree, 'vcrun2019')).not.toContain('77')
    expect(rowText(tree, 'vcrun2019')).toContain('Installing')
  })

  it('the percent is cleared when the running verb changes', async () => {
    await mountTab(WinetricksSettings)
    capturedQueueChangedListener(api)({}, RUNNING())
    rerender(WinetricksSettings)
    progress('vcrun2019', { percent: 42 })
    capturedQueueChangedListener(api)(
      {},
      queueStateWith({
        verbs: ['vcrun2019', 'vcrun2013'],
        outcomes: { vcrun2019: 'installed', vcrun2013: 'installing' },
        currentVerb: 'vcrun2013'
      })
    )
    const tree = rerender(WinetricksSettings)
    expect(rowText(tree, 'vcrun2013')).not.toContain('42')
    expect(rowText(tree, 'vcrun2013')).toContain('Installing')
  })

  it('a later non-progress line for the verb means the download ended: back to "Installing"', async () => {
    await mountTab(WinetricksSettings)
    capturedQueueChangedListener(api)({}, RUNNING())
    rerender(WinetricksSettings)
    progress('vcrun2019', { percent: 100, lines: [line('progress', 'r', 100)] })
    const tree = progress('vcrun2019', {
      lines: [line('info', 'Executing w_do_call vcrun2019')]
    })
    expect(rowText(tree, 'vcrun2019')).not.toContain('100')
  })

  it('classified lines append live to the panel', async () => {
    await mountTab(WinetricksSettings)
    capturedQueueChangedListener(api)({}, RUNNING())
    rerender(WinetricksSettings)
    progress('vcrun2019', {
      lines: [line('info', 'first'), line('error', 'second')]
    })
    const tree = expandPanel(
      progress('vcrun2019', { lines: [line('info', 'third')] })
    )
    expect(panelLines(tree)).toEqual(['first', 'second', 'third'])
  })

  it('an incoming progress line replaces the previous progress line', async () => {
    await mountTab(WinetricksSettings)
    capturedQueueChangedListener(api)({}, RUNNING())
    rerender(WinetricksSettings)
    progress('vcrun2019', { lines: [line('progress', 'a', 10)] })
    progress('vcrun2019', { lines: [line('progress', 'b', 55)] })
    const tree = expandPanel(rerender(WinetricksSettings))
    expect(panelLines(tree)).toEqual(['Downloading 55%'])
  })

  it('keeps at most 200 lines', async () => {
    await mountTab(WinetricksSettings)
    capturedQueueChangedListener(api)({}, RUNNING())
    rerender(WinetricksSettings)
    const many = Array.from({ length: 260 }, (_, i) => line('info', `l${i}`))
    const tree = expandPanel(progress('vcrun2019', { lines: many }))
    const shown = panelLines(tree)
    expect(shown).toHaveLength(200)
    expect(shown[0]).toBe('l60')
    expect(shown[199]).toBe('l259')
  })

  it('A-45-03: seeds the panel from run.log on mount (a remounted tab mid-run)', async () => {
    api.winetricksQueueState.mockImplementation(() =>
      Promise.resolve(RUNNING([line('info', 'earlier'), line('error', 'oops')]))
    )
    const tree = expandPanel(await mountTab(WinetricksSettings))
    expect(panelLines(tree)).toEqual(['earlier', 'oops'])
  })

  it('a queue state for a different runId reseeds the panel from that run (earlier runs are dropped)', async () => {
    await mountTab(WinetricksSettings)
    capturedQueueChangedListener(api)({}, RUNNING([line('info', 'run one')], 1))
    rerender(WinetricksSettings)
    progress('vcrun2019', { lines: [line('info', 'live in run one')] })
    capturedQueueChangedListener(api)({}, RUNNING([line('info', 'run two')], 2))
    const tree = expandPanel(rerender(WinetricksSettings))
    expect(panelLines(tree)).toEqual(['run two'])
  })

  it('a queue state for the SAME runId keeps the live lines (no reseed from the older snapshot)', async () => {
    await mountTab(WinetricksSettings)
    capturedQueueChangedListener(api)({}, RUNNING([line('info', 'snap')], 1))
    rerender(WinetricksSettings)
    progress('vcrun2019', { lines: [line('info', 'live')] })
    capturedQueueChangedListener(api)({}, RUNNING([line('info', 'snap')], 1))
    const tree = expandPanel(rerender(WinetricksSettings))
    expect(panelLines(tree)).toEqual(['snap', 'live'])
  })

  it('the panel sits directly above the action bar, inside the dock', async () => {
    const tree = await mountTab(WinetricksSettings)
    const dock = findByClass(tree, 'WinetricksSettings__dock')[0]
    const order = findAll(dock, (el) => {
      const cn = String(el.props.className ?? '')
      return /(^|\s)(WinetricksLogPanel|WinetricksStickyBar)(\s|$)/.test(cn)
    }).map((el) => String(el.props.className).split(' ')[0])
    expect(order).toEqual(['WinetricksLogPanel', 'WinetricksStickyBar'])
  })

  it('nothing in the progress path warns, confirms or cancels (D-18)', async () => {
    await mountTab(WinetricksSettings)
    capturedQueueChangedListener(api)({}, RUNNING())
    progress('vcrun2019', { percent: 5, lines: [line('info', 'x')] })
    await flush()
    expect(api.winetricksCancelRemaining).not.toHaveBeenCalled()
    expect(api.winetricksApply).not.toHaveBeenCalled()
  })
})
