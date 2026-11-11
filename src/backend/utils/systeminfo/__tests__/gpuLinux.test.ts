import { createScriptedRunner } from 'backend/testUtils/scriptedRunner'
import { createTestStoreRoot } from '../../../testUtils/testStoreRoot'
import { createPciIdCaches } from '../gpu/pci_ids'
import { getGpuInfo } from '../gpu'
import { getGpuInfo_linux, parseLspciGpus } from '../gpu/linux'
import { getSteamDeckInfo } from '../steamDeck'
import * as logger from 'backend/logger'
import type { CpuInfo } from 'os'
import type { GPUInfo } from '../index'

function record(fields: Record<string, string>) {
  return Object.entries(fields)
    .map(([k, v]) => `${k}:\t${v}`)
    .join('\n')
}

function gpuRecord(
  cls: string,
  vendor: string,
  device: string,
  driver?: string,
  sub?: [string, string]
) {
  return record({
    Slot: '04:00.0',
    Class: cls,
    Vendor: vendor,
    Device: device,
    ...(sub ? { SVendor: sub[0], SDevice: sub[1] } : {}),
    Rev: 'ae',
    ProgIf: '00',
    ...(driver ? { Driver: driver, Module: driver } : {})
  })
}

const bridge = record({
  Slot: '00:01.1',
  Class: '0604',
  Vendor: '1022',
  Device: '1634',
  Driver: 'pcieport'
})
const usb = record({
  Slot: '00:14.0',
  Class: '0c03',
  Vendor: '1022',
  Device: '15b6',
  Driver: 'xhci_hcd'
})

let warn: jest.SpyInstance
beforeEach(() => {
  warn = jest.spyOn(logger, 'logWarning').mockImplementation(() => undefined)
})
afterEach(() => warn.mockRestore())

const join = (...recs: string[]) => recs.join('\n\n') + '\n'

describe('parseLspciGpus', () => {
  it('keeps only the GPU record of a single AMD system', () => {
    const out = join(
      bridge,
      gpuRecord('0300', '1002', '73bf', 'amdgpu', ['1da2', 'e445']),
      usb
    )
    expect(parseLspciGpus(out)).toEqual([
      {
        vendorId: '1002',
        deviceId: '73bf',
        subvendorId: '1da2',
        subdeviceId: 'e445',
        driverVersion: 'amdgpu'
      }
    ])
  })

  it('keeps hybrid GPUs in order, including 0302 and 0380', () => {
    const out = join(
      gpuRecord('0300', '8086', 'a7a0', 'i915'),
      gpuRecord('0302', '10de', '2860', 'nvidia'),
      gpuRecord('0380', '1002', '1234')
    )
    expect(
      parseLspciGpus(out).map((g) => `${g.vendorId}:${g.deviceId}`)
    ).toEqual(['8086:a7a0', '10de:2860', '1002:1234'])
  })

  it('omits driverVersion without Driver, lowercases hex, tolerates CRLF', () => {
    const out = join(gpuRecord('0300', '10DE', '2860')).replace(/\n/g, '\r\n')
    const [gpu] = parseLspciGpus(out)
    expect(gpu).toEqual({ vendorId: '10de', deviceId: '2860' })
    expect(gpu).not.toHaveProperty('driverVersion')
  })

  it('returns [] for empty or garbage output', () => {
    expect(parseLspciGpus('')).toEqual([])
    expect(parseLspciGpus('nope\n\n::::\nClass:\tzz\n')).toEqual([])
    expect(
      parseLspciGpus(record({ Class: '0300', Vendor: 'xyz', Device: '1' }))
    ).toEqual([])
  })

  it.each([
    ['163f', 'LCD', 'AMD Custom APU 0405'],
    ['1435', 'OLED', 'AMD Custom APU 0932']
  ])('feeds Steam Deck detection (%s)', (deviceId, model, cpu) => {
    const gpus = parseLspciGpus(
      join(gpuRecord('0300', '1002', deviceId, 'amdgpu'))
    ) as GPUInfo[]
    const cpus = [{ model: cpu }] as CpuInfo[]
    expect(getSteamDeckInfo(cpus, gpus)).toMatchObject({ isDeck: true, model })
  })
})

describe('getGpuInfo_linux', () => {
  const argv = ['-mm', '-v', '-n', '-k']

  it('runs one lspci call through the runner with no env override', async () => {
    const runner = createScriptedRunner([
      {
        cmd: 'lspci',
        argv,
        result: { stdout: join(gpuRecord('0300', '1002', '163f', 'amdgpu')) }
      }
    ])
    expect(await getGpuInfo_linux({ runner })).toEqual([
      { vendorId: '1002', deviceId: '163f', driverVersion: 'amdgpu' }
    ])
    const opts = runner.calls[0]?.opts
    expect(opts).toMatchObject({ timeoutMs: 30_000 })
    expect((opts as { replaceEnv?: boolean }).replaceEnv).toBeFalsy()
    expect((opts as { env?: unknown }).env).toBeUndefined()
    runner.expectAllConsumed()
  })

  it('resolves [] on ENOENT', async () => {
    const runner = createScriptedRunner([
      { cmd: 'lspci', argv, error: { code: 'ENOENT' } }
    ])
    expect(await getGpuInfo_linux({ runner })).toEqual([])
    expect(warn).toHaveBeenCalled()
  })

  it('resolves [] on non-zero exit', async () => {
    const runner = createScriptedRunner([
      { cmd: 'lspci', argv, result: { code: 1 } }
    ])
    expect(await getGpuInfo_linux({ runner })).toEqual([])
  })

  it('resolves [] on timeout', async () => {
    const runner = createScriptedRunner([
      {
        cmd: 'lspci',
        argv,
        result: { timedOut: true, code: null, signal: 'SIGKILL' }
      }
    ])
    expect(await getGpuInfo_linux({ runner })).toEqual([])
  })
})

describe('getGpuInfo tolerance', () => {
  const original = Object.getOwnPropertyDescriptor(process, 'platform')
  const setPlatform = (value: string) =>
    Object.defineProperty(process, 'platform', { value, configurable: true })
  afterEach(() => {
    if (original) Object.defineProperty(process, 'platform', original)
  })

  it('resolves [] when the win32 probe rejects', async () => {
    setPlatform('win32')
    const runner = createScriptedRunner([
      { cmd: 'powershell', error: { code: 'ENOENT' } }
    ])
    await expect(
      getGpuInfo({ runner }, createPciIdCaches({ root: createTestStoreRoot() }))
    ).resolves.toEqual([])
  })

  it('resolves [] when lspci is missing on linux', async () => {
    setPlatform('linux')
    const runner = createScriptedRunner([
      { cmd: 'lspci', error: { code: 'ENOENT' } }
    ])
    await expect(
      getGpuInfo({ runner }, createPciIdCaches({ root: createTestStoreRoot() }))
    ).resolves.toEqual([])
  })
})
