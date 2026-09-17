/**
 * One assertion group per `deriveRowState()`-derived state for
 * `WinetricksBrowse/Row` (plan 44-03, Task 3), plus the C-4 invariant
 * (ROADMAP fence 3): a Needs-GUI verb must never render an Install button,
 * regardless of installed/installing/errored state, proved across the full
 * 8-verb x {installed, installing, errored} cross-product (8 x 2 x 2 x 2 =
 * 64 cases) rather than a single case, per the plan's own instruction that a
 * single-case test would not prove the "regardless of state" claim. A third
 * group asserts the COMPILED CSS of `Row/index.scss` (sass API), following
 * `NavShell/__tests__/facetGroupBadgeStyles.test.ts`'s precedent -- source
 * nesting cannot answer whether a rule out-specifies `Dropdown/index.scss`,
 * only the compiled output can.
 *
 * No jsdom / react-test-renderer is installed in this project (see
 * `src/frontend/jest.config.js`); harness copied from
 * `winetricksInstallMouseRace.test.tsx` (itself ported from
 * `WinetricksSearch/__tests__/winetricksInstallMouseRace.test.tsx`, D-19).
 */
import { join } from 'path'
import * as sass from 'sass'
import type { ReactElement } from 'react'
import type { WinetricksComponent } from 'common/types'
import type { VerbErrorMap } from 'common/winetricks/deriveRowState'
import { NEEDS_GUI_WINETRICKS_VERBS } from 'common/winetricks/verbs'

jest.mock('../Row/index.scss', () => ({}))

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (
      _key: string,
      defaultValue: string,
      _options?: Record<string, unknown>
    ): string => defaultValue
  })
}))

jest.mock('react', () => {
  const actualReact = jest.requireActual<typeof import('react')>('react')
  let refSlots: { current: unknown }[] = []
  let refCursor = 0

  return {
    ...actualReact,
    useRef: (initial: unknown) => {
      const idx = refCursor++
      if (idx >= refSlots.length) {
        refSlots[idx] = { current: initial }
      }
      return refSlots[idx]
    },
    __beginRender: () => {
      refCursor = 0
    },
    __resetMount: () => {
      refSlots = []
      refCursor = 0
    }
  }
})

import WinetricksBrowseRow from '../Row/index'

type RowProps = {
  component: WinetricksComponent
  installed: readonly string[]
  installing: boolean
  installingComponent: string
  erroredVerbs: VerbErrorMap
  onInstall: (verb: string) => void
  onOpenGui: () => void
}

type HookHarness = { __beginRender: () => void; __resetMount: () => void }

function harness(): HookHarness {
  return jest.requireMock('react') as unknown as HookHarness
}

function mount(props: RowProps): ReactElement {
  harness().__resetMount()
  harness().__beginRender()
  return WinetricksBrowseRow(props) as unknown as ReactElement
}

interface ElementLike {
  type: unknown
  props: Record<string, unknown> & { children?: unknown; id?: string }
}

function walk(node: unknown, visit: (el: ElementLike) => void): void {
  if (Array.isArray(node)) {
    node.forEach((child) => walk(child, visit))
    return
  }
  if (!node || typeof node !== 'object') return
  const el = node as ElementLike
  if (!('props' in el) || !el.props) return
  visit(el)
  walk(el.props.children, visit)
}

function hasClass(el: ElementLike, token: string): boolean {
  const cn = el.props.className
  return typeof cn === 'string' && cn.split(/\s+/).includes(token)
}

function findByClass(
  tree: ElementLike,
  token: string
): ElementLike | undefined {
  let found: ElementLike | undefined
  walk(tree, (el) => {
    if (!found && hasClass(el, token)) found = el
  })
  return found
}

function existsByClass(tree: ElementLike, token: string): boolean {
  return findByClass(tree, token) !== undefined
}

function findById(tree: ElementLike, id: string): ElementLike | undefined {
  let found: ElementLike | undefined
  walk(tree, (el) => {
    if (!found && el.props.id === id) found = el
  })
  return found
}

