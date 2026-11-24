/**
 * The case lists of the known-fix network oracle (88-07, D-03, D-11, D-14, D-25). Not a test:
 * `knownFixFetch.oracle.test.ts` builds each slice's `cases.json` from this module in write mode and compares the
 * committed file against it in compare mode, so the lists the Rust replay (88-11) reads and the lists that were
 * recorded cannot drift.
 *
 * Fetcher (`fetchRemoteKnownFixes`): a case is an id and a list of steps run in order on one fresh fake HOME. A
 * step first seeds files, then calls the fetcher with a scripted answer per URL; an unlisted URL answers 404 with
 * an empty body, as the TS test's `makeGet` does. `via: 'default'` passes no `get`, so the fetcher's own axios
 * client runs with `axios.get` answered from the same table (no case touches the network).
 *
 * Report (`runKnownFixReport` and `reportDetectedFix`): every dependency but the clock is the real one from
 * `knownFixReportDeps` (the real reader over seeded layers, the real setting read, the real post with its headers,
 * 8 000 ms timeout and no redirects), over an in-memory sent store and the real abort registry; `axios.post` is
 * answered from the step's scripted answer.
 */
import type { Runner } from 'common/types'
import type { SeedEntry } from 'backend/testUtils/engineWineOracle/harness'
import { slug } from 'backend/testUtils/launchOracle/census'
import {
  GAMELIB_KNOWN_FIXES_BASE,
  HEROIC_KNOWN_FIXES_BASE
} from 'backend/knownFixesFetcher'
import { fix as layerFile } from './knownFixReader.cases'

// ---------------------------------------------------------------------------------------------
// Fetcher
// ---------------------------------------------------------------------------------------------

/** One scripted answer. `throws` is a transport failure (with an optional axios error `code`). */
export type Reply =
  | { status: number; data?: unknown }
  | { throws: string; code?: string }

export interface FetchStep {
  appName: string
  runner: Runner
  /** Answers by URL; an unlisted URL answers 404 with an empty body. */
  replies: Record<string, Reply>
  via?: 'injected' | 'default'
  seed?: SeedEntry[]
}

export interface FetchCase {
  id: string
  /** The test title a named case stands for, verbatim (describe titles joined with " > "). */
  title?: string
  steps: FetchStep[]
}

export const gl = (store: string, app: string): string =>
  `${GAMELIB_KNOWN_FIXES_BASE}/${store}/${app}-${store}.json`
export const he = (store: string, app: string): string =>
  `${HEROIC_KNOWN_FIXES_BASE}/${store}/${app}-${store}.json`

/** The remote layer file of an app, as a seed path. */
export const dest = (app: string, store: string): string =>
  `<APPFOLDER>/fixes/${app}-${store}.json`
export const seedFile = (
  app: string,
  store: string,
  text: string
): SeedEntry => ({
  path: dest(app, store),
  text
})

/** The fetcher tests' `beforeEach` creates the local layer folder inside the remote one. */
const LOCAL_DIR: SeedEntry = { path: '<APPFOLDER>/fixes/local', dir: true }

export const step = (
  appName: string,
  runner: Runner,
  replies: Record<string, Reply>,
  more: Partial<FetchStep> = {}
): FetchStep => ({ appName, runner, replies, ...more })

/** A case standing for a test title: its id is `knownFixesFetcher--<slug(title)>` and it starts with the local folder. */
export const named = (
  title: string,
  steps: FetchStep[],
  more: Partial<FetchCase> = {}
): FetchCase => {
  const [first, ...rest] = steps
  if (!first) throw new Error(`${title}: a case needs a step`)
  return {
    id: `knownFixesFetcher--${slug(title)}`,
    title,
    steps: [{ ...first, seed: [LOCAL_DIR, ...(first.seed ?? [])] }, ...rest],
    ...more
  }
}

export const rule = (
  id: string,
  steps: FetchStep[],
  more: Partial<FetchCase> = {}
): FetchCase => ({ id: `rule-${id}`, steps, ...more })

/** A body as the feed serves it: text. */
export const text = (body: unknown): string => JSON.stringify(body)
export const OLD = '{"title":"old"}'

