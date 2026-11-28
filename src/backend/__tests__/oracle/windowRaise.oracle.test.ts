/**
 * The Wine window-raiser oracle (88.3-02, D-11, D-20, D-25): the TS `createWineWindowRaiser` and
 * `windowsExeNameFromCommand` (`src/backend/utils/wineWindowRaise.ts`) recorded as the golden the Rust raiser (88.3-13) has
 * to reproduce, before any Rust raiser exists. Write mode exists in this file and nowhere else.
 *
 * Slice `gamelib-launch/tests/fixtures/golden/window_raise/`:
 *   cases.json      built from the case tables below (write mode rewrites it, compare mode checks it)
 *   deltas.json     the documented Rust-side differences (D-19), an object keyed by delta name
 *   MANIFEST.json   `{ count, floor }`
 *   expected/<case>/result.json   per raise: whether it settled and why not; the timers left; the script text (once)
 *   expected/<case>/events.json   the ordered transcript (see `Ev` below)
 *   (requests.json, spawns.json and tree.json are the harness's fixed files; the spawns sit in events.json instead, so the
 *   order against the timers and the log lines is part of the record)
 *
 * What is recorded, per case: every `osascript` call (program and argv), the injected clock's schedule (the time of every
 * spawn, every `setTimeout` delay and every `clear`: attempt spacing, the settle re-raise, the stop), the warning and info
 * lines, and whether `raise` settled. The clock is the real `createFakeClock` behind a recorder, advanced in 500 ms steps
 * (the greatest common step of the 1500 ms spacing and the 2500 ms settle) with microtasks drained between steps.
 *
 * The AppleScript text is CONSTANT (T-88.3-03): `result.script` holds it verbatim once, and a spawn's argv records the
 * marker `<script>` for element 1 only when that element equals it, so a Rust port that interpolates a pid or a name into
 * the script fails the compare in the spawn that differs. Pids and names travel as separate argv elements.
 *
 * `isMac` is injected, so the macOS and the no-op branch record on one machine. Nothing is spawned and nothing reads the real
 * host: `spawnAsync` is a recorder that answers from the case's script.
 *
 * Census (D-15): every title of `wineWindowRaise.test.ts` is a named case (`wineWindowRaise--<slug>`).
 *
 * Modes (see testUtils/engineWineOracle/harness.ts):
 *   GAMELIB_WRITE_ENGINE_GOLDEN=1    rewrite cases.json, deltas.json, MANIFEST.json and every expected/ folder
 *   (default)                        recompute and compare, offline
 *
 * Behaviour that looks wrong is kept as recorded and listed in the plan SUMMARY under `D-20 candidates` (D-20).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { describeSkipOnWindows } from 'backend/__tests__/skip'
import * as logger from 'backend/logger'
import * as environment from 'backend/constants/environment'
import {
  createWineWindowRaiser,
  windowsExeNameFromCommand
} from 'backend/utils/wineWindowRaise'
import {
  assertManifest,
  expectEmptyCasesToFail,
  goldenDir,
  loadCases,
  syncManifest,
  writeOrCompareGolden
} from 'backend/testUtils/engineWineOracle/harness'
import { engineWineOracleMode } from 'backend/testUtils/engineWineOracle/recorder'
import {
  assertCasesCoverTitles,
  slug,
  tsTestTitles
} from 'backend/testUtils/launchOracle/census'
import {
  injectProbe,
  withInjected
} from 'backend/testUtils/launchOracle/probes'
import { createFakeClock } from 'backend/testUtils/fakeClock'
import type { Clock } from 'backend/process/types'

const CRATE = 'gamelib-launch'
const SLICE = 'window_raise'
/** The case count this plan committed; a later edit may raise it, never lower it. */
const WINDOW_RAISE_FLOOR = 25
/** The stem of a case that stands for one `test` title of wineWindowRaise.test.ts. */
const CENSUS_STEM = 'wineWindowRaise'
const RAISE_TEST = join(
  __dirname,
  '..',
  '..',
  'utils',
  '__tests__',
  'wineWindowRaise.test.ts'
)

