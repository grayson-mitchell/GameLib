/**
 * EMITTED-SELECTOR gate for `FilterFacetGroup/index.scss`'s selection badge
 * (quick task 260815-opt Task 1, the C2 control).
 *
 * Why this compiles the stylesheet instead of grepping it, unlike every
 * other style gate in this directory (`downloadsRingStyles.test.ts`,
 * `shellTokens.test.ts`, which read source text): the hazard here is not a
 * missing declaration, it is a LOSING one. `components/UI/Dropdown/index.scss`
 * styles not just its panel but the panel's CONTENTS, and it has already
 * out-specified two new row primitives introduced in this exact panel --
 * `.FilterFacetRow` (34.11, see index.scss's own 260815-mk1 comment block)
 * and then `.NavItem`. Its dangerous rules are:
 *
 *   `.dropdownContainer .dropdown`        (0,2,0)
 *   `.dropdownContainer .dropdown button` (0,2,1)
 *   `.dropdownContainer .button`          (0,2,0)  -- matches ANY descendant
 *                                                     carrying class `button`
 *
 * Source text cannot answer "does the new rule win", because SCSS nesting
 * means the selector that will actually be emitted does not appear anywhere
 * in the file. Only the compiled output carries it. And the two stylesheets
 * are imported by DIFFERENT components, so source order is not under this
 * task's control -- the only ordering-independent defence is class count.
 * This gate therefore compiles, then counts class components in the emitted
 * prelude.
 *
 * The compile runs IN-PROCESS via the `sass` package's synchronous API
 * (already a devDependency, `sass@1.89.0`; this stylesheet is self-contained
 * with no `@use`/`@import`, so it compiles standalone). It is deliberately
 * NOT shelled out through a pipe: an `esbuild ... | node -`-style pipeline
 * reports the LAST command's exit code, so a compile failure would surface
 * as a passing gate.
 *
 * What this gate does NOT and CANNOT prove: that the badge is legible, that
 * WKWebView paints it, or how it looks in any theme. No CSS engine runs
 * here. That proof is owed to the live human gate.
 */
import { join } from 'path'
import * as sass from 'sass'

const STYLESHEET_PATH = join(
  __dirname,
  '..',
  'components',
  'FilterFacetGroup',
  'index.scss'
)

type EmittedRule = {
  selector: string
  declarations: string
}

/**
 * Splits the emitted CSS into (selector prelude, declaration block) pairs.
 * Split on `}` and read each chunk's `{`-delimited halves -- adequate here
 * because the emitted output of this stylesheet is flat: nesting has already
 * been resolved by the compiler, and it contains no at-rule blocks (`@media`,
 * `@supports`) whose closing brace would confuse the split.
 */
function emittedRules(): EmittedRule[] {
  const css = sass.compile(STYLESHEET_PATH).css

  return css
    .split('}')
    .map((chunk) => {
      const braceIndex = chunk.indexOf('{')
      if (braceIndex === -1) {
        return null
      }
      return {
        selector: chunk.slice(0, braceIndex).trim(),
        declarations: chunk.slice(braceIndex + 1).trim()
      }
    })
    .filter(
      (rule): rule is EmittedRule => rule !== null && rule.selector !== ''
    )
}

/**
 * The class components of a selector, as whole tokens. Hoisted so the real
 * assertions and the SANITY counter-checks consume the exact same detector
 * -- a counter-check carrying its own re-typed copy of the pattern would
 * drift silently and prove nothing about the gate.
 */
function classTokens(selector: string): string[] {
  return (selector.match(/\.[A-Za-z_-][\w-]*/g) ?? []).map((token) =>
    token.slice(1)
  )
}

function ruleFor(rules: EmittedRule[], className: string): EmittedRule {
  const matches = rules.filter((rule) =>
    classTokens(rule.selector).includes(className)
  )
  // Bare-modifier / pseudo-class variants would also match; take the base
  // rule, i.e. the one with no pseudo-class in its prelude.
  const base = matches.find((rule) => !rule.selector.includes(':'))
  return base ?? matches[0]
}

// The highest class count Dropdown/index.scss can bring to bear on an
// element inside the disclosure header. Anything the badge rule emits must
// be strictly greater than this to win regardless of import order.
const DROPDOWN_MAX_CLASS_COUNT = 2

describe('FilterFacetGroup badge -- emitted selector specificity (C2)', () => {
  const rules = emittedRules()

  it('compiles to a non-empty rule set (a silent compile failure would make every assertion below vacuous)', () => {
    expect(rules.length).toBeGreaterThan(5)
  })

  it('emits a selector for .FilterFacetGroup__badge', () => {
    const badge = ruleFor(rules, 'FilterFacetGroup__badge')

    expect(badge).toBeDefined()
  })

  it('the badge selector carries at least three class components, beating Dropdown on class count alone', () => {
    const badge = ruleFor(rules, 'FilterFacetGroup__badge')
    const tokens = classTokens(badge?.selector ?? '')

    expect(tokens).toEqual(
      expect.arrayContaining([
        'NavShell__tier2Portal',
        'FilterFacetGroup',
        'FilterFacetGroup__badge'
      ])
    )
    expect(tokens.length).toBeGreaterThan(DROPDOWN_MAX_CLASS_COUNT)
  })

  it('the title selector likewise carries at least three class components', () => {
    const title = ruleFor(rules, 'FilterFacetGroup__title')
    const tokens = classTokens(title?.selector ?? '')

    expect(title).toBeDefined()
    expect(tokens).toEqual(
      expect.arrayContaining([
        'NavShell__tier2Portal',
        'FilterFacetGroup',
        'FilterFacetGroup__title'
      ])
    )
    expect(tokens.length).toBeGreaterThan(DROPDOWN_MAX_CLASS_COUNT)
  })

  it('SANITY: the class-count detector reports 2 for a Dropdown-style selector -- proves the >2 assertions are not vacuous', () => {
    expect(classTokens('.dropdownContainer .dropdown button')).toEqual([
      'dropdownContainer',
      'dropdown'
    ])
    expect(classTokens('.FilterFacetGroup__badge')).toHaveLength(1)
  })

  it('no emitted selector carries `button` as a whole class token (Dropdown owns .dropdownContainer .button)', () => {
    const offenders = rules.filter((rule) =>
      classTokens(rule.selector).includes('button')
    )

    expect(offenders.map((rule) => rule.selector)).toEqual([])
  })

  it('SANITY: the .button prohibition fires against a known-bad selector', () => {
    expect(classTokens('.FilterFacetGroup .button')).toContain('button')
  })

  it('the badge paints via the file-local --filter-active-color chain and introduces no bare --navbar-active consumer (C9)', () => {
    const badge = ruleFor(rules, 'FilterFacetGroup__badge')

    expect(badge?.declarations).toContain('var(--filter-active-color)')
    expect(badge?.declarations).not.toContain('var(--navbar-active')
  })
})
