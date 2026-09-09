/**
 * Rebrand product self-references in the upstream-owned non-English catalogs.
 *
 * run with `pnpm rebrand-catalogs` (check, exits 1 on residue)
 *          `pnpm rebrand-catalogs --apply` (rewrite the catalogs)
 *
 * ## Why this exists
 *
 * The fork rebranded `public/locales/en/` and never touched the translations, so
 * every non-English catalog called the product "Heroic". Each upstream i18n
 * refresh re-imports upstream branding wholesale, so a one-shot find-and-replace
 * would rot on the next pull. This module is the re-runnable form.
 *
 * ## The partition (D-1)
 *
 * A key is a PRODUCT SELF-REFERENCE, and therefore renameable, iff it exists in
 * the English catalog and its English value does NOT contain "Heroic".
 *
 * That single rule covers both shapes measured in the tree:
 *   - English says "GameLib"  -> plainly a self-reference (50 keys, 1794 hits)
 *   - English names no product at all, but translators injected one anyway
 *     (17 keys, 23 hits) -- e.g. `tray.about` is "About" in English and
 *     "Ueber Heroic" in German. A rule keyed on "English says GameLib" is
 *     structurally blind to these.
 *
 * Two exclusions, both load-bearing:
 *   - English value CONTAINS "Heroic" -> a deliberate reference to upstream
 *     (attribution, a github.com/Heroic-Games-Launcher URL, migration copy
 *     about an existing Heroic install). Renaming these would state something
 *     false, or break a link, in 46 languages at once.
 *   - Key ABSENT from English -> unclassifiable, and in practice orphaned
 *     upstream residue that no longer renders. We cannot know whether it is a
 *     self-reference, so we leave it alone rather than guess.
 *
 * The exclusion is what keeps URLs safe: the only catalog string carrying a
 * `github.com/Heroic-Games-Launcher/...` URL is `box.error.ubisoft-connect.message`,
 * which is absent from English and therefore never in the rename set.
 *
 * ## Inflection (D-2)
 *
 * A bare Heroic->GameLib token swap is correct in most languages but wrong in
 * five, so those carry explicit overrides applied BEFORE the generic swap:
 *   - ca/fr  the article elides before a vowel ("l'Heroic", "d'Heroic"); GameLib
 *            begins with a consonant, so the elision must be undone entirely.
 *   - et     the stem vowel differs: Heroicu- -> GameLibi- across six cases.
 *   - hu     vowel harmony flips from back to front on an -i final stem.
 *   - sv     brand compounds read better hyphenated.
 * Finnish, Czech, Croatian, Bosnian and the Scandinavian genitive -s are all
 * CORRECT under the plain swap and deliberately have no override.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

export const UPSTREAM_NAMESPACES = ['translation', 'gamepage', 'login'] as const
export const OLD_NAME = 'Heroic'
export const NEW_NAME = 'GameLib'

/** Straight and typographic apostrophes both occur in these catalogs. */
const APOS = "['’`´]"

/**
 * Locale-specific rewrites applied BEFORE the generic token swap. Each entry is
 * [pattern, replacement]; order matters within a locale (longest context first).
 */
export const INFLECTION_RULES: Record<string, [RegExp, string][]> = {
  // Catalan: "de l'Heroic" -> "del GameLib", "a l'Heroic" -> "al GameLib",
  // bare "l'Heroic" -> "el GameLib". The elided article cannot survive a
  // consonant-initial name.
  ca: [
    [new RegExp(`\\bde l${APOS}${OLD_NAME}`, 'g'), `del ${NEW_NAME}`],
    [new RegExp(`\\bDe l${APOS}${OLD_NAME}`, 'g'), `Del ${NEW_NAME}`],
    [new RegExp(`\\ba l${APOS}${OLD_NAME}`, 'g'), `al ${NEW_NAME}`],
    [new RegExp(`\\bA l${APOS}${OLD_NAME}`, 'g'), `Al ${NEW_NAME}`],
    [new RegExp(`\\bl${APOS}${OLD_NAME}`, 'g'), `el ${NEW_NAME}`],
    [new RegExp(`\\bL${APOS}${OLD_NAME}`, 'g'), `El ${NEW_NAME}`]
  ],
  // French: d'/qu'/puisqu'/lorsqu' all elide before a vowel.
  fr: [
    [new RegExp(`\\bpuisqu${APOS}${OLD_NAME}`, 'g'), `puisque ${NEW_NAME}`],
    [new RegExp(`\\bPuisqu${APOS}${OLD_NAME}`, 'g'), `Puisque ${NEW_NAME}`],
    [new RegExp(`\\blorsqu${APOS}${OLD_NAME}`, 'g'), `lorsque ${NEW_NAME}`],
    [new RegExp(`\\bqu${APOS}${OLD_NAME}`, 'g'), `que ${NEW_NAME}`],
    [new RegExp(`\\bQu${APOS}${OLD_NAME}`, 'g'), `Que ${NEW_NAME}`],
    [new RegExp(`\\bd${APOS}${OLD_NAME}`, 'g'), `de ${NEW_NAME}`],
    [new RegExp(`\\bD${APOS}${OLD_NAME}`, 'g'), `De ${NEW_NAME}`]
  ],
  // Estonian: the oblique stem is Heroicu-, but GameLib takes -i-
  // (genitive GameLibi, illative GameLibisse, adessive GameLibil, ...).
  et: [[new RegExp(`${OLD_NAME}u`, 'g'), `${NEW_NAME}i`]],
  // Hungarian: Heroic took BACK harmony; GameLib ends in a front -i stem and
  // takes FRONT suffixes. NOTE: applied on linguistic reasoning, not verified
  // by a native speaker -- see the task SUMMARY.
  hu: [
    [new RegExp(`${OLD_NAME}ot\\b`, 'g'), `${NEW_NAME}et`],
    [new RegExp(`${OLD_NAME}ban\\b`, 'g'), `${NEW_NAME}ben`],
    [new RegExp(`${OLD_NAME}ba\\b`, 'g'), `${NEW_NAME}be`],
    [new RegExp(`${OLD_NAME}hoz\\b`, 'g'), `${NEW_NAME}hez`],
    [new RegExp(`${OLD_NAME}nak\\b`, 'g'), `${NEW_NAME}nek`]
  ],
  // Swedish: hyphenate brand compounds, matching de/fi/nb_NO's own house style.
  sv: [
    [new RegExp(`${OLD_NAME}(konfiguration|version)`, 'g'), `${NEW_NAME}-$1`]
  ]
}

