/**
 * Source-text gate for CR-01, CR-02 and the tier-2 `--divider` finding
 * (34.11-03, REQ-34.11-12).
 *
 * Why a source gate and not a render test: the Frontend jest project runs
 * with `testEnvironment: 'node'` (see src/frontend/jest.config.js) -- there
 * is no jsdom and no CSS engine, so this can prove the SOURCE says the
 * right thing but can never prove anything RENDERS correctly. Plan 09 Task
 * 3's live three-theme sweep (midnightMirage, gruvbox_dark, dracula) is the
 * actual adjudicator of appearance for every claim below, including the
 * `--navbar-active` contrast recommendation and the tier-2 divider's visual
 * presence. CR-02 in particular can NEVER be live-proven on this project's
 * dev machine -- `-webkit-app-region` is inert under WKWebView, and macOS
 * running Tauri is what this project's live-gate host is -- so this file is
 * CR-02's ONLY evidence; see index.scss's own comment on `.NavShell__navbar`
 * for the full acceptance of that limitation.
 *
 * `read()` (piped through `stripSourceComments`) and the brace-counted
 * `cssBlock()` helper are copied verbatim from
 * `src/frontend/screens/Library/__tests__/tier2Portal.test.ts`, which itself
 * copied them from the Login source-gate idiom -- not factored into a
 * shared util, matching that file's own precedent.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'

const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..', '..')

const read = (relPath: string) =>
  stripSourceComments(readFileSync(join(REPO_ROOT, relPath), 'utf8'))

const THEMES_SCSS = 'src/frontend/themes.scss'
const NAV_SHELL_SCSS = 'src/frontend/components/UI/NavShell/index.scss'
const HEADER_CSS = 'src/frontend/components/UI/Header/index.css'

/**
 * The 10 real theme root selectors in themes.scss. Quick task 261004-bz3
 * trimmed the theme set from 14 selectable names to 10, deleting four
 * near-duplicate/recoloured variants that were reachable through
 * `defaultThemes` and three CSS-only blocks that were never reachable
 * through it at all (see that quick task's SUMMARY for the full retired-key
 * list). Every surviving theme is now a single-selector block -- no
 * comma-joined theme selector remains in themes.scss at all -- so this list
 * is simply the 10 plain selectors, not "one representative per group"
 * picked for a comma-join quirk. Verified by hand against
 * `grep -n '^body\.' src/frontend/themes.scss`:
 *   midnightMirage; cyberSpaceOasis; gruvbox_dark; high-contrast; dracula;
 *   nord-light; nord-dark; marine; zombie; sweet.
 * cssBlock() throws if any of these no longer resolves to a real block, so a
 * renamed/removed theme fails loudly instead of a count silently drifting.
 *
 * Hoisted to module scope by the 34.11 code-review fix (WR-13) so the
 * `--navbar-active` census below uses the SAME 10 selectors the `--divider`
 * census does, rather than a second hand-maintained list.
 */
const themeSelectors = [
  'body.midnightMirage',
  'body.cyberSpaceOasis',
  'body.gruvbox_dark',
  'body.high-contrast',
  'body.dracula',
  'body.nord-light',
  'body.nord-dark',
  'body.marine',
  'body.zombie',
  'body.sweet'
]

/**
 * WR-13/CR-03: every stylesheet ADDED BY PHASE 34.11 that consumes
 * `--navbar-active`.
 *
 * Deliberately enumerated rather than globbed, and deliberately scoped to
 * this phase's own files. Three PRE-EXISTING consumers used the bare
 * `var(--navbar-active)` form and were knowingly left unguarded, because
 * fixing them was not in that review's scope and a gate that fails on
 * untouched code is a gate someone deletes:
 *   src/frontend/components/UI/NavShell/components/NavTabs/index.scss:229
 *   src/frontend/screens/Game/GamePage/index.css:590, 619, 646
 * (themes.scss's own four uses are inside theme blocks that declare the
 * token, so they resolve by construction.) The comment then instructed:
 * "If those are ever fixed, add them to this list."
 *
 * They are now fixed -- quick task `260823-w2f`, closing CR-01's residual --
 * so both are added below and the list is once again exactly the set of
 * guarded consumers, nothing more. `NavTabs` was CR-01's ORIGINAL site: the
 * finding's own consuming line escaped the guard built in its aftermath,
 * which is why the residual survived a green suite for 14 days. The line
 * numbers above are the 34.11-era ones and have since drifted (NavTabs:229 ->
 * :246, GamePage:590/619/646 -> :642/671/698); they are left as written so
 * this comment stays a faithful record of what that review saw.
 */
const NAVBAR_ACTIVE_CONSUMERS = [
  'src/frontend/components/UI/NavShell/components/FilterFacetGroup/index.scss',
  'src/frontend/components/UI/NavShell/components/FilterMoreGroup/index.scss',
  'src/frontend/components/UI/NavShell/components/NavTabs/index.scss',
  'src/frontend/screens/Game/GamePage/index.css',
  'src/frontend/screens/Library/components/FilterChipRow/index.scss',
  'src/frontend/screens/Library/components/FilterZeroResult/index.scss'
]

/**
 * The fallback chain `NavItem/index.scss:21-24` already established for this
 * exact token. Matched as a regex so whitespace/formatting is irrelevant.
 */
const NAVBAR_ACTIVE_FALLBACK_CHAIN =
  /var\(\s*--navbar-active,\s*var\(\s*--accent-overlay,\s*var\(\s*--accent\s*\)\s*\)\s*\)/

/** `--navbar-active` but NOT `--navbar-active-background`. */
const BARE_NAVBAR_ACTIVE = /var\(\s*--navbar-active\s*\)/
const ANY_NAVBAR_ACTIVE = /--navbar-active(?![-\w])/g

/**
 * Returns the declaration body of the FIRST top-level rule whose selector
 * matches exactly, e.g. `.Header`. Brace-counted rather than
 * regex-terminated so a nested block cannot end the match early. Copied
 * verbatim from tier2Portal.test.ts (itself copied from the Login
 * source-gate idiom) rather than factored into a shared util, matching that
 * file's own precedent.
 */
function cssBlock(source: string, selector: string): string {
  const start = source.indexOf(`${selector} {`)
  if (start === -1) {
    throw new Error(`selector ${selector} not found`)
  }
  let depth = 0
  for (let i = source.indexOf('{', start); i < source.length; i++) {
    if (source[i] === '{') depth++
    if (source[i] === '}') {
      depth--
      if (depth === 0) {
        return source.slice(source.indexOf('{', start) + 1, i)
      }
    }
  }
  throw new Error(`unterminated block for ${selector}`)
}

describe('gruvbox_dark theme tokens (CR-01, D-31)', () => {
  const themesScss = read(THEMES_SCSS)
  const block = cssBlock(themesScss, 'body.gruvbox_dark')

  it('extracted a non-empty block (guard against a vacuous cssBlock pass)', () => {
    expect(block.length).toBeGreaterThan(0)
  })

  it('sanity: the extracted block is really gruvbox_dark, not some other block', () => {
    expect(block).toMatch(/--navbar-accent/)
  })

  it('declares its own --navbar-active', () => {
    expect(block).toMatch(/--navbar-active:/)
  })
})

/**
 * WR-13 (34.11 code review). The gate above -- `it('declares its own
 * --navbar-active')` against `body.gruvbox_dark` alone -- read as broad
 * theme coverage while checking exactly one of ten themes. It stayed
 * green while CR-03 shipped: `--navbar-active` is declared in only 4 of the
 * 10 theme blocks, and four new stylesheets consumed it with NO fallback,
 * so in the other 6 themes an undefined custom property made the whole
 * declaration invalid at computed-value time and dropped it. Worst case,
 * `.FilterFacetRow--checked .FilterFacetRow__box` lost BOTH `background` and
 * `border-color` and the checked-checkbox indicator did not render at all.
 *
 * This is the census form the same file already used 80 lines lower for
 * `--divider`, applied to the token that actually needed it. It was proven
 * to FAIL against the pre-fix stylesheets before being accepted.
 */
describe('--navbar-active survives in all 10 themes (WR-13, CR-03)', () => {
  const themesScss = read(THEMES_SCSS)

  it('census: --navbar-active is declared in strictly fewer theme blocks than the file defines -- which is WHY every consumer needs a fallback', () => {
    const declaringCount = themeSelectors.filter((selector) =>
      /--navbar-active:/.test(cssBlock(themesScss, selector))
    ).length

    // Non-vacuity guard: if this ever reads 0 the regex or cssBlock broke,
    // and `toBeLessThan` would pass for the wrong reason.
    expect(declaringCount).toBeGreaterThan(0)
    expect(declaringCount).toBeLessThan(themeSelectors.length)
  })

  it.each(NAVBAR_ACTIVE_CONSUMERS)(
    '%s still consumes --navbar-active at all (guards the two assertions below against a vacuous pass)',
    (relPath) => {
      expect(read(relPath).match(ANY_NAVBAR_ACTIVE) ?? []).not.toHaveLength(0)
    }
  )

  it.each(NAVBAR_ACTIVE_CONSUMERS)(
    '%s never uses the bare var(--navbar-active) form -- that drops the ENTIRE declaration in 7 themes',
    (relPath) => {
      expect(read(relPath)).not.toMatch(BARE_NAVBAR_ACTIVE)
    }
  )

  it.each(NAVBAR_ACTIVE_CONSUMERS)(
    '%s resolves --navbar-active through the same fallback chain NavItem/index.scss already uses',
    (relPath) => {
      expect(read(relPath)).toMatch(NAVBAR_ACTIVE_FALLBACK_CHAIN)
    }
  )

  it('the chain asserted above is the one NavItem actually declares -- not a second, drifting copy of it', () => {
    expect(
      read('src/frontend/components/UI/NavShell/components/NavItem/index.scss')
    ).toMatch(NAVBAR_ACTIVE_FALLBACK_CHAIN)
  })
})

