/**
 * The Epic service status oracle (88.1-02, D-11, D-12, D-14, D-15, D-22, D-25): `isEpicServiceOffline`
 * (the launcher's "is Epic down?" check) and the pure decision under it, `checkEpicServiceOffline` and
 * `isNetworkLevelFailure`, driven on a fresh fake HOME and recorded as the golden the Rust
 * `gamelib-launch` Epic status check has to reproduce. The golden exists before any Rust code does.
 *
 * Slice `gamelib-launch/tests/fixtures/golden/epic_status/`:
 *   cases.json      built from the case tables below (write mode rewrites it, compare mode checks it)
 *   deltas.json     the documented Rust-side differences (D-19), built from `DELTAS` below
 *   MANIFEST.json   `{ count, floor }`
 *   expected/<case>/result.json    the boolean `isEpicServiceOffline` answered (a list for the pure ops)
 *   expected/<case>/events.json    notifications shown (title and body), backend log lines (level, prefix,
 *                                  text) and how often the online monitor was asked, in call order
 *   expected/<case>/requests.json  `METHOD url` of every request made; the monitor-offline cases make none
 *
 * Replayed exchanges, `gamelib-launch/tests/fixtures/recorded/epic_status/<case>/exchanges.json` and its
 * `body-1.*`, are HAND-AUTHORED from the case tables (status.epicgames.com is never reached, T-88.1-03):
 * write mode writes them, compare mode asserts the committed files equal what the table produces, so the
 * files the Rust replay reads cannot drift from the cases. A transport failure is an exchange with
 * `networkError: true`, `status: 0` and an `errorCode` (the field the Rust replay needs and the shared
 * recorder ignores; this test turns it into the axios error the real http adapter raises, with a
 * `request` and no `response`).
 *
 * The ops a case can name:
 *   isOffline      `isEpicServiceOffline(deps, type)` over the real `axiosClient`, the real i18next at the
 *                  sidecar's `en` locale, a recording notification slice and a scripted online monitor
 *   check          `checkEpicServiceOffline` over a scripted fetch, the callbacks recorded
 *   networkLevel   `isNetworkLevelFailure` over a list of error shapes
 *
 * Modes (see testUtils/engineWineOracle/harness.ts):
 *   GAMELIB_WRITE_ENGINE_GOLDEN=1    rewrite cases.json, deltas.json, MANIFEST.json, expected/ and recorded/
 *   (default)                        recompute and compare, offline
 *
 * Isolation (D-12, D-13, D-22): every case runs on a fresh fake HOME inside `withPinnedBaseEnv`; the
 * recorder runs in replay mode only, so no case reaches the network. Behaviour that looks wrong is kept
 * as recorded and filed as a todo (D-20); a fix is never mixed into a golden diff.
 */
import { AxiosError, type AxiosResponse } from 'axios'
import i18next from 'i18next'
import Backend from 'i18next-fs-backend/cjs'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
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
  type EngineOracleProfile,
  writeOrCompareGolden
} from 'backend/testUtils/engineWineOracle/harness'
import {
  engineWineOracleMode,
  engineWineRecordedCaseDir,
  redactUrl
} from 'backend/testUtils/engineWineOracle/recorder'
import { withPinnedBaseEnv } from 'backend/testUtils/launchOracle/baseEnv'
import { createFakeLauncherDeps } from 'backend/testUtils/launchOracle/fakeLauncherDeps'
import {
  assertCasesCoverTitles,
  slug,
  tsTestTitles
} from 'backend/testUtils/launchOracle/census'
import { replayAxiosClient } from 'backend/testUtils/launchOracle/epicReplay'
import { withInjected } from 'backend/testUtils/launchOracle/probes'
import * as logger from 'backend/logger'
import { isEpicServiceOffline } from 'backend/utils'
import {
  checkEpicServiceOffline,
  isNetworkLevelFailure
} from 'backend/utils/epicServiceStatus'
import { i18nextLanguageOptions, localeFileSegments } from 'common/languages'

// The backend jest project shadows i18next with a key-echoing mock; the notification copy needs the real one.
jest.unmock('i18next')

