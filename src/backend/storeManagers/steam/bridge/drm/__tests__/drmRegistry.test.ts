/**
 * Phase 56 plan 09: the DRM registry commands and the user.reg staging check.
 * Pure functions; no fs, no wine spawn.
 */
jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Steam: 'Steam' }
}))

import {
  buildDrmRegistryCommands,
  drmRegistryMismatches,
  drmRegistryStagedInUserReg,
  isPhase52ForwarderBytes
} from '../drmRegistry'
import { at } from '../../../__tests__/fixtures/indexed'

const FORWARDER = Buffer.concat([
  Buffer.from('MZ-fwd'),
  Buffer.from('GameLib steamclient forwarder', 'utf16le')
])

const LIVE_STALE = `[Software\\\\Valve\\\\Steam\\\\ActiveProcess] 1792813400
#time=1dd6369cfefa3fa
"SteamClientDll64"="C:\\\\Program Files (x86)\\\\Steam\\\\steamapps\\\\common\\\\Grim Dawn\\\\x64\\\\steamclient64.dll"
"Universe"="Public"
`
const STAGED_REG = `[Software\\\\Valve\\\\Steam] 1792813500
#time=1dd6369cfefa400
"SteamPath"="C:\\\\Program Files (x86)\\\\Steam"

[Software\\\\Valve\\\\Steam\\\\ActiveProcess] 1792813400
#time=1dd6369cfefa3fa
"SteamClientDll64"="C:\\\\Program Files (x86)\\\\Steam\\\\steamclient64.dll"
"SteamPath"="C:\\\\Program Files (x86)\\\\Steam"
"Universe"="Public"
`

describe('buildDrmRegistryCommands', () => {
  it('returns the four HKCU argv in order', () => {
    const s = 'C:\\Program Files (x86)\\Steam'
    const ap = 'HKCU\\Software\\Valve\\Steam\\ActiveProcess'
    expect(buildDrmRegistryCommands()).toEqual([
      [
        'reg',
        'add',
        ap,
        '/v',
        'SteamClientDll64',
        '/t',
        'REG_SZ',
        '/d',
        s + '\\steamclient64.dll',
        '/f'
      ],
      [
        'reg',
        'add',
        ap,
        '/v',
        'Universe',
        '/t',
        'REG_SZ',
        '/d',
        'Public',
        '/f'
      ],
      ['reg', 'add', ap, '/v', 'SteamPath', '/t', 'REG_SZ', '/d', s, '/f'],
      [
        'reg',
        'add',
        'HKCU\\Software\\Valve\\Steam',
        '/v',
        'SteamPath',
        '/t',
        'REG_SZ',
        '/d',
        s,
        '/f'
      ]
    ])
  })

  it('never names the local-machine hive', () => {
    for (const argv of buildDrmRegistryCommands()) {
      for (const el of argv) expect(el).not.toMatch(/HKLM|HKEY_LOCAL_MACHINE/i)
      expect(at(argv, 2).startsWith('HKCU\\')).toBe(true)
    }
  })
})

describe('drmRegistryMismatches', () => {
  it('is empty for a staged body and for a trailing-backslash SteamPath', () => {
    expect(drmRegistryMismatches(STAGED_REG)).toEqual([])
    const t = STAGED_REG.replaceAll(
      '"SteamPath"="C:\\\\Program Files (x86)\\\\Steam"',
      '"SteamPath"="C:\\\\Program Files (x86)\\\\Steam\\\\"'
    )
    expect(drmRegistryMismatches(t)).toEqual([])
  })
  it('names a missing value', () => {
    expect(
      drmRegistryMismatches(STAGED_REG.replace('"Universe"="Public"', ''))
    ).toEqual(['Software\\\\Valve\\\\Steam\\\\ActiveProcess:Universe'])
  })
  it('names every value of a stale body', () => {
    expect(drmRegistryMismatches(LIVE_STALE).length).toBeGreaterThan(0)
  })
})

describe('drmRegistryStagedInUserReg', () => {
  it('is true for a staged user.reg', () => {
    expect(drmRegistryStagedInUserReg(STAGED_REG)).toBe(true)
  })
  it('tolerates a trailing backslash on SteamPath (helper rewrite)', () => {
    const t = STAGED_REG.replaceAll(
      '"SteamPath"="C:\\\\Program Files (x86)\\\\Steam"',
      '"SteamPath"="C:\\\\Program Files (x86)\\\\Steam\\\\"'
    )
    expect(t).not.toBe(STAGED_REG)
    expect(drmRegistryStagedInUserReg(t)).toBe(true)
  })
  it('is false for the stale forwarder section', () => {
    expect(drmRegistryStagedInUserReg(LIVE_STALE)).toBe(false)
  })
  it('is false when one value is missing', () => {
    expect(
      drmRegistryStagedInUserReg(STAGED_REG.replace('"Universe"="Public"', ''))
    ).toBe(false)
  })
  it('is false when the Steam-level SteamPath is missing', () => {
    const t = at(STAGED_REG.split('\n\n'), 1)
    expect(drmRegistryStagedInUserReg(t)).toBe(false)
  })
  it('is false when the values live under a different section', () => {
    expect(
      drmRegistryStagedInUserReg(
        STAGED_REG.replace(
          'Valve\\\\Steam\\\\ActiveProcess]',
          'Valve\\\\Steam\\\\ActiveProcessX]'
        )
      )
    ).toBe(false)
  })
  it('is false for empty and oversize input and never throws', () => {
    expect(drmRegistryStagedInUserReg('')).toBe(false)
    expect(drmRegistryStagedInUserReg('a'.repeat(70 * 1024 * 1024))).toBe(false)
  })
})

describe('isPhase52ForwarderBytes', () => {
  it('detects the utf16le marker', () => {
    expect(isPhase52ForwarderBytes(FORWARDER)).toBe(true)
  })
  it('rejects latin1-only text, random MZ, and empty', () => {
    expect(
      isPhase52ForwarderBytes(Buffer.from('GameLib steamclient forwarder'))
    ).toBe(false)
    expect(isPhase52ForwarderBytes(Buffer.from('MZ\x01\x02\x03'))).toBe(false)
    expect(isPhase52ForwarderBytes(Buffer.alloc(0))).toBe(false)
  })
})