describe('navbar app-region (CR-02, D-32)', () => {
  const navShellScss = read(NAV_SHELL_SCSS)

  it('.NavShell__navbar is a drag region', () => {
    const block = cssBlock(navShellScss, '.NavShell__navbar')
    expect(block).toMatch(/-webkit-app-region:\s*drag/)
  })

  it('has at least two no-drag declarations excluding interactive children', () => {
    const matches = navShellScss.match(/-webkit-app-region:\s*no-drag/g) ?? []
    expect(matches.length).toBeGreaterThanOrEqual(2)
  })

  it('.NavShell__navbar itself does NOT also carry no-drag -- the drag region and its exclusions must be on different selectors, or the last one wins and the whole fix is inert', () => {
    const block = cssBlock(navShellScss, '.NavShell__navbar')
    expect(block).not.toMatch(/no-drag/)
  })
})

describe('tier2 divider (--divider finding, 34.11-09 FIFTH fix -- pseudo-element mechanism, not a border)', () => {
  const navShellScss = read(NAV_SHELL_SCSS)
  const tier2Block = cssBlock(navShellScss, '.NavShell__tier2')

  it('.NavShell__tier2 no longer declares any border-inline-end -- the divider moved to a pseudo-element entirely', () => {
    // History (each superseded for a DIFFERENT, measured reason -- see this
    // declaration's own header comment for the full account): var(--divider)
    // (undefined in 8/10 themes) -> var(--body-background) (colour-identical
    // to the grid side by construction) -> 1px var(--neutral-05) (resolved,
    // real contrast, still reported absent -- Chromium repro ruled out
    // colour/occlusion, pointing at WKWebView's `1fr`-fractional grid-track
    // rounding, App.css:26) -> 2px var(--neutral-05), LIVE-CONFIRMED fixing
    // the rasterisation gap but reported "too heavy" -> 2px var(--neutral-04)
    // (softer, but still 2px, not the 1px hairline the design calls for).
    // This fifth attempt keeps the width battle from repeating a sixth time
    // by leaving the `border-inline-end` mechanism entirely: a border is
    // painted as part of GRID ITEM layout, on the exact seam between two
    // independently-rounded quantities (the grid track's own boundary and
    // the item's own border-box edge) that a fractional-DPR engine could
    // round differently. `border-inline-end` is asserted GONE, not just
    // recoloured, because leaving a stray declaration behind would double up
    // with the new pseudo-element divider below.
    expect(tier2Block).not.toMatch(/border-inline-end/)
  })

  it('.NavShell__tier2 is position: relative -- the containing block the pseudo-element needs', () => {
    expect(tier2Block).toMatch(/position:\s*relative/)
  })

  it('.NavShell__tier2::after paints the divider as an absolutely positioned 1px pseudo-element, flush with the true edge and RTL-safe', () => {
    // `inset-inline-end` (not `right`) is direction-aware, auto-flipping
    // under `.isRTL { direction: rtl }` (App.css:253) the same way
    // `border-inline-end` did -- verified with a Playwright repro forcing
    // `direction: rtl`: the pseudo-element's computed left/right swap
    // correctly with no hand-written direction check. `inset-inline-end: 0`
    // (flush with the edge) was chosen over pulling it 1px inward: both
    // render identically in Chromium (which never reproduced the
    // border-mechanism defect either, so neither result is WKWebView
    // evidence), but 1px inward has a real, visible cost -- a gap of panel
    // colour between the divider and the actual seam -- with no offsetting
    // evidence of benefit.
    const afterBlock = navShellScss.match(
      /\.NavShell__tier2\s*\{[\s\S]*?&::after\s*\{([^}]*)\}/
    )
    expect(afterBlock).not.toBeNull()
    const body = afterBlock?.[1] ?? ''
    expect(body).toMatch(/content:\s*['"]{2}/)
    expect(body).toMatch(/position:\s*absolute/)
    expect(body).toMatch(/inset-block:\s*0/)
    expect(body).toMatch(/inset-inline-end:\s*0/)
    expect(body).toMatch(/width:\s*1px/)
    expect(body).toMatch(/background:\s*var\(--neutral-04\)/)
  })

  it('census: --divider is declared in strictly fewer theme blocks than the file defines -- guards against a future contributor reintroducing it under the mistaken assumption it is universal', () => {
    const themesScss = read(THEMES_SCSS)

    // `themeSelectors` is now declared at module scope (hoisted by WR-13's
    // fix) so this census and the `--navbar-active` census above provably
    // iterate the SAME 10 theme blocks rather than two hand-maintained
    // lists that could drift apart.
    const dividerDeclaringCount = themeSelectors.filter((selector) =>
      /--divider:/.test(cssBlock(themesScss, selector))
    ).length

    expect(dividerDeclaringCount).toBeLessThan(themeSelectors.length)
  })

  it('census: no theme block redeclares --neutral-04 or --neutral-05 -- both must stay the single global unthemed values the contrast measurements were computed against, in every theme, not just the three that were live-swept', () => {
    const themesScss = read(THEMES_SCSS)
    expect(themesScss).not.toMatch(/--neutral-04:/)
    expect(themesScss).not.toMatch(/--neutral-05:/)
  })
})

describe('dracula-only divider override (34.11-09 FIFTH fix, --neutral-04 collision, retargeted at the pseudo-element)', () => {
  const navShellScss = read(NAV_SHELL_SCSS)

  it('body.dracula overrides .NavShell__tier2::after background to var(--neutral-05)', () => {
    // `--navbar-background` (#44475a, dracula's panel colour) and
    // `--neutral-04` (#51595a) share an identical blue channel (90 = 90) --
    // measured at ~1.28:1 against dracula's panel side, and a pixel-level
    // screenshot of this exact collision (both under the border mechanism
    // and again after the pseudo-element switch) showed no perceptible line
    // there at all. `--neutral-05` is the token already proven visible in
    // dracula (4.07:1 / 6.33:1), so the override falls back to it rather
    // than accepting a token with a directly-observed failure in one of the
    // three mandatory sweep themes. Nothing about switching from a border to
    // a pseudo-element changes this collision -- both mechanisms paint the
    // same two RGB values adjacent to each other -- so the exception carries
    // forward unchanged, just retargeted at `::after`.
    const dracula = navShellScss.match(
      /body\.dracula \.NavShell__tier2::after\s*\{([^}]*)\}/
    )
    expect(dracula).not.toBeNull()
    expect(dracula?.[1]).toMatch(/background:\s*var\(--neutral-05\)/)
  })

  it('the override does not need a :not(.NavShell__tier2--collapsed) exclusion -- the collapse rule suppresses the pseudo-element via content: none, which the override cannot out-cascade because the box it would paint never exists', () => {
    const dracula = navShellScss.match(/body\.dracula \.NavShell__tier2::after/)
    expect(dracula).not.toBeNull()
    // Negative half of the same claim: no `:not(...)` guard was added here,
    // because none is needed -- unlike the border-mechanism version of this
    // override, which DID need one (a real specificity bug this project
    // found and fixed in the prior fix).
    const draculaLine = navShellScss.match(
      /body\.dracula \.NavShell__tier2[^\n{,]*/
    )
    expect(draculaLine?.[0]).not.toMatch(/:not\(/)
  })
})

describe('collapse state hides the pseudo-element divider explicitly (34.11-09 FIFTH fix)', () => {
  const navShellScss = read(NAV_SHELL_SCSS)

  it('.NavShell__tier2.NavShell__tier2--collapsed::after sets content: none', () => {
    // `.NavShell__tier2--collapsed { opacity: 0; ... }` already visually
    // hides the pseudo-element as an IMPLICIT side effect (opacity applies
    // to an element's whole rendered result, pseudo-elements included), but
    // that is not an explicit, load-bearing statement of intent -- fragile
    // if `opacity` is ever reworked independently of the divider (e.g. to
    // an animated/partial value). `content: none` makes the pseudo-element
    // not exist at all while collapsed, regardless of any other rule
    // (including the dracula override) that sets its `background`.
    //
    // Chained as `.NavShell__tier2.NavShell__tier2--collapsed` (both classes
    // the element actually carries together, per `NavShell/index.tsx`'s
    // `classNames('NavShell__tier2', { 'NavShell__tier2--collapsed':
    // tier2Collapsed })`), not `.NavShell__tier2--collapsed` alone, so its
    // specificity (two classes) unconditionally beats the base divider
    // rule's `content: ''` (one class) regardless of source order -- the
    // same class of specificity mistake the border-mechanism dracula
    // override made and had to correct (34.11-09's prior fix) is pre-empted
    // here rather than repeated. Verified via the Playwright harness with
    // the collapsed class applied: computed `content` reads `none` and no
    // pixel of the divider colour renders.
    expect(navShellScss).toMatch(
      /\.NavShell__tier2\.NavShell__tier2--collapsed::after\s*\{[^}]*content:\s*none/
    )
  })

  it('.NavShell__tier2--collapsed itself no longer declares border-inline-end-color -- that property has nothing left to do once the border is gone, and a stray declaration here would be dead code', () => {
    const collapsedBlock = cssBlock(navShellScss, '.NavShell__tier2--collapsed')
    expect(collapsedBlock).not.toMatch(/border-inline-end-color/)
  })
})

describe('Header background override was removed alongside the background it neutralised (34.11 WR-19)', () => {
  const navShellScss = read(NAV_SHELL_SCSS)
  const headerCss = read(HEADER_CSS)
  const portalBlock = cssBlock(navShellScss, '.NavShell__tier2Portal')

  it('sanity: the extracted block is really .NavShell__tier2Portal, not some other block', () => {
    expect(portalBlock).toMatch(/overflow-y:\s*auto/)
  })

  it("Header/index.css no longer declares a background on .Header -- 34.11-09's `> .Header { background: transparent }` neutraliser existed only to cancel that declaration, so both were removed together rather than leaving the neutraliser orphaned", () => {
    const headerBlock = cssBlock(headerCss, '.Header')
    expect(headerBlock).not.toMatch(/background:/)
  })

  it('.NavShell__tier2Portal no longer overrides .Header background to transparent -- there is nothing left to neutralise', () => {
    expect(portalBlock).not.toMatch(/>\s*\.Header\s*{[^}]*background:/)
  })
})

/**
 * CR-01 RESIDUAL (quick task `260823-w2f`). The WR-13 census above asserts the
 * token is DECLARED in some themes and that consumers carry a fallback. Neither
 * property is legibility. `body.nord-light` satisfied both and still rendered
 * the selected tab label at **1.18:1** -- `--navbar-active: #d0ddff` on
 * `--body-background: #eceff4` -- because it is the only LIGHT theme in the
 * set. Everywhere else the navbar and body surfaces are both dark, so a single
 * navbar-surface token coincidentally serves the body-surface element too.
 *
 * A gate that names a landmark (a token, a theme) cannot see that. This one
 * asserts the PROPERTY: resolve the colour NavTabs actually paints, per theme,
 * through the same `var()` chain the browser would, and measure it against the
 * surface the same rule paints beneath it.
 *
 * The chain is READ FROM THE STYLESHEET, never hardcoded here -- if someone
 * edits the declaration, this test follows it rather than silently testing a
 * copy that no longer ships.
 */
const COLORS_SCSS = 'src/frontend/styles/_colors.scss'
const NAV_TABS_SCSS =
  'src/frontend/components/UI/NavShell/components/NavTabs/index.scss'

/** Top-level `--x: value;` pairs of a block body, ignoring nested rules. */
const customProps = (blockBody: string): Map<string, string> => {
  const out = new Map<string, string>()
  let depth = 0
  let buf = ''
  for (const ch of blockBody) {
    if (ch === '{') {
      depth++
      buf = ''
    } else if (ch === '}') {
      depth--
      buf = ''
    } else if (ch === ';' && depth === 0) {
      const m = /^\s*(--[\w-]+)\s*:\s*([\s\S]+)$/.exec(buf)
      if (m) out.set(m[1], m[2].trim().replace(/\s+/g, ' '))
      buf = ''
    } else {
      buf += ch
    }
  }
  return out
}

/**
 * Global tokens (`--neutral-*`, `--brand-*`) live in `styles/_colors.scss`, NOT
 * in themes.scss. Omitting them makes every midnightMirage chain resolve to
 * nothing, which reads as "no data" rather than as an error -- a silent way for
 * this whole census to go vacuous. Asserted non-empty below.
 */
const globalTokens = (): Map<string, string> => {
  const src = read(COLORS_SCSS)
  const out = new Map<string, string>()
  for (const m of src.matchAll(/(--[\w-]+)\s*:\s*([^;{}]+);/g)) {
    if (!out.has(m[1])) out.set(m[1], m[2].trim())
  }
  return out
}

/**
 * Every block matching `selector`, merged last-wins. Re-verified 2026-10-04
 * (quick task 261004-bz3, after collapsing the comma-joined groups to single
 * selectors): none of the 10 surviving themes is declared twice in
 * themes.scss -- each `body.<theme> {` now appears exactly once. The merge
 * (rather than a single-match lookup) is kept anyway as a defensive measure
 * against a future theme block being accidentally split across two rules,
 * not because any live duplicate exists today.
 */
const allBlocksFor = (source: string, selector: string): string[] => {
  // Matching the literal `selector {` is what excludes descendant rules such
  // as `body.zombie .alphabet-filter-button--active {`, which would otherwise
  // false-match a prefix search for `body.zombie`.
  const needle = `${selector} {`
  const out: string[] = []
  let from = 0
  for (;;) {
    const start = source.indexOf(needle, from)
    if (start === -1) break
    let depth = 0
    let i = source.indexOf('{', start)
    const open = i
    for (; i < source.length; i++) {
      if (source[i] === '{') depth++
      else if (source[i] === '}' && --depth === 0) break
    }
    if (depth !== 0) throw new Error(`unterminated block for ${selector}`)
    out.push(source.slice(open + 1, i))
    from = i
  }
  if (out.length === 0) throw new Error(`selector ${selector} not found`)
  return out
}

const themeTokens = (
  themesScss: string,
  selector: string
): Map<string, string> => {
  const merged = new Map(customProps(cssBlock(themesScss, 'body')))
  for (const body of allBlocksFor(themesScss, selector))
    for (const [k, v] of customProps(body)) merged.set(k, v)
  return merged
}

/** Resolve a `var()` chain to a literal, following fallbacks exactly as CSS does. */
const resolveValue = (
  value: string,
  scope: Map<string, string>,
  globals: Map<string, string>,
  seen = new Set<string>()
): string | null => {
  const v = value.trim()
  const m = /^var\(\s*(--[\w-]+)\s*(?:,\s*([\s\S]+))?\)$/.exec(v)
  if (!m) return v
  const [, name, fallback] = m
  if (!seen.has(name)) {
    const next = scope.get(name) ?? globals.get(name)
    if (next !== undefined) {
      const r = resolveValue(next, scope, globals, new Set(seen).add(name))
      if (r !== null) return r
    }
  }
  return fallback ? resolveValue(fallback, scope, globals, seen) : null
}

const NAMED_COLOURS: Record<string, string> = {
  white: '#ffffff',
  black: '#000000',
  // CSS `gray` -- what --border-color and three themes' --divider resolve to.
  gray: '#808080'
}

const toRgb = (colour: string): [number, number, number] | null => {
  const c = (NAMED_COLOURS[colour.toLowerCase()] ?? colour).trim()
  const m = /^#([0-9a-f]{3,8})$/i.exec(c)
  if (!m) return null
  let hex = m[1]
  if (hex.length === 3)
    hex = hex
      .split('')
      .map((ch) => ch + ch)
      .join('')
  if (hex.length === 8) hex = hex.slice(0, 6) // opaque alpha
  if (hex.length !== 6) return null
  return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [
    number,
    number,
    number
  ]
}

const relativeLuminance = ([r, g, b]: [number, number, number]): number => {
  const lin = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

const contrastRatio = (fg: string, bg: string): number => {
  const a = toRgb(fg)
  const b = toRgb(bg)
  if (!a || !b) throw new Error(`uncomparable colours: ${fg} / ${bg}`)
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort(
    (x, y) => y - x
  )
  return (hi + 0.05) / (lo + 0.05)
}

/**
 * The `color:` NavTabs paints on the selected tab, as authored. Prefers a
 * theme-scoped override (`body.nord-light ... &.Mui-selected`) over the base
 * rule, mirroring the cascade.
 */
const selectedTabColourDecl = (
  navTabsScss: string,
  themeClass: string
): string => {
  // No `s` flag: every quantifier below is a negated character class, which
  // already spans newlines. The flag would need `target: es2018` (TS1501).
  const scoped = new RegExp(
    `body\\.${themeClass}[^{]*\\{[^}]*?color:\\s*([^;]+);`
  ).exec(navTabsScss)
  if (scoped) return scoped[1].trim()
  const base = /&\.Mui-selected\s*\{[^}]*?color:\s*([^;]+);/.exec(navTabsScss)
  if (!base) throw new Error('no .Mui-selected color declaration in NavTabs')
  return base[1].trim()
}

describe('selected NavTab label contrast in every theme (CR-01 residual)', () => {
  const themesScss = read(THEMES_SCSS)
  const navTabsScss = read(NAV_TABS_SCSS)
  const globals = globalTokens()

  it('non-vacuity: global token table and the base declaration both resolved', () => {
    expect(globals.size).toBeGreaterThan(0)
    expect(globals.has('--neutral-01')).toBe(true)
    expect(selectedTabColourDecl(navTabsScss, '__no_such_theme__')).toMatch(
      /var\(\s*--navbar-active/
    )
  })

  it.each(themeSelectors)(
    '%s paints the selected tab label at >= 4.5:1 against its own --body-background',
    (selector) => {
      const themeClass = selector.replace(/^body\./, '')
      const scope = themeTokens(themesScss, selector)
      const decl = selectedTabColourDecl(navTabsScss, themeClass)
      const fg = resolveValue(decl, scope, globals)
      const bg = resolveValue(
        scope.get('--body-background') ?? '',
        scope,
        globals
      )
      // A dropped declaration (null) is the CR-01 failure mode itself: an
      // undefined custom property with no fallback invalidates `color` at
      // computed-value time and the label inherits. Fail loudly, do not skip.
      expect(fg).not.toBeNull()
      expect(bg).not.toBeNull()
      expect(contrastRatio(fg as string, bg as string)).toBeGreaterThanOrEqual(
        4.5
      )
    }
  )
})

/**
 * `--border-color` is a STRUCTURAL edge (WineManager rows and table, the
 * Popover frame, the SteamGridDB picker's header rule) and must be visible on
 * the surfaces those consumers sit on. Todo 2026-10-02
 * (border-color-resolves-to-an-invisible-grey-in-ten-themes): the old
 * declaration `var(--divider, var(--neutral-03))` resolved in every theme --
 * nothing broke -- to `#272f31` in most of them, measured 1.04:1 (dracula) to
 * 1.48:1 (sweet) against `--body-background`. Resolution is not visibility,
 * so this census measures the resolved PAIR, through the same var() chain the
 * browser follows, against WCAG 1.4.11's 3:1 non-text floor. It cannot see a
 * pixel (no CSS engine here); a live look across midnightMirage /
 * gruvbox_dark / dracula is still what adjudicates appearance.
 */
describe('--border-color is visible in every theme (3:1 non-text floor)', () => {
  const themesScss = read(THEMES_SCSS)
  const globals = globalTokens()

  it.each(themeSelectors)(
    '%s paints --border-color at >= 3:1 against --body-background and --modal-background',
    (selector) => {
      const scope = themeTokens(themesScss, selector)
      const border = resolveValue('var(--border-color)', scope, globals)
      expect(border).not.toBeNull()
      for (const surface of ['--body-background', '--modal-background']) {
        const bg = resolveValue(`var(${surface})`, scope, globals)
        expect(bg).not.toBeNull()
        const ratio = contrastRatio(border as string, bg as string)
        // Object form so a failure names the surface and the measured ratio.
        expect({ surface, ratio, passes: ratio >= 3 }).toEqual({
          surface,
          ratio,
          passes: true
        })
      }
    }
  )
})

/**
 * Depth-0 `prop: value` declarations of a block body, in source order, with
 * nested rules skipped (the `customProps` loop shape, but matching a NAMED
 * property instead of a custom property). `prop` is matched whole from the
 * start of the statement, so `color` never matches inside `background-color`.
 */
const declsAtDepthZero = (blockBody: string, prop: string): string[] => {
  const out: string[] = []
  const pattern = new RegExp(String.raw`^\s*${prop}\s*:\s*([\s\S]+)$`)
  const take = (statement: string) => {
    const m = pattern.exec(statement)
    if (m) out.push(m[1].trim().replace(/\s+/g, ' '))
  }
  let depth = 0
  let buf = ''
  for (const ch of blockBody) {
    if (ch === '{') {
      depth++
      buf = ''
    } else if (ch === '}') {
      depth--
      buf = ''
    } else if (ch === ';' && depth === 0) {
      take(buf)
      buf = ''
    } else if (depth === 0) {
      buf += ch
    }
  }
  take(buf) // a final declaration may omit its `;`
  return out
}

/** A literal that cannot let anything show through: hex without alpha, or a named colour. */
const isOpaqueColour = (colour: string): boolean => {
  if (Object.prototype.hasOwnProperty.call(NAMED_COLOURS, colour.toLowerCase()))
    return true
  const m = /^#([0-9a-f]+)$/i.exec(colour.trim())
  if (!m) return false
  const hex = m[1]
  if (hex.length === 3 || hex.length === 6) return true
  return hex.length === 8 && hex.slice(6).toLowerCase() === 'ff'
}

const FOCUS_ROW_STRIP_CSS =
  'src/frontend/screens/Library/components/FocusRowStrip/index.css'

/**
 * G-48-4a (48-11 Task 1): the strip's chevron glyph versus its OWN disc, in
 * every theme, at WCAG 2.2 SC 1.4.11's 3:1 (the bar 48-08 adopted).
 *
 * The 55% `color-mix` scrim this replaces measured below 3:1 in 12 of 40
 * theme x card x edge combinations, minimum 1.005 in gruvbox_dark (UAT item 4):
 * a flat alpha over arbitrary artwork cannot bound the ratio, because bright
 * art behind it leaves a mid grey that any mid-luminance accent fails against.
 * With ONE opaque `var(--body-background)` paint the only neighbour of the
 * glyph inside the circle is the theme's body colour, so the ratio is a
 * property of the theme, not of the artwork -- which is what this census can
 * resolve from the shipped declarations through the same var() chain the
 * browser follows (the NavTab and `--border-color` censuses' resolver).
 *
 * What it cannot prove: the disc's own edge against the art, and rendered
 * pixels (no CSS engine here). UAT item 10 owns those.
 */
describe('FocusRowStrip chevron disc: glyph vs disc is >= 3:1 in every theme (G-48-4a)', () => {
  const themesScss = read(THEMES_SCSS)
  const stripCss = read(FOCUS_ROW_STRIP_CSS)
  const control = cssBlock(stripCss, '.focusRowStrip__control')
  const globals = globalTokens()
  const colourDecls = declsAtDepthZero(control, 'color')
  const discDecls = [
    ...declsAtDepthZero(control, 'background'),
    ...declsAtDepthZero(control, 'background-color')
  ]

  it('non-vacuity: one glyph colour (--accent) and exactly one opaque --body-background disc declaration', () => {
    expect(globals.size).toBeGreaterThan(0)
    expect(colourDecls).toEqual(['var(--accent)'])
    expect(discDecls).toHaveLength(1)
    expect(discDecls[0]).toMatch(/^var\(\s*--body-background\b/)
    expect(discDecls[0]).not.toMatch(
      /color-mix\(|rgba?\(|hsla?\(|transparent|gradient/i
    )
  })

  it.each(themeSelectors)(
    '%s paints the chevron glyph at >= 3:1 against its opaque disc',
    (selector) => {
      const scope = themeTokens(themesScss, selector)
      const glyph = resolveValue(colourDecls[0] ?? '', scope, globals)
      const disc = resolveValue(discDecls[0] ?? '', scope, globals)
      // An unresolved token fails the case; it never skips it.
      expect(glyph).not.toBeNull()
      expect(disc).not.toBeNull()
      expect({
        selector,
        disc,
        opaque: isOpaqueColour(disc as string)
      }).toEqual({
        selector,
        disc,
        opaque: true
      })
      const ratio = contrastRatio(glyph as string, disc as string)
      // Object form so a failure names the theme and the measured ratio.
      expect({ selector, ratio, passes: ratio >= 3 }).toEqual({
        selector,
        ratio,
        passes: true
      })
    }
  )
})

/** Depth-0 nested rules of a block body: `{ selector, body }` pairs. */
const nestedRules = (
  blockBody: string
): { selector: string; body: string }[] => {
  const out: { selector: string; body: string }[] = []
  let depth = 0
  let buf = ''
  let selector = ''
  let bodyStart = 0
  for (let i = 0; i < blockBody.length; i++) {
    const ch = blockBody[i]
    if (ch === '{') {
      if (depth === 0) {
        selector = buf.trim()
        bodyStart = i + 1
      }
      depth++
    } else if (ch === '}') {
      depth--
      if (depth === 0) {
        out.push({ selector, body: blockBody.slice(bodyStart, i) })
        buf = ''
      }
    } else if (depth === 0) {
      buf = ch === ';' ? '' : buf + ch
    }
  }
  return out
}

const FILTER_FOCUS_ROW_SCSS =
  'src/frontend/components/UI/NavShell/components/FilterFocusRow/index.scss'

/**
 * The `color:` the FOCUS ROW divider paints in `themeClass`, as authored.
 * Mirrors `selectedTabColourDecl`: a nested rule whose selector LIST names
 * `body.<theme> &` wins over the base block's depth-0 `color`. The selector
 * list is split on commas and compared whole, so `nord-light` can never match
 * a `body.nord-dark &` entry (or the reverse).
 */
const dividerColourDecl = (
  filterFocusRowScss: string,
  themeClass: string
): string => {
  const block = cssBlock(filterFocusRowScss, '.FilterFocusRow__divider')
  const override = nestedRules(block).find((rule) =>
    rule.selector
      .split(',')
      .map((s) => s.trim())
      .includes(`body.${themeClass} &`)
  )
  const decls = declsAtDepthZero(override ? override.body : block, 'color')
  if (decls.length !== 1)
    throw new Error(
      `expected exactly one depth-0 color in the ${themeClass} divider rule, found ${decls.length}`
    )
  return decls[0]
}

/**
 * G-48-7 (48-11 Task 2): the FOCUS ROW divider labels versus the tier-2
 * panel's `--navbar-background`, in every theme, at WCAG 2.2 SC 1.4.3's 4.5:1
 * (the bar 48-08 adopted; the labels are small `--text-xs` text).
 *
 * Replaces the live numbers of UAT item 7 -- dracula 4.25, nord-light 1.52 --
 * which this resolver reproduced within 0.02 at plan time (dracula 4.27,
 * nord-light 1.52). nord-light fails structurally: it is the only light
 * theme, so its dark `--text-secondary` sits on a dark navbar. The fix is a
 * measured per-theme override for exactly those two themes; this census holds
 * all ten, so the eight unchanged themes cannot regress unseen.
 *
 * Like the other censuses it reads the declarations from the shipped
 * stylesheets and cannot see a pixel; UAT item 10 owns the live recheck.
 */
describe('FocusRowStrip FOCUS ROW divider labels are >= 4.5:1 on the tier-2 panel in every theme (G-48-7)', () => {
  const themesScss = read(THEMES_SCSS)
  const filterFocusRowScss = read(FILTER_FOCUS_ROW_SCSS)
  const navShellScss = read(NAV_SHELL_SCSS)
  const globals = globalTokens()
  const panelDecls = declsAtDepthZero(
    cssBlock(navShellScss, '.NavShell__tier2'),
    'background'
  )

  it('non-vacuity: base colour, the two-theme override set, and the panel surface', () => {
    const themeClasses = themeSelectors.map((s) => s.replace(/^body\./, ''))
    expect(
      declsAtDepthZero(
        cssBlock(filterFocusRowScss, '.FilterFocusRow__divider'),
        'color'
      )
    ).toEqual(['var(--text-secondary)'])
    const overridden = themeClasses.filter(
      (t) =>
        dividerColourDecl(filterFocusRowScss, t) !== 'var(--text-secondary)'
    )
    expect(overridden).toEqual(['dracula', 'nord-light'])
    expect(panelDecls).toEqual(['var(--navbar-background)'])
  })

  it.each(themeSelectors)(
    '%s paints the divider label at >= 4.5:1 against --navbar-background',
    (selector) => {
      const themeClass = selector.replace(/^body\./, '')
      const scope = themeTokens(themesScss, selector)
      const fg = resolveValue(
        dividerColourDecl(filterFocusRowScss, themeClass),
        scope,
        globals
      )
      const bg = resolveValue(panelDecls[0] ?? '', scope, globals)
      // An unresolved token fails the case; it never skips it.
      expect(fg).not.toBeNull()
      expect(bg).not.toBeNull()
      const ratio = contrastRatio(fg as string, bg as string)
      // Object form so a failure names the theme and the measured ratio.
      expect({ selector, ratio, passes: ratio >= 4.5 }).toEqual({
        selector,
        ratio,
        passes: true
      })
    }
  )
})

const WINETRICKS_STICKY_BAR_SCSS =
  'src/frontend/screens/Settings/sections/WinetricksSettings/StickyBar/index.scss'
const WINETRICKS_APPLY_SELECTOR =
  '.WinetricksStickyBar .WinetricksStickyBar__apply'

/**
 * The `color:` the ENABLED Apply button paints in `themeClass`, as authored.
 * Mirrors `selectedTabColourDecl`: a nested `body.<theme> &:not(:disabled)`
 * override inside the Apply block wins over the block's own depth-0 `color`.
 * No `s` flag: the inner capture is a negated character class, which already
 * spans newlines (see the TS1501 note above `selectedTabColourDecl`).
 */
/**
 * Every nested selector inside the Apply block body that scopes to a theme
 * (`body.<theme> ...`) but does NOT end with `&:not(:disabled)` -- i.e.
 * would also apply to the disabled Apply button. An empty array means every
 * theme override is correctly guarded. Factored out so Test C (the real
 * stylesheet) and Test D (an in-memory-sabotaged copy, no file mutation)
 * share one checker, and Test D proves Test C can actually fail.
 */
const themeOverridesMissingNotDisabled = (applyBody: string): string[] =>
  nestedRules(applyBody)
    .map((rule) => rule.selector)
    .filter((selector) => selector.startsWith('body.'))
    .filter((selector) => !selector.endsWith('&:not(:disabled)'))

const applyTextColourDecl = (applyBody: string, themeClass: string): string => {
  const scoped = new RegExp(
    `body\\.${themeClass}\\s*&:not\\(:disabled\\)\\s*\\{([^}]*)\\}`
  ).exec(applyBody)
  if (scoped) {
    const decls = declsAtDepthZero(scoped[1], 'color')
    if (decls.length !== 1)
      throw new Error(
        `expected exactly one depth-0 color in the ${themeClass} Apply override, found ${decls.length}`
      )
    return decls[0]
  }
  const base = declsAtDepthZero(applyBody, 'color')
  if (base.length !== 1)
    throw new Error(
      `expected exactly one depth-0 base color in the Apply block, found ${base.length}`
    )
  return base[0]
}

/**
 * Per-theme WCAG 1.4.3 census for the Winetricks sticky bar's ENABLED Apply
 * button (todo 2026-10-11, live gate 45-12 G7: 1.52:1 nord-light, 1.01:1
 * midnightMirage).
 *
 * Lives here, not beside the stylesheet, because the cross-theme `var()`
 * resolver and contrast helpers above are module-private to this file -- the
 * `--border-color` census above is likewise not NavShell-specific.
 *
 * Reads the authored declarations FROM the stylesheet on every run; never a
 * hardcoded copy of them.
 *
 * Like every census in this file it cannot see a pixel: no CSS engine runs
 * under the node test environment, so a live capture still adjudicates
 * appearance.
 */
describe('Winetricks enabled Apply text contrast in every theme (45-12 G7)', () => {
  const themesScss = read(THEMES_SCSS)
  const stickyBarScss = read(WINETRICKS_STICKY_BAR_SCSS)
  const globals = globalTokens()
  const applyBody = cssBlock(stickyBarScss, WINETRICKS_APPLY_SELECTOR)

  it('non-vacuity: global tokens, the base declarations, and the gruvbox_dark override all resolve', () => {
    expect(globals.size).toBeGreaterThan(0)
    expect(applyBody.length).toBeGreaterThan(0)
    const bgDecls = declsAtDepthZero(applyBody, 'background')
    expect(bgDecls).toHaveLength(1)
    expect(bgDecls[0]).toMatch(/var\(\s*--accent/)
    expect(declsAtDepthZero(applyBody, 'color')).toHaveLength(1)
    const scoped = new RegExp(
      `body\\.gruvbox_dark\\s*&:not\\(:disabled\\)\\s*\\{([^}]*)\\}`
    ).exec(applyBody)
    expect(scoped).not.toBeNull()
    expect(
      declsAtDepthZero((scoped as RegExpExecArray)[1], 'color')
    ).toHaveLength(1)
  })

  it.each(themeSelectors)(
    '%s paints the enabled Apply text at >= 4.5:1 against its own accent fill',
    (selector) => {
      const theme = selector.replace(/^body\./, '')
      const scope = themeTokens(themesScss, selector)
      const fg = resolveValue(
        applyTextColourDecl(applyBody, theme),
        scope,
        globals
      )
      const bg = resolveValue(
        declsAtDepthZero(applyBody, 'background')[0] ?? '',
        scope,
        globals
      )
      expect(fg).not.toBeNull()
      expect(bg).not.toBeNull()
      const ratio = contrastRatio(fg as string, bg as string)
      // Object form so a failure names the theme and the measured ratio.
      expect({ theme, fg, bg, ratio, passes: ratio >= 4.5 }).toEqual({
        theme,
        fg,
        bg,
        ratio,
        passes: true
      })
    }
  )

  it('the pre-fix pair fails 4.5:1 in the two themes the live gate sampled', () => {
    // The literal old declarations (before this quick task's fix), resolved
    // through the SAME themeTokens + globals + resolveValue path the gate
    // above uses. Proves the gate detects the exact reported defect, not
    // merely some unrelated failure. 1.01/1.52 need not match the capture's
    // numbers exactly -- token resolution and pixel sampling differ -- only
    // the pass/fail side of 4.5 matters.
    const OLD_APPLY_COLOR = 'var(--text-default, #ffffff)'
    const APPLY_BACKGROUND = 'var(--accent, #0080ff)'
    for (const selector of ['body.nord-light', 'body.midnightMirage']) {
      const scope = themeTokens(themesScss, selector)
      const fg = resolveValue(OLD_APPLY_COLOR, scope, globals)
      const bg = resolveValue(APPLY_BACKGROUND, scope, globals)
      expect(fg).not.toBeNull()
      expect(bg).not.toBeNull()
      const ratio = contrastRatio(fg as string, bg as string)
      // Object form so a failure names the theme and the measured ratio.
      expect({ selector, ratio, passes: ratio < 4.5 }).toEqual({
        selector,
        ratio,
        passes: true
      })
    }
  })

  it('the gruvbox_dark override is load-bearing', () => {
    // The depth-0 BASE color, deliberately NOT the override, against the
    // base background. If this resolves >= 4.5, gruvbox's tokens changed
    // and the override (and this test) should be deleted, not re-pinned.
    const scope = themeTokens(themesScss, 'body.gruvbox_dark')
    const baseColour = declsAtDepthZero(applyBody, 'color')[0]
    const baseBackground = declsAtDepthZero(applyBody, 'background')[0]
    const fg = resolveValue(baseColour, scope, globals)
    const bg = resolveValue(baseBackground, scope, globals)
    expect(fg).not.toBeNull()
    expect(bg).not.toBeNull()
    const ratio = contrastRatio(fg as string, bg as string)
    expect({
      ratio,
      passes: ratio < 4.5,
      note: "if this goes red, gruvbox's tokens changed so the base pair now passes -- delete the override and this test, do not re-pin it"
    }).toEqual({
      ratio,
      passes: true,
      note: "if this goes red, gruvbox's tokens changed so the base pair now passes -- delete the override and this test, do not re-pin it"
    })
  })

  it('a theme override cannot reach disabled Apply', () => {
    const themeOverrideSelectors = nestedRules(applyBody)
      .map((rule) => rule.selector)
      .filter((selector) => selector.startsWith('body.'))
    expect(themeOverrideSelectors.length).toBeGreaterThan(0)
    expect(themeOverrideSelectors).toContain(
      'body.gruvbox_dark &:not(:disabled)'
    )
    expect(themeOverridesMissingNotDisabled(applyBody)).toEqual([])

    const disabledRule = nestedRules(applyBody).find(
      (rule) => rule.selector === '&:disabled'
    )
    expect(disabledRule).not.toBeUndefined()
    const disabledBody = (disabledRule as { selector: string; body: string })
      .body
    expect(declsAtDepthZero(disabledBody, 'background')).toEqual([
      'transparent'
    ])
    const disabledColourDecls = declsAtDepthZero(disabledBody, 'color')
    expect(disabledColourDecls).toHaveLength(1)
    const scope = themeTokens(themesScss, 'body.gruvbox_dark')
    expect(resolveValue(disabledColourDecls[0], scope, globals)).toEqual(
      resolveValue('var(--text-secondary, #a8aeaf)', scope, globals)
    )
  })

  it('checker can fail: dropping :not(:disabled) from the override is caught, in memory only', () => {
    // The tokenCensus.test.ts sabotage idiom: mutate a STRING copy, never the
    // file on disk. The literal "&:not(:disabled)" appears exactly once in
    // the Apply block (the gruvbox override selector), so this targets it.
    const sabotaged = applyBody.replace('&:not(:disabled)', '&')
    expect(themeOverridesMissingNotDisabled(sabotaged)).toEqual([
      'body.gruvbox_dark &'
    ])
  })
})

const LIBRARY_SIGN_IN_NOTICE_SCSS =
  'src/frontend/screens/Library/components/LibrarySignInNotice/index.scss'

/**
 * The body of the rule reached by walking `path` down from the
 * `.LibrarySignInNotice` block: each step selects the depth-0 nested rule whose
 * selector equals that string exactly. Throws, naming the joined path, when a
 * step finds no rule -- a renamed selector fails loudly instead of the gate
 * quietly measuring nothing.
 */
const signInNoticeRule = (noticeScss: string, path: string[]): string => {
  let body = cssBlock(noticeScss, '.LibrarySignInNotice')
  for (const selector of path) {
    const next = nestedRules(body).find((rule) => rule.selector === selector)
    if (!next)
      throw new Error(`no rule ${path.join(' ')} in the sign-in notice`)
    body = next.body
  }
  return body
}

/**
 * Every foreground the sign-in row paints, and the single value it must carry
 * so that the row's own text colour governs it: the store logo, the footer
 * button label and the dismiss glyph inherit, and the in-row footer button is
 * transparent so its label sits on the banner whichever stylesheet loaded
 * first.
 */
const SIGN_IN_ROW_FOREGROUNDS: readonly {
  path: string[]
  prop: string
  want: string
}[] = [
  { path: ['&__row', '.button.is-footer'], prop: 'color', want: 'inherit' },
  {
    path: ['&__row', '.button.is-footer'],
    prop: 'background-color',
    want: 'transparent'
  },
  {
    path: ['&__row--notConnected', '.LibrarySignInNotice__icon'],
    prop: 'color',
    want: 'inherit'
  },
  { path: ['&__dismiss'], prop: 'color', want: 'inherit' }
]

/**
 * The foregrounds in SIGN_IN_ROW_FOREGROUNDS that do NOT carry their required
 * value, as `<path> <prop>` strings in table order. Takes the whole stylesheet
 * string so a test can hand it an in-memory sabotaged copy.
 */
const signInForegroundsNotInheriting = (noticeScss: string): string[] =>
  SIGN_IN_ROW_FOREGROUNDS.filter(
    ({ path, prop, want }) =>
      JSON.stringify(
        declsAtDepthZero(signInNoticeRule(noticeScss, path), prop)
      ) !== JSON.stringify([want])
  ).map(({ path, prop }) => `${path.join(' ')} ${prop}`)

/**
 * Per-theme WCAG 1.4.3 census for the Library sign-in row (F-49-R1-6, Phase 49
 * macOS live gate Run 1 item 10b): nord_light's not-connected row read as
 * black text on a dark banner, while midnightMirage, gruvbox_dark and dracula
 * were judged pass.
 *
 * nord-light is the one theme whose navbar surface is dark against a light
 * page, so a BODY text token painted on that surface fails there
 * structurally -- the other nine pass only because their navbar and body
 * surfaces are both dark. This is the shape G-48-7 recorded for the FOCUS ROW
 * divider.
 *
 * It reads the authored declarations FROM the stylesheet on every run, never a
 * hardcoded copy of them, and it holds every foreground on the row to
 * inheriting the one measured colour.
 *
 * Like every census in this file it cannot see a pixel, so the operator's next
 * macOS launch adjudicates appearance.
 */
describe('Library sign-in row text contrast in every theme (F-49-R1-6)', () => {
  const themesScss = read(THEMES_SCSS)
  const noticeScss = read(LIBRARY_SIGN_IN_NOTICE_SCSS)
  const globals = globalTokens()
  const rowBody = signInNoticeRule(noticeScss, ['&__row'])

  it('non-vacuity: global tokens, the authored row pair, and no modifier that repaints the row', () => {
    expect(globals.size).toBeGreaterThan(0)
    expect(declsAtDepthZero(rowBody, 'background')).toEqual([
      'var(--navbar-background)'
    ])
    expect(declsAtDepthZero(rowBody, 'background-color')).toEqual([])
    expect(declsAtDepthZero(rowBody, 'color')).toEqual([
      'var(--navbar-inactive, var(--navbar-accent))'
    ])
    const notConnected = signInNoticeRule(noticeScss, ['&__row--notConnected'])
    expect(declsAtDepthZero(notConnected, 'color')).toEqual([])
    expect(declsAtDepthZero(notConnected, 'background')).toEqual([])
    expect(declsAtDepthZero(notConnected, 'background-color')).toEqual([])
    expect(
      nestedRules(cssBlock(noticeScss, '.LibrarySignInNotice'))
        .map((rule) => rule.selector)
        .filter((selector) => selector.startsWith('&__row--expired'))
    ).toEqual(['&__row--expired > svg'])
  })

  it.each(themeSelectors)(
    '%s paints the sign-in row text at >= 4.5:1 against the banner',
    (selector) => {
      const theme = selector.replace(/^body\./, '')
      const scope = themeTokens(themesScss, selector)
      const fg = resolveValue(
        declsAtDepthZero(rowBody, 'color')[0] ?? '',
        scope,
        globals
      )
      const bg = resolveValue(
        declsAtDepthZero(rowBody, 'background')[0] ?? '',
        scope,
        globals
      )
      // An unresolved token fails the case; it never skips it.
      expect(fg).not.toBeNull()
      expect(bg).not.toBeNull()
      const ratio = contrastRatio(fg as string, bg as string)
      // Object form so a failure names the theme and the measured ratio.
      expect({ theme, fg, bg, ratio, passes: ratio >= 4.5 }).toEqual({
        theme,
        fg,
        bg,
        ratio,
        passes: true
      })
    }
  )

  it("every foreground on the row inherits the row's text colour", () => {
    expect(signInForegroundsNotInheriting(noticeScss)).toEqual([])
  })

  it("the pre-fix pair reproduces the operator's live verdicts", () => {
    // The LITERAL pre-fix colour, resolved against the row's authored
    // background through the SAME themeTokens + globals + resolveValue path the
    // gate above uses. nord_light was judged fail on the live gate;
    // midnightMirage, gruvbox_dark and dracula were judged pass. Only the side
    // of 4.5 matters, not the exact ratio a pixel capture would give.
    const OLD_ROW_COLOR = 'var(--text-default)'
    const background = declsAtDepthZero(rowBody, 'background')[0] ?? ''
    const expected = [
      ['body.nord-light', 'fail'],
      ['body.midnightMirage', 'pass'],
      ['body.gruvbox_dark', 'pass'],
      ['body.dracula', 'pass']
    ] as const
    for (const [selector, verdict] of expected) {
      const scope = themeTokens(themesScss, selector)
      const fg = resolveValue(OLD_ROW_COLOR, scope, globals)
      const bg = resolveValue(background, scope, globals)
      expect(fg).not.toBeNull()
      expect(bg).not.toBeNull()
      const ratio = contrastRatio(fg as string, bg as string)
      // Object form so a failure names the theme and the measured ratio.
      expect({
        selector,
        ratio,
        verdict: ratio >= 4.5 ? 'pass' : 'fail'
      }).toEqual({ selector, ratio, verdict })
    }
  })

  it('checker can fail: restoring a pre-fix foreground is caught, in memory only', () => {
    // The tokenCensus.test.ts sabotage idiom: mutate a STRING copy, never the
    // file on disk. split/join rather than replaceAll so the tsconfig lib
    // target cannot matter. The counts first, so the sabotage is not vacuous.
    expect(noticeScss.split('color: inherit').length - 1).toBe(3)
    expect(noticeScss.split('background-color: transparent').length - 1).toBe(1)
    const colourSabotaged = noticeScss
      .split('color: inherit')
      .join('color: var(--text-default)')
    expect(signInForegroundsNotInheriting(colourSabotaged)).toEqual([
      '&__row .button.is-footer color',
      '&__row--notConnected .LibrarySignInNotice__icon color',
      '&__dismiss color'
    ])
    const fillSabotaged = noticeScss
      .split('background-color: transparent')
      .join('background-color: var(--primary)')
    expect(signInForegroundsNotInheriting(fillSabotaged)).toEqual([
      '&__row .button.is-footer background-color'
    ])
  })
})

const WINETRICKS_INDEX_SCSS =
  'src/frontend/screens/Settings/sections/WinetricksSettings/index.scss'
const WINETRICKS_ROW_SCSS =
  'src/frontend/screens/Settings/sections/WinetricksSettings/Row/index.scss'
const WINETRICKS_LOG_PANEL_SCSS =
  'src/frontend/screens/Settings/sections/WinetricksSettings/LogPanel/index.scss'

/**
 * Mixes two colours already resolved to a `toRgb`-acceptable literal, channel
 * by channel, as `weightA·a + (1-weightA)·b` (weightA a 0-1 fraction).
 * Rounded to the nearest integer per channel and returned as a 6-digit
 * lowercase hex string. Shared by the `color-mix(in srgb, ...)` resolver
 * below and by the hovered-row-surface compositing in `rowSurfaces`, which is
 * the same arithmetic applied to an opacity/`currentColor` composite instead
 * of an authored percentage.
 */
const mixSrgb = (a: string, b: string, weightA: number): string => {
  const rgbA = toRgb(a)
  const rgbB = toRgb(b)
  if (!rgbA || !rgbB) {
    throw new Error(`mixSrgb: uncomparable colours: ${a} / ${b}`)
  }
  const mixed = rgbA.map((channelA, i) =>
    Math.round(channelA * weightA + rgbB[i] * (1 - weightA))
  )
  return (
    '#' + mixed.map((channel) => channel.toString(16).padStart(2, '0')).join('')
  )
}

/**
 * Splits a `color-mix()` argument list on TOP-LEVEL commas only, tracking
 * paren depth so a `var(--x, fallback)` fallback's own comma never ends an
 * argument early.
 */
const splitTopLevelCommas = (source: string): string[] => {
  const out: string[] = []
  let depth = 0
  let buf = ''
  for (const ch of source) {
    if (ch === '(') depth++
    else if (ch === ')') depth--
    if (ch === ',' && depth === 0) {
      out.push(buf)
      buf = ''
    } else {
      buf += ch
    }
  }
  out.push(buf)
  return out
}

/** A colour argument of `color-mix()`: a colour expression plus an optional trailing `NN%`. */
const parseColourMixArg = (
  arg: string
): { colourExpr: string; weight: number | null } => {
  const trimmed = arg.trim()
  const m = /^([\s\S]+?)\s+(\d+)%$/.exec(trimmed)
  if (m) return { colourExpr: m[1], weight: Number(m[2]) }
  return { colourExpr: trimmed, weight: null }
}

/**
 * Resolves a `var()` chain exactly as `resolveValue` does, and additionally
 * resolves a `color-mix(in srgb, A p%, B)` expression (the `--winetricks-
 * danger-text` shape) down to a literal hex colour, reimplementing the CSS
 * weight rules: one percentage given means the other is `100 - p`; none given
 * means 50/50; both given means normalised by their sum. Each colour argument
 * is resolved recursively (so a `color-mix()` nested inside a `var()`
 * fallback also resolves) and must itself be a hex or named colour `toRgb`
 * accepts -- a bare `transparent` or `currentColor` argument throws rather
 * than silently mis-resolving, because neither is a fixed colour outside a
 * known compositing surface.
 */
const resolveColour = (
  value: string,
  scope: Map<string, string>,
  globals: Map<string, string>
): string | null => {
  const resolved = resolveValue(value, scope, globals)
  if (resolved === null) return null
  if (!resolved.startsWith('color-mix(')) return resolved

  const inner = resolved.slice('color-mix('.length, resolved.length - 1).trim()
  const args = splitTopLevelCommas(inner)
  if (args.length !== 3) {
    throw new Error(
      `expected 3 color-mix() arguments, found ${args.length}: ${resolved}`
    )
  }
  const [colourSpace, argA, argB] = args
  if (colourSpace.trim() !== 'in srgb') {
    throw new Error(
      `expected 'in srgb' color-mix(), found '${colourSpace.trim()}'`
    )
  }

  const a = parseColourMixArg(argA)
  const b = parseColourMixArg(argB)
  const colourA = resolveColour(a.colourExpr, scope, globals)
  const colourB = resolveColour(b.colourExpr, scope, globals)
  if (colourA === null || !toRgb(colourA)) {
    throw new Error(
      `color-mix() argument is not a resolvable colour: ${a.colourExpr} -> ${colourA}`
    )
  }
  if (colourB === null || !toRgb(colourB)) {
    throw new Error(
      `color-mix() argument is not a resolvable colour: ${b.colourExpr} -> ${colourB}`
    )
  }

  let weightA: number
  if (a.weight !== null && b.weight !== null) {
    const sum = a.weight + b.weight
    weightA = sum === 0 ? 50 : (a.weight / sum) * 100
  } else if (a.weight !== null) {
    weightA = a.weight
  } else if (b.weight !== null) {
    weightA = 100 - b.weight
  } else {
    weightA = 50
  }

  return mixSrgb(colourA, colourB, weightA / 100)
}

/**
 * The tab root's own custom properties (`WinetricksSettings/index.scss`'s
 * `.WinetricksSettings {` block) overlaid on top of the theme's tokens: the
 * tab root is a descendant of `body`, so a custom property it declares wins
 * over the theme's, exactly as the cascade resolves it in the browser.
 */
const winetricksScope = (
  themesScss: string,
  selector: string,
  indexScss: string
): Map<string, string> => {
  const merged = new Map(themeTokens(themesScss, selector))
  for (const [k, v] of customProps(cssBlock(indexScss, '.WinetricksSettings')))
    merged.set(k, v)
  return merged
}

/**
 * The body of the depth-0 nested rule of `body` whose selector equals
 * `selector` exactly, via `nestedRules`. Throws, naming the selector, when
 * absent -- a renamed selector fails loudly instead of the gate quietly
 * measuring nothing.
 */
const nestedRule = (body: string, selector: string): string => {
  const rule = nestedRules(body).find((r) => r.selector === selector)
  if (!rule) throw new Error(`no rule '${selector}' found`)
  return rule.body
}

/**
 * The `.WinetricksRow` depth-0 `color`'s resolved value, taken once per
 * census call. Returns both rest surfaces (`--modal-background`,
 * `--body-background`) and, for each, the hovered-row composite: the row's
 * `&:hover` rule paints `color-mix(in srgb, currentColor <p>%, transparent)`
 * over the surface beneath, so the same `mixSrgb` arithmetic that resolves
 * `color-mix()` above also resolves the opacity-free hover composite -- `p`
 * is read from the authored rule, never hardcoded, so a future change to the
 * hover opacity cannot silently go unmeasured.
 */
const rowSurfaces = (
  rowScss: string,
  scope: Map<string, string>,
  globals: Map<string, string>
): { label: string; colour: string }[] => {
  const rowBody = cssBlock(rowScss, '.WinetricksRow')
  const rowColourDecl = declsAtDepthZero(rowBody, 'color')[0]
  const rowColour = resolveValue(rowColourDecl ?? '', scope, globals)
  if (rowColour === null) throw new Error('unresolved .WinetricksRow color')

  const hoverBody = nestedRule(rowBody, '&:hover')
  const hoverBgDecl = declsAtDepthZero(hoverBody, 'background')[0] ?? ''
  const pctMatch = /currentColor\s+(\d+)%/.exec(hoverBgDecl)
  if (!pctMatch) {
    throw new Error(
      `could not find a currentColor percentage in &:hover background: ${hoverBgDecl}`
    )
  }
  const p = Number(pctMatch[1]) / 100

  const rest: { label: string; value: string }[] = [
    { label: 'modal', value: 'var(--modal-background)' },
    { label: 'body', value: 'var(--body-background)' }
  ]
  const out: { label: string; colour: string }[] = []
  for (const { label, value } of rest) {
    const surface = resolveValue(value, scope, globals)
    if (surface === null) throw new Error(`unresolved row surface: ${label}`)
    out.push({ label, colour: surface })
    out.push({
      label: `hovered ${label}`,
      colour: mixSrgb(rowColour, surface, p)
    })
  }
  return out
}

const dangerTagColourDecl = (rowScss: string): string => {
  const tagBody = cssBlock(rowScss, '.WinetricksRow__tag')
  const erroredBody = nestedRule(tagBody, '&--errored')
  const decls = declsAtDepthZero(erroredBody, 'color')
  if (decls.length !== 1) {
    throw new Error(
      `expected exactly one depth-0 color in the Row tag errored rule, found ${decls.length}`
    )
  }
  return decls[0]
}

const dangerIconColourDecl = (rowScss: string): string => {
  const iconBody = cssBlock(rowScss, '.WinetricksRow__icon')
  const erroredBody = nestedRule(iconBody, '&--errored')
  const decls = declsAtDepthZero(erroredBody, 'color')
  if (decls.length !== 1) {
    throw new Error(
      `expected exactly one depth-0 color in the Row icon errored rule, found ${decls.length}`
    )
  }
  return decls[0]
}

const dangerFailedCountColourDecl = (stickyBarScss: string): string => {
  const failedBody = cssBlock(
    stickyBarScss,
    '.WinetricksStickyBar .WinetricksStickyBar__failed'
  )
  const decls = declsAtDepthZero(failedBody, 'color')
  if (decls.length !== 1) {
    throw new Error(
      `expected exactly one depth-0 color in the StickyBar failed rule, found ${decls.length}`
    )
  }
  return decls[0]
}

const dangerLogErrorColourDecl = (logPanelScss: string): string => {
  const errorBody = cssBlock(logPanelScss, '.WinetricksLogPanel .log-error')
  const decls = declsAtDepthZero(errorBody, 'color')
  if (decls.length !== 1) {
    throw new Error(
      `expected exactly one depth-0 color in the LogPanel log-error rule, found ${decls.length}`
    )
  }
  return decls[0]
}

/**
 * Per-theme WCAG census for the Winetricks failed-state danger text family
 * (todo 2026-10-11, live gate 45-12 G7: tag 3.56:1 nord-light / 2.84:1
 * midnightMirage; bar `1 failed` 3.03:1 nord-light / 1.95:1 midnightMirage;
 * danger icon 2.84:1 midnightMirage). Returns one failure string per miss, so
 * a failing case names the element, the resolved colours, the surface and the
 * bar it missed, rather than a bare boolean.
 *
 * Lives here, not beside the stylesheets, because the cross-theme `var()`
 * resolver, `cssBlock`/`nestedRules` and the contrast helpers above are
 * module-private to this file -- the gpn Apply census above is the direct
 * precedent for a Winetricks-specific describe living in this shared file.
 *
 * Row TEXT (the tag) is held at >= 4.5:1 on BOTH the rest and the hovered row
 * surface, because G7 holds hover TEXT to 4.5:1 and only makes hover FILL
 * record-only. The danger icon is non-text (3:1) and is held at rest only.
 *
 * Like every census in this file it cannot see a pixel: no CSS engine runs
 * under the node test environment, so a live capture still adjudicates
 * appearance. NOT LIVE-VERIFIED: a capture is owed at the next 45-12 re-run.
 */
const dangerTextFailures = ({
  indexScss,
  rowScss,
  stickyBarScss,
  logPanelScss,
  themesScss,
  globals,
  selector
}: {
  indexScss: string
  rowScss: string
  stickyBarScss: string
  logPanelScss: string
  themesScss: string
  globals: Map<string, string>
  selector: string
}): string[] => {
  const scope = winetricksScope(themesScss, selector, indexScss)
  const failures: string[] = []

  const checkAgainst = (
    label: string,
    fgDecl: string,
    bar: number,
    surfaces: { label: string; colour: string }[]
  ) => {
    const fg = resolveColour(fgDecl, scope, globals)
    if (fg === null) {
      failures.push(`${label} unresolved`)
      return
    }
    for (const { label: surfaceLabel, colour: bg } of surfaces) {
      const ratio = contrastRatio(fg, bg)
      if (ratio < bar) {
        failures.push(
          `${label} ${fg} on ${bg} (${surfaceLabel}) = ${ratio.toFixed(2)} < ${bar}`
        )
      }
    }
  }

  const allRowSurfaces = rowSurfaces(rowScss, scope, globals)
  const restRowSurfaces = allRowSurfaces.filter(
    (s) => !s.label.startsWith('hovered')
  )

  checkAgainst('tag', dangerTagColourDecl(rowScss), 4.5, allRowSurfaces)
  checkAgainst('icon', dangerIconColourDecl(rowScss), 3, restRowSurfaces)

  const barSurface = resolveValue('var(--input-background)', scope, globals)
  if (barSurface === null) {
    failures.push('bar surface unresolved')
  } else {
    checkAgainst(
      'failed count',
      dangerFailedCountColourDecl(stickyBarScss),
      4.5,
      [{ label: 'sticky-bar', colour: barSurface }]
    )
    checkAgainst('log error', dangerLogErrorColourDecl(logPanelScss), 4.5, [
      { label: 'log-panel', colour: barSurface }
    ])
  }

  return failures
}

describe('Winetricks failed-state danger text contrast in every theme (45-12 G7, 261011-kqx)', () => {
  const themesScss = read(THEMES_SCSS)
  const indexScss = read(WINETRICKS_INDEX_SCSS)
  const rowScss = read(WINETRICKS_ROW_SCSS)
  const stickyBarScss = read(WINETRICKS_STICKY_BAR_SCSS)
  const logPanelScss = read(WINETRICKS_LOG_PANEL_SCSS)
  const globals = globalTokens()

  it('non-vacuity: globals, the derived danger-text custom property, its four consumers, and the row/bar surfaces all resolve', () => {
    expect(globals.size).toBeGreaterThan(0)

    const rootBody = cssBlock(indexScss, '.WinetricksSettings')
    const dangerTextDecl = customProps(rootBody).get('--winetricks-danger-text')
    expect(dangerTextDecl).not.toBeUndefined()
    expect((dangerTextDecl as string).startsWith('color-mix(')).toBe(true)
    expect(dangerTextDecl).toMatch(/var\(--danger/)
    expect(dangerTextDecl).toMatch(/var\(--text-default/)

    for (const decl of [
      dangerTagColourDecl(rowScss),
      dangerIconColourDecl(rowScss),
      dangerFailedCountColourDecl(stickyBarScss),
      dangerLogErrorColourDecl(logPanelScss)
    ]) {
      expect(decl).toMatch(/^var\(--winetricks-danger-text,/)
      expect(decl).toMatch(/var\(--danger/)
    }

    const rowBody = cssBlock(rowScss, '.WinetricksRow')
    const rowColourDecl = declsAtDepthZero(rowBody, 'color')[0]
    const scope = winetricksScope(themesScss, 'body.nord-light', indexScss)
    expect(resolveValue(rowColourDecl ?? '', scope, globals)).not.toBeNull()
    const hoverBody = nestedRule(rowBody, '&:hover')
    expect(declsAtDepthZero(hoverBody, 'background')[0]).toBe(
      'color-mix(in srgb, currentColor 10%, transparent)'
    )

    const stickyBarBody = cssBlock(stickyBarScss, '.WinetricksStickyBar')
    expect(declsAtDepthZero(stickyBarBody, 'background')[0]).toMatch(
      /^var\(--input-background/
    )
    const logPanelBody = cssBlock(logPanelScss, '.WinetricksLogPanel')
    expect(declsAtDepthZero(logPanelBody, 'background')[0]).toMatch(
      /^var\(--input-background/
    )
  })

  it('colour-mix arithmetic', () => {
    const noScope = new Map<string, string>()
    const noGlobals = new Map<string, string>()
    expect(
      resolveColour(
        'color-mix(in srgb, #ff0000 40%, #0000ff)',
        noScope,
        noGlobals
      )
    ).toBe('#660099')
    expect(
      resolveColour('color-mix(in srgb, #ff0000, #0000ff)', noScope, noGlobals)
    ).toBe('#800080')
    expect(
      resolveColour(
        'color-mix( in srgb, #ff0000 40%, #0000ff )',
        noScope,
        noGlobals
      )
    ).toBe('#660099')
    expect(() =>
      resolveColour(
        'color-mix(in srgb, transparent 50%, #000000)',
        noScope,
        noGlobals
      )
    ).toThrow()
    expect(() =>
      resolveColour(
        'color-mix(in srgb, currentColor 10%, #000000)',
        noScope,
        noGlobals
      )
    ).toThrow()
  })

  it.each(themeSelectors)(
    '%s paints failed-state danger text >= 4.5:1 and the danger icon >= 3:1',
    (selector) => {
      const failures = dangerTextFailures({
        indexScss,
        rowScss,
        stickyBarScss,
        logPanelScss,
        themesScss,
        globals,
        selector
      })
      // Object form so a failure names the theme and every miss.
      expect({ theme: selector, failures }).toEqual({
        theme: selector,
        failures: []
      })
    }
  )

  it('the pre-fix pair fails where the live gate measured it', () => {
    const OLD_DANGER = 'var(--danger, #cc3333)'
    for (const selector of ['body.nord-light', 'body.midnightMirage']) {
      const scope = winetricksScope(themesScss, selector, indexScss)
      const fg = resolveColour(OLD_DANGER, scope, globals)
      const rowSurface = resolveValue('var(--modal-background)', scope, globals)
      const barSurface = resolveValue('var(--input-background)', scope, globals)
      expect(fg).not.toBeNull()
      expect(rowSurface).not.toBeNull()
      expect(barSurface).not.toBeNull()
      const rowRatio = contrastRatio(fg as string, rowSurface as string)
      const barRatio = contrastRatio(fg as string, barSurface as string)
      // Object form so a failure names the theme and both measured ratios.
      expect({
        selector,
        rowRatio,
        barRatio,
        failsBoth: rowRatio < 4.5 && barRatio < 4.5
      }).toEqual({
        selector,
        rowRatio,
        barRatio,
        failsBoth: true
      })
    }
  })

  it('checker can fail, in memory only', () => {
    // The tokenCensus.test.ts sabotage idiom: mutate a STRING copy, never the
    // file on disk. Count first, so the sabotage is not vacuous.
    const rootBody = cssBlock(indexScss, '.WinetricksSettings')
    expect((rootBody.match(/40%/g) ?? []).length).toBe(1)
    const sabotagedIndexScss = indexScss.replace('40%', '100%')
    for (const selector of ['body.nord-light', 'body.midnightMirage']) {
      const failures = dangerTextFailures({
        indexScss: sabotagedIndexScss,
        rowScss,
        stickyBarScss,
        logPanelScss,
        themesScss,
        globals,
        selector
      })
      expect(failures.length).toBeGreaterThan(0)
    }
  })
})
