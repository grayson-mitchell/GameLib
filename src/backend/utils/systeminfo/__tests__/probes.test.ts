import { createScriptedRunner } from 'backend/testUtils/scriptedRunner'
import { getMemoryInfo_linux } from '../memory/linux'
import { getMemoryInfo_macos } from '../memory/macos'
import { osInfo_windows } from '../osInfo/windows'
import { getGpuInfo_windows } from '../gpu/windows'

describe('System Information probes spawn through the runner', () => {
  it('free -b with a replaced LANG=C env and the default timeout', async () => {
    const runner = createScriptedRunner([
      {
        cmd: 'free',
        argv: ['-b'],
        result: { stdout: 'Mem:  1000  400  600\n' }
      }
    ])
    expect(await getMemoryInfo_linux({ runner })).toEqual({
      total: 1000,
      used: 400
    })
    expect(runner.calls[0]?.opts).toMatchObject({
      timeoutMs: 30_000,
      replaceEnv: true,
      env: expect.objectContaining({ LANG: 'C' }) as unknown
    })
  })

  it('free rejects on ENOENT', async () => {
    const runner = createScriptedRunner([
      { cmd: 'free', argv: ['-b'], error: { code: 'ENOENT' } }
    ])
    await expect(getMemoryInfo_linux({ runner })).rejects.toThrow('ENOENT')
  })

  it('macOS: sysctl then vm_stat; timeout falls back to defaults', async () => {
    const runner = createScriptedRunner([
      {
        cmd: 'sysctl',
        argv: ['-n', 'vm.pagesize'],
        result: { timedOut: true, code: null, signal: 'SIGKILL' }
      },
      {
        cmd: 'vm_stat',
        argv: [],
        result: { stdout: 'Pages active: 10\nPages wired down: 5\n' }
      }
    ])
    const info = await getMemoryInfo_macos({ runner })
    expect(info.used).toBe(15 * 4096)
    expect(runner.calls.map((c) => c.cmd)).toEqual(['sysctl', 'vm_stat'])
    runner.expectAllConsumed()
  })

  it('macOS: non-zero vm_stat yields zero used', async () => {
    const runner = createScriptedRunner([
      {
        cmd: 'sysctl',
        argv: ['-n', 'vm.pagesize'],
        result: { stdout: '16384' }
      },
      { cmd: 'vm_stat', argv: [], result: { code: 1 } }
    ])
    expect((await getMemoryInfo_macos({ runner })).used).toBe(0)
  })

  it('windows OS info runs powershell and falls back when it fails', async () => {
    const runner = createScriptedRunner([
      {
        cmd: 'powershell',
        match: (a) => a.includes('Win32_OperatingSystem'),
        result: { code: 1 }
      }
    ])
    expect(await osInfo_windows({ runner })).toEqual({
      name: 'Unknown Windows Version'
    })
    expect(runner.calls[0]?.opts).toMatchObject({ timeoutMs: 30_000 })
  })

  it('windows GPU info parses powershell output', async () => {
    const runner = createScriptedRunner([
      {
        cmd: 'powershell',
        match: (a) => a.includes('Win32_VideoController'),
        result: {
          stdout: JSON.stringify({
            AdapterCompatibility: 'Intel Corporation',
            DriverVersion: '1.2.3',
            PnPDeviceID: 'PCI\\VEN_8086&DEV_1234&SUBSYS_5678ABCD'
          })
        }
      }
    ])
    const gpus = await getGpuInfo_windows({ runner })
    expect(gpus[0]).toMatchObject({ vendorId: '8086', deviceId: '1234' })
  })
})