export interface FlatEntry {
  key: string
  value: string
}

/** Depth-first flatten of a nested catalog into dotted keys. */
export function flatten(obj: unknown, prefix = ''): FlatEntry[] {
  const out: FlatEntry[] = []
  if (typeof obj === 'string') {
    if (prefix) out.push({ key: prefix, value: obj })
    return out
  }
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      out.push(...flatten(v, prefix ? `${prefix}.${k}` : k))
    }
  }
  return out
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf-8'))
}

/**
 * The set of `namespace:key` identifiers eligible for rebranding, derived from
 * the ENGLISH catalogs alone. See the partition note at the top of this file.
 */
export function deriveRenameSet(localesDir: string): Set<string> {
  const renameable = new Set<string>()
  for (const ns of UPSTREAM_NAMESPACES) {
    const enPath = join(localesDir, 'en', `${ns}.json`)
    if (!existsSync(enPath)) continue
    for (const { key, value } of flatten(readJson(enPath))) {
      if (!value.includes(OLD_NAME)) renameable.add(`${ns}:${key}`)
    }
  }
  return renameable
}

/** Apply the locale's inflection overrides, then the generic token swap. */
export function rebrandValue(text: string, locale: string): string {
  let out = text
  for (const [pattern, replacement] of INFLECTION_RULES[locale] ?? []) {
    out = out.replace(pattern, replacement)
  }
  return out.split(OLD_NAME).join(NEW_NAME)
}

export interface Residue {
  locale: string
  namespace: string
  key: string
  value: string
}

export function listLocales(localesDir: string): string[] {
  return readdirSync(localesDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== 'en')
    .map((d) => d.name)
    .sort()
}

/**
 * Every (locale, key) in the rename set whose translation still names the old
 * product. Empty is the passing state; this is what the gate asserts.
 */
export function scanResidue(localesDir: string): Residue[] {
  const renameable = deriveRenameSet(localesDir)
  const found: Residue[] = []
  for (const locale of listLocales(localesDir)) {
    for (const ns of UPSTREAM_NAMESPACES) {
      const path = join(localesDir, locale, `${ns}.json`)
      if (!existsSync(path)) continue
      for (const { key, value } of flatten(readJson(path))) {
        if (!renameable.has(`${ns}:${key}`)) continue
        if (value.includes(OLD_NAME)) {
          found.push({ locale, namespace: ns, key, value })
        }
      }
    }
  }
  return found
}

/** Rewrite the catalogs in place. Returns the number of strings changed. */
export function applyRebrand(localesDir: string): number {
  const renameable = deriveRenameSet(localesDir)
  let changed = 0
  for (const locale of listLocales(localesDir)) {
    for (const ns of UPSTREAM_NAMESPACES) {
      const path = join(localesDir, locale, `${ns}.json`)
      if (!existsSync(path)) continue
      const original = readFileSync(path, 'utf-8')
      const data = JSON.parse(original) as Record<string, unknown>

      const walk = (node: unknown, prefix: string): unknown => {
        if (typeof node === 'string') {
          if (!renameable.has(`${ns}:${prefix}`) || !node.includes(OLD_NAME)) {
            return node
          }
          const next = rebrandValue(node, locale)
          if (next !== node) changed += 1
          return next
        }
        if (node && typeof node === 'object' && !Array.isArray(node)) {
          const obj = node as Record<string, unknown>
          for (const k of Object.keys(obj)) {
            obj[k] = walk(obj[k], prefix ? `${prefix}.${k}` : k)
          }
        }
        return node
      }
      walk(data, '')

      const updated = `${JSON.stringify(data, null, 4)}\n`
      if (updated !== original) writeFileSync(path, updated, 'utf-8')
    }
  }
  return changed
}

function runCli(): void {
  const localesDir = join(process.cwd(), 'public', 'locales')
  const apply = process.argv.includes('--apply')

  if (apply) {
    const changed = applyRebrand(localesDir)
    console.log(`rebrand-catalogs: rewrote ${changed} string(s).`)
    return
  }

  const residue = scanResidue(localesDir)
  if (residue.length > 0) {
    console.error(
      `::error::rebrand-catalogs: ${residue.length} translated string(s) still ` +
        `name "${OLD_NAME}" for a key whose English value does not. Run ` +
        '`pnpm rebrand-catalogs --apply`. Offenders:'
    )
    for (const r of residue.slice(0, 20)) {
      console.error(`  ${r.locale} ${r.namespace}:${r.key}`)
    }
    if (residue.length > 20) {
      console.error(`  ... and ${residue.length - 20} more`)
    }
    process.exit(1)
    return
  }
  console.log('rebrand-catalogs: clean -- no stale product self-references.')
}

// Run via `node meta/runTs.cjs`, which sets `require.main` -- but this module is
// also imported directly by its jest suite, so guard on the jest env var rather
// than the usual `require.main === module` idiom.
if (!process.env.JEST_WORKER_ID) {
  runCli()
}
