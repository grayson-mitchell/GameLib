/**
 * The check_wine oracle (88.1-04, D-11, D-12, D-13, D-14, D-22, D-25, D-28): `checkWineBeforeLaunch` and
 * `downloadDefaultWine` from `utils.ts`, driven on a fresh fake HOME and recorded as the golden the Rust
 * `gamelib-launch` check_wine op has to reproduce. The golden exists before any Rust port does.
 *
 * Slice `gamelib-launch/tests/fixtures/golden/check_wine/`:
 *   cases.json      built from the case tables below (write mode rewrites it, compare mode checks it)
 *   deltas.json     the documented Rust-side differences (D-19), empty in 88.1-04
 *   MANIFEST.json   `{ count, floor }`
 *   expected/<case>/input.json     what the case started from and what every collaborator was scripted to answer:
 *                                  the game info, the stored settings, the global settings, the scripted Rust
 *                                  replies (by channel, in call order) and the scripted dialog answer
 *   expected/<case>/result.json    `checkWineBeforeLaunch`: `{ ok, wineVersionAfter }` (`wineVersionAfter` is
 *                                  `gameSettings.wineVersion` after the call: the function mutates the caller's
 *                                  object in place); `downloadDefaultWine`: `{ value }`; a throw is `{ error }`
 *   expected/<case>/writes.json    every settings write, in order: `{ target: 'game', appName, key, value }` for
 *                                  `gameConfigs.get(app).setSetting` and `{ target: 'global', key, value }` for
 *                                  `config.setSetting`. These are DATA the Rust reply returns for the TS adapter to
 *                                  apply (Pitfall 7, D-30 interim), never Rust-side config writes
 *   expected/<case>/dialogs.json   every dialog: title, message, buttons, the scripted answer (a button index, or
 *                                  `null` for a dismissal) and the `response` the TS `dialogs.showMessageBox` path
 *                                  mapped it to
 *   expected/<case>/requests.json  every rustInvoke request with its reply (`RUST_WINE_VALID`,
 *                                  `RUST_WINE_MANAGER_REFRESH`, `_LIST`, `_INSTALL`, `RUST_WINE_DISCOVER_ALTERNATIVES`)
 *   expected/<case>/log.json       the per-game log entries (`{ seq, level, parts }`)
 *   expected/<case>/events.json    the backend log lines (`{ seq, level, prefix, text }`)
 *
 * Every entry of the five trace files carries a `seq` from one counter, so the interleaving of a write, a dialog,
 * a request and a log line is recoverable (D-25).
 *
 * The dialogs go through the REAL `createDialogs` over a scripted `dialog_message` reply, so a dismissal (`null`)
 * is mapped by the same code that maps it in the app: the caller's `cancelId`, else the last button's index.
 * `ContinueWithFoundWine` declares no `cancelId`, so a dismissal answers 1, "No".
 *
 * Flagged assumption (spec-less edge probe): the edge-coverage row of SVC-03 is unclassified and unresolved; the
 * D-14 matrix stands in for edge coverage and is not claimed as a verified edge.
 *
 * Modes (see testUtils/engineWineOracle/harness.ts):
 *   GAMELIB_WRITE_ENGINE_GOLDEN=1    rewrite cases.json, deltas.json, MANIFEST.json and every expected/ folder
 *   (default)                        recompute and compare, offline
 *
 * Isolation (D-12, D-13, D-22, T-88.1-07): every case runs on a fresh fake HOME inside `withPinnedBaseEnv` (eleven
 * env keys) with an injected platform and `os.release()`. `gameConfigs` and `config` are recording fakes, and every
 * Rust channel is scripted, so no wine is downloaded, executed or written to the real config. An unscripted
 * channel, dialog or second discovery fails the case by name. Behaviour that looks wrong is kept as recorded and
 * filed as a todo (D-20); a fix is never mixed into a golden diff.
 */
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import i18next from 'i18next'
import Backend from 'i18next-fs-backend/cjs'
import { describeSkipOnWindows } from 'backend/__tests__/skip'
import {
  assertManifest,
  expectEmptyCasesToFail,
  goldenDir,
  loadCases,
  normalisePaths,
  syncManifest,
  withEngineOracleProfile,
  type OraclePlatform
} from 'backend/testUtils/engineWineOracle/harness'
import { engineWineOracleMode } from 'backend/testUtils/engineWineOracle/recorder'
import { withPinnedBaseEnv } from 'backend/testUtils/launchOracle/baseEnv'
import {
  createFakeLauncherDeps,
  recordingLogWriter
} from 'backend/testUtils/launchOracle/fakeLauncherDeps'
import {
  injectPlatform,
  injectProbe,
  withInjected
} from 'backend/testUtils/launchOracle/probes'
import * as logger from 'backend/logger'
import { createDialogs } from 'backend/host/dialogs'
import { discoverAlternativeWine } from 'backend/enginewine/wineDiscovery'
import { checkWineBeforeLaunch, downloadDefaultWine } from 'backend/utils'
import { STEAM_BOTTLE_RESERVED_APPNAME } from 'backend/storeManagers/steam/constants'
import { i18nextLanguageOptions, localeFileSegments } from 'common/languages'
import {
  RUST_DIALOG_MESSAGE,
  RUST_WINE_DISCOVER_ALTERNATIVES,
  RUST_WINE_MANAGER_INSTALL,
  RUST_WINE_MANAGER_LIST,
  RUST_WINE_MANAGER_REFRESH,
  RUST_WINE_VALID
} from 'common/types/sidecarTransport'
import type {
  GameInfo,
  GameSettings,
  Runner,
  WineInstallation,
  WineVersionInfo
} from 'common/types'