/** Tracer: one valid tier-1 body for a gog game, with a key the allow-list drops. */
export const TRACER_BODY = text({
  title: 'Oracle Tracer',
  envVariables: { WINEDEBUG: '-all' },
  winetricks: ['vcrun2019'],
  extraKey: 1
})

export function fetcherTracer(): FetchCase {
  return {
    id: 'tracer-gamelib-feed-200-gog-written',
    steps: [
      step('1207658930', 'gog', {
        [gl('gog', '1207658930')]: { status: 200, data: TRACER_BODY }
      })
    ]
  }
}

const GOG = '1207658930'

/** A body the allow-list keeps whole: every tier-1 key, each with a value the filter accepts. */
const EVERY_TIER1_KEY = {
  title: 'Every key',
  notes: 'n',
  winetricks: ['vcrun2019'],
  runInPrefix: ['reg', 'query'],
  envVariables: { A: '1' },
  wikiLink: 'https://example.test/wiki',
  launchNotice: 'be patient',
  macArch: '32',
  drm: 'ceg',
  launchArgs: ['-windowed'],
  exeOverride: 'bin/game.exe',
  steamGameOverlay: 'off'
}

/** A body that mixes kept keys, tier-2 keys and a value each validated key refuses. */
const UNSAFE_BODY = {
  title: 'Mixed',
  envVariables: { A: '1' },
  registry: [
    { key: 'HKLM\\Software\\X', name: 'N', type: 'REG_DWORD', value: 1 }
  ],
  dllOverrides: { 'd3d11.dll': 'native' },
  overlays: ['gst-libav-1.24.13'],
  shimFeatures: ['x'],
  steamSharedRedists: true,
  macArch: '64',
  drm: 'none',
  steamGameOverlay: 'on',
  launchArgs: [1],
  exeOverride: '../escape.exe',
  unknownKey: 1
}

