import {
  settleEnvMap,
  settleKnownFixEnv,
  settleVerifyPrefixReply,
  settleWordList
} from '../launchBuilderReply'

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

describe('settleWordList', () => {
  it('answers a copy of a list of strings', () => {
    const reply = ['gamescope', '--', 'a']
    const got = settleWordList(reply, 'setupWrappers')
    expect(got).toEqual(reply)
    expect(got).not.toBe(reply)
    expect(settleWordList([], 'setupWrappers')).toEqual([])
  })

  it('refuses anything that is not a list of strings', () => {
    for (const reply of [null, 'a', { 0: 'a' }, [1], ['a', null]]) {
      expect(() => settleWordList(reply, 'setupWrappers')).toThrow(
        'setupWrappers: the reply was not a list of words'
      )
    }
  })
})

describe('settleKnownFixEnv', () => {
  it('answers no fix as an empty map and any other reply as it came', () => {
    expect(settleKnownFixEnv(null)).toEqual({})
    expect(settleKnownFixEnv(undefined)).toEqual({})
    const reply = { MY_VAR: '1' }
    expect(settleKnownFixEnv(reply)).toBe(reply)
    expect(settleKnownFixEnv({})).toEqual({})
  })
})

describe('settleVerifyPrefixReply', () => {
  it('hands on a command result as it came, with or without an exit code', () => {
    for (const reply of [
      { res: { stdout: '', stderr: '' } },
      { res: { stdout: 'a', stderr: 'b', code: 0 } }
    ]) {
      expect(settleVerifyPrefixReply(reply, 'verifyWinePrefix')).toBe(reply)
    }
  })

  it('refuses anything else, naming the builder and never the value', () => {
    for (const reply of [
      null,
      undefined,
      'x',
      {},
      { res: null },
      { res: { stdout: '' } },
      { res: { stdout: 1, stderr: '' } }
    ]) {
      expect(() => settleVerifyPrefixReply(reply, 'verifyWinePrefix')).toThrow(
        'verifyWinePrefix: the reply was not a command result'
      )
    }
  })
})
