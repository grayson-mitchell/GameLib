/**
 * The known-fix network oracle (88-07, D-03, D-11, D-14, D-25): the remote-fixes fetcher
 * (`fetchRemoteKnownFixes`) and the opt-in known-fix report client (`runKnownFixReport`, `reportDetectedFix`,
 * `relayUrl`), driven on a fresh fake HOME with every network answer scripted, and recorded as the goldens the Rust
 * clients (88-11) have to reproduce. The goldens exist before any Rust for them does.
 *
 * Slices under `gamelib-knownfix/tests/fixtures/`:
 *   golden/fetcher/    which URLs the fetcher asked, in order, and the `<APPFOLDER>` tree it left behind
 *   golden/report/     the POST (URL, headers without secrets, JSON body, 8 000 ms timeout, no redirects), the
 *                      sent-store writes and the outcome
 *   recorded/<slice>/<case>/exchanges.json   the scripted answers in `recorder.ts`'s exchange shape, with a
 *                      `body-<n>.<ext>` per answer body, so the Rust `Replay` fetch can serve them offline
 * Each golden slice has
 *   cases.json      built in `knownFixFetch.cases.ts` (write mode rewrites it, compare mode checks it)
 *   deltas.json     hand-authored: the documented Rust-side differences (D-19)
 *   MANIFEST.json   `{ count, floor }`
 *   expected/<case>/result.json    what each step answered
 *   expected/<case>/events.json    every logger call the modules made (debug, info, warning), with its prefix
 *   expected/<case>/requests.json  fetcher: `GET <url>` per request; report: the POST as the client built it
 *   expected/<case>/tree.json      fetcher: the `<APPFOLDER>` tree afterwards (content hashes)
 *   expected/<case>/store.json     report: every write the sent store saw, and its final content
 *
 * Modes (see testUtils/engineWineOracle/harness.ts):
 *   GAMELIB_WRITE_ENGINE_GOLDEN=1    rewrite cases.json, MANIFEST.json, every expected/ folder and every recorded/ folder
 *   (default)                        recompute and compare, offline
 * `GAMELIB_EW_ORACLE=record` is the harness's live-recording mode: no case here touches the network, so it records
 * nothing and compares nothing.
 *
 * Isolation (D-12, D-13, D-22): every case runs on a fresh fake HOME under `withPinnedBaseEnv` with an injected
 * platform; nothing reads the real profile. `axios.get` and `axios.post` are spied on and answered from the case,
 * so the fetcher's and the report client's real request configuration is what gets recorded and nothing is sent.
 * Goldens are recorded on a POSIX host.
 */
import axios, { type AxiosRequestConfig } from 'axios'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'fs'
import { dirname, join } from 'path'
import { describeSkipOnWindows } from 'backend/__tests__/skip'
import {
  assertManifest,
  expectEmptyCasesToFail,
  goldenDir,
  loadCases,
  normalisePaths,
  seedProfile,
  syncManifest,
  withEngineOracleProfile,
  writeOrCompareGolden,
  type EngineOracleProfile
} from 'backend/testUtils/engineWineOracle/harness'
import {
  engineWineOracleMode,
  engineWineRecordedCaseDir,
  redactHeaders
} from 'backend/testUtils/engineWineOracle/recorder'
import { snapshotTree } from 'backend/testUtils/engineWineOracle/treeSnapshot'
import { withPinnedBaseEnv } from 'backend/testUtils/launchOracle/baseEnv'
import {
  injectPlatform,
  withInjected
} from 'backend/testUtils/launchOracle/probes'
import {
  fetchRemoteKnownFixes,
  type KnownFixesGet
} from 'backend/knownFixesFetcher'
import {
  GAMELIB_FIX_RELAY_URL,
  RELAY_URL_PENDING_SENTINEL,
  knownFixReportDeps,
  reportDetectedFix,
  relayUrl,
  runKnownFixReport,
  type ReportDeps
} from 'backend/knownFixReport'
import {
  TIER1_KNOWN_FIX_KEYS,
  TIER1_ROUTING_KEYS,
  filterTier1KnownFixes
} from 'backend/knownFixes'
import {
  KNOWN_FIX_REPORT_MAX_BYTES,
  KNOWN_FIX_REPORT_PAIRS,
  KNOWN_FIX_REPORT_VERSION,
  RELAY_RESPONSE_STATUSES,
  parseKnownFixReport,
  reportSentKey
} from 'common/knownFixReport'
import { createAbortRegistry } from 'backend/utils/aborthandler/aborthandler'
import {
  assertCasesCoverTitles,
  slug,
  tsTestTitles
} from 'backend/testUtils/launchOracle/census'
import {
  dropRealpathPrefix,
  json,
  realTurn,
  spyLogs,
  type LogLine
} from './oracleCommon'
import {
  GAMELIB_KNOWN_FIXES_BASE,
  HEROIC_KNOWN_FIXES_BASE
} from 'backend/knownFixesFetcher'
import {
  fetcherCases,
  reportCases,
  type FetchCase,
  type FetchStep,
  type PostAnswer,
  type Reply,
  type ReportCase,
  type ReportFix,
  type ReportStep
} from './knownFixFetch.cases'