/** The fetcher's cases: one per title of knownFixesFetcher.test.ts (14), then the rules the plan names. */
export function fetcherCases(): FetchCase[] {
  const heroicFallback = (store: string, app: string) => ({
    [he(store, app)]: { status: 200, data: { title: 'heroic' } } as Reply
  })
  return [
    fetcherTracer(),

    // GameLib source
    named(
      'GameLib source > steam 200 writes only allow-listed keys and never asks Heroic',
      [
        step('284100', 'steam', {
          [gl('steam', '284100')]: {
            status: 200,
            data: text({ envVariables: { A: '1' }, registry: [], foo: 1 })
          }
        })
      ]
    ),
    named(
      'GameLib source > gog 200 overwrites a stale file; Heroic not requested',
      [
        step(
          GOG,
          'gog',
          { [gl('gog', GOG)]: { status: 200, data: { title: 'fresh' } } },
          { seed: [seedFile(GOG, 'gog', '{"title":"stale"}')] }
        )
      ]
    ),
    named('GameLib source > leaves no .tmp files behind after a write', [
      step('1', 'gog', {
        [gl('gog', '1')]: { status: 200, data: { title: 't' } }
      })
    ]),

    // Heroic fallback
    named('Heroic fallback > %s falls back on a GameLib 404', [
      step(GOG, 'gog', heroicFallback('gog', GOG)),
      step('Fortnite', 'legendary', heroicFallback('epic', 'Fortnite')),
      step('abc', 'nile', heroicFallback('amazon', 'abc'))
    ]),
    named('Heroic fallback > gog Heroic URL is exact', [step(GOG, 'gog', {})]),
    named(
      'Heroic fallback > %s never asks Heroic and a 404 deletes the stale file',
      [step('77', 'steam', {}, { seed: [seedFile('77', 'steam', OLD)] })]
    ),
    named('Heroic fallback > both 404 deletes the stale file (epic)', [
      step('App', 'legendary', {}, { seed: [seedFile('App', 'epic', OLD)] })
    ]),
    named(
      'Heroic fallback > GameLib 404 then Heroic throws leaves dest untouched',
      [
        step(
          '1',
          'gog',
          { [he('gog', '1')]: { throws: 'boom' } },
          { seed: [seedFile('1', 'gog', OLD)] }
        )
      ]
    ),

    // indeterminate GameLib answers
    named(
      'indeterminate GameLib answers > network error: resolves, no fallback, file untouched',
      [
        step(
          '1',
          'gog',
          { [gl('gog', '1')]: { throws: 'ETIMEDOUT' } },
          { seed: [seedFile('1', 'gog', OLD)] }
        )
      ]
    ),
    named(
      'indeterminate GameLib answers > status %i behaves like a network error',
      [
        step(
          '1',
          'gog',
          { [gl('gog', '1')]: { status: 500 } },
          { seed: [seedFile('1', 'gog', OLD)] }
        ),
        step(
          '1',
          'gog',
          { [gl('gog', '1')]: { status: 403 } },
          { seed: [seedFile('1', 'gog', OLD)] }
        )
      ]
    ),
    named(
      'indeterminate GameLib answers > 200 with %s body: warns, untouched, no fallback',
      [
        step(
          '1',
          'gog',
          { [gl('gog', '1')]: { status: 200, data: '{not json' } },
          { seed: [seedFile('1', 'gog', OLD)] }
        ),
        step(
          '1',
          'gog',
          { [gl('gog', '1')]: { status: 200, data: '[1,2]' } },
          { seed: [seedFile('1', 'gog', OLD)] }
        )
      ]
    ),

    // guards
    named('guards > sideload makes no requests', [step('x', 'sideload', {})]),
    named('guards > rejects a traversing appName', [
      step('../escape', 'gog', {})
    ]),
    named('guards > never touches local or profile files', [
      step(
        '9',
        'steam',
        { [gl('steam', '9')]: { status: 200, data: { title: 't' } } },
        {
          seed: [
            { path: '<APPFOLDER>/fixes/local/9-steam.json', text: 'L' },
            { path: '<APPFOLDER>/fixes/9-steam.profile.json', text: 'P' }
          ]
        }
      ),
      step('9', 'steam', {}),
      step('9', 'steam', { [gl('steam', '9')]: { throws: 'x' } }),
      step('9', 'steam', { [gl('steam', '9')]: { status: 500 } })
    ]),

    // D-03 rules
    rule(
      'body-is-filtered-at-write-gamelib-feed-drops-tier-2-keys-and-bad-values',
      [
        step(GOG, 'gog', {
          [gl('gog', GOG)]: { status: 200, data: text(UNSAFE_BODY) }
        })
      ]
    ),
    rule(
      'body-is-filtered-at-write-heroic-feed-drops-tier-2-keys-and-bad-values',
      [
        step(GOG, 'gog', {
          [he('gog', GOG)]: { status: 200, data: text(UNSAFE_BODY) }
        })
      ]
    ),
    rule('every-tier-1-key-is-written-whole', [
      step(GOG, 'gog', {
        [gl('gog', GOG)]: { status: 200, data: text(EVERY_TIER1_KEY) }
      })
    ]),
    rule('heroic-feed-is-only-asked-for-legendary-gog-and-nile', [
      step('Game1', 'legendary', {}),
      step('1', 'gog', {}),
      step('n1', 'nile', {}),
      step('x', 'sideload', {}),
      step('2', 'steam', {})
    ]),
    rule(
      'gamelib-404-and-heroic-200-writes-the-heroic-body-and-keeps-nothing-else',
      [
        step(GOG, 'gog', heroicFallback('gog', GOG), {
          seed: [seedFile(GOG, 'gog', OLD)]
        })
      ]
    ),
    rule('gamelib-network-error-with-no-stale-file-writes-nothing', [
      step('1', 'gog', { [gl('gog', '1')]: { throws: 'ECONNREFUSED' } })
    ]),
    rule('gamelib-timeout-through-the-default-get-leaves-the-stale-file', [
      step(
        '1',
        'gog',
        {
          [gl('gog', '1')]: {
            throws: 'timeout of 10000ms exceeded',
            code: 'ECONNABORTED'
          }
        },
        { via: 'default', seed: [seedFile('1', 'gog', OLD)] }
      )
    ]),
    rule(
      'default-get-asks-with-a-10000-ms-timeout-text-and-every-status-accepted',
      [
        step(
          '1',
          'gog',
          {
            [gl('gog', '1')]: {
              status: 200,
              data: text({ title: 'viaDefault' })
            }
          },
          { via: 'default' }
        )
      ]
    ),
    rule('default-get-falls-back-to-heroic-on-a-404', [
      step(
        '1',
        'gog',
        {
          [he('gog', '1')]: {
            status: 200,
            data: text({ title: 'heroicViaDefault' })
          }
        },
        { via: 'default' }
      )
    ]),
    rule('gamelib-redirect-status-is-indeterminate-and-asks-nothing-more', [
      step(
        '1',
        'gog',
        { [gl('gog', '1')]: { status: 301 } },
        { seed: [seedFile('1', 'gog', OLD)] }
      )
    ]),
    rule('gamelib-204-is-indeterminate-and-asks-nothing-more', [
      step(
        '1',
        'gog',
        { [gl('gog', '1')]: { status: 204 } },
        { seed: [seedFile('1', 'gog', OLD)] }
      )
    ]),
    rule('heroic-403-after-a-gamelib-404-leaves-the-stale-file', [
      step(
        '1',
        'gog',
        { [he('gog', '1')]: { status: 403 } },
        { seed: [seedFile('1', 'gog', OLD)] }
      )
    ]),
    rule('heroic-500-after-a-gamelib-404-leaves-the-stale-file', [
      step(
        '1',
        'gog',
        { [he('gog', '1')]: { status: 500 } },
        { seed: [seedFile('1', 'gog', OLD)] }
      )
    ]),
    rule('heroic-malformed-body-after-a-gamelib-404-leaves-the-stale-file', [
      step(
        '1',
        'gog',
        { [he('gog', '1')]: { status: 200, data: '{not json' } },
        { seed: [seedFile('1', 'gog', OLD)] }
      )
    ]),
    rule('heroic-array-body-after-a-gamelib-404-leaves-the-stale-file', [
      step(
        '1',
        'gog',
        { [he('gog', '1')]: { status: 200, data: '[1,2]' } },
        { seed: [seedFile('1', 'gog', OLD)] }
      )
    ]),
    rule(
      'stale-file-is-deleted-only-when-every-applicable-source-answers-404',
      [
        step('1', 'gog', {}, { seed: [seedFile('1', 'gog', OLD)] }),
        step('n1', 'nile', {}, { seed: [seedFile('n1', 'amazon', OLD)] }),
        step('s1', 'steam', {}, { seed: [seedFile('s1', 'steam', OLD)] }),
        step(
          '1',
          'gog',
          { [he('gog', '1')]: { status: 500 } },
          { seed: [seedFile('1', 'gog', OLD)] }
        )
      ]
    ),
    rule('json-null-body-is-not-an-object', [
      step(
        '1',
        'gog',
        { [gl('gog', '1')]: { status: 200, data: 'null' } },
        { seed: [seedFile('1', 'gog', OLD)] }
      )
    ]),
    rule('json-string-body-is-not-an-object', [
      step(
        '1',
        'gog',
        { [gl('gog', '1')]: { status: 200, data: '"text"' } },
        { seed: [seedFile('1', 'gog', OLD)] }
      )
    ]),
    rule('empty-object-body-writes-an-empty-object', [
      step('1', 'gog', { [gl('gog', '1')]: { status: 200, data: '{}' } })
    ]),
    rule('a-second-download-overwrites-the-first', [
      step('1', 'gog', {
        [gl('gog', '1')]: { status: 200, data: { title: 'one' } }
      }),
      step('1', 'gog', {
        [gl('gog', '1')]: { status: 200, data: { title: 'two' } }
      })
    ]),
    rule('unsafe-app-names-write-and-ask-nothing', [
      step('../escape', 'gog', {}),
      step('..', 'gog', {}),
      step('a/b', 'gog', {}),
      step('/abs', 'gog', {}),
      step('..dots', 'gog', {})
    ]),
    rule('app-name-with-dots-inside-is-allowed', [
      step('a..b', 'gog', {
        [gl('gog', 'a..b')]: { status: 200, data: { title: 't' } }
      })
    ]),
    rule(
      'the-fixes-folder-being-a-file-makes-the-write-fail-and-nothing-rejects',
      [
        step(
          '1',
          'gog',
          { [gl('gog', '1')]: { status: 200, data: { title: 't' } } },
          { seed: [{ path: '<APPFOLDER>/fixes', text: 'not a folder' }] }
        )
      ]
    )
  ]
}