// The backend jest project shadows i18next with a key-echoing mock; the dialog copy needs the real one.
jest.unmock('i18next')

const CRATE = 'gamelib-launch'
const SLICE = 'check_wine'
/** The case count this plan committed; a later edit may raise it, never lower it. */
const CHECK_WINE_FLOOR = 1

const mode = engineWineOracleMode()

// ---------------------------------------------------------------------------------------------
// The case tables
// ---------------------------------------------------------------------------------------------

/** What `RUST_WINE_DISCOVER_ALTERNATIVES` answers on one call: a list, or a rejection. */
type Discovery = { list: WineInstallation[] } | { reject: string }

interface CheckWineCase {
  id: string
  /** `checkWineBeforeLaunch` or `downloadDefaultWine(deps)` called directly. */
  call: 'check' | 'download'
  /** The platform the case runs as; default `linux`. */
  platform?: OraclePlatform
  /** `os.release()` for a Mac case (Darwin version). */
  osRelease?: string
  /** The caller's runner (the Steam bottle is `steam` with the reserved synthetic appName). */
  runner?: Runner
  appName?: string
  /** The game's stored wine (`gameSettings.wineVersion`). */
  gameWine: WineInstallation
  /** The game's `verboseLogs`. */
  verboseLogs?: boolean
  /** The global settings the deps answered. */
  defaultWine: WineInstallation
  disableLogs?: boolean
  /** The names of the wines `RUST_WINE_VALID` answers `true` for; every other wine answers `false`. */
  valid: string[]
  /** One reply per `RUST_WINE_DISCOVER_ALTERNATIVES` call, in order. */
  alternatives?: Discovery[]
  /** `RUST_WINE_MANAGER_LIST`'s answer: the stored release list, or a non-list. */
  releases?: WineVersionInfo[] | null
  /** `RUST_WINE_MANAGER_INSTALL`'s answer. */
  install?: string
  /** The scripted dialog answer: a button index, or `null` for a dismissal. */
  dialog?: number | null
}

const wine = (name: string): WineInstallation => ({
  name,
  type: 'wine',
  bin: `/pins/wines/${name}/bin/wine`,
  wineserver: `/pins/wines/${name}/bin/wineserver`
})

const GAME_WINE = wine('Wine-Game-8.0')
const DEFAULT_WINE = wine('Wine-Default-9.0')
const ALT_WINE = wine('Wine-Alt-7.0')

const release = (
  type: WineVersionInfo['type'],
  version: string
): WineVersionInfo => ({
  version,
  type,
  date: '2026-01-01',
  download: `https://example.invalid/${type}/${version}.tar.xz`,
  downsize: 1000,
  disksize: 2000,
  checksum: `sha-${version}`,
  release_notes_link: `https://example.invalid/${type}/${version}`,
  isInstalled: false,
  hasUpdate: false,
  installDir: `/pins/tools/wine/${type}-${version}`
})

const base = (id: string): CheckWineCase => ({
  id,
  call: 'check',
  gameWine: GAME_WINE,
  defaultWine: DEFAULT_WINE,
  valid: []
})

