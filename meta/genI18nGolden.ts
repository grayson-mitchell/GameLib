/**
 * Phase 80 plan 03 (D-03, RESEARCH Pitfall 2): renders every Steam-poll notification through the
 * REAL i18next, configured exactly as the sidecar configures it, and writes the strings to
 * `src-tauri/crates/gamelib-i18n/tests/fixtures/rendered.json`. The Rust `gamelib-i18n` crate's
 * test asserts it renders identically, so the two stacks cannot drift.
 *
 * Run: node meta/runTs.cjs --bundle --platform=node --target=node22 meta/genI18nGolden.ts
 *
 * The init options below are copied from `src/backend/sidecar/bootstrap.ts` lines 2634-2690
 * (`state.i18nReady = i18next.use(Backend).init({...})`): fs backend with a function `loadPath`
 * over `localeFileSegments`, `returnEmptyString/returnNull: false`, `fallbackLng: 'en'`,
 * `i18nextLanguageOptions(language)`, `ns: ['translation','gamelib']`, `defaultNS: 'translation'`.
 * The init sets NO `interpolation` option, so i18next's default `escapeValue: true` applies:
 * interpolated values are HTML-escaped (`&` becomes `&amp;`). Rust must reproduce that.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createInstance } from 'i18next'
import Backend from 'i18next-fs-backend/cjs'
import {
  i18nextLanguageOptions,
  localeFileSegments,
  supportedLanguages
} from '../src/common/languages'

export interface GoldenRow {
  language: string
  key: string
  default: string
  params: Record<string, string | number>
  rendered: string
}

interface Case {
  key: string
  default: string
  params: Record<string, string | number>
}

// cwd, not __dirname: the bundle runs from a private temp dir (meta/runTs.cjs). Run from the repo root.
const REPO_ROOT = process.cwd()
const LOCALES_DIR = join(REPO_ROOT, 'public', 'locales')
export const GOLDEN_PATH = join(
  REPO_ROOT,
  'src-tauri',
  'crates',
  'gamelib-i18n',
  'tests',
  'fixtures',
  'rendered.json'
)

/** Every notification the Steam polls send (80-01-SUMMARY effect inventory). */
const POLL_CASES: Case[] = [
  {
    key: 'steam.waitingForSteam.notify',
    default: 'Restart Steam to finish installing {{game}}',
    params: { game: 'Test Game' }
  },
  {
    key: 'notify.install.finished',
    default: 'Installation Finished',
    params: {}
  },
  {
    key: 'steam.download.notify.depotSkipped',
    default:
      "Installed without depot {{depots}}. Steam wouldn't release its key for this account, so that content was skipped — the game should still run.",
    params: { depots: '2001, 2002' }
  },
  {
    key: 'gamelib:steam.uninstall.copySurvives',
    default:
      'Removed the {{removed}} copy. A {{survivor}} copy is still installed — use Remove all copies… to remove it too.',
    params: { removed: 'Mac Steam', survivor: 'Steam bridge' }
  },
  {
    key: 'notify.uninstalled',
    default: 'Game Uninstalled',
    params: {}
  },
  {
    key: 'gamelib:steam.resumeAvailable.notify',
    default:
      'An interrupted install for {{game}} is ready to resume — click Install to continue',
    params: { game: 'Test Game' }
  }
]

/** Edge cases beyond the poll keys; run for every language too. */
const EDGE_CASES: Case[] = [
  // Characters escapeValue touches (T-80-06).
  {
    key: 'steam.waitingForSteam.notify',
    default: 'Restart Steam to finish installing {{game}}',
    params: { game: `Tom & Jerry's <b>"Cheese"</b>` }
  },
  // Missing from every locale: inline default, interpolated.
  {
    key: 'steam.noSuchKey.anywhere',
    default: 'Inline fallback for {{game}}',
    params: { game: 'Test Game' }
  },
  // Same, in an explicit namespace.
  {
    key: 'gamelib:steam.noSuchKey.anywhere',
    default: 'Inline gamelib fallback',
    params: {}
  },
  // Param the default names but the call does not supply.
  {
    key: 'steam.noSuchKey.unknownParam',
    default: 'Hello {{who}} and {{ spaced }}',
    params: { spaced: 'S' }
  },
  // Numeric param.
  {
    key: 'steam.noSuchKey.numeric',
    default: 'Count {{n}}',
    params: { n: 3 }
  }
]

/** Language settings beyond the shipped set: not shipped, hyphen variant, empty. */
const EXTRA_LANGUAGES = ['xx', 'nb-NO', 'pt-BR', 'zh-Hans', '']

async function instanceFor(language: string) {
  const i18n = createInstance()
  await i18n.use(Backend).init({
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
    ...i18nextLanguageOptions(language),
    ns: ['translation', 'gamelib'],
    defaultNS: 'translation'
  })
  return i18n
}

export async function generate(): Promise<GoldenRow[]> {
  const rows: GoldenRow[] = []
  const languages = [...supportedLanguages, ...EXTRA_LANGUAGES]
  for (const language of languages) {
    const i18n = await instanceFor(language)
    for (const c of [...POLL_CASES, ...EDGE_CASES]) {
      rows.push({
        language,
        key: c.key,
        default: c.default,
        params: c.params,
        rendered: i18n.t(c.key, c.default, c.params)
      })
    }
  }
  return rows.sort(
    (a, b) =>
      a.language.localeCompare(b.language) ||
      a.key.localeCompare(b.key) ||
      JSON.stringify(a.params).localeCompare(JSON.stringify(b.params))
  )
}

export function serialize(rows: GoldenRow[]): string {
  return JSON.stringify(rows, null, 2) + '\n'
}

export function readCommitted(): string {
  return readFileSync(GOLDEN_PATH, 'utf8')
}

if (require.main === module) {
  generate()
    .then((rows) => {
      writeFileSync(GOLDEN_PATH, serialize(rows))
      console.log(`wrote ${rows.length} rows to ${GOLDEN_PATH}`)
    })
    .catch((error) => {
      console.error(error)
      process.exit(1)
    })
}
