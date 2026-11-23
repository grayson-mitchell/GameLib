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
  /** Present only when `false`: the row is one the TS renders with `escapeValue: false`. */
  escapeValue?: false
  rendered: string
}

interface Case {
  key: string
  default: string
  params: Record<string, string | number>
  /** `false` where the TS passes `interpolation: { escapeValue: false }` (a dialog message). */
  escapeValue?: boolean
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

/** A name that carries every character `escapeValue` touches, to prove the escaping per row. */
const HOSTILE = `Tom & Jerry's <b>"Cheese"</b> / Co`

/**
 * The Humble expiry digest and the shortcut and Steam-shortcut strings the Rust shell renders
 * (94-09, Pitfall 8 and 11). The defaults and params are the ones the TS call sites pass
 * (`humble/expirationAlerts.ts`, `sidecar/shortcutsFlowRegistration.ts`,
 * `shortcuts/nonesteamgame/nonesteamgame.ts`). `showErrorInFrontend`'s dialog message is the one
 * the TS renders unescaped, so its row carries `escapeValue: false` and Rust replays it through
 * `Catalog::t_unescaped`; every other row goes through `Catalog::t`.
 *
 * `count` rows: the sidecar's `en` catalog holds `expiringBodyPlural`, `_one` and `_other` with the
 * same text, which is why Rust's base-key lookup agrees with i18next's plural resolution here (the
 * crate does not port plural suffixes; this golden fails if the three ever diverge).
 */
const HUMBLE_SHORTCUT_CASES: Case[] = [
  // The expiry digest (count 1 is the single copy, the plural copy runs for 2 and more).
  {
    key: 'humble.notification.expiringTitleSingle',
    default: 'Humble key expiring',
    params: {}
  },
  {
    key: 'humble.notification.expiringTitlePlural',
    default: 'Humble keys expiring',
    params: {}
  },
  {
    key: 'humble.notification.expiringBodySingle',
    default: "{{title}}'s Humble key now expires on {{date}}",
    params: { title: 'Fake Game One', date: '1/2/2027' }
  },
  {
    key: 'humble.notification.expiringBodySingle',
    default: "{{title}}'s Humble key now expires on {{date}}",
    params: { title: HOSTILE, date: '12/31/2027' }
  },
  {
    key: 'humble.notification.expiringBodyPlural',
    default: '{{count}} Humble keys gained expiration dates',
    params: { count: 1 }
  },
  {
    key: 'humble.notification.expiringBodyPlural',
    default: '{{count}} Humble keys gained expiration dates',
    params: { count: 2 }
  },
  {
    key: 'humble.notification.expiringBodyPlural',
    default: '{{count}} Humble keys gained expiration dates',
    params: { count: 5 }
  },
  // The shortcut toasts (`box.shortcuts.*`, `shortcutsFlowRegistration.ts`).
  { key: 'box.shortcuts.title', default: 'Shortcuts', params: {} },
  {
    key: 'box.shortcuts.error',
    default: 'Shortcuts could not be created. See the log for details.',
    params: {}
  },
  {
    key: 'box.shortcuts.error-remove',
    default: 'Shortcuts could not be removed. See the log for details.',
    params: {}
  },
  {
    key: 'box.shortcuts.message',
    default: 'Shortcuts were created on Desktop and Start Menu',
    params: {}
  },
  {
    key: 'box.shortcuts.message-mac',
    default: 'Shortcuts were created on the Applications folder',
    params: {}
  },
  {
    key: 'gamelib:box.shortcuts.messageMacDesktop',
    default:
      'Shortcuts were created in the Applications folder and on the Desktop',
    params: {}
  },
  {
    key: 'box.shortcuts.message-remove',
    default: 'Shortcuts were removed from Desktop and Start Menu',
    params: {}
  },
  {
    key: 'box.shortcuts.message-remove-mac',
    default: 'Shortcuts were removed from the Applications folder',
    params: {}
  },
  {
    key: 'gamelib:box.shortcuts.messageRemoveMacDesktop',
    default:
      'Shortcuts were removed from the Applications folder and the Desktop',
    params: {}
  },
  // The Steam shortcut notifications (`nonesteamgame.ts`), escaped like the TS renders them.
  {
    key: 'notify.finished.add.steam.title',
    default: 'Added to Steam',
    params: {}
  },
  {
    key: 'notify.finished.remove.steam.title',
    default: 'Removed from Steam',
    params: {}
  },
  {
    key: 'notify.finished.add.steam.success',
    default:
      '{{game}} was successfully added to Steam. A restart of Steam is required for changes to take effect.',
    params: { game: 'Fake Game One' }
  },
  {
    key: 'notify.finished.add.steam.success',
    default:
      '{{game}} was successfully added to Steam. A restart of Steam is required for changes to take effect.',
    params: { game: HOSTILE }
  },
  {
    key: 'notify.finished.add.steam.corrupt',
    default:
      '{{game}} could not be added to all found Steam users. See logs for more info. A restart of Steam is required for changes to take effect.',
    params: { game: HOSTILE }
  },
  {
    key: 'notify.finished.remove.steam.success',
    default:
      '{{game}} was successfully removed from Steam. A restart of Steam is required for changes to take effect.',
    params: { game: HOSTILE }
  },
  {
    key: 'notify.finished.remove.steam.corrupt',
    default:
      '{{game}} could not be removed from all found Steam users. See logs for more info. A restart of Steam is required for changes to take effect.',
    params: { game: HOSTILE }
  },
  // The add-to-Steam error dialog: the title is escaped, the message is rendered unescaped.
  {
    key: 'box.error.add.steam.title',
    default: 'Error Adding Game to Steam',
    params: {}
  },
  {
    key: 'box.error.add.steam.body',
    default: 'Adding {{game}} to Steam failed with:{{newLine}} {{error}}',
    params: { game: 'Fake Game One', newLine: '\n', error: 'plain failure' }
  },
  {
    key: 'box.error.add.steam.body',
    default: 'Adding {{game}} to Steam failed with:{{newLine}} {{error}}',
    params: {
      game: HOSTILE,
      newLine: '\n',
      error: `EACCES: <path> "x" & 'y' /z`
    },
    escapeValue: false
  },
  // The same message escaped, to show the flag changes the render and nothing else does.
  {
    key: 'box.error.add.steam.body',
    default: 'Adding {{game}} to Steam failed with:{{newLine}} {{error}}',
    params: {
      game: HOSTILE,
      newLine: '\n',
      error: `EACCES: <path> "x" & 'y' /z`
    }
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
    for (const c of [...POLL_CASES, ...EDGE_CASES, ...HUMBLE_SHORTCUT_CASES]) {
      const unescaped = c.escapeValue === false
      rows.push({
        language,
        key: c.key,
        default: c.default,
        params: c.params,
        ...(unescaped ? { escapeValue: false as const } : {}),
        // An unescaped row is rendered the way its TS call site does: an options object carrying
        // `interpolation: { escapeValue: false }`.
        rendered: unescaped
          ? i18n.t(c.key, {
              defaultValue: c.default,
              ...c.params,
              interpolation: { escapeValue: false }
            })
          : i18n.t(c.key, c.default, c.params)
      })
    }
  }
  return rows.sort(
    (a, b) =>
      a.language.localeCompare(b.language) ||
      a.key.localeCompare(b.key) ||
      JSON.stringify(a.params).localeCompare(JSON.stringify(b.params)) ||
      Number(a.escapeValue === false) - Number(b.escapeValue === false)
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
