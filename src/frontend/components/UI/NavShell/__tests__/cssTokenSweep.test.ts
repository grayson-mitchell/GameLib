/**
 * Source-text gate holding the undefined-CSS-custom-property count at 0
 * (quick task `260912-it4`, closing the todo
 * `.planning/todos/pending/2026-09-12-39-references-to-23-css-custom-properties-declared-nowhere.md`).
 *
 * WHAT THIS PROVES, AND WHAT IT CANNOT. Like `themeTokens.test.ts` next to
 * it, this is a SOURCE-TEXT gate, not a render test: the Frontend jest
 * project runs `testEnvironment: 'node'` (see `src/frontend/jest.config.js`,
 * which explains at length why there is no jsdom in this repo), so there is
 * no CSS engine here. This can prove that every `var(--x)` in a stylesheet
 * names something the source declares somewhere. It can NEVER prove that
 * anything renders.
 *
 * WHY IT EXISTS. `var(--undefined)` is "invalid at computed-value time": in a
 * longhand the declaration silently degrades to `inherit`/`unset`, and in a
 * `font:` shorthand it resets family, size, weight, style AND line-height
 * together. Nothing else in this repo catches any of it -- `pnpm lint` is
 * eslint over `.ts`/`.tsx` only, there is no stylelint, and no test parses
 * CSS. The sweep that produced the originating todo found 39 references
 * across 23 names, including a search bar with no `:focus-within` ring on 10
 * of 11 themes and four `font:` shorthands that had never applied at all.
 *
 * COMMENT STRIPPING IS LOAD-BEARING, NOT HYGIENE. Two of the sweep's findings
 * were decided by it, in OPPOSITE directions:
 *
 *   1. A false positive. `PathSelectionBox/index.css:9` contains the prose
 *      "every colour is a `var(--token, fallback)`" inside that file's
 *      opening block comment. Unstripped, `--token` counts as a 23rd
 *      undefined name. It is not a reference at all.
 *   2. A false NEGATIVE, which is the dangerous direction.
 *      `SteamLogin/index.scss:86` carries a `//` comment whose text is
 *      literally `grep -rn -- "--text-primary:" src/frontend` -- a faithful
 *      record of that token being dead. Unstripped, that comment matches the
 *      DECLARATION regex, so the sweep believed `--text-primary` WAS declared
 *      and hid five real undefined references (PopoverComponent, WineItem,
 *      and three in WineManager) behind the very prose that documented them.
 *      This is the repo's recorded "prose satisfies the gate that names it"
 *      failure mode, caught here by measurement.
 *
 * So both the declaration scan and the reference scan run over
 * `stripSourceComments` output. Do not "optimise" either back to raw text.
 *
 * TWO KNOWN BLIND SPOTS, stated rather than implied:
 *
 *   A. TRAILING line comments survive. `stripSourceComments` deliberately
 *      strips `/* *\/` blocks first and then drops only WHOLE lines that
 *      themselves begin with `//`, `*` or `/*` -- it does not run a naive
 *      `/\/\/.*$/` pass, because that truncates a code line containing
 *      `url(https://...)` (the WR-08 regression class its own header
 *      documents). A trailing `// note` appended to a code line therefore
 *      survives, so a `var(--x)` or `--x:` inside one is still counted. The
 *      fix if that ever bites is to layer `stripTrailingLineCommentTs` on
 *      top -- do NOT hand-roll a stripper here.
 *   B. This gate checks NAMES, not SCOPES. A declaration found ANYWHERE in
 *      ANY file counts as declared, so a token declared under one narrow
 *      selector reads as universally available. `--search-bar-border` is the
 *      worked example: it is declared exactly once, at `themes.scss:58`
 *      inside `body.midnightMirage`, and on the other 10 themes it resolves
 *      to nothing. This gate would not have caught that, and did not; the
 *      `260912-it4` sweep found it only via the misspelled fallback arm
 *      sitting behind it. A scope-aware sweep is a different, harder gate.
 */
import { execFileSync } from 'child_process'
import { readFileSync } from 'fs'
import { join } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'

const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..', '..')

const read = (relPath: string) =>
  stripSourceComments(readFileSync(join(REPO_ROOT, relPath), 'utf8'))

