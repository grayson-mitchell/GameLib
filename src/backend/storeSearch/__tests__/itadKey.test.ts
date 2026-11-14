import { resolveBuiltInItadKey } from '../itadKey'

describe('resolveBuiltInItadKey', () => {
  test('env override', () => {
    expect(resolveBuiltInItadKey({ GAMELIB_ITAD_API_KEY: 'envkey' })).toEqual({
      key: 'envkey',
      source: 'env'
    })
  })
  test('nothing set -> null', () => {
    expect(resolveBuiltInItadKey({})).toBeNull()
  })
  test('whitespace env -> null', () => {
    expect(resolveBuiltInItadKey({ GAMELIB_ITAD_API_KEY: '   ' })).toBeNull()
  })
})
