/**
 * The spawnAsync oracle (88.2-05, D-11, D-12, D-25, D-30): `createSpawnAsync`, the thin caller of
 * `ProcessRunner.run` every installer, archive move and `ps` goes through, driven over the recording
 * runner trace on a fresh fake HOME and recorded as the golden the Rust `gamelib-launch` Helper op
 * behind a scheduled shim (D-30) has to reproduce. The golden exists before any Rust for it does.
 *
 * Slice `gamelib-launch/tests/fixtures/golden/spawn_async/`:
 *   cases.json      built from the case tables below (write mode rewrites it, compare mode checks it)
 *   deltas.json     the documented Rust-side differences (D-19), built from `DELTAS` below
 *   MANIFEST.json   `{ count, floor }`; the `class` of every recorded spawn is the one hand-authored,
 *                   non-oracle field (it comes from `golden/classes.json`, call site `runner.spawn_async`)
 *   expected/<case>/spawns.json   the one `run` the call made: program, argv, cwd, the whole env (or
 *                                 `null` when none was passed), `replaceEnv` (true exactly when an env
 *                                 was passed), `timeoutMs` or the unbounded `timeout` reason, `windowsHide`
 *                                 (default false), whether a signal was handed through, call site, class
 *   expected/<case>/stream.json   the `onOutput` chunk sequence (both streams, in arrival order), or
 *                                 `null` when the call passed no `onOutput`
 *   expected/<case>/result.json   `{ code, stdout, stderr, timedOut, aborted }` with stdout and stderr
 *                                 the last 50 chunks of their stream joined, or `{ rejected: <message> }`
 *   (events.json, requests.json and tree.json are the harness's fixed files and stay empty here)
 *
 * A case with `tsOnly: true` records a behaviour that stays in the TypeScript adapter: the option
 * check (`shell`, `detached`, `stdio` throw a TypeError before any run) happens before the runner is
 * reached, so the Rust side has no counterpart and replays the case only as a TS-side fact.
 *
 * Isolation (D-12, D-13, D-22): every case runs on a fresh fake HOME inside `withPinnedBaseEnv`
 * (eleven `process.env` keys and no others) over a scripted runner; no child is spawned and nothing
 * reads the real profile. The runner is scripted, so a timeout or an abort is what the script says
 * the runner reported; whether a real SIGKILL ends a real child is `spawn_async_real.rs`'s
 * (88.2-14) and the real-children titles of spawnAsync.test.ts are named there. The goldens are
 * recorded on a POSIX host. Behaviour that looks wrong is kept as recorded and filed as a todo
 * (D-20); a fix is never mixed into a golden diff.
 *
 * The census (D-15) moves the spawnAsync.test.ts check here: every title of that file is a case
 * here (`spawnAsync--<slug>`) or a title that needs a real child and names the Rust test replacing it.
 *
 * Modes (see testUtils/engineWineOracle/harness.ts):
 *   GAMELIB_WRITE_ENGINE_GOLDEN=1    rewrite cases.json, deltas.json, MANIFEST.json and every expected/ folder
 *   (default)                        recompute and compare, offline
 */
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { describeSkipOnWindows } from 'backend/__tests__/skip'
import {
  assertManifest,
  expectEmptyCasesToFail,
  goldenDir,
  loadCases,
  normalisePaths,
  syncManifest,
  withEngineOracleProfile,
  writeOrCompareGolden
} from 'backend/testUtils/engineWineOracle/harness'
import { engineWineOracleMode } from 'backend/testUtils/engineWineOracle/recorder'
import { withPinnedBaseEnv } from 'backend/testUtils/launchOracle/baseEnv'
import {
  assertCasesCoverTitles,
  slug,
  tsTestTitles
} from 'backend/testUtils/launchOracle/census'
import {
  createRunnerTrace,
  type RunnerStep,
  type ScriptChunk
} from 'backend/testUtils/launchOracle/runnerTrace'
import {
  attachSpawnClass,
  loadClasses
} from 'backend/testUtils/launchOracle/spawnClass'
import { createSpawnAsync } from 'backend/spawnAsync'

const CRATE = 'gamelib-launch'
const SLICE = 'spawn_async'
/** The stem of a case that stands for one `it` title of spawnAsync.test.ts. */
const CENSUS_STEM = 'spawnAsync'
/** The call site every spawn of this slice is classified under (golden/classes.json). */
const CALL_SITE = 'runner.spawn_async'
/** The case count this plan committed; a later edit may raise it, never lower it. */
const SPAWN_ASYNC_FLOOR = 37
const REAL_SPAWN_TEST = 'gamelib-launch/tests/spawn_async_real.rs'

