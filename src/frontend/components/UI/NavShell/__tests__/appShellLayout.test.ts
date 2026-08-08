/**
 * Source-text gates for F-34.10-03 (the card/folder seam recipe) and
 * F-34.10-06 (the navbar scrolling away with the page / an active scrollbar
 * drawing over it), fixed in 34.10-18. These are SOURCE-TEXT gates, not
 * render tests -- the `Frontend` jest project is `testEnvironment: 'node'`
 * with no jsdom and no CSS engine (see `shellTokens.test.ts`'s own
 * docstring), so no test in this file can see a seam, a scrollbar, or a
 * pinned navbar. The live adjudicator is plan 34.10-22's live gate; nothing
 * here proves REQ-34.10-06 by itself.
 *
 * `stripSourceComments` runs before every assertion below, and this is not
 * hygiene -- it is load-bearing. Task 1 and Task 2 of 34.10-18 both write
 * explanatory comments that NAME the very declarations these gates assert
 * (e.g. the navbar comment prose contains the literal string
 * `border-bottom: 1px solid var(--divider)` inside its own explanation). An
 * unstripped scan could be satisfied by that prose alone, with the real
 * declaration deleted underneath it -- exactly the failure mode this file
 * exists to prevent.
 *
 * `extractBlock` is a small nested-brace-aware block extractor, not a plain
 * regex match: `.App .content { ... &:not(...) { ... } }` contains a nested
 * rule with its own `{`/`}` pair, and `.NavShell__navbar` also appears
 * inside a DIFFERENT, longer selector
 * (`.frameless:not(.fullscreen) .NavShell__navbar { ... }`) elsewhere in the
 * same file. A naive `/\.NavShell__navbar\s*\{[^}]*\}/` would either stop at
 * the nested rule's first `}` or match the wrong block entirely; anchoring
 * each selector pattern to the START of its own line (`^...\{`, multiline)
 * and then counting brace depth is what isolates the correct block.
 */
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'

const FRONTEND_ROOT = join(__dirname, '..', '..', '..', '..')

const APP_CSS = join(FRONTEND_ROOT, 'App.css')
const NAVSHELL_SCSS = join(FRONTEND_ROOT, 'components/UI/NavShell/index.scss')
const NAVTABS_SCSS = join(
  FRONTEND_ROOT,
  'components/UI/NavShell/components/NavTabs/index.scss'
)
const LIBRARY_TSX = join(FRONTEND_ROOT, 'screens/Library/index.tsx')
const GAMES_LIST_TSX = join(
  FRONTEND_ROOT,
  'screens/Library/components/GamesList/index.tsx'
)

function readStripped(path: string): string {
  return stripSourceComments(readFileSync(path, 'utf8'))
}

/**
 * Extracts the body of the FIRST top-level rule whose selector+opening-brace
 * matches `openPattern` (anchored to the start of a line so it cannot match
 * a substring inside a longer, different selector), tracking brace depth so
 * nested rules inside the body do not truncate the match early.
 */
function extractBlock(source: string, openPattern: RegExp): string | null {
  const match = openPattern.exec(source)
  if (!match) return null

  let idx = match.index + match[0].length
  let depth = 1
  let out = ''
  while (idx < source.length && depth > 0) {
    const ch = source[idx]
    if (ch === '{') depth++
    else if (ch === '}') depth--
    if (depth > 0) out += ch
    idx++
  }
  return out
}

function collectSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === '__tests__') continue
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      collectSourceFiles(full, out)
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(full)
    }
  }
  return out
}

