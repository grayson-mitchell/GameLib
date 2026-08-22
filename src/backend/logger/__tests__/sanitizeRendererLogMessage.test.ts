/**
 * IN-04 (Phase 34.2 gap cycle 2): renderer-controlled log injection.
 *
 * These assert the escaping ITSELF. The proof that the escape is actually
 * reached by a renderer frame -- the property that would break if someone
 * removed the call site while leaving this module intact -- lives in
 * `sidecar/__tests__/loggerFlows.test.ts`.
 */
import { sanitizeRendererLogMessage } from '../sanitizeRendererLogMessage'

describe('sanitizeRendererLogMessage (IN-04)', () => {
  it('escapes a forged log line so it cannot occupy a line of its own', () => {
    const forged =
      'benign\n(12:34:56) [ERROR]:   [Backend]: disk corrupted, contact support'
    const out = sanitizeRendererLogMessage(forged) as string

    expect(out).not.toContain('\n')
    expect(out).toContain('\\n')
    // The text is still legible and still attributable -- escaping must not
    // discard what the caller sent, only deny it a new line.
    expect(out).toContain('disk corrupted, contact support')
  })

  it('escapes carriage returns, which end a line just as readily', () => {
    expect(sanitizeRendererLogMessage('a\rb')).toBe('a\\rb')
    expect(sanitizeRendererLogMessage('a\r\nb')).toBe('a\\r\\nb')
  })

  it('escapes EVERY break, not just the first', () => {
    expect(sanitizeRendererLogMessage('a\nb\nc\nd')).toBe('a\\nb\\nc\\nd')
  })

  it('reaches strings nested in an array, which join with a space and inject too', () => {
    const out = sanitizeRendererLogMessage(['ok', 'x\n[ERROR]: forged'])
    expect(out).toEqual(['ok', 'x\\n[ERROR]: forged'])
  })

  it('leaves break-free text byte-identical', () => {
    // Non-vacuity in the other direction: if this ever fails, the escape is
    // rewriting ordinary log text, which is the regression the review's
    // writeString remedy would have caused wholesale.
    const plain = 'Finished repairing Endless Sky (1829678475)'
    expect(sanitizeRendererLogMessage(plain)).toBe(plain)
  })

  it('preserves shape for values that cannot inject', () => {
    expect(sanitizeRendererLogMessage(42)).toBe(42)
    expect(sanitizeRendererLogMessage(null)).toBeNull()
    expect(sanitizeRendererLogMessage(undefined)).toBeUndefined()
    const obj = { a: 'x\ny' }
    // Objects are routed through JSON.stringify downstream, which escapes
    // breaks inside string values itself -- so this passes through untouched
    // BY DESIGN rather than by omission.
    expect(sanitizeRendererLogMessage(obj)).toBe(obj)
  })
})