const mode = engineWineOracleMode()

// ---- the case language -----------------------------------------------------------------------

/** How one `osascript` call answers: its stdout, or a rejection with a message. */
type Answer = { stdout: string } | { rejects: string }

interface RaiseInput {
  context: string
  pids?: string[]
  processNames?: string[]
}

type Action =
  /** `raiser.raise(deps, input)`; the promise is tracked under `as`. */
  | { op: 'raise'; as: string; input: RaiseInput }
  /** Moves the injected clock `ms` forward (a multiple of 500), draining microtasks between steps. */
  | { op: 'advance'; ms: number }
  | { op: 'stop' }

interface RaiseCase {
  id: string
  /** What the case pins; it only reads well in `cases.json`. */
  note: string
  kind: 'raise'
  /** The injected `isMac`. */
  mac: boolean
  /** The nth `osascript` call answers `answers[n]`; every call after the list answers `none`. */
  answers: Answer[]
  actions: Action[]
}

/** A case with no raiser: two raisers built and stopped, nothing armed. */
interface ConstructCase {
  id: string
  note: string
  kind: 'construct'
}

/** `windowsExeNameFromCommand` over a list of inputs. */
interface ExeNameCase {
  id: string
  note: string
  kind: 'exe-names'
  inputs: string[]
}

type WindowRaiseCase = RaiseCase | ConstructCase | ExeNameCase

type Ev = Record<string, unknown>
interface Recorded {
  result: unknown
  events: Ev[]
}

/** A JSON snapshot taken now; an Error becomes `Name: message`. */
function snap<T>(value: T): T {
  if (value === undefined) return value
  return JSON.parse(
    JSON.stringify(value, (_key, v: unknown) =>
      v instanceof Error ? `${v.name}: ${v.message}` : v
    )
  ) as T
}

/** A scripted rejection carries the message and nothing else, so no source path reaches a committed golden. */
function scriptedError(message: string): Error {
  const error = new Error(message)
  error.stack = `Error: ${message}`
  return error
}

/** Drains the microtasks the raise loop awaits between two timer firings. */
async function drain(): Promise<void> {
  for (let i = 0; i < 20; i++) await Promise.resolve()
}

const SCRIPT_MARK = '<script>'