const CRATE = 'gamelib-launch'
const SLICE = 'epic_status'
/** The case count this plan committed; a later edit may raise it, never lower it. */
const EPIC_FLOOR = 70
const STEM = 'epicServiceStatus'
const STATUS_URL = 'https://status.epicgames.com/api/v2/components.json'
const REQUEST_HEADERS = {
  accept: 'application/json, text/plain, */*',
  'user-agent': 'GameLib/oracle (+https://github.com/grayson-mitchell/GameLib)'
}

const mode = engineWineOracleMode()

type EpicType = 'Epic Games Store' | 'Fortnite' | 'Rocket League'
const TYPES: readonly EpicType[] = [
  'Epic Games Store',
  'Fortnite',
  'Rocket League'
]

/** What the status endpoint answers (or fails with). */
type Reply =
  | { kind: 'components'; components: { name?: string; status?: string }[] }
  | { kind: 'raw'; status: number; contentType: string; body: string }
  | { kind: 'network'; code: string }

/** One error shape a pure case feeds in. */
type ErrSpec =
  | { k: 'axios-network'; code: string }
  | { k: 'axios-http'; status: number; code: string }
  | { k: 'axios-config' }
  | { k: 'errno-object'; code: string }
  | { k: 'errno-error'; code: string }
  | { k: 'type-error'; message: string }
  | { k: 'undefined' }
  | { k: 'null' }
  | { k: 'string'; value: string }

type FetchOutcome = { resolve: unknown } | { reject: ErrSpec }

type Call =
  | { op: 'isOffline'; type: EpicType; online: boolean; reply?: Reply }
  | {
      op: 'check'
      runs: { type?: EpicType; fetch: FetchOutcome }[]
    }
  | { op: 'networkLevel'; inputs: ErrSpec[] }

interface EpicCase {
  id: string
  /** The test title a named case stands for, verbatim. */
  title?: string
  call: Call
}

// ---------------------------------------------------------------------------------------------
// The case tables
// ---------------------------------------------------------------------------------------------

const typeSlug = (type: EpicType): string => slug(type)

/** The components list the endpoint answers: every type operational except `type`, which has `status`. */
function componentsWith(
  type: EpicType,
  status: string
): { name: string; status: string }[] {
  return [
    { name: 'Website', status: 'operational' },
    ...TYPES.map((name) => ({
      name,
      status: name === type ? status : 'operational'
    }))
  ]
}

const STATUSES = [
  'operational',
  'degraded_performance',
  'partial_outage',
  'major_outage',
  'major',
  'under_maintenance'
] as const

/** Every code `EPIC_NETWORK_ERROR_CODES` lists, plus one it does not (axios still says request, no response). */
const NETWORK_CODES = [
  'ENOTFOUND',
  'EAI_AGAIN',
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ECONNABORTED',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'ENETDOWN',
  'EHOSTDOWN',
  'ERR_NETWORK',
  'EPROTO',
  'ERR_CANCELED'
] as const

const HTTP_STATUSES = [403, 404, 429, 500, 502, 503] as const

const MALFORMED: readonly (readonly [string, Reply])[] = [
  [
    'html-body',
    {
      kind: 'raw',
      status: 200,
      contentType: 'text/html',
      body: '<html><body>maintenance</body></html>\n'
    }
  ],
  [
    'empty-body',
    { kind: 'raw', status: 200, contentType: 'application/json', body: '' }
  ],
  [
    'truncated-json',
    {
      kind: 'raw',
      status: 200,
      contentType: 'application/json',
      body: '{"components": [{"name": "Epic Games Store"'
    }
  ],
  [
    'json-null',
    {
      kind: 'raw',
      status: 200,
      contentType: 'application/json',
      body: 'null\n'
    }
  ],
  [
    'json-without-components',
    {
      kind: 'raw',
      status: 200,
      contentType: 'application/json',
      body: '{"page": {"name": "Epic Games"}}\n'
    }
  ],
  [
    'components-null',
    {
      kind: 'raw',
      status: 200,
      contentType: 'application/json',
      body: '{"components": null}\n'
    }
  ],
  [
    'components-object',
    {
      kind: 'raw',
      status: 200,
      contentType: 'application/json',
      body: '{"components": {"name": "Epic Games Store", "status": "major"}}\n'
    }
  ],
  [
    'json-array',
    {
      kind: 'raw',
      status: 200,
      contentType: 'application/json',
      body: '[]\n'
    }
  ]
]

