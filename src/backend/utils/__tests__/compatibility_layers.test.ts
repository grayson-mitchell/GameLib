import { getDefaultWineBinary, getWineExecs } from '../compatibility_layers'
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'graceful-fs'
import { dirname, join } from 'path'
import { tmpdir } from 'os'

jest.mock('../../logger')

// Wine discovery (the Linux and macOS sets, CrossOver, Whisky, the lib folders) is Rust's since Phase 87
// (87-23, 87-26): its goldens replay in `gamelib-wine`'s `golden_discovery.rs`. What is left here is the
// sync default-wine reader and `getWineExecs`; `enginewine/__tests__/defaultWineTwin.test.ts` pins the
// reader to the shared `default_wine.json` vectors.

describe('getDefaultWineBinary', () => {
  const realPath = process.env['PATH']
  afterEach(() => {
    process.env['PATH'] = realPath
  })

  test('is spawn-free and reports not found with an empty PATH', () => {
    process.env['PATH'] = ''
    expect(getDefaultWineBinary()).toEqual({
      bin: '',
      name: 'Default Wine - Not Found',
      type: 'wine'
    })
  })

  test('finds wine on PATH and names it by its binary name', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wine-path-'))
    const bin = join(dir, 'wine')
    writeFileSync(bin, '#!/bin/sh\n')
    chmodSync(bin, 0o755)
    process.env['PATH'] = dir
    const result = getDefaultWineBinary()
    expect(result.bin).toBe(bin)
    expect(result.name).toBe('wine')
    expect(result.type).toBe('wine')
  })
})

describe('getWineExes', () => {
  describe('getWineExecs', () => {
    it('should return the path to wineserver if it exists', () => {
      const wineBin = join(tmpdir(), 'wine_test')
      const wineDir = dirname(wineBin)
      const wineServerPath = join(wineDir, 'wineserver')
      mkdirSync(wineServerPath, { recursive: true })
      const execs = getWineExecs(wineBin)
      expect(execs.wineserver).toBe(wineServerPath)
    })

    it('should return an empty string if wineserver does not exist', () => {
      const wineBin = '/path/to/wine'
      const execs = getWineExecs(wineBin)
      expect(execs.wineserver).toBe('')
    })
  })
})
