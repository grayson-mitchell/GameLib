/**
 * Source-text structural gate for CR-01 (Phase 48 Plan 07): the renderer must
 * hydrate the migrated `focusRow` on the FIRST launch of a legacy profile.
 *
 * What regressed: `GlobalState` seeded `focusRow` straight off the
 * `store/config.json` `settings` mirror (`globalSettings?.focusRow ?? null`),
 * which the backend's one-time `libraryTopSection` migration never writes. The
 * behaviour itself is proven end to end (real config, real handler, real
 * setter) by `src/backend/sidecar/__tests__/focusRowFirstLaunchHydration.test.ts`;
 * this gate only pins the WIRING, because `GlobalState.tsx` cannot be imported
 * under this project's node-environment jest (it reads `window.localStorage`
 * at module scope). Same constraint and same idiom as
 * `GlobalStateSteamCacheHydration.test.ts`: readFileSync + stripSourceComments
 * + a balanced-brace extractor.
 *
 * What it proves:
 *   - the module-scope `seedFocusRowFromMirror(globalSettings)` exists, before
 *     the class;
 *   - the `state` initialiser's `focusRow:` reads `focusRowMirrorSeed.focusRow`
 *     and no longer reads the mirror directly;
 *   - `componentDidMount` guards on `needsMigratedValue` and calls
 *     `hydrateFocusRowSelection(` with the real requestAppSettings, the real
 *     setSetting and the picked-this-session flag;
 *   - `handleFocusRow` sets `this.focusRowPickedThisSession = true`;
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
function focusRowWiringViolations(strippedSource: string): string[] {
  const violations: string[] = []

  const seedCall = strippedSource.indexOf(
    'seedFocusRowFromMirror(globalSettings)'
  )
  const classStart = strippedSource.indexOf('class GlobalState')
  if (seedCall === -1 || classStart === -1 || seedCall > classStart) {
    violations.push('module-scope seedFocusRowFromMirror(globalSettings)')
  }

  try {
    const stateBlock = extractBalanced(
      strippedSource,
      'state: StateProps = ',
      '{',
      '}'
    )
    if (!/focusRow:\s*focusRowMirrorSeed\.focusRow/.test(stateBlock)) {
      violations.push('state initialiser reads focusRowMirrorSeed.focusRow')
    }
    if (/globalSettings\?\.focusRow/.test(stateBlock)) {
      violations.push('state initialiser must not read the mirror directly')
    }
  } catch {
    violations.push('state initialiser block present')
  }

  try {
    const didMount = extractBalanced(
      strippedSource,
      'componentDidMount()',
      '{',
      '}'
    )
    if (
      !/if\s*\(\s*focusRowMirrorSeed\.needsMigratedValue\s*\)/.test(didMount)
    ) {
      violations.push('componentDidMount needsMigratedValue guard')
    }
    const call = extractBalanced(
      didMount,
      'hydrateFocusRowSelection(',
      '(',
      ')'
    )
    if (!/window\.api\.requestAppSettings/.test(call)) {
      violations.push('hydrate call uses window.api.requestAppSettings')
    }
    if (!/window\.api\.setSetting/.test(call)) {
      violations.push('hydrate call uses window.api.setSetting')
    }
    if (!/focusRowPickedThisSession/.test(call)) {
      violations.push('hydrate call reads focusRowPickedThisSession')
    }
  } catch {
    violations.push('componentDidMount hydrateFocusRowSelection( call')
  }

  try {
    const handler = extractBalanced(
      strippedSource,
      'handleFocusRow = (',
      '{',
      '}'
    )
    if (!/this\.focusRowPickedThisSession\s*=\s*true/.test(handler)) {
      violations.push('handleFocusRow sets focusRowPickedThisSession')
    }
  } catch {
    violations.push('handleFocusRow block present')
  }

  return violations
}

describe('GlobalState.tsx focusRow -- first-launch hydration wiring (CR-01, 48-07)', () => {
  const stripped = stripSourceComments(readFileSync(globalStatePath, 'utf-8'))

  it('the real source is wired: mirror seed, initialiser, guarded hydrate call, picked-this-session flag', () => {
    expect(focusRowWiringViolations(stripped)).toEqual([])
  })

  it('SELF-TEST (anti-vacuity, REQUIRED): the matchers REJECT the pre-fix shape', () => {
    const preFix = [
      "const globalSettings = configStore.get_nodefault('settings')",
      'class GlobalState {',
      '  state: StateProps = {',
      '    focusRow: globalSettings?.focusRow ?? null,',
      '  }',
      '  handleFocusRow = (value) => {',
      '    this.setState({ focusRow: value })',
      '  }',
      '  async componentDidMount() {',
      '    window.api.handleInstallGame(() => {})',
      '  }',
      '}'
    ].join('\n')

    const violations = focusRowWiringViolations(preFix)

    expect(violations).toEqual(
      expect.arrayContaining([
        'module-scope seedFocusRowFromMirror(globalSettings)',
        'state initialiser reads focusRowMirrorSeed.focusRow',
        'state initialiser must not read the mirror directly',
        'componentDidMount needsMigratedValue guard',
        'componentDidMount hydrateFocusRowSelection( call',
        'handleFocusRow sets focusRowPickedThisSession'
      ])
    )
  })

  it('SELF-TEST (positive control): the matchers ACCEPT a minimal correctly wired shape', () => {
    const wired = [
      "const globalSettings = configStore.get_nodefault('settings')",
      'const focusRowMirrorSeed = seedFocusRowFromMirror(globalSettings)',
      'class GlobalState {',
      '  state: StateProps = {',
      '    focusRow: focusRowMirrorSeed.focusRow,',
      '  }',
      '  handleFocusRow = (value) => {',
      '    this.focusRowPickedThisSession = true',
      '  }',
      '  async componentDidMount() {',
      '    if (focusRowMirrorSeed.needsMigratedValue) {',
      '      void hydrateFocusRowSelection({',
      '        requestAppSettings: () => window.api.requestAppSettings(),',
      '        setSetting: (p) => window.api.setSetting(p),',
      '        hasUserPicked: () => this.focusRowPickedThisSession',
      '      })',
      '    }',
      '  }',
      '}'
    ].join('\n')

    expect(focusRowWiringViolations(wired)).toEqual([])
  })
})
