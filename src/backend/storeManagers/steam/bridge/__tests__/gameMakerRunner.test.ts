/**
 * quick 261028-k7l: three-signal GameMaker D3D11 runner detector. Real fs
 * under a per-test tmp dir; exes are synthetic (buildImportPe).
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const mockLogWarning = jest.fn()
jest.mock('backend/logger', () => ({
  logWarning: (...args: unknown[]) => mockLogWarning(...args),
  logInfo: jest.fn(),
  logDebug: jest.fn(),
  LogPrefix: { Steam: 'Steam' }
}))

const mockReadFile = jest.fn()
jest.mock('node:fs/promises', () => {
  const actual = jest.requireActual('node:fs/promises')
  return {
    ...actual,
    readFile: (...args: unknown[]) => {
      mockReadFile(...args)
      return actual.readFile(...args)
    }
  }
})

import {
  detectGameMakerD3d11Runner,
  GAMEMAKER_MSAA_PROBE
} from '../gameMakerRunner'
import { buildImportPe } from './fixtures/importPe'

describe('detectGameMakerD3d11Runner (quick 261028-k7l)', () => {
  let dir: string
  let exe: string

  beforeEach(() => {
    mockLogWarning.mockClear()
    mockReadFile.mockClear()
    dir = mkdtempSync(join(tmpdir(), 'gamelib-gm-runner-'))
    exe = join(dir, 'game.exe')
  })
  afterEach(() => {
    jest.restoreAllMocks()
    rmSync(dir, { recursive: true, force: true })
  })

  const writeExe = (dlls: string[], probe = true) =>
    writeFileSync(
      exe,
      buildImportPe({
        plus: true,
        dlls,
        trailingAscii: probe ? GAMEMAKER_MSAA_PROBE : 'nothing here'
      })
    )

  it('matches when all three signals hold', async () => {
    writeExe(['KERNEL32.dll', 'd3d11.dll'])
    writeFileSync(join(dir, 'data.win'), 'FORM')
    expect(await detectGameMakerD3d11Runner(exe)).toEqual({
      match: true,
      dataWin: true,
      d3d11Import: true,
      msaaProbe: true
    })
  })

  it('does not match, and never reads the exe, without data.win', async () => {
    writeExe(['d3d11.dll'])
    const r = await detectGameMakerD3d11Runner(exe)
    expect(r.match).toBe(false)
    expect(r.dataWin).toBe(false)
    expect(mockReadFile).not.toHaveBeenCalled()
    expect(mockLogWarning).not.toHaveBeenCalled()
  })

  it('does not match without a d3d11 import', async () => {
    writeExe(['KERNEL32.dll'])
    writeFileSync(join(dir, 'data.win'), 'FORM')
    const r = await detectGameMakerD3d11Runner(exe)
    expect(r.match).toBe(false)
    expect(r.d3d11Import).toBe(false)
  })

  it('matches d3d11.dll case-insensitively', async () => {
    writeExe(['D3D11.DLL'])
    writeFileSync(join(dir, 'data.win'), 'FORM')
    expect((await detectGameMakerD3d11Runner(exe)).match).toBe(true)
  })

  it('does not match without the MSAA probe string', async () => {
    writeExe(['d3d11.dll'], false)
    writeFileSync(join(dir, 'data.win'), 'FORM')
    const r = await detectGameMakerD3d11Runner(exe)
    expect(r.match).toBe(false)
    expect(r.msaaProbe).toBe(false)
  })

  it('does not count a data.win directory', async () => {
    writeExe(['d3d11.dll'])
    mkdirSync(join(dir, 'data.win'))
    const r = await detectGameMakerD3d11Runner(exe)
    expect(r.dataWin).toBe(false)
    expect(r.match).toBe(false)
  })

  it('warns once and resolves when the exe is missing', async () => {
    writeFileSync(join(dir, 'data.win'), 'FORM')
    const r = await detectGameMakerD3d11Runner(exe)
    expect(r.match).toBe(false)
    expect(mockLogWarning).toHaveBeenCalledTimes(1)
  })

  it('does not match a non-PE exe and does not throw', async () => {
    writeFileSync(exe, `not a pe ${GAMEMAKER_MSAA_PROBE}`)
    writeFileSync(join(dir, 'data.win'), 'FORM')
    const r = await detectGameMakerD3d11Runner(exe)
    expect(r.match).toBe(false)
    expect(r.d3d11Import).toBe(false)
  })
})
