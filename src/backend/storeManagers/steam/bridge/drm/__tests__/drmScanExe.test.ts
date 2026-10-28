/** Phase 56 plan 19: UE-aware launch DRM wrapper resolver. Real fs, tmp bottle. */
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'fs'
import { tmpdir } from 'os'
import { dirname, join } from 'path'

import { detectLaunchDrmWrapper } from '../drmScanExe'

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  logError: jest.fn(),
  logDebug: jest.fn(),
  LogPrefix: { Steam: 'Steam' }
}))

jest.mock('backend/constants/paths', () => ({
  builtBridgeShimPath: '/nonexistent/steam_api.dll',
  builtBridgeShim64Path: '/nonexistent/steam_api64.dll'
}))

jest.mock('../../../bottle', () => ({
  DEFAULT_BRIDGE_BOTTLE_NAME: 'GameLibSteamBridge',
  sanitizeBottleName: (n: string | null) => n,
  getBottleDir: jest.fn()
}))

jest.mock('../../importScan', () => ({ scanSteamApiImports: jest.fn() }))

function buildPe(names: string[]): Buffer {
  const pe = 0x80
  const optSize = 0xf0
  const table = pe + 24 + optSize
  const buf = Buffer.alloc(table + names.length * 40)
  buf.writeUInt16LE(0x5a4d, 0)
  buf.writeUInt32LE(pe, 0x3c)
  buf.writeUInt32LE(0x4550, pe)
  buf.writeUInt16LE(names.length, pe + 6)
  buf.writeUInt16LE(optSize, pe + 20)
  names.forEach((n, i) => buf.write(n, table + i * 40, 8, 'latin1'))
  return buf
}

const PLAIN = ['.text', '.rdata', '.data', '.pdata', '.rsrc', '.reloc']
const STUB = [...PLAIN, '.bind']

describe('detectLaunchDrmWrapper', () => {
  let bottle: string
  let game: string
  beforeEach(() => {
    bottle = realpathSync(mkdtempSync(join(tmpdir(), 'drmscan-')))
    game = join(bottle, 'Game')
    mkdirSync(game, { recursive: true })
  })
  afterEach(() => rmSync(bottle, { recursive: true, force: true }))

  function write(path: string, names: string[]): string {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, buildPe(names))
    return path
  }
  const shipping = () =>
    join(game, 'Game', 'Binaries', 'Win64', 'Game-Win64-Shipping.exe')

  it('launch exe with .bind wins without a UE lookup', async () => {
    const exe = write(join(game, 'Game.exe'), STUB)
    const findUnreal = jest.fn()
    await expect(
      detectLaunchDrmWrapper(bottle, exe, { findUnreal })
    ).resolves.toEqual({ drmWrapper: 'steamstub', drmExe: exe })
    expect(findUnreal).not.toHaveBeenCalled()
  })

  it('UE bootstrap without .bind, Shipping exe with .bind -> Shipping exe', async () => {
    const exe = write(join(game, 'Game.exe'), PLAIN)
    const ship = write(shipping(), STUB)
    mkdirSync(join(game, 'Engine'), { recursive: true })
    await expect(detectLaunchDrmWrapper(bottle, exe)).resolves.toEqual({
      drmWrapper: 'steamstub',
      drmExe: ship
    })
  })

  it('UE layout with no .bind Shipping exe -> none, launch exe', async () => {
    const exe = write(join(game, 'Game.exe'), PLAIN)
    write(shipping(), PLAIN)
    mkdirSync(join(game, 'Engine'), { recursive: true })
    await expect(detectLaunchDrmWrapper(bottle, exe)).resolves.toEqual({
      drmWrapper: 'none',
      drmExe: exe
    })
  })

  it('unreadable launch exe and no UE layout -> undefined', async () => {
    const exe = join(game, 'missing.exe')
    await expect(detectLaunchDrmWrapper(bottle, exe)).resolves.toEqual({
      drmWrapper: undefined,
      drmExe: exe
    })
  })

  it('ignores a Shipping exe whose realpath escapes the bottle', async () => {
    const outside = realpathSync(mkdtempSync(join(tmpdir(), 'drmscan-out-')))
    try {
      const exe = write(join(game, 'Game.exe'), PLAIN)
      const target = write(join(outside, 'evil.exe'), STUB)
      const link = shipping()
      mkdirSync(dirname(link), { recursive: true })
      symlinkSync(target, link)
      const findUnreal = jest
        .fn()
        .mockResolvedValue({ steamworksDir: null, shippingExes: [link] })
      await expect(
        detectLaunchDrmWrapper(bottle, exe, { findUnreal })
      ).resolves.toEqual({ drmWrapper: 'none', drmExe: exe })
    } finally {
      rmSync(outside, { recursive: true, force: true })
    }
  })

  it('never rejects when findUnrealLayout throws', async () => {
    const exe = write(join(game, 'Game.exe'), PLAIN)
    const findUnreal = jest.fn().mockRejectedValue(new Error('boom'))
    await expect(
      detectLaunchDrmWrapper(bottle, exe, { findUnreal })
    ).resolves.toEqual({ drmWrapper: 'none', drmExe: exe })
  })
})
