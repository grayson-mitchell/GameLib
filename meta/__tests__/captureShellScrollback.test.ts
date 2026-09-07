/**
 * Quick task 260907-fni. Drives `analyzeCapture()` over inline string fixtures only -- never
 * over a live run, never by grepping the harness's own source. Each test below is RED-proved
 * by mutating `meta/captureShellScrollback.ts`'s implementation and observing that specific
 * test (and only the mutation's own test, checked individually) fail; the exact mutation used
 * for each test is recorded in this task's SUMMARY.md, not inline here, per the plan.
 */
import {
  analyzeCapture,
  CAPTURE_ANCHORS,
  TARGET_DROP_RE,
  COOKIE_LEG_RE,
  LEGACY_TARGET_DROP_RE,
  LONG_RUNNING_CHANNELS,
  type AnalyzeCaptureInput
} from '../captureShellScrollback'

const BOOT_LINES = CAPTURE_ANCHORS.boot.map((a) =>
  a.endsWith('(') ? `${a}__GAMELIB_SIDECAR_READY__)` : a
)
const GESTURE_LINE = `${CAPTURE_ANCHORS.gesture[0]}Humble Bundle'`
const TEARDOWN_LINE = CAPTURE_ANCHORS.teardown[0]

/** Builds a raw/timestamped pair of equal line count, one ISO prefix per raw line. */
function withTimestamps(rawLines: string[]): { raw: string; ts: string } {
  const base = Date.parse('2026-09-07T00:00:00.000Z')
  const tsLines = rawLines.map(
    (line, i) => `${new Date(base + i * 1000).toISOString()} ${line}`
  )
  return { raw: rawLines.join('\n') + '\n', ts: tsLines.join('\n') + '\n' }
}

function makeInput(
  rawLines: string[],
  opts: { gamelibLogSnapshot?: string; tsOverride?: string } = {}
): AnalyzeCaptureInput {
  const { raw, ts } = withTimestamps(rawLines)
  return {
    rawStderr: raw,
    timestampedStderr: opts.tsOverride ?? ts,
    gamelibLogSnapshot: opts.gamelibLogSnapshot ?? ''
  }
}

const FULL_ANCHOR_LINES = [...BOOT_LINES, GESTURE_LINE, TEARDOWN_LINE]