const VCRUN: WinetricksComponent = {
  verb: 'vcrun2019',
  title: 'Visual C++ 2019 libraries',
  category: 'dlls',
  cached: false
}

function baseProps(overrides: Partial<RowProps> = {}): RowProps {
  return {
    component: VCRUN,
    installed: [],
    installing: false,
    installingComponent: '',
    erroredVerbs: {},
    onInstall: () => undefined,
    onOpenGui: () => undefined,
    ...overrides
  }
}

function mountTree(overrides: Partial<RowProps> = {}): ElementLike {
  return mount(baseProps(overrides)) as unknown as ElementLike
}

describe('available', () => {
  it('an enabled Install button exists', () => {
    const tree = mountTree()
    const button = findByClass(tree, 'WinetricksBrowse__installButton')
    expect(button).toBeDefined()
    expect(button?.props.disabled).toBeUndefined()
  })

  it('no Installed badge exists', () => {
    const tree = mountTree()
    expect(existsByClass(tree, 'WinetricksBrowse__tag--installed')).toBe(false)
  })

  it('no spinner (installing indicator) exists', () => {
    const tree = mountTree()
    expect(existsByClass(tree, 'WinetricksBrowse__tag--installing')).toBe(false)
  })
})

describe('available + cached (cached is a modifier, not a state)', () => {
  it('the cached badge exists', () => {
    const tree = mountTree({ component: { ...VCRUN, cached: true } })
    expect(existsByClass(tree, 'WinetricksBrowse__tag--cached')).toBe(true)
  })

  it('the Install button still exists alongside the cached badge', () => {
    const tree = mountTree({ component: { ...VCRUN, cached: true } })
    expect(findByClass(tree, 'WinetricksBrowse__installButton')).toBeDefined()
  })
})

describe('installing (this row)', () => {
  const overrides = { installing: true, installingComponent: 'vcrun2019' }

  it('the installing text (spinner badge) exists', () => {
    const tree = mountTree(overrides)
    expect(existsByClass(tree, 'WinetricksBrowse__tag--installing')).toBe(true)
  })

  it('no Install button exists', () => {
    const tree = mountTree(overrides)
    expect(findByClass(tree, 'WinetricksBrowse__installButton')).toBeUndefined()
  })
})

describe('installingElsewhere', () => {
  // A DIFFERENT verb is installing, so this row's own verb is neither
  // installing nor installed nor errored -- deriveRowState falls through to
  // installingElsewhere.
  const overrides = { installing: true, installingComponent: 'dotnet48' }

  it('an Install button exists', () => {
    const tree = mountTree(overrides)
    expect(findByClass(tree, 'WinetricksBrowse__installButton')).toBeDefined()
  })

  it('the Install button is disabled', () => {
    const tree = mountTree(overrides)
    const button = findByClass(tree, 'WinetricksBrowse__installButton')
    expect(button?.props.disabled).toBe(true)
  })

  it('the Install button carries a non-empty title explaining why (never a silent dead button)', () => {
    const tree = mountTree(overrides)
    const button = findByClass(tree, 'WinetricksBrowse__installButton')
    expect(typeof button?.props.title).toBe('string')
    expect((button?.props.title as string).length).toBeGreaterThan(0)
  })
})

describe('installed', () => {
  const overrides = { installed: ['vcrun2019'] }

  it('the Installed badge exists', () => {
    const tree = mountTree(overrides)
    expect(existsByClass(tree, 'WinetricksBrowse__tag--installed')).toBe(true)
  })

  it('no Install button exists (D-12: badge only, no reinstall affordance)', () => {
    const tree = mountTree(overrides)
    expect(findByClass(tree, 'WinetricksBrowse__installButton')).toBeUndefined()
  })

  it('no Retry button exists', () => {
    const tree = mountTree(overrides)
    expect(findByClass(tree, 'WinetricksBrowse__retryButton')).toBeUndefined()
  })
})