async function runRaiseCase(c: RaiseCase): Promise<Recorded> {
  const events: Ev[] = []
  const fake = createFakeClock()
  const at = (): number => fake.now()
  /** Off for the cleanup `stop()` at the end of a case, which is not part of what the case did. */
  let recording = true
  let pendingAtEnd = 0
  const clock: Clock = {
    now: () => fake.now(),
    setTimeout: (fn, ms, opts) => {
      events.push({ event: 'timer', at: at(), ms })
      return fake.setTimeout(fn, ms, opts)
    },
    setInterval: (fn, ms, opts) => fake.setInterval(fn, ms, opts),
    clear: (handle) => {
      if (recording) events.push({ event: 'clear', at: at() })
      fake.clear(handle)
    }
  }

  let script: string | null = null
  let calls = 0
  const spawnAsync = ((program: string, argv: string[]) => {
    const scriptArg = argv[1]
    if (script === null && scriptArg !== undefined) script = scriptArg
    events.push({
      event: 'spawn',
      at: at(),
      program,
      argv: argv.map((arg, index) =>
        index === 1 && arg === script ? SCRIPT_MARK : arg
      )
    })
    const scripted = c.answers[calls]
    calls += 1
    if (scripted && 'rejects' in scripted) {
      return Promise.reject(scriptedError(scripted.rejects))
    }
    return Promise.resolve({
      stdout: scripted ? scripted.stdout : 'none',
      stderr: '',
      code: 0
    })
  }) as unknown as Parameters<
    ReturnType<typeof createWineWindowRaiser>['raise']
  >[0]['spawnAsync']

  const logLine =
    (level: string) =>
    (text: unknown, prefix?: unknown): void => {
      events.push({
        event: 'log',
        level,
        prefix: snap(prefix ?? null),
        text: snap(text)
      })
    }

  const settled = new Map<string, 'pending' | 'resolved' | 'rejected'>()
  await withInjected([injectProbe(environment, 'isMac', c.mac)], async () => {
    const spies = [
      jest.spyOn(logger, 'logInfo').mockImplementation(logLine('info')),
      jest.spyOn(logger, 'logWarning').mockImplementation(logLine('warning'))
    ]
    try {
      const raiser = createWineWindowRaiser({ clock })
      events.push({ event: 'construct', pendingTimers: fake.pendingCount() })
      for (const action of c.actions) {
        events.push({ event: 'action', ...snap(action) })
        if (action.op === 'raise') {
          settled.set(action.as, 'pending')
          raiser.raise({ spawnAsync }, action.input).then(
            () => {
              settled.set(action.as, 'resolved')
              events.push({ event: 'settled', raise: action.as, at: at() })
            },
            () => {
              settled.set(action.as, 'rejected')
              events.push({ event: 'rejected', raise: action.as, at: at() })
            }
          )
          await drain()
        } else if (action.op === 'advance') {
          if (action.ms % 500 !== 0) {
            throw new Error(
              `case ${c.id}: advance ${action.ms} is not a multiple of 500`
            )
          }
          for (let left = action.ms; left > 0; left -= 500) {
            fake.advance(500)
            await drain()
          }
        } else {
          raiser.stop()
          await drain()
        }
      }
      pendingAtEnd = fake.pendingCount()
      recording = false
      raiser.stop()
    } finally {
      for (const spy of spies) spy.mockRestore()
    }
  })
  return snap({
    result: {
      script,
      raises: Object.fromEntries(settled),
      spawns: calls,
      pendingTimersAtEnd: pendingAtEnd,
      endAt: at()
    },
    events
  })
}

function runConstructCase(): Recorded {
  const clock = createFakeClock()
  const events: Ev[] = []
  const first = createWineWindowRaiser({ clock })
  events.push({ event: 'construct', pendingTimers: clock.pendingCount() })
  const other = createWineWindowRaiser({ clock })
  other.stop()
  events.push({
    event: 'second-raiser-stopped',
    pendingTimers: clock.pendingCount()
  })
  first.stop()
  events.push({
    event: 'first-raiser-stopped',
    pendingTimers: clock.pendingCount()
  })
  return { result: { pendingTimers: clock.pendingCount() }, events }
}

function runExeNameCase(c: ExeNameCase): Recorded {
  const rows = c.inputs.map((input) => ({
    input,
    output: windowsExeNameFromCommand(input)
  }))
  return { result: { rows }, events: [] }
}

function recordCase(c: WindowRaiseCase): Promise<Recorded> | Recorded {
  if (c.kind === 'raise') return runRaiseCase(c)
  if (c.kind === 'construct') return runConstructCase()
  return runExeNameCase(c)
}

// ---- the cases -------------------------------------------------------------------------------

const none: Answer = { stdout: 'none' }
const hit = (name: string, pid: number): Answer => ({
  stdout: `${name} pid=${pid}`
})
const repeat = (answer: Answer, times: number): Answer[] =>
  Array.from({ length: times }, () => answer)

const raiseCase = (
  id: string,
  note: string,
  answers: Answer[],
  input: RaiseInput,
  advanceMs: number,
  options: { mac?: boolean } = {}
): RaiseCase => ({
  id,
  note,
  kind: 'raise',
  mac: options.mac ?? true,
  answers,
  actions: [
    { op: 'raise', as: 'r1', input },
    ...(advanceMs > 0 ? [{ op: 'advance' as const, ms: advanceMs }] : [])
  ]
})

