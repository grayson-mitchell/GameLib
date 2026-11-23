/**
 * Drift test for `src/common/enginePins.json` (Phase 87, 87-02, D-04).
 *
 * The Rust `gamelib-engine` crate reads this one file (`pins.rs`, `include_str!`) for the pinned
 * fallback engine table: which Wine and DXVK archive the downloader trusts, fixed by size and sha256.
 * The TS table `ENGINE_PINS` in `backend/engine/enginePins.ts` stays where it is until its callers
 * move, so this test proves the JSON equals it field for field (current and previous). A bumped pin,
 * a changed hash or a renamed field on either side fails here before the two sides disagree.
 */
import { ENGINE_PINS } from 'backend/enginewine/twin'
import enginePins from '../enginePins.json'

describe('enginePins.json', () => {
  it('equals ENGINE_PINS field for field, current and previous', () => {
    expect(enginePins.current).toEqual(ENGINE_PINS.current)
    expect(enginePins.previous).toEqual(ENGINE_PINS.previous)
    expect(enginePins).toEqual(ENGINE_PINS)
  })

  it('anti-vacuity: a copy with one changed sha256 is not equal', () => {
    const tampered = structuredClone(enginePins)
    tampered.current.wine.sha256 = tampered.current.wine.sha256.replace(
      /^./,
      (c) => (c === '0' ? '1' : '0')
    )
    expect(tampered).not.toEqual(ENGINE_PINS)
    expect(tampered.current.wine.sha256).not.toBe(
      ENGINE_PINS.current.wine.sha256
    )
  })

  it('anti-vacuity: the table carries the pinned build', () => {
    expect(enginePins.current.id).toBe('wine-staging-11.20')
    expect(enginePins.current.wine.sha256).toMatch(/^[0-9a-f]{64}$/)
    expect(enginePins.current.dxvk.sha256).toMatch(/^[0-9a-f]{64}$/)
  })
})
