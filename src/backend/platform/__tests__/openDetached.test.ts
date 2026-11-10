import { shouldOpenInBackground } from '../openDetached'

const URL_OFF = 'steam://open/gooffline'

describe('shouldOpenInBackground', () => {
  it('is true for a steam: URL with activate:false on darwin', () => {
    expect(shouldOpenInBackground('darwin', URL_OFF, { activate: false })).toBe(
      true
    )
    expect(
      shouldOpenInBackground('darwin', 'STEAM://x', { activate: false })
    ).toBe(true)
  })

  it('is false off darwin', () => {
    expect(shouldOpenInBackground('linux', URL_OFF, { activate: false })).toBe(
      false
    )
    expect(shouldOpenInBackground('win32', URL_OFF, { activate: false })).toBe(
      false
    )
  })

  it('is false for non-steam schemes, missing options or activate not false', () => {
    expect(
      shouldOpenInBackground('darwin', 'https://example.com', {
        activate: false
      })
    ).toBe(false)
    expect(
      shouldOpenInBackground('darwin', 'no-colon', { activate: false })
    ).toBe(false)
    expect(shouldOpenInBackground('darwin', URL_OFF, undefined)).toBe(false)
    expect(shouldOpenInBackground('darwin', URL_OFF, null)).toBe(false)
    expect(shouldOpenInBackground('darwin', URL_OFF, {})).toBe(false)
    expect(shouldOpenInBackground('darwin', URL_OFF, { activate: true })).toBe(
      false
    )
  })
})
