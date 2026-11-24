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
  engineWineRecordedCaseDir
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
import { dropRealpathPrefix, json, spyLogs, type LogLine } from './oracleCommon'
import {
  fetcherTracer,
  type FetchCase,
  type FetchStep,
  type Reply
} from './knownFixFetch.cases'

const CRATE = 'gamelib-knownfix'
const FETCHER_SLICE = 'fetcher'
/** The case counts this plan committed; a later edit may raise them, never lower them. */
const FETCHER_FLOOR = 1

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
// The tests
// ---------------------------------------------------------------------------------------------

function writeCases(slice: string, built: unknown): void {
  if (mode !== 'write') return
  const file = join(goldenDir(CRATE, slice), 'cases.json')
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, json(built))
}

describeSkipOnWindows('known-fix remote fetcher oracle (88-07)', () => {
  const built = [fetcherTracer()]
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
      requests: requests as string[],
      after: tree
    })
    writeOrCompareRecorded(FETCHER_SLICE, c.id, exchanges)
  })

  it('the committed MANIFEST agrees with the case list and holds one folder per case', () => {
    syncManifest(CRATE, FETCHER_SLICE, cases, cases.length)
    assertManifest(CRATE, FETCHER_SLICE, cases, FETCHER_FLOOR)
  })

  it('an empty case list fails the manifest check', () => {
    expectEmptyCasesToFail(CRATE, FETCHER_SLICE, FETCHER_FLOOR)
  })
})
