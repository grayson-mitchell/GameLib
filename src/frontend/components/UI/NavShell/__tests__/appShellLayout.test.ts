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
const APP_TSX = join(FRONTEND_ROOT, 'App.tsx')
const NAVSHELL_SCSS = join(FRONTEND_ROOT, 'components/UI/NavShell/index.scss')
const NAVTABS_SCSS = join(
  FRONTEND_ROOT,
  'components/UI/NavShell/components/NavTabs/index.scss'
)
const THEMES_SCSS = join(FRONTEND_ROOT, 'themes.scss')

// The 11 real theme block selectors in themes.scss, as they exist at time of
// writing -- grepped directly (`grep -n "^body\\." src/frontend/themes.scss`)
// and cross-checked with a structural nested-brace parse, not assumed. This
// list deliberately EXCLUDES `body {}` (the shared base, not a theme),
// `body.alphabet-filter-button--active` (a cross-theme STATE modifier, not a
// theme), and descendant-combinator sub-selectors like
// `body.zombie .alphabet-filter-button--active` or `body.classic .sid-input`
// (component-scoped overrides nested a theme, not themes themselves) --
// none of those three kinds of block reliably define surface tokens like
// `--body-background`, so folding them into a "must define" scan would
// produce false failures unrelated to actual theme coverage. If a new theme
// is added to `themes.scss`, this list -- and only this list -- needs a new
// entry; the intentional exclusions above do not change.
const REAL_THEME_BLOCK_PATTERNS = [
  /^body\.midnightMirage\s*\{/m,
  /^body\.classic,\s*\n?body\.cyberSpaceOasis,\s*\n?body\.cyberSpaceOasisAlt\s*\{/m,
  /^body\.gruvbox_dark\s*\{/m,
  /^body\.high-contrast\s*\{/m,
  /^body\.dracula,\s*\n?body\.dracula-classic\s*\{/m,
  /^body\.nord-light\s*\{/m,
  /^body\.nord-dark\s*\{/m,
  /^body\.marine,\s*\n?body\.marine-classic\s*\{/m,
  /^body\.zombie,\s*\n?body\.zombie-classic\s*\{/m,
  /^body\.old-school\s*\{/m,
  /^body\.sweet,\s*\n?body\.sweet-dark\s*\{/m
]
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

/**
 * Extracts the body of every real theme block in `themes.scss` (see
 * `REAL_THEME_BLOCK_PATTERNS` above), so a token's universality can be
 * PROVEN by scanning actual source structure rather than asserted from
 * plausibility (F-34.10-03's original bug: `var(--divider)` was assumed
 * relational/universal and was neither -- see the incident recorded in
 * `NavShell/index.scss`'s own comment and 34.10-18-SUMMARY.md).
 */
function realThemeBlockBodies(): string[] {
  const source = readStripped(THEMES_SCSS)
  return REAL_THEME_BLOCK_PATTERNS.map((pattern) => {
    const body = extractBlock(source, pattern)
    if (body === null) {
      throw new Error(
        `themes.scss: expected theme block matching ${pattern} not found -- ` +
          'themes.scss structure has changed; update REAL_THEME_BLOCK_PATTERNS'
      )
    }
    return body
  })
}

/** True only if `--${token}:` is declared in every real theme block. */
function tokenResolvesInEveryTheme(token: string): boolean {
  return realThemeBlockBodies().every((body) =>
    new RegExp(`--${token}:`).test(body)
  )
}

describe('App shell layout (F-34.10-03 seam recipe, F-34.10-06 scroll relocation)', () => {
  it('REQ-34.10-01: .App grid-template-areas is exactly offline/navbar/tier2 content/tier2 controller', () => {
    // The requirement text names these four area rows verbatim
    // ('offline offline' / 'navbar navbar' / 'tier2 content' /
    // 'tier2 controller') -- nothing before this gate pinned the grid shape
    // itself, only .App's height/overflow and the F-10 selector prohibition.
    const appBlock = extractBlock(readStripped(APP_CSS), /^\.App\s*\{/m)
    expect(appBlock).not.toBeNull()
    expect(appBlock).toMatch(
      /grid-template-areas:\s*'offline offline'\s*'navbar navbar'\s*'tier2 content'\s*'tier2 controller'\s*;/
    )
  })

  it('SANITY: the grid-template-areas check above fails against a known-bad input (the retired sidebar shape) -- proves it is not vacuously true', () => {
    const retiredSidebarShape = `
      grid-template-areas:
        'offline offline'
        'sidebar content'
        'sidebar controller';
    `
    expect(retiredSidebarShape).not.toMatch(
      /grid-template-areas:\s*'offline offline'\s*'navbar navbar'\s*'tier2 content'\s*'tier2 controller'\s*;/
    )
  })

  it('REQ-34.10-07: the frameless navbar reserves trailing space via var(--overlay-controls-width), so WindowControls never overlaps it', () => {
    // D-05: mirrors the hack deleted from Header/index.css -- the navbar's
    // own trailing padding must consume the SAME custom property so
    // WindowControls (grid-area: navbar, re-anchored by plan 34.1-09; see
    // windowControlsPlacement.test.ts) never draws over the nav-right
    // cluster (Downloads ring / wordmark). This rule was previously
    // guarding a collision that could not occur, because Phase 34.10 moved
    // WindowControls out of the navbar row without anyone auditing the
    // consumers -- plan 34.1-09 restored the co-location, so this gate is
    // meaningful again. It is now correctly ABSENT on macOS
    // (`.macOverlayTitlebar`, D-06 reversal, plan 34.1-11), where
    // `WindowControls` no longer renders in either titlebar state.
    const framelessNavbarBlock = extractBlock(
      readStripped(NAVSHELL_SCSS),
      /^\.App:not\(\.macOverlayTitlebar\)\.frameless:not\(\.fullscreen\)\s+\.NavShell__navbar\s*\{/m
    )
    expect(framelessNavbarBlock).not.toBeNull()
    expect(framelessNavbarBlock).toMatch(
      /padding-inline-end:[\s\S]*var\(--overlay-controls-width\)/
    )
  })

  it('REQ-34.10-07 / D-06 reversal: the trailing-reserve selector EXCLUDES the macOS-overlaid state', () => {
    // The assertion that would catch a future edit re-broadening the rule
    // back to all platforms, silently reintroducing 120px of dead trailing
    // padding on macOS (WindowControls does not render there in either
    // titlebar state, per plan 34.1-11 Task 1).
    const source = readStripped(NAVSHELL_SCSS)
    const openPattern =
      /^\.App:not\(\.macOverlayTitlebar\)\.frameless:not\(\.fullscreen\)\s+\.NavShell__navbar\s*\{/m
    const match = openPattern.exec(source)
    expect(match).not.toBeNull()
    expect(match?.[0]).toMatch(/:not\(\.macOverlayTitlebar\)/)
  })

  it('SANITY: the macOS-exclusion check above fails against the pre-reversal selector (no exclusion) -- proves it is not vacuously true', () => {
    const preReversalSelector =
      '.frameless:not(.fullscreen) .NavShell__navbar {'
    expect(preReversalSelector).not.toMatch(/:not\(\.macOverlayTitlebar\)/)
  })

  it('SANITY: the trailing-reserve check above fails against a known-bad input (a literal px reserve with no token) -- proves it is not vacuously true', () => {
    const literalOnlyReserve = `
      padding-inline-end: 10px;
    `
    expect(literalOnlyReserve).not.toMatch(
      /padding-inline-end:[\s\S]*var\(--overlay-controls-width\)/
    )
  })

  it('F-34.10-03 navbar half: .NavShell__navbar declares border-bottom: 1px solid var(--body-background)', () => {
    // CORRECTED post-review: the original declaration used `var(--divider)`,
    // a no-fallback custom property defined in only 2 of 11 real theme
    // blocks in themes.scss. `var()` with an undefined property and no
    // fallback is invalid at computed-value time -- the WHOLE
    // `border-bottom` shorthand drops, not just its colour, so no border
    // painted at all in the other 9 themes. `--body-background` (asserted
    // below, gate 3a, to actually resolve in all 11) is what this must be.
    const navbarBlock = extractBlock(
      readStripped(NAVSHELL_SCSS),
      /^\.NavShell__navbar\s*\{/m
    )
    expect(navbarBlock).not.toBeNull()
    expect(navbarBlock).toMatch(
      /border-bottom:\s*1px\s+solid\s+var\(--body-background\)\s*;/
    )
  })

  it('F-34.10-03 no no-fallback var(--divider) reintroduced into .NavShell__navbar', () => {
    // Guards specifically against re-committing this plan's own original
    // mistake, scoped to the ONE rule this plan actually owns and fixed:
    // `.NavShell__navbar` in `NavShell/index.scss`. Deliberately NOT scoped
    // to the whole file or the whole `NavShell/` subtree: TWO other,
    // pre-existing no-fallback `var(--divider)` usages already exist and
    // are explicitly left unchanged by this plan --
    // `.NavShell__tier2 { border-inline-end: ... var(--divider) }` (same
    // file, a few rules below this one -- draws the tier-2 column's
    // vertical divider, unrelated to this seam) and
    // `NavTabs/index.scss:68`'s `border-color: var(--divider)` (a
    // different file, plan 34.10-19's scope). A gate scoped any wider than
    // `.NavShell__navbar` itself would fail on those pre-existing,
    // out-of-scope findings rather than catching a genuine regression. See
    // 34.10-18-SUMMARY.md's "Findings" section for the full app-wide
    // no-fallback `--divider` census, both of these included.
    const navbarBlock = extractBlock(
      readStripped(NAVSHELL_SCSS),
      /^\.NavShell__navbar\s*\{/m
    )
    expect(navbarBlock).not.toBeNull()
    // Matches `var(--divider)` with nothing but the closing paren after the
    // property name -- i.e. no comma introducing a fallback.
    const noFallbackDivider = /var\(\s*--divider\s*\)/g
    expect(navbarBlock?.match(noFallbackDivider)).toBeNull()
  })

  it('F-34.10-03 chosen token: var(--body-background) actually resolves in every real theme block in themes.scss', () => {
    // The gate that would have caught the original bug BEFORE it shipped:
    // proves universality by scanning themes.scss's actual structure
    // (REAL_THEME_BLOCK_PATTERNS, grepped and cross-checked at authoring
    // time), not by asserting a belief about the token's relational-ness.
    // `--divider` fails this exact check (defined in only 2 of 11 blocks);
    // `--body-background` is asserted to pass it.
    expect(tokenResolvesInEveryTheme('body-background')).toBe(true)
  })

  it('SANITY: the theme-universality checker itself correctly fails --divider (proves it is not vacuously true)', () => {
    // Negative control for the gate above. If this ever flips to `true`,
    // themes.scss has been edited to define `--divider` in every block --
    // meaning the ORIGINAL `var(--divider)` declaration this plan replaced
    // would in fact have been safe, and `NavShell/index.scss`'s comment
    // plus this plan's "Findings" writeup should be revisited rather than
    // treated as still-true history.
    expect(tokenResolvesInEveryTheme('divider')).toBe(false)
  })

  it('F-34.10-03 tab half: NavTabs .Mui-selected still declares border-bottom: 1px solid var(--body-background)', () => {
    // Asserted together with the navbar half in this one file on purpose:
    // the recipe is a pair, and deleting either half produces no visible
    // error -- that is exactly how this shipped broken the first time.
    const navTabsSource = readStripped(NAVTABS_SCSS)
    const selectedBlock = extractBlock(navTabsSource, /&\.Mui-selected\s*\{/)
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
    const selectedBorderLine = selectedBlock?.match(/border-bottom:[^;]*;/)?.[0]
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

describe('F-34.10-04 -- the navbar is one line', () => {
  it('F-34.10-04 implemented declaration: .NavTabs .MuiTab-root declares the content-derived min-height 34.10-F04-DIAGNOSIS.md specifies', () => {
    // Quoting the finding ID in the failure message per this gate's own
    // requirement: F-34.10-04. The declaration is read from the exact file
    // and selector 34.10-F04-DIAGNOSIS.md's "Surviving hypotheses" section
    // names -- NOT a generic "some min-height exists" check, which would
    // pass on an arbitrary, unmeasured value.
    const tabRootBlock = extractBlock(
      readStripped(NAVTABS_SCSS),
      /\.MuiTab-root\s*\{/
    )
    expect(tabRootBlock).not.toBeNull()
    expect(tabRootBlock).toMatch(
      /min-height:\s*calc\(\(\s*2\s*\*\s*var\(--space-xs\)\s*\)\s*\+\s*1\.25em\s*\+\s*1px\)\s*;/
    )
  })

  it('F-34.10-04 MUI scoping: every MuiTab/MuiTabs selector in NavTabs/index.scss is nested under .NavTabs', () => {
    // A bare `.MuiTab-root { ... }` or `.MuiTabs-root { ... }` selector
    // would also restyle the app's OTHER MUI <Tabs> instance --
    // `src/frontend/screens/WineManager/index.tsx:222` -- which is not this
    // phase's surface and has its own height expectations. Proved
    // structurally: every `MuiTab`/`MuiTabs` occurrence in the stripped
    // file must fall inside the single top-level `.NavTabs { ... }` block,
    // not merely asserted by indentation convention.
    const strippedSource = readStripped(NAVTABS_SCSS)
    const navTabsBlock = extractBlock(strippedSource, /^\.NavTabs\s*\{/m)
    expect(navTabsBlock).not.toBeNull()

    const muiTabPattern = /\.MuiTabs?-[a-zA-Z-]+/g
    const wholeFileMatches = strippedSource.match(muiTabPattern) ?? []
    const withinNavTabsMatches = navTabsBlock?.match(muiTabPattern) ?? []
    expect(wholeFileMatches.length).toBeGreaterThan(0)
    expect(withinNavTabsMatches.length).toBe(wholeFileMatches.length)

    // Belt-and-suspenders: no line in the file opens a MuiTab*/MuiTabs*
    // selector at column 0 (i.e. NOT indented/nested under `.NavTabs`).
    // WineManager/index.tsx:222's tab strip is the collateral surface an
    // unscoped rule here would reach.
    expect(strippedSource).not.toMatch(/^\.MuiTabs?-[a-zA-Z-]+\s*\{/m)
  })

  it('F-34.10-04 seam recipe survives: .MuiTab-root keeps position: relative / top: 1px, and .Mui-selected keeps background: var(--body-background)', () => {
    // A height change is the most plausible way to silently break the
    // card/folder seam recipe (34.10-18's own gates above pin the border
    // half; this pins the two declarations a min-height edit most directly
    // threatens).
    const tabRootBlock = extractBlock(
      readStripped(NAVTABS_SCSS),
      /\.MuiTab-root\s*\{/
    )
    expect(tabRootBlock).not.toBeNull()
    expect(tabRootBlock).toMatch(/position:\s*relative\s*;/)
    expect(tabRootBlock).toMatch(/top:\s*1px\s*;/)

    const selectedBlock = extractBlock(
      readStripped(NAVTABS_SCSS),
      /&\.Mui-selected\s*\{/
    )
    expect(selectedBlock).not.toBeNull()
    expect(selectedBlock).toMatch(/background:\s*var\(--body-background\)\s*;/)
  })

  it('F-34.10-04 flex-wrap prohibition: neither NavShell/index.scss nor NavTabs/index.scss declares flex-wrap anywhere', () => {
    // 34.10-F04-DIAGNOSIS.md's H2 REJECTED a literal flex-wrap line break as
    // the cause -- `nowrap` is the default and is what the shell relies on.
    // An explicit `wrap` added later would reproduce F-34.10-04's reported
    // symptom for real, not merely the vertical-overflow illusion H1 found.
    expect(readStripped(NAVSHELL_SCSS)).not.toMatch(/flex-wrap/)
    expect(readStripped(NAVTABS_SCSS)).not.toMatch(/flex-wrap/)
  })

  it('F-34.10-04 no literal colour introduced into NavTabs/index.scss', () => {
    // navigation-shell.md § 3's inversion table: the navbar is LIGHTER than
    // the body in every scored theme (dracula most severely). A fixed hex
    // colour anywhere in this file would break relationally in at least one
    // theme -- including the border-color fix carried in from 34.10-18's
    // handoff finding, which must resolve to a token, not a literal.
    expect(readStripped(NAVTABS_SCSS)).not.toMatch(/#[0-9a-fA-F]{3,8}/)
  })
})

describe('App.tsx D-06 reversal: the two macOS booleans are pinned distinct (34.1-11 Task 3)', () => {
  // `isMac` (hide GameLib's own WindowControls, unconditional) and
  // `isMacOverlayTitlebar` (apply the 78px reserve, conjoined with
  // `isFrameless`) look interchangeable and are not -- collapsing toward
  // the narrow form reintroduces the D-06 duplicate-buttons symptom
  // whenever frameless is off; collapsing toward the wide form paints a
  // 78px dead gap beside a normal native title bar. Neither errors, and
  // both are plausible good-faith simplifications a later reader could make.
  //
  // This is a SOURCE-TEXT gate, matching the rest of this file and
  // `appShellMount.test.ts`'s idiom for pinning facts about `App.tsx`: the
  // `Frontend` jest project has no jsdom, so there is no render harness in
  // this suite (or any sibling test file under this `__tests__` directory)
  // to mount `<App>` against -- confirmed by reading the directory before
  // writing this gate, per the plan's own instruction to prefer an existing
  // harness over a new one. None exists, so the plan's documented fallback
  // applies.
  it('the showOverlayControls macOS negation is a DIFFERENT identifier than the one bound to macOverlayTitlebar', () => {
    const appSource = readStripped(APP_TSX)

    const macOverlayTitlebarMatch = appSource.match(
      /macOverlayTitlebar:\s*([A-Za-z_$][\w$]*)/
    )
    expect(macOverlayTitlebarMatch).not.toBeNull()
    const macOverlayTitlebarIdentifier = macOverlayTitlebarMatch?.[1]

    const showOverlayControlsMatch = appSource.match(
      /const showOverlayControls = ([^\n]+)/
    )
    expect(showOverlayControlsMatch).not.toBeNull()
    const showOverlayControlsExpr = showOverlayControlsMatch?.[1] ?? ''

    // Every negated identifier in the expression that mentions "mac" --
    // isolates the macOS-specific negation from the unrelated
    // `!hasNativeOverlayControls` clause also present there.
    const negatedMacIdentifiers = [
      ...showOverlayControlsExpr.matchAll(/!([A-Za-z_$][\w$]*)/g)
    ]
      .map((m) => m[1])
      .filter((id) => /mac/i.test(id))
    expect(negatedMacIdentifiers.length).toBeGreaterThan(0)

    expect(negatedMacIdentifiers).not.toContain(macOverlayTitlebarIdentifier)
  })

  it('the identifier bound to macOverlayTitlebar is defined as a conjunction that includes the frameless state', () => {
    const appSource = readStripped(APP_TSX)

    const macOverlayTitlebarMatch = appSource.match(
      /macOverlayTitlebar:\s*([A-Za-z_$][\w$]*)/
    )
    expect(macOverlayTitlebarMatch).not.toBeNull()
    const macOverlayTitlebarIdentifier = macOverlayTitlebarMatch?.[1] ?? ''

    const definitionPattern = new RegExp(
      `const ${macOverlayTitlebarIdentifier} = ([^\\n]+)`
    )
    const definitionMatch = appSource.match(definitionPattern)
    expect(definitionMatch).not.toBeNull()
    const definitionExpr = definitionMatch?.[1] ?? ''

    // Must be a conjunction (not the bare platform check alone) that
    // references the frameless state.
    expect(definitionExpr).toMatch(/&&/)
    expect(definitionExpr).toMatch(/isFrameless/)
  })

  it('SANITY: the distinct-identifier check fails against a known-bad input (both bound to the same identifier)', () => {
    const collapsedFixture = `
      const isMac = platform === 'darwin'
      const showOverlayControls = isFrameless && !hasNativeOverlayControls && !isMac
      classNames('App', { macOverlayTitlebar: isMac })
    `
    const macOverlayTitlebarMatch = collapsedFixture.match(
      /macOverlayTitlebar:\s*([A-Za-z_$][\w$]*)/
    )
    const showOverlayControlsMatch = collapsedFixture.match(
      /const showOverlayControls = ([^\n]+)/
    )
    const negatedMacIdentifiers = [
      ...(showOverlayControlsMatch?.[1] ?? '').matchAll(/!([A-Za-z_$][\w$]*)/g)
    ]
      .map((m) => m[1])
      .filter((id) => /mac/i.test(id))
    // In the collapsed fixture the two ARE the same identifier -- the real
    // gate above must reject this shape, and here it does.
    expect(negatedMacIdentifiers).toContain(macOverlayTitlebarMatch?.[1])
  })

  it('SANITY: the frameless-conjunction check fails against a known-bad input (narrowed to the bare platform check)', () => {
    const narrowedFixture = `const isMacOverlayTitlebar = platform === 'darwin'`
    const definitionMatch = narrowedFixture.match(
      /const isMacOverlayTitlebar = ([^\n]+)/
    )
    expect(definitionMatch?.[1]).not.toMatch(/&&/)
    expect(definitionMatch?.[1]).not.toMatch(/isFrameless/)
  })
})