/**
 * Git-tracked files only, matching the census script this gate was derived
 * from (`.planning/quick/260912-it4-.../sweep-census.py`). Using `git
 * ls-files` rather than a filesystem walk keeps build output, `node_modules`
 * and untracked scratch files out of the population by construction.
 */
const tracked = (): string[] =>
  execFileSync('git', ['ls-files', 'src/*', 'public/*'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024
  })
    .split('\n')
    .filter(Boolean)

const ext = (f: string) => f.slice(f.lastIndexOf('.') + 1)

/** Anywhere a custom property can be DECLARED, including runtime JS/TSX. */
const DECL_EXTENSIONS = ['css', 'scss', 'ts', 'tsx', 'js', 'html']
/** Only stylesheets can carry a `var()` REFERENCE this gate cares about. */
const REF_EXTENSIONS = ['css', 'scss']

const DECLARATION = /(--[A-Za-z0-9_-]+)\s*:/g
/** `element.style.setProperty('--x', …)` -- e.g. GlobalState's theme apply. */
const SET_PROPERTY = /setProperty\(\s*['"`](--[A-Za-z0-9_-]+)/g
const REFERENCE = /var\(\s*(--[A-Za-z0-9_-]+)/g

/**
 * Names that are legitimately referenced without being declared anywhere.
 *
 * EVERY entry needs a reason, and the rot check below makes a stale entry
 * turn this suite RED rather than quietly pass. That direction matters: the
 * failure mode this project has actually recorded (see `themeTokens.test.ts`,
 * whose own CR-01 originating site escaped the guard built in its aftermath
 * and survived a green suite for 14 days) is a guard that stops measuring
 * without stopping passing.
 */
const ALLOWLIST: readonly string[] = []

const declaredNames = (): Set<string> => {
  const declared = new Set<string>()
  for (const file of tracked().filter((f) =>
    DECL_EXTENSIONS.includes(ext(f))
  )) {
    const source = read(file)
    for (const [, name] of source.matchAll(DECLARATION)) declared.add(name)
    for (const [, name] of source.matchAll(SET_PROPERTY)) declared.add(name)
  }
  return declared
}

/**
 * Undefined references, as `name -> ["file:line", …]`.
 *
 * The stripped text is authoritative for WHETHER a name is referenced. The
 * reported line numbers are then looked up in the ORIGINAL file, because
 * `stripSourceComments` removes block comments without preserving their
 * newlines, so post-strip line numbers would be offset. A name that reaches
 * this map has already been proven to occur outside a comment, so scanning
 * the original for it yields usable locations.
 */
const undefinedReferences = (): Map<string, string[]> => {
  const declared = declaredNames()
  const found = new Map<string, string[]>()

  for (const file of tracked().filter((f) => REF_EXTENSIONS.includes(ext(f)))) {
    const names = new Set<string>()
    for (const [, name] of read(file).matchAll(REFERENCE)) {
      if (!declared.has(name)) names.add(name)
    }
    if (names.size === 0) continue

    const rawLines = readFileSync(join(REPO_ROOT, file), 'utf8').split('\n')
    for (const name of names) {
      const sites = rawLines
        .map((line, i) =>
          line.includes(`var(${name})`) ? `${file}:${i + 1}` : null
        )
        .filter((s): s is string => s !== null)
      found.set(name, [
        ...(found.get(name) ?? []),
        ...(sites.length > 0 ? sites : [file])
      ])
    }
  }
  return found
}

describe('css token sweep', () => {
  const undefinedRefs = undefinedReferences()

  it('references no CSS custom property that nothing declares', () => {
    const offenders = [...undefinedRefs.entries()]
      .filter(([name]) => !ALLOWLIST.includes(name))
      .map(([name, sites]) => `${name} (${sites.join(', ')})`)
      .sort()

    expect(offenders).toEqual([])
  })

  it('allowlists no name that has stopped being an undefined reference', () => {
    // Rot detection. A gate whose allowlist outlives its findings stops
    // measuring silently -- once a name is declared or its last call site is
    // deleted, its entry must be removed from ALLOWLIST above (along with its
    // reason) rather than left as decoration.
    const stale = ALLOWLIST.filter((name) => !undefinedRefs.has(name)).sort()

    expect(stale).toEqual([])
  })
})
