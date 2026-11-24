/**
 * 87-67 Task 2: a disabled ToggleSwitch stays legible in the three stress themes.
 *
 * The 87-59 run found the uninstall dialog's disabled "Remove prefix" toggle nearly invisible. Its label
 * and box border were painted with `--icon-disabled`, which is `--disabled-button` (= `--neutral-03`,
 * #272f31) in midnightMirage, a few shades off the dialog surface; and hovering it set the label to
 * `--background` because the hover rule was not scoped to enabled toggles.
 *
 * The Frontend jest project has no CSS engine (see src/frontend/jest.config.js), so this reads the
 * stylesheet and the theme tokens as text, resolves the tokens the disabled rules name through each
 * theme (falling back to the `body` default and to styles/_colors.scss, as the cascade does), and holds
 * the result to WCAG 1.4.11 non-text contrast (3:1) against the dialog surface (`--modal-background`,
 * Dialog.tsx). An unresolvable token fails loudly; it is never skipped.
 *
 * Only the ratios can be proven here. Whether it LOOKS right is Re-run item 7's live check.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'
import {
  globalTokensFrom,
  themeTokensFrom
} from 'frontend/testUtils/scssTokenSource'
import { contrastRatio } from 'frontend/customThemes/colour'
import { resolveColour } from 'frontend/customThemes/tokenResolve'

const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..', '..')
const read = (relPath: string) =>
  stripSourceComments(readFileSync(join(REPO_ROOT, relPath), 'utf8'))

const TOGGLE_CSS = read('src/frontend/components/UI/ToggleSwitch/index.css')
const THEMES_SCSS = read('src/frontend/themes.scss')
const GLOBALS = globalTokensFrom(read('src/frontend/styles/_colors.scss'))

const THEMES = ['midnightMirage', 'gruvbox_dark', 'dracula'] as const
const FLOOR = 3

const DISABLED_WRAPPER = '.hiddenCheckbox[disabled] + .toggleSwitchWrapper'
const DISABLED_BOX = `${DISABLED_WRAPPER}:before`

interface Rule {
  selector: string
  declarations: Map<string, string>
}

const rules = (css: string): Rule[] =>
  [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => {
    const body = (m[2] ?? '').trim()
    const declarations = new Map<string, string>()
    for (const decl of body.split(';')) {
      const [prop, ...rest] = decl.split(':')
      if (prop && rest.length > 0) {
        declarations.set(prop.trim(), rest.join(':').trim())
      }
    }
    return {
      selector: (m[1] ?? '').trim().replace(/\s+/g, ' '),
      declarations
    }
  })

const declared = (selector: string, prop: string): string => {
  const rule = rules(TOGGLE_CSS).find((r) => r.selector === selector)
  const value = rule?.declarations.get(prop)
  if (value === undefined) {
    throw new Error(`ToggleSwitch/index.css has no \`${prop}\` on ${selector}`)
  }
  return value
}

const resolveIn = (theme: string, decl: string): string => {
  const scope = themeTokensFrom(THEMES_SCSS, `body.${theme}`)
  const colour = resolveColour(decl, scope, GLOBALS)
  if (colour === null) {
    throw new Error(`${decl} does not resolve in ${theme}`)
  }
  return colour
}

const surface = (theme: string) => resolveIn(theme, 'var(--modal-background)')

describe('disabled ToggleSwitch contrast (87-67)', () => {
  it('reads real, non-empty rules and tokens (guard against a vacuous pass)', () => {
    expect(rules(TOGGLE_CSS).length).toBeGreaterThan(5)
    expect(surface('dracula')).toMatch(/^#/)
  })

  describe.each(THEMES)('%s', (theme) => {
    it(`paints the disabled label at ${FLOOR}:1 or better against the dialog surface`, () => {
      const label = resolveIn(theme, declared(DISABLED_WRAPPER, 'color'))
      const ratio = contrastRatio(label, surface(theme))
      expect(ratio).toBeGreaterThanOrEqual(FLOOR)
    })

    it(`paints the disabled box border at ${FLOOR}:1 or better against the dialog surface`, () => {
      const border = resolveIn(theme, declared(DISABLED_BOX, 'border-color'))
      const ratio = contrastRatio(border, surface(theme))
      expect(ratio).toBeGreaterThanOrEqual(FLOOR)
    })

    it('keeps the disabled label distinguishable from the enabled label', () => {
      const disabled = resolveIn(theme, declared(DISABLED_WRAPPER, 'color'))
      const enabled = resolveIn(theme, 'var(--text-default)')
      expect(disabled.toLowerCase()).not.toBe(enabled.toLowerCase())
    })
  })

  it('has no hover rule that recolours a disabled toggle to --background', () => {
    const offenders = rules(TOGGLE_CSS).filter(
      (r) =>
        r.selector.includes(':hover') &&
        (r.declarations.get('color') ?? '').includes('--background') &&
        !r.selector.includes(':not([disabled])')
    )
    expect(offenders.map((r) => r.selector)).toEqual([])
  })
})
