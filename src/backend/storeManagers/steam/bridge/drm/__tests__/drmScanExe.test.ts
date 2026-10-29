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
import { dirname, join, resolve } from 'path'

import { logWarning } from 'backend/logger'

import { detectLaunchDrmWrapper } from '../drmScanExe'
import { detectDrmWrapper as realDetect } from '../../shimGenerate'

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
  beforeEach(() => jest.mocked(logWarning).mockClear())

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

  it('ignores a Shipping exe whose realpath escapes the game folder', async () => {
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
      const detect = jest.fn(realDetect)
      await expect(
        detectLaunchDrmWrapper(bottle, exe, { findUnreal, detect })
      ).resolves.toEqual({ drmWrapper: 'none', drmExe: exe })
      expect(detect.mock.calls.some((c) => c[0] === target)).toBe(false)
      const msg = jest.mocked(logWarning).mock.calls.map((c) => String(c[0]))
      expect(
        msg.some(
          (m) =>
            m.includes('Game-Win64-Shipping.exe') &&
            m.includes('escapes game folder')
        )
      ).toBe(true)
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

  it('symlinked bottle root still routes and returns the lexical path', async () => {
    const holder = realpathSync(mkdtempSync(join(tmpdir(), 'drmscan-lnk-')))
    try {
      const link = join(holder, 'bottle-link')
      symlinkSync(bottle, link)
      const exe = write(join(game, 'Game.exe'), PLAIN)
      const ship = write(shipping(), STUB)
      const lexical = join(
        link,
        'Game',
        'Game',
        'Binaries',
        'Win64',
        'Game-Win64-Shipping.exe'
      )
      const findUnreal = jest
        .fn()
        .mockResolvedValue({ steamworksDir: null, shippingExes: [lexical] })
      const r = await detectLaunchDrmWrapper(link, exe, { findUnreal })
      expect(ship).toBeTruthy()
      expect(r).toEqual({ drmWrapper: 'steamstub', drmExe: resolve(lexical) })
      expect(r.drmExe.startsWith(link)).toBe(true)
    } finally {
      rmSync(holder, { recursive: true, force: true })
    }
  })

  it('symlinked dir inside the game folder still routes', async () => {
    const exe = write(join(game, 'Game.exe'), PLAIN)
    write(
      join(game, 'Real', 'Game', 'Binaries', 'Win64', 'S-Shipping.exe'),
      STUB
    )
    const linkDir = join(game, 'Linked')
    symlinkSync(join(game, 'Real'), linkDir)
    const lexical = join(linkDir, 'Game', 'Binaries', 'Win64', 'S-Shipping.exe')
    const findUnreal = jest
      .fn()
      .mockResolvedValue({ steamworksDir: null, shippingExes: [lexical] })
    await expect(
      detectLaunchDrmWrapper(bottle, exe, { findUnreal })
    ).resolves.toEqual({ drmWrapper: 'steamstub', drmExe: resolve(lexical) })
  })

  it('symlinked Bottles dir routes a UE SteamStub title with a lexical drmExe', async () => {
    const holder = realpathSync(mkdtempSync(join(tmpdir(), 'drmscan-lnk-')))
    try {
      const link = join(holder, 'bottle-link')
      symlinkSync(bottle, link)
      write(join(game, 'Game.exe'), PLAIN)
      write(shipping(), STUB)
      mkdirSync(join(game, 'Engine'), { recursive: true })
      const exe = join(link, 'Game', 'Game.exe')
      const r = await detectLaunchDrmWrapper(link, exe)
      expect(r).toEqual({
        drmWrapper: 'steamstub',
        drmExe: join(
          link,
          'Game',
          'Game',
          'Binaries',
          'Win64',
          'Game-Win64-Shipping.exe'
        )
      })
      expect(r.drmExe.startsWith(link)).toBe(true)
    } finally {
      rmSync(holder, { recursive: true, force: true })
    }
  })

  it('symlinked steamapps/common routes a UE SteamStub title with a lexical drmExe', async () => {
    const volume = realpathSync(mkdtempSync(join(tmpdir(), 'drmscan-vol-')))
    try {
      const steamapps = join(
        bottle,
        'drive_c',
        'Program Files (x86)',
        'Steam',
        'steamapps'
      )
      mkdirSync(steamapps, { recursive: true })
      write(join(volume, 'Game', 'Game.exe'), PLAIN)
      mkdirSync(join(volume, 'Game', 'Engine'), { recursive: true })
      write(
        join(
          volume,
          'Game',
          'Game',
          'Binaries',
          'Win64',
          'Game-Win64-Shipping.exe'
        ),
        STUB
      )
      const common = join(steamapps, 'common')
      symlinkSync(volume, common)
      const exe = join(common, 'Game', 'Game.exe')
      const r = await detectLaunchDrmWrapper(bottle, exe)
      expect(r).toEqual({
        drmWrapper: 'steamstub',
        drmExe: join(
          common,
          'Game',
          'Game',
          'Binaries',
          'Win64',
          'Game-Win64-Shipping.exe'
        )
      })
      expect(r.drmExe).toContain('drive_c')
    } finally {
      rmSync(volume, { recursive: true, force: true })
    }
  })

  it('refuses a bootstrap exe symlinked outside the game folder', async () => {
    const outside = realpathSync(mkdtempSync(join(tmpdir(), 'drmscan-out-')))
    try {
      const target = write(join(outside, 'evil.exe'), STUB)
      const exe = join(game, 'Game.exe')
      symlinkSync(target, exe)
      const detect = jest.fn(realDetect)
      await expect(
        detectLaunchDrmWrapper(bottle, exe, { detect })
      ).resolves.toEqual({ drmWrapper: undefined, drmExe: exe })
      expect(
        detect.mock.calls.some((c) => String(c[0]).startsWith(outside))
      ).toBe(false)
      expect(
        jest
          .mocked(logWarning)
          .mock.calls.some(
            (c) =>
              String(c[0]).includes('Game.exe') &&
              String(c[0]).includes('escapes game folder')
          )
      ).toBe(true)
    } finally {
      rmSync(outside, { recursive: true, force: true })
    }
  })

  it('a refused bootstrap does not stop the UE Shipping fallback', async () => {
    const outside = realpathSync(mkdtempSync(join(tmpdir(), 'drmscan-out-')))
    try {
      const target = write(join(outside, 'evil.exe'), STUB)
      const exe = join(game, 'Game.exe')
      symlinkSync(target, exe)
      const ship = write(shipping(), STUB)
      mkdirSync(join(game, 'Engine'), { recursive: true })
      await expect(detectLaunchDrmWrapper(bottle, exe)).resolves.toEqual({
        drmWrapper: 'steamstub',
        drmExe: ship
      })
    } finally {
      rmSync(outside, { recursive: true, force: true })
    }
  })

  it('a throwing detector on one candidate does not abandon the rest', async () => {
    const exe = write(join(game, 'Game.exe'), PLAIN)
    const a = write(join(game, 'a-Shipping.exe'), STUB)
    const b = write(join(game, 'b-Shipping.exe'), STUB)
    const findUnreal = jest
      .fn()
      .mockResolvedValue({ steamworksDir: null, shippingExes: [b, a] })
    const detect = jest.fn((p: string) => {
      if (p === exe) return 'none' as const
      if (p === a) throw new Error('scan boom')
      return 'steamstub' as const
    })
    await expect(
      detectLaunchDrmWrapper(bottle, exe, { findUnreal, detect })
    ).resolves.toEqual({ drmWrapper: 'steamstub', drmExe: b })
    expect(
      jest
        .mocked(logWarning)
        .mock.calls.some(
          (c) =>
            String(c[0]).includes('a-Shipping.exe') &&
            String(c[0]).includes('scan threw')
        )
    ).toBe(true)
  })
})
