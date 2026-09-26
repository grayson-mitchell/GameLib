/**
 * Cross-surface source-text gate for the shared controller/keyboard focus
 * indicator (quick task 260926-acw).
 *
 * F1 -- why the CSS cannot rely on `:focus-visible` alone: Tauri's gamepad
 * input (`src/preload/api/tauriGamepadInput.ts`) dispatches UNTRUSTED
 * synthetic `KeyboardEvent`s and then moves focus with a bare `.focus()`
 * (`doTab`, `moveFocusDirectionally`), never passing `{ focusVisible: true }`.
 * Console Mode moves focus the same way (`ConsoleMode/index.tsx`'s
 * `btns[next].focus()`). Chromium/WebKit decide whether a script `.focus()`
 * matches `:focus-visible` from the last TRUSTED user interaction, and a
 * gamepad press is not one -- so after any mouse use, gamepad-moved focus
 * will often not match `:focus-visible` at all.
 *
 * F2 -- the fallback, and its one nesting trap: `GlobalState.tsx` toggles
 * `document.body.classList.toggle('controllerLayout', ...)` on the
 * `controller-changed` event, so every targeted rule additionally matches
 * `X:focus:is(body.controllerLayout *)`. This SUFFIX form is required, not
 * a `body.controllerLayout X:focus` PREFIX form: most tier-2 rules are
 * nested inside a `.NavShell__tier2Portal { ... }` wrapper, where a prefix
 * form would compile to `.NavShell__tier2Portal body.controllerLayout ...`
 * and never match a real DOM tree (body is never a descendant of the
 * portal). The suffix form works nested, unnested, and in plain `.css`
 * files alike -- assertion (e) below is the guard against the prefix trap
 * reappearing.
 *
 * What this gate proves: that the shared tokens exist and resolve
 * per-theme, that every targeted surface carries both selector arms and
 * consumes the tokens, that hover and focus are never grouped in one
 * selector list on these surfaces, and that no targeted focus rule
 * reintroduces the undefined `--text-hover` token that silently dropped
 * NavItem's focus outline in gruvbox_dark and dracula.
 *
 * What this gate does NOT prove: that the ring is actually perceptible to
 * an operator, that it is legible against any given theme's contrast, or
 * that `:focus-within`/`:focus-visible` fire for a given real input path.
 * Perceptibility is the operator's live controller sweep
 * (`.planning/todos/pending/2026-09-25-controller-focus-has-no-perceptible-affordance.md`),
 * not this gate's job -- a gate that appears to cover more than it does is
 * worse than no gate at all.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { compile } from 'sass'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'

const STYLES_DIR = join(__dirname, '..')
const FRONTEND_DIR = join(STYLES_DIR, '..')

function compileScss(relativePath: string): string {
  return compile(join(FRONTEND_DIR, relativePath)).css
}

function readRawCss(relativePath: string): string {
  const raw = readFileSync(join(FRONTEND_DIR, relativePath), 'utf8')
  return stripSourceComments(raw)
}

const themesScss = readRawCss('themes.scss')
const consoleModeCss = compileScss('screens/ConsoleMode/index.scss')
const gamePageCss = readRawCss('screens/Game/GamePage/index.css')
const filterFacetGroupCss = compileScss(
  'components/UI/NavShell/components/FilterFacetGroup/index.scss'
)
const filterMoreGroupCss = compileScss(
  'components/UI/NavShell/components/FilterMoreGroup/index.scss'
)
const navItemCss = compileScss(
  'components/UI/NavShell/components/NavItem/index.scss'
)

const NAVSHELL_COMPILED_CSS = [
  filterFacetGroupCss,
  filterMoreGroupCss,
  navItemCss
]

function ruleBody(css: string, selector: RegExp): string {
  const match = css.match(selector)
  if (!match) {
    throw new Error(`could not find a rule matching ${selector}`)
  }
  return match[0]
}

// Targeted focus rules, one canonical-pair regex each, keyed to the surface
// name for readable failures. Each pattern captures the FULL rule (both
// selector arms plus the declaration block) so its body can be inspected.
const TARGETED_RULES: Record<string, RegExp> = {
  '.consoleChip': /\.consoleChip:focus-visible,[^{]*\{[^}]*\}/,
  '.consoleChip.active': /\.consoleChip\.active:focus-visible,[^{]*\{[^}]*\}/,
  '.consoleQuitButton (cancel pill)':
    /\.consoleQuitButton:focus-visible,[^{]*\{[^}]*\}/,
  '.consoleQuitButton.danger':
    /\.consoleQuitButton\.danger:focus-visible,[^{]*\{[^}]*\}/,
  '.SteamInstallCaret .dropdownButton':
    /\.SteamInstallCaret \.dropdownButton:focus-visible,[^{]*\{[^}]*\}/,
  '.FilterFacetGroup .dropdownButton':
    /\.FilterFacetGroup \.dropdownButton:focus-visible,[^{]*\{[^}]*\}/,
  '.FilterFacetRow':
    /\.FilterFacetGroup \.FilterFacetRow:focus-visible,[^{]*\{[^}]*\}/,
  '.FilterMoreGroup__only':
    /\.FilterMoreGroup__only:focus-visible,[^{]*\{[^}]*\}/,
  '.NavItem': /\.NavItem:focus-visible,[^{]*\{[^}]*\}/
}

function sourceForSurface(name: string): string {
  if (name.startsWith('.consoleChip') || name.startsWith('.consoleQuitButton'))
    return consoleModeCss
  if (name === '.SteamInstallCaret .dropdownButton') return gamePageCss
  if (
    name === '.FilterFacetGroup .dropdownButton' ||
    name === '.FilterFacetRow'
  )
    return filterFacetGroupCss
  if (name === '.FilterMoreGroup__only') return filterMoreGroupCss
  if (name === '.NavItem') return navItemCss
  throw new Error(`no source mapped for surface ${name}`)
}

describe('themes.scss: shared --focus-ring-* tokens (assertion a)', () => {
  it('the base body {} block (before body.alphabet-filter-button--active) declares all four tokens', () => {
    const baseBodyBlock = ruleBody(themesScss, /^body\s*\{[\s\S]*?\n\}/m)

    expect(baseBodyBlock).toMatch(/--focus-ring-color:/)
    expect(baseBodyBlock).toMatch(/--focus-ring-halo:/)
    expect(baseBodyBlock).toMatch(/--focus-ring-width:/)
    expect(baseBodyBlock).toMatch(/--focus-ring-fill:/)
  })

  it('--focus-ring-color references var(--accent', () => {
    const baseBodyBlock = ruleBody(themesScss, /^body\s*\{[\s\S]*?\n\}/m)
    const line = baseBodyBlock.match(/--focus-ring-color:[^;]*;/)?.[0]

    expect(line).toBeDefined()
    expect(line).toMatch(/var\(--accent/)
  })

  it('--focus-ring-halo has a fallback chain', () => {
    const baseBodyBlock = ruleBody(themesScss, /^body\s*\{[\s\S]*?\n\}/m)
    const line = baseBodyBlock.match(/--focus-ring-halo:[^;]*;/)?.[0]

    expect(line).toBeDefined()
    // A fallback chain means var(...) nests at least one more var(...) inside it.
    expect(line).toMatch(/var\(--\S+,\s*var\(/)
  })
})

describe('Every targeted surface carries both canonical selector arms (assertion b)', () => {
  for (const [name, pattern] of Object.entries(TARGETED_RULES)) {
    it(`${name} has both X:focus-visible and X:focus:is(body.controllerLayout *)`, () => {
      const css = sourceForSurface(name)
      const rule = ruleBody(css, pattern)

      expect(rule).toMatch(/:focus-visible/)
      expect(rule).toMatch(/:focus:is\(body\.controllerLayout \*\)/)
    })
  }
})

describe('Every targeted focus rule consumes --focus-ring-color (assertion c)', () => {
  for (const [name, pattern] of Object.entries(TARGETED_RULES)) {
    it(`${name}'s focus rule declares var(--focus-ring-color)`, () => {
      const css = sourceForSurface(name)
      const rule = ruleBody(css, pattern)

      expect(rule).toMatch(/var\(--focus-ring-color/)
    })
  }
})

describe('Hover and focus are never grouped in one selector list on targeted surfaces (assertion d)', () => {
  it('ConsoleMode: no selector list mixes :hover and :focus/:focus-visible for .consoleChip or .consoleQuitButton', () => {
    // A grouped selector list looks like "X:hover,\n  X:focus..." (or the
    // reverse order) sharing one declaration block. None of the targeted
    // classes may do this any more -- each hover and each focus rule must
    // be its own declaration block.
    const groupedPattern =
      /\.(consoleChip|consoleQuitButton)[^{,]*:hover[^{]*,[^{]*:focus[^{]*\{|\.(consoleChip|consoleQuitButton)[^{,]*:focus[^{]*,[^{]*:hover[^{]*\{/
    expect(consoleModeCss).not.toMatch(groupedPattern)
  })

  it('GamePage caret: no selector list mixes :hover and :focus for .SteamInstallCaret .dropdownButton', () => {
    const groupedPattern =
      /\.SteamInstallCaret \.dropdownButton[^{,]*:hover[^{]*,[^{]*:focus[^{]*\{|\.SteamInstallCaret \.dropdownButton[^{,]*:focus[^{]*,[^{]*:hover[^{]*\{/
    expect(gamePageCss).not.toMatch(groupedPattern)
  })

  it('NavShell tier-2 files: no selector list mixes :hover and :focus for any targeted class', () => {
    for (const css of NAVSHELL_COMPILED_CSS) {
      const groupedPattern = /[^{,]*:hover[^{]*,[^{]*:focus[^{]*\{/
      expect(css).not.toMatch(groupedPattern)
    }
  })
})

describe('No prefix-form controllerLayout selector leaked into the NavShell files (assertion e)', () => {
  it('every "body.controllerLayout" occurrence sits inside :is(body.controllerLayout *), never as a preceding ancestor', () => {
    for (const css of NAVSHELL_COMPILED_CSS) {
      const occurrences = css.match(/body\.controllerLayout/g) ?? []
      expect(occurrences.length).toBeGreaterThan(0)

      // Every occurrence must be immediately preceded by ":is(" and
      // immediately followed by " *)". A prefix-form leak
      // (".NavShell__tier2Portal body.controllerLayout ...") would put
      // "body.controllerLayout" right after a space with no ":is(" before
      // it -- this regex requires the ":is(" wrapper on ALL occurrences.
      const wrapped = css.match(/:is\(body\.controllerLayout \*\)/g) ?? []
      expect(wrapped.length).toBe(occurrences.length)
    }
  })

  it('no compiled NavShell selector puts body.controllerLayout as an ancestor of .NavShell*', () => {
    for (const css of NAVSHELL_COMPILED_CSS) {
      expect(css).not.toMatch(/body\.controllerLayout\s+\S*\.NavShell/)
      expect(css).not.toMatch(
        /\.NavShell__tier2Portal\s+body(?!\.controllerLayout \*\))/
      )
    }
  })
})

describe('No targeted focus block reintroduces the undefined --text-hover token (assertion f)', () => {
  it('.NavItem focus rule does not consume var(--text-hover)', () => {
    const rule = ruleBody(navItemCss, TARGETED_RULES['.NavItem'])

    expect(rule).not.toMatch(/var\(--text-hover\)/)
  })

  it('no targeted rule in this gate consumes var(--text-hover)', () => {
    for (const [name, pattern] of Object.entries(TARGETED_RULES)) {
      const css = sourceForSurface(name)
      const rule = ruleBody(css, pattern)

      expect(rule).not.toMatch(/var\(--text-hover\)/)
    }
  })
})