function replayCases(): EpicCase[] {
  const cases: EpicCase[] = []
  const online = (id: string, type: EpicType, reply: Reply): void => {
    cases.push({
      id: `epic-${typeSlug(type)}-${id}`,
      call: { op: 'isOffline', type, online: true, reply }
    })
  }
  for (const type of TYPES) {
    for (const status of STATUSES) {
      online(`status-${status}`, type, {
        kind: 'components',
        components: componentsWith(type, status)
      })
    }
    online('component-absent', type, {
      kind: 'components',
      components: componentsWith(type, 'operational').filter(
        (c) => c.name !== type
      )
    })
    cases.push({
      id: `epic-${typeSlug(type)}-monitor-offline`,
      call: { op: 'isOffline', type, online: false }
    })
  }
  online('components-empty', 'Epic Games Store', {
    kind: 'components',
    components: []
  })
  online('component-listed-twice-first-wins', 'Epic Games Store', {
    kind: 'components',
    components: [
      { name: 'Epic Games Store', status: 'operational' },
      { name: 'Epic Games Store', status: 'major' }
    ]
  })
  online('component-entry-without-name', 'Epic Games Store', {
    kind: 'components',
    components: [
      { status: 'major' },
      { name: 'Epic Games Store', status: 'major' }
    ]
  })
  online('component-without-status', 'Fortnite', {
    kind: 'components',
    components: [{ name: 'Fortnite' }]
  })
  for (const code of NETWORK_CODES) {
    online(`network-${slug(code)}`, 'Epic Games Store', {
      kind: 'network',
      code
    })
  }
  for (const status of HTTP_STATUSES) {
    online(`http-${status}`, 'Epic Games Store', {
      kind: 'raw',
      status,
      contentType: 'application/json',
      body: '{"error": "upstream"}\n'
    })
  }
  online('http-503-html-body', 'Fortnite', {
    kind: 'raw',
    status: 503,
    contentType: 'text/html',
    body: '<html>Service Unavailable</html>\n'
  })
  for (const [name, reply] of MALFORMED) {
    online(`malformed-${name}`, 'Epic Games Store', reply)
  }
  return cases
}

const CHECK_BODY = {
  components: [
    { name: 'Epic Games Store', status: 'operational' },
    { name: 'Fortnite', status: 'major' }
  ]
}

const NETWORK_LEVEL_LISTED: ErrSpec[] = [
  'ENOTFOUND',
  'EAI_AGAIN',
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ECONNABORTED',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'ERR_NETWORK',
  'EPROTO'
].map((code) => ({ k: 'axios-network', code }))

/** One named case per `epicServiceStatus.test.ts` title (D-14); the two source-text gates are not ported (D-15). */
const SOURCE_TEXT_GATE_REASON = 'source-text gate, dropped per D-15'
const GATE_TITLES = [
  'utils.ts wiring gate > imports the decision from ./utils/epicServiceStatus',
  'utils.ts wiring gate > isEpicServiceOffline delegates and keeps the early isOnline() check'
] as const

