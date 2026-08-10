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

    // The 11 real theme root selectors in themes.scss, one representative
    // selector per theme (the last comma-separated selector in a grouped
    // theme, since cssBlock's indexOf(`${selector} {`) needs a literal
    // "selector {" substring and grouped themes only close with `{` on
    // their final selector line). Verified by hand against
    // `grep -n '^body\.' src/frontend/themes.scss`:
    //   midnightMirage; classic/cyberSpaceOasis/cyberSpaceOasisAlt;
    //   gruvbox_dark; high-contrast; dracula/dracula-classic; nord-light;
    //   nord-dark; marine/marine-classic; zombie/zombie-classic;
    //   old-school; sweet/sweet-dark.
    // cssBlock() throws if any of these no longer resolves to a real block,
    // so a renamed/removed theme fails this test loudly instead of the
    // count silently drifting.
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
    const dracula = navShellScss.match(
      /body\.dracula \.NavShell__tier2::after/
    )
    expect(dracula).not.toBeNull()
    // Negative half of the same claim: no `:not(...)` guard was added here,
    // because none is needed -- unlike the border-mechanism version of this
    // override, which DID need one (a real specificity bug this project
    // found and fixed in the prior fix).
    const draculaLine = navShellScss.match(/body\.dracula \.NavShell__tier2[^\n{,]*/)
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

describe('Header background is overridden inside the tier-2 portal (34.11-09 live-sweep fix, checks 1 and 5)', () => {
  const navShellScss = read(NAV_SHELL_SCSS)
  const portalBlock = cssBlock(navShellScss, '.NavShell__tier2Portal')

  it('sanity: the extracted block is really .NavShell__tier2Portal, not some other block', () => {
    expect(portalBlock).toMatch(/overflow-y:\s*auto/)
  })

  it('overrides .Header background to transparent at higher specificity than Header/index.css alone', () => {
    // Header/index.css's own `.Header { background: var(--gradient-body-
    // background, var(--body-background)); }` predates this portal and is
    // NOT edited here -- this asserts the higher-specificity override that
    // neutralises it from the portal side instead. `> .Header` (two
    // classes) beats `.Header` (one class) regardless of stylesheet import
    // order.
    expect(portalBlock).toMatch(/>\s*\.Header\s*{[^}]*background:\s*transparent/)
  })
})
