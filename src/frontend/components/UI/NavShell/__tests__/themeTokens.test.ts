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

describe('tier2 border-inline-end (--divider finding, 34.11-09 FOURTH fix -- mechanism, not colour)', () => {
  const navShellScss = read(NAV_SHELL_SCSS)
  const tier2Block = cssBlock(navShellScss, '.NavShell__tier2')

  it('.NavShell__tier2 border-inline-end uses var(--neutral-05) at 2px', () => {
    // Colour superseded twice before this: `var(--divider)` (undefined in
    // 9/11 themes, drops the whole declaration) and `var(--body-background)`
    // (resolves everywhere, but is colour-IDENTICAL to `.App .content`'s own
    // background in every theme without a `--gradient-body-background`
    // override, per `App.css:98-100` -- a border painted the same colour as
    // the surface it abuts on one side is invisible against that side by
    // construction, independent of whether the token resolves).
    // `--neutral-05` is a global, unthemed token (styles/_colors.scss,
    // included once at `:root` in `index.scss`, never redeclared per theme
    // -- see the census test below) measured with real contrast against
    // BOTH neighbours in all three mandatory-sweep themes (7.65:1-8.83:1
    // range); a pixel-level Playwright reproduction of this exact DOM/CSS
    // structure additionally confirmed the line rasterises correctly, at
    // the right colour and position, un-occluded, in both midnightMirage
    // and high-contrast, at DPR 1 and 2 -- Chromium shows no defect.
    //
    // The re-sweep still reported it completely absent in midnightMirage,
    // which a colour/resolution defect cannot explain at those ratios. The
    // WIDTH changed instead, from 1px to 2px: `.App`'s grid
    // (`grid-template-columns: min-content 1fr`, App.css:26) is the same
    // fractional-track shape this project already measured WKWebView
    // mishandling once (`WKWebView % height vs 1fr grid row`), and Chromium
    // -- the only engine this repro could test -- cannot reproduce an
    // engine-specific rasterisation gap on a hairline that depends on
    // exactly 1 device pixel landing on a fractional grid-track boundary.
    // 2 physical CSS pixels has margin where 1 has none. The design
    // source's own literal token for this role (`--color-border: var(
    // --neutral-03)`, sources/themes/default.css:24) was checked and
    // rejected on measured evidence: ~1.26-1.45:1 in midnightMirage and
    // ~1.37:1 in high-contrast -- a near-invisible hairline by design in
    // EVERY theme, which would not fix midnightMirage and would newly break
    // the high-contrast case already confirmed working.
    expect(tier2Block).toMatch(
      /border-inline-end:\s*2px solid var\(--neutral-05\)/
    )
  })

  it('.NavShell__tier2 no longer references var(--divider), var(--body-background), or a 1px width on border-inline-end -- colour and width were each proven wrong for reasons a repeat cannot dodge', () => {
    expect(tier2Block).not.toMatch(/var\(--divider\)/)
    expect(tier2Block).not.toMatch(
      /border-inline-end:\s*1px solid var\(--body-background\)/
    )
    expect(tier2Block).not.toMatch(
      /border-inline-end:\s*1px solid var\(--neutral-05\)/
    )
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

  it('census: no theme block redeclares --neutral-05 -- the chosen token must stay the single global unthemed value the contrast measurements above were computed against, in every theme, not just the three that were live-swept', () => {
    const themesScss = read(THEMES_SCSS)
    expect(themesScss).not.toMatch(/--neutral-05:/)
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