const CRATE = 'gamelib-knownfix'
const FETCHER_SLICE = 'fetcher'
const REPORT_SLICE = 'report'
/** The case counts this plan committed; a later edit may raise them, never lower them. */
const FETCHER_FLOOR = 38
const REPORT_FLOOR = 48
const RELAY_TIMEOUT_MS = 8000

const mode = engineWineOracleMode()

// ---------------------------------------------------------------------------------------------
// recorded/<slice>/<case>/ (the scripted answers, in recorder.ts's exchange shape)
// ---------------------------------------------------------------------------------------------

/** What the scripted server answered: a status with a body, or a transport failure (no response at all). */
type Answer =
  | { status: number; contentType: string; body: string }
  | { networkError: true }

interface ExchangeIn {
  method: string
  url: string
  headers: Record<string, string>
  /** The request body as sent (the report's JSON text). */
  body?: string
  answer: Answer
}

const extensionFor = (contentType: string): string =>
  /json/i.test(contentType) ? 'json' : 'txt'

/** `exchanges.json` and one `body-<n>.<ext>` per answer body, the way `recorder.ts` lays a case out. */
function recordedFiles(exchanges: readonly ExchangeIn[]): Map<string, string> {
  const files = new Map<string, string>()
  const list = exchanges.map((e, i) => {
    const n = i + 1
    const request = {
      method: e.method,
      url: e.url,
      headers: e.headers,
      ...(e.body === undefined ? {} : { body: e.body })
    }
    if ('networkError' in e.answer) {
      return {
        id: `ex-${n}`,
        request,
        response: { status: 0, headers: {} },
        networkError: true
      }
    }
    const { status, contentType, body } = e.answer
    let bodyFile: string | undefined
    if (body.length > 0) {
      bodyFile = `body-${n}.${extensionFor(contentType)}`
      files.set(bodyFile, body)
    }
    return {
      id: `ex-${n}`,
      request,
      response: {
        status,
        headers: body.length > 0 ? { 'content-type': contentType } : {},
        ...(bodyFile ? { bodyFile } : {})
      }
    }
  })
  files.set('exchanges.json', json(list))
  return files
}

const listFiles = (dir: string): string[] =>
  existsSync(dir) ? readdirSync(dir).sort() : []

/** Write mode: rewrites the case's recorded folder. Compare mode: asserts the same file set and bytes. */
function writeOrCompareRecorded(
  slice: string,
  caseId: string,
  exchanges: readonly ExchangeIn[]
): void {
  if (mode === 'record') return
  const files = recordedFiles(exchanges)
  const dir = engineWineRecordedCaseDir(CRATE, slice, caseId)
  if (mode === 'write') {
    rmSync(dir, { recursive: true, force: true })
    mkdirSync(dir, { recursive: true })
    for (const [name, content] of files) writeFileSync(join(dir, name), content)
    return
  }
  expect([...files.keys()].sort()).toEqual(listFiles(dir))
  for (const [name, content] of files) {
    expect(content).toBe(readFileSync(join(dir, name), 'utf8'))
  }
}

