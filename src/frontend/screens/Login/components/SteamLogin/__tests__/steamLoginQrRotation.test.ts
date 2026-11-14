/**
 * CF-08: a rotated QR challenge reaches the login window. This jest project has no DOM, so the
 * redraw decision is the pure `nextQrChallengeUrl` plus a source gate on the poll call site.
 */
import '../../../../../testUtils/tauriWindow'
import { readFileSync } from 'fs'
import { join } from 'path'

jest.mock('../index.scss', () => ({}))
jest.mock('frontend/components/UI/Dialog/index.css', () => ({}))

import { nextQrChallengeUrl } from '../index'

describe('QR challenge rotation', () => {
  it('a poll carrying a new challengeUrl replaces the drawn one', () => {
    expect(nextQrChallengeUrl('A', { challengeUrl: 'B' })).toBe('B')
  })

  it('a poll without challengeUrl leaves the QR unchanged', () => {
    expect(nextQrChallengeUrl('A', {})).toBe('A')
  })

  it('the same challengeUrl is a no-op', () => {
    expect(nextQrChallengeUrl('A', { challengeUrl: 'A' })).toBe('A')
  })

  it('the QR poll loop feeds poll results through it', () => {
    const src = readFileSync(join(__dirname, '..', 'index.tsx'), 'utf8')
    expect(src).toMatch(/nextQrChallengeUrl\(current, poll\)/)
  })
})
