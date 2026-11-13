import { RUST_STEAMFILES_READ_ACF } from 'common/types/sidecarTransport'
import * as logger from 'backend/logger'
import { invokeSteamFiles } from '../rustSteamFiles'

const requestRustInvoke = jest.fn()
const rust = { requestRustInvoke }

const result = { exists: true, parsed: true, readError: null, record: null }

let logDebug: jest.SpyInstance

beforeEach(() => {
  jest.restoreAllMocks()
  logDebug = jest.spyOn(logger, 'logDebug').mockImplementation(() => undefined)
  requestRustInvoke.mockResolvedValue(result)
})

describe('invokeSteamFiles', () => {
  it('calls requestRustInvoke once with a single args object', async () => {
    await expect(
      invokeSteamFiles(rust, RUST_STEAMFILES_READ_ACF, { path: '/x.acf' })
    ).resolves.toEqual(result)
    expect(requestRustInvoke).toHaveBeenCalledTimes(1)
    expect(requestRustInvoke).toHaveBeenCalledWith('steamfiles_read_acf', [
      { path: '/x.acf' }
    ])
  })

  it('logs the debug proof line', async () => {
    await invokeSteamFiles(rust, RUST_STEAMFILES_READ_ACF, { path: '/x' })
    expect(logDebug).toHaveBeenCalledWith(
      '[steamfiles] rust steamfiles_read_acf',
      'Steam'
    )
  })

  it('rejects a Buffer argument at compile time (D-08)', () => {
    void invokeSteamFiles(rust, RUST_STEAMFILES_READ_ACF, {
      // @ts-expect-error path must be a string, never bytes
      path: Buffer.from('x')
    })
  })
})