const bodyText = (data: unknown): string =>
  data === undefined || data === null
    ? ''
    : typeof data === 'string'
      ? data
      : JSON.stringify(data)

// ---------------------------------------------------------------------------------------------
// fetcher
// ---------------------------------------------------------------------------------------------

interface CaseRecord {
  result: unknown
  events: LogLine[]
  requests: (string | Record<string, unknown>)[]
  /** `tree.json` (fetcher) */
  tree?: unknown[]
  /** `store.json` (report) */
  store?: unknown
  exchanges: ExchangeIn[]
}

/** The remote layer's folder and everything beside it, under the `<APPFOLDER>` placeholder. */
function appFolderTree(profile: EngineOracleProfile): unknown[] {
  if (!existsSync(profile.appFolder)) return []
  return snapshotTree(profile.appFolder).map((e) => ({
    ...e,
    path: `<APPFOLDER>/${e.path}`
  }))
}

const replyAnswer = (reply: Reply): Answer =>
  'throws' in reply
    ? { networkError: true }
    : {
        status: reply.status,
        contentType: 'text/plain; charset=utf-8',
        body: bodyText(reply.data)
      }

async function runFetchStep(
  s: FetchStep,
  profile: EngineOracleProfile,
  exchanges: ExchangeIn[],
  allRequests: string[]
): Promise<unknown> {
  const urls: string[] = []
  const replyFor = (url: string): Reply =>
    s.replies[url] ?? { status: 404, data: '' }
  const axiosCalls: Record<string, unknown>[] = []
  let rejected = false
  const deps = { paths: profile.paths }
  try {
    if (s.via === 'default') {
      const spy = jest.spyOn(axios, 'get')
      spy.mockImplementation(((url: string, config?: AxiosRequestConfig) => {
        urls.push(url)
        const transform = config?.transformResponse as
          | ((r: unknown) => unknown)
          | undefined
        const accepts = config?.validateStatus
        axiosCalls.push({
          url,
          timeout: config?.timeout ?? null,
          responseType: config?.responseType ?? null,
          transformResponseKeepsTheText: transform?.('{"a":1}') === '{"a":1}',
          validateStatusAccepts: Object.fromEntries(
            [200, 301, 403, 404, 500].map((code) => [code, accepts?.(code)])
          )
        })
        const reply = replyFor(url)
        if ('throws' in reply) {
          return Promise.reject(
            Object.assign(
              new Error(reply.throws),
              reply.code ? { code: reply.code } : {}
            )
          )
        }
        return Promise.resolve({ status: reply.status, data: reply.data })
      }) as never)
      try {
        await fetchRemoteKnownFixes(deps, s.appName, s.runner)
      } finally {
        spy.mockRestore()
      }
    } else {
      const get: KnownFixesGet = (url) => {
        urls.push(url)
        const reply = replyFor(url)
        if ('throws' in reply) return Promise.reject(new Error(reply.throws))
        return Promise.resolve({ status: reply.status, data: reply.data })
      }
      await fetchRemoteKnownFixes(deps, s.appName, s.runner, get)
    }
  } catch {
    rejected = true
  }
  for (const url of urls) {
    allRequests.push(`GET ${url}`)
    exchanges.push({
      method: 'GET',
      url,
      headers: {},
      answer: replyAnswer(replyFor(url))
    })
  }
  return {
    appName: s.appName,
    runner: s.runner,
    via: s.via ?? 'injected',
    rejected,
    returned: null,
    requested: urls,
    ...(s.via === 'default' ? { axiosCalls } : {}),
    treeAfter: appFolderTree(profile)
  }
}

