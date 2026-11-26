/**
 * The errorHandler and askForceUninstall oracle (88.2-05, D-02, D-11, D-12, D-20, D-25, D-26): the error
 * mapping `callRunner` applies after every run (the 82 amendment ports it with the 88.2 runner over the
 * first ManagerHooks channel), driven through the real `errorHandler` and `askForceUninstall` exported by
 * `backend/utils` on a fresh fake HOME and recorded as the golden the Rust port (88.2-09) replays.
 *
 * Slice `gamelib-launch/tests/fixtures/golden/error_handler/`:
 *   cases.json      built from the case tables below (write mode rewrites it, compare mode checks it)
 *   deltas.json     the documented Rust-side differences (D-19), built from `DELTAS` below
 *   MANIFEST.json   `{ count, floor }`
 *   expected/<case>/result.json   `{ returned, asked, answered, frontend, forceUninstall, titleLookups,
 *                                 appState }`:
 *                                   asked          every native dialog the code opened (type, title, message,
 *                                                  buttons, cancelId), in order
 *                                   answered       the response each dialog got (a dismissal answers the
 *                                                  dialog's own cancelId)
 *                                   frontend       every renderer push: channel, title, message, type
 *                                   forceUninstall one entry per `forceUninstall()` call
 *                                   titleLookups   every library-manager and game-info read, in order
 *                                   appState       the main-window raises the in-app modal asked for
 *                                 `returned` is what `askForceUninstall` answered (`null` for errorHandler,
 *                                 which resolves with nothing)
 *   (events.json, requests.json, spawns.json and tree.json are the harness's fixed files and stay empty)
 *
 * The strings are the real English catalog (`public/locales/en`) through the real i18next the sidecar
 * initialises, not the key-echoing jest mock, so a golden message is what a user reads. Isolation (D-12,
 * D-13): every case runs on a fresh fake HOME; the dialogs, the renderer and the library managers are
 * recording fakes and nothing is spawned. The goldens are recorded on a POSIX host. Behaviour that looks
 * wrong is kept as recorded and filed as a todo (D-20); a fix is never mixed into a golden diff.
 *
 * Modes (see testUtils/engineWineOracle/harness.ts):
 *   GAMELIB_WRITE_ENGINE_GOLDEN=1    rewrite cases.json, deltas.json, MANIFEST.json and every expected/ folder
 *   (default)                        recompute and compare, offline
 */
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
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
  writeOrCompareGolden
} from 'backend/testUtils/engineWineOracle/harness'
import { engineWineOracleMode } from 'backend/testUtils/engineWineOracle/recorder'
import { createFakeLauncherDeps } from 'backend/testUtils/launchOracle/fakeLauncherDeps'
import {
  askForceUninstall,
  errorHandler,
  type ErrorHandlerDeps
} from 'backend/utils'
import { i18nextLanguageOptions, localeFileSegments } from 'common/languages'
import type { Runner } from 'common/types'
import type { Game } from 'common/types/game_manager'

// The backend jest project shadows i18next with a key-echoing mock; the messages here need the real one.
jest.unmock('i18next')

const CRATE = 'gamelib-launch'
const SLICE = 'error_handler'
/** The case count this plan committed; a later edit may raise it, never lower it. */
const ERROR_HANDLER_FLOOR = 108

const mode = engineWineOracleMode()

const LOCALES_DIR = join(__dirname, '..', '..', '..', '..', 'public', 'locales')

