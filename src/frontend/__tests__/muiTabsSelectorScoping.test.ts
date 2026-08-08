/**
 * Repo-wide guard against unscoped `MuiTab*`/`MuiTabs*` selectors in frontend
 * stylesheets (34.10-23, gap cycle 3).
 *
 * This is a SOURCE-TEXT gate, not a render test: the `Frontend` jest project
 * is `testEnvironment: 'node'` (see `src/frontend/jest.config.js`) with no
 * jsdom and no CSS engine, so nothing in this file can see a rendered pixel.
 *
 * The defect this guards: F-34.10-03 (a ~8px seam between the nav shell's tab
 * strip and the content region) and F-34.10-04 (the wordmark/Downloads ring
 * reading lower than the tab strip). Both were ONE confirmed root cause --
 * `src/frontend/screens/Settings/sections/GamesSettings/index.scss` declared
 * a top-level `.MuiTabs-root { padding-bottom: var(--space-xs) }` with no
 * scoping ancestor, so an 8px padding leaked into EVERY `<Tabs>` in the app,
 * including the nav shell's (see `.planning/debug/navbar-seam-and-logo-offset.md`
 * Resolution). That rule is fixed (34.10-23 Task 1); this test prevents the
 * same leak class from recurring anywhere else in the tree.
 *
 * Comment stripping is load-bearing here, not hygiene: `NavTabs/index.scss`'s
 * own header comment quotes the unscoped rule verbatim, inside a `//`-prefixed
 * comment block, specifically to document the defect. An unstripped scan
 * would misidentify that prose as a second offender (or, worse, a naive
 * stripper could misreport line numbers for a REAL offender elsewhere). See
 * `stripPreservingLineNumbers` below for why this file does not simply reuse
 * `stripSourceComments`'s own line-DROPPING behavior for offender reporting.
 */
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'

const FRONTEND_ROOT = join(__dirname, '..')

interface Offender {
  file: string
  line: number
  selector: string
}

/**
 * Strips `/* ... *\/` block comments and whole `//`/`*`/`/*`-prefixed lines,
 * mirroring `stripSourceComments`'s own two-stage semantics -- but BLANKS
 * removed content in place rather than dropping it, so every remaining
 * line's index still matches the ORIGINAL file's line number.
 * `stripSourceComments` itself drops matched lines (and collapses multi-line
 * block comments), which would silently misreport offender line numbers
 * here. This is the "index-preserving" variant the plan requires; it is
 * intentionally a separate function, not a drop-in replacement.
 */
function stripPreservingLineNumbers(source: string): string {
  const noBlockComments = source.replace(/\/\*[\s\S]*?\*\//g, (block) =>
    block.replace(/[^\n]/g, '')
  )
  return noBlockComments
    .split('\n')
    .map((line) => (/^\s*(\/\/|\*|\/\*)/.test(line) ? '' : line))
    .join('\n')
}

function lineNumberAt(stripped: string, index: number): number {
  return stripped.slice(0, index).split('\n').length
}

/**
 * Finds every UNSCOPED (top-level, brace-depth-0) `MuiTab*`/`MuiTabs*`
 * selector in a stylesheet's source text.
 *
 * Rule: at brace depth 0, split the selector text preceding `{` on `,`; for
 * each comma-separated selector, take its FIRST compound (everything up to
 * the first whitespace, `>`, `+`, or `~`). Flag it only if THAT first
 * compound is itself a `MuiTab*`/`MuiTabs*` class -- an ancestor-scoped
 * selector like `.downloadManager > .MuiTabs-root > ...` is legal because
 * its first compound is `.downloadManager`, not a MUI class. A selector
 * nested inside another rule (brace depth >= 1 at its own `{`) is never
 * inspected here, because nesting under any ancestor is what "scoped" means.
 *
 */
export function findUnscopedMuiTabsSelectors(
  source: string,
  file: string
): Offender[] {
  const stripped = stripPreservingLineNumbers(source)
  const offenders: Offender[] = []
  let depth = 0
  let selectorStart = 0

  const flagSelector = (selectorText: string, textStart: number) => {
    let cursor = textStart
    for (const rawPart of selectorText.split(',')) {
      const leadingWs = rawPart.match(/^\s*/)?.[0].length ?? 0
      const partStart = cursor + leadingWs
      const trimmed = rawPart.trim()
      if (trimmed) {
        const firstCompoundMatch = trimmed.match(/^[^\s>+~]+/)
        const firstCompound = firstCompoundMatch
          ? firstCompoundMatch[0]
          : trimmed
        if (/^\.MuiTabs?-[A-Za-z-]+/.test(firstCompound)) {
          offenders.push({
            file,
            line: lineNumberAt(stripped, partStart),
            selector: firstCompound
          })
        }
      }
      cursor += rawPart.length + 1 // +1 for the comma consumed by split()
    }
  }

  for (let i = 0; i < stripped.length; i++) {
    const ch = stripped[i]
    if (ch === '{') {
      if (depth === 0) {
        flagSelector(stripped.slice(selectorStart, i), selectorStart)
      }
      depth++
    } else if (ch === '}') {
      depth = Math.max(0, depth - 1)
      if (depth === 0) {
        selectorStart = i + 1
      }
    }
  }

  return offenders
}