describe('captureShellScrollback / analyzeCapture', () => {
  // T1 -- THE load-bearing property. A capture with zero anchors and zero target lines must
  // never be readable as a clean watch.
  it('T1: anchors absent and target absent yields INVALID_ANCHORS, never CLEAN_ASSERTED', () => {
    const input = makeInput([
      'some unrelated stderr noise',
      'nothing to see here'
    ])
    const result = analyzeCapture(input)
    expect(result.verdict).toBe('INVALID_ANCHORS')
    expect(result.verdict).not.toBe('CLEAN_ASSERTED')
    expect(result.reasons.length).toBeGreaterThan(0)
    expect(result.targetMatches).toEqual([])
  })

  // T2 -- a dirty grep of the wrong source is no more evidence of presence than a clean one is
  // of absence. A gamelib.log-shaped line containing the target substring, with zero [shell]
  // anchors, must not certify anything.
  it('T2: wrong-source text containing the target substring is rejected without anchors', () => {
    const input = makeInput([
      '2026-09-07T00:00:00.000Z [info] some log line mentions response for unknown/timed-out just as prose, not a shell line'
    ])
    const result = analyzeCapture(input)
    expect(result.verdict).toBe('INVALID_ANCHORS')
    expect(result.targetMatches).toEqual([])
  })

  // T3 -- boot present, gesture absent: the operator never opened the login window.
  it('T3: boot anchors present but gesture anchor absent yields INVALID_ANCHORS', () => {
    const input = makeInput([...BOOT_LINES, TEARDOWN_LINE])
    const result = analyzeCapture(input)
    expect(result.verdict).toBe('INVALID_ANCHORS')
    expect(
      result.reasons.some((r) => r.toLowerCase().includes('gesture'))
    ).toBe(true)
  })

  // T4 -- full anchor set, zero target lines: a valid clean-watch record, carrying duration,
  // gesture timestamp, teardown timestamp, and a derived poll count with its recipe.
  it('T4: full anchor set with zero target lines yields CLEAN_ASSERTED with derived fields', () => {
    const input = makeInput(FULL_ANCHOR_LINES)
    const result = analyzeCapture(input)
    expect(result.verdict).toBe('CLEAN_ASSERTED')
    expect(result.reasons).toEqual([])
    expect(result.windowStartedAt).not.toBeNull()
    expect(result.gestureAt).not.toBeNull()
    expect(result.windowEndedAt).not.toBeNull()
    expect(result.durationMs).not.toBeNull()
    expect(typeof result.derivedPollCount).toBe('number')
    expect(result.derivationRecipe).toMatch(/derivedPollCount/)
    expect(result.derivationRecipe.toLowerCase()).toContain('derived')
  })

  // T5 -- full anchor set + a target line: RECURRENCE, carrying the verbatim line, id, and
  // channel -- including the '<unrecorded>' literal case, never coerced.
  it('T5: full anchor set with a target line yields RECURRENCE with verbatim match fields', () => {
    const dropLine =
      '[shell] response for unknown/timed-out id=42 channel=<unrecorded> (dropped)'
    const input = makeInput([...FULL_ANCHOR_LINES, dropLine])
    const result = analyzeCapture(input)
    expect(result.verdict).toBe('RECURRENCE')
    expect(result.targetMatches).toHaveLength(1)
    expect(result.targetMatches[0].line).toBe(dropLine)
    expect(result.targetMatches[0].id).toBe('42')
    expect(result.targetMatches[0].channel).toBe('<unrecorded>')
    expect(result.targetMatches[0].channel).not.toBeNull()
  })

  // T6 -- the old bare-id form (no channel=) must NOT match TARGET_DROP_RE, and must be
  // reported through legacyFormatLines instead, so a stale binary is detected.
  it('T6: legacy bare-id form does not match TARGET_DROP_RE and is reported separately', () => {
    const legacyLine =
      '[shell] response for unknown/timed-out id=1575 (dropped)'
    expect(TARGET_DROP_RE.test(legacyLine)).toBe(false)
    expect(LEGACY_TARGET_DROP_RE.test(legacyLine)).toBe(true)

    const input = makeInput([...FULL_ANCHOR_LINES, legacyLine])
    const result = analyzeCapture(input)
    expect(result.verdict).toBe('CLEAN_ASSERTED')
    expect(result.targetMatches).toEqual([])
    expect(result.legacyFormatLines).toEqual([legacyLine])
  })

  // T7 -- raw/timestamped line-count parity is enforced.
  it('T7: unequal raw/timestamped line counts yields INVALID_ANCHORS with a parity reason', () => {
    const input = makeInput(FULL_ANCHOR_LINES, {
      tsOverride: withTimestamps(FULL_ANCHOR_LINES).ts + 'one extra line\n'
    })
    const result = analyzeCapture(input)
    expect(result.verdict).toBe('INVALID_ANCHORS')
    expect(result.reasons.some((r) => r.includes('parity'))).toBe(true)
  })

  // T8 -- cookie-leg detection reads gamelibLogSnapshot only; the same string placed in stderr
  // instead must not populate cookieLegMatches.
  it('T8: cookie-leg pattern is read from gamelib.log snapshot only, not from stderr', () => {
    const cookieLine =
      '2026-09-07T00:01:00.000Z [warn] rustInvoke timed out after 60000ms: humble_login_cookies'
    expect(COOKIE_LEG_RE.test(cookieLine)).toBe(true)

    const inSnapshot = analyzeCapture(
      makeInput(FULL_ANCHOR_LINES, { gamelibLogSnapshot: cookieLine })
    )
    expect(inSnapshot.cookieLegMatches).toHaveLength(1)
    expect(inSnapshot.cookieLegMatches[0].channel).toBe('humble_login_cookies')
    expect(inSnapshot.cookieLegMatches[0].ms).toBe('60000')

    const inStderrInstead = analyzeCapture(
      makeInput([...FULL_ANCHOR_LINES, cookieLine])
    )
    expect(inStderrInstead.cookieLegMatches).toEqual([])

    // The sibling channels must also match, and the longer name must not be truncated to the
    // shorter prefix.
    const forDomainLine =
      'rustInvoke timed out after 5000ms: humble_login_cookies_for_domain'
    const forDomainMatch = COOKIE_LEG_RE.exec(forDomainLine)
    expect(forDomainMatch?.groups?.channel).toBe(
      'humble_login_cookies_for_domain'
    )
    const clearLine =
      'rustInvoke timed out after 1ms: humble_login_clear_cookies'
    expect(COOKIE_LEG_RE.test(clearLine)).toBe(true)
  })

  // T9 -- nesting is never asserted from adjacency alone.
  describe('T9: nesting is not asserted from adjacency', () => {
    it('pins UNPROVEN_ADJACENCY for a non-exempt channel co-occurring with a cookie-leg timeout', () => {
      const nonExemptChannel = 'someNonExemptChannel'
      expect(LONG_RUNNING_CHANNELS).not.toContain(nonExemptChannel)
      const dropLine = `[shell] response for unknown/timed-out id=7 channel=${nonExemptChannel} (dropped)`
      const cookieLine =
        'rustInvoke timed out after 60000ms: humble_login_cookies'
      const result = analyzeCapture(
        makeInput([...FULL_ANCHOR_LINES, dropLine], {
          gamelibLogSnapshot: cookieLine
        })
      )
      expect(result.verdict).toBe('RECURRENCE')
      expect(result.nesting).toBe('UNPROVEN_ADJACENCY')
      expect(result.nesting).not.toBe('CAUSAL')
    })

    it('pins EXEMPT_CHANNEL_CANNOT_TIMEOUT for humbleStartLogin co-occurring with a cookie-leg timeout', () => {
      expect(LONG_RUNNING_CHANNELS).toContain('humbleStartLogin')
      const dropLine =
        '[shell] response for unknown/timed-out id=8 channel=humbleStartLogin (dropped)'
      const cookieLine =
        'rustInvoke timed out after 60000ms: humble_login_cookies'
      const result = analyzeCapture(
        makeInput([...FULL_ANCHOR_LINES, dropLine], {
          gamelibLogSnapshot: cookieLine
        })
      )
      expect(result.verdict).toBe('RECURRENCE')
      expect(result.nesting).toBe('EXEMPT_CHANNEL_CANNOT_TIMEOUT')
      expect(result.nesting).not.toBe('CAUSAL')
    })

    it('is null when there is no cookie-leg co-occurrence at all', () => {
      const dropLine =
        '[shell] response for unknown/timed-out id=9 channel=someChannel (dropped)'
      const result = analyzeCapture(makeInput([...FULL_ANCHOR_LINES, dropLine]))
      expect(result.verdict).toBe('RECURRENCE')
      expect(result.nesting).toBeNull()
    })
  })
})