async function recordFetchCase(c: FetchCase): Promise<CaseRecord> {
  return withEngineOracleProfile(async (profile) => {
    const events: LogLine[] = []
    let stepNo = 0
    const exchanges: ExchangeIn[] = []
    const requests: string[] = []
    const results: unknown[] = []
    const restoreLogs = spyLogs(events, () => stepNo, [
      'debug',
      'info',
      'warning'
    ])
    await withInjected([injectPlatform('mac'), restoreLogs], () =>
      withPinnedBaseEnv(profile.fake, async () => {
        for (const [index, s] of c.steps.entries()) {
          stepNo = index
          if (s.seed) seedProfile(profile, s.seed)
          results.push(await runFetchStep(s, profile, exchanges, requests))
        }
      })
    )
    const clean = <T>(value: T): T =>
      dropRealpathPrefix(normalisePaths(value, profile))
    return {
      result: clean({ steps: results }),
      events: clean(events),
      requests,
      tree: clean(appFolderTree(profile)),
      exchanges
    }
  })
}

// ---------------------------------------------------------------------------------------------
// report
// ---------------------------------------------------------------------------------------------

const abortIdOf = (fix: ReportFix): string =>
  `known-fix-report:${reportSentKey(fix)}`

/** The report test's `report(k, v)` helper: a well-formed body for one pair. */
const reportBodyFor = (key: string, value: string) => ({
  v: 1,
  store: 'steam',
  appId: '1234',
  key,
  value,
  op: 'add',
  gamelibVersion: '0.8.0'
})

const postAnswerOf = (answer: PostAnswer): Answer =>
  typeof answer === 'object' && 'status' in answer
    ? {
        status: answer.status,
        contentType: 'application/json',
        body: bodyText(answer.data)
      }
    : { networkError: true }