const title = (t: string): string => `${CENSUS_STEM}--${slug(t)}`

/** The ten titles of `wineWindowRaise.test.ts`. */
function titleCases(): WindowRaiseCase[] {
  return [
    {
      id: title(
        'wineWindowRaise > construction arms no timer and two raisers are independent'
      ),
      note: 'two raisers are built, one is stopped: no timer is ever armed at construction',
      kind: 'construct'
    },
    raiseCase(
      title('wineWindowRaise > no-op off macOS'),
      'off macOS nothing is spawned and the raise settles at once',
      [],
      { context: 'c', pids: ['1'] },
      0,
      { mac: false }
    ),
    raiseCase(
      title(
        'wineWindowRaise > hit: pid passed as separate argv, one settle re-raise'
      ),
      'a hit on attempt 1: one info line, one 2500 ms settle timer, one re-raise; the pid and the name are separate argv elements',
      [hit('Avernum 6.exe', 123), hit('Avernum 6.exe', 123)],
      { context: 'bridge:1', pids: ['123'], processNames: ['Avernum 6.exe'] },
      2500
    ),
    raiseCase(
      title('wineWindowRaise > miss then hit'),
      'none on attempt 1, a hit on attempt 2 after 1500 ms, then the settle re-raise after 2500 ms',
      [none, hit('X.exe', 5), hit('X.exe', 5)],
      { context: 'c', pids: ['5'] },
      4000
    ),
    raiseCase(
      title(
        'wineWindowRaise > persistent miss stops at 12 attempts with one warning'
      ),
      'no hit in 12 attempts at 1500 ms spacing: twelve spawns, one warning, no settle re-raise',
      repeat(none, 12),
      { context: 'c', pids: ['5'] },
      30000
    ),
    raiseCase(
      title('wineWindowRaise > spawn rejection is logged and loop continues'),
      'the first spawn rejects (one warning), the loop goes on and the second attempt hits',
      [{ rejects: 'boom' }, hit('X.exe', 5), hit('X.exe', 5)],
      { context: 'c', pids: ['5'] },
      4000
    ),
    raiseCase(
      title('wineWindowRaise > non-numeric pids dropped; names only as argv'),
      'a pid that is not all digits is dropped, a hostile name is one argv element, and the script text is unchanged',
      [none],
      {
        context: 'c',
        pids: ['12; do shell script'],
        processNames: ['a"b.exe']
      },
      0
    ),
    raiseCase(
      title('wineWindowRaise > only invalid pids and no names: no spawn'),
      'nothing valid to raise: no spawn and the raise settles at once',
      [],
      { context: 'c', pids: ['x'] },
      0
    ),
    {
      id: title('wineWindowRaise > windowsExeNameFromCommand'),
      note: 'an exe path, a bare name, no .exe, mixed case, a trailing argument, a forward-slash path, an empty string',
      kind: 'exe-names',
      inputs: [
        'C:\\Games\\Avernum 6\\Avernum 6.exe -x',
        '/usr/bin/foo',
        'Game.exe',
        'game.EXE',
        'C:\\Games\\X\\X.Exe /windowed',
        'C:\\Games\\X\\X.exe',
        'C:\\Games\\No Extension\\Launcher',
        'D:/Games/Forward/Slash.exe',
        '.exe',
        '',
        'C:\\a\\b.exe.bak',
        'run.exe other.exe'
      ]
    },
    {
      id: title('wineWindowRaise > stop mid-loop halts further spawns'),
      note: 'stop() after the first attempt: the pending timer is cleared, no further spawn, and the raise never settles',
      kind: 'raise',
      mac: true,
      answers: repeat(none, 12),
      actions: [
        { op: 'raise', as: 'r1', input: { context: 'c', pids: ['5'] } },
        { op: 'stop' },
        { op: 'advance', ms: 10000 }
      ]
    }
  ]
}

