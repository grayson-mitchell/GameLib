import {
  GAMELIB_FIX_RELAY_URL,
  RELAY_URL_PENDING_SENTINEL
} from '../knownFixReport'

describe('url deployed', () => {
  it('does not ship the operator-pending sentinel', () => {
    expect(GAMELIB_FIX_RELAY_URL).not.toContain(RELAY_URL_PENDING_SENTINEL)
  })

  it('points at the deployed workers.dev relay endpoint', () => {
    expect(GAMELIB_FIX_RELAY_URL).toMatch(
      /^https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev\/v1\/reports$/
    )
  })
})