// ---------------------------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------------------------

export interface ReportFix {
  appId: string
  key: 'macArch' | 'drm'
  op: 'add' | 'remove'
  detector: 'macho' | 'ceg'
}

/** What the scripted relay does with one POST. `hang` settles only when the request's signal aborts. */
export type PostAnswer =
  | { status: number; data?: unknown }
  | { rejects: string }
  | { rejectsNonError: string }
  | { throws: string }
  | 'hang'

type ReportStepBody =
  | {
      op: 'run'
      fix: ReportFix
      answer?: PostAnswer
      /** Start the run and do not wait for it (a later `settle` step collects the outcome). */
      background?: true
      readWinningThrows?: true
    }
  | { op: 'detect'; fix: ReportFix; answer?: PostAnswer; isMacThrows?: true }
  | { op: 'turn' }
  | { op: 'holds'; fixes: ReportFix[] }
  | { op: 'abortAll' }
  | { op: 'settle' }
  /** A fresh sent store, abort registry and deps (the TS tests build new deps per loop turn). */
  | { op: 'reset' }
  | { op: 'setSettings'; settings: Record<string, unknown> }
  | { op: 'setSent'; key: string; value: unknown }
  | { op: 'relayUrl'; env: string | null }
  | { op: 'constants' }
  | { op: 'parse'; inputs: unknown[] }
  | { op: 'filter'; key: string; value: string }
  | { op: 'drift' }

