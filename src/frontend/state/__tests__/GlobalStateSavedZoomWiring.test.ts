/**
 * Source-text structural gate for the boot-time saved-zoom apply (quick
 * 261015-p3q). `GlobalState.tsx` cannot be imported under this project's
 * node-environment jest (it reads `window.localStorage` at module scope), so
 * this gate pins the WIRING only; the real behaviour over
 * `applySavedZoomAtBoot` is proven by `savedZoomBoot.test.ts`'s real import.
 * Same constraint and same idiom as `GlobalStateFocusRowHydration.test.ts`:
 * readFileSync + stripSourceComments + a balanced-brace extractor.
 *
 * `stripSourceComments` runs first, so a nearby explanatory comment that
 * merely MENTIONS `zoomTimer` or `setTimeout` cannot satisfy or break any of
 * these matchers -- only real code text is matched.
 *
 * What it proves:
 *   - `applySavedZoomAtBoot` is imported;
 *   - it is called inside `componentDidMount`;
 *   - the call passes `this.state.zoomPercent`;
 *   - the call forwards to `window.api.setZoomFactor`;
 *   - the call sits BEFORE the first `window.api.handle*` registration in
 *     that method (an index comparison -- "earliest, so the 100% window
 *     stays short");
 *   - the call expression itself is not wrapped in the debounce timer the
 *     slider path (`setZoomPercent`) uses.
 *   - SELF-TEST (anti-vacuity): the same matchers REJECT a synthetic pre-fix
 *     source, so a matcher that cannot fail is caught here.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'

const globalStatePath = join(__dirname, '..', 'GlobalState.tsx')

/** Balanced extractor for `open`/`close` starting at the first `open` after `marker`. */
function extractBalanced(
  source: string,
  marker: string,
  open: string,
  close: string
): string {
  const markerIdx = source.indexOf(marker)
  if (markerIdx === -1) {
    throw new Error(`marker not found: ${marker}`)
  }
  // A marker that already ends in `open` (e.g. `foo(`) owns that bracket.
  const from = marker.endsWith(open)
    ? markerIdx + marker.length - 1
    : markerIdx + marker.length
  const start = source.indexOf(open, from)
  let depth = 0
  let i = start
  for (; i < source.length; i++) {
    if (source[i] === open) depth++
    else if (source[i] === close) {
      depth--
      if (depth === 0) break
    }
  }
  return source.slice(start, i + 1)
}