function collectStylesheets(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'build' || entry === 'dist') {
      continue
    }
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      collectStylesheets(full, out)
    } else if (/\.(scss|css)$/.test(entry)) {
      out.push(full)
    }
  }
  return out
}

function formatOffenders(offenders: Offender[]): string {
  return offenders.map((o) => `${o.file}:${o.line}: ${o.selector}`).join('\n')
}

// The VERBATIM pre-rescope block from `GamesSettings/index.scss` (34.10-23
// Task 1 moved this exact text inside `.settingsDialogContent,
// .settingsWrapper { ... }`; this constant preserves the original,
// unscoped, top-level form it used to be, per F-34.10-07's "run the check
// against a filled specimen" rule -- a guard that has never been shown to
// fail is not a guard).
const PRE_FIX_SPECIMEN = `.MuiTabs-root {
  padding-bottom: var(--space-xs);

  .MuiTabs-scroller {
    .MuiTabs-indicator {
      background-color: var(--accent);
    }

    .MuiTabs-flexContainer {
      .MuiTab-root {
        color: var(--text-default);
      }

      .Mui-selected {
        color: var(--accent);
      }
    }
  }
}
`

describe('muiTabsSelectorScoping', () => {
  it('repo-wide: no frontend stylesheet declares an unscoped MuiTab*/MuiTabs* selector (F-34.10-03 / F-34.10-04 guard)', () => {
    const files = collectStylesheets(FRONTEND_ROOT)
    const allOffenders: Offender[] = []
    for (const file of files) {
      const source = readFileSync(file, 'utf8')
      allOffenders.push(...findUnscopedMuiTabsSelectors(source, file))
    }

    if (allOffenders.length > 0) {
      throw new Error(
        'Unscoped MuiTab*/MuiTabs* selector(s) found -- this is the exact ' +
          'defect class behind F-34.10-03 / F-34.10-04 (an unscoped ' +
          '.MuiTabs-root leaked an 8px padding-bottom into every <Tabs> in ' +
          `the app):\n${formatOffenders(allOffenders)}`
      )
    }
  })

  it('detects the real pre-rescope defect: PRE_FIX_SPECIMEN yields exactly one offender at its .MuiTabs-root line', () => {
    // Sanity check: this specimen is real, non-comment source text, not an
    // accidentally-blank fixture.
    expect(stripSourceComments(PRE_FIX_SPECIMEN).trim().length).toBeGreaterThan(
      0
    )

    const offenders = findUnscopedMuiTabsSelectors(
      PRE_FIX_SPECIMEN,
      'PRE_FIX_SPECIMEN'
    )
    expect(offenders).toHaveLength(1)
    expect(offenders[0]).toMatchObject({ line: 1, selector: '.MuiTabs-root' })
  })

  it('ancestor-scoped depth-0 selectors are legal: DownloadManager/index.css yields zero offenders', () => {
    const file = join(FRONTEND_ROOT, 'screens/DownloadManager/index.css')
    const source = readFileSync(file, 'utf8')
    const offenders = findUnscopedMuiTabsSelectors(source, file)
    expect(offenders).toEqual([])
  })

  it('comma-separated selector lists are checked per-selector', () => {
    const fixture = '.foo,\n.MuiTabs-root {\n  color: red;\n}\n'
    const offenders = findUnscopedMuiTabsSelectors(fixture, 'fixture.css')
    expect(offenders).toHaveLength(1)
    expect(offenders[0]).toMatchObject({ line: 2, selector: '.MuiTabs-root' })
  })

  it('comment prose is not an offender: NavTabs/index.scss quotes the unscoped rule verbatim in a header comment and still yields zero offenders', () => {
    const file = join(
      FRONTEND_ROOT,
      'components/UI/NavShell/components/NavTabs/index.scss'
    )
    const source = readFileSync(file, 'utf8')
    expect(source).toMatch(
      /\.MuiTabs-root \{ padding-bottom: var\(--space-xs\) \}/
    )
    const offenders = findUnscopedMuiTabsSelectors(source, file)
    expect(offenders).toEqual([])
  })
})
