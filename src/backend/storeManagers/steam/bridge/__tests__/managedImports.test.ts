import {
  effectiveLaunchArch,
  readManagedSteamApiImports,
  readPeClrHeader,
  readPeEffectiveArch
} from '../managedImports'
import { buildManagedPe, bufferReader } from './fixtures/managedPe'

describe('readPeClrHeader', () => {
  it('reads flags and metadata location from a managed PE', () => {
    const info = readPeClrHeader(
      bufferReader(buildManagedPe({ machine: 0x14c, clrFlags: 0x1 }))
    )
    expect(info).not.toBeNull()
    expect(info!.flags).toBe(0x1)
    expect(info!.metadataRva).toBeGreaterThan(0)
    expect(info!.metadataSize).toBeGreaterThan(0)
  })

  it('returns null for a native PE', () => {
    expect(readPeClrHeader(bufferReader(buildManagedPe({ clr: false })))).toBe(
      null
    )
  })
})

describe('D-53-10 effectiveLaunchArch', () => {
  it('reads AnyCPU as x64 only without 32BITREQUIRED or 32BITPREFERRED', () => {
    expect(effectiveLaunchArch('x86', 0x1)).toBe('x64')
    expect(effectiveLaunchArch('x86', 0x3)).toBe('x86')
    expect(effectiveLaunchArch('x86', 0x20001)).toBe('x86')
    expect(effectiveLaunchArch('x86', null)).toBe('x86')
    expect(effectiveLaunchArch('x64', 0x1)).toBe('x64')
    expect(effectiveLaunchArch(null, 0x1)).toBe(null)
  })

  it('composes machine and CLR flags over real PE bytes', () => {
    const arch = (o: Parameters<typeof buildManagedPe>[0]) =>
      readPeEffectiveArch(bufferReader(buildManagedPe(o)))
    expect(arch({ machine: 0x14c, clrFlags: 0x1 })).toBe('x64')
    expect(arch({ machine: 0x14c, clrFlags: 0x3 })).toBe('x86')
    expect(arch({ machine: 0x14c, clrFlags: 0x20001 })).toBe('x86')
    expect(arch({ machine: 0x14c, clr: false })).toBe('x86')
    expect(arch({ machine: 0x8664, clr: false })).toBe('x64')
  })
})

describe('hostile input never throws and reads as not parsed', () => {
  const pe = buildManagedPe({})

  it('e_lfanew past EOF', () => {
    const b = Buffer.from(pe)
    b.writeUInt32LE(0x7fffffff, 0x3c)
    expect(readPeClrHeader(bufferReader(b))).toBeNull()
    expect(readPeEffectiveArch(bufferReader(b))).toBeNull()
  })

  it('data directory 14 pointing past EOF', () => {
    const b = Buffer.from(pe)
    b.writeUInt32LE(0x70000000, 0x80 + 24 + 96 + 14 * 8)
    expect(readPeClrHeader(bufferReader(b))).toBeNull()
  })

  it('NumberOfRvaAndSizes below 15', () => {
    const b = Buffer.from(pe)
    b.writeUInt32LE(10, 0x80 + 24 + 92)
    expect(readPeClrHeader(bufferReader(b))).toBeNull()
  })

  it('truncated file', () => {
    expect(readPeClrHeader(bufferReader(pe.subarray(0, 0x90)))).toBeNull()
  })
})
