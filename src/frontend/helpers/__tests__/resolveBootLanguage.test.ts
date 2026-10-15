import { resolveBootLanguage } from '../resolveBootLanguage'

describe('resolveBootLanguage', () => {
  it('prefers configStore when it has an answer, and does not log', () => {
    const logFallback = jest.fn()

    const result = resolveBootLanguage('en', 'de', logFallback)

    expect(result).toEqual({ languageCode: 'en', resolvedFrom: 'configStore' })
    expect(logFallback).not.toHaveBeenCalled()
  })

  it(
    'debug/app-starts-in-german: falls back to a stale localStorage value when ' +
      "configStore has no 'language' key, and logs the fallback",
    () => {
      const logFallback = jest.fn()

      const result = resolveBootLanguage(undefined, 'de', logFallback)

      expect(result).toEqual({
        languageCode: 'de',
        resolvedFrom: 'localStorage'
      })
      expect(logFallback).toHaveBeenCalledTimes(1)
      expect(logFallback).toHaveBeenCalledWith(expect.stringContaining('"de"'))
      expect(logFallback).toHaveBeenCalledWith(
        expect.stringContaining('stale localStorage fallback')
      )
    }
  )

  it("falls back to the 'en' default when neither configStore nor localStorage have an answer, and logs the fallback", () => {
    const logFallback = jest.fn()

    const result = resolveBootLanguage(undefined, null, logFallback)

    expect(result).toEqual({ languageCode: 'en', resolvedFrom: 'default' })
    expect(logFallback).toHaveBeenCalledTimes(1)
    expect(logFallback).toHaveBeenCalledWith(
      expect.stringContaining("the 'en' default")
    )
  })

  it('treats an empty-string configStore value as a present answer (not a miss)', () => {
    // Boundary neighbor of the reported defect's equivalence class: configStore.get_nodefault
    // returns `undefined` only when the key is truly absent -- an explicitly empty string is a
    // real (if unusual) stored value and must not be treated the same as "no answer".
    const logFallback = jest.fn()

    const result = resolveBootLanguage('', 'de', logFallback)

    expect(result).toEqual({ languageCode: '', resolvedFrom: 'configStore' })
    expect(logFallback).not.toHaveBeenCalled()
  })

  it('treats an empty-string localStorage value as present ("set but blank"), distinct from null', () => {
    // Boundary neighbor: `Storage.getItem` returns `null` for an absent key and `''` for a key
    // explicitly set to an empty string -- these must not collapse to the same branch.
    const logFallback = jest.fn()

    const result = resolveBootLanguage(undefined, '', logFallback)

    expect(result).toEqual({ languageCode: '', resolvedFrom: 'localStorage' })
    expect(logFallback).toHaveBeenCalledWith(
      expect.stringContaining('stale localStorage fallback')
    )
  })
})