describe('errored', () => {
  const overrides: Partial<RowProps> = { erroredVerbs: { vcrun2019: true } }

  it('the failure badge exists', () => {
    const tree = mountTree(overrides)
    expect(existsByClass(tree, 'WinetricksBrowse__tag--errored')).toBe(true)
  })

  it('a Retry button exists', () => {
    const tree = mountTree(overrides)
    expect(findByClass(tree, 'WinetricksBrowse__retryButton')).toBeDefined()
  })

  it('the Retry button is bound to this row verb', () => {
    const onInstall = jest.fn()
    const tree = mountTree({ ...overrides, onInstall })
    const button = findByClass(tree, 'WinetricksBrowse__retryButton')
    const onClick = button?.props.onClick as (() => void) | undefined
    onClick?.()
    expect(onInstall).toHaveBeenCalledWith('vcrun2019')
  })
})

const NEEDS_GUI_COMPONENT: WinetricksComponent = {
  verb: '3dmark03',
  title: '3DMark03',
  category: 'benchmarks',
  cached: false
}

describe('needsGui', () => {
  it('no Install button exists', () => {
    const tree = mountTree({ component: NEEDS_GUI_COMPONENT })
    expect(findByClass(tree, 'WinetricksBrowse__installButton')).toBeUndefined()
  })

  it('an Open GUI button exists', () => {
    const tree = mountTree({ component: NEEDS_GUI_COMPONENT })
    expect(findByClass(tree, 'WinetricksBrowse__guiButton')).toBeDefined()
  })

  it('the Needs-GUI badge exists', () => {
    const tree = mountTree({ component: NEEDS_GUI_COMPONENT })
    expect(existsByClass(tree, 'WinetricksBrowse__tag--needsGui')).toBe(true)
  })
})

// C-4 / ROADMAP fence 3 invariant, parametrised over the full cross-product
// so the "regardless of installed/installing/errored state" claim is
// actually proven rather than assumed from a single case: 8 Needs-GUI verbs
// x {installed: yes/no} x {installing: yes/no} x {errored: yes/no} = 64
// cases, every one of which must render NO Install button.
describe('needsGui: C-4 invariant -- no Install button in any of the 64 installed/installing/errored combinations', () => {
  const needsGuiVerbs = Array.from(NEEDS_GUI_WINETRICKS_VERBS)
  const bools = [true, false]
  let caseCount = 0

  for (const verb of needsGuiVerbs) {
    for (const isInstalled of bools) {
      for (const isInstalling of bools) {
        for (const isErrored of bools) {
          caseCount += 1
          it(`needsGui verb "${verb}": installed=${isInstalled} installing=${isInstalling} errored=${isErrored} renders no Install button`, () => {
            const component: WinetricksComponent = {
              verb,
              title: verb,
              category: 'needsGui',
              cached: false
            }
            const tree = mountTree({
              component,
              installed: isInstalled ? [verb] : [],
              installing: isInstalling,
              installingComponent: isInstalling ? verb : '',
              erroredVerbs: isErrored ? { [verb]: true } : {}
            })
            expect(
              findByClass(tree, 'WinetricksBrowse__installButton')
            ).toBeUndefined()
          })
        }
      }
    }
  }

  it('SANITY: this describe block generated exactly 64 parametrised cases (8 verbs x 2 x 2 x 2) -- proves the loop above is not vacuous', () => {
    expect(needsGuiVerbs).toHaveLength(8)
    expect(caseCount).toBe(64)
  })
})

