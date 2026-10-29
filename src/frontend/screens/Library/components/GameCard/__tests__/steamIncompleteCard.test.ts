/**
 * Unit spec for `steamIncompleteCard.ts` (D-UAT-12).
 *
 * Proves the pure predicate only. GameCard is not mountable in the node jest
 * env (it imports ./index.css), so its wiring is checked by grep, not here.
 */
import { isSteamIncompleteCard } from '../steamIncompleteCard'

describe('isSteamIncompleteCard', () => {
  const base = {
    runner: 'steam',
    status: 'notInstalled',
    statusContext: 'steam-incomplete'
  }

  test('true for steam + notInstalled + steam-incomplete', () => {
    expect(isSteamIncompleteCard(base)).toBe(true)
  })

  test('false for plain not-installed steam', () => {
    expect(isSteamIncompleteCard({ ...base, statusContext: undefined })).toBe(
      false
    )
  })

  test.each(['installing', 'queued'])('false while %s', (status) => {
    expect(isSteamIncompleteCard({ ...base, status })).toBe(false)
  })

  test.each(['steam-paused', 'steam-waiting-for-restart'])(
    'false for context %s',
    (statusContext) => {
      expect(isSteamIncompleteCard({ ...base, statusContext })).toBe(false)
    }
  )

  test.each(['gog', 'legendary'])('false for runner %s', (runner) => {
    expect(isSteamIncompleteCard({ ...base, runner })).toBe(false)
  })

  test('false when status undefined', () => {
    expect(isSteamIncompleteCard({ ...base, status: undefined })).toBe(false)
  })
})
