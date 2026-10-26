/**
 * quick 261027-bqe: knownFixSaysMac32 / seedMacArchFromKnownFix /
 * formatMacArch32KnownFixEntry.
 */

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Steam: 'Steam', Backend: 'Backend' }
}))

jest.mock('backend/knownFixes', () => ({ readKnownFixes: jest.fn() }))

const env = { isMac: true, isAppleSiliconMac: true }
jest.mock('backend/constants/environment', () => ({
  get isMac() {
    return env.isMac
  },
  get isAppleSiliconMac() {
    return env.isAppleSiliconMac
  }
}))

jest.mock('../../../ipc', () => ({ sendFrontendMessage: jest.fn() }))

const metaStore = new Map<string, Record<string, unknown>>()
jest.mock('../electronStores', () => ({
  steamMetadataStore: {
    get: jest.fn(),
    set: jest.fn()
  },
  steamLibraryStore: { get: jest.fn(), set: jest.fn() }
}))

import { readKnownFixes } from 'backend/knownFixes'
import { logWarning, logInfo } from 'backend/logger'
import { sendFrontendMessage } from '../../../ipc'
import { library } from '../state'
import {
  formatMacArch32KnownFixEntry,
  knownFixSaysMac32,
  seedMacArchFromKnownFix
} from '../macArchKnownFix'
import { steamMetadataStore } from '../electronStores'

const readFixes = readKnownFixes as jest.Mock
// eslint-disable-next-line @typescript-eslint/unbound-method -- jest mock handle, never invoked unbound
const setMock = steamMetadataStore.set as jest.Mock

const baseEntry = () => ({
  platformsCaptured: true,
  is_mac_native: true,
  mac_arch: 'unknown',
  mac_arch_source: 'minos',
  art_cover: 'x',
  bridge: { userRoute: 'bottle' }
})

beforeEach(() => {
  metaStore.clear()
  library.clear()
  env.isMac = true
  env.isAppleSiliconMac = true
  readFixes.mockReset()
  setMock.mockReset()
  ;(steamMetadataStore.get as jest.Mock).mockImplementation((id: string) =>
    metaStore.get(id)
  )
  setMock.mockImplementation((id: string, v: Record<string, unknown>) => {
    metaStore.set(id, v)
  })
  ;(sendFrontendMessage as jest.Mock).mockClear()
  ;(logWarning as jest.Mock).mockClear()
  ;(logInfo as jest.Mock).mockClear()
})

describe('knownFixSaysMac32', () => {
  test('true on Apple silicon with the hint', () => {
    readFixes.mockReturnValue({ title: 'H', macArch: '32' })
    expect(knownFixSaysMac32('63000', undefined)).toBe(true)
  })

  test('false on Intel and never reads the file', () => {
    env.isAppleSiliconMac = false
    readFixes.mockReturnValue({ title: 'H', macArch: '32' })
    expect(knownFixSaysMac32('63000', undefined)).toBe(false)
    expect(readFixes).not.toHaveBeenCalled()
  })

  test('false when Mach-O verified', () => {
    readFixes.mockReturnValue({ title: 'H', macArch: '32' })
    expect(
      knownFixSaysMac32('63000', { mac_arch_verified: true } as never)
    ).toBe(false)
  })

  test('throwing reader yields false', () => {
    readFixes.mockImplementation(() => {
      throw new Error('boom')
    })
    expect(knownFixSaysMac32('63000', undefined)).toBe(false)
  })
})

describe('seedMacArchFromKnownFix', () => {
  test('seeds, preserves fields, never verifies, propagates once', () => {
    readFixes.mockReturnValue({ title: 'H', macArch: '32' })
    metaStore.set('63000', baseEntry())
    library.set('63000', { app_name: '63000', title: 'H' } as never)
    seedMacArchFromKnownFix('63000')
    const stored = metaStore.get('63000') as Record<string, unknown>
    expect(stored).toEqual({
      ...baseEntry(),
      mac_arch: '32',
      mac_arch_source: 'known-fix'
    })
    expect(stored.mac_arch_verified).toBeUndefined()
    expect(library.get('63000')?.mac_arch).toBe('32')
    expect(sendFrontendMessage).toHaveBeenCalledTimes(1)

    seedMacArchFromKnownFix('63000')
    expect(setMock).toHaveBeenCalledTimes(1)
    expect(sendFrontendMessage).toHaveBeenCalledTimes(1)
  })

  test('Intel host: no write', () => {
    env.isAppleSiliconMac = false
    readFixes.mockReturnValue({ title: 'H', macArch: '32' })
    metaStore.set('63000', baseEntry())
    seedMacArchFromKnownFix('63000')
    expect(setMock).not.toHaveBeenCalled()
  })

  test('Mach-O verdict wins and a warning is logged', () => {
    readFixes.mockReturnValue({ title: 'H', macArch: '32' })
    metaStore.set('63000', {
      ...baseEntry(),
      mac_arch: '64',
      mac_arch_source: 'macho',
      mac_arch_verified: true
    })
    seedMacArchFromKnownFix('63000')
    expect(setMock).not.toHaveBeenCalled()
    expect(String((logWarning as jest.Mock).mock.calls[0][0])).toContain(
      'Mach-O'
    )
  })

  test('retracts a known-fix seed when the hint disappears', () => {
    readFixes.mockReturnValue({ title: 'H' })
    metaStore.set('63000', {
      ...baseEntry(),
      mac_arch: '32',
      mac_arch_source: 'known-fix'
    })
    seedMacArchFromKnownFix('63000')
    const stored = metaStore.get('63000') as Record<string, unknown>
    expect(stored.mac_arch).toBe('unknown')
    expect('mac_arch_source' in stored).toBe(false)
  })

  test('retracts on a non-Apple-silicon host', () => {
    env.isAppleSiliconMac = false
    readFixes.mockReturnValue({ title: 'H', macArch: '32' })
    metaStore.set('63000', {
      ...baseEntry(),
      mac_arch: '32',
      mac_arch_source: 'known-fix'
    })
    seedMacArchFromKnownFix('63000')
    expect((metaStore.get('63000') as { mac_arch: string }).mac_arch).toBe(
      'unknown'
    )
  })

  test('never retracts a macho 32 entry', () => {
    readFixes.mockReturnValue({ title: 'H' })
    metaStore.set('63000', {
      ...baseEntry(),
      mac_arch: '32',
      mac_arch_source: 'macho',
      mac_arch_verified: true
    })
    seedMacArchFromKnownFix('63000')
    expect(setMock).not.toHaveBeenCalled()
  })
})

describe('formatMacArch32KnownFixEntry', () => {
  test('names the file and carries the JSON', () => {
    const s = formatMacArch32KnownFixEntry('63000', 'HOARD')
    expect(s).toContain('63000-steam.json')
    expect(s).toContain(JSON.stringify({ title: 'HOARD', macArch: '32' }))
  })
  test('falls back to appId', () => {
    expect(formatMacArch32KnownFixEntry('63000', undefined)).toContain(
      JSON.stringify({ title: '63000', macArch: '32' })
    )
  })
})