async function recordReportCase(c: ReportCase): Promise<CaseRecord> {
  return withEngineOracleProfile(async (profile) => {
    const events: LogLine[] = []
    let stepNo = 0
    const exchanges: ExchangeIn[] = []
    const requests: Record<string, unknown>[] = []
    const storeWrites: { step: number; key: string; value: unknown }[] = []
    const results: unknown[] = []
    const background: { fix: ReportFix; running: Promise<string> }[] = []
    let settings: Record<string, unknown> = c.settings ?? {
      shareDetectedFixes: true
    }
    let currentAnswer: PostAnswer = { status: 200, data: { status: 'created' } }

    const makeState = () => {
      const store = new Map<string, unknown>()
      const aborts = createAbortRegistry()
      const real = knownFixReportDeps({
        stores: {
          steam: {
            steamKnownFixReportStore: {
              get: (k: string) => store.get(k),
              set: (k: string, v: unknown) => {
                storeWrites.push({ step: stepNo, key: k, value: v })
                store.set(k, v)
              }
            }
          }
        },
        appInfo: { version: c.version ?? '0.8.0' },
        config: { getSettings: () => settings },
        aborts,
        paths: {
          ...profile.paths,
          bundledFixesPath: join(profile.home, 'public', 'fixes')
        }
      } as never)
      const deps: ReportDeps = { ...real, now: () => 1234 }
      return { store, aborts, deps }
    }
    let state = makeState()

    const post = jest.spyOn(axios, 'post')
    post.mockImplementation(((
      url: string,
      body: unknown,
      config?: AxiosRequestConfig
    ) => {
      const answer = currentAnswer
      const signal = config?.signal as AbortSignal | undefined
      const accepts = config?.validateStatus
      const bodyJson = JSON.stringify(body)
      const headers = redactHeaders(
        (config?.headers ?? {}) as unknown as Record<string, unknown>
      )
      requests.push({
        step: stepNo,
        method: 'POST',
        url,
        headers,
        body,
        bodyKeys: Object.keys((body ?? {}) as object),
        bodyBytes: Buffer.byteLength(bodyJson),
        bodyWithinMaxBytes:
          Buffer.byteLength(bodyJson) <= KNOWN_FIX_REPORT_MAX_BYTES,
        bodyParses: parseKnownFixReport(body).ok,
        timeoutMs: config?.timeout ?? null,
        maxRedirects: config?.maxRedirects ?? null,
        validateStatusAccepts: Object.fromEntries(
          [200, 301, 400, 429, 500].map((code) => [code, accepts?.(code)])
        ),
        hasSignal: signal !== undefined,
        signalAbortedAtCall: signal?.aborted ?? null
      })
      exchanges.push({
        method: 'POST',
        url,
        headers,
        body: bodyJson,
        answer: postAnswerOf(answer)
      })
      if (answer === 'hang') {
        return new Promise((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(new Error('aborted')))
        })
      }
      if ('throws' in answer) throw new Error(answer.throws)
      if ('rejects' in answer) return Promise.reject(new Error(answer.rejects))
      if ('rejectsNonError' in answer) {
        // The case exists to reach the client's fallback line for a rejection that is not an Error.
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
        return Promise.reject(answer.rejectsNonError)
      }
      return Promise.resolve({ status: answer.status, data: answer.data })
    }) as never)

    const depsFor = (s: { readWinningThrows?: true; isMacThrows?: true }) => ({
      ...state.deps,
      ...(s.readWinningThrows
        ? {
            readWinning: () => {
              throw new Error('boom')
            }
          }
        : {}),
      ...(s.isMacThrows
        ? {
            isMac: () => {
              throw new Error('sync boom')
            }
          }
        : {})
    })
    const turns = async () => {
      for (let i = 0; i < 3; i++) await realTurn()
    }

    const runStep = async (s: ReportStep): Promise<unknown> => {
      switch (s.op) {
        case 'run': {
          currentAnswer = s.answer ?? {
            status: 200,
            data: { status: 'created' }
          }
          const before = requests.length
          const started = runKnownFixReport(s.fix, depsFor(s))
          if (s.background) {
            background.push({ fix: s.fix, running: started })
            return {
              op: s.op,
              fix: s.fix,
              answer: s.answer ?? null,
              background: true,
              postsMade: requests.length - before
            }
          }
          const outcome = await started
          return {
            op: s.op,
            fix: s.fix,
            answer: s.answer ?? null,
            outcome,
            postsMade: requests.length - before,
            sentRecord: state.store.get(reportSentKey(s.fix)) ?? null,
            sentStoreSize: state.store.size,
            registryHoldsIt: state.aborts.has(abortIdOf(s.fix))
          }
        }
        case 'detect': {
          currentAnswer = s.answer ?? {
            status: 200,
            data: { status: 'created' }
          }
          const before = requests.length
          let returned: unknown = 'unset'
          let threw = false
          try {
            returned = reportDetectedFix(s.fix, depsFor(s))
          } catch {
            threw = true
          }
          const postsMadeSynchronously = requests.length - before
          await turns()
          return {
            op: s.op,
            fix: s.fix,
            returnedUndefined: returned === undefined,
            threw,
            postsMadeSynchronously,
            postsMade: requests.length - before
          }
        }
        case 'turn':
          await turns()
          return { op: s.op }
        case 'holds':
          return {
            op: s.op,
            held: s.fixes.map((fix) => ({
              fix,
              held: state.aborts.has(abortIdOf(fix))
            }))
          }
        case 'abortAll':
          state.aborts.abortAll()
          return { op: s.op }
        case 'settle': {
          const settled = await Promise.all(
            background.splice(0).map(async (b) => ({
              fix: b.fix,
              outcome: await b.running
            }))
          )
          return { op: s.op, settled }
        }
        case 'reset':
          state = makeState()
          return { op: s.op }
        case 'setSettings':
          settings = s.settings
          return { op: s.op, settings: s.settings }
        case 'setSent':
          state.store.set(s.key, s.value)
          return { op: s.op, key: s.key, value: s.value }
        case 'relayUrl': {
          if (s.env === null) delete process.env.GAMELIB_FIX_RELAY_URL
          else process.env.GAMELIB_FIX_RELAY_URL = s.env
          return { op: s.op, env: s.env, url: relayUrl() }
        }
        case 'constants':
          return {
            op: s.op,
            pairs: KNOWN_FIX_REPORT_PAIRS,
            version: KNOWN_FIX_REPORT_VERSION,
            maxBytes: KNOWN_FIX_REPORT_MAX_BYTES,
            tier1RoutingKeys: [...TIER1_ROUTING_KEYS],
            tier1AllowList: [...TIER1_KNOWN_FIX_KEYS],
            relayUrl: GAMELIB_FIX_RELAY_URL,
            relayUrlContainsThePendingSentinel: GAMELIB_FIX_RELAY_URL.includes(
              RELAY_URL_PENDING_SENTINEL
            ),
            relayUrlIsAWorkersDevEndpoint:
              /^https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev\/v1\/reports$/.test(
                GAMELIB_FIX_RELAY_URL
              ),
            pendingSentinel: RELAY_URL_PENDING_SENTINEL,
            relayResponseStatuses: [...RELAY_RESPONSE_STATUSES],
            relayTimeoutMs: RELAY_TIMEOUT_MS,
            gamelibFeedBase: GAMELIB_KNOWN_FIXES_BASE,
            heroicFeedBase: HEROIC_KNOWN_FIXES_BASE
          }
        case 'parse':
          return {
            op: s.op,
            parsed: s.inputs.map((input) => ({
              input,
              result: parseKnownFixReport(input)
            })),
            sentKey: reportSentKey({ appId: '220', key: 'macArch', op: 'add' })
          }
        case 'filter': {
          const out = filterTier1KnownFixes('x', 'test', {
            [s.key]: s.value
          }) as unknown as Record<string, unknown> | null
          return {
            op: s.op,
            key: s.key,
            value: s.value,
            filtered: out,
            kept: out?.[s.key] === s.value,
            schemaAccepts: parseKnownFixReport(reportBodyFor(s.key, s.value)).ok
          }
        }
        case 'drift':
          return {
            op: s.op,
            pairKeys: Object.keys(KNOWN_FIX_REPORT_PAIRS).sort(),
            routingKeys: [...TIER1_ROUTING_KEYS].sort()
          }
      }
    }

    const restoreLogs = spyLogs(events, () => stepNo, [
      'debug',
      'info',
      'warning'
    ])
    try {
      await withInjected(
        [injectPlatform(c.platform ?? 'mac'), restoreLogs],
        () =>
          withPinnedBaseEnv(profile.fake, async () => {
            const relayEnv =
              c.relayEnv === undefined
                ? 'http://relay.test/v1/reports'
                : c.relayEnv
            if (relayEnv !== null) process.env.GAMELIB_FIX_RELAY_URL = relayEnv
            for (const [index, s] of c.steps.entries()) {
              stepNo = index
              if (s.seed) seedProfile(profile, s.seed)
              results.push(await runStep(s))
            }
          })
      )
    } finally {
      post.mockRestore()
    }
    const clean = <T>(value: T): T =>
      dropRealpathPrefix(normalisePaths(value, profile))
    return {
      result: clean({
        platform: c.platform ?? 'mac',
        settings: c.settings ?? { shareDetectedFixes: true },
        version: c.version ?? '0.8.0',
        steps: results
      }),
      events: clean(events),
      requests: requests.map((r) => clean(r)),
      store: clean({
        writes: storeWrites,
        final: Object.fromEntries(state.store)
      }),
      exchanges
    }
  })
}