function checkWineCases(): CheckWineCase[] {
  return [
    // The tracer: the game wine is invalid, the default is valid and the user answers Yes.
    {
      ...base('check-default-valid-yes'),
      valid: [DEFAULT_WINE.name],
      dialog: 0
    }
  ]
}

// ---------------------------------------------------------------------------------------------
// Running one case
// ---------------------------------------------------------------------------------------------

const clone = <T>(value: T): T =>
  value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T)

/** The module object `backend/utils` calls `release()` on; a namespace import would be a frozen copy. */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const osModule = (): typeof import('os') => require('os')

const asText = (message: unknown): string =>
  Array.isArray(message) ? message.map(String).join(' ') : String(message)

interface Recorded {
  input: unknown
  result: unknown
  writes: unknown[]
  dialogs: unknown[]
  requests: unknown[]
  log: unknown[]
  events: unknown[]
}

/** The failure of a collaborator nobody scripted: never recorded as an answer, always a failed case. */
const unscriptedFailure = (what: string): Error =>
  new Error(`fake launcher deps: unscripted ${what}`)

async function recordOnProfile(
  c: CheckWineCase,
  profile: Parameters<Parameters<typeof withEngineOracleProfile>[0]>[0]
): Promise<Recorded> {
  let seq = 0
  const next = (): number => seq++
  const unscripted: string[] = []

  const requests: unknown[] = []
  const writes: unknown[] = []
  const dialogs: unknown[] = []
  const events: unknown[] = []

  // ----- the scripted Rust channels, each recording its exchange
  const exchange =
    (channel: string, reply: (args: unknown[]) => unknown) =>
    (args: unknown[]) => {
      const entry = { seq: next(), channel, args: clone(args) }
      try {
        const answer = reply(args)
        requests.push({ ...entry, reply: clone(answer) })
        return answer
      } catch (error) {
        requests.push({ ...entry, rejected: (error as Error).message })
        throw error
      }
    }
  const alternatives = [...(c.alternatives ?? [])]
  const rust: Record<string, unknown> = {
    [RUST_WINE_VALID]: exchange(RUST_WINE_VALID, (args) =>
      c.valid.includes((args[0] as WineInstallation | undefined)?.name ?? '')
    ),
    [RUST_WINE_MANAGER_REFRESH]: exchange(RUST_WINE_MANAGER_REFRESH, () => null)
  }
  if (c.releases !== undefined) {
    rust[RUST_WINE_MANAGER_LIST] = exchange(
      RUST_WINE_MANAGER_LIST,
      () => c.releases
    )
  }
  if (c.install !== undefined) {
    rust[RUST_WINE_MANAGER_INSTALL] = exchange(
      RUST_WINE_MANAGER_INSTALL,
      () => c.install
    )
  }
  if (c.alternatives !== undefined) {
    rust[RUST_WINE_DISCOVER_ALTERNATIVES] = exchange(
      RUST_WINE_DISCOVER_ALTERNATIVES,
      () => {
        const reply = alternatives.shift()
        if (!reply) {
          unscripted.push('discovery call')
          throw unscriptedFailure('discovery call')
        }
        if ('reject' in reply) throw new Error(reply.reject)
        return reply.list
      }
    )
  }

  // ----- the real dialogs over a scripted `dialog_message` reply
  const answers = c.dialog === undefined ? [] : [c.dialog]
  let raised = 0
  const realDialogs = createDialogs({
    requestRustInvoke: ((channel: string) => {
      if (channel !== RUST_DIALOG_MESSAGE) {
        return Promise.reject(unscriptedFailure(`dialog channel "${channel}"`))
      }
      if (answers.length === 0) {
        unscripted.push('dialog answer')
        return Promise.reject(unscriptedFailure('dialog answer'))
      }
      return Promise.resolve(answers.shift())
    }) as never,
    raiseMainWindowIfHiddenByGameLib: () => {
      raised += 1
    }
  })
  const dialogsFake = {
    ...realDialogs,
    showMessageBox: async (options: {
      title?: string
      message?: string
      buttons?: string[]
      cancelId?: number
    }) => {
      const entrySeq = next()
      const raisedBefore = raised
      const scripted = answers[0] === undefined ? null : answers[0]
      const result = await realDialogs.showMessageBox(options as never)
      dialogs.push({
        seq: entrySeq,
        title: options.title,
        message: options.message,
        buttons: options.buttons,
        cancelId: options.cancelId ?? null,
        scriptedAnswer: c.dialog === undefined ? null : scripted,
        response: result.response,
        raisedMainWindow: raised > raisedBefore
      })
      return result
    }
  }

  // ----- the recording config, game config and per-game log
  const kvs = { name: 'kvs' }
  const fake = createFakeLauncherDeps(profile, {
    rust,
    overrides: { dialogs: dialogsFake as never }
  })
  const config = {
    getSettings: () => ({
      wineVersion: c.defaultWine,
      disableLogs: c.disableLogs ?? false
    }),
    // The real `getAlternativeWine` is one call into the Rust discovery shim (`config.ts`).
    getAlternativeWine: () =>
      discoverAlternativeWine(fake.deps, true) as Promise<WineInstallation[]>,
    setSetting: (key: string, value: unknown, store: unknown) => {
      writes.push({
        seq: next(),
        target: 'global',
        key,
        value: clone(value),
        store: store === kvs ? 'kvs' : 'other'
      })
    }
  }
  const runner: Runner = c.runner ?? 'legendary'
  const appName = c.appName ?? `app-${runner}`
  const gameConfigs = {
    get: (app: string) => ({
      setSetting: (key: string, value: unknown) => {
        writes.push({
          seq: next(),
          target: 'game',
          appName: app,
          key,
          value: clone(value)
        })
      }
    })
  }
  const deps = {
    ...fake.deps,
    config,
    gameConfigs,
    stores: { kvs },
    dialogs: dialogsFake
  } as never

  const perGame = recordingLogWriter()
  const logSeqs: number[] = []
  const writer = perGame.writer as unknown as Record<
    string,
    (...parts: unknown[]) => unknown
  >
  const stampedWriter = Object.fromEntries(
    [
      'logDebug',
      'logInfo',
      'logWarning',
      'logError',
      'writeString',
      'close'
    ].map((name) => [
      name,
      (...parts: unknown[]) => {
        logSeqs.push(next())
        return (writer[name] as (...p: unknown[]) => unknown)(...parts)
      }
    ])
  ) as never

  const gameInfo = { app_name: appName, runner } as GameInfo
  const gameSettings = {
    wineVersion: clone(c.gameWine),
    verboseLogs: c.verboseLogs ?? false
  } as unknown as GameSettings
  const input = {
    call: c.call,
    platform: c.platform ?? 'linux',
    osRelease: c.osRelease ?? null,
    gameInfo: { app_name: appName, runner },
    storedSettings: {
      wineVersion: clone(c.gameWine),
      verboseLogs: c.verboseLogs ?? false
    },
    globalSettings: {
      wineVersion: clone(c.defaultWine),
      disableLogs: c.disableLogs ?? false
    },
    scripted: {
      validWines: c.valid,
      alternatives: clone(c.alternatives ?? null),
      releases: clone(c.releases ?? null),
      install: c.install ?? null,
      dialog: c.dialog === undefined ? 'none' : c.dialog
    }
  }

  // ----- the backend log, spied (not mocked)
  const spies = (
    ['logDebug', 'logInfo', 'logWarning', 'logError'] as const
  ).map((name) => {
    const level = name.slice(3).toLowerCase()
    const spy = jest.spyOn(logger, name)
    spy.mockImplementation(((message: unknown, options?: unknown) => {
      events.push({
        seq: next(),
        level,
        prefix: typeof options === 'string' ? options : null,
        text: asText(message)
      })
    }) as never)
    return () => spy.mockRestore()
  })
  const restores = [injectPlatform(c.platform ?? 'linux'), ...spies]
  if (c.osRelease !== undefined) {
    const osRelease = c.osRelease
    restores.push(
      injectProbe(osModule(), 'release', (() => osRelease) as never)
    )
  }

  const result = await withInjected(restores, () =>
    withPinnedBaseEnv(profile.fake, async () => {
      try {
        if (c.call === 'download') {
          return { value: clone(await downloadDefaultWine(deps)) }
        }
        const ok = await checkWineBeforeLaunch(
          deps,
          gameInfo,
          gameSettings,
          stampedWriter
        )
        return { ok, wineVersionAfter: clone(gameSettings.wineVersion) }
      } catch (error) {
        const message = (error as Error).message
        if (message.includes('fake launcher deps:')) throw error
        return {
          error: message,
          wineVersionAfter: clone(gameSettings.wineVersion)
        }
      }
    })
  )
  if (unscripted.length > 0) {
    throw new Error(`case ${c.id}: unscripted ${unscripted.join(', ')}`)
  }
  const logEntries = await perGame.entries()
  return {
    input,
    result,
    writes,
    dialogs,
    requests,
    log: logEntries.map((entry, index) => ({
      seq: logSeqs[index],
      level: entry.level,
      parts: entry.parts
    })),
    events
  }
}

