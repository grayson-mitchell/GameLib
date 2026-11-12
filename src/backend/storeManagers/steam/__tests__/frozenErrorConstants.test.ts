/**
 * The Steam credential-refusal and depot error classification tables are frozen constants
 * (D-66.3-09, 66.4-07). Membership is pinned here; no module mocks.
 */
import {
  CREDENTIAL_REFUSAL_ERESULTS,
  CREDENTIAL_REFUSAL_NAMES
} from '../userTypes'
import { isNonRetryableDepotError } from '../depotErrors'
import {
  DECODE_STAGE_ERROR_CODES,
  isDecodeStageError
} from '../depotDecodeErrors'

describe('frozen error constants', () => {
  it('credential refusal tables keep their membership and are frozen', () => {
    expect([...CREDENTIAL_REFUSAL_ERESULTS]).toEqual([5, 15, 26, 27, 63])
    expect([...CREDENTIAL_REFUSAL_NAMES]).toEqual([
      'InvalidPassword',
      'AccessDenied',
      'Revoked',
      'Expired',
      'AccountLogonDenied'
    ])
    expect(Object.isFrozen(CREDENTIAL_REFUSAL_ERESULTS)).toBe(true)
    expect(Object.isFrozen(CREDENTIAL_REFUSAL_NAMES)).toBe(true)
  })

  it.each([8, 9, 15, 17, 40, 42, 43])(
    'EResult %i is non-retryable',
    (eresult) => {
      expect(isNonRetryableDepotError({ eresult })).toBe(true)
    }
  )

  it.each([1, 2, 5, 16, 41, 44])('EResult %i stays retryable', (eresult) => {
    expect(isNonRetryableDepotError({ eresult })).toBe(false)
  })

  it.each([
    'bad_footer_magic',
    'unknown_container',
    'sha1_mismatch',
    'size_mismatch',
    'decode_failed'
  ])('decode code %s is decode-stage', (code) => {
    expect(DECODE_STAGE_ERROR_CODES).toContain(code)
    expect(isDecodeStageError({ code })).toBe(true)
  })

  it('a network code is not decode-stage and the table is frozen', () => {
    expect(isDecodeStageError({ code: 'ECONNRESET' })).toBe(false)
    expect(Object.isFrozen(DECODE_STAGE_ERROR_CODES)).toBe(true)
  })
})