// ---------------------------------------------------------------------------------------------
// The tests
// ---------------------------------------------------------------------------------------------

function writeCases(slice: string, built: unknown): void {
  if (mode !== 'write') return
  const file = join(goldenDir(CRATE, slice), 'cases.json')
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, json(built))
}

/** Every title of `file` (a sibling `../` test) is a named case id with the given stem, one for one. */
function expectEveryTitleIsACase(
  cases: readonly { id: string }[],
  stem: string,
  file: string
): void {
  const ids = cases
    .filter((c) => c.id.startsWith(`${stem}--`))
    .map((c) => c.id.slice(`${stem}--`.length))
  const titles = tsTestTitles(join(__dirname, '..', file))
  assertCasesCoverTitles(ids, titles, {})
  expect([...ids].sort()).toEqual(titles.map(slug).sort())
}

describeSkipOnWindows('known-fix remote fetcher oracle (88-07)', () => {
  const built = fetcherCases()
  writeCases(FETCHER_SLICE, built)
  const cases = loadCases<FetchCase>(CRATE, FETCHER_SLICE)

  it('cases.json is exactly what the case builder produces', () => {
    expect(cases).toEqual(JSON.parse(JSON.stringify(built)))
  })

  it.each(cases)('$id', async (c) => {
    const { result, events, requests, tree, exchanges } =
      await recordFetchCase(c)
    writeOrCompareGolden(CRATE, FETCHER_SLICE, c.id, {
      result,
      events,
      requests,
      after: tree
    })
    writeOrCompareRecorded(FETCHER_SLICE, c.id, exchanges)
  })

  it('every title of knownFixesFetcher.test.ts is a named case, one for one', () => {
    expectEveryTitleIsACase(
      cases,
      'knownFixesFetcher',
      'knownFixesFetcher.test.ts'
    )
  })

  it('no case reaches the network: every URL asked is a feed URL the case scripted or a 404 default', () => {
    for (const c of cases) {
      for (const s of c.steps) {
        for (const url of Object.keys(s.replies)) {
          expect(
            url.startsWith(`${GAMELIB_KNOWN_FIXES_BASE}/`) ||
              url.startsWith(`${HEROIC_KNOWN_FIXES_BASE}/`)
          ).toBe(true)
        }
      }
    }
  })

  it('the committed MANIFEST agrees with the case list and holds one folder per case', () => {
    syncManifest(CRATE, FETCHER_SLICE, cases, cases.length)
    assertManifest(CRATE, FETCHER_SLICE, cases, FETCHER_FLOOR)
  })

  it('an empty case list fails the manifest check', () => {
    expectEmptyCasesToFail(CRATE, FETCHER_SLICE, FETCHER_FLOOR)
  })
})