describe('accessible names (aria-labelledby, zero new locale keys)', () => {
  it('Install button: aria-labelledby contains the row title id and a matching label span exists', () => {
    const tree = mountTree()
    const button = findByClass(tree, 'WinetricksBrowse__installButton')
    const labelledBy = button?.props['aria-labelledby'] as string | undefined
    expect(typeof labelledBy).toBe('string')
    expect(labelledBy).toContain('wtb-title-vcrun2019')

    const [labelId, titleId] = (labelledBy as string).split(' ')
    expect(findById(tree, labelId)).toBeDefined()
    expect(findById(tree, titleId)).toBeDefined()
  })

  it('Retry button: aria-labelledby contains the row title id and a matching label span exists', () => {
    const tree = mountTree({ erroredVerbs: { vcrun2019: true } })
    const button = findByClass(tree, 'WinetricksBrowse__retryButton')
    const labelledBy = button?.props['aria-labelledby'] as string | undefined
    expect(typeof labelledBy).toBe('string')
    expect(labelledBy).toContain('wtb-title-vcrun2019')

    const [labelId, titleId] = (labelledBy as string).split(' ')
    expect(findById(tree, labelId)).toBeDefined()
    expect(findById(tree, titleId)).toBeDefined()
  })

  it('Open GUI button: aria-labelledby contains the row title id and a matching label span exists', () => {
    const tree = mountTree({ component: NEEDS_GUI_COMPONENT })
    const button = findByClass(tree, 'WinetricksBrowse__guiButton')
    const labelledBy = button?.props['aria-labelledby'] as string | undefined
    expect(typeof labelledBy).toBe('string')
    expect(labelledBy).toContain('wtb-title-3dmark03')

    const [labelId, titleId] = (labelledBy as string).split(' ')
    expect(findById(tree, labelId)).toBeDefined()
    expect(findById(tree, titleId)).toBeDefined()
  })
})

// Compiled-CSS group, following facetGroupBadgeStyles.test.ts's precedent:
// source nesting cannot answer whether a selector out-specifies
// Dropdown/index.scss (the winning selector is only visible post-compile,
// and the two stylesheets are imported by different components so source
// order is not under this task's control), so this compiles via the `sass`
// package's synchronous API rather than grepping source text.
describe('Row/index.scss -- emitted selector specificity and no raw --status- tokens', () => {
  const STYLESHEET_PATH = join(__dirname, '..', 'Row', 'index.scss')

  type EmittedRule = { selector: string; declarations: string }

  function emittedRules(): EmittedRule[] {
    const css = sass.compile(STYLESHEET_PATH).css
    return css
      .split('}')
      .map((chunk) => {
        const braceIndex = chunk.indexOf('{')
        if (braceIndex === -1) return null
        return {
          selector: chunk.slice(0, braceIndex).trim(),
          declarations: chunk.slice(braceIndex + 1).trim()
        }
      })
      .filter(
        (rule): rule is EmittedRule => rule !== null && rule.selector !== ''
      )
  }

  function classTokens(selector: string): string[] {
    return (selector.match(/\.[A-Za-z_-][\w-]*/g) ?? []).map((token) =>
      token.slice(1)
    )
  }

  // The highest class count Dropdown/index.scss can bring to bear on an
  // element inside its panel (`.dropdownContainer .dropdown button`).
  const DROPDOWN_MAX_CLASS_COUNT = 2

  const rules = emittedRules()

  it('compiles to a non-empty rule set (a silent compile failure would make every assertion below vacuous)', () => {
    expect(rules.length).toBeGreaterThan(5)
  })

  it('no compiled declaration references a raw --status- token', () => {
    const offenders = rules.filter((rule) =>
      rule.declarations.includes('var(--status-')
    )
    expect(offenders).toEqual([])
  })

  it('the row selector carries 3 or more class tokens, beating Dropdown on class count alone', () => {
    const rowRule = rules.find((rule) =>
      classTokens(rule.selector).includes('WinetricksBrowse__row')
    )
    const tokens = classTokens(rowRule?.selector ?? '')
    expect(tokens.length).toBeGreaterThan(DROPDOWN_MAX_CLASS_COUNT)
  })

  it('each action button selector carries 3 or more class tokens', () => {
    for (const buttonClass of [
      'WinetricksBrowse__installButton',
      'WinetricksBrowse__retryButton',
      'WinetricksBrowse__guiButton'
    ]) {
      const buttonRule = rules.find((rule) =>
        classTokens(rule.selector).includes(buttonClass)
      )
      expect(buttonRule).toBeDefined()
      const tokens = classTokens(buttonRule?.selector ?? '')
      expect(tokens.length).toBeGreaterThan(DROPDOWN_MAX_CLASS_COUNT)
    }
  })

  it('SANITY: the class-count detector reports 2 for a Dropdown-style selector -- proves the >2 assertions are not vacuous', () => {
    expect(classTokens('.dropdownContainer .dropdown button')).toEqual([
      'dropdownContainer',
      'dropdown'
    ])
  })
})
