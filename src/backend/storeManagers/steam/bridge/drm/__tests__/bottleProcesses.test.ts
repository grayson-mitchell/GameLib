/**
 * Phase 56: attributing wine processes to a bottle from `ps -E` and `lsof`
 * output. Pure functions; no spawn.
 */
jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  LogPrefix: { Steam: 'Steam' }
}))
jest.mock('../../../bridgeBottleLifecycle', () => ({
  endPerGameBridgeBottleSession: jest.fn()
}))

import { pidsOfBottleSession, pidsWithCwdInBottle } from '../bottleProcesses'

describe('pidsOfBottleSession', () => {
  const dir = '/Users/u/Library/Application Support/CrossOver/Bottles/B-1'
  const ps = [
    ` 100 C:\\windows\\system32\\winedevice.exe  HOME=/x WINEPREFIX=${dir} A=b`,
    ` 101 /r/bin/wineserver CX_BOTTLE=B-1 FOO=1`,
    ` 102 C:\\windows\\system32\\winedevice.exe WINEPREFIX=${dir}2 A=b`,
    ` 103 C:\\windows\\system32\\winedevice.exe CX_BOTTLE=B-10`,
    ` 104 /usr/bin/node WINEPREFIX=${dir}`,
    ` 105 /r/bin/wineserver WINEPREFIX=${dir}`
  ].join('\n')

  it('matches only this bottle, wine-ish commands, never the own pid', () => {
    expect(pidsOfBottleSession(ps, dir, 'B-1', 105)).toEqual([100, 101])
  })
})

describe('pidsWithCwdInBottle', () => {
  const dir = '/Users/u/Library/Application Support/CrossOver/Bottles/B-1'
  const lsof = [
    'p100',
    'fcwd',
    `n${dir}/drive_c/windows/system32`,
    'p101',
    'fcwd',
    `n${dir}`,
    'p102',
    'fcwd',
    `n${dir}0/drive_c`,
    'p103',
    'fcwd',
    'n/',
    'p104',
    'fcwd',
    `n${dir}/drive_c`,
    'p105',
    'fcwd',
    `n${dir}/drive_c`
  ].join('\n')
  const ps = [
    ' 100 C:\\windows\\system32\\winedevice.exe ',
    ' 101 /r/lib/wine/x86_64-windows/winewrapper.exe --run -- C:\\x.exe',
    ' 102 C:\\windows\\system32\\winedevice.exe ',
    ' 103 C:\\windows\\system32\\winedevice.exe ',
    ' 104 C:\\windows\\system32\\winedevice.exe ',
    ' 105 -zsh'
  ].join('\n')

  it('matches wine processes with a cwd at or under the bottle dir only', () => {
    expect(pidsWithCwdInBottle(lsof, ps, dir, 104)).toEqual([100, 101])
  })
})
