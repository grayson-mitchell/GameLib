import type { WinetricksComponent } from 'common/types'

// Pure, dependency-free line parser for `winetricks list-all` stdout
// (quick-260915-ajd). Imports nothing but the type -- no electron, no
// logger, no fs -- so the Backend jest project can load it in isolation
// without dragging in the storeManagers graph.

// `winetricks_list_all` sources each category's metadata files in turn and
// echoes a `===== <category> =====` header before each block. The `prefix`
// block is a trap (F-6): `winetricks_list_all` early-returns for
// `prefix|main|mkprefix` and instead echoes the category name list
// (`apps`, `dlls`, `fonts`, `settings`, ...) one per line -- those are NOT
// verbs, but they are lowercase words that pass the verb shape test below.
// It must be skipped as a whole block, not filtered by shape.
const HEADER_RE = /^===== (\S+) =====$/
const PREFIX_CATEGORY = 'prefix'

// Split off the first whitespace-delimited token and require a non-empty
// remainder -- a real metadata line always has a title after the verb
// column, so a bare single-token line (nothing else on it) is rejected
// here rather than by the shape test below.
const FIRST_TOKEN_RE = /^(\S+)\s+(\S.*)$/

// Positive verb-shape match (F-10, F-11). Census over all 567 winetricks
// verbs (`grep -oE '^w_metadata [^ ]+' <script> | awk '{print $2}' | sort -u`,
// then a per-character sort) found the complete charset used is exactly
// `[a-z0-9_=]` -- no uppercase, no `.`, no `-`, no `+`, no `:`. Requiring the
// FIRST character to be alphanumeric-or-underscore (not `=`) means the
// `=====` header delimiter -- itself built from a legal verb character --
// cannot slip through this check even if header matching above ever
// regresses. This is also what rejects macOS's stdout-noise
// `warning: taskset/cpuset not available on your platform!` line (F-10): the
// trailing `:` on `warning:` fails the charset.
//
// Do not "helpfully" widen this to `\S+` -- that is exactly the class of bug
// this test guards against.
const VERB_SHAPE_RE = /^[a-z0-9_][a-z0-9_=]*$/

// Trailing bracketed flags group, e.g. `[downloadable,cached]`. End-anchored
// over a negated character class (not `.*`) to keep matching linear in line
// length -- no nested quantifiers, per the threat model's DoS mitigation
// (T-ajd-01).
const FLAGS_RE = /\s*\[([^[\]]*)]$/

export function parseWinetricksListAll(
  chunks: string[]
): WinetricksComponent[] {
  const lines = chunks.join('').split(/\r?\n/)

  const seen = new Set<string>()
  const components: WinetricksComponent[] = []

  let currentCategory: string | null = null

  for (const rawLine of lines) {
    // Header check MUST run before the verb shape test (F-11's ordering
    // trap): `=====` is built entirely from `=`, which is itself a legal
    // verb character, so a naive shape-only pass could otherwise treat a
    // header line as a candidate verb line.
    const headerMatch = HEADER_RE.exec(rawLine)
    if (headerMatch) {
      currentCategory = headerMatch[1]
      continue
    }

    if (currentCategory === null || currentCategory === PREFIX_CATEGORY) {
      continue
    }

    const tokenMatch = FIRST_TOKEN_RE.exec(rawLine)
    if (!tokenMatch) {
      continue
    }

    const verb = tokenMatch[1]
    let remainder = tokenMatch[2]

    if (!VERB_SHAPE_RE.test(verb)) {
      continue
    }

    let cached = false
    const flagsMatch = FLAGS_RE.exec(remainder)
    if (flagsMatch) {
      remainder = remainder.slice(0, flagsMatch.index)
      const flags = flagsMatch[1]
        .split(',')
        .map((flag) => flag.trim())
        .filter(Boolean)
      cached = flags.some((flag) => flag === 'cached')
    }

    const title = remainder.trim()

    if (seen.has(verb)) {
      continue
    }
    seen.add(verb)

    components.push({
      verb,
      title,
      category: currentCategory,
      cached
    })
  }

  return components
}
