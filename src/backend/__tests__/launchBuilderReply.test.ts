import { settleEnvMap } from '../launchBuilderReply'

describe('settleEnvMap', () => {
  it('answers a copy of a string map', () => {
    const reply = { A: '1', B: '' }
    const got = settleEnvMap(reply, 'setupWrapperEnvVars')
    expect(got).toEqual(reply)
    expect(got).not.toBe(reply)
  })

  it('refuses anything that is not a string map, naming the builder and never the value', () => {
    for (const reply of [
      null,
      undefined,
      'x',
      3,
      ['a'],
      { A: 1 },
      { A: null }
    ]) {
      expect(() => settleEnvMap(reply, 'setupWrapperEnvVars')).toThrow(
        'setupWrapperEnvVars: the reply was not a string map'
      )
    }
  })
})
