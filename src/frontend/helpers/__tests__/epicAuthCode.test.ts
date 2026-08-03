import { parseEpicAuthCode } from '../epicAuthCode'

describe('parseEpicAuthCode', () => {
  it.each<[string, string | null, string]>([
    [
      'abc1234567890abc1234567890abcd12',
      'abc1234567890abc1234567890abcd12',
      'bare plausible-length code'
    ],
    [
      '  \n abc1234567890abc1234567890abcd12 \n ',
      'abc1234567890abc1234567890abcd12',
      'bare code with surrounding whitespace/newlines'
    ],
    [
      '{"redirectUrl":"x","authorizationCode":"abc1234567890abc1234567890abcd12","sid":null}',
      'abc1234567890abc1234567890abcd12',
      'full JSON blob'
    ],
    [
      '  \n {"redirectUrl":"x","authorizationCode":"abc1234567890abc1234567890abcd12","sid":null}  \n ',
      'abc1234567890abc1234567890abcd12',
      'JSON blob with surrounding whitespace'
    ],
    [
      '{"redirectUrl":"x","sid":null}',
      null,
      'JSON with missing authorizationCode'
    ],
    [
      '{"redirectUrl":"x","authorizationCode":"","sid":null}',
      null,
      'JSON with empty authorizationCode'
    ],
    [
      '{"redirectUrl":"x","authorizationCode":null,"sid":null}',
      null,
      'JSON with null authorizationCode'
    ],
    ['{not valid json at all', null, 'malformed JSON starting with "{" (does not throw)'],
    ['', null, 'empty string'],
    ['   ', null, 'whitespace-only string'],
    ['hello', null, 'short implausible string (below plausible code length)']
  ])('parseEpicAuthCode(%j) === %p (%s)', (input, expected) => {
    expect(parseEpicAuthCode(input)).toBe(expected)
  })

  it('does not throw on malformed JSON', () => {
    expect(() => parseEpicAuthCode('{"broken":')).not.toThrow()
  })
})