/** What the titles do not pin: the edges of the schedule, the argv and the stop. */
function extraCases(): WindowRaiseCase[] {
  const id = (name: string): string => `window_raise--${name}`
  return [
    raiseCase(
      id('a-hit-on-attempt-12-then-the-settle-re-raise'),
      'eleven misses at 1500 ms spacing, a hit on the twelfth attempt, then the 2500 ms settle and one more spawn',
      [...repeat(none, 11), hit('X.exe', 9), hit('X.exe', 9)],
      { context: 'c', pids: ['9'] },
      20000
    ),
    raiseCase(
      id('no-hit-in-12-names-and-pids-in-the-warning'),
      'no hit in 12 attempts with two pids and two names: the one warning names both lists comma-joined',
      repeat(none, 12),
      { context: 'ctx', pids: ['5', '6'], processNames: ['A.exe', 'B.exe'] },
      30000
    ),
    raiseCase(
      id('every-spawn-rejects-warns-per-attempt-then-the-no-match-warning'),
      'all twelve spawns reject: twelve osascript-failed warnings and then the no-matching-process warning',
      repeat({ rejects: 'osascript missing' }, 12),
      { context: 'c', pids: ['5'] },
      30000
    ),
    raiseCase(
      id('the-settle-re-raise-rejects-warns-and-the-raise-still-settles'),
      'a hit, then the settle re-raise spawn rejects: one warning, no throw, the raise settles',
      [hit('X.exe', 5), { rejects: 'late failure' }],
      { context: 'c', pids: ['5'] },
      2500
    ),
    raiseCase(
      id('invalid-pids-filtered-valid-kept-empty-names-dropped'),
      'pids 12, x, "7; rm" and 034 keep 12 and 034 in order; an empty name is dropped; the count argument is 2',
      [none],
      {
        context: 'c',
        pids: ['12', 'x', '7; rm', '034'],
        processNames: ['', 'a.exe']
      },
      0
    ),
    raiseCase(
      id('names-only-passes-a-zero-pid-count'),
      'no pids and one name: argv carries the count 0 and then the name',
      [none],
      { context: 'c', processNames: ['Game.exe'] },
      0
    ),
    raiseCase(
      id('empty-input-is-a-no-op'),
      'no pids and no names at all: no spawn',
      [],
      { context: 'c' },
      0
    ),
    raiseCase(
      id('empty-arrays-are-a-no-op'),
      'empty pid and name lists: no spawn',
      [],
      { context: 'c', pids: [], processNames: [] },
      0
    ),
    raiseCase(
      id('a-hostile-exe-name-travels-as-argv-and-never-in-the-script'),
      'a name with quotes and AppleScript syntax is one argv element; the script text is the constant one',
      [none],
      {
        context: 'c',
        processNames: ['a" & (do shell script "x") & "']
      },
      0
    ),
    raiseCase(
      id('empty-stdout-is-a-miss'),
      'an empty stdout is a miss, not a hit: the loop continues and a hit on attempt 2 raises',
      [{ stdout: '' }, hit('X.exe', 5), hit('X.exe', 5)],
      { context: 'c', pids: ['5'] },
      4000
    ),
    raiseCase(
      id('none-with-surrounding-whitespace-is-a-miss'),
      'stdout "  none \\n" is trimmed to none and is a miss',
      [{ stdout: '  none \n' }, hit('X.exe', 5), hit('X.exe', 5)],
      { context: 'c', pids: ['5'] },
      4000
    ),
    raiseCase(
      id('the-hit-line-is-trimmed-and-logged-whole'),
      'a hit line with trailing newline is trimmed and logged as the matched process text',
      [{ stdout: 'Name With Spaces pid=77\n' }, none],
      { context: 'ctx', pids: ['77'] },
      2500
    ),
    {
      id: id('stop-between-the-hit-and-the-settle-re-raise'),
      note: 'a hit, then stop() before the 2500 ms settle: the timer is cleared, no second spawn, the raise never settles',
      kind: 'raise',
      mac: true,
      answers: [hit('X.exe', 5), hit('X.exe', 5)],
      actions: [
        { op: 'raise', as: 'r1', input: { context: 'c', pids: ['5'] } },
        { op: 'advance', ms: 1000 },
        { op: 'stop' },
        { op: 'advance', ms: 5000 }
      ]
    },
    {
      id: id('a-raise-after-a-stop-runs-normally'),
      note: 'stop() cancels the first raise; a new raise on the same raiser resets the cancel flag and runs its own schedule',
      kind: 'raise',
      mac: true,
      answers: [none, hit('X.exe', 5), hit('X.exe', 5)],
      actions: [
        { op: 'raise', as: 'r1', input: { context: 'one', pids: ['5'] } },
        { op: 'stop' },
        { op: 'raise', as: 'r2', input: { context: 'two', pids: ['5'] } },
        { op: 'advance', ms: 5000 }
      ]
    },
    {
      id: id('a-stop-with-nothing-in-flight-arms-nothing'),
      note: 'stop() before any raise: no timer, and a later raise still runs',
      kind: 'raise',
      mac: true,
      answers: [hit('X.exe', 5), hit('X.exe', 5)],
      actions: [
        { op: 'stop' },
        { op: 'raise', as: 'r1', input: { context: 'c', pids: ['5'] } },
        { op: 'advance', ms: 2500 }
      ]
    }
  ]
}