describe('App shell layout (F-34.10-03 seam recipe, F-34.10-06 scroll relocation)', () => {
  it('F-34.10-03 navbar half: .NavShell__navbar declares border-bottom: 1px solid var(--divider)', () => {
    const navbarBlock = extractBlock(
      readStripped(NAVSHELL_SCSS),
      /^\.NavShell__navbar\s*\{/m
    )
    expect(navbarBlock).not.toBeNull()
    expect(navbarBlock).toMatch(/border-bottom:\s*1px\s+solid\s+var\(--divider\)\s*;/)
  })

  it('F-34.10-03 tab half: NavTabs .Mui-selected still declares border-bottom: 1px solid var(--body-background)', () => {
    // Asserted together with the navbar half in this one file on purpose:
    // the recipe is a pair, and deleting either half produces no visible
    // error -- that is exactly how this shipped broken the first time.
    const navTabsSource = readStripped(NAVTABS_SCSS)
    const selectedBlock = extractBlock(
      navTabsSource,
      /&\.Mui-selected\s*\{/
    )
    expect(selectedBlock).not.toBeNull()
    expect(selectedBlock).toMatch(
      /border-bottom:\s*1px\s+solid\s+var\(--body-background\)\s*;/
    )
  })

  it('F-34.10-03 no literal colour: neither half of the seam recipe names a hex literal', () => {
    // navigation-shell.md § 3's inversion table: the navbar is LIGHTER than
    // the body in every scored theme (dracula most severely). A fixed
    // colour on either half would break relationally in at least one theme.
    const navbarBlock = extractBlock(
      readStripped(NAVSHELL_SCSS),
      /^\.NavShell__navbar\s*\{/m
    )
    const selectedBlock = extractBlock(
      readStripped(NAVTABS_SCSS),
      /&\.Mui-selected\s*\{/
    )
    const navbarBorderLine = navbarBlock?.match(/border-bottom:[^;]*;/)?.[0]
    const selectedBorderLine = selectedBlock?.match(
      /border-bottom:[^;]*;/
    )?.[0]
    expect(navbarBorderLine).toBeDefined()
    expect(selectedBorderLine).toBeDefined()
    expect(navbarBorderLine).not.toMatch(/#[0-9a-fA-F]{3,8}/)
    expect(selectedBorderLine).not.toMatch(/#[0-9a-fA-F]{3,8}/)
  })

  it('F-34.10-06 scroll ownership: .App is height: 100vh; overflow: hidden, and no longer min-height: 100vh', () => {
    const appBlock = extractBlock(readStripped(APP_CSS), /^\.App\s*\{/m)
    expect(appBlock).not.toBeNull()
    expect(appBlock).toMatch(/overflow:\s*hidden\s*;/)
    expect(appBlock).toMatch(/height:\s*100vh\s*;/)
    expect(appBlock).not.toMatch(/min-height:\s*100vh\s*;/)
  })

  it('F-34.10-06 the scrolling element: .App .content is overflow-y: auto; min-height: 0', () => {
    const contentBlock = extractBlock(
      readStripped(APP_CSS),
      /^\.App \.content\s*\{/m
    )
    expect(contentBlock).not.toBeNull()
    expect(contentBlock).toMatch(/overflow-y:\s*auto\s*;/)
    expect(contentBlock).toMatch(/min-height:\s*0\s*;/)
  })

  it('F-10 prohibition: neither .App nor .App .content declares a percentage height/min-height', () => {
    // A WKWebView resolving a percentage height/min-height against a `1fr`
    // grid row has already produced a measured, hardware-confirmed garbage
    // `23323.0625px` row on this project (App.css's own F-10 comment
    // block). `100vh` is a viewport unit, not a percentage, and `0` is a
    // length, not a percentage -- neither re-enters that cycle. This gate
    // exists so a future edit cannot silently swap either back to `%`.
    const appBlock = extractBlock(readStripped(APP_CSS), /^\.App\s*\{/m)
    const contentBlock = extractBlock(
      readStripped(APP_CSS),
      /^\.App \.content\s*\{/m
    )
    const percentagePattern = /(height|min-height):\s*\d+(\.\d+)?%/
    expect(appBlock).not.toMatch(percentagePattern)
    expect(contentBlock).not.toMatch(percentagePattern)
  })

  it('F-34.10-06 no dead sticky: .NavShell__navbar does not declare position: sticky', () => {
    // A sticky-positioned grid item is constrained to its OWN grid area --
    // the navbar's area is a single min-content row exactly as tall as the
    // navbar itself, so `position: sticky; top: 0` there would have ZERO
    // travel distance and do nothing while looking like a plausible fix.
    // This gate exists so that wrong-but-plausible fix cannot be added
    // later as an apparent improvement.
    const navbarBlock = extractBlock(
      readStripped(NAVSHELL_SCSS),
      /^\.NavShell__navbar\s*\{/m
    )
    expect(navbarBlock).not.toBeNull()
    expect(navbarBlock).not.toMatch(/position:\s*sticky/)
  })

  it.each([LIBRARY_TSX, GAMES_LIST_TSX])(
    'scroll-container migration, per file: %s no longer uses document.body as a scroll container',
    (path) => {
      // Silent-failure mode this gate guards: a scroll listener or a
      // scrollTo() call on an element that no longer overflows throws
      // nothing, logs nothing and fails no test -- GamesList's consumer is
      // additionally gamepad-only, so it is invisible to keyboard-and-mouse
      // use as well. Both must resolve `main.content` instead.
      const text = readStripped(path)
      expect(text).not.toMatch(/document\.body\.addEventListener\(\s*'scroll'/)
      expect(text).not.toMatch(
        /document\.body\.removeEventListener\(\s*'scroll'/
      )
      expect(text).not.toMatch(/document\.body\.scrollTop/)
      expect(text).not.toMatch(/document\.body\.scrollTo/)
      expect(text).toMatch(/main\.content/)
    }
  )

  it('scroll-container migration, whole tree: no file under src/frontend outside __tests__ uses document.body as a scroll container', () => {
    // The gate that is NOT structurally blind. Gate 8 above is an
    // allowlist of the two files known at planning time -- and an
    // allowlist can only guard the files someone already thought of. This
    // is exactly what missed GamesList's gamepad focus-scroll at planning
    // time: a per-file review of "the obvious place" (Library/index.tsx)
    // alone would have shipped GamesList's silent no-op undetected. This
    // scan walks every .ts/.tsx file under src/frontend (excluding
    // __tests__ directories) and looks for a SCROLL-SPECIFIC
    // `document.body` pattern only -- the tree has many legitimate,
    // unrelated `document.body.classList`, `document.body.className` and
    // `document.body.insertAdjacentElement` uses (index.tsx, GlobalState.tsx,
    // ConsoleMode's dialogs, gamepad.ts) which must NOT trip this gate. If a
    // future author trips this and the match is one of those three
    // patterns, it is a false positive worth narrowing, not a real defect.
    const scrollPatterns = [
      /document\.body\.scrollTo/,
      /document\.body\.scrollTop/,
      /document\.body\.scrollBy/,
      /document\.body\.addEventListener\(\s*'scroll'/,
      /document\.body\.removeEventListener\(\s*'scroll'/
    ]

    const offenders: string[] = []
    for (const file of collectSourceFiles(FRONTEND_ROOT)) {
      const text = readStripped(file)
      for (const pattern of scrollPatterns) {
        if (pattern.test(text)) {
          offenders.push(`${file} matched ${pattern}`)
        }
      }
    }

    expect(offenders).toEqual([])
  })
})