const mode = engineWineOracleMode()

const out = (text: string): ScriptChunk => ({ stream: 'stdout', text })
const err = (text: string): ScriptChunk => ({ stream: 'stderr', text })

// ---------------------------------------------------------------------------------------------
// The case shape
// ---------------------------------------------------------------------------------------------

/** JSON has no NaN or Infinity, so a case names them. */
type TimeoutValue = number | 'NaN' | 'Infinity' | '-Infinity'

interface SpawnAsyncCase {
  id: string
  /** What the case pins; recorded nowhere else, it only reads well in `cases.json`. */
  note?: string
  /** True for a behaviour that stays in the TS adapter (the option check). */
  tsOnly?: true
  command: string
  args: string[]
  options?: {
    cwd?: string
    env?: Record<string, string>
    timeout?: TimeoutValue
    windowsHide?: boolean
    /** `mid-run` aborts after the run has started; `before-run` hands over an already aborted signal. */
    signal?: 'mid-run' | 'before-run'
    /** An option spawnAsync does not allow, set to `true`. */
    unsupported?: string
  }
  /** The call passes an `onOutput` that records every chunk. */
  observe?: true
  /** The one scripted run; empty for a call that never reaches the runner. */
  script: RunnerStep[]
}

// ---------------------------------------------------------------------------------------------
// The case tables
// ---------------------------------------------------------------------------------------------

/** Tracer (88.2-05 Task 1): one `tar -xf a` with interleaved stdout and stderr chunks. */
function tracerCases(): SpawnAsyncCase[] {
  return [
    {
      id: 'spawn-async-plain',
      note: 'the end-to-end tracer: spawn, onOutput order and result of one createSpawnAsync call',
      command: 'tar',
      args: ['-xf', 'a'],
      options: { cwd: '/x' },
      observe: true,
      script: [
        {
          chunks: [out('o1'), err('e1'), out('o2'), err('e2'), out('o3')],
          code: 0
        }
      ]
    }
  ]
}

const chunkRun = (
  count: number,
  stream: 'stdout' | 'stderr',
  label: string
): ScriptChunk[] =>
  Array.from({ length: count }, (_unused, index) => ({
    stream,
    text: `${label}${index},`
  }))

/** One named case per spawnAsync.test.ts title that does not need a real child. */
const NAMED: Record<string, Omit<SpawnAsyncCase, 'id'>> = {
  'one run call: no timeout, windowsHide false, no replaceEnv': {
    note: 'the unbounded run: the opt-out reason, windowsHide false, replaceEnv false and no env',
    command: 'tar',
    args: ['-xf', 'a'],
    options: { cwd: '/x' },
    script: [
      {
        chunks: [out('o1'), err('e1'), out('o2')],
        code: 0
      }
    ]
  },
  'options.env replaces the environment': {
    note: 'an env passed in options is the whole env of the child (replaceEnv true)',
    command: 'x',
    args: [],
    options: { env: { A: '1' } },
    script: [{}]
  },
  'a positive timeout becomes timeoutMs; signal and windowsHide pass through': {
    note: 'timeoutMs 500, a signal handed through and windowsHide true, all on one run',
    command: 'x',
    args: [],
    options: { timeout: 500, signal: 'before-run', windowsHide: true },
    script: [{}]
  },
  'onOutput receives every chunk of both streams in order': {
    note: 'both streams reach onOutput in arrival order',
    command: 'x',
    args: [],
    observe: true,
    script: [{ chunks: [out('a'), err('b'), out('c')] }]
  },
  'keeps only the last 50 chunks': {
    note: 'sixty stdout chunks answer with the last fifty',
    command: 'x',
    args: [],
    script: [{ chunks: chunkRun(60, 'stdout', '') }]
  },
  'a spawn error rejects': {
    note: 'the runner rejects with a spawn ENOENT; spawnAsync rejects with the same error',
    command: 'x',
    args: [],
    script: [{ throws: 'ENOENT' }]
  },
  'option %s throws a TypeError naming it before any run': {
    note: 'the unsupported option shell: a TypeError before the runner is reached',
    tsOnly: true,
    command: 'x',
    args: [],
    options: { unsupported: 'shell' },
    script: []
  }
}