/** The gate: returns the list of wiring rules the source violates (empty = wired). */
function savedZoomWiringViolations(strippedSource: string): string[] {
  const violations: string[] = []

  if (
    !/import\s*\{[^}]*applySavedZoomAtBoot[^}]*\}\s*from\s*['"].\/savedZoomBoot['"]/.test(
      strippedSource
    )
  ) {
    violations.push('applySavedZoomAtBoot imported from ./savedZoomBoot')
  }

  let didMount: string
  try {
    didMount = extractBalanced(strippedSource, 'componentDidMount()', '{', '}')
  } catch {
    violations.push('componentDidMount block present')
    return violations
  }

  const callIdx = didMount.indexOf('applySavedZoomAtBoot(')
  if (callIdx === -1) {
    violations.push('applySavedZoomAtBoot( called inside componentDidMount')
    return violations
  }

  const call = extractBalanced(didMount, 'applySavedZoomAtBoot(', '(', ')')

  if (!/this\.state\.zoomPercent/.test(call)) {
    violations.push('call passes this.state.zoomPercent')
  }
  if (!/window\.api\.setZoomFactor/.test(call)) {
    violations.push('call forwards to window.api.setZoomFactor')
  }

  const firstHandleMatch = didMount.match(/window\.api\.handle[A-Za-z]*\(/)
  if (!firstHandleMatch || firstHandleMatch.index === undefined) {
    violations.push(
      'componentDidMount has a window.api.handle* registration to order against'
    )
  } else if (callIdx >= firstHandleMatch.index) {
    violations.push(
      'applySavedZoomAtBoot( call sits before the first window.api.handle* registration'
    )
  }

  if (
    /setTimeout\s*\(\s*\(\s*\)\s*=>\s*\{[^}]*applySavedZoomAtBoot/.test(
      didMount
    )
  ) {
    violations.push('call must not be wrapped in a debounce setTimeout')
  }

  return violations
}

describe('GlobalState.tsx -- saved-zoom boot apply wiring (261015-p3q)', () => {
  const stripped = stripSourceComments(readFileSync(globalStatePath, 'utf-8'))

  it('the real source is wired: imported, called early in componentDidMount, undebounced', () => {
    expect(savedZoomWiringViolations(stripped)).toEqual([])
  })

  it('SELF-TEST (anti-vacuity, REQUIRED): the matchers REJECT the pre-fix shape', () => {
    const preFix = [
      "import { hydrateFocusRowSelection } from 'common/focusRowMigration'",
      'class GlobalState {',
      '  zoomTimer = undefined',
      '  setZoomPercent = (newZoomPercent) => {',
      '    this.zoomTimer = setTimeout(() => {',
      '      window.api.setZoomFactor((newZoomPercent / 100).toString())',
      '    }, 500)',
      '  }',
      '  async componentDidMount() {',
      '    window.api.handleInstallGame(() => {})',
      '  }',
      '}'
    ].join('\n')

    const violations = savedZoomWiringViolations(preFix)

    expect(violations).toEqual(
      expect.arrayContaining([
        'applySavedZoomAtBoot imported from ./savedZoomBoot',
        'applySavedZoomAtBoot( called inside componentDidMount'
      ])
    )
  })

  it('SELF-TEST (anti-vacuity, REQUIRED): rejects a call wrongly wrapped in the debounce timer', () => {
    const wrongLayer = [
      "import { applySavedZoomAtBoot } from './savedZoomBoot'",
      'class GlobalState {',
      '  async componentDidMount() {',
      '    this.zoomTimer = setTimeout(() => {',
      '      applySavedZoomAtBoot({',
      '        savedZoomPercent: this.state.zoomPercent,',
      '        setZoomFactor: (f) => window.api.setZoomFactor(f),',
      '        onError: () => {}',
      '      })',
      '    }, 500)',
      '    window.api.handleInstallGame(() => {})',
      '  }',
      '}'
    ].join('\n')

    expect(savedZoomWiringViolations(wrongLayer)).toEqual(
      expect.arrayContaining([
        'call must not be wrapped in a debounce setTimeout'
      ])
    )
  })

  it('SELF-TEST (anti-vacuity, REQUIRED): rejects a call placed AFTER the first handle* registration', () => {
    const wrongOrder = [
      "import { applySavedZoomAtBoot } from './savedZoomBoot'",
      'class GlobalState {',
      '  async componentDidMount() {',
      '    window.api.handleInstallGame(() => {})',
      '    applySavedZoomAtBoot({',
      '      savedZoomPercent: this.state.zoomPercent,',
      '      setZoomFactor: (f) => window.api.setZoomFactor(f),',
      '      onError: () => {}',
      '    })',
      '  }',
      '}'
    ].join('\n')

    expect(savedZoomWiringViolations(wrongOrder)).toEqual(
      expect.arrayContaining([
        'applySavedZoomAtBoot( call sits before the first window.api.handle* registration'
      ])
    )
  })

  it('SELF-TEST (positive control): the matchers ACCEPT a minimal correctly wired shape', () => {
    const wired = [
      "import { applySavedZoomAtBoot } from './savedZoomBoot'",
      'class GlobalState {',
      '  async componentDidMount() {',
      '    applySavedZoomAtBoot({',
      '      savedZoomPercent: this.state.zoomPercent,',
      '      setZoomFactor: (f) => window.api.setZoomFactor(f),',
      '      onError: (e) => window.api.logError(String(e))',
      '    })',
      '    window.api.handleInstallGame(() => {})',
      '  }',
      '}'
    ].join('\n')

    expect(savedZoomWiringViolations(wired)).toEqual([])
  })
})