function windowRaiseCases(): WindowRaiseCase[] {
  return [...titleCases(), ...extraCases()]
}

/** The documented Rust-side differences (D-19): delta name -> why the Rust raiser does not copy the TS here. */
const DELTAS: Record<string, string> = {
  'construct-has-no-rust-object':
    'The TS built a raiser object (`createWineWindowRaiser`) holding a cancel flag and its live timers, and the construct case checks that building one, and stopping one, arms no timer. Rust has no raiser object: `raise_wine_window` is one function over the launch context and nothing is armed until it is called, so the case replays as a stop with nothing in flight spawning nothing.',
  'spawn-failure-text':
    "The TS logged a failed `osascript` as a two-part warning, the fixed line `raiseWineGameWindow [<context>]: osascript raise failed` and the rejection (`Error: boom`, Node's text). Rust logs the fixed line only: the OS's error text is its own wording and can carry a path. A recorded two-part warning is compared on its first part.",
  'stop-is-the-shutdown-token':
    "The TS `stop()` cleared the pending timer, so the loop's promise stayed pending forever (a D-20 candidate), and a later raise on the same raiser reset the flag and ran normally. Rust has no stop: the wait between attempts ends on the app's shutdown token and the raise returns, and the token stays cancelled. A replayed stop cancels the context's shutdown token, so each raise pending at the stop settles at that instant, and a raise after it runs on a fresh context (a new app run)."
}