/** The titles of spawnAsync.test.ts that run a real child; the Rust real-children test replaces them. */
const REAL_CHILD_TITLES = [
  'real child: exit code and stdout',
  'A-WR-4: a timeout reports timedOut (SIGKILL, code null); an abort reports aborted'
]

const SPAWN_ASYNC_TEST = join(__dirname, '..', 'spawnAsync.test.ts')
const spawnAsyncTitles = (): string[] => tsTestTitles(SPAWN_ASYNC_TEST)
const itOf = (title: string): string => title.split(' > ').slice(1).join(' > ')

/** The titles that need a real child, each with the Rust test that replaces it. */
function notPorted(titles: readonly string[]): Record<string, string> {
  const owners: Record<string, string> = {}
  for (const title of titles) {
    if (REAL_CHILD_TITLES.includes(itOf(title))) {
      owners[title] =
        `${REAL_SPAWN_TEST} (88.2-14): a real child, a real SIGKILL or abort, not a golden`
    }
  }
  return owners
}

function namedCases(): SpawnAsyncCase[] {
  const titles = spawnAsyncTitles()
  const cases: SpawnAsyncCase[] = []
  const ported = titles.filter(
    (title) => !REAL_CHILD_TITLES.includes(itOf(title))
  )
  for (const title of ported) {
    const named = NAMED[itOf(title)]
    if (!named)
      throw new Error(`no named spawnAsync case for the title: ${title}`)
    cases.push({ id: `${CENSUS_STEM}--${slug(title)}`, ...named })
  }
  const known = new Set(ported.map(itOf))
  const stale = Object.keys(NAMED).filter((key) => !known.has(key))
  if (stale.length > 0) {
    throw new Error(
      `NAMED holds a title spawnAsync.test.ts does not: ${stale.join(' | ')}`
    )
  }
  return cases
}