async function recordCase(c: CheckWineCase): Promise<Recorded> {
  if (mode === 'record') {
    throw new Error(
      'check_wine has no recorded exchanges; GAMELIB_EW_ORACLE=record is not supported'
    )
  }
  return withEngineOracleProfile(async (profile) =>
    normalisePaths(await recordOnProfile(c, profile), profile)
  )
}

const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`

/** The files of one golden folder: write mode rewrites them, compare mode checks the file set and the bytes. */
function writeOrCompare(caseId: string, recorded: Recorded): void {
  const dir = join(goldenDir(CRATE, SLICE), 'expected', caseId)
  const produced = new Map<string, string>([
    ['input.json', json(recorded.input)],
    ['result.json', json(recorded.result)],
    ['writes.json', json(recorded.writes)],
    ['dialogs.json', json(recorded.dialogs)],
    ['requests.json', json(recorded.requests)],
    ['log.json', json(recorded.log)],
    ['events.json', json(recorded.events)]
  ])
  if (mode === 'write') {
    rmSync(dir, { recursive: true, force: true })
    mkdirSync(dir, { recursive: true })
    for (const [name, text] of produced) writeFileSync(join(dir, name), text)
    return
  }
  expect([...produced.keys()].sort()).toEqual(readdirSync(dir).sort())
  for (const [name, text] of produced) {
    expect(text).toBe(readFileSync(join(dir, name), 'utf8'))
  }
}

/** A committed golden file of one case, parsed. */
function committed(id: string, file: string): unknown {
  return JSON.parse(
    readFileSync(join(goldenDir(CRATE, SLICE), 'expected', id, file), 'utf8')
  )
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

describeSkipOnWindows('check_wine oracle (88.1-04)', () => {
  const built = checkWineCases()
  const casesFile = join(goldenDir(CRATE, SLICE), 'cases.json')
  if (mode === 'write') {
    mkdirSync(dirname(casesFile), { recursive: true })
    writeFileSync(casesFile, json(built))
    writeFileSync(join(goldenDir(CRATE, SLICE), 'deltas.json'), json([]))
  }
  const cases = loadCases<CheckWineCase>(CRATE, SLICE)
  const byId = (id: string): CheckWineCase => {
    const found = cases.find((c) => c.id === id)
    if (!found) throw new Error(`case ${id} is missing`)
    return found
  }
  void byId
  void STEAM_BOTTLE_RESERVED_APPNAME
  void committed

  beforeAll(initSidecarI18next)

  it('cases.json is exactly what the case builder produces', () => {
    expect(cases).toEqual(JSON.parse(JSON.stringify(built)))
  })

  it.each(cases)('$id', async (c) => {
    writeOrCompare(c.id, await recordCase(c))
  })

  it('the tracer: one game write of wineVersion and one dialog with two buttons', async () => {
    const recorded = await recordCase(byId('check-default-valid-yes'))
    const gameWrites = (
      recorded.writes as { target: string; key: string }[]
    ).filter((w) => w.target === 'game')
    expect(gameWrites).toHaveLength(1)
    expect(gameWrites[0]).toMatchObject({ key: 'wineVersion' })
    expect(recorded.dialogs).toHaveLength(1)
    expect((recorded.dialogs[0] as { buttons: string[] }).buttons).toEqual([
      'YES',
      'NO'
    ])
    expect(recorded.result).toMatchObject({ ok: true })
  })

  it('the committed MANIFEST agrees with the case list and holds one folder per case', () => {
    syncManifest(CRATE, SLICE, cases, CHECK_WINE_FLOOR)
    assertManifest(CRATE, SLICE, cases, CHECK_WINE_FLOOR)
  })

  it('an empty case list fails the manifest check', () => {
    expectEmptyCasesToFail(CRATE, SLICE, CHECK_WINE_FLOOR)
  })
})