export type ReportStep = ReportStepBody & { seed?: SeedEntry[] }

export interface ReportCase {
  id: string
  title?: string
  platform?: 'mac' | 'linux'
  /** What `getSettings()` answers (default: `{ shareDetectedFixes: true }`). */
  settings?: Record<string, unknown>
  /** `appInfo.version` (default `0.8.0`). */
  version?: string
  /** `GAMELIB_FIX_RELAY_URL` (default `http://relay.test/v1/reports`; `null` leaves it unset). */
  relayEnv?: string | null
  steps: ReportStep[]
}

export const ADD_ARCH: ReportFix = {
  appId: '220',
  key: 'macArch',
  op: 'add',
  detector: 'macho'
}
export const ADD_CEG: ReportFix = {
  appId: '220',
  key: 'drm',
  op: 'add',
  detector: 'ceg'
}
export const REMOVE_ARCH: ReportFix = { ...ADD_ARCH, op: 'remove' }

const run = (
  fix: ReportFix,
  more: Partial<Extract<ReportStepBody, { op: 'run' }>> & {
    seed?: SeedEntry[]
  } = {}
): ReportStep => ({ op: 'run', fix, ...more })
const withStatus = (
  status: number,
  data: unknown = { status: 'rejected' }
) => ({
  answer: { status, data }
})
const layer = (
  which: 'local' | 'bundled' | 'remote',
  body: unknown,
  app = '220'
): SeedEntry => layerFile(which, app, 'steam', 1, body)
const reset: ReportStep = { op: 'reset' }

const reportNamed = (
  stem: string,
  title: string,
  steps: ReportStep[],
  more: Partial<ReportCase> = {}
): ReportCase => ({
  id: `${stem}--${slug(title)}`,
  title,
  steps,
  ...more
})
const reportRule = (
  id: string,
  steps: ReportStep[],
  more: Partial<ReportCase> = {}
): ReportCase => ({ id: `rule-${id}`, steps, ...more })

const IN_FLIGHT_FIX_KEYS = [ADD_ARCH, ADD_CEG]

/**
 * The report cases: one per title of knownFixReport.test.ts (24), knownFixReportUrl.test.ts (2) and
 * knownFixReportDrift.test.ts (3), the `constants` case and the rules the plan names.
 */
