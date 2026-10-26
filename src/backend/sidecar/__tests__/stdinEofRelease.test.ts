import { PassThrough } from 'node:stream'

jest.mock('../../logger', () => ({
  LogPrefix: { Backend: 'Backend', Steam: 'Steam' },
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  logError: jest.fn()
}))
const callAll = jest.fn()
jest.mock('../../utils/aborthandler/aborthandler', () => ({
  callAllAbortControllers: () => callAll()
}))
const release = jest.fn()
jest.mock('../../storeManagers/steam/user', () => ({
  SteamUser: { releaseForShutdown: () => release() }
}))

import { releaseOnStdinEof } from '../stdinEofRelease'

describe('releaseOnStdinEof (debug/sidecar-survives-force-quit)', () => {
  beforeEach(() => jest.clearAllMocks())

  it('does nothing while stdin is open', () => {
    const input = new PassThrough()
    releaseOnStdinEof(input)
    input.write('x\n')
    expect(callAll).not.toHaveBeenCalled()
    expect(release).not.toHaveBeenCalled()
  })

  it('aborts downloads and releases the CM session exactly once at EOF', () => {
    const input = new PassThrough()
    releaseOnStdinEof(input)
    input.resume()
    input.end()
    return new Promise<void>((resolve) => setImmediate(resolve)).then(() => {
      expect(callAll).toHaveBeenCalledTimes(1)
      expect(release).toHaveBeenCalledTimes(1)
    })
  })

  it('still releases the CM session if aborting throws', () => {
    callAll.mockImplementationOnce(() => {
      throw new Error('boom')
    })
    const input = new PassThrough()
    releaseOnStdinEof(input)
    input.resume()
    input.end()
    return new Promise<void>((resolve) => setImmediate(resolve)).then(() => {
      expect(release).toHaveBeenCalledTimes(1)
    })
  })
})
