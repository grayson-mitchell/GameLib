import { localeFileSegments } from '../languages'

describe('localeFileSegments', () => {
  it('maps a supported BCP-47 tag to its shipped directory', () => {
    expect(localeFileSegments('pt-BR', 'gamelib')).toEqual([
      'pt_BR',
      'gamelib.json'
    ])
    expect(localeFileSegments('de', 'translation')).toEqual([
      'de',
      'translation.json'
    ])
  })

  it('falls back to en for an unsupported or traversal-shaped language', () => {
    expect(localeFileSegments('../../etc', 'translation')[0]).toBe('en')
    expect(localeFileSegments('xx', 'translation')[0]).toBe('en')
    expect(localeFileSegments('cimode', 'translation')[0]).toBe('en')
  })

  it('falls back to translation for a namespace that is not a bare identifier', () => {
    expect(localeFileSegments('en', '../../secret')[1]).toBe('translation.json')
    expect(localeFileSegments('en', 'a/b')[1]).toBe('translation.json')
  })
})