export function reportCases(): ReportCase[] {
  const T = 'knownFixReport'
  return [
    // url
    reportNamed(T, 'url > env override wins, else the constant', [
      { op: 'relayUrl', env: 'http://x.test/r' },
      { op: 'relayUrl', env: null }
    ]),
    reportNamed(
      T,
      'url > the pending sentinel means nothing is sent',
      [run(ADD_ARCH)],
      { relayEnv: 'https://OPERATOR-DEPLOY-PENDING.example/v1' }
    ),

    // gate
    reportNamed(T, 'gate > non-mac does not send', [run(ADD_ARCH)], {
      platform: 'linux'
    }),
    reportNamed(T, 'gate > disabled does not send', [run(ADD_ARCH)], {
      settings: { shareDetectedFixes: false }
    }),
    reportNamed(T, 'gate > the setting is read on every call', [
      run(ADD_ARCH),
      { op: 'setSettings', settings: { shareDetectedFixes: false } },
      run(ADD_CEG)
    ]),
    reportNamed(
      T,
      'gate with the real default deps (D-09) > an absent shareDetectedFixes setting posts nothing',
      [run(ADD_ARCH), { op: 'detect', fix: ADD_CEG }],
      { settings: {} }
    ),
    reportNamed(
      T,
      'gate with the real default deps (D-09) > an explicit false posts nothing',
      [run(ADD_ARCH)],
      { settings: { shareDetectedFixes: false } }
    ),

    // skip
    reportNamed(T, 'skip > add macArch skipped when already 32', [
      run(ADD_ARCH, { seed: [layer('bundled', { macArch: '32' })] })
    ]),
    reportNamed(T, 'skip > add drm sent when winning has only macArch', [
      run(ADD_CEG, { seed: [layer('bundled', { macArch: '32' })] })
    ]),
    reportNamed(T, 'skip > add drm skipped when already ceg', [
      run(ADD_CEG, { seed: [layer('bundled', { drm: 'ceg' })] })
    ]),
    reportNamed(T, 'skip > remove sent when winning says 32', [
      run(REMOVE_ARCH, { seed: [layer('bundled', { macArch: '32' })] })
    ]),
    reportNamed(
      T,
      'skip > remove skipped when winning is null or lacks macArch 32',
      [
        run(REMOVE_ARCH),
        run(REMOVE_ARCH, { seed: [layer('bundled', { drm: 'ceg' })] })
      ]
    ),
    reportNamed(T, 'skip > local layer wins and nothing is sent', [
      run(ADD_CEG, { seed: [layer('local', { macArch: '32' })] }),
      run(REMOVE_ARCH)
    ]),
    reportNamed(T, 'skip > readWinning throwing yields error and no post', [
      run(ADD_ARCH, { readWinningThrows: true })
    ]),

    // sent
    reportNamed(
      T,
      'sent > 2xx marks and returns sent; a repeat is already-sent',
      [
        reset,
        run(ADD_ARCH, withStatus(200)),
        run(ADD_ARCH, withStatus(200)),
        reset,
        run(ADD_ARCH, withStatus(201)),
        run(ADD_ARCH, withStatus(201))
      ]
    ),
    reportNamed(
      T,
      'sent > terminal 4xx marks and returns rejected',
      [400, 413, 415, 422].flatMap((s) => [reset, run(ADD_ARCH, withStatus(s))])
    ),
    reportNamed(
      T,
      'sent > 408, 429, 5xx are retryable and not marked',
      [408, 429, 500, 503].flatMap((s) => [reset, run(ADD_ARCH, withStatus(s))])
    ),
    reportNamed(T, 'sent > a network failure is retryable and not marked', [
      run(ADD_ARCH, { answer: { rejects: 'ECONNRESET' } })
    ]),
    reportNamed(T, 'sent > posts exactly the allowed body', [run(ADD_CEG)]),
    reportNamed(
      T,
      'sent > malformed persisted values count as not sent',
      ['yes', { at: 'x' }, null].flatMap((bad) => [
        reset,
        { op: 'setSent', key: '220:macArch:add', value: bad } as ReportStep,
        run(ADD_ARCH)
      ])
    ),
    reportNamed(T, 'sent > an invalid appId is rejected locally', [
      run({ ...ADD_ARCH, appId: '../x' })
    ]),
    reportNamed(
      T,
      'sent > logs the report before and the status after, never the body',
      [
        run(ADD_ARCH, {
          answer: {
            status: 201,
            data: { status: 'created', detail: 'SECRET', pr: 9 }
          }
        })
      ]
    ),

    // abort
    reportNamed(
      T,
      'abort > is registered in flight, aborted by aborts.abortAll, then released',
      [
        run(ADD_ARCH, { answer: 'hang', background: true }),
        { op: 'turn' },
        { op: 'holds', fixes: [ADD_ARCH] },
        run(ADD_ARCH),
        { op: 'abortAll' },
        { op: 'settle' },
        { op: 'holds', fixes: [ADD_ARCH] }
      ]
    ),
    reportNamed(
      T,
      'abort > reportDetectedFix returns undefined synchronously and never throws',
      [{ op: 'detect', fix: ADD_ARCH, isMacThrows: true }]
    ),

    // knownFixReportUrl.test.ts
    reportNamed(
      'knownFixReportUrl',
      'url deployed > does not ship the operator-pending sentinel',
      [{ op: 'constants' }]
    ),
    reportNamed(
      'knownFixReportUrl',
      'url deployed > points at the deployed workers.dev relay endpoint',
      [{ op: 'constants' }]
    ),

    // knownFixReportDrift.test.ts
    reportNamed(
      'knownFixReportDrift',
      'known-fix report drift (D-03) > KNOWN_FIX_REPORT_PAIRS keys equal TIER1_ROUTING_KEYS',
      [{ op: 'drift' }]
    ),
    reportNamed(
      'knownFixReportDrift',
      'known-fix report drift (D-03) > filterTier1KnownFixes keeps %s=%s',
      [
        { op: 'filter', key: 'macArch', value: '32' },
        { op: 'filter', key: 'drm', value: 'ceg' }
      ]
    ),
    reportNamed(
      'knownFixReportDrift',
      'known-fix report drift (D-03) > a wrong %s value is dropped by the filter and the schema',
      [
        { op: 'filter', key: 'macArch', value: '64' },
        { op: 'filter', key: 'drm', value: 'none' }
      ]
    ),

    // the constants the Rust client is pinned to
    { id: 'constants', steps: [{ op: 'constants' }] },

    // rules
    reportRule(
      'sent-to-the-deployed-relay-with-content-type-and-user-agent-only',
      [run(ADD_ARCH)],
      { relayEnv: null }
    ),
    reportRule('the-env-override-is-the-url-posted', [run(ADD_CEG)], {
      relayEnv: 'https://staging.example/v1/reports'
    }),
    reportRule('removing-drm-is-refused-by-the-schema-and-nothing-is-sent', [
      run(
        { ...ADD_CEG, op: 'remove' },
        { seed: [layer('bundled', { macArch: '32' })] }
      )
    ]),
    reportRule('a-version-the-schema-refuses-is-not-sent', [run(ADD_ARCH)], {
      version: 'not a version!'
    }),
    reportRule('a-version-with-a-dash-and-a-plus-is-sent', [run(ADD_ARCH)], {
      version: '0.8.0-beta+1'
    }),
    reportRule(
      'every-status-boundary-maps-to-sent-rejected-or-retryable',
      [
        199, 200, 299, 300, 301, 399, 400, 404, 407, 408, 409, 429, 430, 499,
        500, 599
      ].flatMap((s) => [reset, run(ADD_ARCH, withStatus(s))])
    ),
    reportRule(
      'the-relay-body-is-logged-by-its-status-word-only',
      [
        { status: 'created' },
        { status: 'rate-limited' },
        { status: 'weird' },
        { status: 5 },
        null,
        'plain text',
        { detail: 'only' }
      ].flatMap((data) => [
        reset,
        run(ADD_ARCH, { answer: { status: 200, data } })
      ])
    ),
    reportRule('a-post-that-throws-synchronously-is-retryable', [
      run(ADD_ARCH, { answer: { throws: 'sync boom' } })
    ]),
    reportRule(
      'a-post-that-rejects-with-a-non-error-is-retryable-with-a-generic-line',
      [run(ADD_ARCH, { answer: { rejectsNonError: 'nope' } })]
    ),
    reportRule('two-different-reports-can-be-in-flight-together', [
      run(ADD_ARCH, { answer: 'hang', background: true }),
      run(ADD_CEG, { answer: 'hang', background: true }),
      { op: 'turn' },
      { op: 'holds', fixes: IN_FLIGHT_FIX_KEYS },
      { op: 'abortAll' },
      { op: 'settle' },
      { op: 'holds', fixes: IN_FLIGHT_FIX_KEYS }
    ]),
    reportRule('add-and-remove-keep-separate-sent-records', [
      run(ADD_ARCH),
      run(REMOVE_ARCH, { seed: [layer('bundled', { macArch: '32' })] }),
      run(ADD_ARCH),
      run(REMOVE_ARCH)
    ]),
    reportRule('a-rejected-report-is-not-sent-again', [
      run(ADD_ARCH, withStatus(404)),
      run(ADD_ARCH)
    ]),
    reportRule('reportDetectedFix-posts-in-the-background', [
      { op: 'detect', fix: ADD_ARCH },
      { op: 'turn' }
    ]),
    reportRule('not-mac-wins-over-disabled', [run(ADD_ARCH)], {
      platform: 'linux',
      settings: { shareDetectedFixes: false }
    }),
    reportRule('only-the-boolean-true-enables-the-setting', [
      run(ADD_ARCH),
      { op: 'setSettings', settings: { shareDetectedFixes: 'true' } },
      run(ADD_ARCH),
      { op: 'setSettings', settings: { shareDetectedFixes: 1 } },
      run(ADD_ARCH)
    ]),
    reportRule('the-remote-layer-counts-as-already-known', [
      run(ADD_ARCH, { seed: [layer('remote', { macArch: '32' })] })
    ]),
    reportRule('a-local-fix-without-the-key-still-skips-everything', [
      run(ADD_ARCH, { seed: [layer('local', { title: 'mine' })] })
    ]),
    reportRule('schema-vectors-for-parseKnownFixReport-and-the-sent-key', [
      {
        op: 'parse',
        inputs: [
          {
            v: 1,
            store: 'steam',
            appId: '220',
            key: 'macArch',
            value: '32',
            op: 'add',
            gamelibVersion: '0.8.0'
          },
          {
            v: 1,
            store: 'steam',
            appId: '1234567890',
            key: 'drm',
            value: 'ceg',
            op: 'add',
            gamelibVersion: '1'
          },
          {
            v: 1,
            store: 'steam',
            appId: '12345678901',
            key: 'macArch',
            value: '32',
            op: 'add',
            gamelibVersion: '0.8.0'
          },
          {
            v: 1,
            store: 'steam',
            appId: '0',
            key: 'macArch',
            value: '32',
            op: 'add',
            gamelibVersion: '0.8.0'
          },
          {
            v: 1,
            store: 'steam',
            appId: '220',
            key: 'macArch',
            value: 'ceg',
            op: 'add',
            gamelibVersion: '0.8.0'
          },
          {
            v: 1,
            store: 'steam',
            appId: '220',
            key: 'drm',
            value: 'ceg',
            op: 'remove',
            gamelibVersion: '0.8.0'
          },
          {
            v: 2,
            store: 'steam',
            appId: '220',
            key: 'macArch',
            value: '32',
            op: 'add',
            gamelibVersion: '0.8.0'
          },
          {
            v: 1,
            store: 'gog',
            appId: '220',
            key: 'macArch',
            value: '32',
            op: 'add',
            gamelibVersion: '0.8.0'
          },
          {
            v: 1,
            store: 'steam',
            appId: '220',
            key: 'macArch',
            value: '32',
            op: 'add',
            gamelibVersion: '0.8.0',
            title: 'Half-Life'
          },
          {
            v: 1,
            store: 'steam',
            appId: '220',
            key: 'macArch',
            value: '32',
            op: 'add',
            gamelibVersion: 'x'.repeat(41)
          },
          {
            v: 1,
            store: 'steam',
            appId: 220,
            key: 'macArch',
            value: '32',
            op: 'add',
            gamelibVersion: '0.8.0'
          },
          null,
          'text'
        ]
      }
    ])
  ]
}