function namedCases(): EpicCase[] {
  const named = (title: string, call: Call): EpicCase => ({
    id: `${STEM}--${slug(title)}`,
    title,
    call
  })
  const check = (type: EpicType | undefined, fetch: FetchOutcome): Call => ({
    op: 'check',
    runs: [{ type, fetch }]
  })
  return [
    named(
      'isNetworkLevelFailure > is true for an AxiosError with a request and no response (%s)',
      { op: 'networkLevel', inputs: NETWORK_LEVEL_LISTED }
    ),
    named(
      'isNetworkLevelFailure > is true for a plain errno-style object with a listed code',
      {
        op: 'networkLevel',
        inputs: [
          { k: 'errno-object', code: 'ENOTFOUND' },
          { k: 'errno-error', code: 'EAI_AGAIN' }
        ]
      }
    ),
    named(
      'isNetworkLevelFailure > is false for an AxiosError that carries a response',
      {
        op: 'networkLevel',
        inputs: [
          { k: 'axios-http', status: 503, code: 'ERR_BAD_RESPONSE' },
          { k: 'axios-http', status: 404, code: 'ERR_BAD_REQUEST' }
        ]
      }
    ),
    named('isNetworkLevelFailure > is false for a cancelled request', {
      op: 'networkLevel',
      inputs: [{ k: 'axios-network', code: 'ERR_CANCELED' }]
    }),
    named(
      'isNetworkLevelFailure > is false for an AxiosError with no request (config error)',
      { op: 'networkLevel', inputs: [{ k: 'axios-config' }] }
    ),
    named('isNetworkLevelFailure > is false for %s', {
      op: 'networkLevel',
      inputs: [
        { k: 'type-error', message: 'x' },
        { k: 'undefined' },
        { k: 'null' },
        { k: 'string', value: 'ENOTFOUND' }
      ]
    }),
    named(
      'checkEpicServiceOffline > treats a network-level failure as offline without a notification',
      check(undefined, { reject: { k: 'axios-network', code: 'ENOTFOUND' } })
    ),
    named(
      'checkEpicServiceOffline > keeps an HTTP-error response as online and logs it',
      check(undefined, {
        reject: { k: 'axios-http', status: 503, code: 'ERR_BAD_RESPONSE' }
      })
    ),
    named(
      'checkEpicServiceOffline > keeps a non-network error as online and logs it',
      check(undefined, { reject: { k: 'type-error', message: 'bad body' } })
    ),
    named(
      'checkEpicServiceOffline > treats a malformed body (no components) as an error, online',
      check(undefined, { resolve: {} })
    ),
    named(
      "checkEpicServiceOffline > returns true and notifies once when the component is 'major'",
      check(undefined, {
        resolve: { components: [{ name: 'Epic Games Store', status: 'major' }] }
      })
    ),
    named(
      'checkEpicServiceOffline > returns false without notifying when the component is %s',
      {
        op: 'check',
        runs: ['operational', 'degraded_performance'].map((status) => ({
          fetch: {
            resolve: { components: [{ name: 'Epic Games Store', status }] }
          }
        }))
      }
    ),
    named(
      'checkEpicServiceOffline > notifies and returns false when the component is absent',
      check(undefined, {
        resolve: { components: [{ name: 'Other', status: 'major' }] }
      })
    ),
    named(
      'checkEpicServiceOffline > selects the component by the type argument',
      {
        op: 'check',
        runs: [
          { fetch: { resolve: CHECK_BODY } },
          { type: 'Fortnite', fetch: { resolve: CHECK_BODY } }
        ]
      }
    )
  ]
}

function epicCases(): EpicCase[] {
  return [...replayCases(), ...namedCases()]
}

/** The documented Rust-side differences (D-19); the file is built from this, never hand-edited. */
const DELTAS: Readonly<Record<string, string>> = {
  'js-engine-error-text':
    'The log line for a malformed or non-network failure ends with the JavaScript error the TS raised ("TypeError: data.components is not iterable", "AxiosError: Request failed with status code 500"). The message text of a TypeError is the JS engine\'s wording and an AxiosError message is the HTTP client\'s; the Rust check logs the same line prefix ("Failed to get epic service status with") and the failure kind, with its own error text. The result, the notification and the request are the golden\'s.'
}

// ---------------------------------------------------------------------------------------------
// Authored exchanges
// ---------------------------------------------------------------------------------------------