/** The option vectors: env, timeout, abort, windowsHide, errors and the 50-chunk window. */
function optionCases(): SpawnAsyncCase[] {
  const call = (
    id: string,
    note: string,
    options: SpawnAsyncCase['options'],
    script: RunnerStep[],
    extra: Partial<SpawnAsyncCase> = {}
  ): SpawnAsyncCase => ({
    id,
    note,
    command: 'x',
    args: ['--flag', 'value'],
    ...(options && { options }),
    script,
    ...extra
  })
  const quick: RunnerStep[] = [{ chunks: [out('ok\n')], code: 0 }]
  return [
    call(
      'spawn-async-env-absent',
      'no env in options: env null, replaceEnv false',
      {},
      quick
    ),
    call(
      'spawn-async-env-present',
      'an env in options: the whole env is handed over, replaceEnv true',
      { env: { A: '1', B: 'two words' } },
      quick
    ),
    call(
      'spawn-async-env-empty-object',
      'an empty env object still counts as passed: replaceEnv true with an empty env',
      { env: {} },
      quick
    ),
    call(
      'spawn-async-cwd-absent',
      'no cwd in options: the run carries no cwd',
      {},
      quick
    ),
    call(
      'spawn-async-timeout-zero',
      'timeout 0 is no cap (child_process semantics): the unbounded opt-out',
      { timeout: 0 },
      quick
    ),
    call(
      'spawn-async-timeout-negative',
      'a negative timeout is no cap',
      { timeout: -5 },
      quick
    ),
    call(
      'spawn-async-timeout-nan',
      'a NaN timeout is no cap',
      { timeout: 'NaN' },
      quick
    ),
    call(
      'spawn-async-timeout-infinity',
      'an infinite timeout is not finite, so no cap',
      { timeout: 'Infinity' },
      quick
    ),
    call(
      'spawn-async-timeout-one-ms',
      'the smallest positive cap becomes timeoutMs 1',
      { timeout: 1 },
      quick
    ),
    call(
      'spawn-async-timeout-fractional',
      'a fractional positive cap is passed as is',
      { timeout: 0.5 },
      quick
    ),
    call(
      'spawn-async-timeout-elapsed',
      'a positive cap that elapses: the runner reports timedOut with code null, partial output kept',
      { timeout: 200 },
      [
        {
          chunks: [out('partial'), err('warn')],
          code: null,
          signal: 'SIGKILL',
          timedOut: true
        }
      ],
      { observe: true }
    ),
    call(
      'spawn-async-abort-mid-run',
      'a signal aborted while the child runs: the call resolves (never rejects) with aborted true and code null',
      { signal: 'mid-run' },
      [{ chunks: [out('before-abort')], hold: true }],
      { observe: true }
    ),
    call(
      'spawn-async-abort-before-run',
      'a signal that is already aborted: the runner answers aborted at once, the call resolves',
      { signal: 'before-run' },
      [{ hold: true }]
    ),
    call(
      'spawn-async-windowshide-true',
      'windowsHide true is passed through',
      { windowsHide: true },
      quick
    ),
    call(
      'spawn-async-windowshide-false',
      'windowsHide false is the same as the default',
      { windowsHide: false },
      quick
    ),
    call(
      'spawn-async-nonzero-exit',
      'a non-zero exit code is reported, not thrown',
      {},
      [{ chunks: [err('boom\n')], code: 3 }],
      { observe: true }
    ),
    call(
      'spawn-async-no-output',
      'no chunks: stdout and stderr are empty strings',
      {},
      [{ code: 0 }]
    ),
    call(
      'spawn-async-no-on-output',
      'output with no onOutput: the result still carries the chunks, the stream is null',
      {},
      [{ chunks: [out('a'), err('b')], code: 0 }]
    ),
    call(
      'spawn-async-stdout-fifty',
      'exactly fifty stdout chunks: none dropped',
      {},
      [{ chunks: chunkRun(50, 'stdout', 'o') }]
    ),
    call(
      'spawn-async-stdout-fifty-one',
      'fifty-one stdout chunks: the first is dropped',
      {},
      [{ chunks: chunkRun(51, 'stdout', 'o') }]
    ),
    call(
      'spawn-async-stderr-over-fifty',
      'seventy stderr chunks: the last fifty, and stdout untouched',
      {},
      [{ chunks: [out('only-out'), ...chunkRun(70, 'stderr', 'e')] }]
    ),
    call(
      'spawn-async-both-over-fifty-interleaved',
      'sixty chunks on each stream, interleaved: each stream keeps its own last fifty and onOutput sees all one hundred and twenty',
      {},
      [
        {
          chunks: Array.from({ length: 60 }, (_unused, index) => [
            out(`o${index},`),
            err(`e${index},`)
          ]).flat()
        }
      ],
      { observe: true }
    ),
    call(
      'spawn-async-chunks-not-trimmed',
      'chunks are joined as they arrive: whitespace and a chunk boundary inside a token are kept',
      {},
      [{ chunks: [out('  lead'), out('ing\n'), err('tr'), err('ail  ')] }]
    ),
    call(
      'spawn-async-spawn-error-eacces',
      'a spawn error with another code rejects the same way',
      {},
      [{ throws: 'EACCES' }]
    ),
    call(
      'spawn-async-spawn-error-with-timeout',
      'a spawn error with a cap set still rejects; no result is built',
      { timeout: 500 },
      [{ throws: 'ENOENT' }]
    ),
    call(
      'spawn-async-option-detached',
      'the unsupported option detached: a TypeError before any run',
      { unsupported: 'detached' },
      [],
      { tsOnly: true }
    ),
    call(
      'spawn-async-option-stdio',
      'the unsupported option stdio: a TypeError before any run',
      { unsupported: 'stdio' },
      [],
      { tsOnly: true }
    ),
    call(
      'spawn-async-option-shell-with-valid-options',
      'an unsupported option beside valid ones still throws before any run',
      { unsupported: 'shell', cwd: '/x', timeout: 500 },
      [],
      { tsOnly: true }
    ),
    call(
      'spawn-async-all-options',
      'every allowed option at once: cwd, env, a cap, a signal and windowsHide',
      {
        cwd: '/x',
        env: { A: '1' },
        timeout: 500,
        signal: 'before-run',
        windowsHide: true
      },
      [{ chunks: [out('ok')], code: 0 }],
      { observe: true }
    )
  ]
}

function spawnAsyncCases(): SpawnAsyncCase[] {
  return [...tracerCases(), ...namedCases(), ...optionCases()]
}

/** The documented Rust-side differences (D-19); a delta no case uses is itself an error on the Rust side. */
const DELTAS: Record<string, string> = {
  'shell-injected-env':
    'The sidecar process this TS ran in carried GAMELIB_SHELL_EXE, GAMELIB_APP_ROOT, GAMELIB_STEAM_ROOT_DEFAULT and GAMELIB_STORE_BOOT, injected by src-tauri/src/sidecar.rs. A spawn from the shell own environment does not carry them, so a Rust spawn_async that inherits the process env is the golden env without those four keys. No golden here holds them (an env is recorded only when the case passes one, and none passes those keys), so the delta only records the rule for a case compared against a sidecar-run recording.'
}

