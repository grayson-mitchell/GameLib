import { classifyProbeError, getAppManagementStatus } from '../appManagement'

jest.mock('../../logger', () => ({
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Backend: 'Backend' }
}))

import { logWarning } from '../../logger'
import { RUST_ENGINE_CX_RESOLVE_BIN_DIR } from 'common/types/sidecarTransport'

const BIN = '/Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin'
const PROBE = '/Applications/CrossOver.app/Contents/.gamelib-appmgmt-probe'
const err = (code?: string) => Object.assign(new Error('x'), { code })

describe('classifyProbeError', () => {
  it.each([
    [err('EPERM'), 'denied'],
    [err('EACCES'), 'unknown'],
    [err('ENOENT'), 'unknown'],
    [err('EROFS'), 'unknown'],
    ['boom', 'unknown'],
    [null, 'unknown'],
    [new Error('no code'), 'unknown']
  ])('%p -> %s', (e, expected) => {
    expect(classifyProbeError(e)).toBe(expected)
  })
})

describe('getAppManagementStatus', () => {
  const mk = (over = {}) => ({
    requestRustInvoke: jest.fn().mockResolvedValue(null),
    platform: 'darwin' as NodeJS.Platform,
    resolveBinDir: jest.fn().mockResolvedValue(BIN),
    writeFile: jest.fn().mockResolvedValue(undefined),
    unlink: jest.fn().mockResolvedValue(undefined),
    ...over
  })

  it.each(['linux', 'win32'] as const)(
    '%s -> not-needed, no write',
    async (platform) => {
      const d = mk({ platform })
      expect(await getAppManagementStatus(d)).toBe('not-needed')
      expect(d.writeFile).not.toHaveBeenCalled()
    }
  )

  it('darwin without CrossOver -> not-needed, no write', async () => {
    const d = mk({ resolveBinDir: jest.fn().mockResolvedValue(undefined) })
    expect(await getAppManagementStatus(d)).toBe('not-needed')
    expect(d.writeFile).not.toHaveBeenCalled()
  })

  it('write + unlink succeed -> granted at the exact probe path', async () => {
    const d = mk()
    expect(await getAppManagementStatus(d)).toBe('granted')
    expect(d.writeFile).toHaveBeenCalledWith(PROBE, '')
    expect(d.unlink).toHaveBeenCalledWith(PROBE)
  })

  it.each([
    ['EPERM', 'denied'],
    ['EACCES', 'unknown']
  ])('write rejects %s -> %s, no unlink', async (code, expected) => {
    const d = mk({ writeFile: jest.fn().mockRejectedValue(err(code)) })
    expect(await getAppManagementStatus(d)).toBe(expected)
    expect(d.unlink).not.toHaveBeenCalled()
  })

  it('unlink failure after a successful write is still granted, with a warning', async () => {
    const d = mk({ unlink: jest.fn().mockRejectedValue(err('EPERM')) })
    expect(await getAppManagementStatus(d)).toBe('granted')
    expect(logWarning).toHaveBeenCalled()
  })

  // 87-55 (D-04): with no injected lookup, Rust finds CrossOver through engine_cx_resolve_bin_dir.
  describe('the default CrossOver lookup', () => {
    const noLookup = (requestRustInvoke: jest.Mock) =>
      mk({ resolveBinDir: undefined, requestRustInvoke })

    it('asks Rust and probes inside the bundle it names', async () => {
      const requestRustInvoke = jest.fn().mockResolvedValue(BIN)
      const d = noLookup(requestRustInvoke)
      expect(await getAppManagementStatus(d)).toBe('granted')
      expect(requestRustInvoke).toHaveBeenCalledWith(
        RUST_ENGINE_CX_RESOLVE_BIN_DIR,
        [{ hintWineBins: [] }]
      )
      expect(d.writeFile).toHaveBeenCalledWith(PROBE, '')
    })

    it.each([null, '', 5])(
      'a reply of %p is "no CrossOver": not-needed, no write',
      async (reply) => {
        const d = noLookup(jest.fn().mockResolvedValue(reply))
        expect(await getAppManagementStatus(d)).toBe('not-needed')
        expect(d.writeFile).not.toHaveBeenCalled()
      }
    )

    it('a failed call is "no CrossOver", never a rejection', async () => {
      const d = noLookup(
        jest
          .fn()
          .mockRejectedValue(new Error('engine_cx_resolve_bin_dir:not-ready'))
      )
      expect(await getAppManagementStatus(d)).toBe('not-needed')
      expect(d.writeFile).not.toHaveBeenCalled()
    })
  })
})
