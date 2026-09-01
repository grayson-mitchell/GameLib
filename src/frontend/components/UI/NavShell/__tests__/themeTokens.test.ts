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
 * The 11 real theme root selectors in themes.scss, one representative
 * selector per theme (the last comma-separated selector in a grouped theme,
 * since cssBlock's indexOf(`${selector} {`) needs a literal "selector {"
 * substring and grouped themes only close with `{` on their final selector
 * line). Verified by hand against `grep -n '^body\.' src/frontend/themes.scss`:
 *   midnightMirage; classic/cyberSpaceOasis/cyberSpaceOasisAlt;
 *   gruvbox_dark; high-contrast; dracula/dracula-classic; nord-light;
 *   nord-dark; marine/marine-classic; zombie/zombie-classic;
 *   old-school; sweet/sweet-dark.
 * cssBlock() throws if any of these no longer resolves to a real block, so a
 * renamed/removed theme fails loudly instead of a count silently drifting.
 *
 * Hoisted to module scope by the 34.11 code-review fix (WR-13) so the
 * `--navbar-active` census below uses the SAME 11 selectors the `--divider`
 * census does, rather than a second hand-maintained list.
 */
const themeSelectors = [
  'body.midnightMirage',
  'body.cyberSpaceOasisAlt',
  'body.gruvbox_dark',
  'body.high-contrast',
  'body.dracula-classic',
  'body.nord-light',
  'body.nord-dark',
  'body.marine-classic',
  'body.zombie-classic',
  'body.old-school',
  'body.sweet-dark'
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
 * theme coverage while checking exactly one of eleven themes. It stayed
 * green while CR-03 shipped: `--navbar-active` is declared in only 4 of the
 * 11 theme blocks, and four new stylesheets consumed it with NO fallback,
 * so in the other 7 themes an undefined custom property made the whole
 * declaration invalid at computed-value time and dropped it. Worst case,
 * `.FilterFacetRow--checked .FilterFacetRow__box` lost BOTH `background` and
 * `border-color` and the checked-checkbox indicator did not render at all.
 *
 * This is the census form the same file already used 80 lines lower for
 * `--divider`, applied to the token that actually needed it. It was proven
 * to FAIL against the pre-fix stylesheets before being accepted.
 */
describe('--navbar-active survives in all 11 themes (WR-13, CR-03)', () => {
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
    // (undefined in 9/11 themes) -> var(--body-background) (colour-identical
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
    // iterate the SAME 11 theme blocks rather than two hand-maintained
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

  it('body.dracula and body.dracula-classic override .NavShell__tier2::after background to var(--neutral-05)', () => {
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
      /body\.dracula \.NavShell__tier2::after,\s*\n?body\.dracula-classic \.NavShell__tier2::after\s*\{([^}]*)\}/
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
 * Every block matching `selector`, merged last-wins. `body.zombie-classic` is
 * declared TWICE in themes.scss (the second block re-points `--navbar-accent`),
 * so taking only the first block would resolve a stale value.
 */
const allBlocksFor = (source: string, selector: string): string[] => {
  // Matching the literal `selector {` is what excludes descendant rules such as
  // `body.old-school .sid-input {`, and what makes the LAST selector of a comma
  // group the one to search for -- the same reason `themeSelectors` above lists
  // `body.cyberSpaceOasisAlt` rather than `body.classic`.
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
  black: '#000000'
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