// ---------------------------------------------------------------------------------------------
// Running one case
// ---------------------------------------------------------------------------------------------

const flush = (): Promise<void> =>
  new Promise((resolve) => setImmediate(resolve))

const TIMEOUT_VALUES: Record<string, number> = {
  NaN: Number.NaN,
  Infinity: Number.POSITIVE_INFINITY,
  '-Infinity': Number.NEGATIVE_INFINITY
}

interface RecordedCase {
  result: unknown
  spawns: unknown[]
  stream: unknown[] | null
}

/** Runs one case on a fresh fake HOME and returns everything it recorded, normalised. */
async function recordCase(
  c: SpawnAsyncCase,
  classes: ReturnType<typeof loadClasses>
): Promise<RecordedCase> {
  return withEngineOracleProfile(async (profile) => {
    const trace = createRunnerTrace(profile, {
      platform: 'linux',
      script: c.script
    })
    try {
      const done = await withPinnedBaseEnv(profile.fake, async () => {
        const spawn = createSpawnAsync({ runner: trace.deps.runner })
        const chunks: string[] = []
        const o = c.options ?? {}
        const controller = new AbortController()
        if (o.signal === 'before-run') controller.abort()
        const options = {
          ...(o.cwd !== undefined && { cwd: o.cwd }),
          ...(o.env && { env: { ...o.env } }),
          ...(o.timeout !== undefined && {
            timeout:
              typeof o.timeout === 'number'
                ? o.timeout
                : TIMEOUT_VALUES[o.timeout]
          }),
          ...(o.windowsHide !== undefined && { windowsHide: o.windowsHide }),
          ...(o.signal && { signal: controller.signal }),
          ...(o.unsupported && { [o.unsupported]: true })
        }
        const pending = spawn(
          c.command,
          [...c.args],
          options as never,
          c.observe ? (data) => void chunks.push(data) : undefined
        )
        // A held run only ends by its abort; a rejection must not go unhandled while it waits.
        const settled = pending.then(
          (value) => ({ value }),
          (error: unknown) => ({ error })
        )
        if (o.signal === 'mid-run') {
          await flush()
          await flush()
          controller.abort()
        }
        const outcome = await settled
        trace.expectScriptConsumed()
        const result =
          'error' in outcome
            ? { rejected: (outcome.error as Error).message }
            : outcome.value
        return { result, stream: c.observe ? chunks : null }
      })
      const spawns = attachSpawnClass(
        trace.records.spawns.map((spawn) => ({
          ...spawn,
          callSite: CALL_SITE
        })),
        classes
      )
      return {
        result: normalisePaths(done.result, profile),
        spawns: normalisePaths(spawns, profile),
        stream: normalisePaths(done.stream, profile) as unknown[] | null
      }
    } finally {
      trace.restore()
    }
  })
}