const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`

function bodyExtension(contentType: string): string {
  if (/json/i.test(contentType)) return 'json'
  if (/html/i.test(contentType)) return 'html'
  return 'txt'
}

/** The files `recorded/epic_status/<case>/` holds, or `null` when the case makes no request. */
function authoredExchange(call: Call): Record<string, string> | null {
  if (call.op !== 'isOffline' || !call.online || call.reply === undefined) {
    return null
  }
  const reply = call.reply
  const request = { method: 'GET', url: STATUS_URL, headers: REQUEST_HEADERS }
  if (reply.kind === 'network') {
    return {
      'exchanges.json': json([
        {
          id: 'ex-1',
          request,
          response: { status: 0, headers: {} },
          networkError: true,
          errorCode: reply.code
        }
      ])
    }
  }
  const contentType =
    reply.kind === 'components' ? 'application/json' : reply.contentType
  const status = reply.kind === 'components' ? 200 : reply.status
  const body =
    reply.kind === 'components'
      ? json({ components: reply.components })
      : reply.body
  const files: Record<string, string> = {}
  const bodyFile =
    body.length > 0 ? `body-1.${bodyExtension(contentType)}` : undefined
  if (bodyFile) files[bodyFile] = body
  files['exchanges.json'] = json([
    {
      id: 'ex-1',
      request,
      response: {
        status,
        headers: { 'content-type': contentType },
        ...(bodyFile ? { bodyFile } : {})
      }
    }
  ])
  return files
}

/** Write mode writes the authored files; compare mode asserts the committed ones equal them. */
function syncExchanges(cases: readonly EpicCase[]): void {
  for (const c of cases) {
    const dir = engineWineRecordedCaseDir(CRATE, SLICE, c.id)
    const files = authoredExchange(c.call)
    if (mode === 'write') {
      rmSync(dir, { recursive: true, force: true })
      if (files) {
        mkdirSync(dir, { recursive: true })
        for (const [name, text] of Object.entries(files)) {
          writeFileSync(join(dir, name), text)
        }
      }
      continue
    }
    if (files === null) {
      expect({ id: c.id, recorded: existsSync(dir) }).toEqual({
        id: c.id,
        recorded: false
      })
      continue
    }
    for (const [name, text] of Object.entries(files)) {
      expect({
        id: c.id,
        name,
        text: readFileSync(join(dir, name), 'utf8')
      }).toEqual({ id: c.id, name, text })
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Running one case
// ---------------------------------------------------------------------------------------------

function materialise(spec: ErrSpec): unknown {
  switch (spec.k) {
    case 'axios-network':
      return new AxiosError(`boom ${spec.code}`, spec.code, undefined, {})
    case 'axios-http':
      return new AxiosError(`http ${spec.status}`, spec.code, undefined, {}, {
        status: spec.status,
        data: {},
        headers: {},
        statusText: ''
      } as unknown as AxiosResponse)
    case 'axios-config':
      return new AxiosError('bad option', 'ERR_BAD_OPTION_VALUE')
    case 'errno-object':
      return { code: spec.code }
    case 'errno-error':
      return Object.assign(new Error('x'), { code: spec.code })
    case 'type-error':
      return new TypeError(spec.message)
    case 'undefined':
      return undefined
    case 'null':
      return null
    case 'string':
      return spec.value
  }
}

/** What the golden keeps of a value a callback saw: its kind, message and code. */
function describeError(error: unknown): unknown {
  if (error instanceof Error) {
    const { code } = error as { code?: unknown }
    return {
      name: error.name,
      message: error.message,
      ...(code === undefined ? {} : { code })
    }
  }
  return { value: error ?? null }
}

type Event =
  | { kind: 'notification'; title?: string; body?: string }
  | { kind: 'backend-log'; level: string; prefix: string | null; text: string }
  | { kind: 'online-monitor'; asked: number }
  | { kind: 'run'; run: number }
  | { kind: 'callback'; name: string; error?: unknown }

const asText = (message: unknown): string =>
  Array.isArray(message) ? message.join(' ') : String(message)

async function recordCase(
  c: EpicCase
): Promise<{ result: unknown; events: Event[]; requests: string[] }> {
  if (mode === 'record') {
    throw new Error(
      'epic status exchanges are hand-authored and replay only; GAMELIB_EW_ORACLE=record is not supported'
    )
  }
  return withEngineOracleProfile(async (profile) =>
    normalisePaths(await recordOnProfile(c, profile), profile)
  )
}

async function recordOnProfile(
  c: EpicCase,
  profile: EngineOracleProfile
): Promise<{ result: unknown; events: Event[]; requests: string[] }> {
  return withPinnedBaseEnv(profile.fake, async () => {
    const events: Event[] = []
    const spy = (
      level: 'info' | 'warning' | 'error',
      name: 'logInfo' | 'logWarning' | 'logError'
    ) => {
      const s = jest.spyOn(logger, name)
      s.mockImplementation(((message: unknown, prefix?: unknown) => {
        events.push({
          kind: 'backend-log',
          level,
          prefix: typeof prefix === 'string' ? prefix : null,
          text: asText(message)
        })
      }) as never)
      return () => s.mockRestore()
    }
    const restores = [
      spy('info', 'logInfo'),
      spy('warning', 'logWarning'),
      spy('error', 'logError')
    ]
    const call = c.call

    if (call.op === 'networkLevel') {
      return {
        result: await withInjected(restores, () =>
          call.inputs.map((input) => isNetworkLevelFailure(materialise(input)))
        ),
        events,
        requests: []
      }
    }

    if (call.op === 'check') {
      const results = await withInjected(restores, async () => {
        const out: boolean[] = []
        for (const [run, { type, fetch }] of call.runs.entries()) {
          events.push({ kind: 'run', run })
          const callback =
            (name: string) =>
            (error?: unknown): void => {
              events.push({
                kind: 'callback',
                name,
                ...(error === undefined ? {} : { error: describeError(error) })
              })
            }
          out.push(
            await checkEpicServiceOffline(
              {
                fetchComponents: () =>
                  'resolve' in fetch
                    ? Promise.resolve(fetch.resolve)
                    : Promise.reject(materialise(fetch.reject) as Error),
                notify: callback('notify'),
                onUnreachable: callback('onUnreachable'),
                onError: callback('onError')
              },
              type
            )
          )
        }
        return out
      })
      return { result: results, events, requests: [] }
    }

    // isOffline: the real axiosClient over the replayed exchange.
    const fake = createFakeLauncherDeps(profile, {
      online: call.online,
      overrides: {
        notifications: {
          show: (opts: { title?: string; body?: string }) => {
            events.push({
              kind: 'notification',
              title: opts.title,
              body: opts.body
            })
          }
        }
      } as never
    })
    const reply = call.reply
    const replay = replayAxiosClient({
      crate: CRATE,
      slice: SLICE,
      caseId: c.id,
      mode: mode === 'write' ? 'write' : 'compare',
      transportFailureCode: reply?.kind === 'network' ? reply.code : null
    })
    let answer: boolean
    try {
      answer = await withInjected(restores, () =>
        isEpicServiceOffline(fake.deps, call.type)
      )
      await replay.recorder.finish()
    } finally {
      replay.restore()
    }
    events.push({ kind: 'online-monitor', asked: fake.onlineAsked() })
    return { result: answer, events, requests: [...replay.recorder.requested] }
  })
}

/** The sidecar's i18next init, as `sidecar/bootstrap.ts` does it (locale en). */
async function initSidecarI18next(): Promise<void> {
  // The default instance, because that is the one `utils.ts` calls.
  // eslint-disable-next-line import-x/no-named-as-default-member
  await i18next.use(Backend).init({
    initImmediate: false,
    backend: {
      allowMultiLoading: false,
      loadPath: (lng: string, namespace: string) =>
        join(
          __dirname,
          '..',
          '..',
          '..',
          '..',
          'public',
          'locales',
          ...localeFileSegments(lng, namespace)
        )
    },
    debug: false,
    returnEmptyString: false,
    returnNull: false,
    fallbackLng: 'en',
    ...i18nextLanguageOptions('en'),
    ns: ['translation', 'gamelib'],
    defaultNS: 'translation'
  })
}

describeSkipOnWindows('epic status oracle (88.1-02)', () => {
  const built = epicCases()
  const casesFile = join(goldenDir(CRATE, SLICE), 'cases.json')
  if (mode === 'write') {
    mkdirSync(dirname(casesFile), { recursive: true })
    writeFileSync(casesFile, json(built))
    writeFileSync(join(goldenDir(CRATE, SLICE), 'deltas.json'), json(DELTAS))
  }
  const cases = loadCases<EpicCase>(CRATE, SLICE)
  const byId = (id: string): EpicCase => {
    const found = cases.find((c) => c.id === id)
    if (!found) throw new Error(`case ${id} is missing`)
    return found
  }

  beforeAll(initSidecarI18next)

  it('cases.json is exactly what the case builder produces', () => {
    expect(cases).toEqual(JSON.parse(JSON.stringify(built)))
  })

  it('deltas.json is exactly what the delta table produces', () => {
    expect(
      JSON.parse(
        readFileSync(join(goldenDir(CRATE, SLICE), 'deltas.json'), 'utf8')
      )
    ).toEqual(DELTAS)
  })

  it('the authored exchanges are exactly what the case tables produce', () => {
    syncExchanges(cases)
  })

  it.each(cases)('$id', async (c) => {
    const { result, events, requests } = await recordCase(c)
    writeOrCompareGolden(CRATE, SLICE, c.id, { result, events, requests })
  })

  describe('what the check decides', () => {
    it('only the literal status "major" is offline, for each service type', async () => {
      for (const type of TYPES) {
        for (const status of STATUSES) {
          const { result } = await recordCase(
            byId(`epic-${typeSlug(type)}-status-${status}`)
          )
          expect({ type, status, offline: result }).toEqual({
            type,
            status,
            offline: status === 'major'
          })
        }
      }
    })

    it('a component the type does not have, or a missing one, notifies and is online', async () => {
      for (const type of TYPES) {
        const { result, events } = await recordCase(
          byId(`epic-${typeSlug(type)}-component-absent`)
        )
        expect(result).toBe(false)
        expect(events.filter((e) => e.kind === 'notification')).toHaveLength(1)
      }
    })

    it('the monitor-offline cases are offline with no request and no notification', async () => {
      for (const type of TYPES) {
        const { result, events, requests } = await recordCase(
          byId(`epic-${typeSlug(type)}-monitor-offline`)
        )
        expect(result).toBe(true)
        expect(requests).toEqual([])
        expect(events.filter((e) => e.kind === 'notification')).toEqual([])
        expect(events.filter((e) => e.kind === 'online-monitor')).toEqual([
          { kind: 'online-monitor', asked: 1 }
        ])
      }
    })

    it('a transport failure is offline with a warning and no notification, an HTTP or parse error is online', async () => {
      const unreachable = await recordCase(
        byId('epic-epic-games-store-network-enotfound')
      )
      expect(unreachable.result).toBe(true)
      expect(
        unreachable.events.filter((e) => e.kind === 'notification')
      ).toEqual([])
      expect(
        unreachable.events.filter(
          (e) => e.kind === 'backend-log' && e.level === 'warning'
        )
      ).toHaveLength(1)
      for (const id of [
        'epic-epic-games-store-http-500',
        'epic-epic-games-store-http-403',
        'epic-epic-games-store-malformed-html-body'
      ]) {
        const answered = await recordCase(byId(id))
        expect(answered.result).toBe(false)
        expect(
          answered.events.filter(
            (e) => e.kind === 'backend-log' && e.level === 'error'
          )
        ).toHaveLength(1)
      }
    })

    it('every case with an exchange requests the Epic status page once, and a case with none requests nothing', async () => {
      for (const c of cases) {
        if (c.call.op !== 'isOffline') continue
        const { requests } = await recordCase(c)
        expect(requests).toEqual(
          authoredExchange(c.call) === null
            ? []
            : [`GET ${redactUrl(STATUS_URL)}`]
        )
      }
    })
  })

  describe('incident census (D-14)', () => {
    it('every title of epicServiceStatus.test.ts is a named case or a reasoned source-text gate', () => {
      const titles = tsTestTitles(
        join(__dirname, '..', '..', 'utils', '__tests__', `${STEM}.test.ts`)
      )
      const ids = cases
        .filter((c) => c.id.startsWith(`${STEM}--`))
        .map((c) => c.id.slice(STEM.length + 2))
      const notPorted = Object.fromEntries(
        GATE_TITLES.map((title) => [title, SOURCE_TEXT_GATE_REASON])
      )
      assertCasesCoverTitles(ids, titles, notPorted)
      // No case without a title either: a typo in a case title would pass the line above only by luck.
      expect([...ids].sort()).toEqual(
        titles
          .filter((t) => !(GATE_TITLES as readonly string[]).includes(t))
          .map(slug)
          .sort()
      )
      expect(titles).toHaveLength(16)
    })
  })

  it('the committed MANIFEST agrees with the case list and holds one folder per case', () => {
    syncManifest(CRATE, SLICE, cases, EPIC_FLOOR)
    assertManifest(CRATE, SLICE, cases, EPIC_FLOOR)
  })

  it('an empty case list fails the manifest check', () => {
    expectEmptyCasesToFail(CRATE, SLICE, EPIC_FLOOR)
  })
})