describeSkipOnWindows('known-fix report oracle (88-07)', () => {
  const built = reportCases()
  writeCases(REPORT_SLICE, built)
  const cases = loadCases<ReportCase>(CRATE, REPORT_SLICE)

  it('cases.json is exactly what the case builder produces', () => {
    expect(cases).toEqual(JSON.parse(JSON.stringify(built)))
  })

  it.each(cases)('$id', async (c) => {
    const { result, events, requests, store, exchanges } =
      await recordReportCase(c)
    writeOrCompareGolden(CRATE, REPORT_SLICE, c.id, {
      result,
      events,
      requests,
      extra: { 'store.json': store }
    })
    writeOrCompareRecorded(REPORT_SLICE, c.id, exchanges)
  })

  it.each([
    ['knownFixReport', 'knownFixReport.test.ts'],
    ['knownFixReportUrl', 'knownFixReportUrl.test.ts'],
    ['knownFixReportDrift', 'knownFixReportDrift.test.ts']
  ])('every title of %s is a named case, one for one', (stem, file) => {
    expectEveryTitleIsACase(cases, stem, file)
  })

  it('no recorded request header is anything but Content-Type and User-Agent', () => {
    // Every case's POST is checked in the case itself; this pins the file set the replay reads.
    for (const c of cases) {
      const file = join(
        engineWineRecordedCaseDir(CRATE, REPORT_SLICE, c.id),
        'exchanges.json'
      )
      if (mode === 'write' && !existsSync(file)) continue
      const exchanges = JSON.parse(readFileSync(file, 'utf8')) as {
        request: { headers: Record<string, string> }
      }[]
      for (const e of exchanges) {
        expect(Object.keys(e.request.headers).sort()).toEqual([
          'content-type',
          'user-agent'
        ])
      }
    }
  })

  it('the committed MANIFEST agrees with the case list and holds one folder per case', () => {
    syncManifest(CRATE, REPORT_SLICE, cases, cases.length)
    assertManifest(CRATE, REPORT_SLICE, cases, REPORT_FLOOR)
  })

  it('an empty case list fails the manifest check', () => {
    expectEmptyCasesToFail(CRATE, REPORT_SLICE, REPORT_FLOOR)
  })
})
