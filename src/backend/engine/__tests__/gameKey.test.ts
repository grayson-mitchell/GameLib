import { appNameOf, engineKeyFor, isEngineKey } from '../gameKey'

describe('engineKeyFor', () => {
  test('Steam keeps its bare numeric appId', () => {
    expect(engineKeyFor('steam', '440')).toBe('440')
    expect(engineKeyFor('steam', 'abc')).toBeNull()
  })

  test('other stores are prefixed so numeric ids cannot collide with Steam', () => {
    expect(engineKeyFor('gog', '1207658924')).toBe('gog:1207658924')
    expect(engineKeyFor('nile', 'amzn1.adg.product.0b1c')).toBe(
      'nile:amzn1.adg.product.0b1c'
    )
  })

  test.each(['../x', 'a/b', 'a\\b', '', 'a\u0000b', 'x'.repeat(300), ' x'])(
    'rejects unsafe appName %j',
    (name) => {
      expect(engineKeyFor('gog', name)).toBeNull()
    }
  )

  test('rejects an unknown runner and non-string appName', () => {
    expect(engineKeyFor('notarunner', 'x')).toBeNull()
    expect(engineKeyFor('gog', 42)).toBeNull()
  })
})

describe('isEngineKey', () => {
  test.each(['440', 'legendary:Fortnite', 'sideload:My Game'])(
    'accepts %j',
    (k) => expect(isEngineKey(k)).toBe(true)
  )
  test.each(['legendary:', ':x', 'bogus:x', 'gog:../x', 42, null, ''])(
    'rejects %j',
    (k) => expect(isEngineKey(k)).toBe(false)
  )
})

describe('appNameOf', () => {
  test('a bare Steam appId is its own name; a prefixed key yields the part after the first colon', () => {
    expect(appNameOf('570')).toBe('570')
    expect(appNameOf('gog:1207658930')).toBe('1207658930')
    expect(appNameOf('legendary:a:b')).toBe('a:b')
  })
})