/** The sidecar's i18next init (locale en), as `sidecar/bootstrap.ts` does it. */
async function initSidecarI18next(): Promise<void> {
  // eslint-disable-next-line import-x/no-named-as-default-member
  await i18next.use(Backend).init({
    initImmediate: false,
    backend: {
      allowMultiLoading: false,
      loadPath: (lng: string, namespace: string) =>
        join(LOCALES_DIR, ...localeFileSegments(lng, namespace))
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

// ---------------------------------------------------------------------------------------------
// The case shape
// ---------------------------------------------------------------------------------------------

/** What the native dialog answers: a button index, or a dismissal (the dialog's own cancelId). */
type Answer = 0 | 1 | 'dismiss'

interface ErrorHandlerCase {
  id: string
  /** What the case pins; recorded nowhere else, it only reads well in `cases.json`. */
  note?: string
  /** `errorHandler(deps, error, appName, runner)` or `askForceUninstall(deps, game, appName)`. */
  entry: 'errorHandler' | 'askForceUninstall'
  runner: Runner
  appName: string
  /** The error text; unused by `askForceUninstall`. */
  error: string
  /** The dialog answer, for a case that reaches a dialog. */
  answer?: Answer
  /** What `getGameInfo().title` answers: a string, or `null` for a game whose info has no title. */
  title: string | null
}

const ERROR_RUNNERS: readonly Runner[] = [
  'legendary',
  'gog',
  'nile',
  'sideload'
]

// ---------------------------------------------------------------------------------------------
// The case tables
// ---------------------------------------------------------------------------------------------

const DELETED = 'Error: game folder appears to be deleted'
const LEGENDARY_TRACE =
  'Traceback (most recent call last): File "/opt/legendary/legendary/cli.py", line 12, in main\nValueError: bad value'
const MEMORY_TRACE = `${LEGENDARY_TRACE}\nMemoryError: out of memory`
const EXPIRED = 'No saved credentials found for this account'
const INDEX_ERROR = 'IndexError: list index out of range'
const REQUESTS_WARNING = 'RequestsDependencyWarning'

interface Variant {
  slug: string
  note: string
  error: string
  appName?: string
  answer?: Answer
  title?: string | null
}

/** The branches every runner drives, in the order the code checks them. */
const VARIANTS: readonly Variant[] = [
  {
    slug: 'empty-error',
    note: 'an empty error returns before anything',
    error: ''
  },
  {
    slug: 'ignore-index-error',
    note: 'the macOS false-alarm message alone is ignored',
    error: INDEX_ERROR
  },
  {
    slug: 'ignore-requests-warning',
    note: 'the zipapp dependency warning alone is ignored',
    error: REQUESTS_WARNING
  },
  {
    slug: 'ignore-index-error-inside-text',
    note: 'the false-alarm message inside a longer text is still ignored',
    error: `Something went wrong\n${INDEX_ERROR}\nmore text`
  },
  {
    slug: 'ignore-requests-warning-inside-text',
    note: 'the dependency warning inside a longer text is still ignored',
    error: `/usr/lib/python3/site-packages/requests/__init__.py: ${REQUESTS_WARNING}: urllib3 mismatch`
  },
  {
    slug: 'ignore-beats-deleted-folder',
    note: 'an ignore-list message wins over the deleted-folder message: no dialog',
    error: `${DELETED} ${INDEX_ERROR}`,
    answer: 1
  },
  {
    slug: 'ignore-beats-legendary',
    note: 'an ignore-list message wins over the legendary .py rule: no modal',
    error: `${LEGENDARY_TRACE}\n${REQUESTS_WARNING}`
  },
  {
    slug: 'deleted-folder-answered-yes',
    note: 'the deleted-folder message with an app name, answered Yes: forceUninstall once',
    error: DELETED,
    appName: 'AppAlpha',
    answer: 1
  },
  {
    slug: 'deleted-folder-answered-no',
    note: 'the deleted-folder message with an app name, answered No: no forceUninstall',
    error: DELETED,
    appName: 'AppAlpha',
    answer: 0
  },
  {
    slug: 'deleted-folder-dismissed',
    note: 'the deleted-folder message dismissed: the dialog answers its cancelId 0, no forceUninstall (T-88.2-06)',
    error: DELETED,
    appName: 'AppAlpha',
    answer: 'dismiss'
  },
  {
    slug: 'deleted-folder-game-without-title',
    note: 'the deleted-folder message for a game whose info has no title: the dialog title falls back to the app name',
    error: DELETED,
    appName: 'AppAlpha',
    answer: 0,
    title: null
  },
  {
    slug: 'deleted-folder-without-app-name',
    note: 'the deleted-folder message with no app name skips the dialog and matches nothing else',
    error: DELETED,
    appName: '',
    answer: 1
  },
  {
    slug: 'deleted-folder-without-app-name-legendary',
    note: 'the deleted-folder message with no app name falls through to the legendary .py rule',
    error: `${DELETED}\n${LEGENDARY_TRACE}`,
    appName: ''
  },
  {
    slug: 'deleted-folder-beats-legendary',
    note: 'a text matching both the deleted-folder and the legendary rule asks the dialog (order of checks)',
    error: `${LEGENDARY_TRACE}\n${DELETED}`,
    appName: 'AppAlpha',
    answer: 0
  },
  {
    slug: 'legendary-py-modal',
    note: 'a legendary .py text sends the generic error modal, the error interpolated',
    error: LEGENDARY_TRACE
  },
  {
    slug: 'legendary-py-memory-error',
    note: 'the legendary .py text with MemoryError: returns with no dialog and no frontend message',
    error: MEMORY_TRACE
  },
  {
    slug: 'legendary-py-memory-error-without-space',
    note: 'MemoryError without the trailing space is not the exception: the modal is sent',
    error: `${LEGENDARY_TRACE}\nMemoryError:`
  },
  {
    slug: 'legendary-py-beats-credentials',
    note: 'a text matching both the legendary .py rule and expired credentials sends the legendary modal',
    error: `${LEGENDARY_TRACE}\n${EXPIRED}`
  },
  {
    slug: 'legendary-py-with-markup',
    note: 'an error with quotes, angle brackets and an ampersand: the interpolation escaping is recorded as is',
    error: `legendary/cli.py raised <KeyError 'a&b'> "quoted"`
  },
  {
    slug: 'expired-credentials',
    note: 'No saved credentials sends the credentials modal',
    error: EXPIRED
  },
  {
    slug: 'expired-credentials-inside-text',
    note: 'No saved credentials inside a longer text still sends the credentials modal',
    error: `[cli] ERROR: ${EXPIRED}.\nPlease log in again`
  },
  {
    slug: 'unmatched',
    note: 'a message no rule matches does nothing',
    error: 'Some unrelated failure: exit status 1'
  },
  {
    slug: 'legendary-word-without-py',
    note: 'the word legendary with no .py after it does not match the regex',
    error: 'legendary failed with exit status 2'
  },
  {
    slug: 'py-without-legendary',
    note: 'a .py with no legendary before it does not match the regex',
    error: 'Traceback in helper.py line 3'
  }
]

function errorHandlerCases(): ErrorHandlerCase[] {
  const cases: ErrorHandlerCase[] = []
  for (const runner of ERROR_RUNNERS) {
    for (const variant of VARIANTS) {
      cases.push({
        id: `error-handler-${runner}-${variant.slug}`,
        note: variant.note,
        entry: 'errorHandler',
        runner,
        appName: variant.appName ?? 'AppAlpha',
        error: variant.error,
        ...(variant.answer !== undefined && { answer: variant.answer }),
        title: variant.title === undefined ? 'Alpha Game' : variant.title
      })
    }
  }
  // Steam is not one of the store CLIs but runs the same mapping when a caller hands it a runner.
  for (const variant of [
    VARIANTS.find((v) => v.slug === 'deleted-folder-answered-yes'),
    VARIANTS.find((v) => v.slug === 'legendary-py-modal'),
    VARIANTS.find((v) => v.slug === 'expired-credentials')
  ]) {
    if (!variant) throw new Error('steam variant missing from VARIANTS')
    cases.push({
      id: `error-handler-steam-${variant.slug}`,
      note: variant.note,
      entry: 'errorHandler',
      runner: 'steam',
      appName: variant.appName ?? 'AppAlpha',
      error: variant.error,
      ...(variant.answer !== undefined && { answer: variant.answer }),
      title: 'Alpha Game'
    })
  }
  return cases
}

/** `askForceUninstall(deps, game, appName)` driven directly. */
function askForceUninstallCases(): ErrorHandlerCase[] {
  const make = (
    slug: string,
    note: string,
    answer: Answer,
    title: string | null,
    appName = 'AppAlpha'
  ): ErrorHandlerCase => ({
    id: `ask-force-uninstall-${slug}`,
    note,
    entry: 'askForceUninstall',
    runner: 'legendary',
    appName,
    error: '',
    answer,
    title
  })
  return [
    make(
      'yes',
      'answered Yes: forceUninstall once, the answer 1 returned',
      1,
      'Alpha Game'
    ),
    make(
      'no',
      'answered No: no forceUninstall, the answer 0 returned',
      0,
      'Alpha Game'
    ),
    make(
      'dismissed',
      'dismissed: the dialog answers its cancelId 0, no forceUninstall, 0 returned',
      'dismiss',
      'Alpha Game'
    ),
    make(
      'no-title-yes',
      'a game whose info has no title: the dialog title is the app name; Yes uninstalls',
      1,
      null
    ),
    make(
      'no-title-no',
      'a game whose info has no title: the dialog title is the app name; No keeps it',
      0,
      null
    ),
    make(
      'no-title-dismissed',
      'a game whose info has no title, dismissed: cancelId 0, no forceUninstall',
      'dismiss',
      null
    ),
    make(
      'empty-title',
      'a game whose info has an empty title: the empty string counts as absent, the app name is used',
      0,
      ''
    ),
    make(
      'title-with-markup',
      'a title with punctuation is passed to the dialog untouched',
      0,
      `Alpha: The "Game" & <More>`
    ),
    make(
      'empty-app-name-no-title',
      'no title and an empty app name: the dialog title is empty',
      0,
      null,
      ''
    )
  ]
}

function allCases(): ErrorHandlerCase[] {
  return [...errorHandlerCases(), ...askForceUninstallCases()]
}

/** The documented Rust-side differences (D-19); a delta no case uses is itself an error on the Rust side. */
const DELTAS: Record<string, string> = {
  'english-catalog':
    'The messages are the English strings of public/locales/en/translation.json resolved through the real i18next (box.error.folder-not-found.title, box.error.legendary.generic, box.error.credentials.message, box.no, box.yes). The Rust port resolves the same keys through its own catalog and compares in English; a missing key falls back to the default text the TS passes, which equals the English string for the three message keys and is No and Yes for the buttons.',
  'interpolation-escaping':
    'The legendary generic message interpolates the error through i18next default escaping, so the recorded message holds HTML entities where the error held quotes, angle brackets or an ampersand. The Rust port reproduces the recorded text and does not own a second escaping rule.'
}

// ---------------------------------------------------------------------------------------------
// Running one case
// ---------------------------------------------------------------------------------------------

type LookupRecord =
  | { call: 'getGame'; runner: string; appName: string }
  | { call: 'getGameInfo'; appName: string }

interface RecordedCase {
  result: unknown
}

/** Runs one case on a fresh fake HOME and returns what it recorded. */
async function recordCase(c: ErrorHandlerCase): Promise<RecordedCase> {
  return withEngineOracleProfile(async (profile) => {
    const asked: unknown[] = []
    const answered: number[] = []
    const forceUninstall: { appName: string }[] = []
    const titleLookups: LookupRecord[] = []

    const makeGame = (appName: string): Game =>
      ({
        getGameInfo: () => {
          titleLookups.push({ call: 'getGameInfo', appName })
          return c.title === null ? {} : { title: c.title }
        },
        forceUninstall: () => {
          forceUninstall.push({ appName })
          return Promise.resolve()
        }
      }) as unknown as Game

    const showMessageBox = (options: { cancelId?: number }) => {
      asked.push(options)
      const response =
        c.answer === 'dismiss' || c.answer === undefined
          ? (options.cancelId ?? 0)
          : c.answer
      answered.push(response)
      return Promise.resolve({ response })
    }

    const libraryManagers = Object.fromEntries(
      (['legendary', 'gog', 'nile', 'sideload', 'steam'] as const).map(
        (runner) => [
          runner,
          {
            getGame: (appName: string) => {
              titleLookups.push({ call: 'getGame', runner, appName })
              return makeGame(appName)
            }
          }
        ]
      )
    )

    const fake = createFakeLauncherDeps(profile, {
      overrides: {
        dialogs: { showMessageBox } as never,
        libraryManagers: libraryManagers as never
      }
    })

    let returned: unknown = null
    if (c.entry === 'errorHandler') {
      await errorHandler(
        fake.deps as unknown as ErrorHandlerDeps,
        c.error,
        c.appName,
        c.runner
      )
    } else {
      returned = await askForceUninstall(
        fake.deps,
        makeGame(c.appName),
        c.appName
      )
    }

    const frontend = fake.frontend.map((frame) => {
      const [title, message, type] = frame.args
      return { channel: frame.channel, title, message, type }
    })
    return {
      result: normalisePaths(
        {
          returned,
          asked,
          answered,
          frontend,
          forceUninstall,
          titleLookups,
          appState: fake.appState
        },
        profile
      )
    }
  })
}

const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`

describeSkipOnWindows(
  'errorHandler and askForceUninstall oracle (88.2-05)',
  () => {
    beforeAll(async () => {
      await initSidecarI18next()
    })

    const built = allCases()
    const casesFile = join(goldenDir(CRATE, SLICE), 'cases.json')
    if (mode === 'write') {
      mkdirSync(dirname(casesFile), { recursive: true })
      writeFileSync(casesFile, json(built))
      writeFileSync(join(goldenDir(CRATE, SLICE), 'deltas.json'), json(DELTAS))
    }
    const cases = loadCases<ErrorHandlerCase>(CRATE, SLICE)

    const byId = (id: string): ErrorHandlerCase => {
      const found = cases.find((c) => c.id === id)
      if (!found) throw new Error(`${id} is missing from cases.json`)
      return found
    }

    type Result = {
      returned: unknown
      asked: { cancelId?: number; title?: string; message?: string }[]
      answered: number[]
      frontend: {
        channel: string
        title: string
        message: string
        type: string
      }[]
      forceUninstall: unknown[]
      titleLookups: unknown[]
    }
    const resultOf = async (id: string): Promise<Result> =>
      (await recordCase(byId(id))).result as Result

    it('cases.json is exactly what the case builder produces', () => {
      expect(cases).toEqual(JSON.parse(JSON.stringify(built)))
    })

    it('deltas.json is exactly the documented delta table, each with a reason of its own', () => {
      const committed: unknown = JSON.parse(
        readFileSync(join(goldenDir(CRATE, SLICE), 'deltas.json'), 'utf8')
      )
      expect(committed).toEqual(DELTAS)
      for (const reason of Object.values(DELTAS)) {
        expect(reason.length).toBeGreaterThan(20)
      }
    })

    it.each(cases)('$id', async (c) => {
      const recorded = await recordCase(c)
      writeOrCompareGolden(CRATE, SLICE, c.id, { result: recorded.result })
    })

    it('every runner drives every branch variant, and the catalog is the real English one', async () => {
      for (const runner of ERROR_RUNNERS) {
        for (const variant of VARIANTS) {
          expect(
            cases.some(
              (c) => c.id === `error-handler-${runner}-${variant.slug}`
            )
          ).toBe(true)
        }
      }
      const modal = await resultOf('error-handler-gog-expired-credentials')
      expect(modal.frontend).toHaveLength(1)
      expect(modal.frontend[0]?.title).toBe('gog')
      expect(modal.frontend[0]?.message).not.toBe(
        'box.error.credentials.message'
      )
      expect(modal.frontend[0]?.type).toBe('ERROR')
    })

    it('the deleted-folder cases record cancelId 0 and a forceUninstall call only for the Yes answer', async () => {
      for (const runner of ERROR_RUNNERS) {
        const yes = await resultOf(
          `error-handler-${runner}-deleted-folder-answered-yes`
        )
        const no = await resultOf(
          `error-handler-${runner}-deleted-folder-answered-no`
        )
        const dismissed = await resultOf(
          `error-handler-${runner}-deleted-folder-dismissed`
        )
        for (const r of [yes, no, dismissed]) {
          expect(r.asked).toHaveLength(1)
          expect(r.asked[0]?.cancelId).toBe(0)
          expect(r.frontend).toEqual([])
        }
        expect(yes.forceUninstall).toHaveLength(1)
        expect(no.forceUninstall).toEqual([])
        expect(dismissed.forceUninstall).toEqual([])
        expect(dismissed.answered).toEqual([0])
      }
    })

    it('a dismissed askForceUninstall returns 0 and never uninstalls, with or without a title', async () => {
      for (const id of [
        'ask-force-uninstall-dismissed',
        'ask-force-uninstall-no-title-dismissed'
      ]) {
        const r = await resultOf(id)
        expect(r.returned).toBe(0)
        expect(r.forceUninstall).toEqual([])
      }
    })

    it('a game with no title gets the app name as its dialog title', async () => {
      const r = await resultOf('ask-force-uninstall-no-title-no')
      expect(r.asked[0]?.title).toBe('AppAlpha')
      const emptyTitle = await resultOf('ask-force-uninstall-empty-title')
      expect(emptyTitle.asked[0]?.title).toBe('AppAlpha')
    })

    it('the legendary MemoryError case records no dialog and no frontend message', async () => {
      for (const runner of ERROR_RUNNERS) {
        const r = await resultOf(
          `error-handler-${runner}-legendary-py-memory-error`
        )
        expect(r.asked).toEqual([])
        expect(r.frontend).toEqual([])
        expect(r.forceUninstall).toEqual([])
      }
    })

    it('the legendary modal is titled for the runner and carries the error', async () => {
      const legendary = await resultOf(
        'error-handler-legendary-legendary-py-modal'
      )
      expect(legendary.frontend[0]?.title).toBe('Legendary (Epic Games)')
      expect(legendary.frontend[0]?.message).toContain('ValueError')
      const nile = await resultOf('error-handler-nile-legendary-py-modal')
      expect(nile.frontend[0]?.title).toBe('nile')
    })

    it('an ignored, empty or unmatched message does nothing at all', async () => {
      for (const runner of ERROR_RUNNERS) {
        for (const slug of [
          'empty-error',
          'ignore-index-error',
          'ignore-requests-warning',
          'ignore-beats-deleted-folder',
          'ignore-beats-legendary',
          'unmatched'
        ]) {
          const r = await resultOf(`error-handler-${runner}-${slug}`)
          expect(r.asked).toEqual([])
          expect(r.frontend).toEqual([])
          expect(r.forceUninstall).toEqual([])
          expect(r.titleLookups).toEqual([])
        }
      }
    })

    it('the committed MANIFEST agrees with the case list and holds one folder per case', () => {
      syncManifest(CRATE, SLICE, cases, ERROR_HANDLER_FLOOR)
      assertManifest(CRATE, SLICE, cases, ERROR_HANDLER_FLOOR)
    })

    it('an empty case list fails the manifest check', () => {
      expectEmptyCasesToFail(CRATE, SLICE, ERROR_HANDLER_FLOOR)
    })
  }
)
