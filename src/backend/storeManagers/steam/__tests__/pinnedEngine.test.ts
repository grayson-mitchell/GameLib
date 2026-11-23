/**
 * The Steam side of the pinned engine (Phase 87, 87-56a, D-24): the reader answers what the twin answers for the
 * `<toolsPath>/steam-engines` root, over a real directory.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  ENGINE_PINS,
  isPinnedEngineInstalled,
  pinnedEnginePaths
} from 'backend/enginewine/twin'
import { pinnedEngineReader } from '../engine/pinnedEngine'

describe('pinnedEngineReader', () => {
  let toolsPath: string
  beforeEach(() => {
    toolsPath = mkdtempSync(join(tmpdir(), 'pinned-engine-reader-'))
  })
  afterEach(() => {
    rmSync(toolsPath, { recursive: true, force: true })
  })

  it('names the shared root under the tools path', () => {
    expect(pinnedEngineReader({ toolsPath }).pinnedEngineRoot()).toBe(
      join(toolsPath, 'steam-engines')
    )
  })

  it('answers false for an engine that is not installed, as the twin does', () => {
    const pin = ENGINE_PINS.current
    const reader = pinnedEngineReader({ toolsPath })
    expect(reader.isPinnedEngineInstalled(pin)).toBe(false)
    expect(isPinnedEngineInstalled(join(toolsPath, 'steam-engines'), pin)).toBe(
      false
    )
  })

  it('answers true for a fully stamped install, equal to the twin', () => {
    const pin = ENGINE_PINS.current
    const root = join(toolsPath, 'steam-engines')
    const p = pinnedEnginePaths(root, pin)
    mkdirSync(join(p.wineDir, 'Contents', 'Resources', 'wine', 'bin'), {
      recursive: true
    })
    writeFileSync(p.wineBin, '')
    writeFileSync(p.wineserverBin, '')
    mkdirSync(join(p.dxvkDir, 'x32'), { recursive: true })
    mkdirSync(join(p.dxvkDir, 'x64'), { recursive: true })
    for (const [dir, artifact] of [
      [p.wineDir, pin.wine],
      [p.dxvkDir, pin.dxvk]
    ] as const) {
      writeFileSync(
        join(dir, '.gamelib-pin.json'),
        JSON.stringify({ sha256: artifact.sha256 })
      )
    }
    const reader = pinnedEngineReader({ toolsPath })
    expect(reader.isPinnedEngineInstalled(pin)).toBe(
      isPinnedEngineInstalled(root, pin)
    )
    expect(reader.isPinnedEngineInstalled(pin)).toBe(true)
  })
})