const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`

describeSkipOnWindows('Wine window raiser oracle (88.3-02)', () => {
  const built = windowRaiseCases()
  const casesFile = join(goldenDir(CRATE, SLICE), 'cases.json')
  if (mode === 'write') {
    mkdirSync(dirname(casesFile), { recursive: true })
    writeFileSync(casesFile, json(built))
    writeFileSync(join(goldenDir(CRATE, SLICE), 'deltas.json'), json(DELTAS))
  }
  const cases = loadCases<WindowRaiseCase>(CRATE, SLICE)

  it('cases.json is exactly what the case builder produces', () => {
    expect(cases).toEqual(JSON.parse(JSON.stringify(built)))
  })

  it('deltas.json is exactly the documented delta table', () => {
    const committed: unknown = JSON.parse(
      readFileSync(join(goldenDir(CRATE, SLICE), 'deltas.json'), 'utf8')
    )
    expect(committed).toEqual(DELTAS)
  })

  it.each(cases)('$id', async (c) => {
    const recorded = await recordCase(c)
    writeOrCompareGolden(CRATE, SLICE, c.id, {
      result: recorded.result,
      events: recorded.events
    })
  })

  const byId = (id: string): WindowRaiseCase => {
    const found = cases.find((c) => c.id === id)
    if (!found) throw new Error(`${id} is missing from cases.json`)
    return found
  }

  it('the persistent miss spawns twelve times 1500 ms apart and warns once', async () => {
    const { events } = await recordCase(
      byId(
        title(
          'wineWindowRaise > persistent miss stops at 12 attempts with one warning'
        )
      )
    )
    const spawns = events.filter((e) => e.event === 'spawn')
    expect(spawns.map((e) => e.at)).toEqual(
      Array.from({ length: 12 }, (_, i) => i * 1500)
    )
    expect(events.filter((e) => e.event === 'timer').map((e) => e.ms)).toEqual(
      Array.from({ length: 11 }, () => 1500)
    )
    expect(
      events.filter((e) => e.event === 'log' && e.level === 'warning')
    ).toHaveLength(1)
  })

  it('a hit schedules one 2500 ms settle and re-raises once', async () => {
    const { events } = await recordCase(
      byId(
        title(
          'wineWindowRaise > hit: pid passed as separate argv, one settle re-raise'
        )
      )
    )
    expect(events.filter((e) => e.event === 'spawn').map((e) => e.at)).toEqual([
      0, 2500
    ])
    expect(events.filter((e) => e.event === 'timer')).toEqual([
      { event: 'timer', at: 0, ms: 2500 }
    ])
  })

  it('every spawn carries the constant script and the pids and names as separate argv elements', async () => {
    const { events, result } = await recordCase(
      byId(
        title('wineWindowRaise > non-numeric pids dropped; names only as argv')
      )
    )
    const spawn = events.find((e) => e.event === 'spawn') as {
      program: string
      argv: string[]
    }
    expect(spawn.program).toBe('osascript')
    expect(spawn.argv).toEqual(['-e', '<script>', '0', 'a"b.exe'])
    expect((result as { script: string }).script).toContain('on run argv')
    expect((result as { script: string }).script).not.toContain('a"b.exe')
  })

  it('a stopped raise never settles and leaves no timer behind', async () => {
    const { events, result } = await recordCase(
      byId(title('wineWindowRaise > stop mid-loop halts further spawns'))
    )
    expect(events.filter((e) => e.event === 'spawn')).toHaveLength(1)
    expect((result as { raises: Record<string, string> }).raises).toEqual({
      r1: 'pending'
    })
    expect(events.filter((e) => e.event === 'clear')).toHaveLength(1)
  })

  it('every title of wineWindowRaise.test.ts is a named case', () => {
    const titles = tsTestTitles(RAISE_TEST)
    const ids = cases
      .map((c) => c.id)
      .filter((caseId) => caseId.startsWith(`${CENSUS_STEM}--`))
      .map((caseId) => caseId.slice(CENSUS_STEM.length + 2))
    assertCasesCoverTitles(ids, titles, {})
    expect(ids).toHaveLength(titles.length)
  })

  it('no recorded file holds an operator path or a real home', () => {
    for (const c of cases) {
      const text = readFileSync(
        join(goldenDir(CRATE, SLICE), 'expected', c.id, 'events.json'),
        'utf8'
      )
      expect(text).not.toMatch(/\/Users\/|\/home\/[a-z]|AppData/)
    }
  })

  it('the committed MANIFEST agrees with the case list and holds one folder per case', () => {
    syncManifest(CRATE, SLICE, cases, cases.length)
    assertManifest(CRATE, SLICE, cases, WINDOW_RAISE_FLOOR)
  })

  it('an empty case list fails the manifest check', () => {
    expectEmptyCasesToFail(CRATE, SLICE, WINDOW_RAISE_FLOOR)
  })
})
