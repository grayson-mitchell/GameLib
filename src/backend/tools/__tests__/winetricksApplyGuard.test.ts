/**
 * Phase 45 Plan 01 (T-45-01/T-45-02): one case per rejected-input bullet in
 * Task 2's `<behavior>` block, plus the dedupe-keeps-first-order case.
 */
import {
  WINETRICKS_APPLY_MAX_VERBS,
  WinetricksApplyRejected,
  assertWinetricksApplyPayload
} from '../winetricksApplyGuard'
import type { WinetricksComponent } from 'common/types'

const CATALOG: WinetricksComponent[] = [
  { verb: 'xact', title: 'XACT', category: 'dlls', cached: false },
  { verb: 'corefonts', title: 'Core fonts', category: 'fonts', cached: false },
  { verb: 'vcrun2019', title: 'VC++ 2019', category: 'dlls', cached: false }
]

describe('assertWinetricksApplyPayload (T-45-01/T-45-02)', () => {
  it('rejects undefined', () => {
    expect(() => assertWinetricksApplyPayload(undefined, CATALOG)).toThrow(
      WinetricksApplyRejected
    )
  })

  it('rejects a bare string (not an array)', () => {
    expect(() => assertWinetricksApplyPayload('vcrun2019', CATALOG)).toThrow(
      WinetricksApplyRejected
    )
  })

  it('rejects an empty array', () => {
    expect(() => assertWinetricksApplyPayload([], CATALOG)).toThrow(
      WinetricksApplyRejected
    )
  })

  it('rejects an array containing a non-string element', () => {
    expect(() => assertWinetricksApplyPayload([42], CATALOG)).toThrow(
      WinetricksApplyRejected
    )
  })

  it('rejects a verb that fails VERB_SHAPE_RE', () => {
    expect(() =>
      assertWinetricksApplyPayload(['--self-update'], CATALOG)
    ).toThrow(WinetricksApplyRejected)
  })

  it('rejects a shape-valid verb absent from the catalog', () => {
    expect(() => assertWinetricksApplyPayload(['notaverb'], CATALOG)).toThrow(
      WinetricksApplyRejected
    )
  })

  it(`rejects an array of more than ${WINETRICKS_APPLY_MAX_VERBS} entries`, () => {
    const tooMany = Array.from(
      { length: WINETRICKS_APPLY_MAX_VERBS + 1 },
      () => 'xact'
    )
    expect(() => assertWinetricksApplyPayload(tooMany, CATALOG)).toThrow(
      WinetricksApplyRejected
    )
  })

  it('dedupes keeping first-occurrence order', () => {
    expect(
      assertWinetricksApplyPayload(['xact', 'xact', 'corefonts'], CATALOG)
    ).toEqual(['xact', 'corefonts'])
  })

  it('returns a valid single-verb list unchanged', () => {
    expect(assertWinetricksApplyPayload(['vcrun2019'], CATALOG)).toEqual([
      'vcrun2019'
    ])
  })
})
