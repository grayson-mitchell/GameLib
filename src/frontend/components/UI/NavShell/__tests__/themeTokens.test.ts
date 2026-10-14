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
import { readFileSync, readdirSync } from 'fs'
import { join, sep } from 'path'
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

  // Was 'at least two' while the navbar also carried the DownloadsRing; quick
  // 261012-dhs deleted the ring, so the tab strip is the one interactive child.
  it('has a no-drag declaration excluding the interactive tab strip', () => {
    const matches = navShellScss.match(/-webkit-app-region:\s*no-drag/g) ?? []
    expect(matches.length).toBeGreaterThanOrEqual(1)
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
 * The shape every correctly-guarded theme override selector must end in: an
 * `&` followed by zero or more `:not(<simple selector>)` compounds (e.g.
 * `.button.is-text`'s `:not(.is-link)`) and then a final, required
 * `:not(:disabled)`. Shared between `themeOverridesMissingNotDisabled` (a
 * full-selector match, anchored with `$`) and `applyTextColourDecl`
 * (embedded ahead of the opening `{`) so the two helpers cannot drift onto
 * different definitions of "guarded" (261011-pjv).
 */
const GUARDED_OVERRIDE_TAIL = '&(?::not\\([^()]+\\))*:not\\(:disabled\\)'

/**
 * Every nested selector inside a control's block body that scopes to a
 * theme (`body.<theme> ...`) but does NOT end in the guarded shape above --
 * i.e. would also apply to the disabled control. An empty array means
 * every theme override is correctly guarded. Factored out so Test C (the
 * real stylesheet) and Test D (an in-memory-sabotaged copy, no file
 * mutation) share one checker, and Test D proves Test C can actually fail.
 */
const themeOverridesMissingNotDisabled = (applyBody: string): string[] => {
  const guarded = new RegExp(`${GUARDED_OVERRIDE_TAIL}$`)
  return nestedRules(applyBody)
    .map((rule) => rule.selector)
    .filter((selector) => selector.startsWith('body.'))
    .filter((selector) => !guarded.test(selector))
}

/**
 * The `color:` an ENABLED accent-filled control paints in `themeClass`, as
 * authored. Mirrors `selectedTabColourDecl`: a nested `body.<theme> &...`
 * override inside the control's block wins over the block's own depth-0
 * `color`. The override selector may carry zero or more leading
 * `:not(<simple selector>)` compounds (e.g. `.button.is-text`'s
 * `:not(.is-link)`) ahead of the final, required `:not(:disabled)`. No `s`
 * flag: the inner capture is a negated character class, which already spans
 * newlines (see the TS1501 note above `selectedTabColourDecl`). Generalized
 * (261011-pjv) from an Apply-only picker to serve every control in this
 * accent-fill family: Apply, Retry, Clear and `.button.is-text`.
 */
const applyTextColourDecl = (
  controlBody: string,
  themeClass: string
): string => {
  const scoped = new RegExp(
    `body\\.${themeClass}\\s*${GUARDED_OVERRIDE_TAIL}\\s*\\{([^}]*)\\}`
  ).exec(controlBody)
  if (scoped) {
    const decls = declsAtDepthZero(scoped[1], 'color')
    if (decls.length !== 1)
      throw new Error(
        `expected exactly one depth-0 color in the ${themeClass} override, found ${decls.length}`
      )
    return decls[0]
  }
  const base = declsAtDepthZero(controlBody, 'color')
  if (base.length !== 1)
    throw new Error(
      `expected exactly one depth-0 base color in the block, found ${base.length}`
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
    // Selector lists are compared with their whitespace collapsed, so the
    // prettier-wrapped `&:hover,\n&:focus-visible` is addressed as
    // `&:hover, &:focus-visible`.
    const next = nestedRules(body).find(
      (rule) => rule.selector.replace(/\s+/g, ' ') === selector
    )
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
 * first. The button's hover and focus-visible arm (quick 261011-sxg) is held
 * to the same pair: the notice owns that state at (0,4,0), above the Settings
 * footer-button rule, and signals it with an underline rather than a hue the
 * ten themes cannot all clear.
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
    path: ['&__row', '.button.is-footer', '&:hover, &:focus-visible'],
    prop: 'color',
    want: 'inherit'
  },
  {
    path: ['&__row', '.button.is-footer', '&:hover, &:focus-visible'],
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

const SIGN_IN_EXPIRED_TRIANGLE_PATH = ['&__row--expired > svg']
const SIGN_IN_TRIANGLE_BASE_COLOUR = 'var(--status-danger, orange)'
const SIGN_IN_DISMISS_HOVER_PATH = ['&__dismiss', '&:hover']

/**
 * The `color:` the expired row's triangle paints in `themeClass`, as authored.
 * Mirrors `dividerColourDecl`: a nested rule whose selector LIST names
 * `body.<theme> &` wins over the base rule's depth-0 `color`, and the list is
 * split on commas and compared whole so `nord-light` can never match a
 * `body.nord-dark &` entry.
 */
const expiredTriangleColourDecl = (
  noticeScss: string,
  themeClass: string
): string => {
  const block = signInNoticeRule(noticeScss, SIGN_IN_EXPIRED_TRIANGLE_PATH)
  const override = nestedRules(block).find((rule) =>
    rule.selector
      .split(',')
      .map((s) => s.trim())
      .includes(`body.${themeClass} &`)
  )
  const decls = declsAtDepthZero(override ? override.body : block, 'color')
  if (decls.length !== 1)
    throw new Error(
      `expected exactly one depth-0 color in the ${themeClass} expired triangle rule, found ${decls.length}`
    )
  return decls[0]
}

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

  // Quick 261011-sxg: the three states j8z left as residuals, all nord-light.
  // The dismiss glyph and the triangle are non-text UI components, so WCAG
  // 1.4.11's 3:1 is their floor; the button label is text and stays at 4.5
  // through the inherit table above.

  it('non-vacuity: the hovered dismiss hue, the triangle base colour and its one-theme override set', () => {
    expect(
      declsAtDepthZero(
        signInNoticeRule(noticeScss, SIGN_IN_DISMISS_HOVER_PATH),
        'color'
      )
    ).toEqual(['var(--navbar-active, var(--navbar-accent))'])
    expect(
      declsAtDepthZero(
        signInNoticeRule(noticeScss, SIGN_IN_EXPIRED_TRIANGLE_PATH),
        'color'
      )
    ).toEqual([SIGN_IN_TRIANGLE_BASE_COLOUR])
    const overridden = themeSelectors
      .map((s) => s.replace(/^body\./, ''))
      .filter(
        (t) =>
          expiredTriangleColourDecl(noticeScss, t) !==
          SIGN_IN_TRIANGLE_BASE_COLOUR
      )
    expect(overridden).toEqual(['nord-light'])
  })

  it.each(themeSelectors)(
    '%s paints the hovered dismiss glyph at >= 3:1 against the banner',
    (selector) => {
      const theme = selector.replace(/^body\./, '')
      const scope = themeTokens(themesScss, selector)
      const fg = resolveValue(
        declsAtDepthZero(
          signInNoticeRule(noticeScss, SIGN_IN_DISMISS_HOVER_PATH),
          'color'
        )[0] ?? '',
        scope,
        globals
      )
      const bg = resolveValue(
        declsAtDepthZero(rowBody, 'background')[0] ?? '',
        scope,
        globals
      )
      expect(fg).not.toBeNull()
      expect(bg).not.toBeNull()
      const ratio = contrastRatio(fg as string, bg as string)
      expect({ theme, fg, bg, ratio, passes: ratio >= 3 }).toEqual({
        theme,
        fg,
        bg,
        ratio,
        passes: true
      })
    }
  )

  it.each(themeSelectors)(
    '%s paints the expired triangle at >= 3:1 against the banner',
    (selector) => {
      const theme = selector.replace(/^body\./, '')
      const scope = themeTokens(themesScss, selector)
      const fg = resolveValue(
        expiredTriangleColourDecl(noticeScss, theme),
        scope,
        globals
      )
      const bg = resolveValue(
        declsAtDepthZero(rowBody, 'background')[0] ?? '',
        scope,
        globals
      )
      expect(fg).not.toBeNull()
      expect(bg).not.toBeNull()
      const ratio = contrastRatio(fg as string, bg as string)
      expect({ theme, fg, bg, ratio, passes: ratio >= 3 }).toEqual({
        theme,
        fg,
        bg,
        ratio,
        passes: true
      })
    }
  )

  it('the in-row footer button owns its hover and focus-visible state above the Settings rule', () => {
    // Settings/index.css paints `--text-hover` on `--background-darker` with a
    // 3px `--danger` ring at (0,3,0), tying the notice's button rule on source
    // order. The nested arm compiles to (0,4,0) and must also neutralise the
    // ring, or Settings' box-shadow still lands on the banner.
    const hover = signInNoticeRule(noticeScss, [
      '&__row',
      '.button.is-footer',
      '&:hover, &:focus-visible'
    ])
    expect(declsAtDepthZero(hover, 'box-shadow')).toEqual(['none'])
    expect(declsAtDepthZero(hover, 'text-decoration')).toEqual(['underline'])
    const focus = signInNoticeRule(noticeScss, [
      '&__row',
      '.button.is-footer',
      '&:focus-visible'
    ])
    expect(declsAtDepthZero(focus, 'outline')).toEqual([
      '2px solid currentColor'
    ])
  })

  it("the pre-fix hover and triangle pairs reproduce the todo's nord-light fails", () => {
    // The LITERAL pre-fix values the 261011-sxg todo measured (dismiss hover
    // 1.52, triangle 2.82 in nord-light; dracula 4.27 and 3.50 pass), resolved
    // through the same path the gates above use. Only the side of 3 matters.
    const OLD_DISMISS_HOVER = 'var(--text-secondary, var(--text-default))'
    const background = declsAtDepthZero(rowBody, 'background')[0] ?? ''
    const expected = [
      ['body.nord-light', OLD_DISMISS_HOVER, 'fail'],
      ['body.dracula', OLD_DISMISS_HOVER, 'pass'],
      ['body.nord-light', SIGN_IN_TRIANGLE_BASE_COLOUR, 'fail'],
      ['body.dracula', SIGN_IN_TRIANGLE_BASE_COLOUR, 'pass']
    ] as const
    for (const [selector, colour, verdict] of expected) {
      const scope = themeTokens(themesScss, selector)
      const fg = resolveValue(colour, scope, globals)
      const bg = resolveValue(background, scope, globals)
      expect(fg).not.toBeNull()
      expect(bg).not.toBeNull()
      const ratio = contrastRatio(fg as string, bg as string)
      expect({
        selector,
        colour,
        ratio,
        verdict: ratio >= 3 ? 'pass' : 'fail'
      }).toEqual({ selector, colour, ratio, verdict })
    }
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
    expect(noticeScss.split('color: inherit').length - 1).toBe(4)
    expect(noticeScss.split('background-color: transparent').length - 1).toBe(2)
    const colourSabotaged = noticeScss
      .split('color: inherit')
      .join('color: var(--text-default)')
    expect(signInForegroundsNotInheriting(colourSabotaged)).toEqual([
      '&__row .button.is-footer color',
      '&__row .button.is-footer &:hover, &:focus-visible color',
      '&__row--notConnected .LibrarySignInNotice__icon color',
      '&__dismiss color'
    ])
    const fillSabotaged = noticeScss
      .split('background-color: transparent')
      .join('background-color: var(--primary)')
    expect(signInForegroundsNotInheriting(fillSabotaged)).toEqual([
      '&__row .button.is-footer background-color',
      '&__row .button.is-footer &:hover, &:focus-visible background-color'
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

const WINETRICKS_EVERYTHING_ELSE_SCSS =
  'src/frontend/screens/Settings/sections/WinetricksSettings/EverythingElseGroup/index.scss'

/**
 * The UA default placeholder colour this project has never overridden before
 * this fix: WebKit/Chromium's `::placeholder` default (`darkgray`, `#a9a9a9`),
 * used as the pre-fix literal in the RED-phase/pre-fix test below. Never read
 * from a stylesheet -- there is nothing in source to read before the fix adds
 * an explicit `&::placeholder` rule.
 */
const UA_PLACEHOLDER = '#a9a9a9'

/**
 * The REAL top-level `.WinetricksRow__box` rule, found by exact selector
 * match among `.WinetricksSettings`'s own depth-0 nested rules -- never by
 * `cssBlock`'s naive substring search, which would instead match the FIRST
 * literal occurrence of `.WinetricksRow__box {` in the file: the nested
 * `&[aria-checked='true'] .WinetricksRow__box {` selector inside
 * `.WinetricksRow__checkbox` (and, post-fix, a second nested occurrence
 * inside the Queued `&:disabled[aria-checked='true']` rule), both of which
 * appear earlier in the source than the real top-level rule.
 */
const winetricksRowBoxBody = (rowScss: string): string =>
  nestedRule(cssBlock(rowScss, '.WinetricksSettings'), '.WinetricksRow__box')

/**
 * A rule's border colour: prefers a depth-0 `border-color`, falling back to
 * the colour clause of a depth-0 `border` shorthand (`1px solid var(...)`,
 * sliced from its first `var(`). Throws when neither exists, naming neither
 * -- a renamed/removed border fails loudly instead of the gate quietly
 * measuring nothing.
 */
const borderColourDecl = (ruleBody: string): string => {
  const borderColourDecls = declsAtDepthZero(ruleBody, 'border-color')
  if (borderColourDecls.length > 0) return borderColourDecls[0]
  const borderDecls = declsAtDepthZero(ruleBody, 'border')
  for (const decl of borderDecls) {
    const idx = decl.indexOf('var(')
    if (idx !== -1) return decl.slice(idx)
  }
  throw new Error('no border or border-color declaration found')
}

/**
 * The Queued checkbox's non-text indicator, as colour + alpha, read from
 * whichever shape the Row checkbox rule is currently authored in.
 *
 * Post-fix: a dedicated `&:disabled[aria-checked='true']` rule exists, nested
 * inside `.WinetricksRow__checkbox`; its own depth-0 `opacity` is the alpha,
 * and its nested `.WinetricksRow__box &::after` tick's `border-color` is the
 * colour -- the mechanism this fix introduces.
 *
 * Pre-fix: no such rule exists yet, so the Queued box renders through the
 * generic `&[aria-checked='true'] .WinetricksRow__box` background at the
 * generic `&:disabled` opacity -- the dimmed-accent mechanism this fix
 * replaces, because no opacity value composited over a row surface can clear
 * 3:1 in every theme (gruvbox_dark's own accent is only 3.91:1 at FULL
 * opacity).
 */
const queuedIndicator = (
  rowScss: string
): { colourDecl: string; alphaDecl: string } => {
  const checkboxBody = cssBlock(rowScss, '.WinetricksRow__checkbox')
  const queuedRule = nestedRules(checkboxBody).find(
    (rule) => rule.selector === "&:disabled[aria-checked='true']"
  )
  if (queuedRule) {
    const alphaDecls = declsAtDepthZero(queuedRule.body, 'opacity')
    if (alphaDecls.length !== 1) {
      throw new Error(
        `expected exactly one depth-0 opacity in the queued rule, found ${alphaDecls.length}`
      )
    }
    const boxBody = nestedRule(queuedRule.body, '.WinetricksRow__box')
    const afterBody = nestedRule(boxBody, '&::after')
    const colourDecls = declsAtDepthZero(afterBody, 'border-color')
    if (colourDecls.length !== 1) {
      throw new Error(
        `expected exactly one depth-0 border-color in the queued tick, found ${colourDecls.length}`
      )
    }
    return { colourDecl: colourDecls[0], alphaDecl: alphaDecls[0] }
  }
  const checkedBody = nestedRule(
    checkboxBody,
    "&[aria-checked='true'] .WinetricksRow__box"
  )
  const colourDecls = declsAtDepthZero(checkedBody, 'background')
  if (colourDecls.length !== 1) {
    throw new Error(
      `expected exactly one depth-0 background in the checked rule, found ${colourDecls.length}`
    )
  }
  const disabledBody = nestedRule(checkboxBody, '&:disabled')
  const alphaDecls = declsAtDepthZero(disabledBody, 'opacity')
  if (alphaDecls.length !== 1) {
    throw new Error(
      `expected exactly one depth-0 opacity in &:disabled, found ${alphaDecls.length}`
    )
  }
  return { colourDecl: colourDecls[0], alphaDecl: alphaDecls[0] }
}

/**
 * The search input's placeholder colour. Returns the UA default when no
 * `&::placeholder` rule exists yet (the pre-fix state), so the same
 * `indicatorFailures` call works before and after the fix.
 */
const placeholderColourDecl = (inputBody: string): string => {
  const placeholderRule = nestedRules(inputBody).find(
    (rule) => rule.selector === '&::placeholder'
  )
  if (!placeholderRule) return UA_PLACEHOLDER
  const decls = declsAtDepthZero(placeholderRule.body, 'color')
  if (decls.length !== 1) {
    throw new Error(
      `expected exactly one depth-0 color in &::placeholder, found ${decls.length}`
    )
  }
  return decls[0]
}

/**
 * Per-theme WCAG census for the Winetricks tab's non-text indicators (WCAG
 * 2.2 SC 1.4.11, 3:1) and the search placeholder (SC 1.4.3, 4.5:1) -- the
 * second half of 45-12 G7 (todo 2026-10-11): the unchecked checkbox border,
 * the Queued checkbox's dimmed-accent tick, the Cancel button border, the
 * disabled Apply button border, and the search input's border and
 * placeholder.
 *
 * The Queued checkbox is measured through `queuedIndicator`, composited over
 * the rest row surfaces at whatever alpha is authored -- pre-fix that is the
 * generic `&:disabled` opacity (0.5), post-fix it is 1 (fully opaque, no
 * compositing). Every other non-text pair is measured at rest (alpha 1):
 * none of the unchecked box, Cancel or disabled-Apply borders, or the search
 * input border, is ever painted at reduced opacity.
 *
 * Like every census in this file it cannot see a pixel: no CSS engine runs
 * under the node test environment, so a live capture still adjudicates
 * appearance. NOT LIVE-VERIFIED: a capture is owed at the next 45-12 re-run.
 */
const indicatorFailures = ({
  rowScss,
  stickyBarScss,
  everythingElseScss,
  indexScss,
  themesScss,
  globals,
  selector
}: {
  rowScss: string
  stickyBarScss: string
  everythingElseScss: string
  indexScss: string
  themesScss: string
  globals: Map<string, string>
  selector: string
}): string[] => {
  const scope = winetricksScope(themesScss, selector, indexScss)
  const failures: string[] = []

  const checkNonText = (
    label: string,
    colourDecl: string,
    alpha: number,
    surfaces: { label: string; colour: string }[],
    bar: number
  ) => {
    const resolved = resolveColour(colourDecl, scope, globals)
    if (resolved === null) {
      failures.push(`${label} unresolved`)
      return
    }
    for (const { label: surfaceLabel, colour: bg } of surfaces) {
      const composited = alpha >= 1 ? resolved : mixSrgb(resolved, bg, alpha)
      const ratio = contrastRatio(composited, bg)
      if (ratio < bar) {
        failures.push(
          `${label} ${composited} on ${bg} (${surfaceLabel}) = ${ratio.toFixed(2)} < ${bar}`
        )
      }
    }
  }

  const restRowSurfaces = rowSurfaces(rowScss, scope, globals).filter(
    (s) => !s.label.startsWith('hovered')
  )

  const boxBody = winetricksRowBoxBody(rowScss)
  checkNonText(
    'unchecked box border',
    borderColourDecl(boxBody),
    1,
    restRowSurfaces,
    3
  )

  const queued = queuedIndicator(rowScss)
  const queuedAlphaResolved = resolveValue(queued.alphaDecl, scope, globals)
  const queuedAlpha = Number(queuedAlphaResolved ?? queued.alphaDecl)
  checkNonText('queued box', queued.colourDecl, queuedAlpha, restRowSurfaces, 3)

  const barSurface = resolveValue('var(--input-background)', scope, globals)
  if (barSurface === null) {
    failures.push('bar surface unresolved')
  } else {
    // NOT cssBlock: its naive substring search matches the FIRST literal
    // occurrence of `.WinetricksStickyBar .WinetricksStickyBar__cancel {`,
    // which is the comma-joined `&__apply,\n &__cancel {` shared box-model
    // rule (no border there) -- the dedicated, bordered cancel rule comes
    // later. nestedRule's exact-selector match is immune: the shared rule's
    // own selector string is the whole joined pair, not this exact text.
    const cancelBody = nestedRule(
      cssBlock(stickyBarScss, '.WinetricksSettings'),
      '.WinetricksStickyBar .WinetricksStickyBar__cancel'
    )
    checkNonText(
      'cancel border',
      borderColourDecl(cancelBody),
      1,
      [{ label: 'sticky-bar', colour: barSurface }],
      3
    )

    const applyBody = cssBlock(
      stickyBarScss,
      '.WinetricksStickyBar .WinetricksStickyBar__apply'
    )
    const applyDisabledBody = nestedRule(applyBody, '&:disabled')
    const applyBorderColourDecls = declsAtDepthZero(
      applyDisabledBody,
      'border-color'
    )
    if (applyBorderColourDecls.length !== 1) {
      throw new Error(
        `expected exactly one depth-0 border-color in the disabled Apply rule, found ${applyBorderColourDecls.length}`
      )
    }
    checkNonText(
      'disabled apply border',
      applyBorderColourDecls[0],
      1,
      [{ label: 'sticky-bar', colour: barSurface }],
      3
    )
  }

  const searchBody = cssBlock(
    everythingElseScss,
    '.WinetricksEverythingElse__search'
  )
  const searchSurfaceDecl = declsAtDepthZero(searchBody, 'background')[0] ?? ''
  const searchSurface = resolveValue(searchSurfaceDecl, scope, globals)
  const inputBody = cssBlock(
    everythingElseScss,
    '.WinetricksEverythingElse__input'
  )
  const inputSurfaceDecl = declsAtDepthZero(inputBody, 'background')[0] ?? ''
  const inputSurface = resolveValue(inputSurfaceDecl, scope, globals)
  if (searchSurface === null || inputSurface === null) {
    failures.push('search surfaces unresolved')
  } else {
    checkNonText(
      'search input border',
      borderColourDecl(inputBody),
      1,
      [
        { label: 'search wrapper', colour: searchSurface },
        { label: 'input', colour: inputSurface }
      ],
      3
    )

    const placeholderDecl = placeholderColourDecl(inputBody)
    const fg = resolveColour(placeholderDecl, scope, globals)
    if (fg === null) {
      failures.push('placeholder unresolved')
    } else {
      const ratio = contrastRatio(fg, inputSurface)
      if (ratio < 4.5) {
        failures.push(
          `placeholder ${fg} on ${inputSurface} (input) = ${ratio.toFixed(2)} < 4.5`
        )
      }
    }
  }

  return failures
}

describe('Winetricks checkbox, button and search indicators and the search placeholder in every theme (45-12 G7, 261011-kqx)', () => {
  const themesScss = read(THEMES_SCSS)
  const indexScss = read(WINETRICKS_INDEX_SCSS)
  const rowScss = read(WINETRICKS_ROW_SCSS)
  const stickyBarScss = read(WINETRICKS_STICKY_BAR_SCSS)
  const everythingElseScss = read(WINETRICKS_EVERYTHING_ELSE_SCSS)
  const globals = globalTokens()

  it('non-vacuity: the queued-checkbox mechanism, the checked rule, the placeholder rule, and all four border declarations resolve', () => {
    expect(globals.size).toBeGreaterThan(0)

    const checkboxBody = cssBlock(rowScss, '.WinetricksRow__checkbox')
    const queuedRule = nestedRules(checkboxBody).find(
      (rule) => rule.selector === "&:disabled[aria-checked='true']"
    )
    expect(queuedRule).not.toBeUndefined()
    const queuedOpacity = declsAtDepthZero(
      (queuedRule as { selector: string; body: string }).body,
      'opacity'
    )
    expect(queuedOpacity).toEqual(['1'])
    const queuedBoxBody = nestedRule(
      (queuedRule as { selector: string; body: string }).body,
      '.WinetricksRow__box'
    )
    expect(declsAtDepthZero(queuedBoxBody, 'background')).toEqual([
      'transparent'
    ])
    const queuedAfterBody = nestedRule(queuedBoxBody, '&::after')
    expect(declsAtDepthZero(queuedAfterBody, 'border-color')[0]).toMatch(
      /^var\(--accent/
    )

    const checkedBody = nestedRule(
      checkboxBody,
      "&[aria-checked='true'] .WinetricksRow__box"
    )
    expect(declsAtDepthZero(checkedBody, 'border-color')[0]).toMatch(
      /^var\(--accent/
    )

    const inputBody = cssBlock(
      everythingElseScss,
      '.WinetricksEverythingElse__input'
    )
    const placeholderRule = nestedRules(inputBody).find(
      (rule) => rule.selector === '&::placeholder'
    )
    expect(placeholderRule).not.toBeUndefined()
    expect(
      declsAtDepthZero(
        (placeholderRule as { selector: string; body: string }).body,
        'color'
      )
    ).toHaveLength(1)
    expect(
      declsAtDepthZero(
        (placeholderRule as { selector: string; body: string }).body,
        'opacity'
      )
    ).toEqual(['1'])

    expect(borderColourDecl(winetricksRowBoxBody(rowScss))).toMatch(
      /^var\(--text-secondary/
    )
    expect(
      borderColourDecl(
        nestedRule(
          cssBlock(stickyBarScss, '.WinetricksSettings'),
          '.WinetricksStickyBar .WinetricksStickyBar__cancel'
        )
      )
    ).toMatch(/^var\(--text-secondary/)
    const applyBody = cssBlock(
      stickyBarScss,
      '.WinetricksStickyBar .WinetricksStickyBar__apply'
    )
    expect(
      declsAtDepthZero(nestedRule(applyBody, '&:disabled'), 'border-color')[0]
    ).toMatch(/^var\(--text-secondary/)
    expect(borderColourDecl(inputBody)).toMatch(/^var\(--text-secondary/)
  })

  it.each(themeSelectors)(
    '%s paints every non-text indicator >= 3:1 and the placeholder >= 4.5:1',
    (selector) => {
      const failures = indicatorFailures({
        rowScss,
        stickyBarScss,
        everythingElseScss,
        indexScss,
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

  it('the pre-fix pairs fail where the live gate measured them', () => {
    const scope = winetricksScope(themesScss, 'body.nord-light', indexScss)
    const rowSurface = resolveValue('var(--modal-background)', scope, globals)
    const barSurface = resolveValue('var(--input-background)', scope, globals)
    const bodySurface = resolveValue('var(--body-background)', scope, globals)
    expect(rowSurface).not.toBeNull()
    expect(barSurface).not.toBeNull()
    expect(bodySurface).not.toBeNull()

    const neutralBorder = resolveColour(
      'var(--neutral-05, #a8aeaf)',
      scope,
      globals
    )
    expect(neutralBorder).not.toBeNull()
    const neutralOnRow = contrastRatio(
      neutralBorder as string,
      rowSurface as string
    )
    const neutralOnBar = contrastRatio(
      neutralBorder as string,
      barSurface as string
    )

    const accent = resolveColour('var(--accent, #0080ff)', scope, globals)
    expect(accent).not.toBeNull()
    const accentAtHalf = mixSrgb(accent as string, rowSurface as string, 0.5)
    const queuedRatio = contrastRatio(accentAtHalf, rowSurface as string)

    const placeholderRatio = contrastRatio(
      UA_PLACEHOLDER,
      bodySurface as string
    )

    // Object form so a failure names every measured ratio.
    expect({
      neutralOnRow,
      neutralOnBar,
      queuedRatio,
      placeholderRatio,
      allFail:
        neutralOnRow < 3 &&
        neutralOnBar < 3 &&
        queuedRatio < 3 &&
        placeholderRatio < 4.5
    }).toEqual({
      neutralOnRow,
      neutralOnBar,
      queuedRatio,
      placeholderRatio,
      allFail: true
    })
  })

  it('checker can fail: restoring the pre-fix queued opacity is caught, in memory only', () => {
    // The tokenCensus.test.ts sabotage idiom: mutate a STRING copy, never the
    // file on disk. Count first, so the sabotage is not vacuous.
    expect((rowScss.match(/opacity:\s*1;/g) ?? []).length).toBe(1)
    const sabotagedRowScss = rowScss.replace('opacity: 1;', 'opacity: 0.5;')
    for (const selector of ['body.nord-light', 'body.gruvbox_dark']) {
      const failures = indicatorFailures({
        rowScss: sabotagedRowScss,
        stickyBarScss,
        everythingElseScss,
        indexScss,
        themesScss,
        globals,
        selector
      })
      expect(failures.length).toBeGreaterThan(0)
    }
  })
})

const BUTTONS_SCSS = 'src/frontend/styles/_buttons.scss'

/**
 * The three remaining members of the accent-fill family Apply belongs to:
 * Retry, Clear and `.button.is-text`. `path` is one of the already-declared
 * stylesheet path constants (WINETRICKS_ROW_SCSS,
 * WINETRICKS_EVERYTHING_ELSE_SCSS, BUTTONS_SCSS). `gruvboxOverride` is the
 * exact nested selector each control's gruvbox_dark override carries,
 * matching the shape `applyTextColourDecl` now accepts.
 */
const ACCENT_FILL_CONTROLS: {
  control: string
  path: string
  selector: string
  gruvboxOverride: string
}[] = [
  {
    control: 'Retry',
    path: WINETRICKS_ROW_SCSS,
    selector: '.WinetricksRow__retry',
    gruvboxOverride: 'body.gruvbox_dark &:not(:disabled)'
  },
  {
    control: 'Clear',
    path: WINETRICKS_EVERYTHING_ELSE_SCSS,
    selector: '.WinetricksEverythingElse__clear',
    gruvboxOverride: 'body.gruvbox_dark &:not(:disabled)'
  },
  {
    control: '.button.is-text',
    path: BUTTONS_SCSS,
    selector: '.button.is-text',
    gruvboxOverride: 'body.gruvbox_dark &:not(.is-link):not(:disabled)'
  }
]

/**
 * Every nested selector inside `.button.is-text`'s block body that scopes
 * to a theme (`body.<theme> ...`) but does NOT carry `:not(.is-link)`.
 * An empty array means the override cannot reach an `.is-link` consumer
 * (Planner finding 1, 261011-pjv): without it, a bare override would
 * outrank `.gameConfigContainer .game-actions .gameTools .link` and repaint
 * the 22 `.is-text.is-link` game-menu render sites.
 */
const themeOverridesReachingIsLink = (isTextBody: string): string[] =>
  nestedRules(isTextBody)
    .map((rule) => rule.selector)
    .filter((selector) => selector.startsWith('body.'))
    .filter((selector) => !selector.includes(':not(.is-link)'))

/**
 * Per-theme WCAG 1.4.3 census for the three remaining members of the
 * accent-fill family Apply belongs to: Retry, Clear and `.button.is-text`
 * (todo 2026-10-11, gruvbox_dark 4.35:1).
 *
 * Lives here for the same reason the Apply census does: the resolver
 * (`themeTokens`, `globalTokens`, `resolveValue`, `contrastRatio`) is
 * module-private to this file.
 *
 * Reads the authored declarations FROM each stylesheet on every run, never
 * a hardcoded copy of them.
 *
 * Like every census in this file it cannot see a pixel: no CSS engine runs
 * under the node test environment, so a live capture still adjudicates
 * appearance.
 */
describe('Accent-filled Retry, Clear and .button.is-text text contrast in every theme (261011-pjv)', () => {
  const themesScss = read(THEMES_SCSS)
  const globals = globalTokens()
  const blocks = new Map(
    ACCENT_FILL_CONTROLS.map(({ control, path, selector }) => [
      control,
      cssBlock(read(path), selector)
    ])
  )

  const pairs = ACCENT_FILL_CONTROLS.flatMap(({ control }) =>
    themeSelectors.map((selector) => ({ control, selector }))
  )

  it.each(ACCENT_FILL_CONTROLS.map(({ control }) => control))(
    'non-vacuity: %s resolves one accent background, one background-derived base color, and its gruvbox override',
    (control) => {
      expect(globals.size).toBeGreaterThan(0)
      const entry = ACCENT_FILL_CONTROLS.find((c) => c.control === control)
      if (!entry)
        throw new Error(`no ACCENT_FILL_CONTROLS entry for ${control}`)
      const block = blocks.get(control) as string
      expect(block.length).toBeGreaterThan(0)
      const bgDecls = declsAtDepthZero(block, 'background')
      expect(bgDecls).toHaveLength(1)
      expect(bgDecls[0]).toMatch(/var\(\s*--accent/)
      const colourDecls = declsAtDepthZero(block, 'color')
      expect(colourDecls).toHaveLength(1)
      expect(colourDecls[0]).toMatch(/var\(\s*--background/)
      const overrideRule = nestedRules(block).find(
        (rule) => rule.selector === entry.gruvboxOverride
      )
      expect(overrideRule).not.toBeUndefined()
      expect(
        declsAtDepthZero(
          (overrideRule as { selector: string; body: string }).body,
          'color'
        )
      ).toHaveLength(1)
    }
  )

  it.each(pairs)(
    '$control paints enabled text at >= 4.5:1 against its own accent fill in $selector',
    ({ control, selector }) => {
      const theme = selector.replace(/^body\./, '')
      const block = blocks.get(control) as string
      const scope = themeTokens(themesScss, selector)
      const fg = resolveValue(applyTextColourDecl(block, theme), scope, globals)
      const bg = resolveValue(
        declsAtDepthZero(block, 'background')[0] ?? '',
        scope,
        globals
      )
      expect(fg).not.toBeNull()
      expect(bg).not.toBeNull()
      const ratio = contrastRatio(fg as string, bg as string)
      // Object form so a failure names the control, the theme and the ratio.
      expect({ control, theme, fg, bg, ratio, passes: ratio >= 4.5 }).toEqual({
        control,
        theme,
        fg,
        bg,
        ratio,
        passes: true
      })
    }
  )

  it.each(ACCENT_FILL_CONTROLS.map(({ control }) => control))(
    'the gruvbox_dark override is load-bearing on every control: %s',
    (control) => {
      // The depth-0 BASE color, deliberately NOT the override, against the
      // base background. If this resolves >= 4.5, gruvbox's tokens changed
      // and the override (and this test) should be deleted, not re-pinned.
      // Option (b), if ever taken, is exactly what turns this red.
      const block = blocks.get(control) as string
      const scope = themeTokens(themesScss, 'body.gruvbox_dark')
      const baseColour = declsAtDepthZero(block, 'color')[0]
      const baseBackground = declsAtDepthZero(block, 'background')[0]
      const fg = resolveValue(baseColour, scope, globals)
      const bg = resolveValue(baseBackground, scope, globals)
      expect(fg).not.toBeNull()
      expect(bg).not.toBeNull()
      const ratio = contrastRatio(fg as string, bg as string)
      expect({
        control,
        ratio,
        passes: ratio < 4.5,
        note: "if this goes red, gruvbox's tokens changed so the base pair now passes -- delete the override and this test, do not re-pin it"
      }).toEqual({
        control,
        ratio,
        passes: true,
        note: "if this goes red, gruvbox's tokens changed so the base pair now passes -- delete the override and this test, do not re-pin it"
      })
    }
  )

  it.each(ACCENT_FILL_CONTROLS.map(({ control }) => control))(
    'a theme override cannot reach a disabled control: %s',
    (control) => {
      const entry = ACCENT_FILL_CONTROLS.find((c) => c.control === control)
      if (!entry)
        throw new Error(`no ACCENT_FILL_CONTROLS entry for ${control}`)
      const block = blocks.get(control) as string
      const themeOverrideSelectors = nestedRules(block)
        .map((rule) => rule.selector)
        .filter((selector) => selector.startsWith('body.'))
      expect(themeOverrideSelectors).toContain(entry.gruvboxOverride)
      expect(themeOverridesMissingNotDisabled(block)).toEqual([])

      if (control === 'Retry') {
        const disabledRule = nestedRules(block).find(
          (rule) => rule.selector === '&:disabled'
        )
        expect(disabledRule).not.toBeUndefined()
        const disabledBody = (
          disabledRule as { selector: string; body: string }
        ).body
        expect(declsAtDepthZero(disabledBody, 'opacity')).toEqual(['0.5'])
        expect(declsAtDepthZero(disabledBody, 'color')).toEqual([])
        expect(declsAtDepthZero(disabledBody, 'background')).toEqual([])
      } else if (control === 'Clear') {
        const disabledRule = nestedRules(block).find(
          (rule) => rule.selector === '&:disabled'
        )
        expect(disabledRule).toBeUndefined()
      } else {
        // `.button.is-text` has no disabled arm of its own; disabled is
        // painted by the global `.button:disabled` rule. That literal
        // selector appears TWICE in _buttons.scss (a cursor-only block and
        // a colour block), so allBlocksFor -- not cssBlock -- is used here.
        const disabledBlocks = allBlocksFor(
          read(BUTTONS_SCSS),
          '.button:disabled'
        )
        const withColour = disabledBlocks.filter(
          (body) => declsAtDepthZero(body, 'color').length > 0
        )
        expect(withColour).toHaveLength(1)
        expect(declsAtDepthZero(withColour[0], 'color')).toEqual([
          'var(--text-secondary)'
        ])
        expect(declsAtDepthZero(withColour[0], 'background')).toEqual([
          'var(--disabled-button)'
        ])
      }
    }
  )

  it('the .button.is-text override cannot reach an .is-link consumer', () => {
    const block = blocks.get('.button.is-text') as string
    expect(themeOverridesReachingIsLink(block)).toEqual([])
    // Structural reason `.is-text.is-link` text never came from
    // `--background`: `.button.is-link` declares its own depth-0 `color`,
    // at the same specificity and later in the file.
    const isLinkBlock = cssBlock(read(BUTTONS_SCSS), '.button.is-link')
    expect(declsAtDepthZero(isLinkBlock, 'color')).toHaveLength(1)
  })

  it('checkers can fail, in memory only', () => {
    // The tokenCensus.test.ts sabotage idiom: mutate a STRING copy, never
    // the file on disk.
    const retryBlock = blocks.get('Retry') as string
    const sabotagedRetry = retryBlock.replace('&:not(:disabled)', '&')
    expect(themeOverridesMissingNotDisabled(sabotagedRetry)).toEqual([
      'body.gruvbox_dark &'
    ])

    const isTextBlock = blocks.get('.button.is-text') as string
    const missingNotDisabled = isTextBlock.replace(
      '&:not(.is-link):not(:disabled)',
      '&:not(.is-link)'
    )
    expect(themeOverridesMissingNotDisabled(missingNotDisabled)).toEqual([
      'body.gruvbox_dark &:not(.is-link)'
    ])

    const missingNotIsLink = isTextBlock.replace(
      '&:not(.is-link):not(:disabled)',
      '&:not(:disabled)'
    )
    expect(themeOverridesReachingIsLink(missingNotIsLink)).toEqual([
      'body.gruvbox_dark &:not(:disabled)'
    ])
  })

  it('the override does not regress .button.is-text:hover in gruvbox_dark', () => {
    const isTextBlock = blocks.get('.button.is-text') as string
    const hoverBlock = cssBlock(read(BUTTONS_SCSS), '.button.is-text:hover')
    const scope = themeTokens(themesScss, 'body.gruvbox_dark')
    const hoverBg = resolveValue(
      declsAtDepthZero(hoverBlock, 'background')[0] ?? '',
      scope,
      globals
    )
    const overrideFg = resolveValue(
      applyTextColourDecl(isTextBlock, 'gruvbox_dark'),
      scope,
      globals
    )
    const baseFg = resolveValue(
      declsAtDepthZero(isTextBlock, 'color')[0] ?? '',
      scope,
      globals
    )
    expect(hoverBg).not.toBeNull()
    expect(overrideFg).not.toBeNull()
    expect(baseFg).not.toBeNull()
    const overrideRatio = contrastRatio(overrideFg as string, hoverBg as string)
    const baseRatio = contrastRatio(baseFg as string, hoverBg as string)
    // Object form so a failure names both ratios: the override must clear
    // 4.5 AND not regress the base-text hover ratio (expected 7.38 vs 6.09).
    expect({
      overrideRatio,
      baseRatio,
      passes: overrideRatio >= 4.5 && overrideRatio >= baseRatio
    }).toEqual({
      overrideRatio,
      baseRatio,
      passes: true
    })
  })
})

const GAME_PAGE_CSS = 'src/frontend/screens/Game/GamePage/index.css'
const GAME_SUB_MENU_TSX = join(
  REPO_ROOT,
  'src/frontend/screens/Game/GameSubMenu/index.tsx'
)
const MAIN_BUTTON_TSX = join(
  REPO_ROOT,
  'src/frontend/screens/Game/GamePage/components/MainButton.tsx'
)
const DOWNLOAD_MANAGER_TSX = join(
  REPO_ROOT,
  'src/frontend/screens/DownloadManager/index.tsx'
)
const FRONTEND_DIR = join(REPO_ROOT, 'src/frontend')

/**
 * Every `.tsx` file under `src/frontend`, `__tests__` directories excluded.
 * Copied from `navTourAnchorCensus.test.ts`'s own `walk()` -- that file's
 * own precedent is not to factor this into a shared util.
 */
function walkTsxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile())
    .filter((entry) => entry.name.endsWith('.tsx'))
    .map((entry) =>
      join((entry as unknown as { parentPath: string }).parentPath, entry.name)
    )
    .filter((path) => !path.includes(`${sep}__tests__${sep}`))
}

/**
 * A CSS specificity count sufficient for this census's plain class / type /
 * pseudo-class selectors: no id selector appears in any candidate below, so
 * `a` is always 0 by construction, not by omission. `b` counts classes,
 * attribute selectors and pseudo-classes (so `:hover`, `:not(...)` and the
 * compound's own leading class all add to it); `c` counts bare type
 * selectors. Combinators (plain whitespace, descendant only -- no `>`/`+`/`~`
 * appears in this census's candidates) are dropped by the split.
 */
function classTokenSpecificity(selector: string): [number, number, number] {
  const compounds = selector.trim().split(/\s+/)
  let a = 0
  let b = 0
  let c = 0
  for (const compound of compounds) {
    const tokens =
      compound.match(
        /#[\w-]+|\.[\w-]+|:[\w-]+(?:\([^)]*\))?|[A-Za-z][\w-]*/g
      ) ?? []
    for (const token of tokens) {
      if (token.startsWith('#')) a++
      else if (token.startsWith('.') || token.startsWith(':')) b++
      else c++
    }
  }
  return [a, b, c]
}

type ColourCandidate = {
  fullSelector: string
  value: string
  file: string
  position: number
}

/**
 * Highest `classTokenSpecificity(fullSelector)` wins; a tie is broken by
 * later source position WITHIN THE SAME FILE (how two same-specificity
 * declarations in one stylesheet resolve in the real cascade). No candidate
 * in this census ties across two different files, so a cross-file tie
 * simply keeps whichever candidate was reduced first -- documented here
 * rather than silently arbitrary.
 */
function pickWinningCandidate(candidates: ColourCandidate[]): ColourCandidate {
  return candidates.reduce((best, candidate) => {
    const bestSpec = classTokenSpecificity(best.fullSelector)
    const candSpec = classTokenSpecificity(candidate.fullSelector)
    for (let i = 0; i < 3; i++) {
      if (candSpec[i] !== bestSpec[i])
        return candSpec[i] > bestSpec[i] ? candidate : best
    }
    if (candidate.file === best.file) {
      return candidate.position > best.position ? candidate : best
    }
    return best
  })
}

/**
 * The 5 candidate `color` declarations F2 lists for the game-menu family,
 * each read from its authored stylesheet on every run -- never a hardcoded
 * copy of the resolved value. `button`'s colour is declared inside the
 * `buttonDefaultStyle` mixin body, not inside the `button { }` rule itself
 * (which only `@include`s it), so it is read from the mixin block directly.
 */
function gameMenuColourCandidates(
  buttonsScss: string,
  gamePageCss: string
): ColourCandidate[] {
  const specs: {
    fullSelector: string
    file: string
    path: string
    needle: string
  }[] = [
    {
      fullSelector: 'button',
      file: 'buttons',
      path: '@mixin buttonDefaultStyle',
      needle: '@mixin buttonDefaultStyle'
    },
    {
      fullSelector: '.button',
      file: 'buttons',
      path: '.button',
      needle: '.button'
    },
    {
      fullSelector: '.button.is-text',
      file: 'buttons',
      path: '.button.is-text',
      needle: '.button.is-text'
    },
    {
      fullSelector: '.button.is-link',
      file: 'buttons',
      path: '.button.is-link',
      needle: '.button.is-link'
    },
    {
      fullSelector: '.gameConfigContainer .game-actions .gameTools .link',
      file: 'gamePage',
      path: '.gameTools .link',
      needle: '.gameTools .link'
    }
  ]
  return specs.map(({ fullSelector, file, needle }) => {
    const source = file === 'buttons' ? buttonsScss : gamePageCss
    const block = cssBlock(source, needle)
    const decls = declsAtDepthZero(block, 'color')
    if (decls.length !== 1) {
      throw new Error(
        `expected exactly one depth-0 color in ${fullSelector}, found ${decls.length}`
      )
    }
    return {
      fullSelector,
      value: decls[0],
      file,
      position: source.indexOf(`${needle} {`)
    }
  })
}

/**
 * The resolved game-menu base-state foreground for `themeClass`, modelling
 * IACVT (F3): `.gameTools .link`'s `color: var(--navbar-inactive)` carries
 * NO fallback, so in the 8 themes that do not declare `--navbar-inactive`
 * the declaration is invalid at computed-value time and becomes `unset`.
 * Because `color` is an inherited property, the element inherits its
 * parent's computed colour instead -- it does NOT fall back to the
 * next-losing cascade candidate (`.button.is-link`'s `var(--text-default)`).
 * This function therefore never reads `.button.is-link`'s declaration at
 * all; it only ever reads `--navbar-inactive` from `scope` or
 * `--text-default` from the inherited chain (`_colors.scss:69`).
 */
function gameMenuBaseForeground(
  scope: Map<string, string>,
  globals: Map<string, string>
): string {
  if (scope.has('--navbar-inactive')) {
    const declared = resolveValue('var(--navbar-inactive)', scope, globals)
    if (declared === null)
      throw new Error('--navbar-inactive declared but unresolvable')
    return declared
  }
  const inherited = resolveValue('var(--text-default)', scope, globals)
  if (inherited === null) throw new Error('--text-default unresolvable')
  return inherited
}

/**
 * Per-theme WCAG 1.4.3 census for the game-menu `.is-link` family's own
 * text/background pair, base and hover (todo 2026-10-11, item 1/2).
 *
 * Lives here for the same reason the other censuses in this file do: the
 * cross-theme resolver (`themeTokens`, `globalTokens`, `resolveValue`,
 * `contrastRatio`) is module-private to this file.
 *
 * Reads the authored declarations FROM the stylesheets on every run, never
 * a hardcoded copy of them. Like every census in this file it cannot see a
 * pixel: no CSS engine runs under the node test environment, so a live
 * capture still adjudicates appearance -- none has been performed for this
 * plan (261015-7tt).
 */
describe('Game-menu .is-link family: render-site census, winning-rule resolution and contrast in every theme (261015-7tt)', () => {
  const themesScss = read(THEMES_SCSS)
  const buttonsScss = read(BUTTONS_SCSS)
  const gamePageCss = read(GAME_PAGE_CSS)
  const globals = globalTokens()
  const themeClasses = themeSelectors.map((s) => s.replace(/^body\./, ''))

  const candidates = gameMenuColourCandidates(buttonsScss, gamePageCss)
  const winner = pickWinningCandidate(candidates)

  const gameToolsLinkBlock = cssBlock(gamePageCss, '.gameTools .link')
  const gameToolsBlock = cssBlock(gamePageCss, '.gameTools')
  const gameToolsSurfaceDecls = declsAtDepthZero(
    gameToolsBlock,
    'background-color'
  )
  const hoverRule = nestedRules(gameToolsLinkBlock).find(
    (rule) => rule.selector === '&:hover'
  )
  if (!hoverRule) throw new Error('.gameTools .link has no &:hover rule')
  const hoverColourDecls = declsAtDepthZero(hoverRule.body, 'color')
  const hoverThemeOverrides = nestedRules(hoverRule.body)

  /**
   * The hover-state foreground for `themeClass`: a theme-scoped override
   * nested inside `&:hover` (`body.<themeClass> & { color: ... }`) if one
   * exists for this theme, else the base `&:hover` declaration read from
   * `hoverColourDecls`. Mirrors `applyTextColourDecl`'s theme-override-vs-
   * base idiom (line ~948) rather than duplicating its logic.
   */
  function gameMenuHoverForeground(
    themeClass: string,
    scope: Map<string, string>
  ): string {
    const override = hoverThemeOverrides.find(
      (rule) => rule.selector === `body.${themeClass} &`
    )
    const decls = override
      ? declsAtDepthZero(override.body, 'color')
      : hoverColourDecls
    if (decls.length !== 1) {
      throw new Error(
        `expected exactly one depth-0 hover color for ${themeClass}, found ${decls.length}`
      )
    }
    const resolved = resolveValue(decls[0], scope, globals)
    if (resolved === null) {
      throw new Error(`hover color for ${themeClass} did not resolve`)
    }
    return resolved
  }

  it('render-site census: re-derived F1 counts match exactly (23 total, 22 is-link, 21 GameSubMenu, 1 MainButton, 1 pure DownloadManager)', () => {
    const allFiles = walkTsxFiles(FRONTEND_DIR)
    expect(allFiles.length).toBeGreaterThan(100) // walk sanity, same floor as navTourAnchorCensus

    const isTextSites = allFiles.flatMap((path) => {
      const text = readFileSync(path, 'utf8')
      const matches = text.match(/className="[^"]*is-text[^"]*"/g) ?? []
      return matches.map(() => path)
    })
    expect(isTextSites).toHaveLength(23)

    // The is-link subset re-derived directly from file contents, not from
    // isTextSites, so a non-is-link site is never miscounted as one.
    const isLinkOccurrences = allFiles.flatMap((path) => {
      const text = readFileSync(path, 'utf8')
      const matches =
        text.match(/className="[^"]*is-text[^"]*is-link[^"]*"/g) ?? []
      return matches.map(() => path)
    })
    expect(isLinkOccurrences).toHaveLength(22)
    expect(
      isLinkOccurrences.filter((path) => path === GAME_SUB_MENU_TSX)
    ).toHaveLength(21)
    expect(
      isLinkOccurrences.filter((path) => path === MAIN_BUTTON_TSX)
    ).toHaveLength(1)

    const pureIsTextOccurrences = isTextSites.filter(
      (path) => path === DOWNLOAD_MANAGER_TSX
    )
    expect(pureIsTextOccurrences).toHaveLength(1)
  })

  it('non-vacuity: global tokens, all 5 candidates, the game-menu surface and the hover declaration all resolved', () => {
    expect(globals.size).toBeGreaterThan(0)
    expect(candidates).toHaveLength(5)
    expect(gameToolsSurfaceDecls).toHaveLength(1)
    expect(gameToolsSurfaceDecls[0]).toBe('var(--navbar-background)')
    expect(hoverColourDecls).toHaveLength(1)
  })

  it('winning-rule resolution: .gameConfigContainer .game-actions .gameTools .link (0,4,0) wins over .button.is-link and .button.is-text (both 0,2,0)', () => {
    expect(classTokenSpecificity('button')).toEqual([0, 0, 1])
    expect(classTokenSpecificity('.button')).toEqual([0, 1, 0])
    expect(classTokenSpecificity('.button.is-text')).toEqual([0, 2, 0])
    expect(classTokenSpecificity('.button.is-link')).toEqual([0, 2, 0])
    expect(
      classTokenSpecificity(
        '.gameConfigContainer .game-actions .gameTools .link'
      )
    ).toEqual([0, 4, 0])

    expect(winner.fullSelector).toBe(
      '.gameConfigContainer .game-actions .gameTools .link'
    )
    expect(winner.value).toBe('var(--navbar-inactive)')
  })

  it('checker can fail: dropping the winning selector down to a bare .link flips the picked winner, in memory only', () => {
    const sabotaged = candidates.map((c) =>
      c.fullSelector === '.gameConfigContainer .game-actions .gameTools .link'
        ? { ...c, fullSelector: '.link' }
        : c
    )
    const sabotagedWinner = pickWinningCandidate(sabotaged)
    expect(sabotagedWinner.fullSelector).toBe('.button.is-link')
    expect(sabotagedWinner.value).toBe('var(--text-default)')
  })

  it('IACVT: --navbar-inactive is declared in exactly 2 of 10 theme blocks and nowhere global; the consuming declaration carries no fallback', () => {
    const declaring = themeClasses.filter((t) =>
      themeTokens(themesScss, `body.${t}`).has('--navbar-inactive')
    )
    expect(declaring).toEqual(['midnightMirage', 'nord-light'])
    expect(globals.has('--navbar-inactive')).toBe(false)
    expect(winner.value).toBe('var(--navbar-inactive)') // bare form, no `, fallback`
  })

  it('IACVT can-fail: the undeclared-theme path reads --text-default from the inherited chain and is live, not hardcoded', () => {
    const scope = themeTokens(themesScss, 'body.dracula')
    expect(scope.has('--navbar-inactive')).toBe(false)
    const before = gameMenuBaseForeground(scope, globals)

    // Moving ONLY the inherited chain's token must move the answer -- this
    // proves the undeclared branch is live, not a hardcoded literal.
    const movedInherited = new Map(scope)
    movedInherited.set('--text-default', '#ff00ff')
    const afterInheritedMove = gameMenuBaseForeground(movedInherited, globals)
    expect(afterInheritedMove).toBe('#ff00ff')
    expect(afterInheritedMove).not.toBe(before)
  })

  it('IACVT can-fail: the declared-theme path reads --navbar-inactive directly and does not fall through to --text-default', () => {
    const scope = themeTokens(themesScss, 'body.midnightMirage')
    expect(scope.has('--navbar-inactive')).toBe(true)
    const before = gameMenuBaseForeground(scope, globals)

    // Moving the declared token must move the answer.
    const movedDeclared = new Map(scope)
    movedDeclared.set('--navbar-inactive', '#ff00ff')
    const afterDeclaredMove = gameMenuBaseForeground(movedDeclared, globals)
    expect(afterDeclaredMove).toBe('#ff00ff')
    expect(afterDeclaredMove).not.toBe(before)

    // Moving ONLY --text-default, leaving --navbar-inactive declared and
    // untouched, must NOT move the answer -- proving the declared branch
    // never falls through to the inherited chain.
    const movedInheritedOnly = new Map(scope)
    movedInheritedOnly.set('--text-default', '#00ffff')
    const afterInheritedOnlyMove = gameMenuBaseForeground(
      movedInheritedOnly,
      globals
    )
    expect(afterInheritedOnlyMove).toBe(before)
  })

  it.each(themeClasses)(
    '%s: game-menu BASE text clears 4.5:1 against --navbar-background',
    (theme) => {
      const scope = themeTokens(themesScss, `body.${theme}`)
      const fg = gameMenuBaseForeground(scope, globals)
      const bg = resolveValue(gameToolsSurfaceDecls[0], scope, globals)
      expect(bg).not.toBeNull()
      const ratio = contrastRatio(fg, bg as string)
      expect({ theme, fg, bg, ratio, passes: ratio >= 4.5 }).toEqual({
        theme,
        fg,
        bg,
        ratio,
        passes: true
      })
    }
  )

  it.each(themeClasses)(
    '%s: game-menu HOVER text clears 4.5:1 against --navbar-background',
    (theme) => {
      const scope = themeTokens(themesScss, `body.${theme}`)
      const fg = gameMenuHoverForeground(theme, scope)
      const bg = resolveValue(gameToolsSurfaceDecls[0], scope, globals)
      expect(bg).not.toBeNull()
      const ratio = contrastRatio(fg, bg as string)
      expect({ theme, fg, bg, ratio, passes: ratio >= 4.5 }).toEqual({
        theme,
        fg,
        bg,
        ratio,
        passes: true
      })
    }
  )

  it('dracula hover fix: the theme-scoped override is load-bearing -- removing it in memory reproduces the pre-fix 3.79:1 miss', () => {
    const scope = themeTokens(themesScss, 'body.dracula')
    const bg = resolveValue(gameToolsSurfaceDecls[0], scope, globals)
    expect(bg).not.toBeNull()

    const fixed = gameMenuHoverForeground('dracula', scope)
    const fixedRatio = contrastRatio(fixed, bg as string)
    expect(fixedRatio).toBeGreaterThanOrEqual(4.5)

    const withoutOverride = resolveValue(
      hoverColourDecls[0],
      scope,
      globals
    ) as string
    const preFixRatio = contrastRatio(withoutOverride, bg as string)
    expect(preFixRatio).toBeCloseTo(3.7935597497017444, 5)
    expect(preFixRatio).toBeLessThan(4.5)
  })

  it('dracula hover fix does not regress any other theme: no other theme carries a body.<theme> & override under &:hover', () => {
    const otherThemeOverrides = hoverThemeOverrides.filter(
      (rule) => rule.selector !== 'body.dracula &'
    )
    expect(otherThemeOverrides).toHaveLength(0)
    // And every other theme's hover ratio (measured above) still passes
    // through the unmodified bare &:hover declaration -- re-asserted here
    // directly against the stylesheet rather than trusted from the
    // it.each loop above.
    const nonDraculaThemes = themeClasses.filter((t) => t !== 'dracula')
    for (const theme of nonDraculaThemes) {
      const scope = themeTokens(themesScss, `body.${theme}`)
      const fg = gameMenuHoverForeground(theme, scope)
      const bareFg = resolveValue(hoverColourDecls[0], scope, globals)
      expect(fg).toBe(bareFg)
    }
  })
})