const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`

describeSkipOnWindows('spawnAsync oracle (88.2-05)', () => {
  const built = spawnAsyncCases()
  const casesFile = join(goldenDir(CRATE, SLICE), 'cases.json')
  if (mode === 'write') {
    mkdirSync(dirname(casesFile), { recursive: true })
    writeFileSync(casesFile, json(built))
    writeFileSync(join(goldenDir(CRATE, SLICE), 'deltas.json'), json(DELTAS))
  }
  const cases = loadCases<SpawnAsyncCase>(CRATE, SLICE)
  const classes = loadClasses(CRATE)

  const byId = (id: string): SpawnAsyncCase => {
    const found = cases.find((c) => c.id === id)
    if (!found) throw new Error(`${id} is missing from cases.json`)
    return found
  }

  it('cases.json is exactly what the case builder produces', () => {
    expect(cases).toEqual(JSON.parse(JSON.stringify(built)))
  })

  it('deltas.json is exactly the documented delta table, each with a reason of its own', () => {
    const committed: unknown = JSON.parse(
      readFileSync(join(goldenDir(CRATE, SLICE), 'deltas.json'), 'utf8')
    )
    expect(committed).toEqual(DELTAS)
    expect(Object.keys(DELTAS)).toContain('shell-injected-env')
    for (const reason of Object.values(DELTAS)) {
      expect(reason.length).toBeGreaterThan(20)
    }
  })

  it.each(cases)('$id', async (c) => {
    const recorded = await recordCase(c, classes)
    writeOrCompareGolden(CRATE, SLICE, c.id, {
      result: recorded.result,
      spawns: recorded.spawns,
      extra: { 'stream.json': recorded.stream }
    })
  })

  it('every title of spawnAsync.test.ts is a named case, and every real-child title names its Rust test', () => {
    const titles = spawnAsyncTitles()
    const owners = notPorted(titles)
    const ids = cases
      .map((c) => c.id)
      .filter((id) => id.startsWith(`${CENSUS_STEM}--`))
      .map((id) => id.slice(CENSUS_STEM.length + 2))
    assertCasesCoverTitles(ids, titles, owners)
    expect(Object.keys(owners)).toHaveLength(REAL_CHILD_TITLES.length)
    for (const owner of Object.values(owners)) {
      expect(owner).toContain('spawn_async_real.rs')
    }
  })

  it('the abort case records a resolved result with aborted true and no rejection', async () => {
    const recorded = await recordCase(
      byId('spawn-async-abort-mid-run'),
      classes
    )
    expect(recorded.result).toMatchObject({
      code: null,
      timedOut: false,
      aborted: true
    })
    expect(recorded.result).not.toHaveProperty('rejected')
    expect(recorded.stream).toEqual(['before-abort'])
  })

  it('the elapsed-timeout case records timedOut true with code null and a timeoutMs of the cap', async () => {
    const recorded = await recordCase(
      byId('spawn-async-timeout-elapsed'),
      classes
    )
    expect(recorded.result).toMatchObject({
      code: null,
      timedOut: true,
      aborted: false
    })
    expect(recorded.spawns[0]).toMatchObject({ timeoutMs: 200, timeout: null })
  })

  it('replaceEnv is true exactly when an env is passed, and no spawn carries a cap it was not given', async () => {
    for (const c of cases.filter((candidate) => !candidate.tsOnly)) {
      const recorded = await recordCase(c, classes)
      const [spawn] = recorded.spawns as {
        replaceEnv: boolean
        env: unknown
        timeoutMs: number | null
        timeout: { none: true; reason: string } | null
        windowsHide: boolean
      }[]
      expect(spawn).toBeDefined()
      expect(spawn?.replaceEnv).toBe(c.options?.env !== undefined)
      expect(spawn?.env === null).toBe(c.options?.env === undefined)
      // Exactly one of the cap and the opt-out reason is set.
      expect((spawn?.timeoutMs === null) !== (spawn?.timeout === null)).toBe(
        true
      )
      if (spawn?.timeout) expect(spawn.timeout.reason.length).toBeGreaterThan(0)
      expect(typeof spawn?.windowsHide).toBe('boolean')
    }
  })

  it('a ts-only case reaches no runner and records the TypeError message', async () => {
    const tsOnly = cases.filter((c) => c.tsOnly)
    expect(tsOnly.length).toBeGreaterThanOrEqual(3)
    for (const c of tsOnly) {
      const recorded = await recordCase(c, classes)
      expect(recorded.spawns).toEqual([])
      expect(recorded.result).toEqual({
        rejected: expect.stringContaining(
          `spawnAsync: unsupported option "${c.options?.unsupported}"`
        )
      })
    }
  })

  it('more than fifty chunks on a stream answer with exactly the last fifty of it', async () => {
    const c = byId('spawn-async-both-over-fifty-interleaved')
    const recorded = await recordCase(c, classes)
    const run = c.script.flatMap((step) => step.chunks ?? [])
    const texts = (stream: 'stdout' | 'stderr'): string =>
      run
        .filter((chunk) => chunk.stream === stream)
        .slice(-50)
        .map((chunk) => chunk.text)
        .join('')
    expect(recorded.result).toMatchObject({
      stdout: texts('stdout'),
      stderr: texts('stderr')
    })
    expect(recorded.stream).toHaveLength(120)
  })

  it('every spawn is classified under the runner.spawn_async call site as a helper', () => {
    expect(classes[CALL_SITE]).toBe('helper')
  })

  it('the committed MANIFEST agrees with the case list and holds one folder per case', () => {
    syncManifest(CRATE, SLICE, cases, SPAWN_ASYNC_FLOOR)
    assertManifest(CRATE, SLICE, cases, SPAWN_ASYNC_FLOOR)
  })

  it('an empty case list fails the manifest check', () => {
    expectEmptyCasesToFail(CRATE, SLICE, SPAWN_ASYNC_FLOOR)
  })
})
