/**
 * Source-text structural gate for Phase 49 Plan 07 (D-08, D-10, D-16): the
 * renderer half of the sign-in state.
 *
 * `GlobalState.tsx` cannot be imported under this project's node-environment
 * jest (it reads `window.localStorage` at module scope), so this gate pins the
 * WIRING by text, with the same idiom as `GlobalStateFocusRowHydration.test.ts`:
 * readFileSync + stripSourceComments + a balanced-bracket extractor. The
 * behaviour behind each handler is covered where it is pure
 * (`common/__tests__/signInDismissal.test.ts`, `signInState.test.ts`) and where
 * it persists (`dismissedSignInNoticesSetting.test.ts`).
 *
 * What it proves:
 *   - D-16 / R3: `componentDidMount` calls `window.api.humbleSync()` and never
 *     `humbleCheckHealth` -- the health check lives in the sidecar boot pass,
 *     and a renderer call would be a second expiry latch;
 *   - D-08: the outcome push AND the mount-time pull each reach state through
 *     `sanitizeSignInProbeOutcomeMap(` (T-49-20);
 *   - D-10: `handleDismissSignInNotice` routes through `addSignInDismissal(` and
 *     writes `key: 'dismissedSignInNotices'`; `handleRearmSignInDismissals`
 *     routes through `rearmSignInDismissals(`;
 *   - P3: the only probe-named `window.api` members are the push listener and
 *     the read-only pull -- nothing in the renderer starts a probe;
 *   - SELF-TESTS (anti-vacuity): a RED specimen that re-adds
 *     `humbleCheckHealth()` must fail the D-16 gate, and a pre-wiring shape
 *     must fail every rule.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'

const globalStatePath = join(__dirname, '..', 'GlobalState.tsx')

const ALLOWED_PROBE_MEMBERS = [
  'handleSignInProbeOutcomes',
  'getSignInProbeOutcomes'
]

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
function signInMountViolations(strippedSource: string): string[] {
  const violations: string[] = []

  let didMount = ''
  try {
    didMount = extractBalanced(strippedSource, 'componentDidMount()', '{', '}')
  } catch {
    violations.push('componentDidMount block present')
  }

  if (didMount) {
    if (!/window\.api\.humbleSync\(\)/.test(didMount)) {
      violations.push('componentDidMount calls window.api.humbleSync()')
    }
    if (/humbleCheckHealth/.test(didMount)) {
      violations.push(
        'D-16: componentDidMount must not call humbleCheckHealth (second expiry latch)'
      )
    }

    try {
      const push = extractBalanced(
        didMount,
        'handleSignInProbeOutcomes(',
        '(',
        ')'
      )
      if (!/sanitizeSignInProbeOutcomeMap\(/.test(push)) {
        violations.push('outcome push is sanitised')
      }
    } catch {
      violations.push('handleSignInProbeOutcomes( subscription present')
    }

    try {
      const pullIdx = didMount.indexOf('getSignInProbeOutcomes()')
      if (pullIdx === -1) {
        throw new Error('no pull')
      }
      const pullThen = extractBalanced(
        didMount.slice(pullIdx),
        '.then(',
        '(',
        ')'
      )
      if (!/sanitizeSignInProbeOutcomeMap\(/.test(pullThen)) {
        violations.push('outcome pull is sanitised')
      }
    } catch {
      violations.push('getSignInProbeOutcomes() pull present')
    }
  }

  try {
    const dismiss = extractBalanced(
      strippedSource,
      'handleDismissSignInNotice = (',
      '{',
      '}'
    )
    if (!/addSignInDismissal\(/.test(dismiss)) {
      violations.push('handleDismissSignInNotice uses addSignInDismissal(')
    }
    if (!/key:\s*'dismissedSignInNotices'/.test(dismiss)) {
      violations.push('handleDismissSignInNotice persists the dismissed key')
    }
  } catch {
    violations.push('handleDismissSignInNotice block present')
  }

  try {
    const rearm = extractBalanced(
      strippedSource,
      'handleRearmSignInDismissals = (',
      '{',
      '}'
    )
    if (!/rearmSignInDismissals\(/.test(rearm)) {
      violations.push('handleRearmSignInDismissals uses rearmSignInDismissals(')
    }
  } catch {
    violations.push('handleRearmSignInDismissals block present')
  }

  for (const match of strippedSource.matchAll(
    /window\.api\s*\.\s*(\w*Probe\w*)/g
  )) {
    if (!ALLOWED_PROBE_MEMBERS.includes(match[1])) {
      violations.push(`P3: unexpected probe-named window.api.${match[1]}`)
    }
  }

  return violations
}

describe('GlobalState.tsx sign-in renderer state wiring (49-07: D-08, D-10, D-16)', () => {
  const stripped = stripSourceComments(readFileSync(globalStatePath, 'utf-8'))

  it('the real source is wired: push + pull sanitised, dismiss/re-arm routed, no Humble health call on mount', () => {
    expect(signInMountViolations(stripped)).toEqual([])
  })

  it('persists the dismissed set from exactly two writers (dismiss and re-arm)', () => {
    const writers = stripped.match(/key:\s*'dismissedSignInNotices'/g) ?? []
    expect(writers).toHaveLength(2)
  })

  it('hydrates the dismissed set from requestAppSettings on mount, as a read, not a third writer (F-49-R1-3)', () => {
    // Phase 49 live gate Run 1, item 10d FAIL: the construction-time seed came
    // from the module-load mirror read and was `[]` on a cold boot, so a
    // dismissed not-connected row returned on every relaunch while both config
    // files still held the store. The mount must hydrate from the backend's
    // settings and MERGE (normalise over current + persisted), never setSetting.
    const didMount = extractBalanced(stripped, 'componentDidMount()', '{', '}')
    expect(didMount).toMatch(
      /requestAppSettings\(\)[\s\S]*?normalizeSignInDismissals\(\s*settings\?\.dismissedSignInNotices\s*\)/
    )
    expect(didMount).toMatch(
      /normalizeSignInDismissals\(\[\.\.\.current, \.\.\.persisted\]\)/
    )
    expect(didMount).toMatch(/setState\(\{ dismissedSignInNotices: merged \}\)/)
    // The hydration block itself never writes the setting back. The focusRow
    // CR-01 hydration earlier in the mount legitimately calls setSetting, so
    // slice from the LAST requestAppSettings() (ours) to the re-arm call.
    const rearmAt = didMount.indexOf('this.rearmFromCurrentState()')
    const block = didMount.slice(
      didMount.lastIndexOf('requestAppSettings()', rearmAt),
      rearmAt
    )
    expect(block).toMatch(/dismissedSignInNotices/)
    expect(block).not.toMatch(/setSetting\(/)
  })

  it('asks the backend for Epic user info on every mount, not only when the mirror already holds it (F-49-R1-1)', () => {
    // Phase 49 live gate Run 1: once legendary deleted user.json and the
    // backend purged userInfo, a `legendaryUser` gate meant nothing ever
    // rebuilt it. getUserInfo() is self-healing, so the mount must call it
    // unconditionally and seed the username from the answer.
    const didMount = extractBalanced(stripped, 'componentDidMount()', '{', '}')
    expect(didMount).not.toMatch(/if \(legendaryUser\)/)
    expect(didMount).toMatch(
      /const epicUserInfo = await window\.api\.getUserInfo\(\)/
    )
    expect(didMount).toMatch(/username: epicUserInfo\.displayName/)
  })

  it('never references humbleCheckHealth anywhere in GlobalState.tsx', () => {
    expect(stripped).not.toMatch(/humbleCheckHealth/)
  })

  it('RED specimen (D-16, REQUIRED): re-adding humbleCheckHealth() to the mount fails the gate', () => {
    // The mount call is the LAST humbleSync() in the file (the first belongs
    // to the login handler), so splice at the last occurrence.
    const call = 'window.api.humbleSync()'
    const at = stripped.lastIndexOf(call)
    const specimen =
      stripped.slice(0, at) +
      'window.api.humbleCheckHealth().then(() => window.api.humbleSync())' +
      stripped.slice(at + call.length)
    expect(specimen).not.toBe(stripped)

    const violations = signInMountViolations(specimen)

    expect(violations).toEqual([
      'D-16: componentDidMount must not call humbleCheckHealth (second expiry latch)'
    ])
  })

  it('RED specimen (P3): a renderer-started probe fails the gate', () => {
    const specimen = `${stripped}\nwindow.api.startSignInProbe()`

    expect(signInMountViolations(specimen)).toEqual([
      'P3: unexpected probe-named window.api.startSignInProbe'
    ])
  })

  it('RED specimen (D-08): an unsanitised outcome push fails the gate', () => {
    const specimen = stripped.replace(
      /signInProbeOutcomes: sanitizeSignInProbeOutcomeMap\(outcomes\)/,
      'signInProbeOutcomes: outcomes'
    )
    expect(specimen).not.toBe(stripped)

    expect(signInMountViolations(specimen)).toContain(
      'outcome push is sanitised'
    )
  })

  it('SELF-TEST (anti-vacuity): the matchers REJECT a pre-wiring shape', () => {
    const preWiring = [
      'class GlobalState {',
      '  async componentDidMount() {',
      '    void window.api.humbleCheckHealth().then(() => window.api.humbleSync())',
      '  }',
      '}'
    ].join('\n')

    expect(signInMountViolations(preWiring)).toEqual(
      expect.arrayContaining([
        'D-16: componentDidMount must not call humbleCheckHealth (second expiry latch)',
        'handleSignInProbeOutcomes( subscription present',
        'getSignInProbeOutcomes() pull present',
        'handleDismissSignInNotice block present',
        'handleRearmSignInDismissals block present'
      ])
    )
  })

  it('SELF-TEST (positive control): the matchers ACCEPT a minimal correctly wired shape', () => {
    const wired = [
      'class GlobalState {',
      '  handleDismissSignInNotice = (store) => {',
      '    const next = addSignInDismissal(current, store)',
      "    window.api.setSetting({ key: 'dismissedSignInNotices', value: next })",
      '  }',
      '  handleRearmSignInDismissals = (states) => {',
      '    const next = rearmSignInDismissals(current, states)',
      '  }',
      '  async componentDidMount() {',
      '    window.api.handleSignInProbeOutcomes((e, { outcomes }) => {',
      '      this.setState({ x: sanitizeSignInProbeOutcomeMap(outcomes) })',
      '    })',
      '    window.api',
      '      .getSignInProbeOutcomes()',
      '      .then((o) => this.setState({ x: sanitizeSignInProbeOutcomeMap(o) }))',
      '    void window.api.humbleSync()',
      '  }',
      '}'
    ].join('\n')

    expect(signInMountViolations(wired)).toEqual([])
  })
})
