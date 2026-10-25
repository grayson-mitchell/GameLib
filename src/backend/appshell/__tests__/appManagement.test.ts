import { classifyProbeError, getAppManagementStatus } from '../appManagement'

jest.mock('../../logger', () => ({
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Backend: 'Backend' }
}))
jest.mock('../../storeManagers/steam/crossoverLocation', () => ({
  resolveCrossoverBinDirAsync: jest.fn()
}))

import { logWarning } from '../../logger'

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
})
